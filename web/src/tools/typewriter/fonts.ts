/**
 * 字型：12 套 Google 字型（規格 F03）＋電腦已安裝的字型（F04）。
 * 畫布用的字型堆疊：選定字型 → 替代字型（韓文字型遇到中文接思源黑／宋；遇到韓文接 Noto Sans／Serif KR）→ 通用字族。
 * 畫面與匯出前都要等字型載入（規格 5. 第 6 點）。
 */
import { ensureFont, findGoogleFont, nearestWeight } from '@/core/fonts';
import { canvasFont, type FontStack, fontStack, isHangul } from '@/core/typeset';
import { CUSTOM_FONT, FONT_FAMILIES } from './settings';

const SERIF = new Set([
  'Noto Serif KR',
  'Nanum Myeongjo',
  'Noto Serif TC',
  'Cactus Classical Serif',
]);
/** 韓文字型（多半沒有中文字）：遇到中文時接繁中替代字型 */
const KOREAN = new Set([
  'Noto Sans KR',
  'Noto Serif KR',
  'Nanum Gothic',
  'Nanum Myeongjo',
  'Jua',
  'Do Hyeon',
  'Black Han Sans',
]);

export interface FontSpec {
  font: string;
  customFont: string;
  bold: boolean;
  italic: boolean;
}

/** 字型選單的選項 */
export function fontOptions(customLabel: string): { value: string; label: string }[] {
  return [
    ...FONT_FAMILIES.map((f) => ({ value: f, label: findGoogleFont(f)?.label ?? f })),
    { value: CUSTOM_FONT, label: customLabel },
  ];
}

export const weightOf = (bold: boolean): number => (bold ? 700 : 400);

/** 這段文字實際要用的字型堆疊 */
export function stackFor(spec: FontSpec, text: string): FontStack {
  if (spec.font === CUSTOM_FONT) {
    const family = spec.customFont.trim();
    if (!family) return { families: [], generic: 'sans-serif' };
    return fontStack({ family, styleClass: 'sans' }, text);
  }
  return fontStack(
    {
      family: spec.font,
      styleClass: SERIF.has(spec.font) ? 'serif' : 'sans',
      latinOnly: KOREAN.has(spec.font),
    },
    text,
  );
}

/** 依字級回傳 canvas 的 font 字串 */
export function fontFn(spec: FontSpec, text: string): (px: number) => string {
  const stack = stackFor(spec, text);
  const w = weightOf(spec.bold);
  return (px) => canvasFont(stack, w, px, spec.italic);
}

export interface FontLoad {
  family: string;
  weight: number;
  text: string;
}

/** 要載入的字型（主字型用全部的字；韓文替代字型只載入韓文字） */
export function fontLoads(spec: FontSpec, text: string): FontLoad[] {
  const stack = stackFor(spec, text);
  const w = weightOf(spec.bold);
  const chars = [...new Set(Array.from(text))].join('');
  const hangul = [...new Set(Array.from(text).filter((c) => isHangul(c)))].join('');
  return stack.families.map((family, i) => {
    const entry = findGoogleFont(family);
    const weight = entry ? nearestWeight(entry.weights, w) : w;
    const isKrFallback = i > 0 && (family === 'Noto Sans KR' || family === 'Noto Serif KR');
    return { family, weight, text: isKrFallback ? hangul || '가' : chars || '永' };
  });
}

/** 載入字型（逾時或失敗就用替代字型，不會卡住） */
export async function loadFonts(loads: readonly FontLoad[], timeoutMs = 10000): Promise<void> {
  await Promise.all(
    loads.map((f) => ensureFont(f.family, f.weight, f.text, { timeoutMs }).catch(() => false)),
  );
}

export const fontKeyOf = (loads: readonly FontLoad[]): string =>
  loads.map((f) => `${f.family}|${f.weight}|${f.text}`).join('\n');
