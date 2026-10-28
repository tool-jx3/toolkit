/**
 * core/colornames（色系）、core/color 的明度、core/image 的 placedPointToImage（頭像上的點 → 原圖的點）。
 * color-palette 併入色票櫃時新增（2026-10）。
 */
import { describe, expect, it } from 'vitest';
import { cieLightness } from '@/core/color';
import { COLOR_FAMILIES, COLOR_FAMILY_LABELS, colorFamily } from '@/core/colornames';
import { placedPointToImage, placedTransform } from '@/core/image';

describe('core/colornames', () => {
  it('色系：依 HSV 分界', () => {
    const cases: [string, string][] = [
      ['#d42a2a', 'red'],
      ['#f29cb5', 'pink'],
      ['#f39233', 'orange'],
      ['#8a5a3c', 'brown'],
      ['#f5e04a', 'yellow'],
      ['#30a46c', 'green'],
      ['#3b9eff', 'blue'],
      ['#8e4ec6', 'purple'],
      ['#e8608f', 'pink'],
      ['#111111', 'black'],
      ['#9b9a97', 'gray'],
      ['#fbfbf8', 'white'],
    ];
    for (const [hex, f] of cases) expect(colorFamily(hex), hex).toBe(f);
    expect(COLOR_FAMILIES.every((f) => COLOR_FAMILY_LABELS[f])).toBe(true);
  });
});

describe('core/color：明度', () => {
  it('明度 L*：黑 0、白 100、中灰約 53.6', () => {
    expect(cieLightness('#000000')).toBe(0);
    expect(cieLightness('#ffffff')).toBeCloseTo(100, 3);
    expect(cieLightness('#808080')).toBeCloseTo(53.59, 1);
  });
});

describe('placedPointToImage：框裡的一點 → 原圖的一點', () => {
  const img = { width: 600, height: 800 };
  const box = { x: 0, y: 0, width: 1, height: 1 };
  it('預設位置：框的中心是圖的中心，框的左上角是正方形範圍的左上角', () => {
    const p = { zoom: 1, x: 0, y: 0, turns: 0 };
    expect(placedPointToImage(img, box, p, 0.5, 0.5)).toEqual({ x: 300, y: 400 });
    const tl = placedPointToImage(img, box, p, 0, 0);
    expect([tl.x, tl.y]).toEqual([0, 100]);
  });

  it('放大、位移、轉 90° 時和 placedTransform 互為反算', () => {
    for (const p of [
      { zoom: 2, x: 0.1, y: -0.2, turns: 0 },
      { zoom: 1.5, x: -0.05, y: 0.1, turns: 1 },
      { zoom: 3, x: 0.2, y: 0.3, turns: 3 },
    ]) {
      const t = placedTransform(img, box, p);
      const q = placedPointToImage(img, box, p, 0.3, 0.7);
      /* 再把原圖的點畫回框裡 */
      const a = (t.turns * Math.PI) / 2;
      const dx = (q.x - img.width / 2) * t.scale;
      const dy = (q.y - img.height / 2) * t.scale;
      const bx = t.cx + dx * Math.cos(a) - dy * Math.sin(a);
      const by = t.cy + dx * Math.sin(a) + dy * Math.cos(a);
      expect(bx).toBeCloseTo(0.3, 9);
      expect(by).toBeCloseTo(0.7, 9);
    }
  });
});
