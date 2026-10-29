/**
 * 自訂外框與自訂遮罩：
 * - 外框的開口半徑自動偵測（Sectr99/TokenForge 的做法，MIT）：縮到 512 × 512，從中心往 72 個方向找第一個不透明度 > 128 的點，
 *   取第 90 百分位的距離＋4 px；中心本身不透明、或找到的方向少於一半時當成 200 ÷ 256。
 * - 自訂遮罩（eidolon-ui）：灰階圖的亮度 × 不透明度當開口（白＝留下、黑＝切掉）。
 */
import { makeCanvas } from '@/core/image';
import type { Drawable } from './render';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const SIZE = 512;

/** 開口半徑（外半徑的比例，0～1）：alpha 是 512 × 512 的不透明度（index＝y × 512＋x） */
export function detectInnerFromAlpha(alpha: (x: number, y: number) => number): number {
  const half = SIZE / 2;
  const at = (x: number, y: number) =>
    alpha(Math.min(SIZE - 1, Math.round(x)), Math.min(SIZE - 1, Math.round(y)));
  if (at(half, half) > 128) return 200 / 256;
  const hits: number[] = [];
  for (let i = 0; i < 72; i++) {
    const t = (i * Math.PI) / 36;
    for (let r = 1; r < half; r++) {
      if (at(half + r * Math.cos(t), half + r * Math.sin(t)) > 128) {
        hits.push(r);
        break;
      }
    }
  }
  if (hits.length < 36) return 200 / 256;
  hits.sort((a, b) => a - b);
  return Math.min(256, hits[Math.floor(hits.length * 0.9)] + 4) / 256;
}

/** 外框圖 → 開口半徑的比例 */
export function detectInner(img: Drawable): number {
  const c = makeCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const a = ctx.getImageData(0, 0, SIZE, SIZE).data;
  return detectInnerFromAlpha((x, y) => a[(y * SIZE + x) * 4 + 3]);
}

/** 灰階遮罩圖 → 不透明度＝亮度 × 不透明度 ÷ 255 的畫布（512 × 512，畫的時候拉伸到外框的範圍） */
export function grayMaskCanvas(img: Drawable): AnyCanvas {
  const c = makeCanvas(SIZE, SIZE);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const d = ctx.getImageData(0, 0, SIZE, SIZE);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) * (p[i + 3] / 255);
    p[i] = p[i + 1] = p[i + 2] = 0;
    p[i + 3] = l;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}
