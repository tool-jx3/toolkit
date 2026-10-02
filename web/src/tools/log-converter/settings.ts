/**
 * CCFOLIA 日誌轉換器的設定：型別、預設值、配色預設、圖片品質、分割的數值規則、匯入設定時的修正。
 * 這裡的設定會自動記在瀏覽器（規格 F93）；日誌本身、頭像、插圖與「只對這份日誌有意義」的選擇
 * （旁白角色、閒聊分頁、名稱顏色、分頁顯示）不在這裡，見 store.ts 的工作階段狀態。
 */

export const TOOL_ID = 'log-converter';

/** 輸出樣式（F13） */
export type OutputStyle = 'novel' | 'timeline' | 'ccfolia';
/** 旁白的呈現（F17，只影響 CCFOLIA 風格）：換底色、獨立區塊、同對話 */
export type NarrationMode = 'highlight' | 'block' | 'plain';
/** 閒聊的呈現（F51） */
export type ChatMode = 'collapse' | 'show' | 'hide';
/** 台詞版面（F49，限時間軸）：欄位對齊、接續 */
export type DialogueLayout = 'grid' | 'inline';
/** 分隔符號（F50） */
export type SeparatorType = 'space' | 'custom';
/** 檔案分割（F63） */
export type SplitMethod = 'none' | 'count' | 'size' | 'files';
/** 圖片品質（F28） */
export type QualityPreset = 'low' | 'medium' | 'high' | 'original' | 'custom';
/** 副旁白的樣式（F21）：旁白（斜體）、旁白（一般）、對話（斜體）、旁白（指定顏色） */
export type SubNarratorStyle =
  | 'italic-narration'
  | 'narration'
  | 'italic-dialogue'
  | 'colored-narration';
/** 分頁標示方式（F56，CCFOLIA 風格）：不標示、標出分頁、通知框 */
export type TabStyle = 'none' | 'label' | 'notice';

export const FONT_SIZES = [15, 17, 19, 21] as const;
export const LINE_HEIGHTS = [1.5, 1.8, 2, 2.2] as const;
export const PAGE_WIDTHS = [600, 750, 900, 1200] as const;

/** 9 個顏色（F58～F60） */
export interface Palette {
  systemBg: string;
  systemBorder: string;
  systemText: string;
  narrationBg: string;
  narrationText: string;
  pageBg: string;
  containerBg: string;
  text: string;
  accent: string;
}

export const PALETTE_KEYS = [
  'systemBg',
  'systemBorder',
  'systemText',
  'narrationBg',
  'narrationText',
  'pageBg',
  'containerBg',
  'text',
  'accent',
] as const satisfies readonly (keyof Palette)[];

/** 配色預設（F57）：本站自己配的 11 組（深色系、淺色系、四季、仿 CCFOLIA 畫面） */
export interface ColorPreset {
  id: string;
  name: string;
  palette: Palette;
}

export const COLOR_PRESETS: readonly ColorPreset[] = [
  {
    id: 'night',
    name: '夜霧（深色）',
    palette: {
      systemBg: '#fff4d6',
      systemBorder: '#d98e04',
      systemText: '#4a3a1a',
      narrationBg: '#2b3440',
      narrationText: '#c3ccd6',
      pageBg: '#12161b',
      containerBg: '#1e242b',
      text: '#e8ecf0',
      accent: '#3f8f8a',
    },
  },
  {
    id: 'ink',
    name: '墨黑',
    palette: {
      systemBg: '#f2f2f2',
      systemBorder: '#6b6b6b',
      systemText: '#1f1f1f',
      narrationBg: '#2e2e2e',
      narrationText: '#cfcfcf',
      pageBg: '#111111',
      containerBg: '#1f1f1f',
      text: '#ececec',
      accent: '#7a7a7a',
    },
  },
  {
    id: 'crimson',
    name: '緋夜',
    palette: {
      systemBg: '#ffe9a8',
      systemBorder: '#8c1c1c',
      systemText: '#2d2f6b',
      narrationBg: '#2f3348',
      narrationText: '#c8cede',
      pageBg: '#131216',
      containerBg: '#22232f',
      text: '#e9e9ef',
      accent: '#9b2226',
    },
  },
  {
    id: 'parchment',
    name: '羊皮紙（淺色）',
    palette: {
      systemBg: '#fff8e7',
      systemBorder: '#b08d57',
      systemText: '#5b3a1a',
      narrationBg: '#efe4cf',
      narrationText: '#5a4632',
      pageBg: '#d9ccb4',
      containerBg: '#f7f0e1',
      text: '#3b2f22',
      accent: '#9c6b30',
    },
  },
  {
    id: 'ocean',
    name: '深海',
    palette: {
      systemBg: '#dff3ff',
      systemBorder: '#3aa0d8',
      systemText: '#0f4161',
      narrationBg: '#18324d',
      narrationText: '#9cc9ef',
      pageBg: '#0a1828',
      containerBg: '#142a40',
      text: '#e3f1fb',
      accent: '#2b8fd0',
    },
  },
  {
    id: 'sakura',
    name: '櫻花（淺色）',
    palette: {
      systemBg: '#fff0f4',
      systemBorder: '#f2a2bd',
      systemText: '#8a1f4a',
      narrationBg: '#fdf0f5',
      narrationText: '#8a1f4a',
      pageBg: '#fff7fa',
      containerBg: '#ffeef4',
      text: '#6b2142',
      accent: '#e889ab',
    },
  },
  {
    id: 'spring',
    name: '春',
    palette: {
      systemBg: '#eefbea',
      systemBorder: '#8fd47e',
      systemText: '#255e1c',
      narrationBg: '#fdf0f3',
      narrationText: '#a8325e',
      pageBg: '#fbfbe9',
      containerBg: '#f7f6e2',
      text: '#46503f',
      accent: '#7cb342',
    },
  },
  {
    id: 'summer',
    name: '夏',
    palette: {
      systemBg: '#d8f7fb',
      systemBorder: '#2cc4d8',
      systemText: '#0b6575',
      narrationBg: '#effaff',
      narrationText: '#0b6fa4',
      pageBg: '#effcf9',
      containerBg: '#d4f6ef',
      text: '#15463f',
      accent: '#16a59a',
    },
  },
  {
    id: 'autumn',
    name: '秋',
    palette: {
      systemBg: '#fcdcb4',
      systemBorder: '#e8873a',
      systemText: '#8a3410',
      narrationBg: '#fdf1d3',
      narrationText: '#8a4b0f',
      pageBg: '#fffaf0',
      containerBg: '#fbefd2',
      text: '#6e3510',
      accent: '#d9861c',
    },
  },
  {
    id: 'winter',
    name: '冬',
    palette: {
      systemBg: '#e1ecfb',
      systemBorder: '#8db6ec',
      systemText: '#1f3a79',
      narrationBg: '#f2f8fd',
      narrationText: '#1d5c8a',
      pageBg: '#f6f8fb',
      containerBg: '#edf1f6',
      text: '#34405a',
      accent: '#5d95e8',
    },
  },
  {
    id: 'ccfolia',
    name: '仿 CCFOLIA 畫面',
    palette: {
      systemBg: '#e3f2fd',
      systemBorder: '#4a90a8',
      systemText: '#0d3c5c',
      narrationBg: '#2c2c2c',
      narrationText: '#d4d6da',
      pageBg: '#1c1c1c',
      containerBg: '#282828',
      text: '#e6e7ea',
      accent: '#5c6bc0',
    },
  },
];

/** 配色預設的「自訂」 */
export const CUSTOM_PRESET = 'custom';

export const presetById = (id: string): ColorPreset | undefined =>
  COLOR_PRESETS.find((p) => p.id === id);

/** 名稱顏色沒有記錄時，依發言者出現順序輪流給的 5 色（F32，本站自訂） */
export const NAME_COLOR_POOL = ['#e8590c', '#1c7ed6', '#2b8a3e', '#ae3ec9', '#f08c00'] as const;

/** 分頁顏色的初始值：淺灰文字、透明背景（F62） */
export const DEFAULT_TAB_TEXT = '#e2e6ea';

/** 副旁白「指定顏色」的初始值：灰色（F20） */
export const DEFAULT_SUB_NARRATOR_COLOR = '#a0a7b4';

export interface SubNarrator {
  speaker: string;
  style: SubNarratorStyle;
  color: string;
}

export interface TabColor {
  text: string;
  /** null＝透明（未改動前是透明，色塊顯示黑色） */
  bg: string | null;
}

export interface LcSettings {
  style: OutputStyle;
  narrationMode: NarrationMode;
  narrationCenter: boolean;
  subNarrators: SubNarrator[];
  fontUrl: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  pageWidth: number;
  novelTypography: boolean;
  resizeImages: boolean;
  keepExternalUrl: boolean;
  quality: QualityPreset;
  customQuality: number;
  showLogNumbers: boolean;
  mergeConsecutive: boolean;
  longNameWrap: boolean;
  dialogueLayout: DialogueLayout;
  separatorType: SeparatorType;
  customSeparator: string;
  chatMode: ChatMode;
  showChatCount: boolean;
  hideSystem: boolean;
  colorPreset: string;
  palette: Palette;
  tabColorsEnabled: boolean;
  /** 依分頁名稱 */
  tabColors: Record<string, TabColor>;
  splitMethod: SplitMethod;
  splitCount: number;
  splitSizeKb: number;
  splitFiles: number;
  blogMode: boolean;
}

export const DEFAULT_SETTINGS: LcSettings = {
  style: 'novel',
  narrationMode: 'highlight',
  narrationCenter: false,
  subNarrators: [],
  fontUrl: '',
  fontFamily: '',
  fontSize: 17,
  lineHeight: 1.8,
  pageWidth: 750,
  novelTypography: false,
  resizeImages: true,
  keepExternalUrl: false,
  quality: 'medium',
  customQuality: 30,
  showLogNumbers: true,
  mergeConsecutive: false,
  longNameWrap: false,
  dialogueLayout: 'grid',
  separatorType: 'space',
  customSeparator: ':',
  chatMode: 'collapse',
  showChatCount: true,
  hideSystem: false,
  colorPreset: COLOR_PRESETS[0].id,
  palette: { ...COLOR_PRESETS[0].palette },
  tabColorsEnabled: false,
  tabColors: {},
  splitMethod: 'none',
  splitCount: 100,
  splitSizeKb: 100,
  splitFiles: 2,
  blogMode: false,
};

/* ---------- 圖片品質（F28、3.8） ---------- */

export type ImageMime = 'image/webp' | 'image/jpeg' | 'image/png';

export interface QualitySpec {
  /** 頭像長邊上限（Infinity＝不縮放） */
  maxSide: number;
  /** 編碼品質 0～1（PNG 不使用） */
  quality: number;
  /** 想要的格式（WebP 不支援時改用 JPEG） */
  format: ImageMime;
}

/** 依品質預設（自訂時用滑桿值 0～100）算出頭像的長邊上限、格式與編碼品質 */
export function qualitySpec(preset: QualityPreset, custom = 30): QualitySpec {
  switch (preset) {
    case 'low':
      return { maxSide: 100, quality: 0.6, format: 'image/webp' };
    case 'high':
      return { maxSide: 200, quality: 0.85, format: 'image/jpeg' };
    case 'original':
      return { maxSide: Number.POSITIVE_INFINITY, quality: 1, format: 'image/png' };
    case 'custom': {
      const x = Math.min(100, Math.max(0, Number.isFinite(custom) ? custom : 30));
      return {
        maxSide: Math.round(64 + (x / 100) * 236),
        quality: 0.4 + (x / 100) * 0.55,
        format: x > 80 ? 'image/jpeg' : 'image/webp',
      };
    }
    default:
      return { maxSide: 150, quality: 0.75, format: 'image/webp' };
  }
}

/** 自訂滑桿旁的「每張大約多大」（F28） */
export function customSizeEstimate(x: number): string {
  if (x <= 15) return '約 1 KB';
  if (x <= 30) return '約 3 KB';
  if (x <= 50) return '約 8 KB';
  if (x <= 70) return '約 15 KB';
  if (x <= 85) return '約 25 KB';
  return '約 40 KB';
}

/**
 * 只縮小不放大：寬或高超過上限時等比縮到長邊＝上限（另一邊四捨五入）。
 * 寬大於高時以寬為準，否則（含正方形）以高為準。
 */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  if (!(width > maxSide || height > maxSide)) return { width, height };
  if (width > height)
    return { width: maxSide, height: Math.max(1, Math.round((maxSide * height) / width)) };
  return { width: Math.max(1, Math.round((maxSide * width) / height)), height: maxSide };
}

/** 上傳的插圖：長邊 800 px 以內、品質 0.9（3.7） */
export const ILLUSTRATION_MAX_SIDE = 800;
export const ILLUSTRATION_QUALITY = 0.9;

/* ---------- 分割（3.9） ---------- */

export interface SplitRule {
  method: SplitMethod;
  value: number;
}

/** 分割的數值規則：依則數／依大小 1～100000 的整數（其他值＝不分割）；固定檔數 2～1000（其他值＝2） */
export function splitRule(
  s: Pick<LcSettings, 'splitMethod' | 'splitCount' | 'splitSizeKb' | 'splitFiles'>,
): SplitRule {
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : Number.NaN);
  switch (s.splitMethod) {
    case 'count': {
      const n = int(s.splitCount);
      return n >= 1 && n <= 100000 ? { method: 'count', value: n } : { method: 'none', value: 0 };
    }
    case 'size': {
      const n = int(s.splitSizeKb);
      return n >= 1 && n <= 100000 ? { method: 'size', value: n } : { method: 'none', value: 0 };
    }
    case 'files': {
      const n = int(s.splitFiles);
      return { method: 'files', value: n >= 2 && n <= 1000 ? n : 2 };
    }
    default:
      return { method: 'none', value: 0 };
  }
}

/** 接續版面的分隔（F50）：空格＝一個半形空白；自訂＝自訂文字＋半形空白（空白時當成「:」） */
export function separatorText(type: SeparatorType, custom: string): string {
  if (type !== 'custom') return ' ';
  const v = Array.from(custom ?? '')
    .slice(0, 3)
    .join('');
  return `${v || ':'} `;
}

/* ---------- 匯入設定、讀回時的修正 ---------- */

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const oneOf = <T extends string | number>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const SUB_STYLES: readonly SubNarratorStyle[] = [
  'italic-narration',
  'narration',
  'italic-dialogue',
  'colored-narration',
];

/** 把任意物件（匯入的設定檔、舊的存檔）修正成完整的設定；看不懂的欄位用預設值 */
export function normalizeSettings(raw: unknown): LcSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const rawPalette = (r.palette && typeof r.palette === 'object' ? r.palette : {}) as Record<
    string,
    unknown
  >;
  const palette = { ...d.palette };
  for (const k of PALETTE_KEYS)
    if (isHex(rawPalette[k])) palette[k] = (rawPalette[k] as string).toLowerCase();
  let colorPreset = str(r.colorPreset, d.colorPreset);
  if (colorPreset !== CUSTOM_PRESET && !presetById(colorPreset)) colorPreset = CUSTOM_PRESET;
  /* 選單顯示的預設要和實際顏色一致（第 5 節第 7 項） */
  const preset = presetById(colorPreset);
  if (preset && PALETTE_KEYS.some((k) => preset.palette[k] !== palette[k]))
    colorPreset = CUSTOM_PRESET;

  const subNarrators: SubNarrator[] = [];
  if (Array.isArray(r.subNarrators)) {
    for (const item of r.subNarrators) {
      const it = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      if (typeof it.speaker !== 'string') continue;
      if (subNarrators.some((s) => s.speaker === it.speaker)) continue;
      subNarrators.push({
        speaker: it.speaker,
        style: oneOf(it.style, SUB_STYLES, 'italic-narration'),
        color: isHex(it.color) ? it.color.toLowerCase() : DEFAULT_SUB_NARRATOR_COLOR,
      });
    }
  }
  const tabColors: Record<string, TabColor> = {};
  if (r.tabColors && typeof r.tabColors === 'object') {
    for (const [tab, v] of Object.entries(r.tabColors as Record<string, unknown>)) {
      const c = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      tabColors[tab] = {
        text: isHex(c.text) ? c.text.toLowerCase() : DEFAULT_TAB_TEXT,
        bg: isHex(c.bg) ? c.bg.toLowerCase() : null,
      };
    }
  }
  const intIn = (v: unknown, fallback: number, min: number, max: number) => {
    const n = num(v, fallback);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    style: oneOf(r.style, ['novel', 'timeline', 'ccfolia'] as const, d.style),
    narrationMode: oneOf(
      r.narrationMode,
      ['highlight', 'block', 'plain'] as const,
      d.narrationMode,
    ),
    narrationCenter: bool(r.narrationCenter, d.narrationCenter),
    subNarrators,
    fontUrl: str(r.fontUrl, d.fontUrl),
    fontFamily: str(r.fontFamily, d.fontFamily),
    fontSize: oneOf(r.fontSize, FONT_SIZES, 17),
    lineHeight: oneOf(r.lineHeight, LINE_HEIGHTS, 1.8),
    pageWidth: oneOf(r.pageWidth, PAGE_WIDTHS, 750),
    novelTypography: bool(r.novelTypography, d.novelTypography),
    resizeImages: bool(r.resizeImages, d.resizeImages),
    keepExternalUrl: bool(r.keepExternalUrl, d.keepExternalUrl),
    quality: oneOf(r.quality, ['low', 'medium', 'high', 'original', 'custom'] as const, d.quality),
    customQuality: intIn(r.customQuality, d.customQuality, 0, 100),
    showLogNumbers: bool(r.showLogNumbers, d.showLogNumbers),
    mergeConsecutive: bool(r.mergeConsecutive, d.mergeConsecutive),
    longNameWrap: bool(r.longNameWrap, d.longNameWrap),
    dialogueLayout: oneOf(r.dialogueLayout, ['grid', 'inline'] as const, d.dialogueLayout),
    separatorType: oneOf(r.separatorType, ['space', 'custom'] as const, d.separatorType),
    customSeparator: Array.from(str(r.customSeparator, d.customSeparator)).slice(0, 3).join(''),
    chatMode: oneOf(r.chatMode, ['collapse', 'show', 'hide'] as const, d.chatMode),
    showChatCount: bool(r.showChatCount, d.showChatCount),
    hideSystem: bool(r.hideSystem, d.hideSystem),
    colorPreset,
    palette,
    tabColorsEnabled: bool(r.tabColorsEnabled, d.tabColorsEnabled),
    tabColors,
    splitMethod: oneOf(r.splitMethod, ['none', 'count', 'size', 'files'] as const, d.splitMethod),
    splitCount: intIn(r.splitCount, d.splitCount, 1, 100000),
    splitSizeKb: intIn(r.splitSizeKb, d.splitSizeKb, 1, 100000),
    splitFiles: intIn(r.splitFiles, d.splitFiles, 2, 1000),
    blogMode: bool(r.blogMode, d.blogMode),
  };
}
