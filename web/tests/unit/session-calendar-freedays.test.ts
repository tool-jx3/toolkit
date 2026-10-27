/**
 * 團期行事曆的空檔日期：期間（這個月、選幾個月、自訂範圍）、排除星期、只算週末與假日／平日、排除國定假日、
 * 排除日期、哪些預定算忙、文字的格式（寫法、星期、分隔、依月份分組、連續合併）。
 */
import { describe, expect, it } from 'vitest';
import {
  computeFreeDays,
  DEFAULT_FREE_FORMAT,
  type FreeDayOptions,
  formatFreeDays,
  periodDates,
} from '@/tools/session-calendar/freeDays';
import { newEntry } from '@/tools/session-calendar/model';

const base: FreeDayOptions = {
  period: { kind: 'month', ym: { year: 2026, month: 10 } },
  dayFilter: 'all',
  excludeWeekdays: [],
  excludeHolidays: false,
  excludeDates: [],
  busy: { session: true, plan: true },
  busyTentative: true,
};

describe('期間', () => {
  it('這個月、選幾個月、自訂範圍（顛倒也可以）', () => {
    expect(periodDates(base.period)).toHaveLength(31);
    expect(periodDates({ kind: 'months', year: 2026, months: [12, 2] })).toHaveLength(28 + 31);
    expect(periodDates({ kind: 'months', year: 2026, months: [2, 12] })[0]).toBe('2026-02-01');
    const r = periodDates({ kind: 'range', start: '2026-11-03', end: '2026-10-30' });
    expect(r).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  });
});

describe('空檔', () => {
  const entries = [
    newEntry('session', '2026-10-03', { title: 'A' }),
    newEntry('plan', '2026-10-05', { end: '2026-10-07', title: '出差' }),
    newEntry('session', '2026-10-17', { title: 'B', status: 'tentative' }),
  ];

  it('有預定的日子不算；可以只看場次或只看預定；調整中的場次可以不算', () => {
    const all = computeFreeDays(entries, base);
    expect(all).not.toContain('2026-10-03');
    expect(all).not.toContain('2026-10-06');
    expect(all).not.toContain('2026-10-17');
    expect(all).toHaveLength(31 - 5);
    const onlySession = computeFreeDays(entries, { ...base, busy: { session: true, plan: false } });
    expect(onlySession).toContain('2026-10-06');
    const noTentative = computeFreeDays(entries, { ...base, busyTentative: false });
    expect(noTentative).toContain('2026-10-17');
  });

  it('只算週末與放假日（國慶日 10/10、補假 10/9 也算）', () => {
    const off = computeFreeDays([], { ...base, dayFilter: 'off' });
    expect(off.slice(0, 5)).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    /* 10/25 光復節（日）、10/26 補假（一） */
    expect(off).toContain('2026-10-26');
  });

  it('只算上班日；排除國定假日；排除星期與日期', () => {
    const work = computeFreeDays([], { ...base, dayFilter: 'work' });
    expect(work).not.toContain('2026-10-09');
    expect(work).not.toContain('2026-10-10');
    expect(work).toContain('2026-10-08');
    const noHoliday = computeFreeDays([], { ...base, excludeHolidays: true });
    expect(noHoliday).not.toContain('2026-10-09');
    expect(noHoliday).toContain('2026-10-11');
    const noWed = computeFreeDays([], {
      ...base,
      excludeWeekdays: [3],
      excludeDates: ['2026-10-02'],
    });
    expect(noWed).not.toContain('2026-10-07');
    expect(noWed).not.toContain('2026-10-02');
  });
});

describe('文字', () => {
  const dates = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-03'];
  it('預設：「10/30（五）」一行一天', () => {
    expect(formatFreeDays(dates, DEFAULT_FREE_FORMAT)).toBe(
      '10/30（五）\n10/31（六）\n11/1（日）\n11/3（二）',
    );
  });
  it('其他寫法與分隔', () => {
    expect(
      formatFreeDays(dates.slice(0, 2), {
        ...DEFAULT_FREE_FORMAT,
        style: 'mdText',
        separator: 'comma',
      }),
    ).toBe('10月30日（五）、10月31日（六）');
    expect(
      formatFreeDays(dates.slice(0, 2), {
        ...DEFAULT_FREE_FORMAT,
        style: 'ymd',
        weekday: false,
        separator: 'space',
      }),
    ).toBe('2026/10/30 2026/10/31');
    expect(formatFreeDays(['2026-10-30'], { ...DEFAULT_FREE_FORMAT, style: 'iso' })).toBe(
      '2026-10-30（五）',
    );
  });
  it('連續合併、依月份分組（分組時連續的日子在月底切開）', () => {
    expect(formatFreeDays(dates, { ...DEFAULT_FREE_FORMAT, mergeRuns: true })).toBe(
      '10/30（五）～11/1（日）\n11/3（二）',
    );
    expect(
      formatFreeDays(dates, { ...DEFAULT_FREE_FORMAT, mergeRuns: true, groupByMonth: true }),
    ).toBe('【10月】\n10/30（五）～10/31（六）\n\n【11月】\n11/1（日）\n11/3（二）');
    expect(
      formatFreeDays(['2026-12-31', '2027-01-01'], { ...DEFAULT_FREE_FORMAT, groupByMonth: true }),
    ).toBe('【2026年12月】\n12/31（四）\n\n【2027年1月】\n1/1（五）');
    expect(formatFreeDays([], DEFAULT_FREE_FORMAT)).toBe('');
  });
});
