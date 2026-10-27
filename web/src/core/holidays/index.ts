/**
 * 臺灣的國定假日、補假與補行上班（團期行事曆 session-calendar 引入時新增）。
 *
 * - 2017～2027：人事行政總處公告的辦公日曆表（`official.ts`；名稱照公告原文）。
 * - 2028～2099：依現行《紀念日及節日實施條例》（2025-05-28 公布）與補假的慣例推算（`estimateHolidays`），標示「推算」；
 *   調整放假與補行上班要看每年的公告，推算不會有。同一套推算（依年份換成當年的規則）算 2017～2027 年，
 *   除了調整放假與補行上班，和公告逐日一致（單元測試）。
 * - 2016 年以前、2100 年以後：沒有資料（`yearHolidays` 回傳 null）。
 *
 * 日期一律是 `YYYY-MM-DD`（國曆、臺灣的日期）。星期用 UTC 的日序算，不受執行環境的時區影響。
 */
import { LUNAR_LAST_YEAR, lunarFestivals } from './lunar';
import { OFFICIAL_DAYS, OFFICIAL_FIRST_YEAR, OFFICIAL_LAST_YEAR } from './official';

export { LUNAR_FIRST_YEAR, LUNAR_LAST_YEAR, type LunarFestivals, lunarFestivals } from './lunar';
export { OFFICIAL_DAYS, OFFICIAL_FIRST_YEAR, OFFICIAL_LAST_YEAR } from './official';

/** 推算的最後一年（除夕要看下一年的正月初一） */
export const ESTIMATE_LAST_YEAR = LUNAR_LAST_YEAR - 1;

export type HolidaySource = 'official' | 'estimated';

/** 一個不是平常的日子 */
export interface HolidayDay {
  date: string;
  /** 顯示名稱（公告原文；推算的同一天有兩個節日時以「、」連接） */
  name: string;
  /** true：放假；false：週末要上班（補行上班） */
  off: boolean;
  source: HolidaySource;
}

/* ---------- 日期 ---------- */

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → 從 1970-01-01 起的日數（看不懂時 NaN） */
export function dayNumber(date: string): number {
  const m = ISO_RE.exec(date);
  if (!m) return Number.NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}

/** 日數 → `YYYY-MM-DD` */
export function dateOfDay(day: number): string {
  const d = new Date(day * DAY_MS);
  const y = d.getUTCFullYear();
  return `${String(y).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 加減日數 */
export const addDays = (date: string, n: number): string => dateOfDay(dayNumber(date) + n);

/** 星期（0＝日 … 6＝六） */
export function weekdayOf(date: string): number {
  const n = dayNumber(date);
  return (((n + 4) % 7) + 7) % 7;
}

export const isWeekend = (date: string): boolean => {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
};

/* ---------- 公告 ---------- */

function officialYear(year: number): Map<string, HolidayDay> | null {
  const raw = OFFICIAL_DAYS[year];
  if (raw === undefined) return null;
  const map = new Map<string, HolidayDay>();
  for (const item of raw.split('|')) {
    const mmdd = item.slice(0, 4);
    const off = item[4] !== '!';
    const date = `${year}-${mmdd.slice(0, 2)}-${mmdd.slice(2, 4)}`;
    map.set(date, { date, name: item.slice(5), off, source: 'official' });
  }
  return map;
}

/* ---------- 推算 ---------- */

interface BaseHoliday {
  date: string;
  name: string;
  /** 春節連假（小年夜、除夕、初一～初三）：逢週末時補在連假之後 */
  spring: boolean;
  /** 只用來算補假、自己不顯示（例：兒童節與清明同一天時移過去的日子落在週末） */
  hidden?: boolean;
}

/**
 * 那一年適用的規則（推算 2028 年以後用「現行」；2017～2025 年的規則只用來和公告比對推算的方法）：
 * - 2026 起（《紀念日及節日實施條例》）：小年夜、勞動節放假，「清明節」「孔子誕辰紀念日/教師節」的名稱。
 * - 2025：孔子誕辰紀念日、臺灣光復暨金門古寧頭大捷紀念日、行憲紀念日開始放假（條例 2025-05-28 公布）。
 * - 2024 以前（《紀念日及節日實施辦法》）：沒有上面這些；「民族掃墓節」。
 */
function rulesOf(year: number) {
  return {
    xiaoNian: year >= 2026,
    labor: year >= 2026,
    newDays: year >= 2025,
    qingming: year >= 2026 ? '清明節' : '民族掃墓節',
    confucius: year >= 2026 ? '孔子誕辰紀念日/教師節' : '孔子誕辰紀念日',
  };
}

/** 一年的節日（還沒補假）；表外的年份空陣列 */
function baseHolidays(year: number): BaseHoliday[] {
  const f = lunarFestivals(year);
  if (!f) return [];
  const r = rulesOf(year);
  const md = (mmdd: string) => `${year}-${mmdd}`;
  const list: BaseHoliday[] = [{ date: md('01-01'), name: '開國紀念日', spring: false }];
  /* 春節：除夕是正月初一的前一天、小年夜是除夕的前一天（都在國曆一月底到二月） */
  const eve = addDays(f.newYear, -1);
  if (r.xiaoNian) list.push({ date: addDays(eve, -1), name: '小年夜', spring: true });
  list.push(
    { date: eve, name: '農曆除夕', spring: true },
    { date: f.newYear, name: '春節', spring: true },
    { date: addDays(f.newYear, 1), name: '春節', spring: true },
    { date: addDays(f.newYear, 2), name: '春節', spring: true },
  );
  list.push({ date: md('02-28'), name: '和平紀念日', spring: false });
  /* 兒童節與清明：同一天時兒童節移到前一天（逢星期四移到後一天），移過去的日子以「補假」顯示 */
  const children = md('04-04');
  if (f.qingming === children) {
    list.push({ date: children, name: `兒童節及${r.qingming}`, spring: false });
    const moved = addDays(children, weekdayOf(children) === 4 ? 1 : -1);
    list.push({ date: moved, name: '補假', spring: false, hidden: isWeekend(moved) });
  } else {
    list.push(
      { date: children, name: '兒童節', spring: false },
      { date: f.qingming, name: r.qingming, spring: false },
    );
  }
  if (r.labor) list.push({ date: md('05-01'), name: '勞動節', spring: false });
  list.push(
    { date: f.dragonBoat, name: '端午節', spring: false },
    { date: f.midAutumn, name: '中秋節', spring: false },
  );
  if (r.newDays) list.push({ date: md('09-28'), name: r.confucius, spring: false });
  list.push({ date: md('10-10'), name: '國慶日', spring: false });
  if (r.newDays)
    list.push(
      { date: md('10-25'), name: '臺灣光復暨金門古寧頭大捷紀念日', spring: false },
      { date: md('12-25'), name: '行憲紀念日', spring: false },
    );
  return list;
}

/**
 * 推算一年的放假日（依那一年的規則，見 rulesOf；2028 年以後是現行規則）：
 * - 節日：開國紀念日、小年夜、農曆除夕、春節（初一～初三）、和平紀念日、兒童節、清明節、勞動節、端午節、中秋節、
 *   孔子誕辰紀念日／教師節、國慶日、臺灣光復暨金門古寧頭大捷紀念日、行憲紀念日。
 * - 補假：逢星期六補前一個上班日、逢星期日補後一個上班日；春節連假（小年夜、除夕、初一～初三）逢週末時，
 *   依序補在連假之後的上班日。補假可以落在前後一年（例：1 月 1 日是星期六 → 前一年 12 月 31 日）。
 * - 兩個節日同一天：名稱以「、」連接；落在週末時各補一天（照 2020 年兒童節與民族掃墓節同在星期六、補兩天的先例：
 *   星期六往前、星期日往後依序找上班日）。
 * - 兒童節與清明同一天：兒童節移到前一天（4 月 4 日是星期四時移到後一天），以「補假」顯示；移過去的日子是週末時再照上一條補。
 * 不推算調整放假與補行上班。表外的年份回傳空的 Map。
 */
export function estimateHolidays(year: number): Map<string, HolidayDay> {
  const out = new Map<string, HolidayDay>();
  if (!lunarFestivals(year) || year > ESTIMATE_LAST_YEAR) return out;
  /* 前後一年的節日也要算（補假會跨年） */
  const bases = [year - 1, year, year + 1].flatMap((y) =>
    y <= ESTIMATE_LAST_YEAR ? baseHolidays(y) : [],
  );
  const byDate = new Map<string, BaseHoliday[]>();
  for (const b of bases) {
    const list = byDate.get(b.date) ?? [];
    list.push(b);
    byDate.set(b.date, list);
  }
  const taken = new Set(byDate.keys());
  const comps = new Set<string>();
  const isWorkday = (d: string) => !isWeekend(d) && !taken.has(d) && !comps.has(d);
  /** 從 from 往 step 的方向找第一個上班日，記成補假 */
  const seek = (from: string, step: 1 | -1) => {
    let d = addDays(from, step);
    for (let i = 0; i < 60 && !isWorkday(d); i++) d = addDays(d, step);
    comps.add(d);
  };
  /*
   * 依日期順序處理：一般節日逢週末，那天有幾個節日就補幾天；
   * 春節連假在最後一天處理（連假裡有幾天週末就往後補幾天）
   */
  const jobs: { at: string; run: () => void }[] = [];
  for (const [date, list] of byDate) {
    if (!isWeekend(date) || list.some((b) => b.spring)) continue;
    const count = list.length;
    const step = weekdayOf(date) === 6 ? -1 : 1;
    jobs.push({
      at: date,
      run: () => {
        for (let i = 0; i < count; i++) seek(date, step);
      },
    });
  }
  for (const y of [year - 1, year, year + 1]) {
    const block = [
      ...new Set(bases.filter((b) => b.spring && b.date.startsWith(`${y}-`)).map((b) => b.date)),
    ].sort();
    if (!block.length) continue;
    const last = block[block.length - 1];
    const weekendDays = block.filter(isWeekend).length;
    jobs.push({
      at: last,
      run: () => {
        for (let i = 0; i < weekendDays; i++) seek(last, 1);
      },
    });
  }
  jobs.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const job of jobs) job.run();
  const dates = [...byDate.keys()].sort();
  const prefix = `${year}-`;
  for (const date of dates) {
    if (!date.startsWith(prefix)) continue;
    const shown = (byDate.get(date) ?? []).filter((b) => !b.hidden);
    if (!shown.length) continue;
    const names = [...new Set(shown.map((b) => b.name))];
    out.set(date, { date, name: names.join('、'), off: true, source: 'estimated' });
  }
  for (const date of comps) {
    if (!date.startsWith(prefix) || out.has(date)) continue;
    out.set(date, { date, name: '補假', off: true, source: 'estimated' });
  }
  return new Map([...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/* ---------- 查詢 ---------- */

const cache = new Map<number, Map<string, HolidayDay> | null>();

/** 這一年的資料來源；沒有資料時 null */
export function holidaySource(year: number): HolidaySource | null {
  if (year >= OFFICIAL_FIRST_YEAR && year <= OFFICIAL_LAST_YEAR) return 'official';
  if (year > OFFICIAL_LAST_YEAR && year <= ESTIMATE_LAST_YEAR) return 'estimated';
  return null;
}

/** 一年的特別日子（放假日與補行上班，依日期排序）；沒有資料的年份 null */
export function yearHolidays(year: number): ReadonlyMap<string, HolidayDay> | null {
  if (cache.has(year)) return cache.get(year) ?? null;
  const source = holidaySource(year);
  const map = source === 'official' ? officialYear(year) : source ? estimateHolidays(year) : null;
  cache.set(year, map);
  return map;
}

/** 這一天的特別日子（沒有、或沒有資料時 null） */
export function holidayOf(date: string): HolidayDay | null {
  const year = Number(date.slice(0, 4));
  return yearHolidays(year)?.get(date) ?? null;
}

/**
 * 這一天放不放假：有資料時看公告／推算（週末照常放假，補行上班的週末要上班）；
 * 沒有資料的年份只看週末。
 */
export function isDayOff(date: string): boolean {
  const h = holidayOf(date);
  if (h) return h.off;
  return isWeekend(date);
}

/** 國定假日（放假、而且不是平常的週末；補假、調整放假也算） */
export function isPublicHoliday(date: string): boolean {
  const h = holidayOf(date);
  return Boolean(h?.off);
}
