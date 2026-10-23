/**
 * 復古像素化（rpg-screenshot 移植時新增）：把圖縮成小格（每格一個像素方塊）、套色調濾鏡、亮度／對比／飽和度，
 * 再以有序抖色（4 × 4 Bayer 矩陣）取色階，最後以最近鄰放大回原尺寸。
 *
 * - `retroGrade`：純函式（RGBA 像素就地改寫，alpha 不動；Node 可測）。所有運算以小數連續算、**中間不截斷**，
 *   只在最後取階時夾在 0～255（照 RPG Screenshot Maker 的算法，逐像素相同）。
 * - `pixelateImage`：用畫布做「縮小（畫布預設的平滑縮放）→ retroGrade → 最近鄰放大」，回傳 W × H 的畫布。
 *   要和別人的結果逐像素相同時來源用 `<img>`（Chromium 縮小 `<img>` 與 ImageBitmap 的取樣不同）。
 *
 * ```ts
 * const out = pixelateImage(bitmap, 816, 624, { pixelSize: 6, levels: 8, dither: true, tone: 'warm' });
 * ctx.drawImage(out, 0, 0);
 * ```
 */
import { makeCanvas, type Rect } from './index';

/** 色調：原色、暖色、冷色、懷舊（棕褐）、夜晚、黑白、褪色、掌機四色 */
export type RetroTone = 'none' | 'warm' | 'cool' | 'sepia' | 'night' | 'mono' | 'faded' | 'gameboy';

export const RETRO_TONES: readonly RetroTone[] = [
  'none',
  'warm',
  'cool',
  'sepia',
  'night',
  'mono',
  'faded',
  'gameboy',
];

/** 4 × 4 的 Bayer 矩陣（0～15）；抖色值＝矩陣值 ÷ 16 − 0.5 */
export const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** 掌機四色（暗 → 亮） */
export const HANDHELD_PALETTE: readonly (readonly [number, number, number])[] = [
  [15, 56, 15],
  [48, 98, 48],
  [139, 172, 15],
  [155, 188, 15],
];

export interface RetroGradeOptions {
  tone?: RetroTone;
  /** 亮度 −100～100（每個色版加上 值 × 2.55） */
  brightness?: number;
  /** 對比 −100～100（以 128 為中心；c＝值 × 2.55，係數 259(c＋255) ÷ (255(259−c))） */
  contrast?: number;
  /** 飽和度 −100～100（以亮度為中心乘上 1 ＋ 值 ÷ 100） */
  saturation?: number;
  /** 每個色版幾階（2 以上；掌機四色不用） */
  levels: number;
  /** 有序抖色（Bayer 4 × 4，以像素座標取） */
  dither: boolean;
}

/** 小圖的格數：round(寬 ÷ 像素大小) × round(高 ÷ 像素大小)，至少 1 × 1 */
export function pixelGrid(
  width: number,
  height: number,
  pixelSize: number,
): { width: number; height: number } {
  const px = Math.max(1, pixelSize | 0);
  return {
    width: Math.max(1, Math.round(width / px)),
    height: Math.max(1, Math.round(height / px)),
  };
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * 就地改寫 RGBA 像素（width × height）：色調 → 亮度 → 對比 → 飽和度 →（掌機四色或黑白）→ 抖色取階。
 * 寫回時由 Uint8ClampedArray 四捨五入（取階的結果多半不是整數）。
 */
export function retroGrade(
  d: Uint8ClampedArray,
  width: number,
  height: number,
  o: RetroGradeOptions,
): void {
  const levels = Math.max(2, o.levels | 0);
  const step = 255 / (levels - 1);
  const br = (o.brightness || 0) * 2.55;
  const cc = (o.contrast || 0) * 2.55;
  const cf = (259 * (cc + 255)) / (255 * (259 - cc));
  const sat = 1 + (o.saturation || 0) / 100;
  const f = o.tone || 'none';
  const pal = HANDHELD_PALETTE;
  for (let y = 0; y < height; y++) {
    const row = BAYER_4X4[y & 3];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];
      if (f === 'sepia') {
        const R = r;
        const G = g;
        const B = b;
        r = 0.393 * R + 0.769 * G + 0.189 * B;
        g = 0.349 * R + 0.686 * G + 0.168 * B;
        b = 0.272 * R + 0.534 * G + 0.131 * B;
      } else if (f === 'night') {
        r = r * 0.45;
        g = g * 0.6 + 8;
        b = b * 0.85 + 32;
      } else if (f === 'warm') {
        r += 20;
        g += 6;
        b -= 22;
      } else if (f === 'cool') {
        r -= 16;
        g += 2;
        b += 24;
      } else if (f === 'faded') {
        const G = 0.299 * r + 0.587 * g + 0.114 * b;
        r = (G + (r - G) * 0.55) * 0.8 + 34;
        g = (G + (g - G) * 0.55) * 0.8 + 30;
        b = (G + (b - G) * 0.55) * 0.8 + 40;
      }
      r += br;
      g += br;
      b += br;
      r = cf * (r - 128) + 128;
      g = cf * (g - 128) + 128;
      b = cf * (b - 128) + 128;
      let gy = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gy + (r - gy) * sat;
      g = gy + (g - gy) * sat;
      b = gy + (b - gy) * sat;
      const bay = o.dither ? row[x & 3] / 16 - 0.5 : 0;
      if (f === 'gameboy') {
        gy = 0.299 * r + 0.587 * g + 0.114 * b + bay * 85;
        const p = pal[Math.max(0, Math.min(3, Math.round(gy / 85)))];
        d[i] = p[0];
        d[i + 1] = p[1];
        d[i + 2] = p[2];
        continue;
      }
      if (f === 'mono') {
        gy = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gy;
        g = gy;
        b = gy;
      }
      const dith = bay * step;
      d[i] = clamp255(Math.round((r + dith) / step) * step);
      d[i + 1] = clamp255(Math.round((g + dith) / step) * step);
      d[i + 2] = clamp255(Math.round((b + dith) / step) * step);
    }
  }
}

/** 畫得進畫布的圖（寬高可讀） */
export type RetroSource = CanvasImageSource & { width: number; height: number };

export interface PixelateOptions extends RetroGradeOptions {
  /** 像素方塊的邊長（1 以上，取整數） */
  pixelSize: number;
  /** 取原圖的哪一塊（原圖 px）；不給時取「剛好蓋滿」的中央範圍 */
  crop?: Rect | null;
}

/** 剛好蓋滿 width × height 的中央範圍（原圖 px，不取整） */
export function coverCrop(
  img: { width: number; height: number },
  width: number,
  height: number,
): Rect {
  const ir = img.width / img.height;
  const tr = width / height;
  if (ir > tr) {
    const h = img.height;
    const w = h * tr;
    return { x: (img.width - w) / 2, y: 0, width: w, height: h };
  }
  const w = img.width;
  const h = w / tr;
  return { x: 0, y: (img.height - h) / 2, width: w, height: h };
}

/**
 * 像素化：原圖的 crop 範圍以畫布預設的平滑縮放縮成小圖（pixelGrid）→ retroGrade → 最近鄰放大成 width × height。
 * 小圖不設 willReadFrequently（與一般的畫布相同的縮放路徑）。
 */
export function pixelateImage(
  img: RetroSource,
  width: number,
  height: number,
  o: PixelateOptions,
): HTMLCanvasElement | OffscreenCanvas {
  const grid = pixelGrid(width, height, o.pixelSize);
  const small = makeCanvas(grid.width, grid.height);
  const sc = small.getContext('2d') as CanvasRenderingContext2D | null;
  if (!sc) throw new Error('無法建立畫布');
  const c = o.crop ?? coverCrop(img, width, height);
  sc.imageSmoothingEnabled = true;
  sc.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, grid.width, grid.height);
  const id = sc.getImageData(0, 0, grid.width, grid.height);
  retroGrade(id.data, grid.width, grid.height, o);
  sc.putImageData(id, 0, 0);
  const out = makeCanvas(width, height);
  const oc = out.getContext('2d') as CanvasRenderingContext2D | null;
  if (!oc) throw new Error('無法建立畫布');
  oc.imageSmoothingEnabled = false;
  oc.drawImage(small, 0, 0, grid.width, grid.height, 0, 0, width, height);
  return out;
}
