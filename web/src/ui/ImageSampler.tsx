/**
 * 圖片取色區（放在 Dialog 裡就是取色視窗）：圖片可以縮放、捲動；
 * - mode 'points'：點圖取色（依點選順序，最多 maxPoints 個；取該原圖像素的 RGB，完全透明是黑色），
 *   取色點是填著該色的圓點，可以拖動微調（拖出圖片時夾在邊緣），聚焦時方向鍵移動 1 px（Shift 10）；
 * - mode 'splits'：水平分割線（0～1 的比例），可以上下拖動（不越過相鄰的線、至少相隔 minGap、不出圖），
 *   聚焦時 ↑／↓ 移動 1%（Shift 5%）；
 * - 縮放：滑桿（預設 20%～500%，每 10%），或在圖片上按住 Ctrl／⌘ 滾動滾輪；取色位置一律以原圖像素計。
 *
 * ```tsx
 * <Dialog title="從圖片取色" size="xl" open={open} onOpenChange={setOpen} footer={…}>
 *   <ImageSampler image={bmp} mode="points" points={points} onPointsChange={setPoints} maxPoints={count}
 *     zoom={zoom} onZoomChange={setZoom} />
 * </Dialog>
 * ```
 */
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { getImageData, moveSplit, type PixelBuffer, samplePixel } from '@/core/image';
import { cn } from './cn';
import { Field } from './Field';
import { Slider } from './Slider';

export interface SamplePoint {
  /** 原圖像素座標 */
  x: number;
  y: number;
  /** #rrggbb */
  color: string;
}

export interface ImageSamplerProps {
  image: ImageBitmap | HTMLCanvasElement | null;
  mode: 'points' | 'splits' | 'none';
  points?: readonly SamplePoint[];
  onPointsChange?: (points: SamplePoint[]) => void;
  /** 最多幾個取色點（點滿後再點不會再取） */
  maxPoints?: number;
  /** 分割線（0～1，由小到大） */
  splits?: readonly number[];
  onSplitsChange?: (splits: number[]) => void;
  /** 分割線之間的最小間距（比例，預設 0.02） */
  minGap?: number;
  /** 倍率（1 ＝ 100%） */
  zoom: number;
  onZoomChange: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  /** 顯示縮放滑桿（預設 true） */
  showZoom?: boolean;
  /** Ctrl＋滾輪每 100 px 滾動量增減的倍率（預設 0.5 ＝ 50 個百分點） */
  wheelZoomPer100?: number;
  /** 沒有圖片時顯示 */
  empty?: ReactNode;
  /** 圖片區的 class（例如高度） */
  viewportClassName?: string;
  className?: string;
}

export function ImageSampler({
  image,
  mode,
  points = [],
  onPointsChange,
  maxPoints = Number.POSITIVE_INFINITY,
  splits = [],
  onSplitsChange,
  minGap = 0.02,
  zoom,
  onZoomChange,
  minZoom = 0.2,
  maxZoom = 5,
  showZoom = true,
  wheelZoomPer100 = 0.5,
  empty = '尚未選擇圖片。',
  viewportClassName,
  className,
}: ImageSamplerProps) {
  const pixels = useMemo<PixelBuffer | null>(() => {
    if (!image) return null;
    try {
      return getImageData(image);
    } catch {
      return null;
    }
  }, [image]);
  const w = image?.width ?? 0;
  const h = image?.height ?? 0;
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const clampZoom = (z: number) => Math.min(maxZoom, Math.max(minZoom, Math.round(z * 100) / 100));

  useEffect(() => {
    const c = canvas.current;
    if (!c || !image) return;
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    ctx?.clearRect(0, 0, c.width, c.height);
    ctx?.drawImage(image, 0, 0);
  }, [image]);

  /* Ctrl／⌘＋滾輪縮放 */
  const zoomRef = useRef({ zoom, onZoomChange, clampZoom, wheelZoomPer100 });
  zoomRef.current = { zoom, onZoomChange, clampZoom, wheelZoomPer100 };
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = zoomRef.current;
      r.onZoomChange(r.clampZoom(r.zoom - (e.deltaY / 100) * r.wheelZoomPer100));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** 螢幕座標 → 原圖像素（夾在圖內） */
  const toImage = (cx: number, cy: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return { x: 0, y: 0 };
    return {
      x: Math.min(w - 1, Math.max(0, Math.floor(((cx - r.left) / r.width) * w))),
      y: Math.min(h - 1, Math.max(0, Math.floor(((cy - r.top) / r.height) * h))),
    };
  };
  const sample = (x: number, y: number) => (pixels ? samplePixel(pixels, x, y) : '#000000');

  const drag = useRef<{ kind: 'point' | 'split'; index: number; id: number } | null>(null);

  const onImageDown = (e: PointerEvent<HTMLDivElement>) => {
    if (mode !== 'points' || e.button !== 0 || !pixels) return;
    if (points.length >= maxPoints) return;
    const p = toImage(e.clientX, e.clientY);
    onPointsChange?.([...points, { ...p, color: sample(p.x, p.y) }]);
  };
  const startDrag = (e: PointerEvent<HTMLElement>, kind: 'point' | 'split', index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { kind, index, id: e.pointerId };
  };
  const onDragMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.kind === 'point') {
      const p = toImage(e.clientX, e.clientY);
      onPointsChange?.(
        points.map((pt, i) => (i === d.index ? { ...p, color: sample(p.x, p.y) } : pt)),
      );
    } else {
      const r = box.current?.getBoundingClientRect();
      if (!r?.height) return;
      onSplitsChange?.(moveSplit(splits, d.index, (e.clientY - r.top) / r.height, minGap));
    }
  };
  const endDrag = (e: PointerEvent<HTMLElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const pointKey = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const step = e.shiftKey ? 10 : 1;
    const pt = points[i];
    let { x, y } = pt;
    if (e.key === 'ArrowLeft') x -= step;
    else if (e.key === 'ArrowRight') x += step;
    else if (e.key === 'ArrowUp') y -= step;
    else if (e.key === 'ArrowDown') y += step;
    else return;
    e.preventDefault();
    x = Math.min(w - 1, Math.max(0, x));
    y = Math.min(h - 1, Math.max(0, y));
    onPointsChange?.(points.map((p, k) => (k === i ? { x, y, color: sample(x, y) } : p)));
  };
  const splitKey = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!d) return;
    e.preventDefault();
    onSplitsChange?.(moveSplit(splits, i, splits[i] + d, minGap));
  };

  const dot = 16;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {showZoom ? (
        <Field label="縮放" layout="inline">
          <Slider
            value={Math.round(zoom * 100)}
            onChange={(v) => onZoomChange(clampZoom(v / 100))}
            min={Math.round(minZoom * 100)}
            max={Math.round(maxZoom * 100)}
            step={10}
            unit="%"
            disabled={!image}
          />
        </Field>
      ) : null}
      <div
        ref={area}
        className={cn(
          'checker relative h-[min(55dvh,520px)] min-h-48 overflow-auto rounded-md border border-border',
          viewportClassName,
        )}
        data-testid="image-sampler"
      >
        {image ? (
          <div
            ref={box}
            className={cn(
              'relative m-auto',
              mode === 'points' && points.length < maxPoints && 'cursor-crosshair',
            )}
            style={{ width: w * zoom, height: h * zoom }}
            onPointerDown={onImageDown}
          >
            <canvas ref={canvas} className="block size-full" aria-hidden />
            {mode === 'splits'
              ? splits.map((f, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: 分割線依序排列，索引就是身分
                    key={i}
                    role="slider"
                    tabIndex={0}
                    aria-label={`分割線 ${i + 1}`}
                    aria-orientation="vertical"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(f * 1000) / 10}
                    aria-valuetext={`${(f * 100).toFixed(1)}%`}
                    data-split={i}
                    onPointerDown={(e) => startDrag(e, 'split', i)}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => splitKey(e, i)}
                    className="group absolute inset-x-0 -mt-1.5 flex h-3 cursor-ns-resize touch-none items-center outline-none"
                    style={{ top: `${f * 100}%` }}
                  >
                    <div className="h-0.5 w-full bg-danger shadow-1 transition-[height] group-hover:h-1 group-focus-visible:h-1 group-active:h-1" />
                  </div>
                ))
              : null}
            {mode === 'points'
              ? points.map((p, i) => (
                  <button
                    // biome-ignore lint/suspicious/noArrayIndexKey: 取色點依點選順序排列，索引就是身分
                    key={i}
                    type="button"
                    aria-label={`取色點 ${i + 1}：${p.color}`}
                    data-point={i}
                    onPointerDown={(e) => startDrag(e, 'point', i)}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => pointKey(e, i)}
                    className="absolute flex cursor-grab touch-none items-center justify-center rounded-full border-2 border-white text-[10px] font-bold shadow-2 outline-none ring-1 ring-black/60 focus-visible:ring-2 focus-visible:ring-focus"
                    style={{
                      left: (p.x + 0.5) * zoom - dot / 2,
                      top: (p.y + 0.5) * zoom - dot / 2,
                      width: dot,
                      height: dot,
                      background: p.color,
                    }}
                  />
                ))
              : null}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center bg-surface-2 p-4 text-center text-sm text-muted">
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}
