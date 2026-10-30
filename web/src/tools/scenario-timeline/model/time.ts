/**
 * 時間的寫法（規格 F01～F04、F92、3.1）：三種寫法的解讀、標準寫法、顯示與換算。純計算，不依賴 DOM。
 *
 * - 日期時間（date）：西元 1～9999 年，可以只寫到年、月、日或分；時間軸上以「分鐘」為單位
 *   （1970-01-01 00:00 為 0，不分時區；星期與加減一律用公曆的日序，不經過 Date）。
 * - 第 N 天（day）：第 N 天 HH:MM ＝ (N − 1) × 1440 ＋ 時 × 60 ＋ 分（分鐘）。
 * - 架空年（year）：整數的年；時間軸上以「年」為單位。有自訂的月份（架空曆，F92）時可以再寫到月、日：
 *   位置＝年＋（年裡的第幾天）÷ 一年的天數（calendar.ts）；打開「寫到時刻」時再寫到時:分（F110，一天 24 小時）。
 *
 * 架空年的函式多收一個「曆名與架空曆」（EraArg）：字串＝只有曆名（第一批的寫法，沒有月份）；
 * 物件 { era, calendar }（直接給專案資料也可以）＝曆名＋月份。
 */
import {
  CAL_DAY_MINUTES,
  type Calendar,
  type CalInfo,
  calInfo,
  calParts,
  calValue,
  dayOfValue,
  matchMonthName,
  minuteOfValue,
  monthName,
  monthStartValue,
  normName,
  valueOfDay,
  valueOfMinute,
  weekdayOfDay,
} from './calendar';

export type TimeMode = 'date' | 'day' | 'year';
export type Precision = 'year' | 'month' | 'day' | 'minute';

/** 解讀後的時間：v 是時間軸上的位置（分鐘或年），p 是寫到哪裡 */
export interface Tv {
  v: number;
  p: Precision;
}

export const MINUTES_PER_DAY = 1440;
export const DATE_YEAR_MIN = 1;
export const DATE_YEAR_MAX = 9999;
export const DAY_MIN = -9999;
export const DAY_MAX = 9999;
export const YEAR_MIN = -999999;
export const YEAR_MAX = 999999;
export const ERA_MAX = 20;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/* ---------- 曆名與架空曆 ---------- */

/** 時間的脈絡：曆名（架空年）與架空曆的月份；專案資料本身就符合 */
export interface TimeCtx {
  era: string;
  calendar?: Calendar | null;
}
/** 字串＝只有曆名 */
export type EraArg = string | TimeCtx;

/** 曆名與月份的推算資料（沒有月份時 info 是 null） */
export function ctxParts(a: EraArg | undefined): { era: string; info: CalInfo | null } {
  if (a === undefined || typeof a === 'string') return { era: a ?? '', info: null };
  return { era: a.era ?? '', info: calInfo(a.calendar) };
}

/* ---------- 公曆的日序（Howard Hinnant 的 days_from_civil／civil_from_days；0 ＝ 1970-01-01） ---------- */

export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): { y: number; m: number; d: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export function daysInMonth(y: number, m: number): number {
  return m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}
/** 星期（0＝日） */
export const weekdayOf = (days: number) => (((days % 7) + 7 + 4) % 7) as number;
export const weekdayName = (days: number) => WEEKDAYS[weekdayOf(days)];

/** 正的餘數 */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 日期時間（分鐘）→ 年月日時分 */
export function dateParts(v: number): {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  days: number;
} {
  const days = Math.floor(v / MINUTES_PER_DAY);
  const rest = v - days * MINUTES_PER_DAY;
  const { y, m, d } = civilFromDays(days);
  return { y, m, d, hh: Math.floor(rest / 60), mm: Math.floor(rest % 60), days };
}

export const dateValue = (y: number, m = 1, d = 1, hh = 0, mm = 0) =>
  daysFromCivil(y, m, d) * MINUTES_PER_DAY + hh * 60 + mm;

/** 日期時間（分鐘）的那一月的開頭 */
export function monthStart(v: number): number {
  const p = dateParts(v);
  return dateValue(p.y, p.m, 1);
}
/** 加幾個月（日期時間；落在月初） */
export function addMonths(v: number, n: number): number {
  const p = dateParts(v);
  const idx = p.y * 12 + (p.m - 1) + n;
  return dateValue(Math.floor(idx / 12), mod(idx, 12) + 1, 1);
}

/* ---------- 範圍 ---------- */

export function valueBounds(mode: TimeMode): { min: number; max: number } {
  if (mode === 'date')
    return { min: dateValue(DATE_YEAR_MIN, 1, 1), max: dateValue(DATE_YEAR_MAX + 1, 1, 1) };
  if (mode === 'day')
    return { min: (DAY_MIN - 1) * MINUTES_PER_DAY, max: DAY_MAX * MINUTES_PER_DAY };
  return { min: YEAR_MIN, max: YEAR_MAX + 1 };
}

/* ---------- 解讀 ---------- */

export type ParseResult =
  /** weekdayFixed：寫了星期但和日期不合（照日期，星期不管） */
  { ok: true; tv: Tv; weekdayFixed?: boolean } | { ok: false; error: string };

const fail = (error: string): ParseResult => ({ ok: false, error });

/** 全形轉半形、統一冒號與減號、去頭尾空白 */
export function normalizeInput(text: string): string {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseClock(s: string | undefined): { hh: number; mm: number } | 'bad' | null {
  if (s === undefined || s === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return 'bad';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return 'bad';
  return { hh, mm };
}

function parseDate(raw: string): ParseResult {
  const r = parseDateOnly(raw);
  if (!r.ok || (r.tv.p !== 'day' && r.tv.p !== 'minute')) return r;
  /* 寫了星期：和日期不合時照日期（通知「已更正」） */
  const wm = /(?:\((?:星期|週)?|星期|週)([日一二三四五六天])/.exec(raw);
  if (!wm) return r;
  const wd = wm[1] === '天' ? 0 : WEEKDAYS.indexOf(wm[1]);
  const days = Math.floor(r.tv.v / MINUTES_PER_DAY);
  return weekdayOf(days) === wd ? r : { ...r, weekdayFixed: true };
}

function parseDateOnly(raw: string): ParseResult {
  /* 星期「（四）」「(四)」、「星期四」拿掉 */
  let s = raw
    .replace(/\((?:星期|週)?[日一二三四五六天]\)/g, ' ')
    .replace(/(?:星期|週)[日一二三四五六天]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return fail('請輸入時間');
  /* 1925年3月12日 21:00 → 1925-3-12 21:00 */
  s = s
    .replace(/(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*[日號]/, '$1-$2-$3 ')
    .replace(/(\d+)\s*年\s*(\d+)\s*月/, '$1-$2 ')
    .replace(/(\d+)\s*年/, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(\d{1,4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?(?:(?:\s+|T)(\d{1,2}:\d{2}))?$/i.exec(
    s,
  );
  if (!m) return fail(`看不懂這個時間：「${raw}」`);
  const y = Number(m[1]);
  if (y < DATE_YEAR_MIN || y > DATE_YEAR_MAX)
    return fail(`年份要在 ${DATE_YEAR_MIN}～${DATE_YEAR_MAX} 之間`);
  if (m[2] === undefined) {
    if (m[4]) return fail('只寫年份時不能加時刻');
    return { ok: true, tv: { v: dateValue(y), p: 'year' } };
  }
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return fail('月份要在 1～12 之間');
  if (m[3] === undefined) {
    if (m[4]) return fail('只寫到月時不能加時刻');
    return { ok: true, tv: { v: dateValue(y, mo), p: 'month' } };
  }
  const d = Number(m[3]);
  const dim = daysInMonth(y, mo);
  if (d < 1 || d > dim) return fail(`${y} 年 ${mo} 月沒有 ${d} 日`);
  const clock = parseClock(m[4]);
  if (clock === 'bad') return fail('時刻要寫成 HH:MM（00:00～23:59）');
  if (!clock) return { ok: true, tv: { v: dateValue(y, mo, d), p: 'day' } };
  return { ok: true, tv: { v: dateValue(y, mo, d, clock.hh, clock.mm), p: 'minute' } };
}

function parseDay(raw: string): ParseResult {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return fail('請輸入時間');
  const m =
    /^(?:第\s*)?(-?\d{1,5})\s*(?:天|日)?(?:\s*(\d{1,2}:\d{2}))?$/i.exec(s) ??
    /^(?:d|day)\s*(-?\d{1,5})(?:\s*(\d{1,2}:\d{2}))?$/i.exec(s);
  if (!m) return fail(`看不懂這個時間：「${raw}」（例：第 3 天 21:00）`);
  const n = Number(m[1]);
  if (n < DAY_MIN || n > DAY_MAX) return fail(`天數要在 ${DAY_MIN}～${DAY_MAX} 之間`);
  const clock = parseClock(m[2]);
  if (clock === 'bad') return fail('時刻要寫成 HH:MM（00:00～23:59）');
  const base = (n - 1) * MINUTES_PER_DAY;
  if (!clock) return { ok: true, tv: { v: base, p: 'day' } };
  return { ok: true, tv: { v: base + clock.hh * 60 + clock.mm, p: 'minute' } };
}

function parseYear(raw: string, era: string, info: CalInfo | null): ParseResult {
  let s = raw;
  const e = normalizeInput(era);
  if (e && s.startsWith(e)) s = s.slice(e.length);
  if (info) return parseCalendar(raw, s, info);
  s = s.replace(/年$/, '').replace(/\s+/g, '').trim();
  if (!s) return fail('請輸入年份');
  if (!/^-?\d{1,7}$/.test(s)) return fail(`看不懂這個年份：「${raw}」（例：302）`);
  const y = Number(s);
  if (y < YEAR_MIN || y > YEAR_MAX) return fail(`年份要在 ${YEAR_MIN}～${YEAR_MAX} 之間`);
  return { ok: true, tv: { v: y === 0 ? 0 : y, p: 'year' } };
}

/** 架空曆的時刻：最後面的 H:MM／HH:MM（前面是開頭、空白、T 或「日」「號」）；拿掉之後剩下的字 */
function splitCalClock(s: string): { rest: string; clock: string } | null {
  const m = /(\d{1,2}:\d{2})$/.exec(s);
  if (!m) return null;
  const before = s.slice(0, m.index);
  const last = before.slice(-1);
  if (before && !/[\sTt日號]/.test(last)) return null;
  return { rest: (/[Tt]/.test(last) ? before.slice(0, -1) : before).trim(), clock: m[1] };
}

/** 寫到時刻時的提示（「寫到時刻」關著） */
export const CLOCK_OFF_ERROR = '要寫時刻時，先在「專案」分頁的「月份與日」打開「寫到時刻」';

/**
 * 架空曆（有月份）：302、302年、302-3、302年3月、302年霜月、302-3-5、302年霜月5日、302 霜月 5；
 * 後面的星期「（月曜）」忽略（和日期不合時照日期，通知已更正）。
 * 打開「寫到時刻」（F110）時日子後面可以再加時刻：302-3-5 14:00、302年霜月5日14:00、302-3-5T14:00。
 */
function parseCalendar(raw: string, text: string, info: CalInfo): ParseResult {
  let s = text;
  /* 星期：括號裡的字 */
  let wd: string | null = null;
  s = s.replace(/[(（]\s*([^()（）]+?)\s*[)）]/g, (_m, w: string) => {
    wd = w;
    return ' ';
  });
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return fail('請輸入年份');
  const bad = () => fail(`看不懂這個時間：「${raw}」（例：302 年 ${monthName(info, 0)} 5 日）`);
  /* 時刻（F110） */
  let clock: { hh: number; mm: number } | null = null;
  const sc = splitCalClock(s);
  if (sc) {
    if (!info.clock) return fail(CLOCK_OFF_ERROR);
    const c = parseClock(sc.clock);
    if (c === 'bad' || !c) return fail('時刻要寫成 HH:MM（00:00～23:59）');
    if (!sc.rest) return bad();
    clock = c;
    s = sc.rest;
  }
  const ym = /^(-?\d{1,7})\s*(?:年|[-/.])?\s*/.exec(s);
  if (!ym) return bad();
  const y = Number(ym[1]);
  if (y < YEAR_MIN || y > YEAR_MAX) return fail(`年份要在 ${YEAR_MIN}～${YEAR_MAX} 之間`);
  const yy = y === 0 ? 0 : y;
  const rest = s.slice(ym[0].length);
  if (!rest) {
    if (/[-/.]$/.test(ym[0].trim())) return bad();
    if (clock) return fail('只寫年份時不能加時刻');
    return { ok: true, tv: { v: yy, p: 'year' } };
  }
  /* 月：名稱或數字（名稱可能以數字開頭，例如「1 月」：兩種都試，第一個能讀完的） */
  const tries: { mi: number; tail: string }[] = [];
  const named = matchMonthName(info, rest);
  if (named) tries.push({ mi: named.index, tail: named.rest.replace(/^\s*[-/.]?\s*/, '') });
  const num = /^(\d{1,3})\s*(?:月|[-/.])?\s*/.exec(rest);
  if (num) {
    const m = Number(num[1]);
    if (m < 1 || m > info.M) {
      if (!tries.length) return fail(`月份要在 1～${info.M} 之間`);
    } else tries.push({ mi: m - 1, tail: rest.slice(num[0].length) });
  }
  let firstError: ParseResult | null = null;
  for (const t of tries) {
    const r = finishCalendar(info, yy, t.mi, t.tail.trim(), wd, clock);
    if (r.ok) return r;
    firstError ??= r;
  }
  return firstError ?? bad();
}

/** 架空曆：月份已經認出來，剩下的是日（沒有＝只到月）；clock＝日子後面的時刻 */
function finishCalendar(
  info: CalInfo,
  y: number,
  mi: number,
  tail: string,
  wd: string | null,
  clock: { hh: number; mm: number } | null = null,
): ParseResult {
  if (!tail) {
    if (clock) return fail('只寫到月時不能加時刻');
    return { ok: true, tv: { v: calValue(info, y, mi + 1), p: 'month' } };
  }
  const dm = /^(\d{1,3})\s*[日號]?$/.exec(tail);
  if (!dm) return fail(`看不懂這個日子：「${tail}」`);
  const d = Number(dm[1]);
  const dim = info.months[mi].days;
  if (d < 1) return fail(`日要在 1～${dim} 之間`);
  if (d > dim) return fail(`${monthName(info, mi)}只有 ${dim} 天`);
  const v = clock
    ? calValue(info, y, mi + 1, d, clock.hh * 60 + clock.mm)
    : calValue(info, y, mi + 1, d);
  const r: ParseResult = { ok: true, tv: { v, p: clock ? 'minute' : 'day' } };
  if (wd && info.cal.weekdays.length >= 2) {
    const real = weekdayOfDay(info, dayOfValue(info, v));
    if (normName(real) !== normName(wd)) return { ...r, weekdayFixed: true };
  }
  return r;
}

/** 解讀使用者輸入的時間（寬鬆；規格 3.1） */
export function parseTime(mode: TimeMode, text: string, era: EraArg = ''): ParseResult {
  const s = normalizeInput(text).replace(/：/g, ':');
  if (mode === 'date') return parseDate(s);
  if (mode === 'day') return parseDay(s);
  const c = ctxParts(era);
  return parseYear(s, c.era, c.info);
}

/** 存檔的字串 → Tv（看不懂時 null） */
export function readTime(mode: TimeMode, stored: string, era: EraArg = ''): Tv | null {
  if (!stored) return null;
  const r = parseTime(mode, stored, era);
  return r.ok ? r.tv : null;
}

/* ---------- 標準寫法與顯示 ---------- */

const p2 = (n: number) => String(n).padStart(2, '0');
const p4 = (n: number) => String(n).padStart(4, '0');

/** 時刻 HH:MM */
export const clockText = (minutes: number) => {
  const m = mod(Math.round(minutes), MINUTES_PER_DAY);
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
};

/** 第 N 天的 N */
export const dayNumber = (v: number) => Math.floor(v / MINUTES_PER_DAY) + 1;

/** 標準寫法（存檔、輸入欄、CSV）；架空曆的月、日寫成 302-03、302-03-05（時刻 302-03-05 14:00） */
export function canonical(mode: TimeMode, tv: Tv, era?: EraArg): string {
  if (mode === 'year') {
    const info = ctxParts(era).info;
    if (!info || (tv.p !== 'month' && tv.p !== 'day' && tv.p !== 'minute'))
      return String(Math.round(tv.v));
    const c = calParts(info, tv.v);
    if (tv.p === 'month') return `${c.y}-${p2(c.m)}`;
    const date = `${c.y}-${p2(c.m)}-${p2(c.d)}`;
    return tv.p === 'minute' ? `${date} ${clockText(c.min)}` : date;
  }
  if (mode === 'day') {
    const n = dayNumber(tv.v);
    return tv.p === 'minute' ? `第 ${n} 天 ${clockText(tv.v)}` : `第 ${n} 天`;
  }
  const d = dateParts(tv.v);
  if (tv.p === 'year') return p4(d.y);
  if (tv.p === 'month') return `${p4(d.y)}-${p2(d.m)}`;
  if (tv.p === 'day') return `${p4(d.y)}-${p2(d.m)}-${p2(d.d)}`;
  return `${p4(d.y)}-${p2(d.m)}-${p2(d.d)} ${p2(d.hh)}:${p2(d.mm)}`;
}

/** 架空年的顯示：王國曆 302 年（沒有曆名時 302 年） */
export function yearLabel(y: number, era: string): string {
  const e = era.trim();
  return `${e ? `${e} ` : ''}${Math.round(y)} 年`;
}

/** 日期（年月日＋星期） */
export function dateLabel(v: number): string {
  const d = dateParts(v);
  return `${d.y}年${d.m}月${d.d}日（${weekdayName(d.days)}）`;
}

/**
 * 架空曆的日期：王國曆 302 年 霜月 5 日（月曜）；只到月：王國曆 302 年 霜月；
 * 時刻：王國曆 302 年 霜月 5 日（月曜）14:00（沒有星期時「5 日 14:00」）
 */
export function calLabel(info: CalInfo, tv: Tv, era: string): string {
  const c = calParts(info, tv.v);
  const head = `${yearLabel(c.y, era)} ${monthName(info, c.m - 1)}`;
  if (tv.p === 'month') return head;
  const wd = weekdayOfDay(info, c.T);
  const day = `${head} ${c.d} 日${wd ? `（${wd}）` : ''}`;
  if (tv.p !== 'minute') return day;
  return `${day}${wd ? '' : ' '}${clockText(c.min)}`;
}

/** 顯示用的完整寫法（年表、提示） */
export function formatLong(mode: TimeMode, tv: Tv, era: EraArg = ''): string {
  if (mode === 'year') {
    const c = ctxParts(era);
    if (c.info && tv.p !== 'year') return calLabel(c.info, tv, c.era);
    return yearLabel(tv.v, c.era);
  }
  if (mode === 'day') {
    const n = dayNumber(tv.v);
    return tv.p === 'minute' ? `第 ${n} 天 ${clockText(tv.v)}` : `第 ${n} 天`;
  }
  const d = dateParts(tv.v);
  if (tv.p === 'year') return `${d.y}年`;
  if (tv.p === 'month') return `${d.y}年${d.m}月`;
  if (tv.p === 'day') return dateLabel(tv.v);
  return `${dateLabel(tv.v)}${clockText(tv.v)}`;
}

/* ---------- 期間 ---------- */

/** 寫法的單位長度之後（結束包含整個單位：只到日的結束是隔天 0:00） */
export function afterUnit(mode: TimeMode, tv: Tv, era?: EraArg): number {
  if (mode === 'year') {
    const info = ctxParts(era).info;
    /* 寫到分的結束就是那一刻 */
    if (info && tv.p === 'minute') return tv.v;
    if (info && tv.p === 'day') return valueOfDay(info, dayOfValue(info, tv.v) + 1);
    if (info && tv.p === 'month') {
      const c = calParts(info, tv.v);
      return monthStartValue(info, c.y, c.m);
    }
    return tv.v + 1;
  }
  if (tv.p === 'minute') return tv.v;
  if (tv.p === 'day') return tv.v + MINUTES_PER_DAY;
  if (tv.p === 'month') return addMonths(tv.v, 1);
  /* 年 */
  return dateValue(dateParts(tv.v).y + 1);
}

/** 期間的「不含」結束 → 存檔的結束（只到日：減一天；只到月：前一個月；只到年：前一年） */
export function endFromExclusive(
  mode: TimeMode,
  exclusive: number,
  p: Precision,
  era?: EraArg,
): Tv {
  if (mode === 'year') {
    const info = ctxParts(era).info;
    if (info && p === 'minute') return { v: exclusive, p };
    if (info && p === 'day') return { v: valueOfDay(info, dayOfValue(info, exclusive) - 1), p };
    if (info && p === 'month') {
      const c = calParts(info, exclusive);
      return { v: monthStartValue(info, c.y, c.m - 2), p };
    }
    return { v: exclusive - 1, p: 'year' };
  }
  if (p === 'minute') return { v: exclusive, p };
  if (p === 'day') return { v: exclusive - MINUTES_PER_DAY, p };
  if (p === 'month') return { v: addMonths(exclusive, -1), p };
  return { v: dateValue(dateParts(exclusive).y - 1), p };
}

/* ---------- 吸附（規格 3.5） ---------- */

/** 吸附單位；day 是架空曆的日（日期時間的日寫成 1440 分）；架空曆寫到時刻時 min 是分（F110） */
export type SnapUnit =
  | { kind: 'min'; n: number }
  | { kind: 'day'; n: number }
  | { kind: 'month'; n: number }
  | { kind: 'year'; n: number };

/** 單位的大約長度（比較用；架空年以年計，架空曆的月、日照月份數與一年的天數） */
export function unitSize(mode: TimeMode, u: SnapUnit, era?: EraArg): number {
  if (mode === 'year') {
    if (u.kind === 'year') return u.n;
    const info = ctxParts(era).info;
    if (u.kind === 'min') return info ? u.n / (info.D * CAL_DAY_MINUTES) : u.n;
    return u.kind === 'month' ? u.n / (info?.M ?? 12) : u.n / (info?.D ?? 365);
  }
  if (u.kind === 'min') return u.n;
  if (u.kind === 'day') return u.n * MINUTES_PER_DAY;
  if (u.kind === 'month') return u.n * 43830;
  return u.n * 525960;
}

export function coarser(mode: TimeMode, a: SnapUnit, b: SnapUnit, era?: EraArg): SnapUnit {
  return unitSize(mode, a, era) >= unitSize(mode, b, era) ? a : b;
}

/** 寫法本身的單位（只到日的事件一次 1 日…） */
export function precisionUnit(mode: TimeMode, p: Precision): SnapUnit {
  if (mode === 'year') {
    if (p === 'minute') return { kind: 'min', n: 1 };
    if (p === 'day') return { kind: 'day', n: 1 };
    if (p === 'month') return { kind: 'month', n: 1 };
    return { kind: 'year', n: 1 };
  }
  if (p === 'minute') return { kind: 'min', n: 1 };
  if (p === 'day') return { kind: 'min', n: MINUTES_PER_DAY };
  if (p === 'month') return { kind: 'month', n: 1 };
  return { kind: 'year', n: 1 };
}

/** 對齊到最近的單位 */
export function snapValue(mode: TimeMode, v: number, u: SnapUnit, era?: EraArg): number {
  if (mode === 'year' && u.kind === 'min') {
    /* 架空曆的時刻（F110）：對齊到 n 分（每天從 0:00 數） */
    const info = ctxParts(era).info;
    if (info) {
      const n = Math.max(1, u.n);
      return valueOfMinute(info, Math.round(minuteOfValue(info, v) / n) * n);
    }
  }
  if (mode === 'year' && (u.kind === 'day' || u.kind === 'month')) {
    const info = ctxParts(era).info;
    if (info && u.kind === 'day') {
      const n = Math.max(1, u.n);
      return valueOfDay(info, Math.round((v * info.D) / n) * n);
    }
    if (info) {
      const c = calParts(info, v);
      const a = monthStartValue(info, c.y, c.m - 1);
      const b = monthStartValue(info, c.y, c.m);
      return v - a < b - v ? a : b;
    }
    return Math.round(v);
  }
  if (u.kind === 'min' || mode === 'year') {
    const n = Math.max(1, u.n);
    return Math.round(v / n) * n;
  }
  if (u.kind === 'month') {
    const a = monthStart(v);
    const b = addMonths(a, 1);
    return v - a < b - v ? a : b;
  }
  const y = dateParts(v).y;
  const a = dateValue(y);
  const b = dateValue(y + 1);
  return v - a < b - v ? a : b;
}

/** 吸附一個時間（照事件的寫法：寫法比單位粗時用寫法的單位，寫法不變） */
export function snapTv(mode: TimeMode, v: number, p: Precision, unit: SnapUnit, era?: EraArg): Tv {
  const u = coarser(mode, unit, precisionUnit(mode, p), era);
  return { v: snapValue(mode, v, u, era), p };
}

/** 夾在寫法允許的範圍內 */
export function clampValue(mode: TimeMode, v: number): number {
  const b = valueBounds(mode);
  return Math.min(b.max - 1, Math.max(b.min, v));
}

/* ---------- 換寫法（規格 F04） ---------- */

/** 換算時用的中間格式：日期時間的 Tv */
export function toDateTv(from: TimeMode, tv: Tv, dayOne: number): Tv | null {
  if (from === 'date') return tv;
  if (from === 'day') return { v: tv.v + dayOne, p: tv.p };
  /* 架空年（含架空曆的月日）只取年：架空曆的月日和公曆沒有對應（規格 F92、D27） */
  const y = Math.floor(tv.v + 1e-9);
  if (y < DATE_YEAR_MIN || y > DATE_YEAR_MAX) return null;
  return { v: dateValue(y), p: 'year' };
}

export function fromDateTv(to: TimeMode, tv: Tv, dayOne: number): Tv | null {
  const b = valueBounds('date');
  if (tv.v < b.min || tv.v >= b.max) return null;
  if (to === 'date') return tv;
  if (to === 'year') return { v: dateParts(tv.v).y, p: 'year' };
  /* 第 N 天：只到月、年的寫法換成那一天 */
  const v = tv.v - dayOne;
  const p: Precision = tv.p === 'minute' ? 'minute' : 'day';
  const n = dayNumber(v);
  if (n < DAY_MIN || n > DAY_MAX) return null;
  return { v, p };
}

/** 時間在事件裡的角色：期間的結束包含整個單位（換算時照「單位的最後一天」換） */
export type TimeRole = 'start' | 'end';

/**
 * 一個存檔的時間換到別的寫法；換不過去時 null。
 * 期間的結束（role: 'end'）只到月／年、換成第 N 天時是那個單位的最後一天（1925-03 的結束＝3/31 那天結束），
 * 期間才不會變短或倒過來；其他寫法、開始與時間點換成單位的第一天。
 */
export function convertTime(
  from: TimeMode,
  to: TimeMode,
  stored: string,
  { era, dayOne, role = 'start' }: { era: EraArg; dayOne: number; role?: TimeRole },
): string | null {
  const tv = readTime(from, stored, era);
  if (!tv) return null;
  if (from === to) return canonical(to, tv, era);
  let mid = toDateTv(from, tv, dayOne);
  if (!mid) return null;
  if (role === 'end' && to === 'day' && (mid.p === 'month' || mid.p === 'year'))
    mid = { v: afterUnit('date', mid) - MINUTES_PER_DAY, p: 'day' };
  const out = fromDateTv(to, mid, dayOne);
  return out ? canonical(to, out) : null;
}

/**
 * 換寫法會不會失去精度：日期→架空年（月、日、時刻變成年）、日期的月／年→第 N 天（變成某一天）、
 * 第 N 天→架空年、架空年→第 N 天。日期↔第 N 天的日、時刻與架空年→日期（年）不會。
 */
export function convertLoses(
  from: TimeMode,
  to: TimeMode,
  stored: string,
  era: EraArg = '',
): boolean {
  if (from === to) return false;
  const tv = readTime(from, stored, era);
  if (!tv) return false;
  if (from === 'date') return to === 'year' ? tv.p !== 'year' : tv.p === 'month' || tv.p === 'year';
  if (from === 'day') return to === 'year';
  /* 架空曆的月、日、時刻換成別的寫法只留年 */
  if (tv.p === 'month' || tv.p === 'day' || tv.p === 'minute') return true;
  return to === 'day';
}

/** 「第 1 天是哪一天」的 YYYY-MM-DD → 那天 0:00 的分鐘數（看不懂時 null） */
export function dayOneValue(text: string): number | null {
  const r = parseTime('date', text);
  if (!r.ok) return null;
  return r.tv.p === 'minute' ? Math.floor(r.tv.v / MINUTES_PER_DAY) * MINUTES_PER_DAY : r.tv.v;
}
