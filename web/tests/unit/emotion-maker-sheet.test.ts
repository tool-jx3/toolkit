/**
 * 表情產生器的合輯圖（規格 3.3 量測表、F32～F37 依主控裁定限制在欄位標示的範圍）。
 * 文字寬度用假的量測：每個字＝字級寬（全形字），與繁中字型的實際寬度相同。
 */
import { describe, expect, it } from 'vitest';
import { layoutSheet } from '@/core/sheet';
import {
  DEFAULT_SHEET,
  type Expression,
  resolveSheet,
  type SheetRaw,
  sheetCaptions,
  sheetNumber,
} from '@/tools/emotion-maker/logic';
import { PRESETS } from '@/tools/emotion-maker/presets';

const e = (label: string, showText = true): Expression => ({
  id: label,
  label,
  showText,
  checked: true,
  eyes: 'eyes-normal',
  brows: null,
  mouth: null,
  decorations: [],
});

/** 預設 20 組＋2 個不顯示文字的 */
const TWENTY_TWO = [...PRESETS.map((p) => e(p.label)), e('不顯示一', false), e('不顯示二', false)];

function layout(list: readonly Expression[], raw: Partial<SheetRaw> = {}) {
  const o = resolveSheet({ ...DEFAULT_SHEET, ...raw });
  return layoutSheet({
    count: list.length,
    columns: o.columns,
    cellSize: o.cellSize,
    gap: o.gap,
    fontSize: o.fontSize,
    captions: sheetCaptions(list, o.showText),
    measure: (s) => Array.from(s).length * o.fontSize,
  });
}

describe('數字欄（主控裁定：實際接受＝欄位標示的範圍）', () => {
  it('欄數 0～20；空白、非數字、負數＝自動（0）', () => {
    expect(sheetNumber('columns', '')).toBe(0);
    expect(sheetNumber('columns', 'abc')).toBe(0);
    expect(sheetNumber('columns', '-3')).toBe(0);
    expect(sheetNumber('columns', '5')).toBe(5);
    expect(sheetNumber('columns', '50')).toBe(20);
  });

  it('格子大小 80～800；空白或非數字＝300', () => {
    expect(sheetNumber('cellSize', '5')).toBe(80);
    expect(sheetNumber('cellSize', '5000')).toBe(800);
    expect(sheetNumber('cellSize', '')).toBe(300);
    expect(sheetNumber('cellSize', '   ')).toBe(300);
    expect(sheetNumber('cellSize', 'x')).toBe(300);
    expect(sheetNumber('cellSize', '123.6')).toBe(124);
  });

  it('間距 0～120、文字大小 8～120', () => {
    expect(sheetNumber('gap', '200')).toBe(120);
    expect(sheetNumber('gap', '-1')).toBe(0);
    expect(sheetNumber('gap', '')).toBe(14);
    expect(sheetNumber('fontSize', '6')).toBe(8);
    expect(sheetNumber('fontSize', '160')).toBe(120);
    expect(sheetNumber('fontSize', '')).toBe(26);
  });

  it('預設值與背景', () => {
    const o = resolveSheet(DEFAULT_SHEET);
    expect(o).toEqual({
      columns: 0,
      cellSize: 300,
      gap: 14,
      background: null,
      showText: true,
      fontSize: 26,
      textColor: '#222222',
    });
    expect(resolveSheet({ ...DEFAULT_SHEET, background: 'white' }).background).toBe('#ffffff');
    expect(
      resolveSheet({ ...DEFAULT_SHEET, background: 'custom', customColor: '#ff0000' }).background,
    ).toBe('#ff0000');
  });
});

describe('每格的文字：全域開啟、該筆開啟、標籤不是空的才畫', () => {
  it('sheetCaptions', () => {
    expect(sheetCaptions([e('a'), e('b', false), e('')], true)).toEqual(['a', '', '']);
    expect(sheetCaptions([e('a')], false)).toEqual(['']);
  });
});

describe('3.3 量測表', () => {
  it('22 個、預設選項 → 5 × 5、1584 × 1879（文字區 59）', () => {
    const l = layout(TWENTY_TWO);
    expect([l.columns, l.rows, l.width, l.height, l.captionHeight]).toEqual([5, 5, 1584, 1879, 59]);
    expect(Math.max(...l.cells.map((c) => c.lines.length))).toBe(1);
  });

  it('全域文字關閉 → 1584 × 1584（不留文字區）', () => {
    const l = layout(TWENTY_TWO, { showText: false });
    expect([l.width, l.height, l.captionHeight]).toEqual([1584, 1584, 0]);
  });

  it('欄數 5、格子 100、間距 0、文字 12 → 500 × 635（文字區 27）', () => {
    const l = layout(TWENTY_TWO, { columns: '5', cellSize: '100', gap: '0', fontSize: '12' });
    expect([l.columns, l.rows, l.width, l.height, l.captionHeight]).toEqual([5, 5, 500, 635, 27]);
  });

  it('欄數 50：依裁定限制為 20 → 20 × 2（舊版 22 × 1、2200 × 127；刻意差異）', () => {
    const l = layout(TWENTY_TWO, { columns: '50', cellSize: '100', gap: '0', fontSize: '12' });
    expect([l.columns, l.rows, l.width, l.height]).toEqual([20, 2, 2000, 254]);
    /* 欄數不大於張數：3 個填 20 → 3 欄 1 列 */
    expect(layout(TWENTY_TWO.slice(0, 3), { columns: '20' }).columns).toBe(3);
  });

  it('格子填 5／5000／空白 → 400 × 535／4000 × 4135／1500 × 1635', () => {
    const base = { columns: '5', gap: '0', fontSize: '12' };
    const sizes = ['5', '5000', ''].map((cellSize) => {
      const l = layout(TWENTY_TWO, { ...base, cellSize });
      return [l.width, l.height];
    });
    expect(sizes).toEqual([
      [400, 535],
      [4000, 4135],
      [1500, 1635],
    ]);
  });

  it('自動欄數：22 個 → 5 欄', () => {
    expect(layout(TWENTY_TWO, { columns: '-2' }).columns).toBe(5);
  });

  it('4 個、欄數 2、一個 30 字標籤（3 行）、一個有空白行 → 642 × 892（文字區 125）', () => {
    const list = [
      e('開心'),
      e('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十'),
      e('第一行\n\n第三行'),
      e('最後'),
    ];
    const l = layout(list, { columns: '2' });
    expect([l.columns, l.rows, l.width, l.height, l.captionHeight]).toEqual([2, 2, 642, 892, 125]);
    expect(l.cells[1].lines).toHaveLength(3);
    expect(l.cells[2].lines).toEqual(['第一行', '', '第三行']);
    expect(l.cells.map((c) => [c.image.x, c.image.y])).toEqual([
      [14, 14],
      [328, 14],
      [14, 453],
      [328, 453],
    ]);
    /* 第一行的上緣在頭像下緣往下一個內距 */
    expect(l.pad).toBe(13);
    expect(l.lineHeight).toBe(33);
  });
});
