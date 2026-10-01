import { describe, expect, it } from 'vitest';
import { ApngEncoder, apngDelay } from '@/core/encode/apng';
import { copyFrames, gradient, movingSquare, sameBytes } from '../helpers/frames';
import { composeApng, decodePixels, parseApng } from '../helpers/png';

async function encode(
  frames: Uint8ClampedArray[],
  opts: Partial<ConstructorParameters<typeof ApngEncoder>[0]> & { still?: Uint8ClampedArray } = {},
) {
  const { still, ...rest } = opts;
  const enc = new ApngEncoder({ width: 24, height: 16, fps: 10, ...rest });
  if (still) enc.setStill(still);
  for (const f of copyFrames(frames)) await enc.addFrame(f);
  return enc.finish();
}

describe('APNG 編碼', () => {
  const W = 24;
  const H = 16;
  /* 第 3、4 格與前一格相同（要被合併） */
  const frames = movingSquare(W, H, 8, [3, 4]);

  it('acTL／fcTL／fdAT 結構、序號與 CRC 都正確', async () => {
    const file = await encode(frames, { plays: 2 });
    const info = parseApng(file.bytes);
    expect(info.chunks.every((c) => c.crcOk)).toBe(true);
    expect(info.chunks[0].type).toBe('IHDR');
    expect(info.chunks[1].type).toBe('acTL');
    expect(info.chunks[info.chunks.length - 1].type).toBe('IEND');
    expect(info.numFrames).toBe(info.frames.length);
    expect(info.numPlays).toBe(2);
    /* 序號從 0 開始連續遞增（fcTL 與 fdAT 共用） */
    expect(info.sequence).toEqual(info.sequence.map((_, i) => i));
    /* 第一格是 IDAT（沒有預設圖時）且為整張 */
    expect(info.stillIdat).toBeNull();
    expect(info.frames[0].dataSeqs).toEqual([-1]);
    expect(info.frames[0]).toMatchObject({ x: 0, y: 0, width: W, height: H });
    expect(file.mime).toBe('image/png');
    expect(file.ext).toBe('png');
  });

  it('相同影格合併成一格並延長顯示時間', async () => {
    const file = await encode(frames);
    const info = parseApng(file.bytes);
    expect(file.frames).toBe(8);
    expect(file.storedFrames).toBe(6);
    expect(info.frames.length).toBe(6);
    /* 第 2 格（原本的第 2、3、4 格）顯示 3/10 秒 */
    expect(info.frames[2]).toMatchObject({ delayNum: 3, delayDen: 10 });
    const total = info.frames.reduce((s, f) => s + f.delayNum / f.delayDen, 0);
    expect(total).toBeCloseTo(0.8, 6);
    expect(file.duration).toBeCloseTo(0.8, 6);
  });

  it('只存變化的矩形，合成回來與原影格逐像素相同', async () => {
    const file = await encode(frames);
    const info = parseApng(file.bytes);
    expect(info.frames.slice(1).every((f) => f.width * f.height < W * H)).toBe(true);
    const composed = composeApng(info);
    const distinct = [0, 1, 2, 5, 6, 7];
    distinct.forEach((src, i) => {
      expect(sameBytes(composed[i], frames[src])).toBe(true);
    });
  });

  it('同樣設定輸出兩次，位元組完全相同', async () => {
    const a = await encode(frames, { quantize: true });
    const b = await encode(frames, { quantize: true });
    expect(sameBytes(a.bytes, b.bytes)).toBe(true);
    const c = await encode(frames);
    const d = await encode(frames);
    expect(sameBytes(c.bytes, d.bytes)).toBe(true);
  });

  it('減色：256 色以內完全無損', async () => {
    const file = await encode(frames, { quantize: true });
    expect(file.colors?.lossless).toBe(true);
    const info = parseApng(file.bytes);
    expect(info.ihdr.colorType).toBe(3);
    const composed = composeApng(info);
    expect(sameBytes(composed[composed.length - 1], frames[7])).toBe(true);
  });

  it('減色：超過 256 色時調色盤不超過 256 色、不透明處仍不透明', async () => {
    const enc = new ApngEncoder({ width: 64, height: 48, fps: 12, quantize: true });
    await enc.addFrame(gradient(64, 48, 0));
    await enc.addFrame(gradient(64, 48, 1));
    const file = await enc.finish();
    expect(file.colors?.lossless).toBe(false);
    const info = parseApng(file.bytes);
    expect((info.plte?.length ?? 0) / 3).toBeLessThanOrEqual(256);
    const composed = composeApng(info);
    const src = gradient(64, 48, 1);
    let maxErr = 0;
    for (let i = 0; i < src.length; i += 4) {
      if (src[i + 3] === 255) expect(composed[1][i + 3]).toBe(255);
      if (src[i + 3] === 0) expect(composed[1][i + 3]).toBe(0);
      if (src[i + 3] === 255) maxErr = Math.max(maxErr, Math.abs(src[i] - composed[1][i]));
    }
    expect(maxErr).toBeLessThan(48);
  });

  it('預設圖放在第一個 fcTL 之前，不算進動畫影格數', async () => {
    const still = movingSquare(W, H, 8)[7];
    const file = await encode(frames, { still });
    const info = parseApng(file.bytes);
    expect(info.stillIdat).not.toBeNull();
    expect(info.numFrames).toBe(info.frames.length);
    expect(info.frames[0].dataSeqs[0]).toBeGreaterThan(0);
    const stillPx = decodePixels(info.stillIdat!, W, H, 6);
    expect(sameBytes(stillPx, still)).toBe(true);
    const types = info.chunks.map((c) => c.type);
    expect(types.indexOf('IDAT')).toBeLessThan(types.indexOf('fcTL'));
  });

  it('播放次數預設為無限（0）', async () => {
    const info = parseApng((await encode(frames)).bytes);
    expect(info.numPlays).toBe(0);
  });

  it('延遲換算：整數 fps 用分數，非整數改用毫秒', () => {
    expect(apngDelay(3, 30)).toEqual({ num: 3, den: 30 });
    expect(apngDelay(1, 12.5)).toEqual({ num: 80, den: 1000 });
  });

  it('影格大小不符時丟出錯誤，沒有影格時 finish 失敗', async () => {
    const enc = new ApngEncoder({ width: 4, height: 4, fps: 10 });
    await expect(enc.addFrame(new Uint8ClampedArray(8))).rejects.toThrow(/影格大小不符/);
    await expect(enc.finish()).rejects.toThrow(/沒有任何影格/);
  });
});

describe('APNG：不合併相同影格', () => {
  it('mergeIdentical: false 時每次 addFrame 都是一格，畫面仍正確', async () => {
    for (const quantize of [false, true]) {
      const frames = movingSquare(24, 16, 8, [3, 4]);
      const enc = new ApngEncoder({
        width: 24,
        height: 16,
        fps: 10,
        quantize,
        mergeIdentical: false,
      });
      for (const f of copyFrames(frames)) await enc.addFrame(f);
      const file = await enc.finish();
      const info = parseApng(file.bytes);
      expect(info.frames.length).toBe(8);
      expect(info.frames[3]).toMatchObject({ width: 1, height: 1, delayNum: 1, delayDen: 10 });
      const composed = composeApng(info);
      expect(sameBytes(composed[4], frames[4])).toBe(true);
      expect(sameBytes(composed[7], frames[7])).toBe(true);
    }
  });
});
