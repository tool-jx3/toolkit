/**
 * 產生與繪製的執行者：環境支援（Worker＋OffscreenCanvas）就在 Worker 裡做，不支援或 Worker 出錯時改在主執行緒做（結果相同）。
 * - 預覽：只畫最新的一組設定；正在畫的那一組太久（超過 STALE_MS）又有新的設定時，直接結束那個 Worker 重開，不等它畫完。
 * - 匯出：每次開一個新的 Worker，取消時直接結束它（真的停下來，不必等全尺寸畫完）。
 */
import { canvasToBlob } from '@/core/image';
import { canUseWorker, type WorkerHandle, wrapWorker } from '@/core/worker';
import type { BloomWorkerApi } from './bloom.worker';
import { drawFull, drawPreview, type PreviewOutput, sceneOf, svgText } from './engine';
import type { BloomScene } from './generate';
import type { Settings } from './settings';

export interface PreviewResult extends PreviewOutput {
  /** 預覽的影像（Worker：ImageBitmap；主執行緒：畫好的畫布） */
  image: CanvasImageSource;
}

/** 正在畫的預覽超過這麼久、又有新的設定時，結束 Worker 重開 */
const STALE_MS = 400;

function workerSupported(): boolean {
  return (
    canUseWorker() &&
    typeof OffscreenCanvas !== 'undefined' &&
    'transferToImageBitmap' in OffscreenCanvas.prototype
  );
}

function spawn(): WorkerHandle<BloomWorkerApi> | null {
  try {
    const w = new Worker(new URL('./bloom.worker.ts', import.meta.url), {
      type: 'module',
      name: '幾何花紋',
    });
    return wrapWorker<BloomWorkerApi>(w);
  } catch {
    return null;
  }
}

/** 主執行緒的預覽（Worker 不能用時） */
function localPreview(settings: Settings): PreviewResult {
  const canvas = document.createElement('canvas');
  const out = drawPreview(settings, canvas);
  return { ...out, image: canvas };
}

let workersBroken = !workerSupported();

export interface Previewer {
  /** 要求畫這組設定（之前還沒開始的要求作廢） */
  request(settings: Settings): void;
  dispose(): void;
}

export function createPreviewer(
  onResult: (result: PreviewResult, settings: Settings) => void,
  onError: (error: unknown) => void,
): Previewer {
  let handle: WorkerHandle<BloomWorkerApi> | null = null;
  let running: { started: number } | null = null;
  let pending: Settings | null = null;
  /** 結束 Worker 重開時加 1：舊的回覆一律不理 */
  let generation = 0;
  let disposed = false;

  const restart = () => {
    handle?.terminate();
    handle = null;
    running = null;
    generation++;
  };

  const run = async (settings: Settings): Promise<PreviewResult> => {
    if (!workersBroken) {
      handle ??= spawn();
      if (handle) {
        try {
          const { bitmap, ...out } = await handle.api.preview(settings);
          return { ...out, image: bitmap };
        } catch {
          /* Worker 畫不了（例如沒有 OffscreenCanvas 的 2D）：之後都改在主執行緒畫 */
          workersBroken = true;
          handle?.terminate();
          handle = null;
        }
      } else workersBroken = true;
    }
    return localPreview(settings);
  };

  const pump = async () => {
    if (disposed || running || !pending) return;
    const settings = pending;
    pending = null;
    const gen = generation;
    running = { started: performance.now() };
    try {
      const r = await run(settings);
      if (gen === generation && !disposed) onResult(r, settings);
    } catch (e) {
      if (gen === generation && !disposed) onError(e);
    } finally {
      if (gen === generation) {
        running = null;
        void pump();
      }
    }
  };

  return {
    request(settings) {
      pending = settings;
      if (running && handle && performance.now() - running.started > STALE_MS) restart();
      void pump();
    },
    dispose() {
      disposed = true;
      restart();
    },
  };
}

const abortError = () => new DOMException('已取消', 'AbortError');

/** 在新的 Worker 裡做一件事；取消時結束 Worker。Worker 不能用時回傳 null（呼叫端改在主執行緒做） */
async function inWorker<R>(
  call: (api: WorkerHandle<BloomWorkerApi>['api']) => Promise<R>,
  signal?: AbortSignal,
): Promise<{ value: R } | null> {
  if (workersBroken) return null;
  const h = spawn();
  if (!h) return null;
  if (signal?.aborted) {
    h.terminate();
    throw abortError();
  }
  let onAbort: (() => void) | null = null;
  try {
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return { value: await Promise.race([call(h.api), aborted]) };
  } catch (e) {
    if (signal?.aborted) throw abortError();
    /* Worker 出錯：改在主執行緒做 */
    if (!(e instanceof DOMException && e.name === 'AbortError')) return null;
    throw e;
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    h.terminate();
  }
}

/** 全尺寸 PNG（規格 3.5） */
export async function exportPng(settings: Settings, signal?: AbortSignal): Promise<Blob> {
  const r = await inWorker((api) => api.png(settings) as Promise<Blob>, signal);
  if (r) return r.value;
  const canvas = document.createElement('canvas');
  drawFull(settings, canvas);
  if (signal?.aborted) throw abortError();
  try {
    return await canvasToBlob(canvas, 'image/png');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** SVG（規格 3.6） */
export async function exportSvg(settings: Settings, signal?: AbortSignal): Promise<Blob> {
  const r = await inWorker((api) => api.svg(settings) as Promise<string>, signal);
  const text = r ? r.value : svgText(settings);
  return new Blob([text], { type: 'image/svg+xml' });
}

/** 測試與對照用：產生的資料（Worker 能用時在 Worker 裡算） */
export async function sceneFor(settings: Settings): Promise<BloomScene> {
  const r = await inWorker((api) => api.scene(settings) as Promise<BloomScene>);
  return r ? r.value : sceneOf(settings);
}
