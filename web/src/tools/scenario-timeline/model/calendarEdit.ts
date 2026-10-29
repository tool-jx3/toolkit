/**
 * 改架空曆的月份（規格 F92）：存檔的時間寫的是「第幾個月第幾日」，改月份（排序、刪除、改天數、關掉月份）時
 * 依月份的代號換算成新的寫法。純計算。
 *
 * - 只到年的時間不受影響（打開、關掉月份都一樣）。
 * - 月份排序：跟著月份走（302-03-05 的「霜月」移到第 5 個月 → 302-05-05）。
 * - 刪掉的月份：用同一個位置的月份（沒有了就用最後一個月），算「調整」。
 * - 天數變少：超過的日改成那個月的最後一天，算「調整」。
 * - 關掉月份：月、日拿掉，只留年（會失去精度）。
 * - 期間換完結束不比開始晚時，結束改成和開始同一天（算「調整」）。
 */
import { type Calendar, calInfo, calParts, calValue } from './calendar';
import { afterUnit, canonical, formatLong, readTime, type TimeCtx, type Tv } from './time';
import type { Marker, TimelineDoc, TimelineEvent } from './types';

export interface CalendarPlan {
  events: TimelineEvent[];
  markers: Marker[];
  progressTime: string;
  /** 寫法改了但意思相同（月份排序） */
  renumbered: number;
  /** 被調整的（刪掉的月份、天數變少、期間倒過來） */
  adjusted: number;
  /** 失去精度的（關掉月份時的月、日） */
  lossy: number;
  examples: { name: string; from: string; to: string }[];
}

/** 一個時間換到新的架空曆；回傳新的寫法與有沒有被調整 */
function remap(
  stored: string,
  oldCtx: TimeCtx,
  newCtx: TimeCtx,
): { text: string; tv: Tv | null; adjusted: boolean; lossy: boolean } {
  const tv = readTime('year', stored, oldCtx);
  if (!tv || (tv.p !== 'month' && tv.p !== 'day'))
    return { text: stored, tv, adjusted: false, lossy: false };
  const oldInfo = calInfo(oldCtx.calendar);
  const newInfo = calInfo(newCtx.calendar);
  if (!oldInfo) return { text: stored, tv, adjusted: false, lossy: false };
  const c = calParts(oldInfo, tv.v);
  if (!newInfo) {
    const out: Tv = { v: c.y, p: 'year' };
    return { text: canonical('year', out, newCtx), tv: out, adjusted: false, lossy: true };
  }
  const id = oldInfo.months[c.m - 1]?.id;
  let ni = newInfo.months.findIndex((m) => m.id === id);
  let adjusted = false;
  if (ni < 0) {
    ni = Math.min(c.m - 1, newInfo.M - 1);
    adjusted = true;
  }
  let d = c.d;
  if (tv.p === 'day' && d > newInfo.months[ni].days) {
    d = newInfo.months[ni].days;
    adjusted = true;
  }
  const out: Tv = { v: calValue(newInfo, c.y, ni + 1, tv.p === 'day' ? d : 1), p: tv.p };
  return { text: canonical('year', out, newCtx), tv: out, adjusted, lossy: false };
}

/** 換成新的架空曆時，所有事件、標記、目前進度的時間（架空年以外的寫法不用換） */
export function planCalendar(doc: TimelineDoc, next: Calendar, untitled: string): CalendarPlan {
  const plan: CalendarPlan = {
    events: doc.events,
    markers: doc.markers,
    progressTime: doc.progress.time,
    renumbered: 0,
    adjusted: 0,
    lossy: 0,
    examples: [],
  };
  if (doc.mode !== 'year') return plan;
  const oldCtx: TimeCtx = { era: doc.era, calendar: doc.calendar };
  const newCtx: TimeCtx = { era: doc.era, calendar: next };
  const label = (ctx: TimeCtx, s: string) => {
    const tv = readTime('year', s, ctx);
    return tv ? formatLong('year', tv, ctx) : s;
  };
  const note = (name: string, from: string[], to: string[]) => {
    if (plan.examples.length < 3)
      plan.examples.push({
        name,
        from: from.map((s) => label(oldCtx, s)).join('～'),
        to: to.map((s) => label(newCtx, s)).join('～'),
      });
  };
  plan.events = doc.events.map((e) => {
    const a = remap(e.start, oldCtx, newCtx);
    const b = e.kind !== 'point' && e.end ? remap(e.end, oldCtx, newCtx) : null;
    let end = b ? b.text : e.end;
    let adjusted = a.adjusted || !!b?.adjusted;
    /* 期間倒過來：結束改成和開始同一個單位 */
    if (b && a.tv && b.tv && afterUnit('year', b.tv, newCtx) <= a.tv.v) {
      end = canonical('year', { v: a.tv.v, p: b.tv.p === 'year' ? 'year' : a.tv.p }, newCtx);
      adjusted = true;
    }
    const lossy = a.lossy || !!b?.lossy;
    if (a.text === e.start && end === e.end) return e;
    if (lossy) plan.lossy++;
    else if (adjusted) plan.adjusted++;
    else plan.renumbered++;
    if (lossy || adjusted)
      note(
        e.title.trim() || untitled,
        b ? [e.start, e.end] : [e.start],
        b ? [a.text, end] : [a.text],
      );
    return { ...e, start: a.text, end };
  });
  plan.markers = doc.markers.map((m) => {
    const r = remap(m.time, oldCtx, newCtx);
    if (r.text === m.time) return m;
    if (r.lossy) plan.lossy++;
    else if (r.adjusted) plan.adjusted++;
    else plan.renumbered++;
    if (r.lossy || r.adjusted) note(m.label.trim() || untitled, [m.time], [r.text]);
    return { ...m, time: r.text };
  });
  if (doc.progress.time) {
    const r = remap(doc.progress.time, oldCtx, newCtx);
    if (r.text !== doc.progress.time) {
      if (r.lossy) plan.lossy++;
      else if (r.adjusted) plan.adjusted++;
      else plan.renumbered++;
    }
    plan.progressTime = r.text;
  }
  return plan;
}
