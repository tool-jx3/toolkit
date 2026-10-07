/**
 * 純色背景去除（色鍵）：依背景色與容許度算出遮罩，不需要 AI 模型。立繪委託常見的白底、單色底用。
 * 純函式（主執行緒、Worker、Node 都能跑）。
 *
 * ```ts
 * const bg = estimateBackground(rgba, w, h);              // 從四邊找最多的顏色
 * const mask = colorKeyMask(rgba, w, h, { color: bg.color, tolerance: 12, softness: 8, connected: true });
 * const clean = decontaminate(rgba, mask, bg.color);      // 去色邊
 * ```
 *
 * - 顏色差：RGB 歐氏距離換成 0～100（黑與白的距離＝100）。
 * - 差 ≤ 容許度：背景（0）；差 ≥ 容許度＋柔邊：留下（255）；中間依比例（線性）半透明。
 * - connected（預設）：只去掉「從圖的四邊連過來」的背景（四連通，經過差 < 容許度＋柔邊的像素）；
 *   角色身上和背景同色的地方（白衣服、眼白）只要沒有和外面相連就留著。關掉時整張圖同色的都去掉。
 * - 原圖完全透明的像素一律當成背景（可以通過）。
 */
import type { Rgb } from './filters';

export interface ColorKeyOptions {
  /** 背景色 */
  color: Rgb;
  /** 容許度 0～100 */
  tolerance: number;
  /** 柔邊 0～100：容許度之外再多這麼多的範圍逐漸變不透明 */
  softness: number;
  /** 只去掉和圖邊相連的背景（預設 true） */
  connected?: boolean;
}

/** 0～100 的顏色差（黑白的距離＝100） */
export const COLOR_DISTANCE_MAX = 255 * Math.sqrt(3);

export function colorDistance(r: number, g: number, b: number, c: Rgb): number {
  const dr = r - c[0];
  const dg = g - c[1];
  const db = b - c[2];
  return (Math.sqrt(dr * dr + dg * dg + db * db) / COLOR_DISTANCE_MAX) * 100;
}

/** 差 d 時的不透明度（0～255） */
export function keyAlpha(d: number, tolerance: number, softness: number): number {
  if (d <= tolerance) return 0;
  if (softness <= 0 || d >= tolerance + softness) return 255;
  return Math.round(((d - tolerance) / softness) * 255);
}

/** 依背景色算遮罩（255＝留下） */
export function colorKeyMask(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  { color, tolerance, softness, connected = true }: ColorKeyOptions,
): Uint8Array<ArrayBuffer> {
  const n = width * height;
  const tol = Math.max(0, tolerance);
  const soft = Math.max(0, softness);
  /* 每個像素的「背景程度」：0＝背景、255＝不像背景；原圖透明的像素是背景 */
  const key = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    key[i] =
      rgba[p + 3] === 0
        ? 0
        : keyAlpha(colorDistance(rgba[p], rgba[p + 1], rgba[p + 2], color), tol, soft);
  }
  if (!connected) return key;
  /* 從四邊往內找連在一起的背景（差 < 容許度＋柔邊，或透明）；沒連到的一律留下 */
  const out = new Uint8Array(n).fill(255);
  const passable = (i: number) => key[i] < 255;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (i: number) => {
    if (seen[i] || !passable(i)) return;
    seen[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    out[i] = key[i];
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i + width < n) push(i + width);
  }
  return out;
}

export interface BackgroundEstimate {
  /** 背景色（該組顏色的平均） */
  color: [number, number, number];
  /** 四邊有多少比例是這個顏色（0～1）；太低時大概不是純色背景 */
  ratio: number;
}

/**
 * 從圖的四邊（最外圈 border px）找最多的顏色：RGB 各切 16 格（每格 16）統計，取最多的一格（同數量取先達到的），
 * 回傳這一格裡像素的平均色。完全透明的像素不算。沒有可算的像素時是白色、比例 0。
 */
export function estimateBackground(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  border = 2,
): BackgroundEstimate {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  let best: { n: number; r: number; g: number; b: number } | null = null;
  let total = 0;
  const bw = Math.min(border, Math.ceil(width / 2));
  const bh = Math.min(border, Math.ceil(height / 2));
  const visit = (x: number, y: number) => {
    const p = (y * width + x) * 4;
    if (rgba[p + 3] === 0) return;
    total++;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let e = counts.get(k);
    if (!e) {
      e = { n: 0, r: 0, g: 0, b: 0 };
      counts.set(k, e);
    }
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    if (!best || e.n > best.n) best = e;
  };
  for (let y = 0; y < height; y++) {
    const edgeRow = y < bh || y >= height - bh;
    for (let x = 0; x < width; x++) {
      if (edgeRow || x < bw || x >= width - bw) visit(x, y);
    }
  }
  const b = best as { n: number; r: number; g: number; b: number } | null;
  if (!b || !total) return { color: [255, 255, 255], ratio: 0 };
  return {
    color: [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)],
    ratio: b.n / total,
  };
}

/**
 * 去色邊：半透明的像素（0 < 遮罩 < 255）把混進去的背景色扣掉——
 * 看到的顏色 C ＝ a × F ＋（1 − a）× B，還原 F ＝（C −（1 − a）× B）÷ a（夾在 0～255，四捨五入）。
 * 回傳新的 RGBA（透明度不變；遮罩 0 或 255 的像素原樣）。
 */
export function decontaminate(
  rgba: Uint8Array | Uint8ClampedArray,
  mask: Uint8Array,
  bg: Rgb,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const m = mask[i];
    if (m === 0 || m === 255) continue;
    const a = m / 255;
    const k = 1 - a;
    for (let c = 0; c < 3; c++) {
      const v = (rgba[p + c] - k * bg[c]) / a;
      out[p + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}
