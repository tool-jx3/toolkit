/**
 * 線索道具產生器（handout-maker）的排版（規格 3.3）：用假的量字（中文 10、英數 5、空白 5）檢查
 * 換行（英數字詞不拆開、句讀不放行首）、塗黑的留白與範圍、四種對齊、報紙的分欄、附圖大小、簡訊泡泡。
 */
import { describe, expect, it } from 'vitest';
import {
  bubbleLayout,
  flowPlain,
  flowText,
  imageBox,
  newspaperColumns,
  splitColumns,
  widestRow,
} from '@/tools/handout-maker/layout';
import { parseBody } from '@/tools/handout-maker/markup';

const measure = (ch: string) => ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 10 : 5);
const text = (row: { cells: { ch: string }[] }) => row.cells.map((c) => c.ch).join('');

describe('換行', () => {
  it('中文逐字換行，句讀不放行首（連同前一個字換下去）', () => {
    const rows = flowText(parseBody('一二三四五。六'), { width: 50, measure });
    expect(rows.map(text)).toEqual(['一二三四', '五。六']);
  });

  it('英數字詞不拆開（整個詞換到下一行），比一整行還長時才逐字切', () => {
    const rows = flowText(parseBody('ab cdefgh'), { width: 30, measure });
    expect(rows.map(text)).toEqual(['ab ', 'cdefgh']);
    const long = flowText(parseBody('abcdefghij'), { width: 30, measure });
    expect(long.map(text)).toEqual(['abcdef', 'ghij']);
  });

  it('每一段至少一行；空段是空行；段落的最後一行標 last', () => {
    const rows = flowText(parseBody('一\n\n二'), { width: 100, measure });
    expect(rows.map(text)).toEqual(['一', '', '二']);
    expect(rows.map((r) => r.last)).toEqual([true, true, true]);
  });

  it('字距加在每個字後面', () => {
    const [row] = flowText(parseBody('一二'), { width: 100, measure, letterSpacing: 2 });
    expect(row.cells.map((c) => [c.x, c.adv])).toEqual([
      [0, 12],
      [12, 12],
    ]);
  });
});

describe('塗黑的範圍', () => {
  it('塗黑的頭尾各多留 censorPad，字畫在留白後面；相鄰的塗黑字合成一條', () => {
    const [row] = flowText(parseBody('甲||乙丙||丁'), { width: 200, measure, censorPad: 3 });
    expect(row.cells.map((c) => [c.ch, c.x, c.adv, c.padL, c.censored])).toEqual([
      ['甲', 0, 10, 0, false],
      ['乙', 10, 13, 3, true],
      ['丙', 23, 13, 0, true],
      ['丁', 36, 10, 0, false],
    ]);
    expect(row.bars).toEqual([{ x: 10, w: 26 }]);
    expect(row.width).toBe(46);
  });

  it('一個字的塗黑兩邊都留白', () => {
    const [row] = flowText(parseBody('||字||'), { width: 200, measure, censorPad: 2 });
    expect(row.bars).toEqual([{ x: 0, w: 14 }]);
    expect(row.cells[0].padL).toBe(2);
  });

  it('塗黑跨行時每一行各自一條（接續的那一側不留白）', () => {
    const rows = flowText(parseBody('||一二三四五六||'), { width: 35, measure, censorPad: 2 });
    expect(rows.map(text)).toEqual(['一二三', '四五六']);
    expect(rows[0].bars).toEqual([{ x: 0, w: 32 }]);
    expect(rows[1].bars).toEqual([{ x: 0, w: 32 }]);
  });

  it('兩段分開的塗黑是兩條', () => {
    const [row] = flowText(parseBody('||a|| b ||c||'), { width: 200, measure });
    expect(row.bars).toHaveLength(2);
  });
});

describe('對齊', () => {
  const one = (align: 'left' | 'center' | 'right') =>
    flowText(parseBody('一二三'), { width: 100, measure, align })[0].cells[0].x;

  it('靠左從 0、置中從（寬 − 行寬）÷ 2、靠右貼齊右邊', () => {
    expect(one('left')).toBe(0);
    expect(one('center')).toBe(35);
    expect(one('right')).toBe(70);
  });

  it('行尾空白不算進置中與靠右', () => {
    const [row] = flowText(parseBody('一二  '), { width: 100, measure, align: 'right' });
    /* parseBody 去掉整段頭尾的空白，所以用中間的空白測：「一 」換行後行尾的空白 */
    expect(row.width).toBe(20);
    const rows = flowText(parseBody('一二 三四'), { width: 25, measure, align: 'right' });
    expect(rows[0].width).toBe(20);
    expect(rows[0].cells[0].x).toBe(5);
  });

  it('左右對齊：撐滿整行，段落最後一行靠左', () => {
    const rows = flowText(parseBody('一二三四五六七'), { width: 45, measure, align: 'justify' });
    expect(rows.map(text)).toEqual(['一二三四', '五六七']);
    const first = rows[0].cells;
    expect(first[0].x).toBe(0);
    expect(first[3].x + first[3].adv).toBeCloseTo(45);
    expect(rows[1].cells.map((c) => c.x)).toEqual([0, 10, 20]);
  });

  it('左右對齊：英文字與緊接的 ASCII 標點不拉開（「dog.」「Hello,」），撐開的是空白與中文字之間', () => {
    const rows = flowText(parseBody('Hello, dog. 一二三四五六七八九十'), {
      width: 125,
      measure,
      align: 'justify',
    });
    const cells = rows[0].cells;
    const at = (i: number) => cells[i];
    const gapAfter = (i: number) => at(i + 1).x - (at(i).x + at(i).adv);
    expect(text(rows[0]).startsWith('Hello, dog.')).toBe(true);
    /* o→, 與 g→. 之間沒有空隙 */
    expect(gapAfter(4)).toBe(0);
    expect(gapAfter(9)).toBe(0);
    /* 空白後面、中文字之間有撐開 */
    expect(gapAfter(6)).toBeGreaterThan(0);
    expect(gapAfter(12)).toBeGreaterThan(0);
    /* 這一行撐滿 */
    const last = cells.filter((c) => c.ch !== ' ').at(-1);
    expect((last?.x ?? 0) + (last?.adv ?? 0)).toBeCloseTo(125);
  });

  it('標題（flowPlain）的左右對齊當成靠左不用處理：照給的對齊排', () => {
    const [row] = flowPlain('標題', { width: 100, measure, align: 'center' });
    expect(row.cells[0].x).toBe(40);
    expect(flowPlain('', { width: 100, measure })).toEqual([
      { cells: [], bars: [], width: 0, last: true },
    ]);
  });
});

describe('報紙的分欄', () => {
  const rows = flowText(parseBody(Array.from({ length: 7 }, (_, i) => `第${i}`).join('\n')), {
    width: 100,
    measure,
  });

  it('寬度超過 500 px 時兩欄（同原作）', () => {
    expect(newspaperColumns(500)).toBe(1);
    expect(newspaperColumns(501)).toBe(2);
    expect(newspaperColumns(600)).toBe(2);
  });

  it('每欄行數平均（前面的欄多一行）', () => {
    const r = splitColumns(rows, 2, 100);
    expect(r.columns.map((c) => c.length)).toEqual([4, 3]);
    expect(r.clipped).toBe(false);
  });

  it('放不下時每欄最多 maxRows 行，多的不畫（clipped）', () => {
    const r = splitColumns(rows, 2, 3);
    expect(r.columns.map((c) => c.length)).toEqual([3, 3]);
    expect(r.clipped).toBe(true);
    expect(splitColumns(rows, 1, 0)).toEqual({ columns: [[]], clipped: true });
  });
});

describe('附圖與泡泡', () => {
  it('附圖寬＝min(原寬, 內容寬 × n%)，高照比例；不放大', () => {
    expect(imageBox({ width: 1000, height: 500 }, 300, 90)).toEqual({ width: 270, height: 135 });
    expect(imageBox({ width: 100, height: 200 }, 300, 90)).toEqual({ width: 100, height: 200 });
    expect(imageBox({ width: 0, height: 0 }, 300, 90)).toEqual({ width: 0, height: 0 });
  });

  it('泡泡寬＝最寬的一行＋左右內距，文字最寬到 maxWidth − 內距', () => {
    const b = bubbleLayout('一二三', {
      maxWidth: 200,
      padX: 16,
      padY: 10,
      lineHeight: 14,
      measure,
    });
    expect(b.width).toBe(62);
    expect(b.height).toBe(34);
    const long = bubbleLayout('一二三四五六七八九十', {
      maxWidth: 82,
      padX: 16,
      padY: 10,
      lineHeight: 14,
      measure,
    });
    expect(long.rows.map(text)).toEqual(['一二三四五', '六七八九十']);
    expect(long.width).toBe(82);
    expect(widestRow(long.rows)).toBe(50);
  });
});
