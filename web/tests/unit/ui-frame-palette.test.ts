/**
 * UI 框素材產生器：自動調色（規格 3.2，自訂）——主色＋深色／淺色 → 各部件的顏色；四種狀態；文字的對比。
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, relativeLuminance } from '../../src/core/color';
import { PRESETS } from '../../src/tools/ui-frame/model';
import {
  oklchToRgb,
  palette,
  paletteRgba,
  rgbToOklch,
  tyranoColor,
} from '../../src/tools/ui-frame/palette';

const opaque = (c: { r: number; g: number; b: number }) => ({ ...c, a: 1 });

/** 12 個色相 × 3 種明暗的主色，加上灰階 */
const KEYS: string[] = [];
for (let h = 0; h < 360; h += 30)
  for (const [s, v] of [
    [0.9, 0.95],
    [0.6, 0.6],
    [0.4, 0.3],
  ]) {
    const c = (n: number) => {
      const k = (n + h / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    KEYS.push(`#${[c(5), c(3), c(1)].map((x) => x.toString(16).padStart(2, '0')).join('')}`);
  }
KEYS.push('#000000', '#ffffff', '#808080');

const base = { bgOpacity: 100, textureAlpha: 20 };

describe('OKLCH 換算', () => {
  it('來回換算誤差 ≤ 1／255', () => {
    for (const hex of KEYS) {
      const c = parseColor(hex)!;
      const back = oklchToRgb(rgbToOklch(c));
      expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(1);
    }
  });

  it('超出色域時降低彩度（明度大致保留）', () => {
    const c = oklchToRgb({ l: 0.7, c: 0.4, h: 150 });
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
    expect(Math.abs(rgbToOklch(c).l - 0.7)).toBeLessThan(0.01);
  });
});

describe('自動調色', () => {
  it('一般狀態的文字和框底中間的對比 ≥ 4.5（所有色相、深淺）', () => {
    for (const keyColor of KEYS)
      for (const polarity of ['dark', 'light'] as const) {
        const p = paletteRgba({ ...base, keyColor, polarity });
        expect(contrastRatio(opaque(p.text), opaque(p.panelMid))).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('深色：框底暗、框線亮；淺色：框底亮、框線暗', () => {
    for (const keyColor of KEYS) {
      const d = paletteRgba({ ...base, keyColor, polarity: 'dark' });
      const l = paletteRgba({ ...base, keyColor, polarity: 'light' });
      expect(relativeLuminance(d.panelMid)).toBeLessThan(relativeLuminance(d.border));
      expect(relativeLuminance(l.panelMid)).toBeGreaterThan(relativeLuminance(l.border));
    }
  });

  it('框底的不透明度＝設定；最下面多一點；質感的濃度跟著設定', () => {
    const p = paletteRgba({
      keyColor: '#b98f52',
      polarity: 'dark',
      bgOpacity: 60,
      textureAlpha: 50,
    });
    expect(p.panelTop.a).toBeCloseTo(0.6, 5);
    expect(p.panelMid.a).toBeCloseTo(0.6, 5);
    expect(p.panelBottom.a).toBeCloseTo(0.65, 5);
    expect(p.tint.a).toBeCloseTo(0.3, 5);
    const none = paletteRgba({
      keyColor: '#b98f52',
      polarity: 'dark',
      bgOpacity: 60,
      textureAlpha: 0,
    });
    expect(none.tint.a).toBe(0);
  });

  it('四種狀態：滑過變亮、按下變暗、停用拿掉彩度', () => {
    for (const p of PRESETS) {
      const n = paletteRgba(p.design, 'normal');
      const h = paletteRgba(p.design, 'hover');
      const a = paletteRgba(p.design, 'active');
      const x = paletteRgba(p.design, 'disabled');
      expect(rgbToOklch(h.panelMid).l).toBeGreaterThan(rgbToOklch(n.panelMid).l);
      expect(rgbToOklch(a.panelMid).l).toBeLessThan(rgbToOklch(n.panelMid).l);
      expect(rgbToOklch(x.border).c).toBeLessThan(rgbToOklch(n.border).c);
      expect(x.text.a).toBeLessThan(1);
    }
  });

  it('同樣的輸入每次一樣；CSS 是 rgba()', () => {
    const d = PRESETS[2].design;
    expect(palette(d)).toEqual(palette(d));
    expect(palette(d).border).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
  });

  it('TyranoScript 的顏色寫法 0xRRGGBB', () => {
    expect(tyranoColor({ r: 248, g: 9, b: 250, a: 1 })).toBe('0xF809FA');
    expect(tyranoColor(paletteRgba(PRESETS[0].design).text)).toMatch(/^0x[0-9A-F]{6}$/);
  });
});
