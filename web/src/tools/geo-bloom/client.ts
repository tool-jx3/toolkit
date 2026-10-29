/**
 * 產生與繪製的執行者：環境支援（Worker＋OffscreenCanvas）就在 Worker 裡做，不支援或 Worker 出錯時改在主執行緒做（結果相同）。
 * - 預覽：只畫最新的一組設定；正在畫的那一組超過 1 秒、又有待畫的設定時，直接結束那個 Worker 重開，不等它畫完
 *   （新設定在 1 秒前送來時，用計時器等到滿 1 秒；排程在 schedule.ts）。
 * - 匯出：每次開一個新的 Worker，取消時直接結束它（真的停下來，不必等全尺寸畫完）。
 */
import { canvasToBlob } from '@/core/image';
import { canUseWorker, type WorkerHandle, wrapWorker } from '@/core/worker';
import type { BloomWorkerApi } from './bloom.worker';
import { type DecodeImage, type DecodeMode, type DecodeResult, decodeImage } from './decode';
import {
  drawFull,
  drawPreview,
  loadDecodeImage,
  type PreviewOutput,
  sceneOf,
  svgText,
} from './engine';
import type { BloomScene } from './generate';
import { createLatestRunner, type LatestRunner } from './schedule';
import type { Settings } from './settings';

export interface PreviewResult extends PreviewOutput {
  /** 預覽的影像（Worker：ImageBitmap；主執行緒：畫好的畫布） */
  image: CanvasImageSource;
}

/**
 * 正在畫的預覽超過這麼久、又有新的設定時，結束 Worker 重開（不等舊的畫完）。
 * 一般的設定一下就畫好，拖滑桿時照樣一張一張更新；只有很重的設定（大畫布、幾千個圖形）才會被打斷。
 */
const STALE_MS = 1000;

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

export type Previewer = LatestRunner<Settings>;

export function createPreviewer(
  onResult: (result: PreviewResult, settings: Settings) => void,
  onError: (error: unknown) => void,
): Previewer {
  let handle: WorkerHandle<BloomWorkerApi> | null = null;

  const run = async (settings: Settings): Promise<PreviewResult> => {
    if (!workersBroken) {
      handle ??= spawn();
      const h = handle;
      if (h) {
        try {
          const { bitmap, ...out } = await h.api.preview(settings);
          return { ...out, image: bitmap };
        } catch (e) {
          /* 已經放棄的那一次（Worker 被結束了）：結果不用 */
          if (h !== handle) throw e;
          /* Worker 畫不了（例如沒有 OffscreenCanvas 的 2D）：之後都改在主執行緒畫 */
          workersBroken = true;
          h.terminate();
          handle = null;
        }
      } else workersBroken = true;
    }
    return localPreview(settings);
  };

  return createLatestRunner<Settings, PreviewResult>({
    run,
    cancel: () => {
      handle?.terminate();
      handle = null;
    },
    onResult,
    onError,
    staleMs: STALE_MS,
  });
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

/* ---------- 從圖片讀種子 ---------- */

export interface DecodeLoaded {
  result: DecodeResult;
  /** 縮過的圖（長邊最多 4000 px） */
  image: ImageBitmap;
  /** 原本的大小 */
  source: { width: number; height: number };
}

export interface Decoder {
  /** 讀一張圖 */
  load(blob: Blob, mode: DecodeMode): Promise<DecodeLoaded>;
  /** 同一張圖換讀的方式、點的位置再讀 */
  again(mode: DecodeMode, center: [number, number] | null): Promise<DecodeResult | null>;
  dispose(): void;
}

/** 讀種子的執行者：在自己的 Worker 裡讀（大圖要好幾秒，畫面照常）；Worker 不能用時在主執行緒讀 */
export function createDecoder(): Decoder {
  let handle: WorkerHandle<BloomWorkerApi> | null = workersBroken ? null : spawn();
  let local: DecodeImage | null = null;
  return {
    async load(blob, mode) {
      if (handle) {
        try {
          const { result, bitmap, source } = await handle.api.decodeLoad(blob, mode);
          return { result, image: bitmap, source };
        } catch {
          handle.terminate();
          handle = null;
        }
      }
      const { image, bitmap, source } = await loadDecodeImage(blob);
      local = image;
      return { result: decodeImage(image, mode), image: bitmap, source };
    },
    async again(mode, center) {
      if (handle) return handle.api.decodeAgain(mode, center);
      return local ? decodeImage(local, mode, center) : null;
    },
    dispose() {
      handle?.terminate();
      handle = null;
      local = null;
    },
  };
}
