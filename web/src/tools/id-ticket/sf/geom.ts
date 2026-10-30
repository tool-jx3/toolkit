/**
 * SF 證件的幾何小工具（座標是每一款自己的原生像素，例：公民 ID 1600 × 1010）：多邊形路徑、圓角矩形的多邊形、
 * 往內縮的多邊形（內框線）、斜的平行四邊形（斜線）、警示斜紋。
 * 參考 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/render.js 改寫。
 */
import type { Ctx } from '../kit';

export type Pt = readonly [number, number];
export type Poly = readonly Pt[];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一個封閉多邊形當作目前的路徑 */
export function polyPath(ctx: Ctx, pts: Poly, begin = true): void {
  if (begin) ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i) ctx.lineTo(pts[i][0], pts[i][1]);
    else ctx.moveTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
}

/** 卡片的外形（外框＋打穿的洞；用 evenodd 填滿／裁切，洞是透明的） */
export function cardPath(ctx: Ctx, outline: Poly, holes: readonly Poly[]): void {
  ctx.beginPath();
  for (const pts of [outline, ...holes]) polyPath(ctx, pts, false);
}

/** 圓角矩形的多邊形（順時針，每個角 8 段弧） */
export function roundRectPoly(x: number, y: number, w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -90],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, 90],
    [x + r, y + r, 180],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= 8; i++) {
      const a = ((a0 + (i * 90) / 8) * Math.PI) / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  return pts;
}

/** 多邊形往內縮 d（順時針、y 往下時 d 為正是往內）：每條邊沿法線平移、相鄰的邊求交點 */
export function inset(pts: Poly, d: number): Pt[] {
  const n = pts.length;
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    lines.push([x1 + nx * d, y1 + ny * d, x2 + nx * d, y2 + ny * d]);
  }
  return lines.map((b, i) => {
    const a = lines[(i + n - 1) % n];
    const d1x = a[2] - a[0];
    const d1y = a[3] - a[1];
    const d2x = b[2] - b[0];
    const d2y = b[3] - b[1];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return [b[0], b[1]] as Pt;
    const t = ((b[0] - a[0]) * d2y - (b[1] - a[1]) * d2x) / den;
    return [a[0] + d1x * t, a[1] + d1y * t] as Pt;
  });
}

/** 往右斜的平行四邊形（下緣 x～x＋w 在 yb，上緣往右偏 lean 在 yt），填滿 */
export function slant(ctx: Ctx, x: number, yt: number, yb: number, w: number, lean: number): void {
  ctx.beginPath();
  ctx.moveTo(x, yb);
  ctx.lineTo(x + w, yb);
  ctx.lineTo(x + w + lean, yt);
  ctx.lineTo(x + lean, yt);
  ctx.closePath();
  ctx.fill();
}

/** 直的一排警示斜紋（y0～y1；flip 時往另一邊斜） */
export function stripes(
  ctx: Ctx,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  color: string,
  flip: boolean,
): void {
  const t = 10;
  const rise = 12;
  const step = 24;
  ctx.fillStyle = color;
  for (let y = y0; y + rise + t <= y1; y += step) {
    const a = flip ? x1 : x0;
    const b = flip ? x0 : x1;
    ctx.beginPath();
    ctx.moveTo(a, y + rise);
    ctx.lineTo(b, y);
    ctx.lineTo(b, y + t);
    ctx.lineTo(a, y + rise + t);
    ctx.closePath();
    ctx.fill();
  }
}

/** 多邊形的外接矩形 */
export function bounds(pts: Poly): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
