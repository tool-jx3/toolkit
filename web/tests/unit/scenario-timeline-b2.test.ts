/**
 * 劇本時間表第二批（規格 F90～F94）：架空曆的月日（解讀、標準寫法、顯示、期間、吸附、刻度、年表、換算、改月份）、
 * 多選（框選、Shift＋點選、一起移動）、搜尋與篩選、關聯線（整理、PL 版、幾何、匯出的圖）、
 * 讀入 vis-timeline 的資料（HTML、時間、偵測、轉換），以及背景的標題一起堆疊、舊版資料照讀。
 */
import { describe, expect, it } from 'vitest';
import { buildPicture, pictureToSvg } from '@/tools/scenario-timeline/export/picture';
import { axisTicks, minorValues, snapUnitFor } from '@/tools/scenario-timeline/model/axis';
import {
  type Calendar,
  calInfo,
  calParts,
  calValue,
  normalizeCalendar,
  splitWeekdays,
} from '@/tools/scenario-timeline/model/calendar';
import { planCalendar } from '@/tools/scenario-timeline/model/calendarEdit';
import { chronicle, chronicleText } from '@/tools/scenario-timeline/model/chronicle';
import { eventsToCsv, parseEventsTable } from '@/tools/scenario-timeline/model/csv';
import { exampleDoc } from '@/tools/scenario-timeline/model/example';
import {
  effectiveFilter,
  emptyFilter,
  filteredDoc,
  filterOptions,
  isFiltering,
  matchingIds,
} from '@/tools/scenario-timeline/model/filter';
import { eventSpan, layoutTimeline } from '@/tools/scenario-timeline/model/layout';
import { linkGeometry, normalizeLinks } from '@/tools/scenario-timeline/model/links';
import { estimateWidth } from '@/tools/scenario-timeline/model/measure';
import { boxHits, moveGroup, rangeHits } from '@/tools/scenario-timeline/model/selection';
import {
  afterUnit,
  canonical,
  convertLoses,
  convertTime,
  endFromExclusive,
  formatLong,
  parseTime,
  readTime,
  snapTv,
  type TimeCtx,
} from '@/tools/scenario-timeline/model/time';
import {
  blankDoc,
  emptyReport,
  newEvent,
  normalizeDoc,
  type TimelineDoc,
} from '@/tools/scenario-timeline/model/types';
import {
  classifyArray,
  convertVis,
  detectVis,
  htmlToText,
  styleColor,
  visTime,
} from '@/tools/scenario-timeline/model/vis';
import { visibleDoc } from '@/tools/scenario-timeline/model/visible';
import { fitWithLabels, spanLimits, zoomWindow } from '@/tools/scenario-timeline/model/window';
import { snapForWidth } from '@/tools/scenario-timeline/view/shared';

const m11 = (t: string) => estimateWidth(t, 11);
const m12 = (t: string) => estimateWidth(t, 12);

/** 王國曆：霜月 30、雪月 31、花月 29（一年 90 天），一週 6 天 */
function kingdom(): Calendar {
  return normalizeCalendar({
    months: [
      { id: 'frost', name: '霜月', days: 30 },
      { id: 'snow', name: '雪月', days: 31 },
      { id: 'bloom', name: '花月', days: 29 },
    ],
    weekdays: ['光', '水', '火', '風', '土', '闇'],
    weekStart: 2,
  });
}
const ctxOf = (calendar: Calendar, era = '王國曆'): TimeCtx => ({ era, calendar });

const ok = (text: string, ctx: TimeCtx) => {
  const r = parseTime('year', text, ctx);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return r;
};

describe('架空曆的月日（F92）', () => {
  const ctx = ctxOf(kingdom());
  const info = calInfo(ctx.calendar);
  it('推算：一年的天數、位置、拆回年月日', () => {
    expect(info?.D).toBe(90);
    expect(info?.M).toBe(3);
    if (!info) throw new Error('no info');
    expect(calValue(info, 302, 2, 5)).toBeCloseTo(302 + 34 / 90, 12);
    for (const y of [-50, -1, 0, 1, 302, 999999])
      for (let doy = 0; doy < 90; doy += 7) {
        const v = y + doy / 90;
        const p = calParts(info, v);
        expect(p.y).toBe(y);
        expect(p.doy).toBe(doy);
      }
    /* 負的年：-1 年的最後一天在 0 年之前 */
    expect(calValue(info, -1, 3, 29)).toBeLessThan(0);
  });
  it('解讀：數字、名稱、全形、曆名、星期；只到年和第一批相同', () => {
    expect(ok('302', ctx).tv).toEqual({ v: 302, p: 'year' });
    expect(ok('王國曆302年', ctx).tv).toEqual({ v: 302, p: 'year' });
    expect(ok('302-2', ctx).tv.p).toBe('month');
    expect(ok('302年雪月', ctx).tv.v).toBeCloseTo(302 + 30 / 90, 12);
    const d = ok('302 年 雪月 5 日', ctx).tv;
    expect(d.p).toBe('day');
    expect(d.v).toBeCloseTo(302 + 34 / 90, 12);
    expect(ok('３０２／２／５', ctx).tv.v).toBeCloseTo(d.v, 12);
    expect(ok('302.2.5', ctx).tv.v).toBeCloseTo(d.v, 12);
    expect(ok('王國曆 302 年 雪月 5 日（風）', ctx).tv.v).toBeCloseTo(d.v, 12);
    expect(ok('-50-3-29', ctx).tv.v).toBeCloseTo(-50 + 89 / 90, 12);
    const bad = (t: string) => {
      const r = parseTime('year', t, ctx);
      return r.ok ? '' : r.error;
    };
    expect(bad('302-4')).toBe('月份要在 1～3 之間');
    expect(bad('302 花月 30')).toBe('花月只有 29 天');
    expect(bad('302-1-0')).toBe('日要在 1～30 之間');
    expect(bad('302 秋月')).toContain('看不懂');
  });
  it('名稱以數字開頭的月份（預設的「1 月」）', () => {
    const cal = normalizeCalendar({
      months: [
        { id: 'a', name: '1 月', days: 30 },
        { id: 'b', name: '2 月', days: 30 },
      ],
    });
    const c = ctxOf(cal, '');
    expect(ok('302年1月5日', c).tv.v).toBeCloseTo(302 + 4 / 60, 12);
    expect(ok('302 2 月', c).tv.p).toBe('month');
    expect(formatLong('year', ok('302-02-05', c).tv, c)).toBe('302 年 2 月 5 日');
  });
  it('星期：寫錯時照日期更正', () => {
    /* 第 1 年第 1 個月第 1 日是「火」（第 2 個），302 年雪月 5 日是第 301×90＋34 天之後 */
    const r = ok('302 雪月 5', ctx);
    const right = formatLong('year', r.tv, ctx);
    expect(right).toMatch(/^王國曆 302 年 雪月 5 日（.）$/);
    expect(formatLong('year', ok('1 霜月 1', ctx).tv, ctx)).toBe('王國曆 1 年 霜月 1 日（火）');
    expect(formatLong('year', ok('1 霜月 2', ctx).tv, ctx)).toBe('王國曆 1 年 霜月 2 日（風）');
    expect(formatLong('year', ok('0 花月 29', ctx).tv, ctx)).toBe('王國曆 0 年 花月 29 日（水）');
    expect(ok('1 霜月 1（光）', ctx).weekdayFixed).toBe(true);
    expect(ok('1 霜月 1（火）', ctx).weekdayFixed).toBeUndefined();
  });
  it('標準寫法、顯示；讀回逐字相同', () => {
    for (const t of ['302', '302-02', '302-02-05', '-50-03-29', '0-01-01']) {
      const tv = readTime('year', t, ctx);
      expect(tv && canonical('year', tv, ctx)).toBe(t);
    }
    expect(formatLong('year', ok('302-2', ctx).tv, ctx)).toBe('王國曆 302 年 雪月');
    expect(formatLong('year', ok('302', ctx).tv, ctx)).toBe('王國曆 302 年');
  });
  it('期間的結束包含整個單位；拖曳兩端的換算', () => {
    const day = ok('302-1-30', ctx).tv;
    expect(afterUnit('year', day, ctx)).toBeCloseTo(302 + 30 / 90, 12);
    const lastDay = ok('302-3-29', ctx).tv;
    expect(afterUnit('year', lastDay, ctx)).toBe(303);
    expect(afterUnit('year', ok('302-3', ctx).tv, ctx)).toBe(303);
    expect(afterUnit('year', ok('302-1', ctx).tv, ctx)).toBeCloseTo(302 + 30 / 90, 12);
    const back = endFromExclusive('year', 303, 'day', ctx);
    expect(canonical('year', back, ctx)).toBe('302-03-29');
    expect(canonical('year', endFromExclusive('year', 303, 'month', ctx), ctx)).toBe('302-03');
  });
  it('吸附：照寫法（日、月），只到年的仍然整年', () => {
    const tv = ok('302-2-5', ctx).tv;
    const snapped = snapTv('year', tv.v + 3.4 / 90, 'day', { kind: 'day', n: 1 }, ctx);
    expect(canonical('year', snapped, ctx)).toBe('302-02-08');
    const m = snapTv('year', tv.v, 'month', { kind: 'day', n: 1 }, ctx);
    expect(canonical('year', m, ctx)).toBe('302-02');
    const m2 = snapTv('year', tv.v + 20 / 90, 'month', { kind: 'day', n: 1 }, ctx);
    expect(canonical('year', m2, ctx)).toBe('302-03');
    expect(snapTv('year', 302.6, 'year', { kind: 'day', n: 1 }, ctx)).toEqual({
      v: 303,
      p: 'year',
    });
  });
  it('刻度：日、月的階梯；上排寫「302 年 雪月」；年以上照架空年', () => {
    if (!info) throw new Error('no info');
    const from = calValue(info, 302, 1, 25);
    const to = calValue(info, 302, 2, 15);
    const t = axisTicks('year', from, to, 3000, m11, ctx);
    expect(t.step).toEqual({ unit: 'day', n: 1 });
    expect(t.major.map((x) => x.label)).toEqual(['302 年 霜月', '302 年 雪月']);
    expect(t.minor.find((x) => Math.abs(x.v - calValue(info, 302, 2, 1)) < 1e-9)?.label).toBe('1');
    expect(t.snap).toEqual({ kind: 'day', n: 1 });
    const months = axisTicks('year', 300, 304, 150, m11, ctx);
    expect(months.step).toEqual({ unit: 'month', n: 1 });
    /* 第一格是左邊被切到的 299 年花月 */
    expect(months.minor.slice(0, 4).map((x) => x.label)).toEqual(['花月', '霜月', '雪月', '花月']);
    expect(months.major[0].label).toBe('300 年');
    const years = axisTicks('year', 0, 1000, 0.5, m11, ctx);
    expect(years.step.unit).toBe('year');
    expect(years.major).toEqual([]);
    expect(snapUnitFor('year', { unit: 'year', n: 1 }, ctx)).toEqual({ kind: 'month', n: 1 });
    /* 2 日一格：每月從 1 日數，月底不擠在 1 日旁邊（雪月 31 日不畫） */
    const two = minorValues(
      'year',
      { unit: 'day', n: 2 },
      from,
      calValue(info, 302, 3, 1),
      ctx,
    ).map((v) => calParts(info, v).d);
    expect(two).not.toContain(31);
    /* 沒有月份時和第一批一樣 */
    expect(axisTicks('year', 300, 400, 10, m11).step).toEqual({ unit: 'year', n: 5 });
  });
  it('畫面範圍：有月份時可以放大到 3 日；單一的事件全覽前後 15 日', () => {
    expect(spanLimits('year', ctx).min).toBeCloseTo(3 / 90, 12);
    expect(spanLimits('year').min).toBe(5);
    const w = zoomWindow('year', { start: 302, end: 303 }, 1000, undefined, ctx);
    expect(w.end - w.start).toBeCloseTo(3 / 90, 9);
    const doc: TimelineDoc = {
      ...blankDoc(),
      mode: 'year',
      calendar: ctx.calendar as Calendar,
      events: [newEvent({ id: 'a', start: '302-02-05' })],
    };
    const fit = fitWithLabels(visibleDoc(doc, 'gm'), 800, m12, 0);
    expect(fit.end - fit.start).toBeLessThan(1);
    expect(snapForWidth('year', fit, 800, doc).kind).toBe('day');
  });
  it('年表：依日子分段、期間的結束不寫同一年', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      title: '王國',
      mode: 'year',
      era: '王國曆',
      calendar: ctx.calendar as Calendar,
      events: [
        newEvent({ id: 'y', title: '戰爭', start: '302' }),
        newEvent({ id: 'a', title: '登基', start: '302-02-05' }),
        newEvent({
          id: 'b',
          title: '雪季',
          kind: 'range',
          start: '302-02-05',
          end: '302-03-02',
        }),
        newEvent({ id: 'c', title: '春祭', start: '302-03' }),
      ],
    };
    const ch = chronicle(visibleDoc(doc, 'gm'), '（無標題）', '劇本時間表');
    expect(ch.sections.map((s) => s.heading)).toEqual([
      '王國曆 302 年',
      expect.stringMatching(/^王國曆 302 年 雪月 5 日（.）$/),
      '王國曆 302 年 花月',
    ]);
    expect(ch.sections[1].rows.map((r) => r.time)).toEqual(['', '～花月 2 日']);
    expect(chronicleText(ch, 'pl')).toContain('■ 王國曆 302 年 花月');
  });
  it('CSV：架空曆的時間匯出再讀入逐欄相同', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      mode: 'year',
      calendar: ctx.calendar as Calendar,
      events: [
        newEvent({ title: '甲', start: '302-02-05' }),
        newEvent({ title: '乙', kind: 'range', start: '-3-01', end: '-3-03-29' }),
      ],
    };
    const csv = eventsToCsv(doc);
    const back = parseEventsTable(csv.replace(/^﻿/, ''), doc);
    expect(back.errors).toEqual([]);
    expect(back.events.map((e) => [e.start, e.end])).toEqual([
      ['-3-01', '-3-03-29'],
      ['302-02-05', ''],
    ]);
  });
  it('換寫法：架空曆的月日換成日期時間、第 N 天只留年（失去精度）', () => {
    expect(convertTime('year', 'date', '302-02-05', { era: ctx, dayOne: 0 })).toBe('0302');
    expect(convertLoses('year', 'date', '302-02-05', ctx)).toBe(true);
    expect(convertLoses('year', 'date', '302', ctx)).toBe(false);
    expect(convertTime('date', 'year', '1925-03-12', { era: ctx, dayOne: 0 })).toBe('1925');
  });
  it('改月份：排序跟著月份、刪掉與天數變少的調整、關掉月份只留年', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      mode: 'year',
      era: '王國曆',
      calendar: kingdom(),
      events: [
        newEvent({ id: 'a', title: '甲', start: '302-02-31' }),
        newEvent({ id: 'b', title: '乙', start: '302' }),
        newEvent({ id: 'c', title: '丙', kind: 'range', start: '302-01-10', end: '302-02-03' }),
      ],
      markers: [{ id: 'm', label: '標', time: '302-03-01', color: '#000000', gm: false }],
    };
    const cal = doc.calendar;
    /* 雪月移到最前面：意思相同、寫法改了 */
    const swapped = { ...cal, months: [cal.months[1], cal.months[0], cal.months[2]] };
    const p1 = planCalendar(doc, swapped, '（無標題）');
    expect(p1.events.map((e) => [e.start, e.end])).toEqual([
      ['302-01-31', ''],
      ['302', ''],
      /* 丙：霜月 10 日～雪月 3 日，雪月移到前面後結束比開始早，結束改成同一天（調整） */
      ['302-02-10', '302-02-10'],
    ]);
    expect(p1.adjusted).toBe(1);
    /* 雪月改成 28 天：31 日改成 28 日 */
    const shorter = {
      ...cal,
      months: cal.months.map((m) => (m.id === 'snow' ? { ...m, days: 28 } : m)),
    };
    const p2 = planCalendar(doc, shorter, '（無標題）');
    expect(p2.events[0].start).toBe('302-02-28');
    expect(p2.adjusted).toBe(1);
    expect(p2.examples[0].name).toBe('甲');
    /* 刪掉中間的雪月：雪月的時間改用同一個位置的月份（花月），寫法沒變也算調整；後面的月份跟著序號 */
    const doc5: TimelineDoc = {
      ...doc,
      events: [
        newEvent({ id: 'x', title: '雪中', start: '302-02-10' }),
        newEvent({ id: 'y', title: '雪月', start: '302-02' }),
        newEvent({ id: 'z', title: '花開', start: '302-03-05' }),
      ],
      markers: [{ id: 'm', label: '雪標', time: '302-02-01', color: '#000000', gm: false }],
    };
    const p5 = planCalendar(
      doc5,
      { ...cal, months: cal.months.filter((m) => m.id !== 'snow') },
      '（無標題）',
    );
    expect(p5.events.map((e) => e.start)).toEqual(['302-02-10', '302-02', '302-02-05']);
    expect(p5.markers[0].time).toBe('302-02-01');
    expect(p5.adjusted).toBe(3);
    expect(p5.renumbered).toBe(1);
    expect(p5.examples.map((x) => [x.name, x.from, x.to])).toEqual([
      ['雪中', expect.stringContaining('雪月 10 日'), expect.stringContaining('花月 10 日')],
      ['雪月', '王國曆 302 年 雪月', '王國曆 302 年 花月'],
      ['雪標', expect.stringContaining('雪月 1 日'), expect.stringContaining('花月 1 日')],
    ]);
    /* 關掉月份 */
    const p3 = planCalendar(doc, { ...cal, months: [] }, '（無標題）');
    expect(p3.events.map((e) => [e.start, e.end])).toEqual([
      ['302', ''],
      ['302', ''],
      ['302', '302'],
    ]);
    expect(p3.markers[0].time).toBe('302');
    expect(p3.lossy).toBe(3);
    /* 打開月份：只到年的都不變 */
    const yearOnly: TimelineDoc = {
      ...doc,
      calendar: { ...cal, months: [] },
      events: [doc.events[1]],
    };
    const p4 = planCalendar(yearOnly, cal, '（無標題）');
    expect(p4.events[0]).toBe(yearOnly.events[0]);
    expect(p4.renumbered + p4.adjusted + p4.lossy).toBe(0);
  });
  it('整理：天數夾在 1～100、月份最多 24 個、星期少於 2 個不用', () => {
    const c = normalizeCalendar({
      months: Array.from({ length: 30 }, (_, i) => ({ name: `M${i}`, days: i === 0 ? 0 : 500 })),
      weekdays: ['一'],
      weekStart: 5,
    });
    expect(c.months).toHaveLength(24);
    expect(c.months[0].days).toBe(1);
    expect(c.months[1].days).toBe(100);
    expect(c.weekdays).toEqual([]);
    expect(splitWeekdays('日、月 火,水')).toEqual(['日', '月', '火', '水']);
  });
});

describe('範例的關聯線', () => {
  it('三條（一條 GM 專用）；兩端都存在；PL 版只剩兩條', () => {
    const ex = exampleDoc();
    expect(normalizeDoc(ex)?.links).toEqual(ex.links);
    expect(ex.links).toHaveLength(3);
    expect(visibleDoc(ex, 'pl').links.map((k) => k.id)).toEqual(['lk-letter', 'lk-bell']);
  });
});

describe('舊版資料（第一批，version 1）照讀', () => {
  it('沒有 calendar、links 時補上預設，其他欄位逐欄相同', () => {
    const v1 = JSON.parse(JSON.stringify(exampleDoc())) as Record<string, unknown>;
    delete v1.calendar;
    delete v1.links;
    const r = emptyReport();
    const doc = normalizeDoc(v1, r);
    expect(doc).not.toBeNull();
    const { calendar, links, ...rest } = doc as TimelineDoc;
    expect(calendar).toEqual({ months: [], weekdays: [], weekStart: 0 });
    expect(links).toEqual([]);
    expect(rest).toEqual(v1);
    expect(r.unknownMode).toBeNull();
  });
  it('看不懂的時間寫法要回報', () => {
    const r = emptyReport();
    const doc = normalizeDoc({ mode: 'moon', events: [] }, r);
    expect(doc?.mode).toBe('date');
    expect(r.unknownMode).toBe('moon');
  });
});

/** 第 N 天的小專案：三條泳道、幾個事件 */
function smallDoc(): TimelineDoc {
  return {
    ...blankDoc(),
    mode: 'day',
    lanes: [
      { id: 'l1', name: '甲', kind: 'npc', color: '#4f7cff', parentId: '', gm: false },
      { id: 'l2', name: '乙', kind: 'npc', color: '#e0565b', parentId: '', gm: false },
      { id: 'l3', name: '丙', kind: 'place', color: '#2fa37a', parentId: '', gm: true },
      { id: 'l4', name: '甲之子', kind: 'other', color: '#2fa37a', parentId: 'l1', gm: false },
    ],
    categories: [{ id: 'c1', name: '線索', color: '#000000' }],
    events: [
      newEvent({ id: 'a', title: '早餐', start: '第 1 天 08:00', laneId: 'l1', place: '旅館' }),
      newEvent({
        id: 'b',
        title: '會面',
        start: '第 1 天 10:00',
        laneId: 'l2',
        people: ['偵探', '管家'],
        categoryId: 'c1',
      }),
      newEvent({
        id: 'c',
        title: '密會',
        start: '第 1 天 12:00',
        laneId: 'l3',
        gmNote: '管家其實是兇手',
      }),
      newEvent({ id: 'd', title: '晚餐', start: '第 1 天 18:00', laneId: 'l4', gm: true }),
      newEvent({
        id: 'e',
        title: '暴雨',
        kind: 'range',
        start: '第 1 天 09:00',
        end: '第 1 天 11:00',
        laneId: 'l2',
        description: '管家撐傘出門',
      }),
    ],
  };
}

describe('多選（F90）', () => {
  const doc = smallDoc();
  const vdoc = visibleDoc(doc, 'gm');
  const k = 1;
  const layout = layoutTimeline(vdoc, { k, measure: m12, collapsed: {}, untitled: '（無）' });
  const xOf = (v: number) => (v - layout.origin) * k;
  it('框選：和框重疊的事件', () => {
    const rowB = layout.rows.find((r) => r.key === 'l2');
    if (!rowB) throw new Error('row');
    const hits = boxHits(
      layout,
      { left: xOf(9 * 60), right: xOf(10 * 60 + 5), top: rowB.y, bottom: rowB.y + rowB.height },
      xOf,
    );
    expect(hits.sort()).toEqual(['b', 'e']);
    const none = boxHits(layout, { left: -100, right: -50, top: 0, bottom: 1000 }, xOf);
    expect(none).toEqual([]);
    /* 不符合篩選的不算 */
    expect(
      boxHits(layout, { left: -1e6, right: 1e6, top: 0, bottom: 1e6 }, xOf, (id) => id !== 'a'),
    ).not.toContain('a');
  });
  it('Shift＋點選：兩者之間的列與時間範圍', () => {
    /* 甲 08:00～乙 10:00：暴雨（09:00～11:00）沒有整個在範圍裡，不算（和 vis-timeline 相同） */
    expect(rangeHits(layout, 'a', 'b').sort()).toEqual(['a', 'b']);
    const rowE = layout.items.find((x) => x.id === 'e');
    expect(rowE).toBeDefined();
    expect(rangeHits(layout, 'e', 'a').sort()).toEqual(['a', 'b', 'e']);
    expect(rangeHits(layout, 'a', 'a')).toEqual(['a']);
  });
  it('一起移動：位移照被拖的、各自照自己的寫法；列一起移、夾在範圍裡', () => {
    const rows = layout.rows.map((r) => r.key);
    const out = moveGroup(
      'day',
      '',
      [
        { id: 'a', start: '第 1 天 08:00', end: '', laneId: 'l1', row: 0 },
        { id: 'x', start: '第 2 天', end: '', laneId: 'l2', row: rows.length - 1 },
      ],
      90,
      1,
      rows,
    );
    expect(out[0]).toEqual({ id: 'a', start: '第 1 天 09:30', end: '', laneId: rows[1] });
    /* 只到日的：90 分鐘四捨五入到 0 天；最後一列再往下仍在最後一列 */
    expect(out[1]).toEqual({ id: 'x', start: '第 2 天', end: '', laneId: rows[rows.length - 1] });
    const day = moveGroup(
      'day',
      '',
      [{ id: 'x', start: '第 2 天', end: '第 3 天', laneId: '', row: 0 }],
      1440 * 2 - 30,
      0,
      rows,
    );
    expect(day[0]).toMatchObject({ start: '第 4 天', end: '第 5 天', laneId: '' });
  });
});

describe('搜尋與篩選（F91）', () => {
  const doc = smallDoc();
  it('文字（每個詞都要有）、泳道（含子泳道）、分類、地點、角色、GM 專用', () => {
    const gm = visibleDoc(doc, 'gm');
    const ids = (f: Partial<ReturnType<typeof emptyFilter>>) =>
      [...(matchingIds(gm, { ...emptyFilter(), ...f }) ?? [])].sort();
    expect(matchingIds(gm, emptyFilter())).toBeNull();
    expect(ids({ text: '管家' })).toEqual(['b', 'c', 'e']);
    expect(ids({ text: '管家 傘' })).toEqual(['e']);
    expect(ids({ text: 'ＧＭ' })).toEqual([]);
    expect(ids({ lanes: ['l1'] })).toEqual(['a', 'd']);
    expect(ids({ lanes: ['l4', 'l3'] })).toEqual(['c', 'd']);
    expect(ids({ categories: ['c1'] })).toEqual(['b']);
    expect(ids({ categories: [''] })).toEqual(['a', 'c', 'd', 'e']);
    expect(ids({ places: ['旅館'] })).toEqual(['a']);
    expect(ids({ people: ['偵探'] })).toEqual(['b']);
    expect(ids({ gm: 'only' })).toEqual(['d']);
    expect(ids({ gm: 'none', lanes: ['l1'] })).toEqual(['a']);
    /* 不存在的值不算條件（不會全部消失） */
    expect(matchingIds(gm, { ...emptyFilter(), lanes: ['gone'] })).toBeNull();
  });
  it('選「主線」只有主線的事件（最上層泳道的事件不算；驗證者發現）', () => {
    const d: TimelineDoc = {
      ...doc,
      events: [...doc.events, newEvent({ id: 'm', title: '主線的', start: '第 1 天 07:00' })],
    };
    const gm = visibleDoc(d, 'gm');
    expect([...(matchingIds(gm, { ...emptyFilter(), lanes: [''] }) ?? [])]).toEqual(['m']);
    expect([...(matchingIds(gm, { ...emptyFilter(), lanes: ['', 'l2'] }) ?? [])].sort()).toEqual([
      'b',
      'e',
      'm',
    ]);
    /* 子泳道的事件：選上層才算，選主線不算 */
    expect([...(matchingIds(gm, { ...emptyFilter(), lanes: ['l1'] }) ?? [])].sort()).toEqual([
      'a',
      'd',
    ]);
  });
  it('面板上沒有對應選項的條件不算（沒有事件在用的分類、主線、地點）', () => {
    const d: TimelineDoc = {
      ...doc,
      categories: [...doc.categories, { id: 'c2', name: '沒人用', color: '#000000' }],
    };
    const gm = visibleDoc(d, 'gm');
    expect(matchingIds(gm, { ...emptyFilter(), categories: ['c2'] })).toBeNull();
    /* 沒有主線的事件時「主線」不算 */
    expect(matchingIds(gm, { ...emptyFilter(), lanes: [''] })).toBeNull();
    expect(matchingIds(gm, { ...emptyFilter(), places: ['沒有的地點'] })).toBeNull();
    /* PL 檢視：只有 GM 事件在用的分類不算 */
    const d2: TimelineDoc = {
      ...doc,
      events: doc.events.map((e) => (e.id === 'd' ? { ...e, categoryId: 'c9' } : e)),
      categories: [...doc.categories, { id: 'c9', name: '秘密分類', color: '#000000' }],
    };
    expect(matchingIds(visibleDoc(d2, 'pl'), { ...emptyFilter(), categories: ['c9'] })).toBeNull();
    expect(matchingIds(visibleDoc(d2, 'gm'), { ...emptyFilter(), categories: ['c9'] })?.size).toBe(
      1,
    );
  });
  it('PL 檢視：GM 筆記不搜、GM 專用的值不算、選項不含 GM 專用的名稱', () => {
    const pl = visibleDoc(doc, 'pl');
    expect(matchingIds(pl, { ...emptyFilter(), text: '兇手' })?.size).toBe(0);
    expect(matchingIds(visibleDoc(doc, 'gm'), { ...emptyFilter(), text: '兇手' })?.size).toBe(1);
    const f = effectiveFilter(pl, { ...emptyFilter(), lanes: ['l3'], gm: 'only' });
    expect(isFiltering(f)).toBe(false);
    const opts = filterOptions(pl, '（無）');
    expect(JSON.stringify(opts)).not.toContain('丙');
    expect(opts.lanes.map((l) => [l.name, l.depth])).toEqual([
      ['甲', 0],
      ['甲之子', 1],
      ['乙', 0],
    ]);
  });
  it('只留符合的事件與兩端都在的關聯線', () => {
    const gm = visibleDoc(
      { ...doc, links: [{ id: 'k', from: 'a', to: 'b', kind: 'cause', note: '', gm: false }] },
      'gm',
    );
    const out = filteredDoc(gm, new Set(['a']));
    expect(out.events.map((e) => e.id)).toEqual(['a']);
    expect(out.links).toEqual([]);
    expect(filteredDoc(gm, null)).toBe(gm);
  });
});

describe('關聯線（F93）', () => {
  const doc = smallDoc();
  it('整理：兩端要存在、不能連自己、重複的只留一條、認不得的種類當「導致」', () => {
    const ids = new Set(['a', 'b', 'c']);
    const r = normalizeLinks(
      [
        { id: 'k1', from: 'a', to: 'b', kind: 'cause' },
        { id: 'k2', from: 'a', to: 'b', kind: 'cause' },
        { id: 'k3', from: 'a', to: 'a' },
        { id: 'k4', from: 'a', to: 'zz' },
        { id: 'k1', from: 'b', to: 'c', kind: 'weird', note: 'x'.repeat(300), gm: true },
        null,
      ],
      ids,
    );
    expect(r.links.map((k) => [k.from, k.to, k.kind])).toEqual([
      ['a', 'b', 'cause'],
      ['b', 'c', 'cause'],
    ]);
    expect(r.links[1].id).not.toBe('k1');
    expect(r.links[1].note).toHaveLength(200);
    expect(r.skipped).toBe(4);
  });
  it('PL 版：GM 專用的線、一端是 PL 看不到的事件的線都拿掉；GM 版標出來', () => {
    const d: TimelineDoc = {
      ...doc,
      links: [
        { id: 'k1', from: 'a', to: 'b', kind: 'cause', note: '', gm: false },
        { id: 'k2', from: 'a', to: 'b', kind: 'same', note: '', gm: true },
        { id: 'k3', from: 'b', to: 'c', kind: 'conflict', note: '', gm: false },
      ],
    };
    expect(visibleDoc(d, 'pl').links.map((k) => k.id)).toEqual(['k1']);
    expect(visibleDoc(d, 'gm').links.map((k) => [k.id, k.secret])).toEqual([
      ['k1', false],
      ['k2', true],
      ['k3', true],
    ]);
  });
  it('幾何：從右邊連到左邊、導致有箭頭', () => {
    const g = linkGeometry(
      { kind: 'point', x1: 100, x2: 100, cy: 10 },
      { kind: 'range', x1: 300, x2: 400, cy: 50 },
      true,
    );
    expect(g.sx).toBe(106);
    expect(g.ex).toBe(299);
    expect(g.head?.[0]).toEqual([299, 50]);
    expect(g.d.startsWith('M106 10C')).toBe(true);
  });
  it('匯出的圖：PL 用不畫 GM 專用的線，GM 用畫成琥珀色', () => {
    const d: TimelineDoc = {
      ...doc,
      links: [
        { id: 'k1', from: 'a', to: 'b', kind: 'cause', note: '', gm: false },
        { id: 'k2', from: 'a', to: 'e', kind: 'conflict', note: '', gm: true },
      ],
    };
    const pic = (audience: 'gm' | 'pl') =>
      pictureToSvg(
        buildPicture({
          vdoc: visibleDoc(d, audience),
          range: { a: 0, b: 1440 },
          width: 1200,
          title: false,
          legend: false,
          theme: 'light',
          collapsed: {},
          measures: { item: m12, small: m11, lane: m12, title: m12 },
          strings: {
            untitled: '（無）',
            main: '主線',
            fallbackTitle: '劇本時間表',
            gmUse: 'GM 用',
            progress: '目前進度',
            now: '現在',
            rangeText: '',
          },
          nowV: null,
        }),
      );
    const pl = pic('pl');
    expect((pl.match(/<path /g) ?? []).length).toBe(1);
    expect(pl).not.toContain('#d99a1e');
    const gm = pic('gm');
    expect((gm.match(/<path /g) ?? []).length).toBe(3);
    expect(gm).toContain('stroke="#d99a1e"');
  });
  it('專案檔：關聯線讀回時兩端不存在的略過並回報', () => {
    const r = emptyReport();
    const out = normalizeDoc(
      {
        ...doc,
        links: [
          { id: 'k1', from: 'a', to: 'b', kind: 'cause' },
          { id: 'k2', from: 'a', to: 'nope', kind: 'cause' },
        ],
      },
      r,
    );
    expect(out?.links.map((k) => k.id)).toEqual(['k1']);
    expect(r.skippedLinks).toBe(1);
  });
});

describe('背景的標題和同一列的事件一起堆疊（7.1 第 11 點）', () => {
  it('同一個位置的事件放到下一層，不會蓋住背景的標題', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      mode: 'day',
      events: [
        newEvent({
          id: 'bg',
          title: '濃霧',
          kind: 'background',
          start: '第 1 天 10:00',
          end: '第 1 天 20:00',
        }),
        newEvent({ id: 'p', title: '抵達', start: '第 1 天 10:00' }),
      ],
    };
    const lay = layoutTimeline(visibleDoc(doc, 'gm'), {
      k: 1,
      measure: m12,
      collapsed: {},
      untitled: '',
    });
    const bg = lay.backgrounds[0];
    const p = lay.items[0];
    expect(bg.labelRow).toBe(p.row);
    expect(bg.labelLevel).not.toBe(p.level);
    expect(lay.rows[0].levels).toBe(2);
    /* 離得遠的不影響 */
    doc.events[1] = newEvent({ id: 'p', title: '抵達', start: '第 1 天 19:00' });
    const lay2 = layoutTimeline(visibleDoc(doc, 'gm'), {
      k: 1,
      measure: m12,
      collapsed: {},
      untitled: '',
    });
    expect(lay2.rows[0].levels).toBe(1);
  });
});

describe('匯出的圖：右邊的下排刻度字不畫半截（7.1 第 11 點）', () => {
  it('各種寬度與範圍，下排的字都整個在時間軸裡', () => {
    const doc = smallDoc();
    for (const width of [600, 777, 1013, 1600]) {
      for (const [a, b] of [
        [0, 1440],
        [37, 1500],
        [-200, 3100],
        [0, 9 * 1440 + 17],
      ]) {
        const pic = buildPicture({
          vdoc: visibleDoc(doc, 'gm'),
          range: { a, b },
          width,
          title: false,
          legend: false,
          theme: 'light',
          collapsed: {},
          measures: { item: m12, small: m11, lane: m12, title: m12 },
          strings: {
            untitled: '（無）',
            main: '主線',
            fallbackTitle: '劇本時間表',
            gmUse: 'GM 用',
            progress: '目前進度',
            now: '現在',
            rangeText: '',
          },
          nowV: null,
        });
        const texts: { x: number; y: number; text: string; size: number; weight: number }[] = [];
        const walk = (list: typeof pic.prims) => {
          for (const p of list) {
            if (p.t === 'clip') walk(p.children);
            else if (p.t === 'text') texts.push(p);
          }
        };
        walk(pic.prims);
        const minor = texts.filter((t) => t.y === 40 && t.size === 11 && t.weight === 400);
        expect(minor.length).toBeGreaterThan(0);
        for (const t of minor) expect(t.x + m11(t.text)).toBeLessThanOrEqual(width + 0.001);
      }
    }
  });
});

describe('讀入 vis-timeline 的資料（F94）', () => {
  it('HTML 轉純文字', () => {
    expect(htmlToText('<b>item</b> 1')).toBe('item 1');
    expect(htmlToText('A<br>B<script>alert(1)</script>&amp;&lt;x&gt;&#x4e2d;&#25991;&nbsp;!')).toBe(
      'A B &<x>中文 !',
    );
    expect(htmlToText('<p>第一行</p><p>第二行</p>', true)).toBe('第一行\n第二行');
    expect(htmlToText('<img src=x onerror=alert(1)>圖')).toBe('圖');
    /* 轉小寫會變長的字（İ）不會讓後面的標籤錯位；大寫的標籤名稱也認得 */
    expect(htmlToText('İ<script>evil</script>x')).toBe('İ x');
    expect(htmlToText('İİİ<br>y', true)).toBe('İİİ\ny');
    expect(htmlToText('a<SCRIPT>x</Script>b<BR>c', true)).toBe('a b\nc');
  });
  it('時間：ISO（沒有時區照寫的）、只到日、數字、ASP.NET 的寫法', () => {
    expect(canonical('date', visTime('2014-01-01T01:00:00') ?? { v: 0, p: 'day' })).toBe(
      '2014-01-01 01:00',
    );
    expect(canonical('date', visTime('2014-04-20') ?? { v: 0, p: 'minute' })).toBe('2014-04-20');
    expect(visTime('2014-02-30')).toBeNull();
    expect(visTime('不是時間')).toBeNull();
    expect(visTime({})).toBeNull();
    /* 有時區、數字：換成這台電腦的時間（測試在 UTC 以外的時區也成立：和 Date 的換算一致） */
    const d = new Date('2014-01-01T00:00:00Z');
    const local = visTime('2014-01-01T00:00:00.000Z');
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(local && canonical('date', local).slice(0, 10)).toBe(expected);
    expect(visTime(d.getTime())).toEqual(local);
    expect(visTime(`/Date(${d.getTime()})/`)).toEqual(local);
  });
  it('很長的「<」、沒收尾的註解與 script 是線性時間（驗證者的 redos 情境）', () => {
    for (const unit of ['<', '<script ', '<!--', '<script>', '<a', '</p', '<!-', '&a', '<br>x']) {
      const s = unit.repeat(Math.ceil(200_000 / unit.length));
      const t0 = performance.now();
      htmlToText(s);
      htmlToText(s, true, 4000);
      expect(performance.now() - t0, unit).toBeLessThan(400);
    }
    expect(htmlToText('<'.repeat(5))).toBe('<<<<<');
    expect(htmlToText('a <!-- 沒收尾 <b>x</b>')).toBe('a');
    expect(htmlToText('<script>a<b>c')).toBe('ac');
    expect(htmlToText('x<scripts>y</scripts>')).toBe('xy');
    expect(htmlToText('<STYLE>p{}</STYLE>文字')).toBe('文字');
    /* 字數上限：很長的內容截到夠用就停 */
    expect(htmlToText('字'.repeat(100_000), false, 200).length).toBeLessThanOrEqual(200 * 4 + 256);
  });
  it('vis-timeline 的轉換：很長的 content／title 很快（50000 個註解開頭、120000 個「<」）', () => {
    const t0 = performance.now();
    const r = convertVis(
      {
        items: [
          { content: '<'.repeat(120_000), title: '<!--'.repeat(50_000), start: '2014-04-20' },
        ],
        groups: null,
      },
      blankDoc(),
    );
    expect(performance.now() - t0).toBeLessThan(100);
    expect(r.events[0].title).toBe('<'.repeat(200));
    expect(r.events[0].description).toBe('');
  });
  it('不同上層底下的同名分組是不同的泳道（vis-timeline 三層範例的兩個 North America）', () => {
    const r = convertVis(
      {
        items: [
          { content: 'a', start: '2014-01-01', group: 1 },
          { content: 'b', start: '2014-01-01', group: 101 },
        ],
        groups: [
          { id: 10, content: 'Group 10', nestedGroups: [1, 2] },
          { id: 1, content: 'North America' },
          { id: 2, content: 'Europe' },
          { id: 100, content: 'Group 100', nestedGroups: [101] },
          { id: 101, content: 'North America' },
        ],
      },
      blankDoc(),
    );
    const na = r.lanes.filter((l) => l.name === 'North America');
    expect(na).toHaveLength(2);
    expect(new Set(na.map((l) => l.parentId)).size).toBe(2);
    expect(r.events[0].laneId).not.toBe(r.events[1].laneId);
  });
  it('style 的背景色', () => {
    expect(styleColor('color: red; background-color: #F00;')).toBe('#ff0000');
    expect(styleColor('background: rgb(0, 128, 255) url(x.png)')).toBe('#0080ff');
    expect(styleColor('background-color: transparent')).toBe('');
    expect(styleColor('color: #123456')).toBe('');
    expect(styleColor(3)).toBe('');
  });
  it('偵測：items 陣列、groups 陣列、{ items, groups }', () => {
    expect(classifyArray([{ start: '2014-01-01' }])).toBe('items');
    expect(classifyArray([{ id: 1, content: 'A' }])).toBe('groups');
    expect(classifyArray([1, 2])).toBeNull();
    expect(
      detectVis([[{ id: 1, content: 'a', start: '2014-01-01' }], [{ id: 'g', content: 'G' }]]),
    ).toMatchObject({
      items: [{ id: 1 }],
      groups: [{ id: 'g' }],
    });
    expect(detectVis([{ items: [{ start: '2014-01-01' }], groups: [] }])?.items).toHaveLength(1);
    expect(detectVis([{ data: { items: [{ start: '2014-01-01' }] } }])?.items).toHaveLength(1);
    expect(detectVis([[{ id: 'g', content: 'G' }]])).toBeNull();
    expect(detectVis([{ format: 'trpg-toolkit-project' }])).toBeNull();
  });
  it('轉換：種類、end 的「那一刻」、泳道與巢狀、className、style、略過的欄位', () => {
    const r = convertVis(
      {
        items: [
          {
            id: 1,
            content: '<b>item</b> 1',
            start: '2014-04-20',
            group: 'a',
            title: '說明<br>第二行',
          },
          {
            id: 2,
            content: 'range',
            start: '2014-04-16',
            end: '2014-04-19',
            group: 'a1',
            className: 'red',
          },
          { id: 3, content: 'bg', start: '2014-04-10', end: '2014-04-12', type: 'background' },
          {
            id: 4,
            content: 'pt',
            start: '2014-04-25T10:30',
            type: 'point',
            subgroup: 'x',
            editable: false,
          },
          {
            id: 5,
            content: 'box',
            start: '2014-04-26',
            type: 'box',
            style: 'background-color: #F00; color: white',
          },
          { id: 6, content: 'zero', start: '2014-04-26', end: '2014-04-26' },
          { id: 7, content: 'nostart' },
          { id: 8, content: 'weird', start: '2014-04-26', type: 'cloud' },
          { id: 9, content: 'deep', start: '2014-04-27', group: 'a1x' },
          { id: 10, content: 'auto', start: '2014-04-28', group: 99 },
          {
            id: 11,
            content: 'rgb',
            start: '2014-04-28T12:00',
            end: '2014-04-28T13:45',
            style: 'background: rgb(0, 128, 255)',
          },
          'junk',
        ],
        groups: [
          { id: 'a', content: '<i>泳道 A</i>', nestedGroups: ['a1'], showNested: false, order: 2 },
          { id: 'a1', content: 'A-1', nestedGroups: ['a1x'], order: 3 },
          { id: 'a1x', content: 'A-1-x' },
          { id: 'b', content: '泳道 B', order: 1, visible: false, className: 'x' },
        ],
      },
      { ...blankDoc(), mode: 'date' },
    );
    expect(
      r.lanes.map((l) => [
        l.name,
        l.parentId ? r.lanes.find((x) => x.id === l.parentId)?.name : '',
      ]),
    ).toEqual([
      ['泳道 B', ''],
      ['泳道 A', ''],
      ['A-1', '泳道 A'],
      ['A-1-x', '泳道 A'],
      ['分組 99', ''],
    ]);
    expect(r.collapsed).toEqual([r.lanes[1].id]);
    const by = Object.fromEntries(r.events.map((e) => [e.title, e]));
    expect(by['item 1']).toMatchObject({
      kind: 'point',
      start: '2014-04-20',
      description: '說明\n第二行',
    });
    expect(by.range).toMatchObject({ kind: 'range', start: '2014-04-16', end: '2014-04-18' });
    expect(r.categories.map((c) => c.name)).toEqual(['red']);
    expect(by.range.categoryId).toBe(r.categories[0].id);
    expect(by.bg).toMatchObject({ kind: 'background', start: '2014-04-10', end: '2014-04-11' });
    expect(by.pt).toMatchObject({ kind: 'point', start: '2014-04-25 10:30' });
    expect(by.box).toMatchObject({ kind: 'point', color: '#ff0000' });
    expect(by.zero.kind).toBe('point');
    expect(by.deep.laneId).toBe(r.lanes[3].id);
    expect(by.rgb).toMatchObject({
      kind: 'range',
      start: '2014-04-28 12:00',
      end: '2014-04-28 13:45',
      color: '#0080ff',
    });
    expect(r.skipped.map((s) => s.index)).toEqual([7, 8, 12]);
    expect(r.ignored).toEqual(
      expect.arrayContaining([
        ['subgroup', 1],
        ['editable', 1],
        ['className', 1],
      ]),
    );
    expect(r.notes.join('')).toContain('巢狀超過一層');
    expect(r.total).toBe(12);
  });
  it('專案是第 N 天、架空年時換算；同名的泳道沿用', () => {
    const items = [
      { content: 'a', start: '2014-04-20T08:00', group: 1 },
      { content: 'b', start: '2014-04-22', end: '2014-04-24', group: 1 },
    ];
    const day = convertVis(
      { items, groups: [{ id: 1, content: '既有' }] },
      {
        ...blankDoc(),
        mode: 'day',
        lanes: [
          { id: 'old', name: '既有', kind: 'npc', color: '#000000', parentId: '', gm: false },
        ],
      },
    );
    expect(day.events.map((e) => [e.start, e.end, e.laneId])).toEqual([
      ['第 1 天 08:00', '', 'old'],
      ['第 3 天', '第 4 天', 'old'],
    ]);
    expect(day.lanes).toEqual([]);
    const year = convertVis({ items, groups: null }, { ...blankDoc(), mode: 'year' });
    /* 架空年：取西元年（2014～2014 是一整年的期間） */
    expect(year.events.map((e) => [e.kind, e.start, e.end])).toEqual([
      ['point', '2014', ''],
      ['range', '2014', '2014'],
    ]);
  });
  it('上限：事件最多幾個，多的通知', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ content: `e${i}`, start: '2014-01-01' }));
    const r = convertVis({ items, groups: null }, blankDoc(), 3);
    expect(r.events).toHaveLength(3);
    expect(r.notes.join('')).toContain('2 個項目沒有讀入');
  });
});

describe('篩選、架空曆與 eventSpan 的快取', () => {
  it('換了架空曆時重新解讀', () => {
    const e = newEvent({ start: '302-02-05' });
    const a = eventSpan('year', e, ctxOf(kingdom()));
    const other = normalizeCalendar({
      months: [
        { id: 'x', name: 'X', days: 10 },
        { id: 'y', name: 'Y', days: 10 },
      ],
    });
    const b = eventSpan('year', e, ctxOf(other));
    expect(a?.a).toBeCloseTo(302 + 34 / 90, 9);
    expect(b?.a).toBeCloseTo(302 + 14 / 20, 9);
  });
});
