/**
 * 字型的提醒（規格 F30、D4）：選到不含繁中的 Google 字型（日文、韓文、只有英數字）時，缺的繁體字會用後備的黑體畫，
 * 在字型欄下方說一聲。依共用字型目錄（`@/core/fonts`）的語言資料判斷；電腦字型、上傳字型不判斷。
 */
import { type FontValue, findGoogleFont } from '@/core/fonts';
import { S } from './strings';

/** 選到不含繁中的 Google 字型時的提醒（字型目錄的語言資料；電腦字型、上傳字型不判斷） */
export function fontCoverageNote(font: FontValue): string | null {
  if (font.source !== 'google') return null;
  const entry = findGoogleFont(font.family);
  if (!entry) return null;
  const scripts: readonly string[] = entry.scripts;
  if (scripts.some((x) => x === 'tc' || x === 'hk' || x === 'bpmf')) return null;
  return S.fontNoTc(
    scripts.includes('jp') ? S.fontLangJp : scripts.includes('kr') ? S.fontLangKr : S.fontLangLatin,
  );
}
