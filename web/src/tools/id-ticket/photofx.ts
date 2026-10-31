/**
 * 照片效果（SF 證件與既有的證件都能用）：單色化（門檻）、網點（halftone）、抖色（Floyd–Steinberg）。
 * 三種都把照片變成「墨色＋透明」：卡面的顏色從亮的地方透出來。
 * - 明暗（0～100，50＝不偏）：門檻往亮或暗偏（×3）；
 * - 網點大小（原生像素，4～24）：網點的格子（奇數列錯開半格），點的面積跟著暗的程度；
 * - 墨色比卡面亮（深色的卡）時明暗反過來，照片不會變成負片。
 * 演算法與數值照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/render.js（photoFx）。
 */
import { rgbOf } from './colors';
import type { Ctx } from './kit';

export const PHOTO_FX_IDS = ['none', 'mono', 'halftone', 'dither'] as const;
export type PhotoFxId = (typeof PHOTO_FX_IDS)[number];

export interface PhotoFx {
  fx: PhotoFxId;
  /** 明暗（0～100，50＝不偏） */
  level: number;
  /** 網點大小（原生像素） */
  dot: number;
}

export const PHOTO_FX_DEFAULT: PhotoFx = { fx: 'none', level: 50, dot: 10 };
export const PHOTO_LEVEL_RANGE = { min: 0, max: 100 } as const;
export const PHOTO_DOT_RANGE = { min: 4, max: 24 } as const;

const lumOf = (hex: string): number => {
  const [r, g, b] = rgbOf(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** 墨色比卡面亮（深色的卡）：明暗要反過來 */
export const inkIsLighter = (ink: string, card: string): boolean => lumOf(ink) > lumOf(card);

/** 每個像素的亮度（加上明暗的偏移；反過來時 255 − 亮度）與不透明度 */
export function photoLuma(
  data: Uint8ClampedArray,
  flip: boolean,
  level: number,
): { L: Float32Array; A: Uint8ClampedArray } {
  const bias = (level - 50) * 3;
  const n = data.length / 4;
  const L = new Float32Array(n);
  const A = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    L[i] = (flip ? 255 - v : v) + bias;
    A[i] = data[p + 3];
  }
  return { L, A };
}

/** 單色化：門檻 128，夾在照片亮度的第 2～98 百分位之間（極端的明暗也留得住最暗、最亮的細節） */
export function monoMask(L: Float32Array, A: Uint8ClampedArray): Uint8Array {
  const OFF = 150;
  const BINS = 256 + 2 * OFF;
  const hist = new Uint32Array(BINS);
  let total = 0;
  for (let i = 0; i < L.length; i++)
    if (A[i] > 127) {
      hist[Math.min(BINS - 1, Math.max(0, Math.floor(L[i]) + OFF))]++;
      total++;
    }
  const pct = (q: number) => {
    let acc = 0;
    for (let v = 0; v < BINS; v++) {
      acc += hist[v];
      if (acc >= total * q) return v - OFF;
    }
    return BINS - 1 - OFF;
  };
  const t = Math.min(Math.max(128, pct(0.02) + 1), pct(0.98));
  const on = new Uint8Array(L.length);
  for (let i = 0; i < L.length; i++) on[i] = A[i] > 127 && L[i] < t ? 1 : 0;
  return on;
}

/** 抖色：Floyd–Steinberg 誤差擴散（門檻 128；會改 L） */
export function ditherMask(
  L: Float32Array,
  A: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8Array {
  const on = new Uint8Array(L.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = L[i];
      const q = v < 128 ? 0 : 255;
      const e = v - q;
      on[i] = A[i] > 127 && q === 0 ? 1 : 0;
      if (x + 1 < w) L[i + 1] += (e * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) L[i + w - 1] += (e * 3) / 16;
        L[i + w] += (e * 5) / 16;
        if (x + 1 < w) L[i + w + 1] += e / 16;
      }
    }
  return on;
}

export interface Dot {
  x: number;
  y: number;
  r: number;
}

/** 網點：每格一個墨點（奇數列錯開半格），面積跟著這一格的暗（每 2 px 取樣） */
export function halftoneDots(
  L: Float32Array,
  A: Uint8ClampedArray,
  w: number,
  h: number,
  cell: number,
): Dot[] {
  const dots: Dot[] = [];
  const rows = Math.ceil(h / cell) + 1;
  for (let row = 0; row < rows; row++) {
    const cy = row * cell;
    const off = row % 2 ? cell / 2 : 0;
    for (let cx = off; cx < w + cell; cx += cell) {
      let sum = 0;
      let alpha = 0;
      let cnt = 0;
      const x0 = Math.max(0, Math.floor(cx - cell / 2));
      const x1 = Math.min(w, Math.ceil(cx + cell / 2));
      const y0 = Math.max(0, Math.floor(cy - cell / 2));
      const y1 = Math.min(h, Math.ceil(cy + cell / 2));
      for (let yy = y0; yy < y1; yy += 2)
        for (let xx = x0; xx < x1; xx += 2) {
          const i = yy * w + xx;
          sum += L[i];
          alpha += A[i];
          cnt++;
        }
      if (!cnt || alpha / cnt < 128) continue;
      const dark = 1 - Math.min(255, Math.max(0, sum / cnt)) / 255;
      const r = (cell / 2) * Math.sqrt(dark) * 1.25;
      if (r < 0.6) continue;
      dots.push({ x: cx, y: cy, r });
    }
  }
  return dots;
}

/** 0／1 的遮罩 → 墨色＋透明的像素 */
export function maskToPixels(on: Uint8Array, ink: string, out: Uint8ClampedArray): void {
  const [r, g, b] = rgbOf(ink);
  out.fill(0);
  for (let i = 0, p = 0; i < on.length; i++, p += 4) {
    if (!on[i]) continue;
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = 255;
  }
}

/**
 * 把畫布上的照片（已經畫成框的大小）換成照片效果：ink 墨色、card 卡面（決定要不要反過來）、
 * k＝原生像素 → 畫布像素（網點的格子跟著放大）。
 */
export function applyPhotoFx(
  ctx: Ctx,
  w: number,
  h: number,
  fx: PhotoFx,
  ink: string,
  card: string,
  k: number,
): void {
  if (fx.fx === 'none' || w < 1 || h < 1) return;
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const { L, A } = photoLuma(img.data, inkIsLighter(ink, card), fx.level);
  if (fx.fx === 'mono' || fx.fx === 'dither') {
    const on = fx.fx === 'mono' ? monoMask(L, A) : ditherMask(L, A, w, h);
    maskToPixels(on, ink, img.data);
    ctx.putImageData(img, 0, 0);
    return;
  }
  const dots = halftoneDots(L, A, w, h, Math.max(3, fx.dot * k));
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = ink;
  for (const d of dots) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function normalizePhotoFx(raw: unknown): PhotoFx {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : d;
  return {
    fx: (PHOTO_FX_IDS as readonly string[]).includes(o.fx as string)
      ? (o.fx as PhotoFxId)
      : PHOTO_FX_DEFAULT.fx,
    level: n(o.level, PHOTO_FX_DEFAULT.level, PHOTO_LEVEL_RANGE.min, PHOTO_LEVEL_RANGE.max),
    dot: n(o.dot, PHOTO_FX_DEFAULT.dot, PHOTO_DOT_RANGE.min, PHOTO_DOT_RANGE.max),
  };
}
