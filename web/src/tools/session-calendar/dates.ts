/**
 * 日期的寫法與月曆的格子（規格 3.2）。日期一律是 `YYYY-MM-DD` 字串，星期與加減用 core/holidays 的日序（不受時區影響）。
 */
import { addDays, dayNumber, weekdayOf } from '@/core/holidays';
import { localIsoDate } from '@/core/sessions';

export { addDays, dayNumber, weekdayOf };

/** 星期的名稱（0＝日） */
export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

export const today = (): string => localIsoDate();

export interface YearMonth {
  year: number;
  /** 1～12 */
  month: number;
}

export const ymOf = (date: string): YearMonth => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
});

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const firstOfMonth = ({ year, month }: YearMonth): string => `${year}-${pad2(month)}-01`;

export function addMonths({ year, month }: YearMonth, n: number): YearMonth {
  const i = year * 12 + (month - 1) + n;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export function daysInMonth({ year, month }: YearMonth): number {
  return (
    dayNumber(firstOfMonth(addMonths({ year, month }, 1))) -
    dayNumber(firstOfMonth({ year, month }))
  );
}

/** 一週的星期順序（週日開始：日一二…六；週一開始：一二…六日） */
export const weekOrder = (weekStart: 0 | 1): number[] =>
  Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);

/** 這一天所在那一週的第一天 */
export function weekStartOf(date: string, weekStart: 0 | 1): string {
  const back = (weekdayOf(date) - weekStart + 7) % 7;
  return addDays(date, -back);
}

/**
 * 月曆的格子：從包含 1 號那一週的第一天到包含月底那一週的最後一天，每週一列（4～6 列），前後月的日子也列出。
 */
export function monthWeeks(ym: YearMonth, weekStart: 0 | 1): string[][] {
  const first = firstOfMonth(ym);
  const last = addDays(first, daysInMonth(ym) - 1);
  const weeks: string[][] = [];
  for (let d = weekStartOf(first, weekStart); d <= last; d = addDays(d, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

/** 「10月27日（二）」 */
export function formatDay(date: string): string {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${WEEKDAY_NAMES[weekdayOf(date)]}）`;
}

/** 「2026年10月27日（二）」 */
export const formatFullDay = (date: string): string => `${date.slice(0, 4)}年${formatDay(date)}`;

/** 「10/27（二）」 */
export function formatShort(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${WEEKDAY_NAMES[weekdayOf(date)]}）`;
}

/** 「2026年10月」 */
export const monthTitle = ({ year, month }: YearMonth): string => `${year}年${month}月`;

/** 範圍的寫法：「10月27日（二）」或「10月27日（二）～10月29日（四）」（跨年時加年份） */
export function formatRange(start: string, end: string): string {
  if (start === end) return formatDay(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return sameYear
    ? `${formatDay(start)}～${formatDay(end)}`
    : `${formatFullDay(start)}～${formatFullDay(end)}`;
}

/** 這一週的範圍（今天所在的那一週） */
export function weekRange(date: string, weekStart: 0 | 1): [string, string] {
  const s = weekStartOf(date, weekStart);
  return [s, addDays(s, 6)];
}

/** 有效的 `YYYY-MM-DD`（年份 1900～2200，日子存在） */
export function isValidDate(v: unknown): v is string {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  if (y < 1900 || y > 2200) return false;
  const n = dayNumber(s);
  return Number.isFinite(n) && addDays(s, 0) === s;
}
