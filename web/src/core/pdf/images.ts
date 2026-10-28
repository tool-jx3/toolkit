/**
 * 影像要不要重新壓縮、怎麼壓（純函式，輸入是從影像字典讀出來的事實）。
 *
 * JPEG（DCTDecode）照 QC 的規則：`/DCTDecode` 或 `[/FlateDecode /DCTDecode]`、8 位元、DeviceRGB／DeviceGray
 * 或 /N 是 3、1 的 ICCBased；CMYK（Adobe 的 APP14 反相）、其他色彩空間、不是 8 位元的不動。
 * 帶軟遮罩（/SMask）的照樣重新壓縮（遮罩本身不動，透明度照舊）；被別的影像拿來當遮罩的影像不動。
 *
 * 本站另外加的（D 項）：沒壓縮或 Flate 壓縮的大張影像，看起來像照片時轉成 JPEG（`convertFlate`）；
 * 有軟遮罩或遮罩、太小、看起來像圖表或截圖（顏色少、Flate 壓得很小）的不轉，保持無損。
 */
import type { ColorInfo } from './objects';

/** 影像字典裡讀出來的事實 */
export interface ImageFacts {
  width: number;
  height: number;
  bitsPerComponent: number;
  /** /Filter 的名稱清單 */
  filters: readonly string[];
  color: ColorInfo;
  /** 有 /SMask（軟遮罩） */
  hasSMask: boolean;
  /** /Mask 是顏色範圍的陣列（color key：重新壓縮會改到顏色，不動） */
  colorKeyMask: boolean;
  /** /Mask 是另一張遮罩影像 */
  stencilMask: boolean;
  /** /ImageMask true（1 位元的模板） */
  imageMask: boolean;
  /** DCT 的 /DecodeParms 有 /ColorTransform（顏色轉換跟 JPEG 檔頭不一樣，不動） */
  colorTransform: boolean;
  /** 存在檔案裡的大小（位元組） */
  storedBytes: number;
}

export type SkipReason =
  /** 不支援的壓縮方式（JPEG 2000、JBIG2、CCITT…） */
  | 'filter'
  /** 不是 8 位元 */
  | 'bits'
  /** 不支援的色彩空間（CMYK、Indexed、ICC 4 色…） */
  | 'colorspace'
  /** 顏色範圍遮罩 */
  | 'color-key'
  /** 1 位元的模板（ImageMask） */
  | 'image-mask'
  /** 被別的影像當成遮罩 */
  | 'used-as-mask'
  /** DCT 的 ColorTransform 參數 */
  | 'color-transform'
  /** 沒有寬高 */
  | 'no-size'
  /** 太大（像素太多，記憶體不夠） */
  | 'too-large'
  /** 不是 JPEG（只有轉換 Flate 影像打開時才處理） */
  | 'not-jpeg'
  /** Flate 影像有透明遮罩（保持無損） */
  | 'has-mask'
  /** Flate 影像太小 */
  | 'small'
  /** Flate 影像看起來像圖表、截圖（保持無損） */
  | 'graphic'
  /** 讀不出來（壞掉、和字典不一致） */
  | 'decode'
  /** 重新壓縮沒有比較小 */
  | 'not-smaller';

export type ImagePlan =
  | { kind: 'jpeg'; wrapped: boolean; gray: boolean }
  | { kind: 'flate'; compressed: boolean; gray: boolean }
  | { kind: 'skip'; reason: SkipReason };

/** 影像最多幾個像素（解碼成 RGBA 要 4 倍的記憶體；自訂） */
export const MAX_IMAGE_PIXELS = 50_000_000;
/** Flate 影像至少幾個像素才轉成 JPEG（約 300 × 300；自訂） */
export const FLATE_MIN_PIXELS = 90_000;
/** Flate 影像轉成 JPEG 至少要小這麼多才換（不到原本的 0.8 倍不換；自訂） */
export const FLATE_MAX_RATIO = 0.8;

export interface PlanOptions {
  convertFlate: boolean;
  usedAsMask: boolean;
  maxPixels?: number;
}

export function planImage(f: ImageFacts, opts: PlanOptions): ImagePlan {
  const skip = (reason: SkipReason): ImagePlan => ({ kind: 'skip', reason });
  if (opts.usedAsMask) return skip('used-as-mask');
  if (f.imageMask) return skip('image-mask');
  if (!(f.width > 0) || !(f.height > 0)) return skip('no-size');
  if (f.width * f.height > (opts.maxPixels ?? MAX_IMAGE_PIXELS)) return skip('too-large');
  const gray = f.color.kind === 'gray';
  const colorOk = f.color.kind === 'rgb' || gray;
  if (f.filters.includes('DCTDecode')) {
    let wrapped: boolean;
    if (f.filters.length === 1) wrapped = false;
    else if (f.filters.length === 2 && f.filters[0] === 'FlateDecode') wrapped = true;
    else return skip('filter');
    if (f.bitsPerComponent !== 8) return skip('bits');
    if (!colorOk) return skip('colorspace');
    if (f.colorTransform) return skip('color-transform');
    if (f.colorKeyMask) return skip('color-key');
    return { kind: 'jpeg', wrapped, gray };
  }
  if (!opts.convertFlate) return skip('not-jpeg');
  const compressed = f.filters.length === 1 && f.filters[0] === 'FlateDecode';
  if (f.filters.length > 0 && !compressed) return skip('filter');
  if (f.bitsPerComponent !== 8) return skip('bits');
  if (!colorOk) return skip('colorspace');
  if (f.hasSMask || f.stencilMask || f.colorKeyMask) return skip('has-mask');
  if (f.width * f.height < FLATE_MIN_PIXELS) return skip('small');
  return { kind: 'flate', compressed, gray };
}

/** 重新壓縮的結果換不換：JPEG 要比原本小；Flate 轉成 JPEG 要小到原本的 FLATE_MAX_RATIO 以下 */
export function acceptReplacement(plan: ImagePlan, storedBytes: number, newBytes: number): boolean {
  if (plan.kind === 'jpeg') return newBytes < storedBytes;
  if (plan.kind === 'flate') return newBytes <= storedBytes * FLATE_MAX_RATIO;
  return false;
}
