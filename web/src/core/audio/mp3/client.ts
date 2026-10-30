/**
 * MP3 編碼的執行者：每次匯出開一個 Worker（做完、取消就結束），Worker 開不起來或載不到時在主執行緒做
 * （同一份程式，每編一段讓出一次，畫面照樣能更新進度）。兩邊都是動態載入 lamejs。
 *
 * ```ts
 * const bytes = await encodeMp3(mix, { kbps: 128 }, { signal, onProgress: (f) => setProgress(f) });
 * downloadBlob(new Blob([bytes], { type: 'audio/mpeg' }), '環境音.mp3');
 * ```
 */
import {
  canUseWorker,
  proxy,
  WorkerFailedError,
  type WorkerHandle,
  wrapWorker,
} from '@/core/worker';
import type { PcmAudio } from '../pcm';
import type { Mp3EncodeOptions } from './encode';
import type { Mp3WorkerApi } from './mp3.worker';

export interface Mp3EncodeRun {
  signal?: AbortSignal;
  /** 進度（0～1） */
  onProgress?: (fraction: number) => void;
}

const abortError = () => new DOMException('已取消', 'AbortError');
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

/** 在主執行緒編（Worker 不能用時；結果和 Worker 一樣） */
async function encodeHere(pcm: PcmAudio, o: Mp3EncodeOptions, run: Mp3EncodeRun) {
  const { encodeMp3Loop } = await import('./encode');
  return encodeMp3Loop(pcm, o, {
    onProgress: run.onProgress,
    pause: async () => {
      await yieldToUi();
      return !run.signal?.aborted;
    },
  });
}

/**
 * 開 MP3 的 Worker；開不起來（`new Worker` 同步丟例外：file://、某些 CSP 的 SecurityError、不支援 module Worker…）時 null，
 * 改在主執行緒編（同 `core/audio/ambience/client.ts` 的 spawn）。
 */
function spawn(): WorkerHandle<Mp3WorkerApi> | null {
  if (!canUseWorker()) return null;
  try {
    return wrapWorker<Mp3WorkerApi>(
      new Worker(new URL('./mp3.worker.ts', import.meta.url), {
        type: 'module',
        name: 'MP3 編碼',
      }),
    );
  } catch {
    return null;
  }
}

/**
 * 一段首尾相接的循環 → 可以無縫循環的 MP3（`encode.ts` 的 encodeMp3Loop）。
 * 取消（signal）時 Worker 直接結束，丟 AbortError。pcm 不會被改（送給 Worker 的是複本）。
 * Worker 開不起來、載不到或執行時壞掉（WorkerFailedError）時在主執行緒重新編；編碼本身的錯誤（Mp3EncodeError）照樣丟出。
 */
export async function encodeMp3(
  pcm: PcmAudio,
  o: Mp3EncodeOptions,
  run: Mp3EncodeRun = {},
): Promise<Uint8Array> {
  const { signal } = run;
  if (signal?.aborted) throw abortError();
  const handle = spawn();
  if (handle) {
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        const onAbort = () => {
          handle.terminate();
          reject(abortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        handle.api
          .encode(pcm, o, run.onProgress ? proxy((f: number) => run.onProgress?.(f)) : undefined)
          .then((b) => resolve(b as Uint8Array), reject)
          .finally(() => signal?.removeEventListener('abort', onAbort));
      });
    } catch (e) {
      /* Worker 載不到、執行時出錯：改在主執行緒做；取消與編碼的錯誤照樣丟出 */
      if (!(e instanceof WorkerFailedError)) throw e;
    } finally {
      handle.terminate();
    }
  }
  if (signal?.aborted) throw abortError();
  return encodeHere(pcm, o, run);
}
