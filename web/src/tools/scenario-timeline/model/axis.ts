/**
 * 刻度（規格 F34、3.4）與吸附單位（3.5）。參考 vis-timeline 的 TimeStep（依標籤寬度挑最小放得下的間隔、
 * 上下兩排），階梯與標籤是本站的。純計算。
 *
 * 位置 v：日期時間與第 N 天是分鐘、架空年是年；k＝每單位幾 px。
 */
import {
  addMonths,
  clockText,
  dateLabel,
  dateParts,
  dateValue,
  dayNumber,
  daysInMonth,
  MINUTES_PER_DAY,
  mod,
  type SnapUnit,
  type TimeMode,
} from './time';

export type StepUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';

export interface Step {
  unit: StepUnit;
  n: number;
}

export interface Tick {
  v: number;
  label: string;
}

export interface AxisTicks {
  step: Step;
  minor: Tick[];
  major: Tick[];
  snap: SnapUnit;
}

const MIN_STEPS: Step[] = [1, 5, 10, 15, 30].map((n) => ({ unit: 'minute', n }));
const HOUR_STEPS: Step[] = [1, 2, 3, 6, 12].map((n) => ({ unit: 'hour', n }));

const DATE_STEPS: Step[] = [
  ...MIN_STEPS,
  ...HOUR_STEPS,
  ...[1, 2, 5, 10].map((n): Step => ({ unit: 'day', n })),
  ...[1, 3, 6].map((n): Step => ({ unit: 'month', n })),
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].map((n): Step => ({ unit: 'year', n })),
];

const DAY_STEPS: Step[] = [
  ...MIN_STEPS,
  ...HOUR_STEPS,
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].map((n): Step => ({ unit: 'day', n })),
];

const YEAR_STEPS: Step[] = (() => {
  const out: Step[] = [];
  for (let e = 1; e <= 100000; e *= 10)
    for (const f of [1, 2, 5]) if (e * f <= 100000) out.push({ unit: 'year', n: e * f });
  return out;
})();

export function stepLadder(mode: TimeMode): Step[] {
  return mode === 'date' ? DATE_STEPS : mode === 'day' ? DAY_STEPS : YEAR_STEPS;
}

/** 一個間隔的大約長度（日期時間的月、年用平均長度；架空年以年計） */
export function stepSize(mode: TimeMode, s: Step): number {
  if (mode === 'year') return s.n;
  switch (s.unit) {
    case 'minute':
      return s.n;
    case 'hour':
      return s.n * 60;
    case 'day':
      return s.n * MINUTES_PER_DAY;
    case 'month':
      return s.n * 43830;
    default:
      return s.n * 525960;
  }
}

export type Measure = (text: string) => number;

/** 量標籤寬度用的樣本（最寬的寫法） */
function sampleLabel(mode: TimeMode, s: Step, from: number, to: number): string {
  if (s.unit === 'minute' || s.unit === 'hour') return '00:00';
  if (mode === 'year') {
    const big = Math.max(Math.abs(Math.round(from)), Math.abs(Math.round(to)));
    return `${from < 0 ? '-' : ''}${'8'.repeat(String(big).length)}`;
  }
  if (mode === 'day') {
    const big = Math.max(Math.abs(dayNumber(from)), Math.abs(dayNumber(to)));
    return `第 ${from < 0 ? '-' : ''}${'8'.repeat(String(big).length)} 天`;
  }
  if (s.unit === 'day') return '28';
  if (s.unit === 'month') return '12月';
  return '8888';
}

export const LABEL_PAD = 12;

/** 挑間隔：第一個「間隔的寬度 ≥ 標籤寬度＋12 px」的 */
export function pickStep(
  mode: TimeMode,
  k: number,
  from: number,
  to: number,
  measure: Measure,
): Step {
  const ladder = stepLadder(mode);
  const widths = new Map<string, number>();
  for (const s of ladder) {
    const sample = sampleLabel(mode, s, from, to);
    let w = widths.get(sample);
    if (w === undefined) {
      w = measure(sample);
      widths.set(sample, w);
    }
    if (stepSize(mode, s) * k >= w + LABEL_PAD) return s;
  }
  return ladder[ladder.length - 1];
}

/* ---------- 下排 ---------- */

const MAX_TICKS = 4000;

function minorLabel(mode: TimeMode, s: Step, v: number): string {
  if (s.unit === 'minute' || s.unit === 'hour') return clockText(v);
  if (mode === 'year') return String(Math.round(v));
  if (mode === 'day') return `第 ${dayNumber(v)} 天`;
  const d = dateParts(v);
  if (s.unit === 'day') return String(d.d);
  if (s.unit === 'month') return `${d.m}月`;
  return String(d.y);
}

/** 下排的刻度位置（[from, to] 之內，再加左邊被切到的那一格） */
export function minorValues(mode: TimeMode, s: Step, from: number, to: number): number[] {
  const out: number[] = [];
  const push = (v: number) => {
    if (out.length < MAX_TICKS) out.push(v);
  };
  if (mode === 'year') {
    const n = s.n;
    for (let y = Math.floor(from / n) * n; y <= to && out.length < MAX_TICKS; y += n) push(y);
    return out;
  }
  if (s.unit === 'minute' || s.unit === 'hour') {
    const n = s.n * (s.unit === 'hour' ? 60 : 1);
    for (let v = Math.floor(from / n) * n; v <= to && out.length < MAX_TICKS; v += n) push(v);
    return out;
  }
  if (mode === 'day') {
    /* 第 N 天：從第 1 天數，(N − 1) 是 n 的倍數 */
    const n = s.n;
    const first = Math.floor(Math.floor(from / MINUTES_PER_DAY) / n) * n;
    for (let d = first; d * MINUTES_PER_DAY <= to && out.length < MAX_TICKS; d += n)
      push(d * MINUTES_PER_DAY);
    return out;
  }
  if (s.unit === 'day') {
    /* 每個月從 1 日數；離下個月 1 日不到半個間隔的不畫 */
    let m = addMonths(from, -1);
    while (m <= to && out.length < MAX_TICKS) {
      const p = dateParts(m);
      const dim = daysInMonth(p.y, p.m);
      for (let d = 1; d <= dim; d += s.n) {
        if (s.n > 1 && d + s.n / 2 >= dim + 1) break;
        const v = m + (d - 1) * MINUTES_PER_DAY;
        if (v > to) break;
        if (v + s.n * MINUTES_PER_DAY >= from) push(v);
      }
      m = addMonths(m, 1);
    }
    return out;
  }
  if (s.unit === 'month') {
    let m = addMonths(from, -s.n);
    const p = dateParts(m);
    m = addMonths(m, -mod(p.m - 1, s.n));
    for (; m <= to && out.length < MAX_TICKS; m = addMonths(m, s.n)) push(m);
    return out;
  }
  /* 年（日期時間）：n 的倍數；西元 1 年以前沒有 */
  const y0 = dateParts(from).y;
  let y = Math.floor(y0 / s.n) * s.n;
  if (y < 1) y += s.n;
  for (; out.length < MAX_TICKS; y += s.n) {
    const v = dateValue(y);
    if (v > to) break;
    push(v);
  }
  return out;
}

/* ---------- 上排 ---------- */

/** 上排的刻度（左邊被切到的那一格也算，標籤由畫的人貼在左邊） */
export function majorTicks(mode: TimeMode, s: Step, from: number, to: number): Tick[] {
  if (mode === 'year') return [];
  const out: Tick[] = [];
  if (s.unit === 'minute' || s.unit === 'hour') {
    for (
      let d = Math.floor(from / MINUTES_PER_DAY);
      d * MINUTES_PER_DAY <= to && out.length < MAX_TICKS;
      d++
    ) {
      const v = d * MINUTES_PER_DAY;
      out.push({ v, label: mode === 'day' ? `第 ${dayNumber(v)} 天` : dateLabel(v) });
    }
    return out;
  }
  if (mode === 'day') return [];
  if (s.unit === 'day') {
    for (
      let m = dateValue(dateParts(from).y, dateParts(from).m);
      m <= to && out.length < MAX_TICKS;
      m = addMonths(m, 1)
    ) {
      const p = dateParts(m);
      out.push({ v: m, label: `${p.y}年${p.m}月` });
    }
    return out;
  }
  if (s.unit === 'month') {
    for (let y = dateParts(from).y; out.length < MAX_TICKS; y++) {
      const v = dateValue(y);
      if (v > to) break;
      out.push({ v, label: `${y}年` });
    }
    return out;
  }
  return [];
}

/* ---------- 吸附單位（規格 3.5） ---------- */

const MIN_SNAPS = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];

export function snapUnitFor(mode: TimeMode, s: Step): SnapUnit {
  if (mode === 'year') {
    let best = 1;
    for (const st of YEAR_STEPS) if (st.n <= s.n / 5) best = st.n;
    return { kind: 'year', n: best };
  }
  if (s.unit === 'minute' || s.unit === 'hour') {
    const m = s.n * (s.unit === 'hour' ? 60 : 1);
    let best = 1;
    for (const c of MIN_SNAPS) if (c <= m / 2) best = c;
    return { kind: 'min', n: best };
  }
  if (s.unit === 'day') return { kind: 'min', n: s.n === 1 ? 720 : MINUTES_PER_DAY };
  if (s.unit === 'month') return { kind: 'min', n: MINUTES_PER_DAY };
  return { kind: 'month', n: 1 };
}

/** 刻度與吸附單位 */
export function axisTicks(
  mode: TimeMode,
  from: number,
  to: number,
  k: number,
  measure: Measure,
): AxisTicks {
  const step = pickStep(mode, k, from, to, measure);
  return {
    step,
    minor: minorValues(mode, step, from, to).map((v) => ({ v, label: minorLabel(mode, step, v) })),
    major: majorTicks(mode, step, from, to),
    snap: snapUnitFor(mode, step),
  };
}
