/**
 * 主執行緒這邊的 PSD Worker：每次讀入開一個新的 Worker（中止＝結束它）；讀入成功後留著目前模型的 Worker，
 * 「儲存輕量 PSD」時向它要清過的 PSD。讀入失敗或中止時目前的模型與它的 Worker 不受影響（規格 F06、F07）。
 */
import { proxy, transfer, type WorkerHandle, wrapWorker } from '@/core/worker';
import type { LoadResult, PsdWorkerApi } from './psd.worker';
import { S } from './strings';

let current: WorkerHandle<PsdWorkerApi> | null = null;
let pending: { handle: WorkerHandle<PsdWorkerApi>; reject: (e: unknown) => void } | null = null;

function spawn(): WorkerHandle<PsdWorkerApi> {
  return wrapWorker<PsdWorkerApi>(
    new Worker(new URL('./psd.worker.ts', import.meta.url), { type: 'module' }),
  );
}

/** 讀入 PSD（buffer 轉移給 Worker，之後不能再用；進度訊息由 onProgress 收到）；中止時以 AbortError 拒絕 */
export async function loadPsd(
  buffer: ArrayBuffer,
  onProgress: (message: string) => void,
): Promise<LoadResult> {
  cancelPsd();
  let handle: WorkerHandle<PsdWorkerApi>;
  try {
    handle = spawn();
  } catch {
    throw new Error(S.errWorker);
  }
  const aborted = new Promise<never>((_, reject) => {
    pending = { handle, reject };
  });
  aborted.catch(() => {});
  try {
    const result = await Promise.race([
      handle.api.load(transfer(buffer, [buffer]), proxy(onProgress)) as Promise<LoadResult>,
      aborted,
    ]);
    current?.terminate();
    current = handle;
    return result;
  } catch (e) {
    handle.terminate();
    throw e;
  } finally {
    if (pending?.handle === handle) pending = null;
  }
}

/** 中止讀入中的 PSD */
export function cancelPsd(): boolean {
  if (!pending) return false;
  const p = pending;
  pending = null;
  p.handle.terminate();
  p.reject(new DOMException('已中止', 'AbortError'));
  return true;
}

/** 目前模型清過的 PSD（規格 F83） */
export async function cleanPsdBytes(): Promise<ArrayBuffer> {
  if (!current) throw new Error(S.needModel);
  return (await current.api.writeClean()) as ArrayBuffer;
}
