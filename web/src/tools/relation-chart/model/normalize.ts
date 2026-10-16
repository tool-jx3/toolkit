/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 預設值與整理（原作的 SHEET_SETTINGS_DEFAULTS／sanitizeSettings、各種 normalize）：自動儲存、專案檔、
 * 原作的專案檔讀進來時都過這一關（範圍外的值換回預設、顏色只收合法的寫法）。
 */
import type { FramePlacement } from '@/core/image';
import { dropCharLabels } from './charLabels';
import { syncLibrary } from './library';
import type {
  Avatar,
  CapStyle,
  Char,
  CharEntry,
  CharFont,
  ChartKind,
  ColorValue,
  FontFormat,
  FontItem,
  FontKey,
  FontValue,
  FrameItem,
  GroupRel,
  Label,
  LayoutKind,
  LegendPos,
  LineStyle,
  Project,
  RadarTpl,
  RadarVals,
  Rel,
  RelEntry,
  RelType,
  RelVariant,
  Shape,
  Sheet,
  SheetSettings,
  Variant,
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
  showLabelNodes: false,
  showFreeLbls: false,
  lblNodeScale: 1,
  viewerHiddenLbls: true,
  showZones: true,
  zoneOutline: true,
  zoneEdgeW: 1.5,
  zoneFillOp: 0.13,
  zoneLink: 5,
  zoneThick: 5,
  zoneLayerStep: 5,
  zoneBlend: true,
  showLblLegend: false,
  lblLegendPos: 'right',
  labelPos: {},
  zoneNameAng: {},
  defFrame: '',
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

/** 資產 id（圖片、頭像框、字型） */
export const assetId = (v: unknown): string | null =>
  typeof v === 'string' && /^[0-9a-z]{6,80}$/i.test(v) ? v : null;

/** 字型的值：內建字型組或 `f:<資產 id>` */
export function fontValue(v: unknown): FontValue | null {
  if (FONT_KEYS.includes(v as FontKey)) return v as FontKey;
  if (typeof v === 'string' && v.startsWith('f:') && assetId(v.slice(2))) return v as FontValue;
  return null;
}

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
    'showLabelNodes',
    'showFreeLbls',
    'showLblLegend',
  ] as const) {
    if (s[k] !== undefined) out[k] = !!s[k];
  }
  for (const k of [
    'showNames',
    'showLegend',
    'viewerHiddenLbls',
    'showZones',
    'zoneOutline',
    'zoneBlend',
  ] as const) {
    if (s[k] !== undefined) out[k] = !!s[k];
  }
  out.legendPos = LEGEND_POSITIONS.includes(s.legendPos as LegendPos)
    ? (s.legendPos as LegendPos)
    : d.legendPos;
  out.charLegendPos = LEGEND_POSITIONS.includes(s.charLegendPos as LegendPos)
    ? (s.charLegendPos as LegendPos)
    : d.charLegendPos;
  out.lblLegendPos = LEGEND_POSITIONS.includes(s.lblLegendPos as LegendPos)
    ? (s.lblLegendPos as LegendPos)
    : d.lblLegendPos;
  /* 標籤與陣營框（原作 sanitizeSettings 的範圍與刻度） */
  const step10 = (v: unknown) => Math.round(inRange(v, 0, 10, 5));
  out.zoneLink = step10(s.zoneLink);
  out.zoneThick = step10(s.zoneThick);
  out.zoneLayerStep = step10(s.zoneLayerStep);
  out.zoneEdgeW = Math.round(inRange(s.zoneEdgeW, 0.5, 8, 1.5) * 2) / 2;
  out.zoneFillOp = Math.round(inRange(s.zoneFillOp, 0.02, 0.6, 0.13) * 100) / 100;
  out.lblNodeScale = Math.round(inRange(s.lblNodeScale, 0.5, 2, 1) * 20) / 20;
  const lp: Record<string, { x: number; y: number }> = {};
  if (isObj(s.labelPos))
    for (const [k, v] of Object.entries(s.labelPos)) {
      if (!Number.isFinite(num(k)) || !isObj(v) || !finite(v.x) || !finite(v.y)) continue;
      lp[String(Math.trunc(num(k)))] = {
        x: Math.round(num(v.x) * 10) / 10,
        y: Math.round(num(v.y) * 10) / 10,
      };
    }
  out.labelPos = lp;
  const na: Record<string, number> = {};
  if (isObj(s.zoneNameAng))
    for (const [k, v] of Object.entries(s.zoneNameAng))
      if (Number.isFinite(num(k)) && finite(v)) na[String(Math.trunc(num(k)))] = num(v);
  out.zoneNameAng = na;
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
  out.defFrame = assetId(s.defFrame) ?? '';
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

/** 頭像框的參照：null＝跟隨標籤、''＝不使用框、資產 id */
const frameRef = (v: unknown): string | null => (v === '' ? '' : assetId(v));
const intList = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map((l) => Math.trunc(num(l))).filter(Number.isFinite))] : [];
const charFont = (v: unknown): CharFont => fontValue(v) ?? '';

/** 外觀欄位（實例與變體共用的整理） */
function looks(raw: Record<string, unknown>) {
  return {
    name: str(raw.name, 500),
    color: safeColor(raw.color),
    nameColor: safeColor(raw.nameColor),
    avatar: normalizeAvatar(raw.avatar),
    icon: typeof raw.icon === 'string' && /^[a-z]{2,20}$/.test(raw.icon) ? raw.icon : null,
    noAvatar: bool(raw.noAvatar),
    shape: SHAPES.includes(raw.shape as Shape) ? (raw.shape as Shape) : ('' as Shape),
    noBorder: bool(raw.noBorder),
    noBg: bool(raw.noBg),
    borderOn: bool(raw.borderOn),
    bgOn: bool(raw.bgOn),
    size: optNum(raw.size, 32),
    nameSize: optNum(raw.nameSize, 1),
    borderW: optNum(raw.borderW, 1),
    labels: intList(raw.labels),
    frame: frameRef(raw.frame),
  };
}

export function normalizeChar(raw: unknown, fallbackId: number): Char | null {
  if (!isObj(raw)) return null;
  const id = finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId;
  const x = num(raw.x);
  const y = num(raw.y);
  return {
    id,
    lib: finite(raw.lib) ? Math.trunc(num(raw.lib)) : 0,
    vari: finite(raw.vari) ? Math.trunc(num(raw.vari)) : 0,
    x: Number.isFinite(x) ? x : Number.NaN,
    y: Number.isFinite(y) ? y : Number.NaN,
    defNo: finite(raw.defNo) ? Math.max(1, Math.trunc(num(raw.defNo))) : 0,
    level: finite(raw.level) ? Math.trunc(num(raw.level)) : 0,
    locked: bool(raw.locked),
    relIgnore: bool(raw.relIgnore),
    ...looks(raw),
    font: charFont(raw.font),
  };
}

/* ---------- 數值圖表（原作的 sanitizeRadarTpl／sanitizeRadarVals） ---------- */

export const CHART_KINDS: readonly ChartKind[] = ['radar', 'bar', 'line', 'pie', 'gauge'];
export const RADAR_AXES_MIN = 3;
export const RADAR_AXES_MAX = 12;

export function normalizeRadarTpl(raw: unknown): RadarTpl | null {
  if (!isObj(raw) || !finite(raw.id)) return null;
  const axes = (Array.isArray(raw.axes) ? raw.axes : [])
    .filter((a): a is Record<string, unknown> => isObj(a) && finite(a.id))
    .map((a) => {
      const max = num(a.max);
      return {
        id: Math.trunc(num(a.id)),
        label: str(a.label, 100),
        max: Number.isFinite(max) && max > 0 ? max : 100,
        unit: str(a.unit, 20),
      };
    })
    .slice(0, RADAR_AXES_MAX);
  if (axes.length < RADAR_AXES_MIN) return null;
  const rings = Math.trunc(num(raw.rings));
  return {
    id: Math.trunc(num(raw.id)),
    name: str(raw.name, 100),
    axes,
    chart: CHART_KINDS.includes(raw.chart as ChartKind) ? (raw.chart as ChartKind) : 'radar',
    shape: raw.shape === 'circle' ? 'circle' : 'poly',
    rings: Number.isFinite(rings) && rings >= 1 ? Math.min(8, rings) : 4,
    valMode: raw.valMode === 'pct' || raw.valMode === 'none' ? raw.valMode : 'raw',
    shared: bool(raw.shared),
  };
}

export function normalizeRadarVals(raw: unknown): RadarVals[] {
  if (!Array.isArray(raw)) return [];
  const out: RadarVals[] = [];
  for (const s of raw) {
    if (!isObj(s) || !finite(s.tpl)) continue;
    const vals: Record<string, number> = {};
    if (isObj(s.vals))
      for (const [k, v] of Object.entries(s.vals))
        if (Number.isFinite(num(k)) && finite(v)) vals[String(Math.trunc(num(k)))] = num(v);
    out.push({ tpl: Math.trunc(num(s.tpl)), state: str(s.state, 100), vals });
  }
  return out.slice(0, 200);
}

/* ---------- 角色庫、關係庫 ---------- */

export function normalizeVariant(raw: unknown, fallbackId: number): Variant | null {
  if (!isObj(raw)) return null;
  return {
    id: finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId,
    ...looks(raw),
    radars: normalizeRadarVals(raw.radars),
  };
}

export function normalizeEntry(raw: unknown, next: () => number): CharEntry | null {
  if (!isObj(raw)) return null;
  const variants: Variant[] = [];
  for (const v of Array.isArray(raw.variants) ? raw.variants : []) {
    const n = normalizeVariant(v, next());
    if (n && !variants.some((x) => x.id === n.id)) variants.push(n);
  }
  if (!variants.length) return null;
  return {
    id: finite(raw.id) ? Math.trunc(num(raw.id)) : next(),
    variants,
    unified: bool(raw.unified),
    info: str(raw.info, 400000),
    font: charFont(raw.font),
  };
}

function normalizeRelVariant(raw: unknown, fallbackId: number): RelVariant | null {
  const t = normalizeType(raw, fallbackId);
  if (!t) return null;
  return {
    id: t.id,
    label: t.label,
    color: t.color,
    outlineColor: t.outlineColor,
    lineStyle: t.lineStyle,
    capStyle: t.capStyle,
    lineW: t.lineW,
    outlineW: t.outlineW,
    mag: t.mag,
  };
}

export function normalizeRelEntry(raw: unknown, next: () => number): RelEntry | null {
  if (!isObj(raw)) return null;
  const variants: RelVariant[] = [];
  for (const v of Array.isArray(raw.variants) ? raw.variants : []) {
    const n = normalizeRelVariant(v, next());
    if (n && !variants.some((x) => x.id === n.id)) variants.push(n);
  }
  if (!variants.length) return null;
  return { id: finite(raw.id) ? Math.trunc(num(raw.id)) : next(), variants };
}

export const FONT_FORMATS: readonly FontFormat[] = ['ttf', 'otf', 'woff', 'woff2'];

function normalizeFrameItem(raw: unknown): FrameItem | null {
  if (!isObj(raw)) return null;
  const id = assetId(raw.id);
  return id ? { id, name: str(raw.name, 60) } : null;
}

function normalizeFontItem(raw: unknown): FontItem | null {
  if (!isObj(raw)) return null;
  const id = assetId(raw.id);
  if (!id) return null;
  return {
    id,
    name: str(raw.name, 100),
    fmt: FONT_FORMATS.includes(raw.fmt as FontFormat) ? (raw.fmt as FontFormat) : 'ttf',
  };
}

/** 看法（原作的 setView／sanitizeViews）：換行與 Tab 壓成一個空白、去頭尾空白、最多 120 字 */
export function viewText(v: unknown): string {
  return typeof v === 'string'
    ? v
        .replace(/[\r\n\t]+/g, ' ')
        .trim()
        .slice(0, 120)
    : '';
}

/** 看法：不能對自己寫、空的不留 */
export function normalizeViews(raw: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!isObj(raw)) return out;
  for (const [a, row] of Object.entries(raw)) {
    if (!Number.isFinite(num(a)) || !isObj(row)) continue;
    const ka = String(Math.trunc(num(a)));
    for (const [b, t] of Object.entries(row)) {
      if (!Number.isFinite(num(b))) continue;
      const kb = String(Math.trunc(num(b)));
      const text = viewText(t);
      if (!text || ka === kb) continue;
      out[ka] = out[ka] ?? {};
      out[ka][kb] = text;
    }
  }
  return out;
}

export function normalizeType(raw: unknown, fallbackId: number): RelType | null {
  if (!isObj(raw)) return null;
  const lineW = optNum(raw.lineW, 1);
  const ow = num(raw.outlineW);
  const mag = Math.round(num(raw.mag));
  return {
    id: finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId,
    lib: finite(raw.lib) ? Math.trunc(num(raw.lib)) : 0,
    vari: finite(raw.vari) ? Math.trunc(num(raw.vari)) : 0,
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
    grels: [],
    collapsed: [],
    views: {},
    ...base,
  };
}

/* ---------- 群體關係（原作的 sanitizeGrels：只驗形狀，端點在不在由讀取端判斷） ---------- */

export const GREL_END_RE = /^[CL]-?\d+$/;

export function normalizeGrel(raw: unknown, fallbackId: number): GroupRel | null {
  if (!isObj(raw)) return null;
  const from = String(raw.from ?? '');
  const to = String(raw.to ?? '');
  if (!GREL_END_RE.test(from) || !GREL_END_RE.test(to) || from === to) return null;
  const type = Math.trunc(num(raw.type ?? raw.tagId ?? raw.relTypeId));
  if (!Number.isFinite(type)) return null;
  const ex = Array.isArray(raw.except)
    ? [...new Set(raw.except.map((x) => Math.trunc(num(x))).filter(Number.isFinite))].slice(0, 500)
    : [];
  return {
    id: finite(raw.id) ? Math.trunc(num(raw.id)) : fallbackId,
    from,
    to,
    type,
    both: bool(raw.both),
    inherit: bool(raw.inherit),
    note: str(raw.note, 500),
    except: ex,
  };
}

export function normalizeLabel(raw: unknown): Label | null {
  if (!isObj(raw) || !finite(raw.id)) return null;
  return {
    id: Math.trunc(num(raw.id)),
    text: str(raw.text, 100),
    color: safeColor(raw.color),
    hidden: bool(raw.hidden),
    noPull: bool(raw.noPull),
    zone: bool(raw.zone),
    frame: assetId(raw.frame) ?? '',
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
  const grels: GroupRel[] = [];
  for (const g of Array.isArray(raw.grels) ? raw.grels : []) {
    const n = normalizeGrel(g, auto--);
    if (n && !grels.some((x) => x.id === n.id)) grels.push(n);
  }
  const collapsed = Array.isArray(raw.collapsed)
    ? [...new Set(raw.collapsed.map((x) => Math.trunc(num(x))).filter(Number.isFinite))]
    : [];
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
    grels,
    collapsed,
    views: normalizeViews(raw.views),
  };
}

/** 一個專案用到的最大 id */
export function maxIdOf(
  p: Pick<Project, 'sheets' | 'labels'> &
    Partial<Pick<Project, 'library' | 'relLibrary' | 'radarTpls'>>,
): number {
  let m = 0;
  for (const s of p.sheets) {
    m = Math.max(m, s.id);
    for (const c of s.chars) m = Math.max(m, c.id);
    for (const r of s.rels) m = Math.max(m, r.id);
    for (const t of s.types) m = Math.max(m, t.id);
    for (const g of s.grels ?? []) m = Math.max(m, g.id);
  }
  for (const l of p.labels) m = Math.max(m, l.id);
  for (const e of p.library ?? []) {
    m = Math.max(m, e.id);
    for (const v of e.variants) m = Math.max(m, v.id);
  }
  for (const e of p.relLibrary ?? []) {
    m = Math.max(m, e.id);
    for (const v of e.variants) m = Math.max(m, v.id);
  }
  for (const t of p.radarTpls ?? []) {
    m = Math.max(m, t.id);
    for (const a of t.axes) m = Math.max(m, a.id);
  }
  return m;
}

/** 群體關係端點的角色 id 換成新的（`C<id>`）；標籤端照舊 */
export const remapGrelEnd = (e: string, charMap: ReadonlyMap<number, number>): string =>
  e[0] === 'C' ? `C${charMap.get(Number(e.slice(1))) ?? Number(e.slice(1))}` : e;

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
    for (const g of s.grels) {
      if (g.id <= 0) g.id = take();
      g.from = remapGrelEnd(g.from, charMap);
      g.to = remapGrelEnd(g.to, charMap);
      g.type = typeMap.get(g.type) ?? g.type;
      g.except = g.except.map((x) => charMap.get(x) ?? x);
    }
    if (charMap.size) s.views = remapViews(s.views, charMap);
  }
  /* 角色庫、關係庫：臨時給的 id 換成新的（實例的綁定跟著換） */
  const entryMap = new Map<number, number>();
  const varMap = new Map<number, number>();
  for (const e of p.library) {
    if (e.id <= 0) {
      const nid = take();
      entryMap.set(e.id, nid);
      e.id = nid;
    }
    for (const v of e.variants)
      if (v.id <= 0) {
        const nid = take();
        varMap.set(v.id, nid);
        v.id = nid;
      }
  }
  const relEntryMap = new Map<number, number>();
  const relVarMap = new Map<number, number>();
  for (const e of p.relLibrary) {
    if (e.id <= 0) {
      const nid = take();
      relEntryMap.set(e.id, nid);
      e.id = nid;
    }
    for (const v of e.variants)
      if (v.id <= 0) {
        const nid = take();
        relVarMap.set(v.id, nid);
        v.id = nid;
      }
  }
  for (const s of p.sheets) {
    for (const c of s.chars) {
      c.lib = entryMap.get(c.lib) ?? c.lib;
      c.vari = varMap.get(c.vari) ?? c.vari;
    }
    for (const t of s.types) {
      t.lib = relEntryMap.get(t.lib) ?? t.lib;
      t.vari = relVarMap.get(t.vari) ?? t.vari;
    }
  }
  p.nextId = Math.max(next, maxIdOf(p) + 1);
}

/** 看法的兩層 key 換成新的角色 id */
export function remapViews(
  views: Record<string, Record<string, string>>,
  charMap: ReadonlyMap<number, number>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [a, row] of Object.entries(views)) {
    const na = String(charMap.get(Number(a)) ?? a);
    for (const [b, t] of Object.entries(row)) {
      out[na] = out[na] ?? {};
      out[na][String(charMap.get(Number(b)) ?? b)] = t;
    }
  }
  return out;
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
    library: [],
    relLibrary: [],
    radarTpls: [],
    frames: [],
    fonts: [],
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
    const n = normalizeLabel(l);
    if (n && !labels.some((x) => x.id === n.id)) labels.push(n);
  }
  const library: CharEntry[] = [];
  for (const e of Array.isArray(raw.library) ? raw.library : []) {
    const n = normalizeEntry(e, () => auto--);
    if (n && !library.some((x) => x.id === n.id)) library.push(n);
  }
  /* 變體 id 全專案唯一（重複的換一個） */
  const seenVar = new Set<number>();
  for (const e of library)
    for (const v of e.variants) {
      if (seenVar.has(v.id)) v.id = auto--;
      seenVar.add(v.id);
    }
  const relLibrary: RelEntry[] = [];
  for (const e of Array.isArray(raw.relLibrary) ? raw.relLibrary : []) {
    const n = normalizeRelEntry(e, () => auto--);
    if (n && !relLibrary.some((x) => x.id === n.id)) relLibrary.push(n);
  }
  const seenRelVar = new Set<number>();
  for (const e of relLibrary)
    for (const v of e.variants) {
      if (seenRelVar.has(v.id)) v.id = auto--;
      seenRelVar.add(v.id);
    }
  const radarTpls: RadarTpl[] = [];
  for (const t of Array.isArray(raw.radarTpls) ? raw.radarTpls : []) {
    const n = normalizeRadarTpl(t);
    if (n && !radarTpls.some((x) => x.id === n.id)) radarTpls.push(n);
  }
  const frames: FrameItem[] = [];
  for (const f of Array.isArray(raw.frames) ? raw.frames : []) {
    const n = normalizeFrameItem(f);
    if (n && !frames.some((x) => x.id === n.id)) frames.push(n);
  }
  const fonts: FontItem[] = [];
  for (const f of Array.isArray(raw.fonts) ? raw.fonts : []) {
    const n = normalizeFontItem(f);
    if (n && !fonts.some((x) => x.id === n.id)) fonts.push(n);
  }
  const p: Project = {
    sheets,
    active: Math.min(sheets.length - 1, Math.max(0, Math.trunc(num(raw.active)) || 0)),
    labels,
    nextId: finite(raw.nextId) ? Math.max(1, Math.trunc(num(raw.nextId))) : 1,
    font: fontValue(raw.font) ?? 'sans',
    library,
    relLibrary,
    radarTpls,
    frames,
    fonts,
  };
  fixIds(p);
  fixDefNos(p);
  /* 角色（實例與變體）的標籤只留專案裡存在的；收合名單只留還是陣營框的標籤（原作 computeColMaps 的自清） */
  const lblIds = new Set(p.labels.map((l) => l.id));
  const zoneIds = new Set(p.labels.filter((l) => l.zone).map((l) => l.id));
  for (const e of p.library)
    for (const v of e.variants)
      if (v.labels.some((id) => !lblIds.has(id)))
        v.labels = v.labels.filter((id) => lblIds.has(id));
  for (const s of p.sheets) {
    for (const c of s.chars) dropCharLabels(c, (id) => !lblIds.has(id));
    s.collapsed = s.collapsed.filter((id) => zoneIds.has(id));
  }
  /* 三層對齊：沒有條目的實例建一筆（舊版的資料）、副本照變體；關係類型收錄進關係庫 */
  syncLibrary(p, null);
  /* 座標壞掉的角色放到畫布中央（之後的排列會再處理） */
  for (const s of p.sheets)
    for (const c of s.chars) {
      if (!Number.isFinite(c.x)) c.x = s.W / 2;
      if (!Number.isFinite(c.y)) c.y = s.H / 2;
    }
  return p;
}

/** 角色資訊裡的圖片（`rcimg:<資產 id>`） */
export function richImageIds(html: string): string[] {
  return [...html.matchAll(/rcimg:([0-9a-z]{6,80})/gi)].map((m) => m[1]);
}

/** 用到的資產 id（背景圖、頭像〔所有變體〕、頭像框、匯入的字型、角色資訊裡的圖片） */
export function projectAssetIds(p: Project): string[] {
  const out = new Set<string>();
  const av = (a: Avatar | null) => {
    if (!a) return;
    out.add(a.img);
    if (a.src) out.add(a.src);
  };
  for (const s of p.sheets) {
    if (s.bg) out.add(s.bg);
    for (const c of s.chars) av(c.avatar);
  }
  for (const e of p.library ?? []) {
    for (const v of e.variants) av(v.avatar);
    for (const id of richImageIds(e.info)) out.add(id);
  }
  for (const f of p.frames ?? []) out.add(f.id);
  for (const f of p.fonts ?? []) out.add(f.id);
  return [...out];
}
