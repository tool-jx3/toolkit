/**
 * core/image 的「圖片在框裡的位置」（lock-screen 移植時新增；ImageFrameDialog 的 initialPlacement／onApply）：
 * 蓋滿的縮放、位置 ↔ 框裡的變換、夾在蓋滿的範圍、讀回來的整理；
 * 依位置只取看得到的那一塊（placedCrop、drawPlacedCrop；char-chart 的頭像範圍，2026-10）。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  clampCover,
  clampPlacement,
  coverScale,
  DEFAULT_PLACEMENT,
  drawPlacedCrop,
  type FramePlacement,
  normalizePlacement,
  placedCrop,
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

describe('依位置只取看得到的那一塊（placedCrop、drawPlacedCrop）', () => {
  it('預設位置＋正方形的框：就是「取中央的正方形」，數值與 ((寬 − 邊)／2, (高 − 邊)／2, 邊) 完全相同', () => {
    expect(
      placedCrop({ width: 300, height: 200 }, { width: 120, height: 120 }, DEFAULT_PLACEMENT),
    ).toEqual({ x: 50, y: 0, width: 200, height: 200, turns: 0 });
    for (const [iw, ih] of [
      [7, 5],
      [1023, 1024],
      [333, 1000],
      [1024, 577],
      [1, 1],
    ]) {
      const side = Math.min(iw, ih);
      const c = placedCrop(
        { width: iw, height: ih },
        { width: 120, height: 120 },
        DEFAULT_PLACEMENT,
      );
      expect([c.x, c.y, c.width, c.height]).toEqual([(iw - side) / 2, (ih - side) / 2, side, side]);
    }
  });

  /** 框中心對到的原圖座標（用 placedTransform 反推）與一個原圖 px 在框裡多大 */
  function viaTransform(
    im: { width: number; height: number },
    bx: { x: number; y: number; width: number; height: number },
    p: FramePlacement,
  ) {
    const t = placedTransform(im, bx, p);
    const th = (t.turns * Math.PI) / 2;
    const vx = (bx.x + bx.width / 2 - t.cx) / t.scale;
    const vy = (bx.y + bx.height / 2 - t.cy) / t.scale;
    return {
      cx: im.width / 2 + vx * Math.cos(th) + vy * Math.sin(th),
      cy: im.height / 2 - vx * Math.sin(th) + vy * Math.cos(th),
      scale: t.scale,
    };
  }

  it('和 placedTransform 一致：取的那一塊的中心＝框中心對到的原圖點、大小 × 縮放＝框（轉 90°、270° 時寬高對調）', () => {
    const im = { width: 800, height: 600 };
    const bx = { x: 10, y: 20, width: 90, height: 195 };
    for (const p of [
      { zoom: 1, x: 0, y: 0, turns: 0 },
      { zoom: 1.5, x: 0.2, y: -0.1, turns: 0 },
      { zoom: 1.5, x: 0.2, y: -0.1, turns: 1 },
      { zoom: 2.25, x: -0.3, y: 0.05, turns: 2 },
      { zoom: 3, x: 0.1, y: 0.4, turns: 3 },
    ]) {
      const c = placedCrop(im, bx, p);
      const v = viaTransform(im, bx, p);
      expect(c.turns).toBe(p.turns);
      expect(c.x + c.width / 2).toBeCloseTo(v.cx, 6);
      expect(c.y + c.height / 2).toBeCloseTo(v.cy, 6);
      const odd = p.turns % 2 === 1;
      expect(c.width * v.scale).toBeCloseTo(odd ? bx.height : bx.width, 6);
      expect(c.height * v.scale).toBeCloseTo(odd ? bx.width : bx.height, 6);
    }
  });

  it('放大 2 倍：往右移半個框時取中央偏左的那一塊，移到底（1.5 個框）時取最左邊', () => {
    const im = { width: 240, height: 120 };
    const bx = { width: 60, height: 60 };
    expect(placedCrop(im, bx, { zoom: 2, x: 0.5, y: 0, turns: 0 })).toEqual({
      x: 60,
      y: 30,
      width: 60,
      height: 60,
      turns: 0,
    });
    expect(placedCrop(im, bx, { zoom: 2, x: 1.5, y: 0, turns: 0 }).x).toBe(0);
  });

  function recorder() {
    const calls: [string, ...unknown[]][] = [];
    const ctx = new Proxy(
      { imageSmoothingEnabled: false, imageSmoothingQuality: 'low' } as Record<string, unknown>,
      {
        get(target, key) {
          if (key in target) return target[key as string];
          return (...args: unknown[]) => calls.push([String(key), ...args]);
        },
        set(target, key, value) {
          calls.push([`set:${String(key)}`, value]);
          target[key as string] = value;
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  }

  it('drawPlacedCrop：沒有旋轉時一次 drawImage（來源＝取的那一塊、目標＝框），不改變換；高品質縮放；save／restore 成對', () => {
    const { ctx, calls } = recorder();
    const bmp = { width: 300, height: 200 } as unknown as CanvasImageSource;
    drawPlacedCrop(
      ctx,
      bmp,
      { width: 300, height: 200 },
      { x: 440, y: 60, width: 120, height: 120 },
      DEFAULT_PLACEMENT,
    );
    expect(calls).toEqual([
      ['save'],
      ['set:imageSmoothingEnabled', true],
      ['set:imageSmoothingQuality', 'high'],
      ['drawImage', bmp, 50, 0, 200, 200, 440, 60, 120, 120],
      ['restore'],
    ]);
  });

  it('drawPlacedCrop：轉 90° 時移到框中心、旋轉，目標的寬高對調', () => {
    const { ctx, calls } = recorder();
    const bmp = {} as CanvasImageSource;
    const im = { width: 300, height: 200 };
    const bx = { x: 0, y: 0, width: 100, height: 50 };
    const p = { zoom: 1, x: 0, y: 0, turns: 1 };
    const c = placedCrop(im, bx, p);
    drawPlacedCrop(ctx, bmp, im, bx, p);
    const draw = calls.find((k) => k[0] === 'drawImage');
    expect(calls.find((k) => k[0] === 'translate')).toEqual(['translate', 50, 25]);
    expect(calls.find((k) => k[0] === 'rotate')).toEqual(['rotate', Math.PI / 2]);
    expect(draw).toEqual(['drawImage', bmp, c.x, c.y, c.width, c.height, -25, -50, 50, 100]);
    vi.restoreAllMocks();
  });
});
