/**
 * 讀得出來的檢查：
 * - `checkQrPixels`：在畫好的圖上，每一格的中央取一小塊的平均亮度（透明的地方當成疊在白底上），
 *   以 Otsu 法分成深淺，交給 `decodeQrMatrix` 讀回文字；同時數有幾格和應有的不同。
 *   深淺讀不出來時再試一次反過來（淺色的點、深色的底）。
 * - `qrPaintContrast`：點與角的顏色（含漸層的每個色標）和背景最差的對比（WCAG 的算法），以及是不是反色。
 */
import { parseColor, type Rgba, relativeLuminance } from '../color';
import { decodeQrMatrix, type QrDecodeResult } from './decode';
import type { QrMatrix } from './encode';
import type { QrPaint, QrScene } from './style';

export interface QrSampleOptions {
  /** RGBA */
  pixels: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** 格子在這張圖上的位置（px） */
  grid: QrScene['grid'];
}

/** 每一格中央的灰階（0～255，透明的地方疊在白底上）；列優先 */
export function sampleQrModules({ pixels, width, height, grid }: QrSampleOptions): Float32Array {
  const n = grid.count;
  const out = new Float32Array(n * n);
  const half = Math.max(0, Math.round(grid.cell * 0.17));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const cx = Math.floor(grid.x + (c + 0.5) * grid.cell);
      const cy = Math.floor(grid.y + (r + 0.5) * grid.cell);
      let sum = 0;
      let k = 0;
      for (let y = cy - half; y <= cy + half; y++)
        for (let x = cx - half; x <= cx + half; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const i = (y * width + x) * 4;
          const a = pixels[i + 3] / 255;
          const g = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          sum += g * a + 255 * (1 - a);
          k++;
        }
      out[r * n + c] = k ? sum / k : 255;
    }
  return out;
}

/**
 * Otsu 法的門檻（灰階 0～255）：深淺兩群的組間變異最大。兩群中間沒有任何值時（例如只有 0 與 255），
 * 很多個門檻的變異一樣大，取那一段的**中間**（不是第一個：第一個會貼著深色，反鋸齒的淺灰邊都被當成淺色）。
 */
export function otsuThreshold(values: ArrayLike<number>): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i++) hist[Math.max(0, Math.min(255, Math.round(values[i])))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let first = 127;
  let last = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best * (1 + 1e-9)) {
      best = between;
      first = t;
      last = t;
    } else if (between >= best * (1 - 1e-9)) last = t;
  }
  return (first + last) / 2 + 0.5;
}

export interface QrPixelCheck {
  /** 照一般的深淺（深色的點）讀的結果 */
  decoded: QrDecodeResult;
  /** 一般的讀不出來、反過來讀得出來時：反過來的結果 */
  invertedDecoded: QrDecodeResult | null;
  /**
   * 和應有的不同的格數（給了 expected 時；不含 skip 的格，也不含三個角的 8 × 8：
   * 角的外框與中心是整塊的形狀〔例如圓環〕，格子中央不一定落在形狀上，它們不放資料）
   */
  wrong: number;
  /** 被 skip 的範圍（例如中間的圖）裡和應有的不同的格數 */
  wrongSkipped: number;
  /** 三個角（左上、右上、左下）的定位圖案找不找得到（照掃描程式的找法：穿過中心的橫線與直線是 1:1:3:1:1） */
  finders: [boolean, boolean, boolean];
}

export function checkQrPixels(
  o: QrSampleOptions & {
    expected?: QrMatrix;
    /** 這些格另外算（例如被圖蓋住的範圍） */
    skip?: (r: number, c: number) => boolean;
  },
): QrPixelCheck {
  const n = o.grid.count;
  const gray = sampleQrModules(o);
  const t = otsuThreshold(gray);
  const dark = (r: number, c: number) => gray[r * n + c] < t;
  const decoded = decodeQrMatrix(n, dark);
  let invertedDecoded: QrDecodeResult | null = null;
  if (!decoded.ok) {
    const inv = decodeQrMatrix(n, (r, c) => gray[r * n + c] > t);
    if (inv.ok) invertedDecoded = inv;
  }
  let wrong = 0;
  let wrongSkipped = 0;
  const corner = (r: number, c: number) =>
    (r < 8 || r >= n - 8) && (c < 8 || c >= n - 8) && !(r >= n - 8 && c >= n - 8);
  if (o.expected)
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (!corner(r, c) && dark(r, c) !== o.expected.dark(r, c)) {
          if (o.skip?.(r, c)) wrongSkipped++;
          else wrong++;
        }
  const polarity = decoded.ok || !invertedDecoded ? 'dark' : 'light';
  const finders = FINDERS.map(([fr, fc]) =>
    finderFound(o, fr === 0 ? 0 : n - 7, fc === 0 ? 0 : n - 7, polarity),
  ) as [boolean, boolean, boolean];
  return { decoded, invertedDecoded, wrong, wrongSkipped, finders };
}

/* ---------- 定位圖案（尋像圖案） ---------- */

const FINDERS: readonly [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
];

/** 一條線上的灰階（透明疊白、畫面外當白色） */
function lineGray(
  o: QrSampleOptions,
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  len: number,
): Float32Array {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const x = x0 + dx * i;
    const y = y0 + dy * i;
    if (x < 0 || y < 0 || x >= o.width || y >= o.height) {
      out[i] = 255;
      continue;
    }
    const k = (y * o.width + x) * 4;
    const a = o.pixels[k + 3] / 255;
    out[i] =
      (0.299 * o.pixels[k] + 0.587 * o.pixels[k + 1] + 0.114 * o.pixels[k + 2]) * a + 255 * (1 - a);
  }
  return out;
}

/**
 * 一條線的深淺是不是「淺｜深 1｜淺 1｜深 3｜淺 1｜深 1｜淺」：太短的段（不到 0.3 格，例如圓點相接處反鋸齒的縫、兩端壓到的邊）
 * 併進旁邊的段；每段和應有的長度差在半格以內（中間的 3 格差在 1.5 格以內，同 ZXing 的容許）。
 */
export function finderLineOk(dark: readonly boolean[], cell: number): boolean {
  const runs: { v: boolean; n: number }[] = [];
  for (const v of dark) {
    const last = runs[runs.length - 1];
    if (last && last.v === v) last.n++;
    else runs.push({ v, n: 1 });
  }
  const min = Math.max(1, cell * 0.3);
  /* 兩端太短的段（線的起點剛好壓到旁邊的格子一兩個像素）不算 */
  while (runs.length && runs[0].n < min) runs.shift();
  while (runs.length && runs[runs.length - 1].n < min) runs.pop();
  for (;;) {
    let k = -1;
    for (let i = 1; i < runs.length - 1; i++)
      if (runs[i].n < min && (k < 0 || runs[i].n < runs[k].n)) k = i;
    if (k < 0) break;
    const merged = { v: runs[k - 1].v, n: runs[k - 1].n + runs[k].n + runs[k + 1].n };
    runs.splice(k - 1, 3, merged);
  }
  while (runs.length && !runs[0].v) runs.shift();
  while (runs.length && !runs[runs.length - 1].v) runs.pop();
  if (runs.length !== 5) return false;
  const total = runs.reduce((a, r) => a + r.n, 0);
  if (total < cell * 5) return false;
  const unit = total / 7;
  return [1, 1, 3, 1, 1].every(
    (k, i) => Math.abs(runs[i].n - k * unit) <= (k === 3 ? 1.5 : 0.5) * unit,
  );
}

/** 定位方框的深淺至少要差這麼多（灰階 0～255）才算看得見（ZXing 的局部二值化最少要 24，這裡保守一點：淺灰 #cccccc 的角在白底上算看不見） */
export const FINDER_MIN_RANGE = 64;

/**
 * 一個角找不找得到：穿過中心的橫線與直線，用**這兩條線自己的**深淺中間值分深淺（掃描程式是局部二值化，
 * 角的顏色比點淡一些也找得到），深淺差不到 FINDER_MIN_RANGE 時當成看不見。
 */
function finderFound(
  o: QrSampleOptions,
  r0: number,
  c0: number,
  polarity: 'dark' | 'light',
): boolean {
  const { x, y, cell } = o.grid;
  /* 從外側分隔線的中間到另一側分隔線的中間（8 格）：不會壓到分隔線外面的格子 */
  const len = Math.round(cell * 8);
  const cx = Math.floor(x + (c0 + 3.5) * cell);
  const cy = Math.floor(y + (r0 + 3.5) * cell);
  const sx = Math.floor(x + (c0 - 0.5) * cell);
  const sy = Math.floor(y + (r0 - 0.5) * cell);
  const h = lineGray(o, sx, cy, 1, 0, len);
  const v = lineGray(o, cx, sy, 0, 1, len);
  let lo = 255;
  let hi = 0;
  for (const line of [h, v])
    for (const g of line) {
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
  if (hi - lo < FINDER_MIN_RANGE) return false;
  const t = (lo + hi) / 2;
  const isDark = (g: number) => (polarity === 'dark' ? g < t : g > t);
  return finderLineOk(Array.from(h, isDark), cell) && finderLineOk(Array.from(v, isDark), cell);
}

/* ---------- 顏色的對比 ---------- */

/** 畫法用到的顏色（單色＝1 個；漸層＝每個色標） */
export function paintColors(paint: QrPaint): string[] {
  return paint.kind === 'solid' ? [paint.color] : paint.gradient.stops.map((s) => s.color);
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** 疊在 under 上（under 不透明） */
const over = (c: Rgba, under: Rgba): Rgba => ({
  r: c.r * c.a + under.r * (1 - c.a),
  g: c.g * c.a + under.g * (1 - c.a),
  b: c.b * c.a + under.b * (1 - c.a),
  a: 1,
});

export interface QrContrast {
  /** 最差的對比（1～21） */
  ratio: number;
  /** 點比背景亮（反色） */
  inverted: boolean;
}

/**
 * 前景（點、角）與背景最差的對比：前景最亮的顏色對背景最暗的顏色（反色時反過來）。
 * 背景透明（null）時當成白底；半透明的顏色先疊在白底（背景）或背景上（前景）。
 */
export function qrPaintContrast(fg: readonly QrPaint[], bg: QrPaint | null): QrContrast {
  const bgColors = (bg ? paintColors(bg) : ['#ffffff']).map((s) =>
    over(parseColor(s) ?? WHITE, WHITE),
  );
  const bgL = bgColors.map(relativeLuminance);
  const bgMean = bgColors.reduce(
    (a, c) => ({
      r: a.r + c.r / bgColors.length,
      g: a.g + c.g / bgColors.length,
      b: a.b + c.b / bgColors.length,
      a: 1,
    }),
    { r: 0, g: 0, b: 0, a: 1 },
  );
  const fgL = fg
    .flatMap(paintColors)
    .map((s) => relativeLuminance(over(parseColor(s) ?? { ...WHITE, a: 0 }, bgMean)));
  if (!fgL.length) return { ratio: 1, inverted: false };
  const fgMean = fgL.reduce((a, b) => a + b, 0) / fgL.length;
  const bgAvg = bgL.reduce((a, b) => a + b, 0) / bgL.length;
  const inverted = fgMean > bgAvg;
  const ratio = inverted
    ? (Math.min(...fgL) + 0.05) / (Math.max(...bgL) + 0.05)
    : (Math.min(...bgL) + 0.05) / (Math.max(...fgL) + 0.05);
  return { ratio: Math.max(1, ratio), inverted };
}
