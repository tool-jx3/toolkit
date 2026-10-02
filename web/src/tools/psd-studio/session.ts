/**
 * 作業內容的存檔與還原（F104～F106；第 7 節裁定：原 ZIP、播放次數、壓縮選項一起存）。
 *
 * - 自動存檔：IndexedDB（`trpg-toolkit:tool:psd-studio`）：`session`（JSON）、每張圖片（沒改過的 ZIP 素材不另存，從 ZIP 取）、
 *   原 ZIP、PSD 圖層的遮色片縮圖。整體調色、匯出選項在 localStorage（store.ts 的設定）。
 * - 專案檔（專案選單）：同一份 JSON＋附加檔案。
 */
import { readRoomZip } from '@/ccfolia';
import { unzipFiles } from '@/core/files';
import {
  hasIndexedDb,
  idbDel,
  idbGet,
  idbKeys,
  idbSet,
  toolDb,
  type UseStore,
} from '@/core/storage';
import { sanitizeAdjust } from './adjust';
import type { Thumb } from './process';
import {
  type Asset,
  type Camera,
  DEFAULT_CAMERA,
  type Mode,
  type PsdLayerMeta,
  type SourceZip,
  TOOL_ID,
  type ViewTab,
  type Workspace,
} from './store';
import { getThumbSource } from './thumbs';

export const SESSION_KEY = 'session';
export const ZIP_FILE = 'source.zip';
export const SESSION_VERSION = 1;

export interface SavedAsset {
  id: string;
  name: string;
  label: string;
  inZip: boolean;
  zipIntact: boolean;
  width: number;
  height: number;
  apng: boolean;
  frames: number;
  delays: number[];
  plays: number;
  layer: PsdLayerMeta | null;
  visible: boolean;
  solo: boolean;
  adjust: unknown;
  loopMode: Asset['loopMode'];
  loopCount: number;
  rev: number;
  /** 圖片的檔名（沒改過的 ZIP 素材是 null，從原 ZIP 取） */
  file: string | null;
  /** 遮色片縮圖（PSD 圖層有遮色片時） */
  mask: { file: string; width: number; height: number } | null;
}

export interface SavedSession {
  version: number;
  mode: Mode;
  origin: string | null;
  roomJson: unknown;
  psd: { width: number; height: number } | null;
  selectedId: string | null;
  tab: ViewTab;
  camera: Camera;
  /** 有原 ZIP（`source.zip`） */
  hasZip: boolean;
  dataPath: string | null;
  assets: SavedAsset[];
  savedAt: number;
}

export interface SessionFile {
  name: string;
  data: Uint8Array;
}

const imageFile = (a: Asset) => `img-${a.id}-${a.rev}.bin`;
const maskFile = (a: Asset) => `mask-${a.id}-${a.rev}.bin`;

/** 作業 → 要存的 JSON 與檔案 */
export function serializeWorkspace(w: Workspace): { session: SavedSession; files: SessionFile[] } {
  const files: SessionFile[] = [];
  const assets: SavedAsset[] = w.assets.map((a) => {
    const file = a.inZip && a.zipIntact && w.zip ? null : imageFile(a);
    if (file) files.push({ name: file, data: a.bytes });
    let mask: SavedAsset['mask'] = null;
    const masked = a.layer ? getThumbSource(a.id)?.masked : null;
    if (masked) {
      mask = { file: maskFile(a), width: masked.width, height: masked.height };
      files.push({
        name: mask.file,
        data: new Uint8Array(masked.rgba.buffer, masked.rgba.byteOffset, masked.rgba.byteLength),
      });
    }
    return {
      id: a.id,
      name: a.name,
      label: a.label,
      inZip: a.inZip,
      zipIntact: a.zipIntact,
      width: a.width,
      height: a.height,
      apng: a.apng,
      frames: a.frames,
      delays: a.delays,
      plays: a.plays,
      layer: a.layer,
      visible: a.visible,
      solo: a.solo,
      adjust: a.adjust,
      loopMode: a.loopMode,
      loopCount: a.loopCount,
      rev: a.rev,
      file,
      mask,
    };
  });
  if (w.zip) files.push({ name: ZIP_FILE, data: w.zip.bytes });
  return {
    session: {
      version: SESSION_VERSION,
      mode: w.mode,
      origin: w.origin,
      roomJson: w.roomJson,
      psd: w.psd,
      selectedId: w.selectedId,
      tab: w.tab,
      camera: w.camera,
      hasZip: !!w.zip,
      dataPath: w.zip?.dataPath ?? null,
      assets,
      savedAt: Date.now(),
    },
    files,
  };
}

export function isSavedSession(v: unknown): v is SavedSession {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as SavedSession).assets) &&
    typeof (v as SavedSession).mode === 'string'
  );
}

export interface RestoredWorkspace {
  workspace: Partial<Workspace>;
  /** 每張的遮色片縮圖 */
  masks: Map<string, Thumb>;
  /** 讀不到圖片而略過的素材名 */
  missing: string[];
}

const MODES: readonly Mode[] = ['idle', 'image', 'psd', 'room'];

/** 存檔 → 作業（圖片由 getFile 取；原 ZIP 解開後供沒改過的素材使用） */
export async function deserializeWorkspace(
  s: SavedSession,
  getFile: (name: string) => Promise<Uint8Array | undefined>,
): Promise<RestoredWorkspace> {
  let zip: SourceZip | null = null;
  if (s.hasZip) {
    const bytes = await getFile(ZIP_FILE);
    if (bytes) {
      try {
        const read = readRoomZip(bytes);
        zip = { bytes, entries: read.entries, dataPath: read.dataPath, json: read.json };
      } catch {
        try {
          zip = {
            bytes,
            entries: unzipFiles(bytes, { directories: true }),
            dataPath: null,
            json: null,
          };
        } catch {
          zip = null;
        }
      }
    }
  }
  const entries = new Map(zip?.entries.map((e) => [e.name, e.data]) ?? []);
  const assets: Asset[] = [];
  const masks = new Map<string, Thumb>();
  const missing: string[] = [];
  for (const a of s.assets) {
    const bytes = a.file ? await getFile(a.file) : entries.get(a.name);
    if (!bytes) {
      missing.push(a.name);
      continue;
    }
    if (a.mask) {
      const m = await getFile(a.mask.file);
      if (m && m.length === a.mask.width * a.mask.height * 4) {
        masks.set(a.id, {
          width: a.mask.width,
          height: a.mask.height,
          rgba: new Uint8ClampedArray(m),
        });
      }
    }
    assets.push({
      id: a.id,
      name: a.name,
      label: a.label,
      inZip: !!a.inZip,
      zipIntact: !!a.zipIntact && !a.file,
      bytes,
      width: a.width,
      height: a.height,
      apng: !!a.apng,
      frames: a.frames,
      delays: Array.isArray(a.delays) ? a.delays : [],
      plays: a.plays ?? 0,
      layer: a.layer ?? null,
      visible: a.visible !== false,
      solo: !!a.solo,
      adjust: a.adjust ? sanitizeAdjust(a.adjust, 'asset') : null,
      loopMode: a.loopMode ?? 'global',
      loopCount: a.loopCount ?? 1,
      rev: a.rev ?? 0,
    });
  }
  const mode = MODES.includes(s.mode) ? s.mode : 'image';
  return {
    workspace: {
      mode: assets.length ? mode : 'idle',
      assets,
      origin: s.origin ?? null,
      zip,
      roomJson: s.roomJson ?? zip?.json ?? null,
      psd: s.psd ?? null,
      selectedId: assets.some((a) => a.id === s.selectedId) ? s.selectedId : null,
      tab: mode === 'image' ? 'list' : (s.tab ?? 'layout'),
      camera: s.camera ?? { ...DEFAULT_CAMERA },
    },
    masks,
    missing,
  };
}

/* ---------- IndexedDB ---------- */

let db: UseStore | null = null;
const store = (): UseStore | null => {
  if (!hasIndexedDb()) return null;
  db ??= toolDb(TOOL_ID);
  return db;
};

/** 已經寫進 IndexedDB 的檔案（同名的不重寫；檔名含素材版本） */
let written: Set<string> | null = null;

export async function saveSession(w: Workspace): Promise<boolean> {
  const s = store();
  if (!s) return false;
  const { session, files } = serializeWorkspace(w);
  written ??= new Set((await idbKeys(s)).map(String));
  for (const f of files) {
    if (written.has(f.name)) continue;
    await idbSet(f.name, f.data, s);
    written.add(f.name);
  }
  await idbSet(SESSION_KEY, session, s);
  const keep = new Set([SESSION_KEY, ...files.map((f) => f.name)]);
  for (const k of [...written]) {
    if (keep.has(k)) continue;
    await idbDel(k, s);
    written.delete(k);
  }
  return true;
}

export async function loadSavedSession(): Promise<SavedSession | null> {
  const s = store();
  if (!s) return null;
  try {
    const v = await idbGet<unknown>(SESSION_KEY, s);
    return isSavedSession(v) && v.assets.length ? v : null;
  } catch {
    return null;
  }
}

export async function readSavedFile(name: string): Promise<Uint8Array | undefined> {
  const s = store();
  if (!s) return undefined;
  const v = await idbGet<Uint8Array>(name, s);
  return v instanceof Uint8Array ? v : undefined;
}

/** F106：刪除自動存檔 */
export async function clearSavedSession(): Promise<void> {
  const s = store();
  if (!s) return;
  const keys = await idbKeys(s);
  for (const k of keys) await idbDel(k, s);
  written = new Set();
}
