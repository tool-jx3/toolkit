/**
 * core/scene 的格式化文字節點（rich）的完整格式（短文圖片產生器加的）：置中、靠右（行尾空白不算）、左右對齊
 * （段落最後一行靠左、openEnd 時撐滿）、段落自己的對齊優先、不同字級的行高與基線、螢光筆與刪除線的位置、
 * 片段字型的收集。沒有完整格式的節點走原本的排版（沒有 rowBoxes、marks）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { plainDoc, type RichDoc } from '@/core/richtext';
import {
  clearTextCache,
  collectFonts,
  layoutRichNode,
  type RichNode,
  STRIKE_POSITION,
  usesFullRich,
} from '@/core/scene';

/** 假的 canvas：每個字寬＝字級、字身框上 0.8、下 0.2 */
function fakeCtx(): CanvasRenderingContext2D {
  let font = '';
  return {
    get font() {
      return font;
    },
    set font(v: string) {
      font = v;
    },
    measureText(t: string) {
      const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
      return {
        width: Array.from(t).length * size,
        fontBoundingBoxAscent: size * 0.8,
        fontBoundingBoxDescent: size * 0.2,
      };
    },
  } as unknown as CanvasRenderingContext2D;
}

const node = (doc: RichDoc, more: Partial<RichNode> = {}): RichNode => ({
  kind: 'rich',
  x: 0,
  y: 0,
  w: 100,
  h: 1000,
  doc,
  font: { family: 'T', size: 10, weight: 400 },
  lineHeight: 2,
  color: '#111111',
  wrap: 'word',
  ...more,
});

const xs = (lay: ReturnType<typeof layoutRichNode>, from = 0, to = 99) =>
  lay.glyphs.slice(from, to).map((g) => Math.round(g.x * 100) / 100);

beforeEach(() => clearTextCache());

describe('對齊', () => {
  it('置中、靠右（行尾空白不算進行寬）', () => {
    const ctx = fakeCtx();
    expect(xs(layoutRichNode(ctx, node(plainDoc('一二', ''), { align: 'center' })))).toEqual([
      40, 50,
    ]);
    expect(xs(layoutRichNode(ctx, node(plainDoc('ab ', ''), { align: 'right' })), 0, 2)).toEqual([
      80, 90,
    ]);
  });

  it('左右對齊：撐滿到欄寬；段落最後一行靠左；openEnd 時最後一行也撐滿', () => {
    const ctx = fakeCtx();
    const doc = plainDoc('一二三四五六', '');
    const lay = layoutRichNode(ctx, node(doc, { w: 45, align: 'justify' }));
    expect(xs(lay, 0, 4)).toEqual([0, 11.67, 23.33, 35]);
    expect(xs(lay, 4, 6)).toEqual([0, 10]);
    const open = layoutRichNode(ctx, node(doc, { w: 45, align: 'justify', openEnd: true }));
    expect(xs(open, 4, 6)).toEqual([0, 35]);
  });

  it('段落自己的對齊優先', () => {
    const ctx = fakeCtx();
    const doc: RichDoc = {
      lines: [
        { runs: [{ text: '一', bold: false, color: '' }], align: 'right' },
        { runs: [{ text: '二', bold: false, color: '' }] },
      ],
    };
    const lay = layoutRichNode(ctx, node(doc, { align: 'center' }));
    expect(xs(lay)).toEqual([90, 45]);
  });
});

describe('行高與裝飾', () => {
  it('不同字級：行框以基線對齊，一行從最高到最低；字的顏色空白時用節點的顏色', () => {
    const ctx = fakeCtx();
    const doc: RichDoc = {
      lines: [
        {
          runs: [
            { text: '一', bold: false, color: '', size: 20 },
            { text: '二', bold: false, color: '#ff0000' },
          ],
        },
        { runs: [{ text: '三', bold: false, color: '' }] },
      ],
    };
    const lay = layoutRichNode(ctx, node(doc));
    expect(lay.rowBoxes).toEqual([
      { top: 0, height: 40 },
      { top: 40, height: 20 },
    ]);
    expect(lay.glyphs.map((g) => [g.baseline, g.size, g.color])).toEqual([
      [26, 20, '#111111'],
      [26, 10, '#ff0000'],
      [53, 10, '#111111'],
    ]);
  });

  it('螢光筆蓋住相鄰同色的字（含左右對齊的空隙）；刪除線在基線上方', () => {
    const ctx = fakeCtx();
    const doc: RichDoc = {
      lines: [
        {
          runs: [
            { text: '一二', bold: false, color: '', highlight: '#fff0a8' },
            { text: '三', bold: false, color: '', strike: true },
          ],
        },
      ],
    };
    const lay = layoutRichNode(ctx, node(doc));
    const hl = lay.marks?.find((m) => m.kind === 'highlight');
    const st = lay.marks?.find((m) => m.kind === 'strike');
    expect(hl).toMatchObject({ x: 0, w: 20, y: 5, h: 10, color: '#fff0a8' });
    expect(st?.x).toBe(20);
    expect(st?.w).toBe(10);
    expect(Math.abs((st?.y ?? 0) + (st?.h ?? 0) / 2 - (13 - 10 * STRIKE_POSITION))).toBeLessThan(
      1e-9,
    );
  });

  it('框高放不下時只畫放得下的行（至少一行）', () => {
    const ctx = fakeCtx();
    const lay = layoutRichNode(ctx, node(plainDoc('一\n二\n三', ''), { h: 45 }));
    expect(lay.shown).toBe(2);
  });
});

describe('相容', () => {
  it('沒有完整格式的節點走原本的排版', () => {
    const n = node(plainDoc('一二', '#000000'), { wrap: undefined, color: undefined });
    expect(usesFullRich(n)).toBe(false);
    const lay = layoutRichNode(fakeCtx(), n);
    expect(lay.rowBoxes).toBeUndefined();
    expect(lay.marks).toBeUndefined();
    expect(
      usesFullRich(node(plainDoc('一二', '#000000'), { wrap: undefined, align: 'center' })),
    ).toBe(true);
  });

  it('要載入的字型：片段的字型另算', () => {
    const doc: RichDoc = {
      lines: [
        {
          runs: [
            { text: '甲', bold: false, color: '' },
            { text: '乙', bold: true, color: '', font: 'U' },
          ],
        },
      ],
    };
    expect(collectFonts([node(doc)])).toEqual([
      { family: 'T', weight: 400, text: '甲' },
      { family: 'U', weight: 700, text: '乙' },
    ]);
  });
});
