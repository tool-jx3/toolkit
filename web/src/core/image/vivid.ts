/**
 * 主色的「依鮮豔度加權」模式（角色配色條的自動取色）。
 *
 * 規則（行為依 color-palette 規格 3.4；計分方式是本專案自己設計的）：
 * 1. 不透明度低於 alphaMin（預設 128）的像素不算。
 * 2. R、G、B 各以「容許值 × 2」為格寬、從 0 開始切格；同一格的顏色視為同一種（格線固定）。
 * 3. 每個像素替自己的格子加分＝鮮豔度權重 × 明暗折扣：
 *    - 鮮豔度 s ＝ 三色版最大值 − 最小值；s ≤ 20（接近灰色）只給 0.02，其他給 0.1 ＋ 0.9 × ∛(s ÷ 255)；
 *    - 很暗（最大與最小色版的平均 ≤ 40）或很亮（≥ 230）再乘 0.15。
 * 4. 總分最高的格子勝出；同分時取先達到那個分數的格子（由上往下、由左往右掃描）。
 * 5. 結果是勝出格子裡**最鮮豔的實際像素色**（同樣鮮豔取最先出現的），不是平均色。
 * 6. 沒有可計算的像素時是黑色。
 */
import type { PixelBuffer, Rect } from './index';

export interface VividOptions {
  /** 相近色容許值（格寬＝容許值 × 2，預設 20） */
  tolerance?: number;
  /** 不透明度至少多少才算（預設 128） */
  alphaMin?: number;
  /** 只看這個範圍（預設整張） */
  region?: Rect;
}

/** 一個像素的分數（鮮豔度權重 × 明暗折扣） */
export function vividWeight(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const s = max - min;
  let w = s <= 20 ? 0.02 : 0.1 + 0.9 * Math.cbrt(s / 255);
  const lum = (max + min) / 2;
  if (lum <= 40 || lum >= 230) w *= 0.15;
  return w;
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0');
const toHex = (rgb: number) =>
  `#${hex2((rgb >> 16) & 255)}${hex2((rgb >> 8) & 255)}${hex2(rgb & 255)}`;

interface Bin {
  score: number;
  sat: number;
  rgb: number;
}

/**
 * 依鮮豔度加權取一個主色（#rrggbb 小寫）。
 * ```ts
 * dominantColorVivid(getImageData(img), { tolerance: 20, region: { x: 0, y: 0, width: w, height: 60 } });
 * ```
 */
export function dominantColorVivid(pixels: PixelBuffer, options: VividOptions = {}): string {
  const { data, width, height } = pixels;
  const tol = Math.max(1, Math.round(options.tolerance ?? 20));
  const alphaMin = options.alphaMin ?? 128;
  const bw = tol * 2;
  const k = Math.ceil(256 / bw);
  const reg = options.region ?? { x: 0, y: 0, width, height };
  const x0 = Math.max(0, Math.floor(reg.x));
  const y0 = Math.max(0, Math.floor(reg.y));
  const x1 = Math.min(width, Math.floor(reg.x + reg.width));
  const y1 = Math.min(height, Math.floor(reg.y + reg.height));
  const bins = new Map<number, Bin>();
  let best: Bin | null = null;
  for (let y = y0; y < y1; y++) {
    let i = (y * width + x0) * 4;
    for (let x = x0; x < x1; x++, i += 4) {
      if (data[i + 3] < alphaMin) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = (Math.floor(r / bw) * k + Math.floor(g / bw)) * k + Math.floor(b / bw);
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      let bin = bins.get(key);
      if (!bin) {
        bin = { score: 0, sat: -1, rgb: 0 };
        bins.set(key, bin);
      }
      if (sat > bin.sat) {
        bin.sat = sat;
        bin.rgb = (r << 16) | (g << 8) | b;
      }
      bin.score += vividWeight(r, g, b);
      /* 嚴格大於：同分時保留先達到的 */
      if (!best || bin.score > best.score) best = bin;
    }
  }
  return best ? toHex(best.rgb) : '#000000';
}

/** 分割線（0～1 的比例，由小到大）→ 每一段的列範圍 [y0, y1)（四捨五入到整列） */
export function splitRows(splits: readonly number[], height: number): { y0: number; y1: number }[] {
  const edges = [0, ...splits.map((f) => Math.min(1, Math.max(0, f))), 1];
  const out: { y0: number; y1: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    out.push({ y0: Math.round(edges[i] * height), y1: Math.round(edges[i + 1] * height) });
  }
  return out;
}

/** n 段等分的分割線（n − 1 條） */
export function evenSplits(n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  return Array.from({ length: count - 1 }, (_, i) => (i + 1) / count);
}

/**
 * 拖動第 index 條分割線到 value：不越過相鄰的線、彼此至少相隔 minGap（比例），也不超出 0～1。
 * 回傳新的陣列。
 */
export function moveSplit(
  splits: readonly number[],
  index: number,
  value: number,
  minGap = 0.02,
): number[] {
  const lo = (index > 0 ? splits[index - 1] : 0) + minGap;
  const hi = (index < splits.length - 1 ? splits[index + 1] : 1) - minGap;
  const next = splits.slice();
  next[index] = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, value));
  return next;
}

/**
 * 依分割線把圖分成上下幾段，各取一個主色；ratio ＝ 該段占圖片高度的比例（四捨五入到小數 3 位）。
 */
export function vividColorsBySplits(
  pixels: PixelBuffer,
  splits: readonly number[],
  options: Omit<VividOptions, 'region'> = {},
): { color: string; ratio: number }[] {
  const edges = [0, ...splits, 1];
  return splitRows(splits, pixels.height).map((r, i) => ({
    color: dominantColorVivid(pixels, {
      ...options,
      region: { x: 0, y: r.y0, width: pixels.width, height: r.y1 - r.y0 },
    }),
    ratio: Math.round((edges[i + 1] - edges[i]) * 1000) / 1000,
  }));
}

/** 取一個像素的顏色（只看 RGB，不看透明度；完全透明的像素一律是黑色）→ #rrggbb */
export function samplePixel(pixels: PixelBuffer, x: number, y: number): string {
  const px = Math.min(pixels.width - 1, Math.max(0, Math.floor(x)));
  const py = Math.min(pixels.height - 1, Math.max(0, Math.floor(y)));
  const i = (py * pixels.width + px) * 4;
  const d = pixels.data;
  if (d[i + 3] === 0) return '#000000';
  return toHex((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
}
