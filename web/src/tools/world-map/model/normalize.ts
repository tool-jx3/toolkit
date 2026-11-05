/**
 * 讀進來的資料一律整理一次：自動儲存、專案檔、原作的作業檔（`.world.json`，format＝kiin-world-atelier、version 1）。
 * 數值夾在範圍裡、壞掉的項目略過、數量照上限截斷；地形的長度不對時整份不收（回傳 null）。
 */
import { assetDef } from './assets';
import { DEFAULT_TITLE, defaultSettings, uid } from './factory';
import { clamp, polygonArea } from './geometry';
import { encodeCells, fixGround, inferGround } from './terrain';
import {
  DEFAULT_COLS,
  DEFAULT_ROWS,
  DOCK_SIDES,
  type DockSide,
  FONT_STYLES,
  type FontStyle,
  LABEL_FONTS,
  type LabelFont,
  LIMITS,
  type MapObject,
  type MapPath,
  type MapSettings,
  type Note,
  PATH_KINDS,
  type PathKind,
  type Pt,
  pathWidthDefault,
  RANGES,
  type Region,
  THEME_IDS,
  type ThemeId,
  type WorldDoc,
} from './types';

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v: unknown, a: number, b: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? clamp(n, a, b) : fallback;
};
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const color = (v: unknown, fallback = '#9c8f74'): string =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
const list = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

export interface NormalizeContext {
  w: number;
  h: number;
  ids: Set<string>;
}

function point(v: unknown, c: NormalizeContext): Pt {
  const o = isObj(v) ? v : {};
  return { x: num(o.x, 0, c.w, c.w / 2), y: num(o.y, 0, c.h, c.h / 2) };
}
const points = (v: unknown, c: NormalizeContext) => list(v, LIMITS.points).map((p) => point(p, c));

function freshId(v: unknown, c: NormalizeContext): string {
  let id = typeof v === 'string' && /^[\w-]{1,64}$/.test(v) && !c.ids.has(v) ? v : uid();
  while (c.ids.has(id)) id = uid();
  c.ids.add(id);
  return id;
}

export function normalizeRegion(v: unknown, c: NormalizeContext): Region | null {
  if (!isObj(v)) return null;
  const pts = points(v.points, c);
  if (pts.length < 3) return null;
  return {
    id: freshId(v.id, c),
    name: str(v.name, LIMITS.name),
    color: color(v.color),
    points: pts,
    opacity: num(v.opacity, RANGES.opacity.min, RANGES.opacity.max, RANGES.opacity.def),
    wall: v.wall === true,
    font: pick<LabelFont>(v.font, LABEL_FONTS, 'auto'),
    curve: num(v.curve, RANGES.curve.min, RANGES.curve.max, 0),
    labelSize: num(
      v.labelSize,
      RANGES.regionLabel.min,
      RANGES.regionLabel.max,
      RANGES.regionLabel.def,
    ),
    labelDx: num(v.labelDx, -c.w, c.w, 0),
    labelDy: num(v.labelDy, -c.h, c.h, 0),
  };
}

export function normalizeObject(
  v: unknown,
  c: NormalizeContext,
  kindKey = 'kind',
): MapObject | null {
  if (!isObj(v)) return null;
  const kind = v[kindKey];
  if (typeof kind !== 'string' || !assetDef(kind)) return null;
  const p = point(v, c);
  const L = RANGES.labelOffset;
  return {
    id: freshId(v.id, c),
    kind,
    x: p.x,
    y: p.y,
    size: num(v.size, RANGES.objectSize.min, RANGES.objectSize.max, RANGES.objectSize.def),
    rotation: num(v.rotation, RANGES.rotation.min, RANGES.rotation.max, 0),
    flip: v.flip === true,
    dock: pick<DockSide>(v.dock ?? v.portSide, DOCK_SIDES, 'auto'),
    name: str(v.name, LIMITS.name),
    secret: v.secret === true,
    labelDx: num(v.labelDx, -L, L, 0),
    labelDy: num(v.labelDy, -L, L, RANGES.labelDy),
  };
}

export function normalizePath(v: unknown, c: NormalizeContext): MapPath | null {
  if (!isObj(v)) return null;
  const kind = v.kind;
  if (!PATH_KINDS.includes(kind as PathKind)) return null;
  const pts = points(v.points, c);
  if (pts.length < 2) return null;
  const k = kind as PathKind;
  return {
    id: freshId(v.id, c),
    kind: k,
    name: str(v.name, LIMITS.name),
    points: pts,
    width: num(v.width, RANGES.width.min, RANGES.width.max, pathWidthDefault(k)),
    smooth: k === 'wall' ? false : v.smooth !== false,
    secret: v.secret === true,
  };
}

export function normalizeNote(v: unknown, c: NormalizeContext): Note | null {
  if (!isObj(v)) return null;
  const p = point(v, c);
  return {
    id: freshId(v.id, c),
    text: str(v.text, LIMITS.note),
    x: p.x,
    y: p.y,
    size: num(v.size, RANGES.noteSize.min, RANGES.noteSize.max, RANGES.noteSize.def),
    rotation: num(v.rotation, RANGES.rotation.min, RANGES.rotation.max, 0),
    font: pick<LabelFont>(v.font, LABEL_FONTS, 'auto'),
    curve: num(v.curve, RANGES.curve.min, RANGES.curve.max, 0),
    secret: v.secret === true,
  };
}

function normalizeSettings(v: unknown, legacy = false): MapSettings {
  const s = isObj(v) ? v : {};
  const d = defaultSettings();
  return {
    frame: bool(s.frame, d.frame),
    names: bool(s.names, d.names),
    details: bool(legacy ? s.terrainDetails : s.details, d.details),
    borders: bool(s.borders, d.borders),
    grid: bool(s.grid, d.grid),
    gridType: s.gridType === 'hex' ? 'hex' : 'square',
    font: pick<FontStyle>(legacy ? s.fontStyle : s.font, FONT_STYLES, 'serif'),
    kmPer100: num(s.kmPer100, RANGES.kmPer100.min, RANGES.kmPer100.max, RANGES.kmPer100.def),
    subtitle: legacy
      ? d.subtitle
      : typeof s.subtitle === 'string'
        ? str(s.subtitle, 60)
        : d.subtitle,
  };
}

const cellsOk = (s: unknown, n: number, allowed: RegExp): s is string =>
  typeof s === 'string' && s.length === n && allowed.test(s);

/** 本站的資料（自動儲存、專案檔） */
export function normalizeDoc(raw: unknown): WorldDoc | null {
  if (!isObj(raw)) return null;
  const cols = num(raw.cols, 16, 512, DEFAULT_COLS);
  const rows = num(raw.rows, 16, 512, DEFAULT_ROWS);
  /* 第一批只開放 128 × 80 */
  if (cols !== DEFAULT_COLS || rows !== DEFAULT_ROWS) return null;
  const n = cols * rows;
  if (!cellsOk(raw.terrain, n, /^[0-6]*$/)) return null;
  const terrain = Uint8Array.from(raw.terrain, (ch) => ch.charCodeAt(0) - 48);
  const ground = cellsOk(raw.ground, n, /^[01456]*$/)
    ? fixGround(
        terrain,
        Uint8Array.from(raw.ground, (ch) => ch.charCodeAt(0) - 48),
      )
    : inferGround(terrain, cols, rows);
  const c: NormalizeContext = { w: cols * 12, h: rows * 12, ids: new Set() };
  return {
    title: str(raw.title, LIMITS.title),
    seed: Math.floor(num(raw.seed, 0, 4294967295, 701)),
    theme: pick<ThemeId>(raw.theme, THEME_IDS, 'parchment'),
    drawMode: raw.drawMode === 'free' ? 'free' : 'grid',
    cols,
    rows,
    terrain: raw.terrain,
    ground: encodeCells(ground),
    regions: list(raw.regions, LIMITS.regions)
      .map((v) => normalizeRegion(v, c))
      .filter((v): v is Region => !!v),
    objects: list(raw.objects, LIMITS.objects)
      .map((v) => normalizeObject(v, c))
      .filter((v): v is MapObject => !!v),
    paths: list(raw.paths, LIMITS.paths)
      .map((v) => normalizePath(v, c))
      .filter((v): v is MapPath => !!v),
    notes: list(raw.notes, LIMITS.notes)
      .map((v) => normalizeNote(v, c))
      .filter((v): v is Note => !!v),
    settings: normalizeSettings(raw.settings),
  };
}

/* ---------- 原作的作業檔 ---------- */

export const ORIGINAL_FORMAT = 'kiin-world-atelier';

export function isOriginalFile(raw: unknown): boolean {
  return isObj(raw) && raw.format === ORIGINAL_FORMAT;
}

export interface OriginalImport {
  doc: WorldDoc;
  /** 匯出設定（原作存在作業檔裡） */
  exportWidth: number | null;
  exportAudience: 'player' | 'gm' | null;
  /** 原作的旅程設定（第二批才用；目前讀進來時略過）的路線數 */
  travelPaths: number;
}

export class OriginalFileError extends Error {}

/**
 * 原作的作業檔：版本 1；地形是 128 × 80 個 0～6 的整數，地表可以沒有（從地形推算）；
 * 沒有記畫法的舊檔當成自由筆刷；國名的字型只有自動／明朝／黑體。
 */
export function fromOriginal(raw: unknown): OriginalImport {
  if (!isObj(raw) || raw.format !== ORIGINAL_FORMAT)
    throw new OriginalFileError('這不是世界地圖的作業檔。');
  if (raw.version !== 1) throw new OriginalFileError('不支援這個版本的作業檔。');
  const n = DEFAULT_COLS * DEFAULT_ROWS;
  const t = raw.terrain;
  if (!Array.isArray(t) || t.length !== n || t.some((v) => !Number.isInteger(v) || v < 0 || v > 6))
    throw new OriginalFileError('地形的資料不正確。');
  const terrain = Uint8Array.from(t as number[]);
  let ground: Uint8Array;
  if (raw.ground === undefined) ground = inferGround(terrain, DEFAULT_COLS, DEFAULT_ROWS);
  else {
    const g = raw.ground;
    if (
      !Array.isArray(g) ||
      g.length !== n ||
      g.some((v) => ![0, 1, 4, 5, 6].includes(v as number))
    )
      throw new OriginalFileError('地表的資料不正確。');
    ground = fixGround(terrain, Uint8Array.from(g as number[]));
  }
  const c: NormalizeContext = { w: DEFAULT_COLS * 12, h: DEFAULT_ROWS * 12, ids: new Set() };
  const s = isObj(raw.settings) ? raw.settings : {};
  const exp = isObj(raw.export) ? raw.export : {};
  const rawPaths = list(raw.paths, LIMITS.paths);
  const doc: WorldDoc = {
    title: str(raw.title, LIMITS.title) || DEFAULT_TITLE,
    seed: Math.floor(num(raw.seed, 0, 4294967295, 701)),
    theme: pick<ThemeId>(raw.theme, THEME_IDS, 'parchment'),
    drawMode: raw.drawMode === 'grid' ? 'grid' : 'free',
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    terrain: encodeCells(terrain),
    ground: encodeCells(ground),
    regions: list(raw.regions, LIMITS.regions)
      .map((v) => normalizeRegion(v, c))
      .filter((v): v is Region => !!v),
    objects: list(raw.objects, LIMITS.objects)
      .map((v) => normalizeObject(v, c, 'key'))
      .filter((v): v is MapObject => !!v),
    paths: rawPaths.map((v) => normalizePath(v, c)).filter((v): v is MapPath => !!v),
    notes: list(raw.notes, LIMITS.notes)
      .map((v) => normalizeNote(v, c))
      .filter((v): v is Note => !!v),
    settings: normalizeSettings(s, true),
  };
  const width = num(exp.width, 600, 4096, Number.NaN);
  return {
    doc,
    exportWidth: Number.isFinite(width) ? width : null,
    exportAudience: exp.audience === 'gm' ? 'gm' : exp.audience === 'player' ? 'player' : null,
    travelPaths: rawPaths.filter(
      (p) =>
        isObj(p) &&
        (p.travelMode !== undefined ||
          p.dailyKm !== undefined ||
          p.simpleCalc === true ||
          (p.travelAccess !== undefined && p.travelAccess !== 'auto') ||
          (p.travelDifficulty !== undefined && p.travelDifficulty !== 'normal')),
    ).length,
  };
}

/** 國的形狀太小（面積 < 36 px²）不能完成 */
export const tooSmall = (pts: readonly Pt[]): boolean => polygonArea(pts) < 36;
