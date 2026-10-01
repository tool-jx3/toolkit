import { describe, expect, it } from 'vitest';
import { GifEncoder, gifRepeat } from '@/core/encode/gif';
import { copyFrames, movingSquare, sameBytes } from '../helpers/frames';
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

  it('fps 超過 50 時拒絕', () => {
    expect(() => new GifEncoder({ width: 4, height: 4, fps: 60 })).toThrow(/最多 50/);
  });
});
