import { describe, expect, it } from 'vitest';
import { concat } from '@/core/encode/png';
import {
  assembleAnimatedWebp,
  frameBitstream,
  parseWebp,
  riffChunk,
  WebpEncoder,
} from '@/core/encode/webp';
import { copyFrames, movingSquare, sameBytes } from '../helpers/frames';

/** 假的單張 WebP：RIFF＋VP8L（內容是寬高與像素總和，只用來檢查封裝） */
function fakeSingle(w: number, h: number, sum: number, withAlph = false): Uint8Array {
  const payload = new Uint8Array(8);
  const dv = new DataView(payload.buffer);
  dv.setUint16(0, w, true);
  dv.setUint16(2, h, true);
  dv.setUint32(4, sum >>> 0, true);
  const parts = withAlph
    ? [
        riffChunk('VP8X', new Uint8Array(10)),
        riffChunk('ALPH', new Uint8Array([1, 2, 3])),
        riffChunk('VP8 ', payload),
      ]
    : [riffChunk('VP8L', payload)];
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set([82, 73, 70, 70]);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set([87, 69, 66, 80], 8);
  out.set(body, 12);
  return out;
}

const u24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

describe('動畫 WebP 封裝', () => {
  it('parseWebp 讀得出 chunk；frameBitstream 只留 ALPH 與 VP8', () => {
    const single = fakeSingle(3, 2, 99, true);
    expect(parseWebp(single).map((c) => c.fourcc)).toEqual(['VP8X', 'ALPH', 'VP8 ']);
    const bs = frameBitstream(single);
    expect(String.fromCharCode(...bs.subarray(0, 4))).toBe('ALPH');
    /* ALPH 長度 3 → 補齊到偶數 */
    expect(String.fromCharCode(...bs.subarray(12, 16))).toBe('VP8 ');
  });

  it('VP8X／ANIM／ANMF 欄位正確', () => {
    const bs = frameBitstream(fakeSingle(4, 4, 1));
    const out = assembleAnimatedWebp({
      width: 300,
      height: 200,
      loops: 3,
      hasAlpha: true,
      frames: [
        { x: 0, y: 0, w: 300, h: 200, durationMs: 100, bitstream: bs },
        { x: 10, y: 4, w: 5, h: 7, durationMs: 250, bitstream: bs },
      ],
    });
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
    const chunks = parseWebp(out);
    expect(chunks.map((c) => c.fourcc)).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF']);
    const vp8x = chunks[0].data;
    expect(vp8x[0] & 0x02).toBe(0x02);
    expect(vp8x[0] & 0x10).toBe(0x10);
    expect(u24(vp8x, 4) + 1).toBe(300);
    expect(u24(vp8x, 7) + 1).toBe(200);
    expect(new DataView(chunks[1].data.buffer, chunks[1].data.byteOffset).getUint16(4, true)).toBe(
      3,
    );
    const f = chunks[3].data;
    expect(u24(f, 0) * 2).toBe(10);
    expect(u24(f, 3) * 2).toBe(4);
    expect(u24(f, 6) + 1).toBe(5);
    expect(u24(f, 9) + 1).toBe(7);
    expect(u24(f, 12)).toBe(250);
    expect(f[15]).toBe(0x02);
    expect(() =>
      assembleAnimatedWebp({
        width: 4,
        height: 4,
        loops: 0,
        hasAlpha: false,
        frames: [{ x: 1, y: 0, w: 2, h: 2, durationMs: 10, bitstream: bs }],
      }),
    ).toThrow(/偶數/);
  });

  it('逐格編碼器：差分範圍對齊偶數、合併相同影格、毫秒累計', async () => {
    const W = 24;
    const H = 16;
    const calls: { w: number; h: number }[] = [];
    const enc = new WebpEncoder({
      width: W,
      height: H,
      fps: 30,
      encodeImage: async (rgba, w, h) => {
        calls.push({ w, h });
        let sum = 0;
        for (const v of rgba) sum += v;
        return fakeSingle(w, h, sum);
      },
    });
    for (const f of copyFrames(movingSquare(W, H, 8, [3, 4]))) await enc.addFrame(f);
    const file = await enc.finish();
    expect(file.storedFrames).toBe(6);
    expect(calls[0]).toEqual({ w: W, h: H });
    const anmf = parseWebp(file.bytes).filter((c) => c.fourcc === 'ANMF');
    expect(anmf.length).toBe(6);
    const total = anmf.reduce((s, c) => s + u24(c.data, 12), 0);
    expect(total).toBe(Math.round((8 * 1000) / 30));
    for (const c of anmf) {
      const x = u24(c.data, 0) * 2;
      const w = u24(c.data, 6) + 1;
      expect(x + w).toBeLessThanOrEqual(W);
    }
    expect(file.mime).toBe('image/webp');
  });

  it('同樣設定輸出兩次，位元組完全相同', async () => {
    const run = async () => {
      const enc = new WebpEncoder({
        width: 24,
        height: 16,
        fps: 10,
        encodeImage: async (_r, w, h) => fakeSingle(w, h, w * h),
      });
      for (const f of copyFrames(movingSquare(24, 16, 5))) await enc.addFrame(f);
      return (await enc.finish()).bytes;
    };
    expect(sameBytes(await run(), await run())).toBe(true);
  });
});
