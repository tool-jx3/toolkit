/**
 * core/worker 的 wrapWorker：一般呼叫照常；Worker 的 error／messageerror 事件讓進行中與之後的呼叫拒絕
 * （WorkerFailedError），不會一直等下去。createEncoder 的 Worker 載不到時 addFrame／finish 也拒絕。
 *
 * Node 沒有 Worker：用 MessageChannel 做一個假的（主執行緒這端是 EventTarget，另一端用 Comlink.expose 公開 api）。
 */
import * as Comlink from 'comlink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEncoder } from '@/core/encode/client';
import { WORKER_FAILED_MESSAGE, WorkerFailedError, wrapWorker } from '@/core/worker';

const api = {
  add: (a: number, b: number) => a + b,
  /** 永遠不回覆 */
  hang: () => new Promise<number>(() => {}),
  boom: () => {
    throw new Error('Worker 裡的錯誤');
  },
};
type Api = typeof api;

/** 假的 Worker：postMessage 送到 MessageChannel 的另一端，回覆以 message 事件送回這個物件 */
class FakeWorker extends EventTarget {
  readonly channel = new MessageChannel();
  terminated = 0;
  constructor(expose = true) {
    super();
    this.channel.port1.onmessage = (e) => {
      this.dispatchEvent(new MessageEvent('message', { data: e.data }));
    };
    if (expose) Comlink.expose(api, this.channel.port2);
  }
  postMessage(msg: unknown, transfer: Transferable[] = []) {
    this.channel.port1.postMessage(msg, transfer);
  }
  terminate() {
    this.terminated++;
    this.channel.port1.close();
    this.channel.port2.close();
  }
}

const open = (expose = true) => {
  const w = new FakeWorker(expose);
  const h = wrapWorker<Api>(w as unknown as Worker);
  return { w, h };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wrapWorker', () => {
  it('一般呼叫照常回傳結果，Worker 裡丟的錯誤照常拒絕（不算 Worker 失敗）', async () => {
    const { w, h } = open();
    expect(await h.api.add(2, 3)).toBe(5);
    await expect(h.api.boom()).rejects.toThrow('Worker 裡的錯誤');
    expect(await h.api.add(1, 1)).toBe(2);
    expect(w.terminated).toBe(0);
    h.terminate();
    h.terminate();
    expect(w.terminated).toBe(1);
  });

  it('error 事件：進行中的呼叫以 WorkerFailedError 拒絕、結束 Worker，之後的呼叫也立刻拒絕', async () => {
    const { w, h } = open();
    const seen: string[] = [];
    w.addEventListener('error', () => seen.push('呼叫端的監聽器'));
    const a = h.api.hang();
    const b = h.api.hang();
    await new Promise((r) => setTimeout(r, 10));
    w.dispatchEvent(new Event('error'));
    await expect(a).rejects.toBeInstanceOf(WorkerFailedError);
    await expect(b).rejects.toThrow(WORKER_FAILED_MESSAGE);
    expect(seen).toEqual(['呼叫端的監聽器']);
    expect(w.terminated).toBe(1);
    await expect(h.api.add(1, 2)).rejects.toBeInstanceOf(WorkerFailedError);
    /* 結束之後再呼叫 terminate 不會出錯 */
    h.terminate();
  });

  it('Worker 的檔案載不到（從來沒有回覆）時，送出的呼叫也會拒絕', async () => {
    const { w, h } = open(false);
    const start = h.api.add(1, 2);
    setTimeout(() => w.dispatchEvent(new Event('error')), 5);
    await expect(start).rejects.toBeInstanceOf(WorkerFailedError);
  });

  it('messageerror 事件（回覆無法解讀）也一樣拒絕', async () => {
    const { w, h } = open();
    const a = h.api.hang();
    await new Promise((r) => setTimeout(r, 10));
    w.dispatchEvent(new Event('messageerror'));
    await expect(a).rejects.toBeInstanceOf(WorkerFailedError);
  });

  it('已經回覆的呼叫不受之後的錯誤影響', async () => {
    const { w, h } = open();
    const v = await h.api.add(4, 5);
    w.dispatchEvent(new Event('error'));
    expect(v).toBe(9);
  });
});

describe('createEncoder：編碼 Worker 載不到', () => {
  it('addFrame、finish 拒絕而不是一直等，沒有未處理的拒絕', async () => {
    /* 每個新開的 Worker 都在下一個事件迴圈送出 error（像 404） */
    class BrokenWorker extends FakeWorker {
      constructor() {
        super(false);
        setTimeout(() => this.dispatchEvent(new Event('error')), 0);
      }
    }
    vi.stubGlobal('Worker', BrokenWorker);
    vi.stubGlobal('window', globalThis);
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    /* 單元測試的型別沒有 Node：只取用到的兩個方法 */
    const proc = (
      globalThis as unknown as {
        process: {
          on(ev: string, fn: (e: unknown) => void): void;
          off(ev: string, fn: (e: unknown) => void): void;
        };
      }
    ).process;
    proc.on('unhandledRejection', onUnhandled);
    try {
      const enc = createEncoder({ format: 'apng', options: { width: 2, height: 2, fps: 10 } });
      /* Worker 出錯之後才送第一格（實際匯出時第一格要先抽影格） */
      await new Promise((r) => setTimeout(r, 20));
      await expect(enc.addFrame(new Uint8ClampedArray(16))).rejects.toBeInstanceOf(
        WorkerFailedError,
      );
      await expect(enc.finish()).rejects.toBeInstanceOf(WorkerFailedError);
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      proc.off('unhandledRejection', onUnhandled);
    }
  });
});
