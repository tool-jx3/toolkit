/**
 * core/models：大型模型檔的下載（進度、取消）、SHA-256 驗證（主執行緒上在 Worker 裡算）、快取、讀回與刪除。
 * 用記憶體的存放處與假的 fetch（分段送出的 ReadableStream）。
 */
import * as Comlink from 'comlink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '@/core/files';
import {
  chainStorage,
  deleteModel,
  downloadModel,
  formatModelProgress,
  formatModelSize,
  hashModelBytes,
  loadModel,
  MODEL_ERROR_MESSAGES,
  ModelError,
  type ModelProgress,
  type ModelSpec,
  type ModelStorage,
  memoryBackend,
  modelStatus,
} from '@/core/models';

const DATA = Uint8Array.from({ length: 10_000 }, (_, i) => (i * 37 + 11) & 255);

async function specFor(data: Uint8Array, over: Partial<ModelSpec> = {}): Promise<ModelSpec> {
  return {
    id: 'test',
    url: 'https://example.invalid/resolve/abc123/model.onnx',
    bytes: data.length,
    sha256: await sha256Hex(data),
    name: '測試模型',
    source: '測試',
    license: 'MIT',
    ...over,
  };
}

/** 假的 fetch：把 body 分成 chunk 位元組一段送出；可以在送到一半時停住 */
function fakeFetch(
  body: Uint8Array,
  { chunk = 1500, status = 200, failAt }: { chunk?: number; status?: number; failAt?: number } = {},
) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    const signal = init?.signal;
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (signal?.aborted) {
          controller.error(new DOMException('aborted', 'AbortError'));
          return;
        }
        if (failAt !== undefined && offset >= failAt) {
          controller.error(new TypeError('network down'));
          return;
        }
        if (offset >= body.length) {
          controller.close();
          return;
        }
        controller.enqueue(body.slice(offset, offset + chunk));
        offset += chunk;
      },
    });
    return new Response(stream, { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe('core/models', () => {
  it('下載：依序回報進度（下載 → 驗證 → 儲存），存好後狀態是 cached、讀回的內容相同', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    const { impl, calls } = fakeFetch(DATA);
    const progress: ModelProgress[] = [];
    expect(await modelStatus(spec, storage)).toBe('missing');
    await downloadModel(spec, { storage, fetch: impl, onProgress: (p) => progress.push(p) });
    expect(calls).toEqual([spec.url]);
    const downloads = progress.filter((p) => p.phase === 'download');
    expect(downloads[0].loaded).toBe(0);
    expect(downloads.at(-1)?.loaded).toBe(DATA.length);
    expect(downloads.every((p) => p.total === DATA.length)).toBe(true);
    expect(progress.map((p) => p.phase).filter((p, i, a) => a.indexOf(p) === i)).toEqual([
      'download',
      'verify',
      'save',
    ]);
    expect(await modelStatus(spec, storage)).toBe('cached');
    expect(await loadModel(spec, { storage })).toEqual(DATA);
  });

  it('SHA-256 不符：丟出 checksum，什麼都不存', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    const bad = DATA.slice();
    bad[1234] ^= 1;
    const err = await downloadModel(spec, { storage, fetch: fakeFetch(bad).impl }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.kind).toBe('checksum');
    expect(err.message).toBe(MODEL_ERROR_MESSAGES.checksum);
    expect(await modelStatus(spec, storage)).toBe('missing');
  });

  it('大小不符（多或少）：丟出 size', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    const longer = new Uint8Array(DATA.length + 10);
    longer.set(DATA);
    for (const body of [DATA.slice(0, 9000), longer]) {
      const err = await downloadModel(spec, { storage, fetch: fakeFetch(body).impl }).catch(
        (e) => e,
      );
      expect(err.kind).toBe('size');
    }
    expect(await modelStatus(spec, storage)).toBe('missing');
  });

  it('取消：下載到一半中止時丟出 aborted、不留檔案', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    const ac = new AbortController();
    const err = await downloadModel(spec, {
      storage,
      signal: ac.signal,
      fetch: fakeFetch(DATA, { chunk: 1000 }).impl,
      onProgress: (p) => {
        if (p.phase === 'download' && p.loaded >= 3000) ac.abort();
      },
    }).catch((e) => e);
    expect(err.kind).toBe('aborted');
    expect(await modelStatus(spec, storage)).toBe('missing');
  });

  it('網路中斷 → network；HTTP 錯誤 → http（附狀態碼）', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    const net = await downloadModel(spec, {
      storage,
      fetch: fakeFetch(DATA, { failAt: 3000 }).impl,
    }).catch((e) => e);
    expect(net.kind).toBe('network');
    const refused = await downloadModel(spec, {
      storage,
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    }).catch((e) => e);
    expect(refused.kind).toBe('network');
    const http = await downloadModel(spec, {
      storage,
      fetch: fakeFetch(DATA, { status: 404 }).impl,
    }).catch((e) => e);
    expect(http.kind).toBe('http');
    expect(http.status).toBe(404);
    expect(http.message).toContain('HTTP 404');
  });

  it('儲存空間不足 → quota', async () => {
    const spec = await specFor(DATA);
    const full: ModelStorage = {
      ...memoryBackend(),
      async write() {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const err = await downloadModel(spec, { storage: full, fetch: fakeFetch(DATA).impl }).catch(
      (e) => e,
    );
    expect(err.kind).toBe('quota');
  });

  it('讀回時再驗一次：快取裡的內容被改壞 → checksum 並刪掉；沒有下載過 → missing', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    expect((await loadModel(spec, { storage }).catch((e) => e)).kind).toBe('missing');
    const bad = DATA.slice();
    bad[0] ^= 255;
    await storage.write(spec.url, new Blob([bad]), { sha256: spec.sha256, bytes: DATA.length });
    expect(await modelStatus(spec, storage)).toBe('cached');
    expect((await loadModel(spec, { storage }).catch((e) => e)).kind).toBe('checksum');
    expect(await modelStatus(spec, storage)).toBe('missing');
  });

  it('換版本（網址或 SHA-256 不同）就是另一個檔案', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    await downloadModel(spec, { storage, fetch: fakeFetch(DATA).impl });
    expect(await modelStatus({ ...spec, url: `${spec.url}?v2` }, storage)).toBe('missing');
    expect(await modelStatus({ ...spec, sha256: '0'.repeat(64) }, storage)).toBe('missing');
  });

  it('刪除：之後狀態是 missing；本來就沒有時回傳 false', async () => {
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    await downloadModel(spec, { storage, fetch: fakeFetch(DATA).impl });
    expect(await deleteModel(spec, storage)).toBe(true);
    expect(await modelStatus(spec, storage)).toBe('missing');
    expect(await deleteModel(spec, storage)).toBe(false);
  });

  it('chainStorage：第一個存放處不能用時改用下一個；讀取兩邊都找', async () => {
    const spec = await specFor(DATA);
    const broken: ModelStorage = {
      kind: 'cache',
      info: async () => {
        throw new Error('SecurityError');
      },
      read: async () => {
        throw new Error('SecurityError');
      },
      write: async () => {
        throw new Error('SecurityError');
      },
      remove: async () => {
        throw new Error('SecurityError');
      },
    };
    const backup = memoryBackend();
    const chain = chainStorage([broken, backup]);
    await downloadModel(spec, { storage: chain, fetch: fakeFetch(DATA).impl });
    expect(await modelStatus(spec, backup)).toBe('cached');
    expect(await loadModel(spec, { storage: chain })).toEqual(DATA);
    expect(await deleteModel(spec, chain)).toBe(true);
  });

  it('大小與進度的寫法', () => {
    expect(formatModelSize(176_069_933)).toBe('約 176 MB');
    expect(formatModelProgress(12_345_678, 176_069_933)).toBe('12.3／176.1 MB（7%）');
    expect(formatModelProgress(0, 0)).toBe('0.0／0.0 MB（0%）');
  });
});

/*
 * 主執行緒上的 SHA-256 在另一個 Worker 裡算（Chromium 的 crypto.subtle.digest 對大檔案是同步的，會凍住畫面）。
 * Node 沒有 Worker：用 MessageChannel 做一個假的（另一端用 Comlink 公開和 hash.worker.ts 一樣的 api），記下被叫了幾次。
 */
describe('core/models：SHA-256 在 Worker 裡算', () => {
  const hashed: number[] = [];
  const hashApi = {
    ping: () => true as const,
    async sha256(bytes: Uint8Array<ArrayBuffer>) {
      hashed.push(bytes.length);
      return Comlink.transfer({ hex: await sha256Hex(bytes), bytes }, [bytes.buffer]);
    },
  };
  class HashWorker extends EventTarget {
    static made = 0;
    readonly channel = new MessageChannel();
    constructor(
      _url: URL,
      readonly options?: WorkerOptions,
    ) {
      super();
      HashWorker.made++;
      this.channel.port1.onmessage = (e) =>
        this.dispatchEvent(new MessageEvent('message', { data: e.data }));
      Comlink.expose(hashApi, this.channel.port2);
    }
    postMessage(msg: unknown, transfer: Transferable[] = []) {
      this.channel.port1.postMessage(msg, transfer);
    }
    terminate() {
      this.channel.port1.close();
      this.channel.port2.close();
    }
  }
  /** 載不到的 Worker（像 404）：error 事件 */
  class BrokenWorker extends EventTarget {
    constructor() {
      super();
      setTimeout(() => this.dispatchEvent(new Event('error')), 0);
    }
    postMessage() {}
    terminate() {}
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    hashed.length = 0;
  });

  it('下載完的檢查交給 Worker（位元組轉移過去再傳回來），存進去的內容相同', async () => {
    vi.stubGlobal('Worker', HashWorker);
    vi.stubGlobal('window', globalThis);
    const spec = await specFor(DATA);
    const storage = memoryBackend();
    const phases: string[] = [];
    await downloadModel(spec, {
      storage,
      fetch: fakeFetch(DATA).impl,
      onProgress: (p) => {
        if (phases[phases.length - 1] !== p.phase) phases.push(p.phase);
      },
    });
    expect(hashed).toEqual([DATA.length]);
    expect(phases).toEqual(['download', 'verify', 'save']);
    expect(await loadModel(spec, { storage })).toEqual(DATA);
  });

  it('Worker 不符時照樣丟棄；Worker 載不到時就地算（結果相同）', async () => {
    vi.stubGlobal('Worker', HashWorker);
    vi.stubGlobal('window', globalThis);
    const spec = await specFor(DATA);
    const bad = DATA.slice();
    bad[5] ^= 1;
    const storage = memoryBackend();
    await expect(
      downloadModel(spec, { storage, fetch: fakeFetch(bad).impl }),
    ).rejects.toMatchObject({ kind: 'checksum' });
    expect(hashed).toEqual([DATA.length]);
    expect(await modelStatus(spec, storage)).toBe('missing');
    vi.stubGlobal('Worker', BrokenWorker);
    const h = await hashModelBytes(DATA.slice());
    expect(h.hex).toBe(spec.sha256);
    expect(h.bytes).toEqual(DATA);
    await downloadModel(spec, { storage, fetch: fakeFetch(DATA).impl });
    expect(await modelStatus(spec, storage)).toBe('cached');
  });
});
