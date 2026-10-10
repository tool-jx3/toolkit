/**
 * 圖片放進框（pair-maker 移植時新增）：框固定在中央（比例固定，或 aspect＝null 時拖邊角自由改比例），
 * 在框下面拖曳、縮放、旋轉圖片；套用時把框裡的內容畫成指定大小的畫布（框外、圖外是透明）。
 * 與 CropDialog（框在圖上移動、只能在圖內）不同：這裡可以縮小到整張圖都放進框裡、四周留透明。
 *
 * 操作：拖曳圖片移動、滾輪以游標為中心縮放；「縮小／放大」每次 ÷1.1／×1.1、「整張放入」、「旋轉 90°」、「回到初始」。
 * 鍵盤：檢視區聚焦時方向鍵移動（Shift 10 px）、+／- 縮放。
 * 初始：圖片蓋滿框、置中（框裡沒有透明）。
 * 觸控：兩指捏合以兩指中點縮放（同時可以平移；lock-screen 移植時加入，所有用法都有）。
 *
 * lock-screen 移植時加的選填（不給時行為不變）：
 * - `initialPlacement`：打開時的位置（重新裁切時還原上次的位置；`@/core/image` 的 `FramePlacement`，和檢視區大小無關）。
 * - `onApply(placement)`：套用時收到位置（存起來、之後依位置畫原圖）；`onConfirm` 改成選填（不給時不畫輸出的畫布）。
 * - `cover`：圖片一定蓋滿框（不能縮小到露出透明、拖曳夾在範圍內），縮放 1～`maxZoom` 倍（以蓋滿為 1，預設 4），
 *   多一個「縮放」滑桿（100%～400%），沒有「整張放入」；直式的框（比例 < 1）檢視區加高。
 * - `guides="thirds"`：框裡畫三分線。
 *
 * ```tsx
 * <ImageFrameDialog open={open} onOpenChange={setOpen} image={bmp} aspect={194 / 194} output={{ width: 194, height: 194 }}
 *   shape="circle" onConfirm={(canvas) => save(canvas)} />
 * ```
 */
import { Maximize, Minus, Plus, RotateCw, Undo2 } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from 'react';
import {
  clampCover,
  coverScale,
  type FramePlacement,
  makeCanvas,
  placedTransform,
  placementOf,
} from '@/core/image';
import { type Box, type BoxHandle, resizeBox } from '@/core/layout';
import { Button } from './Button';
import { cn } from './cn';
import { Dialog, DialogClose } from './Dialog';
import { Slider } from './Slider';

export interface FrameTransform {
  /** 圖片中心（檢視區座標） */
  cx: number;
  cy: number;
  /** 縮放（檢視區 px ÷ 原圖 px） */
  scale: number;
  /** 順時針轉了幾個 90° */
  turns: number;
}

export interface ImageFrameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: CanvasImageSource | null;
  /** 框的比例（寬／高）；null＝自由比例（框的邊角可以拖） */
  aspect: number | null;
  /** 輸出大小；不給時依框裡的原圖解析度 */
  output?: { width: number; height: number };
  /**
   * 套用（得到框裡內容的畫布；第二個參數是位置）。不給時不畫輸出的畫布（只要位置時用 onApply）。
   */
  onConfirm?: (canvas: HTMLCanvasElement | OffscreenCanvas, placement: FramePlacement) => void;
  /** 套用時收到圖片在框裡的位置（和檢視區大小無關，可以存起來、之後依位置畫原圖） */
  onApply?: (placement: FramePlacement) => void;
  /** 打開時的位置（例如重新裁切時還原上次的位置）；不給時蓋滿置中 */
  initialPlacement?: FramePlacement | null;
  /** 圖片一定蓋滿框：縮放 1～maxZoom 倍（以蓋滿為 1，預設 4）、拖曳夾在範圍內；顯示縮放滑桿 */
  cover?: boolean | { maxZoom?: number };
  /** 框裡的輔助線（'thirds'＝三分線） */
  guides?: 'thirds' | null;
  title?: string;
  /** 框的形狀提示（圓形格子時畫一個圓形的參考線；輸出仍是方形） */
  shape?: 'rect' | 'circle';
  /** 下方的說明（預設說明「整張放入」的透明留白；cover 時說明拖曳與縮放） */
  note?: ReactNode;
}

const ZOOM_STEP = 1.1;
const MARGIN = 28;

/** 圖片轉過之後的寬高 */
export const turnedSize = (w: number, h: number, turns: number) =>
  turns % 2 ? { width: h, height: w } : { width: w, height: h };

/** 最大的框（比例 aspect，放在 view 裡、四周留 margin、置中） */
export function frameIn(
  view: { width: number; height: number },
  aspect: number,
  margin = MARGIN,
): Box {
  const w0 = Math.max(10, view.width - margin * 2);
  const h0 = Math.max(10, view.height - margin * 2);
  const w = Math.min(w0, h0 * aspect);
  const h = w / aspect;
  return { x: (view.width - w) / 2, y: (view.height - h) / 2, width: w, height: h };
}

/** 蓋滿（cover）或整張放入（contain）時的變換 */
export function fitTransform(
  img: { width: number; height: number },
  frame: Box,
  mode: 'cover' | 'contain',
  turns = 0,
): FrameTransform {
  const s = turnedSize(img.width, img.height, turns);
  const k =
    mode === 'cover'
      ? Math.max(frame.width / s.width, frame.height / s.height)
      : Math.min(frame.width / s.width, frame.height / s.height);
  return { cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2, scale: k, turns };
}

/** 以某一點為中心縮放 */
export function zoomAt(t: FrameTransform, factor: number, px: number, py: number): FrameTransform {
  return {
    ...t,
    scale: t.scale * factor,
    cx: px + (t.cx - px) * factor,
    cy: py + (t.cy - py) * factor,
  };
}

/** 以某一點為中心順時針轉 90° */
export function turnAt(t: FrameTransform, px: number, py: number): FrameTransform {
  const dx = t.cx - px;
  const dy = t.cy - py;
  return { ...t, turns: (t.turns + 1) % 4, cx: px - dy, cy: py + dx };
}

/** 框裡的內容畫成 out（寬 × 高）的畫布 */
export function renderFrame(
  img: CanvasImageSource,
  imgSize: { width: number; height: number },
  t: FrameTransform,
  frame: Box,
  out: { width: number; height: number },
): HTMLCanvasElement | OffscreenCanvas {
  const c = makeCanvas(out.width, out.height);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const kx = out.width / frame.width;
  const ky = out.height / frame.height;
  ctx.scale(kx, ky);
  ctx.translate(-frame.x, -frame.y);
  ctx.translate(t.cx, t.cy);
  ctx.rotate((t.turns * Math.PI) / 2);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(img, -imgSize.width / 2, -imgSize.height / 2, imgSize.width, imgSize.height);
  return c;
}

const sizeOf = (img: CanvasImageSource | null): { width: number; height: number } => {
  if (!img) return { width: 0, height: 0 };
  const a = img as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  return {
    width: a.naturalWidth || (typeof a.width === 'number' ? a.width : 0),
    height: a.naturalHeight || (typeof a.height === 'number' ? a.height : 0),
  };
};

const HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_AT: Record<BoxHandle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

export function ImageFrameDialog({
  open,
  onOpenChange,
  image,
  aspect,
  output,
  onConfirm,
  onApply,
  initialPlacement = null,
  cover = false,
  guides = null,
  title = '裁切圖片',
  shape = 'rect',
  note,
}: ImageFrameDialogProps) {
  /*
   * 檢視區與畫布用 callback ref 存成 state：對話框的內容在打開後的下一次（或下下次）繪製才掛上，
   * 用 useRef 的話量大小、畫圖的 effect 跑的時候還拿不到元素，之後又沒有別的變化，畫布就一直是空的
   * （lock-screen 移植時發現並修正）。
   */
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  canvas.current = canvasEl;
  const [view, setView] = useState({ width: 480, height: 360 });
  const [frame, setFrame] = useState<Box>({ x: 0, y: 0, width: 1, height: 1 });
  const [t, setTRaw] = useState<FrameTransform>({ cx: 0, cy: 0, scale: 1, turns: 0 });
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    t: FrameTransform;
    frame: Box;
    handle: BoxHandle | null;
  } | null>(null);
  /* 按著的指標（兩指捏合用）與捏合開始時的狀態 */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; t: FrameTransform } | null>(
    null,
  );
  const sized = sizeOf(image);
  const iw = sized.width;
  const ih = sized.height;
  const img = useMemo(() => ({ width: iw, height: ih }), [iw, ih]);
  const coverOn = !!cover;
  const maxZoom = typeof cover === 'object' && cover.maxZoom ? cover.maxZoom : 4;

  /** 蓋滿模式：夾在蓋滿的範圍內（縮放 1～maxZoom、不露出透明） */
  const fix = useCallback(
    (next: FrameTransform, f: Box = frame): FrameTransform =>
      coverOn && img.width && img.height ? clampCover(img, f, next, maxZoom) : next,
    [coverOn, img, frame, maxZoom],
  );
  const setT = useCallback(
    (next: FrameTransform | ((cur: FrameTransform) => FrameTransform)) =>
      setTRaw((cur) => fix(typeof next === 'function' ? next(cur) : next)),
    [fix],
  );

  /** 依檢視區大小決定框、圖片回到初始（initial：用 initialPlacement） */
  const reset = useCallback(
    (v = view, initial = false) => {
      if (!img.width || !img.height) return;
      let f: Box;
      if (aspect) f = frameIn(v, aspect);
      else {
        /* 自由比例：框一開始就是整張圖（整張放入檢視區） */
        const k = Math.min(
          (v.width - MARGIN * 2) / img.width,
          (v.height - MARGIN * 2) / img.height,
        );
        const w = img.width * k;
        const h = img.height * k;
        f = { x: (v.width - w) / 2, y: (v.height - h) / 2, width: w, height: h };
      }
      setFrame(f);
      const start =
        initial && initialPlacement
          ? placedTransform(img, f, initialPlacement)
          : fitTransform(img, f, 'cover');
      setTRaw(fix(start, f));
    },
    [aspect, img, view, initialPlacement, fix],
  );

  /* 開啟時量檢視區大小並回到初始（有 initialPlacement 時用它） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在開啟、換圖、檢視區掛上時重來（reset 每次都是新的）
  useLayoutEffect(() => {
    if (!open) return;
    const el = host;
    const w = Math.max(240, Math.floor(el?.clientWidth ?? 480));
    /* 蓋滿模式的直式框（例如手機桌布 9:19.5）：檢視區加高，框才不會太小 */
    const tall = coverOn && !!aspect && aspect < 1;
    const v = {
      width: w,
      height: tall
        ? Math.round(
            Math.min(
              Math.max(320, (w - MARGIN * 2) / aspect + MARGIN * 2),
              window.innerHeight * 0.62,
            ),
          )
        : Math.round(Math.min(Math.max(220, w * 0.7), window.innerHeight * 0.55)),
    };
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
    setView(v);
    reset(v, true);
  }, [open, image, host]);

  /* 畫檢視區 */
  useEffect(() => {
    const c = canvasEl;
    if (!c || !image || !open) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(view.width * dpr);
    c.height = Math.round(view.height * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    /* 棋盤格 */
    for (let y = 0; y < view.height; y += 12)
      for (let x = 0; x < view.width; x += 12) {
        ctx.fillStyle = (x / 12 + y / 12) % 2 ? '#d4d4d4' : '#f2f2f2';
        ctx.fillRect(x, y, 12, 12);
      }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(t.cx, t.cy);
    ctx.rotate((t.turns * Math.PI) / 2);
    ctx.scale(t.scale, t.scale);
    ctx.drawImage(image, -img.width / 2, -img.height / 2, img.width, img.height);
    ctx.restore();
    /* 框外變暗 */
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.rect(0, 0, view.width, view.height);
    if (shape === 'circle') {
      const r = Math.min(frame.width, frame.height) / 2;
      ctx.moveTo(frame.x + frame.width / 2 + r, frame.y + frame.height / 2);
      ctx.arc(frame.x + frame.width / 2, frame.y + frame.height / 2, r, 0, Math.PI * 2, true);
    } else ctx.rect(frame.x + frame.width, frame.y, -frame.width, frame.height);
    ctx.fill('evenodd');
    ctx.restore();
    /* 三分線 */
    if (guides === 'thirds') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const k of [1 / 3, 2 / 3]) {
        ctx.moveTo(frame.x + frame.width * k, frame.y);
        ctx.lineTo(frame.x + frame.width * k, frame.y + frame.height);
        ctx.moveTo(frame.x, frame.y + frame.height * k);
        ctx.lineTo(frame.x + frame.width, frame.y + frame.height * k);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
    ctx.restore();
  }, [canvasEl, image, open, view, t, frame, shape, guides, img.width, img.height]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - r.left) / r.width) * view.width,
      y: ((e.clientY - r.top) / r.height) * view.height,
    };
  };

  /** 兩指的距離與中點 */
  const twoFingers = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onDown = (e: PointerEvent<HTMLElement>, handle: BoxHandle | null = null) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    if (!handle) {
      pointers.current.set(e.pointerId, p);
      if (pointers.current.size === 2) {
        /* 第二根手指：改成捏合（以兩指中點縮放、跟著中點平移） */
        const f = twoFingers();
        pinch.current = { dist: Math.max(1, f.dist), mid: f.mid, t };
        drag.current = null;
        return;
      }
      if (pointers.current.size > 2) return;
    }
    drag.current = { id: e.pointerId, x: p.x, y: p.y, t, frame, handle };
  };
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const p = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    const pz = pinch.current;
    if (pz && pointers.current.size >= 2) {
      const f = twoFingers();
      const z = zoomAt(pz.t, f.dist / pz.dist, pz.mid.x, pz.mid.y);
      setT({ ...z, cx: z.cx + f.mid.x - pz.mid.x, cy: z.cy + f.mid.y - pz.mid.y });
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.handle) {
      const next = resizeBox(d.frame, d.handle, p.x - d.x, p.y - d.y, {
        minWidth: 16,
        minHeight: 16,
        maxWidth: view.width,
        maxHeight: view.height,
      });
      const x = Math.max(0, Math.min(next.x, view.width - next.width));
      const y = Math.max(0, Math.min(next.y, view.height - next.height));
      setFrame({ ...next, x, y });
    } else setT({ ...d.t, cx: d.t.cx + p.x - d.x, cy: d.t.cy + p.y - d.y });
  };
  const onUp = (e: PointerEvent<HTMLElement>) => {
    const had = pointers.current.delete(e.pointerId);
    if (had && pinch.current) {
      pinch.current = null;
      /* 放開一指：剩下的那一指接著拖曳（從目前的位置開始） */
      const rest = [...pointers.current.entries()][0];
      drag.current = rest
        ? { id: rest[0], x: rest[1].x, y: rest[1].y, t, frame, handle: null }
        : null;
      return;
    }
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onWheel = (e: WheelEvent<HTMLElement>) => {
    const p = local(e);
    setT((cur) => zoomAt(cur, e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, p.x, p.y));
  };
  const fc = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (d[e.key]) {
      e.preventDefault();
      setT((cur) => ({ ...cur, cx: cur.cx + d[e.key][0], cy: cur.cy + d[e.key][1] }));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setT((cur) => zoomAt(cur, ZOOM_STEP, fc.x, fc.y));
    } else if (e.key === '-') {
      e.preventDefault();
      setT((cur) => zoomAt(cur, 1 / ZOOM_STEP, fc.x, fc.y));
    }
  };

  const confirm = () => {
    if (!image || !img.width) return;
    const placement = placementOf(img, frame, t);
    if (onConfirm) {
      const out = output ?? {
        width: Math.max(1, Math.round(frame.width / t.scale)),
        height: Math.max(1, Math.round(frame.height / t.scale)),
      };
      onConfirm(renderFrame(image, img, t, frame, out), placement);
    }
    onApply?.(placement);
    onOpenChange(false);
  };

  const outText = output
    ? `${output.width} × ${output.height} px`
    : `${Math.max(1, Math.round(frame.width / t.scale))} × ${Math.max(1, Math.round(frame.height / t.scale))} px`;
  /* 蓋滿模式的縮放（以蓋滿為 100%） */
  const base = img.width ? coverScale(img, frame.width, frame.height, t.turns) : 1;
  const zoomPct = Math.round((t.scale / base) * 100);
  const noteText =
    note ??
    (coverOn
      ? '拖曳圖片調整位置，用滾輪、滑桿或兩指縮放；圖片一定蓋滿框。'
      : '按「整張放入」時圖片不會被裁掉，多出來的地方會是透明的。');

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="lg"
      dismissOnOutside={false}
      footer={
        <>
          <DialogClose>取消</DialogClose>
          <Button variant="primary" onClick={confirm} disabled={!image}>
            套用
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div ref={setHost} className="relative w-full">
          <div
            role="application"
            aria-label="裁切檢視區：拖曳圖片移動，方向鍵移動，+／- 縮放"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: 檢視區可以用方向鍵移動圖片、+／- 縮放
            tabIndex={0}
            className="relative mx-auto touch-none overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus"
            style={{
              width: view.width,
              maxWidth: '100%',
              aspectRatio: `${view.width} / ${view.height}`,
            }}
            onPointerDown={(e) => onDown(e)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={onWheel}
            onKeyDown={onKey}
            data-testid="frame-view"
            data-placement={
              img.width
                ? (() => {
                    const p = placementOf(img, frame, t);
                    return `${p.zoom.toFixed(3)},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.turns}`;
                  })()
                : undefined
            }
          >
            <canvas ref={setCanvasEl} className="block size-full cursor-move" />
            {!aspect
              ? HANDLES.map((h) => {
                  const [ax, ay] = HANDLE_AT[h];
                  return (
                    <button
                      key={h}
                      type="button"
                      tabIndex={-1}
                      aria-label={`調整範圍（${h}）`}
                      data-frame-handle={h}
                      className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-sm border-2 border-accent bg-surface"
                      style={{
                        left: `${((frame.x + frame.width * ax) / view.width) * 100}%`,
                        top: `${((frame.y + frame.height * ay) / view.height) * 100}%`,
                      }}
                      onPointerDown={(e) => onDown(e, h)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={onUp}
                    />
                  );
                })
              : null}
          </div>
        </div>
        {coverOn ? (
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="shrink-0 text-sm text-fg">
              縮放
            </span>
            <Slider
              aria-label="縮放"
              value={Math.min(maxZoom * 100, Math.max(100, zoomPct))}
              min={100}
              max={Math.round(maxZoom * 100)}
              step={1}
              unit="%"
              onChange={(v) =>
                setT((cur) => {
                  const b = coverScale(img, frame.width, frame.height, cur.turns);
                  return zoomAt(cur, (b * v) / 100 / cur.scale, fc.x, fc.y);
                })
              }
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Button
            size="sm"
            icon={<Minus />}
            onClick={() => setT((c) => zoomAt(c, 1 / ZOOM_STEP, fc.x, fc.y))}
          >
            縮小
          </Button>
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => setT((c) => zoomAt(c, ZOOM_STEP, fc.x, fc.y))}
          >
            放大
          </Button>
          {coverOn ? null : (
            <Button
              size="sm"
              icon={<Maximize />}
              onClick={() => setT((c) => fitTransform(img, frame, 'contain', c.turns))}
            >
              整張放入
            </Button>
          )}
          <Button size="sm" icon={<RotateCw />} onClick={() => setT((c) => turnAt(c, fc.x, fc.y))}>
            旋轉 90°
          </Button>
          <Button size="sm" icon={<Undo2 />} onClick={() => reset()}>
            回到初始
          </Button>
        </div>
        <p className={cn('m-0 text-center text-xs text-muted')}>
          {noteText}（輸出 <span data-testid="frame-output">{outText}</span>）
        </p>
      </div>
    </Dialog>
  );
}
