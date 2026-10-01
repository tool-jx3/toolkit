/**
 * 效果與 PNG 編碼的執行者：環境支援就在 Worker 裡做，不支援（或 Worker 開不起來）時改在主執行緒做，結果相同。
 * 另外提供「只算最新一筆」的排程，給預覽用（拖曳時不會累積一長串過時的工作）。
 */
import { canUseWorker, type WorkerHandle, wrapWorker } from '@/core/worker';
import type { EffectsWorkerApi } from './effects.worker';
import type { RgbaBuffer } from './logic';
import { applyEffects, type EffectParams, encodeOutput } from './process';

export interface EffectsRunner {
  /** 加效果（預覽用） */
  apply(rgba: RgbaBuffer, p: EffectParams): Promise<RgbaBuffer>;
  /** 加效果（p 為 null 時不加）並編成 PNG（下載用） */
  encode(rgba: RgbaBuffer, p: EffectParams | null): Promise<Uint8Array<ArrayBuffer>>;
  dispose(): void;
}

export function createEffectsRunner({ worker = true }: { worker?: boolean } = {}): EffectsRunner {
  let handle: WorkerHandle<EffectsWorkerApi> | null = null;
  let broken = !worker || !canUseWorker();
  const pending = new Set<(e: unknown) => void>();

  const fail = () => {
    broken = true;
    for (const reject of pending) reject(new Error('效果 Worker 無法執行'));
    pending.clear();
    handle?.terminate();
    handle = null;
  };

  const open = (): WorkerHandle<EffectsWorkerApi> | null => {
    if (broken) return null;
    if (handle) return handle;
    try {
      const w = new Worker(new URL('./effects.worker.ts', import.meta.url), {
        type: 'module',
        name: '立繪效果',
      });
      w.addEventListener('error', fail);
      handle = wrapWorker<EffectsWorkerApi>(w);
      return handle;
    } catch {
      broken = true;
      return null;
    }
  };

  /* 輸入的像素用複製的方式傳過去（不 transfer）：Worker 失敗時主執行緒還能用同一份資料重算 */
  async function call<R>(
    remote: (api: WorkerHandle<EffectsWorkerApi>['api']) => Promise<R>,
    local: () => R | Promise<R>,
  ): Promise<R> {
    const h = open();
    if (!h) return local();
    try {
      return await new Promise<R>((resolve, reject) => {
        pending.add(reject);
        remote(h.api)
          .then(resolve, reject)
          .finally(() => pending.delete(reject));
      });
    } catch (e) {
      if (broken) return local();
      throw e;
    }
  }

  return {
    apply: (rgba, p) =>
      call(
        (api) => api.apply(rgba, p) as Promise<RgbaBuffer>,
        () => applyEffects(rgba, p),
      ),
    encode: (rgba, p) =>
      call(
        (api) => api.encode(rgba, p) as Promise<Uint8Array<ArrayBuffer>>,
        () => encodeOutput(rgba, p),
      ),
    dispose() {
      handle?.terminate();
      handle = null;
      pending.clear();
    },
  };
}

/**
 * 只執行最新一筆的排程：正在執行時送來的新工作會取代還沒開始的那一筆；
 * 執行中的那一筆照常做完（結果仍可以當成過渡的預覽）。
 */
export function latestQueue() {
  let running = false;
  let next: (() => Promise<void>) | null = null;
  const pump = async () => {
    if (running) return;
    running = true;
    while (next) {
      const job = next;
      next = null;
      try {
        await job();
      } catch {
        /* 預覽失敗就略過這一筆，下載時另外處理錯誤 */
      }
    }
    running = false;
  };
  return (job: () => Promise<void>): void => {
    next = job;
    void pump();
  };
}
