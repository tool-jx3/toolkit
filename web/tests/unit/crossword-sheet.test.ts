/**
 * crossword：整張圖的排版（規格 3.7）與 HTML（3.9）。量字寬用假的（全形 1 em、半形 0.6 em、粗體 ×1.05）。
 */
import { describe, expect, it } from 'vitest';
import { extractWords } from '../../src/tools/crossword/extract';
import { buildFromCandidates, type Puzzle, seededRng } from '../../src/tools/crossword/generate';
import { sheetHtml } from '../../src/tools/crossword/html';
import { initialData } from '../../src/tools/crossword/sample';
import {
  boardSize,
  cardWidth,
  cellChar,
  type FontSpec,
  layoutSheet,
  type MeasureFn,
  SHEET,
  SHEET_COLORS,
  type SheetOp,
  type SheetOptions,
  sheetText,
  wrapRuns,
} from '../../src/tools/crossword/sheet';
import { S } from '../../src/tools/crossword/strings';
import fixture from './fixtures/crossword-upstream.json';

const measure: MeasureFn = (text: string, f: FontSpec) =>
  Array.from(text).reduce(
    (sum, ch) => sum + f.size * ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.6),
    0,
  ) * (f.weight >= 700 ? 1.05 : 1);

const opts = (o: Partial<SheetOptions> = {}): SheetOptions => ({
  reveal: false,
  layout: 'row',
  title: '填字遊戲',
  emptyColor: '#334155',
  emptyTransparent: false,
  fonts: { title: 'Noto Sans TC', grid: 'Noto Sans TC', clues: 'Noto Sans TC' },
  labels: S.sheet,
  ...o,
});

const SMALL: Puzzle = {
  width: 3,
  height: 2,
  words: [
    { answer: 'key', hint: 'The key opened the door.', x: 0, y: 0, dir: 'across', num: 1 },
    { answer: 'ex', hint: 'An ex-detective.', x: 1, y: 0, dir: 'down', num: 2 },
  ],
};

const texts = (ops: SheetOp[]) =>
  ops.filter((o): o is Extract<SheetOp, { t: 'text' }> => o.t === 'text');

describe('尺寸（照原作的匯出）', () => {
  it('盤面：格子 48、格線 1、內距 2；透明時沒有格線與內距', () => {
    expect(boardSize({ width: 3, height: 2 }, false)).toEqual({
      w: 3 * 48 + 2 + 4,
      h: 2 * 48 + 1 + 4,
    });
    expect(boardSize({ width: 3, height: 2 }, true)).toEqual({ w: 144, h: 96 });
  });

  it('卡片寬：左右 max(1300, 盤面 + 810)（9 欄以下同原作）、上下 max(900, 盤面 + 100)；整張圖再加外圍 60 × 2', () => {
    expect(cardWidth(300, 'row')).toBe(1300);
    expect(cardWidth(9 * 49 + 3, 'row')).toBe(1300);
    expect(cardWidth(10 * 49 + 3, 'row')).toBe(1303);
    expect(cardWidth(800, 'row')).toBe(1610);
    expect(cardWidth(300, 'col')).toBe(900);
    expect(cardWidth(850, 'col')).toBe(950);
    const l = layoutSheet(SMALL, opts(), measure);
    expect(l.width).toBe(1300 + 120);
    const c = layoutSheet(SMALL, opts({ layout: 'col' }), measure);
    expect(c.width).toBe(900 + 120);
    expect(c.height).toBeGreaterThan(l.height);
  });

  it('大盤面（5. D6）：提示欄每欄至少 300 px，不被擠窄；卡片跟著變寬', () => {
    /* 原作的英文 50 詞那組（37 × 26 格，種子 5） */
    const words = extractWords((fixture as { texts: Record<string, string> }).texts.enStory, {
      extended: false,
    });
    const { puzzle } = buildFromCandidates(
      words,
      { target: 50, freqWeight: 50, lenWeight: 50 },
      seededRng(5),
    );
    expect(puzzle && [puzzle.width, puzzle.height]).toEqual([37, 26]);
    if (!puzzle) return;
    const l = layoutSheet(puzzle, opts(), measure);
    /* 兩欄提示的標題文字的 x（色塊左緣 ＋ 12） → 欄寬 */
    const t = texts(l.ops);
    const across = t.find((o) => o.text === S.sheet.across)?.x ?? 0;
    const down = t.find((o) => o.text === S.sheet.down)?.x ?? 0;
    const colW = down - across - SHEET.columnGap;
    expect(colW).toBeGreaterThanOrEqual(300);
    /* 盤面 1816 ＋ 外框 50 ＋ 間隔 48 ＋ 兩欄 632 ＋ 卡片內距 80 ＝ 2626；整張 2746 */
    expect(l.width).toBe(2746);
    /* 提示不再擠成細長的一條：圖不比寬還高 */
    expect(l.height).toBeLessThan(l.width);
  });

  it('盤面的位置：外圍 60 ＋ 卡片內距 40 ＋ 外框 1 ＋ 外框內距 24；標題區在上面', () => {
    const l = layoutSheet(SMALL, opts(), measure);
    const titleBlock = SHEET.titleLine + SHEET.titlePadBottom + 1 + SHEET.titleMarginBottom;
    expect(l.board).toEqual({ x: 125, y: 125 + titleBlock, w: 150, h: 101 });
    /* 沒有標題（題目版）時沒有標題區 */
    const n = layoutSheet(SMALL, opts({ title: ' ' }), measure);
    expect(n.board.y).toBe(125);
  });
});

describe('內容', () => {
  it('題目版：格子白底、號碼、沒有字；提示裡的答案蓋成 ○（紅色粗體）', () => {
    const l = layoutSheet(SMALL, opts(), measure);
    const t = texts(l.ops);
    expect(t.map((o) => o.text)).toEqual(
      expect.arrayContaining([
        '填字遊戲',
        '1',
        '2',
        S.sheet.across,
        S.sheet.down,
        '1.',
        '2.',
        '○○○',
      ]),
    );
    expect(t.some((o) => o.text === 'K')).toBe(false);
    const mask = t.find((o) => o.text === '○○○');
    expect(mask?.color).toBe(SHEET_COLORS.danger);
    expect(mask?.font.weight).toBe(700);
    /* 盤面底色＋4 個有字的格子 */
    const rects = l.ops.filter((o) => o.t === 'rect');
    expect(rects.filter((r) => r.fill === '#334155')).toHaveLength(1);
    expect(rects.filter((r) => r.fill === SHEET_COLORS.cell && r.w === 48)).toHaveLength(4);
  });

  it('解答版：格子有大寫的字、標題旁「（解答）」、提示裡標出答案（藍色）', () => {
    const t = texts(layoutSheet(SMALL, opts({ reveal: true }), measure).ops);
    expect(t.map((o) => o.text)).toEqual(
      expect.arrayContaining(['K', 'E', 'Y', 'X', S.sheet.answerBadge]),
    );
    expect(t.find((o) => o.text === 'key')?.color).toBe(SHEET_COLORS.primary);
    expect(t.find((o) => o.text === S.sheet.answerBadge)?.color).toBe(SHEET_COLORS.primary);
  });

  it('空格透明：沒有盤面底色，有字的格子各自有框線', () => {
    const l = layoutSheet(SMALL, opts({ emptyTransparent: true }), measure);
    const rects = l.ops.filter((o) => o.t === 'rect');
    expect(rects.some((r) => r.fill === '#334155')).toBe(false);
    expect(rects.filter((r) => r.stroke === SHEET_COLORS.cellBorder)).toHaveLength(4);
  });

  it('範例盤面：每個詞一個號碼列在提示裡', () => {
    const p = initialData().puzzle;
    expect(p).not.toBeNull();
    if (!p) return;
    const t = texts(layoutSheet(p, opts(), measure).ops).map((o) => o.text);
    for (const w of p.words) expect(t).toContain(`${w.num}.`);
  });

  it('英文字母顯示成大寫（ß 這類會變成兩個字的不轉）', () => {
    expect(cellChar('a')).toBe('A');
    expect(cellChar('ß')).toBe('ß');
    expect(cellChar('字')).toBe('字');
  });

  it('sheetText：三種字型各自用到的字', () => {
    const t = sheetText(SMALL, opts());
    expect(t.title).toContain('填');
    expect(t.grid).toContain('K');
    expect(t.clues).toContain('○');
  });
});

describe('斷行（提示）', () => {
  const font: FontSpec = { role: 'clues', size: 10, weight: 400 };
  const bold: FontSpec = { role: 'clues', size: 10, weight: 700 };

  it('中文逐字斷、英文單字不從中間斷；粗體的部分保留', () => {
    const lines = wrapRuns(
      [
        { text: '打開', bold: false },
        { text: '○○○', bold: true },
        { text: '的門，然後走進去。', bold: false },
      ],
      60,
      font,
      bold,
      measure,
    );
    /* ○ 在假的量法裡是半形；「，」不放行首（留在上一行，允許超出） */
    expect(lines.map((l) => l.runs.map((r) => r.text).join(''))).toEqual([
      '打開○○○的門，',
      '然後走進去。',
    ]);
    expect(lines[0].runs).toEqual([
      { text: '打開', bold: false },
      { text: '○○○', bold: true },
      { text: '的門，', bold: false },
    ]);
    /* 粗體的一段不斷開，和緊接的句點連在一起（同原作的 keep-all） */
    const masked = wrapRuns(
      [
        { text: 'Every ', bold: false },
        { text: '○○○○○○○○○', bold: true },
        { text: '. held', bold: false },
      ],
      70,
      font,
      bold,
      measure,
    );
    expect(masked.map((l) => l.runs.map((r) => r.text).join(''))).toEqual([
      'Every',
      '○○○○○○○○○.',
      'held',
    ]);
    expect(masked[1].runs).toEqual([
      { text: '○○○○○○○○○', bold: true },
      { text: '.', bold: false },
    ]);
    const en = wrapRuns(
      [{ text: 'the cellar door was locked', bold: false }],
      70,
      font,
      bold,
      measure,
    );
    expect(en.map((l) => l.runs[0].text)).toEqual(['the cellar', 'door was', 'locked']);
  });
});

describe('HTML（3.9）', () => {
  it('題目版：格子、號碼、蓋住的答案；沒有答案的字', () => {
    const html = sheetHtml(SMALL, opts(), '填字遊戲（題目）');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>填字遊戲（題目）</title>');
    expect(html.match(/class="cell on"/g)).toHaveLength(4);
    expect(html.match(/class="cell"/g)).toHaveLength(2);
    expect(html).toContain('grid-template-columns:repeat(3,48px)');
    expect(html).toContain('<strong>○○○</strong>');
    expect(html).not.toContain('<span>K</span>');
    expect(html).not.toContain(S.sheet.answerBadge);
    expect(html).toContain('width:1300px');
  });

  it('解答版：字、標記、答案標出來；字型的 link 與 @font-face 放進去', () => {
    const html = sheetHtml(SMALL, opts({ reveal: true }), 'x', {
      links:
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC">\n',
      faces: '@font-face{font-family:"Mine";src:url(data:font/ttf;base64,AA==)}',
    });
    expect(html).toContain('<span>K</span>');
    expect(html).toContain(`<span class="badge">${S.sheet.answerBadge}</span>`);
    expect(html).toContain('<strong>key</strong>');
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('@font-face{font-family:"Mine"');
  });

  it('跳脫 HTML', () => {
    const p: Puzzle = {
      ...SMALL,
      words: [{ ...SMALL.words[0], hint: '<b>key</b> & "x"' }, SMALL.words[1]],
    };
    const html = sheetHtml(p, opts({ title: '<script>' }), '<t>');
    expect(html).toContain('&lt;b&gt;<strong>○○○</strong>&lt;/b&gt; &amp; &quot;x&quot;');
    expect(html).toContain('<h1>&lt;script&gt;</h1>');
    expect(html).not.toContain('<script>');
  });
});
