import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  formatHex,
  hsvToRgb,
  normalizeHex,
  parseColor,
  rgbToHsv,
  toCss,
  withAlpha,
} from '@/core/color';

describe('顏色', () => {
  it('解析各種寫法', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#11223380')).toEqual({ r: 17, g: 34, b: 51, a: 128 / 255 });
    expect(parseColor('abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('不是顏色')).toBeNull();
  });

  it('格式化', () => {
    expect(formatHex({ r: 255, g: 0, b: 16, a: 1 })).toBe('#ff0010');
    expect(formatHex({ r: 255, g: 0, b: 16, a: 0.5 })).toBe('#ff001080');
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(withAlpha('#000000', 0)).toBe('#00000000');
    expect(toCss('#ff000080')).toBe('rgba(255, 0, 0, 0.502)');
  });

  it('HSV 來回換算', () => {
    const c = { r: 120, g: 60, b: 200, a: 1 };
    const back = hsvToRgb(rgbToHsv(c));
    expect(Math.round(back.r)).toBe(120);
    expect(Math.round(back.g)).toBe(60);
    expect(Math.round(back.b)).toBe(200);
  });

  it('對比度', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
  });
});
