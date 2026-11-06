/**
 * 奇幻隨機產生器的引擎（照 mshea/lazy_gm_tools 的 generator.js 的語法改寫）：讀表、權重、多選一、數字、重複抽、欄、
 * 同一個種子同一個結果、檢查自訂的表。
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/names';
import {
  capitalize,
  checkTables,
  expand,
  formatNumber,
  parseEntry,
  parseSlots,
  parseTables,
  partsText,
  pickEntry,
  referencedTables,
  rollTemplate,
  splitTop,
  tablesFrom,
} from '@/tools/fantasy-gen/engine';

/** 依序回傳給定的值的亂數（測抽到哪一項） */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('讀表', () => {
  it('不縮排的是表名（結尾的冒號去掉），縮排的是項目；空行與 # 註解略過', () => {
    const { tables, order, issues } = parseTables('# 註解\n顏色:\n  紅\n\n  藍 ^3\n動物：\n\t貓\n');
    expect(order).toEqual(['顏色', '動物']);
    expect(tables.顏色).toEqual([
      { text: '紅', weight: 1 },
      { text: '藍', weight: 3 },
    ]);
    expect(tables.動物).toEqual([{ text: '貓', weight: 1 }]);
    expect(issues).toEqual([]);
  });

  it('同名的表後面的取代前面的（原作），另外提醒；表名前的縮排行也提醒', () => {
    const { tables, issues } = parseTables('  孤兒\na\n  1\na\n  2\n');
    expect(tables.a).toEqual([{ text: '2', weight: 1 }]);
    expect(issues.map((i) => i.line)).toEqual([1, 4]);
  });

  it('權重：結尾的 ^N；^0 不會被抽到；只有 ^N 的一行當作字', () => {
    expect(parseEntry('human ^10')).toEqual({ text: 'human', weight: 10 });
    expect(parseEntry('^3')).toEqual({ text: '^3', weight: 1 });
    const t = [
      { text: 'a', weight: 0 },
      { text: 'b', weight: 1 },
    ];
    for (const r of [0, 0.5, 0.999]) expect(pickEntry(t, () => r)?.text).toBe('b');
  });

  it('依權重抽：human ^10 與 elf ^5 的機會是 2:1', () => {
    const t = tablesFrom({ s: ['human ^10', 'elf ^5'] }).s;
    expect(pickEntry(t, () => 0.66)?.text).toBe('human');
    expect(pickEntry(t, () => 0.67)?.text).toBe('elf');
  });
});

describe('展開', () => {
  const tables = tablesFrom({
    coin: ['copper', 'silver'],
    swords: ['longsword'],
    blunt: ['mace'],
    nested: ['{coin} coins'],
    loop: ['{loop}'],
  });

  it('{表名} 抽一項，項目裡的 {…} 繼續展開；找不到的表是空字串並記下來', () => {
    const issues = new Set<string>();
    expect(expand('a {nested}!', { tables, rng: () => 0, issues })).toBe('a copper coins!');
    expect(expand('[{nope}]', { tables, rng: () => 0, issues })).toBe('[]');
    expect([...issues]).toEqual(['找不到表「nope」。']);
  });

  it('多選一：引號的字、表名、一般的字；^N 是那個選項的權重', () => {
    expect(expand('{"a"|"b"}', { tables, rng: () => 0.6 })).toBe('b');
    /* 最後一個 ^4：a 1、b 4 → 0.2 以上都是 b */
    expect(expand('{"a"|"b" ^4}', { tables, rng: () => 0.25 })).toBe('b');
    expect(expand('{"a"|"b" ^4}', { tables, rng: () => 0.15 })).toBe('a');
    expect(expand('{coin|plain}', { tables, rng: seq(0, 0) })).toBe('copper');
    expect(expand('{coin|plain}', { tables, rng: () => 0.9 })).toBe('plain');
  });

  it('{{表甲}|{表乙}}：兩個表的機會一樣', () => {
    expect(expand('{{swords}|{blunt}}', { tables, rng: () => 0.1 })).toBe('longsword');
    expect(expand('{{swords}|{blunt}}', { tables, rng: () => 0.9 })).toBe('mace');
  });

  it('[[a-b]] 是整數（含兩端），千分位加逗號', () => {
    expect(expand('[[100-500]]', { tables, rng: () => 0 })).toBe('100');
    expect(expand('[[100-500]]', { tables, rng: () => 0.9999 })).toBe('500');
    expect(expand('[[45000-145000]] GP', { tables, rng: () => 0.5 })).toBe('95,000 GP');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('{表名*N} 抽 N 次、一項一行；N 可以是 [[a-b]]；0 是空字串', () => {
    expect(expand('{coin*3}', { tables, rng: seq(0, 0.9, 0) })).toBe('copper\nsilver\ncopper');
    expect(expand('{coin*[[0-0]]}', { tables, rng: () => 0 })).toBe('');
    expect(expand('{coin*[[2-2]]}', { tables, rng: () => 0 })).toBe('copper\ncopper');
  });

  it('\\n 與 <br> 是換行', () => {
    expect(expand('a\\nb<br>c<br/>d', { tables, rng: () => 0 })).toBe('a\nb\nc\nd');
  });

  it('互相參照的表會停下來（記一筆）', () => {
    const issues = new Set<string>();
    expect(expand('{loop}', { tables, rng: () => 0, issues })).toBe('');
    expect(issues.size).toBe(1);
  });

  it('表函式：每次抽都呼叫，可以參考已經抽好的欄', () => {
    const fns = {
      who: (ctx: { values?: Record<string, string> }) => `${ctx.values?.種族 ?? '?'}的名字`,
    };
    const parts = rollTemplate(
      '{@名字:who}，{@種族:{"精靈"}}',
      { tables, rng: () => 0, fns },
      { order: ['種族'] },
    );
    expect(partsText(parts)).toBe('精靈的名字，精靈');
  });

  it('第一個英文字母大寫（原作），中文不變；空行去掉', () => {
    expect(capitalize('oak ford')).toBe('Oak ford');
    expect(capitalize('橡樹')).toBe('橡樹');
    expect(partsText([{ t: ' a\n\n' }, { t: '  b ' }])).toBe('A\nb');
  });

  it('切開多選一：不切到大括號、[[ ]] 與引號裡的 |', () => {
    expect(splitTop('a|{b|c}|"d|e"|[[1-2]]')).toEqual(['a', '{b|c}', '"d|e"', '[[1-2]]']);
  });
});

describe('欄', () => {
  it('{@欄名:內容}、{@表名} 是欄；其他最上層的 {…} 與 [[…]] 是沒有名字的欄；同名的第二個加 #2', () => {
    const parts = parseSlots('{@名字:{a}}和{@a}、{b}與[[1-3]]，{@名字:x}');
    expect(parts.map((p) => (p.slot ? `${p.slot.key}=${p.slot.template}` : p.text))).toEqual([
      '名字={a}',
      '和',
      'a=a',
      '、',
      '#1={b}',
      '與',
      '#2=[[1-3]]',
      '，',
      '名字#2=x',
    ]);
  });

  it('範本最上層的 \\n 與 <br> 也換行（和展開時相同）', () => {
    const tables = tablesFrom({ a: ['x'] });
    const parts = rollTemplate('甲\\n乙<br>丙<BR />{@欄:a}\\n{a}', { tables, rng: () => 0 });
    expect(partsText(parts)).toBe('甲\n乙\n丙\nx\nx');
  });

  it('鎖定的欄（keep）不重抽；其他欄照舊抽', () => {
    const tables = tablesFrom({ a: ['1', '2'], b: ['x', 'y'] });
    const rolled = rollTemplate('{@A:a}{@B:b}', { tables, rng: () => 0.9 }, { keep: { A: '鎖' } });
    expect(rolled).toEqual([
      { t: '鎖', k: 'A', l: 'A' },
      { t: 'y', k: 'B', l: 'B' },
    ]);
  });

  it('同一個種子同一個結果', () => {
    const tables = tablesFrom({ a: ['1', '2', '3', '4', '5'], b: ['x ^2', 'y', 'z'] });
    const roll = (seed: string) => {
      const rng = seededRandom(seed);
      return Array.from({ length: 20 }, () =>
        partsText(rollTemplate('{@A:a}{@B:b}[[1-100]]', { tables, rng })),
      );
    };
    expect(roll('abc')).toEqual(roll('abc'));
    expect(roll('abc')).not.toEqual(roll('abd'));
  });
});

describe('檢查自訂的表', () => {
  it('找不到的表、空的表、停不下來的表', () => {
    const { tables } = parseTables(
      'a\n  {b}\n  {missing}\nb\n  {a}\n  end\nloop1\n  {loop2}\nloop2\n  {loop1}\nempty\nzero\n  x ^0\n',
    );
    const check = checkTables(tables, ['{a}{其他}', '{"字"|a}']);
    expect(check.missing).toEqual([
      { name: '其他', from: '範本' },
      { name: 'missing', from: 'a' },
    ]);
    expect(check.empty.sort()).toEqual(['empty', 'zero']);
    expect(check.cycles.sort()).toEqual(['loop1', 'loop2']);
  });

  it('參照：多選一的一般字不算（找得到才算表），引號裡的 {…} 照算', () => {
    expect(referencedTables('{a|"b {c}"|d {e}} {f*[[1-2]]} {@欄:{g}}')).toEqual([
      'c',
      'e',
      'f',
      'g',
    ]);
  });
});
