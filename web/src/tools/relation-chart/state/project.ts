/**
 * 專案檔（共用的專案檔格式：project.json＋files/<圖片資產 id>.<副檔名>，規格 3.8）與原作的專案檔（3.9）。
 */
import { importAssetFiles } from '@/core/assets';
import { unzipFiles } from '@/core/files';
import { isZipBytes, ProjectFileError } from '@/core/storage/project';
import {
  convertLegacy,
  findProjectJson,
  isLegacyProject,
  LegacyFileError,
  legacyCropToPlacement,
  parseJsonBytes,
} from '../logic/legacy';
import { normalizeProject, projectAssetIds } from '../model/normalize';
import type { Avatar, Project, Sheet } from '../model/types';
import { S } from '../strings';
import { insertSheet } from './actions';
import { avatarFromBlob, backgroundFromBlob, renderAvatar } from './images';
import { assets, projectNow, setUi, useProject, useUi } from './store';

/* ---------- 本工具的專案檔 ---------- */

/** 存專案檔時讀不到的圖片：那些頭像、背景圖拿掉（存出來的檔開得了）。回傳要存的內容與受影響的數量 */
export function dropMissingImages(
  p: Project,
  missing: ReadonlySet<string>,
): { data: Project; dropped: number } {
  if (!missing.size) return { data: p, dropped: 0 };
  let dropped = 0;
  const sheets = p.sheets.map((s) => {
    const bg = s.bg && missing.has(s.bg) ? null : s.bg;
    if (bg !== s.bg) dropped++;
    const chars = s.chars.map((c) => {
      if (!c.avatar) return c;
      if (missing.has(c.avatar.img)) {
        dropped++;
        return { ...c, avatar: null };
      }
      if (c.avatar.src && missing.has(c.avatar.src))
        return { ...c, avatar: { ...c.avatar, src: null, place: null } };
      return c;
    });
    return { ...s, bg, chars };
  });
  return { data: { ...p, sheets }, dropped };
}

let saving: { data: Project; dropped: number } | null = null;

/** ProjectMenu 的 getFiles：收圖片，讀不到的記下來（getData 在這之後呼叫） */
export async function collectProjectFiles(): Promise<{ name: string; data: Uint8Array }[]> {
  const p = projectNow();
  const ids = projectAssetIds(p);
  const files = await assets.exportFiles(ids);
  const have = new Set(files.map((f) => f.name.replace(/\.[^.]+$/, '')));
  saving = dropMissingImages(p, new Set(ids.filter((id) => !have.has(id))));
  return files;
}

export const projectDataForSave = (): Project => saving?.data ?? projectNow();

/** 存好之後：讀不到的圖片數（並清掉暫存） */
export function takeSaveDropped(): number {
  const n = saving?.dropped ?? 0;
  saving = null;
  return n;
}

/** 讀本工具的專案檔：整理內容、圖片放進資產庫；讀不到的圖片拿掉並回報數量 */
export async function importOwnProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<{ project: Project; notSaved: boolean; dropped: number }> {
  const next = normalizeProject(data);
  if (!next) throw new ProjectFileError(S.project.unusable);
  const imported = await importAssetFiles(assets, files.entries());
  const missing = new Set<string>();
  for (const id of projectAssetIds(next)) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) missing.add(id);
  }
  const fixed = dropMissingImages(next, missing);
  return { project: fixed.data, notSaved: imported.notPersisted > 0, dropped: fixed.dropped };
}

/** 換掉整個專案（開啟專案檔、全部重設；可以復原） */
export function replaceProject(p: Project): void {
  useProject.getState().update((d) => {
    d.sheets = p.sheets;
    d.active = Math.min(Math.max(0, p.active), p.sheets.length - 1);
    d.labels = p.labels;
    d.nextId = p.nextId;
    d.font = p.font;
  });
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    panel: null,
    renaming: null,
    fitTick: useUi.getState().fitTick + 1,
  });
}

/* ---------- 原作的專案檔 ---------- */

export interface LegacyRead {
  data: Record<string, unknown>;
  /** ZIP 裡的檔案（只有 project.json 時是空的） */
  files: Map<string, Uint8Array>;
  /** project.json 所在的資料夾（ZIP 內的路徑前綴） */
  base: string;
  zip: boolean;
}

/** 讀原作的檔案（ZIP 或 project.json）；不是原作的檔時回傳 null */
export function readLegacyBytes(bytes: Uint8Array): LegacyRead | null {
  if (isZipBytes(bytes)) {
    let list: { name: string; data: Uint8Array }[];
    try {
      list = unzipFiles(bytes);
    } catch {
      return null;
    }
    const files = new Map(list.map((f) => [f.name, f.data]));
    const hit = findProjectJson(files);
    if (!hit) return null;
    let data: unknown;
    try {
      data = parseJsonBytes(files.get(hit.path) as Uint8Array);
    } catch {
      throw new LegacyFileError(S.legacy.badJson);
    }
    if (!isLegacyProject(data)) return null;
    return { data, files, base: hit.base, zip: true };
  }
  let data: unknown;
  try {
    data = parseJsonBytes(bytes);
  } catch {
    return null;
  }
  if (!isLegacyProject(data)) return null;
  return { data, files: new Map(), base: '', zip: false };
}

export interface LegacyResult {
  sheets: number;
  chars: number;
  rels: number;
  /** 找不到或讀不了的圖片 */
  failedImages: number;
  /** 只有 project.json，原本有圖片 */
  noImages: boolean;
  notSaved: boolean;
  skipped: string[];
}

const blobOf = (data: Uint8Array, name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  const type =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
          ? 'image/gif'
          : 'image/png';
  return new Blob([data as BlobPart], { type });
};

/**
 * 原作的專案 → 加入為新分頁（append）或取代目前內容（replace）。
 * 圖片：頭像成品直接用、有原圖時存原圖並換算位置；背景圖照用。
 */
export async function importLegacy(
  read: LegacyRead,
  mode: 'append' | 'replace',
): Promise<LegacyResult> {
  const conv = convertLegacy(read.data);
  let failed = 0;
  let referenced = 0;
  let notSaved = false;
  const fileAt = (path: string) => {
    const clean = path.replace(/^\.?\//, '');
    return read.files.get(read.base + clean) ?? read.files.get(clean);
  };
  const addImage = async (path: string): Promise<string | null> => {
    const data = fileAt(path);
    if (!data) return null;
    try {
      const r = await assets.add(blobOf(data, path));
      if (!r.persisted) notSaved = true;
      return r.id;
    } catch {
      return null;
    }
  };
  for (const sheet of conv.sheets) {
    const av = conv.avatars.get(sheet);
    for (const c of sheet.chars) {
      const a = av?.get(c.id);
      if (!a) continue;
      referenced++;
      let avatar: Avatar | null = null;
      const src = a.src ? await addImage(a.src) : null;
      const img = await addImage(a.img);
      if (img) {
        let place = null;
        if (src && a.crop) {
          const bmp = await assets.bitmap(src).catch(() => undefined);
          if (bmp) place = legacyCropToPlacement(bmp.width, bmp.height, a.crop);
        }
        avatar = { img, src, place };
      } else if (src) {
        const blob = await assets.get(src).catch(() => undefined);
        if (blob) {
          try {
            avatar = (await avatarFromBlob(blob)).avatar;
          } catch {
            avatar = null;
          }
        }
      }
      if (avatar) c.avatar = avatar;
      else if (read.zip) failed++;
    }
    const bgPath = conv.backgrounds.get(sheet);
    if (bgPath) {
      referenced++;
      const data = fileAt(bgPath);
      if (data) {
        try {
          const r = await backgroundFromBlob(blobOf(data, bgPath));
          sheet.bg = r.id;
          if (!r.persisted) notSaved = true;
        } catch {
          failed++;
        }
      } else if (read.zip) failed++;
    }
  }
  applyLegacySheets(conv.sheets, conv.labels, conv.activeIdx, mode);
  return {
    sheets: conv.sheets.length,
    chars: conv.sheets.reduce((n, s) => n + s.chars.length, 0),
    rels: conv.sheets.reduce((n, s) => n + s.rels.length, 0),
    failedImages: failed,
    noImages: !read.zip && referenced > 0,
    notSaved,
    skipped: conv.skipped,
  };
}

function applyLegacySheets(
  sheets: Sheet[],
  labels: { id: number; text: string }[],
  activeIdx: number,
  mode: 'append' | 'replace',
): void {
  useProject.getState().update((p) => {
    if (mode === 'replace') {
      p.sheets = [];
      p.labels = [];
      p.active = 0;
    }
    const labelMap = new Map<number, number>();
    for (const l of labels) {
      const t = l.text.trim();
      if (!t) continue;
      let mine = p.labels.find((x) => x.text === t);
      if (!mine) {
        mine = { id: p.nextId++, text: t };
        p.labels.push(mine);
      }
      labelMap.set(l.id, mine.id);
    }
    const first = p.sheets.length;
    for (const s of sheets) insertSheet(p, s, { labelMap });
    p.active = mode === 'replace' ? Math.min(activeIdx, p.sheets.length - 1) : first;
  });
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    panel: null,
    renaming: null,
    fitTick: useUi.getState().fitTick + 1,
  });
}

/** 頭像換成新的原圖（上傳、貼上、網址） */
export async function avatarForChar(blob: Blob, name?: string) {
  return await avatarFromBlob(blob, name);
}

/** 依位置重做頭像 */
export async function recropAvatar(a: Avatar, place: Avatar['place']): Promise<Avatar | null> {
  if (!a.src || !place) return null;
  const img = await renderAvatar(a.src, place);
  return { img, src: a.src, place };
}
