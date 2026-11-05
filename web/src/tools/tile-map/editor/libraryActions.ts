/**
 * 圖庫的動作：新增／改名／刪除圖塊組、刪除單一次匯入、收起內建的圖塊組、匯入圖塊、備份與讀入備份。
 * 圖庫是所有地圖共用的，不列入地圖的復原；刪除前一律確認。已經放在地圖上的圖塊不受影響（地圖記著定義）。
 */
import { downloadBytes, readAsBytes, unzipFiles, zipFiles } from '@/core/files';
import { CodecError } from '../model/codec';
import {
  addImport,
  createSet,
  deleteImport,
  deleteSet,
  type Library,
  LibraryError,
  libraryImages,
  MAX_LIBRARY_TILES,
  MAX_SETS,
  mergeLibrary,
  readLibrary,
  renameSet,
  setHidden,
} from '../model/library';
import type { TileDef } from '../model/types';
import { S } from '../strings';
import { isBuiltinSet } from '../tiles/builtin';
import { confirmUi, notify } from './actions';
import { setLibrary } from './persist';
import { libraryNow, setEditor, usePrefs } from './store';
import { assets, forgetMissing } from './tiles';

export const LIBRARY_FORMAT = 'trpg-toolkit-tile-library';
export const LIBRARY_VERSION = 1;

function libraryErrorText(e: unknown): string {
  if (e instanceof LibraryError) {
    if (e.code === 'sets-max') return S.sets.setsMax(MAX_SETS);
    if (e.code === 'tiles-max') return S.sets.tilesMax(MAX_LIBRARY_TILES);
    if (e.code === 'name') return S.msg.nameBad;
    if (e.code === 'empty') return S.imp.noVisible;
  }
  return S.exp.failed;
}

function tryLib(fn: (lib: Library) => Library): boolean {
  try {
    setLibrary(fn(libraryNow()));
    return true;
  } catch (e) {
    notify(libraryErrorText(e), 'warning');
    return false;
  }
}

/** 名字不重複：「我的圖塊」「我的圖塊 2」… */
export function freshSetName(base: string = S.sets.newName): string {
  const names = new Set(libraryNow().sets.map((s) => s.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function newSet(name: string): string | null {
  try {
    const r = createSet(libraryNow(), name);
    setLibrary(r.lib);
    return r.id;
  } catch (e) {
    notify(libraryErrorText(e), 'warning');
    return null;
  }
}

export const renameSetTo = (id: string, name: string) =>
  tryLib((lib) => renameSet(lib, id, name, isBuiltinSet(id)));

export const showBuiltin = (id: string, show: boolean) =>
  tryLib((lib) => setHidden(lib, id, !show));

export async function removeImport(setId: string, importId: string): Promise<void> {
  const set = libraryNow().sets.find((s) => s.id === setId);
  const imp = set?.imports.find((i) => i.id === importId);
  if (!set || !imp) return;
  const ok = await confirmUi({
    title: S.sets.removeImportTitle,
    description: S.sets.removeImportDesc(imp.name, set.name),
    confirmLabel: S.sets.removeImport(imp.name),
    danger: true,
  });
  if (ok) tryLib((lib) => deleteImport(lib, setId, importId));
}

export async function removeSet(setId: string): Promise<void> {
  const set = libraryNow().sets.find((s) => s.id === setId);
  if (!set) return;
  const ok = await confirmUi({
    title: S.sets.deleteSetTitle,
    description: S.sets.deleteSetDesc(set.name),
    confirmLabel: S.sets.deleteSet,
    danger: true,
  });
  if (!ok) return;
  if (tryLib((lib) => deleteSet(lib, setId))) {
    setEditor({ managed: null });
    const p = usePrefs.getState();
    if (p.data.set === setId) p.patch({ set: 'all', cat: 'all' });
  }
}

/** 匯入：圖片放進資產庫、定義加進圖庫；回傳新的圖塊（失敗時 null） */
export async function importTiles(
  setId: string,
  importName: string,
  images: readonly { blob: Blob; tiles: Omit<TileDef, 'id' | 'set' | 'src'>[] }[],
): Promise<TileDef[] | null> {
  const defs: Omit<TileDef, 'id' | 'set'>[] = [];
  let unsaved = false;
  for (const img of images) {
    if (!img.tiles.length) continue;
    const r = await assets.add(img.blob);
    forgetMissing(r.id);
    if (!r.persisted) unsaved = true;
    for (const t of img.tiles) defs.push({ ...t, src: r.id });
  }
  try {
    const r = addImport(libraryNow(), setId, importName, defs);
    setLibrary(r.lib);
    if (unsaved) notify(S.imp.saveFailed, 'warning', { duration: 8000 });
    return r.tiles;
  } catch (e) {
    notify(libraryErrorText(e), 'warning');
    return null;
  }
}

/* ---------- 備份 ---------- */

export async function backupLibrary(): Promise<void> {
  const lib = libraryNow();
  if (
    !lib.sets.length &&
    !Object.keys(lib.order).length &&
    !lib.hidden.length &&
    !Object.keys(lib.names).length
  ) {
    notify(S.sets.backupEmpty, 'info');
    return;
  }
  const files = await assets.exportFiles(libraryImages(lib));
  const json = JSON.stringify({ format: LIBRARY_FORMAT, version: LIBRARY_VERSION, library: lib });
  const bytes = zipFiles([
    { name: 'library.json', data: json },
    ...files.map((f) => ({ name: `files/${f.name}`, data: f.data, level: 0 as const })),
  ]);
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const name = `${S.sets.backupName}_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.zip`;
  downloadBytes(bytes, name, 'application/zip');
  notify(S.msg.saved(name), 'success');
}

/** 讀入備份（ZIP：library.json＋files/<資產 id>.<副檔名>）；回傳加了幾個圖塊，讀不進來時 null */
export async function restoreLibrary(file: File): Promise<number | null> {
  try {
    const bytes = await readAsBytes(file);
    const entries = unzipFiles(bytes);
    const json = entries.find((e) => e.name === 'library.json');
    if (!json) throw new CodecError('library');
    const raw = JSON.parse(new TextDecoder().decode(json.data)) as {
      format?: unknown;
      version?: unknown;
      library?: unknown;
    };
    if (
      raw.format !== LIBRARY_FORMAT ||
      typeof raw.version !== 'number' ||
      raw.version > LIBRARY_VERSION
    )
      throw new CodecError('library');
    const incoming = readLibrary(raw.library);
    const need = libraryImages(incoming);
    for (const e of entries) {
      const m = /^files\/([^/.]+)\.[a-z0-9]+$/i.exec(e.name);
      if (!m || !need.has(m[1])) continue;
      await assets.put(m[1], new Blob([e.data as Uint8Array<ArrayBuffer>]));
      forgetMissing(m[1]);
    }
    const r = mergeLibrary(libraryNow(), incoming);
    setLibrary(r.lib);
    notify(S.sets.restored(r.added), 'success');
    return r.added;
  } catch {
    notify(S.sets.restoreFailed, 'danger');
    return null;
  }
}
