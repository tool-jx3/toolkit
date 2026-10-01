/**
 * 主色「依鮮豔度加權」模式：color-palette 規格 3.4 的 9 組測試圖（測試圖依規格描述用腳本產生）。
 */
import { describe, expect, it } from 'vitest';
import {
  dominantColorVivid,
  evenSplits,
  moveSplit,
  type PixelBuffer,
  samplePixel,
  splitRows,
  vividColorsBySplits,
} from '@/core/image';

type Rgba = [number, number, number, number];

function image(width: number, height: number, at: (x: number, y: number) => Rgba): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(at(x, y), (y * width + x) * 4);
  return { data, width, height };
}

const hex = (h: string): Rgba => [
  Number.parseInt(h.slice(1, 3), 16),
  Number.parseInt(h.slice(3, 5), 16),
  Number.parseInt(h.slice(5, 7), 16),
  255,
];

/** 100 × 300，上中下三等分：紅、綠、藍 */
const rgb3 = image(100, 300, (_x, y) => hex(y < 100 ? '#e03030' : y < 200 ? '#30c030' : '#3050e0'));

describe('dominantColorVivid（規格 3.4 的 9 組）', () => {
  it('1. 三等分 × 3 段：各段是自己的顏色，比例各 0.333', () => {
    expect(vividColorsBySplits(rgb3, evenSplits(3))).toEqual([
      { color: '#e03030', ratio: 0.333 },
      { color: '#30c030', ratio: 0.333 },
      { color: '#3050e0', ratio: 0.333 },
    ]);
  });

  it('2. 三等分 × 5 段：紅、紅、綠、藍、藍（跨兩色的段取占多數的）', () => {
    const r = vividColorsBySplits(rgb3, evenSplits(5));
    expect(r.map((c) => c.color)).toEqual(['#e03030', '#e03030', '#30c030', '#3050e0', '#3050e0']);
    expect(r.map((c) => c.ratio)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
  });

  it('3. 唯一一條分割線在 2% 處：紅（0.02）、藍（0.98）', () => {
    expect(vividColorsBySplits(rgb3, [0.02])).toEqual([
      { color: '#e03030', ratio: 0.02 },
      { color: '#3050e0', ratio: 0.98 },
    ]);
  });

  it('4. 上 20% 橘、下 80% 灰 → 橘（灰色幾乎不加分）', () => {
    const img = image(100, 100, (_x, y) => hex(y < 20 ? '#e0a020' : '#808080'));
    expect(dominantColorVivid(img)).toBe('#e0a020');
  });

  it('5. 上半 #101010、下半 #f8f8f8 → 同分，取先出現的上半', () => {
    const img = image(100, 100, (_x, y) => hex(y < 50 ? '#101010' : '#f8f8f8'));
    expect(dominantColorVivid(img)).toBe('#101010');
  });

  it('6. 整張紅色、不透明度 40% → 黑色（全部不列入）', () => {
    const img = image(100, 100, () => [224, 48, 48, 102]);
    expect(dominantColorVivid(img)).toBe('#000000');
  });

  it('7. 細微變化的紅（60%）＋藍（40%）：容許值 20／50 → #c76664；容許值 1 → #3264c8', () => {
    const img = image(100, 100, (x, y) =>
      y < 60 ? [190 + (x % 12), 100 + ((x + y) % 7), 100, 255] : [0x32, 0x64, 0xc8, 255],
    );
    expect(dominantColorVivid(img, { tolerance: 20 })).toBe('#c76664');
    expect(dominantColorVivid(img, { tolerance: 50 })).toBe('#c76664');
    expect(dominantColorVivid(img, { tolerance: 1 })).toBe('#3264c8');
  });

  it('8. 上 70% 淡膚色、下 30% 紅 → 淡膚色（面積較大的淡色勝出）', () => {
    const img = image(100, 100, (_x, y) => hex(y < 70 ? '#f0d0b0' : '#c03030'));
    expect(dominantColorVivid(img)).toBe('#f0d0b0');
  });

  it('9. 全透明 → 黑色', () => {
    expect(dominantColorVivid(image(100, 100, () => [0, 0, 0, 0]))).toBe('#000000');
  });
});

describe('分割線與取色點', () => {
  it('evenSplits／splitRows：等分與四捨五入到整列', () => {
    expect(evenSplits(1)).toEqual([]);
    expect(evenSplits(4)).toEqual([0.25, 0.5, 0.75]);
    expect(splitRows([0.02], 300)).toEqual([
      { y0: 0, y1: 6 },
      { y0: 6, y1: 300 },
    ]);
  });

  it('moveSplit：不越過相鄰的線、至少相隔 2%、不出圖', () => {
    const s = [0.25, 0.5, 0.75];
    expect(moveSplit(s, 1, 0.1)).toEqual([0.25, 0.27, 0.75]);
    expect(moveSplit(s, 1, 0.9)).toEqual([0.25, 0.73, 0.75]);
    expect(moveSplit(s, 0, -1)[0]).toBeCloseTo(0.02);
    expect(moveSplit(s, 2, 2)[2]).toBeCloseTo(0.98);
  });

  it('samplePixel：只看 RGB；完全透明是黑色；超出圖片夾在邊緣', () => {
    const img = image(2, 1, (x) => (x === 0 ? [10, 20, 30, 40] : [200, 100, 50, 0]));
    expect(samplePixel(img, 0, 0)).toBe('#0a141e');
    expect(samplePixel(img, 1, 0)).toBe('#000000');
    expect(samplePixel(img, -5, 9)).toBe('#0a141e');
  });
});
