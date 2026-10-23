/**
 * 字型（規格 F41、3.5、D2）：本站附帶的兩套繁中像素字型（只在選到時下載）＋系統等寬字型。
 * 像素字型沒有的字（例如俐方體的「▶ ♥」）由瀏覽器的等寬字型補。網頁字型載好之後計數加 1，預覽依它重畫。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  BUNDLED_FONTS,
  type BundledFontId,
  bundledFontStack,
  isBundledFontLoaded,
  loadBundledFont,
} from '@/core/fonts/bundled';
import type { FontId } from './model';

const BUNDLE: Record<FontId, BundledFontId | null> = {
  cubic11: 'cubic-11',
  fusion10: 'fusion-pixel-10',
  mono: null,
};

/** ctx.font 的字型部分（系統等寬＝瀏覽器的 monospace，同原作的「系統等寬」） */
export const fontStack = (id: FontId): string => {
  const b = BUNDLE[id];
  return b ? bundledFontStack(b) : 'monospace';
};

/** 像素字型的格子大小（字級是它的整數倍時最清楚；系統字型 null） */
export const fontGridPx = (id: FontId): number | null => {
  const b = BUNDLE[id];
  return b ? BUNDLED_FONTS[b].gridPx : null;
};

/** 字型檔的大小（位元組；系統字型 null） */
export const fontBytes = (id: FontId): number | null => {
  const b = BUNDLE[id];
  return b ? BUNDLED_FONTS[b].bytes : null;
};

export const isFontReady = (id: FontId): boolean => {
  const b = BUNDLE[id];
  return b ? isBundledFontLoaded(b) : true;
};

/** 載入字型（系統字型直接 true）；失敗 false（用替代字型照樣畫） */
export function ensureFont(id: FontId): Promise<boolean> {
  const b = BUNDLE[id];
  return b ? loadBundledFont(b) : Promise.resolve(true);
}

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));

/** 選用的字型載好後計數加 1（放進畫圖的依賴） */
export function useFontTick(id: FontId): number {
  useEffect(() => {
    let alive = true;
    if (!isFontReady(id))
      void ensureFont(id).then(() => {
        if (alive) useTick.setState((s) => ({ tick: s.tick + 1 }));
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return useTick((s) => s.tick);
}
