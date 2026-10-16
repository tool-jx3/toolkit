/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 分頁庫（F027；原作的 restoreSheetFromLibrary、renderSheetLibList 的三個模式）：
 * - 匯入當前：把封存的分頁加成新分頁並切過去（條目留著，可以連續匯入；加分頁本身可以復原）。
 * - 複製：在它後面插一份「名稱（複製）」；刪除：從分頁庫移除；拖曳排序。
 *   這三個是分頁庫的管理動作，照原作不進復原（7.4 第 14 項）。
 */
import type { Sheet } from '../model/types';
import { S } from '../strings';
import { importSheetFrom, sheetChangedUi } from './actions';
import { reorderIn } from './libActions';
import { projectNow, setUi, untracked, updateProject, useUi } from './store';

/** 匯入當前：還原成新分頁（回傳有沒有成功） */
export function restoreFromSheetLib(itemId: number): boolean {
  const it = projectNow().sheetLib.find((x) => x.id === itemId);
  if (!it || useUi.getState().readonly) return false;
  updateProject((p) => {
    const src = p.sheetLib.find((x) => x.id === itemId);
    if (!src) return;
    const sheet = JSON.parse(JSON.stringify(src.sheet)) as Sheet;
    p.active = importSheetFrom(p, sheet, p);
  });
  const u = useUi.getState();
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    ...sheetChangedUi(),
    fitTick: u.fitTick + 1,
  });
  return true;
}

/** 複製一份（插在它後面；新的 id，時間照原本那一筆，原作 sheetLibCopy） */
export function copySheetLibItem(itemId: number): void {
  untracked(() =>
    updateProject((p) => {
      const i = p.sheetLib.findIndex((x) => x.id === itemId);
      if (i < 0) return;
      const src = p.sheetLib[i];
      p.sheetLib.splice(i + 1, 0, {
        id: p.nextId++,
        name: `${src.name}${S.sheetLib.copySuffix}`.slice(0, 200),
        savedAt: src.savedAt,
        sheet: JSON.parse(JSON.stringify(src.sheet)) as Sheet,
      });
    }),
  );
}

/** 從分頁庫移除（不確認、不進復原，原作） */
export function deleteSheetLibItems(ids: readonly number[]): void {
  const set = new Set(ids);
  untracked(() =>
    updateProject((p) => {
      p.sheetLib = p.sheetLib.filter((x) => !set.has(x.id));
    }),
  );
}

/** 拖曳排序（groupIds＝畫面上的順序；不進復原） */
export function reorderSheetLib(groupIds: readonly number[], from: number, to: number): void {
  untracked(() =>
    updateProject((p) => {
      p.sheetLib = reorderIn(p.sheetLib, groupIds, from, to);
    }),
  );
}
