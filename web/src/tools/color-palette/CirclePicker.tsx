/**
 * 圓形頭像上的滴管（規格 1.1 F45、F48）：頭像依範圍畫在圓裡，在圓裡點一下或拖曳就取那一點的顏色——
 * 直接取**原圖**的像素（3 × 3 的平均，透明度 200 以上的才算；看起來很小也不會混色）；
 * 滑鼠停在圓裡時旁邊出現放大鏡（原圖約頭像直徑 1/8 的範圍，至少 9 px，中間框出取色的 3 × 3）。
 */
import { type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type FramePlacement, getImageData, placedCrop, placedPointToImage } from '@/core/image';
import { sampleAverage } from './characters';

const LOUPE = 120;
/** 頭像的框（以 1 為邊長；位置的換算用） */
const UNIT = { x: 0, y: 0, width: 1, height: 1 };

export interface CirclePickerProps {
  bitmap: ImageBitmap | null;
  size: { width: number; height: number } | null;
  placement: FramePlacement;
  /** 圓的直徑（CSS px） */
  diameter: number;
  /** 有要放顏色的格子嗎（沒有時點了呼叫 onNoTarget） */
  canPick: boolean;
  onNoTarget?: () => void;
  onPickStart?: () => void;
  onPick: (hex: string) => void;
  onPickEnd?: () => void;
  label: string;
  /** 沒有圖片時圓裡顯示的東西 */
  empty?: ReactNode;
}

export function CirclePicker({
  bitmap,
  size,
  placement,
  diameter,
  canPick,
  onNoTarget,
  onPickStart,
  onPick,
  onPickEnd,
  label,
  empty,
}: CirclePickerProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const loupeCanvas = useRef<HTMLCanvasElement>(null);
  const [loupe, setLoupe] = useState<{ x: number; y: number; hex: string | null } | null>(null);
  const picking = useRef<number | null>(null);
  const pixels = useMemo(() => (bitmap ? getImageData(bitmap) : null), [bitmap]);

  /* 畫頭像 */
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(diameter * dpr);
    el.width = px;
    el.height = px;
    ctx.clearRect(0, 0, px, px);
    if (!bitmap || !size) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    ctx.clip();
    const c = placedCrop(size, { width: 1, height: 1 }, placement);
    /* 原圖的像素比畫面上的大（放大很多）時不要平滑，看得出一格一格、好對準 */
    ctx.imageSmoothingEnabled = px / c.width < 1.5;
    ctx.imageSmoothingQuality = 'high';
    if (c.turns === 0) ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, 0, 0, px, px);
    else {
      ctx.translate(px / 2, px / 2);
      ctx.rotate((c.turns * Math.PI) / 2);
      ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, -px / 2, -px / 2, px, px);
    }
    ctx.restore();
  }, [bitmap, size, placement, diameter]);

  /* 放大鏡 */
  useEffect(() => {
    const el = loupeCanvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !loupe || !bitmap || !size) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.round(LOUPE * dpr);
    el.width = S;
    el.height = S;
    const src = placedPointToImage(size, UNIT, placement, loupe.x / diameter, loupe.y / diameter);
    const crop = placedCrop(size, { width: 1, height: 1 }, placement);
    const span = Math.max(9, Math.round(crop.width / 8));
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = false;
    const sx = Math.floor(src.x) - Math.floor(span / 2);
    const sy = Math.floor(src.y) - Math.floor(span / 2);
    ctx.drawImage(bitmap, sx, sy, span, span, 0, 0, S, S);
    const cell = S / span;
    const c0 = (Math.floor(src.x) - 1 - sx) * cell;
    const r0 = (Math.floor(src.y) - 1 - sy) * cell;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeRect(c0, r0, cell * 3, cell * 3);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(c0, r0, cell * 3, cell * 3);
    ctx.restore();
  }, [loupe, bitmap, size, placement, diameter]);

  const local = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * diameter;
    const y = ((e.clientY - r.top) / r.height) * diameter;
    const inside = (x - diameter / 2) ** 2 + (y - diameter / 2) ** 2 <= (diameter / 2) ** 2;
    return { x, y, inside };
  };
  const sampleAt = (x: number, y: number): string | null => {
    if (!pixels || !size) return null;
    const p = placedPointToImage(size, UNIT, placement, x / diameter, y / diameter);
    return sampleAverage(pixels, p.x, p.y);
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !bitmap) return;
    const p = local(e);
    if (!p.inside) return;
    if (!canPick) {
      onNoTarget?.();
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    picking.current = e.pointerId;
    onPickStart?.();
    const hex = sampleAt(p.x, p.y);
    if (hex) onPick(hex);
    setLoupe({ x: p.x, y: p.y, hex });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!bitmap) return;
    const p = local(e);
    const hex = p.inside ? sampleAt(p.x, p.y) : null;
    if (picking.current === e.pointerId) {
      if (p.inside && hex) onPick(hex);
      setLoupe({
        x: Math.max(0, Math.min(diameter, p.x)),
        y: Math.max(0, Math.min(diameter, p.y)),
        hex,
      });
      return;
    }
    if (p.inside && e.pointerType !== 'touch') setLoupe({ x: p.x, y: p.y, hex });
    else setLoupe(null);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (picking.current !== e.pointerId) return;
    picking.current = null;
    setLoupe(null);
    onPickEnd?.();
  };

  const above = loupe ? loupe.y - LOUPE - 18 > -40 : true;
  return (
    <div
      className="relative mx-auto shrink-0 touch-none select-none rounded-full border border-border-strong bg-surface-3"
      style={{ width: diameter, height: diameter, cursor: bitmap ? 'crosshair' : 'default' }}
      role="img"
      aria-label={label}
      data-testid="circle-picker"
      data-hover={loupe?.hex ?? undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => {
        if (picking.current == null) setLoupe(null);
      }}
    >
      <canvas ref={canvas} className="block size-full rounded-full" />
      {!bitmap && empty ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted">
          {empty}
        </div>
      ) : null}
      {loupe ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 rounded-full shadow-2"
          style={{
            width: LOUPE,
            height: LOUPE,
            left: loupe.x - LOUPE / 2,
            top: above ? loupe.y - LOUPE - 18 : loupe.y + 18,
            border: `4px solid ${loupe.hex ?? 'transparent'}`,
            background: '#ffffff',
          }}
        >
          <canvas ref={loupeCanvas} className="block size-full rounded-full" />
        </div>
      ) : null}
    </div>
  );
}
