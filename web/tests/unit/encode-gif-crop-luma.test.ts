/**
 * GIF 編碼器 lock-screen 移植時加的兩個選項（不給時輸出與以前相同）：
 * - cropFrames：第 2 格起只寫變化的矩形（沒有透明、共用調色盤時），解碼出來每一格相同、檔案變小；
 * - dither: 'luma'：只擴散亮度的誤差（上限 ±48），漸層的區塊平均更接近原圖、不會冒出別的色相。
 */
import { describe, expect, it } from 'vitest';
import { GifEncoder, type GifEncoderOptions } from '@/core/encode/gif';
import { copyFrames, gradient, sameBytes } from '../helpers/frames';
import { gifFrameRgba, parseGif } from '../helpers/gif';

const W = 64;
const H = 48;

async function encode(frames: Uint8ClampedArray[], opts: Partial<GifEncoderOptions> = {}) {
  const enc = new GifEncoder({ width: W, height: H, fps: 10, ...opts });
  for (const f of copyFrames(frames)) await enc.addFrame(f);
  return enc.finish();
}

/** 不透明的底（漸層，超過 256 色）上一個每格往右移 4 px 的白色方塊 */
function slidingSquare(n: number, transparentCorner = false): Uint8ClampedArray[] {
  const out: Uint8ClampedArray[] = [];
  for (let i = 0; i < n; i++) {
    const f = gradient(W, H, 1);
    for (let k = 3; k < f.length; k += 4) f[k] = 255;
    for (let y = 20; y < 30; y++)
      for (let x = 4 + i * 4; x < 14 + i * 4; x++) f.set([255, 255, 255, 255], (y * W + x) * 4);
    if (transparentCorner) f[3] = 0;
    out.push(f);
  }
  return out;
}

/** 解碼後每一格的完整畫面（照 GIF 的位置疊上去） */
function composite(bytes: Uint8Array): Uint8Array[] {
  const info = parseGif(bytes);
  const canvas = new Uint8Array(info.width * info.height * 4);
  return info.frames.map((f) => {
    const px = gifFrameRgba(info, f);
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) {
        const s = (y * f.width + x) * 4;
        if (px[s + 3] === 0 && f.disposal !== 2) continue;
        canvas.set(px.subarray(s, s + 4), ((f.y + y) * info.width + f.x + x) * 4);
      }
    return canvas.slice();
  });
}

/** 平滑的紫色漸層（只有亮度在變），顏色多到要減色 */
function purpleRamp(): Uint8ClampedArray {
  const f = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = (x + y * W) / (W * H);
      f.set(
        [Math.round(60 + 140 * t), Math.round(40 + 90 * t), Math.round(110 + 110 * t), 255],
        (y * W + x) * 4,
      );
    }
  return f;
}

/** 4 × 4 區塊平均後的亮度差 */
function blockLumaError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const L = (p: ArrayLike<number>, i: number) =>
    0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
  let s = 0;
  let n = 0;
  for (let by = 0; by < H; by += 4)
    for (let bx = 0; bx < W; bx += 4) {
      let sa = 0;
      let sb = 0;
      for (let y = by; y < by + 4; y++)
        for (let x = bx; x < bx + 4; x++) {
          sa += L(a, (y * W + x) * 4);
          sb += L(b, (y * W + x) * 4);
        }
      s += Math.abs(sa - sb) / 16;
      n++;
    }
  return s / n;
}

/** 每個像素的色度（R−G、B−G）和原圖的平均差 */
function chromaError(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 4)
    s +=
      Math.abs(a[i] - a[i + 1] - (b[i] - b[i + 1])) +
      Math.abs(a[i + 2] - a[i + 1] - (b[i + 2] - b[i + 1]));
  return s / (a.length / 4);
}

describe('cropFrames：只寫變化的矩形', () => {
  it('不給時輸出與以前相同', async () => {
    const frames = slidingSquare(4);
    const a = await encode(frames);
    const b = await encode(frames, { cropFrames: false });
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
  });

  it('第 2 格起只有變化的範圍、解碼出來每一格相同、檔案較小（含抖色）', async () => {
    const frames = slidingSquare(5);
    for (const dither of ['none', 'floyd-steinberg', 'luma'] as const) {
      const full = await encode(frames, { dither, maxColors: 32 });
      const crop = await encode(frames, { dither, maxColors: 32, cropFrames: true });
      const info = parseGif(crop.bytes);
      expect(info.frames[0]).toMatchObject({ x: 0, y: 0, width: W, height: H });
      /* 方塊往右移 4 px：變化的範圍是舊的與新的方塊合起來（14 × 10），位置照實際 */
      expect(info.frames[1]).toMatchObject({ x: 4, y: 20, width: 14, height: 10 });
      expect(crop.bytes.length).toBeLessThan(full.bytes.length);
      const a = composite(full.bytes);
      const b = composite(crop.bytes);
      expect(b).toHaveLength(a.length);
      for (let i = 0; i < a.length; i++) expect(sameBytes(a[i], b[i])).toBe(true);
    }
  });

  it('有透明像素時每格仍寫整格（要清成背景）', async () => {
    const crop = await encode(slidingSquare(3, true), { cropFrames: true });
    for (const f of parseGif(crop.bytes).frames) expect([f.width, f.height]).toEqual([W, H]);
  });
});

describe("dither: 'luma'：只擴散亮度的抖色", () => {
  const ramp = purpleRamp();

  it('色數在上限內時無損、不作用；同樣的輸入輸出相同', async () => {
    const small = slidingSquare(2).map((f) => {
      const g = f.slice();
      for (let i = 0; i < g.length; i += 4) g.set([g[i] & 0xc0, 0, 0, 255], i);
      return g;
    });
    const a = await encode(small);
    const b = await encode(small, { dither: 'luma' });
    expect(a.colors?.lossless).toBe(true);
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
    const c = await encode([ramp], { dither: 'luma', maxColors: 8 });
    const d = await encode([ramp], { dither: 'luma', maxColors: 8 });
    expect(sameBytes(c.bytes, d.bytes)).toBe(true);
  });

  it('區塊平均的亮度比最近色接近原圖；色度的雜點比 RGB 的 Floyd–Steinberg 少', async () => {
    const decode = async (opts: Partial<GifEncoderOptions>) => {
      const file = await encode([ramp], { maxColors: 8, ...opts });
      const info = parseGif(file.bytes);
      return gifFrameRgba(info, info.frames[0]);
    };
    const none = await decode({ dither: 'none' });
    const fs = await decode({ dither: 'floyd-steinberg' });
    const luma = await decode({ dither: 'luma' });
    expect(blockLumaError(luma, ramp)).toBeLessThan(blockLumaError(none, ramp));
    expect(chromaError(luma, ramp)).toBeLessThan(chromaError(fs, ramp));
  });

  it('透明像素維持透明', async () => {
    const holed = ramp.slice();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) holed[(y * W + x) * 4 + 3] = 0;
    const file = await encode([holed], { dither: 'luma', maxColors: 16 });
    const info = parseGif(file.bytes);
    const rgba = gifFrameRgba(info, info.frames[0]);
    expect(rgba[3]).toBe(0);
    expect(rgba[(3 * W + 3) * 4 + 3]).toBe(0);
    expect(rgba[(10 * W + 10) * 4 + 3]).toBe(255);
  });
});

describe('stillWeight：代表畫面加進調色盤的統計（lock-screen 對等驗證 F52）', () => {
  const MOON = [215, 207, 186];
  /**
   * 上半部一直在動（藍灰色的雜訊、每格不同），下半部不動（深藍漸層＋一個小小的米色圓＝月亮）：
   * 統計是「第一格整格＋每格變化的範圍」，動的地方算了 24 次、月亮只算一次，調色盤分不到米色。
   */
  function scene(n = 24, w = 64, h = 96, band = 48, moonR = 3): Uint8ClampedArray[] {
    const out: Uint8ClampedArray[] = [];
    for (let f = 0; f < n; f++) {
      const px = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let c: number[];
          if (y < band) {
            let v = (x * 73856093) ^ (y * 19349663) ^ ((f + 1) * 83492791);
            v = (v ^ (v >>> 13)) * 1274126177;
            c = [
              110 + (((v >>> 0) % 997) / 997) * 90,
              120 + (((v >>> 8) % 991) / 991) * 90,
              180 + (((v >>> 16) % 983) / 983) * 75,
            ];
          } else {
            c = [
              10 + (y - band) * 0.5 + x * 0.3,
              20 + (y - band) * 0.8,
              70 + (y - band) * 1.1 + x * 0.4,
            ];
            const mx = w * 0.7;
            const my = band + (h - band) / 2;
            if (Math.hypot(x - mx, y - my) <= moonR)
              c = [MOON[0] - (x - mx), MOON[1] - (x - mx), MOON[2] - (y - my)];
          }
          px.set(
            [...c.map((v) => Math.max(0, Math.min(255, Math.round(v)))), 255],
            (y * w + x) * 4,
          );
        }
      out.push(px);
    }
    return out;
  }

  async function encodeScene(stillWeight: number | undefined, withStill = true) {
    const frames = scene();
    const enc = new GifEncoder({
      width: 64,
      height: 96,
      fps: 10,
      dither: 'luma',
      cropFrames: true,
      ...(stillWeight === undefined ? {} : { stillWeight }),
    });
    if (withStill) enc.setStill(frames[frames.length - 1].slice());
    for (const f of copyFrames(frames)) await enc.addFrame(f);
    return enc.finish();
  }

  const nearestMoon = (pal: Uint8Array) => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < pal.length / 3; i++)
      best = Math.min(
        best,
        Math.hypot(pal[i * 3] - MOON[0], pal[i * 3 + 1] - MOON[1], pal[i * 3 + 2] - MOON[2]),
      );
    return best;
  };

  it('沒有代表畫面時調色盤裡沒有月亮色；代表畫面算 24 格時有', async () => {
    const without = parseGif((await encodeScene(0)).bytes);
    expect(nearestMoon(without.globalPalette)).toBeGreaterThan(12);
    const withStill = parseGif((await encodeScene(24)).bytes);
    expect(nearestMoon(withStill.globalPalette)).toBeLessThan(4);
  });

  it('不給 stillWeight（或 0）時 setStill 不影響輸出', async () => {
    const plain = await encodeScene(undefined, false);
    expect(sameBytes((await encodeScene(undefined, true)).bytes, plain.bytes)).toBe(true);
    expect(sameBytes((await encodeScene(0, true)).bytes, plain.bytes)).toBe(true);
  });
});
