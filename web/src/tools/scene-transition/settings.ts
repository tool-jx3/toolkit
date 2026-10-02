/**
 * 場景轉換素材產生器的設定：型別、預設值、各欄位的選項與範圍。
 * 純資料與純函式（不依賴瀏覽器），單元測試直接引用。
 */
import { DIRECTIONS, type Direction8, type TransitionShape } from '@/core/transition';

export const TOOL_ID = 'scene-transition';

/** 轉場方式：蓋上、揭開、掃過、蓋上再揭開（規格 F38） */
export type Mode = 'cover' | 'reveal' | 'sweep' | 'roundtrip';
export const MODES: readonly Mode[] = ['cover', 'reveal', 'sweep', 'roundtrip'];

/** 速度曲線（規格 F25、3.4）：值是 core/timeline 的 CURVES 名稱 */
export type CurveId =
  | 'smoothstep'
  | 'linear'
  | 'quadIn'
  | 'quadOut'
  | 'bounceOut'
  | 'flicker'
  | 'lightning'
  | 'heartbeat';
export const CURVE_IDS: readonly CurveId[] = [
  'smoothstep',
  'linear',
  'quadIn',
  'quadOut',
  'bounceOut',
  'flicker',
  'lightning',
  'heartbeat',
];

/** 輸出尺寸（規格 F09），都是 16:9 */
export type SizeId = '1280x720' | '1920x1080' | '960x540' | '640x360';
export const SIZE_IDS: readonly SizeId[] = ['1280x720', '1920x1080', '960x540', '640x360'];
export const sizeOf = (id: SizeId): { width: number; height: number } => {
  const [w, h] = id.split('x').map(Number);
  return { width: w, height: h };
};

/** 每秒格數（規格 F26） */
export type Fps = 24 | 30 | 15 | 12;
export const FPS_OPTIONS: readonly Fps[] = [24, 30, 15, 12];

export type Axis = 'vertical' | 'horizontal';
export type CellOrderId = 'direction' | 'center' | 'random' | 'alternate';
export const ORDERS: readonly CellOrderId[] = ['direction', 'center', 'random', 'alternate'];
export type TextPos = 'center' | 'bottom' | 'top';
export const TEXT_POSITIONS: readonly TextPos[] = ['center', 'bottom', 'top'];
export type ExportFormatId = 'webp' | 'apng';

export type { Direction8 };
export { DIRECTIONS };

/** 形狀選項（規格 F11）：只有五種形狀有，選項隨形狀改變 */
export const SHAPE_OPTIONS: Partial<Record<TransitionShape, readonly string[]>> = {
  figure: ['star', 'heart', 'diamond', 'square', 'hexagon'],
  clock: ['clockwise', 'symmetric'],
  wave: ['sine', 'saw', 'square'],
  grid: ['square', 'circle', 'diamond'],
  ink: ['direction', 'center'],
};

/**
 * 「數量」的範圍（規格 F15），與 core/transition 的 SHAPE_COUNT_RANGE 相同；
 * 這裡另外列出，方便設定面板與存檔修正共用。
 */
export const COUNT_RANGE: Partial<Record<TransitionShape, readonly [number, number]>> = {
  blinds: [2, 40],
  wave: [1, 16],
  drip: [4, 60],
  grid: [3, 40],
  spiral: [1, 8],
  tear: [6, 60],
  rain: [8, 120],
  interlace: [8, 180],
  hex: [4, 40],
  rings: [2, 24],
};

/** 有「強度」滑桿的形狀（規格 F16） */
export const STRENGTH_SHAPES: readonly TransitionShape[] = ['wave', 'ink', 'drip', 'rotate'];

/** 字型（規格 F31）：電腦字型＋Google Fonts。id 存進設定 */
export type FontId = string;

/** 效果會改到的設定（切換效果時換成效果的值，規格 4.5） */
export interface Look {
  mode: Mode;
  color: string;
  glow: boolean;
  glowColor: string;
  strobe: number;
  color2: string;
  softness: number;
  option: string;
  order: CellOrderId;
  direction: Direction8;
  axis: Axis;
  count: number;
  strength: number;
  blockSize: number;
  ellipse: boolean;
  centerX: number;
  centerY: number;
  bandWidth: number;
  seed: number;
  duration: number;
  hold: number;
  curve: CurveId;
  reach: number;
  reverseOrder: boolean;
  reversePlay: boolean;
}

/** 字幕（使用者自己打的字幕在切換效果時保留，規格 4.5） */
export interface Caption {
  caption: string;
  textColor: string;
  fontSize: number;
  font: FontId;
  fontName: string;
  textPos: TextPos;
  outline: boolean;
}

export interface Settings extends Look, Caption {
  /** 效果編號（E01～E53） */
  effect: string;
  size: SizeId;
  fps: Fps;
  loop: boolean;
  format: ExportFormatId;
}

/** 效果沒指定時的值（規格 4.5） */
export const BASE_LOOK: Look = {
  mode: 'cover',
  color: '#000000',
  glow: false,
  glowColor: '#ff8a1f',
  strobe: 0,
  color2: '#000000',
  softness: 40,
  option: '',
  order: 'direction',
  direction: 'right',
  axis: 'vertical',
  count: 10,
  strength: 50,
  blockSize: 1,
  ellipse: false,
  centerX: 0.5,
  centerY: 0.5,
  bandWidth: 80,
  seed: 7,
  duration: 0.7,
  hold: 0,
  curve: 'smoothstep',
  reach: 100,
  reverseOrder: false,
  reversePlay: false,
};

export const BASE_CAPTION: Omit<Caption, 'fontSize'> = {
  caption: '',
  textColor: '#ffffff',
  font: 'gothic',
  fontName: '',
  textPos: 'center',
  outline: false,
};

/** 數值設定的範圍與間隔（滑桿） */
export const RANGES = {
  strobe: [0, 8, 1],
  softness: [1, 255, 1],
  strength: [0, 100, 1],
  blockSize: [1, 60, 1],
  center: [0, 1, 0.05],
  bandWidth: [10, 255, 5],
  seed: [1, 9999, 1],
  duration: [0.1, 3, 0.05],
  hold: [0, 3, 0.1],
  fontSize: [16, 200, 2],
  reach: [0, 100, 1],
} as const satisfies Record<string, readonly [number, number, number]>;

/** 夾在範圍內並對齊間隔（同瀏覽器的 range 欄位：從最小值起算，剛好在中間時取較大者） */
export function snap(v: number, [min, max, step]: readonly [number, number, number]): number {
  if (!Number.isFinite(v)) return min;
  const k = Math.round((Math.min(max, Math.max(min, v)) - min) / step + 1e-9);
  const out = Math.min(max, min + k * step);
  /* 小數間隔：去掉浮點誤差 */
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Number(out.toFixed(digits + 2));
}

/** 字級的初始值：輸出高 × 9% 四捨五入，再對齊到字級滑桿的間隔（720 → 66、1080 → 98、540 → 50、360 → 32） */
export const defaultFontSize = (height: number): number =>
  snap(Math.round(height * 0.09), RANGES.fontSize);

/** 數量夾在形狀的範圍內（沒有範圍的形狀維持原值） */
export function clampCount(shape: TransitionShape, count: number): number {
  const r = COUNT_RANGE[shape];
  const n = Math.round(Number.isFinite(count) ? count : 10);
  return r ? Math.min(r[1], Math.max(r[0], n)) : n;
}

/** 形狀選項：不在這個形狀的清單裡時用第一個（沒有選項的形狀是空字串） */
export function normalizeOption(shape: TransitionShape, option: string): string {
  const list = SHAPE_OPTIONS[shape];
  if (!list) return '';
  return list.includes(option) ? option : list[0];
}
