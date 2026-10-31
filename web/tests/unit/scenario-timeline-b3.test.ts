/**
 * 劇本時間表第三批（規格 F110、F111）：
 * - 架空曆寫到時刻：解讀（寬鬆的寫法、錯誤）、標準寫法與顯示、換算（第幾分的整數，大年份也不跑掉）、期間、吸附、
 *   刻度與畫面範圍、年表、CSV 往返、專案檔、改月份與關掉時刻、換寫法。
 * - 年表列出關聯線：方向、種類、說明；GM 專用的線在 PL 版不列（也推不出來）；篩選中只列兩端都在的；
 *   純文字、Markdown、列印；關掉時和改版前相同。
 */
import { describe, expect, it } from 'vitest';
import { buildPicture, pictureToSvg } from '@/tools/scenario-timeline/export/picture';
import { axisTicks, stepLadder } from '@/tools/scenario-timeline/model/axis';
import {
  type Calendar,
  calInfo,
  calParts,
  calValue,
  minuteOfValue,
  normalizeCalendar,
  valueOfMinute,
} from '@/tools/scenario-timeline/model/calendar';
import { planCalendar } from '@/tools/scenario-timeline/model/calendarEdit';
import {
  chronicle,
  chronicleHtml,
  chronicleMarkdown,
  chroniclePrintCss,
  chronicleText,
  linkText,
  PRINT_CSS,
} from '@/tools/scenario-timeline/model/chronicle';
import { eventsToCsv, parseEventsTable } from '@/tools/scenario-timeline/model/csv';
import { exampleDoc } from '@/tools/scenario-timeline/model/example';
import { emptyFilter, filteredDoc, matchingIds } from '@/tools/scenario-timeline/model/filter';
import { eventSpan } from '@/tools/scenario-timeline/model/layout';
import { createMeasure } from '@/tools/scenario-timeline/model/measure';
import { moveGroup } from '@/tools/scenario-timeline/model/selection';
import {
  afterUnit,
  CLOCK_OFF_ERROR,
  canonical,
  clampValue,
  convertLoses,
  convertTime,
  dateValue,
  endFromExclusive,
  formatLong,
  parseTime,
  readTime,
  snapTv,
  snapValue,
  type TimeCtx,
} from '@/tools/scenario-timeline/model/time';
import {
  blankDoc,
  emptyReport,
  newEvent,
  normalizeDoc,
  type TimelineDoc,
} from '@/tools/scenario-timeline/model/types';
import { visibleDoc } from '@/tools/scenario-timeline/model/visible';
import { fitWindow, spanLimits, zoomWindow } from '@/tools/scenario-timeline/model/window';

const months12 = (clock: boolean, weekdays: string[] = []): Calendar => ({
  months: Array.from({ length: 12 }, (_, i) => ({
    id: `m${i + 1}`,
    name: `${i + 1} 月`,
    days: 30,
  })),
  weekdays,
  weekStart: 0,
  ...(clock ? { clock: true } : {}),
});
const ctxOf = (cal: Calendar, era = '王國曆'): TimeCtx => ({ era, calendar: cal });
const ok = (r: ReturnType<typeof parseTime>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('架空曆寫到時刻（F110）', () => {
  const cal = months12(true);
  const ctx = ctxOf(cal);
  const info = calInfo(cal);
  if (!info) throw new Error('no info');

  it('位置：年＋（第幾天 × 1440 ＋ 第幾分）÷（一年的天數 × 1440）；第幾分的整數換回來相同', () => {
    const r = ok(parseTime('year', '302-3-5 14:00', ctx));
    expect(r.tv.p).toBe('minute');
    expect(r.tv.v).toBe(302 + ((2 * 30 + 4) * 1440 + 14 * 60) / (360 * 1440));
    expect(calValue(info, 302, 3, 5, 840)).toBe(r.tv.v);
    const M = minuteOfValue(info, r.tv.v);
    expect(M).toBe((302 * 360 + 64) * 1440 + 840);
    expect(valueOfMinute(info, M)).toBe(r.tv.v);
    expect(calParts(info, r.tv.v)).toMatchObject({ y: 302, m: 3, d: 5, min: 840 });
    /* 那天的 0:00 和只到日的位置逐位元相同 */
    expect(valueOfMinute(info, (302 * 360 + 64) * 1440)).toBe(calValue(info, 302, 3, 5));
  });

  it('解讀：寬鬆的寫法（年月日、空白、T、全形、曆名、星期）', () => {
    const want = '302-03-05 14:00';
    for (const t of [
      '302-3-5 14:00',
      '302-03-05 14:00',
      '302/3/5 14:00',
      '302.3.5 14:00',
      '302-3-5T14:00',
      '302年3月5日14:00',
      '302年3月5日 14:00',
      '302 3 月 5 日 14:00',
      '王國曆 302 年 3 月 5 日 14:00',
      '王國曆302年3月5日14:00',
      '３０２－３－５　１４：００',
      '302-3-5 14：00',
    ]) {
      const r = parseTime('year', t, ctx);
      expect(r.ok, t).toBe(true);
      if (r.ok) expect(canonical('year', r.tv, ctx), t).toBe(want);
    }
    expect(canonical('year', ok(parseTime('year', '302-3-5 9:05', ctx)).tv, ctx)).toBe(
      '302-03-05 09:05',
    );
    /* 負的年 */
    const neg = ok(parseTime('year', '-50-3-5 23:59', ctx));
    expect(canonical('year', neg.tv, ctx)).toBe('-50-03-05 23:59');
    expect(readTime('year', '-50-03-05 23:59', ctx)?.v).toBe(neg.tv.v);
  });

  it('解讀的錯誤：只到年、月不能加時刻；時刻的範圍；沒打開「寫到時刻」', () => {
    const err = (t: string, c: TimeCtx = ctx) => {
      const r = parseTime('year', t, c);
      return r.ok ? null : r.error;
    };
    expect(err('302 14:00')).toBe('只寫年份時不能加時刻');
    expect(err('302-3 14:00')).toBe('只寫到月時不能加時刻');
    expect(err('302年3月 14:00')).toBe('只寫到月時不能加時刻');
    expect(err('302-3-5 24:00')).toBe('時刻要寫成 HH:MM（00:00～23:59）');
    expect(err('302-3-5 12:60')).toBe('時刻要寫成 HH:MM（00:00～23:59）');
    expect(err('14:00')).toMatch(/^看不懂這個時間/);
    /* 日子的部分看不懂：引用整串（驗證後，和日期時間相同） */
    for (const t of [
      '302-3-5 1400',
      '302-3-5 14:5',
      '302-3-5 14.00',
      '302-3-5 14:00:00',
      '302-3-5 ,14:00',
    ])
      expect(err(t), t).toBe(`看不懂這個時間：「${t}」（例：302 年 1 月 5 日 14:00）`);
    expect(err('302年3月14:00')).toBe('只寫到月時不能加時刻');
    expect(err('302-3-x', ctxOf(months12(false)))).toBe(
      '看不懂這個時間：「302-3-x」（例：302 年 1 月 5 日）',
    );
    expect(err('302-3-31 10:00')).toBe('3 月只有 30 天');
    expect(err('302-3-5 14:00', ctxOf(months12(false)))).toBe(CLOCK_OFF_ERROR);
    /* 沒有時刻的寫法照舊 */
    expect(canonical('year', ok(parseTime('year', '302-3-5', ctx)).tv, ctx)).toBe('302-03-05');
    expect(ok(parseTime('year', '302-3', ctx)).tv.p).toBe('month');
    expect(ok(parseTime('year', '302', ctx)).tv).toEqual({ v: 302, p: 'year' });
  });

  it('顯示：星期在時刻前面；沒有星期時中間空一格；星期寫錯照日期更正', () => {
    const tv = ok(parseTime('year', '302-3-5 14:00', ctx)).tv;
    expect(formatLong('year', tv, ctx)).toBe('王國曆 302 年 3 月 5 日 14:00');
    const wk = ctxOf(months12(true, ['月', '火', '水']));
    const wtv = ok(parseTime('year', '302-3-5 14:00', wk)).tv;
    const label = formatLong('year', wtv, wk);
    expect(label).toMatch(/^王國曆 302 年 3 月 5 日（[月火水]）14:00$/);
    const right = label.slice(label.indexOf('（'), label.indexOf('）') + 1);
    const wrong = ['（月）', '（火）', '（水）'].find((w) => w !== right) ?? '';
    expect(parseTime('year', `302-3-5${right}14:00`, wk)).toMatchObject({ ok: true });
    expect(parseTime('year', `302-3-5${right}14:00`, wk)).not.toHaveProperty('weekdayFixed');
    expect(parseTime('year', `302年3月5日${wrong} 14:00`, wk)).toMatchObject({
      ok: true,
      weekdayFixed: true,
    });
  });

  it('大年份與天數多的曆：隨機 3000 個時刻往返逐字相同、順序不變', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 3000; i++) {
      const n = 1 + Math.floor(rnd() * 24);
      const c: Calendar = {
        months: Array.from({ length: n }, (_, j) => ({
          id: `x${j}`,
          name: `第${j + 1}月`,
          days: 1 + Math.floor(rnd() * 100),
        })),
        weekdays: [],
        weekStart: 0,
        clock: true,
      };
      const cx = ctxOf(c, '');
      const ci = calInfo(c);
      if (!ci) throw new Error('no info');
      const y = Math.floor(rnd() * 1999999) - 999999;
      const m = 1 + Math.floor(rnd() * n);
      const d = 1 + Math.floor(rnd() * c.months[m - 1].days);
      const hh = Math.floor(rnd() * 24);
      const mm = Math.floor(rnd() * 60);
      const text = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const tv = ok(parseTime('year', text, cx)).tv;
      expect(canonical('year', tv, cx)).toBe(text);
      const M = minuteOfValue(ci, tv.v);
      expect(valueOfMinute(ci, M)).toBe(tv.v);
      /* 下一分一定比較晚、前一分一定比較早 */
      expect(valueOfMinute(ci, M + 1)).toBeGreaterThan(tv.v);
      expect(valueOfMinute(ci, M - 1)).toBeLessThan(tv.v);
    }
  });

  it('期間：寫到分的結束就是那一刻；拖曳兩端的換算', () => {
    const a = ok(parseTime('year', '302-3-5 14:00', ctx)).tv;
    const b = ok(parseTime('year', '302-3-5 16:00', ctx)).tv;
    expect(afterUnit('year', b, ctx)).toBe(b.v);
    expect(endFromExclusive('year', b.v, 'minute', ctx)).toEqual(b);
    expect(afterUnit('year', b, ctx)).toBeGreaterThan(a.v);
    /* 只到日的結束仍然包含整天 */
    const day = ok(parseTime('year', '302-3-5', ctx)).tv;
    expect(afterUnit('year', day, ctx)).toBe(calValue(info, 302, 3, 6));
    const e = newEvent({ kind: 'range', start: '302-03-05 14:00', end: '302-03-05 16:00' });
    expect(eventSpan('year', e, ctx)).toEqual({ a: a.v, b: b.v });
  });

  it('吸附：分的單位對齊（每天從 0:00 數）；只到日的事件仍然一次 1 日', () => {
    const tv = ok(parseTime('year', '302-3-5 14:07', ctx)).tv;
    const s = snapValue('year', tv.v, { kind: 'min', n: 15 }, ctx);
    expect(canonical('year', { v: s, p: 'minute' }, ctx)).toBe('302-03-05 14:00');
    const s2 = snapValue('year', tv.v, { kind: 'min', n: 720 }, ctx);
    expect(canonical('year', { v: s2, p: 'minute' }, ctx)).toBe('302-03-05 12:00');
    /* 只到日的事件：寫法比單位粗時照寫法 */
    const day = ok(parseTime('year', '302-3-5', ctx)).tv;
    const moved = snapTv('year', day.v + 0.3 / 360, 'day', { kind: 'min', n: 5 }, ctx);
    expect(moved.p).toBe('day');
    expect(canonical('year', moved, ctx)).toBe('302-03-05');
  });

  it('刻度：放大到一天以內時是時刻（上排寫日子）；沒打開時和以前一樣只到日', () => {
    const measure = createMeasure(11, 400);
    const a = calValue(info, 302, 3, 5);
    const b = calValue(info, 302, 3, 6);
    const k = 1600 / (b - a);
    const t = axisTicks('year', a, b, k, measure, ctx);
    expect(['minute', 'hour']).toContain(t.step.unit);
    expect(t.minor.map((x) => x.label)).toContain('12:00');
    expect(t.major[0].label).toBe('302 年 3 月 5 日');
    expect(t.major[0].short).toEqual(['3 月 5 日', '5 日']);
    expect(t.snap.kind).toBe('min');
    /* 刻度的位置剛好在整點 */
    const noon = t.minor.find((x) => x.label === '12:00');
    expect(noon?.v).toBe(calValue(info, 302, 3, 5, 720));
    /* 沒打開「寫到時刻」：階梯沒有分、時 */
    expect(stepLadder('year', ctxOf(months12(false))).some((s) => s.unit === 'hour')).toBe(false);
    expect(stepLadder('year', ctx).some((s) => s.unit === 'hour')).toBe(true);
    const off = axisTicks('year', a, b, k, measure, ctxOf(months12(false)));
    expect(off.step.unit).toBe('day');
    /* 日以上的間隔照第二批：吸附到 1 日 */
    const wide = axisTicks('year', a, a + 40 / 360, 1600 / (40 / 360), measure, ctx);
    expect(wide.step.unit).toBe('day');
    expect(wide.snap).toEqual({ kind: 'day', n: 1 });
    /* 星期 */
    const wk = ctxOf(months12(true, ['月', '火', '水']));
    const tw = axisTicks('year', a, b, k, measure, wk);
    expect(tw.major[0].label).toMatch(/^302 年 3 月 5 日（[月火水]）$/);
  });

  it('畫面範圍：最短 60 分；只有一個時間點時前後各 1 日（沒打開時 3 日、15 日）', () => {
    expect(spanLimits('year', ctx).min).toBe(60 / (360 * 1440));
    expect(spanLimits('year', ctxOf(months12(false))).min).toBe(3 / 360);
    const v = calValue(info, 302, 3, 5, 840);
    const w = fitWindow('year', { a: v, b: v }, 0, 0.04, ctx);
    expect(w.end - w.start).toBeCloseTo(2 / 360, 12);
    const off = fitWindow('year', { a: v, b: v }, 0, 0.04, ctxOf(months12(false)));
    expect(off.end - off.start).toBeCloseTo(30 / 360, 12);
    const z = zoomWindow('year', w, 1e6, v, ctx);
    const least = 60 / (360 * 1440);
    expect(Math.abs(z.end - z.start - least) / least).toBeLessThan(1e-6);
  });

  it('年表：每天一段；段裡寫時刻（只到日的「整天」）；期間的結束同一天只寫時刻', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      mode: 'year',
      era: '王國曆',
      calendar: cal,
      events: [
        newEvent({ id: 'a', title: '早餐', start: '302-03-05 08:00' }),
        newEvent({ id: 'b', title: '整天的祭典', start: '302-03-05' }),
        newEvent({
          id: 'c',
          title: '會議',
          kind: 'range',
          start: '302-03-05 14:00',
          end: '302-03-05 16:00',
        }),
        newEvent({
          id: 'd',
          title: '夜行',
          kind: 'range',
          start: '302-03-05 22:00',
          end: '302-03-06 06:00',
        }),
        newEvent({
          id: 'e',
          title: '跨年',
          kind: 'range',
          start: '302-12-30 23:00',
          end: '303-01-01 01:00',
        }),
        newEvent({ id: 'f', title: '只到月', start: '302-04' }),
      ],
    };
    const ch = chronicle(visibleDoc(doc, 'gm'), '?', 'T');
    expect(ch.sections.map((s) => s.heading)).toEqual([
      '王國曆 302 年 3 月 5 日',
      '王國曆 302 年 4 月',
      '王國曆 302 年 12 月 30 日',
    ]);
    expect(ch.sections[0].rows.map((r) => `${r.time} ${r.title}`)).toEqual([
      '整天 整天的祭典',
      '08:00 早餐',
      '14:00～16:00 會議',
      '22:00～3 月 6 日 06:00 夜行',
    ]);
    expect(ch.sections[2].rows[0].time).toBe('23:00～王國曆 303 年 1 月 1 日 01:00');
    expect(ch.sections[1].rows[0].time).toBe('');
    expect(ch.range).toBe('王國曆 302 年 3 月 5 日～王國曆 303 年 1 月 1 日 01:00');
    expect(chronicleText(ch, 'pl')).toContain('・14:00～16:00　會議');
    /* 沒打開「寫到時刻」的架空曆：段裡不寫時間（和第二批相同） */
    const off: TimelineDoc = {
      ...doc,
      calendar: months12(false),
      events: [newEvent({ title: 'x', start: '302-03-05' })],
    };
    expect(chronicle(visibleDoc(off, 'gm'), '?', 'T').sections[0].rows[0].time).toBe('');
  });

  it('CSV：匯出再讀入逐欄相同', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      mode: 'year',
      era: '王國曆',
      calendar: cal,
      events: [
        newEvent({ title: 'a', start: '302-03-05 14:00' }),
        newEvent({ title: 'b', kind: 'range', start: '-50-01-01 00:00', end: '-50-01-02 23:59' }),
        newEvent({ title: 'c', start: '302-03-05' }),
      ],
    };
    const csv = eventsToCsv(doc);
    expect(csv).toContain('302-03-05 14:00');
    expect(csv).toContain('-50-01-01 00:00');
    const back = parseEventsTable(csv.replace(/^﻿/, ''), doc);
    expect(back.errors).toEqual([]);
    /* 匯出依時間排 */
    const rows = (list: TimelineDoc['events']) =>
      list.map((e) => [e.title, e.kind, e.start, e.end]).sort((p, q) => (p[0] < q[0] ? -1 : 1));
    expect(rows(back.events)).toEqual(rows(doc.events));
    /* 沒打開「寫到時刻」的專案讀進寫到時刻的 CSV：那一列不收、寫原因 */
    const off = parseEventsTable(csv.replace(/^﻿/, ''), { ...doc, calendar: months12(false) });
    expect(off.events.map((e) => e.title)).toEqual(['c']);
    expect(off.errors.map((e) => e.message).join('\n')).toContain(CLOCK_OFF_ERROR);
  });

  it('專案檔、自動儲存：clock 只有開著時才有；寫到時刻的時間照讀；沒開時看不懂而略過', () => {
    expect(normalizeCalendar({ ...months12(true) })).toHaveProperty('clock', true);
    expect(normalizeCalendar({ ...months12(false), clock: false })).not.toHaveProperty('clock');
    expect(normalizeCalendar({ months: [], clock: true })).not.toHaveProperty('clock');
    const raw = {
      title: 't',
      mode: 'year',
      calendar: months12(true),
      events: [{ id: 'a', title: 'a', kind: 'point', start: '302-3-5 14:00' }],
      markers: [{ id: 'm', label: 'm', time: '302-03-05 15:30' }],
      progress: { on: true, time: '302-03-05 16:00' },
    };
    const d = normalizeDoc(raw);
    expect(d?.events[0].start).toBe('302-03-05 14:00');
    expect(d?.markers[0].time).toBe('302-03-05 15:30');
    expect(d?.progress.time).toBe('302-03-05 16:00');
    expect(normalizeDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const rep = emptyReport();
    const off = normalizeDoc({ ...raw, calendar: months12(false) }, rep);
    expect(off?.events).toEqual([]);
    expect(rep.skippedEvents).toBe(1);
  });

  it('改月份：時刻跟著日子走；天數變少的調整；關掉「寫到時刻」只留日子；關掉月份只留年', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      mode: 'year',
      calendar: cal,
      events: [
        newEvent({ id: 'a', title: 'A', start: '302-03-05 14:00' }),
        newEvent({ id: 'b', title: 'B', start: '302-03-30 08:15' }),
        newEvent({
          id: 'c',
          title: 'C',
          kind: 'range',
          start: '302-03-05 14:00',
          end: '302-03-05 18:00',
        }),
      ],
      markers: [{ id: 'm', label: 'M', time: '302-03-05 09:00', color: '#8a63d2', gm: false }],
    };
    /* 3 月移到最前面：時刻不變 */
    const moved = [cal.months[2], ...cal.months.filter((_, i) => i !== 2)];
    const p1 = planCalendar(doc, { ...cal, months: moved }, '?');
    expect(p1.events.map((e) => e.start)).toEqual([
      '302-01-05 14:00',
      '302-01-30 08:15',
      '302-01-05 14:00',
    ]);
    expect(p1.events[2].end).toBe('302-01-05 18:00');
    expect(p1.lossy).toBe(0);
    /* 3 月改成 20 天：30 日 → 20 日，時刻不變，算調整 */
    const p2 = planCalendar(
      doc,
      { ...cal, months: cal.months.map((m, i) => (i === 2 ? { ...m, days: 20 } : m)) },
      '?',
    );
    expect(p2.events[1].start).toBe('302-03-20 08:15');
    expect(p2.adjusted).toBe(1);
    /* 關掉「寫到時刻」：只留日子（失去精度，列例子） */
    const { clock: _c, ...noClock } = cal;
    const p3 = planCalendar(doc, noClock, '?');
    expect(p3.events.map((e) => e.start)).toEqual(['302-03-05', '302-03-30', '302-03-05']);
    expect(p3.events[2].end).toBe('302-03-05');
    expect(p3.markers[0].time).toBe('302-03-05');
    expect(p3.lossy).toBe(4);
    expect(p3.examples[0]).toEqual({
      name: 'A',
      from: '302 年 3 月 5 日 14:00',
      to: '302 年 3 月 5 日',
    });
    /* 關掉月份：只留年 */
    const p4 = planCalendar(doc, { ...noClock, months: [] }, '?');
    expect(p4.events.map((e) => e.start)).toEqual(['302', '302', '302']);
    expect(p4.lossy).toBe(4);
    /* 打開「寫到時刻」：沒有時刻的時間不變 */
    const plain: TimelineDoc = {
      ...doc,
      calendar: noClock,
      events: [newEvent({ start: '302-03-05' })],
      markers: [],
    };
    const p5 = planCalendar(plain, cal, '?');
    expect(p5.events[0]).toBe(plain.events[0]);
    expect(p5.lossy + p5.adjusted + p5.renumbered).toBe(0);
  });

  it('換寫法：時刻換成日期時間、第 N 天只留年（會失去精度）', () => {
    const opts = { era: ctx, dayOne: 0 };
    expect(convertLoses('year', 'date', '302-03-05 14:00', ctx)).toBe(true);
    expect(convertLoses('year', 'day', '302-03-05 14:00', ctx)).toBe(true);
    expect(convertTime('year', 'date', '302-03-05 14:00', opts)).toBe('0302');
  });
});

describe('年表列出關聯線（F111）', () => {
  const doc = exampleDoc();
  const opt = { links: true };

  it('範例：方向、種類、說明；兩端都列；預設（不給選項）不列', () => {
    const ch = chronicle(visibleDoc(doc, 'gm'), '（無標題）', '劇本時間表', opt);
    const rows = new Map(ch.sections.flatMap((s) => s.rows).map((r) => [r.id, r]));
    expect(rows.get('ex-letter')?.links.map(linkText)).toEqual([
      '→ 導致：抵達黑水灣車站（收到霍爾的信才來黑水灣）',
    ]);
    expect(rows.get('ex-arrive')?.links.map(linkText)).toEqual([
      '← 起因：委託信寄出（收到霍爾的信才來黑水灣）',
    ]);
    const text = chronicleText(ch, 'gm');
    expect(text).toContain(
      '・16:00　抵達黑水灣車站〔調查員〕\n　　地點：黑水灣車站／相關角色：調查員\n',
    );
    expect(text).toContain('　　← 起因：委託信寄出（收到霍爾的信才來黑水灣）\n');
    expect(text).toContain(
      '　　→ 導致：第二次儀式（第一次失敗，深潮會要在滿月之後再試一次）〔GM 專用〕',
    );
    /* 不給選項：和第二批相同（沒有關聯線） */
    const plain = chronicleText(chronicle(visibleDoc(doc, 'gm'), '（無標題）', '劇本時間表'), 'gm');
    expect(plain).not.toContain('→ 導致');
    expect(plain).not.toContain('← 起因');
  });

  it('PL 版：GM 專用的線、一端是 PL 看不到的事件的線都不列，文字和沒有那條線的專案相同', () => {
    const d: TimelineDoc = {
      ...blankDoc(),
      title: 't',
      mode: 'day',
      events: [
        newEvent({ id: 'a', title: 'A', start: '第 1 天 08:00' }),
        newEvent({ id: 'b', title: 'B', start: '第 1 天 09:00' }),
        newEvent({ id: 'c', title: 'C', start: '第 1 天 10:00' }),
        newEvent({ id: 's', title: '秘密事件', start: '第 1 天 11:00', gm: true }),
      ],
      links: [
        { id: 'k1', from: 'a', to: 'b', kind: 'cause', note: '公開', gm: false },
        { id: 'k2', from: 'b', to: 'c', kind: 'conflict', note: '秘密說明', gm: true },
        { id: 'k3', from: 'c', to: 's', kind: 'related', note: '', gm: false },
      ],
    };
    const plText = chronicleText(chronicle(visibleDoc(d, 'pl'), '?', 'T', opt), 'pl');
    const only: TimelineDoc = { ...d, links: [d.links[0]] };
    expect(plText).toBe(chronicleText(chronicle(visibleDoc(only, 'pl'), '?', 'T', opt), 'pl'));
    expect(plText).toContain('→ 導致：B（公開）');
    expect(plText).not.toContain('矛盾');
    expect(plText).not.toContain('秘密');
    expect(plText).not.toContain('相關');
    const plMd = chronicleMarkdown(chronicle(visibleDoc(d, 'pl'), '?', 'T', opt), 'pl');
    expect(plMd).not.toContain('秘密');
    const plHtml = chronicleHtml(chronicle(visibleDoc(d, 'pl'), '?', 'T', opt), 'pl');
    expect(plHtml).not.toContain('秘密');
    expect(plHtml).not.toContain('class="link gm"');
    /* GM 版：GM 專用的線與一端看不到的線標〔GM 專用〕 */
    const gm = chronicle(visibleDoc(d, 'gm'), '?', 'T', opt);
    const gmText = chronicleText(gm, 'gm');
    expect(gmText).toContain('　　⇄ 矛盾：C（秘密說明）〔GM 專用〕');
    expect(gmText).toContain('　　⇄ 相關：秘密事件〔GM 專用〕');
    expect(gmText).toContain('　　⇄ 矛盾：B（秘密說明）〔GM 專用〕');
    expect(chronicleMarkdown(gm, 'gm')).toContain('  - ⇄ 矛盾：C（秘密說明）〔GM 專用〕');
    expect(chronicleHtml(gm, 'gm')).toContain(
      '<div class="link gm">⇄ 矛盾：C（秘密說明）〔GM 專用〕</div>',
    );
    expect(chronicleHtml(gm, 'gm')).toContain('<div class="link">→ 導致：B（公開）</div>');
    expect(chroniclePrintCss(gm)).toContain('.link{');
    expect(chroniclePrintCss(chronicle(visibleDoc(d, 'gm'), '?', 'T'))).toBe(PRINT_CSS);
  });

  it('篩選中只列兩端都符合的線；依另一端在年表上的順序', () => {
    const d: TimelineDoc = {
      ...blankDoc(),
      mode: 'day',
      events: [
        newEvent({ id: 'a', title: 'A', start: '第 1 天 08:00', place: '港口' }),
        newEvent({ id: 'b', title: 'B', start: '第 1 天 09:00', place: '港口' }),
        newEvent({ id: 'c', title: 'C', start: '第 1 天 10:00' }),
        newEvent({ id: 'z', title: 'Z', start: '第 1 天 07:00', place: '港口' }),
      ],
      links: [
        { id: 'k1', from: 'a', to: 'b', kind: 'cause', note: '', gm: false },
        { id: 'k2', from: 'a', to: 'c', kind: 'same', note: '', gm: false },
        { id: 'k3', from: 'z', to: 'a', kind: 'cause', note: '', gm: false },
      ],
    };
    const vdoc = visibleDoc(d, 'gm');
    const all = chronicle(vdoc, '?', 'T', opt);
    const a = all.sections[0].rows.find((r) => r.id === 'a');
    expect(a?.links.map(linkText)).toEqual(['← 起因：Z', '→ 導致：B', '⇄ 同時：C']);
    const ids = matchingIds(vdoc, { ...emptyFilter(), places: ['港口'] });
    const f = chronicle(filteredDoc(vdoc, ids), '?', 'T', opt);
    expect(f.sections[0].rows.find((r) => r.id === 'a')?.links.map(linkText)).toEqual([
      '← 起因：Z',
      '→ 導致：B',
    ]);
    expect(chronicleText(f, 'gm')).not.toContain('同時');
  });

  it('沒有關聯線的專案：列出與不列的文字相同', () => {
    const d: TimelineDoc = { ...doc, links: [] };
    for (const aud of ['gm', 'pl'] as const) {
      const v = visibleDoc(d, aud);
      const a = chronicle(v, '?', 'T');
      const b = chronicle(v, '?', 'T', opt);
      expect(chronicleText(b, aud)).toBe(chronicleText(a, aud));
      expect(chronicleMarkdown(b, aud)).toBe(chronicleMarkdown(a, aud));
      expect(chronicleHtml(b, aud)).toBe(chronicleHtml(a, aud));
    }
  });
});

describe('驗證後的修正', () => {
  const cal = months12(true);
  const ctx = ctxOf(cal);
  const info = calInfo(cal);
  if (!info) throw new Error('no info');

  it('分的吸附四捨五入到最近的 n 分（和日期時間相同；Alt 的 1 分也是）', () => {
    let seed = 99;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const perYear = info.D * 1440;
    for (const n of [1, 5, 10, 15, 30, 60, 120, 180, 360, 720]) {
      let diff = 0;
      for (let i = 0; i < 5000; i++) {
        const y = 302 + Math.floor(rnd() * 10);
        const x = rnd() * perYear;
        const got = snapValue('year', y + x / perYear, { kind: 'min', n }, ctx);
        if (minuteOfValue(info, got) - y * perYear !== Math.round(x / n) * n) diff++;
      }
      expect(diff, `n=${n}`).toBe(0);
    }
    /* 例：14:07.6 → Alt（1 分）14:08、5 分 14:10 */
    const v = calValue(info, 302, 3, 5, 14 * 60 + 7) + 0.6 / perYear;
    expect(canonical('year', snapTv('year', v, 'minute', { kind: 'min', n: 1 }, ctx), ctx)).toBe(
      '302-03-05 14:08',
    );
    expect(canonical('year', snapTv('year', v, 'minute', { kind: 'min', n: 5 }, ctx), ctx)).toBe(
      '302-03-05 14:10',
    );
    /* 大年份也一樣 */
    const big = calValue(info, -999999, 1, 1, 12 * 60 + 2) + 0.7 / perYear;
    expect(canonical('year', snapTv('year', big, 'minute', { kind: 'min', n: 5 }, ctx), ctx)).toBe(
      '-999999-01-01 12:05',
    );
  });

  it('最後一年：拖曳可以到年底（不再夾在 1 月 1 日）；吸附到下一格時留在範圍裡', () => {
    const late = calValue(info, 999999, 12, 30, 23 * 60 + 30);
    /* 以前 clampValue 夾在 999999.0（1 月 1 日） */
    expect(clampValue('year', late, ctx)).toBe(late);
    expect(clampValue('year', 1000001, ctx)).toBe(calValue(info, 999999, 12, 30, 1439));
    expect(clampValue('year', 1000001)).toBe(999999);
    const off = ctxOf(months12(false));
    expect(
      canonical(
        'year',
        snapTv('year', clampValue('year', late, off), 'day', { kind: 'day', n: 1 }, off),
        off,
      ),
    ).toBe('999999-12-30');
    expect(
      canonical(
        'year',
        snapTv(
          'year',
          clampValue('year', calValue(info, 999999, 6, 2) + 0.2 / 360, off),
          'day',
          { kind: 'day', n: 1 },
          off,
        ),
        off,
      ),
    ).toBe('999999-06-02');
    /* 往右拖過頭：最後一天、最後一分（不會變成 1000000 年） */
    const over = clampValue('year', 1000000.5, ctx);
    expect(
      canonical('year', snapTv('year', over, 'minute', { kind: 'min', n: 15 }, ctx), ctx),
    ).toBe('999999-12-30 23:59');
    expect(canonical('year', snapTv('year', over, 'day', { kind: 'day', n: 1 }, ctx), ctx)).toBe(
      '999999-12-30',
    );
    expect(canonical('year', snapTv('year', over, 'month', { kind: 'day', n: 1 }, ctx), ctx)).toBe(
      '999999-12',
    );
    /* 一起拖（只到日的一個、寫到分的一個） */
    const moved = moveGroup(
      'year',
      ctx,
      [
        { id: 'a', start: '999999-12-01', end: '', laneId: '', row: 0 },
        { id: 'b', start: '999999-12-01 08:00', end: '', laneId: '', row: 0 },
      ],
      40 / 360,
      0,
      [''],
    );
    expect(moved.map((m) => m.start)).toEqual(['999999-12-30', '999999-12-30 23:59']);
    for (const m of moved) expect(readTime('year', m.start, ctx)).not.toBeNull();
    /* 沒有月份的架空年、日期時間、第 N 天：兩端吸附到下一格時也留在範圍裡 */
    expect(snapTv('year', 999999, 'year', { kind: 'year', n: 20000 }).v).toBe(999999);
    expect(snapTv('year', -999999, 'year', { kind: 'year', n: 5 }).v).toBe(-999999);
    const lastDate = clampValue('date', dateValue(10000));
    expect(canonical('date', snapTv('date', lastDate, 'day', { kind: 'min', n: 1440 }))).toBe(
      '9999-12-31',
    );
    expect(canonical('date', snapTv('date', lastDate, 'year', { kind: 'year', n: 1 }))).toBe(
      '9999',
    );
    expect(
      canonical('day', snapTv('day', clampValue('day', 1e9), 'day', { kind: 'min', n: 1440 })),
    ).toBe('第 9999 天');
    /* 範圍裡的位置不變 */
    expect(snapTv('date', dateValue(1925, 3, 12, 21), 'minute', { kind: 'min', n: 5 }).v).toBe(
      dateValue(1925, 3, 12, 21),
    );
  });

  it('關聯線的文字：標題、說明裡的換行換成空白（純文字、Markdown、列印）', () => {
    const d: TimelineDoc = {
      ...blankDoc(),
      events: [
        newEvent({ id: 'a', title: '甲\n# 標題注入', start: '1925-03-12 10:00' }),
        newEvent({ id: 'b', title: '乙', start: '1925-03-12 11:00' }),
      ],
      links: [
        { id: 'k', from: 'a', to: 'b', kind: 'cause', note: '第一行\r\n  第二行', gm: false },
      ],
    };
    const ch = chronicle(visibleDoc(d, 'gm'), '?', 'T', { links: true });
    const text = chronicleText(ch, 'gm');
    expect(text).toContain('　　← 起因：甲 # 標題注入（第一行 第二行）\n');
    expect(text).toContain('　　→ 導致：乙（第一行 第二行）\n');
    expect(text).not.toContain('\n# 標題注入（');
    const md = chronicleMarkdown(ch, 'gm');
    expect(md).toContain('  - ← 起因：甲 \\# 標題注入（第一行 第二行）\n');
    expect(chronicleHtml(ch, 'gm')).toContain(
      '<div class="link">← 起因：甲 # 標題注入（第一行 第二行）</div>',
    );
  });
});

describe('寫到時刻的架空曆：匯出的圖', () => {
  it('刻度與事件畫在時刻上（SVG 有「14:00」的刻度與日子的上排）', () => {
    const cal = months12(true);
    const info = calInfo(cal);
    if (!info) throw new Error('no info');
    const doc: TimelineDoc = {
      ...blankDoc(),
      title: '時刻',
      mode: 'year',
      calendar: cal,
      events: [
        newEvent({ title: '早', start: '302-03-05 08:00' }),
        newEvent({ title: '晚', start: '302-03-05 20:00' }),
      ],
    };
    const M = {
      item: createMeasure(12, 500),
      small: createMeasure(11, 400),
      major: createMeasure(11, 600),
      lane: createMeasure(12, 600),
      title: createMeasure(18, 700),
    };
    const pic = buildPicture({
      vdoc: visibleDoc(doc, 'pl'),
      range: { a: calValue(info, 302, 3, 5, 360), b: calValue(info, 302, 3, 5, 1320) },
      width: 1600,
      title: true,
      legend: true,
      theme: 'light',
      collapsed: {},
      measures: M,
      strings: {
        untitled: '?',
        main: '主線',
        fallbackTitle: 'T',
        gmUse: 'GM 用',
        progress: '目前進度',
        now: '現在',
        rangeText: '',
      },
      nowV: null,
    });
    const svg = pictureToSvg(pic, '');
    expect(svg).toContain('>14:00<');
    expect(svg).toContain('302 年 3 月 5 日');
    expect(svg).toContain('>早<');
  });
});
