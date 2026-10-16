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
import { sanitizeProjectRich, sanitizeRichHtml } from '../logic/rich';
import { normalizeProject, projectAssetIds } from '../model/normalize';
import { NOTE_BIN_MAX } from '../model/notes';
import type {
  Avatar,
  Char,
  CharFont,
  FontFormat,
  FontItem,
  FontValue,
  FrameItem,
  Project,
  Sheet,
} from '../model/types';
import { S } from '../strings';
import { insertSheet, type SheetMaps, TL_UI_RESET } from './actions';
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
  const fixChars = (list: Char[]) =>
    list.map((c) => {
      const avatar = fixAv(c.avatar, false);
      return avatar === c.avatar ? c : { ...c, avatar };
    });
  const fixSheet = (s: Sheet, count: boolean): Sheet => {
    const bg = s.bg && missing.has(s.bg) ? null : s.bg;
    if (bg !== s.bg && count) dropped++;
    /* 時間軸分頁的每一格 */
    const tl = s.tl
      ? {
          ...s.tl,
          frames: s.tl.frames.map((f) => {
            const fb = f.bg && missing.has(f.bg) ? null : f.bg;
            if (fb !== f.bg && count) dropped++;
            return { ...f, bg: fb, chars: fixChars(f.chars) };
          }),
        }
      : s.tl;
    return { ...s, bg, chars: fixChars(s.chars), tl };
  };
  const sheets = p.sheets.map((s) => fixSheet(s, true));
  const sheetLib = (p.sheetLib ?? []).map((it) => ({ ...it, sheet: fixSheet(it.sheet, false) }));
  const frames = p.frames.filter((f) => !missing.has(f.id));
  const fonts = p.fonts.filter((f) => !missing.has(f.id));
  dropped += p.frames.length - frames.length + p.fonts.length - fonts.length;
  return { data: { ...p, library, sheets, frames, fonts, sheetLib }, dropped };
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
  sanitizeProjectRich(next);
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

/**
 * 換掉整個專案（開啟專案檔、全部重設、還原快照；可以復原）。
 * 分頁庫不在復原裡（editor/undo），所以這裡不丟掉現有的分頁庫：新的內容的分頁庫在前、現有的接在後面（同一筆不重複；D 項）。
 */
export function replaceProject(p: Project): void {
  updateProject((d) => {
    const cur = d.sheetLib as Project['sheetLib'];
    const same = (a: { id: number; savedAt: number }, b: { id: number; savedAt: number }) =>
      a.id === b.id && a.savedAt === b.savedAt;
    const lib = [...p.sheetLib, ...cur.filter((x) => !p.sheetLib.some((y) => same(x, y)))];
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
    d.noteBin = p.noteBin;
    d.settingsLib = p.settingsLib;
    /* 分頁庫：id 重複的換新的、nextId 墊高 */
    const used = new Set<number>();
    d.sheetLib = lib;
    for (const it of d.sheetLib) {
      if (used.has(it.id) || it.id <= 0) it.id = d.nextId++;
      used.add(it.id);
    }
    for (const id of used) if (id >= d.nextId) d.nextId = id + 1;
  });
  setUi({
    sel: [],
    focus: null,
    hover: null,
    link: null,
    panel: null,
    renaming: null,
    fitTick: useUi.getState().fitTick + 1,
    ...TL_UI_RESET,
  });
}

/* ---------- 原作的專案檔 ---------- */

/** 讀原作的資料時的選項（快照）：只取第幾張分頁 */
export interface LegacyApplyOpts {
  only?: number;
}

/**
 * 只取一張分頁（原作快照的「只取其中一個分頁」）：角色庫、關係庫只留那張分頁用到的，
 * 便利貼庫、設定集、分頁庫不帶。
 */
function onlySheet(conv: LegacyImport, idx: number): void {
  const s = conv.sheets[idx];
  conv.sheets = s ? [s] : [];
  const chars = s ? [s.chars, ...(s.tl?.frames.map((f) => f.chars) ?? [])].flat() : [];
  const used = new Set(chars.map((c) => c.lib));
  conv.library = conv.library.filter((e) => used.has(e.id));
  const usedRel = new Set(s?.types.map((t) => t.lib) ?? []);
  conv.relLibrary = conv.relLibrary.filter((e) => usedRel.has(e.id));
  conv.noteBin = [];
  conv.settingsLib = [];
  conv.sheetLib = [];
  conv.activeIdx = 0;
}

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
  /** 參照到、檔案裡卻沒有的頭像框與匯入字型（第三批） */
  missingFrames: number;
  missingFonts: number;
  notSaved: boolean;
  skipped: string[];
}

/** data URI → 位元組（原作快照備份的圖；不是 base64 的照 URL 編碼解） */
export function dataUriBytes(uri: string): Uint8Array | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!m) return null;
  try {
    if (!m[2]) return new TextEncoder().encode(decodeURIComponent(m[3]));
    const bin = atob(m[3]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const blobOf = (data: Uint8Array, name: string) => {
  const mime = /^data:([^;,]+)/.exec(name)?.[1];
  if (mime) return new Blob([data as BlobPart], { type: mime });
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

/**
 * 原作的參照（頭像框的雜湊、`f:雜湊`、角色資訊與世界觀的 `rcimg:雜湊`）換成資產 id；對不上的：框＝不使用、字型＝跟隨／黑體。
 * 角色資訊與世界觀在這裡淨化。回傳文件字型與對不上的框、字型各有幾個（不同的雜湊；通知用）。
 */
export function remapLegacyRefs(
  conv: LegacyImport,
  frameMap: ReadonlyMap<string, string>,
  fontMap: ReadonlyMap<string, string>,
  richMap: ReadonlyMap<string, string>,
): { font: FontValue; missingFrames: number; missingFonts: number } {
  const lostFrames = new Set<string>();
  const lostFonts = new Set<string>();
  const frameRef = (h: string): string => {
    const id = frameMap.get(h);
    if (!id) lostFrames.add(h);
    return id ?? '';
  };
  const fontRef = (v: CharFont): CharFont => {
    if (!v.startsWith('f:')) return v;
    const id = fontMap.get(v.slice(2));
    if (!id) lostFonts.add(v.slice(2));
    return id ? `f:${id}` : '';
  };
  const rich = (html: string) =>
    sanitizeRichHtml(html).replace(/src="rcimg:([0-9a-z-]{3,40})"/g, (m, h: string) =>
      richMap.has(h) ? `src="rcimg:${richMap.get(h)}"` : m,
    );
  for (const e of conv.library) {
    e.font = fontRef(e.font);
    if (e.info) e.info = rich(e.info);
    for (const v of e.variants) if (v.frame) v.frame = frameRef(v.frame);
  }
  for (const g of conv.settingsLib)
    if (g.values.defFrame) g.values.defFrame = frameRef(g.values.defFrame);
  for (const l of conv.labels) if (l.frame) l.frame = frameRef(l.frame);
  for (const s of [...conv.sheets, ...conv.sheetLib.map((it) => it.sheet)]) {
    if (s.lore) s.lore = rich(s.lore);
    const df = conv.defFrames.get(s);
    s.settings.defFrame = df ? frameRef(df) : '';
    /* 時間軸分頁：每一格的角色 */
    for (const list of [s.chars, ...(s.tl?.frames.map((f) => f.chars) ?? [])])
      for (const c of list) {
        if (c.frame) c.frame = frameRef(c.frame);
        c.font = fontRef(c.font);
      }
  }
  const docId = conv.fontRef ? fontMap.get(conv.fontRef) : undefined;
  if (conv.fontRef && !docId) lostFonts.add(conv.fontRef);
  return {
    font: docId ? `f:${docId}` : conv.font,
    missingFrames: lostFrames.size,
    missingFonts: lostFonts.size,
  };
}

/**
 * 原作的專案 → 加入為新分頁（append）或取代目前內容（replace）。
 * 圖片：頭像成品直接用、有原圖時存原圖並換算位置；背景圖照用。
 */
export async function importLegacy(
  read: LegacyRead,
  mode: 'append' | 'replace',
  opts: LegacyApplyOpts = {},
): Promise<LegacyResult> {
  const conv = convertLegacy(read.data);
  if (opts.only !== undefined) onlySheet(conv, opts.only);
  let failed = 0;
  let referenced = 0;
  let notSaved = false;
  /* 圖：ZIP 裡的路徑，或（原作的快照備份）data URI */
  const fileAt = (path: string) => {
    if (path.startsWith('data:')) return dataUriBytes(path) ?? undefined;
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
  /* 背景圖：分頁、時間軸的每一格（ZIP 裡的檔）、分頁庫（內嵌的 data URI） */
  const bgCache = new Map<string, string | null>();
  for (const [owner, ref] of conv.backgrounds) {
    const inline = ref.startsWith('data:');
    if (!inline) referenced++;
    let id = bgCache.get(ref);
    if (id === undefined) {
      id = null;
      const data = fileAt(ref);
      const blob = data ? blobOf(data, ref) : null;
      if (blob) {
        try {
          const r = await backgroundFromBlob(blob);
          id = r.id;
          if (!r.persisted) notSaved = true;
        } catch {
          id = null;
        }
      }
      bgCache.set(ref, id);
      if (!id && !inline && (read.zip || blob)) failed++;
    }
    if (id) owner.bg = id;
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
    missingFrames: refs.missingFrames,
    missingFonts: refs.missingFonts,
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
      /* 分頁庫不在復原裡：取代時現有的留著，讀進來的接在前面（同 replaceProject，D80） */
      p.labels = [];
      p.library = [];
      p.relLibrary = [];
      p.radarTpls = [];
      p.noteBin = [];
      p.settingsLib = [];
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
    const tplMap = new Map<number, number>();
    const maps: Required<SheetMaps> = {
      labelMap,
      entryMap: new Map(),
      varMap: new Map(),
      relEntryMap: new Map(),
      relVarMap: new Map(),
      tplMap,
      sheetMap: new Map(),
    };
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
    /* 世界觀的沿用：原作的分頁 id 換成新的（指到這個檔以外的＝自己的內容） */
    for (const s of p.sheets.slice(first))
      if (s.loreFrom !== null) {
        const to = maps.sheetMap.get(s.loreFrom);
        s.loreFrom = to !== undefined && to !== s.id ? to : null;
      }
    /* 分頁庫：照加入分頁的路徑換 id，放進分頁庫（不留在分頁列）；取代＝接在現有的前面、加入＝接在後面 */
    const added: Project['sheetLib'] = [];
    for (const it of conv.sheetLib) {
      const idx = insertSheet(p, it.sheet, { ...maps, sheetMap: new Map() });
      const [sh] = p.sheets.splice(idx, 1);
      sh.loreFrom = sh.loreFrom !== null ? (maps.sheetMap.get(sh.loreFrom) ?? null) : null;
      added.push({ id: p.nextId++, name: it.name, savedAt: it.savedAt, sheet: sh as Sheet });
    }
    if (added.length)
      p.sheetLib =
        mode === 'replace'
          ? [...added, ...(p.sheetLib as Project['sheetLib'])]
          : [...(p.sheetLib as Project['sheetLib']), ...added];
    /* 便利貼庫、設定集：id 換成專案的（加入為新分頁＝接在後面） */
    for (const n of conv.noteBin) {
      const nn = JSON.parse(JSON.stringify(n)) as typeof n;
      nn.id = p.nextId++;
      if (nn.chart) nn.chart.tpl = tplMap.get(nn.chart.tpl) ?? nn.chart.tpl;
      if (p.noteBin.length < NOTE_BIN_MAX) p.noteBin.push(nn);
    }
    for (const g of conv.settingsLib)
      p.settingsLib.push({ ...JSON.parse(JSON.stringify(g)), id: p.nextId++ });
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
    ...TL_UI_RESET,
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
