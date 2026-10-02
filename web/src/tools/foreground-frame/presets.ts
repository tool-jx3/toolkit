/**
 * 靜態資料：設計範本、差分種類、沿框裝飾、快速邊距、輸出尺寸、電腦內建字型組。
 *
 * 長度都以「畫布高＝1080 單位」計（規格 0.）。顏色組是 [框色 1, 框色 2, 強調色, 文字色]；
 * 時段配色另加 [覆蓋色, 覆蓋強度]。介面上的名稱與說明在 strings.ts（依 id 查）。
 * 範本、預設集依原作（MIT）的數值改寫。
 */
import type {
  ColorRef,
  CornerType,
  Decoration,
  DecoType,
  EffectId,
  FillMode,
  IconId,
  LabelPos,
  LabelStyle,
  Margin,
  OrnamentType,
  Placement,
  VariantKind,
} from './model';

/* ---------- 共用的小工具 ---------- */

const margins = (n: number): Margin => ({ t: n, r: n, b: n, l: n });

export interface DesignLine {
  on: boolean;
  width: number;
  gap: number;
  double: boolean;
  color: ColorRef;
}

export interface DesignOpening {
  shape: 'rect' | 'ellipse';
  margin: Margin;
  linkMargin: boolean;
  corners: { type: CornerType; size: number }[];
  linkCorners: boolean;
  outerRadius: number;
}

export interface DesignFrame {
  fill: FillMode;
  angle: number;
  opacity: number;
  grain: number;
  innerLine: DesignLine;
  outerLine: DesignLine;
  shadow: { on: boolean; size: number; opacity: number; color: ColorRef };
  ornament: { type: OrnamentType; size: number; gap: number; width: number; color: ColorRef };
}

/** 字型組代號（範本的差分標籤字型）：黑體類、明體類 */
export type DesignFontKey = 'gothic' | 'mincho';

export interface DesignIndicator {
  style: LabelStyle;
  pos: LabelPos;
  font: DesignFontKey;
  bgAlpha?: number;
}

/** 範本的時段配色：[框色 1, 框色 2, 強調色, 文字色, 覆蓋色, 覆蓋強度] */
export type TimeRow = readonly [string, string, string, string, string, number];

export interface DesignDef {
  id: string;
  opening: DesignOpening;
  frame: DesignFrame;
  palette: readonly [string, string, string, string];
  times?: Readonly<Record<'morning' | 'day' | 'evening' | 'night', TimeRow>>;
  indicator: DesignIndicator;
  decorations: readonly (Partial<Decoration> & { type: DecoType })[];
}

const line = (
  on: boolean,
  width: number,
  gap: number,
  extra?: Partial<DesignLine>,
): DesignLine => ({
  on,
  width,
  gap,
  double: false,
  color: 'accent',
  ...extra,
});

const opening = (
  m: number | Margin,
  cornerType: CornerType,
  cornerSize: number,
): DesignOpening => ({
  shape: 'rect',
  margin: typeof m === 'number' ? margins(m) : m,
  linkMargin: typeof m === 'number',
  corners: [0, 1, 2, 3].map(() => ({ type: cornerType, size: cornerSize })),
  linkCorners: true,
  outerRadius: 0,
});

const frame = (fill: FillMode, extra?: Partial<DesignFrame>): DesignFrame => ({
  fill,
  angle: 180,
  opacity: 1,
  grain: 0,
  innerLine: line(true, 3, 10),
  outerLine: line(false, 3, 12),
  shadow: { on: true, size: 28, opacity: 0.35, color: '#000000' },
  ornament: { type: 'none', size: 44, gap: 12, width: 3, color: 'accent' },
  ...extra,
});

const shadow = (size: number, opacity: number, color: ColorRef = '#000000') => ({
  on: true,
  size,
  opacity,
  color,
});

const ornament = (type: OrnamentType, size: number, gap: number, width: number) => ({
  type,
  size,
  gap,
  width,
  color: 'accent' as ColorRef,
});

/** 基本的時段配色（簡約、視覺小說用） */
export const BASE_TIMES: NonNullable<DesignDef['times']> = {
  morning: ['#fbf1e3', '#efcdb0', '#d9825a', '#5b4032', '#ffc98a', 0.06],
  day: ['#f2f8fc', '#c3dff1', '#3a8fcb', '#274760', '#ffffff', 0],
  evening: ['#f3bf98', '#9c5277', '#e8733f', '#fff3e6', '#ff7a33', 0.12],
  night: ['#262d4f', '#0d1126', '#d6bf72', '#e8eaf6', '#10205a', 0.28],
};

/* ---------- 設計範本（F01、F02） ---------- */

export const DESIGNS: readonly DesignDef[] = [
  {
    id: 'simple',
    opening: opening(36, 'round', 28),
    frame: frame('linear'),
    palette: ['#f2f8fc', '#c3dff1', '#3a8fcb', '#274760'],
    times: BASE_TIMES,
    indicator: { style: 'badge', pos: 'tl', font: 'gothic' },
    decorations: [],
  },
  {
    id: 'mansion',
    opening: opening(58, 'scoop', 46),
    frame: frame('radial', {
      grain: 0.3,
      innerLine: line(true, 2, 12, { double: true }),
      outerLine: line(true, 3, 14),
      shadow: shadow(40, 0.5),
      ornament: ornament('flourish', 64, 16, 3),
    }),
    palette: ['#efe6d2', '#c4ab80', '#8a6a35', '#3a2a15'],
    times: {
      morning: ['#e9dcc3', '#b39468', '#7a5a2e', '#3e2c17', '#ffd59a', 0.06],
      day: ['#efe6d2', '#c4ab80', '#8a6a35', '#3a2a15', '#ffffff', 0],
      evening: ['#8a4332', '#3a1c1a', '#e3a35a', '#fbe7cf', '#ff7a33', 0.14],
      night: ['#2e2436', '#120d17', '#c9a85a', '#efe3c8', '#1a1030', 0.3],
    },
    indicator: { style: 'label', pos: 'tc', font: 'mincho' },
    decorations: [],
  },
  {
    id: 'forest',
    opening: opening(56, 'round', 34),
    frame: frame('radial', { grain: 0.45, innerLine: line(true, 2, 8), shadow: shadow(44, 0.55) }),
    palette: ['#7c8270', '#3f4538', '#d8c98f', '#f3eedc'],
    indicator: { style: 'label', pos: 'tc', font: 'mincho' },
    decorations: [
      { type: 'ivy', placement: 'all', coverage: 0.8, density: 0.65 },
      { type: 'flowers', placement: 'all', density: 0.35 },
    ],
  },
  {
    id: 'horror',
    opening: opening(46, 'notch', 18),
    frame: frame('linear', {
      grain: 0.5,
      innerLine: line(true, 2, 6, { color: '#5e1216' }),
      shadow: shadow(60, 0.75),
    }),
    palette: ['#2b1719', '#0b0607', '#9b1c1c', '#e9dcd2'],
    indicator: { style: 'label', pos: 'tc', font: 'mincho', bgAlpha: 0 },
    decorations: [
      { type: 'drips', placement: 'top', density: 0.55 },
      { type: 'cobweb', placement: 'corners', size: 1.2 },
    ],
  },
  {
    id: 'steampunk',
    opening: opening(54, 'round', 18),
    frame: frame('radial', {
      grain: 0.25,
      innerLine: line(true, 3, 10, { double: true }),
      outerLine: line(true, 3, 12),
      shadow: shadow(36, 0.55),
      ornament: ornament('dots', 36, 12, 2),
    }),
    palette: ['#a07a45', '#3e2c1a', '#e2b45a', '#f7e8c9'],
    indicator: { style: 'badge', pos: 'tr', font: 'mincho' },
    decorations: [
      { type: 'gears', placement: 'corners', size: 1.1 },
      { type: 'chain', placement: 'top', density: 0.6 },
    ],
  },
  {
    id: 'winter',
    opening: opening(48, 'round', 36),
    frame: frame('linear', { innerLine: line(true, 2, 10), shadow: shadow(30, 0.3, '#34506a') }),
    palette: ['#eef4f9', '#a9c1d4', '#4f7fa6', '#23384a'],
    indicator: { style: 'badge', pos: 'tl', font: 'gothic' },
    decorations: [{ type: 'snowcap', placement: 'top', density: 0.7 }],
  },
  {
    id: 'sakura',
    opening: opening(40, 'round', 26),
    frame: frame('linear', { innerLine: line(true, 2, 8), shadow: shadow(26, 0.25, '#6b3446') }),
    palette: ['#fbeef1', '#e7bfca', '#c25b7c', '#4a2b35'],
    indicator: { style: 'label', pos: 'tc', font: 'mincho' },
    decorations: [{ type: 'sakura', placement: 'topcorners', size: 1.1, density: 0.6 }],
  },
  {
    id: 'cinema',
    opening: opening({ t: 120, r: 0, b: 120, l: 0 }, 'square', 0),
    frame: frame('solid', { innerLine: line(false, 2, 0), shadow: shadow(48, 0.55) }),
    palette: ['#060606', '#060606', '#9fd3ff', '#f4f7fa'],
    times: {
      morning: ['#060606', '#060606', '#f3b37a', '#f4efe8', '#ffc98a', 0.06],
      day: ['#060606', '#060606', '#9fd3ff', '#f4f7fa', '#ffffff', 0],
      evening: ['#060606', '#060606', '#ff8e5a', '#fbe9dc', '#ff7a33', 0.14],
      night: ['#060606', '#060606', '#9aa8ff', '#e3e6ff', '#0a1440', 0.32],
    },
    indicator: { style: 'label', pos: 'br', font: 'mincho', bgAlpha: 0 },
    decorations: [],
  },
  {
    id: 'novel',
    opening: opening({ t: 28, r: 28, b: 250, l: 28 }, 'round', 20),
    frame: frame('linear', {
      innerLine: line(true, 2, 8),
      shadow: shadow(24, 0.3),
      ornament: ornament('diamond', 18, 8, 2),
    }),
    palette: ['#f2f8fc', '#c3dff1', '#3a8fcb', '#274760'],
    times: BASE_TIMES,
    indicator: { style: 'tabs', pos: 'br', font: 'gothic' },
    decorations: [],
  },
  {
    id: 'cyber',
    opening: opening(42, 'chamfer', 44),
    frame: frame('linear', {
      angle: 135,
      innerLine: line(true, 2, 8),
      outerLine: line(true, 2, 12),
      shadow: shadow(30, 0.6, 'accent'),
      ornament: ornament('bracket', 64, 4, 4),
    }),
    palette: ['#122236', '#081221', '#5ef2ff', '#d8fbff'],
    times: {
      morning: ['#10202e', '#06101a', '#5ef2ff', '#d8fbff', '#5ef2ff', 0.05],
      day: ['#122236', '#081221', '#7cf8a8', '#e4ffee', '#ffffff', 0],
      evening: ['#261532', '#12091c', '#ff7ad9', '#ffe6f7', '#ff5ab4', 0.1],
      night: ['#0b0d1e', '#03040c', '#8f7bff', '#e5e0ff', '#1a1260', 0.3],
    },
    indicator: { style: 'dial', pos: 'tr', font: 'gothic' },
    decorations: [{ type: 'circuit', placement: 'sides', density: 0.5 }],
  },
  {
    id: 'wa',
    opening: opening(48, 'notch', 22),
    frame: frame('solid', {
      grain: 0.35,
      innerLine: line(true, 2, 10, { double: true }),
      shadow: shadow(26, 0.35),
      ornament: ornament('dots', 40, 12, 2),
    }),
    palette: ['#f1ead8', '#d8ccb0', '#2f5d50', '#2b2620'],
    times: {
      morning: ['#efe4cf', '#d9c7a4', '#b5493b', '#3b2e25', '#ffd59a', 0.06],
      day: ['#f1ead8', '#d8ccb0', '#2f5d50', '#2b2620', '#ffffff', 0],
      evening: ['#b8563d', '#6e2c22', '#f2c46b', '#fbeee0', '#ff7a33', 0.14],
      night: ['#1f2733', '#11161e', '#c9a24f', '#e9e1cf', '#0d1a3a', 0.3],
    },
    indicator: { style: 'label', pos: 'tr', font: 'mincho' },
    decorations: [],
  },
];

export const DESIGN_IDS = DESIGNS.map((d) => d.id);
export const findDesign = (id: string): DesignDef | undefined => DESIGNS.find((d) => d.id === id);

/* ---------- 差分種類（F56） ---------- */

export interface VariantPreset {
  id: string;
  sub: string;
  icon: IconId;
  on: boolean;
  colors?: readonly [string, string, string, string];
  tint?: readonly [string, number];
  effect?: EffectId;
  amount?: number;
}

/** 種類 → 內建差分（名稱在 strings.ts 依 id 查） */
export const VARIANT_KINDS: Readonly<Record<VariantKind, readonly VariantPreset[]>> = {
  time: [
    { id: 'morning', sub: 'MORNING', icon: 'sunrise', on: true },
    { id: 'day', sub: 'DAYTIME', icon: 'sun', on: true },
    { id: 'evening', sub: 'EVENING', icon: 'sunset', on: false },
    { id: 'night', sub: 'NIGHT', icon: 'moon', on: true },
  ],
  weather: [
    { id: 'sunny', sub: 'SUNNY', icon: 'sun', on: true },
    {
      id: 'cloudy',
      sub: 'CLOUDY',
      icon: 'cloud',
      on: true,
      tint: ['#8a929c', 0.12],
      effect: 'fog',
      amount: 0.25,
    },
    {
      id: 'rain',
      sub: 'RAIN',
      icon: 'rain',
      on: true,
      tint: ['#5c6f86', 0.18],
      effect: 'rain',
      amount: 0.6,
    },
    {
      id: 'snow',
      sub: 'SNOW',
      icon: 'snow',
      on: true,
      tint: ['#dfe8f2', 0.1],
      effect: 'snow',
      amount: 0.6,
    },
    {
      id: 'fog',
      sub: 'FOG',
      icon: 'fog',
      on: false,
      tint: ['#c9ced4', 0.12],
      effect: 'fog',
      amount: 0.75,
    },
    {
      id: 'storm',
      sub: 'STORM',
      icon: 'bolt',
      on: false,
      tint: ['#1f2533', 0.3],
      effect: 'storm',
      amount: 0.7,
    },
  ],
  season: [
    {
      id: 'spring',
      sub: 'SPRING',
      icon: 'flower',
      on: true,
      colors: ['#fbeef1', '#e7bfca', '#c25b7c', '#4a2b35'],
      effect: 'petals',
      amount: 0.45,
    },
    {
      id: 'summer',
      sub: 'SUMMER',
      icon: 'sun',
      on: true,
      colors: ['#eaf7fb', '#9fd6e6', '#1f8fb8', '#123c4d'],
      effect: 'sparkle',
      amount: 0.25,
    },
    {
      id: 'autumn',
      sub: 'AUTUMN',
      icon: 'leaf',
      on: true,
      colors: ['#f4e0c4', '#c07a3c', '#b2452a', '#3d2414'],
      tint: ['#ff9a3c', 0.06],
      effect: 'leaves',
      amount: 0.45,
    },
    {
      id: 'winter',
      sub: 'WINTER',
      icon: 'snow',
      on: true,
      colors: ['#eef4f9', '#a9c1d4', '#4f7fa6', '#23384a'],
      tint: ['#dfe8f2', 0.08],
      effect: 'snow',
      amount: 0.4,
    },
  ],
  scene: [
    { id: 'daily', sub: 'DAILY', icon: 'heart', on: true },
    { id: 'explore', sub: 'EXPLORE', icon: 'search', on: true, effect: 'dust', amount: 0.3 },
    {
      id: 'battle',
      sub: 'BATTLE',
      icon: 'swords',
      on: true,
      tint: ['#a01818', 0.06],
      effect: 'vignette',
      amount: 0.55,
    },
    { id: 'crisis', sub: 'ALERT', icon: 'alert', on: false, effect: 'alert', amount: 0.7 },
    { id: 'memory', sub: 'MEMORY', icon: 'clock', on: true, effect: 'sepia', amount: 0.6 },
  ],
  sanity: [
    { id: 'sane', sub: 'SANE', icon: 'eye', on: true },
    {
      id: 'shaken',
      sub: 'SHAKEN',
      icon: 'eye',
      on: true,
      tint: ['#2a0f24', 0.1],
      effect: 'vignette',
      amount: 0.7,
    },
    {
      id: 'madness',
      sub: 'MADNESS',
      icon: 'skull',
      on: true,
      tint: ['#5a0010', 0.14],
      effect: 'glitch',
      amount: 0.7,
    },
  ],
  chapter: [
    { id: 'prologue', sub: 'PROLOGUE', icon: 'book', on: true },
    { id: 'ch1', sub: 'CHAPTER 1', icon: 'book', on: true },
    { id: 'ch2', sub: 'CHAPTER 2', icon: 'book', on: true },
    { id: 'ch3', sub: 'CHAPTER 3', icon: 'book', on: false },
    { id: 'epilogue', sub: 'EPILOGUE', icon: 'book', on: true },
  ],
  custom: [
    { id: 'p1', sub: 'PATTERN 1', icon: 'none', on: true },
    { id: 'p2', sub: 'PATTERN 2', icon: 'none', on: true },
  ],
};

export const VARIANT_KIND_IDS = Object.keys(VARIANT_KINDS) as VariantKind[];

/** 時間帶的四個內建時段 */
export const TIME_IDS = ['morning', 'day', 'evening', 'night'] as const;
export type TimeId = (typeof TIME_IDS)[number];

/* ---------- 窗內效果、圖示、配置（選單的順序） ---------- */

export const EFFECT_IDS: readonly EffectId[] = [
  'none',
  'rain',
  'storm',
  'snow',
  'fog',
  'petals',
  'leaves',
  'sparkle',
  'dust',
  'vignette',
  'alert',
  'glitch',
  'scanlines',
  'sepia',
];

export const ICON_IDS: readonly IconId[] = [
  'none',
  'sunrise',
  'sun',
  'sunset',
  'moon',
  'star',
  'cloud',
  'rain',
  'snow',
  'fog',
  'bolt',
  'flower',
  'leaf',
  'heart',
  'search',
  'swords',
  'alert',
  'eye',
  'skull',
  'clock',
  'book',
  'custom',
];

export const PLACEMENTS: readonly Placement[] = [
  'all',
  'top',
  'bottom',
  'topbottom',
  'sides',
  'corners',
  'topcorners',
  'bottomcorners',
];

/* ---------- 沿框裝飾（F25、F27） ---------- */

/** along：沿邊類（有延伸量）；corner：角落類（沒有延伸量） */
export interface DecoTypeDef {
  kind: 'along' | 'corner';
  defaults: {
    placement: Placement;
    size: number;
    density: number;
    coverage: number;
    offset: number;
    color: ColorRef;
    color2: ColorRef;
  };
}

const decoDefaults = (over: Partial<DecoTypeDef['defaults']>): DecoTypeDef['defaults'] => ({
  placement: 'all',
  size: 1,
  density: 0.5,
  coverage: 1,
  offset: 0,
  color: '#3f6b3a',
  color2: '#79a85a',
  ...over,
});

export const DECO_TYPES: Readonly<Record<DecoType, DecoTypeDef>> = {
  ivy: {
    kind: 'along',
    defaults: decoDefaults({ coverage: 0.75, density: 0.6, color: '#3b5f33', color2: '#6f9f4e' }),
  },
  flowers: {
    kind: 'along',
    defaults: decoDefaults({ density: 0.4, color: '#f6c9d6', color2: '#ffd66b' }),
  },
  thorns: {
    kind: 'along',
    defaults: decoDefaults({ coverage: 0.8, color: '#2f2622', color2: '#8a2c3a' }),
  },
  sakura: {
    kind: 'along',
    defaults: decoDefaults({
      placement: 'topcorners',
      density: 0.6,
      coverage: 0.7,
      color: '#4a3328',
      color2: '#f7c6d4',
    }),
  },
  grass: {
    kind: 'along',
    defaults: decoDefaults({
      placement: 'bottom',
      density: 0.6,
      color: '#3f6a33',
      color2: '#86b35d',
    }),
  },
  stars: {
    kind: 'along',
    defaults: decoDefaults({ density: 0.5, color: 'accent', color2: '#ffffff' }),
  },
  cobweb: {
    kind: 'corner',
    defaults: decoDefaults({
      placement: 'corners',
      density: 0.5,
      color: '#e6e6e6',
      color2: '#161616',
    }),
  },
  chain: {
    kind: 'along',
    defaults: decoDefaults({ placement: 'top', density: 0.6, color: '#b9bec3', color2: '#3d4146' }),
  },
  gears: {
    kind: 'corner',
    defaults: decoDefaults({
      placement: 'corners',
      density: 0.6,
      color: 'accent',
      color2: 'frame2',
    }),
  },
  circuit: {
    kind: 'along',
    defaults: decoDefaults({ placement: 'sides', color: 'accent', color2: 'text' }),
  },
  snowcap: {
    kind: 'along',
    defaults: decoDefaults({
      placement: 'topbottom',
      density: 0.6,
      color: '#f7fbfe',
      color2: '#b9d3e6',
    }),
  },
  drips: {
    kind: 'along',
    defaults: decoDefaults({ placement: 'top', density: 0.5, color: '#6e0b10', color2: '#e0525a' }),
  },
};

export const DECO_TYPE_IDS = Object.keys(DECO_TYPES) as DecoType[];

/* ---------- 快速邊距（F08）、輸出尺寸（F03） ---------- */

export const LAYOUTS: readonly { id: string; margin: Margin }[] = [
  { id: 'thin', margin: margins(20) },
  { id: 'normal', margin: margins(40) },
  { id: 'thick', margin: margins(80) },
  { id: 'cinema', margin: { t: 120, r: 0, b: 120, l: 0 } },
  { id: 'novel', margin: { t: 28, r: 28, b: 250, l: 28 } },
  { id: 'side', margin: { t: 28, r: 260, b: 28, l: 260 } },
];

export const SIZE_PRESETS: readonly { w: number; h: number }[] = [
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
  { w: 1152, h: 648 },
  { w: 1440, h: 1080 },
  { w: 960, h: 720 },
  { w: 1080, h: 1080 },
];

export const SIZE_LIMITS = { min: 64, max: 4096 } as const;

/* ---------- 電腦內建字型組（規格 3.10；字型名稱是公開事實，不從網路載入） ---------- */

export interface PcFontPreset {
  /** 存在設定裡的名稱（第一順位的字型） */
  family: string;
  /** 依序嘗試的字型 */
  stack: readonly string[];
  generic: 'serif' | 'sans-serif';
}

export const PC_FONT_PRESETS: readonly PcFontPreset[] = [
  {
    family: 'Yu Gothic UI',
    stack: ['Yu Gothic UI', 'Yu Gothic', 'Hiragino Kaku Gothic ProN', 'Meiryo'],
    generic: 'sans-serif',
  },
  {
    family: 'Yu Mincho',
    stack: ['Yu Mincho', 'YuMincho', 'Hiragino Mincho ProN', 'BIZ UDPMincho', 'MS PMincho'],
    generic: 'serif',
  },
  {
    family: 'UD Digi Kyokasho NK-R',
    stack: ['UD Digi Kyokasho NK-R', 'UD デジタル 教科書体 NK-R', 'Yu Mincho'],
    generic: 'serif',
  },
  { family: 'Georgia', stack: ['Georgia', 'Times New Roman'], generic: 'serif' },
  { family: 'Segoe UI', stack: ['Segoe UI', 'Helvetica Neue', 'Arial'], generic: 'sans-serif' },
  {
    family: 'Microsoft JhengHei',
    stack: ['Microsoft JhengHei', '微軟正黑體', 'PingFang TC', 'Heiti TC'],
    generic: 'sans-serif',
  },
  { family: 'PMingLiU', stack: ['PMingLiU', '新細明體', 'Songti TC'], generic: 'serif' },
  {
    family: 'DFKai-SB',
    stack: ['DFKai-SB', '標楷體', 'BiauKai', 'Kaiti TC'],
    generic: 'serif',
  },
];

export const findPcFont = (family: string): PcFontPreset | undefined => {
  const k = family.trim().toLowerCase();
  return k ? PC_FONT_PRESETS.find((p) => p.family.toLowerCase() === k) : undefined;
};

/** 黑體類（上傳字型、依名稱指定的字型的後備） */
export const GOTHIC_STACK = PC_FONT_PRESETS[0];

/* ---------- 角飾、角的形狀、標籤位置（選單順序） ---------- */

export const ORNAMENT_TYPES: readonly OrnamentType[] = [
  'none',
  'bracket',
  'diamond',
  'star',
  'flourish',
  'dots',
];
export const CORNER_TYPES: readonly CornerType[] = ['square', 'round', 'chamfer', 'scoop', 'notch'];
export const LABEL_STYLES: readonly LabelStyle[] = ['badge', 'tabs', 'dial', 'label', 'none'];
export const LABEL_POSITIONS: readonly Exclude<LabelPos, 'free'>[] = [
  'tl',
  'tc',
  'tr',
  'bl',
  'bc',
  'br',
];
