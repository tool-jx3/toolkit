/**
 * 劇本時間表的排版（規格 F24、F27、F33、F34、3.3～3.5）與 GM／PL（F60、F38）：
 * 刻度的階梯與標籤、吸附單位、堆疊、列（主線、巢狀、收合）、畫面範圍、PL 版的資料。
 */
import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  majorTicks,
  minorValues,
  pickStep,
  snapUnitFor,
} from '@/tools/scenario-timeline/model/axis';
import { exampleDoc } from '@/tools/scenario-timeline/model/example';
import { collectFlags, placeFlags } from '@/tools/scenario-timeline/model/flags';
import {
  contentRange,
  eventSpan,
  layoutRows,
  layoutTimeline,
  rowHeight,
  stackLevels,
} from '@/tools/scenario-timeline/model/layout';
import { estimateWidth } from '@/tools/scenario-timeline/model/measure';
import { dateParts, dateValue, MINUTES_PER_DAY } from '@/tools/scenario-timeline/model/time';
import { blankDoc, newEvent, type TimelineDoc } from '@/tools/scenario-timeline/model/types';
import {
  hasSecrets,
  secretLaneIds,
  usedCategories,
  visibleDoc,
} from '@/tools/scenario-timeline/model/visible';
import {
  clampWindow,
  fitWindow,
  fitWithLabels,
  isMouseWheel,
  panWindow,
  spanLimits,
  wheelZoomFactor,
  zoomWindow,
} from '@/tools/scenario-timeline/model/window';

const m11 = (t: string) => estimateWidth(t, 11);
const m12 = (t: string) => estimateWidth(t, 12);
const D = MINUTES_PER_DAY;

describe('刻度（3.4）', () => {
  it('依每單位的像素挑第一個放得下標籤的間隔', () => {
    const from = dateValue(1925, 3, 12);
    /* 1 分鐘 2 px：「00:00」約 31 px＋12 → 至少 22 分 → 30 分 */
    expect(pickStep('date', 2, from, from + 600, m11)).toEqual({ unit: 'minute', n: 30 });
    /* 1 分鐘 0.05 px（一天 72 px）：12 時只有 36 px，放不下「00:00」→ 1 日 */
    expect(pickStep('date', 0.05, from, from + 20 * D, m11)).toEqual({ unit: 'day', n: 1 });
    expect(pickStep('date', 0.001, from, from + 1000 * D, m11)).toEqual({ unit: 'month', n: 1 });
    expect(pickStep('date', 0.0003, from, from + 1000 * D, m11)).toEqual({ unit: 'month', n: 3 });
    expect(pickStep('year', 10, 300, 400, m11)).toEqual({ unit: 'year', n: 5 });
    expect(pickStep('day', 0.02, 0, 30 * D, m11).unit).toBe('day');
  });
  it('日的間隔每個月從 1 日數，月底不擠在 1 日旁邊', () => {
    const from = dateValue(1925, 1, 1);
    const to = dateValue(1925, 3, 1);
    const days = minorValues('date', { unit: 'day', n: 2 }, from, to).map((v) => dateParts(v));
    const jan = days.filter((d) => d.y === 1925 && d.m === 1).map((d) => d.d);
    expect(jan).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29]);
    const feb = days.filter((d) => d.m === 2).map((d) => d.d);
    expect(feb).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27]);
    const ten = minorValues('date', { unit: 'day', n: 10 }, from, dateValue(1925, 2, 1)).map(
      (v) => dateParts(v).d,
    );
    expect(ten).toContain(21);
    expect(ten).not.toContain(31);
  });
  it('第 N 天從第 1 天數；月與年對齊倍數', () => {
    const v = minorValues('day', { unit: 'day', n: 5 }, 0, 20 * D);
    expect(v.map((x) => x / D + 1)).toEqual([1, 6, 11, 16, 21]);
    const months = minorValues(
      'date',
      { unit: 'month', n: 3 },
      dateValue(1925, 2, 10),
      dateValue(1926, 1, 1),
    );
    expect(months.map((x) => dateParts(x).m)).toContain(4);
    for (const x of months) expect((dateParts(x).m - 1) % 3).toBe(0);
    const years = minorValues(
      'date',
      { unit: 'year', n: 10 },
      dateValue(5, 1, 1),
      dateValue(40, 1, 1),
    );
    expect(years.map((x) => dateParts(x).y)).toEqual([10, 20, 30, 40]);
  });
  it('上排的標籤（日期、月、年、第 N 天）', () => {
    const from = dateValue(1925, 3, 12, 20);
    const t = majorTicks('date', { unit: 'hour', n: 1 }, from, from + 6 * 60);
    expect(t.map((x) => x.label)).toEqual(['1925年3月12日（四）', '1925年3月13日（五）']);
    expect(
      majorTicks('date', { unit: 'day', n: 1 }, dateValue(1925, 3, 20), dateValue(1925, 4, 2)).map(
        (x) => x.label,
      ),
    ).toEqual(['1925年3月', '1925年4月']);
    expect(
      majorTicks('day', { unit: 'hour', n: 3 }, D + 600, 2 * D + 10).map((x) => x.label),
    ).toEqual(['第 2 天', '第 3 天']);
    expect(majorTicks('year', { unit: 'year', n: 10 }, 0, 100)).toEqual([]);
  });
  it('下排的標籤', () => {
    const from = dateValue(1925, 3, 12, 20);
    const ax = axisTicks('date', from, from + 4 * 60, 2, m11);
    expect(ax.minor[0].label).toBe('20:00');
    const ay = axisTicks('day', 0, 30 * D, 0.02, m11);
    expect(ay.minor[0].label).toBe('第 1 天');
  });
});

describe('吸附單位（3.5）', () => {
  it('分、時：不超過間隔一半的最大單位；日以上', () => {
    expect(snapUnitFor('date', { unit: 'hour', n: 1 })).toEqual({ kind: 'min', n: 30 });
    expect(snapUnitFor('date', { unit: 'minute', n: 15 })).toEqual({ kind: 'min', n: 5 });
    expect(snapUnitFor('date', { unit: 'minute', n: 1 })).toEqual({ kind: 'min', n: 1 });
    expect(snapUnitFor('date', { unit: 'hour', n: 12 })).toEqual({ kind: 'min', n: 360 });
    expect(snapUnitFor('date', { unit: 'day', n: 1 })).toEqual({ kind: 'min', n: 720 });
    expect(snapUnitFor('day', { unit: 'day', n: 5 })).toEqual({ kind: 'min', n: D });
    expect(snapUnitFor('date', { unit: 'month', n: 3 })).toEqual({ kind: 'min', n: D });
    expect(snapUnitFor('date', { unit: 'year', n: 10 })).toEqual({ kind: 'month', n: 1 });
    expect(snapUnitFor('year', { unit: 'year', n: 50 })).toEqual({ kind: 'year', n: 10 });
    expect(snapUnitFor('year', { unit: 'year', n: 2 })).toEqual({ kind: 'year', n: 1 });
  });
});

describe('堆疊（F33）', () => {
  it('放進第一個放得下的層', () => {
    const r = stackLevels([
      { index: 0, left: 0, right: 100 },
      { index: 1, left: 50, right: 120 },
      { index: 2, left: 110, right: 150 },
      { index: 3, left: 130, right: 200 },
    ]);
    expect(r.levels).toEqual([0, 1, 0, 1]);
    expect(r.count).toBe(2);
    expect(stackLevels([]).count).toBe(1);
  });
  it('時間點含標題的寬度：放大後不重疊的事件放在同一層', () => {
    const doc: TimelineDoc = {
      ...blankDoc(),
      events: [
        newEvent({ id: 'a', title: '甲', start: '1925-03-12 10:00' }),
        newEvent({ id: 'b', title: '乙', start: '1925-03-12 11:00' }),
      ],
    };
    const v = visibleDoc(doc, 'gm');
    const tight = layoutTimeline(v, { k: 0.1, measure: m12, collapsed: {}, untitled: '?' });
    expect(tight.items.map((i) => i.level).sort()).toEqual([0, 1]);
    const wide = layoutTimeline(v, { k: 2, measure: m12, collapsed: {}, untitled: '?' });
    expect(wide.items.map((i) => i.level)).toEqual([0, 0]);
    expect(wide.rows[0].height).toBe(rowHeight(1));
    expect(tight.rows[0].height).toBe(rowHeight(2));
  });
});

describe('列（F24、F27）', () => {
  const doc = exampleDoc();
  it('範例：主線（有不是背景的事件）、泳道、子泳道縮排', () => {
    const rows = layoutRows(visibleDoc(doc, 'gm'), {});
    expect(rows.map((r) => r.key)).toEqual(['', 'pc', 'hall', 'martha', 'cult', 'norton', 'tower']);
    expect(rows.find((r) => r.key === 'norton')?.depth).toBe(1);
    expect(rows.find((r) => r.key === 'cult')?.hasChildren).toBe(true);
    expect(rows.find((r) => r.key === 'cult')?.secret).toBe(true);
    expect(rows.find((r) => r.key === 'norton')?.secret).toBe(true);
  });
  it('收合：子泳道不顯示，事件畫在上層那一列', () => {
    const v = visibleDoc(doc, 'gm');
    const lay = layoutTimeline(v, {
      k: 0.05,
      measure: m12,
      collapsed: { cult: true },
      untitled: '?',
    });
    expect(lay.rows.map((r) => r.key)).not.toContain('norton');
    const cultRow = lay.rows.findIndex((r) => r.key === 'cult');
    const rite = lay.items.find((i) => i.id === 'ex-rite2');
    expect(rite?.row).toBe(cultRow);
  });
  it('背景：主線的背景是整個時間軸（row null）', () => {
    const lay = layoutTimeline(visibleDoc(doc, 'gm'), {
      k: 0.05,
      measure: m12,
      collapsed: {},
      untitled: '?',
    });
    expect(lay.backgrounds).toHaveLength(1);
    expect(lay.backgrounds[0].row).toBeNull();
    expect(lay.items.some((i) => i.id === 'ex-fog')).toBe(false);
  });
  it('沒有泳道時只有主線；只有背景在主線時不顯示主線', () => {
    expect(layoutRows(visibleDoc(blankDoc(), 'gm'), {}).map((r) => r.key)).toEqual(['']);
    const d: TimelineDoc = {
      ...blankDoc(),
      lanes: [{ id: 'x', name: 'X', kind: 'other', color: '#000000', parentId: '', gm: false }],
      events: [newEvent({ kind: 'background', start: '1925', end: '1926' })],
    };
    expect(layoutRows(visibleDoc(d, 'gm'), {}).map((r) => r.key)).toEqual(['x']);
  });
});

describe('GM／PL（F60、F38）', () => {
  const doc = exampleDoc();
  it('PL 版拿掉 GM 專用的泳道（含子泳道與事件）、GM 專用的事件、GM 筆記', () => {
    expect([...secretLaneIds(doc)].sort()).toEqual(['cult', 'norton']);
    const pl = visibleDoc(doc, 'pl');
    expect(pl.lanes.map((l) => l.id)).toEqual(['pc', 'hall', 'martha', 'tower']);
    const ids = pl.events.map((e) => e.id);
    expect(ids).not.toContain('ex-rite1');
    expect(ids).not.toContain('ex-gather');
    expect(ids).not.toContain('ex-taken');
    expect(pl.events.every((e) => e.gmNote === '')).toBe(true);
    expect(hasSecrets(doc)).toBe(true);
    expect(usedCategories(pl).map((c) => c.id)).toEqual(['clue']);
    const gm = visibleDoc(doc, 'gm');
    expect(gm.events.find((e) => e.id === 'ex-rite1')?.secret).toBe(true);
    expect(gm.events.find((e) => e.id === 'ex-taken')?.secret).toBe(true);
    expect(gm.events.find((e) => e.id === 'ex-search')?.secret).toBe(false);
  });
  it('PL 版只到目前進度：之後的事件與標記拿掉，跨過進度的期間剪到進度', () => {
    const d = { ...doc, progress: { on: true, time: '1925-03-12 20:00', plOnly: true } };
    const pl = visibleDoc(d, 'pl');
    const ids = pl.events.map((e) => e.id);
    expect(ids).toEqual(['ex-letter', 'ex-arrive', 'ex-fog', 'ex-dinner']);
    const dinner = pl.events.find((e) => e.id === 'ex-dinner');
    expect(dinner?.ongoing).toBe(true);
    expect(eventSpan('date', dinner!, '')?.b).toBe(dateValue(1925, 3, 12, 20));
    expect(pl.markers).toHaveLength(0);
    /* GM 版不受影響 */
    expect(visibleDoc(d, 'gm').events).toHaveLength(doc.events.length);
  });
  it('沒有秘密時兩種一樣', () => {
    const d: TimelineDoc = { ...blankDoc(), events: [newEvent({ start: '1925' })] };
    expect(hasSecrets(d)).toBe(false);
    expect(hasSecrets({ ...d, events: [newEvent({ start: '1925', gmNote: '筆記' })] })).toBe(true);
  });
});

describe('旗子（標記列）', () => {
  it('標記、目前進度；靠太近時往下疊', () => {
    const doc = exampleDoc();
    const flags = collectFlags(visibleDoc(doc, 'gm'), { progress: '目前進度', now: '現在' }, null);
    expect(flags.map((f) => f.kind)).toEqual(['marker', 'marker', 'progress']);
    const placed = placeFlags(flags, () => 0, m12);
    expect(placed.levels).toBe(3);
    const apart = placeFlags(flags, (v) => v / 2, m12);
    expect(apart.levels).toBe(1);
  });
});

describe('畫面範圍（3.3）', () => {
  it('以錨點縮放，錨點下的時間不動', () => {
    const w = { start: 0, end: 1000 };
    const z = zoomWindow('day', w, 2, 250);
    expect(z.end - z.start).toBe(500);
    expect((250 - z.start) / (z.end - z.start)).toBeCloseTo(0.25);
  });
  it('上下限與範圍', () => {
    expect(spanLimits('date').min).toBe(60);
    const tiny = zoomWindow('date', { start: 0, end: 100 }, 100);
    expect(tiny.end - tiny.start).toBe(60);
    const c = clampWindow('date', { start: dateValue(1, 1, 1) - 1e6, end: dateValue(1, 1, 1) });
    expect(c.start).toBe(dateValue(1, 1, 1));
    expect(panWindow('year', { start: 0, end: 100 }, 50)).toEqual({ start: 50, end: 150 });
  });
  it('全覽：前後各留 4%；一個時間點前後各 1 天；沒有事件時今天前後', () => {
    const f = fitWindow('date', { a: 0, b: 10000 }, 0);
    expect(f).toEqual({ start: -400, end: 10400 });
    const one = fitWindow('date', { a: 5000, b: 5000 }, 0);
    expect(one).toEqual({ start: 5000 - D, end: 5000 + D });
    const today = dateValue(2026, 10, 29);
    expect(fitWindow('date', null, today)).toEqual({ start: today - D, end: today + 2 * D });
    expect(fitWindow('year', { a: 300, b: 300 }, 0)).toEqual({ start: 295, end: 305 });
  });
  it('全覽時右邊留最後面的標題的位置', () => {
    const d: TimelineDoc = {
      ...blankDoc(),
      events: [
        newEvent({ title: '開始', start: '1925-03-12 08:00' }),
        newEvent({ title: '一個很長很長很長的結尾事件標題', start: '1925-03-12 20:00' }),
      ],
    };
    const v = visibleDoc(d, 'gm');
    const plain = fitWindow(
      'date',
      { a: dateValue(1925, 3, 12, 8), b: dateValue(1925, 3, 12, 20) },
      0,
    );
    const w = fitWithLabels(v, 600, m12, 0);
    expect(w.start).toBe(plain.start);
    const k = 600 / (w.end - w.start);
    const last = dateValue(1925, 3, 12, 20);
    /* 標題的右端在畫面裡 */
    expect((last - w.start) * k + 10 + m12('一個很長很長很長的結尾事件標題')).toBeLessThanOrEqual(
      600,
    );
  });
  it('內容範圍含標記與目前進度', () => {
    const doc = exampleDoc();
    const r = contentRange(visibleDoc(doc, 'gm'), [dateValue(1925, 3, 20)]);
    expect(r?.a).toBe(dateValue(1925, 3, 5));
    expect(r?.b).toBe(dateValue(1925, 3, 20));
  });
  it('滾輪：滑鼠滾輪與 Ctrl 縮放、觸控板捲動不縮放', () => {
    const base = {
      deltaMode: 0,
      deltaX: 0,
      deltaY: 100,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    };
    expect(isMouseWheel(base)).toBe(true);
    expect(wheelZoomFactor(base)).toBeCloseTo(1 / 1.2);
    expect(wheelZoomFactor({ ...base, deltaY: -100 })).toBeCloseTo(1.2);
    expect(wheelZoomFactor({ ...base, deltaY: 8 })).toBeNull();
    expect(wheelZoomFactor({ ...base, deltaY: -10, ctrlKey: true })).toBeCloseTo(Math.exp(0.1));
    expect(wheelZoomFactor({ ...base, deltaX: 30, deltaY: 2 })).toBeNull();
  });
});
