/**
 * `core/onnx` 的型別、錯誤與環境偵測（主執行緒與推論 Worker 共用；這個檔案不建立 Worker）。
 */
import type { ModelSpec } from '../models';

export type OnnxBackend = 'webgpu' | 'wasm';
export type OnnxBackendChoice = 'auto' | OnnxBackend;

export const ONNX_BACKEND_LABELS: Record<OnnxBackend, string> = {
  webgpu: 'GPU（WebGPU）',
  wasm: 'CPU（WebAssembly）',
};

export interface OnnxTensor {
  data: Float32Array;
  dims: number[];
}

export interface OnnxSessionInfo {
  /** 實際使用的運算方式 */
  backend: OnnxBackend;
  /** 'auto' 時試過 WebGPU 但建不起來的原因（改用了 CPU） */
  fallbackReason?: string;
  inputs: string[];
  outputs: string[];
  /** 讀模型＋建立工作階段花的毫秒數 */
  loadMs: number;
}

export type OnnxModelSource = { model: ModelSpec } | { bytes: Uint8Array };

/** aborted：呼叫還沒結束就 `terminate()`（取消），或 terminate 之後才呼叫 */
export type OnnxErrorKind = 'load' | 'session' | 'run' | 'memory' | 'aborted';

export const ONNX_ERROR_MESSAGES: Record<OnnxErrorKind, string> = {
  load: '無法載入推論程式，請重新整理頁面再試一次。',
  session: '無法建立推論：這個瀏覽器可能不支援，或模型檔有問題。',
  run: '推論失敗，請再試一次；一直失敗時可以改用 CPU。',
  memory: '記憶體不足，無法推論。請關掉其他分頁，或換用記憶體比較多的裝置。',
  aborted: '已取消推論。',
};

export class OnnxError extends Error {
  readonly kind: OnnxErrorKind;
  /** 推論程式回報的原始訊息（給開發者看） */
  readonly detail: string;
  constructor(kind: OnnxErrorKind, detail = '') {
    super(ONNX_ERROR_MESSAGES[kind]);
    this.name = 'OnnxError';
    this.kind = kind;
    this.detail = detail;
  }
}

/** 錯誤訊息看起來是不是記憶體不足 */
export function isMemoryError(message: string): boolean {
  return /out of memory|memory access out of bounds|allocation failed|cannot enlarge memory|RangeError.*(memory|buffer)/i.test(
    message,
  );
}

/** 只用到的 WebGPU 介面（型別不依賴 @webgpu/types） */
export interface WebGpuLike {
  requestAdapter(): Promise<{
    requestDevice(): Promise<{ destroy?(): void } | null | undefined>;
  } | null>;
}

export type WebGpuProbe =
  | { ok: true }
  /** adapter：拿得到 adapter（顯示卡在，但建立裝置失敗）；reason：原因（給開發者看） */
  | { ok: false; adapter: boolean; reason: string };

/** 建立裝置最多等這麼久（毫秒）；驅動卡住時不要一直等 */
export const WEBGPU_PROBE_TIMEOUT_MS = 10_000;

/**
 * 實際試一次 WebGPU：拿 adapter、建立裝置（建好就馬上釋放）。onnxruntime-web 在「有 adapter、但 requestDevice() 失敗」時
 * 不會丟錯而是一直等，所以開推論前先在這裡試，建不起來就改用 CPU（'auto'）或回報錯誤（'webgpu'）。
 * gpu 不給時用 navigator.gpu（主執行緒與 Worker 都有）。
 */
export async function probeWebGpu(
  gpu: WebGpuLike | undefined = (globalThis.navigator as Navigator & { gpu?: WebGpuLike })?.gpu,
  timeoutMs = WEBGPU_PROBE_TIMEOUT_MS,
): Promise<WebGpuProbe> {
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  if (!gpu) return { ok: false, adapter: false, reason: 'navigator.gpu is not available' };
  let adapter: Awaited<ReturnType<WebGpuLike['requestAdapter']>>;
  try {
    adapter = await gpu.requestAdapter();
  } catch (e) {
    return { ok: false, adapter: false, reason: message(e) };
  }
  if (!adapter) return { ok: false, adapter: false, reason: 'no WebGPU adapter' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: ReturnType<typeof adapter.requestDevice>;
  try {
    request = adapter.requestDevice();
    const device = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          /* 逾時之後才建好的裝置也釋放 */
          request.then(
            (d) => d?.destroy?.(),
            () => {},
          );
          reject(new Error(`requestDevice() did not finish in ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
    if (!device) return { ok: false, adapter: true, reason: 'requestDevice() returned no device' };
    device.destroy?.();
    return { ok: true };
  } catch (e) {
    return { ok: false, adapter: true, reason: message(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** 這個瀏覽器有沒有可用的 WebGPU（有 navigator.gpu 而且要得到 adapter） */
export async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}
