/**
 * 處理工作的執行者：環境支援就在 Worker 裡做（不卡畫面），不支援（或 Worker 開不起來）時在主執行緒做，結果相同。
 * cancel() 結束 Worker（耗時的匯出可以取消，第 5 節第 30 項），進行中的工作以 AbortError 結束，下次呼叫時重開。
 */
import { canUseWorker, proxy, type WorkerHandle, wrapWorker } from '@/core/worker';
import {
  type AdjustInput,
  type DecodedImage,
  decodeSource,
  type ExportJob,
  type ExportProgress,
  type ExportResult,
  exportZip,
  loadPsd,
  type OutputOptions,
  type PreparedInfo,
  type ProcessProgress,
  type ProcessResult,
  type PsdOut,
  prepare,
  processImage,
  type ResizedOut,
  resizeCanvas,
} from './process';
import { type RenderedFrames, renderFrames } from './render-frames';
import type { StudioWorkerApi } from './studio.worker';

export interface StudioRunner {
  prepare(bytes: Uint8Array): Promise<PreparedInfo>;
  loadPsd(
    bytes: Uint8Array,
    onProgress?: (i: number, n: number, name: string) => void,
  ): Promise<PsdOut>;
  resizeCanvas(
    bytes: Uint8Array,
    w: number,
    h: number,
    dx: number,
    dy: number,
  ): Promise<ResizedOut>;
  /** 全解析度影格（key：素材 id＋版本；同一個 key 第二次起不再傳原檔） */
  render(
    key: string,
    bytes: Uint8Array,
    adjust: AdjustInput | null,
    frames: number[],
  ): Promise<RenderedFrames>;
  processImage(
    bytes: Uint8Array,
    adjust: AdjustInput,
    out: OutputOptions,
    onProgress?: (p: ProcessProgress) => void,
  ): Promise<ProcessResult>;
  exportZip(job: ExportJob, onProgress?: (p: ExportProgress) => void): Promise<ExportResult>;
  /** 取消進行中的工作 */
  cancel(): void;
  dispose(): void;
}

const abortError = () => new DOMException('已取消', 'AbortError');

export const isAbort = (e: unknown): boolean =>
  e instanceof DOMException
    ? e.name === 'AbortError'
    : (e as { name?: string })?.name === 'AbortError';

/** 主執行緒版（不支援 Worker 時）：render 的解碼結果也快取兩筆 */
function localRunner(): Omit<StudioRunner, 'cancel' | 'dispose'> {
  const cache = new Map<string, Promise<DecodedImage>>();
  return {
    prepare,
    loadPsd,
    resizeCanvas,
    async render(key, bytes, adjust, frames) {
      let p = cache.get(key);
      if (!p) {
        p = decodeSource(bytes);
        cache.set(key, p);
        while (cache.size > 2) cache.delete(cache.keys().next().value as string);
      }
      return renderFrames(await p, adjust, frames);
    },
    processImage,
    exportZip,
  };
}

export function createStudioRunner(name = '調色處理', { worker = true } = {}): StudioRunner {
  let handle: WorkerHandle<StudioWorkerApi> | null = null;
  let broken = !worker || !canUseWorker();
  /** 已經送過原檔的 render 鍵 */
  let sent = new Set<string>();
  const pending = new Set<(e: unknown) => void>();
  let local: ReturnType<typeof localRunner> | null = null;
  const getLocal = () => {
    local ??= localRunner();
    return local;
  };

  const terminate = (reason: unknown) => {
    for (const reject of pending) reject(reason);
    pending.clear();
    handle?.terminate();
    handle = null;
    sent = new Set();
  };

  const open = (): WorkerHandle<StudioWorkerApi> | null => {
    if (broken) return null;
    if (handle) return handle;
    try {
      const w = new Worker(new URL('./studio.worker.ts', import.meta.url), {
        type: 'module',
        name,
      });
      w.addEventListener('error', () => {
        broken = true;
        terminate(new Error('處理用的 Worker 無法執行'));
      });
      handle = wrapWorker<StudioWorkerApi>(w);
      return handle;
    } catch {
      broken = true;
      return null;
    }
  };

  async function call<R>(
    remote: (api: WorkerHandle<StudioWorkerApi>['api']) => Promise<R>,
    fallback: (l: ReturnType<typeof localRunner>) => Promise<R>,
  ): Promise<R> {
    const h = open();
    if (!h) return fallback(getLocal());
    return new Promise<R>((resolve, reject) => {
      pending.add(reject);
      remote(h.api)
        .then(resolve, reject)
        .finally(() => pending.delete(reject));
    });
  }

  return {
    prepare: (bytes) =>
      call(
        (api) => api.prepare(bytes),
        (l) => l.prepare(bytes),
      ),
    loadPsd: (bytes, onProgress) =>
      call(
        (api) => api.loadPsd(bytes, onProgress ? proxy(onProgress) : undefined),
        (l) => l.loadPsd(bytes, onProgress),
      ),
    resizeCanvas: (bytes, w, h, dx, dy) =>
      call(
        (api) => api.resizeCanvas(bytes, w, h, dx, dy),
        (l) => l.resizeCanvas(bytes, w, h, dx, dy),
      ),
    render: (key, bytes, adjust, frames) =>
      call(
        async (api) => {
          let out = await api.render(key, sent.has(key) ? null : bytes, adjust, frames);
          if (!out) out = await api.render(key, bytes, adjust, frames);
          sent.add(key);
          if (!out) throw new Error('無法顯示這張圖片');
          return out;
        },
        (l) => l.render(key, bytes, adjust, frames),
      ),
    processImage: (bytes, adjust, out, onProgress) =>
      call(
        (api) => api.processImage(bytes, adjust, out, onProgress ? proxy(onProgress) : undefined),
        (l) => l.processImage(bytes, adjust, out, onProgress),
      ),
    exportZip: (job, onProgress) =>
      call(
        (api) => api.exportZip(job, onProgress ? proxy(onProgress) : undefined),
        (l) => l.exportZip(job, onProgress),
      ),
    cancel: () => terminate(abortError()),
    dispose: () => terminate(abortError()),
  };
}
