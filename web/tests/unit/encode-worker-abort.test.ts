/**
 * core/encode 的 Worker 版編碼器：取消（abort）之後，還在等的 addFrame、setStill、finish 一律以 AbortError 拒絕，
 * 之後再呼叫也立刻拒絕；沒有取消時照常（用假的 Worker：可以讓 add／finish 永遠不回覆，模擬 terminate 之後的 Worker）。
 * char-cutin 對等驗證發現：以前只 terminate，卡在「排隊的格太多」的 addFrame 與 finish 永遠不會回來，介面停在匯出中。
 */
import { describe, expect, it, vi } from 'vitest';
import { WorkerEncoder } from '@/core/encode/client';
import type { EncodeWorkerApi } from '@/core/encode/encode.worker';
import type { EncodedFile } from '@/core/encode/frames';
import type { EncoderSpec } from '@/core/encode/local';
import type { WorkerHandle } from '@/core/worker';

const SPEC: EncoderSpec = { format: 'apng', options: { width: 2, height: 2, fps: 10 } };
const FILE: EncodedFile = {
  bytes: new Uint8Array([1, 2, 3]),
  mime: 'image/png',
  ext: 'png',
  width: 2,
  height: 2,
  frames: 1,
  storedFrames: 1,
  duration: 0.1,
};

interface Fake {
  handle: WorkerHandle<EncodeWorkerApi>;
  terminate: ReturnType<typeof vi.fn>;
  added: number[];
  /** 讓排隊中的 add 回覆 */
  release: () => void;
}

/** 假的 Worker：start 立刻好（或永遠不好）、add 在 release 之前不回覆（或立刻回覆）、finish 回傳 FILE（或永遠不回覆） */
function fakeWorker({
  startHangs = false,
  addHangs = false,
  finishHangs = false,
  addFails = null as Error | null,
} = {}): Fake {
  const waiting: (() => void)[] = [];
  const added: number[] = [];
  const terminate = vi.fn();
  const never = () => new Promise<never>(() => {});
  const api = {
    start: () => (startHangs ? never() : Promise.resolve()),
    add: (_rgba: Uint8ClampedArray, ticks: number) => {
      added.push(ticks);
      if (addFails) return Promise.reject(addFails);
      if (!addHangs) return Promise.resolve();
      return new Promise<void>((r) => waiting.push(r));
    },
    setStill: () => (addHangs ? never() : Promise.resolve()),
    finish: () => (finishHangs ? never() : Promise.resolve(FILE)),
  };
  return {
    handle: { api, terminate } as unknown as WorkerHandle<EncodeWorkerApi>,
    terminate,
    added,
    release: () => {
      for (const r of waiting.splice(0)) r();
    },
  };
}

const px = () => new Uint8ClampedArray(16);

async function expectAbortError(p: Promise<unknown>) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(DOMException);
  expect((e as DOMException).name).toBe('AbortError');
}

describe('WorkerEncoder 的取消', () => {
  it('沒有取消：照常加格、封裝，結果原樣交出，完成後結束 Worker', async () => {
    const w = fakeWorker();
    const enc = new WorkerEncoder(SPEC, 3, w.handle);
    await enc.addFrame(px(), 2);
    await enc.addFrame(px(), 5);
    await expect(enc.finish()).resolves.toBe(FILE);
    expect(w.added).toEqual([2, 5]);
    expect(w.terminate).toHaveBeenCalledTimes(1);
  });

  it('排隊的格滿了、addFrame 正在等 Worker 回覆時取消 → AbortError', async () => {
    const w = fakeWorker({ addHangs: true });
    const enc = new WorkerEncoder(SPEC, 1, w.handle);
    const pending = enc.addFrame(px());
    await Promise.resolve();
    enc.abort();
    await expectAbortError(pending);
    expect(w.terminate).toHaveBeenCalled();
  });

  it('finish 等排隊的格、或等 Worker 封裝時取消 → AbortError', async () => {
    const a = fakeWorker({ addHangs: true });
    const encA = new WorkerEncoder(SPEC, 3, a.handle);
    await encA.addFrame(px());
    const finishA = encA.finish();
    encA.abort();
    await expectAbortError(finishA);

    const b = fakeWorker({ finishHangs: true });
    const encB = new WorkerEncoder(SPEC, 3, b.handle);
    await encB.addFrame(px());
    const finishB = encB.finish();
    await new Promise((r) => setTimeout(r, 0));
    encB.abort();
    await expectAbortError(finishB);
  });

  it('Worker 還沒啟動好時取消 → AbortError', async () => {
    const w = fakeWorker({ startHangs: true });
    const enc = new WorkerEncoder(SPEC, 3, w.handle);
    const pending = enc.addFrame(px());
    enc.abort();
    await expectAbortError(pending);
  });

  it('取消之後再呼叫 addFrame、setStill、finish 都立刻拒絕；abort 可以叫好幾次', async () => {
    const w = fakeWorker();
    const enc = new WorkerEncoder(SPEC, 3, w.handle);
    enc.abort();
    enc.abort();
    await expectAbortError(enc.addFrame(px()));
    await expectAbortError(enc.setStill(px()));
    await expectAbortError(enc.finish());
    expect(w.added).toEqual([]);
  });

  it('取消之後排隊的格才回覆也不會出錯（不會有未處理的拒絕）', async () => {
    const w = fakeWorker({ addHangs: true });
    const enc = new WorkerEncoder(SPEC, 1, w.handle);
    const pending = enc.addFrame(px());
    enc.abort();
    await expectAbortError(pending);
    w.release();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('Worker 出錯（不是取消）時照舊丟出那個錯誤', async () => {
    const boom = new Error('編碼失敗');
    const w = fakeWorker({ addFails: boom });
    const enc = new WorkerEncoder(SPEC, 1, w.handle);
    await enc.addFrame(px()).catch(() => undefined);
    await expect(enc.finish()).rejects.toBe(boom);
  });
});
