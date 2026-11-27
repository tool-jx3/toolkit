/**
 * 畫圖的小工具：座標與線寬都是「格」（呼叫的人先把 canvas 縮放好）。
 * 填色傳 null 不填；線色沒給時用目前的墨色（`ink`）。
 */
import type { Palette } from './palette';

export type Ctx = CanvasRenderingContext2D;

export interface Kit {
  c: Ctx;
  p: Palette;
}

export function shape(
  k: Kit,
  build: () => void,
  fill: string | null,
  lw = 0.035,
  stroke: string | null = k.p.ink,
): void {
  const { c } = k;
  c.beginPath();
  build();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (lw > 0 && stroke) {
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.stroke();
  }
}

export function box(
  k: Kit,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null,
  lw = 0.035,
  stroke: string | null = k.p.ink,
  r = 0,
): void {
  shape(
    k,
    () => {
      if (r > 0) k.c.roundRect(x, y, w, h, r);
      else k.c.rect(x, y, w, h);
    },
    fill,
    lw,
    stroke,
  );
}

/** 折線或多邊形：pts＝[x0, y0, x1, y1, …] */
export function poly(
  k: Kit,
  pts: readonly number[],
  fill: string | null,
  lw = 0.035,
  stroke: string | null = k.p.ink,
  closed = true,
): void {
  shape(
    k,
    () => {
      k.c.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) k.c.lineTo(pts[i], pts[i + 1]);
      if (closed) k.c.closePath();
    },
    fill,
    lw,
    stroke,
  );
}

export function seg(
  k: Kit,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lw = 0.025,
  stroke: string = k.p.ink,
): void {
  shape(
    k,
    () => {
      k.c.moveTo(x1, y1);
      k.c.lineTo(x2, y2);
    },
    null,
    lw,
    stroke,
  );
}

export function dot(
  k: Kit,
  x: number,
  y: number,
  r: number,
  fill: string | null,
  lw = 0.025,
  stroke: string | null = k.p.ink,
): void {
  shape(k, () => k.c.arc(x, y, r, 0, Math.PI * 2), fill, lw, stroke);
}

export function oval(
  k: Kit,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | null,
  lw = 0.03,
  stroke: string | null = k.p.ink,
): void {
  shape(k, () => k.c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), fill, lw, stroke);
}

/** 暫時改透明度畫一段 */
export function faded(k: Kit, a: number, draw: () => void): void {
  const prev = k.c.globalAlpha;
  k.c.globalAlpha = prev * a;
  draw();
  k.c.globalAlpha = prev;
}

/** 決定論的亂數（mulberry32；同一個種子同樣的數列） */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
