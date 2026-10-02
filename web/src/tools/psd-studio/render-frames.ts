/**
 * 單圖檢視器的大畫面（F70）：全解析度、調色後的影格轉成 ImageBitmap（Worker 與主執行緒共用）。
 * 調色與匯出用同一個函式（adjust.ts），所以畫面與匯出的 PNG 逐像素相同。
 */
import { applyAdjust, compileAdjust } from './adjust';
import type { AdjustInput, DecodedImage } from './process';

export interface RenderedFrames {
  width: number;
  height: number;
  /** 全部格數 */
  count: number;
  delays: number[];
  apng: boolean;
  /** 依 indices 的順序 */
  indices: number[];
  bitmaps: ImageBitmap[];
}

export async function renderFrames(
  d: DecodedImage,
  adjust: AdjustInput | null,
  indices: readonly number[],
): Promise<RenderedFrames> {
  const c = adjust ? compileAdjust(adjust.global, adjust.asset) : null;
  const list = indices.filter((i) => i >= 0 && i < d.frames.length);
  const bitmaps: ImageBitmap[] = [];
  for (const i of list) {
    const rgba = d.frames[i].slice();
    if (c) applyAdjust(rgba, c);
    bitmaps.push(await createImageBitmap(new ImageData(rgba, d.width, d.height)));
  }
  return {
    width: d.width,
    height: d.height,
    count: d.frames.length,
    delays: d.delays,
    apng: d.apng,
    indices: list,
    bitmaps,
  };
}
