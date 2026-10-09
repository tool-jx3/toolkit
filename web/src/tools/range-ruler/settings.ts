/**
 * 距離量尺產生器的設定：方格與六角格各存一整份（含各自的自訂格）。純資料與規則，不依賴 React 與 DOM。
 */
import {
  HEX_DISTANCE_METHODS,
  type HexDistanceMethod,
  type HexOrientation,
  SQUARE_DISTANCE_METHODS,
  type SquareDistanceMethod,
} from '@/core/grid';
import { type Schema, sanitize, sh } from '@/core/share';

export type Shape = 'square' | 'hex';

/** 配色：彩虹、暖色、冷色、灰階、無色（全透明）、自訂 */
export type Scheme = 'rainbow' | 'heat' | 'cold' | 'mono' | 'none' | 'custom';
export const SCHEMES: readonly Scheme[] = ['rainbow', 'heat', 'cold', 'mono', 'none', 'custom'];

/** 一格的自訂（點格子編輯後，四個值都會存下來） */
export interface CustomCell {
  /** 空字串＝顯示距離數字 */
  text: string;
  color: string;
  textColor: string;
  fontSize: number;
}

export interface CommonSettings {
  /** 範圍：從中心格算起的最大距離（格） */
  range: number;
  /** 格子大小（方格的邊長；六角格的「六角格大小」：橫向時是高、直向時是寬） */
  size: number;
  scheme: Scheme;
  /** 每個距離（0＝中心～範圍）的格子顏色；範圍或配色一改就依配色重建 */
  distColors: string[];
  /** 格子整體不透明度（%），乘上各顏色自己的透明度 */
  cellOpacity: number;
  textColor: string;
  fontSize: number;
  /** 文字整體不透明度（%），也套用在描邊 */
  textOpacity: number;
  stroke: boolean;
  strokeColor: string;
  /** 自訂格，鍵是相對於中心格的 "x,y"（方格）或 "c,r"（六角格，odd-q 偏移座標） */
  customs: Record<string, CustomCell>;
}

export interface SquareSettings extends CommonSettings {
  method: SquareDistanceMethod;
}

export interface HexSettings extends CommonSettings {
  orientation: HexOrientation;
  method: HexDistanceMethod;
  /** 使用網格（CCFOLIA 等） */
  fit: boolean;
}

export interface Settings {
  shape: Shape;
  square: SquareSettings;
  hex: HexSettings;
}

export const RANGE = {
  range: { min: 1, max: 20 },
  size: { min: 10, max: 200 },
  opacity: { min: 0, max: 100 },
  fontSize: { min: 6, max: 200 },
} as const;

/** 自訂文字最多 8 個字 */
export const CUSTOM_TEXT_MAX = 8;
/** 自訂格最多幾個（範圍 20 的方格有 1681 格） */
const MAX_CUSTOMS = 2000;

/* ---------- 配色（照舊版的公式） ---------- */

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lig - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function mix(c1: string, c2: string, t: number): string {
  const p = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
  const a = p(c1);
  const b = p(c2);
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * 某個距離的配色（中心一律白色；範圍 1 時距離 1 是固定色；其餘依距離在兩端之間內插）：
 * - 彩虹：HSL 色相 0°～270°、飽和度 100%、亮度 70%（範圍 1 時 #ff6464）
 * - 暖色：#ff4040 → #ffee40（#ff4040）；冷色：#64d4ff → #4040ee（#64d4ff）；灰階：#dddddd → #444444（#aaaaaa）
 * - 無色：全透明；自訂：灰色 #aaaaaa（之後逐一自己改）
 */
export function schemeColor(d: number, range: number, scheme: Scheme): string {
  if (scheme === 'none') return '#00000000';
  const t = range <= 1 ? 0 : (d - 1) / (range - 1);
  const pick = (one: string, f: () => string) => (d === 0 ? '#ffffff' : range <= 1 ? one : f());
  switch (scheme) {
    case 'rainbow':
      return pick('#ff6464', () => hslToHex(t * 270, 100, 70));
    case 'heat':
      return pick('#ff4040', () => mix('#ff4040', '#ffee40', t));
    case 'cold':
      return pick('#64d4ff', () => mix('#64d4ff', '#4040ee', t));
    case 'mono':
      return pick('#aaaaaa', () => mix('#dddddd', '#444444', t));
    default:
      return '#aaaaaa';
  }
}

/** 0～範圍每個距離的配色 */
export function schemeColors(range: number, scheme: Scheme): string[] {
  return Array.from({ length: range + 1 }, (_, d) => schemeColor(d, range, scheme));
}

/* ---------- 預設值 ---------- */

const common = (fontSize: number): CommonSettings => ({
  range: 5,
  size: 48,
  scheme: 'rainbow',
  distColors: schemeColors(5, 'rainbow'),
  cellOpacity: 100,
  textColor: '#000000',
  fontSize,
  textOpacity: 100,
  stroke: true,
  strokeColor: '#ffffff',
  customs: {},
});

/** 方格的預設（文字 24 px） */
export const DEFAULT_SQUARE: SquareSettings = { ...common(24), method: 'manhattan' };

/** 六角格的預設（文字 20 px、預設使用網格） */
export const DEFAULT_HEX: HexSettings = {
  ...common(20),
  orientation: 'flat',
  method: 'steps',
  fit: true,
};

export const DEFAULT_SETTINGS: Settings = {
  shape: 'square',
  square: DEFAULT_SQUARE,
  hex: DEFAULT_HEX,
};

/* ---------- 讀檔整理 ---------- */

const cellSchema = (d: CommonSettings): Schema<CustomCell> =>
  sh.object({
    text: sh.string({ default: '', maxLength: CUSTOM_TEXT_MAX }),
    color: sh.color('#aaaaaa'),
    textColor: sh.color(d.textColor),
    fontSize: sh.number({ ...RANGE.fontSize, default: d.fontSize, int: true }),
  });

function commonShape(d: CommonSettings) {
  return {
    range: sh.number({ ...RANGE.range, default: d.range, int: true }),
    size: sh.number({ ...RANGE.size, default: d.size, int: true }),
    scheme: sh.oneOf(SCHEMES, d.scheme),
    cellOpacity: sh.number({ ...RANGE.opacity, default: d.cellOpacity, int: true }),
    textColor: sh.color(d.textColor),
    fontSize: sh.number({ ...RANGE.fontSize, default: d.fontSize, int: true }),
    textOpacity: sh.number({ ...RANGE.opacity, default: d.textOpacity, int: true }),
    stroke: sh.boolean(d.stroke),
    strokeColor: sh.color(d.strokeColor),
  };
}

const KEY = /^-?\d{1,3},-?\d{1,3}$/;

function cleanCommon(raw: Record<string, unknown>, d: CommonSettings, base: CommonSettings) {
  const colors = Array.isArray(raw.distColors) ? raw.distColors : [];
  /* 顏色數量一定是範圍 ＋ 1：缺的依配色補上 */
  const fallback = schemeColors(base.range, base.scheme);
  const distColors = fallback.map((def, i) => sh.color(def).parse(colors[i]));
  const customs: Record<string, CustomCell> = {};
  const src = raw.customs && typeof raw.customs === 'object' ? raw.customs : {};
  const cell = cellSchema(d);
  for (const [k, v] of Object.entries(src).slice(0, MAX_CUSTOMS)) {
    if (KEY.test(k) && v && typeof v === 'object') customs[k] = cell.parse(v);
  }
  return { ...base, distColors, customs };
}

export function sanitizeSettings(raw: unknown): Settings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const sq = (o.square && typeof o.square === 'object' ? o.square : {}) as Record<string, unknown>;
  const hx = (o.hex && typeof o.hex === 'object' ? o.hex : {}) as Record<string, unknown>;
  const squareBase = sanitize(
    sh.object({
      ...commonShape(DEFAULT_SQUARE),
      method: sh.oneOf(SQUARE_DISTANCE_METHODS, DEFAULT_SQUARE.method),
    }),
    sq,
  );
  const hexBase = sanitize(
    sh.object({
      ...commonShape(DEFAULT_HEX),
      orientation: sh.oneOf(['flat', 'pointy'] as const, DEFAULT_HEX.orientation),
      method: sh.oneOf(HEX_DISTANCE_METHODS, DEFAULT_HEX.method),
      fit: sh.boolean(DEFAULT_HEX.fit),
    }),
    hx,
  );
  return {
    shape: o.shape === 'hex' ? 'hex' : 'square',
    square: cleanCommon(sq, DEFAULT_SQUARE, { ...DEFAULT_SQUARE, ...squareBase }) as SquareSettings,
    hex: cleanCommon(hx, DEFAULT_HEX, { ...DEFAULT_HEX, ...hexBase }) as HexSettings,
  };
}

export function looksLikeSettings(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    (o.shape === 'square' || o.shape === 'hex') &&
    typeof o.square === 'object' &&
    typeof o.hex === 'object'
  );
}

/* ---------- 畫圖用的值 ---------- */

const clampInt = (v: number, k: keyof typeof RANGE) =>
  Math.min(RANGE[k].max, Math.max(RANGE[k].min, Math.trunc(v)));

/** 畫圖前整理（數字欄打字中可能暫時是小數；舊版用 parseInt 讀欄位） */
export function drawable<T extends CommonSettings>(s: T): T {
  return {
    ...s,
    range: clampInt(s.range, 'range'),
    size: clampInt(s.size, 'size'),
    cellOpacity: clampInt(s.cellOpacity, 'opacity'),
    fontSize: clampInt(s.fontSize, 'fontSize'),
    textOpacity: clampInt(s.textOpacity, 'opacity'),
  };
}

/** 格子顯示的內容：自訂優先（文字空白時顯示距離），否則依距離 */
export function cellLook(
  s: CommonSettings,
  key: string,
  d: number,
): { text: string; color: string; textColor: string; fontSize: number; custom: boolean } {
  const c = s.customs[key];
  return {
    text: c && c.text !== '' ? c.text : String(d),
    color: c?.color ?? s.distColors[d] ?? '#80808000',
    textColor: c?.textColor ?? s.textColor,
    fontSize: c?.fontSize ?? s.fontSize,
    custom: !!c,
  };
}

/** 編輯面板打開時各欄位的值（舊版浮動視窗的預設：文字＝距離、顏色＝該距離的顏色） */
export function editorValues(s: CommonSettings, key: string, d: number): CustomCell {
  const c = s.customs[key];
  return (
    c ?? {
      text: String(d),
      color: s.distColors[d] ?? '#808080',
      textColor: s.textColor,
      fontSize: s.fontSize,
    }
  );
}
