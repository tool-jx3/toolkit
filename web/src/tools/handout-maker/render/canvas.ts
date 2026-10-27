/**
 * 畫布的小工具：顏色、圓角路徑、文字（排好的行逐字畫、塗黑條）。
 * 座標一律是畫面 px（呼叫端已經 ctx.scale(倍率)）；陰影的模糊不受變換影響，要另外乘倍率。
 */
import { baselineIn, fontMetrics, fontString, measureWidth } from '@/core/scene';
import type { FlowRow } from '../layout';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** #rrggbb（或 #rrggbbaa）＋不透明度 → rgba() */
export function rgba(hex: string, alpha = 1): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16) || 0;
  const g = Number.parseInt(h.slice(2, 4), 16) || 0;
  const b = Number.parseInt(h.slice(4, 6), 16) || 0;
  const a = h.length >= 8 ? (Number.parseInt(h.slice(6, 8), 16) || 0) / 255 : 1;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * alpha * 1000) / 1000})`;
}

/** 顏色的亮度（0～1，Rec.709；深色背景時換淺色的圖示） */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => (Number.parseInt(h.slice(i, i + 2), 16) || 0) / 255);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** 圓角矩形的路徑（r 可以是 [左上, 右上, 右下, 左下]） */
export function roundRectPath(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | readonly [number, number, number, number],
): void {
  const [tl, tr, br, bl] = (typeof r === 'number' ? [r, r, r, r] : r).map((v) =>
    Math.max(0, Math.min(v, w / 2, h / 2)),
  );
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

export interface TextStyle {
  family: string;
  weight: number;
  size: number;
  /** 行高（字級的倍數） */
  lineHeight: number;
  letterSpacing?: number;
  color: string;
  /** 發光（文字陰影；blur 是畫面 px） */
  glow?: { color: string; blur: number };
}

export const fontOf = (s: Pick<TextStyle, 'family' | 'weight' | 'size'>): string =>
  fontString({ family: s.family, weight: s.weight, size: s.size });

/** 這個字型的量字函式（給 layout 用；有快取） */
export function measurer(ctx: Ctx, s: Pick<TextStyle, 'family' | 'weight' | 'size'>) {
  const font = fontOf(s);
  return (ch: string): number => measureWidth(ctx, font, ch);
}

/** 一行的高度 */
export const rowHeight = (s: Pick<TextStyle, 'size' | 'lineHeight'>): number =>
  s.size * s.lineHeight;

/**
 * 逐字畫排好的行（從 (x, y) 開始，一行 rowHeight）：先畫塗黑條（字身框高、圓角 2），再畫字。
 * 塗黑條的顏色＝文字顏色（同原作：文字與底同色）。scale 是畫布的倍率（陰影用）。
 */
export function drawRows(
  ctx: Ctx,
  rows: readonly FlowRow[],
  x: number,
  y: number,
  s: TextStyle,
  scale: number,
): void {
  const font = fontOf(s);
  const lh = rowHeight(s);
  const m = fontMetrics(ctx, font, s.size);
  ctx.save();
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = s.color;
  if (s.glow) {
    ctx.shadowColor = s.glow.color;
    ctx.shadowBlur = s.glow.blur * scale;
  }
  rows.forEach((row, i) => {
    const base = baselineIn(y + i * lh, lh, m);
    for (const b of row.bars) {
      ctx.beginPath();
      roundRectPath(ctx, x + b.x, base - m.ascent, b.w, m.ascent + m.descent, 2);
      ctx.fill();
    }
    for (const c of row.cells) {
      if (c.ch === ' ' || c.ch === '\t') continue;
      ctx.fillText(c.ch, x + c.x + c.padL, base);
    }
  });
  ctx.restore();
}

/** 單行文字：放不下時從尾端省略成「…」 */
export function ellipsize(ctx: Ctx, font: string, text: string, max: number): string {
  if (measureWidth(ctx, font, text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length && measureWidth(ctx, font, `${chars.join('')}…`) > max) chars.pop();
  return chars.length ? `${chars.join('')}…` : '';
}
