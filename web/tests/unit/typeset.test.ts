import { describe, expect, it } from 'vitest';
import {
  anchorRatio,
  availableArea,
  breakText,
  canvasFont,
  composeBlock,
  fontStack,
  indexVisible,
  isHangul,
  isWide,
  layoutGroup,
  type MeasureFn,
  Meter,
  NO_LINE_END,
  NO_LINE_START,
  nearestWeightUp,
  overflowRatio,
  placeBox,
  shrinkSize,
  typeset,
  typesetToFit,
  wrapChars,
} from '@/core/typeset';

/** 假的量測：全形字＝1 個字級寬，半形＝0.5，空白＝0.3；全形字的墨跡上緣 0.8、下緣 0.1 */
const fake: MeasureFn = (font, ch) => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const wide = isWide(ch);
  const w = ch === ' ' ? 0.3 * size : wide ? size : 0.5 * size;
  return { w, l: 0, r: w, a: wide ? 0.8 * size : 0.7 * size, d: wide ? 0.1 * size : 0 };
};
const font = (px: number) => `700 ${px.toFixed(2)}px "Test", serif`;
const meter = (size: number, sample = '永') => new Meter(font(size), size, sample, fake);
/** 依字數斷行的寬度：全形 1、半形 0.5 */
const unit = (ch: string) => (isWide(ch) ? 1 : 0.5);
const join = (lines: string[][]) => lines.map((l) => l.join(''));

describe('字元分類', () => {
  it('全形與韓文', () => {
    expect(isWide('永')).toBe(true);
    expect(isWide('Ａ')).toBe(true);
    expect(isWide('A')).toBe(false);
    expect(isWide('…')).toBe(true);
    expect(isWide('😀')).toBe(true);
    expect(isHangul('한')).toBe(true);
    expect(isHangul('漢')).toBe(false);
  });
  it('行首、行尾禁則', () => {
    for (const ch of '，。、」』）！？…ー') expect(NO_LINE_START.has(ch)).toBe(true);
    expect(NO_LINE_START.has('ッ')).toBe(true);
    for (const ch of '「『（【《') expect(NO_LINE_END.has(ch)).toBe(true);
  });
});

describe('量測', () => {
  it('字身中心：中文用「永」、純西文用 H', () => {
    expect(meter(100, '中文').central).toBeCloseTo(35);
    expect(meter(100, 'ABC').central).toBeCloseTo(35);
  });
  it('同一個字只量一次', () => {
    let n = 0;
    const m = new Meter(font(10), 10, '', (f, c) => {
      n++;
      return fake(f, c);
    });
    m.get('a');
    m.get('a');
    expect(n).toBe(2); // 建立時量一次參考字＋a 一次
  });
});

describe('斷行與禁則', () => {
  it('沒有上限時不斷', () => {
    expect(join(wrapChars(Array.from('一二三四五'), 0, unit))).toEqual(['一二三四五']);
  });
  it('依字數斷行', () => {
    expect(join(wrapChars(Array.from('一二三四五六七'), 3, unit))).toEqual([
      '一二三',
      '四五六',
      '七',
    ]);
  });
  it('行首禁則的字留在上一行（允許超出）', () => {
    expect(join(wrapChars(Array.from('一二三。四五'), 3, unit))).toEqual(['一二三。', '四五']);
  });
  it('行尾的開括號帶到下一行', () => {
    expect(join(wrapChars(Array.from('一二「三四」'), 3, unit))).toEqual(['一二', '「三四」']);
  });
  it('英文單字不從中間斷開，換行後行首空白拿掉', () => {
    expect(join(wrapChars(Array.from('ab cdef gh'), 3, unit))).toEqual(['ab', 'cdef', 'gh']);
  });
  it('比一整行還長的單字才從中間斷', () => {
    expect(join(wrapChars(Array.from('abcdefghij'), 2, unit))).toEqual(['abcd', 'efgh', 'ij']);
  });
  it('保留原本的換行與空行', () => {
    expect(join(breakText('一二\n\n三', { limit: 0, unit }))).toEqual(['一二', '', '三']);
    expect(join(breakText('一二三四\r\n五', { limit: 2, unit }))).toEqual(['一二', '三四', '五']);
  });
});

describe('排版', () => {
  it('橫書：字的中心、字距、行長與範圍', () => {
    const g = layoutGroup([['一', '二'], ['A']], {
      S: 100,
      meter: meter(100),
      tracking: 0.1,
      leading: 1.5,
    });
    expect(g.glyphs.map((x) => [x.ch, x.along, x.across])).toEqual([
      ['一', 50, 50],
      ['二', 160, 50],
      ['A', 25, 200],
    ]);
    expect(g.lineInfo.map((l) => l.len)).toEqual([210, 50]);
    expect(g.extentAlong).toBe(210);
    expect(g.extentAcross).toBe(250);
  });
  it('直書：半形旋轉 90°、括號旋轉、句讀移到右上、全形一字一格', () => {
    const m = meter(100);
    const g = layoutGroup([Array.from('A「一。')], { S: 100, meter: m, vertical: true });
    const [a, q, one, dot] = g.glyphs;
    expect(a.rot0).toBeCloseTo(Math.PI / 2);
    expect(a.adv).toBe(50);
    expect(q.rot0).toBeCloseTo(Math.PI / 2);
    expect(q.adv).toBe(100);
    expect(one.rot0).toBe(0);
    expect(one.adv).toBe(100);
    expect(dot.shiftX).toBeGreaterThan(0);
    expect(dot.shiftY).toBeLessThan(0);
    const up = layoutGroup([['A']], { S: 100, meter: m, vertical: true, latinUpright: true });
    expect(up.glyphs[0].rot0).toBe(0);
    const center = layoutGroup([['。']], { S: 100, meter: m, vertical: true, punctCenter: true });
    expect(center.glyphs[0].shiftX).not.toBe(dot.shiftX);
  });
  it('組成區塊：對齊與副文字位置', () => {
    const m = meter(100);
    const main = layoutGroup([['一', '二', '三'], ['四']], { S: 100, meter: m });
    const sub = layoutGroup([['a', 'b']], { S: 30, meter: meter(30) });
    const b = composeBlock(main, sub, { align: 'start', subGap: 20 });
    expect(b.w).toBe(300);
    expect(b.h).toBe(250 + 20 + 30);
    expect(b.subBox).toEqual({ x: 0, y: 270, w: 30, h: 30 });
    const c = composeBlock(main, sub, { align: 'end', subPos: 'before', subGap: 20 });
    expect(c.mainBox.y).toBe(50);
    expect(c.glyphs[3].x).toBe(250); // 第二行靠右
    const v = composeBlock(main, null, { vertical: true, align: 'center' });
    expect(v.w).toBe(250);
    expect(v.h).toBe(300);
    expect(v.glyphs[0].x).toBe(200); // 第一行在最右邊
  });
  it('可見字編號（空白不算）', () => {
    const g = composeBlock(
      layoutGroup([Array.from('一 二'), ['三']], { S: 10, meter: meter(10) }),
      null,
    );
    expect(indexVisible(g.glyphs)).toBe(3);
    expect(g.glyphs.map((x) => [x.vis, x.lineVis, x.lineVisN])).toEqual([
      [0, 0, 2],
      [-1, undefined, 2],
      [1, 1, 2],
      [2, 0, 1],
    ]);
  });
});

describe('自動縮小與擺放', () => {
  const area = { width: 1000, height: 500, marginX: 50, marginY: 50 };
  it('可用區域與錨點', () => {
    expect(availableArea(area)).toEqual({ x: 50, y: 50, width: 900, height: 400 });
    expect(anchorRatio('bl')).toEqual({ x: 0, y: 1 });
    expect(anchorRatio('mc')).toEqual({ x: 0.5, y: 0.5 });
  });
  it('超出倍數（含外框光暈的 pad；可略過某個方向）', () => {
    expect(overflowRatio([{ w: 450, h: 200 }], area)).toBe(0.5);
    expect(overflowRatio([{ w: 1800, h: 100 }], area)).toBe(2);
    expect(overflowRatio([{ w: 950, h: 100 }], { ...area, marginX: 0, pad: 40 })).toBeCloseTo(
      1.03,
      5,
    );
    expect(overflowRatio([{ w: 100, h: 900 }], area, { ignoreY: true })).toBeCloseTo(0.111, 3);
  });
  it('縮小後的字級（乘 0.985，不小於最小字級）', () => {
    expect(shrinkSize(100, 0.8)).toEqual({ size: 100, k: 1 });
    expect(shrinkSize(100, 2).size).toBeCloseTo(49.25);
    expect(shrinkSize(100, 20, { minSize: 12 }).size).toBe(12);
    expect(shrinkSize(10, 20, { minSize: 12 }).size).toBe(10);
  });
  it('依錨點擺放，光暈會超出畫面時往內推', () => {
    expect(placeBox({ w: 100, h: 50 }, area, 'tl')).toEqual({ x: 50, y: 50 });
    expect(placeBox({ w: 100, h: 50 }, area, 'br')).toEqual({ x: 850, y: 400 });
    expect(placeBox({ w: 100, h: 50 }, { ...area, marginX: 0, pad: 30 }, 'ml')).toEqual({
      x: 30,
      y: 225,
    });
    expect(placeBox({ w: 100, h: 50 }, area, 'mc', { offsetX: -900, keepInside: false }).x).toBe(
      -450,
    );
  });
});

describe('字型字串', () => {
  it('西文字型遇到中文接同風格的繁中字型；韓文接韓文字型', () => {
    expect(
      fontStack({ family: 'Cinzel', styleClass: 'serif', latinOnly: true }, 'SAN 理智').families,
    ).toEqual(['Cinzel', 'Noto Serif TC']);
    expect(
      fontStack({ family: 'Cinzel', styleClass: 'serif', latinOnly: true }, 'SAN — CHECK').families,
    ).toEqual(['Cinzel']);
    const k = fontStack({ family: 'Noto Sans TC', styleClass: 'sans' }, '전투');
    expect(k).toEqual({ families: ['Noto Sans TC', 'Noto Sans KR'], generic: 'sans-serif' });
  });
  it('canvas 的 font 字串', () => {
    expect(canvasFont({ families: ['A B', 'C'], generic: 'serif' }, 700, 48, true)).toBe(
      'italic 700 48.00px "A B", "C", serif',
    );
  });
  it('最接近的字重：同距離取粗的', () => {
    expect(nearestWeightUp([300, 400, 700], 550)).toBe(700);
    expect(nearestWeightUp([300, 400, 700], 500)).toBe(400);
    expect(nearestWeightUp([400], 900)).toBe(400);
  });
});

describe('typeset()：一次排好主文字＋副文字', () => {
  it('依長度換行，副文字依比例縮小', () => {
    const r = typeset({
      main: '一二三四五',
      sub: 'abc',
      size: 100,
      mainFont: font,
      wrapLength: 250,
      subScale: 0.5,
      subGap: 0.2,
      measure: fake,
    });
    expect(r.lines.main.map((l) => l.join(''))).toEqual(['一二', '三四', '五']);
    expect(r.sub?.S).toBe(50);
    expect(r.block.h).toBe(2 * 150 + 100 + 20 + 50);
  });
  it('typesetToFit：放不下時縮小並沿用原本的斷行', () => {
    const r = typesetToFit(
      { main: '一二三四五六七八', size: 200, mainFont: font, measure: fake },
      { width: 1000, height: 500 },
    );
    expect(r.shrunk).toBe(true);
    expect(r.size).toBeCloseTo(200 * (1000 / 1600) * 0.985);
    expect(r.lines.main).toHaveLength(1);
    expect(r.block.w).toBeLessThanOrEqual(1000);
  });
});
