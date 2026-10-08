/**
 * 地圖的儲存（規格 3.2）：IndexedDB `trpg-toolkit:tool:map-editor`（共用 toolDb，鍵值）。
 * - `meta:<id>`：一覽用的資訊（名稱、網格種類、時間、縮圖）
 * - `map:<id>`：地圖資料（3.1）
 * - `legacy-imported`：已經從舊版（IndexedDB `trpg-mapper`）搬過的地圖 id
 * 沒有 IndexedDB 時（少數瀏覽器的隱私模式）改存在記憶體：照常使用、重新整理後消失。
 */
import { hasIndexedDb, toolDb, type UseStore } from '@/core/storage';
import { convertMapData } from './legacy';
import {
  generateMapId,
  type MapData,
  type MapMeta,
  newMapData,
  sanitizeMapData,
  TOOL_ID,
} from './model';

const META = (id: string) => `meta:${id}`;
const MAP = (id: string) => `map:${id}`;
const LEGACY_KEY = 'legacy-imported';

/* ---------- 底層：IndexedDB 或記憶體 ---------- */

interface Kv {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbKv(store: UseStore): Kv {
  return {
    get: <T>(key: string) => store('readonly', (s) => req(s.get(key))) as Promise<T | undefined>,
    set: (key, value) => store('readwrite', (s) => req(s.put(value, key))).then(() => undefined),
    del: (key) => store('readwrite', (s) => req(s.delete(key))).then(() => undefined),
    keys: () =>
      store('readonly', (s) => req(s.getAllKeys())).then((ks) =>
        ks.filter((k): k is string => typeof k === 'string'),
      ),
  };
}

function memoryKv(): Kv {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => structuredClone(m.get(key)) as T | undefined,
    set: async (key, value) => void m.set(key, structuredClone(value)),
    del: async (key) => void m.delete(key),
    keys: async () => [...m.keys()],
  };
}

let kvPromise: Promise<Kv> | null = null;
/** 是否改用記憶體（IndexedDB 不能用） */
let memoryOnly = false;

function kv(): Promise<Kv> {
  if (!kvPromise) {
    kvPromise = (async () => {
      if (!hasIndexedDb()) {
        memoryOnly = true;
        return memoryKv();
      }
      try {
        const s = toolDb(TOOL_ID);
        const k = idbKv(s);
        await k.keys();
        return k;
      } catch {
        memoryOnly = true;
        return memoryKv();
      }
    })();
  }
  return kvPromise;
}

export function isMemoryOnly(): boolean {
  return memoryOnly;
}

/* ---------- 地圖 ---------- */

/** 所有地圖（依更新時間由新到舊） */
export async function listMaps(): Promise<MapMeta[]> {
  const k = await kv();
  const keys = (await k.keys()).filter((key) => key.startsWith('meta:'));
  const metas = await Promise.all(keys.map((key) => k.get<MapMeta>(key)));
  return metas
    .filter((m): m is MapMeta => !!m && typeof m.id === 'string')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getMeta(id: string): Promise<MapMeta | null> {
  return (await (await kv()).get<MapMeta>(META(id))) ?? null;
}

/** 地圖資料（讀出來時整理一次；舊版格式的也轉好） */
export async function getMapData(id: string): Promise<MapData | null> {
  const raw = await (await kv()).get<Record<string, unknown>>(MAP(id));
  if (!raw) return null;
  return convertMapData(raw);
}

export async function putMap(meta: MapMeta, data: MapData): Promise<void> {
  const k = await kv();
  await k.set(MAP(meta.id), data);
  await k.set(META(meta.id), meta);
}

export async function putMeta(meta: MapMeta): Promise<void> {
  await (await kv()).set(META(meta.id), meta);
}

export async function deleteMap(id: string): Promise<void> {
  const k = await kv();
  await k.del(META(id));
  await k.del(MAP(id));
}

async function freshId(): Promise<string> {
  const k = await kv();
  for (;;) {
    const id = generateMapId();
    if (!(await k.get(META(id)))) return id;
  }
}

/** 新增一張空白地圖 */
export async function createMap(name: string, gridType: MapData['gridType']): Promise<MapMeta> {
  const now = new Date().toISOString();
  const meta: MapMeta = {
    id: await freshId(),
    name,
    gridType,
    createdAt: now,
    updatedAt: now,
    thumbnail: null,
  };
  await putMap(meta, newMapData(gridType));
  return meta;
}

/** 複製（F005） */
export async function duplicateMap(id: string, name: string): Promise<MapMeta | null> {
  const meta = await getMeta(id);
  const data = await (await kv()).get<Record<string, unknown>>(MAP(id));
  if (!meta || !data) return null;
  const now = new Date().toISOString();
  const copy: MapMeta = { ...meta, id: await freshId(), name, createdAt: now, updatedAt: now };
  await putMap(copy, convertMapData(data));
  return copy;
}

/** 讀進來的檔案內容 → 地圖資料（F009）：直接是地圖資料、或共用專案檔格式包住的 */
export function unwrapMapJson(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (o.format === 'trpg-toolkit-project' && o.data && typeof o.data === 'object')
    return unwrapMapJson(o.data);
  if (!o.canvas || typeof o.canvas !== 'object') return null;
  return o;
}

/** 讀取 JSON（F009）：新增一張地圖（不開啟）。內容不對時丟 Error（訊息是給使用者看的原因） */
export async function importMapJson(
  text: string,
  fileName: string,
  fallbackName: string,
): Promise<MapMeta> {
  const raw = unwrapMapJson(JSON.parse(text));
  if (!raw) throw new MapFileError('invalid');
  const data = convertMapData(raw);
  const now = new Date().toISOString();
  const base = fileName.replace(/\.json$/i, '').trim();
  const meta: MapMeta = {
    id: await freshId(),
    name: (base || fallbackName).slice(0, 60),
    gridType: data.gridType,
    createdAt: now,
    updatedAt: now,
    thumbnail: null,
  };
  await putMap(meta, data);
  return meta;
}

export class MapFileError extends Error {
  constructor(readonly code: 'invalid') {
    super(code);
  }
}

/* ---------- 舊版存檔的搬移（F011） ---------- */

export const LEGACY_DB = 'trpg-mapper';
export const LEGACY_STORE = 'maps';

interface LegacyRecord {
  id: string;
  name?: string;
  gridType?: string;
  createdAt?: string;
  updatedAt?: string;
  thumbnail?: string | null;
  data?: Record<string, unknown>;
}

/** 讀舊版的所有地圖；資料庫不存在時回傳 []（而且不會因此建立一個空的資料庫） */
export async function readLegacyMaps(): Promise<LegacyRecord[]> {
  if (!hasIndexedDb()) return [];
  try {
    const dbs = 'databases' in indexedDB ? await indexedDB.databases() : null;
    if (dbs && !dbs.some((d) => d.name === LEGACY_DB)) return [];
  } catch {
    /* 不支援 databases() 時用下面的方法 */
  }
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    let created = false;
    const r = indexedDB.open(LEGACY_DB);
    r.onupgradeneeded = () => {
      /* 原本不存在：中止，不留下空的資料庫 */
      created = true;
      r.transaction?.abort();
    };
    r.onsuccess = () => resolve(created ? null : r.result);
    r.onerror = () => resolve(null);
    r.onblocked = () => resolve(null);
  });
  if (!db) return [];
  try {
    if (!db.objectStoreNames.contains(LEGACY_STORE)) return [];
    const tx = db.transaction(LEGACY_STORE, 'readonly');
    const all = await req(tx.objectStore(LEGACY_STORE).getAll());
    return (all as LegacyRecord[]).filter((r) => r && typeof r.id === 'string');
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** 還沒搬過的舊版地圖搬進來；回傳搬了幾張 */
export async function migrateLegacyMaps(): Promise<number> {
  const records = await readLegacyMaps();
  if (!records.length) return 0;
  const k = await kv();
  const done = new Set((await k.get<string[]>(LEGACY_KEY)) ?? []);
  let count = 0;
  for (const rec of records) {
    if (done.has(rec.id)) continue;
    try {
      const data = convertMapData({ gridType: rec.gridType, ...(rec.data ?? {}) });
      const exists = await k.get(META(rec.id));
      const id = exists ? await freshId() : rec.id;
      const now = new Date().toISOString();
      const meta: MapMeta = {
        id,
        name: typeof rec.name === 'string' && rec.name ? rec.name : '地圖',
        gridType: data.gridType,
        createdAt: rec.createdAt ?? now,
        updatedAt: rec.updatedAt ?? rec.createdAt ?? now,
        thumbnail: typeof rec.thumbnail === 'string' ? rec.thumbnail : null,
      };
      await putMap(meta, data);
      count++;
    } catch {
      /* 壞掉的紀錄跳過（之後不再嘗試） */
    }
    done.add(rec.id);
  }
  await k.set(LEGACY_KEY, [...done]);
  return count;
}

let migration: Promise<number> | null = null;

/** 舊版的搬移在這一頁只做一次（一覽、直接開 `?id=` 都會先等它） */
export function ensureLegacyMigrated(): Promise<number> {
  if (!migration) migration = migrateLegacyMaps().catch(() => 0);
  return migration;
}

/** 測試用：清掉記住的連線 */
export function resetStorageForTest(): void {
  kvPromise = null;
  memoryOnly = false;
}

export { sanitizeMapData };
