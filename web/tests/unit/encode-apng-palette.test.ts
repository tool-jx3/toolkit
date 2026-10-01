/**
 * ApngEncoder 的固定調色盤（palette 選項）：顏色完全不變（包含完全透明像素的 RGB）、調色盤 PNG、錯誤處理。
 */
import { describe, expect, it } from 'vitest';
import { ApngEncoder } from '@/core/encode/apng';
import { composeApng, decodePixels, parseApng } from '../helpers/png';

const W = 6;
const H = 4;

/** 單色＋逐格不同的透明度；第 2、3 格相同 */
function frames(): Uint8ClampedArray[] {
  const alphas = [
    [0, 0, 0, 0, 0, 0],
    [0, 64, 128, 192, 255, 255],
    [0, 64, 128, 192, 255, 255],
    [255, 255, 255, 255, 255, 255],
  ];
  return alphas.map((row) => {
    const f = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) f.set([40, 33, 47, row[x]], (y * W + x) * 4);
    return f;
  });
}

const palette = () => {
  const p = new Uint8Array(5 * 4);
  [0, 64, 128, 192, 255].forEach((a, i) => {
    p.set([40, 33, 47, a], i * 4);
  });
  return p;
};

describe('APNG 固定調色盤', () => {
  it('輸出調色盤 PNG，PLTE／tRNS 就是給的調色盤，完全透明的像素也保留 RGB', async () => {
    const enc = new ApngEncoder({ width: W, height: H, fps: 1000, palette: palette(), plays: 1 });
    for (const f of frames()) await enc.addFrame(f, 40);
    const file = await enc.finish();
    expect(file.colors).toEqual({ lossless: true, count: 5 });
    expect(file.frames).toBe(4);
    expect(file.storedFrames).toBe(3);
    const info = parseApng(file.bytes);
    expect(info.ihdr.colorType).toBe(3);
    expect(Array.from(info.plte!)).toEqual([
      40, 33, 47, 40, 33, 47, 40, 33, 47, 40, 33, 47, 40, 33, 47,
    ]);
    expect(Array.from(info.trns!)).toEqual([0, 64, 128, 192]);
    expect(info.frames.map((f) => [f.delayNum, f.delayDen])).toEqual([
      [40, 1000],
      [80, 1000],
      [40, 1000],
    ]);
    const composed = composeApng(info);
    const src = frames();
    expect(Array.from(composed[0])).toEqual(Array.from(src[0]));
    expect(Array.from(composed[1])).toEqual(Array.from(src[1]));
    expect(Array.from(composed[2])).toEqual(Array.from(src[3]));
  });

  it('預設圖與「不合併」也用同一個調色盤', async () => {
    const enc = new ApngEncoder({
      width: W,
      height: H,
      fps: 10,
      palette: palette(),
      mergeIdentical: false,
    });
    const f = frames();
    enc.setStill(f[1]);
    for (const x of frames()) await enc.addFrame(x);
    const file = await enc.finish();
    expect(file.storedFrames).toBe(4);
    const info = parseApng(file.bytes);
    expect(info.stillIdat).not.toBeNull();
    const still = decodePixels(info.stillIdat!, W, H, 3, info.plte, info.trns);
    expect(Array.from(still)).toEqual(Array.from(f[1]));
  });

  it('像素不在調色盤裡、調色盤重複或超過 256 色時丟錯誤', async () => {
    const enc = new ApngEncoder({ width: W, height: H, fps: 10, palette: palette() });
    const bad = frames()[1];
    bad[3] = 1;
    await expect(enc.addFrame(bad)).rejects.toThrow(RangeError);
    const dup = new Uint8Array(8);
    expect(() => new ApngEncoder({ width: 1, height: 1, fps: 1, palette: dup })).toThrow(
      RangeError,
    );
    expect(
      () => new ApngEncoder({ width: 1, height: 1, fps: 1, palette: new Uint8Array(257 * 4) }),
    ).toThrow(RangeError);
  });
});
