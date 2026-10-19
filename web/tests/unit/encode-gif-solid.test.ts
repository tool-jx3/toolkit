/**
 * GIF 編碼器的 solidColors（id-ticket 對等驗證後新增）：大片單色（例如墊紙）的顏色一定放進調色盤，
 * 抖色時那些顏色的像素直接用它（不抖色、也不把周圍的誤差帶進來）——墊紙上不會冒出別的顏色的點。
 * 沒給時輸出和以前逐位元組相同。
 */
import { describe, expect, it } from 'vitest';
import { GifEncoder, type GifEncoderOptions } from '@/core/encode/gif';
import { copyFrames, sameBytes } from '../helpers/frames';
import { gifFrameRgba, parseGif } from '../helpers/gif';

const W = 96;
const H = 72;
/** 墊紙色：淡的暖灰（不是 5 位元桶的中心） */
const MAT: [number, number, number] = [233, 221, 214];

async function encode(frames: Uint8ClampedArray[], opts: Partial<GifEncoderOptions> = {}) {
  /* 色數壓到 16：墊紙色那一群會吸進陰影的顏色，k-means 之後不是剛好的墊紙色 */
  const enc = new GifEncoder({ width: W, height: H, fps: 10, maxColors: 16, ...opts });
  for (const f of copyFrames(frames)) await enc.addFrame(f);
  return enc.finish();
}

/**
 * 墊紙底＋中間一張「票」（彩色漸層，顏色多到要減色）＋票四周往外變淡的陰影（和墊紙同一個桶裡的顏色）。
 * 每格票往下移 1 px（陰影跟著動）。
 */
function ticketOnMat(n: number): Uint8ClampedArray[] {
  const out: Uint8ClampedArray[] = [];
  for (let i = 0; i < n; i++) {
    const f = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const tx0 = 24;
        const tx1 = 72;
        const ty0 = 16 + i;
        const ty1 = 52 + i;
        if (x >= tx0 && x < tx1 && y >= ty0 && y < ty1) {
          const u = (x - tx0) / (tx1 - tx0);
          const v = (y - ty0) / (ty1 - ty0);
          f.set(
            [
              Math.round(250 - 120 * u),
              Math.round(120 + 110 * v),
              Math.round(140 + 100 * u * v),
              255,
            ],
            k,
          );
          continue;
        }
        /* 陰影：離票 10 px 以內，越近越深（最多深 30） */
        const dx = Math.max(tx0 - x, 0, x - (tx1 - 1));
        const dy = Math.max(ty0 - y, 0, y - (ty1 - 1));
        const d = Math.hypot(dx, dy);
        const s = d < 10 ? Math.round((1 - d / 10) ** 2 * 30) : 0;
        f.set([MAT[0] - s, MAT[1] - s, MAT[2] - s, 255], k);
      }
    out.push(f);
  }
  return out;
}

/** 解碼後每一格的完整畫面 */
function composite(bytes: Uint8Array): Uint8Array[] {
  const info = parseGif(bytes);
  const canvas = new Uint8Array(info.width * info.height * 4);
  return info.frames.map((f) => {
    const px = gifFrameRgba(info, f);
    for (let y = 0; y < f.height; y++)
      for (let x = 0; x < f.width; x++) {
        const s = (y * f.width + x) * 4;
        canvas.set(px.subarray(s, s + 4), ((f.y + y) * info.width + f.x + x) * 4);
      }
    return canvas.slice();
  });
}

/** 原圖是墊紙色的像素裡，解碼出來不是墊紙色的有幾個 */
function matMisses(src: Uint8ClampedArray[], out: Uint8Array[]): number {
  let miss = 0;
  src.forEach((f, i) => {
    for (let k = 0; k < f.length; k += 4) {
      if (f[k] !== MAT[0] || f[k + 1] !== MAT[1] || f[k + 2] !== MAT[2]) continue;
      const o = out[i];
      if (o[k] !== MAT[0] || o[k + 1] !== MAT[1] || o[k + 2] !== MAT[2]) miss++;
    }
  });
  return miss;
}

describe('GIF：大片單色不抖色（solidColors）', () => {
  const frames = ticketOnMat(4);

  it('沒給時：墊紙色不在調色盤裡，抖色在墊紙上撒點（問題的重現）', async () => {
    const file = await encode(frames, { dither: 'luma' });
    expect(file.colors?.lossless).toBe(false);
    expect(matMisses(frames, composite(file.bytes))).toBeGreaterThan(0);
  });

  for (const dither of ['luma', 'floyd-steinberg', 'none'] as const) {
    it(`給了以後（${dither}）：墊紙色的像素解碼出來全部是墊紙色`, async () => {
      const file = await encode(frames, { dither, solidColors: [MAT] });
      expect(file.colors?.lossless).toBe(false);
      const out = composite(file.bytes);
      expect(out).toHaveLength(4);
      expect(matMisses(frames, out)).toBe(0);
      /* 墊紙色在全域調色盤裡 */
      const pal = parseGif(file.bytes).globalPalette;
      let found = false;
      for (let i = 0; i < pal.length; i += 3)
        found ||= pal[i] === MAT[0] && pal[i + 1] === MAT[1] && pal[i + 2] === MAT[2];
      expect(found).toBe(true);
    });
  }

  it('空的 solidColors 和沒給逐位元組相同；調色盤無損時 solidColors 不影響輸出', async () => {
    const a = await encode(frames, { dither: 'luma' });
    const b = await encode(frames, { dither: 'luma', solidColors: [] });
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
    /* 只有幾個顏色：無損 */
    const flat = frames.map((f) => {
      const g = new Uint8ClampedArray(f.length);
      for (let k = 0; k < g.length; k += 4)
        g.set(k < g.length / 2 ? [...MAT, 255] : [20, 30, 40, 255], k);
      return g;
    });
    const c = await encode(flat, { dither: 'luma' });
    const d = await encode(flat, { dither: 'luma', solidColors: [MAT, [1, 2, 3]] });
    expect(c.colors?.lossless).toBe(true);
    expect(sameBytes(c.bytes, d.bytes)).toBe(true);
  });
});
