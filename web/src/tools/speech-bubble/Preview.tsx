/**
 * 預覽區（規格 F40～F45）：舞台（循環播放）、播放列（登場／停留／退場三段）、尺寸與長度、提示、匯出。
 * 改任何設定都從頭播放（使用者設定「減少動態效果」且暫停中時，停在全部出現的畫面）。
 */
import { ClipboardCopy, Move } from 'lucide-react';
import {
  type Ref,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAssetImage } from '@/core/assets';
import { copyImage } from '@/core/files';
import {
  type AnimationExportFormat,
  DEFAULT_MAX_FRAMES,
  drawFrame,
  type ExportResult,
  exportAnimation,
  frameCount,
} from '@/core/timeline';
import { canvasMeasure } from '@/core/typeset/measure';
import {
  animationFormats,
  Button,
  type ExportOutput,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  IconButton,
  Notice,
  Stage,
  Transport,
  usePlayback,
  useToast,
  useWebpSupport,
} from '@/ui';
import { DragLayer } from './DragLayer';
import { useEnsureFonts, useFontTick } from './fontTick';
import { exportBaseName, FPS_OPTIONS, type SbData } from './model';
import { buildScene, loadSceneFonts, type Scene, type SceneGeometry } from './scene';
import { assets, edit, gesture, select, setOffset, usePrefs, useSb, useUi } from './store';
import { S } from './strings';

export interface PlayHandle {
  seek: (t: number) => void;
  setPlaying: (on: boolean) => void;
  restart: () => void;
  readonly t: number;
  readonly playing: boolean;
  readonly scene: Scene;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const toOutput = (r: ExportResult): ExportOutput => ({
  blob: r.blob,
  fileName: r.fileName,
  width: r.width,
  height: r.height,
  frames: r.frames,
  storedFrames: r.storedFrames,
  duration: r.duration,
  details: r.colors
    ? [
        {
          label: S.colorsDetail,
          value: r.colors.lossless ? S.lossless(r.colors.count) : S.colorCount(r.colors.count),
        },
      ]
    : undefined,
});

/** 卡片的背景圖（匯出、複製圖片前讀好；沒有或讀不到時 null） */
async function cardImage(d: SbData): Promise<ImageBitmap | null> {
  if (!d.card.bg || !d.card.image) return null;
  return (await assets.bitmap(d.card.image).catch(() => undefined)) ?? null;
}

/** 字型、背景圖都載好之後的場景（匯出、複製圖片用） */
async function readyScene(d: SbData): Promise<Scene> {
  const first = buildScene(d);
  if (first.empty) throw new Error(S.noContent);
  await loadSceneFonts(first);
  return buildScene(d, canvasMeasure, { image: await cardImage(d) });
}

/** 匯出（規格 3.6）：先等字型載好，再用載好後的字寬重新排版 */
export async function runExport(
  d: SbData,
  s: ExportSettings,
  signal: AbortSignal,
  onProgress: (ratio: number, label?: string) => void,
): Promise<ExportOutput> {
  const scene = await readyScene(d);
  const format = s.format as AnimationExportFormat;
  const r = await exportAnimation(scene, {
    format,
    fps: s.fps,
    plays: s.plays,
    scale: s.scale,
    quantize: format === 'apng' ? s.quantize : false,
    fileName: exportBaseName(Date.now()),
    signal,
    onProgress,
  });
  return toOutput(r);
}

export function Preview({
  playRef,
  exportRef,
}: {
  playRef: Ref<PlayHandle>;
  exportRef: RefObject<ExportPanelHandle | null>;
}) {
  const d = useSb((s) => s.data);
  const prefs = usePrefs((p) => p.data);
  const dragMode = useUi((u) => u.drag);
  const selectedId = useUi((u) => u.selectedId);
  const tick = useFontTick();
  const webpSupported = useWebpSupport();
  const canvas = useRef<HTMLCanvasElement>(null);
  const toast = useToast();
  /* 卡片的背景圖 */
  const image = useAssetImage(assets, d.card.bg ? d.card.image : null);
  /* 拖曳中：畫布大小與內容的位置固定住 */
  const [freeze, setFreeze] = useState<SceneGeometry | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重新排版
  const scene = useMemo(
    () => buildScene(d, canvasMeasure, { image: image.bitmap, freeze }),
    [d, tick, image.bitmap, freeze],
  );
  useEnsureFonts(scene.fontLoads);
  const playback = usePlayback({ duration: scene.duration, loop: true });
  const state = useRef({ playback, scene });
  state.current = { playback, scene };

  /* 字型下載超過 0.2 秒才顯示「正在載入字型」 */
  const [fontsLoading, setFontsLoading] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在需要的字型改變時檢查
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (alive) setFontsLoading(true);
    }, 200);
    void loadSceneFonts(state.current.scene).then(() => {
      clearTimeout(timer);
      if (alive) setFontsLoading(false);
    });
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [scene.fontKey]);

  /* 改任何設定（換了場景）：從頭播放；減少動態效果且暫停中時停在全部出現的畫面 */
  const first = useRef(true);
  const dragRef = useRef(dragMode);
  dragRef.current = dragMode;
  useEffect(() => {
    const p = state.current.playback;
    const reduce = prefersReducedMotion();
    if (first.current) {
      first.current = false;
      if (reduce) p.onTimeChange(scene.stillTime);
      return;
    }
    /* 拖曳調整位置時一直停在全部出現的畫面 */
    if (dragRef.current) {
      p.pause();
      p.onTimeChange(scene.stillTime);
      return;
    }
    if (p.playing || !reduce) p.onRestart();
    else p.onTimeChange(scene.stillTime);
  }, [scene]);

  /* 打開拖曳：暫停在全部出現的畫面 */
  useEffect(() => {
    if (!dragMode) return;
    const p = state.current.playback;
    p.pause();
    p.onTimeChange(state.current.scene.stillTime);
  }, [dragMode]);

  /* 畫目前這一格 */
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) void drawFrame(ctx, scene, Math.min(playback.time, scene.duration));
  }, [scene, playback.time]);

  useImperativeHandle(playRef, () => ({
    seek: (t: number) => {
      const p = state.current.playback;
      p.pause();
      p.onTimeChange(Math.min(state.current.scene.duration, Math.max(0, t)));
    },
    setPlaying: (on: boolean) =>
      on ? state.current.playback.play() : state.current.playback.pause(),
    restart: () => state.current.playback.onRestart(),
    get t() {
      return state.current.playback.time;
    },
    get playing() {
      return state.current.playback.playing;
    },
    get scene() {
      return state.current.scene;
    },
  }));

  /* 內容或匯出設定（格式、次數、倍率、減色）改了：上次的結果卡作廢 */
  const resetKey = useMemo(
    () => ({ d, format: prefs.format, plays: prefs.plays, scale: prefs.scale, q: prefs.quantize }),
    [d, prefs.format, prefs.plays, prefs.scale, prefs.quantize],
  );
  const formats = useMemo(
    () => animationFormats(['apng', 'gif', 'webp', 'png', 'zip'], { webpSupported }),
    [webpSupported],
  );
  const fpsOptions = useMemo(
    () => [...new Set([...FPS_OPTIONS, d.fps])].sort((a, b) => a - b),
    [d.fps],
  );
  const frames = frameCount(scene.duration, d.fps);
  const settings: ExportSettings = {
    format: prefs.format,
    fps: d.fps,
    plays: prefs.plays,
    scale: prefs.scale,
    quantize: prefs.quantize,
  };
  const capped = d.canvasMode !== 'fixed' && scene.overflow;

  const copyPng = async () => {
    const make = async (): Promise<Blob> => {
      const sc = await readyScene(useSb.getState().data);
      const k = usePrefs.getState().data.scale;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sc.width * k));
      c.height = Math.max(1, Math.round(sc.height * k));
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('canvas');
      await drawFrame(ctx, sc, sc.stillTime, { scale: k });
      return new Promise((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'),
      );
    };
    const r = await copyImage(make());
    toast(
      r.ok
        ? { title: S.copiedImage, tone: 'success' }
        : { title: S.copyImageFailed, tone: 'warning' },
    );
  };

  return (
    <>
      <Stage
        width={scene.width}
        height={scene.height}
        aria-label={S.previewLabel}
        className="shrink-0"
        toolbarExtra={
          <>
            {fontsLoading ? (
              <span role="status" className="mr-2 text-xs text-muted">
                {S.loadingFonts}
              </span>
            ) : null}
            <IconButton
              size="sm"
              label={S.dragToggle}
              icon={<Move />}
              pressed={dragMode}
              disabled={scene.empty}
              data-testid="drag-toggle"
              onClick={() => useUi.setState({ drag: !dragMode })}
            />
          </>
        }
      >
        <canvas
          ref={canvas}
          width={scene.width}
          height={scene.height}
          className="block size-full"
          data-testid="sb-canvas"
          data-size={`${scene.width}x${scene.height}`}
        />
        {dragMode && !scene.empty ? (
          <DragLayer
            scene={scene}
            selectedId={selectedId}
            onSelect={select}
            onDragStart={() => {
              gesture.begin();
              setFreeze(state.current.scene.geometry);
            }}
            onDrag={(id, dx, dy) => setOffset(id, dx, dy)}
            onDragEnd={() => {
              gesture.commit();
              setFreeze(null);
            }}
            onNudge={(id, ddx, ddy) => {
              const b = useSb.getState().data.bubbles.find((x) => x.id === id);
              if (b) setOffset(id, (b.dx ?? 0) + ddx, (b.dy ?? 0) + ddy);
            }}
          />
        ) : null}
      </Stage>
      {dragMode ? <p className="m-0 px-1 text-xs text-muted">{S.dragHint}</p> : null}
      <Transport
        time={playback.time}
        duration={playback.duration}
        playing={playback.playing}
        onTimeChange={playback.onTimeChange}
        onPlayingChange={playback.onPlayingChange}
        onRestart={playback.onRestart}
        fps={d.fps}
        segments={scene.segments}
        disabled={scene.empty}
      />
      <p className="m-0 px-1 text-xs text-muted tabular-nums" data-testid="meta-line">
        {S.meta(scene.width, scene.height, d.fps, scene.duration, frames)}
      </p>
      {scene.empty ? <Notice tone="warning">{S.emptyNotice}</Notice> : null}
      {!scene.empty && d.canvasMode === 'fixed' && scene.overflow ? (
        <Notice tone="warning">{S.overflowNotice}</Notice>
      ) : null}
      {capped ? <Notice tone="warning">{S.capNotice}</Notice> : null}
      {frames > DEFAULT_MAX_FRAMES ? (
        <Notice tone="danger">{S.tooManyFrames(frames, DEFAULT_MAX_FRAMES)}</Notice>
      ) : null}
      <ExportPanel
        ref={exportRef}
        title={S.exportTitle}
        formats={formats}
        baseSize={{ width: scene.width, height: scene.height }}
        fpsOptions={fpsOptions}
        settings={settings}
        onSettingsChange={(next) => {
          if (next.fps !== d.fps)
            edit((x) => {
              x.fps = next.fps;
            });
          const { format, plays, scale, quantize } = next;
          if (
            format !== prefs.format ||
            plays !== prefs.plays ||
            scale !== prefs.scale ||
            quantize !== prefs.quantize
          )
            usePrefs.getState().patch({ format, plays, scale, quantize });
        }}
        estimate={
          scene.empty
            ? null
            : {
                width: Math.round(scene.width * prefs.scale),
                height: Math.round(scene.height * prefs.scale),
                frames,
                duration: scene.duration,
              }
        }
        resetKey={resetKey}
        onExport={(s, { signal, onProgress }) =>
          runExport(useSb.getState().data, s, signal, onProgress)
        }
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={<ClipboardCopy />}
              title={S.copyImageHint}
              disabled={scene.empty}
              onClick={() => void copyPng()}
            >
              {S.copyImage}
            </Button>
          </div>
        }
      />
    </>
  );
}
