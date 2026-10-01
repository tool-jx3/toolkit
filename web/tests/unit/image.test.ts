import { describe, expect, it } from 'vitest';
import { dominantColors, fitSize, opaqueBounds, padRect } from '@/core/image';

function canvas(
  W: number,
  H: number,
  fill: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(fill(x, y), (y * W + x) * 4);
  return { data, width: W, height: H };
}

describe('影像工具', () => {
  it('透明邊界偵測', () => {
    const img = canvas(20, 10, (x, y) =>
      x >= 3 && x < 8 && y >= 2 && y < 9 ? [255, 0, 0, 255] : [0, 0, 0, 0],
    );
    expect(opaqueBounds(img)).toEqual({ x: 3, y: 2, width: 5, height: 7 });
    expect(opaqueBounds(canvas(4, 4, () => [0, 0, 0, 0]))).toBeNull();
    expect(padRect({ x: 3, y: 2, width: 5, height: 7 }, 4, { width: 20, height: 10 })).toEqual({
      x: 0,
      y: 0,
      width: 12,
      height: 10,
    });
  });

  it('等比縮放', () => {
    expect(fitSize({ width: 200, height: 100 }, { width: 100, height: 100 })).toMatchObject({
      width: 100,
      height: 50,
      x: 0,
      y: 25,
      scale: 0.5,
    });
    expect(
      fitSize({ width: 200, height: 100 }, { width: 100, height: 100 }, 'cover'),
    ).toMatchObject({ width: 200, height: 100, scale: 1 });
    expect(
      fitSize({ width: 10, height: 10 }, { width: 100, height: 100 }, 'contain', false).scale,
    ).toBe(1);
  });

  it('取主色：依面積排序、忽略透明', () => {
    const img = canvas(10, 10, (x) =>
      x < 6 ? [200, 30, 30, 255] : x < 9 ? [30, 30, 200, 255] : [0, 255, 0, 0],
    );
    const colors = dominantColors(img, 3);
    expect(colors[0].color).toBe('#c81e1e');
    expect(colors[0].ratio).toBeCloseTo(6 / 9, 5);
    expect(colors[1].color).toBe('#1e1ec8');
  });
});

describe('detectImageType', () => {
  it('依檔頭判斷格式（含 APNG）', async () => {
    const { detectImageType } = await import('@/core/image');
    const { encodePng } = await import('@/core/encode/png');
    const { ApngEncoder } = await import('@/core/encode/apng');
    const png = await encodePng(new Uint8Array(16), 2, 2);
    expect(detectImageType(png)).toBe('png');
    const enc = new ApngEncoder({ width: 2, height: 2, fps: 1 });
    await enc.addFrame(new Uint8Array(16));
    await enc.addFrame(new Uint8Array(16).fill(255));
    expect(detectImageType((await enc.finish()).bytes)).toBe('apng');
    expect(detectImageType(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]))).toBe(
      'webp',
    );
    expect(detectImageType(new TextEncoder().encode('GIF89a'))).toBe('gif');
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectImageType(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
