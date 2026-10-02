/**
 * 選角畫面產生器：版面幾何（規格 3.2）——主格與清單的分割、大格、小清單的格子、自動與手動間距、畫布尺寸與版型。
 */
import { describe, expect, it } from 'vitest';
import { demoCharacters } from '@/tools/character-select/demo';
import {
  applyCanvasPreset,
  applyShowcasePreset,
  CANVAS_PRESETS,
  compositionRects,
  effectiveRows,
  layoutGap,
  mainPanelRects,
  resizeCanvas,
  scaleBox,
  showcaseActive,
  tileAt,
  tileRects,
  visibleCount,
} from '@/tools/character-select/layout';
import { createDefaultSettings, type Settings } from '@/tools/character-select/model';
import { sanitize } from '@/tools/character-select/sanitize';

function make(patch?: (s: Settings) => void): Settings {
  const s = createDefaultSettings();
  s.characters = demoCharacters();
  patch?.(s);
  sanitize(s);
  return s;
}

describe('預設版面（960 × 540、4 欄 2 列、8 個角色）', () => {
  const s = make();
  it('自動間距＝14，格子約 197.5 × 157', () => {
    expect(s.layout.gap).toBe(14);
    const r = tileRects(s);
    expect(r).toHaveLength(8);
    expect(r[0]).toMatchObject({ x: 64, y: 124, index: 0 });
    expect(r[0].width).toBeCloseTo((832 - 14 * 3) / 4, 10);
    expect(r[0].height).toBeCloseTo((328 - 14) / 2, 10);
    expect(r[5].x).toBeCloseTo(64 + (197.5 + 14), 10);
    expect(r[5].y).toBeCloseTo(124 + 157 + 14, 10);
  });
  it('格狀時清單區域＝整個區域，沒有主格', () => {
    expect(compositionRects(s)).toEqual({
      main: null,
      grid: { x: 64, y: 124, width: 832, height: 328 },
    });
    expect(mainPanelRects(s)).toEqual([]);
  });
  it('點在格子上找得到格子，間距裡找不到', () => {
    expect(tileAt(s, 70, 130)).toBe(0);
    expect(tileAt(s, 64 + 197.5 + 7, 130)).toBe(-1);
    expect(tileAt(s, 890, 450)).toBe(7);
  });
});

describe('自動加列與畫面上的角色數', () => {
  it('自動加列：列數＝max(列數, ⌈角色數 ÷ 欄⌉)', () => {
    const s = make((d) => {
      d.characters = [
        ...demoCharacters(),
        ...demoCharacters().map((c) => ({ ...c, id: `${c.id}b` })),
      ];
      d.layout.columns = 3;
    });
    expect(effectiveRows(s)).toBe(6);
    expect(visibleCount(s)).toBe(16);
  });
  it('關掉自動加列：只顯示放得下的角色', () => {
    const s = make((d) => {
      d.layout.columns = 3;
      d.layout.rows = 2;
      d.layout.autoRows = false;
    });
    expect(effectiveRows(s)).toBe(2);
    expect(visibleCount(s)).toBe(6);
    expect(tileRects(s)).toHaveLength(6);
  });
});

describe('間距', () => {
  it('手動間距照輸入，但夾在上限內', () => {
    const s = make((d) => {
      d.layout.autoGap = false;
      d.layout.gap = 30;
    });
    expect(s.layout.gap).toBe(30);
    const tiny = make((d) => {
      d.layout.autoGap = false;
      d.layout.gap = 120;
      d.layout.width = 100;
      d.layout.columns = 12;
    });
    /* 上限＝⌊(寬 − min(寬 ÷ 2, 欄)) ÷ (欄 − 1)⌋ */
    expect(tiny.layout.gap).toBe(Math.floor((100 - 12) / 11));
    expect(layoutGap(tiny)).toBe(tiny.layout.gap);
  });
  it('自動間距依比例：1 欄 1 列時用 0.09 ÷ 1', () => {
    const s = make((d) => {
      d.layout.columns = 1;
      d.layout.rows = 1;
      d.layout.autoRows = false;
    });
    expect(s.layout.gap).toBe(Math.min(120, Math.round(Math.min(832 * 0.09, 328 * 0.09))));
  });
});

describe('大主格的分割', () => {
  it('主格在上：間距 min(24, 高 × 0.2)、主格＝(高 − 間距) × 62%', () => {
    const s = make((d) => {
      d.mainPanel.enabled = true;
    });
    const { main, grid } = compositionRects(s);
    const mainH = ((328 - 24) * 62) / 100;
    expect(main).toEqual({ x: 64, y: 124, width: 832, height: mainH });
    expect(grid.y).toBeCloseTo(124 + mainH + 24, 10);
    expect(grid.height).toBeCloseTo(328 - 24 - mainH, 10);
  });
  it('主格在右：清單在左', () => {
    const s = make((d) => {
      d.mainPanel.enabled = true;
      d.mainPanel.position = 'right';
      d.mainPanel.size = 50;
      d.mainPanel.gap = 20;
    });
    const { main, grid } = compositionRects(s);
    expect(grid.x).toBe(64);
    expect(grid.width).toBeCloseTo((832 - 20) / 2, 10);
    expect(main?.x).toBeCloseTo(64 + (832 - 20) / 2 + 20, 10);
  });
  it('2 × 2 的大格：間距＝min(大格間距, 寬 ÷ 欄 × 0.35, 高 ÷ 列 × 0.35)', () => {
    const s = make((d) => {
      d.mainPanel.enabled = true;
      d.mainPanel.count = 4;
      d.mainPanel.columns = 2;
      d.mainPanel.slotGap = 120;
    });
    const area = compositionRects(s).main!;
    const gap = Math.min(120, (area.width / 2) * 0.35, (area.height / 2) * 0.35);
    const r = mainPanelRects(s);
    expect(r).toHaveLength(4);
    expect(r[1].x - r[0].x - r[0].width).toBeCloseTo(gap, 10);
    expect(r[2].y - r[0].y - r[0].height).toBeCloseTo(gap, 10);
  });
  it('大格的欄數夾在 1～數量', () => {
    const s = make((d) => {
      d.mainPanel.count = 3;
      d.mainPanel.columns = 9;
    });
    expect(s.mainPanel.columns).toBe(3);
  });
});

describe('畫布尺寸與版型', () => {
  it('改畫布尺寸：區域依寬高的倍率縮放、圓角依較小的倍率（四捨五入）', () => {
    const s = make();
    resizeCanvas(s, 1280, 720);
    expect(s.canvas).toEqual({ width: 1280, height: 720 });
    expect(s.layout).toMatchObject({
      x: Math.round(64 * (1280 / 960)),
      y: Math.round(124 * (720 / 540)),
      width: Math.round(832 * (1280 / 960)),
      height: Math.round(328 * (720 / 540)),
      radius: Math.round(24 * (4 / 3)),
    });
    resizeCanvas(s, 100, 99999);
    expect(s.canvas).toEqual({ width: 240, height: 4096 });
  });
  it('直式・2 欄 4 列：960 × 1280、X＝64、Y＝168、寬 832、高 1000、關掉自動加列', () => {
    const s = make((d) => {
      d.mainPanel.enabled = true;
    });
    applyCanvasPreset(s, CANVAS_PRESETS.find((p) => p.id === 'p8')!);
    sanitize(s);
    expect(s.mainPanel.enabled).toBe(false);
    expect(s.layout).toMatchObject({
      columns: 2,
      rows: 4,
      autoRows: false,
      autoGap: true,
      x: 64,
      y: 168,
      width: 832,
      height: 1000,
      radius: 24,
    });
  });
  it('直式・1 欄 5 列：720 × 1280、X＝48', () => {
    const s = make();
    applyCanvasPreset(s, CANVAS_PRESETS.find((p) => p.id === 'p5')!);
    sanitize(s);
    expect(s.canvas).toEqual({ width: 720, height: 1280 });
    expect(s.layout).toMatchObject({ columns: 1, rows: 5, x: 48, width: 624, height: 1000 });
  });
  it('主格版型（直式、橫式）與按下狀態', () => {
    const s = make();
    applyShowcasePreset(s, 'portrait');
    sanitize(s);
    expect(s.canvas).toEqual({ width: 960, height: 1280 });
    expect(s.mainPanel).toMatchObject({ enabled: true, position: 'top', size: 62, gap: 24 });
    expect(s.layout).toMatchObject({
      x: 64,
      y: 152,
      width: 832,
      height: 1020,
      columns: 4,
      rows: 2,
      radius: 18,
    });
    expect(showcaseActive(s, 'portrait')).toBe(true);
    expect(showcaseActive(s, 'landscape')).toBe(false);
    applyShowcasePreset(s, 'landscape');
    sanitize(s);
    expect(s.layout).toMatchObject({
      x: 64,
      y: 128,
      width: 1152,
      height: 496,
      columns: 2,
      rows: 4,
    });
    expect(showcaseActive(s, 'landscape')).toBe(true);
  });
  it('scaleBox 以中心放大', () => {
    const b = scaleBox({ x: 10, y: 20, width: 100, height: 50 }, 1.1);
    expect(b.x).toBeCloseTo(5, 10);
    expect(b.y).toBeCloseTo(17.5, 10);
    expect(b.width).toBeCloseTo(110, 10);
    expect(b.height).toBeCloseTo(55, 10);
  });
});
