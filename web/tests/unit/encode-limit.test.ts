/**
 * core/encode 的效能改寫與「超過上限就放棄」（maxBytes）：
 * - filterRows 的查表版與原本逐位元組判斷的寫法輸出完全相同（所有工具的全彩 PNG 位元組不變）；
 * - 減色的 k-d 樹搜尋與原本的逐一比對結果完全相同（調色盤與每個顏色的索引）；
 * - maxBytes：沒超過時輸出與不設上限相同，超過時丟出 EncodeLimitError（含已壓好的位元組與進度）。
 */
import { describe, expect, it } from 'vitest';
import {
  ApngEncoder,
  buildPalette,
  ColorStats,
  EncodeLimitError,
  encodePng,
  encodePngColors,
  toU32,
} from '@/core/encode';
import { filterRows, packImage } from '@/core/encode/png';
import { gradient, movingSquare, sameBytes } from '../helpers/frames';

/** 決定性的亂數 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 原本的濾波寫法（逐位元組判斷；PNG 規範的五種濾波，挑差值絕對值總和最小的） */
function referenceFilter(src: Uint8Array, w: number, h: number, bpp: number): Uint8Array {
  const stride = w * bpp;
  const out = new Uint8Array(h * (stride + 1));
  let prevEmpty = true;
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    const prev = y > 0 ? row - stride : -1;
    const o = y * (stride + 1);
    let empty = true;
    for (let i = 0; i < stride; i++) if (src[row + i]) empty = false;
    if (empty && prevEmpty) continue;
    prevEmpty = empty;
    const sums = [0, 0, 0, 0, 0];
    const res = (f: number, i: number) => {
      const x = src[row + i];
      const a = i >= bpp ? src[row + i - bpp] : 0;
      const b = prev >= 0 ? src[prev + i] : 0;
      const c = prev >= 0 && i >= bpp ? src[prev + i - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      return ([x, x - a, x - b, x - ((a + b) >> 1), x - pr][f] as number) & 255;
    };
    for (let i = 0; i < stride; i++)
      for (let f = 0; f < 5; f++) {
        const v = res(f, i);
        sums[f] += v < 128 ? v : 256 - v;
      }
    let best = 0;
    for (let f = 1; f < 5; f++) if (sums[f] < sums[best]) best = f;
    out[o] = best;
    for (let i = 0; i < stride; i++) out[o + 1 + i] = res(best, i);
  }
  return out;
}

function noise(w: number, h: number, seed: number, alpha: 'opaque' | 'random' | 'holes') {
  const r = rng(seed);
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = r() * 256;
    px[i * 4 + 1] = r() * 256;
    px[i * 4 + 2] = r() * 256;
    px[i * 4 + 3] = alpha === 'opaque' ? 255 : alpha === 'random' ? r() * 256 : r() < 0.3 ? 0 : 255;
  }
  /* 幾列整列透明（測「整列 0」的捷徑） */
  if (alpha === 'holes') px.fill(0, 0, w * 4 * 3);
  return px;
}

describe('filterRows：查表版與原本的寫法完全相同', () => {
  it('雜訊、半透明、整列透明、平滑漸層；bpp 4 與 1', () => {
    const cases: [Uint8Array, number, number, number][] = [
      [noise(37, 23, 1, 'opaque'), 37, 23, 4],
      [noise(16, 40, 2, 'random'), 16, 40, 4],
      [noise(25, 30, 3, 'holes'), 25, 30, 4],
      [new Uint8Array(gradient(33, 21, 2).buffer), 33, 21, 4],
      [new Uint8Array(4 * 9 * 7), 9, 7, 4],
      [noise(1, 50, 4, 'opaque'), 1, 50, 4],
      [noise(40, 10, 5, 'opaque').subarray(0, 40 * 10), 40, 10, 1],
    ];
    for (const [px, w, h, bpp] of cases)
      expect(sameBytes(filterRows(px, w, h, bpp, true), referenceFilter(px, w, h, bpp))).toBe(true);
  });
});

describe('減色：k-d 樹搜尋與逐一比對相同', () => {
  /** 逐一比對的最近色（與 makeSearcher 原本的規則相同：距離相同時取前面的） */
  it('不透明的雜訊：每個像素的索引都是調色盤裡真正最近的顏色（同距離取前面的）', () => {
    const px = noise(120, 90, 7, 'opaque');
    const u32 = toU32(px);
    const stats = new ColorStats(200);
    stats.add(u32, 0, u32.length);
    const pal = buildPalette(stats, 200);
    const n = pal.count;
    for (let k = 0; k < u32.length; k += 7) {
      const v = u32[k];
      /* 對應表用 6 位元一格的格中心找最近色 */
      const q = [0, 8, 16].map((sh) => (((v >>> sh) & 255) >> 2) * 4 + 2);
      let best = -1;
      let bd = Number.POSITIVE_INFINITY;
      for (let i = 1; i < n; i++) {
        let d = 0;
        for (let c = 0; c < 3; c++) d += (pal.colors[i * 4 + c] - q[c]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      expect(pal.indexOf(v)).toBe(best);
    }
  });
});

describe('maxBytes：超過上限就放棄', () => {
  it('沒超過時與不設上限的輸出完全相同（全彩、調色盤、分段壓縮）', async () => {
    const px = noise(300, 260, 9, 'random');
    const full = await encodePng(px, 300, 260);
    expect(sameBytes(await encodePng(px, 300, 260, null, 'auto', full.length + 10), full)).toBe(
      true,
    );
    const pal = await encodePngColors(px, 300, 260, 64);
    const palLimited = await encodePngColors(px, 300, 260, 64, 'auto', 'median-cut', 1e9);
    expect(sameBytes(palLimited.bytes, pal.bytes)).toBe(true);
    const z = await packImage(px, 300, 260, false);
    expect(sameBytes(await packImage(px, 300, 260, false, 'auto', 1e9), z)).toBe(true);
  });

  it('超過時丟出 EncodeLimitError：已壓好的位元組超過上限、進度在 0～1', async () => {
    const px = noise(300, 260, 10, 'opaque');
    const full = await encodePng(px, 300, 260);
    const err = await encodePng(px, 300, 260, null, 'auto', full.length / 3).catch((e) => e);
    expect(err).toBeInstanceOf(EncodeLimitError);
    expect(err.bytes).toBeGreaterThan(full.length / 3);
    expect(err.progress).toBeGreaterThan(0);
    expect(err.progress).toBeLessThan(1);
  });

  it('ApngEncoder：全彩在 addFrame、減色在 finish 超過；之後一律丟同一個錯誤', async () => {
    const W = 120;
    const H = 90;
    const frames = Array.from({ length: 4 }, (_, i) => noise(W, H, 20 + i, 'opaque'));
    const make = (quantize: boolean, maxBytes?: number) =>
      new ApngEncoder({ width: W, height: H, fps: 10, quantize, maxBytes });
    const ref = make(false);
    for (const f of frames) await ref.addFrame(f);
    const refBytes = (await ref.finish()).bytes;

    const ok = make(false, refBytes.length);
    for (const f of frames) await ok.addFrame(f);
    expect(sameBytes((await ok.finish()).bytes, refBytes)).toBe(true);

    const lossless = make(false, refBytes.length / 3);
    let thrown: unknown = null;
    for (const f of frames) {
      try {
        await lossless.addFrame(f);
      } catch (e) {
        thrown = e;
        break;
      }
    }
    expect(thrown).toBeInstanceOf(EncodeLimitError);
    await expect(lossless.finish()).rejects.toBe(thrown);

    const qRef = make(true);
    for (const f of frames) await qRef.addFrame(f);
    const qBytes = (await qRef.finish()).bytes;
    const q = make(true, qBytes.length / 2);
    for (const f of frames) await q.addFrame(f);
    const qErr = await q.finish().catch((e) => e);
    expect(qErr).toBeInstanceOf(EncodeLimitError);
    expect(qErr.progress).toBeGreaterThan(0);
    expect(qErr.progress).toBeLessThanOrEqual(1);

    /* 沒有設上限的其他用法不受影響 */
    const plain = new ApngEncoder({ width: 32, height: 24, fps: 10 });
    for (const f of movingSquare(32, 24, 3)) await plain.addFrame(f);
    expect((await plain.finish()).storedFrames).toBe(3);
  });
});
