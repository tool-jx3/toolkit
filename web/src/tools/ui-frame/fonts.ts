/**
 * 字型（規格 F17）：六種方向，都能顯示繁體中文。西文字型配一套中文字型（中文字落到第二套）；
 * 像素用本站附帶的俐方體 11 號（只在選到時下載）。Google Fonts 只下載畫面上用到的字。
 */
import { ensureFont, FALLBACK_STACK } from '@/core/fonts';
import { bundledFontStack, loadBundledFont } from '@/core/fonts/bundled';
import type { FontId } from './model';

interface FontSpec {
  /** Google Fonts 的字型（依序，第一套是西文或主要字型） */
  google: { family: string; weight: number }[];
  /** 本站附帶的字型 */
  bundled?: 'cubic-11';
  /** ctx.font 用的字重 */
  weight: number;
  /** 補字的字型類別 */
  generic: 'serif' | 'sans-serif' | 'monospace';
}

export const FONT_SPECS: Record<FontId, FontSpec> = {
  serif: {
    google: [
      { family: 'Cinzel', weight: 700 },
      { family: 'Noto Serif TC', weight: 700 },
    ],
    weight: 700,
    generic: 'serif',
  },
  round: { google: [{ family: 'Huninn', weight: 400 }], weight: 400, generic: 'sans-serif' },
  future: {
    google: [
      { family: 'Orbitron', weight: 700 },
      { family: 'Noto Sans TC', weight: 700 },
    ],
    weight: 700,
    generic: 'sans-serif',
  },
  mincho: {
    google: [{ family: 'Chiron Sung HK', weight: 700 }],
    weight: 700,
    generic: 'serif',
  },
  sans: { google: [{ family: 'Noto Sans TC', weight: 700 }], weight: 700, generic: 'sans-serif' },
  pixel: { google: [], bundled: 'cubic-11', weight: 400, generic: 'monospace' },
};

/** ctx.font 的字型堆疊 */
export function fontStack(id: FontId): string {
  const s = FONT_SPECS[id];
  if (s.bundled) return bundledFontStack(s.bundled, FALLBACK_STACK);
  return `${s.google.map((g) => `"${g.family}"`).join(', ')}, ${FALLBACK_STACK}`;
}

/** ctx.font（size 以目前座標系的 px 計） */
export function fontCssOf(id: FontId, size: number, weight?: number): string {
  return `${weight ?? FONT_SPECS[id].weight} ${size}px ${fontStack(id)}`;
}

/** 載入字型；text 是會畫到的字（Google Fonts 的中日韓字型只下載這些字） */
export async function loadFont(id: FontId, text: string): Promise<boolean> {
  const s = FONT_SPECS[id];
  if (s.bundled) return loadBundledFont(s.bundled);
  const sample = `${text}AaBb0123`;
  const results = await Promise.all(
    s.google.map((g) => ensureFont(g.family, g.weight, sample, { timeoutMs: 6000 })),
  );
  return results.every(Boolean);
}
