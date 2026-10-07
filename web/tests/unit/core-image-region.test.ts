/**
 * core/image 的 colorRegion／applyRegion：點一下選同色的範圍（同色擦掉／同色補回）。
 * 只選看得到（遮罩 > 0）或被去掉（遮罩 < 255）的；相連（四連通）或整張；容許度與 colorDistance 相同（0～100）。
 */
import { describe, expect, it } from 'vitest';
import { applyRegion, COLOR_DISTANCE_MAX, colorRegion } from '@/core/image';

/** 依字元畫圖：每個字元一個像素（W 白、R 紅、r 淡紅、K 黑、. 透明） */
function img(rows: string[]) {
  const h = rows.length;
  const w = rows[0].length;
  const colors: Record<string, [number, number, number, number]> = {
    W: [255, 255, 255, 255],
    R: [200, 40, 40, 255],
    r: [210, 50, 50, 255],
    K: [0, 0, 0, 255],
    '.': [0, 0, 0, 0],
  };
  const rgba = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      rgba.set(colors[ch], (y * w + x) * 4);
    });
  });
  return { rgba, w, h };
}

/** 依字元畫遮罩：# 留下（255）、空白去掉（0）、+ 半透明（128） */
function maskOf(rows: string[]) {
  return Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 255 : c === '+' ? 128 : 0));
}

const picked = (region: Uint8Array, w: number) =>
  Array.from({ length: region.length / w }, (_, y) =>
    Array.from(region.subarray(y * w, (y + 1) * w), (v) => (v ? 'x' : '-')).join(''),
  );

describe('colorRegion', () => {
  /* 白領子（左）與另一塊白（右）中間隔著紅色；白底已經去掉 */
  const scene = img(['WWWWWWW', 'WWRRRWW', 'WWRRRWW', 'WWWWWWW']);
  const mask = maskOf(['       ', ' ##### ', ' ##### ', '       ']);

  it('同色擦掉＋相連：只選看得到、連在一起的同色，不經過已經去掉的白底', () => {
    const r = colorRegion(scene.rgba, mask, scene.w, scene.h, {
      x: 1.5,
      y: 1.5,
      tolerance: 5,
      contiguous: true,
      target: 'visible',
    });
    expect(picked(r.region, scene.w)).toEqual(['-------', '-x-----', '-x-----', '-------']);
    expect(r.count).toBe(2);
    expect(r.bounds).toEqual({ x: 1, y: 1, width: 1, height: 2 });
  });

  it('同色擦掉＋整張：看得到的同色都選（右邊那塊白也選到）', () => {
    const r = colorRegion(scene.rgba, mask, scene.w, scene.h, {
      x: 1,
      y: 1,
      tolerance: 5,
      contiguous: false,
      target: 'visible',
    });
    expect(picked(r.region, scene.w)).toEqual(['-------', '-x---x-', '-x---x-', '-------']);
    expect(r.count).toBe(4);
    expect(r.bounds).toEqual({ x: 1, y: 1, width: 5, height: 2 });
  });

  it('同色補回＋相連：只選被去掉的同色（看得到的白領子不算，但可以從白底一路連過去）', () => {
    const r = colorRegion(scene.rgba, mask, scene.w, scene.h, {
      x: 0,
      y: 0,
      tolerance: 5,
      contiguous: true,
      target: 'removed',
    });
    expect(picked(r.region, scene.w)).toEqual(['xxxxxxx', 'x-----x', 'x-----x', 'xxxxxxx']);
    expect(r.count).toBe(18);
  });

  it('點到的像素不符合條件（用同色擦掉點已經去掉的地方、點在圖外）：沒有範圍', () => {
    const none = (x: number, y: number, target: 'visible' | 'removed') =>
      colorRegion(scene.rgba, mask, scene.w, scene.h, {
        x,
        y,
        tolerance: 50,
        contiguous: true,
        target,
      });
    for (const r of [
      none(0, 0, 'visible'),
      none(3, 1, 'removed'),
      none(-1, 0, 'visible'),
      none(7, 0, 'visible'),
    ]) {
      expect(r.count).toBe(0);
      expect(r.bounds).toBeNull();
      expect(r.region.every((v) => v === 0)).toBe(true);
    }
  });

  it('半透明的邊（遮罩 1～254）同時算看得到與被去掉', () => {
    const s = img(['WWW']);
    const m = maskOf(['#+ ']);
    const vis = colorRegion(s.rgba, m, 3, 1, {
      x: 0,
      y: 0,
      tolerance: 0,
      contiguous: true,
      target: 'visible',
    });
    expect(picked(vis.region, 3)).toEqual(['xx-']);
    const rem = colorRegion(s.rgba, m, 3, 1, {
      x: 2,
      y: 0,
      tolerance: 0,
      contiguous: true,
      target: 'removed',
    });
    expect(picked(rem.region, 3)).toEqual(['-xx']);
  });

  it('容許度：差 ≤ 容許度才選（R 與 r 的差約 3.9）', () => {
    const s = img(['RrK']);
    const m = maskOf(['###']);
    const d = (Math.sqrt(10 * 10 + 10 * 10 + 10 * 10) / COLOR_DISTANCE_MAX) * 100;
    const at = (tolerance: number) =>
      picked(
        colorRegion(s.rgba, m, 3, 1, { x: 0, y: 0, tolerance, contiguous: true, target: 'visible' })
          .region,
        3,
      )[0];
    expect(at(0)).toBe('x--');
    expect(at(d - 0.01)).toBe('x--');
    expect(at(d + 0.01)).toBe('xx-');
    expect(at(100)).toBe('xxx');
  });

  it('原圖完全透明的像素不選，也不能經過', () => {
    const s = img(['W.W']);
    const m = maskOf(['###']);
    const r = colorRegion(s.rgba, m, 3, 1, {
      x: 0,
      y: 0,
      tolerance: 100,
      contiguous: true,
      target: 'visible',
    });
    expect(picked(r.region, 3)).toEqual(['x--']);
    const all = colorRegion(s.rgba, m, 3, 1, {
      x: 0,
      y: 0,
      tolerance: 100,
      contiguous: false,
      target: 'visible',
    });
    expect(picked(all.region, 3)).toEqual(['x-x']);
    expect(
      colorRegion(s.rgba, m, 3, 1, {
        x: 1,
        y: 0,
        tolerance: 100,
        contiguous: false,
        target: 'visible',
      }).count,
    ).toBe(0);
  });

  it('相連是四連通（斜對角不算）', () => {
    const s = img(['WK', 'KW']);
    const m = maskOf(['##', '##']);
    const r = colorRegion(s.rgba, m, 2, 2, {
      x: 0,
      y: 0,
      tolerance: 1,
      contiguous: true,
      target: 'visible',
    });
    expect(picked(r.region, 2)).toEqual(['x-', '--']);
  });

  it('大圖：2000 × 2000 整片同色、相連，不會堆疊溢位', () => {
    const w = 2000;
    const h = 2000;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
    const m = new Uint8Array(w * h).fill(255);
    const r = colorRegion(rgba, m, w, h, {
      x: 5,
      y: 5,
      tolerance: 0,
      contiguous: true,
      target: 'visible',
    });
    expect(r.count).toBe(w * h);
  });
});

describe('applyRegion', () => {
  it('擦掉設成 0、補回設成 255，範圍外不動', () => {
    const m = Uint8Array.from([255, 128, 0, 77]);
    const region = Uint8Array.from([1, 1, 1, 0]);
    applyRegion(m, region, 'erase');
    expect([...m]).toEqual([0, 0, 0, 77]);
    applyRegion(m, region, 'restore');
    expect([...m]).toEqual([255, 255, 255, 77]);
  });
});
