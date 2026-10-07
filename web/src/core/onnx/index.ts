/**
 * ONNX 模型推論（onnxruntime-web），一律在 Web Worker 裡跑：主執行緒只拿到這個用戶端，畫面不會卡住。
 * onnxruntime-web 與它的 WebAssembly 檔（約 27 MB，從本站的建置產物載入、不從 CDN）只有用到這個模組的工具頁會載入。
 *
 * ```ts
 * const onnx = createOnnxClient();
 * const info = await onnx.open({ model: spec }, { backend: 'auto' });   // Worker 直接從 core/models 的快取讀模型並驗 SHA-256
 * const out = await onnx.run({ img: { data: input, dims: [1, 3, 1024, 1024] } });   // 輸入以 transfer 傳過去
 * out.mask.data;   // Float32Array
 * onnx.terminate();
 * ```
 *
 * - 運算方式：'webgpu'（顯示卡）、'wasm'（CPU）、'auto'（WebGPU 可用時用它，建不起來就改用 CPU）。
 * - CPU 只用單執行緒：GitHub Pages 沒有跨來源隔離標頭，不能用 SharedArrayBuffer。
 * - 錯誤：開模型失敗丟 `OnnxError`（kind：load／session／run／memory）或 `core/models` 的 `ModelError`
 *   （模型沒下載、驗證不符）；Worker 本身壞掉時是 `core/worker` 的 `WorkerFailedError`。
 * - 取消：推論不能中途停止，`terminate()` 直接結束 Worker；還在等的 open／run／close 立刻以 `OnnxError`（kind：aborted）
 *   拒絕（不會一直等下去），之後的呼叫也一樣。
 */
import { MODEL_ERROR_MESSAGES, ModelError, type ModelErrorKind } from '../models';
import { canUseWorker, transfer, type WorkerHandle, wrapWorker } from '../worker';
import type { OnnxWorkerApi } from './onnx.worker';
import {
  ONNX_ERROR_MESSAGES,
  type OnnxBackendChoice,
  OnnxError,
  type OnnxErrorKind,
  type OnnxModelSource,
  type OnnxSessionInfo,
  type OnnxTensor,
} from './types';

export * from './types';

/**
 * Worker 丟出來的錯誤經過 structured clone 只剩 name／message：照訊息還原成 OnnxError／ModelError（帶 kind），
 * 其他錯誤原樣丟出。
 */
export function reviveOnnxError(e: unknown): unknown {
  const err = e as { name?: string; message?: string } | null;
  if (err?.name === 'OnnxError') {
    const kind = (Object.keys(ONNX_ERROR_MESSAGES) as OnnxErrorKind[]).find(
      (k) => ONNX_ERROR_MESSAGES[k] === err.message,
    );
    return new OnnxError(kind ?? 'run', err.message ?? '');
  }
  if (err?.name === 'ModelError') {
    const kind = (Object.keys(MODEL_ERROR_MESSAGES) as ModelErrorKind[]).find((k) =>
      (err.message ?? '').startsWith(MODEL_ERROR_MESSAGES[k]),
    );
    return new ModelError(kind ?? 'storage');
  }
  return e;
}

export interface OnnxClient {
  /** 開模型（換模型或運算方式時先關掉舊的） */
  open(
    source: OnnxModelSource,
    options?: { backend?: OnnxBackendChoice },
  ): Promise<OnnxSessionInfo>;
  /** 推論；輸入的 data 會 transfer 過去（之後不要再用那塊記憶體） */
  run(feeds: Record<string, OnnxTensor>, outputs?: string[]): Promise<Record<string, OnnxTensor>>;
  /** 關掉模型（釋放記憶體），Worker 留著 */
  close(): Promise<void>;
  /** 結束 Worker：進行中的推論被中斷，還在等的呼叫與之後的呼叫都以 OnnxError（kind：aborted）拒絕 */
  terminate(): void;
  /** 目前開著的模型 */
  readonly info: OnnxSessionInfo | null;
}

/** 開一個推論 Worker。不能開 Worker 的環境丟錯（推論太重，不在主執行緒做） */
export function createOnnxClient({ name = 'ONNX 推論' }: { name?: string } = {}): OnnxClient {
  if (!canUseWorker()) throw new OnnxError('load', 'Worker unavailable');
  const worker = new Worker(new URL('./onnx.worker.ts', import.meta.url), { type: 'module', name });
  const handle: WorkerHandle<OnnxWorkerApi> = wrapWorker<OnnxWorkerApi>(worker);
  let info: OnnxSessionInfo | null = null;
  /** 還在等 Worker 回覆的呼叫（terminate 時讓它們以取消結束：Worker 結束後不會再回覆） */
  const pending = new Set<(e: unknown) => void>();
  let terminated = false;
  const call = <T>(start: () => Promise<T>): Promise<T> => {
    if (terminated) return Promise.reject(new OnnxError('aborted'));
    return new Promise<T>((resolve, reject) => {
      pending.add(reject);
      start().then(
        (v) => {
          pending.delete(reject);
          resolve(v);
        },
        (e: unknown) => {
          pending.delete(reject);
          reject(reviveOnnxError(e));
        },
      );
    });
  };
  return {
    async open(source, { backend = 'auto' } = {}) {
      info = null;
      info = await call(() => handle.api.open(source, backend));
      return info;
    },
    async run(feeds, outputs) {
      const buffers = Object.values(feeds).map((t) => t.data.buffer as ArrayBuffer);
      return call(() => handle.api.run(transfer(feeds, buffers), outputs));
    },
    async close() {
      info = null;
      await call(() => handle.api.close());
    },
    terminate() {
      info = null;
      if (terminated) return;
      terminated = true;
      handle.terminate();
      const waiting = [...pending];
      pending.clear();
      for (const reject of waiting) reject(new OnnxError('aborted'));
    },
    get info() {
      return info;
    },
  };
}
