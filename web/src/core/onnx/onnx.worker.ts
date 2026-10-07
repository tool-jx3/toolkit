/**
 * ONNX 推論 Worker（`createOnnxClient()` 開的）：onnxruntime-web 只在這裡載入。
 *
 * - 用 `onnxruntime-web/webgpu` 這一份建置：同一個 WebAssembly 檔同時有 WebGPU 與 CPU（wasm）兩種運算方式（約 27 MB；
 *   只有 CPU 的建置約 14 MB，但沒有 WebGPU；JSEP 版約 28 MB）。檔案由 Vite 打包進 `assets/build/`，不從 CDN 載入。
 * - CPU 單執行緒（numThreads ＝ 1）：沒有跨來源隔離就不能用多執行緒。
 * - 'auto'：先試 WebGPU（要得到 adapter 才試），建不起來就改用 CPU，並回報原因。
 */

import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import * as ort from 'onnxruntime-web/webgpu';
import { loadModel } from '../models';
import { exposeApi, transfer } from '../worker';
import {
  hasWebGpu,
  isMemoryError,
  type OnnxBackend,
  type OnnxBackendChoice,
  OnnxError,
  type OnnxModelSource,
  type OnnxSessionInfo,
  type OnnxTensor,
} from './types';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = { wasm: new URL(wasmUrl, self.location.href).href };
ort.env.logLevel = 'error';

let session: ort.InferenceSession | null = null;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function createSession(bytes: Uint8Array, backend: OnnxBackend) {
  return ort.InferenceSession.create(bytes, {
    executionProviders: [backend],
    graphOptimizationLevel: 'all',
  });
}

const api = {
  async open(source: OnnxModelSource, choice: OnnxBackendChoice): Promise<OnnxSessionInfo> {
    const t0 = performance.now();
    await api.close();
    /* 模型：從 core/models 的快取讀（驗 SHA-256），或直接給位元組 */
    const bytes = 'model' in source ? await loadModel(source.model) : source.bytes;
    let backend: OnnxBackend = choice === 'webgpu' ? 'webgpu' : 'wasm';
    let fallbackReason: string | undefined;
    if (choice === 'auto') backend = (await hasWebGpu()) ? 'webgpu' : 'wasm';
    try {
      session = await createSession(bytes, backend);
    } catch (e) {
      if (choice === 'auto' && backend === 'webgpu') {
        fallbackReason = message(e);
        backend = 'wasm';
        try {
          session = await createSession(bytes, backend);
        } catch (e2) {
          throw new OnnxError(isMemoryError(message(e2)) ? 'memory' : 'session', message(e2));
        }
      } else {
        throw new OnnxError(isMemoryError(message(e)) ? 'memory' : 'session', message(e));
      }
    }
    return {
      backend,
      fallbackReason,
      inputs: [...session.inputNames],
      outputs: [...session.outputNames],
      loadMs: performance.now() - t0,
    };
  },

  async run(
    feeds: Record<string, OnnxTensor>,
    outputs?: string[],
  ): Promise<Record<string, OnnxTensor>> {
    if (!session) throw new OnnxError('run', 'no session');
    const input: Record<string, ort.Tensor> = {};
    for (const [name, t] of Object.entries(feeds)) {
      input[name] = new ort.Tensor('float32', t.data, t.dims);
    }
    let result: ort.InferenceSession.OnnxValueMapType;
    try {
      result = await session.run(input, outputs ?? session.outputNames);
    } catch (e) {
      throw new OnnxError(isMemoryError(message(e)) ? 'memory' : 'run', message(e));
    }
    const out: Record<string, OnnxTensor> = {};
    const buffers: ArrayBuffer[] = [];
    for (const [name, value] of Object.entries(result)) {
      const tensor = value as ort.Tensor;
      /* WebGPU 的輸出在顯示卡上：getData 會讀回來；CPU 的輸出直接是陣列（複製一份才能 transfer） */
      const data =
        tensor.location === 'cpu'
          ? new Float32Array(tensor.data as Float32Array)
          : new Float32Array((await tensor.getData(true)) as Float32Array);
      out[name] = { data, dims: [...tensor.dims] };
      buffers.push(data.buffer);
      tensor.dispose();
    }
    return transfer(out, buffers);
  },

  async close(): Promise<void> {
    const s = session;
    session = null;
    if (s) await s.release().catch(() => {});
  },
};

export type OnnxWorkerApi = typeof api;

exposeApi(api);
