/**
 * 自動存檔（IndexedDB `trpg-toolkit:tool:tile-map`）：
 * - `workspace`：目前的地圖（編碼後的格子；改了 0.6 秒後寫入，離開頁面時立刻寫）。
 * - `library`：圖庫（改了就寫）。
 * 自訂圖塊的圖片在資產庫（同一個工具的另一個資料庫，依內容產生 id）。
 * 開頁時：讀圖庫、讀上次的地圖、讀好用到的圖片、清掉沒人用的舊圖片；讀完之前不寫，免得蓋掉上次的地圖。
 */
import { hasIndexedDb, idbGet, idbSet, toolDb } from '@/core/storage';
import { decodeMap, encodeMap } from '../model/codec';
import { readLibrary } from '../model/library';
import { pruneDefs } from '../model/map';
import type { TileMap } from '../model/types';
import { builtinTile } from '../tiles/builtin';
import { editorNow, libraryNow, mapNow, setEditor, TOOL_ID, useLibrary, useMap } from './store';
import { assets, loadBuiltins, preloadImages, usedImages } from './tiles';

const WORKSPACE = 'workspace';
const LIBRARY = 'library';
const SAVE_DELAY_MS = 600;

let db: ReturnType<typeof toolDb> | null = null;
const store = () => {
  db ??= toolDb(TOOL_ID);
  return db;
};

type Notify = (kind: 'restoreFailed' | 'saveFailed' | 'libraryFailed' | 'restored') => void;
let notify: Notify = () => {};
export function bindPersistNotify(fn: Notify): void {
  notify = fn;
}

/* ---------- 地圖 ---------- */

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let warned = false;

async function writeWorkspace(map: TileMap): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await idbSet(WORKSPACE, encodeMap(pruneDefs(map)), store());
    setEditor({ savedAt: Date.now(), saveError: false });
  } catch {
    setEditor({ saveError: true });
    if (!warned) {
      warned = true;
      notify('saveFailed');
    }
  }
}

export function flushWorkspace(): void {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  void writeWorkspace(mapNow());
}

function scheduleSave(): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void writeWorkspace(mapNow());
  }, SAVE_DELAY_MS);
}

/* ---------- 圖庫 ---------- */

let libTimer: ReturnType<typeof setTimeout> | null = null;
let libWarned = false;

function scheduleLibrary(): void {
  if (!started || !hasIndexedDb()) return;
  if (libTimer) clearTimeout(libTimer);
  libTimer = setTimeout(() => {
    libTimer = null;
    idbSet(LIBRARY, libraryNow(), store()).catch(() => {
      if (!libWarned) {
        libWarned = true;
        notify('libraryFailed');
      }
    });
  }, 100);
}

/** 圖庫換掉（改名、匯入、刪除…）；自動存 */
export function setLibrary(lib: ReturnType<typeof libraryNow>): void {
  useLibrary.setState({ lib });
}

/* ---------- 開頁 ---------- */

let booting: Promise<void> | null = null;

/** 開頁的整理（只做一次） */
export function bootPersistence(): Promise<void> {
  booting ??= boot();
  return booting;
}

async function boot(): Promise<void> {
  const builtins = loadBuiltins();
  let restored = false;
  if (hasIndexedDb()) {
    try {
      const raw = await idbGet<unknown>(LIBRARY, store());
      if (raw) useLibrary.setState({ lib: readLibrary(raw) });
    } catch {
      notify('libraryFailed');
    }
    try {
      const raw = await idbGet<unknown>(WORKSPACE, store());
      if (raw) {
        const map = decodeMap(raw, builtinTile);
        useMap.getState().replace(map);
        restored = true;
      }
    } catch {
      notify('restoreFailed');
    }
  }
  useMap.temporal.getState().clear();
  useLibrary.setState({ loaded: true });
  /* 畫的圖層：第一層 */
  const first = mapNow().layers[0]?.id ?? 'layer-0';
  if (!mapNow().layers.some((l) => l.id === editorNow().active))
    setEditor({ active: first, layers: [first], layerAnchor: first });
  await builtins.catch(() => undefined);
  const keep = usedImages([mapNow()]);
  await preloadImages(keep).catch(() => []);
  setEditor({ ready: true });
  started = true;
  if (restored) notify('restored');
  /* 沒人用的舊圖片（地圖、復原紀錄、圖庫都沒用到）清掉 */
  void assets.gcStale(keepImages()).catch(() => []);
  window.addEventListener('pagehide', flushWorkspace);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushWorkspace();
  });
}

/** 還有人用的圖片：目前的地圖、復原／重做紀錄裡的地圖、圖庫 */
export function keepImages(): Set<string> {
  const t = useMap.temporal.getState();
  const maps = [
    mapNow(),
    ...t.pastStates.map((s) => s.data),
    ...t.futureStates.map((s) => s.data),
  ].filter((m): m is TileMap => !!m);
  return usedImages(maps);
}

useMap.subscribe((s, prev) => {
  if (s.data !== prev.data) scheduleSave();
});
useLibrary.subscribe((s, prev) => {
  if (s.lib !== prev.lib) scheduleLibrary();
});
