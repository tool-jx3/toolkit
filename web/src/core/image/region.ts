/**
 * 點一下選同色的範圍（立繪去背工具的「同色擦掉」「同色補回」）：以點到的像素在原圖上的顏色為準，
 * 選顏色差在容許度以內、而且目前「看得到」（遮罩 > 0）或「被去掉」（遮罩 < 255）的像素。
 * 純函式（主執行緒、Worker、Node 都能跑）。
 *
 * ```ts
 * const r = colorRegion(rgba, mask, w, h, { x, y, tolerance: 12, contiguous: true, target: 'visible' });
 * if (r.count) applyRegion(mask, r.region, 'erase');
 * ```
 *
 * - 顏色差同 colorkey 的 colorDistance（0～100，黑白的距離＝100）；差 ≤ 容許度才選。
 * - contiguous：只選和點到的像素相連的（四連通，只經過符合條件的像素）；否則整張圖符合條件的都選。
 * - 原圖完全透明的像素不選、也不能經過（那裡沒有東西可以顯示或去掉）。
 * - 點在圖外，或點到的像素本身不符合條件時，範圍是空的。
 */
import { COLOR_DISTANCE_MAX } from './colorkey';
import type { Rect } from './index';

export type RegionTarget = 'visible' | 'removed';

export interface ColorRegionOptions {
  /** 點的位置（像素座標；取所在的像素） */
  x: number;
  y: number;
  /** 容許度 0～100 */
  tolerance: number;
  /** 只選相連的（四連通） */
  contiguous: boolean;
  /** 'visible'：只選遮罩 > 0（同色擦掉）；'removed'：只選遮罩 < 255（同色補回） */
  target: RegionTarget;
}

export interface ColorRegion {
  /** 和遮罩一樣大，1＝選到 */
  region: Uint8Array<ArrayBuffer>;
  /** 選到幾個像素 */
  count: number;
  /** 選到的外框（沒有選到時 null） */
  bounds: Rect | null;
}

export function colorRegion(
  rgba: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array,
  width: number,
  height: number,
  { x, y, tolerance, contiguous, target }: ColorRegionOptions,
): ColorRegion {
  const n = width * height;
  const region = new Uint8Array(n);
  const empty: ColorRegion = { region, count: 0, bounds: null };
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return empty;
  const seed = py * width + px;
  const s = seed * 4;
  const cr = rgba[s];
  const cg = rgba[s + 1];
  const cb = rgba[s + 2];
  /* 比較平方距離，不必開根號 */
  const lim = (Math.max(0, tolerance) / 100) * COLOR_DISTANCE_MAX;
  const limSq = lim * lim;
  const visible = target === 'visible';
  const ok = (i: number): boolean => {
    const m = mask[i];
    if (visible ? m === 0 : m === 255) return false;
    const p = i * 4;
    if (rgba[p + 3] === 0) return false;
    const dr = rgba[p] - cr;
    const dg = rgba[p + 1] - cg;
    const db = rgba[p + 2] - cb;
    return dr * dr + dg * dg + db * db <= limSq;
  };
  if (!ok(seed)) return empty;

  let count = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  const take = (i: number) => {
    region[i] = 1;
    count++;
    const ix = i % width;
    const iy = (i - ix) / width;
    if (ix < x0) x0 = ix;
    if (ix > x1) x1 = ix;
    if (iy < y0) y0 = iy;
    if (iy > y1) y1 = iy;
  };

  if (contiguous) {
    /* 用陣列當堆疊（不遞迴），每個像素最多進一次 */
    const stack = new Int32Array(n);
    let top = 0;
    take(seed);
    stack[top++] = seed;
    while (top > 0) {
      const i = stack[--top];
      const ix = i % width;
      if (ix > 0 && !region[i - 1] && ok(i - 1)) {
        take(i - 1);
        stack[top++] = i - 1;
      }
      if (ix < width - 1 && !region[i + 1] && ok(i + 1)) {
        take(i + 1);
        stack[top++] = i + 1;
      }
      if (i >= width && !region[i - width] && ok(i - width)) {
        take(i - width);
        stack[top++] = i - width;
      }
      if (i + width < n && !region[i + width] && ok(i + width)) {
        take(i + width);
        stack[top++] = i + width;
      }
    }
  } else {
    for (let i = 0; i < n; i++) if (ok(i)) take(i);
  }
  return { region, count, bounds: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } };
}

/** 把範圍套到遮罩上（直接改 mask）：擦掉設成 0、補回設成 255 */
export function applyRegion(mask: Uint8Array, region: Uint8Array, mode: 'erase' | 'restore'): void {
  const v = mode === 'erase' ? 0 : 255;
  for (let i = 0; i < region.length; i++) if (region[i]) mask[i] = v;
}
