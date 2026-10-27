/**
 * core/holidays：臺灣的國定假日、補假、補行上班。
 * - 2017～2027（至少 2025～2027）逐日和人事行政總處的辦公日曆表比對（tests/fixtures/tw-calendar-official.json，
 *   從公告的開放資料直接整理：每一天放不放假、有說明的日子的說明原文）。
 * - 推算的規則：2026、2027 年用推算的結果和公告逐日一致（這兩年沒有調整放假與補行上班）；2028 年、跨年補假、
 *   兒童節與清明同一天的各種星期。
 * - 農曆節日表：2017～2027 年的春節、端午、中秋、清明和公告一致；每一年的日期都在合理的範圍。
 */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayNumber,
  ESTIMATE_LAST_YEAR,
  estimateHolidays,
  holidayOf,
  holidaySource,
  isDayOff,
  isPublicHoliday,
  LUNAR_FIRST_YEAR,
  LUNAR_LAST_YEAR,
  lunarFestivals,
  weekdayOf,
  yearHolidays,
} from '@/core/holidays';
import officialJson from '../fixtures/tw-calendar-official.json';

interface Fixture {
  years: Record<string, { off: string; desc: Record<string, string> }>;
}
const fixture = officialJson as Fixture;

const daysOfYear = (year: number): string[] => {
  const out: string[] = [];
  for (let d = `${year}-01-01`; d.startsWith(`${year}-`); d = addDays(d, 1)) out.push(d);
  return out;
};

describe('日期', () => {
  it('日數、星期、加減', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(weekdayOf('2026-10-27')).toBe(2);
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(Number.isNaN(dayNumber('2026/10/27'))).toBe(true);
  });
});

describe('公告的辦公日曆表（逐日比對）', () => {
  for (const [y, data] of Object.entries(fixture.years)) {
    const year = Number(y);
    it(`${year}`, () => {
      expect(holidaySource(year)).toBe('official');
      const days = daysOfYear(year);
      expect(days.length).toBe(data.off.length);
      days.forEach((date, i) => {
        const official = data.off[i] === '1';
        expect(isDayOff(date), `${date} 放假`).toBe(official);
        const desc = data.desc[date.slice(5).replace('-', '')] ?? '';
        const h = holidayOf(date);
        expect(h?.name ?? '', `${date} 名稱`).toBe(desc);
        if (h) {
          expect(h.source).toBe('official');
          expect(h.off).toBe(official);
        }
      });
    });
  }

  it('至少涵蓋 2025～2027', () => {
    for (const y of [2025, 2026, 2027]) expect(Object.keys(fixture.years)).toContain(String(y));
  });

  it('幾個代表性的日子', () => {
    expect(holidayOf('2026-02-15')).toMatchObject({ name: '小年夜', off: true });
    expect(holidayOf('2026-02-20')).toMatchObject({ name: '補假', off: true });
    expect(holidayOf('2025-02-08')).toMatchObject({ name: '補行上班', off: false });
    expect(isDayOff('2025-02-08')).toBe(false);
    expect(isPublicHoliday('2026-10-31')).toBe(false);
    expect(isDayOff('2026-10-31')).toBe(true);
    expect(holidayOf('2027-12-31')).toMatchObject({ name: '補假' });
  });
});

describe('推算', () => {
  const official = (year: number) =>
    [...(yearHolidays(year)?.values() ?? [])].map((h) => `${h.date} ${h.name}`);
  const estimated = (year: number) =>
    [...estimateHolidays(year).values()].map((h) => `${h.date} ${h.name}`);

  it('2026、2027 年：推算和公告逐日一致', () => {
    expect(estimated(2026)).toEqual(official(2026));
    expect(estimated(2027)).toEqual(official(2027));
  });

  it('2028 年以後標示推算', () => {
    expect(holidaySource(2028)).toBe('estimated');
    expect(holidaySource(ESTIMATE_LAST_YEAR)).toBe('estimated');
    expect(holidaySource(ESTIMATE_LAST_YEAR + 1)).toBeNull();
    expect(holidaySource(2016)).toBeNull();
    expect(yearHolidays(2016)).toBeNull();
    expect(holidayOf('2028-10-10')?.source).toBe('estimated');
  });

  it('2028 年（手算）', () => {
    expect(estimated(2028)).toEqual([
      '2028-01-01 開國紀念日',
      '2028-01-24 小年夜',
      '2028-01-25 農曆除夕',
      '2028-01-26 春節',
      '2028-01-27 春節',
      '2028-01-28 春節',
      '2028-02-28 和平紀念日',
      '2028-04-03 補假',
      '2028-04-04 兒童節及清明節',
      '2028-05-01 勞動節',
      '2028-05-28 端午節',
      '2028-05-29 補假',
      '2028-09-28 孔子誕辰紀念日/教師節',
      '2028-10-03 中秋節',
      '2028-10-10 國慶日',
      '2028-10-25 臺灣光復暨金門古寧頭大捷紀念日',
      '2028-12-25 行憲紀念日',
    ]);
    /* 2028-01-01 是星期六：補假在 2027-12-31（公告的 2027 年已有），2028 年不重複 */
    expect(weekdayOf('2028-01-01')).toBe(6);
    expect(holidayOf('2028-01-01')).toMatchObject({ name: '開國紀念日' });
  });

  it('跨年的補假：1 月 1 日是星期六時補在前一年的 12 月 31 日', () => {
    expect(weekdayOf('2033-01-01')).toBe(6);
    expect(estimateHolidays(2032).get('2032-12-31')).toMatchObject({ name: '補假' });
    expect(estimateHolidays(2033).has('2032-12-31')).toBe(false);
  });

  it('春節連假遇到週末：依序補在連假之後', () => {
    /* 2029：除夕 2/12（一）、初一～初三 2/13～2/15；小年夜 2/11（日）→ 補在 2/16（五） */
    const h = estimateHolidays(2029);
    expect(h.get('2029-02-11')?.name).toBe('小年夜');
    expect(h.get('2029-02-16')?.name).toBe('補假');
  });

  it('兒童節與清明同一天：前一天放假（星期四時後一天），落在週末再補', () => {
    /* 找 4 月 4 日也是清明的年份，依星期驗證 */
    const seen = new Set<number>();
    for (let y = 2028; y <= ESTIMATE_LAST_YEAR; y++) {
      const f = lunarFestivals(y);
      if (f?.qingming !== `${y}-04-04`) continue;
      const w = weekdayOf(`${y}-04-04`);
      seen.add(w);
      const h = estimateHolidays(y);
      expect(h.get(`${y}-04-04`)?.name).toBe('兒童節及清明節');
      if (w === 4) expect(h.get(`${y}-04-05`)?.name, `${y}`).toBe('補假');
      else if (w >= 2 && w <= 5) expect(h.get(`${y}-04-03`)?.name, `${y}`).toBe('補假');
      if (w === 6) {
        /* 4/3（五）移過去的兒童節、4/4（六）補前一個上班日 → 4/2（四） */
        expect(h.get(`${y}-04-03`)?.name).toBe('補假');
        expect(h.get(`${y}-04-02`)?.name).toBe('補假');
      }
      if (w === 0) {
        /* 移過去的 4/3 是星期六（不顯示）→ 補 4/2（五）；4/4（日）→ 補 4/5（一） */
        expect(h.has(`${y}-04-03`)).toBe(false);
        expect(h.get(`${y}-04-02`)?.name).toBe('補假');
        expect(h.get(`${y}-04-05`)?.name).toBe('補假');
      }
      if (w === 1) {
        /* 移過去的 4/3 是星期日（不顯示）→ 補下一個上班日 4/5（二） */
        expect(h.has(`${y}-04-03`)).toBe(false);
        expect(h.get(`${y}-04-05`)?.name).toBe('補假');
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('同一天兩個節日只放一天、名稱合併', () => {
    /* 2042：中秋 9/28 和孔子誕辰紀念日同一天 */
    expect(lunarFestivals(2042)?.midAutumn).toBe('2042-09-28');
    expect(estimateHolidays(2042).get('2042-09-28')?.name).toBe('中秋節、孔子誕辰紀念日/教師節');
  });

  it('推算的年份：週末放假、補假放假、平日上班', () => {
    expect(isDayOff('2028-05-29')).toBe(true);
    expect(isDayOff('2028-05-30')).toBe(false);
    expect(isDayOff('2028-05-27')).toBe(true);
    /* 沒有資料的年份只看週末 */
    expect(isDayOff('2010-10-11')).toBe(false);
    expect(isDayOff('2010-10-10')).toBe(true);
  });

  it('每一年的推算都在那一年、補假都是平日', () => {
    for (let y = 2028; y <= ESTIMATE_LAST_YEAR; y++) {
      for (const h of estimateHolidays(y).values()) {
        expect(h.date.startsWith(`${y}-`)).toBe(true);
        if (h.name === '補假') expect([0, 6]).not.toContain(weekdayOf(h.date));
      }
    }
  });
});

describe('農曆節日表', () => {
  it('2017～2027 年和公告一致', () => {
    for (let y = 2017; y <= 2027; y++) {
      const f = lunarFestivals(y);
      expect(f).not.toBeNull();
      if (!f) continue;
      const desc = fixture.years[String(y)].desc;
      const md = (d: string) => d.slice(5).replace('-', '');
      expect(desc[md(f.newYear)], `${y} 春節`).toBe('春節');
      expect(desc[md(addDays(f.newYear, -1))], `${y} 除夕`).toBe('農曆除夕');
      expect(desc[md(f.dragonBoat)], `${y} 端午`).toBe('端午節');
      expect(desc[md(f.midAutumn)], `${y} 中秋`).toBe('中秋節');
      expect(desc[md(f.qingming)], `${y} 清明`).toMatch(/民族掃墓節|清明節/);
    }
  });

  it('每一年的日期都在合理的範圍、春節之間相隔 354～385 天', () => {
    let prev: number | null = null;
    for (let y = LUNAR_FIRST_YEAR; y <= LUNAR_LAST_YEAR; y++) {
      const f = lunarFestivals(y);
      expect(f).not.toBeNull();
      if (!f) continue;
      expect(f.newYear >= `${y}-01-21` && f.newYear <= `${y}-02-20`, `${y} 春節`).toBe(true);
      expect(f.dragonBoat >= `${y}-05-27` && f.dragonBoat <= `${y}-06-25`).toBe(true);
      expect(f.midAutumn >= `${y}-09-07` && f.midAutumn <= `${y}-10-08`).toBe(true);
      expect([`${y}-04-04`, `${y}-04-05`]).toContain(f.qingming);
      /* 端午是初一後 4 個或 5 個月（有閏月）、中秋在端午後約 3 個月 */
      const toDragon = dayNumber(f.dragonBoat) - dayNumber(f.newYear);
      expect(toDragon >= 4 + 29 * 4 - 1 && toDragon <= 4 + 30 * 5).toBe(true);
      const n = dayNumber(f.newYear);
      if (prev !== null) expect(n - prev >= 353 && n - prev <= 385).toBe(true);
      prev = n;
    }
    expect(lunarFestivals(2016)).toBeNull();
    expect(lunarFestivals(2101)).toBeNull();
  });
});
