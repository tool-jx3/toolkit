/**
 * k-means 取主要的 N 色（color-palette 的配色卡新增，2026-10；做法參考 dearmysn1p3r/Colorpalettecard_Maker，
 * 數值照原作：透明度 128 以上的像素才算、RGB 距離的權重 0.9／1.2／0.7、最多 14 輪、占比不到 0.4% 的顏色不要、
 * 結果由暗到亮排列；代表色的選法也照原作的分數）。
 *
 * 和原作不同：起始點用 k-means++，但亂數是**固定種子**的（同一張圖、同樣的 N 一定得到同樣的結果）；
 * 圖裡的顏色比 N 少時不硬湊重複的顏色。
 *
 * ```ts
 * const px = regionPixels(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height }); // 縮到長邊 150 px
 * const colors = kmeansPalette(px, 5);      // [{ color: '#3a2b2a', rgb: [58, 43, 42], share: 0.31 }, …]
 * const key = pickKeyColor(colors);         // 最鮮豔、又占得夠多的那一個
 * ```
 */
import { formatHex } from '../color';
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
  /** 最多幾輪（預設 14） */
  iterations?: number;
  /** 占比不到這個值的顏色不要（預設 0.004） */
  minShare?: number;
  /** 亂數種子（預設 1；同樣的種子、同樣的輸入結果一定相同） */
  seed?: number;
  /** 結果的順序：'luminance' 由暗到亮（預設）、'share' 占比由多到少 */
  order?: 'luminance' | 'share';
}

/** RGB 距離的權重（原作的數值） */
const W = [0.9, 1.2, 0.7] as const;

const dist2 = (a: ArrayLike<number>, ai: number, b: ArrayLike<number>, bi: number) => {
  const r = a[ai] - b[bi];
  const g = a[ai + 1] - b[bi + 1];
  const bl = a[ai + 2] - b[bi + 2];
  return r * r * W[0] + g * g * W[1] + bl * bl * W[2];
};

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

/** 亮度（原作的算法：0.2126R＋0.7152G＋0.0722B，0～1） */
export const paletteLuminance = ([r, g, b]: readonly number[]): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

const saturation = ([r, g, b]: readonly number[]): number => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

/**
 * k-means 分群取主要的 k 色（純函式）。像素太多時呼叫端先縮小（`regionPixels`，長邊 150 px）。
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
    order = 'luminance',
  }: KmeansOptions = {},
): PaletteColor[] {
  const src = pixels.data;
  /* 取出不透明的像素（RGB 連續存放） */
  let n = 0;
  for (let i = 3; i < src.length; i += 4) if (src[i] >= alphaThreshold) n++;
  if (!n || k < 1) return [];
  const px = new Float64Array(n * 3);
  for (let i = 0, j = 0; i < src.length; i += 4) {
    if (src[i + 3] < alphaThreshold) continue;
    px[j++] = src[i];
    px[j++] = src[i + 1];
    px[j++] = src[i + 2];
  }
  const random = rng(seed);
  const want = Math.min(Math.round(k), n);
  /* k-means++：第一個隨機，之後依「到最近中心的距離平方」的比例抽 */
  const cent: number[][] = [];
  const first = Math.floor(random() * n) * 3;
  cent.push([px[first], px[first + 1], px[first + 2]]);
  const best = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  while (cent.length < want) {
    const c = cent[cent.length - 1];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = dist2(px, i * 3, c, 0);
      if (d < best[i]) best[i] = d;
      sum += best[i];
    }
    /* 剩下的像素都和既有的中心相同：圖裡的顏色比 k 少，不硬湊 */
    if (sum <= 0) break;
    let t = random() * sum;
    let idx = n - 1;
    for (let i = 0; i < n; i++) {
      t -= best[i];
      if (t <= 0) {
        idx = i;
        break;
      }
    }
    cent.push([px[idx * 3], px[idx * 3 + 1], px[idx * 3 + 2]]);
  }
  const m = cent.length;
  const asg = new Int32Array(n).fill(-1);
  const sr = new Float64Array(m);
  const sg = new Float64Array(m);
  const sb = new Float64Array(m);
  const cnt = new Float64Array(m);
  for (let it = 0; it < iterations; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Number.POSITIVE_INFINITY;
      for (let c = 0; c < m; c++) {
        const d = dist2(px, i * 3, cent[c], 0);
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      if (asg[i] !== bi) {
        asg[i] = bi;
        changed = true;
      }
    }
    sr.fill(0);
    sg.fill(0);
    sb.fill(0);
    cnt.fill(0);
    for (let i = 0; i < n; i++) {
      const a = asg[i];
      sr[a] += px[i * 3];
      sg[a] += px[i * 3 + 1];
      sb[a] += px[i * 3 + 2];
      cnt[a]++;
    }
    for (let c = 0; c < m; c++) {
      if (cnt[c] === 0) {
        /* 沒分到像素的中心：換一個隨機的像素重來（原作的做法；種子固定所以結果固定） */
        const p = Math.floor(random() * n) * 3;
        cent[c] = [px[p], px[p + 1], px[p + 2]];
        continue;
      }
      cent[c] = [sr[c] / cnt[c], sg[c] / cnt[c], sb[c] / cnt[c]];
    }
    if (!changed && it > 1) break;
  }
  cnt.fill(0);
  for (let i = 0; i < n; i++) cnt[asg[i]]++;
  const out = cent
    .map((c, i): PaletteColor => {
      const rgb = c.map((v) => Math.round(Math.min(255, Math.max(0, v)))) as [
        number,
        number,
        number,
      ];
      return {
        rgb,
        color: formatHex({ r: rgb[0], g: rgb[1], b: rgb[2], a: 1 }, false),
        share: cnt[i] / n,
      };
    })
    .filter((c) => c.share > minShare);
  return order === 'share'
    ? out.sort((a, b) => b.share - a.share)
    : out.sort((a, b) => paletteLuminance(a.rgb) - paletteLuminance(b.rgb));
}

/**
 * 代表色（原作的分數）：鮮豔度 × 0.8 ＋ 占比 × 0.4，太亮或太暗的打折（亮度 > 0.93 或 < 0.07 乘 0.12，
 * > 0.86 或 < 0.13 乘 0.45）。分數相同時取前面的。沒有顏色時回傳 null。
 */
export function pickKeyColor(colors: readonly PaletteColor[]): PaletteColor | null {
  let best: PaletteColor | null = null;
  let bs = Number.NEGATIVE_INFINITY;
  for (const c of colors) {
    const l = paletteLuminance(c.rgb);
    let p = 1;
    if (l > 0.93 || l < 0.07) p = 0.12;
    else if (l > 0.86 || l < 0.13) p = 0.45;
    const score = (saturation(c.rgb) * 0.8 + c.share * 0.4) * p;
    if (score > bs) {
      bs = score;
      best = c;
    }
  }
  return best;
}

/** 最接近某個顏色的那一個（同一個距離公式；鎖定的代表色在重新取色後換成最接近的新顏色） */
export function nearestPaletteColor(
  colors: readonly PaletteColor[],
  rgb: readonly [number, number, number],
): PaletteColor | null {
  let best: PaletteColor | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const c of colors) {
    const d = dist2(c.rgb, 0, rgb, 0);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** 幾個顏色的平均（RGB 各自平均、四捨五入） */
export function mixColors(
  list: readonly (readonly [number, number, number])[],
): [number, number, number] {
  if (!list.length) return [0, 0, 0];
  return [0, 1, 2].map((i) => Math.round(list.reduce((a, c) => a + c[i], 0) / list.length)) as [
    number,
    number,
    number,
  ];
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
  let x = Math.max(0, rect.x);
  let y = Math.max(0, rect.y);
  let w = Math.min(size.width, rect.x + rect.width) - x;
  let h = Math.min(size.height, rect.y + rect.height) - y;
  if (!(w > 0 && h > 0)) {
    x = 0;
    y = 0;
    w = size.width;
    h = size.height;
  }
  const ar = w / h;
  const ow = Math.max(1, Math.round(ar >= 1 ? maxSide : maxSide * ar));
  const oh = Math.max(1, Math.round(ar >= 1 ? maxSide / ar : maxSide));
  const c = makeCanvas(ow, oh);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h, 0, 0, ow, oh);
  const d = ctx.getImageData(0, 0, ow, oh);
  return { width: ow, height: oh, data: d.data };
}
