/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 世界觀的「沿用」（F191；原作 buildLoreContent 的來源解析）：只一層，指到不在的分頁＝本分頁自己的內容。
 */
import { richIsEmpty } from '../logic/rich';
import type { Sheet } from './types';

/** 能被沿用的分頁：有自己的內容、而且自己沒有在沿用別人（只一層，不會連鎖） */
export const loreSources = (sheets: readonly Sheet[], self: Sheet): Sheet[] =>
  sheets.filter((s) => s.id !== self.id && s.loreFrom === null && !richIsEmpty(s.lore));

/** 這張分頁實際顯示的世界觀：沿用＝來源分頁自己的；來源不在了＝本分頁自己的 */
export function loreOf(
  sheets: readonly Sheet[],
  s: Sheet,
): { html: string; from: Sheet | null; gone: boolean } {
  if (s.loreFrom === null) return { html: s.lore ?? '', from: null, gone: false };
  const src = sheets.find((x) => x.id === s.loreFrom);
  if (!src) return { html: s.lore ?? '', from: null, gone: true };
  return { html: src.lore ?? '', from: src, gone: false };
}
