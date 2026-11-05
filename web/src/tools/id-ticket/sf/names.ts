/**
 * SF 證件的名字產生器（規格 F92）：「產生名字」填名、姓（大寫），並依性別填稱謂 MR／MS（活動證）或性別 M／F（公民 ID）。
 * 原作連 randomuser.me 與 Behind the Name；本站不連外部服務，改用離線的 `@/core/names/corpus`（npc-names 的弄墨 Inknomu 語料，
 * CC BY 4.0）。地區對應原作的地區（D41）：英美、拉美、北歐、俄羅斯、日本、韓國（日韓印羅馬拼音）、台灣（中文字）、奇幻；
 * 「不限」從印得出英文字母的地區裡挑（不含台灣、奇幻，同原作的 any 不含 fantasy）。
 * 這個檔只有設定（存在預覽設定）；產生的程式與語料在 namegen.ts（按下「產生名字」才載入）。
 */
export const SF_NAME_REGIONS = [
  'any',
  'west',
  'latino',
  'nordic',
  'ru',
  'jp',
  'kr',
  'tw',
  'fantasy',
] as const;
export type SfNameRegion = (typeof SF_NAME_REGIONS)[number];
export type SfNameGender = 'any' | 'm' | 'f';

export const isSfNameRegion = (v: unknown): v is SfNameRegion =>
  (SF_NAME_REGIONS as readonly string[]).includes(v as string);

export interface SfName {
  given: string;
  surname: string;
  gender: 'm' | 'f';
}
