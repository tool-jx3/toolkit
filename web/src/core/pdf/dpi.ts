/**
 * 解析度的換算（純函式）。
 *
 * - 影像在頁面上的大小（英吋）由頁面內容的轉換矩陣算出（`placements.ts`）；有效 DPI ＝ 像素 ÷ 英吋。
 * - 一張圖用在好幾個地方時，取最大的那一個（最需要像素的地方）。
 * - 量不到大小（圖案、表單欄位裡等）或設定不看 DPI 時，改用長邊上限（QC 的做法；WP 的 DPI × 11.7）。
 */
import type { ImageAttempt } from './levels';

/** 影像在頁面上最大的顯示大小（英吋；寬是影像 x 方向、高是 y 方向，旋轉也照這兩個方向量） */
export interface Placement {
  widthIn: number;
  heightIn: number;
}

/** 有效 DPI 只超過上限一點點時不縮（重新取樣的損失比省下的多）：超過 10% 才縮（自訂） */
export const DPI_TOLERANCE = 1.1;

export interface TargetSize {
  width: number;
  height: number;
  /** 依什麼縮的：dpi（有效解析度）、long-edge（長邊上限）、none（不縮） */
  by: 'dpi' | 'long-edge' | 'none';
}

/** 有效 DPI（取兩個方向中較低的；量不到時 null） */
export function effectiveDpi(width: number, height: number, p: Placement | null): number | null {
  if (!p || !(p.widthIn > 0) || !(p.heightIn > 0)) return null;
  return Math.min(width / p.widthIn, height / p.heightIn);
}

/**
 * 依設定算出要縮成多大（不放大）。
 * - 量得到大小且設定有 DPI：兩個方向都至少留 DPI × 英吋的像素（等比縮放，取需要較多的那個方向）。
 * - 否則看長邊上限。
 */
export function targetSize(
  width: number,
  height: number,
  placement: Placement | null,
  attempt: Pick<ImageAttempt, 'dpi' | 'longEdge'>,
  tolerance = DPI_TOLERANCE,
): TargetSize {
  const none: TargetSize = { width, height, by: 'none' };
  if (width <= 0 || height <= 0) return none;
  const known = placement && placement.widthIn > 0 && placement.heightIn > 0;
  if (known && attempt.dpi > 0) {
    const s = Math.max(
      (attempt.dpi * placement.widthIn) / width,
      (attempt.dpi * placement.heightIn) / height,
    );
    if (s * tolerance >= 1) return none;
    return scaled(width, height, s, 'dpi');
  }
  if (attempt.longEdge > 0) {
    const long = Math.max(width, height);
    if (long <= attempt.longEdge) return none;
    return scaled(width, height, attempt.longEdge / long, 'long-edge');
  }
  return none;
}

function scaled(width: number, height: number, s: number, by: TargetSize['by']): TargetSize {
  const w = Math.max(1, Math.round(width * s));
  const h = Math.max(1, Math.round(height * s));
  if (w >= width && h >= height) return { width, height, by: 'none' };
  return { width: Math.min(w, width), height: Math.min(h, height), by };
}

/**
 * 整頁轉圖：這一輪畫出來的檔案還不比目標小時，下一輪用的 DPI（WP 的 targetRasterDpi；WP 的目標是原檔的大小，
 * 本站是原檔與只整理結構的結果中小的那個）。JPEG 的大小約和像素數（DPI²）成正比，所以 DPI 乘上
 * √(目標 × ratio ÷ 這一輪的大小)；一定比這一輪低，最低 minDpi。
 */
export function nextRasterDpi(
  currentDpi: number,
  currentSize: number,
  target: number,
  { ratio = 0.8, minDpi = 50 }: { ratio?: number; minDpi?: number } = {},
): number {
  const factor = currentSize > 0 ? Math.sqrt((ratio * target) / currentSize) : 1;
  const next = Math.floor(currentDpi * factor);
  return Math.max(minDpi, Math.min(next, currentDpi - 1));
}

/** 整頁轉圖時一頁最多幾個像素（太大的頁面〔海報〕降低那一頁的 DPI；自訂） */
export const RASTER_MAX_PIXELS = 25_000_000;

/** 一頁（寬 × 高，單位 pt）在 dpi 下的像素不超過 maxPixels 時能用的 DPI */
export function pageRasterDpi(
  widthPt: number,
  heightPt: number,
  dpi: number,
  maxPixels = RASTER_MAX_PIXELS,
): number {
  const px = ((widthPt * dpi) / 72) * ((heightPt * dpi) / 72);
  if (!(px > maxPixels)) return dpi;
  return Math.max(1, Math.floor(dpi * Math.sqrt(maxPixels / px)));
}
