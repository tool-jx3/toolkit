/**
 * 進階 3D 的預覽欄（規格 1.11）：平面圖的工具列、平面圖（WalkPlan）、3D 預覽（共用 Viewport3D＋walk3d 的 WalkView）、
 * 播放列（沿路線走過去）、3D 移動影片的匯出。設定欄在「進階 3D」分頁時換成這一欄（three.js 只在這時才載入）。
 *
 * 離開分頁（active＝false）時：平面圖與 3D 預覽卸載（WebGL 環境放掉），匯出區留著但藏起來——
 * 匯出用的是另一個看不到的檢視，和分頁無關，做到一半不會被取消，回到分頁時結果卡還在。
 */
import {
  Box,
  DoorOpen,
  Footprints,
  ImagePlus,
  Orbit,
  RectangleHorizontal,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { computeLayout, type ImageSource } from '@/core/imagefx';
import {
  Button,
  type ExportFormatOption,
  ExportPanel,
  isEditableTarget,
  Segmented,
  Transport,
  usePlayback,
  Viewport3D,
} from '@/ui';
import { type FxPlayerHandle, useFxSourceImage, useFxVideoMode } from '@/ui/imagefx';
import type { MapState } from './model';
import {
  docNow,
  fx,
  nudgeWalkSelected,
  removeWalkSelected,
  selectWalk,
  undoPathPoint,
  useDoc,
  useWalk,
  WALK_TOOLS,
  type WalkCamera,
  type WalkTool,
  walkSelected,
} from './store';
import { S } from './strings';
import { WalkPlan } from './WalkPlan';
import { canWalk, WALK_FPS, WALK_HOLD, walkTotal, walkVideoSize } from './walk';
import {
  createPreviewView,
  ensureWalkFonts,
  exportWalkVideo,
  releasePreviewView,
  type WalkView,
  walkRegistry,
  walkText,
  webglAvailable,
} from './walk3d';

const TOOL_ICON: Record<WalkTool, React.ReactNode> = {
  room: <Box />,
  hall: <RectangleHorizontal />,
  door: <DoorOpen />,
  path: <Footprints />,
};

/** 3D 預覽的繪圖緩衝區：影片大小再縮到長邊 1280 以內 */
const PREVIEW_MAX = 1280;

function ToolBar() {
  const tool = useWalk((l) => l.tool);
  const walk = useDoc((s) => s.data.walk);
  const sel = walkSelected(
    walk,
    useWalk((l) => l.selected),
  );
  return (
    <div className="flex flex-col gap-1.5" data-testid="walk-tool-bar">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<WalkTool>
          aria-label={S.walk.toolLabel}
          value={tool}
          onValueChange={(v) => useWalk.setState({ tool: v, selected: null })}
          options={WALK_TOOLS.map((k) => ({
            value: k,
            label: S.walk.tools[k],
            icon: TOOL_ICON[k],
          }))}
        />
        {tool === 'path' ? (
          <Button
            size="sm"
            icon={<RotateCcw />}
            disabled={!walk.path.length}
            onClick={undoPathPoint}
          >
            {S.walk.pathUndo}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 />}
            disabled={!sel}
            onClick={() => removeWalkSelected()}
          >
            {S.walk.deleteSelected}
          </Button>
        )}
      </div>
      <p className="m-0 text-xs text-muted">
        {S.walk.toolHints[tool]}。{tool === 'path' ? '' : S.walk.deleteHint}
      </p>
    </div>
  );
}

/**
 * 平面圖的鍵盤（只在「進階 3D」分頁）：Delete 刪除選取的、Backspace（路線工具）退回上一點、Esc 取消選取；
 * 焦點在平面圖上時方向鍵移動選取的房間、入口或路線的點（1 px，Shift 10 px；連按併成一步復原）。
 */
function useWalkKeys(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('[role="dialog"],[role="alertdialog"],[role="listbox"],[role="menu"]')
      )
        return;
      const l = useWalk.getState();
      if (e.key === 'Escape' && l.selected) {
        e.preventDefault();
        selectWalk(null);
      } else if (e.key === 'Backspace' && l.tool === 'path') {
        e.preventDefault();
        undoPathPoint();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (removeWalkSelected()) e.preventDefault();
      } else if (
        e.key.startsWith('Arrow') &&
        t instanceof Element &&
        t.closest('[data-testid="walk-plan"]')
      ) {
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (nudgeWalkSelected(dx, dy)) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/* ---------- 3D 預覽 ---------- */

function previewSize(video: { width: number; height: number }) {
  const k = Math.min(1, PREVIEW_MAX / Math.max(video.width, video.height));
  return { width: Math.round(video.width * k), height: Math.round(video.height * k) };
}

function View3D({
  s,
  image,
  playerRef,
}: {
  s: MapState;
  image: ImageSource;
  playerRef: Ref<FxPlayerHandle>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<WalkView | null>(null);
  const [failed, setFailed] = useState(false);
  const camera = useWalk((l) => l.camera);
  const walk = s.walk;
  const walkable = canWalk(walk.path);
  const total = walkTotal(walk);
  const video = walkVideoSize(
    computeLayout(s, { width: image.width, height: image.height }).canvas,
  );
  const size = previewSize(video);
  const playback = usePlayback({ duration: total, loop: true, autoPlay: false });
  const { time, playing, pause } = playback;

  /*
   * 檢視：掛載時建立、卸載時放掉（連 WebGL 環境；StrictMode 立刻重新掛載同一張畫布時不放，見 releasePreviewView）。
   * 大小改了由下一個 effect 處理。
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在掛載時建立
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!webglAvailable()) {
      setFailed(true);
      return;
    }
    let v: WalkView;
    try {
      v = createPreviewView(c, size);
    } catch {
      setFailed(true);
      return;
    }
    v.view.start();
    walkRegistry.preview = v;
    setView(v);
    return () => {
      if (walkRegistry.preview === v) walkRegistry.preview = null;
      releasePreviewView(v);
      setView(null);
    };
  }, []);
  useEffect(() => {
    view?.setSize(size.width, size.height);
  }, [view, size.width, size.height]);

  /* 內容改了：重組場景（房名的字型載好後再組一次） */
  const [fontTick, setFontTick] = useState(0);
  const names = walk.rooms.map((r) => r.name).join('');
  useEffect(() => {
    let alive = true;
    void ensureWalkFonts(names, walkText()).then(() => {
      if (alive) setFontTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [names]);
  useEffect(() => {
    if (!view) return;
    view.update({
      walk,
      image,
      size: { width: image.width, height: image.height },
      bg: s.bg.color,
      text: walkText(),
    });
    void fontTick;
  }, [view, walk, image, s.bg.color, fontTick]);

  /* 鏡頭：沿路線時照時間走；播放時自動換成沿路線；路線不能走時回到俯瞰 */
  useEffect(() => {
    if (!walkable && camera === 'walk') useWalk.setState({ camera: 'orbit' });
  }, [walkable, camera]);
  /* 開始播放的那一刻換成沿路線（之後按「俯瞰」會停下來、留在俯瞰） */
  const wasPlaying = useRef(playing);
  useEffect(() => {
    if (playing && !wasPlaying.current && walkable && useWalk.getState().camera !== 'walk')
      useWalk.setState({ camera: 'walk' });
    wasPlaying.current = playing;
  }, [playing, walkable]);
  useEffect(() => {
    if (camera === 'orbit') pause();
    view?.setMode(camera);
  }, [view, camera, pause]);
  useEffect(() => {
    view?.setTime(time);
  }, [view, time]);

  const state = useRef(playback);
  state.current = playback;
  useImperativeHandle(playerRef, () => ({
    toggle: () => {
      if (canWalk(docNow().walk.path)) state.current.toggle();
    },
    seek: (t: number) => state.current.onTimeChange(t),
    get time() {
      return state.current.time;
    },
    get playing() {
      return state.current.playing;
    },
    get duration() {
      return state.current.duration;
    },
  }));

  const segments = useMemo(
    () => [
      { id: 'start', label: S.walk.segStart, start: 0, end: WALK_HOLD.start },
      {
        id: 'walk',
        label: S.walk.segWalk,
        start: WALK_HOLD.start,
        end: WALK_HOLD.start + walk.duration,
      },
      { id: 'end', label: S.walk.segEnd, start: WALK_HOLD.start + walk.duration, end: total },
    ],
    [walk.duration, total],
  );

  return (
    <Viewport3D
      canvasRef={canvas}
      aspect={size.width / size.height}
      background={s.bg.color}
      aria-label={S.walk.viewSection}
      canvasLabel={S.walk.viewLabel}
      canvasProps={{ 'data-testid': 'walk-canvas', 'data-camera': camera }}
      overlay={
        failed ? (
          <p className="m-0 rounded-md bg-surface px-3 py-2 text-sm text-danger" role="alert">
            {S.walk.webglFailed}
          </p>
        ) : !walkable ? (
          <p className="m-0 rounded-md bg-surface/90 px-3 py-1.5 text-xs text-muted">
            {S.walk.needPath}
          </p>
        ) : null
      }
      toolbar={
        <>
          <Segmented<WalkCamera>
            size="sm"
            aria-label={S.walk.cameraLabel}
            value={camera}
            onValueChange={(v) => {
              /* 播放中按「俯瞰」：先停下來，一次就切過去 */
              if (v === 'orbit') pause();
              useWalk.setState({ camera: v });
            }}
            options={[
              { value: 'orbit', label: S.walk.camera.orbit, icon: <Orbit /> },
              {
                value: 'walk',
                label: S.walk.camera.walk,
                icon: <Footprints />,
                disabled: !walkable,
              },
            ]}
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            onClick={() => {
              pause();
              useWalk.setState({ camera: 'orbit' });
              view?.setMode('orbit');
              view?.resetOrbit();
            }}
          >
            {S.walk.resetCamera}
          </Button>
        </>
      }
      footer={
        <Transport
          {...playback}
          onTimeChange={(t) => {
            if (walkable && useWalk.getState().camera !== 'walk')
              useWalk.setState({ camera: 'walk' });
            playback.onTimeChange(t);
          }}
          segments={segments}
          fps={WALK_FPS}
          disabled={!walkable}
          className="w-full"
        />
      }
    />
  );
}

/* ---------- 匯出 ---------- */

function WalkExport({ s, image }: { s: MapState; image: ImageSource }) {
  const video = walkVideoSize(
    computeLayout(s, { width: image.width, height: image.height }).canvas,
  );
  const mode = useFxVideoMode(video, WALK_FPS, false);
  const walkable = canWalk(s.walk.path);
  const total = walkTotal(s.walk);
  const reason = !walkable
    ? S.walk.needPath
    : !webglAvailable()
      ? S.walk.webglFailed
      : !mode
        ? S.videoChecking
        : mode.kind === 'none'
          ? S.videoUnsupported
          : undefined;
  /* 結果作廢：3D 影片用到的內容（3D 設定、畫面大小、底色、地圖）改了才清 */
  const resetKey = useMemo(
    () => [s.walk, s.canvas, s.bg.color, s.image?.id],
    [s.walk, s.canvas, s.bg.color, s.image?.id],
  );
  const formats: ExportFormatOption[] = [
    {
      id: 'walk',
      label: S.walk.formatLabel,
      description: S.walk.formatDesc(video.width, video.height),
      animated: true,
      disabled: !!reason,
      disabledReason: reason,
    },
  ];
  return (
    <ExportPanel
      formats={formats}
      defaultSettings={{ format: 'walk', fps: WALK_FPS }}
      fixedFps={WALK_FPS}
      fixedFpsHint={S.walk.fpsHint}
      sizeWarningHint={S.walk.sizeHint}
      resetKey={resetKey}
      estimate={{
        width: video.width,
        height: video.height,
        frames: Math.ceil(total * WALK_FPS - 1e-9),
        duration: total,
      }}
      onExport={(_settings, ctx) =>
        exportWalkVideo(docNow(), image, mode ?? { kind: 'none', alpha: false }, ctx)
      }
    />
  );
}

/* ---------- 預覽欄 ---------- */

function EmptyWalk({ onSample }: { onSample: (demo: boolean) => void }) {
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 p-6 text-center text-sm text-muted"
      data-testid="walk-empty"
    >
      <ImagePlus aria-hidden className="size-8 text-muted" />
      <p className="m-0 text-base font-semibold text-fg">{S.walk.emptyTitle}</p>
      <p className="m-0 max-w-[36em]">{S.walk.needImage}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon={<ImagePlus />} onClick={() => onSample(false)}>
          {S.sample}
        </Button>
        <Button variant="primary" icon={<Sparkles />} onClick={() => onSample(true)}>
          {S.demo}
        </Button>
      </div>
    </div>
  );
}

export default function WalkPreview({
  active,
  playerRef,
  onSample,
}: {
  /** 在「進階 3D」分頁（false：只留著藏起來的匯出區，讓做到一半的匯出繼續） */
  active: boolean;
  playerRef: Ref<FxPlayerHandle>;
  onSample: (demo: boolean) => void;
}) {
  const s = useDoc((st) => st.data);
  const image = useFxSourceImage(fx);
  useWalkKeys(active);
  /* 進來時取消 2D 的選取（2D 的快捷鍵不會動到看不到的框） */
  useEffect(() => {
    if (active) fx.select(null);
  }, [active]);
  if (!s.image || !image) return active ? <EmptyWalk onSample={onSample} /> : null;
  /* 匯出區一直在同一個位置（第三個），切分頁時不會重建 */
  return (
    <div
      className={active ? 'flex min-w-0 flex-col gap-3' : undefined}
      hidden={!active}
      data-testid={active ? 'walk-preview' : undefined}
    >
      {active ? (
        <section aria-label={S.walk.planBar} className="flex min-w-0 flex-col gap-2">
          <ToolBar />
          <WalkPlan image={image} />
        </section>
      ) : null}
      {active ? <View3D s={s} image={image} playerRef={playerRef} /> : null}
      <WalkExport s={s} image={image} />
    </div>
  );
}
