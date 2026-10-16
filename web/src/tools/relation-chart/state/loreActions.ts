/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 世界觀與備忘錄（F191；原作的 sh.lore、sh.loreFrom、sh.memo）：每張分頁一份。
 */
import { LORE_MAX, MEMO_MAX } from '../model/notes';
import { editSheet } from './actions';

/** 世界觀（淨化過的 HTML，編輯器寫進來的） */
export function setLore(html: string): void {
  editSheet((s) => {
    s.lore = html.slice(0, LORE_MAX);
  });
}

/** 沿用別的分頁（null＝本分頁自己的；只一層） */
export function setLoreFrom(id: number | null): void {
  editSheet((s) => {
    s.loreFrom = id !== null && id !== s.id ? id : null;
  });
}

/** 備忘錄（超過 2 萬字截斷） */
export function setMemo(text: string): void {
  editSheet((s) => {
    s.memo = text.slice(0, MEMO_MAX);
  });
}

export { loreOf, loreSources } from '../model/lore';
