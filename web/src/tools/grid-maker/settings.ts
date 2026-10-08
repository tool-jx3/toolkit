/**
 * 網格產生器的設定：方格與六角格各存一整份（切換形狀時還原該形狀上次的值，兩邊原本不同的預設值照舊版）。
 * 純資料與規則，不依賴 React 與 DOM。
 */
import {
  COORD_FORMATS,
  COORD_ORIGINS,
  type CoordFormat,
  type CoordOrigin,
  exceedsCanvasLimit,
  GRID_LINE_STYLES,
  type GridLineStyle,
  type HexOrientation,
  type HexRowMode,
  hexSheet,
  hexSheetCcfoliaCells,
  squareSheetSize,
} from '@/core/grid';
import { type Schema, sanitize, sh } from '@/core/share';

export type Shape = 'square' | 'hex';
export type CoordPos = 'top' | 'middle' | 'bottom';

/** 兩種形狀共用的欄位 */
export interface CommonSettings {
  /** 欄數（橫） */
  cols: number;
  /** 列數（縱；六角格是半列的數量） */
  rows: number;
  /** 格子大小（方格的邊長；六角格的「大小」：平頂時是高、尖頂時是寬） */
  size: number;
  /** 線條顏色（含透明度） */
  lineColor: string;
  lineWidth: number;
  lineStyle: GridLineStyle;
  /** 發光（線條的陰影模糊＝線寬 × 7，顏色不透明） */
  glow: boolean;
  /** 縮小比例（%）：每一格所佔的範圍不變，只縮小畫出來的格子 */
  scale: number;
  showCoords: boolean;
  coordColor: string;
  coordFormat: CoordFormat;
  coordOrigin: CoordOrigin;
  /** 起始編號：0 或 1 */
  coordStart: 0 | 1;
  coordPos: CoordPos;
  /** 邊緣偏移（上／下時）：正值往格子中心、負值往格子外 */
  coordOffset: number;
  coordFontSize: number;
}

export interface SquareSettings extends CommonSettings {
  /** 圓角（px） */
  cornerRadius: number;
}

export interface HexSettings extends CommonSettings {
  orientation: HexOrientation;
  /** 錯開第 1 欄 */
  shift: boolean;
  /** 繪製外圈六角格 */
  outer: boolean;
  /** 用於 CCFOLIA（網格化） */
  fit: boolean;
  /** 列座標的算法（流水號時固定為壓縮） */
  rowMode: HexRowMode;
}

export interface Settings {
  shape: Shape;
  square: SquareSettings;
  hex: HexSettings;
}

/** 數值欄的範圍（照舊版欄位標示） */
export const RANGE = {
  cols: { min: 1, max: 1000 },
  rows: { min: 1, max: 1000 },
  size: { min: 10, max: 500 },
  lineWidth: { min: 1, max: 20 },
  scale: { min: 10, max: 100 },
  cornerRadius: { min: 0, max: 999 },
  coordOffset: { min: -999, max: 999 },
  coordFontSize: { min: 6, max: 100 },
} as const;

/** 舊版的預設線條與座標顏色（青色 #00e5ff、不透明） */
export const DEFAULT_COLOR = '#00e5ff';

const COMMON_DEFAULTS: CommonSettings = {
  cols: 15,
  rows: 15,
  size: 48,
  lineColor: DEFAULT_COLOR,
  lineWidth: 2,
  lineStyle: 'solid',
  glow: false,
  scale: 100,
  showCoords: true,
  coordColor: DEFAULT_COLOR,
  coordFormat: 'hyphen',
  coordOrigin: 'tl',
  coordStart: 0,
  coordPos: 'middle',
  coordOffset: 8,
  coordFontSize: 12,
};

export const DEFAULT_SQUARE: SquareSettings = { ...COMMON_DEFAULTS, cornerRadius: 0 };

/** 六角格的預設：列數 21、座標在下方（與方格不同，照舊版） */
export const DEFAULT_HEX: HexSettings = {
  ...COMMON_DEFAULTS,
  rows: 21,
  coordPos: 'bottom',
  orientation: 'flat',
  shift: false,
  outer: false,
  fit: false,
  rowMode: 'compress',
};

export const DEFAULT_SETTINGS: Settings = {
  shape: 'square',
  square: DEFAULT_SQUARE,
  hex: DEFAULT_HEX,
};

/* ---------- 讀檔整理（自動存檔、專案檔） ---------- */

const num = (k: keyof typeof RANGE, def: number) =>
  sh.number({ min: RANGE[k].min, max: RANGE[k].max, default: def, int: true });

function commonShape(d: CommonSettings) {
  return {
    cols: num('cols', d.cols),
    rows: num('rows', d.rows),
    size: num('size', d.size),
    lineColor: sh.color(d.lineColor),
    lineWidth: num('lineWidth', d.lineWidth),
    lineStyle: sh.oneOf(GRID_LINE_STYLES, d.lineStyle),
    glow: sh.boolean(d.glow),
    scale: num('scale', d.scale),
    showCoords: sh.boolean(d.showCoords),
    coordColor: sh.color(d.coordColor),
    coordFormat: sh.oneOf(COORD_FORMATS, d.coordFormat),
    coordOrigin: sh.oneOf(COORD_ORIGINS, d.coordOrigin),
    coordStart: sh.oneOf([0, 1] as const, d.coordStart),
    coordPos: sh.oneOf(['top', 'middle', 'bottom'] as const, d.coordPos),
    coordOffset: num('coordOffset', d.coordOffset),
    coordFontSize: num('coordFontSize', d.coordFontSize),
  };
}

const SQUARE_SCHEMA: Schema<SquareSettings> = sh.object({
  ...commonShape(DEFAULT_SQUARE),
  cornerRadius: num('cornerRadius', DEFAULT_SQUARE.cornerRadius),
});

const HEX_SCHEMA_BASE = sh.object({
  ...commonShape(DEFAULT_HEX),
  orientation: sh.oneOf(['flat', 'pointy'] as const, DEFAULT_HEX.orientation),
  shift: sh.boolean(DEFAULT_HEX.shift),
  outer: sh.boolean(DEFAULT_HEX.outer),
  fit: sh.boolean(DEFAULT_HEX.fit),
  rowMode: sh.oneOf(['compress', 'half'] as const, DEFAULT_HEX.rowMode),
});

/** 不可信的資料（localStorage、專案檔）→ 完整的設定：數值夾在範圍內、未知的選項換成預設 */
export function sanitizeSettings(raw: unknown): Settings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const hex = sanitize(HEX_SCHEMA_BASE, o.hex);
  return {
    shape: o.shape === 'hex' ? 'hex' : 'square',
    square: sanitize(SQUARE_SCHEMA, o.square),
    /* 流水號不分列的算法（舊版選流水號時固定為壓縮） */
    hex: hex.coordFormat === 'serial' ? { ...hex, rowMode: 'compress' } : hex,
  };
}

/** 專案檔看起來是不是網格產生器的設定 */
export function looksLikeSettings(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    (o.shape === 'square' || o.shape === 'hex') &&
    typeof o.square === 'object' &&
    typeof o.hex === 'object'
  );
}

/* ---------- 畫圖用的值（照舊版讀欄位的方式） ---------- */

/** 舊版用 parseInt 讀欄位：打字中的小數取整數部分 */
export const int = (v: number) => Math.trunc(v);

const clampInt = (v: number, k: keyof typeof RANGE) =>
  Math.min(RANGE[k].max, Math.max(RANGE[k].min, int(v)));

/** 畫圖前整理：整數化、夾在範圍內（數字欄打字中可能暫時是小數） */
function drawableCommon<T extends CommonSettings>(s: T): T {
  return {
    ...s,
    cols: clampInt(s.cols, 'cols'),
    rows: clampInt(s.rows, 'rows'),
    size: clampInt(s.size, 'size'),
    lineWidth: clampInt(s.lineWidth, 'lineWidth'),
    scale: clampInt(s.scale, 'scale'),
    coordOffset: clampInt(s.coordOffset, 'coordOffset'),
    coordFontSize: clampInt(s.coordFontSize, 'coordFontSize'),
  };
}

export function drawableSquare(s: SquareSettings): SquareSettings {
  return { ...drawableCommon(s), cornerRadius: clampInt(s.cornerRadius, 'cornerRadius') };
}

export function drawableHex(s: HexSettings): HexSettings {
  const d = drawableCommon(s);
  return d.coordFormat === 'serial' ? { ...d, rowMode: 'compress' } : d;
}

/** 畫布尺寸（px） */
export function canvasSize(settings: Settings): { width: number; height: number } {
  if (settings.shape === 'square') {
    const s = drawableSquare(settings.square);
    return squareSheetSize(s.cols, s.rows, s.size);
  }
  const s = drawableHex(settings.hex);
  const sheet = hexSheet(s);
  return { width: sheet.width, height: sheet.height };
}

/** 畫布太大（瀏覽器畫不出來）時不畫、不能匯出 */
export function tooLarge(settings: Settings): boolean {
  const { width, height } = canvasSize(settings);
  return exceedsCanvasLimit(width, height);
}

/**
 * 匯出的檔名（照舊版）：
 * - 方格：grid_<欄>x<列>_<大小>px.png
 * - 六角格網格化：hex_<CCFOLIA 的欄>x<列>.png（見 hexSheetCcfoliaCells）；沒有網格化：hex.png
 */
export function fileName(settings: Settings): string {
  if (settings.shape === 'square') {
    const s = drawableSquare(settings.square);
    return `grid_${s.cols}x${s.rows}_${s.size}px.png`;
  }
  const s = drawableHex(settings.hex);
  if (!s.fit) return 'hex.png';
  const { cols, rows } = hexSheetCcfoliaCells(hexSheet(s));
  return `hex_${cols}x${rows}.png`;
}
