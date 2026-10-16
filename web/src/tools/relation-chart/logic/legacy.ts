/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 讀原作「匯出專案」的檔案（規格 3.9；原作的 loadProject、openProjectFile）：ZIP（資料夾裡的 project.json＋images/、
 * frames/、fonts/）或只有 project.json。轉成本工具的資料；圖片、頭像框、字型、角色資訊裡的圖先留路徑或原作的雜湊，
 * 由呼叫端放進資產庫再換成資產 id（state/project.ts）。
 * 第三批：角色庫（條目、每一件變體）、關係庫、數值範本、看法、角色資訊、角色字型、頭像框的參照都讀進來。
 * 第四批：便利貼（含圖表節點；舊檔混在 chars 裡的 sticky 角色搬出來）、世界觀與沿用、備忘錄、便利貼庫、設定集。
 */
import { strFromU8 } from 'fflate';
import type { FramePlacement } from '@/core/image';
import { makeChar, makeRel, makeType } from '../model/factory';
import { REL_KEYS } from '../model/library';
import {
  normalizeGrel,
  normalizeLabel,
  normalizeRadarTpl,
  normalizeRadarVals,
  normalizeSettings,
  normalizeViews,
  presetValues,
  safeColor,
} from '../model/normalize';
import {
  LORE_MAX,
  MEMO_MAX,
  NOTE_BIN_MAX,
  normalizeNote,
  normalizeNoteBinItem,
} from '../model/notes';
import type {
  Char,
  CharEntry,
  CharFont,
  FontKey,
  GroupRel,
  Label,
  Note,
  NoteBinItem,
  RadarTpl,
  Rel,
  RelEntry,
  RelType,
  RelVariant,
  SettingsPreset,
  Shape,
  Sheet,
  Variant,
} from '../model/types';

export class LegacyFileError extends Error {}

/** 頭像的來源：ZIP 裡的路徑（相對 project.json 所在的資料夾）與原作的裁切 */
export interface LegacyAvatar {
  img: string;
  src: string | null;
  crop: { zoom: number; ox: number; oy: number } | null;
}

export interface LegacyImport {
  sheets: Sheet[];
  /**
   * 角色庫（id 照原作；沒有條目的舊檔角色各自一筆，id 是負的）。變體的 frame、條目的 font 還是原作的參照
   * （頭像框的雜湊、`f:雜湊`），呼叫端讀了 frames/、fonts/ 之後換成資產 id；角色資訊還沒淨化。
   */
  library: CharEntry[];
  relLibrary: RelEntry[];
  radarTpls: RadarTpl[];
  /** 變體 id → 頭像來源 */
  avatars: Map<number, LegacyAvatar>;
  /** 分頁 → 背景圖路徑 */
  backgrounds: Map<Sheet, string>;
  /** 分頁 → 預設頭像框（原作的雜湊） */
  defFrames: Map<Sheet, string>;
  /** 標籤（frame 是原作的雜湊） */
  labels: Label[];
  /** 角色資訊與世界觀裡的圖：原作的雜湊 → ZIP 裡的路徑 */
  richImgs: Map<string, string>;
  /** 便利貼庫、設定集（第四批；設定集的 defFrame 還是原作的雜湊） */
  noteBin: NoteBinItem[];
  settingsLib: SettingsPreset[];
  activeIdx: number;
  /** 淺色主題的檔案 */
  light: boolean;
  /** 文件字型（原作的 docFont；取代目前內容時才用，原作也是） */
  font: FontKey;
  /** 文件字型是匯入的字型：原作的雜湊（讀得到字型檔時換成它） */
  fontRef: string | null;
  /** 略過的內容（給通知用） */
  skipped: string[];
}

/** 原作的 FONT_STACKS 和本站的字型是同一組鍵；'f:雜湊'＝原作匯入的字型檔 */
const LEGACY_FONTS: readonly FontKey[] = ['sans', 'serif', 'round', 'kai', 'mono'];
const HASH_RE = /^[0-9a-z-]{3,40}$/;
function legacyFontRef(v: unknown): { font: FontKey; ref: string | null } {
  if (typeof v === 'string' && (LEGACY_FONTS as readonly string[]).includes(v))
    return { font: v as FontKey, ref: null };
  if (typeof v === 'string' && v.startsWith('f:') && HASH_RE.test(v.slice(2)))
    return { font: 'sans', ref: v.slice(2) };
  return { font: 'sans', ref: null };
}
const legacyCharFont = (v: unknown): CharFont => {
  if (typeof v !== 'string') return '';
  if ((LEGACY_FONTS as readonly string[]).includes(v)) return v as FontKey;
  return v.startsWith('f:') && HASH_RE.test(v.slice(2)) ? (v as CharFont) : '';
};

/**
 * 原作的內容雜湊（snapHash）：頭像框、匯入字型、角色資訊圖片的參照都是它。
 * 參數是整個 data URI（`data:<MIME>;base64,<base64>`）。
 */
export function snapHash(s: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1, 33) ^ c;
    h2 = Math.imul(h2, 31) ^ c;
  }
  return `${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}-${s.length.toString(36)}`;
}

/** 原作的「副檔名 → MIME」（重算雜湊時一定要用同一張表） */
export const LEGACY_FONT_MIME: Record<string, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};
export const LEGACY_FRAME_MIME: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
const fin = (v: unknown) => Number.isFinite(num(v));

/** 原作的 project.json 嗎 */
export function isLegacyProject(data: unknown): data is Record<string, unknown> {
  return (
    isObj(data) &&
    Array.isArray(data.sheets) &&
    (data.app === 'CharRelDiagram' || 'format' in data || Array.isArray(data.library))
  );
}

/** ZIP 裡的 project.json（取最淺的那一個）與它所在的資料夾 */
export function findProjectJson(
  files: Map<string, Uint8Array>,
): { path: string; base: string } | null {
  const hits = [...files.keys()].filter((p) => p === 'project.json' || p.endsWith('/project.json'));
  if (!hits.length) return null;
  hits.sort((a, b) => a.length - b.length);
  const path = hits[0];
  return { path, base: path.slice(0, path.length - 'project.json'.length) };
}

export function parseJsonBytes(bytes: Uint8Array): unknown {
  let text = strFromU8(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}

const LEGACY_POS = ['top', 'bottom', 'left', 'right', 'topOut', 'bottomOut', 'leftOut', 'rightOut'];

/** 原作的分頁設定 → 本工具的（同名的照抄；舊模式 online／hidden 換成對應的開關） */
function legacySettings(raw: unknown, light: boolean, top: Record<string, unknown>) {
  const s = isObj(raw) ? { ...raw } : {};
  /* 舊檔的標籤圖例位置在頂層：散給沒有自己的值的分頁（原作 loadProject） */
  if (s.lblLegendPos === undefined && LEGACY_POS.includes(String(top.lblLegendPos)))
    s.lblLegendPos = top.lblLegendPos;
  if (s.legendPos === 'online') {
    s.legendPos = 'bottom';
    s.showRelName = true;
  } else if (s.legendPos === 'hidden') {
    s.legendPos = 'bottom';
    s.showLegend = false;
  } else if (!LEGACY_POS.includes(String(s.legendPos))) delete s.legendPos;
  /* 舊的單一開關「顯示關係名稱／備註」 */
  if (s.showRelName === undefined && s.showRelNote === undefined && s.showRelLabels !== undefined) {
    s.showRelName = !!s.showRelLabels;
    s.showRelNote = !!s.showRelLabels;
  }
  /* 舊的三段式間距 */
  if (s.spacingPct === undefined && typeof s.spacingMode === 'string')
    s.spacingPct = s.spacingMode === 'close' ? 72 : s.spacingMode === 'far' ? 145 : 100;
  /* 「關係文字」顏色已併進線色（原作儲存時一律 auto） */
  const out = normalizeSettings(s);
  out.palette = light ? 'light' : 'dark';
  return out;
}

/** 原作的裁切（觀景窗 196、以中心偏移）→ 正方框 → 圖片放進框的位置 */
export function legacyCropToPlacement(
  w: number,
  h: number,
  crop: { zoom: number; ox: number; oy: number } | null,
): FramePlacement | null {
  if (!crop || !(w > 0 && h > 0)) return null;
  const BOX = 196;
  const base = BOX / Math.min(w, h);
  const zoom = Math.max(1, Math.min(3.2, crop.zoom || 1));
  const ds = base * zoom;
  const s = BOX / ds;
  const x = (w * ds) / 2 - BOX / 2 - (crop.ox || 0);
  const y = (h * ds) / 2 - BOX / 2 - (crop.oy || 0);
  const rx = x / ds;
  const ry = y / ds;
  return {
    zoom: Math.min(w, h) / s,
    x: (w / 2 - rx - s / 2) / s,
    y: (h / 2 - ry - s / 2) / s,
    turns: 0,
  };
}

/** 原作的身分欄位（變體、format 3 的條目、舊檔的角色） */
type RawLooks = Record<string, unknown>;

/** 原作的變體 → 本站的變體（parseIdentity 的整理規則；color／nameColor 沒有時 undefined＝等實例捐） */
function legacyVariant(
  o: RawLooks,
  id: number,
): { v: Variant; noColor: boolean; noNameColor: boolean; emoji: boolean } {
  const sz = num(o.size);
  const ns = num(o.nameSize);
  const bw = num(o.borderW);
  const shape: Shape = o.shape === 'circle' || o.shape === 'square' ? o.shape : '';
  const frame =
    o.frame === '' ? '' : typeof o.frame === 'string' && HASH_RE.test(o.frame) ? o.frame : null;
  return {
    v: {
      id,
      name: String(o.name ?? '').slice(0, 500),
      color: safeColor(o.color),
      nameColor: safeColor(o.nameColor),
      avatar: null,
      icon: typeof o.icon === 'string' ? o.icon : null,
      noAvatar: !!o.noAvatar,
      shape,
      noBorder: !!o.noBorder,
      noBg: !!o.noBg,
      borderOn: !!o.borderOn,
      bgOn: !!o.bgOn,
      size: Number.isFinite(sz) && sz >= 32 ? sz : null,
      nameSize: Number.isFinite(ns) && ns >= 1 ? ns : null,
      borderW: Number.isFinite(bw) && bw >= 1 ? bw : null,
      labels: Array.isArray(o.labels)
        ? [...new Set(o.labels.map((x) => Math.trunc(num(x))).filter(Number.isFinite))]
        : [],
      frame,
      radars: normalizeRadarVals(o.radars),
    },
    noColor: o.color === undefined,
    noNameColor: o.nameColor === undefined,
    emoji: !!o.emoji && typeof o.image !== 'string',
  };
}

const avatarOf = (o: RawLooks): LegacyAvatar | null => {
  const img = typeof o.image === 'string' && o.image ? o.image : null;
  if (!img) return null;
  const src = typeof o.imageSrc === 'string' && o.imageSrc ? o.imageSrc : null;
  const crop =
    isObj(o.crop) && src
      ? { zoom: num(o.crop.zoom) || 1, ox: num(o.crop.ox) || 0, oy: num(o.crop.oy) || 0 }
      : null;
  return { img, src, crop };
};

/** 原作的關係類型（分頁上的 tag、關係庫的變體）的樣式欄位 */
function legacyTypeLooks(t: Record<string, unknown>) {
  const lineW = num(t.lineW);
  const ow = num(t.outlineW);
  const mag = Math.round(num(t.magLevel));
  return {
    label: String(t.label ?? '').slice(0, 200),
    color: safeColor(t.color),
    outlineColor: safeColor(t.outlineColor),
    lineStyle: (t.lineStyle as RelType['lineStyle']) ?? 'solid',
    capStyle: (t.capStyle as RelType['capStyle']) ?? 'arrow',
    lineW: Number.isFinite(lineW) && lineW >= 1 ? lineW : null,
    outlineW: Number.isFinite(ow) && ow >= 0 ? ow : null,
    mag: mag >= 1 && mag <= 5 ? mag : 3,
  };
}

export function convertLegacy(data: Record<string, unknown>): LegacyImport {
  const skipped = new Set<string>();
  const prefs = isObj(data.prefs) ? data.prefs : {};
  const light = !!prefs.light || prefs.theme === 'light';
  const format = num(data.format);
  let nextLocal = -1;
  /* 角色庫：條目 → 每一件變體（format 3＝單一身分，包成一件） */
  const library: CharEntry[] = [];
  const lib = new Map<number, CharEntry>();
  const avatars = new Map<number, LegacyAvatar>();
  /** 變體還沒有自己的顏色：第一個穿它的實例把自己的顏色捐給它（原作 bindCharToLibrary） */
  const needColor = new Set<number>();
  const needNameColor = new Set<number>();
  const addVariant = (o: RawLooks, id: number): Variant => {
    const r = legacyVariant(o, id);
    if (r.noColor) needColor.add(id);
    if (r.noNameColor) needNameColor.add(id);
    if (r.emoji) skipped.add('表情符號頭像（改成名字的第一個字）');
    const av = avatarOf(o);
    if (av) avatars.set(id, av);
    return r.v;
  };
  for (const e of Array.isArray(data.library) ? data.library : []) {
    if (!isObj(e) || !fin(e.id)) continue;
    const variants: Variant[] = [];
    if (Array.isArray(e.variants)) {
      for (const v of e.variants) {
        if (!isObj(v) || !fin(v.id) || variants.some((x) => x.id === num(v.id))) continue;
        variants.push(addVariant(v, Math.trunc(num(v.id))));
      }
    } else variants.push(addVariant(e, nextLocal--));
    if (!variants.length) continue;
    const entry: CharEntry = {
      id: Math.trunc(num(e.id)),
      variants,
      unified: !!e.unifiedColor,
      info: typeof e.info === 'string' ? e.info : '',
      font: legacyCharFont(e.font),
    };
    library.push(entry);
    lib.set(entry.id, entry);
  }
  const labels: Label[] = [];
  for (const l of Array.isArray(data.labels) ? data.labels : []) {
    const n = normalizeLabel(l);
    if (!n || labels.some((x) => x.id === n.id)) continue;
    /* 標籤的頭像框：原作的雜湊（呼叫端換成資產 id） */
    if (isObj(l) && typeof l.frame === 'string' && HASH_RE.test(l.frame)) n.frame = l.frame;
    labels.push(n);
  }
  /* 關係庫 */
  const relLibrary: RelEntry[] = [];
  for (const e of Array.isArray(data.relLibrary) ? data.relLibrary : []) {
    if (!isObj(e) || !fin(e.id) || !Array.isArray(e.variants)) continue;
    const variants: RelVariant[] = [];
    for (const v of e.variants) {
      if (!isObj(v) || !fin(v.id) || variants.some((x) => x.id === num(v.id))) continue;
      variants.push({ id: Math.trunc(num(v.id)), ...legacyTypeLooks(v) });
    }
    if (variants.length) relLibrary.push({ id: Math.trunc(num(e.id)), variants });
  }
  const relLib = new Map(relLibrary.map((e) => [e.id, e]));
  /* 舊檔沒有關係庫：同一個關係類型 id 出現在好幾張分頁＝同一筆（原作的 ensureRelLibrary） */
  const relById = new Map<number, { lib: number; vari: number }>();
  const radarTpls: RadarTpl[] = [];
  for (const t of Array.isArray(data.radarLib) ? data.radarLib : []) {
    const n = normalizeRadarTpl(t);
    if (n && !radarTpls.some((x) => x.id === n.id)) radarTpls.push(n);
  }
  const richImgs = new Map<string, string>();
  if (isObj(data.richImgs))
    for (const [h, path] of Object.entries(data.richImgs))
      if (HASH_RE.test(h) && typeof path === 'string') richImgs.set(h, path);
  const legacyTags = Array.isArray(data.relTypes)
    ? data.relTypes
    : Array.isArray(data.tags)
      ? data.tags
      : [];
  const sheets: Sheet[] = [];
  const backgrounds = new Map<Sheet, string>();
  const defFrames = new Map<Sheet, string>();
  for (const shRaw of data.sheets as unknown[]) {
    if (!isObj(shRaw)) continue;
    let sh = shRaw;
    if (sh.isTimeline && Array.isArray(sh.frames) && sh.frames.length) {
      const idx = Math.min(Math.max(0, num(sh.activeFrameIdx) || 0), sh.frames.length - 1);
      const f = sh.frames[idx];
      if (isObj(f))
        sh = {
          ...sh,
          chars: f.chars,
          rels: f.rels,
          W: f.W ?? sh.W,
          H: f.H ?? sh.H,
          bgImage: f.bgImage ?? sh.bgImage,
          notes: f.notes ?? sh.notes,
        };
      skipped.add('時間軸分頁的其他影格（只取目前的影格）');
    }
    const typesRaw = Array.isArray(sh.relTypes)
      ? sh.relTypes
      : Array.isArray(sh.tags)
        ? sh.tags
        : legacyTags;
    const types: RelType[] = [];
    for (const t of typesRaw) {
      if (!isObj(t) || !fin(t.id)) continue;
      const id = Math.trunc(num(t.id));
      const looks = legacyTypeLooks(t);
      const tt = makeType(id, looks.label, {
        ...looks,
        hidden: !!t.hidden,
        hideInLegend: !!t.hideInLegend,
        pairSkip: t.pairSkip === true,
      });
      /* 綁定關係庫：有 relLibId 照檔案（變體不在＝第一件）；樣式和變體不同（原作沒同步到）＝不綁，畫出來照分頁上的 */
      const e = fin(t.relLibId) ? relLib.get(num(t.relLibId)) : undefined;
      if (e) {
        const v = e.variants.find((x) => x.id === num(t.relVarId)) ?? e.variants[0];
        if (REL_KEYS.every((k) => JSON.stringify(v[k]) === JSON.stringify(tt[k]))) {
          tt.lib = e.id;
          tt.vari = v.id;
        }
      } else {
        let m = relById.get(id);
        if (!m) {
          const ne: RelEntry = { id: nextLocal--, variants: [{ id: nextLocal--, ...looks }] };
          relLibrary.push(ne);
          relLib.set(ne.id, ne);
          m = { lib: ne.id, vari: ne.variants[0].id };
          relById.set(id, m);
        }
        const v = relLib.get(m.lib)?.variants[0];
        if (v && REL_KEYS.every((k) => JSON.stringify(v[k]) === JSON.stringify(tt[k]))) {
          tt.lib = m.lib;
          tt.vari = m.vari;
        }
      }
      types.push(tt);
    }
    /* 便利貼：分頁的 notes＋舊檔混在 chars（含時間軸每一格）裡的 sticky 角色（同 id 取第一次遇到的；原作 migrateSheetNotes） */
    const notes: Note[] = [];
    const pullNote = (n: unknown) => {
      const nn = normalizeNote(n, 0);
      if (nn && isObj(n) && fin(n.id) && !notes.some((x) => x.id === nn.id)) notes.push(nn);
    };
    for (const n of Array.isArray(sh.notes) ? sh.notes : []) pullNote(n);
    const stickyFrom = [
      sh.chars,
      ...(Array.isArray(shRaw.frames) ? shRaw.frames.map((f) => (isObj(f) ? f.chars : null)) : []),
    ];
    for (const arr of stickyFrom)
      if (Array.isArray(arr)) for (const c of arr) if (isObj(c) && c.sticky) pullNote(c);
    const chars: Char[] = [];
    for (const c of Array.isArray(sh.chars) ? sh.chars : []) {
      if (!isObj(c) || !fin(c.id)) continue;
      if (c.sticky) continue;
      /* 條目：有 libId 照檔案（變體不在＝第一件）；沒有（舊檔）＝以角色自己的身分欄位建一筆 */
      let e = fin(c.libId) ? lib.get(num(c.libId)) : undefined;
      if (!e) {
        e = {
          id: nextLocal--,
          variants: [addVariant(c, nextLocal--)],
          unified: false,
          info: '',
          font: '',
        };
        library.push(e);
        lib.set(e.id, e);
      }
      const v = e.variants.find((x) => x.id === num(c.varId)) ?? e.variants[0];
      if (needColor.delete(v.id)) v.color = safeColor(c.color);
      if (needNameColor.delete(v.id)) v.nameColor = safeColor(c.nameColor);
      const id = Math.trunc(num(c.id));
      const level =
        format >= 6
          ? fin(c.level)
            ? Math.trunc(num(c.level))
            : 0
          : num(c.level) >= 1 && num(c.level) <= 6
            ? 7 - num(c.level)
            : 0;
      const ch = makeChar(id, v.name, num(c.x), num(c.y), {
        lib: e.id,
        vari: v.id,
        defNo: fin(c.defNo) ? Math.max(1, Math.trunc(num(c.defNo))) : 0,
        level,
        locked: !!c.locked,
        relIgnore: !!c.relIgnore,
        color: v.color,
        nameColor: v.nameColor,
        icon: v.icon,
        noAvatar: v.noAvatar,
        shape: v.shape,
        noBorder: v.noBorder,
        noBg: v.noBg,
        borderOn: v.borderOn,
        bgOn: v.bgOn,
        size: v.size,
        nameSize: v.nameSize,
        borderW: v.borderW,
        labels: [...v.labels],
        frame: v.frame,
        font: e.font,
      });
      chars.push(ch);
    }
    const charIds = new Set(chars.map((c) => c.id));
    const typeIds = new Set(types.map((t) => t.id));
    const rels: Rel[] = [];
    for (const r of Array.isArray(sh.rels) ? sh.rels : []) {
      if (!isObj(r) || !fin(r.id)) continue;
      const from = Math.trunc(num(r.from));
      const to = Math.trunc(num(r.to));
      const type = Math.trunc(num(r.relTypeId ?? r.tagId));
      if (!charIds.has(from) || !charIds.has(to) || !typeIds.has(type)) continue;
      const lt = num(r.labelT);
      const cd = num(r.curveDir);
      const mag = Math.round(num(r.magLevel));
      const sa = num(r.selfAng);
      rels.push(
        makeRel(Math.trunc(num(r.id)), from, to, type, {
          both: !!r.both,
          note: typeof r.note === 'string' ? r.note.slice(0, 2000) : '',
          labelT: Number.isFinite(lt) ? Math.min(0.95, Math.max(0.05, lt)) : null,
          curveDir: cd === 1 ? 1 : cd === -1 ? -1 : 0,
          flipName: r.labelFlipName === true || r.labelFlip === true,
          flipNote: r.labelFlipNote === true || r.labelFlip === true,
          pairSkip: r.pairSkip === true,
          mag: mag >= 1 && mag <= 5 ? mag : 0,
          selfAng: Number.isFinite(sa) ? sa : null,
        }),
      );
    }
    /* 群體關係（新名 relTypeId、舊名 tagId；只驗形狀，端點在不在由畫的時候判斷＝原作 sanitizeGrels） */
    const grels: GroupRel[] = [];
    for (const g of Array.isArray(sh.groupRels) ? sh.groupRels : []) {
      if (!isObj(g) || !fin(g.id)) continue;
      const n = normalizeGrel(g, 0);
      if (n && !grels.some((x) => x.id === n.id)) grels.push(n);
    }
    const collapsed = Array.isArray(sh.collapsedLbls)
      ? [...new Set(sh.collapsedLbls.map((x) => Math.trunc(num(x))).filter(Number.isFinite))]
      : [];
    const W = fin(sh.W) && num(sh.W) >= 0 ? Math.round(num(sh.W)) : 1000;
    const sheet: Sheet = {
      id: fin(sh.id) ? Math.trunc(num(sh.id)) : nextLocal--,
      defNo: fin(sh.defNo) ? Math.max(1, Math.trunc(num(sh.defNo))) : 0,
      name: String(sh.name ?? '').slice(0, 200),
      W,
      H: fin(sh.H) && num(sh.H) >= 0 ? Math.round(num(sh.H)) : W,
      chars,
      rels,
      types,
      bg: null,
      settings: legacySettings(sh.settings, light, data),
      grels,
      collapsed,
      /* 看法（重新淨化；角色 id 是這張分頁的，加進專案時跟著換） */
      views: normalizeViews(sh.views),
      notes,
      /* 世界觀（還沒淨化：呼叫端換圖片參照時一起淨化）、沿用（原作的分頁 id，加進專案時跟著換）、備忘錄 */
      lore: typeof sh.lore === 'string' ? sh.lore.slice(0, LORE_MAX) : '',
      loreFrom: fin(sh.loreFrom) ? Math.trunc(num(sh.loreFrom)) : null,
      memo: typeof sh.memo === 'string' ? sh.memo.slice(0, MEMO_MAX) : '',
    };
    sheets.push(sheet);
    if (typeof sh.bgImage === 'string' && sh.bgImage) backgrounds.set(sheet, sh.bgImage);
    const df = isObj(sh.settings) ? sh.settings.defFrame : undefined;
    if (typeof df === 'string' && HASH_RE.test(df)) defFrames.set(sheet, df);
  }
  if (Array.isArray(data.sheetLibrary) && data.sheetLibrary.length) skipped.add('分頁庫');
  /* 便利貼庫（原作只有完整匯出才帶）、設定集（原作的格式：設定值攤在條目上；預設頭像框是原作的雜湊） */
  const noteBin: NoteBinItem[] = [];
  for (const n of Array.isArray(data.noteBin) ? data.noteBin : []) {
    const nn = normalizeNoteBinItem(n, 0);
    if (nn && isObj(n) && fin(n.id) && !noteBin.some((x) => x.id === nn.id)) noteBin.push(nn);
  }
  const settingsLib: SettingsPreset[] = [];
  for (const g of Array.isArray(data.settingsLib) ? data.settingsLib : []) {
    if (!isObj(g) || !fin(g.id) || settingsLib.some((x) => x.id === num(g.id))) continue;
    const values = presetValues(g);
    if (typeof g.defFrame === 'string' && HASH_RE.test(g.defFrame)) values.defFrame = g.defFrame;
    settingsLib.push({
      id: Math.trunc(num(g.id)),
      name: String(g.name ?? '').slice(0, 100),
      fav: g.fav === true,
      values,
    });
  }
  if (!sheets.length) throw new LegacyFileError('原作的專案檔裡沒有分頁。');
  const docFont = legacyFontRef(data.docFont);
  return {
    sheets,
    library,
    relLibrary,
    radarTpls,
    avatars,
    backgrounds,
    defFrames,
    labels,
    richImgs,
    noteBin: noteBin.slice(0, NOTE_BIN_MAX),
    settingsLib,
    activeIdx: Math.min(Math.max(0, num(data.activeSheetIdx) || 0), sheets.length - 1),
    light,
    font: docFont.font,
    fontRef: docFont.ref,
    skipped: [...skipped],
  };
}
