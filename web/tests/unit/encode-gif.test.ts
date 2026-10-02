import { describe, expect, it } from 'vitest';
import { GifEncoder, gifRepeat } from '@/core/encode/gif';
import { copyFrames, gradient, movingSquare, sameBytes } from '../helpers/frames';
import { gifFrameRgba, parseGif } from '../helpers/gif';

const W = 24;
const H = 16;
const frames = movingSquare(W, H, 8, [3, 4]);

async function encode(fps = 10, plays = 0) {
  const enc = new GifEncoder({ width: W, height: H, fps, plays });
  for (const f of copyFrames(frames)) await enc.addFrame(f);
  return enc.finish();
}

/** 1 位元透明的預期結果 */
function oneBit(src: Uint8ClampedArray) {
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] >= 128) {
      out[i] = src[i];
      out[i + 1] = src[i + 1];
      out[i + 2] = src[i + 2];
      out[i + 3] = 255;
    }
  }
  return out;
}

describe('GIF 編碼', () => {
  it('結構：尺寸、影格數（合併相同影格）、無限循環', async () => {
    const file = await encode();
    const info = parseGif(file.bytes);
    expect(info.width).toBe(W);
    expect(info.height).toBe(H);
    expect(info.frames.length).toBe(6);
    expect(file.storedFrames).toBe(6);
    expect(info.loopCount).toBe(0);
    expect(file.mime).toBe('image/gif');
  });

  it('延遲以 1/100 秒累計，總長正確', async () => {
    const info = parseGif((await encode(30)).bytes);
    const total = info.frames.reduce((s, f) => s + f.delayCs, 0);
    expect(total).toBe(Math.round((8 * 100) / 30));
    expect(info.frames.every((f) => f.delayCs >= 2)).toBe(true);
  });

  it('像素：解碼後與 1 位元透明化的原影格相同', async () => {
    const info = parseGif((await encode()).bytes);
    const distinct = [0, 1, 2, 5, 6, 7];
    distinct.forEach((src, i) => {
      expect(info.frames[i].transparentIndex).toBe(0);
      expect(info.frames[i].disposal).toBe(2);
      expect(sameBytes(gifFrameRgba(info, info.frames[i]), oneBit(frames[src]))).toBe(true);
    });
  });

  it('播放次數換算成 NETSCAPE 重播次數', async () => {
    expect(gifRepeat(0)).toBe(0);
    expect(gifRepeat(1)).toBe(-1);
    expect(gifRepeat(3)).toBe(2);
    expect(parseGif((await encode(10, 1)).bytes).loopCount).toBeNull();
    expect(parseGif((await encode(10, 3)).bytes).loopCount).toBe(2);
  });

  it('同樣設定輸出兩次，位元組完全相同', async () => {
    expect(sameBytes((await encode()).bytes, (await encode()).bytes)).toBe(true);
  });

  it('預設整段共用全域調色盤：每一格都沒有區域調色盤', async () => {
    const info = parseGif((await encode()).bytes);
    expect(info.frames.every((f) => f.localPalette === null)).toBe(true);
  });

  it('fps 超過 50 時拒絕', () => {
    expect(() => new GifEncoder({ width: 4, height: 4, fps: 60 })).toThrow(/最多 50/);
  });
});

/** 每格 200 色、各格的顏色都不一樣（整段 800 色）；第 0、1 格第一列透明，第 2、3 格沒有透明 */
function manyColorFrames(): Uint8ClampedArray[] {
  return Array.from({ length: 4 }, (_, k) => {
    const f = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const transparent = k < 2 && i < W;
      f[i * 4] = 30 + k * 60;
      f[i * 4 + 1] = i % 200;
      f[i * 4 + 2] = (i % 200) ^ 0x55;
      f[i * 4 + 3] = transparent ? 0 : 255;
    }
    return f;
  });
}

describe('GIF：每格各自減色（localPalettes）', () => {
  async function encodeLocal(frames: Uint8ClampedArray[], method?: 'pca') {
    const enc = new GifEncoder({
      width: W,
      height: H,
      fps: 10,
      localPalettes: true,
      ...(method ? { paletteMethod: method } : {}),
    });
    for (const f of copyFrames(frames)) await enc.addFrame(f);
    return enc.finish();
  }

  it('第 2 格起帶自己的區域調色盤；每格 256 色以內時逐格無損（整段超過 256 色也一樣）', async () => {
    const frames = manyColorFrames();
    const file = await encodeLocal(frames);
    const info = parseGif(file.bytes);
    expect(info.frames).toHaveLength(4);
    expect(info.frames[0].localPalette).toBeNull();
    for (const f of info.frames.slice(1)) expect(f.localPalette).not.toBeNull();
    info.frames.forEach((f, i) => {
      expect(sameBytes(gifFrameRgba(info, f), oneBit(frames[i]))).toBe(true);
    });
    expect(file.colors?.lossless).toBe(true);
    /* 全域調色盤只有 256 色：同樣的影格會失真 */
    const enc = new GifEncoder({ width: W, height: H, fps: 10 });
    for (const f of copyFrames(frames)) await enc.addFrame(f);
    const global = parseGif((await enc.finish()).bytes);
    expect(sameBytes(gifFrameRgba(global, global.frames[3]), oneBit(frames[3]))).toBe(false);
  });

  it('透明：有透明像素的格 0 號是透明色，沒有透明像素的格不設透明色', async () => {
    const info = parseGif((await encodeLocal(manyColorFrames())).bytes);
    expect(info.frames.map((f) => f.transparentIndex)).toEqual([0, 0, null, null]);
    expect(info.frames.every((f) => f.disposal === 2)).toBe(true);
  });

  it('超過 256 色的格也各自減色（主成分切割），相同影格照樣合併', async () => {
    const big = [gradient(W, H, 0), gradient(W, H, 0), gradient(W, H, 3)];
    const file = await encodeLocal(big, 'pca');
    const info = parseGif(file.bytes);
    expect(info.frames).toHaveLength(2);
    expect(file.colors?.lossless).toBe(false);
    expect(info.frames[1].localPalette).not.toBeNull();
    /* 每格對應回去的誤差都小（不透明處 |ΔRGB| 平均 < 6） */
    [0, 2].forEach((src, i) => {
      const out = gifFrameRgba(info, info.frames[i]);
      const ref = oneBit(big[src]);
      let s = 0;
      let n = 0;
      for (let p = 0; p < ref.length; p += 4) {
        if (!ref[p + 3]) continue;
        expect(out[p + 3]).toBe(255);
        s +=
          Math.abs(out[p] - ref[p]) +
          Math.abs(out[p + 1] - ref[p + 1]) +
          Math.abs(out[p + 2] - ref[p + 2]);
        n++;
      }
      expect(s / n).toBeLessThan(6);
    });
  });

  it('同樣設定輸出兩次，位元組完全相同', async () => {
    const a = await encodeLocal(manyColorFrames(), 'pca');
    const b = await encodeLocal(manyColorFrames(), 'pca');
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
  });
});
