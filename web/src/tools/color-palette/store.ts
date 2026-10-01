/**
 * 設定的 store：自動存檔＋復原／重做（主控裁定：核准加上，屬刻意改善）。
 * 取色視窗的圖片不存（每次開啟都清掉，見 PickerDialog）。
 */
import { createToolStore } from '@/core/storage';
import {
  addBar,
  addSegment,
  type Bar,
  DEFAULT_SETTINGS,
  moveSegment,
  type PickedColor,
  removeBar,
  removeSegment,
  replaceSegments,
  type Segment,
  type Settings,
  sanitizeSettings,
  setBarScale,
  updateSegment,
} from './logic';

export const TOOL_ID = 'color-palette';

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, { version: 1 });

/* 自動存檔讀回來的資料整理一次（舊資料、手改過的資料），不列入復原 */
{
  const st = useSettings.getState();
  const clean = sanitizeSettings(st.data);
  if (JSON.stringify(clean) !== JSON.stringify(st.data)) {
    st.replace(clean);
    useSettings.temporal.getState().clear();
  }
}

/* ---------- 操作（每次呼叫是一步復原；連續的變更 400 ms 內合併成一步） ---------- */

const setBars = (fn: (bars: readonly Bar[]) => Bar[]) => {
  const st = useSettings.getState();
  st.patch({ bars: fn(st.data.bars) });
};

export const actions = {
  patch: (partial: Partial<Settings>) => useSettings.getState().patch(partial),
  addBar: () => setBars((b) => addBar(b, useSettings.getState().data.baseScale)),
  removeBar: (barId: string) => setBars((b) => removeBar(b, barId)),
  setBarScale: (barId: string, scale: number) => setBars((b) => setBarScale(b, barId, scale)),
  addSegment: (barId: string) => setBars((b) => addSegment(b, barId)),
  removeSegment: (barId: string, segId: string) => setBars((b) => removeSegment(b, barId, segId)),
  updateSegment: (barId: string, segId: string, patch: Partial<Pick<Segment, 'color' | 'ratio'>>) =>
    setBars((b) => updateSegment(b, barId, segId, patch)),
  moveSegment: (barId: string, from: number, to: number) =>
    setBars((b) => moveSegment(b, barId, from, to)),
  replaceSegments: (barId: string, picks: readonly PickedColor[]) =>
    setBars((b) => replaceSegments(b, barId, picks)),
  /** 畫布把手：第 k 段與第 k＋1 段換成新的比例 */
  setPair: (barId: string, k: number, [a, b]: [number, number]) =>
    setBars((list) =>
      list.map((bar) =>
        bar.id === barId
          ? {
              ...bar,
              segments: bar.segments.map((s, i) =>
                i === k ? { ...s, ratio: a } : i === k + 1 ? { ...s, ratio: b } : s,
              ),
            }
          : bar,
      ),
    ),
};
