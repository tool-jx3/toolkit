/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 唯讀瀏覽模式（F117；原作的 setReadonly）：開關時取消選取、關掉面板與檔案庫、結束建立關係與交換位置。
 * 唯讀中：左右兩欄與檔案庫藏起來、編輯列只剩「檢視」選單與匯出、分頁列只能切換（7.4 第 10 項）；
 * 畫布只能平移、縮放、滑過聚焦、點角色／圖例聚焦（同互動網頁）。不存檔（重新整理後是一般模式）。
 */
import { setUi } from '../state/store';
import { closeNoteEditor } from './NoteEditor';

export function setReadonly(on: boolean): void {
  if (on) closeNoteEditor();
  setUi({
    readonly: on,
    sel: [],
    panel: null,
    link: null,
    swap: null,
    hover: null,
    statsFocus: null,
    noteEdit: null,
    libOpen: false,
    libMode: null,
    renaming: null,
  });
}
