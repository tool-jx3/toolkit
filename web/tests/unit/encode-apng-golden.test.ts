/**
 * ApngEncoder 的輸出指紋：不給新的選填選項時，輸出要和加選項之前逐位元組相同。
 * 指紋是改版前的編碼器（commit b22f84c）在同樣輸入下的 SHA-256；壓縮固定用 fflate（不受 Node 內建 zlib 版本影響）。
 */
import { describe, expect, it } from 'vitest';
import { ApngEncoder, type ApngEncoderOptions } from '@/core/encode/apng';
import { copyFrames, gradient, movingSquare, videoLike } from '../helpers/frames';

async function sha(b: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', b));
  return Array.from(d.subarray(0, 12), (v) => v.toString(16).padStart(2, '0')).join('');
}

const fixedPalette = () => {
  const p = new Uint8Array(3 * 4);
  p.set([0, 0, 0, 0], 0);
  p.set([200, 80, 40, 255], 4);
  p.set([10, 20, 30, 255], 8);
  return p;
};

function paletteFrames(): Uint8ClampedArray[] {
  return movingSquare(24, 16, 6, [2]).map((f) => {
    const g = f.slice();
    for (let k = 0; k < g.length; k += 4) {
      if (g[k + 3] === 0) g.set([0, 0, 0, 0], k);
      else if (k === 0) g.set([10, 20, 30, 255], k);
      else g.set([200, 80, 40, 255], k);
    }
    return g;
  });
}

interface Case {
  opts: Partial<ApngEncoderOptions>;
  frames: () => Uint8ClampedArray[];
  ticks?: number[];
  still?: () => Uint8ClampedArray;
  W?: number;
  H?: number;
}

const CASES: Record<string, Case> = {
  rgba: { opts: {}, frames: () => movingSquare(24, 16, 8, [3, 4]) },
  rgbaVideo: { opts: {}, frames: () => videoLike(32, 20, 6), W: 32, H: 20 },
  rgbaNoMerge: { opts: { mergeIdentical: false }, frames: () => movingSquare(24, 16, 8, [3, 4]) },
  rgbaStill: {
    opts: {},
    frames: () => movingSquare(24, 16, 8, [3, 4]),
    still: () => movingSquare(24, 16, 8)[7],
  },
  rgbaTicks: {
    opts: { minTicks: 0, mergeIdentical: false },
    frames: () => movingSquare(24, 16, 5),
    ticks: [3, 0, 2, 1, 4],
  },
  quantize: { opts: { quantize: true }, frames: () => movingSquare(24, 16, 8, [3, 4]) },
  quantizeLossy: {
    opts: { quantize: true, maxColors: 16, paletteMethod: 'pca' },
    frames: () => [gradient(24, 16, 0), gradient(24, 16, 1), gradient(24, 16, 1)],
  },
  fixed: { opts: { palette: fixedPalette() }, frames: paletteFrames },
};

/** 改版前（b22f84c）的輸出指紋 */
const GOLDEN: Record<string, string> = {
  rgba: '67381169710bb2879134eccc',
  rgbaVideo: 'f6e6e9985f0263f0e171c612',
  rgbaNoMerge: '41944c3332fb5c2cbbd4c905',
  rgbaStill: '48a86227bd853eea1e4805cd',
  rgbaTicks: 'caa72d87869d06cd225dee50',
  quantize: '5d789e3027c21c37721dbf2c',
  quantizeLossy: 'f80c3cc16f8e4e89e11bdeae',
  fixed: '175ed3a301a46ef058ed02cc',
};

async function run(c: Case, extra: Partial<ApngEncoderOptions> = {}) {
  const enc = new ApngEncoder({
    width: c.W ?? 24,
    height: c.H ?? 16,
    fps: 10,
    deflate: 'fflate',
    ...c.opts,
    ...extra,
  });
  if (c.still) enc.setStill(c.still());
  const fr = copyFrames(c.frames());
  for (let i = 0; i < fr.length; i++) await enc.addFrame(fr[i], c.ticks?.[i] ?? 1);
  return enc.finish();
}

describe('APNG 輸出指紋（不給新選項時與改版前相同）', () => {
  for (const [name, c] of Object.entries(CASES)) {
    it(name, async () => {
      const file = await run(c);
      expect(await sha(file.bytes)).toBe(GOLDEN[name]);
      /* 明確給 false 也一樣 */
      expect(await sha((await run(c, { transparentUnchanged: false })).bytes)).toBe(GOLDEN[name]);
    });
  }

  it('transparentUnchanged 只在全彩時有作用：減色、固定調色盤時輸出不變', async () => {
    for (const name of ['quantize', 'quantizeLossy', 'fixed']) {
      const file = await run(CASES[name], { transparentUnchanged: true });
      expect(await sha(file.bytes), name).toBe(GOLDEN[name]);
    }
    /* 全彩時確實改變了輸出 */
    expect(await sha((await run(CASES.rgbaVideo, { transparentUnchanged: true })).bytes)).not.toBe(
      GOLDEN.rgbaVideo,
    );
  });
});
