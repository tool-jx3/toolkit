/**
 * 文字軌跡產生器的規則（規格第 2～3 節）：拿掉空白、以碼位切字、格子（列數依長寬比）、
 * 找最近空格的順序、修剪、行首替換、依字數縮放、間距倍數的描述詞；以及狀態（store）的連動規則（F03～F17）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { pathBounds, pathLength, presetPath, reversePath } from '@/core/path';
import {
  COLS,
  cellOf,
  cellSide,
  charCount,
  composeCells,
  FILL_CHARS,
  fitPathToText,
  generate,
  gridSize,
  LINE_HEAD_BLANK,
  nearestEmpty,
  PAD_HEIGHT,
  PAD_WIDTH,
  placeChars,
  resultCount,
  SPACING,
  shapePath,
  spacingLevel,
  splitChars,
} from '@/tools/text-path/logic';
import { initialState, useTextPath } from '@/tools/text-path/store';
import { S } from '@/tools/text-path/strings';

const FULL = FILL_CHARS.ideographic;
const circle = () => shapePath('circle');

describe('文字（F01、F02、2.）', () => {
  it('拿掉所有空白字元：半形與全形空白、Tab、換行、不換行空白', () => {
    expect(splitChars('第 一 章\n霧中港口')).toEqual(Array.from('第一章霧中港口'));
    expect(splitChars('a\tb　c d\r\ne f')).toEqual(Array.from('abcdef'));
    expect(splitChars(' \n\t　 ')).toEqual([]);
    /* 點字空白、韓文中點不是空白 */
    expect(splitChars(`${LINE_HEAD_BLANK}ㆍ`)).toEqual([LINE_HEAD_BLANK, 'ㆍ']);
  });

  it('以碼位為單位：表情符號、擴充 B 漢字各算一個字（刻意改善）', () => {
    expect(splitChars('🎲𪜶好')).toEqual(['🎲', '𪜶', '好']);
    expect(charCount('擲 🎲 骰')).toBe(3);
    expect(resultCount('🎲　\n　𪜶')).toBe(5);
  });

  it('擴充平面的字各佔一格，不會被拆成兩半', () => {
    const r = generate({
      text: '🎲𪜶',
      path: [
        { x: 30, y: 150 },
        { x: 600, y: 150 },
      ],
      cols: 25,
      fill: FULL,
      lineHead: false,
    });
    /* x 30 → 第 1 欄、x 600 → 第 23 欄 */
    expect(r.ok && r.text).toBe(`🎲${FULL.repeat(21)}𪜶`);
    expect(r.ok && r.labels.map((l) => l.text)).toEqual(['🎲', '𪜶']);
  });
});

describe('格子（F22、3.4）', () => {
  it('列數＝max(10, ⌊C × H ÷ W⌋)：規格的量測（C＝25）', () => {
    expect(gridSize(25, 634, 300).rows).toBe(11);
    expect(gridSize(25, 591, 300).rows).toBe(12);
    expect(gridSize(25, 421, 300).rows).toBe(17);
    expect(gridSize(25, 310, 300).rows).toBe(24);
    expect(gridSize(15).rows).toBe(10);
    expect(gridSize(50).rows).toBe(23);
  });

  it('格子寬 W ÷ C、高 H ÷ R（通常不是正方形）；格邊取較短的一邊', () => {
    const g = gridSize(25);
    expect(g.cellW).toBeCloseTo(25.36, 10);
    expect(g.cellH).toBeCloseTo(300 / 11, 10);
    expect(cellSide(25)).toBeCloseTo(25.36, 10);
    expect(cellSide(15)).toBeCloseTo(30, 10);
  });

  it('點落在 ⌊x ÷ W × C⌋ 欄、⌊y ÷ H × R⌋ 列；超出範圍夾在邊界格', () => {
    const g = gridSize(25);
    expect(cellOf({ x: 317, y: 150 }, g)).toEqual({ col: 12, row: 5 });
    expect(cellOf({ x: -10, y: -10 }, g)).toEqual({ col: 0, row: 0 });
    expect(cellOf({ x: 634, y: 300 }, g)).toEqual({ col: 24, row: 10 });
    expect(cellOf({ x: 9999, y: 150 }, g)).toEqual({ col: 24, row: 5 });
  });
});

describe('放字與找最近的空格（F23）', () => {
  it('25 個字落在同一格：以原格為中心的 5 × 5 方塊，同一圈從左上開始逐列由左而右', () => {
    const r = generate({
      text: 'ABCDEFGHIJKLMNOPQRSTUVWXY',
      path: [
        { x: 317, y: 150 },
        { x: 318, y: 150 },
      ],
      cols: 25,
      fill: FULL,
      lineHead: false,
    });
    expect(r.ok && r.text).toBe(['JKLMN', 'OBCDP', 'QEAFR', 'SGHIT', 'UVWXY'].join('\n'));
  });

  it('靠邊時超出範圍的格子跳過', () => {
    const cells: (string | null)[][] = [
      ['A', null, null],
      [null, null, null],
    ];
    /* 距離 1 的圈：(−1,−1)、(−1,0)、(−1,1) 超出範圍，下一個是右邊 (0,1) */
    expect(nearestEmpty(cells, 0, 0)).toEqual({ row: 0, col: 1 });
    cells[0][1] = 'B';
    expect(nearestEmpty(cells, 0, 0)).toEqual({ row: 1, col: 0 });
    expect(nearestEmpty([['A']], 0, 0)).toBeNull();
  });

  it('格子全滿時多出來的字丟掉', () => {
    const g = gridSize(15);
    const total = g.rows * g.cols;
    const chars = Array.from({ length: total + 3 }, (_, i) => String.fromCodePoint(0x4e00 + i));
    const p = placeChars(chars, circle(), 15);
    expect(p.placed).toHaveLength(total);
    expect(p.cells.flat().every((c) => c !== null)).toBe(true);
    expect(p.placed.map((x) => x.text)).toEqual(chars.slice(0, total));
  });

  it('圓形只有兩個字：終點與起點同一格，第二個字被擠到左上（附件 P03）', () => {
    const r = generate({ text: '骰子', path: circle(), cols: 25, fill: FULL, lineHead: false });
    expect(r.ok && r.text).toBe(`子${FULL}\n${FULL}骰`);
  });
});

describe('組合、修剪、行首替換（F24、F25、F13）', () => {
  it('修剪四周只有填空字元的列與欄；最後沒有換行', () => {
    const cells = [
      [null, null, null, null],
      [null, '甲', null, null],
      [null, null, '乙', null],
      [null, null, null, null],
    ];
    expect(composeCells(cells, FULL, false)).toBe(`甲${FULL}\n${FULL}乙`);
    expect(composeCells(cells, ' ', false)).toBe('甲 \n 乙');
  });

  it('修剪只看填空字元：文字裡的「ㆍ」在選韓文中點時也被當成空格', () => {
    const cells = [
      [null, 'ㆍ', null],
      [null, '字', null],
    ];
    expect(composeCells(cells, FILL_CHARS.middot, false)).toBe('字');
    expect(composeCells(cells, FULL, false)).toBe('ㆍ\n字');
  });

  it('全部是填空字元時結果是空的', () => {
    expect(composeCells([[null, 'ㆍ']], FILL_CHARS.middot, false)).toBe('');
  });

  it('行首替換：修剪後，每行開頭若是填空字元，只把第一個換成點字空白 U+2800', () => {
    const cells = [
      ['甲', null, null],
      [null, null, '乙'],
    ];
    expect(composeCells(cells, FULL, true)).toBe(`甲${FULL}${FULL}\n${LINE_HEAD_BLANK}${FULL}乙`);
    expect(composeCells(cells, ' ', true)).toBe(`甲  \n${LINE_HEAD_BLANK} 乙`);
    /* 行首是字的不換 */
    expect(composeCells([['甲']], FULL, true)).toBe('甲');
  });
});

describe('產生（F14、F19、F21）', () => {
  it('沒有文字、沒有軌跡（不到兩點）時不產生；先檢查文字', () => {
    const base = { cols: 25, fill: FULL, lineHead: false };
    expect(generate({ ...base, text: ' \n　', path: circle() })).toEqual({
      ok: false,
      reason: 'no-text',
    });
    expect(generate({ ...base, text: '字', path: [{ x: 1, y: 1 }] })).toEqual({
      ok: false,
      reason: 'no-path',
    });
    expect(generate({ ...base, text: '', path: [] })).toEqual({ ok: false, reason: 'no-text' });
  });

  it('只有一個字時只取起點', () => {
    const r = generate({ text: '月', path: circle(), cols: 25, fill: FULL, lineHead: false });
    expect(r.ok && r.text).toBe('月');
    /* 起點 (317, 30) → 第 12 欄、第 1 列 */
    expect(r.ok && r.labels).toEqual([{ x: 12.5 * 25.36, y: 1.5 * (300 / 11), text: '月' }]);
  });

  it('疊字畫在未修剪的格子中心，字級＝格子較短邊 × 0.8', () => {
    const r = generate({ text: '骰子', path: circle(), cols: 25, fill: FULL, lineHead: false });
    if (!r.ok) throw new Error('應該成功');
    expect(r.labelSize).toBeCloseTo(25.36 * 0.8, 10);
    expect(r.labels.map((l) => l.text)).toEqual(['骰', '子']);
    expect(r.labels[0].x).toBeCloseTo(12.5 * 25.36, 10);
    expect(r.labels[1].x).toBeCloseTo(11.5 * 25.36, 10);
    expect(r.labels[1].y).toBeCloseTo(0.5 * (300 / 11), 10);
  });
});

describe('依字數縮放軌跡（F15、3.5）', () => {
  it('字數不到兩個、沒有軌跡時不動作（先檢查字數）', () => {
    expect(fitPathToText({ path: circle(), count: 1, cols: 25, spacing: 1.2 })).toEqual({
      ok: false,
      reason: 'few-chars',
    });
    expect(fitPathToText({ path: [], count: 1, cols: 25, spacing: 1.2 })).toEqual({
      ok: false,
      reason: 'few-chars',
    });
    expect(fitPathToText({ path: [{ x: 1, y: 2 }], count: 5, cols: 25, spacing: 1.2 })).toEqual({
      ok: false,
      reason: 'no-path',
    });
  });

  it('目標總長＝（N − 1）× 格邊 × 間距倍數，以外接框中心縮放（規格的量測）', () => {
    const r = fitPathToText({ path: circle(), count: 10, cols: 25, spacing: 1.2 });
    if (!r.ok) throw new Error('應該成功');
    expect(pathLength(r.path)).toBeCloseTo(9 * 25.36 * 1.2, 6);
    expect(pathLength(r.path)).toBeCloseTo(273.9, 1);
    const b = pathBounds(r.path);
    expect(b.cx).toBeCloseTo(pathBounds(circle()).cx, 9);
    expect(b.cy).toBeCloseTo(pathBounds(circle()).cy, 9);
    const heart = fitPathToText({ path: shapePath('heart'), count: 2, cols: 25, spacing: 1.2 });
    expect(heart.ok && pathLength(heart.path)).toBeCloseTo(30.4, 1);
  });

  it('外接框的寬不超過 0.9 W、高不超過 0.9 H', () => {
    const r = fitPathToText({ path: circle(), count: 32, cols: 25, spacing: 1.2 });
    if (!r.ok) throw new Error('應該成功');
    expect(pathBounds(r.path).h).toBeCloseTo(270, 9);
    expect(pathLength(r.path)).toBeCloseTo(843.7, 1);
    /* 很寬的水平線：被寬度限制 */
    const line = fitPathToText({
      path: [
        { x: 300, y: 150 },
        { x: 310, y: 150 },
      ],
      count: 80,
      cols: 15,
      spacing: 3,
    });
    expect(line.ok && pathBounds(line.path).w).toBeCloseTo(0.9 * PAD_WIDTH, 9);
    /* 垂直線（寬 0）不會除以 0 */
    const v = fitPathToText({
      path: [
        { x: 50, y: 100 },
        { x: 50, y: 110 },
      ],
      count: 3,
      cols: 25,
      spacing: 1,
    });
    expect(v.ok && pathLength(v.path)).toBeCloseTo(2 * 25.36, 9);
  });

  it('只限制大小，不保證留在繪製區內', () => {
    const r = fitPathToText({
      path: [
        { x: 600, y: 20 },
        { x: 630, y: 20 },
      ],
      count: 20,
      cols: 25,
      spacing: 1,
    });
    expect(r.ok && pathBounds(r.path).x + pathBounds(r.path).w).toBeGreaterThan(PAD_WIDTH);
  });
});

describe('間距倍數的描述詞（F10）', () => {
  it('五級：≤ 0.8、≤ 1.1、≤ 1.3、≤ 1.8、其餘', () => {
    const levels = [0.5, 0.8, 0.9, 1.1, 1.2, 1.3, 1.4, 1.8, 1.9, 3].map(spacingLevel);
    expect(levels).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    /* 浮點誤差（0.1 × 8） */
    expect(spacingLevel(0.1 * 8)).toBe(0);
    expect(S.spacingLevels).toHaveLength(5);
  });

  it('範圍與預設值', () => {
    expect(COLS).toMatchObject({ min: 15, max: 50, step: 1, default: 25 });
    expect(SPACING).toMatchObject({ min: 0.5, max: 3, step: 0.1, default: 1.2 });
    expect([PAD_WIDTH, PAD_HEIGHT]).toEqual([634, 300]);
    expect(FILL_CHARS).toEqual({ ideographic: '　', space: ' ', middot: 'ㆍ' });
  });
});

describe('狀態的連動（store）', () => {
  const st = () => useTextPath.getState();
  beforeEach(() => st().reset());

  it('開頁：範例文字、圓形、軌跡已畫好、結果是空的、預設值（F07、F31）', () => {
    const s = st();
    expect(s.shape).toBe('circle');
    expect(s.path).toEqual(presetPath('circle', 634, 300));
    expect(s.result).toBe('');
    expect(s.labels).toEqual([]);
    expect([s.cols, s.spacing, s.fill, s.lineHead]).toEqual([25, 1.2, 'ideographic', false]);
    expect(charCount(s.text)).toBeGreaterThanOrEqual(25);
    expect(charCount(s.text)).toBeLessThanOrEqual(35);
    expect(initialState().text).toBe(S.sampleText);
  });

  it('產生：結果與疊字；改文字、欄數、形狀不會自動重新產生（F03、F09、F14）', () => {
    expect(st().generate()).toBeNull();
    const first = st().result;
    expect(first).not.toBe('');
    expect(st().labels.length).toBe(charCount(S.sampleText));
    st().setText('別的文字');
    st().setCols(40);
    expect(st().result).toBe(first);
    st().selectShape('heart');
    expect(st().path).toEqual(presetPath('heart', 634, 300));
    expect(st().result).toBe(first);
    /* 換形狀時疊字消失 */
    expect(st().labels).toEqual([]);
  });

  it('沒有文字、沒有軌跡時回傳訊息代號', () => {
    st().setText(' \n ');
    expect(st().generate()).toBe('noText');
    st().setText('有字');
    st().clear();
    expect(st().generate()).toBe('noPath');
    st().drawEnd([{ x: 5, y: 5 }]);
    expect(st().generate()).toBe('noPath');
  });

  it('自由繪製：選「自由繪製」不清掉軌跡；開始畫線就切到自由繪製、疊字消失（F06）', () => {
    st().generate();
    st().selectShape('free');
    expect(st().shape).toBe('free');
    expect(st().path).toEqual(presetPath('circle', 634, 300));
    expect(st().labels.length).toBeGreaterThan(0);
    st().selectShape('spiral');
    st().generate();
    st().drawStart();
    expect(st().shape).toBe('free');
    expect(st().labels).toEqual([]);
    const pts = [
      { x: 30, y: 150 },
      { x: 600, y: 150 },
    ];
    st().drawEnd(pts);
    expect(st().path).toEqual(pts);
    /* 畫線不會自動重新產生（結果保留上一次的內容） */
    expect(st().result).not.toBe('');
    /* 再選一次同一個預設形狀會換回那個形狀 */
    st().selectShape('spiral');
    expect(st().path).toEqual(presetPath('spiral', 634, 300));
  });

  it('填空字元、行首替換：已有結果時立刻重新產生，沒有結果時只改值（F12、F13）', () => {
    st().setFill('space');
    expect(st().result).toBe('');
    st().generate();
    expect(st().result).toContain(' ');
    expect(st().result).not.toContain(FULL);
    st().setFill('middot');
    expect(st().result).toContain('ㆍ');
    st().setLineHead(true);
    const lines = st().result.split('\n');
    expect(lines.some((l) => l.startsWith(LINE_HEAD_BLANK))).toBe(true);
    expect(lines.every((l) => !l.startsWith('ㆍ'))).toBe(true);
  });

  it('間距倍數：沒有結果時只改數值；已有結果時立刻依字數縮放並重新產生（F11）', () => {
    st().setSpacing(0.8);
    expect(st().spacing).toBe(0.8);
    expect(st().path).toEqual(presetPath('circle', 634, 300));
    st().generate();
    st().setSpacing(0.5);
    const n = charCount(st().text);
    expect(pathLength(st().path)).toBeCloseTo((n - 1) * 25.36 * 0.5, 6);
    const expected = generate({
      text: st().text,
      path: st().path,
      cols: 25,
      fill: FULL,
      lineHead: false,
    });
    expect(expected.ok && expected.text).toBe(st().result);
    expect(st().labels.length).toBe(n);
  });

  it('依字數縮放：沒有結果時顯示完成；有結果時重新產生；字數或軌跡不夠時顯示訊息（F15）', () => {
    expect(st().fit()).toBe('fitted');
    expect(st().result).toBe('');
    st().generate();
    expect(st().fit()).toBeNull();
    expect(st().result).not.toBe('');
    st().setText('一');
    expect(st().fit()).toBe('fewChars');
    st().setText('一二');
    st().clear();
    expect(st().fit()).toBe('fitNoPath');
  });

  it('起訖對調：軌跡反轉；已有結果時立刻重新產生；沒有軌跡時顯示訊息（F16）', () => {
    expect(st().reverse()).toBeNull();
    expect(st().path).toEqual(reversePath(presetPath('circle', 634, 300)));
    expect(st().result).toBe('');
    st().generate();
    const before = st().result;
    st().reverse();
    expect(st().result).not.toBe(before);
    st().clear();
    expect(st().reverse()).toBe('reverseNoPath');
  });

  it('清除：清掉軌跡、結果、疊字，切到自由繪製（F17）', () => {
    st().generate();
    st().clear();
    const s = st();
    expect([s.shape, s.path, s.result, s.labels]).toEqual(['free', [], '', []]);
  });
});
