/**
 * 作品的存放處（3.14、F001～F018）：IndexedDB `trpg-toolkit:tool:scenario-editor`。
 * - `works`：作品清單（WorkMeta[]）；`doc:<id>`：原稿（JSON 字串）；`gen:<id>:<t>`：過去的版本；
 *   `legacy`：已接收過的舊版作品。
 * - 清單的改寫和本體的寫入在同一個交易裡（跨分頁也是一個一個依序通過）。
 * - 一個作品只在一個分頁開（Web Locks；沒有 Web Locks 時用 BroadcastChannel 提醒）。
 * - 關閉瞬間的備份寫在 localStorage（journal）。
 */
import type { UseStore } from 'idb-keyval';
import { hasIndexedDb, toolDb } from '@/core/storage';

export const TOOL = 'scenario-editor';
export const GEN_MAX = 10;
export const GEN_EVERY = 10 * 60 * 1000;
export const TRASH_DAYS = 30;
export const DAY = 864e5;
/** 關閉瞬間的備份的上限（字數） */
export const JOURNAL_MAX = 4.5e6;
/** 沒有 IndexedDB 時存在 localStorage 的上限（字數） */
export const LOCAL_MAX = 4 * 1024 * 1024;

export interface WorkGen {
  t: number;
  size: number;
}

export interface WorkMeta {
  id: string;
  title: string;
  /** 最後更新 */
  updated: number;
  /** 大小（字數） */
  size: number;
  /** 最後存成檔案的時間 */
  fileAt: number | null;
  gens: WorkGen[];
  genHash?: string;
  genAt?: number;
  /** 移到垃圾桶的時間 */
  deleted?: number;
}

const K_WORKS = 'works';
const K_LEGACY = 'legacy';
const docKey = (id: string) => `doc:${id}`;
const genKey = (id: string, t: number) => `gen:${id}:${t}`;

const LS = {
  current: `trpg-toolkit:${TOOL}:current`,
  journal: (id: string) => `trpg-toolkit:${TOOL}:journal:${id}`,
  journalMeta: (id: string) => `trpg-toolkit:${TOOL}:journal-meta:${id}`,
  single: `trpg-toolkit:${TOOL}:single`,
  tpl: `trpg-toolkit:${TOOL}:bxtpl`,
};

/* ---------- localStorage（一律包 try/catch） ---------- */

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function lsDel(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 刪不掉就算了 */
  }
}

export const LS_KEYS = LS;

/* ---------- IndexedDB ---------- */

let storeP: Promise<UseStore | null> | null = null;

/** 存放處（無法使用 IndexedDB 時 null） */
export function workStore(): Promise<UseStore | null> {
  if (!storeP) {
    storeP = (async () => {
      if (!hasIndexedDb()) return null;
      try {
        const s = toolDb(TOOL);
        await s('readonly', (st) => req(st.get(K_WORKS)));
        return s;
      } catch {
        return null;
      }
    })();
  }
  return storeP;
}

/** 測試用：重新偵測 */
export function resetWorkStore(): void {
  storeP = null;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error ?? new Error('aborted'));
  });
}

async function need(): Promise<UseStore> {
  const s = await workStore();
  if (!s) throw new Error('無法使用 IndexedDB');
  return s;
}

/** 寫入（undefined＝刪除）與清單的改寫在同一個交易裡 */
async function batch<R>(
  ops: readonly (readonly [string, unknown])[],
  fn?: (list: WorkMeta[]) => R,
): Promise<R | undefined> {
  const s = await need();
  return s('readwrite', async (st) => {
    const finished = done(st.transaction);
    for (const [k, v] of ops) {
      if (v === undefined) st.delete(k);
      else st.put(v, k);
    }
    let out: R | undefined;
    if (fn) {
      const list = cleanList(await req(st.get(K_WORKS)));
      out = fn(list);
      st.put(list, K_WORKS);
    }
    await finished;
    return out;
  });
}

function cleanList(v: unknown): WorkMeta[] {
  return Array.isArray(v) ? (v.filter((m) => m && typeof m.id === 'string') as WorkMeta[]) : [];
}

export async function listAll(): Promise<WorkMeta[]> {
  const s = await workStore();
  if (!s) return [];
  try {
    return cleanList(await s('readonly', (st) => req(st.get(K_WORKS))));
  } catch {
    return [];
  }
}

/** 清單（不含垃圾桶），依更新時間新到舊 */
export async function listWorks(): Promise<WorkMeta[]> {
  return (await listAll()).filter((m) => !m.deleted).sort((a, b) => b.updated - a.updated);
}

export async function listTrash(): Promise<WorkMeta[]> {
  return (await listAll())
    .filter((m) => m.deleted)
    .sort((a, b) => (b.deleted ?? 0) - (a.deleted ?? 0));
}

function metaOf(list: WorkMeta[], id: string, make: boolean): WorkMeta | undefined {
  let m = list.find((x) => x.id === id);
  if (!m && make) {
    m = { id, title: '', updated: 0, size: 0, fileAt: null, gens: [] };
    list.push(m);
  }
  return m;
}

export async function readWork(id: string): Promise<string | undefined> {
  const s = await need();
  return s('readonly', (st) => req(st.get(docKey(id)))) as Promise<string | undefined>;
}

/** 寫入本體，同一個交易裡更新清單的摘要 */
export async function writeWork(
  id: string,
  json: string,
  title: string,
  extra: Partial<WorkMeta> = {},
): Promise<WorkMeta | undefined> {
  return batch([[docKey(id), json]], (list) => {
    const m = metaOf(list, id, true) as WorkMeta;
    Object.assign(m, extra, {
      title: title || '未命名的劇本',
      updated: extra.updated ?? Date.now(),
      size: json.length,
    });
    if (!Array.isArray(m.gens)) m.gens = [];
    if (m.fileAt === undefined) m.fileAt = null;
    return { ...m };
  });
}

export async function patchMeta(id: string, patch: Partial<WorkMeta>): Promise<void> {
  await batch([], (list) => {
    const m = metaOf(list, id, false);
    if (m) Object.assign(m, patch);
  });
}

export const newWorkId = (): string =>
  `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 移到垃圾桶（本體與版本原樣保留） */
export const trashWork = (id: string, now = Date.now()): Promise<void> =>
  patchMeta(id, { deleted: now });

export async function restoreWork(id: string): Promise<void> {
  await batch([], (list) => {
    const m = metaOf(list, id, false);
    if (m) delete m.deleted;
  });
}

/** 永久刪除本體與版本 */
export async function purgeWork(id: string): Promise<void> {
  const m = (await listAll()).find((x) => x.id === id);
  const ops: [string, undefined][] = [
    [docKey(id), undefined],
    ...(m?.gens ?? []).map((g) => [genKey(id, g.t), undefined] as [string, undefined]),
  ];
  await batch(ops, (list) => {
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
  });
}

/** 放滿 30 天的垃圾永久刪除（F006）；回傳刪除的數量 */
export async function purgeOldTrash(now = Date.now()): Promise<number> {
  const lim = now - TRASH_DAYS * DAY;
  let n = 0;
  for (const m of await listTrash())
    if ((m.deleted ?? now) < lim) {
      try {
        await purgeWork(m.id);
        n++;
      } catch {
        /* 下次再刪 */
      }
    }
  return n;
}

/** 剩幾天（至少 1） */
export const trashDaysLeft = (deleted: number, now = Date.now()): number =>
  Math.max(1, Math.ceil((deleted + TRASH_DAYS * DAY - now) / DAY));

/* ---------- 過去的版本（F007） ---------- */

/** 字串的指紋（FNV-1a） */
export function strHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}:${s.length}`;
}

/** 留一份版本（與上一份相同時不留，最多 10 份）；json 省略時取存放處裡的本體 */
export async function snapGen(
  id: string,
  json?: string | null,
  now = Date.now(),
): Promise<boolean> {
  if (!(await workStore())) return false;
  const body = json ?? (await readWork(id));
  if (!body) return false;
  const m = (await listAll()).find((x) => x.id === id);
  if (!m) return false;
  const h = strHash(body);
  if (m.genHash === h) return false;
  const gens = [...(m.gens ?? [])];
  const t = Math.max(now, (gens.at(-1)?.t ?? 0) + 1);
  gens.push({ t, size: body.length });
  const drop = gens.slice(0, Math.max(0, gens.length - GEN_MAX));
  await batch(
    [[genKey(id, t), body], ...drop.map((g) => [genKey(id, g.t), undefined] as const)],
    (list) => {
      const mm = metaOf(list, id, false);
      if (mm) {
        mm.gens = gens.slice(-GEN_MAX);
        mm.genHash = h;
        mm.genAt = t;
      }
    },
  );
  return true;
}

export async function readGen(id: string, t: number): Promise<string | undefined> {
  const s = await need();
  return s('readonly', (st) => req(st.get(genKey(id, t)))) as Promise<string | undefined>;
}

/* ---------- 大小、日期的顯示 ---------- */

export function sizeText(n: number): string {
  return n >= 1024 * 1024
    ? `${Math.round((n / 1024 / 1024) * 10) / 10} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function whenText(t: number | null | undefined): string {
  if (!t) return '';
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 鎖（F009） ---------- */

const LOCK_PREFIX = `trpg-toolkit:${TOOL}:edit:`;

export const hasLocks = (): boolean =>
  typeof navigator !== 'undefined' &&
  !!navigator.locks &&
  typeof navigator.locks.request === 'function';

/**
 * 取得作品的鎖：拿到時回傳放開的函式；被別的分頁持有時 null。
 * wait（毫秒）：最多等這麼久（剛重新載入時前一頁的鎖可能還沒解開）。
 */
export function takeLock(id: string, wait = 0): Promise<(() => void) | null> {
  if (!hasLocks()) return Promise.resolve(() => undefined);
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let opts: LockOptions = { ifAvailable: true };
    if (wait) {
      const ac = new AbortController();
      timer = setTimeout(() => ac.abort(), wait);
      opts = { signal: ac.signal };
    }
    navigator.locks
      .request(LOCK_PREFIX + id, opts, (lock) => {
        if (timer) clearTimeout(timer);
        if (!lock) {
          resolve(null);
          return undefined;
        }
        return new Promise<void>((release) => resolve(() => release()));
      })
      .catch((e: unknown) => {
        if (timer) clearTimeout(timer);
        resolve((e as { name?: string })?.name === 'AbortError' ? null : () => undefined);
      });
  });
}

/** 被別的分頁鎖住的作品（except＝自己持有的） */
export async function busyIds(except: string | null): Promise<Set<string>> {
  if (!hasLocks() || typeof navigator.locks.query !== 'function') return new Set();
  try {
    const q = await navigator.locks.query();
    return new Set(
      (q.held ?? [])
        .map((l) => l.name ?? '')
        .filter((n) => n.startsWith(LOCK_PREFIX))
        .map((n) => n.slice(LOCK_PREFIX.length))
        .filter((id) => id !== except),
    );
  } catch {
    return new Set();
  }
}

/* ---------- 關閉瞬間的備份（F011） ---------- */

export function journalWrite(id: string, json: string, now = Date.now()): boolean {
  if (json.length > JOURNAL_MAX) return false;
  if (lsSet(LS.journal(id), json) && lsSet(LS.journalMeta(id), JSON.stringify({ id, t: now })))
    return true;
  journalClear(id);
  return false;
}

export function journalRead(id: string): { json: string; t: number } | null {
  const json = lsGet(LS.journal(id));
  let meta: { t?: number } | null = null;
  try {
    meta = JSON.parse(lsGet(LS.journalMeta(id)) ?? 'null');
  } catch {
    meta = null;
  }
  if (json == null || !meta || !meta.t) {
    if (json != null || meta) journalClear(id);
    return null;
  }
  return { json, t: meta.t };
}

export function journalClear(id: string): void {
  lsDel(LS.journal(id));
  lsDel(LS.journalMeta(id));
}

export const rememberCurrent = (id: string): boolean => lsSet(LS.current, id);
export const lastCurrent = (): string | null => lsGet(LS.current);

/* ---------- 沒有 IndexedDB 時（F017） ---------- */

export function singleRead(): string | null {
  return lsGet(LS.single);
}

export function singleWrite(json: string): 'ok' | 'big' | 'fail' {
  if (json.length > LOCAL_MAX) return 'big';
  return lsSet(LS.single, json) ? 'ok' : 'fail';
}

/* ---------- 樣板（記在這個瀏覽器，F092） ---------- */

export function readBrowserTemplates(): unknown[] {
  const out: unknown[] = [];
  for (const key of [LS.tpl, 'trpg-bxtpl-v1']) {
    try {
      const v = JSON.parse(lsGet(key) ?? 'null');
      if (Array.isArray(v)) out.push(...v);
    } catch {
      /* 壞掉的略過 */
    }
  }
  return out;
}

export const writeBrowserTemplates = (list: unknown[]): boolean =>
  lsSet(LS.tpl, JSON.stringify(list));

/* ---------- 舊版的存檔（F018） ---------- */

export interface LegacyWork {
  /** 接收過的記號（舊版的作品 id，或只存一個作品時代的內容指紋） */
  key: string;
  title: string;
  updated: number;
  deleted?: number;
  json: string;
}

/** 舊版 IndexedDB（trpg-typeset／kv）的內容；沒有這個資料庫時不建立 */
function readLegacyIdb(): Promise<Map<string, unknown>> {
  return new Promise((resolve) => {
    const out = new Map<string, unknown>();
    if (!hasIndexedDb()) {
      resolve(out);
      return;
    }
    let q: IDBOpenDBRequest;
    try {
      q = indexedDB.open('trpg-typeset');
    } catch {
      resolve(out);
      return;
    }
    q.onupgradeneeded = () => {
      /* 沒有舊資料庫：取消建立 */
      q.transaction?.abort();
    };
    q.onerror = () => resolve(out);
    q.onblocked = () => resolve(out);
    q.onsuccess = () => {
      const db = q.result;
      try {
        if (!db.objectStoreNames.contains('kv')) {
          db.close();
          resolve(out);
          return;
        }
        const t = db.transaction('kv', 'readonly');
        const st = t.objectStore('kv');
        const cur = st.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          if (
            typeof c.key === 'string' &&
            (c.key === 'trpg-prj-index' || c.key.startsWith('trpg-prj:'))
          )
            out.set(c.key, c.value);
          c.continue();
        };
        t.oncomplete = () => {
          db.close();
          resolve(out);
        };
        t.onerror = t.onabort = () => {
          db.close();
          resolve(out);
        };
      } catch {
        db.close();
        resolve(out);
      }
    };
  });
}

/** 舊版存的作品（還沒接收過的） */
export async function legacyWorks(done: ReadonlySet<string>): Promise<LegacyWork[]> {
  const out: LegacyWork[] = [];
  const kv = await readLegacyIdb();
  let idx: { id?: string; title?: string; upd?: number; del?: number }[] = [];
  try {
    const v = kv.get('trpg-prj-index');
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    if (Array.isArray(a)) idx = a;
  } catch {
    idx = [];
  }
  for (const m of idx) {
    if (!m?.id || done.has(`idb:${m.id}`)) continue;
    const raw = kv.get(`trpg-prj:${m.id}`);
    if (typeof raw !== 'string' || !raw) continue;
    out.push({
      key: `idb:${m.id}`,
      title: String(m.title ?? ''),
      updated: +(m.upd ?? 0) || Date.now(),
      deleted: m.del ? +m.del : undefined,
      json: raw,
    });
  }
  const single = lsGet('trpg-typeset-v2');
  if (single) {
    const key = `ls:${strHash(single)}`;
    if (!done.has(key)) out.push({ key, title: '', updated: Date.now(), json: single });
  }
  return out;
}

export async function legacyDone(): Promise<Set<string>> {
  const s = await workStore();
  if (!s) return new Set();
  try {
    const v = await s('readonly', (st) => req(st.get(K_LEGACY)));
    return new Set(Array.isArray(v) ? (v as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function markLegacyDone(keys: readonly string[]): Promise<void> {
  const s = await need();
  const cur = await legacyDone();
  for (const k of keys) cur.add(k);
  await s('readwrite', (st) => req(st.put([...cur], K_LEGACY)));
}
