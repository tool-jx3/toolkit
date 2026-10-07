/**
 * 與 Python 參考做法（anime-segmentation inference.py 的 get_mask，onnxruntime CPU＋OpenCV）比對；
 * 參考資料由規格第 3.1 節的參考腳本產生，CI 沒有這些檔案（與 176 MB 的模型檔），沒有設定環境變數時整組跳過。
 *
 * 環境變數：
 * - BG_REMOVER_REF：參考資料夾，裡面有
 *   - images/<名稱>.png：測試圖；
 *   - ref/<名稱>.f32、ref/<名稱>.json：get_mask 的浮點數遮罩（OpenCV 預設開 Intel IPP，同 x86 的 pip 套件）；
 *   - ref-noipp/…：同上，但關掉 IPP（OpenCV 的通用實作，同沒有 IPP 的平台）；
 *   - dump-noipp/<名稱>.input.f32、<名稱>.pred.f32：關掉 IPP 時 get_mask 交給模型的 [1, 3, 1024, 1024]
 *     與模型的原始輸出 [1, 1, 1024, 1024]（dump/ 是開 IPP 的同一份）。
 * - BG_REMOVER_MODEL：isnetis.onnx 的路徑（SHA-256 f15622d8…）；有設定才跑「真模型」那一組。
 * - BG_REMOVER_OUT（選填）：把新版的浮點數遮罩寫到這裡（<名稱>.f32），給參考腳本的 compare 用。
 *
 * 1. 前後處理（不需要模型）：新版的前處理與 dump 的張量、新版的後處理套在 dump 的模型輸出上與 ref 的遮罩——
 *    和 OpenCV 的通用實作逐值相同（差 0）；和開了 IPP 的 OpenCV 只差浮點數的進位（< 1e-4）。
 * 2. 真模型：新版的前後處理＋onnxruntime-web（CPU）與 Python 的遮罩；剩下的差異來自推論程式的浮點數運算順序。
 */
import { describe, expect, it } from 'vitest';
import { decodePng } from '@/core/decode/png';
import { quantizeMask } from '@/core/image';
import { fromModelOutput, MODEL_SIZE, toModelInput } from '@/tools/bg-remover/animeSeg';

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const MODEL = env.BG_REMOVER_MODEL;
const REF = env.BG_REMOVER_REF;
const OUT = env.BG_REMOVER_OUT;

interface Fs {
  readFile(p: string): Promise<Uint8Array>;
  writeFile(p: string, d: Uint8Array): Promise<void>;
  readdir(p: string): Promise<string[]>;
  mkdir(p: string, o: { recursive: boolean }): Promise<unknown>;
}

async function nodeFs(): Promise<Fs> {
  const fsName = 'node:fs/promises';
  return (await import(/* @vite-ignore */ fsName)) as Fs;
}

const f32 = (b: Uint8Array) =>
  new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));

/** 兩個浮點數陣列的差：平均與最大絕對差、不同的個數 */
function diff(a: Float32Array, b: Float32Array) {
  expect(a.length).toBe(b.length);
  let max = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > 0) count++;
    if (d > max) max = d;
  }
  return { max, mean: sum / a.length, count };
}

/** 8 位元遮罩（floor(m × 255)）的比較：相同的比例、最大差 */
function alphaDiff(a: Float32Array, b: Float32Array) {
  const qa = quantizeMask(a);
  const qb = quantizeMask(b);
  let same = 0;
  let max = 0;
  for (let i = 0; i < qa.length; i++) {
    const d = Math.abs(qa[i] - qb[i]);
    if (!d) same++;
    if (d > max) max = d;
  }
  return { same: same / qa.length, max };
}

async function listNames(fs: Fs, dir: string, suffix: string): Promise<string[]> {
  return (await fs.readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.slice(0, -suffix.length))
    .sort();
}

describe.skipIf(!REF)('bg-remover：前後處理與 Python 參考做法逐值比對（不經過模型）', () => {
  for (const [dumpDir, refDir, limit, label] of [
    ['dump-noipp', 'ref-noipp', 0, 'OpenCV 通用實作：逐值相同'],
    ['dump', 'ref', 1e-4, 'OpenCV＋IPP：只差浮點數的進位'],
  ] as const) {
    it(`前處理的張量、後處理（裁邊＋縮回原尺寸）的遮罩（${label}）`, async () => {
      const fs = await nodeFs();
      const names = await listNames(fs, `${REF}/${dumpDir}`, '.pred.f32');
      if (!names.length) return;
      const rows: string[] = [];
      let maxPre = 0;
      let maxPost = 0;
      for (const name of names) {
        const img = decodePng(await fs.readFile(`${REF}/images/${name}.png`));
        const { tensor, box } = toModelInput(img.rgba, img.width, img.height, MODEL_SIZE);
        const pre = diff(tensor, f32(await fs.readFile(`${REF}/${dumpDir}/${name}.input.f32`)));
        const pred = f32(await fs.readFile(`${REF}/${dumpDir}/${name}.pred.f32`));
        const post = diff(
          fromModelOutput(pred, box),
          f32(await fs.readFile(`${REF}/${refDir}/${name}.f32`)),
        );
        rows.push(
          `${dumpDir}\t${name}\t${img.width}×${img.height}\t前處理 最大差 ${pre.max.toExponential(2)}（${pre.count} 個值不同）\t後處理 最大差 ${post.max.toExponential(2)}（${post.count} 個值不同）`,
        );
        maxPre = Math.max(maxPre, pre.max);
        maxPost = Math.max(maxPost, post.max);
      }
      console.info(rows.join('\n'));
      expect(maxPre).toBeLessThanOrEqual(limit);
      expect(maxPost).toBeLessThanOrEqual(limit);
    }, 120_000);
  }
});

describe.skipIf(!MODEL || !REF)('bg-remover：真模型與 Python 參考做法的遮罩', () => {
  it('平均絕對差 < 1e-5、最大差 < 1e-3；8 位元遮罩 99.9% 以上相同、其餘只差 1', async () => {
    const fs = await nodeFs();
    const ort = await import('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(await fs.readFile(MODEL!), {
      executionProviders: ['wasm'],
    });
    expect(session.inputNames).toEqual(['img']);
    expect(session.outputNames).toEqual(['mask']);
    if (OUT) await fs.mkdir(OUT, { recursive: true });
    const names = await listNames(fs, `${REF}/ref`, '.json');
    expect(names.length).toBeGreaterThan(0);
    const rows: string[] = [];
    for (const name of names) {
      const img = decodePng(await fs.readFile(`${REF}/images/${name}.png`));
      const { tensor, box } = toModelInput(img.rgba, img.width, img.height, MODEL_SIZE);
      const out = await session.run({
        img: new ort.Tensor('float32', tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]),
      });
      const mask = fromModelOutput(out.mask.data as Float32Array, box);
      if (OUT) await fs.writeFile(`${OUT}/${name}.f32`, new Uint8Array(mask.buffer));
      for (const refDir of ['ref', 'ref-noipp']) {
        const bytes = await fs.readFile(`${REF}/${refDir}/${name}.f32`).catch(() => null);
        if (!bytes) continue;
        const d = diff(mask, f32(bytes));
        const a = alphaDiff(mask, f32(bytes));
        rows.push(
          `${refDir}\t${name}\t${img.width}×${img.height}\t平均差 ${d.mean.toExponential(2)}\t最大差 ${d.max.toExponential(2)}\t8 位元相同 ${(a.same * 100).toFixed(3)}%（最大差 ${a.max}）`,
        );
        expect(d.mean).toBeLessThan(1e-5);
        expect(d.max).toBeLessThan(1e-3);
        expect(a.same).toBeGreaterThan(0.999);
        expect(a.max).toBeLessThanOrEqual(1);
      }
    }
    console.info(rows.join('\n'));
    await session.release();
  }, 600_000);
});
