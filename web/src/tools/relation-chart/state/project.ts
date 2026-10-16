/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 專案檔（共用的專案檔格式：project.json＋files/<資產 id>.<副檔名>，規格 3.8）與原作的專案檔（3.9；原作的 loadProject、
 * importBundleFrames、importBundleFonts）。
 */
import { importAssetFiles } from '@/core/assets';
import { unzipFiles } from '@/core/files';
import { isZipBytes, ProjectFileError } from '@/core/storage/project';
import {
  convertLegacy,
  findProjectJson,
  isLegacyProject,
  LEGACY_FONT_MIME,
  LEGACY_FRAME_MIME,
  LegacyFileError,
  type LegacyImport,
  legacyCropToPlacement,
  parseJsonBytes,
  snapHash,
} from '../logic/legacy';
import { sanitizeRichHtml } from '../logic/rich';
import { normalizeProject, projectAssetIds } from '../model/normalize';
import type {
  Avatar,
  CharFont,
  FontFormat,
  FontItem,
  FontValue,
  FrameItem,
  Project,
} from '../model/types';
import { S } from '../strings';
import { insertSheet, type SheetMaps } from './actions';
import { avatarFromBlob, backgroundFromBlob, renderAvatar } from './images';
import { assets, projectNow, setUi, syncProject, updateProject, useUi } from './store';

/* ---------- 本工具的專案檔 ---------- */

/**
 * 存專案檔時讀不到的資產：那些頭像（每一件變體）、背景圖、頭像框、字型拿掉（存出來的檔開得了）。
 * 回傳要存的內容與受影響的數量（頭像以變體算）。
 */
export function dropMissingImages(
  p: Project,
  missing: ReadonlySet<string>,
): { data: Project; dropped: number } {
  if (!missing.size) return { data: p, dropped: 0 };
  let dropped = 0;
  const fixAv = (a: Avatar | null, count: boolean): Avatar | null => {
    if (!a) return a;
    if (missing.has(a.img)) {
      if (count) dropped++;
      return null;
    }
    if (a.src && missing.has(a.src)) return { ...a, src: null, place: null };
    return a;
  };
  const library = p.library.map((e) => ({
    ...e,
    variants: e.variants.map((v) => {
      const avatar = fixAv(v.avatar, true);
      return avatar === v.avatar ? v : { ...v, avatar };
    }),
  }));
  const sheets = p.sheets.map((s) => {
    const bg = s.bg && missing.has(s.bg) ? null : s.bg;
    if (bg !== s.bg) dropped++;
    const chars = s.chars.map((c) => {
      const avatar = fixAv(c.avatar, false);
      return avatar === c.avatar ? c : { ...c, avatar };
    });
    return { ...s, bg, chars };
  });
  const frames = p.frames.filter((f) => !missing.has(f.id));
  const fonts = p.fonts.filter((f) => !missing.has(f.id));
  dropped += p.frames.length - frames.length + p.fonts.length - fonts.length;
  return { data: { ...p, library, sheets, frames, fonts }, dropped };
}

let saving: { data: Project; dropped: number } | null = null;

/** ProjectMenu 的 getFiles：收圖片，讀不到的記下來（getData 在這之後呼叫） */
export async function collectProjectFiles(): Promise<{ name: string; data: Uint8Array }[]> {
  syncProject();
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

/** 讀本工具的專案檔：整理內容（角色資訊重新淨化）、圖片與字型放進資產庫；讀不到的拿掉並回報數量 */
export async function importOwnProject(
  data: unknown,
  files: Map<string, Uint8Array>,
): Promise<{ project: Project; notSaved: boolean; dropped: number }> {
  const next = normalizeProject(data);
  if (!next) throw new ProjectFileError(S.project.unusable);
  for (const e of next.library) if (e.info) e.info = sanitizeRichHtml(e.info);
  const imported = await importAssetFiles(assets, files.entries());
  const fontIds = new Set(next.fonts.map((f) => f.id));
  const missing = new Set<string>();
  for (const id of projectAssetIds(next)) {
    /* 字型不是圖：有檔案就算 */
    const ok = fontIds.has(id)
      ? await assets.get(id).then(
          (b) => !!b,
          () => false,
        )
      : await assets.bitmap(id).then(
          (b) => !!b,
          () => false,
        );
    if (!ok) missing.add(id);
  }
  const fixed = dropMissingImages(next, missing);
  return { project: fixed.data, notSaved: imported.notPersisted > 0, dropped: fixed.dropped };
}

/** 換掉整個專案（開啟專案檔、全部重設；可以復原） */
export function replaceProject(p: Project): void {
  updateProject((d) => {
    d.sheets = p.sheets;
    d.active = Math.min(Math.max(0, p.active), p.sheets.length - 1);
    d.labels = p.labels;
    d.nextId = p.nextId;
    d.font = p.font;
    d.library = p.library;
    d.relLibrary = p.relLibrary;
    d.radarTpls = p.radarTpls;
    d.frames = p.frames;
    d.fonts = p.fonts;
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

/** 位元組 → base64（重算原作的雜湊用） */
function base64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH)
    s += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + CH)));
  return btoa(s);
}

const fileBase = (path: string) => (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

/**
 * ZIP 的 frames/、fonts/ 資料夾：每個檔都讀（不靠清單），用原作的 snapHash＋「副檔名 → MIME」表重算雜湊，
 * 對上專案裡的參照；放進資產庫。回傳 雜湊 → 資產 id 與新的庫項目。
 */
async function ingestBundle(
  read: LegacyRead,
  dir: 'frames/' | 'fonts/',
  mimes: Record<string, string>,
): Promise<{
  map: Map<string, string>;
  items: { id: string; name: string; ext: string }[];
  notSaved: boolean;
}> {
  const map = new Map<string, string>();
  const items: { id: string; name: string; ext: string }[] = [];
  let notSaved = false;
  for (const [path, data] of read.files) {
    const rel = path.startsWith(read.base) ? path.slice(read.base.length) : path;
    if (!rel.startsWith(dir) || rel.endsWith('/')) continue;
    const ext = rel.split('.').pop()?.toLowerCase() ?? '';
    const mime = mimes[ext];
    if (!mime || !data.length) continue;
    const hash = snapHash(`data:${mime};base64,${base64(data)}`);
    try {
      const r = await assets.add(new Blob([data as BlobPart], { type: mime }));
      if (!r.persisted) notSaved = true;
      map.set(hash, r.id);
      if (!items.some((x) => x.id === r.id)) items.push({ id: r.id, name: fileBase(rel), ext });
    } catch {
      /* 讀不了的略過 */
    }
  }
  return { map, items, notSaved };
}

/** 原作的參照（頭像框的雜湊、`f:雜湊`、角色資訊的 `rcimg:雜湊`）換成資產 id；對不上的：框＝不使用、字型＝跟隨／黑體 */
export function remapLegacyRefs(
  conv: LegacyImport,
  frameMap: ReadonlyMap<string, string>,
  fontMap: ReadonlyMap<string, string>,
  richMap: ReadonlyMap<string, string>,
): { font: FontValue } {
  const fontRef = (v: CharFont): CharFont => {
    if (!v.startsWith('f:')) return v;
    const id = fontMap.get(v.slice(2));
    return id ? `f:${id}` : '';
  };
  for (const e of conv.library) {
    e.font = fontRef(e.font);
    if (e.info)
      e.info = sanitizeRichHtml(e.info).replace(/src="rcimg:([0-9a-z-]{3,40})"/g, (m, h: string) =>
        richMap.has(h) ? `src="rcimg:${richMap.get(h)}"` : m,
      );
    for (const v of e.variants) if (v.frame) v.frame = frameMap.get(v.frame) ?? '';
  }
  for (const l of conv.labels) if (l.frame) l.frame = frameMap.get(l.frame) ?? '';
  for (const s of conv.sheets) {
    const df = conv.defFrames.get(s);
    s.settings.defFrame = (df && frameMap.get(df)) ?? '';
    for (const c of s.chars) {
      if (c.frame) c.frame = frameMap.get(c.frame) ?? '';
      c.font = fontRef(c.font);
    }
  }
  const docId = conv.fontRef ? fontMap.get(conv.fontRef) : undefined;
  return { font: docId ? `f:${docId}` : conv.font };
}

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
  /* 頭像：每一件變體各自的（成品直接用；有原圖時存原圖並換算位置） */
  for (const v of conv.library.flatMap((e) => e.variants)) {
    const a = conv.avatars.get(v.id);
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
    if (avatar) v.avatar = avatar;
    else if (read.zip) failed++;
  }
  for (const sheet of conv.sheets) {
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
  /* 頭像框、匯入的字型、角色資訊裡的圖 */
  const fr = await ingestBundle(read, 'frames/', LEGACY_FRAME_MIME);
  const fo = await ingestBundle(read, 'fonts/', LEGACY_FONT_MIME);
  if (fr.notSaved || fo.notSaved) notSaved = true;
  const richMap = new Map<string, string>();
  for (const [h, path] of conv.richImgs) {
    const id = await addImage(path);
    if (id) richMap.set(h, id);
  }
  const refs = remapLegacyRefs(conv, fr.map, fo.map, richMap);
  const frames: FrameItem[] = fr.items.map((x) => ({ id: x.id, name: x.name.slice(0, 60) }));
  const fonts: FontItem[] = fo.items.map((x) => ({
    id: x.id,
    name: x.name.slice(0, 100),
    fmt: x.ext as FontFormat,
  }));
  applyLegacy(conv, mode, refs.font, frames, fonts);
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

/**
 * 加進專案：取代＝先清空（框庫與字型庫照原作疊加、不清）；加入為新分頁＝角色庫、關係庫、範本全部加進來（不去重，照原作），
 * 標籤同名的沿用現有的（顏色、開關、框不蓋過去），新的連同頭像框一起加（原作漏了框）。所有 id 換成專案的。
 */
export function applyLegacy(
  conv: LegacyImport,
  mode: 'append' | 'replace',
  font: FontValue,
  frames: readonly FrameItem[],
  fonts: readonly FontItem[],
): void {
  updateProject((p) => {
    if (mode === 'replace') {
      p.sheets = [];
      p.labels = [];
      p.library = [];
      p.relLibrary = [];
      p.radarTpls = [];
      p.active = 0;
      /* 文件字型跟著開進來的檔（加入為新分頁時不動；原作也是） */
      p.font = font;
    }
    for (const f of frames) if (!p.frames.some((x) => x.id === f.id)) p.frames.push({ ...f });
    for (const f of fonts) if (!p.fonts.some((x) => x.id === f.id)) p.fonts.push({ ...f });
    const labelMap = new Map<number, number>();
    for (const l of conv.labels) {
      const t = l.text.trim();
      if (!t) continue;
      const mine = p.labels.find((x) => x.text === t);
      if (mine) labelMap.set(l.id, mine.id);
      else {
        const id = p.nextId++;
        p.labels.push({ ...l, id, text: t });
        labelMap.set(l.id, id);
      }
    }
    const maps: Required<SheetMaps> = {
      labelMap,
      entryMap: new Map(),
      varMap: new Map(),
      relEntryMap: new Map(),
      relVarMap: new Map(),
    };
    const tplMap = new Map<number, number>();
    const axisMap = new Map<number, number>();
    for (const t of conv.radarTpls) {
      const nt = { ...t, id: p.nextId++, axes: t.axes.map((a) => ({ ...a })) };
      tplMap.set(t.id, nt.id);
      for (const a of nt.axes) {
        const nid = p.nextId++;
        axisMap.set(a.id, nid);
        a.id = nid;
      }
      p.radarTpls.push(nt);
    }
    for (const e of conv.library) {
      const ne = JSON.parse(JSON.stringify(e)) as typeof e;
      ne.id = p.nextId++;
      maps.entryMap.set(e.id, ne.id);
      for (const v of ne.variants) {
        const nid = p.nextId++;
        maps.varMap.set(v.id, nid);
        v.id = nid;
        v.labels = v.labels.map((l) => labelMap.get(l) ?? -1).filter((l) => l > 0);
        v.radars = v.radars
          .filter((r) => tplMap.has(r.tpl))
          .map((r) => ({
            tpl: tplMap.get(r.tpl) as number,
            state: r.state,
            vals: Object.fromEntries(
              Object.entries(r.vals)
                .filter(([k]) => axisMap.has(Number(k)))
                .map(([k, val]) => [String(axisMap.get(Number(k))), val]),
            ),
          }));
      }
      p.library.push(ne);
    }
    for (const e of conv.relLibrary) {
      const ne = JSON.parse(JSON.stringify(e)) as typeof e;
      ne.id = p.nextId++;
      maps.relEntryMap.set(e.id, ne.id);
      for (const v of ne.variants) {
        const nid = p.nextId++;
        maps.relVarMap.set(v.id, nid);
        v.id = nid;
      }
      p.relLibrary.push(ne);
    }
    const first = p.sheets.length;
    for (const s of conv.sheets) insertSheet(p, s, maps);
    p.active = mode === 'replace' ? Math.min(conv.activeIdx, p.sheets.length - 1) : first;
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
