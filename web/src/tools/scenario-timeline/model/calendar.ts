/**
 * 架空曆的月份與日（規格 F92、3.1）：架空年加上自訂的月份（名稱、天數；每年相同）與一週（選填）。
 * 純計算，不依賴 time.ts（time.ts 引用這裡）。
 *
 * 時間軸上的位置仍以「年」為單位：某年某月某日 ＝ 年 ＋（那一天在一年裡的第幾天 − 1）÷ 一年的天數。
 * 只到年的時間是整數（和沒有月份時完全相同）。換算一律先換成「第幾天」的整數（T ＝ 年 × 一年的天數 ＋ 年裡的第幾天），
 * 再換回位置，不靠浮點數累加。
 *
 * 第三批（F110）：打開「寫到時刻」（clock）時時間可以再寫到時:分（一天固定 24 小時、一小時 60 分）：
 * 位置＝年＋（年裡的第幾天 × 1440 ＋ 那天的第幾分）÷（一年的天數 × 1440）；換算一律經過「第幾分」的整數
 * （M ＝ T × 1440 ＋ 那天的第幾分）。沒有時刻的時間和以前完全相同。
 */

export interface CalMonth {
  /** 月份的代號（改名、排序、刪除時換算存檔的時間用；存檔的時間寫的是第幾個月） */
  id: string;
  name: string;
  days: number;
}

export interface Calendar {
  /** 空的＝沒有月份（只用年，和第一批相同） */
  months: CalMonth[];
  /** 一週每天的名稱（空的＝不用星期） */
  weekdays: string[];
  /** 第 1 年第 1 個月第 1 日是一週的第幾天（0 起算） */
  weekStart: number;
  /**
   * 寫到時刻（第三批，F110；一天 24 小時、一小時 60 分）。只有 true 時才存（關著時沒有這個欄位，
   * 和第二批的資料逐欄位相同）；沒有月份時不算。
   */
  clock?: boolean;
}

/** 一天幾分（架空曆的時刻固定 24 小時 × 60 分） */
export const CAL_DAY_MINUTES = 1440;

export const CAL_LIMITS = {
  months: 24,
  days: 100,
  weekdays: 14,
  name: 12,
} as const;

export const emptyCalendar = (): Calendar => ({ months: [], weekdays: [], weekStart: 0 });

let seq = 0;
export function monthId(): string {
  seq = (seq + 1) % 1e6;
  return `mo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${seq.toString(36)}`;
}

/** 打開「使用月份與日」時的預設：12 個月、每月 30 天（名稱「1 月」…，可以改） */
export function defaultCalendar(): Calendar {
  return {
    months: Array.from({ length: 12 }, (_, i) => ({
      id: monthId(),
      name: `${i + 1} 月`,
      days: 30,
    })),
    weekdays: [],
    weekStart: 0,
  };
}

const posMod = (a: number, n: number) => ((a % n) + n) % n;
const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};
const nameOf = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, CAL_LIMITS.name) : '';

/** 讀回時整理（認不得的拿掉、超過上限截掉、天數夾在 1～100） */
export function normalizeCalendar(raw: unknown): Calendar {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyCalendar();
  const r = raw as Record<string, unknown>;
  const used = new Set<string>();
  const months: CalMonth[] = [];
  for (const m of Array.isArray(r.months) ? r.months : []) {
    if (!m || typeof m !== 'object' || months.length >= CAL_LIMITS.months) continue;
    const o = m as Record<string, unknown>;
    let id = typeof o.id === 'string' && o.id && o.id.length <= 64 ? o.id : monthId();
    if (used.has(id)) id = monthId();
    used.add(id);
    months.push({ id, name: nameOf(o.name), days: clampInt(o.days, 1, CAL_LIMITS.days, 30) });
  }
  const weekdays = (Array.isArray(r.weekdays) ? r.weekdays : [])
    .map(nameOf)
    .filter(Boolean)
    .slice(0, CAL_LIMITS.weekdays);
  return {
    months,
    weekdays: weekdays.length >= 2 ? weekdays : [],
    weekStart: weekdays.length >= 2 ? clampInt(r.weekStart, 0, weekdays.length - 1, 0) : 0,
    /* 寫到時刻：只有開著（而且有月份）時才有這個欄位 */
    ...(r.clock === true && months.length ? { clock: true } : {}),
  };
}

/** 以「、，,／/」或空白分隔的星期名稱 */
export function splitWeekdays(text: string): string[] {
  return text
    .split(/[、，,／/\s]+/)
    .map(nameOf)
    .filter(Boolean)
    .slice(0, CAL_LIMITS.weekdays);
}

/* ---------- 推算用的資料（同一個 Calendar 物件只算一次） ---------- */

export interface CalInfo {
  cal: Calendar;
  months: readonly CalMonth[];
  /** cum[i]＝第 i 個月（0 起算）之前有幾天；cum[M]＝一年的天數 */
  cum: number[];
  /** 一年的天數 */
  D: number;
  /** 月份數 */
  M: number;
  /** 月份名稱（正規化）→ 第幾個月（0 起算）；長的名稱先比對 */
  names: { key: string; index: number }[];
  /** 寫到時刻（F110） */
  clock: boolean;
}

const infoCache = new WeakMap<Calendar, CalInfo>();

/** 有月份時的推算資料；沒有月份（或沒有曆）時 null */
export function calInfo(cal: Calendar | null | undefined): CalInfo | null {
  if (!cal?.months.length) return null;
  const hit = infoCache.get(cal);
  if (hit) return hit;
  const cum = [0];
  for (const m of cal.months) cum.push(cum[cum.length - 1] + Math.max(1, m.days));
  const names = cal.months
    .map((m, index) => ({ key: normName(m.name), index }))
    .filter((n) => n.key)
    .sort((p, q) => q.key.length - p.key.length || p.index - q.index);
  const info: CalInfo = {
    cal,
    months: cal.months,
    cum,
    D: cum[cum.length - 1],
    M: cal.months.length,
    names,
    clock: cal.clock === true,
  };
  infoCache.set(cal, info);
  return info;
}

/** 比對月份名稱用的正規化（全形轉半形、去空白、不分大小寫） */
export const normName = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/** 月份的顯示名稱（空白時「N 月」） */
export const monthName = (info: CalInfo, index: number) =>
  info.months[index]?.name.trim() || `${index + 1} 月`;

/** 某年某月某日（月、日 1 起算）的位置；minute＝那天的第幾分（寫到時刻時） */
export function calValue(info: CalInfo, y: number, m = 1, d = 1, minute = 0): number {
  const doy = info.cum[m - 1] + d - 1;
  if (!minute) return y + doy / info.D;
  return y + (doy * CAL_DAY_MINUTES + minute) / (info.D * CAL_DAY_MINUTES);
}

/** 第幾天（T ＝ 年 × 一年的天數 ＋ 年裡的第幾天，0 起算）→ 位置 */
export function valueOfDay(info: CalInfo, T: number): number {
  const y = Math.floor(T / info.D);
  return y + (T - y * info.D) / info.D;
}

/** 位置所在的那一天（第幾天，0 起算的整數） */
export function dayOfValue(info: CalInfo, v: number): number {
  return Math.floor(v * info.D + 1e-6);
}

/**
 * 位置所在的那一分（第幾分＝第幾天 × 1440 ＋ 那天的第幾分，整數）。寫到分的位置離整數很近（誤差遠小於 0.02 分，
 * 年份到 ±1000000、一年 2400 天時約 0.001 分），四捨五入；其他的（拖曳中）取下整數。
 */
export function minuteOfValue(info: CalInfo, v: number): number {
  const x = v * info.D * CAL_DAY_MINUTES;
  const r = Math.round(x);
  return Math.abs(x - r) < 0.02 ? r : Math.floor(x);
}

/** 第幾分（minuteOfValue 的整數）→ 位置；剛好是一天的開頭時和 valueOfDay 相同 */
export function valueOfMinute(info: CalInfo, M: number): number {
  const T = Math.floor(M / CAL_DAY_MINUTES);
  const mm = M - T * CAL_DAY_MINUTES;
  const y = Math.floor(T / info.D);
  const doy = T - y * info.D;
  if (!mm) return y + doy / info.D;
  return y + (doy * CAL_DAY_MINUTES + mm) / (info.D * CAL_DAY_MINUTES);
}

export interface CalParts {
  y: number;
  /** 1 起算 */
  m: number;
  /** 1 起算 */
  d: number;
  /** 年裡的第幾天（0 起算） */
  doy: number;
  /** 第幾天（絕對） */
  T: number;
  /** 那天的第幾分（0～1439；寫到時刻時才用得到） */
  min: number;
}

export function calParts(info: CalInfo, v: number): CalParts {
  const T = dayOfValue(info, v);
  const y = Math.floor(T / info.D);
  const doy = T - y * info.D;
  let mi = 0;
  while (mi + 1 < info.M && info.cum[mi + 1] <= doy) mi++;
  const min = Math.min(
    CAL_DAY_MINUTES - 1,
    Math.max(0, minuteOfValue(info, v) - T * CAL_DAY_MINUTES),
  );
  return { y, m: mi + 1, d: doy - info.cum[mi] + 1, doy, T, min };
}

/** 月份的開頭（第幾個月，可以超出一年：自動進位到下一年） */
export function monthStartValue(info: CalInfo, y: number, monthIndex: number): number {
  const yy = y + Math.floor(monthIndex / info.M);
  const mi = posMod(monthIndex, info.M);
  return yy + info.cum[mi] / info.D;
}

/** 星期（沒有設定時空字串） */
export function weekdayOfDay(info: CalInfo, T: number): string {
  const w = info.cal.weekdays;
  if (w.length < 2) return '';
  return w[posMod(T - info.D + info.cal.weekStart, w.length)];
}

/** 找月份名稱：文字開頭是哪個月（長的名稱先比對）；回傳第幾個月（0 起算）與剩下的字 */
export function matchMonthName(
  info: CalInfo,
  text: string,
): { index: number; rest: string } | null {
  const t = text.normalize('NFKC');
  for (const n of info.names) {
    /* 比對時不看空白：把原文逐字對到名稱的長度 */
    let i = 0;
    let k = 0;
    while (i < t.length && k < n.key.length) {
      const ch = t[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch.toLowerCase() !== n.key[k]) break;
      i++;
      k++;
    }
    if (k === n.key.length) return { index: n.index, rest: t.slice(i) };
  }
  return null;
}
