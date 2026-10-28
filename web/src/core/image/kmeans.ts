/**
 * k-means 取主要的 N 色（color-palette 的配色卡新增，2026-10；做法參考 dearmysn1p3r/Colorpalettecard_Maker
 * 的功能與數值：透明度 128 以上的像素才算、RGB 距離的權重 0.9／1.2／0.7、最多 14 輪、占比不到 0.4% 的顏色不要、
 * 結果由暗到亮排列；代表色的分數。程式是本站自己寫的）。
 *
 * 和原作不同：起點用 k-means++，但亂數是**固定種子**；而且用 4 組種子各分一次、取誤差（加權距離平方和）最小的那一次
 * ——同一張圖、同樣的 N 一定得到同樣的結果，也比較不會卡在把小塊顏色併掉的分法。圖裡的顏色比 N 少時不硬湊重複的顏色；
 * 沒分到像素的中心移到最遠的像素（不靠亂數）。
 *
 * ```ts
 * const px = regionPixels(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height }); // 縮到長邊 150 px
 * const colors = kmeansPalette(px, 5);      // [{ color: '#3a2b2a', rgb: [58, 43, 42], share: 0.31 }, …]
 * const key = pickKeyColor(colors);         // 最鮮豔、又占得夠多的那一個
 * ```
 */
import { formatHex, rgbToHsv } from '../color';
import { makeCanvas, type PixelBuffer, type Rect } from './index';

export interface PaletteColor {
  /** #rrggbb（小寫） */
  color: string;
  rgb: [number, number, number];
  /** 占取樣像素的比例（0～1） */
  share: number;
}

export interface KmeansOptions {
  /** 透明度（0～255）低於這個值的像素不算（預設 128） */
  alphaThreshold?: number;
  /** 每一次分群最多幾輪（預設 14） */
  iterations?: number;
  /** 占比不到這個值的顏色不要（預設 0.004） */
  minShare?: number;
  /** 第一次分群的亂數種子（預設 1；之後每次加 1。同樣的種子、同樣的輸入結果一定相同） */
  seed?: number;
  /** 用幾組種子各分一次、取誤差最小的那一次（預設 4；1＝只分一次） */
  restarts?: number;
  /** 結果的順序：'luminance' 由暗到亮（預設）、'share' 占比由多到少 */
  order?: 'luminance' | 'share';
}

/** RGB 距離的權重（綠最重、藍最輕；數值參考原作） */
const WEIGHT_R = 0.9;
const WEIGHT_G = 1.2;
const WEIGHT_B = 0.7;

/** 加權的 RGB 距離平方（p、q 是 RGB 連續存放的陣列，pi、qi 是起點） */
function weighted(p: ArrayLike<number>, pi: number, q: ArrayLike<number>, qi: number): number {
  const dr = p[pi] - q[qi];
  const dg = p[pi + 1] - q[qi + 1];
  const db = p[pi + 2] - q[qi + 2];
  return WEIGHT_R * dr * dr + WEIGHT_G * dg * dg + WEIGHT_B * db * db;
}

/** 0～1 的亂數（mulberry32，固定種子） */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 亮度（Rec. 709 的係數，0～1；結果的排序與代表色用） */
export const paletteLuminance = ([r, g, b]: readonly number[]): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** 不透明的像素，RGB 連續存放 */
function opaqueRgb(src: ArrayLike<number>, alphaThreshold: number): Float64Array {
  const keep: number[] = [];
  for (let i = 0; i + 3 < src.length; i += 4)
    if (src[i + 3] >= alphaThreshold) keep.push(src[i], src[i + 1], src[i + 2]);
  return Float64Array.from(keep);
}

/**
 * k-means++ 的起點：第一個隨機，之後每次依「到最近起點的距離平方」的比例抽一個像素
 * （累加後二分搜尋）。剩下的像素都和既有的起點相同時就停（圖裡的顏色比 want 少）。
 */
function seedCenters(px: Float64Array, want: number, random: () => number): number[][] {
  const n = px.length / 3;
  const pick = (i: number) => [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
  const centers = [pick(Math.floor(random() * n))];
  const near = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const cumulative = new Float64Array(n);
  while (centers.length < want) {
    const last = centers[centers.length - 1];
    let total = 0;
    for (let i = 0; i < n; i++) {
      near[i] = Math.min(near[i], weighted(px, i * 3, last, 0));
      total += near[i];
      cumulative[i] = total;
    }
    if (total <= 0) break;
    const target = random() * total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    centers.push(pick(lo));
  }
  return centers;
}

interface Fit {
  centers: number[][];
  counts: Int32Array;
  /** 每個像素到所屬中心的加權距離平方的總和 */
  error: number;
}

/** 從起點開始反覆「分到最近的中心 → 中心移到平均」；分法不再改變或到了輪數上限就停 */
function refine(px: Float64Array, start: number[][], iterations: number): Fit {
  const n = px.length / 3;
  const m = start.length;
  const centers = start.map((c) => c.slice());
  const owner = new Int32Array(n).fill(-1);
  const counts = new Int32Array(m);
  const sums = new Float64Array(m * 3);
  const gap = new Float64Array(n);
  let error = 0;
  for (let round = 0; round <= iterations; round++) {
    let moved = 0;
    error = 0;
    counts.fill(0);
    sums.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = weighted(px, i * 3, centers[0], 0);
      for (let c = 1; c < m; c++) {
        const d = weighted(px, i * 3, centers[c], 0);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (owner[i] !== best) moved++;
      owner[i] = best;
      gap[i] = bestD;
      error += bestD;
      counts[best]++;
      sums[best * 3] += px[i * 3];
      sums[best * 3 + 1] += px[i * 3 + 1];
      sums[best * 3 + 2] += px[i * 3 + 2];
    }
    if (!moved || round === iterations) break;
    for (let c = 0; c < m; c++) {
      if (counts[c]) {
        centers[c] = [
          sums[c * 3] / counts[c],
          sums[c * 3 + 1] / counts[c],
          sums[c * 3 + 2] / counts[c],
        ];
        continue;
      }
      /* 沒分到像素的中心：移到目前離自己的中心最遠的那個像素（不靠亂數，結果固定） */
      let far = 0;
      for (let i = 1; i < n; i++) if (gap[i] > gap[far]) far = i;
      centers[c] = [px[far * 3], px[far * 3 + 1], px[far * 3 + 2]];
      gap[far] = 0;
    }
  }
  return { centers, counts, error };
}

/**
 * k-means 分群取主要的 k 色（純函式）。像素太多時呼叫端先縮小（`regionPixels`，長邊 150 px）。
 * 用 restarts 組固定的種子各分一次、取誤差最小的那一次，所以結果固定、又不容易卡在差的分法。
 * 沒有可算的像素時回傳空陣列。
 */
export function kmeansPalette(
  pixels: Pick<PixelBuffer, 'data'>,
  k: number,
  {
    alphaThreshold = 128,
    iterations = 14,
    minShare = 0.004,
    seed = 1,
    restarts = 4,
    order = 'luminance',
  }: KmeansOptions = {},
): PaletteColor[] {
  const px = opaqueRgb(pixels.data, alphaThreshold);
  const n = px.length / 3;
  if (!n || k < 1) return [];
  const want = Math.min(Math.round(k), n);
  let fit: Fit | null = null;
  for (let r = 0; r < Math.max(1, restarts); r++) {
    const next = refine(px, seedCenters(px, want, rng(seed + r)), iterations);
    if (!fit || next.error < fit.error) fit = next;
  }
  if (!fit) return [];
  const colors: PaletteColor[] = [];
  fit.centers.forEach((c, i) => {
    const share = fit.counts[i] / n;
    if (share <= minShare) return;
    const rgb = c.map((v) => Math.round(Math.min(255, Math.max(0, v)))) as [number, number, number];
    colors.push({ rgb, color: formatHex({ r: rgb[0], g: rgb[1], b: rgb[2], a: 1 }, false), share });
  });
  const key =
    order === 'share'
      ? (c: PaletteColor) => -c.share
      : (c: PaletteColor) => paletteLuminance(c.rgb);
  return colors.sort((a, b) => key(a) - key(b));
}

/** 太亮或太暗的顏色當代表色時打的折扣 */
function extremeDiscount(luma: number): number {
  if (luma < 0.07 || luma > 0.93) return 0.12;
  if (luma < 0.13 || luma > 0.86) return 0.45;
  return 1;
}

/**
 * 代表色：分數＝鮮豔度（HSV 的飽和度）× 0.8 ＋ 占比 × 0.4，再乘上太亮太暗的折扣（數值參考原作）。
 * 分數相同時取前面的。沒有顏色時回傳 null。
 */
export function pickKeyColor(colors: readonly PaletteColor[]): PaletteColor | null {
  const score = (c: PaletteColor) => {
    const { s } = rgbToHsv({ r: c.rgb[0], g: c.rgb[1], b: c.rgb[2], a: 1 });
    return (s * 0.8 + c.share * 0.4) * extremeDiscount(paletteLuminance(c.rgb));
  };
  return colors.reduce<{ c: PaletteColor | null; v: number }>(
    (best, c) => {
      const v = score(c);
      return v > best.v ? { c, v } : best;
    },
    { c: null, v: Number.NEGATIVE_INFINITY },
  ).c;
}

/** 最接近某個顏色的那一個（同一個距離公式；鎖定的代表色在重新取色後換成最接近的新顏色） */
export function nearestPaletteColor(
  colors: readonly PaletteColor[],
  rgb: readonly [number, number, number],
): PaletteColor | null {
  let best: PaletteColor | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const c of colors) {
    const d = weighted(c.rgb, 0, rgb, 0);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** 幾個顏色的平均（RGB 各自平均、四捨五入；沒有顏色時黑） */
export function mixColors(
  list: readonly (readonly [number, number, number])[],
): [number, number, number] {
  const sum = [0, 0, 0];
  for (const c of list) {
    sum[0] += c[0];
    sum[1] += c[1];
    sum[2] += c[2];
  }
  const k = list.length || 1;
  return [Math.round(sum[0] / k), Math.round(sum[1] / k), Math.round(sum[2] / k)];
}

/**
 * 圖片的某個範圍縮小成長邊 maxSide px（預設 150；高品質縮放）的像素，給 kmeansPalette 用。
 * 範圍超出圖片的部分不算（夾在圖片內）；範圍完全在圖片外時用整張圖。
 */
export function regionPixels(
  img: CanvasImageSource,
  size: { width: number; height: number },
  rect: Rect,
  maxSide = 150,
): PixelBuffer {
  const left = Math.max(0, rect.x);
  const top = Math.max(0, rect.y);
  const right = Math.min(size.width, rect.x + rect.width);
  const bottom = Math.min(size.height, rect.y + rect.height);
  const src =
    right > left && bottom > top
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : { x: 0, y: 0, width: size.width, height: size.height };
  const k = maxSide / Math.max(src.width, src.height);
  const ow = Math.max(1, Math.round(src.width * k));
  const oh = Math.max(1, Math.round(src.height * k));
  const c = makeCanvas(ow, oh);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, src.x, src.y, src.width, src.height, 0, 0, ow, oh);
  return { width: ow, height: oh, data: ctx.getImageData(0, 0, ow, oh).data };
}
