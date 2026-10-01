/**
 * 簡易頭像產生器的純邏輯（不依賴 React、不碰 DOM，Node 可測）：
 * 設定的型別與預設值、配色預設、幾何（內側區域、圖片範圍、夾限、倍率）、名字牌與 HO 牌的文字排版規則。
 *
 * 座標一律以「內側區域」（外框以內的正方形）的百分比計：圖片記中心點，名字牌與 HO 牌記左上角與寬高。
 * 畫布固定 1024 × 1024（預覽就是同一張畫布縮小顯示，下載與預覽相同）。
 */
import { parseColor, relativeLuminance } from '@/core/color';
import { type Box, clampBoxPosition } from '@/core/layout';
import { splitGraphemes } from '@/core/typeset';

/* ---------- 畫布 ---------- */

/** 輸出（也是預覽畫布）的邊長 */
export const CANVAS = 1024;
/** 外框外緣的圓角半徑（1024 畫布上的 px） */
export const OUTER_RADIUS = 74;
/** 內側區域的圓角半徑 */
export const INNER_RADIUS = 50;
/** 名字牌與 HO 牌的圓角半徑 */
export const PLATE_RADIUS = 24;
/** 安全範圍：畫布四周各內縮 7% */
export const SAFE_INSET = 0.07;

/**
 * 外框粗細的滑桿值以「桌面寬度的預覽（約 590 px）」計，換算到 1024 畫布。
 * 換算比例固定，不隨視窗寬度改變（規格第 7 節：輸出解析度固定）。
 */
export const FRAME_BASIS = 590;
export const FRAME_RANGE = { min: 6, max: 42, default: 18 } as const;

/** 滑桿值 → 1024 畫布上的外框粗細（px） */
export function frameWidthPx(slider: number): number {
  return (slider * CANVAS) / FRAME_BASIS;
}

/** 內側區域（1024 畫布上的 px） */
export function innerRect(slider: number): Box {
  const t = frameWidthPx(slider);
  return { x: t, y: t, width: CANVAS - 2 * t, height: CANVAS - 2 * t };
}

/** 安全範圍的虛線（1024 畫布上的 px） */
export const SAFE_AREA: Box = {
  x: CANVAS * SAFE_INSET,
  y: CANVAS * SAFE_INSET,
  width: CANVAS * (1 - 2 * SAFE_INSET),
  height: CANVAS * (1 - 2 * SAFE_INSET),
};

/* ---------- 設定 ---------- */

export type FrameKind = 'solid' | 'gradient';
export type BackgroundKind = 'solid' | 'gradient' | 'transparent' | 'dots' | 'stripes' | 'checker';
export type FontId = 'serif' | 'sans' | 'rounded' | 'mono';
export type Orientation = 'vertical' | 'horizontal';
export type HoStyle = 'dark' | 'light' | 'red';
export type ItemId = 'image' | 'name' | 'ho';

export const FRAME_KINDS: readonly FrameKind[] = ['solid', 'gradient'];
export const BACKGROUND_KINDS: readonly BackgroundKind[] = [
  'solid',
  'gradient',
  'transparent',
  'dots',
  'stripes',
  'checker',
];
export const FONT_IDS: readonly FontId[] = ['serif', 'sans', 'rounded', 'mono'];
export const HO_STYLES: readonly HoStyle[] = ['dark', 'light', 'red'];

/** 版面（「重設版面」只重設這些） */
export interface IconLayout {
  /** 圖片中心（內側區域的 %） */
  imageCenter: { x: number; y: number };
  /** 圖片倍率（1 ＝ 100%） */
  imageScale: number;
  /** 直排時的名字牌 */
  nameV: Box;
  /** 橫排時的名字牌（下方的橫長條） */
  nameH: Box;
  ho: Box;
}

export interface IconSettings extends IconLayout {
  /** 配色預設的 id */
  preset: string;
  frameKind: FrameKind;
  background: BackgroundKind;
  /** 外框粗細（滑桿值，見 FRAME_BASIS） */
  frameWidth: number;
  name: string;
  font: FontId;
  orientation: Orientation;
  hoText: string;
  hoStyle: HoStyle;
}

export const LAYOUT_DEFAULTS: IconLayout = {
  imageCenter: { x: 50, y: 56 },
  imageScale: 1,
  nameV: { x: 78, y: 8, width: 11, height: 48 },
  nameH: { x: 31, y: 83, width: 62, height: 11 },
  ho: { x: 7, y: 84, width: 20, height: 9 },
};

/** 範例角色名（自己取的） */
export const SAMPLE_NAME = '葉初晴';
/** 名字清空時名字牌上的代替字 */
export const NAME_PLACEHOLDER = '名字';
export const HO_DEFAULT = 'HO1';
/** HO 清空時顯示的字 */
export const HO_PLACEHOLDER = 'HO';

export function defaultLayout(): IconLayout {
  return structuredClone(LAYOUT_DEFAULTS);
}

export function defaultSettings(): IconSettings {
  return {
    ...defaultLayout(),
    preset: PRESETS[0].id,
    frameKind: 'solid',
    background: 'solid',
    frameWidth: FRAME_RANGE.default,
    name: SAMPLE_NAME,
    font: 'serif',
    orientation: 'vertical',
    hoText: HO_DEFAULT,
    hoStyle: 'dark',
  };
}

/** 目前方向的名字牌 */
export function nameBoxOf(s: Pick<IconSettings, 'orientation' | 'nameV' | 'nameH'>): Box {
  return s.orientation === 'vertical' ? s.nameV : s.nameH;
}

/* ---------- 配色預設 ---------- */

export interface ColorPreset {
  id: string;
  name: string;
  /** 單色外框 */
  frame: string;
  /** 漸層外框：左上 → 中央 → 右下 */
  gradient: readonly [string, string, string];
  /** 內側背景色 */
  background: string;
}

/** 9 組配色（自己設計）：淺色背景 5 組、深色背景 4 組 */
export const PRESETS: readonly ColorPreset[] = [
  {
    id: 'cinnabar',
    name: '朱砂',
    frame: '#d6453b',
    gradient: ['#f47a5c', '#d6453b', '#8c1f2b'],
    background: '#fff2ed',
  },
  {
    id: 'ink',
    name: '墨石',
    frame: '#454b59',
    gradient: ['#8a93a3', '#454b59', '#14161c'],
    background: '#20232b',
  },
  {
    id: 'sakura',
    name: '櫻花',
    frame: '#ec88ad',
    gradient: ['#ffc4d8', '#ec88ad', '#c0548a'],
    background: '#fff4f8',
  },
  {
    id: 'gilt',
    name: '鎏金',
    frame: '#c9982c',
    gradient: ['#f6dc8c', '#d1a43a', '#86601a'],
    background: '#fff9ec',
  },
  {
    id: 'neon',
    name: '霓虹',
    frame: '#1fc8e6',
    gradient: ['#6af2ff', '#14b4d8', '#3b5bff'],
    background: '#0a1524',
  },
  {
    id: 'forest',
    name: '森林',
    frame: '#3d9a5a',
    gradient: ['#9fd98d', '#3d9a5a', '#1c5a37'],
    background: '#f1f9ef',
  },
  {
    id: 'amethyst',
    name: '紫晶',
    frame: '#8d5cf0',
    gradient: ['#c9aaff', '#8d5cf0', '#4a1d92'],
    background: '#1b1530',
  },
  {
    id: 'bloodmoon',
    name: '血月',
    frame: '#8c1d2d',
    gradient: ['#c94657', '#8c1d2d', '#3a0a14'],
    background: '#1f0d11',
  },
  {
    id: 'clearsky',
    name: '晴空',
    frame: '#6cb0e4',
    gradient: ['#c0e4ff', '#6cb0e4', '#3a7cc2'],
    background: '#f1f7ff',
  },
];

/** 依 id 找配色；找不到時是第一組 */
export function presetById(id: string): ColorPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** 背景色是不是深色（決定花紋用白色還是外框色） */
export function isDarkColor(color: string): boolean {
  const c = parseColor(color);
  return c ? relativeLuminance(c) < 0.18 : false;
}

/** 兩色混合：t ＝ 0 是 a、1 是 b → #rrggbb */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseColor(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const y = parseColor(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  const m = (p: number, q: number) =>
    Math.round(p + (q - p) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${m(x.r, y.r)}${m(x.g, y.g)}${m(x.b, y.b)}`;
}

/**
 * 漸層背景的色標（內側區域左上 → 右下）：背景色 → 很淡的外框色調 → 白色。
 */
export function backgroundGradientStops(p: ColorPreset): [number, string][] {
  return [
    [0, p.background],
    [0.55, mixHex('#ffffff', p.frame, 0.2)],
    [1, '#ffffff'],
  ];
}

/** 花紋的種類（背景類型裡有花紋的三種） */
export type PatternBackground = 'dots' | 'stripes' | 'checker';

/** 花紋的濃度：面積越大的花紋越淡 */
const PATTERN_OPACITY: Record<PatternBackground, { light: number; dark: number }> = {
  dots: { light: 0.2, dark: 0.11 },
  stripes: { light: 0.14, dark: 0.08 },
  checker: { light: 0.09, dark: 0.055 },
};

/** 花紋（圓點、斜線、格紋）的顏色與濃度：淺色背景用外框色、深色背景用白色，都很淡 */
export function patternInk(
  p: ColorPreset,
  kind: PatternBackground,
): { color: string; opacity: number } {
  const o = PATTERN_OPACITY[kind];
  return isDarkColor(p.background)
    ? { color: '#ffffff', opacity: o.dark }
    : { color: p.frame, opacity: o.light };
}

/* ---------- 圖片 ---------- */

/** 圖片寬度的基準：內側區域寬的 58%，再乘倍率 */
export const IMAGE_BASE_WIDTH = 58;
export const IMAGE_CENTER_RANGE = { min: -20, max: 120 } as const;
export const IMAGE_ZOOM = { step: 0.08, min: 0.35, max: 3 } as const;

/** 沒有圖片時的人形佔位圖（寬 × 高的比例）：預設位置時肩膀以下超出內側區域的下緣 */
export const PLACEHOLDER_SIZE = { width: 400, height: 620 } as const;

/**
 * 圖片的範圍（內側區域的 %）：寬 ＝ 58% × 倍率，高依原圖比例（內側區域是正方形），中心在 center。
 */
export function imageBox(
  center: { x: number; y: number },
  scale: number,
  size: { width: number; height: number },
): Box {
  const w = IMAGE_BASE_WIDTH * scale;
  const h = size.width > 0 ? (w * size.height) / size.width : w;
  return { x: center.x - w / 2, y: center.y - h / 2, width: w, height: h };
}

export const boxCenter = (b: Box): { x: number; y: number } => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

/** 拖曳圖片：中心夾在 −20%～120% */
export function clampImageBox(b: Box): Box {
  const r = IMAGE_CENTER_RANGE;
  return clampBoxPosition(b, { minX: r.min, maxX: r.max, minY: r.min, maxY: r.max }, 'center');
}

/** 放大／縮小一次（±8 個百分點，夾在 35%～300%） */
export function zoomStep(scale: number, dir: 1 | -1): number {
  const next = Math.round((scale + dir * IMAGE_ZOOM.step) * 100) / 100;
  return Math.min(IMAGE_ZOOM.max, Math.max(IMAGE_ZOOM.min, next));
}

export const canZoom = (scale: number, dir: 1 | -1): boolean =>
  dir > 0 ? scale < IMAGE_ZOOM.max - 1e-9 : scale > IMAGE_ZOOM.min + 1e-9;

/** 倍率的顯示（整數百分比） */
export const formatScale = (scale: number): string => `${Math.round(scale * 100)}%`;

/* ---------- 名字牌與 HO 牌 ---------- */

export const PLATE_POS_RANGE = { min: -10, max: 110 } as const;
export const PLATE_LIMITS = { minWidth: 8, maxWidth: 80, minHeight: 6, maxHeight: 80 } as const;

/** 拖曳名字牌與 HO 牌：左上角夾在 −10%～（110% − 自身寬或高） */
export function clampPlateBox(b: Box): Box {
  const r = PLATE_POS_RANGE;
  return clampBoxPosition(b, {
    minX: r.min,
    maxX: r.max - b.width,
    minY: r.min,
    maxY: r.max - b.height,
  });
}

/** 名字牌上實際顯示的文字（空白時是代替字） */
export const displayName = (name: string): string =>
  name.trim() === '' ? NAME_PLACEHOLDER : name.trim();

/** HO 牌上實際顯示的文字（空白時是「HO」） */
export const displayHo = (text: string): string =>
  text.trim() === '' ? HO_PLACEHOLDER : text.trim();

/** 量字寬：(文字, 字級 px) → 寬（px）。canvas 用 ctx.measureText，測試可以換成假的 */
export type MeasureFn = (text: string, size: number) => number;

export interface VerticalLayout {
  size: number;
  /** 每個字中心的 y（畫布 px）；x 都是名字牌的水平中央 */
  centers: number[];
  x: number;
  chars: string[];
}

/** 直排：字寬上限（× 名字牌寬）、字距（× 字級）、上下留白（× 名字牌短邊） */
export const VERTICAL = { widthRatio: 0.52, pitch: 1.2, padRatio: 0.15 } as const;

/**
 * 直排：一個字一欄由上往下、置中於名字牌。字級＝ min(牌寬 × 0.52, 可用高度 ÷ (字數 × 1.2))，
 * 字太多時縮小字級（不重疊、不換欄）。box 是畫布 px。
 */
export function layoutVertical(text: string, box: Box): VerticalLayout {
  const chars = splitGraphemes(text);
  const n = Math.max(1, chars.length);
  const pad = Math.min(box.width, box.height) * VERTICAL.padRatio;
  const usable = Math.max(1, box.height - 2 * pad);
  const size = Math.max(
    1,
    Math.min(box.width * VERTICAL.widthRatio, usable / (n * VERTICAL.pitch)),
  );
  const pitch = size * VERTICAL.pitch;
  const cy = box.y + box.height / 2;
  const centers = chars.map((_, i) => cy + (i - (chars.length - 1) / 2) * pitch);
  return { size, centers, x: box.x + box.width / 2, chars };
}

export interface LineLayout {
  size: number;
  /** 水平壓扁的比例（1 ＝ 不壓扁） */
  scaleX: number;
  /** 文字中心 */
  x: number;
  y: number;
  /** 文字（壓扁後）的寬度 */
  width: number;
}

/** 橫排名字：字級 ＝ 牌高 × 0.5；左右各留 牌高 × 0.25（至少 10 px） */
export const HORIZONTAL = { sizeRatio: 0.5, padRatio: 0.25, minPad: 10 } as const;

/**
 * 橫排名字：一行置中；比名字牌窄的可用寬度寬時**縮小字級**（不壓扁、不換行）。
 */
export function layoutHorizontal(text: string, box: Box, measure: MeasureFn): LineLayout {
  const base = Math.max(1, box.height * HORIZONTAL.sizeRatio);
  const pad = Math.max(HORIZONTAL.minPad, box.height * HORIZONTAL.padRatio);
  const avail = Math.max(1, box.width - 2 * pad);
  const w = measure(text, base);
  const size = w > avail ? Math.max(1, (base * avail) / w) : base;
  return {
    size,
    scaleX: 1,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    width: w > avail ? avail : w,
  };
}

/** HO 牌：字級 ＝ 牌高 × 0.42（預設大小時約 36 px），左右合計留 19 px */
export const HO_TEXT = { sizeRatio: 0.42, sidePad: 19 } as const;

/**
 * HO 牌：一行置中；太長時**水平壓扁**到牌寬減 19 px（不換行、不縮小字級）。
 */
export function layoutHo(text: string, box: Box, measure: MeasureFn): LineLayout {
  const size = Math.max(1, box.height * HO_TEXT.sizeRatio);
  const avail = Math.max(1, box.width - HO_TEXT.sidePad);
  const w = measure(text, size);
  const scaleX = w > avail ? avail / w : 1;
  return {
    size,
    scaleX,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    width: w * scaleX,
  };
}

/** 名字與 HO 牌的字色 */
export const NAME_PLATE = { fill: 'rgba(255, 255, 255, 0.78)', text: '#1f2735' } as const;

export interface HoLook {
  /** 底色（紅色樣式是橫向漸層：左 → 右） */
  fill: string | readonly [string, string];
  /** 整個底的不透明度 */
  alpha: number;
  text: string;
  /** 淡白邊（白色半透明樣式） */
  border?: string;
}

export const HO_LOOKS: Record<HoStyle, HoLook> = {
  dark: { fill: '#000000', alpha: 0.75, text: '#ffffff' },
  light: { fill: '#ffffff', alpha: 0.62, text: '#16213a', border: 'rgba(255, 255, 255, 0.9)' },
  red: { fill: ['#991b1b', '#dc2626'], alpha: 0.9, text: '#ffffff' },
};
