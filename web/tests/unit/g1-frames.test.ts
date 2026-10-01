/**
 * G1 共用層：影格表（每格各有長度）、GIF／APNG 的不等長延遲、APNG 與單張 PNG 的色數、週期雜訊。
 */
import { describe, expect, it } from 'vitest';
import { ApngEncoder } from '@/core/encode/apng';
import { GifEncoder } from '@/core/encode/gif';
import { encodePngColors } from '@/core/encode/still';
import {
  frameIndexAt,
  frameRenderTimes,
  frameStartTimes,
  frameTable,
  frameTableDuration,
  frameTableTicks,
  gifDelaysCs,
  loopNoise,
  loopNoise2,
  uniformFrames,
} from '@/core/timeline';
import { copyFrames, gradient, movingSquare } from '../helpers/frames';
import { parseGif } from '../helpers/gif';
import { parseApng, parseChunks, readIhdr } from '../helpers/png';

const W = 24;
const H = 16;

describe('影格表', () => {
  it('打字機：12 FPS 六格＋停留 2000 ms（附件 T01）', () => {
    const frames = uniformFrames(7, 12, { holdMs: 2000 });
    expect(frames).toHaveLength(7);
    expect(frames[0].ms).toBeCloseTo(83.333, 3);
    expect(frames[6].ms).toBe(2000);
    expect(frameTableDuration(frames)).toBeCloseTo(2.5, 6);
    expect(frameStartTimes(frames)[6]).toBeCloseTo(0.5, 6);
  });

  it('毫秒 ticks 以累計時間四捨五入：每格 83 或 84、總長不差', () => {
    const frames = uniformFrames(13, 12, { holdMs: 2000 });
    const ticks = frameTableTicks(frames, 1000);
    expect(ticks.slice(0, 12).every((t) => t === 83 || t === 84)).toBe(true);
    expect(ticks[12]).toBe(2000);
    expect(ticks.reduce((a, b) => a + b, 0)).toBe(3000);
  });

  it('太短的格至少 1 tick，借用的時間從後面的格扣回', () => {
    expect(frameTableTicks(frameTable([0.2, 0.2, 10]), 1000)).toEqual([1, 1, 8]);
    /* 停留 0 ms（附件 T13）也輸出一格 */
    expect(frameTableTicks(frameTable([200, 0]), 1000)).toEqual([200, 1]);
  });

  it('GIF 延遲：1/100 秒累計，每格至少 2', () => {
    expect(gifDelaysCs(uniformFrames(4, 12, { holdMs: 2000 }))).toEqual([8, 9, 8, 200]);
    /* 60 FPS：每格 1.67 → 累計後 2、2、1… 但至少 2，補上的部分之後扣回 */
    const d = gifDelaysCs(uniformFrames(6, 60, { holdMs: 1000 }));
    expect(d.slice(0, 5).every((x) => x >= 2)).toBe(true);
    expect(d.reduce((a, b) => a + b, 0)).toBe(Math.round((5 * 1000) / 60 / 10 + 100));
  });

  it('預覽：t 秒時顯示哪一格（交界取後面那格）；FrameSpec.t 覆寫 render 時間', () => {
    const frames = frameTable([100, 100, 500]);
    expect(frameIndexAt(frames, 0)).toBe(0);
    expect(frameIndexAt(frames, 0.0999)).toBe(0);
    expect(frameIndexAt(frames, 0.1)).toBe(1);
    expect(frameIndexAt(frames, 0.3)).toBe(2);
    expect(frameIndexAt(frames, 99)).toBe(2);
    expect(frameIndexAt([], 0)).toBe(-1);
    expect(frameRenderTimes([{ ms: 100 }, { ms: 100, t: 5 }])).toEqual([0, 5]);
  });
});

describe('GIF：不等長影格', () => {
  it('variableDelay：以 1/100 秒為單位的 ticks，延遲照表（停留格 2000 ms → 200）', async () => {
    const frames = movingSquare(W, H, 4);
    const ticks = frameTableTicks(uniformFrames(4, 12, { holdMs: 2000 }), 100);
    const enc = new GifEncoder({ width: W, height: H, fps: 100, variableDelay: true });
    for (let i = 0; i < 4; i++) await enc.addFrame(frames[i].slice(), ticks[i]);
    const gif = parseGif((await enc.finish()).bytes);
    expect(gif.frames.map((f) => f.delayCs)).toEqual([8, 9, 8, 200]);
  });

  it('沒有 variableDelay 時 fps 仍限制在 50', () => {
    expect(() => new GifEncoder({ width: W, height: H, fps: 100 })).toThrow(RangeError);
  });

  it('fps ≤ 50 時延遲與以前相同（每格 ≥ 2/100 秒，累計四捨五入）', async () => {
    const enc = new GifEncoder({ width: W, height: H, fps: 30 });
    for (const f of copyFrames(movingSquare(W, H, 6))) await enc.addFrame(f);
    const gif = parseGif((await enc.finish()).bytes);
    const want = [0, 1, 2, 3, 4, 5].map(
      (i) => Math.round(((i + 1) * 100) / 30) - Math.round((i * 100) / 30),
    );
    expect(gif.frames.map((f) => f.delayCs)).toEqual(want);
  });

  it('透明門檻：alpha 小於門檻的像素變透明', async () => {
    const f = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      f[i * 4] = 200;
      f[i * 4 + 3] = i % 2 ? 100 : 200;
    }
    const encode = async (alphaThreshold: number) => {
      const enc = new GifEncoder({ width: W, height: H, fps: 10, alphaThreshold });
      await enc.addFrame(f.slice());
      const gif = parseGif((await enc.finish()).bytes);
      const fr = gif.frames[0];
      return [...fr.indices].filter((x) => x === fr.transparentIndex).length;
    };
    expect(await encode(128)).toBe((W * H) / 2);
    expect(await encode(50)).toBe(0);
  });
});

describe('APNG：毫秒計時與色數', () => {
  it('fps 1000＋毫秒 ticks：每格延遲是 ticks／1000 秒', async () => {
    const frames = movingSquare(W, H, 3);
    const ticks = frameTableTicks(frameTable([83.333, 83.333, 1234]), 1000);
    const enc = new ApngEncoder({ width: W, height: H, fps: 1000 });
    for (let i = 0; i < 3; i++) await enc.addFrame(frames[i].slice(), ticks[i]);
    const file = await enc.finish();
    const info = parseApng(file.bytes);
    expect(info.frames.map((f) => f.delayNum / f.delayDen)).toEqual([0.083, 0.084, 1.234]);
    expect(file.duration).toBeCloseTo(1.401, 6);
  });

  it('maxColors：減色到指定色數以內', async () => {
    const enc = new ApngEncoder({ width: 32, height: 32, fps: 10, quantize: true, maxColors: 16 });
    await enc.addFrame(gradient(32, 32, 0));
    await enc.addFrame(gradient(32, 32, 1));
    const file = await enc.finish();
    expect(file.colors?.count).toBeLessThanOrEqual(16);
    const info = parseApng(file.bytes);
    expect(info.ihdr.colorType).toBe(3);
    expect((info.plte?.length ?? 0) / 3).toBeLessThanOrEqual(16);
  });
});

describe('單張 PNG 的色數', () => {
  it('0＝全彩 RGBA；16＝調色盤 PNG（最多 16 色）；色數在上限內時無損', async () => {
    const img = gradient(32, 32, 0);
    const full = await encodePngColors(img, 32, 32, 0);
    expect(readIhdr(parseChunks(full.bytes)).colorType).toBe(6);
    expect(full.colors).toBeUndefined();
    const q = await encodePngColors(img, 32, 32, 16);
    const chunks = parseChunks(q.bytes);
    expect(readIhdr(chunks).colorType).toBe(3);
    const plte = chunks.find((c) => c.type === 'PLTE');
    expect((plte?.data.length ?? 0) / 3).toBeLessThanOrEqual(16);
    expect(q.colors?.lossless).toBe(false);
    const few = await encodePngColors(movingSquare(W, H, 1)[0], W, H, 256);
    expect(few.colors?.lossless).toBe(true);
  });
});

describe('週期平滑雜訊', () => {
  it('週期 1（無縫循環）、範圍在 −1～1、同種子同結果、連續', () => {
    for (const t of [0, 0.13, 0.5, 0.77]) {
      expect(loopNoise(12345, t)).toBeCloseTo(loopNoise(12345, t + 1), 10);
      expect(loopNoise(12345, t)).toBe(loopNoise(12345, t));
    }
    let max = 0;
    let prev = loopNoise('種子', 0);
    for (let i = 1; i <= 400; i++) {
      const v = loopNoise('種子', i / 400);
      max = Math.max(max, Math.abs(v));
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
    expect(max).toBeLessThanOrEqual(1);
    expect(max).toBeGreaterThan(0.3);
    const p = loopNoise2(7, 0.25);
    expect(p.x).not.toBe(p.y);
  });
});
