/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 版本快照（F015；原作的 snapTake、snapMaybeAuto、snapPrune、snapRestore、snapPickSheet、snapRename、snapDelete、
 * snapExportAll、snapImportZip）：整份專案的存底，存在這個瀏覽器的 IndexedDB（獨立的資料庫，不進專案檔、不在復原裡）。
 * - 自動：自動儲存寫入成功之後，這段期間有改動、距最新一份 10 分鐘以上、專案不是空的＝拍一份。
 * - 手動（可以命名；有名字＝永久）；稀疏化只動自動快照：近 10 份＋往前每日一份 × 7＋每週一份 × 4（原作的 snapPrune）。
 * - 快照裡的圖另存一份（以資產 id 為鍵、多份共用），不受資產回收影響；還原時放回資產庫（7.4 第 15 項）。
 * - 還原整份：先拍一份「還原前」，還原本身可以復原；取回單一分頁＝加成新分頁。
 * - 匯出全部／匯入備份：ZIP。讀得進原作「匯出全部」的備份（原作自動存檔的格式；當成手動快照，還原時走讀原作檔的路徑）。
 */
import { create } from 'zustand';
import { unzipFiles, zipFiles } from '@/core/files';
import {
  hasIndexedDb,
  idbDel,
  idbGet,
  idbKeys,
  idbSet,
  idbStore,
  type UseStore,
} from '@/core/storage';
import { sheetName } from '../engine/geom';
import { normalizeProject, projectAssetIds } from '../model/normalize';
import { allChars, relLists } from '../model/timeline';
import type { Project, Sheet } from '../model/types';
import { importSheetFrom } from './actions';
import { dataUriBytes, importLegacy, replaceProject } from './project';
import { assets, projectNow, setUi, syncProject, updateProject, useProject, useUi } from './store';

/** 自動快照的間隔（原作的 SNAP_AUTO_MS） */
export const SNAP_AUTO_MS = 10 * 60 * 1000;
const NAME_MAX = 80;
const DAY = 86400000;

export interface SnapMeta {
  id: string;
  /** 名字（空白＝自動快照／手動快照；「還原前」是自動類、有名字） */
  name: string;
  auto: boolean;
  savedAt: number;
  summary: { sheets: number; chars: number };
  /** 拍照當下的分頁名 */
  sheetNames: string[];
  /** 用到的圖：本站＝資產 id；原作的快照＝原作的雜湊 */
  imgs: string[];
  /** 資料的字元數（原作的 bytes） */
  bytes: number;
  /** 原作「匯出全部」匯入的（資料是原作自動存檔的格式） */
  legacy?: boolean;
}

interface SnapRec extends SnapMeta {
  data: unknown;
}

export interface SnapState {
  /** 新 → 舊；null＝還沒載入 */
  list: SnapMeta[] | null;
  /** 最近一次寫入失敗（成功就清掉） */
  fail: null | 'quota' | 'other';
}

export const useSnaps = create<SnapState>(() => ({ list: null, fail: null }));

let db: UseStore | null = null;
/** 快照自己的資料庫（和自動儲存、資產庫分開：清資產不會弄壞快照） */
const store = (): UseStore => {
  if (!db) db = idbStore('tool:relation-chart:snapshots');
  return db;
};
const KEY_INDEX = 'index';
const recKey = (id: string) => `snap:${id}`;
const imgKey = (id: string) => `img:${id}`;
const legacyImgKey = (h: string) => `limg:${h}`;

export const snapsAvailable = (): boolean => hasIndexedDb();

/** 顯示名：名字 → 「手動快照」／「自動快照」（原作沒名字的手動快照也寫「自動快照」，7.4 第 15 項改正） */
export const snapLabel = (
  m: Pick<SnapMeta, 'name' | 'auto'>,
  S: { auto: string; manual: string },
) => m.name || (m.auto ? S.auto : S.manual);

/* ---------- 稀疏化（純函式；用假時間測） ---------- */

/** 本地日曆日（原作的 dayOf） */
const dayOf = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
/** 週＝時間戳整除 7 天（原作的 weekOf；和日的基準不同，照做才會留下同一批） */
const weekOf = (ts: number) => Math.floor(ts / (7 * DAY));

/** 稀疏化之後留下的（只動自動快照：近 10 份＋近 10 份沒涵蓋的日子各一份 × 7＋週各一份 × 4） */
export function pruneSnaps<T extends Pick<SnapMeta, 'id' | 'auto' | 'savedAt'>>(
  list: readonly T[],
): T[] {
  const autos = list.filter((e) => e.auto).sort((a, b) => b.savedAt - a.savedAt);
  const keep = new Set(autos.slice(0, 10).map((e) => e.id));
  const dayRep = new Set<string>();
  const weekRep = new Set<number>();
  for (const e of autos.slice(0, 10)) {
    dayRep.add(dayOf(e.savedAt));
    weekRep.add(weekOf(e.savedAt));
  }
  let dayBudget = 7;
  let weekBudget = 4;
  for (const e of autos.slice(10)) {
    const dk = dayOf(e.savedAt);
    if (dayBudget > 0 && !dayRep.has(dk)) {
      dayRep.add(dk);
      weekRep.add(weekOf(e.savedAt));
      keep.add(e.id);
      dayBudget--;
    }
  }
  for (const e of autos.slice(10)) {
    if (keep.has(e.id)) continue;
    const wk = weekOf(e.savedAt);
    if (weekBudget > 0 && !weekRep.has(wk)) {
      weekRep.add(wk);
      keep.add(e.id);
      weekBudget--;
    }
  }
  return list.filter((e) => !e.auto || keep.has(e.id));
}

/* ---------- 索引 ---------- */

let loading: Promise<SnapMeta[]> | null = null;

export async function loadSnaps(): Promise<SnapMeta[]> {
  const cur = useSnaps.getState().list;
  if (cur) return cur;
  if (!snapsAvailable()) {
    useSnaps.setState({ list: [] });
    return [];
  }
  if (!loading)
    loading = (async () => {
      let list: SnapMeta[] = [];
      try {
        const ix = await idbGet<SnapMeta[]>(KEY_INDEX, store());
        if (Array.isArray(ix)) list = ix;
      } catch {
        list = [];
      }
      useSnaps.setState({ list });
      return list;
    })();
  return await loading;
}

async function saveIndex(list: SnapMeta[]): Promise<void> {
  useSnaps.setState({ list: [...list] });
  await idbSet(KEY_INDEX, list, store());
}

/** 沒有任何快照引用的圖刪掉 */
async function gcImages(list: readonly SnapMeta[]): Promise<void> {
  try {
    const own = new Set(list.filter((e) => !e.legacy).flatMap((e) => e.imgs));
    const old = new Set(list.filter((e) => e.legacy).flatMap((e) => e.imgs));
    for (const k of await idbKeys(store())) {
      const key = String(k);
      if (key.startsWith('img:') && !own.has(key.slice(4))) await idbDel(key, store());
      else if (key.startsWith('limg:') && !old.has(key.slice(5))) await idbDel(key, store());
    }
  } catch {
    /* 回收失敗不影響快照 */
  }
}

async function pruneAndSave(list: SnapMeta[]): Promise<void> {
  const kept = pruneSnaps(list);
  const keepIds = new Set(kept.map((e) => e.id));
  for (const e of list) if (!keepIds.has(e.id)) await idbDel(recKey(e.id), store()).catch(() => {});
  await saveIndex(kept);
  await gcImages(kept);
}

/* ---------- 拍照 ---------- */

let busy = false;
let dirty = false;
/* 專案有改動（含不記復原的切影格）＝下一次自動儲存成功後可以拍 */
useProject.subscribe((s, prev) => {
  if (s.data !== prev.data) dirty = true;
});

/** 專案不是空的（任一分頁的任一格有角色或關係、或有便利貼、或角色庫非空；原作的 snapProjectNonEmpty） */
export function projectNonEmpty(p: Project): boolean {
  return (
    p.sheets.some(
      (s) => allChars(s).length || relLists(s).some((l) => l.length) || s.notes.length,
    ) || p.library.length > 0
  );
}

const newId = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

/** 拍一份快照（回傳成功與否；失敗會記在 useSnaps 的 fail） */
export async function takeSnapshot(name: string, auto: boolean): Promise<boolean> {
  if (!snapsAvailable() || busy) return false;
  busy = true;
  try {
    syncProject();
    const p = JSON.parse(JSON.stringify(projectNow())) as Project;
    const list = [...(await loadSnaps())];
    const imgs = projectAssetIds(p);
    const have = new Set(list.filter((e) => !e.legacy).flatMap((e) => e.imgs));
    for (const id of imgs) {
      if (have.has(id)) continue;
      const b = await assets.get(id).catch(() => undefined);
      if (b) await idbSet(imgKey(id), b, store());
    }
    const meta: SnapMeta = {
      id: newId(),
      name: name.trim().slice(0, NAME_MAX),
      auto,
      savedAt: Date.now(),
      summary: { sheets: p.sheets.length, chars: p.sheets.reduce((n, s) => n + s.chars.length, 0) },
      sheetNames: p.sheets.map((s) => sheetName(s)),
      imgs,
      bytes: JSON.stringify(p).length,
    };
    await idbSet(recKey(meta.id), { ...meta, data: p } satisfies SnapRec, store());
    list.unshift(meta);
    dirty = false;
    await pruneAndSave(list);
    useSnaps.setState({ fail: null });
    return true;
  } catch (e) {
    const quota =
      !!e &&
      ((e as { name?: string }).name === 'QuotaExceededError' ||
        /quota|storage/i.test(String((e as { message?: string }).message ?? e)));
    useSnaps.setState({ fail: quota ? 'quota' : 'other' });
    return false;
  } finally {
    busy = false;
  }
}

/** 自動儲存寫入成功之後呼叫（原作的 snapMaybeAuto）；拍了回傳 true */
export async function maybeAutoSnapshot(now = Date.now()): Promise<boolean> {
  const list = useSnaps.getState().list;
  if (!dirty || busy || !list) return false;
  const latest = list.reduce((m, e) => Math.max(m, e.savedAt), 0);
  if (now - latest < SNAP_AUTO_MS) return false;
  if (!projectNonEmpty(projectNow())) return false;
  return await takeSnapshot('', true);
}

/* ---------- 還原、取回、命名、刪除 ---------- */

async function readRec(id: string): Promise<SnapRec | null> {
  try {
    const r = await idbGet<SnapRec>(recKey(id), store());
    return r?.data ? r : null;
  } catch {
    return null;
  }
}

/** 快照的圖放回資產庫（資產庫已經有的不動） */
async function putImages(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const has = await assets.get(id).catch(() => undefined);
    if (has) continue;
    const b = await idbGet<Blob>(imgKey(id), store()).catch(() => undefined);
    if (b) await assets.put(id, b).catch(() => {});
  }
}

/** 原作的快照：圖的參照（@@snapimg:雜湊）換回 data URI */
async function legacyData(rec: SnapRec): Promise<Record<string, unknown>> {
  const data = JSON.parse(JSON.stringify(rec.data)) as Record<string, unknown>;
  const map = new Map<string, string>();
  for (const h of rec.imgs) {
    const u = await idbGet<string>(legacyImgKey(h), store()).catch(() => undefined);
    if (typeof u === 'string') map.set(h, u);
  }
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string' && v.startsWith('@@snapimg:')) {
        const u = map.get(v.slice(10));
        if (u) o[k] = u;
      } else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(data);
  return data;
}

/** 原作的快照：圖放回去之後的資料（原作自動存檔的格式；測試用） */
export async function legacySnapshotData(id: string): Promise<Record<string, unknown> | null> {
  const rec = await readRec(id);
  return rec?.legacy ? await legacyData(rec) : null;
}

export type SnapResult = 'ok' | 'gone' | 'fail';

/** 還原整份專案：先拍「還原前」，還原本身可以復原（7.4 第 15 項） */
export async function restoreSnapshot(id: string, preName: string): Promise<SnapResult> {
  const rec = await readRec(id);
  if (!rec) return 'gone';
  await takeSnapshot(preName, true);
  try {
    if (rec.legacy) {
      const data = await legacyData(rec);
      await importLegacy({ data, files: new Map(), base: '', zip: true }, 'replace', {
        keepSheetLib: true,
      });
    } else {
      await putImages(rec.imgs);
      const p = normalizeProject(rec.data);
      if (!p) return 'fail';
      replaceProject(p);
    }
    return 'ok';
  } catch {
    return 'fail';
  }
}

/** 只取其中一個分頁（加入為新分頁並切過去；可以復原） */
export async function takeSheetFromSnapshot(id: string, idx: number): Promise<SnapResult> {
  const rec = await readRec(id);
  if (!rec) return 'gone';
  try {
    if (rec.legacy) {
      const data = await legacyData(rec);
      await importLegacy({ data, files: new Map(), base: '', zip: true }, 'append', { only: idx });
      return 'ok';
    }
    await putImages(rec.imgs);
    const src = normalizeProject(rec.data);
    const sheet = src?.sheets[idx];
    if (!src || !sheet) return 'fail';
    updateProject((p) => {
      p.active = importSheetFrom(p, JSON.parse(JSON.stringify(sheet)) as Sheet, src);
    });
    const u = useUi.getState();
    setUi({ sel: [], focus: null, hover: null, link: null, panel: null, fitTick: u.fitTick + 1 });
    return 'ok';
  } catch {
    return 'fail';
  }
}

/** 命名（最多 80 字；有名字＝轉成永久；清空不會降回自動，原作） */
export async function renameSnapshot(id: string, name: string): Promise<void> {
  const list = [...(await loadSnaps())];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  const nm = name.trim().slice(0, NAME_MAX);
  const meta = { ...list[i], name: nm, auto: nm ? false : list[i].auto };
  list[i] = meta;
  const rec = await readRec(id);
  if (rec) await idbSet(recKey(id), { ...rec, name: meta.name, auto: meta.auto }, store());
  await saveIndex(list);
}

export async function deleteSnapshot(id: string): Promise<void> {
  const list = (await loadSnaps()).filter((e) => e.id !== id);
  await idbDel(recKey(id), store()).catch(() => {});
  await saveIndex(list);
  await gcImages(list);
}

/* ---------- 匯出、匯入 ---------- */

const MANIFEST = 'snapshots/snapshots.json';
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
};

/** 位元組 → base64 */
function base64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH)
    s += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + CH)));
  return btoa(s);
}

/**
 * 匯出全部：`snapshots/snapshots.json`（每一份的完整紀錄）＋`snapshots/images/`（本站的圖＝資產 id；
 * 原作的圖＝雜湊.bin，前綴留在 blobPrefix，同原作的格式）。沒有快照＝null。
 */
export async function exportSnapshots(): Promise<{ bytes: Uint8Array; count: number } | null> {
  const list = await loadSnaps();
  const snaps: SnapRec[] = [];
  for (const e of list) {
    const r = await readRec(e.id);
    if (r) snaps.push(r);
  }
  if (!snaps.length) return null;
  const files: { name: string; data: Uint8Array | string; level?: 0 }[] = [];
  const images: Record<string, string> = {};
  const blobPrefix: Record<string, string> = {};
  const rawBlobs: Record<string, string> = {};
  const own = new Set(snaps.filter((r) => !r.legacy).flatMap((r) => r.imgs));
  const old = new Set(snaps.filter((r) => r.legacy).flatMap((r) => r.imgs));
  for (const id of own) {
    const b = await idbGet<Blob>(imgKey(id), store()).catch(() => undefined);
    if (!b) continue;
    const path = `images/${id}.${EXT[b.type] ?? 'bin'}`;
    images[id] = path;
    files.push({
      name: `snapshots/${path}`,
      data: new Uint8Array(await b.arrayBuffer()),
      level: 0,
    });
  }
  for (const h of old) {
    const u = await idbGet<string>(legacyImgKey(h), store()).catch(() => undefined);
    if (typeof u !== 'string') continue;
    const cut = u.indexOf(';base64,');
    if (cut < 0) {
      rawBlobs[h] = u;
      continue;
    }
    blobPrefix[h] = u.slice(0, cut + 8);
    const bytes = dataUriBytes(u);
    if (bytes) files.push({ name: `snapshots/images/${h}.bin`, data: bytes, level: 0 });
  }
  files.unshift({
    name: MANIFEST,
    data: JSON.stringify({
      v: 1,
      tool: 'relation-chart',
      savedAt: Date.now(),
      snaps,
      images,
      blobPrefix,
      rawBlobs,
    }),
  });
  return { bytes: zipFiles(files), count: snaps.length };
}

/**
 * 匯入備份（疊加不覆蓋：id 已經有的跳過；匯入的一律轉成手動快照＝永久，原作）。
 * 原作「匯出全部」的 ZIP（沒有 tool 欄位）＝原作的快照。讀不出＝null。
 */
export async function importSnapshots(
  bytes: Uint8Array,
): Promise<{ added: number; skipped: number } | null> {
  let files: Map<string, Uint8Array>;
  let manifest: {
    tool?: string;
    snaps?: unknown[];
    images?: Record<string, string>;
    blobPrefix?: Record<string, string>;
    rawBlobs?: Record<string, string>;
  };
  let base = '';
  try {
    files = new Map(unzipFiles(bytes).map((f) => [f.name, f.data]));
    const hit = [...files.keys()]
      .filter((k) => /(^|\/)snapshots\.json$/i.test(k))
      .sort((a, b) => a.length - b.length)[0];
    if (!hit) return null;
    base = hit.slice(0, hit.length - 'snapshots.json'.length);
    manifest = JSON.parse(new TextDecoder().decode(files.get(hit)));
    if (!manifest || !Array.isArray(manifest.snaps)) return null;
  } catch {
    return null;
  }
  const ours = manifest.tool === 'relation-chart';
  const list = [...(await loadSnaps())];
  const haveSnap = new Set(list.map((e) => e.id));
  const haveImg = new Set(list.flatMap((e) => e.imgs.map((h) => `${e.legacy ? 'l' : ''}${h}`)));
  let added = 0;
  let skipped = 0;
  for (const raw of manifest.snaps) {
    const rec = raw as Partial<SnapRec>;
    if (!rec || typeof rec.id !== 'string' || !rec.data) {
      skipped++;
      continue;
    }
    if (haveSnap.has(rec.id)) {
      skipped++;
      continue;
    }
    const legacy = !ours || !!rec.legacy;
    const imgs = Array.isArray(rec.imgs) ? rec.imgs.filter((x) => typeof x === 'string') : [];
    for (const h of imgs) {
      const key = `${legacy ? 'l' : ''}${h}`;
      if (haveImg.has(key)) continue;
      if (legacy) {
        let u = manifest.rawBlobs?.[h];
        if (typeof u !== 'string') {
          const bin =
            files.get(`${base}images/${h.replace(/[^\w-]/g, '')}.bin`) ??
            [...files.entries()].find(([k]) => k.endsWith(`images/${h}.bin`))?.[1];
          const pre = manifest.blobPrefix?.[h];
          if (bin && pre) u = pre + base64(bin);
        }
        if (typeof u === 'string') {
          await idbSet(legacyImgKey(h), u, store());
          haveImg.add(key);
        }
      } else {
        const path = manifest.images?.[h];
        const data = path ? files.get(base + path) : undefined;
        if (data) {
          const type = /\.(\w+)$/.exec(path ?? '')?.[1];
          const mime = Object.entries(EXT).find(([, e]) => e === type)?.[0] ?? '';
          await idbSet(imgKey(h), new Blob([data as BlobPart], { type: mime }), store());
          haveImg.add(key);
        }
      }
    }
    const summary =
      rec.summary && typeof rec.summary === 'object'
        ? {
            sheets: Number(rec.summary.sheets) || 0,
            chars: Number(rec.summary.chars) || 0,
          }
        : { sheets: 0, chars: 0 };
    const meta: SnapMeta = {
      id: rec.id,
      name: typeof rec.name === 'string' ? rec.name.slice(0, NAME_MAX) : '',
      auto: false,
      savedAt: Number(rec.savedAt) || Date.now(),
      summary,
      sheetNames: Array.isArray(rec.sheetNames) ? rec.sheetNames.map(String) : [],
      imgs,
      bytes: Number(rec.bytes) || JSON.stringify(rec.data).length,
      ...(legacy ? { legacy: true } : {}),
    };
    await idbSet(recKey(meta.id), { ...meta, data: rec.data } satisfies SnapRec, store());
    list.push(meta);
    haveSnap.add(meta.id);
    added++;
  }
  list.sort((a, b) => b.savedAt - a.savedAt);
  await saveIndex(list);
  return { added, skipped };
}

/** 用量（份數、MB；資料字元數＋圖的大小的粗估，原作也是粗估） */
export function snapUsage(list: readonly SnapMeta[]): { n: number; mb: string } {
  const bytes = list.reduce((s, e) => s + (e.bytes || 0), 0);
  return { n: list.length, mb: (bytes / 1048576).toFixed(1) };
}

/** 測試用：清掉記憶體裡的索引（下次重新讀） */
export function resetSnapsForTest(): void {
  loading = null;
  dirty = false;
  busy = false;
  useSnaps.setState({ list: null, fail: null });
}
