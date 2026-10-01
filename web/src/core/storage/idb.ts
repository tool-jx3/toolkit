/**
 * IndexedDB 小工具（idb-keyval）。localStorage 只放小設定；圖片、字型、大型專案資料放這裡。
 */
import { clear, createStore, del, entries, get, keys, set, type UseStore } from 'idb-keyval';

export type { UseStore } from 'idb-keyval';

const stores = new Map<string, UseStore>();

/** 取得（或建立）一個鍵值儲存區。每個名稱對應一個 IndexedDB 資料庫。 */
export function idbStore(name: string): UseStore {
  let s = stores.get(name);
  if (!s) {
    s = createStore(`trpg-toolkit:${name}`, 'kv');
    stores.set(name, s);
  }
  return s;
}

/** 工具專用的儲存區：toolDb('battlemap') */
export const toolDb = (toolId: string): UseStore => idbStore(`tool:${toolId}`);

export const idbGet = <T>(key: IDBValidKey, store?: UseStore): Promise<T | undefined> =>
  get<T>(key, store);
export const idbSet = (key: IDBValidKey, value: unknown, store?: UseStore): Promise<void> =>
  set(key, value, store);
export const idbDel = (key: IDBValidKey, store?: UseStore): Promise<void> => del(key, store);
export const idbKeys = (store?: UseStore): Promise<IDBValidKey[]> => keys(store);
export const idbEntries = <V>(store?: UseStore): Promise<[IDBValidKey, V][]> =>
  entries<IDBValidKey, V>(store);
export const idbClear = (store?: UseStore): Promise<void> => clear(store);

/** 這個環境有沒有 IndexedDB（無痕模式的部分瀏覽器、測試環境沒有） */
export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
