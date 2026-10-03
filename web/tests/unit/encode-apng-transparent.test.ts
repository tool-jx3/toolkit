/**
 * ApngEncoder 的 transparentUnchanged（video-anim 對等驗證後加的，舊版 UPNG.js 的做法）：
 * 範圍裡沒變的像素存成透明、以 blend OVER 疊上；和前兩格比較小時把上一格標成 dispose PREVIOUS；
 * 有變的像素不是完全不透明時改回整塊覆寫。解碼後每一格都要與輸入逐像素相同（測試的合成器與 core/decode 兩種都比）。
 */
import { describe, expect, it } from 'vitest';
import { decodeAnimatedImage } from '@/core/decode';
import { ApngEncoder, type ApngEncoderOptions } from '@/core/encode/apng';
import { EncodeLimitError } from '@/core/encode/frames';
import { copyFrames, movingSquare, sameBytes, videoLike } from '../helpers/frames';
import { composeApng, decodePixels, parseApng } from '../helpers/png';

async function encode(
  frames: Uint8ClampedArray[],
  W: number,
  H: number,
  opts: Partial<ApngEncoderOptions> = {},
) {
  const enc = new ApngEncoder({
    width: W,
    height: H,
    fps: 10,
    transparentUnchanged: true,
    ...opts,
  });
  for (const f of copyFrames(frames)) await enc.addFrame(f);
  return enc.finish();
}

/** 合成後依每格的顯示時間（1/10 秒的倍數）展開成每次 addFrame 的畫面 */
function expand(composed: Uint8Array[], info: ReturnType<typeof parseApng>): Uint8Array[] {
  const out: Uint8Array[] = [];
  composed.forEach((c, i) => {
    for (let k = 0; k < info.frames[i].delayNum; k++) out.push(c);
  });
  return out;
}

/** 兩種合成都要和輸入逐格相同 */
async function expectSameFrames(bytes: Uint8Array, frames: Uint8ClampedArray[]) {
  const info = parseApng(bytes);
  const mine = expand(composeApng(info), info);
  expect(mine.length).toBe(frames.length);
  mine.forEach((c, i) => {
    expect(sameBytes(c, frames[i]), `測試的合成器：第 ${i} 格`).toBe(true);
  });
  const dec = await decodeAnimatedImage(bytes, { maxFrames: 1000 });
  const theirs: Uint8ClampedArray[] = [];
  for (const f of dec.frames)
    for (let k = 0; k < Math.round(f.delayMs / 100); k++) theirs.push(f.rgba);
  expect(theirs.length).toBe(frames.length);
  theirs.forEach((c, i) => {
    expect(sameBytes(c, frames[i]), `core/decode：第 ${i} 格`).toBe(true);
  });
}

/** 決定性的雜訊（0～255） */
function noise(x: number, y: number, seed = 0): number {
  let h =
    Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 7, 0x85ebca6b) ^ Math.imul(seed + 3, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) & 255;
}

/** 雜訊底 W×H（壓不太小）；changes 的每個矩形填成指定的顏色 */
function noiseWith(
  W: number,
  H: number,
  changes: { x: number; y: number; w: number; h: number; c: [number, number, number, number] }[],
): Uint8ClampedArray {
  const f = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      f.set([noise(x, y, 1), noise(x, y, 2), noise(x, y, 3), 255], (y * W + x) * 4);
  for (const r of changes)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) f.set(r.c, (y * W + x) * 4);
  return f;
}

/** 像影片的雜訊：每格在整個畫面上零星改掉約 1/9 的像素（範圍很大、範圍裡多半沒變） */
function grainy(W: number, H: number, n: number): Uint8ClampedArray[] {
  const out: Uint8ClampedArray[] = [];
  let f = noiseWith(W, H, []);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      f = f.slice();
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (noise(x, y, 100 + i) % 9 === 0) f[(y * W + x) * 4 + 1] = noise(x, y, 200 + i);
    }
    out.push(f);
  }
  return out;
}

/** 平滑的漸層；shift 讓每個像素都變一點（except 的像素維持 shift 0 的值） */
function smooth(W: number, H: number, shift: number, except = (_x: number, _y: number) => false) {
  const f = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = except(x, y) ? 0 : shift;
      f.set([(x * 2 + s) & 255, (y * 3 + s) & 255, 100 + s, 255], (y * W + x) * 4);
    }
  return f;
}

describe('APNG：transparentUnchanged', () => {
  it('影片的雜訊：之後每格都以 OVER 疊上、範圍裡沒變的像素是透明的，畫面逐格相同、檔案小很多', async () => {
    const W = 64;
    const H = 40;
    const frames = grainy(W, H, 6);
    const file = await encode(frames, W, H);
    const info = parseApng(file.bytes);
    expect(info.ihdr.colorType).toBe(6);
    expect(info.frames[0]).toMatchObject({ x: 0, y: 0, width: W, height: H, blend: 0 });
    expect(info.frames.slice(1).every((f) => f.blend === 1)).toBe(true);
    /* 範圍裡大多是透明像素（沒變的地方） */
    const f1 = info.frames[1];
    const px = decodePixels(f1.data, f1.width, f1.height, 6);
    let clear = 0;
    for (let k = 3; k < px.length; k += 4) if (px[k] === 0) clear++;
    expect(clear / (f1.width * f1.height)).toBeGreaterThan(0.8);
    await expectSameFrames(file.bytes, frames);
    const plain = await encode(frames, W, H, { transparentUnchanged: false });
    expect(file.bytes.length).toBeLessThan(plain.bytes.length * 0.6);
    expect(file.frames).toBe(6);
    expect(file.storedFrames).toBe(6);
    expect(file.duration).toBeCloseTo(0.6, 6);
  });

  it('範圍裡幾乎全變、畫面平滑時，整塊覆寫比較小就用整塊覆寫（每格取壓起來最小的）', async () => {
    const W = 64;
    const H = 40;
    const frames = [smooth(W, H, 0), smooth(W, H, 1, (x, y) => (x + y) % 5 === 0)];
    const file = await encode(frames, W, H);
    const info = parseApng(file.bytes);
    expect(info.frames[1].blend).toBe(0);
    await expectSameFrames(file.bytes, frames);
  });

  it('不會比不開這個選項大（各種影格）', async () => {
    const sets: [Uint8ClampedArray[], number, number][] = [
      [videoLike(48, 32, 8), 48, 32],
      [videoLike(160, 90, 8), 160, 90],
      [movingSquare(24, 16, 8, [3, 4]), 24, 16],
      [grainy(40, 30, 5), 40, 30],
    ];
    for (const [frames, W, H] of sets) {
      const on = await encode(frames, W, H);
      const off = await encode(frames, W, H, { transparentUnchanged: false });
      expect(on.bytes.length, `${W}×${H}`).toBeLessThanOrEqual(off.bytes.length);
      await expectSameFrames(on.bytes, frames);
    }
  });

  it('和前兩格比範圍較小時，上一格改成 dispose PREVIOUS，這一格只存和前兩格的差異', async () => {
    const W = 40;
    const H = 24;
    const big = {
      x: 4,
      y: 4,
      w: 30,
      h: 16,
      c: [255, 255, 255, 255] as [number, number, number, number],
    };
    const dot = { x: 36, y: 1, w: 2, h: 2, c: [0, 0, 0, 255] as [number, number, number, number] };
    const frames = [
      noiseWith(W, H, []),
      noiseWith(W, H, [big]),
      noiseWith(W, H, [dot]), // 和第 0 格只差一個小點
      noiseWith(W, H, [big]), // 第 2 格是 PREVIOUS 的下一格：不能再往前比
      noiseWith(W, H, [dot]), // 和第 2 格（前兩格）完全相同
    ];
    const file = await encode(frames, W, H);
    const info = parseApng(file.bytes);
    expect(info.frames.map((f) => f.dispose)).toEqual([0, 2, 0, 2, 0]);
    expect(info.frames[2]).toMatchObject({ x: 36, y: 1, width: 2, height: 2, blend: 1 });
    /* 第 3 格和前一格比（範圍是大方塊加小點） */
    expect(info.frames[3]).toMatchObject({ x: 4, y: 1, width: 34, height: 19, blend: 1 });
    /* 和前兩格完全相同：1×1 的透明像素 */
    expect(info.frames[4]).toMatchObject({ width: 1, height: 1, blend: 1 });
    const last = decodePixels(info.frames[4].data, 1, 1, 6);
    expect(Array.from(last)).toEqual([0, 0, 0, 0]);
    await expectSameFrames(file.bytes, frames);
  });

  it('第一格之後的那一格不用 PREVIOUS（規範把第一格的 PREVIOUS 當成清空）', async () => {
    const W = 16;
    const H = 8;
    const frames = [
      noiseWith(W, H, []),
      noiseWith(W, H, [{ x: 0, y: 0, w: 16, h: 8, c: [9, 9, 9, 255] }]),
    ];
    const file = await encode(frames, W, H);
    const info = parseApng(file.bytes);
    expect(info.frames.map((f) => f.dispose)).toEqual([0, 0]);
    await expectSameFrames(file.bytes, frames);
  });

  it('有變的像素是半透明或透明時改回整塊覆寫（blend SOURCE），畫面仍逐格相同', async () => {
    /* 透明底上移動的方塊（左邊一列半透明）：移開的地方變成透明 */
    const frames = movingSquare(24, 16, 6, [3]);
    const file = await encode(frames, 24, 16);
    const info = parseApng(file.bytes);
    expect(info.frames.every((f) => f.blend === 0)).toBe(true);
    await expectSameFrames(file.bytes, frames);
    /* 不透明的改變照樣疊上；同一段動畫裡兩種可以混用 */
    const W = 20;
    const H = 10;
    const mixed = [
      noiseWith(W, H, []),
      noiseWith(W, H, [{ x: 2, y: 2, w: 4, h: 4, c: [1, 2, 3, 255] }]),
      noiseWith(W, H, [{ x: 2, y: 2, w: 4, h: 4, c: [1, 2, 3, 128] }]),
      noiseWith(W, H, [{ x: 8, y: 2, w: 4, h: 4, c: [0, 0, 0, 0] }]),
      noiseWith(W, H, [{ x: 8, y: 2, w: 4, h: 4, c: [200, 0, 0, 255] }]),
    ];
    const m = await encode(mixed, W, H);
    expect(parseApng(m.bytes).frames.map((f) => f.blend)).toEqual([0, 1, 0, 0, 1]);
    await expectSameFrames(m.bytes, mixed);
  });

  it('相同的格照樣合併；mergeIdentical: false 時存成 1×1 的透明像素', async () => {
    const W = 32;
    const H = 20;
    const src = videoLike(W, H, 4);
    const frames = [src[0], src[1], src[1], src[1], src[2], src[3]];
    const merged = await encode(frames, W, H);
    const mi = parseApng(merged.bytes);
    expect(mi.frames.map((f) => f.delayNum)).toEqual([1, 3, 1, 1]);
    expect(merged.frames).toBe(6);
    expect(merged.storedFrames).toBe(4);
    await expectSameFrames(merged.bytes, frames);

    const each = await encode(frames, W, H, { mergeIdentical: false });
    const ei = parseApng(each.bytes);
    expect(ei.frames.length).toBe(6);
    expect(ei.frames[2]).toMatchObject({ width: 1, height: 1, blend: 1, delayNum: 1 });
    await expectSameFrames(each.bytes, frames);
  });

  it('同樣的輸入輸出逐位元組相同；maxBytes 沒超過時與不設上限相同，超過時丟 EncodeLimitError', async () => {
    const W = 48;
    const H = 32;
    const frames = videoLike(W, H, 6);
    const a = await encode(frames, W, H);
    const b = await encode(frames, W, H);
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
    const roomy = await encode(frames, W, H, { maxBytes: 1 << 20 });
    expect(sameBytes(roomy.bytes, a.bytes)).toBe(true);
    await expect(encode(frames, W, H, { maxBytes: 200 })).rejects.toBeInstanceOf(EncodeLimitError);
  });

  it('預設圖不受影響（整張、放在第一個 fcTL 之前）', async () => {
    const W = 32;
    const H = 20;
    const frames = videoLike(W, H, 4);
    const enc = new ApngEncoder({ width: W, height: H, fps: 10, transparentUnchanged: true });
    enc.setStill(frames[2]);
    for (const f of copyFrames(frames)) await enc.addFrame(f);
    const file = await enc.finish();
    const info = parseApng(file.bytes);
    expect(info.stillIdat).not.toBeNull();
    expect(sameBytes(decodePixels(info.stillIdat!, W, H, 6), frames[2])).toBe(true);
    await expectSameFrames(file.bytes, frames);
  });
});
