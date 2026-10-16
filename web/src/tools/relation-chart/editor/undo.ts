/**
 * 復原／重做（磁鐵跑著時先停下來，免得模擬接著改已經復原的內容）。
 * 分頁庫不在復原裡（原作；7.4 第 14 項）：復原、重做之後分頁庫照舊是現在的內容（刪掉分頁時封存的那一筆也留著）。
 */
import { untracked, useProject } from '../state/store';
import { stopSim, withoutReheat } from './sim';

function keepSheetLib(fn: () => void): void {
  const lib = useProject.getState().data.sheetLib;
  fn();
  if (useProject.getState().data.sheetLib !== lib)
    untracked(() =>
      useProject.getState().update((p) => {
        p.sheetLib = lib as typeof p.sheetLib;
      }),
    );
}

export function undo(): void {
  stopSim();
  withoutReheat(() => keepSheetLib(() => useProject.temporal.getState().undo()));
}

export function redo(): void {
  stopSim();
  withoutReheat(() => keepSheetLib(() => useProject.temporal.getState().redo()));
}
