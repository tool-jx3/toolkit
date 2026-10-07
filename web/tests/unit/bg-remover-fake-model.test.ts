/**
 * e2e 用的假模型（tests/fixtures/bg-remover-fake-model.onnx）：
 * - 檔案與 tests/helpers/onnx.ts 的 fakeSegModel() 產生的位元組相同（改了產生方式要重新產生檔案）；
 * - 輸入輸出的名稱與形狀和真模型相同，onnxruntime-web 跑得動，結果符合 sigmoid(6 − 4(R＋G＋B))；
 * - 搭配新版的前後處理：白底黑方塊的圖，遮罩是方塊。
 */
import { describe, expect, it } from 'vitest';
import { quantizeMask } from '@/core/image';
import { fromModelOutput, MODEL_SIZE, toModelInput } from '@/tools/bg-remover/animeSeg';
import { fakeSegModel, fakeSegValue } from '../helpers/onnx';

interface Fs {
  readFile(p: string): Promise<Uint8Array>;
}

describe('bg-remover：e2e 的假模型', () => {
  it('fixture 檔與產生器的位元組相同（幾百位元組）', async () => {
    const fsName = 'node:fs/promises';
    const fs = (await import(/* @vite-ignore */ fsName)) as Fs;
    const file = await fs.readFile(
      new URL('../fixtures/bg-remover-fake-model.onnx', import.meta.url).pathname,
    );
    const made = fakeSegModel();
    expect(made.length).toBeLessThan(1024);
    expect(Array.from(file)).toEqual(Array.from(made));
  });

  it('onnxruntime-web 跑得動：img [1,3,1024,1024] → mask [1,1,1024,1024]，值是 sigmoid(6 − 4(R＋G＋B))', async () => {
    const ort = await import('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(fakeSegModel(), {
      executionProviders: ['wasm'],
    });
    expect(session.inputNames).toEqual(['img']);
    expect(session.outputNames).toEqual(['mask']);
    /* 20 × 12 的圖：白底，中間 8 × 6 的黑方塊 */
    const w = 20;
    const h = 12;
    const rgba = new Uint8Array(w * h * 4).fill(255);
    for (let y = 3; y < 9; y++) {
      for (let x = 6; x < 14; x++) rgba.set([0, 0, 0, 255], (y * w + x) * 4);
    }
    const { tensor, box } = toModelInput(rgba, w, h, MODEL_SIZE);
    const out = await session.run({
      img: new ort.Tensor('float32', tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    });
    const pred = out.mask.data as Float32Array;
    expect(out.mask.dims).toEqual([1, 1, MODEL_SIZE, MODEL_SIZE]);
    /* 補的邊（全 0＝黑）→ sigmoid(6)；圖裡的白 → sigmoid(−6) */
    expect(pred[0]).toBeCloseTo(fakeSegValue(0, 0, 0), 5);
    const o = box.top * MODEL_SIZE + box.left;
    expect(pred[o]).toBeCloseTo(fakeSegValue(1, 1, 1), 5);
    const mask = quantizeMask(fromModelOutput(pred, box));
    expect(mask[0]).toBe(0);
    expect(mask[6 * w + 10]).toBe(254);
    await session.release();
  }, 60_000);
});
