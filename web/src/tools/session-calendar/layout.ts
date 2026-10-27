/**
 * 月曆、年曆的版面（規格 3.3）：哪些筆畫成跨日的色條、放在第幾條（lane）、每天的小卡與「另有 N 筆」。
 * 純函式，畫面（MonthView）與截圖（shot.ts）共用。
 */
import { dateOfDay, dayNumber } from '@/core/holidays';
import { compareEntries, type Entry, type Task } from './model';

/** 一週裡的一段色條 */
export interface BarSegment {
  entry: Entry;
  /** 這一週的第幾格（0～6） */
  col: number;
  span: number;
  lane: number;
  /** 這一段是不是真正的開始／結束（被週切開時不是） */
  head: boolean;
  tail: boolean;
}

/** 一天的小卡：單日的場次與準備事項 */
export type DayChip =
  | { type: 'session'; entry: Entry }
  | { type: 'task'; entry: Entry; task: Task };

export interface WeekLayout {
  bars: BarSegment[];
  /** 顯示的色條條數（≤ maxBars） */
  lanes: number;
  /** 每天（同 week 的順序）顯示的小卡 */
  chips: DayChip[][];
  /** 每天放不下、沒顯示的筆數（色條＋小卡） */
  more: number[];
}

/** 畫成色條的：預定（不論天數）與跨日的場次 */
export const isBar = (e: Entry): boolean => e.kind === 'plan' || e.end > e.start;

export interface WeekLayoutOptions {
  maxBars: number;
  maxChips: number;
  showTasks: boolean;
}

/**
 * 一週的版面：色條依開始日、天數多的在前排序後，放進第一個空著的條（同一條不重疊）；超過 maxBars 條的不畫，
 * 算進那幾天的「另有 N 筆」。小卡依時間排序（場次在前、準備事項在後），每天最多 maxChips 張。
 */
export function layoutWeek(
  week: readonly string[],
  entries: readonly Entry[],
  { maxBars, maxChips, showTasks }: WeekLayoutOptions,
): WeekLayout {
  const first = week[0];
  const last = week[week.length - 1];
  const more = week.map(() => 0);
  const bars: BarSegment[] = [];
  const laneEnds: number[] = [];
  const barEntries = entries
    .filter((e) => isBar(e) && e.start <= last && e.end >= first)
    .sort(compareEntries);
  for (const entry of barEntries) {
    const s = entry.start < first ? first : entry.start;
    const t = entry.end > last ? last : entry.end;
    const col = dayNumber(s) - dayNumber(first);
    const span = dayNumber(t) - dayNumber(s) + 1;
    let lane = laneEnds.findIndex((end) => end < col);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = col + span - 1;
    if (lane >= maxBars) {
      for (let i = col; i < col + span; i++) more[i] += 1;
      continue;
    }
    bars.push({ entry, col, span, lane, head: entry.start >= first, tail: entry.end <= last });
  }
  const lanes = Math.min(maxBars, laneEnds.length);
  const chips = week.map((date, i) => {
    const list: DayChip[] = entries
      .filter((e) => !isBar(e) && e.start === date)
      .sort(
        (a, b) => (a.startTime || '99').localeCompare(b.startTime || '99') || compareEntries(a, b),
      )
      .map((entry) => ({ type: 'session', entry }));
    if (showTasks) {
      for (const entry of entries) {
        if (entry.kind !== 'session') continue;
        for (const task of entry.tasks)
          if (task.due === date) list.push({ type: 'task', entry, task });
      }
    }
    if (list.length > maxChips) {
      more[i] += list.length - maxChips;
      return list.slice(0, maxChips);
    }
    return list;
  });
  return { bars, lanes, chips, more };
}

/** 年曆的一天：塗哪一筆的顏色，以及連起來的形狀 */
export interface YearDayMark {
  entry: Entry;
  /** 這一筆在這天開始／結束 */
  head: boolean;
  tail: boolean;
}

/**
 * 年曆每一天要塗的那一筆（涵蓋這一天的筆裡，排序最前面的：開始早的、天數多的）。
 * 回傳 date → 標記；沒有預定的日子不在裡面。
 */
export function yearMarks(entries: readonly Entry[], year: number): Map<string, YearDayMark> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const map = new Map<string, YearDayMark>();
  const list = entries.filter((e) => e.start <= to && e.end >= from).sort(compareEntries);
  for (const entry of list) {
    /* 只走這一年的範圍（很長的預定也不會漏掉後面的日子） */
    const a = dayNumber(entry.start < from ? from : entry.start);
    const b = dayNumber(entry.end > to ? to : entry.end);
    for (let n = a; n <= b; n++) {
      const date = dateOfDay(n);
      if (map.has(date)) continue;
      map.set(date, { entry, head: date === entry.start, tail: date === entry.end });
    }
  }
  return map;
}

/** 涵蓋這一天的所有筆（排序後） */
export function entriesOn(entries: readonly Entry[], date: string): Entry[] {
  return entries.filter((e) => e.start <= date && date <= e.end).sort(compareEntries);
}
