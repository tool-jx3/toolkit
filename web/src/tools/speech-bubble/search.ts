/**
 * 範本的搜尋與篩選（規格 F02～F05）：比對名稱、分類、造型名稱與泡泡裡的文字。
 * 不分大小寫，全形英數與半形相同（NFKC），多個關鍵字以空白分隔、全部都要符合。
 */

import type { CategoryId, Preset } from './presets';
import { CATEGORY_NAMES, STYLE_NAMES } from './strings';

export const normalizeQuery = (s: string): string => s.normalize('NFKC').toLocaleLowerCase('zh-TW');

/** 範本可以被搜尋到的文字 */
export function presetHaystack(p: Preset): string {
  return normalizeQuery(
    [
      p.name,
      CATEGORY_NAMES[p.category],
      ...new Set(p.bubbles.map((b) => STYLE_NAMES[b.style])),
      ...p.bubbles.flatMap((b) => [b.title ?? '', b.text ?? '', b.button ?? '']),
    ].join(' '),
  );
}

export function matchPreset(p: Preset, query: string): boolean {
  const words = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = presetHaystack(p);
  return words.every((w) => hay.includes(w));
}

/** 分類（'all'＝全部）＋搜尋 */
export function filterPresets(
  list: readonly Preset[],
  category: CategoryId | 'all',
  query: string,
): Preset[] {
  return list.filter(
    (p) => (category === 'all' || p.category === category) && matchPreset(p, query),
  );
}
