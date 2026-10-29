/**
 * 劇本時間表的時間寫法（規格 F01～F04、3.1、3.5）：公曆日序、三種寫法的解讀與標準寫法、顯示、期間的結束、吸附、換寫法。
 */
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  afterUnit,
  canonical,
  civilFromDays,
  clockText,
  convertLoses,
  convertTime,
  dateLabel,
  dateParts,
  dateValue,
  dayOneValue,
  daysFromCivil,
  endFromExclusive,
  formatLong,
  MINUTES_PER_DAY,
  parseTime,
  readTime,
  snapTv,
  snapValue,
  weekdayName,
} from '@/tools/scenario-timeline/model/time';

const ok = (mode: Parameters<typeof parseTime>[0], text: string, era = '') => {
  const r = parseTime(mode, text, era);
  if (!r.ok) throw new Error(`${text}: ${r.error}`);
  return r.tv;
};
const err = (mode: Parameters<typeof parseTime>[0], text: string, era = '') => {
  const r = parseTime(mode, text, era);
  if (r.ok) throw new Error(`${text} 應該看不懂`);
  return r.error;
};

describe('公曆日序（不經過 Date、不分時區）', () => {
  it('與 Python datetime 的日序、星期相同', () => {
    const cases: [number, number, number, number, string][] = [
      [1925, 3, 12, -16366, '四'],
      [1970, 1, 1, 0, '四'],
      [2026, 10, 29, 20755, '四'],
      [1, 1, 1, -719162, '一'],
      [1582, 10, 4, -141438, '一'],
      [9999, 12, 31, 2932896, '五'],
    ];
    for (const [y, m, d, days, wd] of cases) {
      expect(daysFromCivil(y, m, d)).toBe(days);
      expect(civilFromDays(days)).toEqual({ y, m, d });
      expect(weekdayName(days)).toBe(wd);
    }
  });
  it('每一天都能來回（含 0～99 年、閏年）', () => {
    for (let z = daysFromCivil(1, 1, 1); z < daysFromCivil(1, 1, 1) + 800; z++) {
      const c = civilFromDays(z);
      expect(daysFromCivil(c.y, c.m, c.d)).toBe(z);
    }
    expect(civilFromDays(daysFromCivil(2000, 2, 29))).toEqual({ y: 2000, m: 2, d: 29 });
    expect(civilFromDays(daysFromCivil(1900, 3, 1) - 1)).toEqual({ y: 1900, m: 2, d: 28 });
  });
  it('加月份落在月初', () => {
    const v = dateValue(1925, 11, 20, 9, 30);
    expect(dateParts(addMonths(v, 3))).toMatchObject({ y: 1926, m: 2, d: 1, hh: 0 });
    expect(dateParts(addMonths(v, -11))).toMatchObject({ y: 1924, m: 12, d: 1 });
  });
});

describe('日期時間的解讀（3.1）', () => {
  it('各種寫法 → 標準寫法', () => {
    expect(canonical('date', ok('date', '1925-03-12 21:00'))).toBe('1925-03-12 21:00');
    expect(canonical('date', ok('date', '1925/3/12 9:05'))).toBe('1925-03-12 09:05');
    expect(canonical('date', ok('date', '1925.3.12'))).toBe('1925-03-12');
    expect(canonical('date', ok('date', '1925年3月12日（四）21：00'))).toBe('1925-03-12 21:00');
    expect(canonical('date', ok('date', '1925年3月12日21:00'))).toBe('1925-03-12 21:00');
    expect(canonical('date', ok('date', '１９２５－０３'))).toBe('1925-03');
    expect(canonical('date', ok('date', '1925年3月'))).toBe('1925-03');
    expect(canonical('date', ok('date', '1925'))).toBe('1925');
    expect(canonical('date', ok('date', '1925年'))).toBe('1925');
    expect(canonical('date', ok('date', '1925-03-12T21:00'))).toBe('1925-03-12 21:00');
    expect(canonical('date', ok('date', '25-3-1'))).toBe('0025-03-01');
  });
  it('寫到哪裡（precision）與位置', () => {
    expect(ok('date', '1925')).toEqual({ v: dateValue(1925), p: 'year' });
    expect(ok('date', '1925-03')).toEqual({ v: dateValue(1925, 3), p: 'month' });
    expect(ok('date', '1925-03-12')).toEqual({ v: dateValue(1925, 3, 12), p: 'day' });
    expect(ok('date', '1925-03-12 21:00').v).toBe(dateValue(1925, 3, 12) + 21 * 60);
  });
  it('看不懂、不存在的日期寫原因', () => {
    expect(err('date', '1925-02-30')).toContain('沒有 30 日');
    expect(err('date', '1925-13')).toContain('月份');
    expect(err('date', '0')).toContain('1～9999');
    expect(err('date', '1925-03-12 24:00')).toContain('HH:MM');
    expect(err('date', '1925-03 21:00')).toContain('只寫到月');
    expect(err('date', '下個月')).toContain('看不懂');
    expect(err('date', '')).toBe('請輸入時間');
  });
  it('顯示（年表、提示）', () => {
    expect(formatLong('date', ok('date', '1925-03-12 21:00'))).toBe('1925年3月12日（四）21:00');
    expect(formatLong('date', ok('date', '1925-03-12'))).toBe('1925年3月12日（四）');
    expect(formatLong('date', ok('date', '1925-03'))).toBe('1925年3月');
    expect(formatLong('date', ok('date', '1925'))).toBe('1925年');
    expect(dateLabel(dateValue(2026, 10, 29))).toBe('2026年10月29日（四）');
  });
});

describe('第 N 天、架空年的解讀', () => {
  it('第 N 天', () => {
    expect(ok('day', '第 3 天 21:00')).toEqual({ v: 2 * MINUTES_PER_DAY + 21 * 60, p: 'minute' });
    expect(canonical('day', ok('day', '3'))).toBe('第 3 天');
    expect(canonical('day', ok('day', '第3天21:00'))).toBe('第 3 天 21:00');
    expect(canonical('day', ok('day', 'D3 8:15'))).toBe('第 3 天 08:15');
    expect(canonical('day', ok('day', 'Day 12'))).toBe('第 12 天');
    expect(canonical('day', ok('day', '第 -1 天 23:30'))).toBe('第 -1 天 23:30');
    expect(canonical('day', ok('day', '第 0 天'))).toBe('第 0 天');
    expect(err('day', '第三天')).toContain('看不懂');
    expect(err('day', '10000')).toContain('-9999～9999');
    expect(formatLong('day', ok('day', '第 3 天 21:00'))).toBe('第 3 天 21:00');
  });
  it('架空年（曆名、年、負數）', () => {
    expect(ok('year', '302')).toEqual({ v: 302, p: 'year' });
    expect(ok('year', '王國曆 302 年', '王國曆').v).toBe(302);
    expect(ok('year', '王國曆302年', '王國曆').v).toBe(302);
    expect(ok('year', '-50').v).toBe(-50);
    expect(canonical('year', ok('year', '302年'))).toBe('302');
    expect(formatLong('year', ok('year', '302'), '王國曆')).toBe('王國曆 302 年');
    expect(formatLong('year', ok('year', '302'), '')).toBe('302 年');
    expect(err('year', '三百年')).toContain('看不懂');
    expect(err('year', '10000000')).toContain('看不懂');
  });
});

describe('期間的結束（含整個單位）', () => {
  it('只寫到日、月、年的結束是下一個單位的開頭', () => {
    expect(afterUnit('date', ok('date', '1925-03-14'))).toBe(dateValue(1925, 3, 15));
    expect(afterUnit('date', ok('date', '1925-12'))).toBe(dateValue(1926, 1, 1));
    expect(afterUnit('date', ok('date', '1925'))).toBe(dateValue(1926));
    expect(afterUnit('date', ok('date', '1925-03-14 06:00'))).toBe(dateValue(1925, 3, 14, 6));
    expect(afterUnit('day', ok('day', '第 2 天'))).toBe(2 * MINUTES_PER_DAY);
    expect(afterUnit('year', ok('year', '310'))).toBe(311);
  });
  it('endFromExclusive 是 afterUnit 的反向', () => {
    for (const [mode, t] of [
      ['date', '1925-03-14'],
      ['date', '1925-02'],
      ['date', '1925'],
      ['date', '1925-03-14 06:30'],
      ['day', '第 4 天'],
      ['day', '第 4 天 06:30'],
      ['year', '310'],
    ] as const) {
      const tv = ok(mode, t);
      expect(canonical(mode, endFromExclusive(mode, afterUnit(mode, tv), tv.p))).toBe(t);
    }
  });
});

describe('吸附（3.5）', () => {
  it('寫到分：依單位四捨五入，寫法不變', () => {
    const v = dateValue(1925, 3, 12, 21, 7);
    expect(canonical('date', snapTv('date', v, 'minute', { kind: 'min', n: 15 }))).toBe(
      '1925-03-12 21:00',
    );
    expect(canonical('date', snapTv('date', v + 1, 'minute', { kind: 'min', n: 5 }))).toBe(
      '1925-03-12 21:10',
    );
  });
  it('只寫到日的事件一次至少 1 日，寫法還是日', () => {
    const v = dateValue(1925, 3, 12, 14, 0);
    const tv = snapTv('date', v, 'day', { kind: 'min', n: 30 });
    expect(tv.p).toBe('day');
    expect(canonical('date', tv)).toBe('1925-03-13');
  });
  it('月、年的吸附照日曆（最近的月初、年初）', () => {
    expect(
      dateParts(snapValue('date', dateValue(1925, 3, 20), { kind: 'month', n: 1 })),
    ).toMatchObject({
      m: 4,
      d: 1,
    });
    expect(
      dateParts(snapValue('date', dateValue(1925, 3, 10), { kind: 'month', n: 1 })),
    ).toMatchObject({
      m: 3,
      d: 1,
    });
    expect(
      canonical('date', snapTv('date', dateValue(1925, 8, 1), 'year', { kind: 'min', n: 1 })),
    ).toBe('1926');
    expect(snapValue('year', 303.4, { kind: 'year', n: 5 })).toBe(305);
  });
});

describe('換寫法（F04）', () => {
  const opts = { era: '', dayOne: dateValue(1925, 3, 12) };
  it('日期時間 ↔ 第 N 天（第 1 天是 1925-03-12）', () => {
    expect(convertTime('date', 'day', '1925-03-12 21:00', opts)).toBe('第 1 天 21:00');
    expect(convertTime('date', 'day', '1925-03-14', opts)).toBe('第 3 天');
    expect(convertTime('date', 'day', '1925-03-05', opts)).toBe('第 -6 天');
    expect(convertTime('date', 'day', '1925-03', opts)).toBe('第 -10 天');
    expect(convertTime('day', 'date', '第 2 天 08:00', opts)).toBe('1925-03-13 08:00');
    expect(convertTime('day', 'date', '第 1 天', opts)).toBe('1925-03-12');
  });
  it('日期時間 ↔ 架空年；換不過去時 null', () => {
    expect(convertTime('date', 'year', '1925-03-12 21:00', opts)).toBe('1925');
    expect(convertTime('year', 'date', '302', opts)).toBe('0302');
    expect(convertTime('year', 'date', '-50', opts)).toBeNull();
    expect(convertTime('year', 'day', '1925', opts)).toBe('第 -69 天');
    expect(convertTime('date', 'day', '1700-01-01', opts)).toBeNull();
  });
  it('期間的結束包含整個單位：只到月／年的結束換成那個單位的最後一天', () => {
    const end = { ...opts, role: 'end' as const };
    // 1925-03 的結束＝3/31 那天結束（第 1 天是 3/12 → 3/31 是第 20 天）
    expect(convertTime('date', 'day', '1925-03', end)).toBe('第 20 天');
    expect(convertTime('date', 'day', '1925', end)).toBe('第 295 天');
    expect(convertTime('date', 'day', '1925-03-14', end)).toBe('第 3 天');
    expect(convertTime('date', 'day', '1925-03-14 08:00', end)).toBe('第 3 天 08:00');
    expect(convertTime('year', 'day', '1925', end)).toBe('第 295 天');
    // 開始照舊是第一天
    expect(convertTime('date', 'day', '1925-03', opts)).toBe('第 -10 天');
    // 1925-03-05～1925-03 換完不會倒過來
    const s = convertTime('date', 'day', '1925-03-05', opts);
    const e = convertTime('date', 'day', '1925-03', end);
    expect([s, e]).toEqual(['第 -6 天', '第 20 天']);
  });
  it('會不會失去精度', () => {
    expect(convertLoses('date', 'year', '1925-03-12')).toBe(true);
    expect(convertLoses('date', 'year', '1925')).toBe(false);
    expect(convertLoses('date', 'day', '1925-03')).toBe(true);
    expect(convertLoses('date', 'day', '1925')).toBe(true);
    expect(convertLoses('date', 'day', '1925-03-12 21:00')).toBe(false);
    expect(convertLoses('day', 'date', '第 3 天')).toBe(false);
    expect(convertLoses('day', 'year', '第 3 天')).toBe(true);
    expect(convertLoses('year', 'date', '302')).toBe(false);
    expect(convertLoses('year', 'day', '302')).toBe(true);
    expect(convertLoses('date', 'date', '1925-03')).toBe(false);
  });
  it('「第 1 天」的日期', () => {
    expect(dayOneValue('1925-03-12')).toBe(dateValue(1925, 3, 12));
    expect(dayOneValue('1925-03-12 21:00')).toBe(dateValue(1925, 3, 12));
    expect(dayOneValue('不是日期')).toBeNull();
  });
  it('讀回存檔的字串', () => {
    expect(readTime('date', '')).toBeNull();
    expect(readTime('date', 'xx')).toBeNull();
    expect(clockText(-30)).toBe('23:30');
  });
});
