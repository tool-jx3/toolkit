/**
 * 圓形頭像上的滴管（規格 1.1 F47）：頭像依範圍畫在圓裡，在圓裡點一下或拖曳就取那一點的顏色——
 * 直接取**原圖**的像素（3 × 3 的平均，透明度 200 以上的才算；看起來很小也不會混色）。
 * 滑鼠停在圓裡（或拖曳取色）時，游標旁邊出現本站的「像素格」放大鏡：原圖 11 × 11 個像素一格一格畫出來
 * （方向和頭像相同），中間框出取色的 3 × 3，下面寫這一點的色碼。
 */
import { type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type FramePlacement, getImageData, placedCrop, placedPointToImage } from '@/core/image';
import { sampleAverage } from './characters';

/** 放大鏡：幾個像素見方、每格幾 px、離游標多遠 */
const GRID = 11;
const CELL = 10;
const LOUPE = GRID * CELL;
const OFFSET = 22;
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
    /* 原圖的一個像素在畫面上有 2 px 以上時不要平滑：看得出一格一格、好對準 */
    ctx.imageSmoothingEnabled = px / c.width < 2;
    ctx.imageSmoothingQuality = 'high';
    if (c.turns === 0) ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, 0, 0, px, px);
    else {
      ctx.translate(px / 2, px / 2);
      ctx.rotate((c.turns * Math.PI) / 2);
      ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, -px / 2, -px / 2, px, px);
    }
    ctx.restore();
  }, [bitmap, size, placement, diameter]);

  /* 放大鏡：原圖的像素一格一格畫（畫面上往右、往下的一格對到原圖的哪個方向，依頭像範圍的旋轉換算） */
  useEffect(() => {
    const el = loupeCanvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !loupe || !pixels || !size) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = Math.round(LOUPE * dpr);
    el.width = S;
    el.height = S;
    const at = (x: number, y: number) =>
      placedPointToImage(size, UNIT, placement, x / diameter, y / diameter);
    const o = at(loupe.x, loupe.y);
    const step = 0.25;
    const ax = at(loupe.x + step, loupe.y);
    const ay = at(loupe.x, loupe.y + step);
    const unit = (dx: number, dy: number): [number, number] =>
      Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    const ex = unit(ax.x - o.x, ax.y - o.y);
    const ey = unit(ay.x - o.x, ay.y - o.y);
    const cx = Math.floor(o.x);
    const cy = Math.floor(o.y);
    const half = (GRID - 1) / 2;
    const cell = S / GRID;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const dx = i - half;
        const dy = j - half;
        const sx = cx + dx * ex[0] + dy * ey[0];
        const sy = cy + dx * ex[1] + dy * ey[1];
        if (sx < 0 || sy < 0 || sx >= pixels.width || sy >= pixels.height) continue;
        const k = (sy * pixels.width + sx) * 4;
        const a = pixels.data[k + 3] / 255;
        ctx.fillStyle = `rgba(${pixels.data[k]},${pixels.data[k + 1]},${pixels.data[k + 2]},${a})`;
        ctx.fillRect(Math.round(i * cell), Math.round(j * cell), Math.ceil(cell), Math.ceil(cell));
      }
    /* 取色的 3 × 3：深色描邊外加白線，深淺圖上都看得到 */
    const box = (half - 1) * cell;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeRect(box, box, cell * 3, cell * 3);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.25 * dpr;
    ctx.strokeRect(box, box, cell * 3, cell * 3);
  }, [loupe, pixels, size, placement, diameter]);

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

  /* 放在游標右邊（右邊放不下時左邊），上下對齊游標 */
  const toRight = loupe ? loupe.x + OFFSET + LOUPE <= diameter + 80 : true;
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
          className="pointer-events-none absolute z-10 flex flex-col items-center gap-1"
          style={{
            left: toRight ? loupe.x + OFFSET : loupe.x - OFFSET - LOUPE,
            top: loupe.y - LOUPE / 2,
            width: LOUPE,
          }}
          data-testid="loupe"
        >
          <canvas
            ref={loupeCanvas}
            className="block rounded-md border border-border-strong shadow-2"
            style={{ width: LOUPE, height: LOUPE }}
          />
          <span
            className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-xs text-fg tabular-nums shadow-1"
            data-testid="loupe-hex"
          >
            <span
              className="block size-3 rounded-full border border-black/15"
              style={{ background: loupe.hex ?? 'transparent' }}
            />
            {loupe.hex ? loupe.hex.toUpperCase() : '—'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
