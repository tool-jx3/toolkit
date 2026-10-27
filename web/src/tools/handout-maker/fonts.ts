/**
 * 字型（規格 F05、3.4）：主題預設＋10 套繁中字型（黑體、明體、手寫、圓體、像素、等寬）。
 * Google 字型只下載用到的字（共用的 loadSceneFonts）；像素字型是本站附帶的（core/fonts/bundled，選到才下載）。
 * 網頁字型載好之後計數加 1，預覽依它重畫。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import {
  BUNDLED_FONTS,
  type BundledFontId,
  isBundledFontLoaded,
  loadBundledFont,
} from '@/core/fonts/bundled';
import { clearTextCache, type FontUse, loadSceneFonts } from '@/core/scene';
import type { ConcreteFontId } from './model';

export interface FontSpec {
  /** canvas 用的字型名稱（Google 字型或本站附帶字型註冊的名稱） */
  family: string;
  /** 本站附帶的字型 */
  bundled?: BundledFontId;
  /** 預設字重與粗體的字重（沒有粗體的字型由瀏覽器加粗） */
  regular: number;
  bold: number;
}

export const FONT_SPECS: Record<ConcreteFontId, FontSpec> = {
  'noto-sans': { family: 'Noto Sans TC', regular: 400, bold: 700 },
  chocolate: { family: 'Chocolate Classical Sans', regular: 400, bold: 700 },
  'noto-serif': { family: 'Noto Serif TC', regular: 400, bold: 700 },
  cactus: { family: 'Cactus Classical Serif', regular: 400, bold: 700 },
  wenkai: { family: 'LXGW WenKai TC', regular: 400, bold: 700 },
  iansui: { family: 'Iansui', regular: 400, bold: 700 },
  huninn: { family: 'Huninn', regular: 400, bold: 700 },
  cubic: { family: BUNDLED_FONTS['cubic-11'].family, bundled: 'cubic-11', regular: 400, bold: 700 },
  fusion: {
    family: BUNDLED_FONTS['fusion-pixel-10'].family,
    bundled: 'fusion-pixel-10',
    regular: 400,
    bold: 700,
  },
  'wenkai-mono': { family: 'LXGW WenKai Mono TC', regular: 400, bold: 700 },
};

/** 主題固定用的字型（裝飾文字：視窗標題列、報頭、通緝令的大字） */
export const DECOR_SANS = 'Noto Sans TC';
export const DECOR_SERIF = 'Noto Serif TC';

/** 一份畫面要用的字（字型＋字重＋字） */
export type FontNeed = FontUse;

const bundledOf = (family: string): BundledFontId | undefined =>
  Object.values(FONT_SPECS).find((f) => f.family === family)?.bundled;

/**
 * 載入字型：本站附帶的字型整套下載、Google 字型只下載用到的字。
 * 有新載入的字型時清掉字寬快取並回傳 true（呼叫端重排、重畫）。
 */
export async function loadFonts(needs: readonly FontNeed[]): Promise<boolean> {
  let changed = false;
  const google: FontNeed[] = [];
  const bundled = new Set<BundledFontId>();
  for (const n of needs) {
    const b = bundledOf(n.family);
    if (b) bundled.add(b);
    else google.push(n);
  }
  await Promise.all(
    [...bundled].map(async (id) => {
      if (isBundledFontLoaded(id)) return;
      if (await loadBundledFont(id)) changed = true;
    }),
  );
  if (changed) clearTextCache();
  if (google.length && (await loadSceneFonts(google))) changed = true;
  return changed;
}

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));
export const bumpFontTick = (): void => useTick.setState((s) => ({ tick: s.tick + 1 }));

/** 字型載入的計數（放進畫圖的依賴，載好後重畫） */
export function useFontTick(): number {
  return useTick((s) => s.tick);
}

/**
 * 確保這組字型載好（載好後計數加 1）。計數是全頁共用的：打字很快、這次的載入在下一次之後才完成時也照樣加 1
 * （不然新的字載好了卻沒有重畫）。
 */
export function useEnsureFonts(needs: readonly FontNeed[]): void {
  const key = needs.map((x) => `${x.family}|${x.weight}|${x.text}`).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已包含 needs 的內容
  useEffect(() => {
    void loadFonts(needs)
      .catch(() => false)
      .then((changed) => {
        if (changed) bumpFontTick();
      });
  }, [key]);
}
