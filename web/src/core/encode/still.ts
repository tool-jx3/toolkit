/**
 * 單張 PNG 的減色：整張圖統計顏色，色數在上限以內時無損（調色盤 PNG），超過時減到上限（含半透明）。
 * 減色演算法與 APNG 相同（palette.ts）。
 */
import { type RgbaPixels, toU32 } from './frames';
import { buildPalette, ColorStats, type PaletteMethod } from './palette';
import { type Bytes, type DeflateMode, encodePng } from './png';

export interface StillPngResult {
  bytes: Bytes;
  /** 減色資訊；maxColors ≤ 0（全彩 RGBA）時為 undefined */
  colors?: { lossless: boolean; count: number };
}

/**
 * 編一張 PNG。maxColors：0＝全彩 RGBA（無損）；2～256＝最多這麼多色的調色盤 PNG
 * （實際用到的顏色在上限以內時完全無損）。paletteMethod：減色時調色盤的選法（預設 'median-cut'）。
 * maxBytes：壓好的影像資料超過這麼多位元組就放棄，丟出 EncodeLimitError（預設不限；試編用）。
 */
export async function encodePngColors(
  rgba: RgbaPixels,
  width: number,
  height: number,
  maxColors = 0,
  deflate: DeflateMode = 'auto',
  paletteMethod: PaletteMethod = 'median-cut',
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<StillPngResult> {
  if (!(maxColors > 0))
    return { bytes: await encodePng(rgba, width, height, null, deflate, maxBytes) };
  const limit = Math.min(256, Math.max(2, Math.round(maxColors)));
  const u32 = toU32(rgba);
  const stats = new ColorStats(limit);
  stats.add(u32, 0, u32.length);
  const pal = buildPalette(stats, limit, paletteMethod);
  const idx = new Uint8Array(u32.length);
  let lastV = -1;
  let lastI = 0;
  for (let k = 0; k < u32.length; k++) {
    const v = u32[k];
    if (v !== lastV) {
      lastV = v;
      lastI = pal.indexOf(v);
    }
    idx[k] = lastI;
  }
  return {
    bytes: await encodePng(idx, width, height, pal.colors, deflate, maxBytes),
    colors: { lossless: pal.lossless, count: pal.count },
  };
}
