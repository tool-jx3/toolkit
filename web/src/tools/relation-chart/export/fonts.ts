/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯出時內嵌的匯入字型（原作的 usedFontHashes、fontEmbedInto）：只放用到的（文件字型＋這些分頁角色的字型）。
 */
import { importedFamily } from '../engine/geom';
import type { FontItem, FontValue, Sheet } from '../model/types';

/** 實際用到的匯入字型 id：只算庫裡有、而且讀得到檔案的 */
export function usedFontIds(
  sheets: readonly Sheet[],
  input: {
    font: FontValue;
    fonts?: readonly FontItem[];
    uris: ReadonlyMap<string, string>;
  },
): string[] {
  const have = new Set((input.fonts ?? []).map((f) => f.id));
  const out = new Set<string>();
  const add = (v: string) => {
    if (!v.startsWith('f:')) return;
    const id = v.slice(2);
    if (have.has(id) && input.uris.has(id)) out.add(id);
  };
  add(input.font);
  for (const s of sheets) for (const c of s.chars) if (c.font) add(c.font);
  return [...out];
}

/** 內嵌的 @font-face（PNG 是 SVG 放進 <img> 點陣化：頁面上註冊的字型帶不進去，一定要 data URI） */
export const fontFaceCss = (ids: readonly string[], uris: ReadonlyMap<string, string>): string =>
  ids
    .map(
      (id) => `@font-face{font-family:"${importedFamily(id)}";src:url("${uris.get(id) ?? ''}");}`,
    )
    .join('\n');
