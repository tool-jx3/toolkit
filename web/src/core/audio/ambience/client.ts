/**
 * 合成的執行者：最多兩個 Worker 輪流合成（一次加好幾個聲音時比較快好），Worker 不能用時在主執行緒做（結果一樣）。
 *
 * ```ts
 * const renderer = createAmbienceRenderer();
 * const pcm = await renderer.render('rain-light', { intensity: 60 }, { duration: 60, sampleRate: 32000, seed: 1 }, signal);
 * ```
 * 取消（signal）時：還在排隊的直接丟掉；已經在算的那一個算完才丟掉（不中斷 Worker，避免重開的成本）。
 * `createAmbienceRenderer({ dedicated: true })`：匯出用，取消時直接結束 Worker（真的停下來）。
 */
import { canUseWorker, type WorkerHandle, wrapWorker } from '@/core/worker';
import type { PcmAudio } from '../pcm';
import type { AmbienceWorkerApi } from './ambience.worker';
import { type AmbienceRenderOptions, renderAmbience } from './render';

export interface AmbienceRenderer {
  render(
    id: string,
    params: Record<string, number>,
    o: AmbienceRenderOptions,
    signal?: AbortSignal,
  ): Promise<PcmAudio>;
  dispose(): void;
}

const abortError = () => new DOMException('已取消', 'AbortError');

function spawn(): WorkerHandle<AmbienceWorkerApi> | null {
  if (!canUseWorker()) return null;
  try {
    const w = new Worker(new URL('./ambience.worker.ts', import.meta.url), {
      type: 'module',
      name: '環境音合成',
    });
    return wrapWorker<AmbienceWorkerApi>(w);
  } catch {
    return null;
  }
}

interface Job {
  id: string;
  params: Record<string, number>;
  o: AmbienceRenderOptions;
  signal?: AbortSignal;
  resolve: (p: PcmAudio) => void;
  reject: (e: unknown) => void;
}

/** 讓出主執行緒一下（主執行緒合成時，先讓畫面更新） */
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export function createAmbienceRenderer({
  workers = 2,
  dedicated = false,
}: {
  workers?: number;
  dedicated?: boolean;
} = {}): AmbienceRenderer {
  const queue: Job[] = [];
  const slots: {
    handle: WorkerHandle<AmbienceWorkerApi> | null;
    busy: boolean;
    job: Job | null;
  }[] = [];
  let broken = !canUseWorker();
  let disposed = false;
  const max = Math.max(
    1,
    Math.min(
      workers,
      typeof navigator !== 'undefined' ? Math.max(1, (navigator.hardwareConcurrency || 2) - 1) : 1,
    ),
  );

  const runLocal = async (job: Job) => {
    await yieldToUi();
    if (job.signal?.aborted) throw abortError();
    return renderAmbience(job.id, job.params, job.o);
  };

  const pump = () => {
    if (disposed) return;
    while (queue.length) {
      /* 已取消的丟掉 */
      const next = queue[0];
      if (next.signal?.aborted) {
        queue.shift();
        next.reject(abortError());
        continue;
      }
      let slot = slots.find((s) => !s.busy);
      if (!slot && slots.length < max) {
        slot = { handle: null, busy: false, job: null };
        slots.push(slot);
      }
      if (!slot) return;
      if (!slot.handle && !broken) {
        slot.handle = spawn();
        if (!slot.handle) broken = true;
      }
      const job = queue.shift() as Job;
      const s = slot;
      s.busy = true;
      s.job = job;
      const done = () => {
        if (s.job !== job) return;
        s.busy = false;
        s.job = null;
        pump();
      };
      const h = s.handle;
      const run = h
        ? h.api.render(job.id, job.params, job.o).catch(() => {
            if (disposed || job.signal?.aborted) throw abortError();
            /* Worker 壞了：之後都在主執行緒做 */
            h.terminate();
            if (s.handle === h) s.handle = null;
            broken = true;
            return runLocal(job);
          })
        : runLocal(job);
      run.then(
        (pcm) => {
          if (job.signal?.aborted) job.reject(abortError());
          else job.resolve(pcm as PcmAudio);
          done();
        },
        (e) => {
          job.reject(e);
          done();
        },
      );
    }
  };

  return {
    render(id, params, o, signal) {
      if (disposed) return Promise.reject(abortError());
      return new Promise<PcmAudio>((resolve, reject) => {
        const job: Job = { id, params, o, signal, resolve, reject };
        queue.push(job);
        if (dedicated && signal) {
          signal.addEventListener(
            'abort',
            () => {
              for (const s of slots) {
                if (s.job === job && s.handle) {
                  /* 匯出：直接結束 Worker（下一個工作會開新的） */
                  s.handle.terminate();
                  s.handle = null;
                  s.busy = false;
                  s.job = null;
                  job.reject(abortError());
                  pump();
                }
              }
            },
            { once: true },
          );
        }
        pump();
      });
    },
    dispose() {
      disposed = true;
      for (const j of queue.splice(0)) j.reject(abortError());
      for (const s of slots) {
        s.handle?.terminate();
        s.job?.reject(abortError());
      }
      slots.length = 0;
    },
  };
}
