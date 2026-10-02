/**
 * G2 共用層 core/decode：APNG／GIF 純 JavaScript 解碼（用本站的編碼器產生檔案再讀回）、
 * 動態 WebP 的結構解析與合成（影格影像由注入的解碼器提供）、延遲規則（過短 10 ms、讀不到 100 ms）。
 */
import { describe, expect, it } from 'vitest';
import {
  decodeApng,
  decodeGif,
  decodePng,
  decodeWebp,
  frameAtTime,
  frameDelay,
  isApng,
  isGif,
  isPng,
  isWebp,
  parseWebpInfo,
} from '@/core/decode';
import { ApngEncoder, assembleAnimatedWebp, encodePng, GifEncoder } from '@/core/encode';
import { naturalCompare, naturalSort } from '@/core/files';

const W = 6;
const H = 4;
function solid(r: number, g: number, b: number, a = 255): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) out.set([r, g, b, a], i * 4);
  return out;
}
function patch(base: Uint8ClampedArray, x: number, y: number, rgba: number[]) {
  const out = new Uint8ClampedArray(base);
  out.set(rgba, (y * W + x) * 4);
  return out;
}

describe('APNG', () => {
  it('三格 100／200／300 ms：影格、延遲、播放次數、差分合成', async () => {
    const enc = new ApngEncoder({ width: W, height: H, fps: 1000, plays: 3, deflate: 'fflate' });
    const f0 = solid(255, 0, 0);
    const f1 = patch(f0, 2, 1, [0, 255, 0, 255]);
    const f2 = patch(f1, 5, 3, [0, 0, 255, 128]);
    await enc.addFrame(new Uint8ClampedArray(f0), 100);
    await enc.addFrame(new Uint8ClampedArray(f1), 200);
    await enc.addFrame(new Uint8ClampedArray(f2), 300);
    const file = await enc.finish();
    expect(isPng(file.bytes)).toBe(true);
    expect(isApng(file.bytes)).toBe(true);
    const anim = decodeApng(file.bytes);
    expect(anim.format).toBe('apng');
    expect(anim.loops).toBe(3);
    expect(anim.frames.map((f) => f.delayMs)).toEqual([100, 200, 300]);
    expect(Array.from(anim.frames[0].rgba)).toEqual(Array.from(f0));
    expect(Array.from(anim.frames[1].rgba)).toEqual(Array.from(f1));
    expect(Array.from(anim.frames[2].rgba)).toEqual(Array.from(f2));
    expect(frameAtTime([100, 200, 300], 150)).toBe(1);
    expect(frameAtTime([100, 200, 300], 650)).toBe(0);
  });

  it('減色（調色盤＋tRNS）的 APNG 也能讀回', async () => {
    const enc = new ApngEncoder({
      width: W,
      height: H,
      fps: 10,
      quantize: true,
      deflate: 'fflate',
    });
    const a = solid(10, 20, 30, 255);
    const b = solid(200, 100, 50, 64);
    await enc.addFrame(new Uint8ClampedArray(a));
    await enc.addFrame(new Uint8ClampedArray(b));
    const anim = decodeApng((await enc.finish()).bytes);
    expect(anim.frames).toHaveLength(2);
    expect(Array.from(anim.frames[1].rgba.slice(0, 4))).toEqual([200, 100, 50, 64]);
    expect(anim.frames[0].delayMs).toBe(100);
  });

  it('單張 PNG：一格、預設延遲；超過 maxFrames 時截斷', async () => {
    const png = await encodePng(solid(1, 2, 3, 4), W, H, undefined, 'fflate');
    expect(isApng(png)).toBe(false);
    const still = decodePng(png);
    expect(still.width).toBe(W);
    expect(Array.from(still.rgba.slice(0, 4))).toEqual([1, 2, 3, 4]);
    const one = decodeApng(png);
    expect(one.format).toBe('png');
    expect(one.frames).toHaveLength(1);
    expect(one.frames[0].delayMs).toBe(100);
    const enc = new ApngEncoder({
      width: W,
      height: H,
      fps: 10,
      mergeIdentical: false,
      deflate: 'fflate',
    });
    for (let i = 0; i < 5; i++) await enc.addFrame(solid(i * 40, 0, 0));
    const cut = decodeApng((await enc.finish()).bytes, { maxFrames: 3 });
    expect(cut.frames).toHaveLength(3);
    expect(cut.truncated).toBe(true);
  });
});

describe('GIF', () => {
  it('三格、延遲、1 位元透明、播放次數', async () => {
    const enc = new GifEncoder({ width: W, height: H, fps: 100, plays: 2, variableDelay: true });
    const f0 = solid(255, 0, 0);
    const f1 = patch(f0, 1, 1, [0, 0, 0, 0]);
    const f2 = patch(f1, 4, 2, [0, 128, 255, 255]);
    await enc.addFrame(new Uint8ClampedArray(f0), 10);
    await enc.addFrame(new Uint8ClampedArray(f1), 20);
    await enc.addFrame(new Uint8ClampedArray(f2), 30);
    const file = await enc.finish();
    expect(isGif(file.bytes)).toBe(true);
    const anim = decodeGif(file.bytes);
    expect(anim.loops).toBe(2);
    expect(anim.frames.map((f) => f.delayMs)).toEqual([100, 200, 300]);
    const px = (k: number, x: number, y: number) =>
      Array.from(anim.frames[k].rgba.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
    expect(px(0, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(1, 1, 1)[3]).toBe(0);
    expect(px(2, 4, 2)).toEqual([0, 128, 255, 255]);
    expect(px(2, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it('大量顏色（LZW 碼長增加到 12 位元以上會重設）', async () => {
    const w = 64;
    const h = 64;
    const img = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++)
      img.set([(i * 7) & 255, (i * 13) & 255, (i * 29) & 255, 255], i * 4);
    const enc = new GifEncoder({ width: w, height: h, fps: 10 });
    await enc.addFrame(new Uint8ClampedArray(img));
    const anim = decodeGif((await enc.finish()).bytes);
    expect(anim.width).toBe(64);
    expect(anim.frames).toHaveLength(1);
    /* 減色後的顏色接近原色 */
    let err = 0;
    for (let i = 0; i < w * h * 4; i++)
      if (i % 4 !== 3) err += Math.abs(anim.frames[0].rgba[i] - img[i]);
    expect(err / (w * h * 3)).toBeLessThan(24);
  });
});

describe('動態 WebP（結構與合成）', () => {
  /* 假的位元流：VP8L 的內容只用來辨識是哪一格 */
  const fakeBits = (tag: number) => {
    const data = new Uint8Array([tag, 0, 0, 0]);
    const out = new Uint8Array(8 + data.length);
    out.set([0x56, 0x50, 0x38, 0x4c], 0);
    new DataView(out.buffer).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  };
  const file = assembleAnimatedWebp({
    width: 4,
    height: 2,
    loops: 0,
    hasAlpha: true,
    frames: [
      { x: 0, y: 0, w: 4, h: 2, durationMs: 120, bitstream: fakeBits(1) },
      { x: 2, y: 0, w: 2, h: 2, durationMs: 0, bitstream: fakeBits(2) },
    ],
  });

  it('解析：尺寸、循環、影格範圍與時間；每格包成單張 WebP', () => {
    expect(isWebp(file)).toBe(true);
    const info = parseWebpInfo(file);
    expect(info.animated).toBe(true);
    expect([info.width, info.height, info.loops]).toEqual([4, 2, 0]);
    expect(info.frames.map((f) => [f.x, f.y, f.w, f.h, f.durationMs])).toEqual([
      [0, 0, 4, 2, 120],
      [2, 0, 2, 2, 0],
    ]);
    expect(info.frames.every((f) => isWebp(f.still))).toBe(true);
    expect(info.frames.every((f) => !f.blend)).toBe(true);
  });

  it('合成：不混合時取代範圍；讀不到的延遲以 100 ms 計', async () => {
    const decodeStill = async (bytes: Uint8Array) => {
      const tag = bytes[bytes.length - 4];
      const w = tag === 1 ? 4 : 2;
      const rgba = new Uint8ClampedArray(w * 2 * 4);
      for (let i = 0; i < w * 2; i++)
        rgba.set(tag === 1 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
      return { width: w, height: 2, rgba };
    };
    const anim = await decodeWebp(file, decodeStill);
    expect(anim.frames).toHaveLength(2);
    expect(anim.frames.map((f) => f.delayMs)).toEqual([120, 100]);
    expect(Array.from(anim.frames[1].rgba.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(anim.frames[1].rgba.slice(8, 12))).toEqual([0, 0, 255, 255]);
  });
});

describe('延遲規則與檔名自然排序', () => {
  it('過短以 10 ms、讀不到以 100 ms 計', () => {
    expect(frameDelay(undefined)).toBe(100);
    expect(frameDelay(0)).toBe(100);
    expect(frameDelay(3)).toBe(10);
    expect(frameDelay(83)).toBe(83);
  });
  it('1、2、10（不是 1、10、2）', () => {
    expect(naturalSort(['10.png', '2.png', '1.png'])).toEqual(['1.png', '2.png', '10.png']);
    expect(naturalSort(['frame_10', 'Frame_9', 'frame_1'])).toEqual([
      'frame_1',
      'Frame_9',
      'frame_10',
    ]);
    expect(naturalSort(['角色02.png', '角色1.png', '角色010.png'])).toEqual([
      '角色1.png',
      '角色02.png',
      '角色010.png',
    ]);
    expect(naturalCompare('a01', 'a1')).toBeGreaterThan(0);
    expect(naturalCompare('abc', 'abc')).toBe(0);
  });
});
