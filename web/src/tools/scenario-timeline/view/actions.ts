/**
 * 工具列、快捷鍵共用的操作。
 */
import { matchingIds } from '../model/filter';
import { addEvent, docNow, filterOf, guard, prefsNow, useUi } from '../store';
import { currentWin, newEventStart, snapForWidth, visibleNow } from './shared';
import { timelineApi } from './Timeline';

/** 「＋事件」、N 鍵：時間軸的畫面中間（年表檢視時用記住的畫面範圍）、選取中的泳道 */
export function addEventNow(): void {
  if (!guard()) return;
  if (timelineApi.current) {
    timelineApi.current.addAtCenter();
    return;
  }
  const doc = docNow();
  const win = currentWin();
  const sel = useUi.getState().selectedId;
  const ev = sel ? doc.events.find((x) => x.id === sel) : undefined;
  const mid = (win.start + win.end) / 2;
  addEvent({
    start: newEventStart(doc.mode, mid, snapForWidth(doc.mode, win, 800, doc), doc),
    laneId: ev?.laneId ?? '',
  });
}

/**
 * Ctrl＋A（F90）：目前看得到的事件——時間軸是畫面範圍裡、符合篩選的；年表是列出來的（符合篩選的）全部。
 */
export function visibleSelectableIds(): string[] {
  if (timelineApi.current) return timelineApi.current.visibleIds();
  const vdoc = visibleNow();
  const ids = matchingIds(vdoc, filterOf(prefsNow()));
  return vdoc.events.filter((e) => !ids || ids.has(e.id)).map((e) => e.id);
}
