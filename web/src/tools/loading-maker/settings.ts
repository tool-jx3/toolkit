/**
 * 讀取動畫產生器的設定：型別、預設值（規格第 1 節各列）、數值範圍，以及讀回存檔／專案檔時的整理。
 * 範例文字、內建角色、漸層的預設色都是本工具自己做的。
 */
import type { FontValue } from '@/core/fonts';
import type { VanishKind } from '@/core/motion';
import type { Keyframe } from '@/core/timeline';

export type LoaderType = 'bar' | 'loop' | 'row' | 'none';
export const LOADER_TYPES: readonly LoaderType[] = ['bar', 'loop', 'row', 'none'];

export type BarStyle = 'rounded' | 'segmented' | 'pixel' | 'hearts' | 'bubbles';
export const BAR_STYLES: readonly BarStyle[] = [
  'rounded',
  'segmented',
  'pixel',
  'hearts',
  'bubbles',
];
/** 分段類的樣式（格數、逐格跟隨用得到） */
export const SEGMENT_STYLES: readonly BarStyle[] = ['segmented', 'pixel', 'hearts', 'bubbles'];

/** 時間曲線（F60～F67；名稱同 core/timeline 的 CURVES，另加依種子的不規則曲線） */
export type ProgressCurve =
  | 'linear'
  | 'smoothstep'
  | 'cubicIn'
  | 'cubicOut'
  | 'cubicInOut'
  | 'steps10'
  | 'bounceOut'
  | 'irregular';
export const PROGRESS_CURVES: readonly ProgressCurve[] = [
  'linear',
  'smoothstep',
  'cubicIn',
  'cubicOut',
  'cubicInOut',
  'steps10',
  'bounceOut',
  'irregular',
];
/** 進度方式（F59）：八種曲線＋自訂時間表 */
export type ProgressMode = ProgressCurve | 'keyframes';
export const PROGRESS_MODES: readonly ProgressMode[] = [...PROGRESS_CURVES, 'keyframes'];

export type VanishMode = 'none' | VanishKind;
export const VANISH_MODES: readonly VanishMode[] = [
  'none',
  'fade',
  'sparkle',
  'noise',
  'shatter',
  'dissolve',
  'pop',
  'float',
  'close',
  'spin',
  'burst',
];

export type LoopStyle = 'dots' | 'bubbles' | 'stars' | 'petals' | 'squares' | 'hearts' | 'ring';
export const LOOP_STYLES: readonly LoopStyle[] = [
  'dots',
  'bubbles',
  'stars',
  'petals',
  'squares',
  'hearts',
  'ring',
];

export type MotionKind = 'none' | 'float' | 'bounce' | 'sway' | 'squish' | 'step' | 'wiggle';
export const MOTION_KINDS: readonly MotionKind[] = [
  'none',
  'float',
  'bounce',
  'sway',
  'squish',
  'step',
  'wiggle',
];

export type RowShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'star' | 'heart' | 'hexagon';
export const ROW_SHAPES: readonly RowShape[] = [
  'circle',
  'square',
  'diamond',
  'triangle',
  'star',
  'heart',
  'hexagon',
];
/** 各位置的預設底形：依序循環（圓、方、菱形、三角、星、愛心、六角形、圓…） */
export const DEFAULT_ROW_SHAPE_CYCLE: readonly RowShape[] = [...ROW_SHAPES, 'circle'];
export const defaultRowShape = (i: number): RowShape =>
  DEFAULT_ROW_SHAPE_CYCLE[i % DEFAULT_ROW_SHAPE_CYCLE.length];

export type ImageOrder = 'sequential' | 'alternating' | 'random';
export const IMAGE_ORDERS: readonly ImageOrder[] = ['sequential', 'alternating', 'random'];
export type ImageFit = 'contain' | 'cover';
export type RowMode = 'progress' | 'loop';
export type RowStart = 'shape' | 'images';
/** 奇偶交錯（F124）：全部從起始、奇數格起始偶數格目標、奇數格目標偶數格起始 */
export type RowPattern = 'all-base' | 'odd-base' | 'odd-image';
export const ROW_PATTERNS: readonly RowPattern[] = ['all-base', 'odd-base', 'odd-image'];

export type BuiltinCharacter = 'cat' | 'dice' | 'mushroom' | 'penguin' | 'cocoa';
export const BUILTIN_CHARACTERS: readonly BuiltinCharacter[] = [
  'cat',
  'dice',
  'mushroom',
  'penguin',
  'cocoa',
];

export type FollowPlacement = 'above' | 'center' | 'below';

export type ExportFormat = 'apng' | 'webp' | 'gif';
export const EXPORT_FORMAT_IDS: readonly ExportFormat[] = ['apng', 'webp', 'gif'];

/** 上傳的角色：單一檔案（動畫檔或靜態圖）或連續圖（多張，依檔名自然排序） */
export interface CharacterUpload {
  kind: 'file' | 'sequence';
  /** 資產庫的 id（core/assets） */
  ids: string[];
  names: string[];
}

/** 換圖列的一組圖片（依檔名自然排序） */
export interface ImageSet {
  ids: string[];
  names: string[];
}

export interface GradientStopSetting {
  /** 0～100 */
  pos: number;
  color: string;
}

export interface TextBlock {
  enabled: boolean;
  text: string;
  /** 區塊中心（畫布百分比） */
  x: number;
  y: number;
  rotation: number;
  /** 字型（weight＝粗細） */
  font: FontValue;
  /** 字級 px（依畫布縮放） */
  size: number;
  /** 字距 px（依畫布縮放） */
  spacing: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
}

export interface LmSettings {
  canvas: {
    width: number;
    height: number;
    transparent: boolean;
    background: string;
    snapCanvas: boolean;
    snapItems: boolean;
  };
  character: {
    builtin: BuiltinCharacter;
    upload: CharacterUpload | null;
    x: number;
    y: number;
    size: number;
    rotation: number;
    opacity: number;
    motion: MotionKind;
    motionAmount: number;
    motionSpeed: number;
    /** 動畫檔照檔案裡每格的時間 */
    fileTiming: boolean;
    /** 播放速度（倍） */
    speed: number;
    /** 連續圖（或不照檔案時間時）的每秒格數 */
    fps: number;
    shadow: boolean;
    shadowColor: string;
    shadowBlur: number;
    shadowY: number;
    follow: boolean;
    followPlacement: FollowPlacement;
    followGap: number;
    followX: number;
    followY: number;
    followSnap: boolean;
    followInside: boolean;
    followFlip: boolean;
  };
  loader: {
    type: LoaderType;
    x: number;
    y: number;
    glow: boolean;
    glowColor: string;
    glowBlur: number;
    seed: number;
    /** 空條色（＝換圖列的底形色、循環動畫的基本色） */
    trackColor: string;
    /** 填滿色（＝換圖列沒有目標圖時的替代色、循環動畫的強調色） */
    fillColor: string;
    borderColor: string;
    borderWidth: number;
  };
  bar: {
    style: BarStyle;
    mode: ProgressMode;
    start: number;
    end: number;
    keys: Keyframe[];
    width: number;
    height: number;
    fill: 'solid' | 'gradient';
    stops: GradientStopSetting[];
    /** 漸層角度：0＝由左到右、90＝由上到下 */
    angle: number;
    /** 顏色暈染 px */
    colorBlur: number;
    flow: boolean;
    flowSpeed: number;
    flowReverse: boolean;
    shimmer: boolean;
    segments: number;
    percent: boolean;
    percentX: number;
    percentY: number;
    fadeIn: boolean;
    fadeInDuration: number;
    hold: number;
    vanish: VanishMode;
    vanishDuration: number;
    intensity: number;
  };
  loop: {
    style: LoopStyle;
    count: number;
    radius: number;
    size: number;
    speed: number;
    clockwise: boolean;
    trail: boolean;
    pulse: boolean;
  };
  row: {
    mode: RowMode;
    start: RowStart;
    startImages: ImageSet | null;
    startOrder: ImageOrder;
    startFit: ImageFit;
    targetImages: ImageSet | null;
    targetOrder: ImageOrder;
    targetFit: ImageFit;
    pattern: RowPattern;
    count: number;
    length: number;
    size: number;
    order: ImageOrder;
    repeats: number;
    shapes: RowShape[];
  };
  text: { top: TextBlock; bottom: TextBlock };
  /** 長度（秒）：進度條＝跑到終點、循環＝一輪、換圖列＝一輪或全部換完、隱藏＝整段 */
  duration: number;
  export: {
    format: ExportFormat;
    fps: number;
    plays: number;
    quality: number;
    gifThreshold: number;
    /** APNG 減色（256 色） */
    quantize: boolean;
    fileName: string;
    includeAssets: boolean;
  };
}

/** 預設的自訂時間表（F70：0 秒 0%、1 秒 30%〔漸慢〕、2 秒 70%〔平滑〕、3 秒 100%〔慢快慢〕） */
export const DEFAULT_KEYS: Keyframe[] = [
  { time: 0, value: 0, curve: 'linear' },
  { time: 1, value: 30, curve: 'cubicOut' },
  { time: 2, value: 70, curve: 'smoothstep' },
  { time: 3, value: 100, curve: 'cubicInOut' },
];

export const DEFAULT_STOPS: GradientStopSetting[] = [
  { pos: 0, color: '#ff7ea8' },
  { pos: 50, color: '#ffd36e' },
  { pos: 100, color: '#8fa8ff' },
];

export const DEFAULT_FILE_STEM = 'loading-animation';

export const DEFAULT_SETTINGS: LmSettings = {
  canvas: {
    width: 640,
    height: 360,
    transparent: true,
    background: '#fff7fb',
    snapCanvas: true,
    snapItems: true,
  },
  character: {
    builtin: 'cat',
    upload: null,
    x: 50,
    y: 47,
    size: 42,
    rotation: 0,
    opacity: 1,
    motion: 'float',
    motionAmount: 7,
    motionSpeed: 1,
    fileTiming: true,
    speed: 1,
    fps: 8,
    shadow: true,
    shadowColor: '#9a7e9a',
    shadowBlur: 14,
    shadowY: 7,
    follow: false,
    followPlacement: 'above',
    followGap: 8,
    followX: 0,
    followY: 0,
    followSnap: false,
    followInside: true,
    followFlip: false,
  },
  loader: {
    type: 'bar',
    x: 50,
    y: 75,
    glow: true,
    glowColor: '#ffb0ca',
    glowBlur: 14,
    seed: 21,
    trackColor: '#eadfeb',
    fillColor: '#ff7ea8',
    borderColor: '#5a4058',
    borderWidth: 2,
  },
  bar: {
    style: 'rounded',
    mode: 'cubicInOut',
    start: 0,
    end: 100,
    keys: DEFAULT_KEYS,
    width: 58,
    height: 7,
    fill: 'solid',
    stops: DEFAULT_STOPS,
    angle: 0,
    colorBlur: 0,
    flow: false,
    flowSpeed: 0.28,
    flowReverse: false,
    shimmer: true,
    segments: 10,
    percent: false,
    percentX: 0,
    percentY: 0,
    fadeIn: false,
    fadeInDuration: 0.7,
    hold: 0.35,
    vanish: 'fade',
    vanishDuration: 0.7,
    intensity: 1,
  },
  loop: {
    style: 'dots',
    count: 10,
    radius: 28,
    size: 9,
    speed: 1.2,
    clockwise: true,
    trail: true,
    pulse: true,
  },
  row: {
    mode: 'progress',
    start: 'shape',
    startImages: null,
    startOrder: 'sequential',
    startFit: 'contain',
    targetImages: null,
    targetOrder: 'sequential',
    targetFit: 'contain',
    pattern: 'all-base',
    count: 8,
    length: 68,
    size: 28,
    order: 'sequential',
    repeats: 3,
    shapes: Array.from({ length: 8 }, (_, i) => defaultRowShape(i)),
  },
  text: {
    top: {
      enabled: true,
      text: '冒險準備中',
      x: 50,
      y: 13,
      rotation: 0,
      font: { source: 'google', family: 'Noto Sans TC', weight: 800 },
      size: 25,
      spacing: 1,
      color: '#5a4058',
      strokeColor: '#ffffff',
      strokeWidth: 4,
    },
    bottom: {
      enabled: true,
      text: '正在整理角色卡與骰子，請稍候',
      x: 50,
      y: 91,
      rotation: 0,
      font: { source: 'google', family: 'Noto Sans TC', weight: 700 },
      size: 16,
      spacing: 0.5,
      color: '#765d73',
      strokeColor: '#ffffff',
      strokeWidth: 3,
    },
  },
  duration: 3,
  export: {
    format: 'apng',
    fps: 12,
    plays: 0,
    quality: 0.9,
    gifThreshold: 96,
    quantize: false,
    fileName: DEFAULT_FILE_STEM,
    includeAssets: true,
  },
};

/* ---------- 範圍（滑桿、數值欄與整理共用） ---------- */

/** [最小, 最大]；input 是數值欄可以超出滑桿的範圍（拖曳也可以超出） */
export const RANGE = {
  canvasSide: [64, 1920],
  charPos: [-20, 120],
  posInput: [-50, 150],
  charSize: [5, 100],
  rotation: [-180, 180],
  motionAmount: [0, 30],
  motionSpeed: [0, 4],
  speed: [0.1, 4],
  charFps: [1, 30],
  shadowBlur: [0, 80],
  shadowY: [-50, 80],
  followGap: [-40, 100],
  followOffset: [-120, 120],
  followOffsetXInput: [-320, 320],
  followOffsetYInput: [-240, 240],
  loaderPos: [-20, 120],
  glowBlur: [0, 50],
  seed: [1, 99999],
  barWidth: [5, 100],
  barHeight: [1, 20],
  percentX: [-320, 320],
  percentY: [-240, 240],
  percentXInput: [-640, 640],
  percentYInput: [-480, 480],
  angle: [-180, 180],
  colorBlur: [0, 40],
  flowSpeed: [0.02, 2],
  borderWidth: [0, 8],
  segments: [2, 30],
  fadeIn: [0.1, 10],
  hold: [0, 20],
  vanishDuration: [0.1, 10],
  intensity: [0.25, 2.5],
  loopCount: [3, 24],
  loopRadius: [6, 90],
  loopSize: [2, 30],
  loopSpeed: [0.05, 4],
  rowCount: [1, 30],
  rowLength: [8, 120],
  rowSize: [4, 64],
  repeats: [1, 12],
  textX: [-20, 120],
  textY: [0, 100],
  textSize: [8, 80],
  weight: [100, 900],
  spacing: [-2, 12],
  textStroke: [0, 20],
  duration: [0.25, 120],
  fps: [2, 60],
  plays: [0, 65535],
  quality: [0.1, 1],
  gifThreshold: [0, 254],
  stopPos: [0, 100],
  previewRate: [0.1, 4],
} as const satisfies Record<string, readonly [number, number]>;

export const MAX_STOPS = 7;
export const MIN_STOPS = 2;
export const MAX_KEYFRAMES = 16;
/** 角色最多幾格（F14） */
export const MAX_CHARACTER_FRAMES = 500;
/** 處理量上限：寬 × 高 × 格數（F164） */
export const PIXEL_BUDGET = 220_000_000;

/** 常用尺寸（F43） */
export const SIZE_PRESETS: readonly { w: number; h: number }[] = [
  { w: 640, h: 360 },
  { w: 800, h: 450 },
  { w: 960, h: 540 },
  { w: 512, h: 512 },
];

/* ---------- 整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const num = (v: unknown, [lo, hi]: readonly [number, number], fallback: number, int = false) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const c = Math.min(hi, Math.max(lo, n));
  return int ? Math.round(c) : c;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const color = (v: unknown, fallback: string) => {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return fallback;
};
const str = (v: unknown, fallback: string, max = 2000) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;

const strList = (v: unknown, max = 500) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [];

function imageSet(v: unknown): ImageSet | null {
  if (!isObj(v)) return null;
  const ids = strList(v.ids);
  if (!ids.length) return null;
  const names = strList(v.names);
  return { ids, names: ids.map((_, i) => names[i] ?? `${i + 1}`) };
}

function upload(v: unknown): CharacterUpload | null {
  const set = imageSet(v);
  if (!set || !isObj(v)) return null;
  const kind = v.kind === 'sequence' && set.ids.length > 1 ? 'sequence' : 'file';
  return { kind, ids: kind === 'file' ? set.ids.slice(0, 1) : set.ids, names: set.names };
}

function font(v: unknown, fallback: FontValue): FontValue {
  if (!isObj(v)) return { ...fallback };
  const source = pick(v.source, ['google', 'local', 'upload'] as const, fallback.source);
  const family = typeof v.family === 'string' && v.family.trim() ? v.family : fallback.family;
  return {
    source,
    family: family.slice(0, 200),
    weight: num(v.weight, RANGE.weight, fallback.weight, true),
  };
}

function textBlock(v: unknown, d: TextBlock): TextBlock {
  const s = isObj(v) ? v : {};
  return {
    enabled: bool(s.enabled, d.enabled),
    text: str(s.text, d.text),
    x: num(s.x, RANGE.posInput, d.x),
    y: num(s.y, RANGE.posInput, d.y),
    rotation: num(s.rotation, RANGE.rotation, d.rotation),
    font: font(s.font, d.font),
    size: num(s.size, RANGE.textSize, d.size),
    spacing: num(s.spacing, RANGE.spacing, d.spacing),
    color: color(s.color, d.color),
    strokeColor: color(s.strokeColor, d.strokeColor),
    strokeWidth: num(s.strokeWidth, RANGE.textStroke, d.strokeWidth),
  };
}

/** 色標：2～7 個、依位置排序 */
export function normalizeStops(v: unknown): GradientStopSetting[] {
  const list = Array.isArray(v) ? v.filter(isObj).slice(0, MAX_STOPS) : [];
  const stops = list
    .map((s, i) => ({
      pos: num(s.pos, RANGE.stopPos, 0),
      color: color(s.color, DEFAULT_STOPS[i % DEFAULT_STOPS.length].color),
    }))
    .sort((a, b) => a.pos - b.pos);
  return stops.length >= MIN_STOPS ? stops : DEFAULT_STOPS.map((s) => ({ ...s }));
}

function keyframes(v: unknown): Keyframe[] {
  const list = Array.isArray(v) ? v.filter(isObj).slice(0, MAX_KEYFRAMES) : [];
  const keys = list.map((k) => ({
    time: num(k.time, [0, 120], 0),
    value: num(k.value, [0, 100], 0),
    curve: pick(k.curve, PROGRESS_CURVES, 'linear'),
  }));
  return keys.length >= 2 ? keys : DEFAULT_KEYS.map((k) => ({ ...k }));
}

/** 底形清單：長度跟著格數，新增的格依預設順序補上 */
export function fitRowShapes(shapes: readonly string[], count: number): RowShape[] {
  return Array.from({ length: count }, (_, i) => pick(shapes[i], ROW_SHAPES, defaultRowShape(i)));
}

/**
 * 讀回存檔或專案檔：缺的欄位補預設、數值夾在範圍、未知的選項換成預設。
 * 不是物件時回傳 null（不是本工具的資料）。
 */
export function normalizeSettings(input: unknown): LmSettings | null {
  if (!isObj(input)) return null;
  const D = DEFAULT_SETTINGS;
  const cv = isObj(input.canvas) ? input.canvas : {};
  const ch = isObj(input.character) ? input.character : {};
  const ld = isObj(input.loader) ? input.loader : {};
  const br = isObj(input.bar) ? input.bar : {};
  const lp = isObj(input.loop) ? input.loop : {};
  const rw = isObj(input.row) ? input.row : {};
  const tx = isObj(input.text) ? input.text : {};
  const ex = isObj(input.export) ? input.export : {};
  const rowCount = num(rw.count, RANGE.rowCount, D.row.count, true);
  const out: LmSettings = {
    canvas: {
      width: num(cv.width, RANGE.canvasSide, D.canvas.width, true),
      height: num(cv.height, RANGE.canvasSide, D.canvas.height, true),
      transparent: bool(cv.transparent, D.canvas.transparent),
      background: color(cv.background, D.canvas.background),
      snapCanvas: bool(cv.snapCanvas, D.canvas.snapCanvas),
      snapItems: bool(cv.snapItems, D.canvas.snapItems),
    },
    character: {
      builtin: pick(ch.builtin, BUILTIN_CHARACTERS, D.character.builtin),
      upload: upload(ch.upload),
      x: num(ch.x, RANGE.posInput, D.character.x),
      y: num(ch.y, RANGE.posInput, D.character.y),
      size: num(ch.size, RANGE.charSize, D.character.size),
      rotation: num(ch.rotation, RANGE.rotation, D.character.rotation),
      opacity: num(ch.opacity, [0, 1], D.character.opacity),
      motion: pick(ch.motion, MOTION_KINDS, D.character.motion),
      motionAmount: num(ch.motionAmount, RANGE.motionAmount, D.character.motionAmount),
      motionSpeed: num(ch.motionSpeed, RANGE.motionSpeed, D.character.motionSpeed),
      fileTiming: bool(ch.fileTiming, D.character.fileTiming),
      speed: num(ch.speed, RANGE.speed, D.character.speed),
      fps: num(ch.fps, RANGE.charFps, D.character.fps, true),
      shadow: bool(ch.shadow, D.character.shadow),
      shadowColor: color(ch.shadowColor, D.character.shadowColor),
      shadowBlur: num(ch.shadowBlur, RANGE.shadowBlur, D.character.shadowBlur),
      shadowY: num(ch.shadowY, RANGE.shadowY, D.character.shadowY),
      follow: bool(ch.follow, D.character.follow),
      followPlacement: pick(
        ch.followPlacement,
        ['above', 'center', 'below'] as const,
        D.character.followPlacement,
      ),
      followGap: num(ch.followGap, RANGE.followGap, D.character.followGap),
      followX: num(ch.followX, RANGE.followOffsetXInput, D.character.followX),
      followY: num(ch.followY, RANGE.followOffsetYInput, D.character.followY),
      followSnap: bool(ch.followSnap, D.character.followSnap),
      followInside: bool(ch.followInside, D.character.followInside),
      followFlip: bool(ch.followFlip, D.character.followFlip),
    },
    loader: {
      type: pick(ld.type, LOADER_TYPES, D.loader.type),
      x: num(ld.x, RANGE.posInput, D.loader.x),
      y: num(ld.y, RANGE.posInput, D.loader.y),
      glow: bool(ld.glow, D.loader.glow),
      glowColor: color(ld.glowColor, D.loader.glowColor),
      glowBlur: num(ld.glowBlur, RANGE.glowBlur, D.loader.glowBlur),
      seed: num(ld.seed, RANGE.seed, D.loader.seed, true),
      trackColor: color(ld.trackColor, D.loader.trackColor),
      fillColor: color(ld.fillColor, D.loader.fillColor),
      borderColor: color(ld.borderColor, D.loader.borderColor),
      borderWidth: num(ld.borderWidth, RANGE.borderWidth, D.loader.borderWidth),
    },
    bar: {
      style: pick(br.style, BAR_STYLES, D.bar.style),
      mode: pick(br.mode, PROGRESS_MODES, D.bar.mode),
      start: num(br.start, [0, 100], D.bar.start),
      end: num(br.end, [0, 100], D.bar.end),
      keys: keyframes(br.keys),
      width: num(br.width, RANGE.barWidth, D.bar.width),
      height: num(br.height, RANGE.barHeight, D.bar.height),
      fill: br.fill === 'gradient' ? 'gradient' : 'solid',
      stops: normalizeStops(br.stops),
      angle: num(br.angle, RANGE.angle, D.bar.angle),
      colorBlur: num(br.colorBlur, RANGE.colorBlur, D.bar.colorBlur),
      flow: bool(br.flow, D.bar.flow),
      flowSpeed: num(br.flowSpeed, RANGE.flowSpeed, D.bar.flowSpeed),
      flowReverse: bool(br.flowReverse, D.bar.flowReverse),
      shimmer: bool(br.shimmer, D.bar.shimmer),
      segments: num(br.segments, RANGE.segments, D.bar.segments, true),
      percent: bool(br.percent, D.bar.percent),
      percentX: num(br.percentX, RANGE.percentXInput, D.bar.percentX),
      percentY: num(br.percentY, RANGE.percentYInput, D.bar.percentY),
      fadeIn: bool(br.fadeIn, D.bar.fadeIn),
      fadeInDuration: num(br.fadeInDuration, RANGE.fadeIn, D.bar.fadeInDuration),
      hold: num(br.hold, RANGE.hold, D.bar.hold),
      vanish: pick(br.vanish, VANISH_MODES, D.bar.vanish),
      vanishDuration: num(br.vanishDuration, RANGE.vanishDuration, D.bar.vanishDuration),
      intensity: num(br.intensity, RANGE.intensity, D.bar.intensity),
    },
    loop: {
      style: pick(lp.style, LOOP_STYLES, D.loop.style),
      count: num(lp.count, RANGE.loopCount, D.loop.count, true),
      radius: num(lp.radius, RANGE.loopRadius, D.loop.radius),
      size: num(lp.size, RANGE.loopSize, D.loop.size),
      speed: num(lp.speed, RANGE.loopSpeed, D.loop.speed),
      clockwise: bool(lp.clockwise, D.loop.clockwise),
      trail: bool(lp.trail, D.loop.trail),
      pulse: bool(lp.pulse, D.loop.pulse),
    },
    row: {
      mode: rw.mode === 'loop' ? 'loop' : 'progress',
      start: rw.start === 'images' ? 'images' : 'shape',
      startImages: imageSet(rw.startImages),
      startOrder: pick(rw.startOrder, IMAGE_ORDERS, D.row.startOrder),
      startFit: rw.startFit === 'cover' ? 'cover' : 'contain',
      targetImages: imageSet(rw.targetImages),
      targetOrder: pick(rw.targetOrder, IMAGE_ORDERS, D.row.targetOrder),
      targetFit: rw.targetFit === 'cover' ? 'cover' : 'contain',
      pattern: pick(rw.pattern, ROW_PATTERNS, D.row.pattern),
      count: rowCount,
      length: num(rw.length, RANGE.rowLength, D.row.length),
      size: num(rw.size, RANGE.rowSize, D.row.size),
      order: pick(rw.order, IMAGE_ORDERS, D.row.order),
      repeats: num(rw.repeats, RANGE.repeats, D.row.repeats, true),
      shapes: fitRowShapes(strList(rw.shapes, 30), rowCount),
    },
    text: {
      top: textBlock(tx.top, D.text.top),
      bottom: textBlock(tx.bottom, D.text.bottom),
    },
    duration: num(input.duration, RANGE.duration, D.duration),
    export: {
      format: pick(ex.format, EXPORT_FORMAT_IDS, D.export.format),
      fps: num(ex.fps, RANGE.fps, D.export.fps, true),
      plays: num(ex.plays, RANGE.plays, D.export.plays, true),
      quality: num(ex.quality, RANGE.quality, D.export.quality),
      gifThreshold: num(ex.gifThreshold, RANGE.gifThreshold, D.export.gifThreshold, true),
      quantize: bool(ex.quantize, D.export.quantize),
      fileName: str(ex.fileName, D.export.fileName, 200),
      includeAssets: bool(ex.includeAssets, D.export.includeAssets),
    },
  };
  if (out.bar.end < out.bar.start) [out.bar.start, out.bar.end] = [out.bar.end, out.bar.start];
  return settle(out);
}

/**
 * 設定之間的連動（每次修改後都套用；直接改傳入的物件，可以在 Immer 的 draft 上用）：
 * - 自訂時間表時長度＝最末節點的時間（切回其他方式後保留，F68、3.2）；
 * - 底形清單長度跟著格數（F133）。
 * 起點、終點的對調（F69）在欄位確定時做（打字中不跳動；畫的時候一律取較小者為起點）。
 */
export function settle(s: LmSettings): LmSettings {
  if (s.loader.type === 'bar' && s.bar.mode === 'keyframes') {
    const last = s.bar.keys[s.bar.keys.length - 1]?.time ?? s.duration;
    const d = Math.min(RANGE.duration[1], Math.max(RANGE.duration[0], last));
    if (d !== s.duration) s.duration = d;
  }
  if (s.row.shapes.length !== s.row.count) s.row.shapes = fitRowShapes(s.row.shapes, s.row.count);
  return s;
}

/** 所有用到的資產 id（角色、兩組換圖） */
export function assetIdsOf(s: LmSettings): string[] {
  return [
    ...(s.character.upload?.ids ?? []),
    ...(s.row.startImages?.ids ?? []),
    ...(s.row.targetImages?.ids ?? []),
  ];
}
