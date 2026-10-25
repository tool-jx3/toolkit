/**
 * 圖片演出的預覽欄（截圖演出、地圖演出共用）：工具自己的畫框工具列（toolbar）、編輯區的工具列（預覽背景、倍率、全圖、
 * 到選取的框、框選放大、手形、放大編輯區）、舞台（畫面＋編輯層）、播放列（分段色條、循環）、「完成的樣子」與複製圖片、
 * 工具的匯出區（exportArea）。
 *
 * 預覽平常停在結尾（完成的樣子）；按播放（空白鍵）從頭播。運鏡確認中預覽套用運鏡、不能編輯，Esc 回到編輯。
 * 編輯區的倍率不影響輸出：倍率改了之後把原本看到的中心（或指定的點）捲回中央。
 */
import {
  Clapperboard,
  Copy,
  Hand,
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
} from 'lucide-react';
import {
  type ReactNode,
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
  buildTimeline,
  cameraView,
  computeLayout,
  EDIT_ZOOM_MAX,
  EDIT_ZOOMS,
  editZoomFor,
  ensureCreditFont,
  type FrameBase,
  type FxDoc,
  type FxPrefsBase,
  type FxStore,
  type ImageSource,
  type Layout,
  LIMITS,
  type PhaseId,
  type Placement,
  type Rect,
  RenderCache,
  type RenderKit,
  renderFrame,
  type Size,
  STAGE_BGS,
  type StageBg,
  stepEditZoom,
  type Timeline,
  timelineSegments,
  toCanvasRect,
} from '@/core/imagefx';
import { Button, IconButton } from './Button';
import { cn } from './cn';
import { ImageFxEditLayer } from './ImageFxEditLayer';
import { Notice } from './Notice';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { Stage, type StageBackground } from './Stage';
import { withShortcut } from './shortcuts';
import { useToast } from './Toast';
import { Tooltip } from './Tooltip';
import { Transport } from './Transport';
import { usePlayback } from './usePlayback';

export interface FxPlayerHandle {
  toggle: () => void;
  seek: (t: number) => void;
  readonly time: number;
  readonly playing: boolean;
  readonly duration: number;
}

/** 預覽欄的文字（工具的 strings.ts 提供） */
export interface ImageFxPreviewText {
  viewBar: string;
  viewZoom: string;
  viewZoomOption: (z: number) => string;
  viewZoomOut: string;
  viewZoomIn: string;
  viewFit: string;
  viewSelected: string;
  viewRegion: string;
  viewHand: string;
  viewExpand: string;
  viewHint: string;
  stageLabel: string;
  editorLabel: string;
  frameAria: (n: number, name: string) => string;
  outputSize: (w: number, h: number) => string;
  cameraPreviewing: string;
  cameraBack: string;
  cameraBackHint: string;
  emptyTitle: string;
  emptyDesc: string;
  missingImage: string;
  sample: string;
  demo: string;
  toEnd: string;
  toEndHint: string;
  copy: string;
  copied: string;
  copyUnsupported: string;
  copyFailed: string;
  frameLimit: (n: number) => string;
  phases: Record<PhaseId, string>;
  actionMarker: (name: string) => string;
}

/** 預覽背景的名稱（同共用舞台：透明的是棋盤格） */
const STAGE_BG_LABEL: Record<StageBg, string> = { checker: '透明', dark: '黑', light: '白' };

// biome-ignore lint/suspicious/noExplicitAny: 各工具的框、內容、偏好、分頁型別不同，這裡只用共同的部分
type AnyFxStore = FxStore<any, any, any, any>;

/* ---------- 圖片 ---------- */

/** 目前的原圖（解碼好的；讀不到時從內容裡拿掉） */
export function useFxSourceImage(fx: AnyFxStore): ImageSource | null {
  const ref = fx.useDoc((s: { data: FxDoc }) => s.data.image);
  const img = useAssetImage(fx.assets, ref?.id);
  useEffect(() => {
    if (img.status === 'missing' && ref) fx.dropMissingImage(ref.id);
  }, [img.status, ref, fx]);
  return img.bitmap;
}

/** 出處的字型載好之後重畫 */
function useCreditFontTick(s: FxDoc): number {
  const [tick, setTick] = useState(0);
  const text = s.credit.text.trim();
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在文字改變時等字型
  useEffect(() => {
    if (!text) return;
    let alive = true;
    void ensureCreditFont({ credit: { ...s.credit, text } }).then(() => {
      if (alive) setTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return tick;
}

/* ---------- 編輯區的工具列（不影響輸出） ---------- */

function ViewBar({
  fx,
  text,
  onZoom,
  onFit,
  onSelected,
}: {
  fx: AnyFxStore;
  text: ImageFxPreviewText;
  onZoom: (z: number) => void;
  onFit: () => void;
  onSelected: () => void;
}) {
  const stageBg = fx.usePrefs((p: { data: FxPrefsBase }) => p.data.stageBg);
  const z: number = fx.useLive((l) => l.viewZoom);
  const pointer = fx.useLive((l) => l.pointer);
  const expanded = fx.useLive((l) => l.expanded);
  const selected = fx.useLive((l) => l.selected);
  const camera = fx.useLive((l) => l.cameraPreview);
  const zoomOptions = [...new Set([...EDIT_ZOOMS, z])].sort((a, b) => a - b);
  return (
    <div
      role="toolbar"
      aria-label={text.viewBar}
      className="flex flex-wrap items-center gap-1.5"
      data-testid="view-bar"
    >
      <Segmented<StageBg>
        aria-label="預覽背景"
        size="sm"
        value={stageBg}
        onValueChange={(v) => fx.setPrefs({ stageBg: v })}
        options={STAGE_BGS.map((b) => ({
          value: b,
          label: STAGE_BG_LABEL[b],
          ariaLabel: b === 'checker' ? '棋盤格（透明）' : undefined,
        }))}
      />
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <IconButton
          label={text.viewZoomOut}
          icon={<Minus />}
          size="sm"
          disabled={z <= 1 + 1e-3}
          onClick={() => onZoom(stepEditZoom(z, -1))}
        />
        <Select
          size="sm"
          aria-label={text.viewZoom}
          value={String(z)}
          onValueChange={(v) => onZoom(Number(v))}
          options={zoomOptions.map((v) => ({ value: String(v), label: text.viewZoomOption(v) }))}
          className="w-24"
        />
        <IconButton
          label={text.viewZoomIn}
          icon={<Plus />}
          size="sm"
          disabled={z >= EDIT_ZOOM_MAX - 1e-3}
          onClick={() => onZoom(stepEditZoom(z, 1))}
        />
        <IconButton label={text.viewFit} icon={<Maximize />} size="sm" onClick={onFit} />
        <IconButton
          label={text.viewSelected}
          icon={<LocateFixed />}
          size="sm"
          disabled={!selected || camera}
          onClick={onSelected}
        />
        <Tooltip
          content={pointer === 'region' ? withShortcut(text.viewRegion, 'escape') : text.viewRegion}
        >
          <IconButton
            label={text.viewRegion}
            noTooltip
            icon={<ScanSearch />}
            size="sm"
            pressed={pointer === 'region'}
            disabled={camera}
            onClick={() =>
              fx.useLive.setState({ pointer: pointer === 'region' ? 'edit' : 'region' })
            }
          />
        </Tooltip>
        <IconButton
          label={text.viewHand}
          icon={<Hand />}
          size="sm"
          pressed={pointer === 'hand'}
          disabled={camera}
          onClick={() => fx.useLive.setState({ pointer: pointer === 'hand' ? 'edit' : 'hand' })}
        />
        <Tooltip content={expanded ? withShortcut(text.viewExpand, 'escape') : text.viewExpand}>
          <IconButton
            label={text.viewExpand}
            noTooltip
            icon={expanded ? <Minimize2 /> : <Maximize2 />}
            size="sm"
            pressed={expanded}
            onClick={() => fx.useLive.setState({ expanded: !expanded })}
          />
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * 放大編輯區（fixed、蓋滿視窗）要蓋在頁首上面：寬畫面時共用外框的預覽欄是 sticky，自己形成堆疊內容，
 * 裡面的 z-50 超不過頁首的 z-30。開著的時候把祖先裡形成堆疊內容的定位（sticky、有 z-index 的定位）暫時改掉
 * （元素自己的 inline style），收起來或卸載時還原——只在放大編輯區的時候，不動共用外框的規則與 DOM 結構
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

function Painter<F extends FrameBase>({
  s,
  image,
  time,
  layout,
  tl,
  camera,
  kit,
}: {
  s: FxDoc<F>;
  image: ImageSource | null;
  time: number;
  layout: Layout;
  tl: Timeline;
  camera: boolean;
  kit: RenderKit<F>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useMemo(() => new RenderCache(), []);
  const fontTick = useCreditFontTick(s);
  const { width: W, height: H } = layout.canvas;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後重畫
  useLayoutEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    renderFrame(g, { state: s, image }, time, cache, kit, {
      view: camera ? cameraView(s, layout, tl, time) : null,
    });
  }, [s, image, time, cache, fontTick, W, H, camera, layout, tl, kit]);
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

function EmptyState({
  fx,
  text,
  onSample,
}: {
  fx: AnyFxStore;
  text: ImageFxPreviewText;
  onSample: (demo: boolean) => void;
}) {
  const missing = fx.useLive((l) => l.missing);
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 p-6 text-center text-sm text-muted"
      data-testid="empty-state"
    >
      <ImagePlus aria-hidden className="size-8 text-muted" />
      <p className="m-0 text-base font-semibold text-fg">{text.emptyTitle}</p>
      <p className="m-0 max-w-[36em]">{text.emptyDesc}</p>
      {missing ? (
        <p className="m-0 text-warning" role="status">
          {text.missingImage}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon={<ImagePlus />} onClick={() => onSample(false)}>
          {text.sample}
        </Button>
        <Button variant="primary" icon={<Sparkles />} onClick={() => onSample(true)}>
          {text.demo}
        </Button>
      </div>
    </div>
  );
}

/* ---------- 預覽欄 ---------- */

/** 舞台上另外疊一層時拿得到的東西 */
export interface ImageFxStageContext {
  layout: Layout;
  image: Size;
  viewport: () => HTMLElement | null;
  playing: boolean;
  pause: () => void;
}

export interface ImageFxPreviewProps<F extends FrameBase, S extends FxDoc<F>> {
  fx: AnyFxStore;
  kit: RenderKit<F>;
  text: ImageFxPreviewText;
  playerRef: Ref<FxPlayerHandle>;
  onSample: (demo: boolean) => void;
  /** 工具自己的畫框工具列 */
  toolbar: ReactNode;
  /** 框的名稱（例「放大框 2」） */
  frameName: (f: F, frames: readonly F[]) => string;
  /** 輔助線的顏色 */
  guideColor: (f: F) => string;
  /** 輔助線上另外畫的東西 */
  guideExtra?: (f: F, shot: Placement, k: number) => ReactNode;
  /** 舞台上另外疊的一層（例如點選建立路線）；給了而且不是 null 時編輯層藏起來 */
  stageOverlay?: (ctx: ImageFxStageContext) => ReactNode;
  /** 匯出區 */
  exportArea: (ctx: { s: S; image: ImageSource | null }) => ReactNode;
  /** 複製圖片用的完成圖 */
  finalPng: (s: S, image: ImageSource) => Promise<Blob>;
}

export function ImageFxPreview<F extends FrameBase, S extends FxDoc<F>>({
  fx,
  kit,
  text,
  playerRef,
  onSample,
  toolbar,
  frameName,
  guideColor,
  guideExtra,
  stageOverlay,
  exportArea,
  finalPng,
}: ImageFxPreviewProps<F, S>) {
  const s: S = fx.useDoc((st: { data: S }) => st.data);
  const image = useFxSourceImage(fx);
  const stageBg: StageBg = fx.usePrefs((p: { data: FxPrefsBase }) => p.data.stageBg);
  const loop: boolean = fx.usePrefs((p: { data: FxPrefsBase }) => p.data.loop);
  const guides: boolean = fx.usePrefs((p: { data: FxPrefsBase }) => p.data.guides);
  const viewZoom: number = fx.useLive((l) => l.viewZoom);
  const expanded: boolean = fx.useLive((l) => l.expanded);
  const cameraPreview: boolean = fx.useLive((l) => l.cameraPreview);
  const cameraRun: number = fx.useLive((l) => l.cameraRun);
  const seek = fx.useLive((l) => l.seek);
  const selected: string | null = fx.useLive((l) => l.selected);
  const pointer = fx.useLive((l) => l.pointer);
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
  const tl = useMemo(() => buildTimeline(s.timing, s.frames, kit, s.camera), [s, kit]);
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
   * 減少動態時不用平滑捲動。運鏡關掉（或沒有對象）時回到編輯。
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
    if (cameraPreview && !tl.camera) fx.useLive.setState({ cameraPreview: false });
  }, [cameraPreview, tl.camera, fx]);

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
      const l = fx.useLive.getState();
      if (l.cameraPreview) fx.useLive.setState({ cameraPreview: false });
      else if (l.pointer === 'region') fx.useLive.setState({ pointer: 'edit' });
      else if (l.expanded) fx.useLive.setState({ expanded: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fx]);

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
      fx.useLive.setState({ viewZoom: Math.min(EDIT_ZOOM_MAX, Math.max(1, z)) });
      setCenterReq((r) => ({ ...c, n: (r?.n ?? 0) + 1 }));
    },
    [visibleCenter, fx],
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
    fx.useLive.setState({ pointer: 'edit' });
    zoomTo(1, { x: W / 2, y: H / 2 });
  };
  const zoomToRect = (r: Rect, fill: number) =>
    zoomTo(editZoomFor(r, layout.canvas, fill), { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const toSelected = () => {
    const f = s.frames.find((x) => x.id === fx.useLive.getState().selected);
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

  const segments = timelineSegments(tl, text.phases);
  const markers =
    s.timing.order === 'sequential' && tl.actionIds.length > 1
      ? tl.actionIds.map((id) => {
          const f = s.frames.find((x) => x.id === id) as F;
          return {
            time: tl.windows[id].start,
            label: text.actionMarker(frameName(f, s.frames)),
          };
        })
      : undefined;

  const copy = async () => {
    if (!image) return;
    const r = await copyImage(finalPng(fx.docNow() as S, image));
    if (r.ok) toast({ title: text.copied, tone: 'success' });
    else
      toast({
        title: r.reason === 'unsupported' ? text.copyUnsupported : text.copyFailed,
        tone: 'warning',
      });
  };

  const overlay =
    image && !cameraPreview && stageOverlay
      ? stageOverlay({
          layout,
          image: { width: image.width, height: image.height },
          viewport: () => viewport.current,
          playing: playback.playing,
          pause,
        })
      : null;

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
        {toolbar}
        {cameraPreview ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-md bg-accent-soft px-3 py-1.5 text-sm [&_svg]:size-4"
            data-testid="camera-preview"
          >
            <Clapperboard aria-hidden />
            {text.cameraPreviewing}
            <Button
              size="sm"
              className="ml-auto"
              title={text.cameraBackHint}
              onClick={() => fx.useLive.setState({ cameraPreview: false })}
            >
              {text.cameraBack}
            </Button>
          </div>
        ) : null}
        {s.image ? (
          <>
            <ViewBar
              fx={fx}
              text={text}
              onZoom={(z) => zoomTo(z)}
              onFit={fitView}
              onSelected={toSelected}
            />
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
              aria-label={text.stageLabel}
            >
              <Painter
                s={s}
                image={image}
                time={playback.time}
                layout={layout}
                tl={tl}
                camera={cameraPreview}
                kit={kit}
              />
              {image && !cameraPreview && !overlay ? (
                <ImageFxEditLayer<F>
                  layout={layout}
                  image={{ width: image.width, height: image.height }}
                  frames={s.frames}
                  selected={selected}
                  pointerTool={pointer}
                  guides={guides}
                  playing={playback.playing}
                  viewport={() => viewport.current}
                  guideColor={guideColor}
                  guideExtra={guideExtra}
                  itemLabel={(f, i) => text.frameAria(i + 1, frameName(f, s.frames))}
                  ariaLabel={text.editorLabel}
                  onBeginEdit={pause}
                  onTogglePlay={playback.toggle}
                  onRegion={(r) => {
                    fx.useLive.setState({ pointer: 'edit' });
                    zoomToRect(r, 0.95);
                  }}
                  onDraw={(r) => {
                    fx.addFrame(r);
                  }}
                  onSelect={(id, reveal) => fx.select(id, reveal)}
                  onRectChange={(id, r, merge) => fx.setFrameRect(id, r, merge)}
                  onGestureStart={() => fx.useDoc.beginGesture()}
                  onGestureEnd={() => fx.useDoc.endGesture()}
                  onDelete={(id) => fx.removeFrame(id)}
                />
              ) : null}
              {overlay}
            </Stage>
          </>
        ) : (
          <EmptyState fx={fx} text={text} onSample={onSample} />
        )}
        <p className="m-0 flex flex-wrap gap-x-3 text-xs text-muted">
          {s.image ? <span>{text.viewHint}</span> : null}
          <span className="ml-auto tabular-nums" data-testid="output-size">
            {text.outputSize(W, H)}
          </span>
        </p>
        <Transport
          {...playback}
          onLoopChange={(v) => {
            playback.onLoopChange(v);
            fx.setPrefs({ loop: v });
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
          title={text.toEndHint}
        >
          {text.toEnd}
        </Button>
        <Button size="sm" icon={<Copy />} onClick={() => void copy()} disabled={!image}>
          {text.copy}
        </Button>
      </div>
      {s.frames.length >= LIMITS.frames ? (
        <Notice tone="warning">{text.frameLimit(LIMITS.frames)}</Notice>
      ) : null}
      {exportArea({ s, image })}
    </div>
  );
}
