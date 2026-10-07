/**
 * 大型模型檔（例如 AI 去背的 ONNX 模型）的下載、驗證與快取：第一次用時由使用者按下載，下載完驗 SHA-256，
 * 存在瀏覽器裡（Cache Storage；不能用時改用 IndexedDB），之後離線也能用；可以刪除。主執行緒與 Worker 都能用。
 *
 * ```ts
 * const spec: ModelSpec = { id, url, bytes: 176_069_933, sha256: 'f156…', name, source, license };
 * if ((await modelStatus(spec)) === 'missing') {
 *   await downloadModel(spec, { signal, onProgress: (p) => setProgress(p) });   // 不符就丟掉並丟出 ModelError
 * }
 * const bytes = await loadModel(spec);   // 讀回並再驗一次 SHA-256（Worker 裡直接讀，不經過主執行緒）
 * await deleteModel(spec);
 * ```
 *
 * - 網址要固定版本（例：Hugging Face 的 `resolve/<commit>/…`），快取以網址為鍵；換版本＝另一個檔案。
 * - 下載時依 `bytes` 預先配置記憶體並顯示進度；收到的位元組數、SHA-256 與規格不符時丟棄，不寫進快取。
 *   主執行緒上的 SHA-256 在另一個 Worker 裡算（`hashModelBytes`）：Chromium 的 `crypto.subtle.digest` 對大檔案是同步的，
 *   176 MB 會凍住畫面約 1.3 秒，「正在檢查檔案是否完整」也來不及畫出來。
 * - 錯誤一律是 `ModelError`（`kind`：network／http／aborted／size／checksum／quota／storage／missing），
 *   `MODEL_ERROR_MESSAGES` 有可以直接顯示的說明。
 */
import { sha256Hex } from '../files/hash';
import { isQuotaError } from '../image/store';
import { hasIndexedDb, idbDel, idbGet, idbSet, idbStore } from '../storage/idb';
import { canUseWorker, transfer, type WorkerHandle, wrapWorker } from '../worker';
import type { ModelHashWorkerApi } from './hash.worker';

export interface ModelSpec {
  /** 代號（不同模型不同） */
  id: string;
  /** 下載網址（要固定版本） */
  url: string;
  /** 檔案大小（位元組） */
  bytes: number;
  /** SHA-256（64 個小寫十六進位字元） */
  sha256: string;
  /** 顯示名稱 */
  name: string;
  /** 來源說明（例：Hugging Face 上 SkyTNT 的 anime-seg） */
  source: string;
  /** 授權（例：Apache-2.0） */
  license: string;
  /** 模型的說明頁 */
  homepage?: string;
}

export type ModelErrorKind =
  | 'network'
  | 'http'
  | 'aborted'
  | 'size'
  | 'checksum'
  | 'quota'
  | 'storage'
  | 'missing';

export const MODEL_ERROR_MESSAGES: Record<ModelErrorKind, string> = {
  network: '連不上下載網址，請檢查網路連線後再試一次。',
  http: '下載網址回應錯誤，請稍後再試一次。',
  aborted: '已取消下載。',
  size: '下載的檔案大小與官方版本不同，已丟棄。請再試一次。',
  checksum: '下載的檔案與官方版本不符（SHA-256 不同），已丟棄。請再試一次。',
  quota: '瀏覽器的儲存空間不足，模型存不進去。請清出空間（或刪除其他網站的資料）後再試一次。',
  storage: '這個瀏覽器不能保存模型（可能是無痕模式或封鎖了網站資料）。',
  missing: '還沒有下載模型。',
};

export class ModelError extends Error {
  readonly kind: ModelErrorKind;
  /** HTTP 狀態碼（kind 為 http 時） */
  readonly status?: number;
  constructor(kind: ModelErrorKind, options: { status?: number; cause?: unknown } = {}) {
    super(
      kind === 'http' && options.status
        ? `${MODEL_ERROR_MESSAGES.http}（HTTP ${options.status}）`
        : MODEL_ERROR_MESSAGES[kind],
      { cause: options.cause },
    );
    this.name = 'ModelError';
    this.kind = kind;
    this.status = options.status;
  }
}

/* ---------- 儲存 ---------- */

export interface StoredModelInfo {
  sha256: string;
  bytes: number;
}

/** 模型的存放處（Cache Storage、IndexedDB；測試用記憶體） */
export interface ModelStorage {
  readonly kind: 'cache' | 'idb' | 'memory';
  info(key: string): Promise<StoredModelInfo | null>;
  read(key: string): Promise<{ data: Blob; info: StoredModelInfo } | null>;
  write(key: string, data: Blob, info: StoredModelInfo): Promise<void>;
  remove(key: string): Promise<boolean>;
}

const CACHE_NAME = 'trpg-toolkit:models';
const SHA_HEADER = 'x-model-sha256';

/** Cache Storage（瀏覽器的 HTTP 快取區；https 與 localhost 才有） */
export function cacheStorageBackend(name = CACHE_NAME): ModelStorage {
  const open = () => caches.open(name);
  const infoOf = (res: Response): StoredModelInfo | null => {
    const sha256 = res.headers.get(SHA_HEADER);
    const bytes = Number(res.headers.get('content-length'));
    return sha256 && Number.isFinite(bytes) ? { sha256, bytes } : null;
  };
  return {
    kind: 'cache',
    async info(key) {
      const res = await (await open()).match(key);
      return res ? infoOf(res) : null;
    },
    async read(key) {
      const res = await (await open()).match(key);
      const info = res ? infoOf(res) : null;
      if (!res || !info) return null;
      return { data: await res.blob(), info };
    },
    async write(key, data, info) {
      await (await open()).put(
        key,
        new Response(data, {
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(info.bytes),
            [SHA_HEADER]: info.sha256,
          },
        }),
      );
    },
    async remove(key) {
      return (await open()).delete(key);
    },
  };
}

interface IdbRecord extends StoredModelInfo {
  data: Blob;
}

/** IndexedDB（資料庫 `trpg-toolkit:models`） */
export function indexedDbBackend(name = 'models'): ModelStorage {
  const db = () => idbStore(name);
  return {
    kind: 'idb',
    async info(key) {
      const r = await idbGet<IdbRecord>(key, db());
      return r ? { sha256: r.sha256, bytes: r.bytes } : null;
    },
    async read(key) {
      const r = await idbGet<IdbRecord>(key, db());
      return r ? { data: r.data, info: { sha256: r.sha256, bytes: r.bytes } } : null;
    },
    async write(key, data, info) {
      await idbSet(key, { ...info, data } satisfies IdbRecord, db());
    },
    async remove(key) {
      const had = !!(await idbGet(key, db()));
      await idbDel(key, db());
      return had;
    },
  };
}

/** 記憶體（測試用；重新整理就沒了） */
export function memoryBackend(): ModelStorage {
  const map = new Map<string, { data: Blob; info: StoredModelInfo }>();
  return {
    kind: 'memory',
    async info(key) {
      return map.get(key)?.info ?? null;
    },
    async read(key) {
      return map.get(key) ?? null;
    },
    async write(key, data, info) {
      map.set(key, { data, info });
    },
    async remove(key) {
      return map.delete(key);
    },
  };
}

function hasCacheStorage(): boolean {
  try {
    return typeof caches !== 'undefined' && !!caches;
  } catch {
    return false;
  }
}

/**
 * 先用 Cache Storage，不能用（非安全環境、被封鎖）時改用 IndexedDB；讀取時兩邊都找。
 * 主執行緒與 Worker 用同一個規則，所以 Worker 讀得到主執行緒下載的檔案。
 */
export function defaultModelStorage(): ModelStorage {
  const list: ModelStorage[] = [];
  if (hasCacheStorage()) list.push(cacheStorageBackend());
  if (hasIndexedDb()) list.push(indexedDbBackend());
  if (!list.length) list.push(memoryBackend());
  return chainStorage(list);
}

/** 依序嘗試幾個存放處：讀取找第一個有的；寫入用第一個成功的（容量不足時直接丟出） */
export function chainStorage(list: readonly ModelStorage[]): ModelStorage {
  const each = async <T>(fn: (s: ModelStorage) => Promise<T | null>): Promise<T | null> => {
    for (const s of list) {
      try {
        const v = await fn(s);
        if (v) return v;
      } catch {
        /* 這個存放處不能用，換下一個 */
      }
    }
    return null;
  };
  return {
    kind: list[0]?.kind ?? 'memory',
    info: (key) => each((s) => s.info(key)),
    read: (key) => each((s) => s.read(key)),
    async write(key, data, info) {
      let last: unknown = null;
      for (const s of list) {
        try {
          await s.write(key, data, info);
          return;
        } catch (e) {
          if (isQuotaError(e)) throw e;
          last = e;
        }
      }
      throw last ?? new Error('no storage');
    },
    async remove(key) {
      let any = false;
      for (const s of list) {
        try {
          if (await s.remove(key)) any = true;
        } catch {
          /* 略過 */
        }
      }
      return any;
    },
  };
}

let shared: ModelStorage | null = null;
const storageOf = (s?: ModelStorage): ModelStorage => {
  if (s) return s;
  shared ??= defaultModelStorage();
  return shared;
};

/* ---------- 狀態、下載、讀取、刪除 ---------- */

/** 這個模型是不是已經下載好（大小與 SHA-256 的紀錄相符；內容在讀取時才驗） */
export async function modelStatus(
  spec: ModelSpec,
  storage?: ModelStorage,
): Promise<'cached' | 'missing'> {
  try {
    const info = await storageOf(storage).info(spec.url);
    return info && info.bytes === spec.bytes && info.sha256 === spec.sha256 ? 'cached' : 'missing';
  } catch {
    return 'missing';
  }
}

export interface ModelProgress {
  /** download：下載中；verify：檢查 SHA-256；save：存進瀏覽器 */
  phase: 'download' | 'verify' | 'save';
  loaded: number;
  total: number;
}

export interface DownloadModelOptions {
  signal?: AbortSignal;
  onProgress?: (p: ModelProgress) => void;
  storage?: ModelStorage;
  /** 換掉 fetch（測試用） */
  fetch?: typeof fetch;
}

const isAbort = (e: unknown, signal?: AbortSignal) =>
  signal?.aborted || (e as { name?: string } | null)?.name === 'AbortError';

/** 讓出一次畫面（主執行緒上：等下一個畫面畫完；其他環境：下一個事件迴圈） */
const yieldFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 0);
  });

/**
 * 算 SHA-256（64 個小寫十六進位字元）。主執行緒上改在 Worker 裡算，畫面不凍住：bytes 轉移過去、算完再傳回來，
 * **之後要用回傳的 bytes**（原來的那個已經轉移走了）。Worker 不能用（Node、在 Worker 裡、Worker 檔案載不到）時就地算，
 * 主執行緒上會先讓出一個畫面（例如「正在檢查檔案是否完整」先畫出來）。
 */
export async function hashModelBytes(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<{ hex: string; bytes: Uint8Array<ArrayBuffer> }> {
  if (canUseWorker()) {
    let handle: WorkerHandle<ModelHashWorkerApi> | null = null;
    try {
      handle = wrapWorker<ModelHashWorkerApi>(
        new Worker(new URL('./hash.worker.ts', import.meta.url), {
          type: 'module',
          name: '檢查模型檔',
        }),
      );
      /* 先確認 Worker 載得到，位元組才轉移過去（載不到時位元組還在這裡，改成就地算） */
      await handle.api.ping();
    } catch {
      handle?.terminate();
      handle = null;
    }
    if (handle) {
      try {
        return await handle.api.sha256(transfer(bytes, [bytes.buffer]));
      } finally {
        handle.terminate();
      }
    }
  }
  await yieldFrame();
  return { hex: await sha256Hex(bytes), bytes };
}

/** 下載、驗證、存進瀏覽器。失敗時什麼都不留，丟出 ModelError */
export async function downloadModel(
  spec: ModelSpec,
  { signal, onProgress, storage, fetch: fetchImpl = globalThis.fetch }: DownloadModelOptions = {},
): Promise<void> {
  const total = spec.bytes;
  const report = (phase: ModelProgress['phase'], loaded: number) =>
    onProgress?.({ phase, loaded, total });
  let res: Response;
  try {
    res = await fetchImpl(spec.url, { signal, credentials: 'omit', cache: 'no-store' });
  } catch (e) {
    throw new ModelError(isAbort(e, signal) ? 'aborted' : 'network', { cause: e });
  }
  if (!res.ok) throw new ModelError('http', { status: res.status });
  const buf = new Uint8Array(total);
  let loaded = 0;
  report('download', 0);
  try {
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (loaded + value.length > total) {
          await reader.cancel().catch(() => {});
          throw new ModelError('size');
        }
        buf.set(value, loaded);
        loaded += value.length;
        report('download', loaded);
      }
    } else {
      const all = new Uint8Array(await res.arrayBuffer());
      if (all.length > total) throw new ModelError('size');
      buf.set(all);
      loaded = all.length;
      report('download', loaded);
    }
  } catch (e) {
    if (e instanceof ModelError) throw e;
    throw new ModelError(isAbort(e, signal) ? 'aborted' : 'network', { cause: e });
  }
  if (signal?.aborted) throw new ModelError('aborted');
  if (loaded !== total) throw new ModelError('size');
  report('verify', loaded);
  const { hex, bytes: verified } = await hashModelBytes(buf);
  if (hex !== spec.sha256) throw new ModelError('checksum');
  if (signal?.aborted) throw new ModelError('aborted');
  report('save', loaded);
  try {
    await storageOf(storage).write(spec.url, new Blob([verified]), { sha256: hex, bytes: total });
  } catch (e) {
    throw new ModelError(isQuotaError(e) ? 'quota' : 'storage', { cause: e });
  }
}

/**
 * 讀回下載好的模型。verify（預設 true）時再算一次 SHA-256，不符就刪掉並丟出 checksum。
 * 沒有下載過時丟出 missing。
 */
export async function loadModel(
  spec: ModelSpec,
  { storage, verify = true }: { storage?: ModelStorage; verify?: boolean } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const s = storageOf(storage);
  let hit: Awaited<ReturnType<ModelStorage['read']>>;
  try {
    hit = await s.read(spec.url);
  } catch (e) {
    throw new ModelError('storage', { cause: e });
  }
  if (!hit || hit.info.sha256 !== spec.sha256) throw new ModelError('missing');
  const bytes = new Uint8Array(await hit.data.arrayBuffer());
  if (bytes.length !== spec.bytes || (verify && (await sha256Hex(bytes)) !== spec.sha256)) {
    await s.remove(spec.url).catch(() => {});
    throw new ModelError('checksum');
  }
  return bytes;
}

/** 刪除下載好的模型；本來就沒有時回傳 false */
export async function deleteModel(spec: ModelSpec, storage?: ModelStorage): Promise<boolean> {
  return storageOf(storage).remove(spec.url);
}

/** 瀏覽器回報的儲存空間（不支援時 null） */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && typeof e.quota === 'number' ? { usage: e.usage ?? 0, quota: e.quota } : null;
  } catch {
    return null;
  }
}

/** 請瀏覽器不要在空間不足時自動清掉本站的資料（瀏覽器可能不同意；不支援時 null） */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/** 「約 176 MB」（以 1,000,000 位元組為 1 MB，同下載網站的寫法） */
export function formatModelSize(bytes: number): string {
  return `約 ${Math.round(bytes / 1_000_000)} MB`;
}

/** 下載進度的文字：「12.3／176.1 MB（7%）」 */
export function formatModelProgress(loaded: number, total: number): string {
  const mb = (v: number) => (v / 1_000_000).toFixed(1);
  const pct = total > 0 ? Math.floor((loaded / total) * 100) : 0;
  return `${mb(loaded)}／${mb(total)} MB（${pct}%）`;
}
