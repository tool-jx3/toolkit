/**
 * 預覽欄（規格 1.3、1.6、1.7）：畫框的工具列、舞台（畫面＋編輯層：輔助線、拖曳畫框、共用的 LayoutEditor）、
 * 播放列（分段色條、循環）、「完成的樣子」與複製圖片、共用的匯出區。
 *
 * 預覽平常停在結尾（完成的樣子）；按播放（空白鍵）從頭播。編輯層的座標是畫面 px，框存的是原圖 px（換算見 model）。
 */
import {
  Copy,
  Highlighter,
  ImagePlus,
  SkipForward,
  Sparkles,
  SquareDashed,
  ZoomIn,
} from 'lucide-react';
import {
  type PointerEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAssetImage } from '@/core/assets';
import { copyImage } from '@/core/files';
import type { Box } from '@/core/layout';
import {
  Button,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  LayoutEditor,
  type LayoutItem,
  Notice,
  Segmented,
  Stage,
  type StageBackground,
  Toggle,
  Transport,
  usePlayback,
  useStageScale,
  useToast,
} from '@/ui';
import { ApngEstimate, useVideoMode, videoFormat } from './ExportExtras';
import { ensureCreditFont, exportApng, exportPng, exportVideo, finalPng } from './exporter';
import {
  apngTimes,
  buildTimeline,
  computeLayout,
  type Frame,
  type FrameKind,
  type FxState,
  kindIndex,
  type Layout,
  LIMITS,
  type Placement,
  type Rect,
  rectFromDrag,
  type Size,
  timelineSegments,
  toCanvasRect,
  toSourcePoint,
  toSourceRect,
  VIDEO_FPS,
} from './model';
import { type ImageSource, RenderCache, renderFrame } from './render';
import {
  APNG_COLORS,
  addFrame,
  assets,
  docNow,
  dropMissingImage,
  removeFrame,
  STAGE_BGS,
  type StageBg,
  select,
  setFrameRect,
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

/** 輔助線的顏色（只在預覽） */
const GUIDE_COLOR: Record<FrameKind, string> = {
  zoom: '#38bdf8',
  marker: '#facc15',
  redact: '#fb7185',
};

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
          disabled={!hasImage}
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

/* ---------- 輔助線（框的虛線與編號；不會匯出） ---------- */

function Guides({
  frames,
  shot,
  W,
  H,
}: {
  frames: readonly Frame[];
  shot: Placement;
  W: number;
  H: number;
}) {
  const k = 1 / useStageScale();
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${W} ${H}`}
      data-testid="guides"
    >
      {frames.map((f, i) => {
        const r = toCanvasRect(shot, f);
        const col = GUIDE_COLOR[f.kind];
        const rad = 10 * k;
        const bx = Math.max(rad, r.x + rad * 0.2);
        const by = Math.max(rad, r.y - rad * 1.2 < 0 ? r.y + rad : r.y - rad * 0.2);
        return (
          <g key={f.id} data-guide-id={f.id}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="none"
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={3.5 * k}
            />
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="none"
              stroke={col}
              strokeWidth={1.8 * k}
              strokeDasharray={`${7 * k} ${4 * k}`}
            />
            <circle cx={bx} cy={by} r={rad} fill={col} stroke="#000" strokeWidth={1 * k} />
            <text
              x={bx}
              y={by}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11 * k}
              fontWeight={700}
              fill="#000"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 編輯層 ---------- */

interface Draft {
  pointer: number;
  a: { x: number; y: number };
  b: { x: number; y: number };
  shift: boolean;
}

function Editor({
  layout,
  image,
  frames,
  onBeginEdit,
  onTogglePlay,
}: {
  layout: Layout;
  image: Size;
  frames: readonly Frame[];
  onBeginEdit: () => void;
  onTogglePlay: () => void;
}) {
  const selected = useLive((l) => l.selected);
  const guides = usePrefs((p) => p.data.guides);
  const { canvas, shot } = layout;
  const W = canvas.width;
  const H = canvas.height;
  const root = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const k = 1 / useStageScale();

  const point = (e: PointerEvent) => {
    const r = root.current?.getBoundingClientRect();
    const x = r?.width ? ((e.clientX - r.left) / r.width) * W : 0;
    const y = r?.height ? ((e.clientY - r.top) / r.height) * H : 0;
    return toSourcePoint(shot, image, x, y);
  };
  const beginDraw = (e: PointerEvent<HTMLDivElement>, shift: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onBeginEdit();
    const p = point(e);
    setDraft({ pointer: e.pointerId, a: p, b: p, shift });
  };
  const endDraw = (e: PointerEvent<HTMLDivElement>) => {
    if (!draft || draft.pointer !== e.pointerId) return;
    const b = point(e);
    setDraft(null);
    const rect = rectFromDrag(draft.a, b, image);
    if (rect) {
      if (docNow().frames.length >= LIMITS.frames) return;
      addFrame(rect);
      return;
    }
    /* 沒有拖動＝點一下：Shift 時選取那裡最上面的框，不然取消選取 */
    if (draft.shift) {
      const hit = [...frames]
        .reverse()
        .find((f) => b.x >= f.x && b.x <= f.x + f.w && b.y >= f.y && b.y <= f.y + f.h);
      select(hit?.id ?? null, !!hit);
    } else select(null);
  };

  /* 放大框在下、其他在上；選取中的放最後（控點不被蓋住） */
  const ordered = [
    ...frames.filter((f) => f.kind === 'zoom'),
    ...frames.filter((f) => f.kind !== 'zoom'),
  ].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  const items: LayoutItem[] = ordered.map((f) => {
    const r = toCanvasRect(shot, f);
    const n = frames.indexOf(f) + 1;
    return {
      id: f.id,
      label: S.frameAria(n, S.frameName(f.kind, kindIndex(frames, f.id))),
      box: { x: r.x, y: r.y, width: r.w, height: r.h },
      resizable: true,
      handles: ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'],
      limits: {
        minWidth: LIMITS.minSize * shot.f,
        minHeight: LIMITS.minSize * shot.f,
        maxWidth: shot.w,
        maxHeight: shot.h,
      },
      clamp: (b: Box, op: 'move' | 'resize') => {
        if (op === 'move')
          return {
            ...b,
            x: Math.min(Math.max(b.x, shot.x), shot.x + shot.w - b.width),
            y: Math.min(Math.max(b.y, shot.y), shot.y + shot.h - b.height),
          };
        const x0 = Math.max(b.x, shot.x);
        const y0 = Math.max(b.y, shot.y);
        const x1 = Math.min(b.x + b.width, shot.x + shot.w);
        const y1 = Math.min(b.y + b.height, shot.y + shot.h);
        return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
      },
    };
  });

  const toSrc = (b: Box): Rect => toSourceRect(shot, { x: b.x, y: b.y, w: b.width, h: b.height });
  const onChange = (id: string, box: Box, change: { phase: string }) => {
    if (change.phase === 'start') {
      onBeginEdit();
      useDoc.beginGesture();
      return;
    }
    if (change.phase === 'end') {
      useDoc.endGesture();
      return;
    }
    setFrameRect(id, toSrc(box));
  };

  const draftRect =
    draft && (draft.a.x !== draft.b.x || draft.a.y !== draft.b.y)
      ? toCanvasRect(shot, {
          x: Math.min(draft.a.x, draft.b.x),
          y: Math.min(draft.a.y, draft.b.y),
          w: Math.abs(draft.b.x - draft.a.x),
          h: Math.abs(draft.b.y - draft.a.y),
        })
      : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 拖曳畫框（鍵盤用清單與方向鍵）；只接住框的按鈕冒上來的空白鍵
    <div
      ref={root}
      className="absolute inset-0 touch-none"
      style={{ cursor: 'crosshair' }}
      data-testid="editor"
      onPointerDownCapture={(e) => {
        /* Shift＋拖曳：在已有的框上也畫新框（不讓框的拖曳層收到） */
        if (e.shiftKey && e.button === 0) {
          e.stopPropagation();
          beginDraw(e, true);
        }
      }}
      onPointerDown={(e) => beginDraw(e, false)}
      onPointerMove={(e) => {
        if (draft && draft.pointer === e.pointerId) setDraft({ ...draft, b: point(e) });
      }}
      onPointerUp={endDraw}
      onPointerCancel={() => setDraft(null)}
      onKeyDown={(e) => {
        /* 點了框之後焦點在框的按鈕上：空白鍵照樣播放／暫停（共用的快捷鍵把按鈕上的空白鍵讓給按鈕） */
        if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onTogglePlay();
        }
      }}
    >
      {guides ? <Guides frames={frames} shot={shot} W={W} H={H} /> : null}
      {draftRect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          data-testid="draw-draft"
          style={{
            left: draftRect.x,
            top: draftRect.y,
            width: draftRect.w,
            height: draftRect.h,
            outline: `${2 * k}px dashed var(--accent)`,
            background: 'rgba(255,255,255,0.12)',
          }}
        />
      ) : null}
      <LayoutEditor
        width={W}
        height={H}
        items={items}
        selectedId={selected}
        onSelect={(id) => select(id, !!id)}
        onChange={onChange}
        nudgeStep={shot.f}
        nudgeShiftStep={shot.f * 10}
        hitPadding={4}
        guides={false}
        onDelete={removeFrame}
        onEscape={() => select(null)}
        aria-label={S.editorLabel}
      />
    </div>
  );
}

/* ---------- 畫面 ---------- */

function Painter({
  s,
  image,
  time,
  W,
  H,
}: {
  s: FxState;
  image: ImageSource | null;
  time: number;
  W: number;
  H: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useMemo(() => new RenderCache(), []);
  const fontTick = useCreditFontTick(s);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後重畫
  useLayoutEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    renderFrame(g, { state: s, image }, time, cache);
  }, [s, image, time, cache, fontTick, W, H]);
  return (
    <canvas ref={ref} width={W} height={H} className="block size-full" data-testid="fx-canvas" />
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
  const total = buildTimeline(s.timing, s.frames).total;
  const fmt = settings.format;
  const animated = fmt === 'apng' || fmt === 'video';
  const fps = fmt === 'apng' ? s.timing.fps : videoFps;
  const noImage = !image;
  const formats = [
    {
      id: 'png',
      label: S.formats.png,
      description: S.formatDesc.png,
      disabled: noImage,
      disabledReason: noImage ? S.needImage : undefined,
    },
    {
      id: 'apng',
      label: S.formats.apng,
      description: S.formatDesc.apng,
      animated: true,
      supportsLoop: true,
      supportsColors: true,
      disabled: noImage,
      disabledReason: noImage ? S.needImage : undefined,
    },
    videoFormat(mode, transparent, noImage),
  ];
  return (
    <ExportPanel
      ref={exportRef}
      formats={formats}
      settings={settings}
      onSettingsChange={(next: ExportSettings) => setPrefs({ export: { ...next, scale: 1 } })}
      fixedFps={fmt === 'apng' ? s.timing.fps : null}
      fixedFpsHint={S.apngFpsHint}
      fpsOptions={VIDEO_FPS}
      colorOptions={APNG_COLORS}
      quantizeHint={S.colorsHint}
      loopHint={S.loopHint}
      resetKey={s}
      estimate={
        animated && image
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
  const toast = useToast();
  const imageSize = s.image ? { width: s.image.width, height: s.image.height } : null;
  const layout = computeLayout(s, image ? { width: image.width, height: image.height } : imageSize);
  const W = layout.canvas.width;
  const H = layout.canvas.height;
  const tl = buildTimeline(s.timing, s.frames);
  const total = tl.total;
  const playback = usePlayback({ duration: total, loop, autoPlay: false });
  const { onTimeChange, pause } = playback;

  /* 平常停在結尾：開頁時、停在結尾時總長變了 */
  const lastTotal = useRef<number | null>(null);
  useEffect(() => {
    const prev = lastTotal.current;
    lastTotal.current = total;
    if (prev === null || (!playback.playing && playback.time >= prev - 1e-6)) onTimeChange(total);
  }, [total, playback.playing, playback.time, onTimeChange]);

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
      <ToolBar />
      {s.image ? (
        <Stage<StageBg>
          width={W}
          height={H}
          backgrounds={STAGE_BGS}
          background={{ kind: stageBg } as StageBackground<StageBg>}
          onBackgroundChange={(bg) => setPrefs({ stageBg: bg.kind as StageBg })}
          aria-label={S.stageLabel}
        >
          <Painter s={s} image={image} time={playback.time} W={W} H={H} />
          {image ? (
            <Editor
              layout={layout}
              image={{ width: image.width, height: image.height }}
              frames={s.frames}
              onBeginEdit={pause}
              onTogglePlay={playback.toggle}
            />
          ) : null}
        </Stage>
      ) : (
        <EmptyState onSample={onSample} />
      )}
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
        <span className="ml-auto text-xs text-muted tabular-nums" data-testid="output-size">
          {S.outputSize(W, H)}
        </span>
      </div>
      {s.frames.length >= LIMITS.frames ? (
        <Notice tone="warning">{S.frameLimit(LIMITS.frames)}</Notice>
      ) : null}
      <ExportArea s={s} image={image} exportRef={exportRef} />
    </div>
  );
}
