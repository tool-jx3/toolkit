/**
 * 畫布用的字型字串：主字型＋依文字自動加入的替代字型＋通用字族。
 *
 * - 西文字型（沒有中文字）遇到中文時，自動接上同風格（襯線／無襯線）的繁中字型；
 * - 遇到韓文時接上同風格的韓文字型（中文字型通常沒有韓文）；
 * - 最後是 serif／sans-serif。
 *
 * 移植自 text-fx（本專案原創，MIT）的 fonts.js。字型實際的下載與等待用 core/fonts 的 ensureFont。
 */

export type FontStyleClass = 'serif' | 'sans';

export interface StackFont {
  /** CSS 的 font-family 名稱（Google 字型名稱、電腦字型名稱或上傳字型註冊的名稱） */
  family: string;
  /** 替代字型與通用字族的風格 */
  styleClass: FontStyleClass;
  /** 只有拉丁字母（遇到中文要接替代字型） */
  latinOnly?: boolean;
}

export interface FallbackFamilies {
  cjk: Record<FontStyleClass, string>;
  korean: Record<FontStyleClass, string>;
}

export const DEFAULT_FALLBACKS: FallbackFamilies = {
  cjk: { serif: 'Noto Serif TC', sans: 'Noto Sans TC' },
  korean: { serif: 'Noto Serif KR', sans: 'Noto Sans KR' },
};

const RE_HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/;
/** \u62c9\u4e01\u5b57\u6bcd\u3001\u4e00\u822c\u6a19\u9ede\u3001\u8ca8\u5e63\u3001\u5b57\u6bcd\u5f0f\u7b26\u865f\u4ee5\u5916\u7684\u5b57 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: \u7bc4\u570d\u5f9e U+0000 \u958b\u59cb\u662f\u523b\u610f\u7684
const RE_NON_LATIN = /[^\u0000-\u024f\u2000-\u206f\u20a0-\u20cf\u2100-\u214f]/;

export interface FontStack {
  /** 依序：主字型、替代字型 */
  families: string[];
  generic: 'serif' | 'sans-serif';
}

/** 這段文字用這個字型時，實際要排進字型堆疊的字族 */
export function fontStack(
  font: StackFont,
  text: string,
  fallbacks: FallbackFamilies = DEFAULT_FALLBACKS,
): FontStack {
  const style = font.styleClass === 'serif' ? 'serif' : 'sans';
  const families = [font.family];
  if (font.latinOnly && RE_NON_LATIN.test(text)) families.push(fallbacks.cjk[style]);
  if (RE_HANGUL.test(text)) families.push(fallbacks.korean[style]);
  return { families, generic: style === 'serif' ? 'serif' : 'sans-serif' };
}

/** canvas 的 font 字串：'italic 700 48.00px "A", "B", serif' */
export function canvasFont(stack: FontStack, weight: number, size: number, italic = false): string {
  const fams = stack.families
    .map((f) => `"${f.replace(/["\\]/g, '')}"`)
    .concat(stack.generic)
    .join(', ');
  return `${italic ? 'italic ' : ''}${weight} ${Math.max(1, size).toFixed(2)}px ${fams}`;
}

/** 最接近的字重；距離相同時取比較粗的 */
export function nearestWeightUp(weights: readonly number[], wanted: number): number {
  let best = weights[0] ?? 400;
  for (const x of weights) {
    const d = Math.abs(x - wanted);
    const bd = Math.abs(best - wanted);
    if (d < bd || (d === bd && x > best)) best = x;
  }
  return best;
}
