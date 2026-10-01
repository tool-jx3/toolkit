/**
 * 狀態條產生器的設定：型別、預設值（＝預設範本「基本」的外觀＋規格第 1 節的數值預設）、
 * 範圍與正規化（自動存檔、專案檔讀回來時補齊缺的欄位、夾在範圍內、未知的值換回預設）。
 * 純資料模組，不依賴 React。
 */
import type { TextOutlineKind } from '@/core/css';

export const TOOL_ID = 'status-bar';
/** CCFOLIA 角色狀態頁最多幾條 */
export const MAX_BARS = 8;

export type Direction = 'vertical' | 'horizontal' | 'grid';
export type TextPos = 'inside' | 'top' | 'bottom' | 'three' | 'two';
/** 壓在條上時：標籤靠左＋數值靠右／標籤靠左＋數值置中／只顯示置中的數值 */
export type InsideAlign = 'split' | 'center' | 'value';
export type AvatarPos = 'left' | 'right' | 'top';
/** 保留上緣裁切／置中裁切／完整收進 */
export type AvatarFit = 'top' | 'center' | 'contain';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
/** 圓角矩形／膠囊形／平行四邊形／四角切斜角／兩端尖的箭形／只切右上與左下 */
export type Shape = 'round' | 'pill' | 'slant' | 'chamfer' | 'arrow' | 'notch';
export type TroughKind = 'dark' | 'mix' | 'none';
export type FillKind = 'solid' | 'vgrad' | 'hgrad' | 'gloss' | 'stripe' | 'neon';
export type ValueMode = 'both' | 'current' | 'none';
export type NamePos = 'top' | 'group' | 'bottom' | 'left' | 'avatar' | 'none';
export type NameLook = 'plate' | 'text' | 'underline' | 'side' | 'tab' | 'badge';
export type NameAlign = 'left' | 'center' | 'right';
export type NameOverflow = 'ellipsis' | 'wrap' | 'grow';
export type FrameKind = 'single' | 'double' | 'dashed' | 'glow' | 'corners' | 'thin';
export type PanelTexture = 'none' | 'paper' | 'grain';
export type ItemSide = 'left' | 'right';

export const SYMBOL_KINDS = [
  'none',
  'heart',
  'star',
  'drop',
  'bolt',
  'shield',
  'sword',
  'flame',
  'skull',
  'moon',
  'clover',
  'eye',
  'gem',
  'hourglass',
] as const;
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

export const ITEM_KINDS = ['none', 'heart', 'shield', 'gem', 'potion', 'candle', 'die'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** CSS 用的字型（字重另外存：標籤與數值共用一個字重） */
export interface FontRef {
  source: 'google' | 'local';
  family: string;
}

/** 每一條（第 1～8 條）自己的設定 */
export interface BarSlot {
  /** 顏色 1（主色） */
  color1: string;
  /** 顏色 2（漸層、斜紋、光澤下半、道具暗部） */
  color2: string;
  symbol: SymbolKind;
  item: ItemKind;
  /** 名稱覆寫（空白＝維持 CCFOLIA 的狀態名稱） */
  label: string;
  /** 是否套用危急演出 */
  critical: boolean;
}

export interface Character {
  /** 內部用的識別碼（不是 CCFOLIA 的角色 ID） */
  id: string;
  name: string;
  color: string;
  /** 角色 ID 或棋子網址 */
  ref: string;
}

export interface Settings {
  /** 最後套用的範本 id（CSS 開頭註記「以範本…為基礎」） */
  templateId: string | null;

  /* 1.1 整體排列 */
  barCount: number;
  hideExtra: boolean;
  direction: Direction;
  columns: number;
  barWidth: number;
  barHeight: number;
  barGap: number;
  textPos: TextPos;
  insideAlign: InsideAlign;
  textInset: number;
  labelWidth: number;
  valueWidth: number;
  textGap: number;
  margin: number;

  /* 1.2 頭像與先攻 */
  avatar: {
    show: boolean;
    pos: AvatarPos;
    width: number;
    height: number;
    fit: AvatarFit;
    radius: number;
    borderWidth: number;
    /** #rrggbbaa（含不透明度） */
    borderColor: string;
    borderUseChar: boolean;
    /** #rrggbbaa */
    background: string;
    gap: number;
  };
  initiative: { show: boolean; corner: Corner; size: number; color: string; background: string };

  /* 1.3 條本體 */
  shape: Shape;
  radius: number;
  cut: number;
  skew: number;
  /** 外框：粗細、顏色（#rrggbbaa）、雙線 */
  border: { width: number; color: string; double: boolean };
  /** 底槽：種類、顏色（#rrggbbaa）、混色比例 % */
  trough: { kind: TroughKind; color: string; mix: number };
  fill: FillKind;
  stripeFlow: boolean;
  segments: number;
  segmentGap: number;
  /** 增減速度（秒；0＝瞬間） */
  speed: number;
  /** 陰影濃度 % */
  shadow: number;
  symbols: { show: boolean; size: number; gap: number };
  bars: BarSlot[];

  /* 1.4 文字 */
  text: {
    labelFont: FontRef;
    valueFont: FontRef;
    weight: number;
    labelSize: number;
    currentSize: number;
    maxSize: number;
    /** 字距（字級的倍數） */
    spacing: number;
    showLabel: boolean;
    valueMode: ValueMode;
    color: string;
    /** #rrggbbaa */
    maxColor: string;
    labelBarColor: boolean;
    outline: TextOutlineKind;
    /** #rrggbbaa */
    outlineColor: string;
    outlineWidth: number;
  };

  /* 1.5 角色名稱 */
  name: {
    pos: NamePos;
    look: NameLook;
    font: FontRef;
    weight: number;
    size: number;
    color: string;
    /** #rrggbbaa */
    background: string;
    accent: string;
    accentUseChar: boolean;
    align: NameAlign;
    overflow: NameOverflow;
    vertical: boolean;
    verticalWrap: boolean;
    gap: number;
  };

  /* 1.6 演出 */
  red: { on: boolean; color: string; blink: boolean };
  critical: {
    on: boolean;
    /** 門檻 %（低於，不含等於） */
    threshold: number;
    color: string;
    pulse: boolean;
    blink: boolean;
    shake: boolean;
    barColor: boolean;
    valueColor: boolean;
  };
  zero: { on: boolean; gray: boolean; blink: boolean };
  cracks: { on: boolean; color: string; opacity: number };
  items: {
    on: boolean;
    count: number;
    size: number;
    gap: number;
    side: ItemSide;
    distance: number;
  };
  damageFlash: boolean;

  /* 1.7 裝飾 */
  panel: {
    on: boolean;
    /** #rrggbbaa */
    color: string;
    radius: number;
    padding: number;
    borderWidth: number;
    borderColor: string;
    borderOpacity: number;
    strip: boolean;
    texture: PanelTexture;
  };
  frame: {
    on: boolean;
    kind: FrameKind;
    width: number;
    useChar: boolean;
    color: string;
    opacity: number;
    gap: number;
    radius: number;
    corner: number;
  };
  gloss: { on: boolean; strength: number };
  glow: { on: boolean; spread: number; strength: number };
  lead: { on: boolean; strength: number };
  sweep: { on: boolean; strength: number; interval: number };
  scanlines: { on: boolean; strength: number; period: number };
  ticks: { on: boolean; count: number; color: string; strength: number };
  grain: { on: boolean; strength: number };
  brackets: {
    on: boolean;
    color: string;
    strength: number;
    length: number;
    width: number;
    gap: number;
  };

  /* 1.8 房間、角色與網址 */
  room: string;
  characters: Character[];
  fileName: string;
}

/* ---------- 範圍（規格第 1 節） ---------- */

export interface NumRange {
  min: number;
  max: number;
  step: number;
}

const R = (min: number, max: number, step = 1): NumRange => ({ min, max, step });

/** 數值設定的範圍；鍵是設定路徑 */
export const RANGES = {
  barCount: R(1, 8),
  columns: R(2, 4),
  barWidth: R(80, 600, 2),
  barHeight: R(3, 80),
  barGap: R(0, 40),
  textInset: R(0, 30),
  labelWidth: R(16, 160),
  valueWidth: R(24, 200),
  textGap: R(0, 24),
  margin: R(0, 40),
  'avatar.width': R(24, 320, 2),
  'avatar.height': R(24, 480, 2),
  'avatar.radius': R(0, 160),
  'avatar.borderWidth': R(0, 8),
  'avatar.gap': R(0, 40),
  'initiative.size': R(14, 48),
  radius: R(0, 40),
  cut: R(0, 40),
  skew: R(0, 40),
  'border.width': R(0, 6),
  'trough.mix': R(0, 100),
  segments: R(0, 40),
  segmentGap: R(1, 8),
  speed: R(0, 2, 0.05),
  shadow: R(0, 100, 5),
  'symbols.size': R(10, 48),
  'symbols.gap': R(0, 20),
  'text.labelSize': R(8, 48),
  'text.currentSize': R(8, 64),
  'text.maxSize': R(6, 48),
  'text.spacing': R(0, 0.3, 0.01),
  'text.outlineWidth': R(1, 5, 0.5),
  'name.size': R(10, 64),
  'name.gap': R(0, 40),
  'critical.threshold': R(5, 95, 5),
  'cracks.opacity': R(10, 100, 5),
  'items.count': R(1, 20),
  'items.size': R(12, 64),
  'items.gap': R(-8, 16),
  'items.distance': R(0, 30),
  'panel.radius': R(0, 40),
  'panel.padding': R(0, 40),
  'panel.borderWidth': R(0, 6),
  'panel.borderOpacity': R(0, 100),
  'frame.width': R(1, 8),
  'frame.opacity': R(5, 100),
  'frame.gap': R(-12, 24),
  'frame.radius': R(0, 40),
  'frame.corner': R(4, 60),
  'gloss.strength': R(5, 100),
  'glow.spread': R(1, 20),
  'glow.strength': R(5, 100),
  'lead.strength': R(10, 100),
  'sweep.strength': R(5, 100),
  'sweep.interval': R(1, 12, 0.5),
  'scanlines.strength': R(5, 100),
  'scanlines.period': R(2, 8),
  'ticks.count': R(2, 20),
  'ticks.strength': R(5, 100),
  'grain.strength': R(5, 100),
  'brackets.strength': R(5, 100),
  'brackets.length': R(3, 24),
  'brackets.width': R(1, 4),
  'brackets.gap': R(0, 12),
} as const satisfies Record<string, NumRange>;

export type RangeKey = keyof typeof RANGES;

/** 標籤／數值／名稱的字重選單（400～900 六級） */
export const WEIGHTS = [400, 500, 600, 700, 800, 900] as const;

/* ---------- 預設值 ---------- */

/** 預設範本「基本」的每條外觀（顏色、符號、道具輪流分配不同種類） */
export const DEFAULT_BARS: readonly BarSlot[] = [
  {
    color1: '#f0605a',
    color2: '#8c2230',
    symbol: 'heart',
    item: 'heart',
    label: '',
    critical: true,
  },
  { color1: '#4f9df0', color2: '#1f3f8c', symbol: 'star', item: 'gem', label: '', critical: true },
  {
    color1: '#a77cf0',
    color2: '#4a2a8c',
    symbol: 'eye',
    item: 'candle',
    label: '',
    critical: true,
  },
  {
    color1: '#5cc98a',
    color2: '#1f6b45',
    symbol: 'clover',
    item: 'shield',
    label: '',
    critical: true,
  },
  {
    color1: '#f0b24f',
    color2: '#8c5a1f',
    symbol: 'bolt',
    item: 'potion',
    label: '',
    critical: true,
  },
  { color1: '#4fd1d9', color2: '#1f6b72', symbol: 'drop', item: 'die', label: '', critical: true },
  {
    color1: '#f07ab4',
    color2: '#8c2a5a',
    symbol: 'moon',
    item: 'heart',
    label: '',
    critical: true,
  },
  {
    color1: '#b5bfcc',
    color2: '#4a5260',
    symbol: 'shield',
    item: 'gem',
    label: '',
    critical: true,
  },
];

const TC_SANS: FontRef = { source: 'google', family: 'Noto Sans TC' };

export const DEFAULT_SETTINGS: Settings = {
  templateId: null,

  barCount: 3,
  hideExtra: true,
  direction: 'vertical',
  columns: 2,
  barWidth: 320,
  barHeight: 34,
  barGap: 6,
  textPos: 'inside',
  insideAlign: 'split',
  textInset: 10,
  labelWidth: 52,
  valueWidth: 86,
  textGap: 4,
  margin: 10,

  avatar: {
    show: false,
    pos: 'left',
    width: 88,
    height: 88,
    fit: 'top',
    radius: 6,
    borderWidth: 1,
    borderColor: '#ffffff99',
    borderUseChar: false,
    background: '#10121880',
    gap: 8,
  },
  initiative: { show: false, corner: 'tr', size: 24, color: '#15161a', background: '#f2f2f2' },

  shape: 'round',
  radius: 6,
  cut: 10,
  skew: 12,
  border: { width: 1, color: '#ffffff47', double: false },
  trough: { kind: 'dark', color: '#0d0f14c7', mix: 25 },
  fill: 'vgrad',
  stripeFlow: false,
  segments: 0,
  segmentGap: 2,
  speed: 0.25,
  shadow: 45,
  symbols: { show: false, size: 20, gap: 6 },
  bars: DEFAULT_BARS.map((b) => ({ ...b })),

  text: {
    labelFont: TC_SANS,
    valueFont: TC_SANS,
    weight: 700,
    labelSize: 17,
    currentSize: 18,
    maxSize: 12,
    spacing: 0.04,
    showLabel: true,
    valueMode: 'both',
    color: '#ffffff',
    maxColor: '#ffffffb3',
    labelBarColor: false,
    outline: 'soft',
    outlineColor: '#000000e6',
    outlineWidth: 2,
  },

  name: {
    pos: 'top',
    look: 'plate',
    font: TC_SANS,
    weight: 700,
    size: 17,
    color: '#ffffff',
    background: '#14161ce0',
    accent: '#f0605a',
    accentUseChar: false,
    align: 'left',
    overflow: 'ellipsis',
    vertical: false,
    verticalWrap: true,
    gap: 6,
  },

  red: { on: true, color: '#ff6b6b', blink: false },
  critical: {
    on: true,
    threshold: 25,
    color: '#ff3b30',
    pulse: true,
    blink: false,
    shake: false,
    barColor: false,
    valueColor: true,
  },
  zero: { on: true, gray: true, blink: false },
  cracks: { on: false, color: '#ffffff', opacity: 85 },
  items: { on: false, count: 1, size: 26, gap: 3, side: 'left', distance: 8 },
  damageFlash: true,

  panel: {
    on: false,
    color: '#14161cd9',
    radius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ffffff',
    borderOpacity: 12,
    strip: false,
    texture: 'none',
  },
  frame: {
    on: false,
    kind: 'single',
    width: 2,
    useChar: false,
    color: '#ffffff',
    opacity: 80,
    gap: 6,
    radius: 8,
    corner: 16,
  },
  gloss: { on: false, strength: 30 },
  glow: { on: false, spread: 6, strength: 60 },
  lead: { on: false, strength: 85 },
  sweep: { on: false, strength: 35, interval: 4 },
  scanlines: { on: false, strength: 25, period: 3 },
  ticks: { on: false, count: 10, color: '#ffffff', strength: 50 },
  grain: { on: false, strength: 30 },
  brackets: { on: false, color: '#ffffff', strength: 90, length: 8, width: 2, gap: 4 },

  room: '',
  characters: [],
  fileName: 'statusbar',
};

/** 範例（預覽「範例」時）的名稱 */
export const EXAMPLE_NAME = '白鴉';
/** 估算來源大小用的 10 個字名稱（範例 CSS 改成自己 10 字以內的名稱也放得下） */
export const TEN_CHAR_NAME = '國國國國國國國國國國';

/** 新增角色時依序輪流指定的 8 色 */
export const CHARACTER_COLORS = [
  '#f0605a',
  '#4f9df0',
  '#5cc98a',
  '#f0b24f',
  '#a77cf0',
  '#4fd1d9',
  '#f07ab4',
  '#b5bfcc',
] as const;

/* ---------- 預覽與測試（不列入復原） ---------- */

export interface TestStatus {
  label: string;
  value: number;
  max: number;
}

/** 測試數值的 8 組範例 */
export const DEFAULT_TESTS: readonly TestStatus[] = [
  { label: 'HP', value: 10, max: 14 },
  { label: 'MP', value: 6, max: 10 },
  { label: 'SAN', value: 48, max: 60 },
  { label: '體力', value: 12, max: 16 },
  { label: '護盾', value: 3, max: 6 },
  { label: '幸運', value: 40, max: 50 },
  { label: '氣力', value: 5, max: 8 },
  { label: '侵蝕', value: 22, max: 100 },
];

export type PreviewBgKind = 'checker' | 'dark' | 'light' | 'scene';

export interface PreviewData {
  /** 目前的設定分頁 */
  tab: string;
  background: PreviewBgKind;
  /** 預覽對象：'example' 或角色的內部 id */
  target: string;
  tests: TestStatus[];
  initiative: number;
  /** 預覽時多放兩個狀態（看「隱藏多餘的條」的效果） */
  showExtras: boolean;
  showBefore: boolean;
}

export const DEFAULT_PREVIEW: PreviewData = {
  tab: 'layout',
  background: 'checker',
  target: 'example',
  tests: DEFAULT_TESTS.map((t) => ({ ...t })),
  initiative: 12,
  showExtras: false,
  showBefore: false,
};

/* ---------- 正規化 ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), obj);
}

export function setPath(obj: Obj, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!isObj(o[keys[i]])) o[keys[i]] = {};
    o = o[keys[i]] as Obj;
  }
  o[keys[keys.length - 1]] = value;
}

/** 夾在範圍內並對齊步進（非數字時用預設值） */
export function clampRange(v: unknown, r: NumRange, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(r.max, Math.max(r.min, n));
  const stepped = r.min + Math.round((c - r.min) / r.step) * r.step;
  const digits = Math.max(0, -Math.floor(Math.log10(r.step) + 1e-9));
  return Number(Math.min(r.max, Math.max(r.min, stepped)).toFixed(Math.max(digits, 2)));
}

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
const color = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

function font(v: unknown, fallback: FontRef): FontRef {
  if (!isObj(v)) return { ...fallback };
  const source = v.source === 'local' ? 'local' : v.source === 'google' ? 'google' : null;
  if (!source || typeof v.family !== 'string') return { ...fallback };
  return { source, family: v.family };
}

function weight(v: unknown, fallback: number): number {
  return WEIGHTS.includes(v as (typeof WEIGHTS)[number]) ? (v as number) : fallback;
}

/** 依預設值的型別逐欄修正（數值夾範圍、顏色檢查、列舉值檢查） */
const ENUMS: Record<string, readonly string[]> = {
  direction: ['vertical', 'horizontal', 'grid'],
  textPos: ['inside', 'top', 'bottom', 'three', 'two'],
  insideAlign: ['split', 'center', 'value'],
  'avatar.pos': ['left', 'right', 'top'],
  'avatar.fit': ['top', 'center', 'contain'],
  'initiative.corner': ['tl', 'tr', 'bl', 'br'],
  shape: ['round', 'pill', 'slant', 'chamfer', 'arrow', 'notch'],
  'trough.kind': ['dark', 'mix', 'none'],
  fill: ['solid', 'vgrad', 'hgrad', 'gloss', 'stripe', 'neon'],
  'text.valueMode': ['both', 'current', 'none'],
  'text.outline': ['soft', 'stroke', 'glow', 'none'],
  'name.pos': ['top', 'group', 'bottom', 'left', 'avatar', 'none'],
  'name.look': ['plate', 'text', 'underline', 'side', 'tab', 'badge'],
  'name.align': ['left', 'center', 'right'],
  'name.overflow': ['ellipsis', 'wrap', 'grow'],
  'items.side': ['left', 'right'],
  'panel.texture': ['none', 'paper', 'grain'],
  'frame.kind': ['single', 'double', 'dashed', 'glow', 'corners', 'thin'],
};

function fixValue(path: string, def: unknown, raw: unknown): unknown {
  if (path in RANGES) return clampRange(raw, RANGES[path as RangeKey], def as number);
  if (path in ENUMS) return oneOf(raw, ENUMS[path], def as string);
  if (path.endsWith('Font') || path === 'name.font') return font(raw, def as FontRef);
  if (path === 'text.weight' || path === 'name.weight') return weight(raw, def as number);
  if (typeof def === 'boolean') return bool(raw, def);
  if (typeof def === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  }
  if (typeof def === 'string') {
    if (HEX.test(def)) return color(raw, def);
    return str(raw, def);
  }
  return def;
}

function fixObject(def: Obj, raw: unknown, prefix: string): Obj {
  const src = isObj(raw) ? raw : {};
  const out: Obj = {};
  for (const [k, d] of Object.entries(def)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isObj(d) && !path.endsWith('Font') && path !== 'name.font')
      out[k] = fixObject(d, src[k], path);
    else out[k] = fixValue(path, d, src[k]);
  }
  return out;
}

function fixBar(raw: unknown, def: BarSlot): BarSlot {
  const r = isObj(raw) ? raw : {};
  return {
    color1: color(r.color1, def.color1),
    color2: color(r.color2, def.color2),
    symbol: oneOf(r.symbol, SYMBOL_KINDS, def.symbol),
    item: oneOf(r.item, ITEM_KINDS, def.item),
    label: str(r.label, def.label),
    critical: bool(r.critical, def.critical),
  };
}

function fixCharacter(raw: unknown, i: number): Character | null {
  if (!isObj(raw)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `c${i + 1}`,
    name: str(raw.name, ''),
    color: color(raw.color, CHARACTER_COLORS[i % CHARACTER_COLORS.length]),
    ref: str(raw.ref, ''),
  };
}

/**
 * 存檔、專案檔、範本 → 完整且合法的設定：缺的欄位用預設值，數值夾在範圍內，
 * 未知的列舉值、壞掉的顏色換回預設，條數夾在 1～8，未知的範本名當作沒有範本。
 */
export function normalizeSettings(
  raw: unknown,
  knownTemplates: readonly string[] | null = null,
): Settings {
  const base = fixObject(DEFAULT_SETTINGS as unknown as Obj, raw, '') as unknown as Settings;
  const r = isObj(raw) ? raw : {};
  const bars = Array.isArray(r.bars) ? r.bars : [];
  base.bars = DEFAULT_BARS.map((d, i) => fixBar(bars[i], d));
  const chars = Array.isArray(r.characters) ? r.characters : [];
  const seen = new Set<string>();
  base.characters = chars
    .map(fixCharacter)
    .filter((c): c is Character => !!c)
    .map((c, i) => {
      let id = c.id;
      while (seen.has(id)) id = `${c.id}-${i}`;
      seen.add(id);
      return { ...c, id };
    });
  const tpl = typeof r.templateId === 'string' ? r.templateId : null;
  base.templateId = tpl && (!knownTemplates || knownTemplates.includes(tpl)) ? tpl : null;
  return base;
}

export function normalizePreview(raw: unknown): PreviewData {
  const r = isObj(raw) ? raw : {};
  const tests = Array.isArray(r.tests) ? r.tests : [];
  return {
    tab: str(r.tab, DEFAULT_PREVIEW.tab),
    background: oneOf(r.background, ['checker', 'dark', 'light', 'scene'], 'checker'),
    target: str(r.target, 'example') || 'example',
    tests: DEFAULT_TESTS.map((d, i) => {
      const t = isObj(tests[i]) ? (tests[i] as Obj) : {};
      const max = clampRange(t.max, R(1, 9999), d.max);
      return {
        label: str(t.label, d.label),
        max,
        value: Math.min(max, clampRange(t.value, R(0, 9999), d.value)),
      };
    }),
    initiative: clampRange(r.initiative, R(0, 99), DEFAULT_PREVIEW.initiative),
    showExtras: bool(r.showExtras, false),
    showBefore: bool(r.showBefore, false),
  };
}

/** 測試先攻值：0～99 的整數，非數字視為 0 */
export function parseInitiative(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(99, Math.max(0, n)) : 0;
}
