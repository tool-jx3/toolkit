/**
 * 工具列、快捷鍵共用的操作。
 */
import { addEvent, docNow, guard, useUi } from '../store';
import { currentWin, newEventStart, snapForWidth } from './shared';
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
    start: newEventStart(doc.mode, mid, snapForWidth(doc.mode, win, 800)),
    laneId: ev?.laneId ?? '',
  });
}
