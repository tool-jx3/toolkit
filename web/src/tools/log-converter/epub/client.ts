/**
 * 在背景產生 EPUB（規格 F112、5. D8）：環境支援就開一個 Worker（每次匯出一個，做完就結束），
 * Worker 開不起來或載不到時，同一份程式在主執行緒跑，每產生一個章節檔就讓出一次（畫面照樣能更新進度）。
 * 每次都開新的 Worker：上一次載不到，下一次照樣重新載入（驗證 F112）。
 */
import {
  canUseWorker,
  proxy,
  WorkerFailedError,
  type WorkerHandle,
  wrapWorker,
} from '@/core/worker';
import { buildEpub, type EpubInput } from './book';
import type { EpubWorkerApi } from './epub.worker';

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** 主執行緒的版本（Worker 不能用時；單元測試也走這裡） */
export function buildEpubOnMainThread(
  input: EpubInput,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  return buildEpub(input, { onProgress, pause: yieldToBrowser });
}

/** 在哪裡產生（「複製錯誤資訊」用） */
export type EpubBuildMode = 'worker' | 'main';

export async function buildEpubInBackground(
  input: EpubInput,
  onProgress?: (fraction: number) => void,
  onMode?: (mode: EpubBuildMode) => void,
): Promise<Uint8Array> {
  if (canUseWorker()) {
    onMode?.('worker');
    let handle: WorkerHandle<EpubWorkerApi> | null = null;
    try {
      const worker = new Worker(new URL('./epub.worker.ts', import.meta.url), {
        type: 'module',
        name: 'EPUB 電子書',
      });
      handle = wrapWorker<EpubWorkerApi>(worker);
      const bytes = await handle.api.build(
        input,
        onProgress ? proxy((p: number) => onProgress(p)) : undefined,
      );
      return bytes as Uint8Array;
    } catch (e) {
      /* Worker 載不到、執行時出錯（例如記憶體不足）：改在主執行緒做；其他錯誤照樣丟出 */
      if (!(e instanceof WorkerFailedError) && handle) throw e;
    } finally {
      handle?.terminate();
    }
  }
  onMode?.('main');
  return buildEpubOnMainThread(input, onProgress);
}
