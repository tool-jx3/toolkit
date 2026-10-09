/**
 * 地圖資料的格式（規格 3.1）：欄位名稱與值的格式照舊版（`buildSaveData`），`canvas` 是 Fabric 7 的 `toObject`。
 * 這個檔案不 import Fabric（純資料，單元測試可以直接用）。
 */
import { isMapGridType, type MapGridType } from '@/core/grid';

export const TOOL_ID = 'map-editor';
/** 新版的地圖資料版本（舊版 1） */
export const MAP_DATA_VERSION = 2;
/** 格子大小（舊版固定 72，沒有介面可改） */
export const CELL_SIZE = 72;

/** 地面、牆壁的圖樣選擇（舊版 groundPattern／wallPattern） */
export interface PatternState {
  mode: 'solid' | 'pattern';
  id: string | null;
  genreId: string;
  /** `#rrggbb` 或 `#rrggbbaa` */
  solidColor: string;
}

/** 自訂圖樣（跟著地圖儲存） */
export interface UserPattern {
  id: string;
  name: string;
  type: 'raster' | 'svg';
  dataUrl: string;
  color: string;
  /** 初始縮放（0.5） */
  scale: number;
  ground: string;
  wall: string;
  /**
   * 使用者刪掉了（F113，7.1）：圖樣清單不再列出，但已經畫好的物件（含格子）還在用時圖片留著，
   * 儲存時沒有物件用到才真的拿掉（`prunePatterns`）。
   */
  removed?: boolean;
}

/** 自訂裝飾（跟著地圖儲存） */
export interface UserDecor {
  id: string;
  name: string;
  type: 'raster' | 'svg';
  dataUrl: string;
  rawSvg: string | null;
  scale: number;
  anchorX: string;
  anchorY: string;
  genres: string[];
}

export type GroundTool = 'cell' | 'rect' | 'ellipse' | 'polygon' | 'curve-closed';
export type WallTool = 'rect' | 'ellipse' | 'line' | 'path' | 'polygon' | 'curve' | 'curve-closed';
export type RoomTool = 'rect' | 'ellipse' | 'polygon' | 'curve-closed' | 'path' | 'curve';
export type FreehandBrush = 'pencil' | 'spray' | 'eraser';

export const GROUND_TOOLS: readonly GroundTool[] = [
  'cell',
  'rect',
  'ellipse',
  'polygon',
  'curve-closed',
];
export const WALL_TOOLS: readonly WallTool[] = [
  'rect',
  'ellipse',
  'line',
  'path',
  'polygon',
  'curve',
  'curve-closed',
];
export const ROOM_TOOLS: readonly RoomTool[] = [
  'rect',
  'ellipse',
  'polygon',
  'curve-closed',
  'path',
  'curve',
];
export const FREEHAND_BRUSHES: readonly FreehandBrush[] = ['pencil', 'spray', 'eraser'];

/**
 * 跟著每張地圖儲存的設定（舊版 buildSaveData 的欄位，物件以外的部分）。
 * 值的格式照舊版：顏色 `#rrggbb`＋另外的不透明度（text、freehand），或 `#rrggbbaa`（陰影、圖樣的單色、網格）。
 */
export interface MapPrefs {
  editMode: string;
  groundTool: GroundTool;
  groundPattern: PatternState;
  wallTool: WallTool;
  wallPattern: PatternState;
  wallThickness: number;
  roomTool: RoomTool;
  roomWallThickness: number;
  groundPatternOffsetX: number;
  groundPatternOffsetY: number;
  groundPatternRotation: number;
  groundPatternScale: number;
  wallPatternOffsetX: number;
  wallPatternOffsetY: number;
  wallPatternRotation: number;
  wallPatternScale: number;
  textFill: string;
  textFillOpacity: number;
  textStroke: string;
  textStrokeOpacity: number;
  textStrokeWidth: number;
  userPatterns: UserPattern[];
  userDecors: UserDecor[];
  roomGroundShadowEnabled: boolean;
  roomGroundShadowColor: string;
  roomGroundShadowBlur: number;
  roomGroundShadowOffsetX: number;
  roomGroundShadowOffsetY: number;
  roomWallShadowEnabled: boolean;
  roomWallShadowColor: string;
  roomWallShadowBlur: number;
  roomWallShadowOffsetX: number;
  roomWallShadowOffsetY: number;
  roomWallStrokeDashArray: number[] | null;
  roomWallStrokeLineJoin: LineJoin;
  roomWallStrokeLineCap: LineCap;
  decorId: string | null;
  decorGenreId: string;
  decorScale: number;
  decorRotation: number;
  decorFlipX: boolean;
  decorFlipY: boolean;
  decorFill: string | null;
  decorStroke: string | null;
  decorShadowEnabled: boolean;
  freehandBrush: FreehandBrush;
  freehandWidth: number;
  freehandColor: string;
  freehandOpacity: number;
  freehandDecimation: number;
  gridVisible: boolean;
  gridColor: string;
  gridLineWidth: number;
  gridDashArray: number[] | null;
}

export type LineJoin = 'miter' | 'round' | 'bevel';
export type LineCap = 'butt' | 'round' | 'square';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'longdash';
export const STROKE_STYLES: readonly StrokeStyle[] = [
  'solid',
  'dashed',
  'dotted',
  'dashdot',
  'longdash',
];
export const LINE_JOINS: readonly LineJoin[] = ['miter', 'round', 'bevel'];
export const LINE_CAPS: readonly LineCap[] = ['butt', 'round', 'square'];

/** Fabric 的畫布資料（toObject 的結果） */
export interface CanvasJson {
  version?: string;
  objects: Record<string, unknown>[];
  background?: unknown;
  [key: string]: unknown;
}

/** 一張地圖的資料（規格 3.1） */
export interface MapData extends MapPrefs {
  version: number;
  cellSize: number;
  gridType: MapGridType;
  nextLayerId: number;
  layerCounters: Record<string, number>;
  viewportTransform: number[] | null;
  canvas: CanvasJson;
}

/** 一覽用的資訊（IndexedDB 的 meta:<id>） */
export interface MapMeta {
  id: string;
  name: string;
  gridType: MapGridType;
  createdAt: string;
  updatedAt: string;
  thumbnail: string | null;
}

export const DEFAULT_MAP_PREFS: MapPrefs = {
  editMode: 'simple',
  groundTool: 'cell',
  groundPattern: { mode: 'solid', id: null, genreId: 'all', solidColor: '#ffffff' },
  wallTool: 'rect',
  wallPattern: { mode: 'solid', id: null, genreId: 'all', solidColor: '#000000' },
  wallThickness: 12,
  roomTool: 'rect',
  roomWallThickness: 12,
  groundPatternOffsetX: 0,
  groundPatternOffsetY: 0,
  groundPatternRotation: 0,
  groundPatternScale: 1,
  wallPatternOffsetX: 0,
  wallPatternOffsetY: 0,
  wallPatternRotation: 0,
  wallPatternScale: 1,
  textFill: '#000000',
  textFillOpacity: 1,
  textStroke: '#ffffff',
  textStrokeOpacity: 1,
  textStrokeWidth: 0,
  userPatterns: [],
  userDecors: [],
  roomGroundShadowEnabled: false,
  roomGroundShadowColor: '#0000008c',
  roomGroundShadowBlur: 8,
  roomGroundShadowOffsetX: 0,
  roomGroundShadowOffsetY: 0,
  roomWallShadowEnabled: true,
  roomWallShadowColor: '#0000008c',
  roomWallShadowBlur: 8,
  roomWallShadowOffsetX: 0,
  roomWallShadowOffsetY: 0,
  roomWallStrokeDashArray: null,
  roomWallStrokeLineJoin: 'miter',
  roomWallStrokeLineCap: 'butt',
  decorId: null,
  decorGenreId: 'all',
  decorScale: 1,
  decorRotation: 0,
  decorFlipX: false,
  decorFlipY: false,
  decorFill: null,
  decorStroke: null,
  decorShadowEnabled: false,
  freehandBrush: 'pencil',
  freehandWidth: 3,
  freehandColor: '#000000',
  freehandOpacity: 1,
  freehandDecimation: 4,
  gridVisible: true,
  gridColor: '#535353ff',
  gridLineWidth: 1,
  gridDashArray: [10, 5],
};

export const MAP_PREF_KEYS = Object.keys(DEFAULT_MAP_PREFS) as (keyof MapPrefs)[];

/** 新地圖的資料（舊版 map_list 的 handleCreate） */
export function newMapData(gridType: MapGridType): MapData {
  return {
    ...structuredClone(DEFAULT_MAP_PREFS),
    version: MAP_DATA_VERSION,
    cellSize: CELL_SIZE,
    gridType,
    nextLayerId: 10,
    layerCounters: {},
    viewportTransform: null,
    canvas: { version: '7.4.0', objects: [] },
  };
}

/**
 * Fabric 存檔要帶的自訂欄位（舊版 SAVE_CUSTOM_PROPS，順序相同）。
 * toObject、clone、復原的快照都要帶。
 */
export const CUSTOM_PROPS = [
  '_layerId',
  '_isMapLayer',
  '_layerName',
  '_isCellLayer',
  '_isTerrainLayer',
  '_isMapText',
  '_isFreehandLayer',
  '_isGroundLayer',
  '_isWallLayer',
  '_isRoomGroup',
  '_isRoomGround',
  '_isRoomWall',
  '_isDecorLayer',
  '_decorId',
  '_decorIsSvg',
  '_decorScale',
  '_decorFlipX',
  '_decorFlipY',
  '_decorFill',
  '_decorStroke',
  '_terrainId',
  '_worldLeft',
  '_worldTop',
  '_cellEntries',
  '_patternOffsetX',
  '_patternOffsetY',
  '_patternRotation',
  '_patternScale',
  '_patternState',
  'globalCompositeOperation',
] as const;

/**
 * 新版另外存的欄位：鎖定（舊版沒有存，重新開啟或復原後鎖定就解除了；新版存檔、復原都保留）。
 */
export const LOCK_PROPS = [
  'lockMovementX',
  'lockMovementY',
  'lockScalingX',
  'lockScalingY',
  'lockRotation',
  'hasControls',
] as const;

/* ---------- 整理（讀進來的資料、手改過的檔案） ---------- */

const num = (v: unknown, def: number, min = -1e9, max = 1e9): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const str = (v: unknown, def: string): string => (typeof v === 'string' ? v : def);
const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : def;
const color = (v: unknown, def: string): string =>
  typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim())
    ? v.trim().toLowerCase()
    : def;
const colorOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : color(v, '') || null;
const dash = (v: unknown, def: number[] | null): number[] | null => {
  if (v === null) return null;
  if (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0))
    return v.slice(0, 8) as number[];
  return def;
};

function patternState(v: unknown, def: PatternState): PatternState {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<PatternState>;
  return {
    mode: o.mode === 'pattern' ? 'pattern' : 'solid',
    id: typeof o.id === 'string' ? o.id : null,
    genreId: str(o.genreId, def.genreId),
    solidColor: color(o.solidColor, def.solidColor),
  };
}

function userPatterns(v: unknown): UserPattern[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (p) =>
        p && typeof p === 'object' && typeof p.id === 'string' && typeof p.dataUrl === 'string',
    )
    .map((p) => ({
      id: p.id,
      name: str(p.name, ''),
      type: p.type === 'svg' ? 'svg' : 'raster',
      dataUrl: p.dataUrl,
      color: color(p.color, '#888888'),
      scale: num(p.scale, 0.5, 0.0001, 1000),
      ground: str(p.ground, 'user'),
      wall: str(p.wall, 'user'),
      ...(p.removed === true ? { removed: true } : {}),
    }));
}

/** 畫布資料（Fabric 的 toObject）裡用到的圖樣 id：物件的 `_patternState`、格子圖層的 `_cellEntries`（含群組裡的） */
export function usedPatternIds(canvas: unknown): Set<string> {
  const ids = new Set<string>();
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    const st = r._patternState as { mode?: unknown; id?: unknown } | undefined;
    if (st && st.mode === 'pattern' && typeof st.id === 'string') ids.add(st.id);
    if (Array.isArray(r._cellEntries))
      for (const e of r._cellEntries as { mode?: unknown; patternId?: unknown }[])
        if (e && e.mode === 'pattern' && typeof e.patternId === 'string') ids.add(e.patternId);
    if (Array.isArray(r.objects)) for (const c of r.objects) walk(c);
  };
  walk(canvas);
  return ids;
}

/** 儲存前：刪掉了而且沒有物件用到的圖樣拿掉（F113） */
export function prunePatterns(list: readonly UserPattern[], canvas: unknown): UserPattern[] {
  if (!list.some((p) => p.removed)) return [...list];
  const used = usedPatternIds(canvas);
  return list.filter((p) => !p.removed || used.has(p.id));
}

function userDecors(v: unknown): UserDecor[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (d) =>
        d && typeof d === 'object' && typeof d.id === 'string' && typeof d.dataUrl === 'string',
    )
    .map((d) => ({
      id: d.id,
      name: str(d.name, ''),
      type: d.type === 'svg' ? 'svg' : 'raster',
      dataUrl: d.dataUrl,
      rawSvg: typeof d.rawSvg === 'string' ? d.rawSvg : null,
      scale: num(d.scale, 1, 0.0001, 1000),
      anchorX: str(d.anchorX, 'center'),
      anchorY: str(d.anchorY, 'center'),
      genres: Array.isArray(d.genres)
        ? d.genres.filter((g: unknown) => typeof g === 'string')
        : ['user'],
    }));
}

/** 地圖設定的整理：缺的、型別不對的換成預設（舊版的 restoreSaveData 只接受型別正確的值） */
export function sanitizeMapPrefs(raw: Partial<Record<keyof MapPrefs, unknown>>): MapPrefs {
  const d = DEFAULT_MAP_PREFS;
  const r = raw ?? {};
  return {
    editMode: str(r.editMode, d.editMode),
    groundTool: oneOf(r.groundTool, GROUND_TOOLS, d.groundTool),
    groundPattern: patternState(r.groundPattern, d.groundPattern),
    wallTool: oneOf(r.wallTool, WALL_TOOLS, d.wallTool),
    wallPattern: patternState(r.wallPattern, d.wallPattern),
    wallThickness: num(r.wallThickness, d.wallThickness, 1, 200),
    roomTool: oneOf(r.roomTool, ROOM_TOOLS, d.roomTool),
    roomWallThickness: num(r.roomWallThickness, d.roomWallThickness, 1, 200),
    groundPatternOffsetX: num(r.groundPatternOffsetX, 0),
    groundPatternOffsetY: num(r.groundPatternOffsetY, 0),
    groundPatternRotation: num(r.groundPatternRotation, 0, -360, 360),
    groundPatternScale: num(r.groundPatternScale, 1, 0.1, 20),
    wallPatternOffsetX: num(r.wallPatternOffsetX, 0),
    wallPatternOffsetY: num(r.wallPatternOffsetY, 0),
    wallPatternRotation: num(r.wallPatternRotation, 0, -360, 360),
    wallPatternScale: num(r.wallPatternScale, 1, 0.1, 20),
    textFill: color(r.textFill, d.textFill).slice(0, 7),
    textFillOpacity: num(r.textFillOpacity, 1, 0, 1),
    textStroke: color(r.textStroke, d.textStroke).slice(0, 7),
    textStrokeOpacity: num(r.textStrokeOpacity, 1, 0, 1),
    textStrokeWidth: num(r.textStrokeWidth, 0, 0, 100),
    userPatterns: userPatterns(r.userPatterns),
    userDecors: userDecors(r.userDecors),
    roomGroundShadowEnabled: bool(r.roomGroundShadowEnabled, d.roomGroundShadowEnabled),
    roomGroundShadowColor: color(r.roomGroundShadowColor, d.roomGroundShadowColor),
    roomGroundShadowBlur: num(r.roomGroundShadowBlur, 8, 0, 50),
    roomGroundShadowOffsetX: num(r.roomGroundShadowOffsetX, 0, -50, 50),
    roomGroundShadowOffsetY: num(r.roomGroundShadowOffsetY, 0, -50, 50),
    roomWallShadowEnabled: bool(r.roomWallShadowEnabled, d.roomWallShadowEnabled),
    roomWallShadowColor: color(r.roomWallShadowColor, d.roomWallShadowColor),
    roomWallShadowBlur: num(r.roomWallShadowBlur, 8, 0, 50),
    roomWallShadowOffsetX: num(r.roomWallShadowOffsetX, 0, -50, 50),
    roomWallShadowOffsetY: num(r.roomWallShadowOffsetY, 0, -50, 50),
    roomWallStrokeDashArray: dash(r.roomWallStrokeDashArray, null),
    roomWallStrokeLineJoin: oneOf(r.roomWallStrokeLineJoin, LINE_JOINS, 'miter'),
    roomWallStrokeLineCap: oneOf(r.roomWallStrokeLineCap, LINE_CAPS, 'butt'),
    decorId: typeof r.decorId === 'string' ? r.decorId : null,
    decorGenreId: str(r.decorGenreId, 'all'),
    decorScale: num(r.decorScale, 1, 0.1, 10),
    decorRotation: num(r.decorRotation, 0, -360, 360),
    decorFlipX: bool(r.decorFlipX, false),
    decorFlipY: bool(r.decorFlipY, false),
    decorFill: colorOrNull(r.decorFill),
    decorStroke: colorOrNull(r.decorStroke),
    decorShadowEnabled: bool(r.decorShadowEnabled, false),
    freehandBrush: oneOf(r.freehandBrush, FREEHAND_BRUSHES, 'pencil'),
    freehandWidth: num(r.freehandWidth, 3, 1, 100),
    freehandColor: color(r.freehandColor, '#000000').slice(0, 7),
    freehandOpacity: num(r.freehandOpacity, 1, 0, 1),
    freehandDecimation: num(r.freehandDecimation, 4, 0, 20),
    gridVisible: r.gridVisible !== false,
    gridColor: color(r.gridColor, d.gridColor),
    gridLineWidth: num(r.gridLineWidth, 1, 1, 10),
    /* 舊版：沒有存（undefined）時是虛線 [10, 5]；明確存 null 是實線 */
    gridDashArray: r.gridDashArray === undefined ? [10, 5] : dash(r.gridDashArray, [10, 5]),
  };
}

/** 讀進來的地圖資料整理成新版的格式（canvas 已經是 Fabric 7 的格式；舊版的先經過 legacy.ts） */
export function sanitizeMapData(raw: Record<string, unknown>): MapData {
  const canvas = (
    raw.canvas && typeof raw.canvas === 'object' ? raw.canvas : { objects: [] }
  ) as CanvasJson;
  const vpt =
    Array.isArray(raw.viewportTransform) && raw.viewportTransform.length === 6
      ? (raw.viewportTransform as unknown[]).map((v) =>
          typeof v === 'number' && Number.isFinite(v) ? v : 0,
        )
      : null;
  const counters: Record<string, number> = {};
  if (raw.layerCounters && typeof raw.layerCounters === 'object')
    for (const [k, v] of Object.entries(raw.layerCounters as Record<string, unknown>))
      if (typeof v === 'number' && Number.isFinite(v)) counters[k] = v;
  return {
    ...sanitizeMapPrefs(raw as Partial<Record<keyof MapPrefs, unknown>>),
    version: MAP_DATA_VERSION,
    cellSize: num(raw.cellSize, CELL_SIZE, 4, 1000),
    gridType: isMapGridType(raw.gridType) ? raw.gridType : 'square',
    nextLayerId: num(raw.nextLayerId, 10, 1, 1e12),
    layerCounters: counters,
    viewportTransform: vpt && vpt[0] > 0 && vpt[3] > 0 ? vpt : null,
    canvas: { ...canvas, objects: Array.isArray(canvas.objects) ? canvas.objects : [] },
  };
}

/** 只取跟著地圖儲存的設定 */
export function pickMapPrefs(data: MapPrefs): MapPrefs {
  const out = {} as Record<string, unknown>;
  for (const k of MAP_PREF_KEYS) out[k] = data[k];
  return out as unknown as MapPrefs;
}

/** 地圖 id：時間（36 進位）＋ 4 個隨機字元（舊版 generateMapId） */
export function generateMapId(now = Date.now(), random = Math.random): string {
  return now.toString(36) + random().toString(36).slice(2, 6).padEnd(4, '0');
}

/** 日期時間「YYYY/MM/DD HH:mm」（舊版 fmtMapDate） */
export function formatMapDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** JSON 檔名：名稱的 \ / : * ? " < > | 換成 _（舊版 exportMapJSON） */
export function mapJsonFileName(name: string): string {
  return `${(name || 'map').replace(/[\\/:*?"<>|]/g, '_')}.json`;
}
