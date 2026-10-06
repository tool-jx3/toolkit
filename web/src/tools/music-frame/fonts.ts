/**
 * 字型（規格 5. D1）：六種字型對應本站從 Google Fonts 載入的字型；拉丁、像素、手寫、等寬字型沒有的中文字
 * 退回思源黑體。像素體與手寫體只有一種字重（一律用 400）。
 */
import { ensureFont, findGoogleFont } from '@/core/fonts';
import type { FontId } from './model';

export interface FontChoice {
  id: FontId;
  /** 主要的字型（Google Fonts 的名稱） */
  family: string;
  /** 中文退回的字型（Google Fonts；與主要字型相同時不另外載入） */
  cjk: string;
  /** 電腦字型的退路 */
  generic: string;
  /** 只有一種字重 */
  single: boolean;
}

const SANS_FALLBACK = '"Microsoft JhengHei", "PingFang TC", "Noto Sans CJK TC", sans-serif';
const SERIF_FALLBACK = '"PMingLiU", "Songti TC", "Noto Serif CJK TC", serif';
/** 等寬的退路：ui-monospace 只有 Safari 認得，Chromium、Firefox 要靠 monospace；中文再退回黑體 */
const MONO_FALLBACK = `ui-monospace, monospace, ${SANS_FALLBACK}`;

export const FONT_CHOICES: Record<FontId, FontChoice> = {
  sans: {
    id: 'sans',
    family: 'Noto Sans TC',
    cjk: 'Noto Sans TC',
    generic: SANS_FALLBACK,
    single: false,
  },
  serif: {
    id: 'serif',
    family: 'Noto Serif TC',
    cjk: 'Noto Serif TC',
    generic: SERIF_FALLBACK,
    single: false,
  },
  latin: {
    id: 'latin',
    family: 'Inter',
    cjk: 'Noto Sans TC',
    generic: SANS_FALLBACK,
    single: false,
  },
  pixel: {
    id: 'pixel',
    family: 'DotGothic16',
    cjk: 'Noto Sans TC',
    generic: MONO_FALLBACK,
    single: true,
  },
  hand: { id: 'hand', family: 'Iansui', cjk: 'Noto Sans TC', generic: SANS_FALLBACK, single: true },
  mono: {
    id: 'mono',
    family: 'Roboto Mono',
    cjk: 'Noto Sans TC',
    generic: MONO_FALLBACK,
    single: false,
  },
};

/* 開發時就確認字型都在共用目錄裡 */
for (const c of Object.values(FONT_CHOICES)) {
  if (!findGoogleFont(c.family) || !findGoogleFont(c.cjk))
    throw new Error(`字型目錄裡沒有 ${c.family}／${c.cjk}`);
}

/** canvas 的 font-family 堆疊 */
export function fontStack(id: FontId): string {
  const c = FONT_CHOICES[id];
  const list = c.family === c.cjk ? [c.family] : [c.family, c.cjk];
  return `${list.map((f) => `"${f}"`).join(', ')}, ${c.generic}`;
}

/** 實際的字重（只有一種字重的字型一律 400） */
export const weightFor = (id: FontId, weight: number) => (FONT_CHOICES[id].single ? 400 : weight);

/** canvas 的 font 字串 */
export const fontCss = (id: FontId, weight: number, size: number) =>
  `${weightFor(id, weight)} ${size}px ${fontStack(id)}`;

/** 畫面會用到的字重 */
const WEIGHTS = [400, 500, 600, 700];

/**
 * 載入畫面要用的字型（只下載 text 用到的字）；回傳主要字型是否載入成功。
 */
export async function loadFrameFonts(id: FontId, text: string): Promise<boolean> {
  const c = FONT_CHOICES[id];
  const sample = text || 'Aa';
  const weights = c.single ? [400] : WEIGHTS;
  const main = await Promise.all(weights.map((w) => ensureFont(c.family, w, sample)));
  if (c.cjk !== c.family) await Promise.all(WEIGHTS.map((w) => ensureFont(c.cjk, w, sample)));
  return main.some(Boolean);
}
