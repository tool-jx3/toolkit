/**
 * 預覽、動畫預覽共用的 hook：用到的圖片（資產庫讀回；範例圖現畫）、卡片的版面（字型載好後重排）。
 */
import { useMemo } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { makeCanvas } from '@/core/image';
import { useFontTick } from './fonts';
import type { CardLayout } from './layout';
import { type CaptchaState, stateAssetIds } from './model';
import { type Ctx, type ImageResolver, layoutFor, resolverFrom } from './render';
import { assets } from './store';

export function useCardImages(d: CaptchaState): {
  resolve: ImageResolver;
  bitmaps: Map<string, ImageBitmap>;
  missing: string[];
  pending: number;
} {
  const ids = useMemo(() => stateAssetIds(d), [d]);
  const { bitmaps, missing, pending } = useAssetBitmaps(assets, ids);
  const resolve = useMemo(() => resolverFrom(bitmaps), [bitmaps]);
  return { resolve, bitmaps, missing, pending };
}

let probe: Ctx | null = null;
const probeCtx = (): Ctx => {
  if (!probe) probe = makeCanvas(1, 1).getContext('2d') as Ctx;
  return probe;
};

/** 卡片的版面（字型載好後重排）；也回傳字型的計數 */
export function useCardLayout(d: CaptchaState): { layout: CardLayout; tick: number } {
  const tick = useFontTick(d);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重排
  const layout = useMemo(() => layoutFor(probeCtx(), d), [d.cols, d.showFoot, d.verify, tick]);
  return { layout, tick };
}
