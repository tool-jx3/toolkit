/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 預設值與整理（原作的 SHEET_SETTINGS_DEFAULTS／sanitizeSettings、各種 normalize）：自動儲存、專案檔、
 * 原作的專案檔讀進來時都過這一關（範圍外的值換回預設、顏色只收合法的寫法）。
 */
import type { FramePlacement } from '@/core/image';
import type {
  Avatar,
  CapStyle,
  Char,
  ColorValue,
  FontKey,
  Label,
  LayoutKind,
  LegendPos,
  LineStyle,
  Project,
  Rel,
  RelType,
  Shape,
  Sheet,
  SheetSettings,
} from './types';

export const LINE_STYLES: readonly LineStyle[] = [
  'solid',
  'dashed',
  'dotted',
  'wavy',
  'zigzag',
  'square',
  'lace',
  'hearts',
  'stars',
  'melody',
];
export const CAP_STYLES: readonly CapStyle[] = [
  'arrow',
  'harrow',
  'dot',
  'hdot',
  'diamond',
  'hdiamond',
  'block',
  'bar',
  'heart',
  'star',
  'none',
];
export const LEGEND_POSITIONS: readonly LegendPos[] = [
  'top',
  'bottom',
  'left',
  'right',
  'topOut',
  'bottomOut',
  'leftOut',
  'rightOut',
];
export const LAYOUT_KINDS: readonly LayoutKind[] = [
  'circle',
  'line',
  'vline',
  'cross',
  'triangle',
  'square',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'heart',
  'random',
];
export const FONT_KEYS: readonly FontKey[] = ['sans', 'serif', 'round', 'kai', 'mono'];

/** 新畫布 */
export const DEFAULT_W = 1000;
export const DEFAULT_H = 1000;

export const SETTINGS_DEFAULTS: Readonly<SheetSettings> = Object.freeze({
  palette: 'dark',
  bgMode: 'none',
  gridStep: 50,
  gridSnap: false,
  shapeSquare: false,
  bridgeMode: false,
  showNames: true,
  showLegend: true,
  showRelName: false,
  showRelNote: false,
  showCharLegend: false,
  legendPos: 'bottom',
  charLegendPos: 'leftOut',
  noCollision: false,
  focusDim: 0.15,
  relOpacity: 1,
  defNoBorder: false,
  defNoBg: false,
  spacingPct: 100,
  edgeGapPx: 18,
  magCenter: 0.5,
  magRepel: 10,
  magLink: 1,
  magDist: 265,
  snapMode: false,
  pinFlip: false,
  fitLayout: false,
  lastLayout: 'circle',
  layoutNoStagger: false,
  wrapCaps: {},
  defCharSize: 0,
  defBorderW: 0,
  defNameSize: 0,
  defRelNameSize: 0,
  defNoteSize: 0,
  defLineW: 0,
  edgeStraight: false,
  colAvatarRing: 'auto',
  colAvatarBg: 'auto',
  colNameStroke: 'auto',
  colNameText: 'auto',
  colRelLine: 'auto',
  colRelText: 'auto',
  colRelOutline: 'auto',
}) as SheetSettings;

export const newSettings = (base?: SheetSettings): SheetSettings =>
  JSON.parse(JSON.stringify(base ?? SETTINGS_DEFAULTS)) as SheetSettings;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** 數字或數字字串才算數（null、空字串、true 都不是 0） */
const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
const finite = (v: unknown): boolean => Number.isFinite(num(v));
const inRange = (v: unknown, lo: number, hi: number, def: number): number => {
  const n = num(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : def;
};
const bool = (v: unknown): boolean => v === true;
const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');

/* ---------- 顏色（原作的 parseStoredColor／safeColor：只收合法寫法，其餘回退） ---------- */

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/** 顏色字串 → `auto`、`#rrggbb` 或 `#rrggbbaa`（看不懂時 fallback） */
export function safeColor(value: unknown, fallback: ColorValue = 'auto'): ColorValue {
  if (value === undefined || value === null || value === '' || value === 'auto') return fallback;
  const s = String(value).trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const r = m[1];
    return `#${r[0]}${r[0]}${r[1]}${r[1]}${r[2]}${r[2]}`.toLowerCase();
  }
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) {
    if (!m[2] || m[2].toLowerCase() === 'ff') return `#${m[1]}`.toLowerCase();
    return `#${m[1]}${m[2]}`.toLowerCase();
  }
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (m) {
    const a = m[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(m[4]) || 0));
    const base = `#${hex2(Number(m[1]))}${hex2(Number(m[2]))}${hex2(Number(m[3]))}`;
    return a >= 0.995 ? base : `${base}${hex2(a * 255)}`;
  }
  return fallback;
}

/** 有沒有設顏色（不是 auto） */
export const ownColor = (v: ColorValue | null | undefined): string | null =>
  v && v !== 'auto' ? v : null;

/* ---------- 分頁設定 ---------- */

export function normalizeSettings(raw: unknown): SheetSettings {
  const s: Record<string, unknown> = isObj(raw) ? raw : {};
  const out = newSettings();
  const d = SETTINGS_DEFAULTS;
  out.palette = s.palette === 'light' ? 'light' : 'dark';
  out.bgMode = s.bgMode === 'grid' || s.bgMode === 'axis' ? s.bgMode : 'none';
  for (const k of [
    'gridSnap',
    'shapeSquare',
    'bridgeMode',
    'showRelName',
    'showRelNote',
    'showCharLegend',
    'noCollision',
    'defNoBorder',
    'defNoBg',
    'snapMode',
    'pinFlip',
    'fitLayout',
    'layoutNoStagger',
    'edgeStraight',
  ] as const) {
    if (s[k] !== undefined) out[k] = !!s[k];
  }
  for (const k of ['showNames', 'showLegend'] as const) {
    if (s[k] !== undefined) out[k] = !!s[k];
  }
  out.legendPos = LEGEND_POSITIONS.includes(s.legendPos as LegendPos)
    ? (s.legendPos as LegendPos)
    : d.legendPos;
  out.charLegendPos = LEGEND_POSITIONS.includes(s.charLegendPos as LegendPos)
    ? (s.charLegendPos as LegendPos)
    : d.charLegendPos;
  out.lastLayout = LAYOUT_KINDS.includes(s.lastLayout as LayoutKind)
    ? (s.lastLayout as LayoutKind)
    : 'circle';
  out.gridStep = finite(s.gridStep)
    ? Math.round(inRange(s.gridStep, 10, 200, 50) / 5) * 5
    : d.gridStep;
  out.focusDim = Math.round(inRange(s.focusDim, 0, 0.6, d.focusDim) * 100) / 100;
  out.relOpacity = Math.round(inRange(s.relOpacity, 0.25, 1, 1) * 100) / 100;
  out.spacingPct = Math.round(inRange(s.spacingPct, 10, 1000, 100));
  out.edgeGapPx = Math.round(inRange(s.edgeGapPx, 0, 200, 18));
  out.magCenter = inRange(s.magCenter, 0, 1, d.magCenter);
  out.magRepel = inRange(s.magRepel, 0, 20, d.magRepel);
  out.magLink = inRange(s.magLink, 0, 1, d.magLink);
  out.magDist = Math.round(inRange(s.magDist, 30, 500, d.magDist));
  /* 整體設定的數值：0＝自動；範圍外視為自動 */
  const auto = (v: unknown, lo: number, hi: number) => {
    const n = num(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : 0;
  };
  out.defCharSize = auto(s.defCharSize, 32, 2000);
  out.defBorderW = auto(s.defBorderW, 1, 99);
  out.defNameSize = auto(s.defNameSize, 1, 200);
  out.defRelNameSize = auto(s.defRelNameSize, 1, 200);
  out.defNoteSize = auto(s.defNoteSize, 1, 200);
  out.defLineW = auto(s.defLineW, 1, 99);
  for (const k of [
    'colAvatarRing',
    'colAvatarBg',
    'colNameStroke',
    'colNameText',
    'colRelLine',
    'colRelText',
    'colRelOutline',
  ] as const) {
    out[k] = safeColor(s[k], 'auto');
  }
  const wc: Record<string, number> = {};
  if (isObj(s.wrapCaps)) {
    for (const [k, v] of Object.entries(s.wrapCaps)) {
      const lv = Math.trunc(num(k));
      const n = Math.trunc(num(v));
      if (Number.isFinite(lv) && Number.isFinite(n) && n >= 2 && n <= 999) wc[String(lv)] = n;
    }
  }
  out.wrapCaps = wc;
  return out;
}

/* ---------- 角色、關係、關係類型 ---------- */

const SHAPES: readonly Shape[] = ['', 'circle', 'square'];

function normalizePlacement(v: unknown): FramePlacement | null {
  if (!isObj(v)) return null;
  const zoom = num(v.zoom);
  const x = num(v.x);
  const y = num(v.y);
  const turns = Math.round(num(v.turns));
  if (![zoom, x, y].every(Number.isFinite) || zoom <= 0) return null;
  return { zoom, x, y, turns: Number.isFinite(turns) ? ((turns % 4) + 4) % 4 : 0 };
}

const assetId = (v: unknown): string | null =>
  typeof v === 'string' && /^[0-9a-z]{6,80}$/i.test(v) ? v : null;

function normalizeAvatar(v: unknown): Avatar | null {
  if (!isObj(v)) return null;
  const img = assetId(v.img);
  if (!img) return null;
  return { img, src: assetId(v.src), place: normalizePlacement(v.place) };
}

const optNum = (v: unknown, min: number): number | null => {
  const n = num(v);
  return Number.isFinite(n) && n >= min ? Math.round(n * 10) / 10 : null;
};

export function normalizeChar(raw: unknown, fallbackId: number): Char | null {
  if (!isObj(raw)) return null;
  const id = finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId;
  const x = num(raw.x);
  const y = num(raw.y);
  return {
    id,
    name: str(raw.name, 500),
    x: Number.isFinite(x) ? x : Number.NaN,
    y: Number.isFinite(y) ? y : Number.NaN,
    defNo: finite(raw.defNo) ? Math.max(1, Math.trunc(num(raw.defNo))) : 0,
    level: finite(raw.level) ? Math.trunc(num(raw.level)) : 0,
    locked: bool(raw.locked),
    relIgnore: bool(raw.relIgnore),
    color: safeColor(raw.color),
    nameColor: safeColor(raw.nameColor),
    avatar: normalizeAvatar(raw.avatar),
    icon: typeof raw.icon === 'string' && /^[a-z]{2,20}$/.test(raw.icon) ? raw.icon : null,
    noAvatar: bool(raw.noAvatar),
    shape: SHAPES.includes(raw.shape as Shape) ? (raw.shape as Shape) : '',
    noBorder: bool(raw.noBorder),
    noBg: bool(raw.noBg),
    borderOn: bool(raw.borderOn),
    bgOn: bool(raw.bgOn),
    size: optNum(raw.size, 32),
    nameSize: optNum(raw.nameSize, 1),
    borderW: optNum(raw.borderW, 1),
    labels: Array.isArray(raw.labels)
      ? [...new Set(raw.labels.map((l) => Math.trunc(num(l))).filter(Number.isFinite))]
      : [],
  };
}

export function normalizeType(raw: unknown, fallbackId: number): RelType | null {
  if (!isObj(raw)) return null;
  const lineW = optNum(raw.lineW, 1);
  const ow = num(raw.outlineW);
  const mag = Math.round(num(raw.mag));
  return {
    id: finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId,
    label: str(raw.label, 200),
    color: safeColor(raw.color),
    outlineColor: safeColor(raw.outlineColor),
    lineStyle: LINE_STYLES.includes(raw.lineStyle as LineStyle)
      ? (raw.lineStyle as LineStyle)
      : 'solid',
    capStyle: CAP_STYLES.includes(raw.capStyle as CapStyle) ? (raw.capStyle as CapStyle) : 'arrow',
    lineW,
    outlineW: Number.isFinite(ow) && ow >= 0 ? Math.min(99, ow) : null,
    mag: mag >= 1 && mag <= 5 ? mag : 3,
    hidden: bool(raw.hidden),
    hideInLegend: bool(raw.hideInLegend),
    pairSkip: bool(raw.pairSkip),
  };
}

export function normalizeRel(raw: unknown, fallbackId: number): Rel | null {
  if (!isObj(raw)) return null;
  const from = Math.trunc(num(raw.from));
  const to = Math.trunc(num(raw.to));
  const type = Math.trunc(num(raw.type));
  if (![from, to, type].every(Number.isFinite)) return null;
  const lt = num(raw.labelT);
  const cd = num(raw.curveDir);
  const mag = Math.round(num(raw.mag));
  const sa = num(raw.selfAng);
  return {
    id: finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId,
    from,
    to,
    type,
    both: bool(raw.both),
    note: str(raw.note, 2000),
    labelT: Number.isFinite(lt) ? Math.min(0.95, Math.max(0.05, lt)) : null,
    curveDir: cd === 1 ? 1 : cd === -1 ? -1 : 0,
    flipName: bool(raw.flipName),
    flipNote: bool(raw.flipNote),
    pairSkip: bool(raw.pairSkip),
    mag: mag >= 1 && mag <= 5 ? mag : 0,
    selfAng: Number.isFinite(sa) ? sa : null,
  };
}

export function emptySheet(id: number, defNo: number, base?: Partial<Sheet>): Sheet {
  return {
    id,
    defNo,
    name: '',
    W: DEFAULT_W,
    H: DEFAULT_H,
    chars: [],
    rels: [],
    types: [],
    bg: null,
    settings: newSettings(),
    ...base,
  };
}

const dim = (v: unknown, def: number): number => {
  const n = num(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(100000, Math.round(n)) : def;
};

export function normalizeSheet(raw: unknown, fallbackId: number): Sheet | null {
  if (!isObj(raw)) return null;
  const id = finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId;
  let auto = -1;
  const types: RelType[] = [];
  for (const t of Array.isArray(raw.types) ? raw.types : []) {
    const n = normalizeType(t, auto--);
    if (n && !types.some((x) => x.id === n.id)) types.push(n);
  }
  const chars: Char[] = [];
  for (const c of Array.isArray(raw.chars) ? raw.chars : []) {
    const n = normalizeChar(c, auto--);
    if (n && !chars.some((x) => x.id === n.id)) chars.push(n);
  }
  const charIds = new Set(chars.map((c) => c.id));
  const typeIds = new Set(types.map((t) => t.id));
  const rels: Rel[] = [];
  for (const r of Array.isArray(raw.rels) ? raw.rels : []) {
    const n = normalizeRel(r, auto--);
    if (
      n &&
      charIds.has(n.from) &&
      charIds.has(n.to) &&
      typeIds.has(n.type) &&
      !rels.some((x) => x.id === n.id)
    )
      rels.push(n);
  }
  const W = dim(raw.W, DEFAULT_W);
  return {
    id,
    defNo: finite(raw.defNo) ? Math.max(1, Math.trunc(num(raw.defNo))) : 0,
    name: str(raw.name, 200),
    W,
    H: dim(raw.H, W),
    chars,
    rels,
    types,
    bg: assetId(raw.bg),
    settings: normalizeSettings(raw.settings),
  };
}

/** 一個專案用到的最大 id */
export function maxIdOf(p: Pick<Project, 'sheets' | 'labels'>): number {
  let m = 0;
  for (const s of p.sheets) {
    m = Math.max(m, s.id);
    for (const c of s.chars) m = Math.max(m, c.id);
    for (const r of s.rels) m = Math.max(m, r.id);
    for (const t of s.types) m = Math.max(m, t.id);
  }
  for (const l of p.labels) m = Math.max(m, l.id);
  return m;
}

/** 重新編號：負的（整理時臨時給的）id 換成新的正 id */
function fixIds(p: Project): void {
  let next = Math.max(p.nextId, maxIdOf(p) + 1);
  const take = () => next++;
  const seenSheets = new Set<number>();
  for (const s of p.sheets) {
    if (s.id <= 0 || seenSheets.has(s.id)) s.id = take();
    seenSheets.add(s.id);
    const charMap = new Map<number, number>();
    for (const c of s.chars) {
      if (c.id <= 0) {
        const nid = take();
        charMap.set(c.id, nid);
        c.id = nid;
      }
    }
    const typeMap = new Map<number, number>();
    for (const t of s.types) {
      if (t.id <= 0) {
        const nid = take();
        typeMap.set(t.id, nid);
        t.id = nid;
      }
    }
    for (const r of s.rels) {
      if (r.id <= 0) r.id = take();
      r.from = charMap.get(r.from) ?? r.from;
      r.to = charMap.get(r.to) ?? r.to;
      r.type = typeMap.get(r.type) ?? r.type;
    }
  }
  p.nextId = Math.max(next, maxIdOf(p) + 1);
}

/** 未用的最小正整數 */
export function smallestFree(used: Iterable<number>): number {
  const set = new Set(used);
  let n = 1;
  while (set.has(n)) n++;
  return n;
}

/** 補上預設編號（角色、分頁） */
function fixDefNos(p: Project): void {
  const usedSheet = new Set(p.sheets.map((s) => s.defNo).filter((n) => n > 0));
  for (const s of p.sheets) {
    if (s.defNo <= 0) {
      s.defNo = smallestFree(usedSheet);
      usedSheet.add(s.defNo);
    }
  }
  const usedChar = new Set<number>();
  for (const s of p.sheets) for (const c of s.chars) if (c.defNo > 0) usedChar.add(c.defNo);
  for (const s of p.sheets)
    for (const c of s.chars) {
      if (c.defNo <= 0) {
        c.defNo = smallestFree(usedChar);
        usedChar.add(c.defNo);
      }
    }
}

export function initialProject(): Project {
  return {
    sheets: [emptySheet(1, 1)],
    active: 0,
    labels: [],
    nextId: 2,
    font: 'sans',
  };
}

/** 整理一份專案（壞掉時回傳 null） */
export function normalizeProject(raw: unknown): Project | null {
  if (!isObj(raw) || !Array.isArray(raw.sheets)) return null;
  let auto = -1;
  const sheets: Sheet[] = [];
  for (const s of raw.sheets) {
    const n = normalizeSheet(s, auto--);
    if (n) sheets.push(n);
  }
  if (!sheets.length) return null;
  const labels: Label[] = [];
  for (const l of Array.isArray(raw.labels) ? raw.labels : []) {
    if (!isObj(l) || !finite(l.id)) continue;
    const id = Math.trunc(num(l.id));
    if (labels.some((x) => x.id === id)) continue;
    labels.push({ id, text: str(l.text, 100) });
  }
  const p: Project = {
    sheets,
    active: Math.min(sheets.length - 1, Math.max(0, Math.trunc(num(raw.active)) || 0)),
    labels,
    nextId: finite(raw.nextId) ? Math.max(1, Math.trunc(num(raw.nextId))) : 1,
    font: FONT_KEYS.includes(raw.font as FontKey) ? (raw.font as FontKey) : 'sans',
  };
  fixIds(p);
  fixDefNos(p);
  /* 角色身上的標籤只留專案裡存在的 */
  const lblIds = new Set(p.labels.map((l) => l.id));
  for (const s of p.sheets)
    for (const c of s.chars) c.labels = c.labels.filter((id) => lblIds.has(id));
  /* 座標壞掉的角色放到畫布中央（之後的排列會再處理） */
  for (const s of p.sheets)
    for (const c of s.chars) {
      if (!Number.isFinite(c.x)) c.x = s.W / 2;
      if (!Number.isFinite(c.y)) c.y = s.H / 2;
    }
  return p;
}

/** 用到的圖片資產 id */
export function projectAssetIds(p: Project): string[] {
  const out = new Set<string>();
  for (const s of p.sheets) {
    if (s.bg) out.add(s.bg);
    for (const c of s.chars) {
      if (c.avatar) {
        out.add(c.avatar.img);
        if (c.avatar.src) out.add(c.avatar.src);
      }
    }
  }
  return [...out];
}
