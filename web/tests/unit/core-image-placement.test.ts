/**
 * core/image 的「圖片在框裡的位置」（lock-screen 移植時新增；ImageFrameDialog 的 initialPlacement／onApply）：
 * 蓋滿的縮放、位置 ↔ 框裡的變換、夾在蓋滿的範圍、讀回來的整理。
 */
import { describe, expect, it } from 'vitest';
import {
  clampCover,
  clampPlacement,
  coverScale,
  normalizePlacement,
  placedTransform,
  placementOf,
} from '@/core/image';

const img = { width: 800, height: 600 };
const box = { x: 10, y: 20, width: 90, height: 195 };

describe('圖片在框裡的位置', () => {
  it('蓋滿的縮放：取兩個比值中較大的；轉 90° 時寬高對調', () => {
    expect(coverScale(img, 90, 195)).toBeCloseTo(195 / 600, 9);
    expect(coverScale(img, 400, 100)).toBeCloseTo(0.5, 9);
    expect(coverScale(img, 90, 195, 1)).toBeCloseTo(195 / 800, 9);
    expect(coverScale({ width: 0, height: 0 }, 10, 10)).toBe(1);
  });

  it('位置 → 變換 → 位置：來回一樣（和框的大小無關）', () => {
    const p = { zoom: 1.5, x: 0.2, y: -0.1, turns: 1 };
    const t = placedTransform(img, box, p);
    expect(t.cx).toBeCloseTo(10 + 45 + 18, 9);
    expect(t.cy).toBeCloseTo(20 + 97.5 - 19.5, 9);
    expect(t.scale).toBeCloseTo((195 / 800) * 1.5, 9);
    const back = placementOf(img, box, t);
    expect(back.zoom).toBeCloseTo(1.5, 9);
    expect(back.x).toBeCloseTo(0.2, 9);
    expect(back.y).toBeCloseTo(-0.1, 9);
    expect(back.turns).toBe(1);
    /* 同比例、不同大小的框：同一個位置 */
    const big = { x: 0, y: 0, width: 900, height: 1950 };
    expect(placementOf(img, big, placedTransform(img, big, p)).x).toBeCloseTo(0.2, 9);
  });

  it('夾在蓋滿的範圍：縮放 1～maxZoom、圖片的邊不會跑進框裡', () => {
    const base = coverScale(img, box.width, box.height);
    const small = clampCover(img, box, { cx: -500, cy: 0, scale: base / 2, turns: 0 }, 4);
    expect(small.scale).toBeCloseTo(base, 9);
    /* 蓋滿時高剛好、寬多出來：上下置中、左右夾在範圍內 */
    expect(small.cy).toBeCloseTo(20 + 97.5, 9);
    const w = 800 * base;
    expect(small.cx).toBeCloseTo(10 + 90 - w / 2, 9);
    const big = clampCover(img, box, { cx: 55, cy: 117.5, scale: base * 10, turns: 0 }, 4);
    expect(big.scale).toBeCloseTo(base * 4, 9);
    const p = clampPlacement(img, { width: 9, height: 19.5 }, { zoom: 2, x: 5, y: 0, turns: 0 }, 4);
    expect(p.zoom).toBeCloseTo(2, 9);
    /* 放大 2 倍：圖寬 = 800 × (19.5／600) × 2 = 52 → 最多往右 (52 − 9)／2 ÷ 9 */
    expect(p.x).toBeCloseTo((52 - 9) / 2 / 9, 6);
  });

  it('讀回來的整理：不是數字的換成預設、夾在範圍、turns 0～3', () => {
    expect(normalizePlacement(null)).toEqual({ zoom: 1, x: 0, y: 0, turns: 0 });
    expect(
      normalizePlacement({ zoom: 'a', x: 99, y: -99, turns: 5 }, { maxZoom: 4, limit: 2 }),
    ).toEqual({ zoom: 1, x: 2, y: -2, turns: 1 });
    expect(normalizePlacement({ zoom: 0.5 }, { minZoom: 1 }).zoom).toBe(1);
    expect(normalizePlacement({ turns: -1 }).turns).toBe(3);
  });
});
