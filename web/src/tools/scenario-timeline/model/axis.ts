/**
 * 刻度（規格 F34、3.4）與吸附單位（3.5）。參考 vis-timeline 的 TimeStep（依標籤寬度挑最小放得下的間隔、
 * 上下兩排），階梯與標籤是本站的。純計算。
 *
 * 位置 v：日期時間與第 N 天是分鐘、架空年是年；k＝每單位幾 px。
 * 架空年有月份（架空曆，F92）時多了日、月的階梯；打開「寫到時刻」（F110）時再多分、時的階梯（同日期時間）。
 * ctx 是曆名與架空曆（專案資料本身就可以）。
 */
import {
  CAL_DAY_MINUTES,
  type CalInfo,
  calParts,
  calValue,
  dayOfValue,
  minuteOfValue,
  monthName,
  monthStartValue,
  valueOfDay,
  valueOfMinute,
  weekdayOfDay,
} from './calendar';
import {
  addMonths,
  clockText,
  ctxParts,
  dateLabel,
  dateParts,
  dateValue,
  dayNumber,
  daysInMonth,
  type EraArg,
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
  /** 上排的標籤放不下時依序改用的短寫法（例：3月15日（日）、3月15日、15日） */
  short?: string[];
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

/** 架空曆：1、2、5、10 日；1、2、3、6 個月；年同架空年 */
const CAL_STEPS: Step[] = [
  ...[1, 2, 5, 10].map((n): Step => ({ unit: 'day', n })),
  ...[1, 2, 3, 6].map((n): Step => ({ unit: 'month', n })),
  ...YEAR_STEPS,
];

/** 架空曆寫到時刻（F110）：分、時（同日期時間）＋日、月、年 */
const CAL_CLOCK_STEPS: Step[] = [...MIN_STEPS, ...HOUR_STEPS, ...CAL_STEPS];

/** 架空年的架空曆（有月份時） */
const calOf = (mode: TimeMode, ctx?: EraArg): CalInfo | null =>
  mode === 'year' ? ctxParts(ctx).info : null;

const isClockUnit = (s: Step) => s.unit === 'minute' || s.unit === 'hour';
/** 間隔是幾分（分、時） */
const stepMinutes = (s: Step) => s.n * (s.unit === 'hour' ? 60 : 1);

export function stepLadder(mode: TimeMode, ctx?: EraArg): Step[] {
  const info = calOf(mode, ctx);
  if (info) return info.clock ? CAL_CLOCK_STEPS : CAL_STEPS;
  return mode === 'date' ? DATE_STEPS : mode === 'day' ? DAY_STEPS : YEAR_STEPS;
}

/** 一個間隔的大約長度（日期時間的月、年用平均長度；架空年以年計） */
export function stepSize(mode: TimeMode, s: Step, ctx?: EraArg): number {
  if (mode === 'year') {
    const info = calOf(mode, ctx);
    if (info && s.unit === 'day') return s.n / info.D;
    if (info && s.unit === 'month') return s.n / info.M;
    if (info && isClockUnit(s)) return stepMinutes(s) / (info.D * CAL_DAY_MINUTES);
    return s.n;
  }
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
function sampleLabel(mode: TimeMode, s: Step, from: number, to: number, ctx?: EraArg): string {
  const info = calOf(mode, ctx);
  if (info && s.unit === 'day')
    return '8'.repeat(String(Math.max(...info.months.map((m) => m.days))).length);
  if (info && s.unit === 'month')
    return info.months
      .map((_, i) => monthName(info, i))
      .reduce((a, b) => (b.length > a.length ? b : a), '');
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
  ctx?: EraArg,
): Step {
  const ladder = stepLadder(mode, ctx);
  const widths = new Map<string, number>();
  for (const s of ladder) {
    const sample = sampleLabel(mode, s, from, to, ctx);
    let w = widths.get(sample);
    if (w === undefined) {
      w = measure(sample);
      widths.set(sample, w);
    }
    if (stepSize(mode, s, ctx) * k >= w + LABEL_PAD) return s;
  }
  return ladder[ladder.length - 1];
}

/* ---------- 下排 ---------- */

const MAX_TICKS = 4000;

function minorLabel(mode: TimeMode, s: Step, v: number, ctx?: EraArg): string {
  const info = calOf(mode, ctx);
  if (info && (s.unit === 'day' || s.unit === 'month')) {
    const c = calParts(info, v);
    return s.unit === 'day' ? String(c.d) : monthName(info, c.m - 1);
  }
  if (info && isClockUnit(s)) return clockText(calParts(info, v).min);
  if (s.unit === 'minute' || s.unit === 'hour') return clockText(v);
  if (mode === 'year') return String(Math.round(v));
  if (mode === 'day') return `第 ${dayNumber(v)} 天`;
  const d = dateParts(v);
  if (s.unit === 'day') return String(d.d);
  if (s.unit === 'month') return `${d.m}月`;
  return String(d.y);
}

/** 架空曆的下排：日（每個月從 1 日數）、月（每年從第 1 個月數） */
function calMinorValues(info: CalInfo, s: Step, from: number, to: number): number[] {
  const out: number[] = [];
  const first = calParts(info, from);
  if (s.unit === 'day') {
    /* 從左邊被切到的那個月的前一個月開始 */
    let y = first.y;
    let mi = first.m - 2;
    if (mi < 0) {
      mi += info.M;
      y--;
    }
    while (out.length < MAX_TICKS) {
      const start = calValue(info, y, mi + 1);
      if (start > to) break;
      const dim = info.months[mi].days;
      for (let d = 1; d <= dim; d += s.n) {
        if (s.n > 1 && d + s.n / 2 >= dim + 1) break;
        const v = calValue(info, y, mi + 1, d);
        if (v > to) break;
        if (v + s.n / info.D >= from && out.length < MAX_TICKS) out.push(v);
      }
      mi++;
      if (mi >= info.M) {
        mi = 0;
        y++;
      }
    }
    return out;
  }
  /* 月：第幾個月是 n 的倍數（每年重新數） */
  for (let y = first.y - 1; out.length < MAX_TICKS; y++) {
    if (y > to) break;
    for (let mi = 0; mi < info.M; mi += s.n) {
      const v = calValue(info, y, mi + 1);
      if (v > to) break;
      const next = mi + s.n < info.M ? calValue(info, y, mi + s.n + 1) : y + 1;
      if (next >= from && out.length < MAX_TICKS) out.push(v);
    }
  }
  return out;
}

/** 下排的刻度位置（[from, to] 之內，再加左邊被切到的那一格） */
export function minorValues(
  mode: TimeMode,
  s: Step,
  from: number,
  to: number,
  ctx?: EraArg,
): number[] {
  const out: number[] = [];
  const push = (v: number) => {
    if (out.length < MAX_TICKS) out.push(v);
  };
  const info = calOf(mode, ctx);
  if (info && (s.unit === 'day' || s.unit === 'month')) return calMinorValues(info, s, from, to);
  if (info && isClockUnit(s)) {
    /* 架空曆的分、時（F110）：每天從 0:00 數（間隔都是 1440 的因數） */
    const n = stepMinutes(s);
    const last = minuteOfValue(info, to);
    for (let M = Math.floor(minuteOfValue(info, from) / n) * n; M <= last; M += n) {
      if (out.length >= MAX_TICKS) break;
      push(valueOfMinute(info, M));
    }
    return out;
  }
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
export function majorTicks(
  mode: TimeMode,
  s: Step,
  from: number,
  to: number,
  ctx?: EraArg,
): Tick[] {
  const out: Tick[] = [];
  const info = calOf(mode, ctx);
  if (info && isClockUnit(s)) {
    /* 架空曆的分、時（F110）：每天一格「302 年 霜月 5 日（月曜）」 */
    for (let T = dayOfValue(info, from); out.length < MAX_TICKS; T++) {
      const v = valueOfDay(info, T);
      if (v > to) break;
      const p = calParts(info, v);
      const name = monthName(info, p.m - 1);
      const w = weekdayOfDay(info, p.T);
      const wd = w ? `（${w}）` : '';
      const day = `${name} ${p.d} 日`;
      out.push({
        v,
        label: `${p.y} 年 ${day}${wd}`,
        short: wd ? [`${day}${wd}`, day, `${p.d} 日`] : [day, `${p.d} 日`],
      });
    }
    return out;
  }
  if (info && s.unit === 'day') {
    /* 日：每個月一格「302 年 霜月」 */
    const c = calParts(info, from);
    for (let i = 0; out.length < MAX_TICKS; i++) {
      const v = monthStartValue(info, c.y, c.m - 1 + i);
      if (v > to) break;
      const p = calParts(info, v);
      const name = monthName(info, p.m - 1);
      out.push({ v, label: `${p.y} 年 ${name}`, short: [name] });
    }
    return out;
  }
  if (info && s.unit === 'month') {
    for (let y = Math.floor(from); y <= to && out.length < MAX_TICKS; y++)
      out.push({ v: y, label: `${y} 年` });
    return out;
  }
  if (mode === 'year') return [];
  if (s.unit === 'minute' || s.unit === 'hour') {
    for (
      let d = Math.floor(from / MINUTES_PER_DAY);
      d * MINUTES_PER_DAY <= to && out.length < MAX_TICKS;
      d++
    ) {
      const v = d * MINUTES_PER_DAY;
      if (mode === 'day')
        out.push({ v, label: `第 ${dayNumber(v)} 天`, short: [`${dayNumber(v)}`] });
      else {
        const p = dateParts(v);
        const wd = dateLabel(v).slice(dateLabel(v).indexOf('（'));
        out.push({
          v,
          label: dateLabel(v),
          short: [`${p.m}月${p.d}日${wd}`, `${p.m}月${p.d}日`, `${p.d}日`],
        });
      }
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
      out.push({ v: m, label: `${p.y}年${p.m}月`, short: [`${p.m}月`] });
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

/**
 * 上排標籤的寫法與位置：貼在格子的左邊（左邊被切到時貼在 lo）；會壓到下一格的標籤或超出 hi 時改用短寫法，
 * 都放不下時 null（不畫，也不畫被切掉的半個字）。gap 是標籤後面要留的空白。
 */
export function placeMajor(
  t: Tick,
  x: number,
  nextX: number | null,
  lo: number,
  hi: number,
  measure: Measure,
  gap = 8,
): { text: string; left: number } | null {
  const left = Math.max(x, lo) + 4;
  const limit = Math.min(nextX ?? Number.POSITIVE_INFINITY, hi);
  for (const text of [t.label, ...(t.short ?? [])])
    if (left + measure(text) + gap <= limit) return { text, left };
  return null;
}

/* ---------- 吸附單位（規格 3.5） ---------- */

const MIN_SNAPS = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];

export function snapUnitFor(mode: TimeMode, s: Step, ctx?: EraArg): SnapUnit {
  if (calOf(mode, ctx)) {
    /* 架空曆：日、月的間隔吸附到日；1、2 年的間隔吸附到月；再大照架空年（分、時照日期時間，F110） */
    if (s.unit === 'day' || s.unit === 'month') return { kind: 'day', n: 1 };
    if (s.unit === 'year' && s.n <= 2) return { kind: 'month', n: 1 };
  }
  if (mode === 'year' && s.unit === 'year') {
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
  ctx?: EraArg,
): AxisTicks {
  const step = pickStep(mode, k, from, to, measure, ctx);
  return {
    step,
    minor: minorValues(mode, step, from, to, ctx).map((v) => ({
      v,
      label: minorLabel(mode, step, v, ctx),
    })),
    major: majorTicks(mode, step, from, to, ctx),
    snap: snapUnitFor(mode, step, ctx),
  };
}
