/**
 * core/typeset 的斷行：行尾掛標點的上限 `maxHang`（lock-screen 對等驗證 F06 後新增）。
 * 不給時和以前相同（行首禁則的字全部掛在上一行行尾）；給了時掛在行尾的寬度最多 maxHang，
 * 再多就把前面的字一起推到下一行（追い出し），整行都是禁則字推不動時才硬斷。
 */
import { describe, expect, it } from 'vitest';
import { breakText, isWide, NO_LINE_START, wrapChars } from '@/core/typeset';

/** 全形 1、半形 0.5 */
const unit = (ch: string) => (isWide(ch) ? 1 : 0.5);
const width = (line: readonly string[]) => line.reduce((s, c) => s + unit(c), 0);
const wrap = (text: string, limit: number, maxHang?: number) =>
  breakText(text, { limit, unit, segment: 'grapheme', maxHang }).map((l) => l.join(''));
const widths = (text: string, limit: number, maxHang?: number) =>
  breakText(text, { limit, unit, segment: 'grapheme', maxHang }).map(width);

describe('行尾掛標點的上限（maxHang）', () => {
  it('不給時和以前相同：連續的標點全部掛在行尾', () => {
    expect(wrap('一一一一一……」', 5)).toEqual(['一一一一一……」']);
    expect(wrapChars(Array.from('一一一一一……」'), 5, unit).map((l) => l.join(''))).toEqual([
      '一一一一一……」',
    ]);
  });

  it('連續多個標點：最多掛 1 個字寬，多的連同前一個字推到下一行', () => {
    expect(wrap('一一一一一……」', 5, 1)).toEqual(['一一一一', '一……」']);
    expect(wrap('一一一一一。」', 5, 1)).toEqual(['一一一一', '一。」']);
    for (const w of widths('一一一一一……」一一一一一——————', 5, 1))
      expect(w).toBeLessThanOrEqual(6);
  });

  it('整行都是標點：推不動時硬斷（不會無窮迴圈），每行不超過上限', () => {
    expect(wrap('，，，，，，，，', 5, 1)).toEqual(['，，，，，，', '，，']);
    const many = `你還在嗎${'……'.repeat(14)}`;
    const lines = wrap(many, 5, 1);
    expect(lines.join('')).toBe(many);
    for (const w of widths(many, 5, 1)) expect(w).toBeLessThanOrEqual(6);
  });

  it('標點加英文：英文單字不拆開；推不動的長單字改成硬斷', () => {
    expect(wrap('abcdefgh……', 5, 1)).toEqual(['abcdefgh……']);
    expect(wrap('abcdefgh………', 5, 1)).toEqual(['abcdefgh……', '…']);
    expect(wrap('一一一一ab，，', 5, 1)).toEqual(['一一一一', 'ab，，']);
    for (const w of widths('一一一一ab，，，，，，', 5, 1)) expect(w).toBeLessThanOrEqual(6);
  });

  it('emoji 不拆開，跟著標點一起推到下一行', () => {
    expect(wrap('一一一一😀……', 5, 1)).toEqual(['一一一一', '😀……']);
    expect(wrap('一一一👨‍👩‍👧😀……', 5, 1)).toEqual(['一一一👨‍👩‍👧', '😀……']);
  });

  it('推下去的行開頭不是行首禁則的字（推得動時）', () => {
    for (const text of ['一一一一一……」', '一一一一😀……', '一一一一ab，，']) {
      const lines = wrap(text, 5, 1);
      for (const l of lines.slice(1)) expect(NO_LINE_START.has(Array.from(l)[0])).toBe(false);
    }
  });
});
