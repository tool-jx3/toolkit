/**
 * 空檔日期（規格 3.6）：在一段期間裡，挑出沒有預定（依設定：場次、預定）的日子，排除指定的星期、國定假日與日期，
 * 整理成可以貼到揪團訊息的文字。
 */
import { addDays, dayNumber, isDayOff, isPublicHoliday, weekdayOf } from '@/core/holidays';
import { addMonths, daysInMonth, firstOfMonth, WEEKDAY_NAMES, type YearMonth } from './dates';
import type { Entry } from './model';

export type FreePeriod =
  | { kind: 'month'; ym: YearMonth }
  | { kind: 'months'; year: number; months: readonly number[] }
  | { kind: 'range'; start: string; end: string };

/** 對象：每一天／只算週末與放假日／只算上班日 */
export type DayFilter = 'all' | 'off' | 'work';

export interface FreeDayOptions {
  period: FreePeriod;
  dayFilter: DayFilter;
  /** 排除的星期（0＝日） */
  excludeWeekdays: readonly number[];
  /** 排除國定假日（放假的節日、補假、調整放假） */
  excludeHolidays: boolean;
  excludeDates: readonly string[];
  /** 有這些的日子不算空檔 */
  busy: { session: boolean; plan: boolean };
  /** 調整中的場次也算忙（預設算） */
  busyTentative: boolean;
}

export type DateStyle = 'md' | 'mdText' | 'ymd' | 'iso';
export type Separator = 'newline' | 'comma' | 'space';

export interface FreeDayFormat {
  style: DateStyle;
  weekday: boolean;
  separator: Separator;
  /** 依月份分組（每組前面一行【10月】） */
  groupByMonth: boolean;
  /** 連續的日子合併成「起～迄」 */
  mergeRuns: boolean;
}

export const DEFAULT_FREE_FORMAT: FreeDayFormat = {
  style: 'md',
  weekday: true,
  separator: 'newline',
  groupByMonth: false,
  mergeRuns: false,
};

/** 期間的所有日子（範圍上限 3 年，防呆） */
export function periodDates(period: FreePeriod): string[] {
  const out: string[] = [];
  const pushMonth = (ym: YearMonth) => {
    const first = firstOfMonth(ym);
    const n = daysInMonth(ym);
    for (let i = 0; i < n; i++) out.push(addDays(first, i));
  };
  if (period.kind === 'month') pushMonth(period.ym);
  else if (period.kind === 'months') {
    for (const m of [...new Set(period.months)].sort((a, b) => a - b))
      if (m >= 1 && m <= 12) pushMonth({ year: period.year, month: m });
  } else {
    let s = period.start;
    let e = period.end;
    if (!s || !e) return out;
    if (e < s) [s, e] = [e, s];
    const n = Math.min(dayNumber(e) - dayNumber(s) + 1, 366 * 3);
    for (let i = 0; i < n; i++) out.push(addDays(s, i));
  }
  return out;
}

/** 這一天有讓它不算空檔的預定嗎 */
function busySet(entries: readonly Entry[], opts: FreeDayOptions, from: string, to: string) {
  const set = new Set<string>();
  for (const e of entries) {
    if (e.kind === 'session' && !opts.busy.session) continue;
    if (e.kind === 'plan' && !opts.busy.plan) continue;
    if (e.kind === 'session' && e.status === 'tentative' && !opts.busyTentative) continue;
    if (e.end < from || e.start > to) continue;
    const s = e.start < from ? from : e.start;
    const t = e.end > to ? to : e.end;
    for (let d = s; d <= t; d = addDays(d, 1)) set.add(d);
  }
  return set;
}

/** 空檔日期（依日期排序） */
export function computeFreeDays(entries: readonly Entry[], opts: FreeDayOptions): string[] {
  const dates = periodDates(opts.period);
  if (!dates.length) return [];
  const busy = busySet(entries, opts, dates[0], dates[dates.length - 1]);
  const excluded = new Set(opts.excludeDates);
  const weekdays = new Set(opts.excludeWeekdays);
  return dates.filter((d) => {
    if (busy.has(d) || excluded.has(d) || weekdays.has(weekdayOf(d))) return false;
    if (opts.excludeHolidays && isPublicHoliday(d)) return false;
    if (opts.dayFilter === 'off' && !isDayOff(d)) return false;
    if (opts.dayFilter === 'work' && isDayOff(d)) return false;
    return true;
  });
}

/** 一天的寫法 */
export function formatFreeDate(date: string, f: Pick<FreeDayFormat, 'style' | 'weekday'>): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const body =
    f.style === 'iso'
      ? date
      : f.style === 'ymd'
        ? `${y}/${m}/${d}`
        : f.style === 'mdText'
          ? `${m}月${d}日`
          : `${m}/${d}`;
  return f.weekday ? `${body}（${WEEKDAY_NAMES[weekdayOf(date)]}）` : body;
}

const SEPARATORS: Record<Separator, string> = { newline: '\n', comma: '、', space: ' ' };

/** 一串日期 → 一段一段（連續合併時是「起～迄」） */
function pieces(dates: readonly string[], f: FreeDayFormat): string[] {
  if (!f.mergeRuns) return dates.map((d) => formatFreeDate(d, f));
  const out: string[] = [];
  let i = 0;
  while (i < dates.length) {
    let j = i;
    while (j + 1 < dates.length && dates[j + 1] === addDays(dates[j], 1)) j++;
    out.push(
      i === j
        ? formatFreeDate(dates[i], f)
        : `${formatFreeDate(dates[i], f)}～${formatFreeDate(dates[j], f)}`,
    );
    i = j + 1;
  }
  return out;
}

/** 空檔日期 → 文字（沒有時空字串） */
export function formatFreeDays(dates: readonly string[], f: FreeDayFormat): string {
  if (!dates.length) return '';
  const sep = SEPARATORS[f.separator];
  if (!f.groupByMonth) return pieces(dates, f).join(sep);
  const years = new Set(dates.map((d) => d.slice(0, 4)));
  const groups = new Map<string, string[]>();
  for (const d of dates) {
    const k = d.slice(0, 7);
    const list = groups.get(k) ?? [];
    list.push(d);
    groups.set(k, list);
  }
  const blocks = [...groups.entries()].map(([k, list]) => {
    const head =
      years.size > 1
        ? `【${k.slice(0, 4)}年${Number(k.slice(5))}月】`
        : `【${Number(k.slice(5))}月】`;
    return `${head}\n${pieces(list, f).join(sep)}`;
  });
  return blocks.join('\n\n');
}

/** 「選幾個月」的預設：這個月 */
export const defaultMonths = (ym: YearMonth): number[] => [ym.month];

/** 下一個月（範圍的預設終點等） */
export const nextMonthOf = (ym: YearMonth): YearMonth => addMonths(ym, 1);
