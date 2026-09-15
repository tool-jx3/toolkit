import { describe, expect, it } from 'vitest';
import { layoutText, strokeAllowanceOf, type TextMeasurer } from '../src/core/text/layout';
import { FONTS } from '../src/core/fonts';

/** 実フォントの代わりに、書体ごとに字幅比を変えたスタブで測る */
function stub(widthRatio: number, letterSpacing = 0): TextMeasurer {
  return {
    measure(line, size) {
      const n = Array.from(line).length;
      if (n === 0) return 0;
      return n * size * widthRatio + letterSpacing * size * (n - 1);
    },
  };
}

const RATIOS: Record<string, number> = {
  'noto-black': 1.0,
  'mplus-round': 1.0,
  reggae: 1.05,
  rocknroll: 0.98,
  'shippori-b1': 1.0,
  dotgothic: 1.0,
};

describe('layoutText', () => {
  const sizes = [
    { w: 480, h: 480 },
    { w: 1200, h: 300 },
    { w: 320, h: 320 },
  ];
  const samples = ['あ', '成功', '決定的成功', 'あいうえおかきくけこさしすせそたちつてと'];

  for (const font of FONTS) {
    for (const { w, h } of sizes) {
      for (const text of samples) {
        for (const lineCount of [1, 2, 3]) {
          it(`${font.id} ${w}x${h} "${text}" ×${lineCount}行 が枠内に収まる`, () => {
            const lines = new Array(lineCount).fill(text);
            const allowance = strokeAllowanceOf(
              [{ type: 'stroke', widthRatio: 0.1 }, { type: 'stroke', widthRatio: 0.04 }],
              font.strokeScale,
            );
            const m = stub(RATIOS[font.id]);
            const layout = layoutText(
              { lines, boxW: w, boxH: h, lineHeight: 1.1, scale: 1, strokeAllowance: allowance },
              m,
            );
            const pad = layout.fontSize * allowance * 2;
            const maxW = Math.max(...layout.lineWidths);
            expect(maxW + pad).toBeLessThanOrEqual(w * 0.92 + 0.01);
            expect(layout.box.h + pad).toBeLessThanOrEqual(h * 0.92 + 0.01);
            expect(layout.fontSize).toBeGreaterThan(0);
            // 中央揃えになっていること
            expect(layout.box.x + layout.box.w / 2).toBeCloseTo(w / 2, 5);
            expect(layout.box.y + layout.box.h / 2).toBeCloseTo(h / 2, 5);
          });
        }
      }
    }
  }

  it('文字数が増えるとフォントサイズは単調に小さくなる', () => {
    const m = stub(1);
    const size = (text: string) =>
      layoutText({ lines: [text], boxW: 480, boxH: 480, lineHeight: 1.1, scale: 1, strokeAllowance: 0.1 }, m).fontSize;
    expect(size('あ')).toBeGreaterThan(size('ああ'));
    expect(size('ああ')).toBeGreaterThan(size('あああああ'));
  });

  it('scale は基準サイズに掛かる', () => {
    const m = stub(1);
    const base = layoutText({ lines: ['成功'], boxW: 480, boxH: 480, lineHeight: 1.1, scale: 1, strokeAllowance: 0 }, m);
    const half = layoutText({ lines: ['成功'], boxW: 480, boxH: 480, lineHeight: 1.1, scale: 0.5, strokeAllowance: 0 }, m);
    expect(half.fontSize).toBeCloseTo(base.fontSize * 0.5, 5);
  });
});
