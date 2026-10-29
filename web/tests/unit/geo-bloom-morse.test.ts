/**
 * 幾何花紋產生器：摩斯環（規格 3.11、F62～F66）。
 * 文字 → 摩斯電碼（國際摩斯電碼；中文等沒有電碼的字略過；全形英數當成半形；一個能轉的字都沒有時隨機）、
 * 在弧上排符號的長度與間隔、自訂文字的重複與單字間隔、隨機時每個字母 1～5 個符號。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline/random';
import {
  layoutMorse,
  MORSE_CODE,
  type MorseLayout,
  morseNotation,
  morseTokens,
  textToMorse,
  unsupportedChars,
} from '@/tools/geo-bloom/morse';

const LAYOUT: MorseLayout = { dash: 3, gap: 1, letterGap: 3, wordGap: 7, pDash: 0.45, pWord: 0.18 };

describe('文字 → 摩斯電碼', () => {
  it('國際摩斯電碼：字母、數字、標點', () => {
    expect(MORSE_CODE.S).toBe('...');
    expect(MORSE_CODE.O).toBe('---');
    expect(MORSE_CODE['0']).toBe('-----');
    expect(MORSE_CODE['?']).toBe('..--..');
    expect(Object.keys(MORSE_CODE)).toHaveLength(26 + 10 + 7);
  });

  it('字母之後是字母間隔、空白是單字間隔，最後的字母間隔拿掉；大小寫不分', () => {
    expect(textToMorse('SOS')).toEqual(['.', '.', '.', 'l', '-', '-', '-', 'l', '.', '.', '.']);
    expect(textToMorse('e t')).toEqual(['.', 'w', '-']);
    expect(textToMorse('E  T')).toEqual(['.', 'w', '-']);
    /* 結尾的空白留下一個單字間隔（重複排的時候接在後面），開頭的空白不算 */
    expect(textToMorse(' E ')).toEqual(['.', 'w']);
    expect(morseNotation(textToMorse('SOS HI'))).toBe('... --- ... / .... ..');
  });

  it('中文、日文等沒有摩斯電碼的字略過；全形空白是單字間隔；全形英數當成半形', () => {
    expect(textToMorse('SOS 救命')).toEqual(textToMorse('SOS '));
    expect(textToMorse('E　T')).toEqual(['.', 'w', '-']);
    expect(textToMorse('ＳＯＳ')).toEqual(textToMorse('SOS'));
    expect(unsupportedChars('SOS 救命！救命')).toEqual(['救', '命']);
    expect(unsupportedChars('ＳＯＳ#')).toEqual(['#']);
  });

  it('沒有填、或一個能轉的字都沒有：隨機（null）', () => {
    expect(morseTokens('')).toBeNull();
    expect(morseTokens('   ')).toBeNull();
    expect(morseTokens('你好')).toBeNull();
    expect(morseTokens('你 好')).toBeNull();
    expect(morseTokens('A')).toEqual(['.', '-']);
  });
});

describe('在弧上排符號', () => {
  const lengths = (r: number, segs: { a0: number; a1: number }[]) =>
    segs.map((s) => Math.round((s.a1 - s.a0) * r * 1e6) / 1e6);

  it('短點＝1 個單位、長點＝dash 個單位；符號之間 gap、字母之間 letterGap、單字之間 wordGap', () => {
    const r = 1000;
    const segs = layoutMorse(r, 0, Math.PI * 2, 5, LAYOUT, createRandom(1), textToMorse('SO S'));
    const L = (n: number) => Math.round(n * 5 * 1e6) / 1e6;
    /* 從符號列的隨機位置開始；找到「...」「---」的接縫量間隔 */
    const len = lengths(r, segs);
    expect(new Set(len)).toEqual(new Set([L(1), L(3)]));
    for (let i = 1; i < segs.length; i++) {
      const gap = Math.round((segs[i].a0 - segs[i - 1].a1) * r * 1e6) / 1e6;
      expect([L(1), L(3), L(7)]).toContain(gap);
      if (segs[i].letter === segs[i - 1].letter) expect(gap).toBe(L(1));
      else expect([L(3), L(7)]).toContain(gap);
    }
    /* 都在弧上，最後留一個符號內間隔 */
    expect(segs[0].a0).toBeGreaterThanOrEqual(0);
    expect(segs[segs.length - 1].a1 * r).toBeLessThanOrEqual(Math.PI * 2 * r - 5 + 1e-6);
  });

  it('自訂文字排完一輪接單字間隔再從頭開始：同一個字母的符號 letter 相同', () => {
    const segs = layoutMorse(100, 0, Math.PI * 2, 2, LAYOUT, createRandom(7), textToMorse('E'));
    /* 「E」只有一個短點：每個符號各是一個字母，之間都是單字間隔 */
    expect(segs.length).toBeGreaterThan(5);
    expect(segs.every((s) => s.dot && !s.dash)).toBe(true);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].letter).toBe(segs[i - 1].letter + 1);
      expect(Math.round((segs[i].a0 - segs[i - 1].a1) * 100 * 1e6) / 1e6).toBe(14);
    }
  });

  it('隨機：每個字母 1～5 個符號；長點比例 100% 時全是長點', () => {
    const segs = layoutMorse(2000, 0, Math.PI * 2, 4, LAYOUT, createRandom(3), null);
    const perLetter = new Map<number, number>();
    for (const s of segs) perLetter.set(s.letter, (perLetter.get(s.letter) ?? 0) + 1);
    for (const [letter, n] of perLetter) {
      /* 弧的最後一個字母可能被截斷 */
      if (letter === segs[segs.length - 1].letter) continue;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
    }
    const dashes = layoutMorse(500, 0, Math.PI, 4, { ...LAYOUT, pDash: 1 }, createRandom(3), null);
    expect(dashes.length).toBeGreaterThan(3);
    expect(dashes.every((s) => s.dash)).toBe(true);
  });

  it('弧長不到兩個短點：什麼都不排；從 a0 開始、不超過弧的結尾', () => {
    expect(layoutMorse(1, 0, 1, 1, LAYOUT, createRandom(1), null)).toEqual([]);
    const segs = layoutMorse(300, 1, Math.PI / 2, 3, LAYOUT, createRandom(9), null);
    expect(segs[0].a0).toBeGreaterThanOrEqual(1);
    expect(segs[segs.length - 1].a1).toBeLessThanOrEqual(1 + Math.PI / 2);
  });

  it('同樣的亂數，同樣的結果', () => {
    const a = layoutMorse(400, 0.3, Math.PI * 2, 6, LAYOUT, createRandom(42), null);
    const b = layoutMorse(400, 0.3, Math.PI * 2, 6, LAYOUT, createRandom(42), null);
    expect(a).toEqual(b);
  });
});
