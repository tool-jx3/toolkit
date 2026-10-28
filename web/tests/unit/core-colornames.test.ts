/**
 * core/colornames（本站自編的繁中色名、色系）、core/color 的明度與 Oklab、
 * core/image 的 placedPointToImage（頭像上的點 → 原圖的點）。color-palette 併入色票櫃、配色卡時新增（2026-10）。
 */
import { describe, expect, it } from 'vitest';
import { cieLightness, oklabDistance, parseColor, rgbToOklab } from '@/core/color';
import {
  COLOR_FAMILIES,
  COLOR_FAMILY_LABELS,
  COLOR_NAMES,
  colorFamily,
  colorName,
} from '@/core/colornames';
import { placedPointToImage, placedTransform } from '@/core/image';

describe('core/colornames', () => {
  it('色名表：名字不重複、色碼都是小寫 #rrggbb', () => {
    const names = COLOR_NAMES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of COLOR_NAMES) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(COLOR_NAMES.length).toBeGreaterThan(100);
  });

  it('表裡的顏色得到自己的名字；接近的顏色得到最接近的名字', () => {
    for (const c of COLOR_NAMES) expect(colorName(c.hex)).toBe(c.name);
    expect(colorName('#f4a08c')).toBe('鮭魚粉');
    expect(colorName('#000000')).toBe('漆黑');
    expect(colorName('#ffffff')).toBe('雪白');
    expect(colorName('看不懂')).toBe('');
  });

  it('同一組不重複：用過的名字跳過、改用次接近的', () => {
    const used = new Set<string>();
    const a = colorName('#d42a2a', used);
    const b = colorName('#d42a2a', used);
    expect(a).toBe('正紅');
    expect(b).not.toBe(a);
    expect(used.size).toBe(2);
  });

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

describe('core/color：明度、Oklab', () => {
  it('明度 L*：黑 0、白 100、中灰約 53.6', () => {
    expect(cieLightness('#000000')).toBe(0);
    expect(cieLightness('#ffffff')).toBeCloseTo(100, 3);
    expect(cieLightness('#808080')).toBeCloseTo(53.59, 1);
  });

  it('Oklab：白的 L 是 1、距離對稱', () => {
    const w = rgbToOklab(parseColor('#ffffff')!);
    const k = rgbToOklab(parseColor('#000000')!);
    expect(w.L).toBeCloseTo(1, 3);
    expect(oklabDistance(w, k)).toBeCloseTo(oklabDistance(k, w), 9);
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
