/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 讀原作「匯出專案」的檔案（規格 3.9；原作的 loadProject、openProjectFile）：ZIP（資料夾裡的 project.json＋images/）
 * 或只有 project.json。轉成本工具的分頁；圖片先留路徑，由呼叫端放進資產庫。
 */
import { strFromU8 } from 'fflate';
import type { FramePlacement } from '@/core/image';
import { makeChar, makeRel, makeType } from '../model/factory';
import { normalizeSettings, safeColor } from '../model/normalize';
import type { Char, FontKey, Label, Rel, RelType, Shape, Sheet } from '../model/types';

export class LegacyFileError extends Error {}

/** 頭像的來源：ZIP 裡的路徑（相對 project.json 所在的資料夾）與原作的裁切 */
export interface LegacyAvatar {
  img: string;
  src: string | null;
  crop: { zoom: number; ox: number; oy: number } | null;
}

export interface LegacyImport {
  sheets: Sheet[];
  /** 角色 id → 頭像來源（同一張分頁內的 id） */
  avatars: Map<Sheet, Map<number, LegacyAvatar>>;
  /** 分頁 → 背景圖路徑 */
  backgrounds: Map<Sheet, string>;
  labels: Label[];
  activeIdx: number;
  /** 淺色主題的檔案 */
  light: boolean;
  /** 文件字型（原作的 docFont；取代目前內容時才用，原作也是） */
  font: FontKey;
  /** 文件字型對應不到本站的字型時（原作匯入的字型檔）：略過的通知裡的一項 */
  fontNote: string | null;
  /** 略過的內容（給通知用） */
  skipped: string[];
}

/** 原作的 FONT_STACKS 和本站的字型是同一組鍵；'f:…'＝原作匯入的字型檔（本站沒有） */
const LEGACY_FONTS: readonly FontKey[] = ['sans', 'serif', 'round', 'kai', 'mono'];
function legacyFont(v: unknown): { font: FontKey; note: string | null } {
  if (typeof v === 'string' && (LEGACY_FONTS as readonly string[]).includes(v))
    return { font: v as FontKey, note: null };
  if (typeof v === 'string' && v.startsWith('f:'))
    return { font: 'sans', note: '匯入的文件字型（改用黑體）' };
  return { font: 'sans', note: null };
}

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
function legacySettings(raw: unknown, light: boolean) {
  const s = isObj(raw) ? { ...raw } : {};
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

interface Variant {
  name: string;
  color?: string;
  nameColor?: string;
  size?: number;
  nameSize?: number;
  borderW?: number;
  emoji?: string;
  icon?: string;
  noAvatar?: boolean;
  shape?: string;
  noBorder?: boolean;
  noBg?: boolean;
  borderOn?: boolean;
  bgOn?: boolean;
  image?: string;
  imageSrc?: string;
  crop?: { zoom: number; ox: number; oy: number };
  labels?: number[];
  frame?: string;
}

export function convertLegacy(data: Record<string, unknown>): LegacyImport {
  const skipped = new Set<string>();
  const prefs = isObj(data.prefs) ? data.prefs : {};
  const light = !!prefs.light || prefs.theme === 'light';
  const format = num(data.format);
  /* 角色庫：條目 → 變體 */
  const lib = new Map<
    number,
    { variants: Map<number, Variant>; first: Variant | null; font?: string; info?: string }
  >();
  for (const e of Array.isArray(data.library) ? data.library : []) {
    if (!isObj(e) || !fin(e.id)) continue;
    const variants = new Map<number, Variant>();
    let first: Variant | null = null;
    if (Array.isArray(e.variants)) {
      for (const v of e.variants) {
        if (!isObj(v) || !fin(v.id)) continue;
        const vv = v as unknown as Variant;
        variants.set(num(v.id), vv);
        first ??= vv;
      }
      if (e.variants.length > 1) skipped.add('角色的變體（只用每張分頁正在用的那一套）');
    } else {
      /* format 3：單一身分 */
      first = e as unknown as Variant;
    }
    if (typeof e.info === 'string' && e.info) skipped.add('角色資訊');
    if (typeof e.font === 'string' && e.font) skipped.add('角色字型');
    lib.set(num(e.id), { variants, first });
  }
  const labels: Label[] = [];
  for (const l of Array.isArray(data.labels) ? data.labels : []) {
    if (!isObj(l) || !fin(l.id)) continue;
    labels.push({ id: Math.trunc(num(l.id)), text: String(l.text ?? '').slice(0, 100) });
    if (l.hidden || l.zone || l.noPull || l.frame)
      skipped.add('標籤的隱藏、引力、陣營框、頭像框設定');
  }
  const legacyTags = Array.isArray(data.relTypes)
    ? data.relTypes
    : Array.isArray(data.tags)
      ? data.tags
      : [];
  const sheets: Sheet[] = [];
  const avatars = new Map<Sheet, Map<number, LegacyAvatar>>();
  const backgrounds = new Map<Sheet, string>();
  let nextLocal = -1;
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
      const lineW = num(t.lineW);
      const ow = num(t.outlineW);
      const mag = Math.round(num(t.magLevel));
      types.push(
        makeType(Math.trunc(num(t.id)), String(t.label ?? '').slice(0, 200), {
          color: safeColor(t.color),
          outlineColor: safeColor(t.outlineColor),
          lineStyle: (t.lineStyle as RelType['lineStyle']) ?? 'solid',
          capStyle: (t.capStyle as RelType['capStyle']) ?? 'arrow',
          lineW: Number.isFinite(lineW) && lineW >= 1 ? lineW : null,
          outlineW: Number.isFinite(ow) && ow >= 0 ? ow : null,
          mag: mag >= 1 && mag <= 5 ? mag : 3,
          hidden: !!t.hidden,
          hideInLegend: !!t.hideInLegend,
          pairSkip: t.pairSkip === true,
        }),
      );
    }
    const chars: Char[] = [];
    const av = new Map<number, LegacyAvatar>();
    for (const c of Array.isArray(sh.chars) ? sh.chars : []) {
      if (!isObj(c) || !fin(c.id)) continue;
      if (c.sticky) {
        skipped.add('便利貼');
        continue;
      }
      const e = fin(c.libId) ? lib.get(num(c.libId)) : undefined;
      const v: Variant =
        (e && fin(c.varId) ? e.variants.get(num(c.varId)) : undefined) ??
        e?.first ??
        (c as unknown as Variant);
      const id = Math.trunc(num(c.id));
      const level =
        format >= 6
          ? fin(c.level)
            ? Math.trunc(num(c.level))
            : 0
          : num(c.level) >= 1 && num(c.level) <= 6
            ? 7 - num(c.level)
            : 0;
      const sz = num(v.size);
      const ns = num(v.nameSize);
      const bw = num(v.borderW);
      const shape: Shape = v.shape === 'circle' || v.shape === 'square' ? v.shape : '';
      const ch = makeChar(id, String(v.name ?? c.name ?? '').slice(0, 500), num(c.x), num(c.y), {
        defNo: fin(c.defNo) ? Math.max(1, Math.trunc(num(c.defNo))) : 0,
        level,
        locked: !!c.locked,
        relIgnore: !!c.relIgnore,
        color: safeColor(v.color ?? c.color),
        nameColor: safeColor(v.nameColor ?? c.nameColor),
        icon: typeof v.icon === 'string' ? v.icon : null,
        noAvatar: !!v.noAvatar,
        shape,
        noBorder: !!v.noBorder,
        noBg: !!v.noBg,
        borderOn: !!v.borderOn,
        bgOn: !!v.bgOn,
        size: Number.isFinite(sz) && sz >= 32 ? sz : null,
        nameSize: Number.isFinite(ns) && ns >= 1 ? ns : null,
        borderW: Number.isFinite(bw) && bw >= 1 ? bw : null,
        labels: Array.isArray(v.labels)
          ? v.labels.map((x) => Math.trunc(num(x))).filter(Number.isFinite)
          : [],
      });
      if (v.emoji && !v.image) skipped.add('表情符號頭像（改成名字的第一個字）');
      if (v.frame) skipped.add('頭像框');
      const img =
        typeof v.image === 'string'
          ? v.image
          : typeof (c as { image?: unknown }).image === 'string'
            ? String((c as { image?: unknown }).image)
            : null;
      if (img) {
        const src = typeof v.imageSrc === 'string' ? v.imageSrc : null;
        const crop =
          isObj(v.crop) && src
            ? { zoom: num(v.crop.zoom) || 1, ox: num(v.crop.ox) || 0, oy: num(v.crop.oy) || 0 }
            : null;
        av.set(id, { img, src, crop });
      }
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
    if (Array.isArray(sh.notes) && sh.notes.length) skipped.add('便利貼');
    if (Array.isArray(sh.groupRels) && sh.groupRels.length) skipped.add('群體關係');
    if (isObj(sh.views) && Object.keys(sh.views).length) skipped.add('看法');
    if (typeof sh.lore === 'string' && sh.lore) skipped.add('世界觀');
    if (typeof sh.memo === 'string' && sh.memo) skipped.add('備忘錄');
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
      settings: legacySettings(sh.settings, light),
    };
    sheets.push(sheet);
    avatars.set(sheet, av);
    if (typeof sh.bgImage === 'string' && sh.bgImage) backgrounds.set(sheet, sh.bgImage);
  }
  if (Array.isArray(data.sheetLibrary) && data.sheetLibrary.length) skipped.add('分頁庫');
  if (Array.isArray(data.radarLib) && data.radarLib.length) skipped.add('雷達圖');
  if (Array.isArray(data.noteBin) && data.noteBin.length) skipped.add('便利貼庫');
  if (Array.isArray(data.settingsLib) && data.settingsLib.length) skipped.add('設定集');
  if (!sheets.length) throw new LegacyFileError('原作的專案檔裡沒有分頁。');
  const docFont = legacyFont(data.docFont);
  return {
    sheets,
    avatars,
    backgrounds,
    labels,
    activeIdx: Math.min(Math.max(0, num(data.activeSheetIdx) || 0), sheets.length - 1),
    light,
    font: docFont.font,
    fontNote: docFont.note,
    skipped: [...skipped],
  };
}
