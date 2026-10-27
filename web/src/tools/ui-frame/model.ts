/**
 * UI 框素材產生器的資料模型（規格 docs/refactor/specs/ui-frame.md 第 1、3 節）：
 * 兩種用途（文字冒險／TRPG・直播）、外觀設定（主色、外框形狀、四角裝飾、質感、字型、尺寸與按鈕的動作）、測試文字，
 * 以及數值範圍、預設值與整理（讀檔、自動儲存被改壞時改回預設）。
 *
 * 純資料與純函式，不依賴 React 與瀏覽器（單元測試直接用）。
 */
import { normalizeHex } from '@/core/color';
import { S } from './strings';

export const TOOL_ID = 'ui-frame';
/** 自動儲存與專案檔的資料版本 */
export const DATA_VERSION = 1;

/* ---------- 選項 ---------- */

export type Mode = 'novel' | 'trpg';
export const MODES: readonly Mode[] = ['novel', 'trpg'];

/** 輸出解析度（畫面寬）：所有尺寸以 1920 × 1080 為準，1280 × 720 時等比縮小（2/3） */
export type Resolution = 1920 | 1280;
export const RESOLUTIONS: readonly Resolution[] = [1920, 1280];

export type Polarity = 'dark' | 'light';
export const POLARITIES: readonly Polarity[] = ['dark', 'light'];

/** 外框形狀：內凹、圓角、斜角、直角 */
export type CornerStyle = 'concave' | 'round' | 'bevel' | 'square';
export const CORNER_STYLES: readonly CornerStyle[] = ['concave', 'round', 'bevel', 'square'];

/** 四角裝飾：古典花飾、星光、電路、青海波、哥德、像素、無 */
export type Ornament = 'classic' | 'star' | 'circuit' | 'wave' | 'gothic' | 'pixel' | 'none';
export const ORNAMENTS: readonly Ornament[] = [
  'classic',
  'star',
  'circuit',
  'wave',
  'gothic',
  'pixel',
  'none',
];

/** 質感：雜訊、點點、斜線、和紙纖維、細格、無 */
export type Texture = 'noise' | 'dots' | 'lines' | 'washi' | 'grid' | 'none';
export const TEXTURES: readonly Texture[] = ['noise', 'dots', 'lines', 'washi', 'grid', 'none'];

/** 字型：襯線＋明體、圓體、近未來、明體、黑體、像素 */
export type FontId = 'serif' | 'round' | 'future' | 'mincho' | 'sans' | 'pixel';
export const FONT_IDS: readonly FontId[] = ['serif', 'round', 'future', 'mincho', 'sans', 'pixel'];

/** 翻頁游標：菱形、羽毛筆、水晶、雙箭頭、像素三角 */
export type CursorShape = 'diamond' | 'quill' | 'crystal' | 'chevron' | 'pixel';
export const CURSOR_SHAPES: readonly CursorShape[] = [
  'diamond',
  'quill',
  'crystal',
  'chevron',
  'pixel',
];

/** 系統按鈕上的文字：英文（SAVE…）或中文（存檔…） */
export type ButtonLang = 'en' | 'zh';
export const BUTTON_LANGS: readonly ButtonLang[] = ['en', 'zh'];

/** 預覽的背景（只供預覽，不會匯出） */
export type Scene = 'study' | 'classroom' | 'neon' | 'shrine' | 'field' | 'checker';
export const SCENES: readonly Scene[] = [
  'study',
  'classroom',
  'neon',
  'shrine',
  'field',
  'checker',
];

/** 按鈕的四種狀態 */
export type ButtonState = 'normal' | 'hover' | 'active' | 'disabled';
export const BUTTON_STATES: readonly ButtonState[] = ['normal', 'hover', 'active', 'disabled'];

/** 系統按鈕（TyranoScript 的 role 對應見 tyrano.ts） */
export type SystemButton = 'save' | 'load' | 'auto' | 'skip' | 'log' | 'config' | 'title' | 'close';
export const SYSTEM_BUTTONS: readonly SystemButton[] = [
  'save',
  'load',
  'auto',
  'skip',
  'log',
  'config',
  'title',
  'close',
];

export const SYSTEM_LABELS: Record<ButtonLang, Record<SystemButton, string>> = {
  en: {
    save: 'SAVE',
    load: 'LOAD',
    auto: 'AUTO',
    skip: 'SKIP',
    log: 'LOG',
    config: 'CONFIG',
    title: 'TITLE',
    close: 'CLOSE',
  },
  zh: {
    save: '存檔',
    load: '讀檔',
    auto: '自動',
    skip: '快進',
    log: '紀錄',
    config: '設定',
    title: '標題',
    close: '隱藏',
  },
};

/* ---------- 數值範圍（原作的滑桿範圍） ---------- */

export interface Range {
  min: number;
  max: number;
  step: number;
}

export type RangeKey =
  | 'bgOpacity'
  | 'cornerSize'
  | 'borderWidth'
  | 'innerOffset'
  | 'ornamentScale'
  | 'textureAlpha'
  | 'msgW'
  | 'msgH'
  | 'choiceW'
  | 'hoverGlow'
  | 'activeShift';

export const RANGES: Record<RangeKey, Range> = {
  bgOpacity: { min: 40, max: 100, step: 1 },
  cornerSize: { min: 0, max: 42, step: 1 },
  borderWidth: { min: 1, max: 8, step: 0.5 },
  innerOffset: { min: 0, max: 16, step: 1 },
  ornamentScale: { min: 50, max: 160, step: 1 },
  textureAlpha: { min: 0, max: 50, step: 1 },
  msgW: { min: 1100, max: 1840, step: 10 },
  msgH: { min: 200, max: 380, step: 4 },
  choiceW: { min: 420, max: 960, step: 10 },
  hoverGlow: { min: 4, max: 24, step: 1 },
  activeShift: { min: 1, max: 5, step: 1 },
};

export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];

/* ---------- 設定 ---------- */

export interface Design {
  /** 主色（#rrggbb） */
  keyColor: string;
  polarity: Polarity;
  /** 框底的不透明度（%） */
  bgOpacity: number;
  corner: CornerStyle;
  ornament: Ornament;
  /** 角的大小（px，以 1920 寬為準） */
  cornerSize: number;
  /** 框線粗細（px） */
  borderWidth: number;
  /** 內框線與外框的距離（px；0＝不畫內框線） */
  innerOffset: number;
  /** 裝飾大小（%） */
  ornamentScale: number;
  texture: Texture;
  /** 質感的濃度（%） */
  textureAlpha: number;
  font: FontId;
  /** 訊息框的寬、高（px） */
  msgW: number;
  msgH: number;
  /** 選項按鈕的寬（px） */
  choiceW: number;
  /** 滑過時的光暈（px） */
  hoverGlow: number;
  /** 按下時往下沉（px） */
  activeShift: number;
  cursor: CursorShape;
  buttonLang: ButtonLang;
}

export interface Texts {
  /** 文字冒險：角色名、台詞、選項 1～3 */
  charName: string;
  line: string;
  choice1: string;
  choice2: string;
  choice3: string;
  /** TRPG・直播：角色框的名字、狀態 1～3、骰子／資訊面板、留言板 */
  portraitName: string;
  status1: string;
  status2: string;
  status3: string;
  dice: string;
  board: string;
  /** TRPG・直播：文字畫進 PNG */
  bake: boolean;
}

export type TextKey = Exclude<keyof Texts, 'bake'>;

/** 文字欄的字數上限（原作） */
export const TEXT_MAX: Record<TextKey, number> = {
  charName: 60,
  line: 500,
  choice1: 100,
  choice2: 100,
  choice3: 100,
  portraitName: 60,
  status1: 60,
  status2: 60,
  status3: 60,
  dice: 80,
  board: 500,
};

export const TEXT_KEYS = Object.keys(TEXT_MAX) as TextKey[];
/** 多行的欄位（其他欄位的換行變空白） */
export const MULTILINE_TEXTS: readonly TextKey[] = ['line', 'board'];

/** 目前的設定是從哪裡來的（「回到原始值」與狀態列用） */
export interface Base {
  kind: 'preset' | 'mine';
  /** 預設集的 id，或我的預設的 id */
  id: string;
  /** 顯示的名稱 */
  name: string;
  /** 套用當時的外觀（各欄位「回到原始值」的依據） */
  design: Design;
}

export interface DocState {
  mode: Mode;
  resolution: Resolution;
  design: Design;
  texts: Texts;
  base: Base;
}

/* ---------- 預設集（本站自己設計） ---------- */

export interface Preset {
  id: string;
  design: Design;
  /** 套用時一起換的預覽背景 */
  scene: Scene;
}

const DESIGN_BASE = {
  bgOpacity: 90,
  innerOffset: 6,
  ornamentScale: 100,
  msgW: 1560,
  msgH: 272,
  choiceW: 680,
  hoverGlow: 14,
  activeShift: 2,
  buttonLang: 'en' as ButtonLang,
};

export const PRESETS: readonly Preset[] = [
  {
    id: 'manor',
    scene: 'study',
    design: {
      ...DESIGN_BASE,
      keyColor: '#b98f52',
      polarity: 'dark',
      bgOpacity: 90,
      corner: 'concave',
      ornament: 'classic',
      cornerSize: 16,
      borderWidth: 2.5,
      innerOffset: 6,
      ornamentScale: 100,
      texture: 'noise',
      textureAlpha: 16,
      font: 'serif',
      cursor: 'quill',
      hoverGlow: 12,
    },
  },
  {
    id: 'afterschool',
    scene: 'classroom',
    design: {
      ...DESIGN_BASE,
      keyColor: '#ef6f9a',
      polarity: 'light',
      bgOpacity: 94,
      corner: 'round',
      ornament: 'star',
      cornerSize: 22,
      borderWidth: 3,
      innerOffset: 5,
      texture: 'dots',
      textureAlpha: 14,
      font: 'round',
      cursor: 'chevron',
      msgW: 1500,
      msgH: 260,
      choiceW: 640,
      hoverGlow: 16,
      activeShift: 3,
    },
  },
  {
    id: 'terminal',
    scene: 'neon',
    design: {
      ...DESIGN_BASE,
      keyColor: '#2fe3d2',
      polarity: 'dark',
      bgOpacity: 86,
      corner: 'bevel',
      ornament: 'circuit',
      cornerSize: 18,
      borderWidth: 2,
      innerOffset: 5,
      texture: 'lines',
      textureAlpha: 20,
      font: 'future',
      cursor: 'crystal',
      msgW: 1600,
      msgH: 260,
      choiceW: 720,
      hoverGlow: 18,
    },
  },
  {
    id: 'kaidan',
    scene: 'shrine',
    design: {
      ...DESIGN_BASE,
      keyColor: '#a33a3f',
      polarity: 'light',
      bgOpacity: 92,
      corner: 'square',
      ornament: 'wave',
      cornerSize: 6,
      borderWidth: 2.5,
      innerOffset: 7,
      ornamentScale: 105,
      texture: 'washi',
      textureAlpha: 24,
      font: 'mincho',
      cursor: 'diamond',
      msgW: 1540,
      msgH: 280,
      choiceW: 660,
      hoverGlow: 10,
    },
  },
  {
    id: 'nocturne',
    scene: 'study',
    design: {
      ...DESIGN_BASE,
      keyColor: '#9b2f45',
      polarity: 'dark',
      bgOpacity: 93,
      corner: 'concave',
      ornament: 'gothic',
      cornerSize: 20,
      borderWidth: 2,
      innerOffset: 9,
      ornamentScale: 115,
      texture: 'noise',
      textureAlpha: 26,
      font: 'serif',
      cursor: 'diamond',
      msgH: 288,
      hoverGlow: 20,
    },
  },
  {
    id: 'pixel',
    scene: 'field',
    design: {
      ...DESIGN_BASE,
      keyColor: '#f2c14e',
      polarity: 'dark',
      bgOpacity: 96,
      corner: 'square',
      ornament: 'pixel',
      cornerSize: 0,
      borderWidth: 4,
      innerOffset: 6,
      texture: 'grid',
      textureAlpha: 12,
      font: 'pixel',
      cursor: 'pixel',
      msgW: 1520,
      msgH: 264,
      choiceW: 620,
      hoverGlow: 8,
      activeShift: 4,
    },
  },
];

export const PRESET_IDS = PRESETS.map((p) => p.id);

export function presetById(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** 推薦的主色（快速選色） */
export const QUICK_COLORS: readonly string[] = [
  '#b98f52',
  '#ef6f9a',
  '#2fe3d2',
  '#a33a3f',
  '#9b2f45',
  '#f2c14e',
  '#5b8def',
  '#58b368',
  '#8e6bd6',
  '#e2e4ea',
];

/* ---------- 預設值 ---------- */

export const DEFAULT_TEXTS: Texts = {
  charName: '柏木 遙',
  line: '「書房的燈還亮著。……都這個時間了，你確定要現在推開那扇門嗎？」',
  choice1: '推開書房的門',
  choice2: '先回頭確認走廊',
  choice3: '把手電筒交給她',
  portraitName: '調查員',
  status1: 'HP 11 / 11',
  status2: 'MP 14 / 14',
  status3: 'SAN 62 / 75',
  dice: '偵查 1D100 ≤ 55',
  board: 'KP：書桌最下層的抽屜沒有上鎖，裡面放著一本封面泛黃的日記，最後一頁的日期是三天前。',
  bake: false,
};

export const DEFAULT_MODE: Mode = 'novel';
export const DEFAULT_RESOLUTION: Resolution = 1280;

export function cloneDesign(d: Design): Design {
  return { ...d };
}

export function baseFromPreset(p: Preset, name: string): Base {
  return { kind: 'preset', id: p.id, name, design: cloneDesign(p.design) };
}

/** 預設集的名稱（strings.ts） */
export const presetName = (id: string): string => S.presets[id]?.name ?? id;

/** 第一次開啟：第一個預設集、文字冒險、1280 × 720 */
export function initialState(): DocState {
  const p = PRESETS[0];
  return {
    mode: DEFAULT_MODE,
    resolution: DEFAULT_RESOLUTION,
    design: cloneDesign(p.design),
    texts: { ...DEFAULT_TEXTS },
    base: baseFromPreset(p, presetName(p.id)),
  };
}

/* ---------- 整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

/** 數值夾進範圍並對齊間隔（看不懂時用 fallback） */
export function clampRange(key: RangeKey, v: unknown, fallback: number): number {
  const r = RANGES[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  const snapped = Math.round((n - r.min) / r.step) * r.step + r.min;
  const fixed = Math.round(snapped * 1000) / 1000;
  return Math.max(r.min, Math.min(r.max, fixed));
}

/** 文字整理：最多 max 個字；單行欄位的換行變空白 */
export function tidyText(key: TextKey, v: unknown): string {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/\r\n?/g, '\n');
  if (!MULTILINE_TEXTS.includes(key)) s = s.replace(/\n+/g, ' ');
  return Array.from(s).slice(0, TEXT_MAX[key]).join('');
}

export function normalizeDesign(raw: unknown, fallback: Design = PRESETS[0].design): Design {
  const r = isObj(raw) ? raw : {};
  const out: Design = {
    keyColor: normalizeHex(
      typeof r.keyColor === 'string' ? r.keyColor : '',
      fallback.keyColor,
      false,
    ),
    polarity: oneOf(POLARITIES, r.polarity, fallback.polarity),
    corner: oneOf(CORNER_STYLES, r.corner, fallback.corner),
    ornament: oneOf(ORNAMENTS, r.ornament, fallback.ornament),
    texture: oneOf(TEXTURES, r.texture, fallback.texture),
    font: oneOf(FONT_IDS, r.font, fallback.font),
    cursor: oneOf(CURSOR_SHAPES, r.cursor, fallback.cursor),
    buttonLang: oneOf(BUTTON_LANGS, r.buttonLang, fallback.buttonLang),
    bgOpacity: 0,
    cornerSize: 0,
    borderWidth: 0,
    innerOffset: 0,
    ornamentScale: 0,
    textureAlpha: 0,
    msgW: 0,
    msgH: 0,
    choiceW: 0,
    hoverGlow: 0,
    activeShift: 0,
  };
  for (const k of RANGE_KEYS) out[k] = clampRange(k, r[k], fallback[k]);
  return out;
}

export function normalizeTexts(raw: unknown, fallback: Texts = DEFAULT_TEXTS): Texts {
  const r = isObj(raw) ? raw : {};
  const out = { ...fallback };
  for (const k of TEXT_KEYS) out[k] = typeof r[k] === 'string' ? tidyText(k, r[k]) : fallback[k];
  out.bake = typeof r.bake === 'boolean' ? r.bake : fallback.bake;
  return out;
}

export function normalizeBase(raw: unknown, design: Design, fallbackName: string): Base {
  const r = isObj(raw) ? raw : {};
  const kind = r.kind === 'mine' ? 'mine' : 'preset';
  const id = typeof r.id === 'string' && r.id ? r.id : PRESETS[0].id;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name : fallbackName;
  return { kind, id, name, design: normalizeDesign(r.design, design) };
}

export function normalizeState(raw: unknown): DocState {
  const init = initialState();
  const r = isObj(raw) ? raw : {};
  const design = normalizeDesign(r.design, init.design);
  return {
    mode: oneOf(MODES, r.mode, init.mode),
    resolution: RESOLUTIONS.includes(r.resolution as Resolution)
      ? (r.resolution as Resolution)
      : init.resolution,
    design,
    texts: normalizeTexts(r.texts, init.texts),
    base: normalizeBase(r.base, design, init.base.name),
  };
}

/** 兩份外觀相同（每個欄位） */
export function sameDesign(a: Design, b: Design): boolean {
  return (Object.keys(a) as (keyof Design)[]).every((k) => a[k] === b[k]);
}

/** 和原始值不同的欄位 */
export function changedKeys(d: Design, base: Design): (keyof Design)[] {
  return (Object.keys(d) as (keyof Design)[]).filter((k) => d[k] !== base[k]);
}
