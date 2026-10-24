/**
 * 預覽欄（規格 1.3、1.5、1.6、1.8）：畫框的工具列、編輯區的工具列（預覽背景、倍率、全圖、到選取的框、框選放大、手形、
 * 放大編輯區）、舞台（畫面＋編輯層）、播放列（分段色條、循環）、「完成的樣子」與複製圖片、共用的匯出區。
 *
 * 預覽平常停在結尾（完成的樣子）；按播放（空白鍵）從頭播。運鏡確認中（第二批）預覽套用運鏡、不能編輯，Esc 回到編輯。
 * 編輯區的倍率不影響輸出：倍率改了之後把原本看到的中心（或指定的點）捲回中央。
 */
import {
  Clapperboard,
  Copy,
  Hand,
  Highlighter,
  ImagePlus,
  LocateFixed,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  ScanSearch,
  SkipForward,
  Sparkles,
  SquareDashed,
  ZoomIn,
} from 'lucide-react';
import {
  type Ref,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAssetImage } from '@/core/assets';
import { copyImage } from '@/core/files';
import {
  Button,
  cn,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  IconButton,
  Notice,
  Segmented,
  Select,
  Stage,
  type StageBackground,
  Toggle,
  Tooltip,
  Transport,
  usePlayback,
  useToast,
  withShortcut,
} from '@/ui';
import { Editor } from './Editor';
import { ApngEstimate, useVideoMode, videoFormat } from './ExportExtras';
import {
  ensureCreditFont,
  exportApng,
  exportLayers,
  exportPng,
  exportSequence,
  exportSteps,
  exportVideo,
  finalPng,
} from './exporter';
import {
  apngTimes,
  cameraView,
  computeLayout,
  EDIT_ZOOM_MAX,
  EDIT_ZOOMS,
  editZoomFor,
  type Frame,
  type FrameKind,
  type FxState,
  kindIndex,
  type Layout,
  LIMITS,
  type Rect,
  SEQUENCE_MAX_FRAMES,
  stepEditZoom,
  stepFrames,
  type Timeline,
  timelineOf,
  timelineSegments,
  toCanvasRect,
  VIDEO_FPS,
} from './model';
import { type ImageSource, RenderCache, renderFrame } from './render';
import {
  APNG_COLORS,
  assets,
  docNow,
  dropMissingImage,
  STAGE_BGS,
  type StageBg,
  setPrefs,
  useDoc,
  useLive,
  usePrefs,
} from './store';
import { S } from './strings';

export interface PlayerHandle {
  toggle: () => void;
  seek: (t: number) => void;
  readonly time: number;
  readonly playing: boolean;
  readonly duration: number;
}

const KIND_ICON: Record<FrameKind, React.ReactNode> = {
  zoom: <ZoomIn />,
  marker: <Highlighter />,
  redact: <SquareDashed />,
};

/** 預覽背景的名稱（同共用舞台：透明的是棋盤格；規格 F44、7.1 R3） */
const STAGE_BG_LABEL: Record<StageBg, string> = { checker: '透明', dark: '黑', light: '白' };

/* ---------- 圖片 ---------- */

/** 目前的原圖（解碼好的；讀不到時從內容裡拿掉） */
export function useSourceImage(): ImageSource | null {
  const ref = useDoc((s) => s.data.image);
  const img = useAssetImage(assets, ref?.id);
  useEffect(() => {
    if (img.status === 'missing' && ref) dropMissingImage(ref.id);
  }, [img.status, ref]);
  return img.bitmap;
}

/** 出處的字型載好之後重畫 */
function useCreditFontTick(s: FxState): number {
  const [tick, setTick] = useState(0);
  const text = s.credit.text.trim();
  useEffect(() => {
    if (!text) return;
    let alive = true;
    void ensureCreditFont({ ...docNow(), credit: { ...docNow().credit, text } }).then(() => {
      if (alive) setTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return tick;
}

/* ---------- 工具列 ---------- */

function ToolBar() {
  const tool = usePrefs((p) => p.data.tool);
  const guides = usePrefs((p) => p.data.guides);
  const hasImage = useDoc((s) => !!s.data.image);
  const camera = useLive((l) => l.cameraPreview);
  return (
    <div className="flex flex-col gap-1.5" data-testid="tool-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<FrameKind>
          aria-label={S.toolLabel}
          value={tool}
          onValueChange={(v) => setPrefs({ tool: v })}
          options={(['zoom', 'marker', 'redact'] as const).map((k) => ({
            value: k,
            label: S.kinds[k],
            icon: KIND_ICON[k],
          }))}
          disabled={!hasImage || camera}
        />
        <Toggle
          label={S.guides}
          checked={guides}
          onCheckedChange={(on) => setPrefs({ guides: on })}
        />
      </div>
      <p className="m-0 text-xs text-muted">
        {S.kindHints[tool]}。{S.toolHint}
      </p>
    </div>
  );
}

/* ---------- 編輯區的工具列（第二批；不影響輸出） ---------- */

function ViewBar({
  onZoom,
  onFit,
  onSelected,
}: {
  onZoom: (z: number) => void;
  onFit: () => void;
  onSelected: () => void;
}) {
  const stageBg = usePrefs((p) => p.data.stageBg);
  const z = useLive((l) => l.viewZoom);
  const pointer = useLive((l) => l.pointer);
  const expanded = useLive((l) => l.expanded);
  const selected = useLive((l) => l.selected);
  const camera = useLive((l) => l.cameraPreview);
  const zoomOptions = [...new Set([...EDIT_ZOOMS, z])].sort((a, b) => a - b);
  return (
    <div
      role="toolbar"
      aria-label={S.viewBar}
      className="flex flex-wrap items-center gap-1.5"
      data-testid="view-bar"
    >
      <Segmented<StageBg>
        aria-label="預覽背景"
        size="sm"
        value={stageBg}
        onValueChange={(v) => setPrefs({ stageBg: v })}
        options={STAGE_BGS.map((b) => ({
          value: b,
          label: STAGE_BG_LABEL[b],
          ariaLabel: b === 'checker' ? '棋盤格（透明）' : undefined,
        }))}
      />
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <IconButton
          label={S.viewZoomOut}
          icon={<Minus />}
          size="sm"
          disabled={z <= 1 + 1e-3}
          onClick={() => onZoom(stepEditZoom(z, -1))}
        />
        <Select
          size="sm"
          aria-label={S.viewZoom}
          value={String(z)}
          onValueChange={(v) => onZoom(Number(v))}
          options={zoomOptions.map((v) => ({ value: String(v), label: S.viewZoomOption(v) }))}
          className="w-24"
        />
        <IconButton
          label={S.viewZoomIn}
          icon={<Plus />}
          size="sm"
          disabled={z >= EDIT_ZOOM_MAX - 1e-3}
          onClick={() => onZoom(stepEditZoom(z, 1))}
        />
        <IconButton label={S.viewFit} icon={<Maximize />} size="sm" onClick={onFit} />
        <IconButton
          label={S.viewSelected}
          icon={<LocateFixed />}
          size="sm"
          disabled={!selected || camera}
          onClick={onSelected}
        />
        <Tooltip
          content={pointer === 'region' ? withShortcut(S.viewRegion, 'escape') : S.viewRegion}
        >
          <IconButton
            label={S.viewRegion}
            noTooltip
            icon={<ScanSearch />}
            size="sm"
            pressed={pointer === 'region'}
            disabled={camera}
            onClick={() => useLive.setState({ pointer: pointer === 'region' ? 'edit' : 'region' })}
          />
        </Tooltip>
        <IconButton
          label={S.viewHand}
          icon={<Hand />}
          size="sm"
          pressed={pointer === 'hand'}
          disabled={camera}
          onClick={() => useLive.setState({ pointer: pointer === 'hand' ? 'edit' : 'hand' })}
        />
        <Tooltip content={expanded ? withShortcut(S.viewExpand, 'escape') : S.viewExpand}>
          <IconButton
            label={S.viewExpand}
            noTooltip
            icon={expanded ? <Minimize2 /> : <Maximize2 />}
            size="sm"
            pressed={expanded}
            onClick={() => useLive.setState({ expanded: !expanded })}
          />
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * 放大編輯區（fixed、蓋滿視窗）要蓋在頁首上面（第二批驗證 R12）：寬畫面時共用外框的預覽欄是 sticky，自己形成堆疊內容，
 * 裡面的 z-50 超不過頁首的 z-30。開著的時候把祖先裡形成堆疊內容的定位（sticky、有 z-index 的定位）暫時改掉
 * （元素自己的 inline style），收起來或卸載時還原——只在這個工具放大編輯區的時候，不動共用外框的規則與 DOM 結構
 * （不搬到 portal：搬動會讓舞台重新掛上、捲動位置歸零）。
 */
function useLiftOverAncestors(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const undo: (() => void)[] = [];
    const set = (a: HTMLElement, prop: 'position' | 'zIndex', v: string) => {
      const prev = a.style[prop];
      a.style[prop] = v;
      undo.push(() => {
        a.style[prop] = prev;
      });
    };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'sticky') set(a, 'position', 'static');
      else if (cs.position !== 'static' && cs.zIndex !== 'auto') set(a, 'zIndex', 'auto');
    }
    return () => {
      for (const f of undo.reverse()) f();
    };
  }, [ref, active]);
}

/** 舞台裡畫面那一層（捲動的內容）：倍率與位置換算 */
function contentBox(vp: HTMLElement): { el: HTMLElement; rect: DOMRect } | null {
  const el = vp.firstElementChild as HTMLElement | null;
  return el ? { el, rect: el.getBoundingClientRect() } : null;
}

/* ---------- 畫面 ---------- */

function Painter({
  s,
  image,
  time,
  layout,
  tl,
  camera,
}: {
  s: FxState;
  image: ImageSource | null;
  time: number;
  layout: Layout;
  tl: Timeline;
  camera: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useMemo(() => new RenderCache(), []);
  const fontTick = useCreditFontTick(s);
  const { width: W, height: H } = layout.canvas;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後重畫
  useLayoutEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    renderFrame(g, { state: s, image }, time, cache, {
      view: camera ? cameraView(s, layout, tl, time) : null,
    });
  }, [s, image, time, cache, fontTick, W, H, camera, layout, tl]);
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className="block size-full"
      data-testid="fx-canvas"
      data-camera={camera || undefined}
    />
  );
}

function EmptyState({ onSample }: { onSample: (demo: boolean) => void }) {
  const missing = useLive((l) => l.missing);
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 p-6 text-center text-sm text-muted"
      data-testid="empty-state"
    >
      <ImagePlus aria-hidden className="size-8 text-muted" />
      <p className="m-0 text-base font-semibold text-fg">{S.emptyTitle}</p>
      <p className="m-0 max-w-[36em]">{S.emptyDesc}</p>
      {missing ? (
        <p className="m-0 text-warning" role="status">
          {S.missingImage}
        </p>
      ) : null}
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

/* ---------- 匯出 ---------- */

function ExportArea({
  s,
  image,
  exportRef,
}: {
  s: FxState;
  image: ImageSource | null;
  exportRef: Ref<ExportPanelHandle>;
}) {
  const settings = usePrefs((p) => p.data.export);
  const layout = computeLayout(s, image ? { width: image.width, height: image.height } : null);
  const transparent = s.bg.mode === 'transparent';
  const videoFps = VIDEO_FPS.includes(settings.fps) ? settings.fps : 30;
  const mode = useVideoMode(layout.canvas, videoFps, transparent);
  const total = timelineOf(s).total;
  const fmt = settings.format;
  const fixed = fmt === 'apng' || fmt === 'sequence';
  const animated = fixed || fmt === 'video';
  const fps = fixed ? s.timing.fps : videoFps;
  const noImage = !image;
  const off = (extra?: string) => ({
    disabled: noImage || !!extra,
    disabledReason: noImage ? S.needImage : extra,
  });
  const steps = stepFrames(s.frames).length + 1;
  const seqN = apngTimes(total, s.timing.fps).length;
  const formats = [
    { id: 'png', label: S.formats.png, description: S.formatDesc.png, ...off() },
    {
      id: 'apng',
      label: S.formats.apng,
      description: S.formatDesc.apng,
      animated: true,
      supportsLoop: true,
      supportsColors: true,
      ...off(),
    },
    videoFormat(mode, transparent, noImage),
    { id: 'steps', label: S.formats.steps, description: S.stepsDesc(steps), ...off() },
    { id: 'layers', label: S.formats.layers, description: S.layersDesc, ...off() },
    {
      id: 'sequence',
      label: S.formats.sequence,
      description: S.sequenceDesc(seqN),
      animated: true,
      ...off(seqN > SEQUENCE_MAX_FRAMES ? S.sequenceTooMany(seqN, SEQUENCE_MAX_FRAMES) : undefined),
    },
  ];
  return (
    <ExportPanel
      ref={exportRef}
      formats={formats}
      settings={settings}
      onSettingsChange={(next: ExportSettings) => setPrefs({ export: { ...next, scale: 1 } })}
      fixedFps={fixed ? s.timing.fps : null}
      fixedFpsHint={S.apngFpsHint}
      fpsOptions={VIDEO_FPS}
      colorOptions={APNG_COLORS}
      quantizeHint={S.colorsHint}
      loopHint={S.loopHint}
      sizeWarningBytes={
        fmt === 'steps' || fmt === 'layers' || fmt === 'sequence'
          ? Number.POSITIVE_INFINITY
          : undefined
      }
      resetKey={s}
      /* 連番 PNG 的 ZIP 不顯示「未壓縮 N GB」（對 ZIP 沒有意義；張數寫在格式說明裡；第二批驗證 R16） */
      estimate={
        animated && fmt !== 'sequence' && image
          ? {
              width: layout.canvas.width,
              height: layout.canvas.height,
              frames: apngTimes(total, fps).length,
              duration: total,
            }
          : null
      }
      extra={fmt === 'apng' && image ? <ApngEstimate s={s} image={image} /> : null}
      onExport={async (set, ctx) => {
        const img = image;
        if (!img) throw new Error(S.needImage);
        const cur = docNow();
        if (set.format === 'png') return exportPng(cur, img);
        if (set.format === 'apng')
          return exportApng(cur, img, { colors: set.colors ?? 0, plays: set.plays }, ctx);
        if (set.format === 'steps') return exportSteps(cur, img, ctx);
        if (set.format === 'layers') return exportLayers(cur, img, ctx);
        if (set.format === 'sequence') return exportSequence(cur, img, ctx);
        return exportVideo(cur, img, mode ?? { kind: 'none', alpha: transparent }, set.fps, ctx);
      }}
    />
  );
}

/* ---------- 預覽欄 ---------- */

export function Preview({
  playerRef,
  exportRef,
  onSample,
}: {
  playerRef: Ref<PlayerHandle>;
  exportRef: Ref<ExportPanelHandle>;
  onSample: (demo: boolean) => void;
}) {
  const s = useDoc((st) => st.data);
  const image = useSourceImage();
  const stageBg = usePrefs((p) => p.data.stageBg);
  const loop = usePrefs((p) => p.data.loop);
  const viewZoom = useLive((l) => l.viewZoom);
  const expanded = useLive((l) => l.expanded);
  const cameraPreview = useLive((l) => l.cameraPreview);
  const cameraRun = useLive((l) => l.cameraRun);
  const seek = useLive((l) => l.seek);
  const toast = useToast();
  const layout = useMemo(
    () =>
      computeLayout(
        s,
        image
          ? { width: image.width, height: image.height }
          : s.image
            ? { width: s.image.width, height: s.image.height }
            : null,
      ),
    [s, image],
  );
  const W = layout.canvas.width;
  const H = layout.canvas.height;
  const tl = useMemo(() => timelineOf(s), [s]);
  const total = tl.total;
  const playback = usePlayback({ duration: total, loop, autoPlay: false });
  const { onTimeChange, pause, onRestart } = playback;

  /* 平常停在結尾：開頁時、停在結尾時總長變了 */
  const lastTotal = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastTotal.current;
    lastTotal.current = total;
    if (prev === null || (!playback.playing && playback.time >= prev - 1e-6)) onTimeChange(total);
  }, [total, playback.playing, playback.time, onTimeChange]);

  /* 要求跳到某個時間（調整邊界演出時看動作到一半的樣子） */
  useEffect(() => {
    if (!seek) return;
    pause();
    onTimeChange(seek.t);
  }, [seek, pause, onTimeChange]);

  /*
   * 運鏡確認：從頭播放（每按一次）；預覽不在畫面上半部時（窄版：預覽在設定欄上面很遠）把它捲進畫面，
   * 減少動態時不用平滑捲動（第二批驗證 R13）。運鏡關掉（或沒有對象）時回到編輯。
   */
  const restartRef = useRef(onRestart);
  restartRef.current = onRestart;
  const editArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cameraRun <= 0) return;
    restartRef.current();
    const el = editArea.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top >= 0 && top < window.innerHeight / 2) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [cameraRun]);
  useLiftOverAncestors(editArea, expanded);
  useEffect(() => {
    if (cameraPreview && !tl.camera) useLive.setState({ cameraPreview: false });
  }, [cameraPreview, tl.camera]);

  /* Esc：結束運鏡確認 → 取消框選放大 → 回到一般畫面 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')
      )
        return;
      const l = useLive.getState();
      if (l.cameraPreview) useLive.setState({ cameraPreview: false });
      else if (l.pointer === 'region') useLive.setState({ pointer: 'edit' });
      else if (l.expanded) useLive.setState({ expanded: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 編輯區的倍率：改了之後把指定的點（預設原本看到的中心）捲回中央 */
  const viewport = useRef<HTMLElement | null>(null);
  const [centerReq, setCenterReq] = useState<{ x: number; y: number; n: number } | null>(null);
  const visibleCenter = useCallback((): { x: number; y: number } => {
    const vp = viewport.current;
    const box = vp ? contentBox(vp) : null;
    if (!vp || !box?.rect.width) return { x: W / 2, y: H / 2 };
    const vr = vp.getBoundingClientRect();
    const k = box.rect.width / W;
    return {
      x: (vr.left + vp.clientWidth / 2 - box.rect.left) / k,
      y: (vr.top + vp.clientHeight / 2 - box.rect.top) / k,
    };
  }, [W, H]);
  const zoomTo = useCallback(
    (z: number, center?: { x: number; y: number }) => {
      const c = center ?? visibleCenter();
      useLive.setState({ viewZoom: Math.min(EDIT_ZOOM_MAX, Math.max(1, z)) });
      setCenterReq((r) => ({ ...c, n: (r?.n ?? 0) + 1 }));
    },
    [visibleCenter],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 倍率改了（舞台重新排版之後）才捲
  useLayoutEffect(() => {
    const vp = viewport.current;
    const box = vp ? contentBox(vp) : null;
    if (!centerReq || !vp || !box?.rect.width) return;
    const vr = vp.getBoundingClientRect();
    const k = box.rect.width / W;
    vp.scrollLeft += box.rect.left + centerReq.x * k - (vr.left + vp.clientWidth / 2);
    vp.scrollTop += box.rect.top + centerReq.y * k - (vr.top + vp.clientHeight / 2);
  }, [centerReq, viewZoom, expanded]);
  const fitView = () => {
    useLive.setState({ pointer: 'edit' });
    zoomTo(1, { x: W / 2, y: H / 2 });
  };
  const zoomToRect = (r: Rect, fill: number) =>
    zoomTo(editZoomFor(r, layout.canvas, fill), { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const toSelected = () => {
    const f = s.frames.find((x) => x.id === useLive.getState().selected);
    if (f) zoomToRect(toCanvasRect(layout.shot, f), 0.55);
  };

  const state = useRef(playback);
  state.current = playback;
  useImperativeHandle(playerRef, () => ({
    toggle: () => state.current.toggle(),
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

  const segments = timelineSegments(tl, S.phases);
  const markers =
    s.timing.order === 'sequential' && tl.actionIds.length > 1
      ? tl.actionIds.map((id) => {
          const f = s.frames.find((x) => x.id === id) as Frame;
          return {
            time: tl.windows[id].start,
            label: S.actionMarker(S.frameName(f.kind, kindIndex(s.frames, id))),
          };
        })
      : undefined;

  const copy = async () => {
    if (!image) return;
    const r = await copyImage(finalPng(docNow(), image));
    if (r.ok) toast({ title: S.copied, tone: 'success' });
    else
      toast({
        title: r.reason === 'unsupported' ? S.copyUnsupported : S.copyFailed,
        tone: 'warning',
      });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        ref={editArea}
        className={cn(
          'flex min-w-0 flex-col',
          expanded ? 'fixed inset-0 z-50 gap-2 overflow-auto bg-bg p-3' : 'gap-3',
        )}
        data-testid="edit-area"
        data-expanded={expanded || undefined}
      >
        <ToolBar />
        {cameraPreview ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-accent-soft px-3 py-1.5 text-sm [&_svg]:size-4"
            data-testid="camera-preview"
          >
            <Clapperboard aria-hidden />
            {S.cameraPreviewing}
            <Button
              size="sm"
              className="ml-auto"
              title={S.cameraBackHint}
              onClick={() => useLive.setState({ cameraPreview: false })}
            >
              {S.cameraBack}
            </Button>
          </div>
        ) : null}
        {s.image ? (
          <>
            <ViewBar onZoom={(z) => zoomTo(z)} onFit={fitView} onSelected={toSelected} />
            <Stage<StageBg>
              width={W}
              height={H}
              toolbar={false}
              backgrounds={STAGE_BGS}
              background={{ kind: stageBg } as StageBackground<StageBg>}
              zoom={viewZoom}
              zoomBase="fit"
              zoomRange={[1, EDIT_ZOOM_MAX]}
              onZoomChange={(z) => zoomTo(z === 'fit' ? 1 : z)}
              viewportRef={viewport}
              maxViewportHeight={expanded ? 'calc(100dvh - 15rem)' : undefined}
              aria-label={S.stageLabel}
            >
              <Painter
                s={s}
                image={image}
                time={playback.time}
                layout={layout}
                tl={tl}
                camera={cameraPreview}
              />
              {image && !cameraPreview ? (
                <Editor
                  layout={layout}
                  image={{ width: image.width, height: image.height }}
                  frames={s.frames}
                  viewport={() => viewport.current}
                  playing={playback.playing}
                  onBeginEdit={pause}
                  onTogglePlay={playback.toggle}
                  onRegion={(r) => {
                    useLive.setState({ pointer: 'edit' });
                    zoomToRect(r, 0.95);
                  }}
                />
              ) : null}
            </Stage>
          </>
        ) : (
          <EmptyState onSample={onSample} />
        )}
        <p className="m-0 flex flex-wrap gap-x-3 text-xs text-muted">
          {s.image ? <span>{S.viewHint}</span> : null}
          <span className="ml-auto tabular-nums" data-testid="output-size">
            {S.outputSize(W, H)}
          </span>
        </p>
        <Transport
          {...playback}
          onLoopChange={(v) => {
            playback.onLoopChange(v);
            setPrefs({ loop: v });
          }}
          segments={segments}
          markers={markers}
          fps={s.timing.fps}
          disabled={!s.image}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<SkipForward />}
          onClick={() => {
            pause();
            onTimeChange(total);
          }}
          disabled={!s.image}
          title={S.toEndHint}
        >
          {S.toEnd}
        </Button>
        <Button size="sm" icon={<Copy />} onClick={() => void copy()} disabled={!image}>
          {S.copy}
        </Button>
      </div>
      {s.frames.length >= LIMITS.frames ? (
        <Notice tone="warning">{S.frameLimit(LIMITS.frames)}</Notice>
      ) : null}
      <ExportArea s={s} image={image} exportRef={exportRef} />
    </div>
  );
}
