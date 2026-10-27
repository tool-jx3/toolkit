/**
 * core/richtext 的完整格式（短文圖片產生器加的）：選填的片段格式（斜體、刪除線、螢光筆、字級、字型、空白顏色）、
 * 段落的對齊與分頁、'word' 換行規則、分頁（paginateRows）、編輯（replaceText、insertPageBreak、setLineAlign、rangeMarks）。
 * 沒有完整格式的資料（角色介紹圖）結果與以前完全相同（另見 core-richtext.test.ts）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyRichFormat,
  docText,
  insertPageBreak,
  justifyOpportunity,
  layoutRich,
  lineAlignIn,
  lineIndexAt,
  lineStartOf,
  normalizeDoc,
  paginateRows,
  plainDoc,
  type RichDoc,
  RichTextError,
  rangeMarks,
  replaceText,
  sameDoc,
  setLineAlign,
  setPageBreak,
  sliceDoc,
  styleAtCaret,
  validateDoc,
} from '@/core/richtext';

const r = (text: string, more: Record<string, unknown> = {}) => ({
  text,
  bold: false,
  color: '',
  ...more,
});
const one = () => 10;

describe('資料：完整格式', () => {
  it('整理時保留選填的格式與段落屬性，沒有設定的不出現', () => {
    const d = normalizeDoc({
      lines: [
        {
          runs: [
            r('甲', { italic: true, strike: false, highlight: '#FFF0A8' }),
            r('乙', { italic: true, highlight: '#fff0a8' }),
            r('丙', { size: 40, font: 'Noto Sans TC' }),
          ],
          align: 'center',
        },
        { runs: [], pageBreak: true },
      ],
    });
    expect(d.lines[0]).toEqual({
      runs: [
        { text: '甲乙', bold: false, color: '', italic: true, highlight: '#fff0a8' },
        { text: '丙', bold: false, color: '', size: 40, font: 'Noto Sans TC' },
      ],
      align: 'center',
    });
    expect(d.lines[1]).toEqual({ runs: [], pageBreak: true });
    expect(Object.keys(normalizeDoc(plainDoc('甲')).lines[0].runs[0])).toEqual([
      'text',
      'bold',
      'color',
    ]);
  });

  it('切開：每段保留對齊；分頁只在包含那一段開頭時保留', () => {
    const d: RichDoc = {
      lines: [
        { runs: [r('一二')], align: 'right' },
        { runs: [r('三四')], align: 'justify', pageBreak: true },
      ],
    };
    expect(sliceDoc(d, 1).lines).toEqual([
      { runs: [r('二')], align: 'right' },
      { runs: [r('三四')], align: 'justify', pageBreak: true },
    ]);
    expect(sliceDoc(d, 4).lines).toEqual([{ runs: [r('四')], align: 'justify' }]);
    expect(sliceDoc(d, 3).lines[0].pageBreak).toBe(true);
  });

  it('檢查外來的資料：full 才接受完整格式，壞的格式丟錯', () => {
    const raw = { lines: [{ runs: [r('甲', { italic: true, size: 30 })], align: 'center' }] };
    expect(validateDoc(raw, 100, { full: true }).lines[0]).toEqual(raw.lines[0]);
    /* 不給 full：只看粗體與顏色（空白的顏色不合格） */
    expect(() => validateDoc(raw, 100)).toThrow(RichTextError);
    const ok = { lines: [{ runs: [{ text: '甲', bold: false, color: '#000000', italic: true }] }] };
    expect(validateDoc(ok, 100).lines[0].runs[0]).toEqual({
      text: '甲',
      bold: false,
      color: '#000000',
    });
    for (const bad of [
      { lines: [{ runs: [r('甲', { size: 900 })] }] },
      { lines: [{ runs: [r('甲', { highlight: 'yellow' })] }] },
      { lines: [{ runs: [r('甲')], align: 'middle' }] },
      { lines: [{ runs: [r('甲', { italic: 'yes' })] }] },
    ])
      expect(() => validateDoc(bad, 100, { full: true })).toThrow(RichTextError);
  });
});

describe('排版：word 規則', () => {
  it('英數字詞不拆開、空白掛在行尾；中文照樣逐字', () => {
    const rows = layoutRich(plainDoc('hello world', ''), { width: 80, advance: one, wrap: 'word' });
    expect(rows.map((x) => x.runs.map((y) => y.text).join(''))).toEqual(['hello ', 'world']);
    expect(rows[0].trail).toBe(10);
    const zh = layoutRich(plainDoc('一二三四五六七', ''), {
      width: 50,
      advance: one,
      wrap: 'word',
    });
    expect(zh.map((x) => x.runs.map((y) => y.text).join(''))).toEqual(['一二三四五', '六七']);
  });

  it('句讀不放行首、左括號不放行尾；字詞比整行寬時逐字切', () => {
    const p = layoutRich(plainDoc('一二三四。五', ''), { width: 40, advance: one, wrap: 'word' });
    expect(p.map((x) => x.runs.map((y) => y.text).join(''))).toEqual(['一二三', '四。五']);
    const q = layoutRich(plainDoc('一二三「四', ''), { width: 40, advance: one, wrap: 'word' });
    expect(q.map((x) => x.runs.map((y) => y.text).join(''))).toEqual(['一二三', '「四']);
    const long = layoutRich(plainDoc('abcdefghij', ''), { width: 40, advance: one, wrap: 'word' });
    expect(long.map((x) => x.runs.map((y) => y.text).join(''))).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('每一行記得段落與是不是最後一行；字寬用片段的字級', () => {
    const d: RichDoc = { lines: [{ runs: [r('一二', { size: 20 }), r('三')] }, { runs: [] }] };
    const rows = layoutRich(d, {
      width: 100,
      advance: (_c, _b, run) => run.size ?? 10,
      wrap: 'word',
    });
    expect(rows.map((x) => [x.line, x.last, x.width])).toEqual([
      [0, true, 50],
      [1, true, 0],
    ]);
  });

  it('左右對齊可以撐開的位置：英數字詞裡面不撐開', () => {
    expect(justifyOpportunity('一', '二')).toBe(true);
    expect(justifyOpportunity('a', 'b')).toBe(false);
    expect(justifyOpportunity('a', ' ')).toBe(true);
    expect(justifyOpportunity('a', '一')).toBe(true);
  });

  it('英數字詞與緊接的 ASCII 標點、連續的 ASCII 標點之間不撐開；中日韓文字照舊（handout-maker 驗證後）', () => {
    expect(justifyOpportunity('g', '.')).toBe(false);
    expect(justifyOpportunity('o', ',')).toBe(false);
    expect(justifyOpportunity('(', 'r')).toBe(false);
    expect(justifyOpportunity('y', ')')).toBe(false);
    expect(justifyOpportunity(')', '.')).toBe(false);
    expect(justifyOpportunity('?', '!')).toBe(false);
    expect(justifyOpportunity('3', '%')).toBe(false);
    /* 空白前後、中日韓文字與標點之間照舊可以撐開 */
    expect(justifyOpportunity(',', ' ')).toBe(true);
    expect(justifyOpportunity(' ', '(')).toBe(true);
    expect(justifyOpportunity('字', ',')).toBe(true);
    expect(justifyOpportunity('字', '，')).toBe(true);
    expect(justifyOpportunity('，', '字')).toBe(true);
    expect(justifyOpportunity('」', '字')).toBe(true);
  });
});

describe('分頁', () => {
  const rowsOf = (doc: RichDoc) => layoutRich(doc, { width: 1000, advance: one, wrap: 'word' });

  it('放不下就換頁；第二頁開頭的空行省略；最後的空行留在最後一頁（不多一頁）', () => {
    const doc = plainDoc('一\n二\n三\n\n\n四\n\n', '');
    const res = paginateRows(doc, rowsOf(doc), { pageHeight: () => 30, rowHeight: () => 10 });
    expect(res.pages.map((p) => docText(sliceDoc(doc, p.start, p.end)))).toEqual([
      '一\n二\n三',
      '四\n\n',
    ]);
    expect(res.capped).toBe(false);
  });

  it('從新的一頁開始的段落：這一頁有字時換頁；連續兩個分頁之間是空白的一頁', () => {
    const doc: RichDoc = {
      lines: [
        { runs: [r('一')] },
        { runs: [], pageBreak: true },
        { runs: [r('二')], pageBreak: true },
      ],
    };
    const res = paginateRows(doc, rowsOf(doc), { pageHeight: () => 100, rowHeight: () => 10 });
    expect(res.pages.map((p) => [p.from, p.to])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('第一頁放不下一行：第一頁沒有本文；頁數上限', () => {
    const doc = plainDoc('一\n二\n三', '');
    const res = paginateRows(doc, rowsOf(doc), {
      pageHeight: (i) => (i === 0 ? 5 : 10),
      rowHeight: () => 10,
      minFirst: 10,
      maxPages: 3,
    });
    expect(res.pages.map((p) => p.to - p.from)).toEqual([0, 1, 1]);
    expect(res.capped).toBe(true);
  });

  it('段落中間切開：continued 與 openEnd', () => {
    const doc = plainDoc('一二三四五六', '');
    const rows = layoutRich(doc, { width: 20, advance: one, wrap: 'word' });
    const res = paginateRows(doc, rows, { pageHeight: () => 20, rowHeight: () => 10 });
    expect(res.pages.map((p) => [p.continued, p.openEnd])).toEqual([
      [false, true],
      [true, false],
    ]);
  });
});

describe('編輯：完整格式', () => {
  it('換成純文字：新段落跟著原本那一段的對齊、不帶分頁；格式用給的', () => {
    const d: RichDoc = { lines: [{ runs: [r('一二三')], align: 'center', pageBreak: true }] };
    const res = replaceText(d, 1, 2, 'X\nY', { bold: true, color: '#ff0000' });
    expect(res.caret).toBe(4);
    expect(res.doc.lines).toEqual([
      {
        runs: [r('一'), { text: 'X', bold: true, color: '#ff0000' }],
        align: 'center',
        pageBreak: true,
      },
      { runs: [{ text: 'Y', bold: true, color: '#ff0000' }, r('三')], align: 'center' },
    ]);
  });

  it('分頁：游標在段落中間時切開、後面從新的一頁開始；在段落開頭時直接設定', () => {
    const d = plainDoc('一二\n三', '');
    const mid = insertPageBreak(d, 1, 1);
    expect(docText(mid.doc)).toBe('一\n二\n三');
    expect(mid.doc.lines.map((l) => !!l.pageBreak)).toEqual([false, true, false]);
    expect(mid.caret).toBe(2);
    const start = insertPageBreak(d, 3, 3);
    expect(docText(start.doc)).toBe('一二\n三');
    expect(start.doc.lines[1].pageBreak).toBe(true);
    expect(setPageBreak(start.doc, 1, false).lines[1].pageBreak).toBeUndefined();
    /* 全文最開頭：沒有作用（原樣回傳，不設分頁、不刪選取的字） */
    for (const [a, b] of [
      [0, 0],
      [0, 1],
    ]) {
      const head = insertPageBreak(d, a, b);
      expect(head.doc).toBe(d);
      expect(head.caret).toBe(0);
    }
  });

  it('段落對齊：選取範圍碰到的段落；拿掉＝跟著整體', () => {
    const d = plainDoc('一\n二\n三', '');
    const a = setLineAlign(d, 0, 2, 'right');
    expect(a.lines.map((l) => l.align)).toEqual(['right', 'right', undefined]);
    expect(lineAlignIn(a, 0, 0)).toBe('right');
    expect(lineAlignIn(a, 0, 5)).toBeUndefined();
    expect(lineAlignIn(setLineAlign(a, 0, 0, null), 0, 0)).toBeNull();
    expect(lineIndexAt(d, 2)).toBe(1);
    expect(lineStartOf(d, 2)).toBe(4);
  });

  it('套用格式：開關、螢光筆、字級、字型、清除格式', () => {
    const d = plainDoc('一二三', '');
    const a = applyRichFormat(d, 0, 2, { italic: 'toggle', highlight: '#FFF0A8', size: 40 });
    expect(a.lines[0].runs).toEqual([
      r('一二', { italic: true, highlight: '#fff0a8', size: 40 }),
      r('三'),
    ]);
    const b = applyRichFormat(a, 0, 3, { italic: 'toggle' });
    expect(b.lines[0].runs.every((x) => x.italic)).toBe(true);
    const c = applyRichFormat(b, 0, 3, { clear: true });
    expect(sameDoc(c, d)).toBe(true);
    const f = applyRichFormat(d, 1, 2, { font: 'Huninn', strike: true });
    expect(f.lines[0].runs[1]).toEqual(r('二', { strike: true, font: 'Huninn' }));
    expect(applyRichFormat(f, 1, 2, { font: null, strike: false }).lines[0].runs).toEqual([
      r('一二三'),
    ]);
  });

  it('範圍的格式（工具列的狀態）；游標處的格式', () => {
    const d: RichDoc = {
      lines: [
        { runs: [r('一', { bold: true, size: 40 }), r('二', { bold: true })] },
        { runs: [r('三')] },
      ],
    };
    expect(rangeMarks(d, 0, 2)).toEqual({
      bold: true,
      italic: false,
      strike: false,
      color: '',
      highlight: '',
      size: null,
      font: '',
    });
    expect(rangeMarks(d, 1, 1).size).toBe(40);
    expect(styleAtCaret(d, 2)).toEqual({ bold: true, color: '' });
    expect(styleAtCaret(d, 3)).toEqual({ bold: false, color: '' });
    expect(styleAtCaret(d, 0)).toEqual({ bold: true, color: '', size: 40 });
  });
});

describe('底線（選填；speech-bubble 加的，沒有底線的資料與以前相同）', () => {
  it('整理、切開都保留底線；沒有底線時不出現', () => {
    const d = normalizeDoc({
      lines: [{ runs: [r('甲', { underline: true }), r('乙', { underline: true }), r('丙')] }],
    });
    expect(d.lines[0].runs).toEqual([r('甲乙', { underline: true }), r('丙')]);
    expect(sliceDoc(d, 1, 2).lines[0].runs).toEqual([r('乙', { underline: true })]);
    expect(Object.keys(normalizeDoc(plainDoc('甲', '')).lines[0].runs[0])).not.toContain(
      'underline',
    );
    expect(sameDoc(d, plainDoc('甲乙丙', ''))).toBe(false);
  });

  it('檢查外來的資料：full 時留下 true 的底線，其他的值當作沒有（不丟錯）；不給 full 時丟掉', () => {
    const raw = { lines: [{ runs: [r('甲', { underline: true }), r('乙', { underline: 'x' })] }] };
    expect(validateDoc(raw, 100, { full: true }).lines[0].runs).toEqual([
      r('甲', { underline: true }),
      r('乙'),
    ]);
    const plain = {
      lines: [{ runs: [{ text: '甲', bold: false, color: '#000000', underline: true }] }],
    };
    expect(validateDoc(plain, 100).lines[0].runs[0]).toEqual({
      text: '甲',
      bold: false,
      color: '#000000',
    });
  });

  it('套用：切換、設定、清除格式；範圍的格式只有全部有底線時才出現 underline', () => {
    const d = plainDoc('一二三', '');
    const a = applyRichFormat(d, 0, 2, { underline: 'toggle' });
    expect(a.lines[0].runs).toEqual([r('一二', { underline: true }), r('三')]);
    expect(applyRichFormat(a, 0, 3, { underline: 'toggle' }).lines[0].runs).toEqual([
      r('一二三', { underline: true }),
    ]);
    expect(applyRichFormat(a, 0, 2, { underline: 'toggle' }).lines[0].runs).toEqual([r('一二三')]);
    expect(applyRichFormat(a, 0, 3, { clear: true }).lines[0].runs).toEqual([r('一二三')]);
    expect(applyRichFormat(a, 1, 3, { underline: false }).lines[0].runs).toEqual([
      r('一', { underline: true }),
      r('二三'),
    ]);
    expect(rangeMarks(a, 0, 2).underline).toBe(true);
    expect(rangeMarks(a, 0, 3).underline).toBeUndefined();
    expect(rangeMarks(a, 1, 1).underline).toBe(true);
    expect(styleAtCaret(a, 2)).toEqual({ bold: false, color: '', underline: true });
    /* 沒有底線的範圍：和以前一樣只有原本的欄位 */
    expect(Object.keys(rangeMarks(d, 0, 3))).toEqual([
      'bold',
      'italic',
      'strike',
      'color',
      'highlight',
      'size',
      'font',
    ]);
  });
});
