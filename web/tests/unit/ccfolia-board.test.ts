/**
 * G5 共用層：CCFOLIA 盤面的格與座標（ccfolia/board.ts）。
 * room-zip 規格 3.1.5、3.2.1（附件 Z03 的マーカーパネル）、foreground-frame 規格 3.13 的格數表、F11 的例子。
 */
import { describe, expect, it } from 'vitest';
import {
  boardToPx,
  boardTopLeft,
  cellsToPx,
  centerToTopLeft,
  GRID_PX,
  gridLength,
  pxToCells,
  rectToGridCells,
  roundGrid,
  suggestGridCells,
  topLeftToCenter,
} from '@/ccfolia';

describe('格與取整（room-zip 3.2.1）', () => {
  it('1 格＝24 px', () => {
    expect(GRID_PX).toBe(24);
    expect(pxToCells(1920)).toBe(80);
    expect(cellsToPx(40)).toBe(960);
  });

  it('剛好 .5 往絕對值大的方向', () => {
    expect([2.5, -2.5, 2.4, -2.4, 0.5, -0.5, 3, Number.NaN].map(roundGrid)).toEqual([
      3, -3, 2, -2, 1, -1, 3, 0,
    ]);
    expect(gridLength(0)).toBe(1);
    expect(gridLength(-3)).toBe(1);
    expect(gridLength(Number.NaN)).toBe(4);
    expect(gridLength(2.5)).toBe(3);
  });

  it('中心 → 左上角：規格的例子與附件 Z03', () => {
    expect(centerToTopLeft({ x: 0, y: 0, width: 9, height: 1 }).x).toBe(-5);
    expect(centerToTopLeft({ x: -5, y: 0, width: 9, height: 1 }).x).toBe(-10);
    /* Z03「橫幅」：中心 (3,−4)、12×4 → (−3,−6)；場景乙改到 (−5,2) → (−11,0)；場景甲 8×4 → (−1,−6) */
    expect(centerToTopLeft({ x: 3, y: -4, width: 12, height: 4 })).toEqual({
      x: -3,
      y: -6,
      width: 12,
      height: 4,
    });
    expect(centerToTopLeft({ x: -5, y: 2, width: 12, height: 4 })).toMatchObject({ x: -11, y: 0 });
    expect(centerToTopLeft({ x: 3, y: -4, width: 8, height: 4 })).toMatchObject({ x: -1, y: -6 });
    /* Z03「看板」：預設中心 (0,0)、37×56 → (−19,−28) */
    expect(centerToTopLeft({ x: 0, y: 0, width: 37, height: 56 })).toMatchObject({
      x: -19,
      y: -28,
    });
    expect(topLeftToCenter({ x: -3, y: -6, width: 12, height: 4 })).toEqual({
      x: 3,
      y: -4,
      width: 12,
      height: 4,
    });
  });

  it('盤面左上角與 px 換算：40×30 的盤面左上角是 (−20,−15)', () => {
    expect(boardTopLeft(40, 30)).toEqual({ x: -20, y: -15 });
    expect(boardToPx(-20, -15, 40, 30)).toEqual({ x: 0, y: 0 });
    expect(boardToPx(0, 0, 40, 30)).toEqual({ x: 480, y: 360 });
    expect(boardToPx(0, 0, 40, 30, 50)).toEqual({ x: 1000, y: 750 });
  });
});

describe('前景的建議格數（foreground-frame 3.13）', () => {
  const table: [number, number, number, number, boolean][] = [
    [1920, 1080, 48, 27, false],
    [1280, 720, 48, 27, false],
    [1152, 648, 48, 27, false],
    [1600, 900, 48, 27, false],
    [1440, 1080, 60, 45, false],
    [960, 720, 40, 30, false],
    [1080, 1080, 45, 45, false],
    [1536, 864, 64, 36, false],
    [1000, 700, 50, 35, false],
    [1001, 700, 48, 34, true],
    [4096, 64, 64, 1, false],
  ];
  for (const [w, h, gw, gh, approx] of table) {
    it(`${w} × ${h} → ${gw} × ${gh}${approx ? '（接近值）' : ''}`, () => {
      expect(suggestGridCells(w, h)).toEqual({ width: gw, height: gh, approximate: approx });
    });
  }

  it('極端比例（第 7 節裁定修正）：64 × 4096 不再是 48 × 3072，改以高為長邊 → 1 × 64', () => {
    expect(suggestGridCells(64, 4096)).toEqual({ width: 1, height: 64, approximate: false });
  });

  it('直式：原作結果在 64 格內時不變；超過時以高為長邊', () => {
    /* 3:4 → 原作 48 × 64，在範圍內 */
    expect(suggestGridCells(960, 1280)).toEqual({ width: 48, height: 64, approximate: false });
    /* 9:16 → 原作 45 × 80 超過 → 27 × 48 */
    expect(suggestGridCells(720, 1280)).toEqual({ width: 27, height: 48, approximate: false });
    /* 規則 1 的高超過 64（1080 × 1920 → 45 × 80）→ 27 × 48 */
    expect(suggestGridCells(1080, 1920)).toEqual({ width: 27, height: 48, approximate: false });
    for (const [w, h] of [
      [30, 5000],
      [5000, 30],
      [7, 3001],
      [1, 1],
    ]) {
      const g = suggestGridCells(w, h);
      expect(g.width).toBeGreaterThanOrEqual(1);
      expect(g.height).toBeGreaterThanOrEqual(1);
      expect(Math.max(g.width, g.height)).toBeLessThanOrEqual(64);
    }
  });

  it('窗的資訊（F11）：1920 × 1080、邊距 36 → 46.2 × 25.2 格，位置 0.9, 0.9', () => {
    const r = rectToGridCells(
      { x: 36, y: 36, width: 1848, height: 1008 },
      { width: 1920, height: 1080 },
      { width: 48, height: 27 },
    );
    expect(r.width.toFixed(1)).toBe('46.2');
    expect(r.height.toFixed(1)).toBe('25.2');
    expect(r.x.toFixed(1)).toBe('0.9');
    expect(r.y.toFixed(1)).toBe('0.9');
  });
});
