/**
 * 立繪尺寸統一器的規則（純函式，不依賴 React／DOM），依規格 docs/refactor/specs/portrait-size.md 第 3 節。
 */
import { type ImageKind, opaqueBounds, type PixelBuffer, type Rect } from '@/core/image';

/** 可以處理的來源格式 */
export type SourceKind = 'png' | 'webp';

/**
 * 判斷檔案能不能收：依檔頭辨認 PNG（含 APNG）與 WebP（沒有副檔名也能收，主控核准的改善），
 * 或瀏覽器回報的類型是 PNG／WebP（類型對但內容損壞的檔案照收，到處理時才報錯）。其他類型拒收。
 */
export function sourceKind(header: ImageKind | null, mime: string): SourceKind | null {
  if (header === 'png' || header === 'apng') return 'png';
  if (header === 'webp') return 'webp';
  const t = mime.toLowerCase();
  if (header === null && t === 'image/png') return 'png';
  if (header === null && t === 'image/webp') return 'webp';
  return null;
}

/**
 * 去除透明留白（3.1）：透明度大於 0 的像素（1/255 也算）的最小外接矩形。
 * 整張完全透明時不裁（回傳整張）。trim 關閉時也回傳整張。
 */
export function contentRect(pixels: PixelBuffer, trim: boolean): Rect {
  const full = { x: 0, y: 0, width: pixels.width, height: pixels.height };
  if (!trim) return full;
  return opaqueBounds(pixels, 0) ?? full;
}

export interface Placement {
  /** 從原圖取的範圍 */
  crop: Rect;
  /** 輸出尺寸 */
  width: number;
  height: number;
  /** 內容在輸出裡的左邊位置（上方一律為 0） */
  offsetX: number;
}

/**
 * 寬度對齊（3.2）：目標寬度＝這一批裡最寬的寬度；較窄的放到「目標寬 × 原高」的透明畫布上水平置中，
 * 左邊留白＝（目標寬 − 圖寬）÷ 2 無條件捨去（多出來的 1 px 在右邊）。不縮放、不改高度。
 */
export function placeAll(crops: readonly Rect[], align: boolean): Placement[] {
  const target = crops.reduce((w, r) => Math.max(w, r.width), 0);
  return crops.map((crop) => {
    const width = align ? target : crop.width;
    return {
      crop,
      width,
      height: crop.height,
      offsetX: Math.floor((width - crop.width) / 2),
    };
  });
}

/**
 * 依配置把原圖的像素搬到輸出（測試與不經過 canvas 的處理用）。
 * 完全透明的像素一律輸出 (0, 0, 0, 0)；其他像素原值不變。
 */
export interface RgbaBuffer {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

export function composePixels(src: PixelBuffer, p: Placement): RgbaBuffer {
  const out = new Uint8ClampedArray(p.width * p.height * 4);
  for (let y = 0; y < p.crop.height; y++) {
    for (let x = 0; x < p.crop.width; x++) {
      const si = ((p.crop.y + y) * src.width + p.crop.x + x) * 4;
      if (src.data[si + 3] === 0) continue;
      const di = (y * p.width + p.offsetX + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { data: out, width: p.width, height: p.height };
}

/* ---------- 輸出格式與檔名（3.4、3.5） ---------- */

export interface OutputOptions {
  /** 一律輸出 WebP */
  webp: boolean;
  /** WebP 品質：無損，或自選 50～100（%） */
  quality: 'lossless' | number;
}

export const QUALITY_RANGE = { min: 50, max: 100, default: 90 } as const;

export interface OutputSpec {
  mime: 'image/png' | 'image/webp';
  /** canvas.toBlob 的品質參數（WebP：1 為無損） */
  quality?: number;
  ext: 'png' | 'webp';
  lossless: boolean;
}

/**
 * 轉 WebP：無損或品質 100% → 無損 WebP；50～99% → 有損 WebP。
 * 不轉 WebP：PNG 輸出 PNG；WebP 輸出無損 WebP（不看品質設定）。
 * 瀏覽器不能編碼 WebP（Safari）時一律改成 PNG。
 */
export function outputSpec(kind: SourceKind, o: OutputOptions, webpSupported = true): OutputSpec {
  if (!webpSupported) return { mime: 'image/png', ext: 'png', lossless: true };
  if (o.webp) {
    const q = o.quality === 'lossless' ? 100 : Math.round(o.quality);
    const clamped = Math.min(QUALITY_RANGE.max, Math.max(QUALITY_RANGE.min, q));
    return { mime: 'image/webp', quality: clamped / 100, ext: 'webp', lossless: clamped >= 100 };
  }
  if (kind === 'webp') return { mime: 'image/webp', quality: 1, ext: 'webp', lossless: true };
  return { mime: 'image/png', ext: 'png', lossless: true };
}

/**
 * 輸出檔名：去掉最後一個副檔名再接上新的。
 * 「立繪.v2.final.png」→「立繪.v2.final.webp」；沒有「.」時整個保留；只有副檔名（「.png」）時保留原名（「.png.webp」）。
 */
export function outputName(name: string, ext: string): string {
  const i = name.lastIndexOf('.');
  const base = i > 0 ? name.slice(0, i) : name;
  return `${base}.${ext}`;
}
