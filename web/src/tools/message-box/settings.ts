/**
 * 訊息框產生器的設定：型別、範圍、預設值、正規化（存檔、專案檔、範本都經過這裡）。
 * 純邏輯，不依賴 React（單元測試直接 import）。
 */
import type { TextOutlineKind, TextureKind } from '@/core/css';
import { isCssColor } from '@/core/css';
import { safeFileName } from '@/core/files';
import { CSS_WEIGHT_CHOICES, findGoogleFont, nearestWeight } from '@/core/fonts/catalog';

export const TOOL_ID = 'message-box';

export type Align = 'center' | 'left' | 'right';
export type Entrance = 'slide' | 'instant';
export type ButtonsMode = 'hover' | 'never' | 'always';
export type NamePos = 'inside' | 'plate';
export type ResultPos = 'after' | 'end';
export type ResultStyle = 'text' | 'outline' | 'band';
export type Side = 'left' | 'right';

/** CSS 類工具的字型（電腦字型不從網路載入） */
export interface MbFont {
  source: 'google' | 'local';
  family: string;
  weight: number;
}

export interface MbSettings {
  /* ---- 來源 ---- */
  width: number;
  height: number;
  room: string;
  fileName: string;
  /** 最後套用的範本 id（null＝沒有） */
  template: string | null;

  /* ---- 位置 ---- */
  maxWidth: number;
  align: Align;
  bottom: number;
  side: number;
  entrance: Entrance;

  /* ---- 方框 ---- */
  boxColor: string;
  boxOpacity: number;
  texture: TextureKind;
  borderWidth: number;
  borderColor: string;
  borderOpacity: number;
  radius: number;
  shadow: number;
  brackets: boolean;
  bracketColor: string;
  bracketOpacity: number;
  padX: number;
  padY: number;
  lines: number;
  buttons: ButtonsMode;

  /* ---- 名稱 ---- */
  showName: boolean;
  namePos: NamePos;
  nameFont: MbFont;
  nameSize: number;
  nameColor: string;
  nameGap: number;
  plateColor: string;
  plateOpacity: number;
  plateRadius: number;
  plateBorder: number;
  plateBorderColor: string;
  plateInset: number;
  plateLift: number;
  plateGap: number;

  /* ---- 骰子結果 ---- */
  showResult: boolean;
  resultPos: ResultPos;
  resultStyle: ResultStyle;
  resultFont: MbFont;
  resultSize: number;
  colorSuccess: string;
  colorFailure: string;
  colorOther: string;

  /* ---- 內文 ---- */
  textFont: MbFont;
  textSize: number;
  textColor: string;
  lineHeight: number;
  letterSpacing: number;
  outline: TextOutlineKind;
  outlineColor: string;
  outlineOpacity: number;
  outlineWidth: number;

  /* ---- 立繪 ---- */
  showPortrait: boolean;
  portraitWidth: number;
  portraitMaxHeight: number;
  portraitSide: Side;
  portraitOffset: number;
  portraitSink: number;
  portraitFront: boolean;
  portraitFlip: boolean;

  /* ---- 骰子圖 ---- */
  showDice: boolean;
  diceSize: number;
}

/** 數值設定的範圍與間距（規格第 1 節） */
export interface Range {
  min: number;
  max: number;
  step: number;
}

const r = (min: number, max: number, step = 1): Range => ({ min, max, step });

export const RANGES = {
  width: r(320, 3840, 10),
  height: r(160, 2160, 10),
  maxWidth: r(320, 1800, 10),
  bottom: r(0, 300),
  side: r(0, 400),
  boxOpacity: r(0, 100),
  borderWidth: r(0, 8),
  borderOpacity: r(0, 100),
  radius: r(0, 40),
  shadow: r(0, 100, 5),
  bracketOpacity: r(0, 100),
  padX: r(0, 60),
  padY: r(0, 40),
  lines: r(1, 8),
  nameSize: r(8, 48),
  nameGap: r(0, 30),
  plateOpacity: r(0, 100),
  plateRadius: r(0, 30),
  plateBorder: r(0, 4),
  plateInset: r(0, 300),
  plateLift: r(0, 60),
  plateGap: r(0, 40),
  resultSize: r(8, 48),
  textSize: r(10, 48),
  lineHeight: r(1, 2.4, 0.05),
  letterSpacing: r(0, 0.3, 0.01),
  outlineOpacity: r(0, 100),
  outlineWidth: r(1, 5, 0.5),
  portraitWidth: r(60, 800, 5),
  portraitMaxHeight: r(100, 1400, 10),
  portraitOffset: r(-200, 600),
  portraitSink: r(-100, 300),
  diceSize: r(24, 150),
} as const satisfies Partial<Record<keyof MbSettings, Range>>;

export type RangeKey = keyof typeof RANGES;

/** 來源大小：非數字時回到這個值 */
export const SOURCE_DEFAULT = { width: 1280, height: 720 } as const;

/** 來源大小快捷鈕（F04） */
export const SOURCE_PRESETS = [
  { id: 'fhd', width: 1920, height: 1080 },
  { id: 'hd', width: 1280, height: 720 },
  { id: 'lower', width: 1280, height: 540 },
] as const;

export const DEFAULT_FILE_NAME = 'messagebox';

/** 存檔用的檔名主體（F65）：Windows 不能用的字元換成底線、去掉前後空白；空白時用預設 */
export const fileBase = (name: string): string =>
  safeFileName(name, { fallback: DEFAULT_FILE_NAME });

/** 專案檔名（F78）：檔名主體＋代表本工具的副檔名組合 */
export const projectFileName = (name: string): string => `${fileBase(name)}.messagebox.json`;

/** 套用範本時保留的設定（來源大小、房間網址、檔名；預覽設定另外存，本來就不受影響） */
export const TEMPLATE_KEEP = ['width', 'height', 'room', 'fileName'] as const;

const TC_SANS = 'Noto Sans TC';

/**
 * 外觀的基本值：數值照規格第 1 節的預設，顏色與字型是本工具的預設範本（「經典深色」）。
 * 範本只寫與這組不同的地方。
 */
export const BASE_APPEARANCE: Omit<
  MbSettings,
  'width' | 'height' | 'room' | 'fileName' | 'template'
> = {
  maxWidth: 760,
  align: 'center',
  bottom: 16,
  side: 16,
  entrance: 'slide',

  boxColor: '#16171c',
  boxOpacity: 86,
  texture: 'none',
  borderWidth: 0,
  borderColor: '#ffffff',
  borderOpacity: 20,
  radius: 6,
  shadow: 40,
  brackets: false,
  bracketColor: '#ffffff',
  bracketOpacity: 80,
  padX: 24,
  padY: 12,
  lines: 3,
  buttons: 'hover',

  showName: true,
  namePos: 'inside',
  nameFont: { source: 'google', family: TC_SANS, weight: 700 },
  nameSize: 15,
  nameColor: '#ffd98a',
  nameGap: 4,
  plateColor: '#2a2f3d',
  plateOpacity: 80,
  plateRadius: 4,
  plateBorder: 0,
  plateBorderColor: '#ffffff',
  plateInset: 16,
  plateLift: 0,
  plateGap: 0,

  showResult: true,
  resultPos: 'after',
  resultStyle: 'text',
  resultFont: { source: 'google', family: TC_SANS, weight: 700 },
  resultSize: 15,
  colorSuccess: '#4fb3ff',
  colorFailure: '#ff5c7a',
  colorOther: '#c9ccd6',

  textFont: { source: 'google', family: TC_SANS, weight: 400 },
  textSize: 17,
  textColor: '#f4f4f6',
  lineHeight: 1.6,
  letterSpacing: 0.02,
  outline: 'none',
  outlineColor: '#000000',
  outlineOpacity: 80,
  outlineWidth: 2,

  showPortrait: true,
  portraitWidth: 240,
  portraitMaxHeight: 480,
  portraitSide: 'left',
  portraitOffset: 8,
  portraitSink: 0,
  portraitFront: false,
  portraitFlip: false,

  showDice: true,
  diceSize: 64,
};

export const DEFAULT_SETTINGS: MbSettings = {
  width: SOURCE_DEFAULT.width,
  height: SOURCE_DEFAULT.height,
  room: '',
  fileName: DEFAULT_FILE_NAME,
  template: 'classic',
  ...BASE_APPEARANCE,
};

/* ---------- 正規化 ---------- */

const ENUMS = {
  align: ['center', 'left', 'right'],
  entrance: ['slide', 'instant'],
  texture: ['none', 'paper', 'grain', 'scanlines', 'deepen'],
  buttons: ['hover', 'never', 'always'],
  namePos: ['inside', 'plate'],
  resultPos: ['after', 'end'],
  resultStyle: ['text', 'outline', 'band'],
  outline: ['soft', 'stroke', 'glow', 'none'],
  portraitSide: ['left', 'right'],
} as const satisfies Partial<Record<keyof MbSettings, readonly string[]>>;

const COLORS = [
  'boxColor',
  'borderColor',
  'bracketColor',
  'nameColor',
  'plateColor',
  'plateBorderColor',
  'colorSuccess',
  'colorFailure',
  'colorOther',
  'textColor',
  'outlineColor',
] as const satisfies readonly (keyof MbSettings)[];

const BOOLS = [
  'brackets',
  'showName',
  'showResult',
  'showPortrait',
  'portraitFront',
  'portraitFlip',
  'showDice',
] as const satisfies readonly (keyof MbSettings)[];

const FONTS = [
  'nameFont',
  'resultFont',
  'textFont',
] as const satisfies readonly (keyof MbSettings)[];

/** 數字夾在範圍內並對齊間距（小數點誤差修掉）；不是數字時用 fallback */
export function clampToRange(value: unknown, range: Range, fallback: number): number {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(range.max, Math.max(range.min, n));
  const stepped = range.min + Math.round((c - range.min) / range.step) * range.step;
  const digits = (String(range.step).split('.')[1] ?? '').length;
  return Number(Math.min(range.max, stepped).toFixed(digits));
}

/**
 * 來源寬高的確定（F03）：取整數並夾在範圍內；空白或不是數字時回到預設（1280／720）。
 * 只取整數、不對齊 10（快捷鈕與滑鼠滾輪才以 10 為一格）。
 */
export function commitSourceSize(raw: string | number, axis: 'width' | 'height'): number {
  const range = RANGES[axis];
  const text = typeof raw === 'number' ? String(raw) : raw.trim();
  const n = text === '' ? Number.NaN : Number(text);
  if (!Number.isFinite(n)) return SOURCE_DEFAULT[axis];
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

export function normalizeFont(raw: unknown, fallback: MbFont): MbFont {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const f = raw as Partial<MbFont> & { source?: string };
  const family = typeof f.family === 'string' ? f.family.replace(/\s+/g, ' ').trim() : '';
  if (!family) return { ...fallback };
  const source = f.source === 'local' ? 'local' : f.source === 'google' ? 'google' : null;
  if (!source) return { ...fallback };
  if (source === 'google' && !findGoogleFont(family)) return { ...fallback };
  const w = typeof f.weight === 'number' && Number.isFinite(f.weight) ? f.weight : fallback.weight;
  return {
    source,
    family: source === 'google' ? (findGoogleFont(family)?.family ?? family) : family,
    weight: nearestWeight(CSS_WEIGHT_CHOICES, w),
  };
}

/**
 * 存檔、專案檔、範本 → 完整且合法的設定：缺的欄位用預設值、型別不符用預設值、範圍外夾回、
 * 顏色不合格改用預設色、未知的範本當作沒有範本。
 */
export function normalizeSettings(
  raw: unknown,
  knownTemplate: (id: string) => boolean = () => true,
): MbSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const out = { ...d } as MbSettings;
  const o = out as unknown as Record<string, unknown>;

  out.width = commitSourceSize(
    typeof src.width === 'number' || typeof src.width === 'string' ? src.width : '',
    'width',
  );
  out.height = commitSourceSize(
    typeof src.height === 'number' || typeof src.height === 'string' ? src.height : '',
    'height',
  );
  out.room = typeof src.room === 'string' ? src.room : '';
  out.fileName = typeof src.fileName === 'string' ? src.fileName : DEFAULT_FILE_NAME;
  out.template =
    typeof src.template === 'string' && knownTemplate(src.template) ? src.template : null;

  for (const key of Object.keys(RANGES) as RangeKey[]) {
    if (key === 'width' || key === 'height') continue;
    o[key] = clampToRange(src[key], RANGES[key], d[key]);
  }
  for (const [key, values] of Object.entries(ENUMS) as [keyof typeof ENUMS, readonly string[]][]) {
    const v = src[key];
    o[key] = typeof v === 'string' && values.includes(v) ? v : d[key];
  }
  for (const key of COLORS) {
    const v = src[key];
    o[key] = typeof v === 'string' && isCssColor(v) ? v.trim().toLowerCase() : d[key];
  }
  for (const key of BOOLS) {
    const v = src[key];
    o[key] = typeof v === 'boolean' ? v : d[key];
  }
  for (const key of FONTS) o[key] = normalizeFont(src[key], d[key]);
  return out;
}

/* ---------- 由設定推算的數字（CSS 與介面共用） ---------- */

/** 名牌沉進方框的量：0.7 × 名稱字級（四捨五入）− 上移量；負值＝浮在方框上方 */
export const plateSink = (s: Pick<MbSettings, 'nameSize' | 'plateLift'>): number =>
  Math.round(0.7 * s.nameSize) - s.plateLift;

/** 內文區的內容高度（行數 × 字級 × 行高） */
export const textAreaHeight = (s: Pick<MbSettings, 'lines' | 'textSize' | 'lineHeight'>): number =>
  s.lines * s.textSize * s.lineHeight;

/** 名牌模式（只有顯示名稱時才有名牌） */
export const isPlate = (s: Pick<MbSettings, 'showName' | 'namePos'>): boolean =>
  s.showName && s.namePos === 'plate';

/** 這三處用到的字型（內文一定算；名稱、結果在顯示時才算） */
export function usedFonts(
  s: Pick<MbSettings, 'textFont' | 'nameFont' | 'resultFont' | 'showName' | 'showResult'>,
): MbFont[] {
  return [s.textFont, ...(s.showName ? [s.nameFont] : []), ...(s.showResult ? [s.resultFont] : [])];
}
