/**
 * core/image 的復古像素化（rpg-screenshot 移植時新增）：retroGrade 的色調、亮度／對比／飽和度、取階、有序抖色、掌機四色，
 * 小圖的格數、剛好蓋滿的範圍。畫布的部分（pixelateImage）由 rpg-screenshot 的 E2E 與原作逐像素比對。
 */
import { describe, expect, it } from 'vitest';
import {
  BAYER_4X4,
  coverCrop,
  HANDHELD_PALETTE,
  pixelGrid,
  RETRO_TONES,
  retroGrade,
} from '@/core/image';

/** 一個像素（RGBA）跑 retroGrade */
function one(rgb: [number, number, number], o: Parameters<typeof retroGrade>[3], x = 0, y = 0) {
  const w = x + 1;
  const h = y + 1;
  const d = new Uint8ClampedArray(w * h * 4);
  const i = (y * w + x) * 4;
  d.set([...rgb, 200], i);
  retroGrade(d, w, h, o);
  return [...d.slice(i, i + 4)];
}

const levels = (n: number) => Array.from({ length: n }, (_, i) => Math.round((255 / (n - 1)) * i));

describe('retroGrade', () => {
  it('不抖色時取最近的一階；alpha 不動', () => {
    expect(one([100, 30, 220], { levels: 8, dither: false })).toEqual([109, 36, 219, 200]);
    expect(one([127, 128, 0], { levels: 2, dither: false })).toEqual([0, 255, 0, 200]);
    for (const n of [2, 3, 8, 32]) {
      const out = one([77, 150, 201], { levels: n, dither: false });
      for (const v of out.slice(0, 3)) expect(levels(n)).toContain(v);
    }
  });

  it('抖色：同一個顏色在 4 × 4 的格子裡依 Bayer 矩陣往上或往下取階', () => {
    const w = 4;
    const h = 4;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d.set([127, 127, 127, 255], i * 4);
    retroGrade(d, w, h, { levels: 2, dither: true });
    const bits: number[] = [];
    for (let i = 0; i < w * h; i++) bits.push(d[i * 4] ? 1 : 0);
    /* 127 ÷ 255 ≈ 0.498：127 ＋ (Bayer ÷ 16 − 0.5) × 255 ≥ 127.5 時取到 255，也就是 Bayer ≥ 9 的 7 格 */
    const expected = BAYER_4X4.flat().map((b) => (b / 16 - 0.5 + 127 / 255 >= 0.5 ? 1 : 0));
    expect(bits).toEqual(expected);
    expect(bits.filter(Boolean)).toHaveLength(7);
  });

  it('座標超過 4 時重複同一個矩陣', () => {
    const a = one([90, 90, 90], { levels: 4, dither: true }, 1, 2);
    const b = one([90, 90, 90], { levels: 4, dither: true }, 5, 6);
    expect(a).toEqual(b);
  });

  it('色調：暖色、冷色、懷舊、夜晚、黑白、褪色的公式（不截斷中間值）', () => {
    const o = { levels: 256, dither: false } as const;
    expect(one([100, 100, 100], { ...o, tone: 'warm' }).slice(0, 3)).toEqual([120, 106, 78]);
    expect(one([100, 100, 100], { ...o, tone: 'cool' }).slice(0, 3)).toEqual([84, 102, 124]);
    expect(one([100, 50, 200], { ...o, tone: 'sepia' }).slice(0, 3)).toEqual([116, 103, 80]);
    expect(one([100, 100, 100], { ...o, tone: 'night' }).slice(0, 3)).toEqual([45, 68, 117]);
    expect(one([255, 0, 0], { ...o, tone: 'mono' }).slice(0, 3)).toEqual([76, 76, 76]);
    /* 褪色：亮度 Y＝100 時 (100 × 0.8 ＋ 34, …) */
    expect(one([100, 100, 100], { ...o, tone: 'faded' }).slice(0, 3)).toEqual([114, 110, 120]);
    /* 中間不截斷：暖色 R＋20 超過 255 再降亮度，結果是 255 − 30 × 2.55 ＋ 20 而不是 255 − 76.5 */
    expect(one([250, 0, 0], { ...o, tone: 'warm', brightness: -30 })[0]).toBe(194);
  });

  it('亮度、對比、飽和度', () => {
    const o = { levels: 256, dither: false } as const;
    expect(one([100, 100, 100], { ...o, brightness: 20 }).slice(0, 3)).toEqual([151, 151, 151]);
    /* 對比 0：係數 1 */
    expect(one([10, 128, 250], { ...o, contrast: 0 }).slice(0, 3)).toEqual([10, 128, 250]);
    const c = 50 * 2.55;
    const f = (259 * (c + 255)) / (255 * (259 - c));
    expect(one([100, 128, 160], { ...o, contrast: 50 }).slice(0, 3)).toEqual([
      Math.round(f * (100 - 128) + 128),
      128,
      Math.round(f * (160 - 128) + 128),
    ]);
    /* 飽和度 −100：灰階 */
    const g = one([200, 50, 100], { ...o, saturation: -100 });
    expect(g[0]).toBe(g[1]);
    expect(g[1]).toBe(g[2]);
  });

  it('掌機四色：只用四種綠；亮度 ÷ 85 四捨五入選色', () => {
    const o = { levels: 8, dither: false, tone: 'gameboy' } as const;
    expect(one([0, 0, 0], o).slice(0, 3)).toEqual([...HANDHELD_PALETTE[0]]);
    expect(one([255, 255, 255], o).slice(0, 3)).toEqual([...HANDHELD_PALETTE[3]]);
    expect(one([85, 85, 85], o).slice(0, 3)).toEqual([...HANDHELD_PALETTE[1]]);
    expect(one([170, 170, 170], o).slice(0, 3)).toEqual([...HANDHELD_PALETTE[2]]);
    /* 抖色：中間值在格子裡兩種顏色交錯 */
    const d = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i++) d.set([127, 127, 127, 255], i * 4);
    retroGrade(d, 4, 4, { ...o, dither: true });
    const greens = new Set<number>();
    for (let i = 0; i < 16; i++) greens.add(d[i * 4 + 1]);
    expect([...greens].sort((a, b) => a - b)).toEqual([98, 172]);
  });

  it('八種色調都有', () => {
    expect(RETRO_TONES).toEqual([
      'none',
      'warm',
      'cool',
      'sepia',
      'night',
      'mono',
      'faded',
      'gameboy',
    ]);
  });
});

describe('pixelGrid、coverCrop', () => {
  it('round(寬 ÷ 像素大小) × round(高 ÷ 像素大小)，至少 1', () => {
    expect(pixelGrid(816, 624, 6)).toEqual({ width: 136, height: 104 });
    expect(pixelGrid(816, 624, 20)).toEqual({ width: 41, height: 31 });
    expect(pixelGrid(1024, 576, 7)).toEqual({ width: 146, height: 82 });
    expect(pixelGrid(816, 624, 1)).toEqual({ width: 816, height: 624 });
    expect(pixelGrid(3, 3, 20)).toEqual({ width: 1, height: 1 });
    expect(pixelGrid(816, 624, 0)).toEqual({ width: 816, height: 624 });
  });

  it('剛好蓋滿：比畫面寬的圖左右各裁一半、比畫面高的圖上下各裁一半', () => {
    const wide = coverCrop({ width: 1200, height: 900 }, 816, 624);
    expect(wide.y).toBe(0);
    expect(wide.height).toBe(900);
    expect(wide.width).toBeCloseTo((900 * 816) / 624, 9);
    expect(wide.x).toBeCloseTo((1200 - wide.width) / 2, 9);
    const tall = coverCrop({ width: 600, height: 1000 }, 1024, 576);
    expect(tall).toEqual({
      x: 0,
      y: (1000 - 600 / (1024 / 576)) / 2,
      width: 600,
      height: 600 / (1024 / 576),
    });
  });
});
