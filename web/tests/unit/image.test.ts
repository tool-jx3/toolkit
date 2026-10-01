import { describe, expect, it } from 'vitest';
import { dominantColors, fitSize, opaqueBounds, padRect, scanOpaqueBounds } from '@/core/image';

function canvas(
  W: number,
  H: number,
  fill: (x: number, y: number) => [number, number, number, number],
) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(fill(x, y), (y * W + x) * 4);
  return { data, width: W, height: H };
}

/** scanOpaqueBounds 的讀取函式：從整張像素切出 (x, y, w, h) 那一塊，順便檢查範圍與累計讀了多少 */
function regionReader(img: { data: Uint8ClampedArray; width: number; height: number }) {
  const read = (x: number, y: number, w: number, h: number) => {
    expect(x >= 0 && y >= 0 && w > 0 && h > 0).toBe(true);
    expect(x + w <= img.width && y + h <= img.height).toBe(true);
    read.area += w * h;
    const out = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) {
      const from = ((y + r) * img.width + x) * 4;
      out.set(img.data.subarray(from, from + w * 4), r * w * 4);
    }
    return out;
  };
  read.area = 0;
  return read;
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

  it('只讀四周的透明邊界偵測（scanOpaqueBounds）與整張讀的結果相同', () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed % n;
    };
    const cases: { data: Uint8ClampedArray; width: number; height: number }[] = [
      canvas(1, 1, () => [0, 0, 0, 1]),
      canvas(1, 1, () => [9, 9, 9, 0]),
      canvas(600, 3, () => [0, 0, 0, 0]),
      canvas(3, 700, (x, y) => (x === 2 && y === 650 ? [0, 0, 0, 1] : [0, 0, 0, 0])),
      canvas(40, 30, () => [1, 2, 3, 255]),
    ];
    for (let k = 0; k < 200; k++) {
      const W = 1 + rnd(90);
      const H = 1 + rnd(90);
      const dots = rnd(4);
      const pts = Array.from({ length: dots }, () => [rnd(W), rnd(H), 1 + rnd(255)]);
      cases.push(
        canvas(W, H, (x, y) => {
          const p = pts.find(([px, py]) => px === x && py === y);
          return p ? [rnd(256), rnd(256), rnd(256), p[2]] : [rnd(256), rnd(256), rnd(256), 0];
        }),
      );
    }
    for (const img of cases)
      expect(scanOpaqueBounds(img.width, img.height, regionReader(img))).toEqual(opaqueBounds(img));
    /* 四周留白不多的大圖只讀邊緣 */
    const big = canvas(2000, 3000, (x, y) =>
      x >= 150 && x < 1880 && y >= 100 && y < 2920 ? [1, 2, 3, 255] : [0, 0, 0, 0],
    );
    const read = regionReader(big);
    expect(scanOpaqueBounds(big.width, big.height, read)).toEqual({
      x: 150,
      y: 100,
      width: 1730,
      height: 2820,
    });
    expect(read.area / (2000 * 3000)).toBeLessThan(0.4);
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
