/**
 * 圖片存 IndexedDB（localStorage 容量太小，data URI 很容易超過）。存不下時回傳 false，工具可以提示使用者。
 *
 * ```ts
 * const images = createImageStore('obs-tachie');
 * if (!(await images.save(preset.id, dataUri))) toast({ title: '圖片太大，存不進這個瀏覽器', tone: 'warning' });
 * const uri = await images.load(preset.id);
 * ```
 */
import { hasIndexedDb, idbClear, idbDel, idbGet, idbKeys, idbSet, idbStore } from '../storage/idb';

/** 存檔失敗的原因：沒有 IndexedDB（例如部分無痕模式）、容量不足、其他錯誤 */
export type ImageSaveFailure = 'unavailable' | 'quota' | 'error';

export type ImageSaveResult =
  | { ok: true }
  | { ok: false; reason: ImageSaveFailure; error?: unknown };

/** 錯誤是不是「容量不足」 */
export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(String((e as Error)?.message ?? ''))
  );
}

export interface ImageStore {
  /** 存一張圖（Blob 或 data URI 字串）；存不下（容量不足、沒有 IndexedDB）時回傳 false */
  save(key: string, value: Blob | string): Promise<boolean>;
  /** 同 save，但回傳失敗原因（容量不足時可以提示使用者清理） */
  put(key: string, value: Blob | string): Promise<ImageSaveResult>;
  load(key: string): Promise<Blob | string | undefined>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

/** 工具專用的圖片儲存區（資料庫名稱 `trpg-toolkit:tool:<toolId>:<name>`） */
export function createImageStore(toolId: string, name = 'images'): ImageStore {
  const db = () => idbStore(`tool:${toolId}:${name}`);
  const put = async (key: string, value: Blob | string): Promise<ImageSaveResult> => {
    if (!hasIndexedDb()) return { ok: false, reason: 'unavailable' };
    try {
      await idbSet(key, value, db());
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: isQuotaError(error) ? 'quota' : 'error', error };
    }
  };
  return {
    async save(key, value) {
      return (await put(key, value)).ok;
    },
    put,
    async load(key) {
      if (!hasIndexedDb()) return undefined;
      try {
        return await idbGet<Blob | string>(key, db());
      } catch {
        return undefined;
      }
    },
    async remove(key) {
      if (!hasIndexedDb()) return;
      await idbDel(key, db()).catch(() => undefined);
    },
    async keys() {
      if (!hasIndexedDb()) return [];
      try {
        return (await idbKeys(db())).map(String);
      } catch {
        return [];
      }
    },
    async clear() {
      if (!hasIndexedDb()) return;
      await idbClear(db()).catch(() => undefined);
    },
  };
}
