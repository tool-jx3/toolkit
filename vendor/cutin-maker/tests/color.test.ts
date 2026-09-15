import { describe, expect, it } from 'vitest';
import { createRamp, gradientLine, hslToRgb, parseColor, toHex } from '../src/core/color';

describe('color', () => {
  it('hslToRgb', () => {
    expect(toHex(hslToRgb(0, 1, 0.5))).toBe('#ff0000');
    expect(toHex(hslToRgb(120, 1, 0.5))).toBe('#00ff00');
    expect(toHex(hslToRgb(240, 1, 0.5))).toBe('#0000ff');
    expect(toHex(hslToRgb(0, 0, 1))).toBe('#ffffff');
  });

  it('parseColor は #rgb / #rrggbb / rgb() を読む', () => {
    expect(parseColor('#f00')).toEqual([255, 0, 0]);
    expect(parseColor('#00ff00')).toEqual([0, 255, 0]);
    expect(parseColor('rgb(1,2,3)')).toEqual([1, 2, 3]);
  });

  // ループ検証: t=0 と t=1 の見た目が一致すること
  for (const spec of [
    { kind: 'rainbow', saturation: 1, lightness: 0.5, cycles: 1, speed: 1, angle: 0 },
    { kind: 'rainbow', saturation: 0.8, lightness: 0.6, cycles: 2, speed: 2, angle: 45 },
    { kind: 'metal', base: 'gold', angle: 90 },
    { kind: 'linear', stops: [{ at: 0, color: '#ff0000' }, { at: 1, color: '#0000ff' }], angle: 0, scrollSpeed: 1 },
    { kind: 'solid', color: '#123456' },
  ] as const) {
    it(`${spec.kind} は sample(u,0) === sample(u,1)`, () => {
      const ramp = createRamp(spec as any);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        // 浮動小数の丸めで 1/255 未満の差は出るため、成分ごとに許容誤差で見る
        const a = parseColor(ramp.sample(u, 0));
        const b = parseColor(ramp.sample(u, 1));
        for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(1);
      }
    });
  }

  it('gradientLine は角度どおりの向きを返す', () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    const h = gradientLine(box, 0);
    expect(h.x0).toBeCloseTo(0);
    expect(h.x1).toBeCloseTo(100);
    expect(h.y0).toBeCloseTo(50);
    const v = gradientLine(box, 90);
    expect(v.y0).toBeCloseTo(0);
    expect(v.y1).toBeCloseTo(100);
  });
});
