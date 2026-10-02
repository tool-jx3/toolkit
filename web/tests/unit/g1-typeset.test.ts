/**
 * core/typeset 的 G1 擴充：放大填滿、水平縮放、底線與刪除線、韓文拆字與逐字步驟（打字機附件 T01～T03、T10）、
 * 以字素切字。
 */
import { describe, expect, it } from 'vitest';
import {
  breakText,
  countGraphemes,
  decorationThickness,
  hangulSteps,
  isWide,
  type MeasureFn,
  splitChars,
  splitGraphemes,
  textDecorationRect,
  typeset,
  typesetToFill,
  typingSteps,
  typingVisibleAt,
} from '@/core/typeset';
import examples from '../../../docs/refactor/specs/typewriter.examples.json';

const fake: MeasureFn = (font, ch) => {
  const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 16);
  const wide = isWide(ch);
  const w = ch === ' ' ? 0.3 * size : wide ? size : 0.5 * size;
  return { w, l: 0, r: w, a: wide ? 0.8 * size : 0.7 * size, d: wide ? 0.1 * size : 0 };
};
const font = (px: number) => `700 ${px.toFixed(2)}px "Test", serif`;

const tw = examples as unknown as {
  打字: {
    編號: string;
    設定: { 文字: string; 出現方向: string; 淡出: string };
    逐格: { 畫面文字: string }[];
  }[];
};

describe('放大填滿', () => {
  it('在 92% 範圍內取最大字級（精度 0.1 px），外框（字級的倍數）算進去', () => {
    const r = typesetToFill(
      { main: '測試', mainFont: font, measure: fake, leading: 1.1 },
      { width: 480, height: 480, padPerSize: 0.09 },
    );
    expect(r.fits).toBe(true);
    const pad = 0.09 * r.size;
    const w = r.block.w + 2 * pad;
    expect(w).toBeLessThanOrEqual(480 * 0.92 + 1e-6);
    /* 再大 0.1 px 就放不下 */
    expect((r.size + 0.1) * (2 + 0.18)).toBeGreaterThan(480 * 0.92);
    expect(r.size).toBeCloseTo((480 * 0.92) / 2.18, 0);
  });

  it('多行時看高度；字級上限（長邊 × 1.2）與下限（8，放不下時 fits＝false）', () => {
    const two = typesetToFill(
      { main: '甲\n乙', mainFont: font, measure: fake, leading: 1.1 },
      { width: 480, height: 480 },
    );
    expect(two.block.h).toBeLessThanOrEqual(480 * 0.92 + 1e-6);
    expect(two.block.h).toBeGreaterThan(480 * 0.92 - 1);
    const one = typesetToFill(
      { main: 'i', mainFont: font, measure: fake },
      { width: 100, height: 4000 },
    );
    expect(one.size).toBeLessThanOrEqual(4000 * 1.2);
    const tiny = typesetToFill(
      { main: '很長很長很長很長很長很長很長很長很長很長很長很長', mainFont: font, measure: fake },
      { width: 64, height: 64 },
    );
    expect(tiny.fits).toBe(false);
    expect(tiny.size).toBe(8);
  });

  it('boxOf：自訂比較的框（例如行數 × 字級 × 行距）', () => {
    const r = typesetToFill(
      { main: '甲\n乙', mainFont: font, measure: fake, leading: 1.4 },
      {
        width: 480,
        height: 480,
        boxOf: (x) => ({ w: x.block.w, h: x.lines.main.length * x.size * 1.4 }),
      },
    );
    expect(2 * r.size * 1.4).toBeLessThanOrEqual(480 * 0.92 + 1e-6);
    expect(2 * (r.size + 0.1) * 1.4).toBeGreaterThan(480 * 0.92);
  });
});

describe('水平縮放', () => {
  it('x 座標與寬度乘上 scaleX（等於在較寬的畫面排版再整個壓扁）', () => {
    const base = typeset({
      main: 'AB\nC',
      size: 40,
      mainFont: font,
      measure: fake,
      align: 'start',
    });
    const half = typeset({
      main: 'AB\nC',
      size: 40,
      mainFont: font,
      measure: fake,
      align: 'start',
      scaleX: 0.5,
    });
    expect(half.block.w).toBe(base.block.w * 0.5);
    expect(half.block.h).toBe(base.block.h);
    expect(half.block.scaleX).toBe(0.5);
    half.block.glyphs.forEach((g, i) => {
      expect(g.x).toBeCloseTo(base.block.glyphs[i].x * 0.5, 9);
      expect(g.y).toBe(base.block.glyphs[i].y);
    });
    expect(base.block.scaleX).toBeUndefined();
  });
});

describe('底線與刪除線', () => {
  it('橫書 48 px：底線在字身框上緣往下 1.05 × 字級、粗 2.88；刪除線在 0.5 × 字級', () => {
    const top = 10;
    const pivotY = top + 24;
    const u = textDecorationRect('underline', 30, { size: 48, tracking: 5 });
    expect(pivotY + u.y).toBeCloseTo(60.4, 6);
    expect(pivotY + u.y + u.h).toBeCloseTo(63.28, 6);
    expect(u.w).toBe(35);
    expect(u.x).toBe(-15);
    const s = textDecorationRect('strike', 30, { size: 48 });
    expect(pivotY + s.y).toBe(34);
    expect(decorationThickness(10)).toBe(1);
  });

  it('直書：底線是字右側 0.55 × 字級的直條；沿路徑：底邊下 0.1、刪除線底邊上 0.4', () => {
    const v = textDecorationRect('underline', 48, { size: 48, tracking: 4, vertical: true });
    expect(v).toEqual({ x: 48 * 0.55, y: -24, w: 2.88, h: 52 });
    const p = textDecorationRect('underline', 30, { size: 40, mode: 'path' });
    expect(p.y).toBeCloseTo(24, 9);
    const ps = textDecorationRect('strike', 30, { size: 40, mode: 'path' });
    expect(ps.y).toBeCloseTo(4, 9);
  });
});

describe('韓文拆字與逐字步驟', () => {
  it('音節分 2～3 步', () => {
    expect(hangulSteps('한')).toEqual(['ㅎ', '하', '한']);
    expect(hangulSteps('가')).toEqual(['ㄱ', '가']);
    expect(hangulSteps('글')).toEqual(['ㄱ', '그', '글']);
    expect(hangulSteps('A')).toEqual(['A']);
  });

  it.each(['T01', 'T02', 'T03', 'T10'])('%s：每格看得到的文字與附件相同', (id) => {
    const ex = tw.打字.find((e) => e.編號 === id)!;
    const chars = Array.from(ex.設定.文字);
    const steps = typingSteps(chars, { reverse: ex.設定.出現方向 === '反向' });
    expect(steps).toHaveLength(ex.逐格.length);
    ex.逐格.forEach((f, k) => {
      const shown = typingVisibleAt(chars, steps, k + 1)
        .filter((c) => c !== null)
        .join('');
      expect(shown).toBe(f.畫面文字);
    });
  });
});

describe('以字素切字', () => {
  it('ZWJ 表情符號、旗幟、組合字元算一個字；碼位模式維持舊行為', () => {
    const text = '👨‍👩‍👧é🇹🇼𪜶字';
    expect(splitGraphemes(text)).toEqual(['👨‍👩‍👧', 'é', '🇹🇼', '𪜶', '字']);
    expect(countGraphemes(text)).toBe(5);
    expect(splitChars('𪜶字', 'codepoint')).toEqual(['𪜶', '字']);
    const lines = breakText('👍🏽好', { unit: () => 1, segment: 'grapheme' });
    expect(lines).toEqual([['👍🏽', '好']]);
    const r = typeset({
      main: '👍🏽好',
      size: 20,
      mainFont: font,
      measure: fake,
      segment: 'grapheme',
    });
    expect(r.block.glyphs.map((g) => g.ch)).toEqual(['👍🏽', '好']);
  });
});
