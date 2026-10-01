import { describe, expect, it } from 'vitest';
import { ApngEncoder } from '@/core/encode/apng';
import { copyFrames, gradient, movingSquare } from '../helpers/frames';
import { parseApng } from '../helpers/png';

describe('APNG 預設圖選項（text-fx 移植時加的）', () => {
  const W = 24;
  const H = 16;
  const frames = movingSquare(W, H, 6, []);

  async function encode(opts: Partial<ConstructorParameters<typeof ApngEncoder>[0]>) {
    const enc = new ApngEncoder({ width: W, height: H, fps: 10, quantize: true, ...opts });
    enc.setStill(gradient(W, H, 0.3));
    for (const f of copyFrames(frames)) await enc.addFrame(f);
    return enc.finish();
  }

  it('embedStill: false：不放預設圖（第一格就是 IDAT），但仍可用代表畫面做減色統計', async () => {
    const on = parseApng((await encode({})).bytes);
    const off = parseApng((await encode({ embedStill: false })).bytes);
    expect(on.stillIdat).not.toBeNull();
    expect(off.stillIdat).toBeNull();
    expect(off.frames[0].dataSeqs).toEqual([-1]);
    expect(off.numFrames).toBe(on.numFrames);
  });

  it('stillWeightMin 只影響減色的份量（影格結構不變）', async () => {
    const a = parseApng((await encode({ stillWeightMin: 1 })).bytes);
    const b = parseApng((await encode({ stillWeightMin: 40 })).bytes);
    expect(b.numFrames).toBe(a.numFrames);
    expect(b.frames.map((f) => [f.delayNum, f.delayDen])).toEqual(
      a.frames.map((f) => [f.delayNum, f.delayDen]),
    );
  });
});
