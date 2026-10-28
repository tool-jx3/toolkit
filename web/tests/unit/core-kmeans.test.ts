/**
 * core/image 的 k-means 取色（kmeansPalette、pickKeyColor、nearestPaletteColor、mixColors）：
 * color-palette 的配色卡新增（2026-10）。同一張圖、同樣的 N 結果一定相同（固定種子）。
 */
import { describe, expect, it } from 'vitest';
import {
  kmeansPalette,
  mixColors,
  nearestPaletteColor,
  type PaletteColor,
  pickKeyColor,
} from '@/core/image';

/** 一塊一塊的測試圖：每一塊（顏色, 像素數） */
function blocks(list: [number[], number][], alpha = 255) {
  const total = list.reduce((a, [, k]) => a + k, 0);
  const data = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [rgb, k] of list)
    for (let j = 0; j < k; j++) {
      data.set([rgb[0], rgb[1], rgb[2], alpha], i);
      i += 4;
    }
  return { data, width: total, height: 1 };
}

/** 有雜訊的照片風測試圖（固定的亂數） */
function noisy(w: number, h: number) {
  let a = 12345;
  const rnd = () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const base = y < h / 3 ? [200, 60, 60] : y < (2 * h) / 3 ? [60, 160, 90] : [40, 60, 180];
      const i = (y * w + x) * 4;
      data[i] = base[0] + rnd() * 40 - 20;
      data[i + 1] = base[1] + rnd() * 40 - 20;
      data[i + 2] = base[2] + rnd() * 40 - 20;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

describe('kmeansPalette', () => {
  it('同一張圖、同樣的 N：結果完全相同（固定種子）', () => {
    const img = noisy(150, 120);
    for (const k of [4, 5, 6]) {
      const a = kmeansPalette(img, k);
      const b = kmeansPalette(img, k);
      expect(a).toEqual(b);
      expect(a.length).toBeLessThanOrEqual(k);
    }
  });

  it('三種顏色的圖：取出那三色，占比正確、由暗到亮排列；顏色比 N 少時不湊重複的', () => {
    const img = blocks([
      [[224, 48, 48], 300],
      [[48, 192, 48], 200],
      [[48, 80, 224], 500],
    ]);
    const r = kmeansPalette(img, 5);
    expect(r.map((c) => c.color)).toEqual(['#3050e0', '#e03030', '#30c030']);
    expect(r.map((c) => c.share)).toEqual([0.5, 0.3, 0.2]);
    expect(kmeansPalette(img, 5, { order: 'share' }).map((c) => c.share)).toEqual([0.5, 0.3, 0.2]);
  });

  it('透明度 128 以下的像素不算；全部透明時回傳空陣列', () => {
    expect(kmeansPalette(blocks([[[255, 0, 0], 50]], 100), 4)).toEqual([]);
    const mixed = blocks([[[255, 0, 0], 10]]);
    const data = new Uint8ClampedArray([...mixed.data, 0, 0, 255, 127]);
    expect(kmeansPalette({ data }, 4).map((c) => c.color)).toEqual(['#ff0000']);
  });

  it('占比不到 0.4% 的顏色不要', () => {
    const img = blocks([
      [[0, 0, 0], 999],
      [[255, 255, 255], 3],
    ]);
    expect(kmeansPalette(img, 2).map((c) => c.color)).toEqual(['#000000']);
  });

  it('不同的種子可能得到不同的起點，但同一個種子永遠相同', () => {
    const img = noisy(60, 60);
    expect(kmeansPalette(img, 6, { seed: 7 })).toEqual(kmeansPalette(img, 6, { seed: 7 }));
  });
});

describe('代表色、最接近的顏色、平均', () => {
  const c = (rgb: [number, number, number], share: number): PaletteColor => ({
    rgb,
    share,
    color: `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`,
  });

  it('鮮豔又占得多的勝出；太亮、太暗的打折', () => {
    const list = [c([250, 250, 250], 0.6), c([20, 20, 20], 0.2), c([200, 60, 60], 0.2)];
    expect(pickKeyColor(list)?.color).toBe('#c83c3c');
    expect(pickKeyColor([])).toBeNull();
  });

  it('最接近的顏色（RGB 加權距離）', () => {
    const list = [c([0, 0, 0], 0.5), c([255, 0, 0], 0.5)];
    expect(nearestPaletteColor(list, [200, 10, 10])?.color).toBe('#ff0000');
    expect(nearestPaletteColor([], [0, 0, 0])).toBeNull();
  });

  it('平均（四捨五入）', () => {
    expect(
      mixColors([
        [0, 0, 0],
        [255, 255, 1],
      ]),
    ).toEqual([128, 128, 1]);
    expect(mixColors([])).toEqual([0, 0, 0]);
  });
});
