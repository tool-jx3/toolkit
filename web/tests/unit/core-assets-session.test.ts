/**
 * core/assets 的開頁整理（gcStale）：只清以前留下、沒人用的圖；這次開頁寫進（add、put、importAssetFiles）或讀過的圖
 * 一律不刪——工具常在圖寫進資產庫之後才把 id 寫進狀態（一批讀完才一起寫、開專案檔時一張一張寫完才換狀態）。
 * 一般的 gc（使用中釋放刪掉的圖）行為不變。
 *
 * Node 沒有 IndexedDB：換成假的圖片庫（同一個工具 id 的資料在不同的 createAssetStore 之間共用＝重新整理之前存的），
 * 寫入可以卡住（模擬很慢的儲存空間），讓整理在一批寫到一半時發生。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetIdFor, createAssetStore, importAssetFiles } from '@/core/assets';

const disk = vi.hoisted(() => ({
  dbs: new Map<string, Map<string, Blob>>(),
  /** 寫入前等這個（預設不等）；測試換掉它來卡住某一張的寫入 */
  beforeWrite: (_key: string): Promise<void> => Promise.resolve(),
  /** 已經開始寫入（還在等 beforeWrite）的 key */
  started: [] as string[],
}));

vi.mock('@/core/image', async (orig) => {
  const real = await orig<typeof import('@/core/image')>();
  const fakeStore = (toolId: string, name = 'images') => {
    const key = `${toolId}:${name}`;
    const db = () => {
      const m = disk.dbs.get(key) ?? new Map<string, Blob>();
      disk.dbs.set(key, m);
      return m;
    };
    const put = async (k: string, v: Blob | string) => {
      disk.started.push(k);
      await disk.beforeWrite(k);
      db().set(k, v as Blob);
      return { ok: true as const };
    };
    return {
      put,
      save: async (k: string, v: Blob | string) => (await put(k, v)).ok,
      load: async (k: string) => db().get(k),
      remove: async (k: string) => void db().delete(k),
      keys: async () => [...db().keys()],
      clear: async () => db().clear(),
    };
  };
  return { ...real, createImageStore: fakeStore };
});

const blob = (s: string) => new Blob([s], { type: 'image/png' });
const idOf = async (s: string) => assetIdFor(new TextEncoder().encode(s));
const stored = (tool: string) => [...(disk.dbs.get(`${tool}:assets`)?.keys() ?? [])].sort();
const sorted = (ids: string[]) => [...ids].sort();

/** 卡住某些 key 的寫入，直到 release(key) */
function holdWrites(keys: string[]) {
  const gates = new Map<string, () => void>();
  disk.beforeWrite = (k) =>
    keys.includes(k) ? new Promise<void>((res) => gates.set(k, res)) : Promise.resolve();
  return {
    release: (k: string) => gates.get(k)?.(),
    waiting: (k: string) => gates.has(k),
  };
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 1));
  expect(cond()).toBe(true);
};

/** 上一次開頁留下的圖（另一個 createAssetStore 寫進同一個假的圖片庫） */
async function previousSession(tool: string, contents: string[]): Promise<string[]> {
  const before = createAssetStore(tool);
  const ids: string[] = [];
  for (const c of contents) ids.push((await before.add(blob(c))).id);
  return ids;
}

beforeEach(() => {
  disk.dbs.clear();
  disk.beforeWrite = () => Promise.resolve();
  disk.started.length = 0;
});

describe('core/assets：開頁的整理（gcStale）', () => {
  it('以前留下、沒人用的照常刪；keep 裡的留著', async () => {
    const [old1, old2, used] = await previousSession('t-stale', ['old1', 'old2', 'used']);
    const assets = createAssetStore('t-stale');
    expect(sorted(await assets.gcStale([used]))).toEqual(sorted([old1, old2]));
    expect(stored('t-stale')).toEqual([used]);
  });

  it('一批裡先寫完、還沒寫進狀態的圖不刪；一般的 gc（使用中釋放）照舊會刪', async () => {
    const [old] = await previousSession('t-batch', ['old']);
    const assets = createAssetStore('t-batch');
    /* 一批的第 1 張已經寫完（gc 開始前），工具還沒寫進狀態；keep 是空的 */
    const { id: first } = await assets.add(blob('first'));
    expect(await assets.gcStale([])).toEqual([old]);
    expect(stored('t-batch')).toEqual([first]);
    expect(assets.has(first)).toBe(true);
    /* 一般的 gc：沒人用就刪（重設、開了別的專案檔之後釋放） */
    expect(await assets.gc([])).toEqual([first]);
    expect(stored('t-batch')).toEqual([]);
  });

  it('importAssetFiles 寫到一半時整理：第 1 張已寫完、第 2 張寫入中、第 3 張還沒寫，全部留著', async () => {
    const [old] = await previousSession('t-import', ['old']);
    const assets = createAssetStore('t-import');
    const ids = await Promise.all(['p1', 'p2', 'p3'].map(idOf));
    const files: [string, Uint8Array][] = ['p1', 'p2', 'p3'].map((s, i) => [
      `files/${ids[i]}.png`,
      new TextEncoder().encode(s),
    ]);
    const gate = holdWrites([ids[1]]);
    const importing = importAssetFiles(assets, files);
    await until(() => gate.waiting(ids[1]));
    expect(stored('t-import')).toEqual(sorted([old, ids[0]]));
    const removed = await assets.gcStale([]);
    gate.release(ids[1]);
    const r = await importing;
    expect(r.ids).toEqual(ids);
    expect(removed).toEqual([old]);
    expect(stored('t-import')).toEqual(sorted(ids));
  });

  it('這次開頁讀過的圖（例如專案檔用到、這個瀏覽器本來就有）不刪；同一張圖再 add 一次也算', async () => {
    const [read, again, stale] = await previousSession('t-read', ['read', 'again', 'stale']);
    const assets = createAssetStore('t-read');
    expect(await assets.get(read)).toBeTruthy();
    /* 先讀過（記憶體與 IndexedDB 都有）再 add 同一張：不必再寫，也算這次開頁用過 */
    await assets.preload([again]);
    expect((await assets.add(blob('again'))).id).toBe(again);
    expect(await assets.gcStale([])).toEqual([stale]);
    expect(stored('t-read')).toEqual(sorted([read, again]));
  });

  it('一般的 gc 照舊：寫入中、gc 開始之後才寫的不刪；開始前就寫完、沒人用的刪掉', async () => {
    const [old] = await previousSession('t-gc', ['old']);
    const assets = createAssetStore('t-gc');
    const { id: done } = await assets.add(blob('done'));
    const writingId = await idOf('writing');
    const gate = holdWrites([writingId]);
    const writing = assets.add(blob('writing'));
    await until(() => gate.waiting(writingId));
    const removed = await assets.gc([]);
    gate.release(writingId);
    await writing;
    expect(sorted(removed)).toEqual(sorted([old, done]));
    expect(stored('t-gc')).toEqual([writingId]);
  });
});
