/**
 * GIF 編碼器的色數上限與 Floyd–Steinberg 抖色（video-anim 移植時新增；不給時輸出與以前相同）。
 */
import { describe, expect, it } from 'vitest';
import { GifEncoder, type GifEncoderOptions } from '@/core/encode/gif';
import { copyFrames, gradient, movingSquare, sameBytes } from '../helpers/frames';
import { gifFrameRgba, parseGif } from '../helpers/gif';

const W = 48;
const H = 32;

async function encode(frames: Uint8ClampedArray[], opts: Partial<GifEncoderOptions> = {}) {
  const enc = new GifEncoder({ width: W, height: H, fps: 10, ...opts });
  for (const f of copyFrames(frames)) await enc.addFrame(f);
  return enc.finish();
}

/** 不透明的漸層（超過 256 色） */
function opaqueGradient(phase: number): Uint8ClampedArray {
  const f = gradient(W, H, phase);
  for (let i = 3; i < f.length; i += 4) f[i] = 255;
  return f;
}

const paletteSize = (p: Uint8Array | null) => (p ? p.length / 3 : 0);

/** 解碼後與原圖每通道的平均差 */
function meanError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) s += Math.abs(a[i + c] - b[i + c]);
    n += 3;
  }
  return s / n;
}

/** 4 × 4 區塊平均之後的差（抖色在小範圍平均後比較接近原圖） */
function blockError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let by = 0; by < H; by += 4) {
    for (let bx = 0; bx < W; bx += 4) {
      for (let c = 0; c < 3; c++) {
        let sa = 0;
        let sb = 0;
        for (let y = by; y < by + 4; y++) {
          for (let x = bx; x < bx + 4; x++) {
            sa += a[(y * W + x) * 4 + c];
            sb += b[(y * W + x) * 4 + c];
          }
        }
        s += Math.abs(sa - sb) / 16;
        n++;
      }
    }
  }
  return s / n;
}

describe('GIF 的色數上限與抖色', () => {
  const frames = [opaqueGradient(0), opaqueGradient(3)];

  it('不給新選項時輸出與以前相同（maxColors 256、不抖色）', async () => {
    const square = movingSquare(W, H, 6, [2]);
    const a = await encode(square);
    const b = await encode(square, { maxColors: 256, dither: 'none' });
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
    const c = await encode(frames, { localPalettes: true });
    const d = await encode(frames, { localPalettes: true, maxColors: 256, dither: 'none' });
    expect(sameBytes(c.bytes, d.bytes)).toBe(true);
  });

  it('maxColors：每格的調色盤不超過上限', async () => {
    for (const max of [128, 64]) {
      const file = await encode(frames, { localPalettes: true, maxColors: max });
      const info = parseGif(file.bytes);
      for (const f of info.frames) expect(paletteSize(f.localPalette)).toBeLessThanOrEqual(max);
      expect(file.colors?.lossless).toBe(false);
      expect(file.colors?.count).toBeLessThanOrEqual(max);
      /* 全域調色盤也一樣 */
      const g = parseGif((await encode(frames, { maxColors: max })).bytes);
      expect(paletteSize(g.globalPalette)).toBeLessThanOrEqual(max);
    }
  });

  it('色數在上限內時無損，抖色不作用', async () => {
    const square = movingSquare(W, H, 4);
    const a = await encode(square, { maxColors: 64 });
    const b = await encode(square, { maxColors: 64, dither: 'floyd-steinberg' });
    expect(a.colors?.lossless).toBe(true);
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
  });

  it('Floyd–Steinberg：顏色不足時改變像素對應，區塊平均更接近原圖', async () => {
    const plain = await encode(frames, { localPalettes: true, maxColors: 16 });
    const dith = await encode(frames, {
      localPalettes: true,
      maxColors: 16,
      dither: 'floyd-steinberg',
    });
    expect(sameBytes(plain.bytes, dith.bytes)).toBe(false);
    const pi = parseGif(plain.bytes);
    const di = parseGif(dith.bytes);
    for (let i = 0; i < frames.length; i++) {
      const p = gifFrameRgba(pi, pi.frames[i]);
      const d = gifFrameRgba(di, di.frames[i]);
      expect(blockError(d, frames[i])).toBeLessThan(blockError(p, frames[i]));
      /* 逐像素的誤差不會差太多 */
      expect(meanError(d, frames[i])).toBeLessThan(meanError(p, frames[i]) * 2 + 4);
    }
  });

  it('抖色：同樣的輸入輸出相同（決定性），透明像素維持透明', async () => {
    const withHole = frames.map((f) => {
      const g = f.slice();
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g[(y * W + x) * 4 + 3] = 0;
      return g;
    });
    const a = await encode(withHole, {
      localPalettes: true,
      maxColors: 32,
      dither: 'floyd-steinberg',
    });
    const b = await encode(withHole, {
      localPalettes: true,
      maxColors: 32,
      dither: 'floyd-steinberg',
    });
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
    const info = parseGif(a.bytes);
    const rgba = gifFrameRgba(info, info.frames[0]);
    expect(rgba[3]).toBe(0);
    expect(rgba[(3 * W + 3) * 4 + 3]).toBe(0);
    expect(rgba[(5 * W + 5) * 4 + 3]).toBe(255);
  });
});
