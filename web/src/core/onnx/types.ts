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

export type OnnxErrorKind = 'load' | 'session' | 'run' | 'memory';

export const ONNX_ERROR_MESSAGES: Record<OnnxErrorKind, string> = {
  load: '無法載入推論程式，請重新整理頁面再試一次。',
  session: '無法建立推論：這個瀏覽器可能不支援，或模型檔有問題。',
  run: '推論失敗，請再試一次；一直失敗時可以改用 CPU。',
  memory: '記憶體不足，無法推論。請關掉其他分頁，或換用記憶體比較多的裝置。',
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
