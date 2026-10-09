/**
 * core/assets：圖片資產庫。圖片（Blob）存 IndexedDB、記憶體留一份快取；工具的狀態（createToolStore）只存 id，
 * 所以復原／重做、自動存檔、專案檔都只搬動 id，不搬圖片。
 *
 * ```ts
 * const assets = createAssetStore('height-board');
 * const { id, persisted, reason } = await assets.add(file);       // id 依內容產生：同一張圖永遠同一個 id
 * if (!persisted) toast({ title: reason === 'quota' ? '瀏覽器空間不足，圖片無法自動保存' : '這個瀏覽器無法自動保存圖片', tone: 'warning' });
 * update((d) => { d.characters.push({ imageId: id, … }); });
 * const bmp = await assets.bitmap(id);                              // 重新整理後也拿得到（從 IndexedDB 讀回）
 * // 定期清掉沒人用的圖（目前的狀態＋復原歷史都算「有人用」）
 * await assets.gc(referencedAssetIds(useBoard, (d) => d.characters.map((c) => c.imageId)));
 * ```
 */
import { useEffect, useState } from 'react';
import { AUDIO_FILE_INFO, detectAudioType } from '../audio/analysis';
import { bytesToHex, subtleSha256 } from '../files/hash';
import { createImageStore, detectImageType, type ImageSaveFailure, loadImage } from '../image';
import type { ToolStore } from '../storage';

export interface AssetAddResult {
  id: string;
  /** 是否已存進 IndexedDB（false 時只在記憶體裡，重新整理後就沒了） */
  persisted: boolean;
  /** persisted 為 false 的原因 */
  reason?: ImageSaveFailure;
}

export interface AssetStore {
  /** 加入一張圖（同內容只存一份）；回傳 id 與是否成功保存 */
  add(blob: Blob): Promise<AssetAddResult>;
  /** 以指定的 id 存入（讀專案檔時用，保留檔案裡的 id） */
  put(id: string, blob: Blob): Promise<AssetAddResult>;
  /** 取原始檔案（先看記憶體，再讀 IndexedDB） */
  get(id: string): Promise<Blob | undefined>;
  /** 解碼後的圖（快取；同一個 id 只解碼一次） */
  bitmap(id: string): Promise<ImageBitmap | undefined>;
  /** 已經解碼過的圖（同步；還沒讀就是 undefined） */
  peekBitmap(id: string): ImageBitmap | undefined;
  /** 物件網址（給 <img>、縮圖用；刪除或 gc 時自動釋放） */
  url(id: string): Promise<string | undefined>;
  /** 記憶體裡有沒有這張 */
  has(id: string): boolean;
  /** 一次讀回多張（重新整理後還原）；回傳找不到的 id */
  preload(ids: Iterable<string>): Promise<{ missing: string[] }>;
  remove(id: string): Promise<void>;
  /** 刪掉 keep 以外的所有圖（記憶體與 IndexedDB），回傳刪掉的 id；寫入中與 gc 開始之後才寫入的圖不刪 */
  gc(keep: Iterable<string>): Promise<string[]>;
  /** 所有已知的 id（記憶體＋IndexedDB） */
  ids(): Promise<string[]>;
  clear(): Promise<void>;
  /** 專案檔用：把這些 id 的圖變成 { 檔名, 位元組 }（檔名 `<id>.<副檔名>`） */
  exportFiles(ids: Iterable<string>): Promise<{ name: string; data: Uint8Array }[]>;
}

const EXT: Record<string, string> = {
  png: 'png',
  apng: 'png',
  webp: 'webp',
  gif: 'gif',
  jpeg: 'jpg',
  avif: 'avif',
  bmp: 'bmp',
};

const MIME: Record<string, string> = {
  png: 'image/png',
  apng: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/** 32 位元 FNV-1a 的兩個變體（沒有 crypto.subtle 時用） */
function fallbackHash(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193);
    h2 = Math.imul(h2 ^ bytes[bytes.length - 1 - i], 0x5bd1e995);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
  ).padEnd(24, '0');
}

/**
 * 依內容產生 id（SHA-256 前 24 位十六進位；不能用時改用簡單雜湊）。同一份位元組永遠同一個 id。
 * 完整的 64 位 SHA-256 用 `@/core/files` 的 `sha256Hex`（CCFOLIA 房間 ZIP 的圖片檔名）。
 */
export async function assetIdFor(bytes: Uint8Array): Promise<string> {
  /* 非安全環境（file://、http）沒有 crypto.subtle，改用簡單雜湊（id 規則照舊，不改用純 JavaScript 的 SHA-256） */
  const digest = await subtleSha256(bytes);
  return digest ? `a${bytesToHex(digest.slice(0, 12))}` : `a${fallbackHash(bytes)}`;
}

/**
 * 依檔頭推副檔名與 MIME（認不得時 png）。圖片以外也認得常見的音訊檔（MP3、WAV、OGG、FLAC、M4A、AAC、WebM；
 * music-frame 把音樂放進同一個資產庫時新增，圖片的結果不變）。
 */
export function assetFileInfo(bytes: Uint8Array): { ext: string; mime: string } {
  const kind = detectImageType(bytes);
  if (kind) return { ext: EXT[kind], mime: MIME[kind] };
  const audio = detectAudioType(bytes);
  if (audio) return AUDIO_FILE_INFO[audio];
  return { ext: 'png', mime: 'image/png' };
}

/**
 * 建立工具的圖片資產庫（IndexedDB 資料庫 `trpg-toolkit:tool:<toolId>:<name>`，與 createImageStore 相同）。
 */
export function createAssetStore(toolId: string, { name = 'assets' } = {}): AssetStore {
  const db = createImageStore(toolId, name);
  const blobs = new Map<string, Blob>();
  const bitmaps = new Map<string, Promise<ImageBitmap | undefined>>();
  const decoded = new Map<string, ImageBitmap>();
  const urls = new Map<string, string>();
  /** 已確定存進 IndexedDB 的 id */
  const saved = new Set<string>();
  /*
   * gc 不刪「寫入中」與「gc 開始之後才寫入」的圖：工具通常在 add 結束後才把 id 寫進狀態（一批讀完才一起寫的也有），
   * gc 的 keep 是呼叫當下算的，這段時間差裡的新圖會被當成沒人用而刪掉（char-chart、review-grid 對等驗證）。
   */
  const writing = new Set<string>();
  let putCount = 0;
  const putOrder = new Map<string, number>();

  const forget = (id: string) => {
    blobs.delete(id);
    saved.delete(id);
    bitmaps.delete(id);
    decoded.get(id)?.close?.();
    decoded.delete(id);
    const u = urls.get(id);
    if (u) URL.revokeObjectURL(u);
    urls.delete(id);
  };

  const put = async (id: string, blob: Blob): Promise<AssetAddResult> => {
    writing.add(id);
    putOrder.set(id, ++putCount);
    try {
      blobs.set(id, blob);
      /* 還沒解碼成功的查詢（例如先前找不到這張圖）作廢，下一次 bitmap(id) 讀這張新的 */
      if (!decoded.has(id)) bitmaps.delete(id);
      const r = await db.put(id, blob);
      if (!r.ok) return { id, persisted: false, reason: r.reason };
      saved.add(id);
      return { id, persisted: true };
    } finally {
      writing.delete(id);
    }
  };

  const get = async (id: string): Promise<Blob | undefined> => {
    const hit = blobs.get(id);
    if (hit) return hit;
    const v = await db.load(id);
    if (v instanceof Blob) {
      blobs.set(id, v);
      saved.add(id);
      return v;
    }
    return undefined;
  };

  const store: AssetStore = {
    async add(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const id = await assetIdFor(bytes);
      /* 同一張圖已經存過：不必再寫一次 */
      if (blobs.has(id) && saved.has(id)) return { id, persisted: true };
      /*
       * 存剛讀出來的位元組，不存傳進來的 File：Android 的相片挑選器給的檔案，讀取權限之後會失效，
       * 之後的縮圖、存進 IndexedDB、專案檔再讀原本的 File 會丟 NotReadableError。
       */
      return put(
        id,
        blobs.get(id) ?? new Blob([bytes], { type: blob.type || assetFileInfo(bytes).mime }),
      );
    },
    put,
    get,
    bitmap(id) {
      const hit = bitmaps.get(id);
      if (hit) return hit;
      /* 只快取解碼成功的結果：找不到或解碼失敗時移除，之後 put／add 進來的圖讀得到 */
      const drop = () => {
        if (bitmaps.get(id) === p) bitmaps.delete(id);
      };
      const p: Promise<ImageBitmap | undefined> = get(id).then(async (b) => {
        if (!b) {
          drop();
          return undefined;
        }
        const bmp = await loadImage(b);
        decoded.set(id, bmp);
        return bmp;
      });
      p.catch(drop);
      bitmaps.set(id, p);
      return p;
    },
    peekBitmap: (id) => decoded.get(id),
    async url(id) {
      const hit = urls.get(id);
      if (hit) return hit;
      const b = await get(id);
      if (!b) return undefined;
      const u = URL.createObjectURL(b);
      urls.set(id, u);
      return u;
    },
    has: (id) => blobs.has(id),
    async preload(ids) {
      const missing: string[] = [];
      await Promise.all(
        [...new Set(ids)].map(async (id) => {
          if (!(await get(id))) missing.push(id);
        }),
      );
      return { missing };
    },
    async remove(id) {
      forget(id);
      await db.remove(id);
    },
    async gc(keep) {
      const k = new Set(keep);
      /* gc 開始時還在寫的、開始之後才寫的都不刪（在 gc 跑的期間寫完的也算） */
      for (const id of writing) k.add(id);
      const start = putCount;
      const removed: string[] = [];
      for (const id of await store.ids()) {
        if (k.has(id) || writing.has(id) || (putOrder.get(id) ?? 0) > start) continue;
        await store.remove(id);
        removed.push(id);
      }
      return removed;
    },
    async ids() {
      return [...new Set([...blobs.keys(), ...(await db.keys())])];
    },
    async clear() {
      for (const id of [...blobs.keys()]) forget(id);
      await db.clear();
    },
    async exportFiles(ids) {
      const out: { name: string; data: Uint8Array }[] = [];
      for (const id of new Set(ids)) {
        const b = await get(id);
        if (!b) continue;
        const data = new Uint8Array(await b.arrayBuffer());
        out.push({ name: `${id}.${assetFileInfo(data).ext}`, data });
      }
      return out;
    },
  };
  return store;
}

/**
 * 專案檔讀回的檔案（`<id>.<副檔名>` → 位元組）放回資產庫，保留檔案裡的 id。回傳沒存進 IndexedDB 的數量。
 */
export async function importAssetFiles(
  assets: AssetStore,
  files: Iterable<[string, Uint8Array]>,
): Promise<{ ids: string[]; notPersisted: number; reason?: ImageSaveFailure }> {
  const ids: string[] = [];
  let notPersisted = 0;
  let reason: ImageSaveFailure | undefined;
  for (const [path, data] of files) {
    const base = path.split('/').pop() ?? path;
    const id = base.replace(/\.[^.]+$/, '');
    if (!id) continue;
    const r = await assets.put(
      id,
      new Blob([data as Uint8Array<ArrayBuffer>], { type: assetFileInfo(data).mime }),
    );
    ids.push(id);
    if (!r.persisted) {
      notPersisted++;
      reason ??= r.reason;
    }
  }
  return { ids, notPersisted, reason };
}

/**
 * 目前的狀態＋復原／重做歷史裡用到的所有 id（gc 時要保留）。
 */
export function referencedAssetIds<T>(
  store: ToolStore<T>,
  pick: (data: T) => Iterable<string | null | undefined>,
): Set<string> {
  const ids = new Set<string>();
  const add = (d: T | undefined) => {
    if (!d) return;
    for (const id of pick(d)) if (id) ids.add(id);
  };
  add(store.getState().data);
  const t = store.temporal.getState();
  for (const s of t.pastStates) add(s.data as T | undefined);
  for (const s of t.futureStates) add(s.data as T | undefined);
  return ids;
}

/** React：取某個 id 的解碼後圖片（讀取中或找不到時是 null） */
export function useAssetBitmap(
  assets: AssetStore,
  id: string | null | undefined,
): ImageBitmap | null {
  const [bmp, setBmp] = useState<ImageBitmap | null>(() =>
    id ? (assets.peekBitmap(id) ?? null) : null,
  );
  useEffect(() => {
    let alive = true;
    if (!id) {
      setBmp(null);
      return;
    }
    const hit = assets.peekBitmap(id);
    if (hit) {
      setBmp(hit);
      return;
    }
    setBmp(null);
    assets
      .bitmap(id)
      .then((b) => alive && setBmp(b ?? null))
      .catch(() => alive && setBmp(null));
    return () => {
      alive = false;
    };
  }, [assets, id]);
  return bmp;
}
