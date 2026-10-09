/**
 * 家具畫法的小工具。每個家具在自己的座標系裡畫：(0, 0)～(w, h)，單位是格，背面（靠牆的那一邊）在上（y＝0）。
 * 呼叫前已設定好線寬 S.lw、線色 S.ink、圓角接頭。
 */
import { haloText } from '../labels';
import type { FurnPalette } from '../themes';

export type Ctx = CanvasRenderingContext2D;

export interface FurnStyle extends FurnPalette {
  /** 基本線寬（格） */
  lw: number;
  /** 牆的顏色（嵌在牆裡的東西用） */
  wall: string;
  font: string;
}

export interface DrawOptions {
  label?: string;
}

export type FurnDraw = (c: Ctx, S: FurnStyle, w: number, h: number, item: DrawOptions) => void;

export const TAU = Math.PI * 2;

/** 圓角矩形的路徑 */
export function rrect(c: Ctx, x: number, y: number, w: number, h: number, r = 0): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  if (!k) {
    c.rect(x, y, w, h);
    return;
  }
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

/** 目前的路徑填色（null＝不填）再描線 */
export function paint(c: Ctx, fill: string | null, stroke = true): void {
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) c.stroke();
}

/** 填色＋描線的矩形 */
export function block(
  c: Ctx,
  S: FurnStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 0,
  fill: string | null = S.paper,
): void {
  rrect(c, x, y, w, h, r);
  paint(c, fill);
}

export function seg(c: Ctx, x1: number, y1: number, x2: number, y2: number): void {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

/** 折線（closed 時封閉） */
export function poly(c: Ctx, pts: readonly (readonly [number, number])[], closed = true): void {
  c.beginPath();
  pts.forEach(([x, y], i) => {
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  });
  if (closed) c.closePath();
}

export function disc(
  c: Ctx,
  S: FurnStyle,
  x: number,
  y: number,
  r: number,
  fill: string | null = S.paper,
  stroke = true,
): void {
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, TAU);
  paint(c, fill, stroke);
}

export function oval(
  c: Ctx,
  S: FurnStyle,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | null = S.paper,
  stroke = true,
): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
  paint(c, fill, stroke);
}

/** 線寬：基本線寬 × k */
export function lw(c: Ctx, S: FurnStyle, k = 1): void {
  c.lineWidth = S.lw * k;
}

export function dash(c: Ctx, S: FurnStyle, on: boolean): void {
  c.setLineDash(on ? [S.lw * 2.6, S.lw * 2.2] : []);
}

/** 置中的粗體字 */
export function word(
  c: Ctx,
  S: FurnStyle,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string = S.ink,
): void {
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  haloText(c, text, x, y, { weight: 800, size, family: S.font }, color, null, 0);
  c.restore();
}

/** 由上往下看的椅子：椅背在上 */
export function chairTop(c: Ctx, S: FurnStyle, x: number, y: number, w: number, h: number): void {
  block(c, S, x + w * 0.12, y + h * 0.2, w * 0.76, h * 0.7, Math.min(w, h) * 0.16);
  lw(c, S, 0.6);
  block(c, S, x + w * 0.08, y, w * 0.84, h * 0.24, Math.min(w, h) * 0.1, S.tint);
  lw(c, S);
}

/** 沙發的座墊（n 個）＋椅背＋扶手；椅背在上 */
export function sofaShape(c: Ctx, S: FurnStyle, w: number, h: number, seats: number): void {
  const arm = Math.min(0.42, w * 0.12);
  const back = h * 0.3;
  block(c, S, 0, 0, w, h, 0.18, S.tint);
  const sw = (w - arm * 2) / seats;
  lw(c, S, 0.7);
  for (let i = 0; i < seats; i++)
    block(c, S, arm + sw * i + 0.03, back, sw - 0.06, h - back - 0.06, 0.12);
  lw(c, S);
}

/** 一束平行線（在 x0～x1 之間每隔 step 一條橫線） */
export function hatchRows(
  c: Ctx,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  step: number,
): void {
  c.beginPath();
  for (let y = y0 + step; y < y1 - 1e-6; y += step) {
    c.moveTo(x0, y);
    c.lineTo(x1, y);
  }
  c.stroke();
}

/** 決定論的亂數（同一個種子畫出同樣的圖） */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
