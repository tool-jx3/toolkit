/**
 * 團期行事曆（session-calendar）的資料與版面：月曆的格子（週日／週一開始）、多日的預定與色條的排法、
 * 年曆的塗色、移動、準備事項的狀態與排序、讀檔的整理。
 */
import { describe, expect, it } from 'vitest';
import {
  formatDay,
  formatRange,
  isValidDate,
  monthWeeks,
  weekRange,
} from '@/tools/session-calendar/dates';
import { entriesOn, layoutWeek, yearMarks } from '@/tools/session-calendar/layout';
import {
  colorSlice,
  covers,
  type Entry,
  initialData,
  movedTo,
  newEntry,
  normalizeData,
  normalizeEntry,
  normalizeLinkUrl,
  spanDays,
  timeRange,
} from '@/tools/session-calendar/model';
import {
  allTasks,
  nextTaskOrder,
  reorderTasks,
  taskState,
  weekTasks,
} from '@/tools/session-calendar/tasks';

const plan = (start: string, end: string, title = 'p'): Entry =>
  newEntry('plan', start, { end, title });
const session = (date: string, title = 's', time = '20:00'): Entry =>
  newEntry('session', date, { title, startTime: time });

describe('日期與月曆的格子', () => {
  it('週日開始：2026 年 11 月是 5 週，第一格是 11/1（日）', () => {
    const w = monthWeeks({ year: 2026, month: 11 }, 0);
    expect(w.length).toBe(5);
    expect(w[0][0]).toBe('2026-11-01');
    expect(w[4][6]).toBe('2026-12-05');
  });
  it('週一開始：2026 年 11 月是 6 週，第一格是 10/26（一）', () => {
    const w = monthWeeks({ year: 2026, month: 11 }, 1);
    expect(w.length).toBe(6);
    expect(w[0][0]).toBe('2026-10-26');
    expect(w[5][6]).toBe('2026-12-06');
  });
  it('2026 年 2 月週日開始剛好 4 週', () => {
    expect(monthWeeks({ year: 2026, month: 2 }, 0).length).toBe(4);
  });
  it('繁中的日期與星期', () => {
    expect(formatDay('2026-10-27')).toBe('10月27日（二）');
    expect(formatRange('2026-10-27', '2026-10-29')).toBe('10月27日（二）～10月29日（四）');
    expect(formatRange('2026-12-31', '2027-01-01')).toBe(
      '2026年12月31日（四）～2027年1月1日（五）',
    );
    expect(weekRange('2026-10-27', 0)).toEqual(['2026-10-25', '2026-10-31']);
    expect(weekRange('2026-10-27', 1)).toEqual(['2026-10-26', '2026-11-01']);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
  });
});

describe('多日的預定', () => {
  it('天數、涵蓋、移動（保持天數）', () => {
    const p = plan('2026-10-30', '2026-11-02');
    expect(spanDays(p)).toBe(4);
    expect(covers(p, '2026-11-01')).toBe(true);
    expect(covers(p, '2026-11-03')).toBe(false);
    const m = movedTo(p, '2026-12-30');
    expect([m.start, m.end]).toEqual(['2026-12-30', '2027-01-02']);
  });

  it('跨週的色條切成兩段，條的位置不重疊', () => {
    const week1 = monthWeeks({ year: 2026, month: 11 }, 0)[0];
    const a = plan('2026-10-30', '2026-11-03', 'A');
    const b = plan('2026-11-02', '2026-11-02', 'B');
    const c = plan('2026-11-04', '2026-11-05', 'C');
    const l = layoutWeek(week1, [a, b, c], { maxBars: 3, maxChips: 3, showTasks: false });
    const seg = (t: string) => l.bars.find((s) => s.entry.title === t);
    expect(seg('A')).toMatchObject({ col: 0, span: 3, lane: 0, head: false, tail: true });
    expect(seg('B')).toMatchObject({ col: 1, span: 1, lane: 1 });
    /* C 從 11/4 開始，A 在 11/3 結束，可以放在第 0 條 */
    expect(seg('C')).toMatchObject({ col: 3, span: 2, lane: 0, head: true, tail: true });
    expect(l.lanes).toBe(2);
  });

  it('超過條數的不畫，算進那幾天的「另有 N 筆」；單日的場次是小卡，依時間排序', () => {
    const week = monthWeeks({ year: 2026, month: 11 }, 0)[1];
    const bars = [1, 2, 3].map((i) => plan('2026-11-08', '2026-11-10', `P${i}`));
    const s1 = session('2026-11-09', 'late', '21:00');
    const s2 = session('2026-11-09', 'early', '13:00');
    const task = { id: 't1', title: '準備', due: '2026-11-09', done: false, order: 10 };
    const withTask = { ...s1, tasks: [task] };
    const l = layoutWeek(week, [...bars, withTask, s2], {
      maxBars: 2,
      maxChips: 2,
      showTasks: true,
    });
    expect(l.bars.length).toBe(2);
    expect(l.more).toEqual([1, 2, 1, 0, 0, 0, 0]);
    expect(l.chips[1].map((c) => c.entry.title)).toEqual(['early', 'late']);
  });

  it('漸層切成幾段（被週、月切開時）拼起來是連續的', () => {
    const c = { mode: 'gradient' as const, c1: '#000000', c2: '#ffffff' };
    expect(colorSlice(c, 0, 2, 4)).toEqual({ mode: 'gradient', c1: '#000000', c2: '#808080' });
    expect(colorSlice(c, 2, 2, 4)).toEqual({ mode: 'gradient', c1: '#808080', c2: '#ffffff' });
    const solid = { mode: 'solid' as const, c1: '#123456', c2: '#ffffff' };
    expect(colorSlice(solid, 1, 1, 3)).toBe(solid);
  });

  it('年曆：每天塗天數最少的那一筆（長預定不蓋掉期間裡的短預定）', () => {
    const long = plan('2026-03-01', '2026-03-05', 'long');
    const short = plan('2026-03-03', '2026-03-03', 'short');
    const m = yearMarks([short, long], 2026);
    expect(m.get('2026-03-01')).toMatchObject({ head: true, tail: false });
    expect(m.get('2026-03-03')).toMatchObject({ head: true, tail: true });
    expect(m.get('2026-03-03')?.entry.title).toBe('short');
    expect(m.get('2026-03-02')?.entry.title).toBe('long');
    expect(m.get('2026-03-05')).toMatchObject({ tail: true });
    expect(m.has('2026-03-06')).toBe(false);
    /* 跨年的只算這一年的日子 */
    const cross = yearMarks([plan('2025-12-30', '2026-01-02')], 2026);
    expect([...cross.keys()]).toEqual(['2026-01-01', '2026-01-02']);
    expect(entriesOn([long, short], '2026-03-03').map((e) => e.title)).toEqual(['long', 'short']);
    /* 很長的預定（兩年多）：塗滿這一年的每一天 */
    const huge = yearMarks([plan('2025-01-01', '2027-06-30')], 2026);
    expect(huge.size).toBe(365);
    expect(huge.get('2026-12-31')).toMatchObject({ head: false, tail: false });
    /* 很長的預定裡的一天場次照樣看得到 */
    const inside = yearMarks([plan('2025-01-01', '2027-06-30', 'huge'), plan('2026-10-14', '2026-10-14', 'one')], 2026);
    expect(inside.get('2026-10-14')?.entry.title).toBe('one');
    expect(inside.get('2026-10-13')?.entry.title).toBe('huge');
  });
});

describe('準備事項', () => {
  it('狀態依期限自動判斷', () => {
    const today = '2026-10-27';
    expect(taskState({ done: true, due: '2026-10-01' }, today)).toBe('done');
    expect(taskState({ done: false, due: '' }, today)).toBe('none');
    expect(taskState({ done: false, due: '2026-10-26' }, today)).toBe('overdue');
    expect(taskState({ done: false, due: today }, today)).toBe('today');
    expect(taskState({ done: false, due: '2026-10-30' }, today)).toBe('soon');
    expect(taskState({ done: false, due: '2026-10-31' }, today)).toBe('later');
  });

  it('清單、本週、排序', () => {
    const data = initialData('2026-10-27');
    const all = allTasks(data.entries);
    expect(all.map((t) => t.task.title)).toEqual([
      '寄行前說明給 PL',
      '準備 NPC 立繪',
      '設定房間的 BGM',
      '分享劇本概要',
    ]);
    /* 本週（10/25～10/31）：10/26、10/27、10/29 的三項；11/1 的不算 */
    expect(weekTasks(data.entries, '2026-10-27', 0).map((t) => t.task.title)).toEqual([
      '寄行前說明給 PL',
      '準備 NPC 立繪',
      '設定房間的 BGM',
    ]);
    expect(nextTaskOrder(data.entries)).toBe(50);
    const ids = all.map((t) => t.task.id);
    /* 往下移：放在目標後面；往上移：放在目標前面 */
    const down = reorderTasks(data.entries, ids[0], ids[2]);
    expect([...down.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => ids.indexOf(id))).toEqual([
      1, 2, 0, 3,
    ]);
    const up = reorderTasks(data.entries, ids[3], ids[0]);
    expect([...up.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => ids.indexOf(id))).toEqual([
      3, 0, 1, 2,
    ]);
  });
});

describe('讀檔的整理', () => {
  it('看不懂的值換成預設；結束早於開始時對調；時間的寫法', () => {
    const e = normalizeEntry({
      kind: 'plan',
      start: '2026-11-05',
      end: '2026-11-01',
      startTime: '9:05',
      endTime: '25:00',
      color: { mode: 'gradient', c1: '#ABC', c2: 'nope' },
      tasks: [{ title: '' }, { title: 'x', due: 'bad' }],
    });
    expect(e).toMatchObject({
      start: '2026-11-01',
      end: '2026-11-05',
      startTime: '09:05',
      endTime: '',
    });
    expect(e?.color).toEqual({ mode: 'gradient', c1: '#aabbcc', c2: '#9b6fd6' });
    expect(e?.tasks).toHaveLength(1);
    expect(e?.tasks[0].due).toBe('');
    expect(normalizeEntry({ start: 'nope' })).toBeNull();
    expect(timeRange({ startTime: '20:00', endTime: '23:00' })).toBe('20:00–23:00');
  });

  it('整份資料：缺的補預設、範圍外的夾住', () => {
    const d = normalizeData(
      { weekStart: 1, shotWidth: 99999, entries: [{ start: '2026-01-01' }] },
      '2026-10-27',
    );
    expect(d?.weekStart).toBe(1);
    expect(d?.shotWidth).toBe(1600);
    expect(d?.entries).toHaveLength(1);
    expect(d?.look.bg).toBe('theme');
    expect(normalizeData([], '2026-10-27')).toBeNull();
  });

  it('連結的網址：只收 http、https、mailto；沒有開頭的補 https://', () => {
    expect(normalizeLinkUrl('https://ccfolia.com/rooms/x')).toBe('https://ccfolia.com/rooms/x');
    expect(normalizeLinkUrl('  ccfolia.com/rooms/x ')).toBe('https://ccfolia.com/rooms/x');
    expect(normalizeLinkUrl('//example.com/a')).toBe('https://example.com/a');
    expect(normalizeLinkUrl('localhost:3000/room')).toBe('https://localhost:3000/room');
    expect(normalizeLinkUrl('HTTP://Example.com')).toBe('HTTP://Example.com');
    expect(normalizeLinkUrl('mailto:gm@example.com')).toBe('mailto:gm@example.com');
    expect(normalizeLinkUrl('')).toBe('');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('data:text/html,hi')).toBeNull();
    expect(normalizeLinkUrl('vbscript:x')).toBeNull();
    expect(normalizeLinkUrl('https://exa mple.com')).toBeNull();
    /* 讀檔時：看不懂、不收的網址換成空白（名稱留著） */
    const e = normalizeEntry({
      start: '2026-10-30',
      links: [
        { label: '房間', url: 'ccfolia.com/rooms/x' },
        { label: '壞的', url: 'javascript:alert(1)' },
      ],
    });
    expect(e?.links).toEqual([
      { label: '房間', url: 'https://ccfolia.com/rooms/x' },
      { label: '壞的', url: '' },
    ]);
  });
});
