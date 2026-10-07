/**
 * core/onnx 的用戶端（主執行緒這端）與 WebGPU 檢查：
 * - terminate()（取消）時還在等 Worker 回覆的 open／run 立刻以 OnnxError（aborted）拒絕，不會一直等下去；之後的呼叫也一樣。
 * - probeWebGpu：有 adapter 但 requestDevice() 失敗、卡住時回報「建不起來」（'auto' 據此改用 CPU）。
 *
 * Node 沒有 Worker：用 MessageChannel 做一個假的（同 core-worker.test.ts），另一端用 Comlink.expose 公開假的推論 api。
 */
import * as Comlink from 'comlink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnnxClient, OnnxError, probeWebGpu, type WebGpuLike } from '@/core/onnx';

const info = { backend: 'wasm', inputs: ['img'], outputs: ['mask'], loadMs: 1 };
/** hang：這次的 open／run 永遠不回覆（例如推論很久） */
const state = { hang: false, opened: 0 };
const api = {
  open: () => {
    state.opened++;
    return state.hang ? new Promise(() => {}) : Promise.resolve(info);
  },
  run: () => (state.hang ? new Promise(() => {}) : Promise.resolve({})),
  close: () => {},
};

class FakeWorker extends EventTarget {
  readonly channel = new MessageChannel();
  terminated = 0;
  constructor() {
    super();
    this.channel.port1.onmessage = (e) =>
      this.dispatchEvent(new MessageEvent('message', { data: e.data }));
    Comlink.expose(api, this.channel.port2);
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

afterEach(() => {
  vi.unstubAllGlobals();
  state.hang = false;
});

const useFakeWorker = () => {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('window', globalThis);
};
const feeds = () => ({ img: { data: new Float32Array(4), dims: [1, 1, 2, 2] } });

describe('core/onnx：createOnnxClient', () => {
  it('一般呼叫照常回傳', async () => {
    useFakeWorker();
    const client = createOnnxClient();
    expect(await client.open({ bytes: new Uint8Array(1) })).toEqual(info);
    expect(client.info).toEqual(info);
    expect(await client.run(feeds())).toEqual({});
    client.terminate();
  });

  it('推論中 terminate()：等待中的 run 以 OnnxError（aborted）拒絕，之後的呼叫也立刻拒絕', async () => {
    useFakeWorker();
    const client = createOnnxClient();
    await client.open({ bytes: new Uint8Array(1) });
    state.hang = true;
    const running = client.run(feeds());
    await new Promise((r) => setTimeout(r, 10));
    client.terminate();
    const e = await running.then(
      () => null,
      (err: unknown) => err,
    );
    expect(e).toBeInstanceOf(OnnxError);
    expect((e as OnnxError).kind).toBe('aborted');
    expect(client.info).toBeNull();
    await expect(client.run(feeds())).rejects.toMatchObject({ kind: 'aborted' });
    await expect(client.open({ bytes: new Uint8Array(1) })).rejects.toMatchObject({
      kind: 'aborted',
    });
  });

  it('載入模型中 terminate()：等待中的 open 以 OnnxError（aborted）拒絕', async () => {
    useFakeWorker();
    state.hang = true;
    const client = createOnnxClient();
    const opening = client.open({ bytes: new Uint8Array(1) });
    await new Promise((r) => setTimeout(r, 10));
    client.terminate();
    client.terminate();
    await expect(opening).rejects.toMatchObject({ name: 'OnnxError', kind: 'aborted' });
  });
});

/** 假的 navigator.gpu */
function fakeGpu(
  device: 'ok' | 'reject' | 'hang' | 'none',
  adapter = true,
): { gpu: WebGpuLike; destroyed: () => number } {
  let destroyed = 0;
  const dev = { destroy: () => destroyed++ };
  return {
    gpu: {
      requestAdapter: async () =>
        adapter
          ? {
              requestDevice: () =>
                device === 'ok'
                  ? Promise.resolve(dev)
                  : device === 'none'
                    ? Promise.resolve(null)
                    : device === 'hang'
                      ? new Promise(() => {})
                      : Promise.reject(new Error('requestDevice failed')),
            }
          : null,
    },
    destroyed: () => destroyed,
  };
}

describe('core/onnx：probeWebGpu', () => {
  it('建得起裝置：ok（建好的裝置馬上釋放）', async () => {
    const g = fakeGpu('ok');
    expect(await probeWebGpu(g.gpu)).toEqual({ ok: true });
    expect(g.destroyed()).toBe(1);
  });

  it('有 adapter 但 requestDevice() 失敗、沒有裝置、一直不回覆：建不起來（adapter: true）', async () => {
    expect(await probeWebGpu(fakeGpu('reject').gpu)).toEqual({
      ok: false,
      adapter: true,
      reason: 'requestDevice failed',
    });
    expect(await probeWebGpu(fakeGpu('none').gpu)).toMatchObject({ ok: false, adapter: true });
    const t0 = Date.now();
    expect(await probeWebGpu(fakeGpu('hang').gpu, 30)).toMatchObject({ ok: false, adapter: true });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('沒有 WebGPU、拿不到 adapter：adapter: false（安靜地用 CPU）', async () => {
    expect(await probeWebGpu(undefined)).toMatchObject({ ok: false, adapter: false });
    expect(await probeWebGpu(fakeGpu('ok', false).gpu)).toMatchObject({
      ok: false,
      adapter: false,
    });
    const throwing: WebGpuLike = {
      requestAdapter: () => Promise.reject(new Error('blocked')),
    };
    expect(await probeWebGpu(throwing)).toEqual({ ok: false, adapter: false, reason: 'blocked' });
  });
});
