/**
 * core/richtext：格式化文字的資料（建立、全文、切開、接起來、檢查）、套用格式，以及文字記錄用的排版規則
 * （逐字累加、句讀不放行首、每段首行縮排、接續的段落不縮排、壓縮後判斷寬度、放不下時切開）。
 */
import { describe, expect, it } from 'vitest';
import {
  applyRichFormat,
  docLength,
  docText,
  isRangeBold,
  joinDocs,
  layoutRich,
  NO_LINE_START,
  normalizeDoc,
  plainDoc,
  type RichDoc,
  RichTextError,
  recolorLines,
  rowsThatFit,
  sameDoc,
  sliceDoc,
  splitRich,
  validateDoc,
} from '@/core/richtext';

const run = (text: string, bold = false, color = '#323232') => ({ text, bold, color });
const one =
  (w = 10) =>
  () =>
    w;

describe('資料', () => {
  it('純文字 → 格式化文字：每行一項、空行沒有片段、顏色轉小寫', () => {
    const d = plainDoc('甲乙\r\n\n丙', '#AABBCC');
    expect(d.lines).toEqual([
      { runs: [run('甲乙', false, '#aabbcc')] },
      { runs: [] },
      { runs: [run('丙', false, '#aabbcc')] },
    ]);
    expect(docText(d)).toBe('甲乙\n\n丙');
    expect(docLength(d)).toBe(5);
  });

  it('切開與接起來：換行算一個字、格式保留、相同格式的片段合併', () => {
    const d: RichDoc = {
      lines: [{ runs: [run('甲乙', true), run('丙')] }, { runs: [run('丁戊')] }],
    };
    expect(docText(sliceDoc(d, 1, 4))).toBe('乙丙\n');
    expect(sliceDoc(d, 1, 3).lines[0].runs).toEqual([run('乙', true), run('丙')]);
    expect(docText(sliceDoc(d, 3))).toBe('\n丁戊');
    const j = joinDocs(sliceDoc(d, 0, 2), sliceDoc(d, 2));
    expect(sameDoc(j, d)).toBe(true);
    expect(joinDocs(plainDoc('甲'), plainDoc('乙')).lines[0].runs).toEqual([
      run('甲乙', false, '#363636'),
    ]);
  });

  it('檢查外來的資料：結構、換行、粗體、色碼、字數上限', () => {
    expect(
      validateDoc({ lines: [{ runs: [run('甲', false, '#ABCDEF')] }] }).lines[0].runs[0].color,
    ).toBe('#abcdef');
    for (const bad of [
      null,
      { lines: [] },
      { lines: [{ runs: [{ text: '甲\n', bold: false, color: '#000000' }] }] },
      { lines: [{ runs: [{ text: '甲', bold: 1, color: '#000000' }] }] },
      { lines: [{ runs: [{ text: '甲', bold: false, color: 'red' }] }] },
      { lines: [{}] },
    ])
      expect(() => validateDoc(bad)).toThrow(RichTextError);
    expect(() => validateDoc(plainDoc('一二三四五'), 4)).toThrow(/4 字/);
    expect(validateDoc(plainDoc('一二三四'), 4).lines.length).toBe(1);
  });

  it('整理：去掉空片段、合併相鄰的同格式', () => {
    expect(
      normalizeDoc({ lines: [{ runs: [run(''), run('甲'), run('乙')] }] }).lines[0].runs,
    ).toEqual([run('甲乙')]);
  });

  it('整行換色（例如引言行）', () => {
    const d = recolorLines(plainDoc('甲\n──乙'), (t) => t.startsWith('──'), '#888888');
    expect(d.lines[0].runs[0].color).toBe('#363636');
    expect(d.lines[1].runs[0].color).toBe('#888888');
  });
});

describe('套用格式', () => {
  const d: RichDoc = { lines: [{ runs: [run('甲乙丙')] }, { runs: [run('丁戊', true)] }] };

  it('範圍內設成粗體、換色；換行不受影響', () => {
    const b = applyRichFormat(d, 1, 2, { bold: true });
    expect(b.lines[0].runs).toEqual([run('甲'), run('乙', true), run('丙')]);
    const c = applyRichFormat(d, 2, 5, { color: '#FF0000' });
    expect(c.lines[0].runs).toEqual([run('甲乙'), run('丙', false, '#ff0000')]);
    expect(c.lines[1].runs).toEqual([run('丁', true, '#ff0000'), run('戊', true)]);
    expect(docText(c)).toBe(docText(d));
  });

  it('toggle：範圍全是粗體時取消，否則全部設成粗體', () => {
    expect(isRangeBold(d, 4, 6)).toBe(true);
    expect(applyRichFormat(d, 4, 6, { bold: 'toggle' }).lines[1].runs).toEqual([run('丁戊')]);
    expect(isRangeBold(d, 2, 5)).toBe(false);
    expect(isRangeBold(applyRichFormat(d, 2, 5, { bold: 'toggle' }), 2, 5)).toBe(true);
    expect(applyRichFormat(d, 3, 3, { bold: true })).toBe(d);
  });
});

describe('排版', () => {
  it('逐字累加：加上這個字會超過欄寬就換行；每段第一行縮排', () => {
    const rows = layoutRich(plainDoc('一二三四五六七\n八九'), {
      width: 50,
      advance: one(),
      indent: 20,
    });
    expect(rows.map((r) => r.runs.map((x) => x.text).join(''))).toEqual([
      '一二三',
      '四五六七',
      '八九',
    ]);
    expect(rows.map((r) => [r.start, r.end, r.indent])).toEqual([
      [0, 3, 20],
      [3, 7, 0],
      [8, 10, 20],
    ]);
  });

  it('句讀與右括號不放行首：連同前一個字一起換行', () => {
    const rows = layoutRich(plainDoc('一二三四。」五'), { width: 50, advance: one() });
    expect(rows.map((r) => r.runs.map((x) => x.text).join(''))).toEqual(['一二三', '四。」五']);
    for (const ch of '。，、！？」』）】〉》.,!?…:;)]') expect(NO_LINE_START.has(ch)).toBe(true);
  });

  it('接續上一頁的段落：第一行不縮排', () => {
    const rows = layoutRich(plainDoc('一二\n三'), {
      width: 100,
      advance: one(),
      indent: 30,
      continued: true,
    });
    expect(rows.map((r) => r.indent)).toEqual([0, 30]);
  });

  it('壓縮：以壓縮後的寬度判斷換行', () => {
    const plain = layoutRich(plainDoc('一二三四五六'), { width: 55, advance: one() });
    const squeezed = layoutRich(plainDoc('一二三四五六'), {
      width: 55,
      advance: one(),
      scaleX: 0.9,
    });
    expect(plain[0].end).toBe(5);
    expect(squeezed[0].end).toBe(6);
  });

  it('粗體用粗體量寬度', () => {
    const doc: RichDoc = { lines: [{ runs: [run('一二', true), run('三四')] }] };
    const rows = layoutRich(doc, { width: 35, advance: (_ch, bold) => (bold ? 15 : 10) });
    expect(rows[0].runs).toEqual([{ ...run('一二', true), width: 30 }]);
    expect(rows[1].runs).toEqual([{ ...run('三四'), width: 20 }]);
  });

  it('放不下時從第一個放不下的行的開頭切開', () => {
    const doc = plainDoc('一二三四五六七八九');
    const rows = layoutRich(doc, { width: 30, advance: one() });
    expect(rowsThatFit(66, 22)).toBe(3);
    expect(rowsThatFit(10, 22)).toBe(1);
    const cut = splitRich(doc, rows, 2);
    expect(docText(cut?.before ?? plainDoc(''))).toBe('一二三四五六');
    expect(docText(cut?.after ?? plainDoc(''))).toBe('七八九');
    expect(cut?.continued).toBe(true);
    expect(splitRich(doc, rows, 3)).toBeNull();
    /* 切在段落的開頭：不是接續 */
    const doc2 = plainDoc('一二三\n四五');
    const cut2 = splitRich(doc2, layoutRich(doc2, { width: 30, advance: one() }), 1);
    expect(docText(cut2?.after ?? plainDoc(''))).toBe('四五');
    expect(cut2?.continued).toBe(false);
  });
});
