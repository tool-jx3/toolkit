/**
 * 時間軸與年表共用的小工具：量字、目前看到的資料、新增事件的時間、鍵盤的一步。
 */
import { useMemo } from 'react';
import { pickStep, snapUnitFor } from '../model/axis';
import { layoutRows } from '../model/layout';
import { createMeasure } from '../model/measure';
import {
  addMonths,
  canonical,
  coarser,
  dateParts,
  dateValue,
  MINUTES_PER_DAY,
  type Precision,
  precisionUnit,
  type SnapUnit,
  snapValue,
  type TimeMode,
  type Tv,
} from '../model/time';
import { todayValue } from '../model/types';
import { type Audience, type VisibleDoc, visibleDoc } from '../model/visible';
import { fitWithLabels, type Win } from '../model/window';
import { docNow, prefsNow, useDoc, usePrefs, useUi } from '../store';

/** 事件標題 12 px（font-medium）、刻度 11 px、旗子 11 px 粗、泳道名稱 12 px 粗 */
export const itemMeasure = createMeasure(12, 500);
export const axisMeasure = createMeasure(11, 400);
export const flagMeasure = createMeasure(11, 600);
export const laneMeasure = createMeasure(12, 600);

/** 目前的檢視看到的資料（GM／PL） */
export function useVisibleDoc(audience?: Audience): VisibleDoc {
  const doc = useDoc((s) => s.data);
  const viewMode = usePrefs((s) => s.data.viewMode);
  const who = audience ?? viewMode;
  return useMemo(() => visibleDoc(doc, who), [doc, who]);
}

export const visibleNow = (audience?: Audience) =>
  visibleDoc(docNow(), audience ?? prefsNow().viewMode);

/** 全覽的畫面範圍（時間軸寬 width px；右邊留最後面的標題的位置） */
export function fitFor(vdoc: VisibleDoc, width = 800): Win {
  return fitWithLabels(vdoc, width, itemMeasure, todayValue());
}

/** 目前的畫面範圍（還沒有時全覽） */
export function currentWin(): Win {
  const ui = useUi.getState();
  return ui.win && ui.winMode === docNow().mode ? ui.win : fitFor(visibleNow());
}

/** 某個寬度下的吸附單位 */
export function snapForWidth(mode: TimeMode, win: Win, width: number): SnapUnit {
  const k = width / Math.max(1e-9, win.end - win.start);
  return snapUnitFor(mode, pickStep(mode, k, win.start, win.end, axisMeasure));
}

/** 新事件的寫法：吸附到 1 日以上時只寫到日，其他寫到分（架空年只有年） */
export function precisionForSnap(mode: TimeMode, u: SnapUnit): Precision {
  if (mode === 'year') return 'year';
  if (u.kind === 'min' && u.n < MINUTES_PER_DAY) return 'minute';
  return 'day';
}

/** 新事件的開始（標準寫法） */
export function newEventStart(mode: TimeMode, v: number, u: SnapUnit): string {
  const p = precisionForSnap(mode, u);
  const unit = coarser(mode, u, precisionUnit(mode, p));
  let s = snapValue(mode, v, unit);
  if (mode !== 'year' && p === 'day') s = Math.floor(s / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  return canonical(mode, { v: s, p });
}

/** 往前、往後一步（照事件的寫法；結果對齊到單位） */
export function stepTv(mode: TimeMode, tv: Tv, unit: SnapUnit, dir: 1 | -1): Tv {
  const u = coarser(mode, unit, precisionUnit(mode, tv.p));
  let v: number;
  if (u.kind === 'min' || mode === 'year') v = tv.v + dir * u.n;
  else if (u.kind === 'month') v = addMonths(tv.v, dir * u.n);
  else v = dateValue(dateParts(tv.v).y + dir * u.n);
  return { v: snapValue(mode, v, u), p: tv.p };
}

/** 事件現在畫在哪一列（泳道 id；收合的上層） */
export function rowKeyOf(vdoc: VisibleDoc, laneId: string): string {
  const rows = layoutRows(vdoc, prefsNow().collapsed);
  const keys = new Set(rows.map((r) => r.key));
  if (!laneId) return '';
  if (keys.has(laneId)) return laneId;
  const l = vdoc.lanes.find((x) => x.id === laneId);
  if (l?.parentId && keys.has(l.parentId)) return l.parentId;
  return '';
}
