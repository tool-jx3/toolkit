/**
 * 簡易頭像產生器（icon-maker）的純邏輯：規格的數字規則。
 * - 畫布 1024、外框粗細的換算（固定，不隨視窗寬度改變）、內側區域；
 * - 預設版面（圖片中心、名字牌、HO 牌）與在 1024 畫布上的位置；
 * - 圖片寬 ＝ 內側寬 × 58% × 倍率、高依原比例（規格 3.4 的例子）；
 * - 拖曳夾限（圖片中心 −20～120、牌子左上 −10～110 − 自身大小）、改大小的範圍；
 * - 放大縮小 ±8%、夾在 35%～300%；
 * - 配色預設 9 組的結構；空白時的代替字；
 * - 名字直排（字太多時縮小字級）、橫排（縮小字級不壓扁）、HO 牌（水平壓扁到牌寬 − 19 px）。
 */
import { describe, expect, it } from 'vitest';
import { percentToBox, resizeBox } from '@/core/layout';
import {
  BACKGROUND_KINDS,
  backgroundGradientStops,
  boxCenter,
  CANVAS,
  canZoom,
  clampImageBox,
  clampPlateBox,
  defaultLayout,
  defaultSettings,
  displayHo,
  displayName,
  FRAME_RANGE,
  formatScale,
  frameWidthPx,
  HO_PLACEHOLDER,
  imageBox,
  innerRect,
  isDarkColor,
  LAYOUT_DEFAULTS,
  layoutHo,
  layoutHorizontal,
  layoutVertical,
  type MeasureFn,
  mixHex,
  NAME_PLACEHOLDER,
  nameBoxOf,
  PLATE_LIMITS,
  PRESETS,
  patternInk,
  presetById,
  SAFE_AREA,
  zoomStep,
} from '@/tools/icon-maker/logic';

/** 假的量字：每個字寬 ＝ 字級（全形） */
const fullWidth: MeasureFn = (text, size) => Array.from(text).length * size;

describe('畫布與外框', () => {
  it('畫布固定 1024；安全範圍內縮 7%', () => {
    expect(CANVAS).toBe(1024);
    expect(SAFE_AREA.x).toBeCloseTo(71.68, 2);
    expect(SAFE_AREA.width).toBeCloseTo(1024 * 0.86, 2);
  });

  it('外框滑桿 6～42、預設 18；換算以桌面預覽（約 590 px）為準：6 → 約 10、18 → 約 31、42 → 約 73 px', () => {
    expect(FRAME_RANGE).toEqual({ min: 6, max: 42, default: 18 });
    expect(Math.round(frameWidthPx(6))).toBe(10);
    expect(Math.round(frameWidthPx(18))).toBe(31);
    expect(Math.round(frameWidthPx(42))).toBe(73);
  });

  it('內側區域：外框以內的正方形（預設約 962 px）', () => {
    const r = innerRect(18);
    expect(r.x).toBeCloseTo(31.24, 1);
    expect(r.width).toBeCloseTo(961.5, 0);
    expect(r.width).toBe(r.height);
  });
});

describe('預設值', () => {
  it('設定的預設（規格 4：第 1 組配色、單色外框、單色背景、外框 18、直排明體、HO1 深色）', () => {
    const s = defaultSettings();
    expect(s.preset).toBe(PRESETS[0].id);
    expect(s.frameKind).toBe('solid');
    expect(s.background).toBe('solid');
    expect(s.frameWidth).toBe(18);
    expect(s.font).toBe('serif');
    expect(s.orientation).toBe('vertical');
    expect(s.hoText).toBe('HO1');
    expect(s.hoStyle).toBe('dark');
    expect(s.imageScale).toBe(1);
    expect(s.name.length).toBeGreaterThan(0);
  });

  it('預設版面：圖片中心 (50, 56)、名字牌 (78, 8) 11 × 48、HO (7, 84) 20 × 9', () => {
    expect(LAYOUT_DEFAULTS.imageCenter).toEqual({ x: 50, y: 56 });
    expect(LAYOUT_DEFAULTS.nameV).toEqual({ x: 78, y: 8, width: 11, height: 48 });
    expect(LAYOUT_DEFAULTS.ho).toEqual({ x: 7, y: 84, width: 20, height: 9 });
    /* defaultLayout 是複本，改了不影響預設 */
    const l = defaultLayout();
    l.nameV.x = 1;
    expect(LAYOUT_DEFAULTS.nameV.x).toBe(78);
  });

  it('預設的名字牌約在 x 781～886、y 108～569，HO 約在 x 98～290、y 839～925（1024 畫布）', () => {
    const inner = innerRect(18);
    const n = percentToBox(LAYOUT_DEFAULTS.nameV, inner);
    expect(Math.abs(n.x - 781)).toBeLessThanOrEqual(2);
    expect(Math.abs(n.x + n.width - 886)).toBeLessThanOrEqual(2);
    expect(Math.abs(n.y - 108)).toBeLessThanOrEqual(2);
    expect(Math.abs(n.y + n.height - 569)).toBeLessThanOrEqual(2);
    const h = percentToBox(LAYOUT_DEFAULTS.ho, inner);
    expect(Math.abs(h.x - 98)).toBeLessThanOrEqual(2);
    expect(Math.abs(h.x + h.width - 290)).toBeLessThanOrEqual(2);
    expect(Math.abs(h.y - 839)).toBeLessThanOrEqual(2);
    expect(Math.abs(h.y + h.height - 925)).toBeLessThanOrEqual(2);
  });

  it('橫排時名字牌換成下方的橫長條，直排時是直條', () => {
    const s = defaultSettings();
    expect(nameBoxOf(s)).toEqual(s.nameV);
    const h = nameBoxOf({ ...s, orientation: 'horizontal' });
    expect(h).toEqual(s.nameH);
    expect(h.width).toBeGreaterThan(h.height * 3);
    expect(h.y).toBeGreaterThan(70);
    /* 與 HO 牌不重疊 */
    expect(h.x).toBeGreaterThanOrEqual(s.ho.x + s.ho.width);
  });
});

describe('圖片', () => {
  it('寬 ＝ 內側寬 × 58% × 倍率，高依原比例：400 × 800 的圖在預設位置約寬 558、高 1116，左緣約 x 233', () => {
    const inner = innerRect(18);
    const b = percentToBox(imageBox({ x: 50, y: 56 }, 1, { width: 400, height: 800 }), inner);
    expect(Math.abs(b.width - 558)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.height - 1116)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.x - 233)).toBeLessThanOrEqual(2);
    /* 中心在內側區域的 (50%, 56%) */
    const c = boxCenter(imageBox({ x: 50, y: 56 }, 1, { width: 400, height: 800 }));
    expect(c.x).toBeCloseTo(50, 9);
    expect(c.y).toBeCloseTo(56, 9);
  });

  it('倍率 35% 與 300% 的寬度', () => {
    expect(imageBox({ x: 50, y: 50 }, 0.35, { width: 1, height: 1 }).width).toBeCloseTo(20.3, 9);
    expect(imageBox({ x: 50, y: 50 }, 3, { width: 1, height: 1 }).width).toBeCloseTo(174, 9);
  });

  it('拖曳：中心夾在 −20%～120%', () => {
    const b = imageBox({ x: 50, y: 50 }, 1, { width: 100, height: 200 });
    const far = clampImageBox({ ...b, x: b.x + 500, y: b.y - 500 });
    expect(boxCenter(far)).toEqual({ x: 120, y: -20 });
    const ok = clampImageBox({ ...b, x: b.x + 10 });
    expect(boxCenter(ok).x).toBeCloseTo(60, 9);
  });

  it('放大／縮小每次 ±8 個百分點，夾在 35%～300%', () => {
    expect(zoomStep(1, 1)).toBe(1.08);
    expect(zoomStep(1, -1)).toBe(0.92);
    let v = 1;
    for (let i = 0; i < 20; i++) v = zoomStep(v, -1);
    expect(v).toBe(0.35);
    expect(canZoom(v, -1)).toBe(false);
    for (let i = 0; i < 40; i++) v = zoomStep(v, 1);
    expect(v).toBe(3);
    expect(canZoom(v, 1)).toBe(false);
    expect(canZoom(1, 1)).toBe(true);
    /* 摘要顯示整數百分比 */
    expect(formatScale(zoomStep(zoomStep(1, 1), 1))).toBe('116%');
    expect(formatScale(0.35)).toBe('35%');
  });
});

describe('名字牌與 HO 牌', () => {
  it('拖曳：左上角夾在 −10%～（110% − 自身寬或高）', () => {
    const b = { x: 0, y: 0, width: 20, height: 9 };
    expect(clampPlateBox({ ...b, x: -50, y: -50 })).toEqual({ ...b, x: -10, y: -10 });
    expect(clampPlateBox({ ...b, x: 200, y: 200 })).toEqual({ ...b, x: 90, y: 101 });
  });

  it('改大小：寬 8%～80%、高 6%～80%，左上角不動', () => {
    expect(PLATE_LIMITS).toEqual({ minWidth: 8, maxWidth: 80, minHeight: 6, maxHeight: 80 });
    const b = { x: 7, y: 84, width: 20, height: 9 };
    expect(resizeBox(b, 'se', -100, -100, PLATE_LIMITS)).toEqual({ ...b, width: 8, height: 6 });
    expect(resizeBox(b, 'se', 200, 200, PLATE_LIMITS)).toEqual({ ...b, width: 80, height: 80 });
  });

  it('空白時的代替字：名字是自訂的代替字、HO 是「HO」', () => {
    expect(displayName('')).toBe(NAME_PLACEHOLDER);
    expect(displayName('   ')).toBe(NAME_PLACEHOLDER);
    expect(displayName(' 阿雪 ')).toBe('阿雪');
    expect(displayHo('')).toBe(HO_PLACEHOLDER);
    expect(HO_PLACEHOLDER).toBe('HO');
    expect(displayHo('PC2')).toBe('PC2');
  });

  it('直排：一字一列、置中，字距 1.2 倍；字太多時縮小字級（不重疊、不換欄）', () => {
    const box = { x: 781, y: 108, width: 106, height: 462 };
    const three = layoutVertical('葉初晴', box);
    expect(three.chars).toEqual(['葉', '初', '晴']);
    expect(three.x).toBe(box.x + box.width / 2);
    expect(three.size).toBeCloseTo(106 * 0.52, 6);
    expect(three.centers[1]).toBeCloseTo(box.y + box.height / 2, 6);
    expect(three.centers[1] - three.centers[0]).toBeCloseTo(three.size * 1.2, 6);
    for (const n of [2, 4, 10, 30]) {
      const v = layoutVertical('字'.repeat(n), box);
      const pitch = n > 1 ? v.centers[1] - v.centers[0] : v.size * 1.2;
      /* 字距 ≥ 字級（不重疊），整欄在名字牌裡 */
      expect(pitch).toBeGreaterThanOrEqual(v.size);
      expect(v.centers[0] - v.size / 2).toBeGreaterThanOrEqual(box.y);
      expect(v.centers[n - 1] + v.size / 2).toBeLessThanOrEqual(box.y + box.height);
    }
    expect(layoutVertical('字'.repeat(10), box).size).toBeLessThan(three.size);
  });

  it('直排以字素切字（表情符號算一個字）', () => {
    expect(layoutVertical('阿👨‍👩‍👧', { x: 0, y: 0, width: 100, height: 400 }).chars).toEqual([
      '阿',
      '👨‍👩‍👧',
    ]);
  });

  it('橫排：一行置中，太長時縮小字級（不壓扁），寬度不超過牌寬減左右留白', () => {
    const box = { x: 300, y: 830, width: 600, height: 100 };
    const short = layoutHorizontal('阿雪', box, fullWidth);
    expect(short.size).toBe(50);
    expect(short.scaleX).toBe(1);
    expect(short.x).toBe(600);
    expect(short.y).toBe(880);
    const long = layoutHorizontal('十二個字的很長很長的名字', box, fullWidth);
    expect(long.scaleX).toBe(1);
    expect(long.size).toBeLessThan(50);
    expect(long.size * 12).toBeCloseTo(600 - 2 * 25, 6);
    expect(long.width).toBeCloseTo(550, 6);
  });

  it('HO：字級 ＝ 牌高 × 0.42（預設大小約 36 px）；太長時水平壓扁到牌寬減 19 px', () => {
    const inner = innerRect(18);
    const ho = percentToBox(LAYOUT_DEFAULTS.ho, inner);
    const l = layoutHo('HO1', ho, (t, size) => t.length * size * 0.6);
    expect(Math.abs(l.size - 36)).toBeLessThan(1);
    expect(l.scaleX).toBe(1);
    const long = layoutHo('很長的職業名稱十字', ho, fullWidth);
    expect(long.size).toBeCloseTo(ho.height * 0.42, 6);
    expect(long.scaleX).toBeLessThan(1);
    expect(long.width).toBeCloseTo(ho.width - 19, 6);
  });
});

describe('配色預設與背景', () => {
  it('9 組，每組都有單色外框、漸層三色、背景色與名稱；id 不重複；約一半深色背景', () => {
    expect(PRESETS).toHaveLength(9);
    const hex = /^#[0-9a-f]{6}$/;
    for (const p of PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.frame).toMatch(hex);
      expect(p.background).toMatch(hex);
      expect(p.gradient).toHaveLength(3);
      for (const c of p.gradient) expect(c).toMatch(hex);
    }
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(9);
    const dark = PRESETS.filter((p) => isDarkColor(p.background)).length;
    expect(dark).toBeGreaterThanOrEqual(3);
    expect(dark).toBeLessThanOrEqual(6);
    expect(presetById('nope')).toBe(PRESETS[0]);
  });

  it('背景六種；漸層：背景色 → 很淡的外框色調 → 白色', () => {
    expect(BACKGROUND_KINDS).toEqual([
      'solid',
      'gradient',
      'transparent',
      'dots',
      'stripes',
      'checker',
    ]);
    const p = PRESETS[0];
    const stops = backgroundGradientStops(p);
    expect(stops[0]).toEqual([0, p.background]);
    expect(stops[2]).toEqual([1, '#ffffff']);
    expect(stops[1][1]).toBe(mixHex('#ffffff', p.frame, 0.2));
  });

  it('花紋：淺色背景用外框色、深色背景用白色，都很淡（面積越大越淡）', () => {
    const light = PRESETS.find((p) => !isDarkColor(p.background))!;
    const dark = PRESETS.find((p) => isDarkColor(p.background))!;
    for (const kind of ['dots', 'stripes', 'checker'] as const) {
      expect(patternInk(light, kind).color).toBe(light.frame);
      expect(patternInk(dark, kind).color).toBe('#ffffff');
      expect(patternInk(light, kind).opacity).toBeLessThan(0.25);
      expect(patternInk(dark, kind).opacity).toBeLessThan(patternInk(light, kind).opacity);
    }
    expect(patternInk(light, 'checker').opacity).toBeLessThan(patternInk(light, 'dots').opacity);
  });

  it('mixHex', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
  });
});
