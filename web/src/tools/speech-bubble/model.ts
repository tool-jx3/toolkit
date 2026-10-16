/**
 * 動態對話泡泡產生器的資料：型別、預設值、範圍與整理（規格 docs/refactor/specs/speech-bubble.md）。
 * 這個檔案不依賴 React 與瀏覽器（單元測試在 Node 跑）。
 */
import { DEFAULT_FONT, type FontValue } from '@/core/fonts';
import {
  docText,
  normalizeDoc,
  plainDoc,
  type RichDoc,
  type RichRun,
  sliceDoc,
  validateDoc,
} from '@/core/richtext';
import type { Anchor } from '@/core/typeset/fit';
import { styleDefaults } from './styles';

export const TOOL_ID = 'speech-bubble';

/* ---------- 造型與泡泡 ---------- */

export const STYLE_IDS = [
  'messenger',
  'speech',
  'thought',
  'shout',
  'chat-card',
  'rpg',
  'battle',
  'tag',
  'sticky',
  'notebook',
  'parchment',
  'neon',
  'news',
  'toast',
  'window',
  'glass',
  'capsule',
  'card',
  'hud',
  'terminal',
  'hologram',
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export const ICON_IDS = [
  'none',
  'check',
  'cross',
  'warn',
  'info',
  'question',
  'person',
  'star',
  'heart',
  'bell',
  'dot',
] as const;
export type IconId = (typeof ICON_IDS)[number];

export const ALIGNS = ['left', 'center', 'right'] as const;
export type Align = (typeof ALIGNS)[number];

/** 一個泡泡的四種顏色（`#rrggbb` 或 `#rrggbbaa`） */
export interface Palette {
  /** 底色 */
  fill: string;
  /** 邊框（含規線、底線等線條） */
  border: string;
  /** 內文 */
  text: string;
  /** 強調（標題、圖示、裝飾、光暈） */
  accent: string;
}

export const PALETTE_KEYS = ['fill', 'border', 'text', 'accent'] as const;

export interface Bubble {
  id: string;
  style: StyleId;
  /** 標題／名字（依造型放在標題列、名牌、左側標籤…；空白就不畫） */
  title: string;
  /** 內文（可以換行） */
  text: string;
  icon: IconId;
  /** 按鈕文字（系統視窗；空白就不畫按鈕） */
  button: string;
  /** 位置：在欄裡靠哪邊；也是尾巴的方向 */
  align: Align;
  colors: Palette;
  /*
   * 以下是 2026-10（整合對話卡片）加的欄位。整理過的資料一定有；
   * 舊的資料、測試直接給的泡泡可能沒有，讀的時候一律用 bubbleFmt()、bubbleCustom()… 補預設。
   */
  /** 說話者（對話卡片的名字；顯示的位置在樣式的「說話者與日期」） */
  speaker?: string;
  /** 日期時間（文字照打的顯示） */
  time?: string;
  /** 其他樣式（字型、內距、圓角、陰影、說話者與日期的顯示…） */
  fmt?: Fmt;
  /** 單獨改過的樣式項目：這些項目不跟著「兩側的預設」 */
  custom?: LookKey[];
  /** 自由拖曳的位移（畫布 px；排好之後再移動） */
  dx?: number;
  dy?: number;
  /**
   * 內文的部分文字格式（2026-10 第二步，規格 F70～、3.15）：粗體、斜體、刪除線、底線、文字顏色（空字串＝泡泡的內文色）、
   * 螢光筆。只有內文裡有格式時才有這個欄位，`docText(rich)` 一定等於 `text`（純文字的內文照舊只有 `text`）。
   */
  rich?: RichDoc;
}

/* ---------- 樣式：兩側的預設與單獨調整（2026-10，規格 F57～） ---------- */

export const TEXT_ALIGN_IDS = ['auto', 'left', 'center', 'right'] as const;
export type TextAlignId = (typeof TEXT_ALIGN_IDS)[number];

/** 尾巴與角：造型預設／指向側的角變尖（沒有尾巴）／全圓（沒有尾巴） */
export const CORNER_IDS = ['auto', 'point', 'round'] as const;
export type CornerId = (typeof CORNER_IDS)[number];

/** 柔和陰影：跟著「版面」的陰影開關／一律開／一律關 */
export const SHADOW_MODE_IDS = ['auto', 'on', 'off'] as const;
export type ShadowModeId = (typeof SHADOW_MODE_IDS)[number];

/**
 * 說話者與日期的顯示：
 * - above：名字在泡泡上方、日期時間在泡泡旁邊（聊天軟體）
 * - header：名字與日期時間一起在泡泡上方
 * - side：名字與日期時間在泡泡旁邊（外側）
 * - inside：泡泡裡的最下面（分隔線＋名字・日期時間）
 * - off：不顯示
 */
export const META_MODE_IDS = ['above', 'header', 'side', 'inside', 'off'] as const;
export type MetaModeId = (typeof META_MODE_IDS)[number];

/** 造型、配色、圖示以外的樣式 */
export interface Fmt {
  /** 字型；null＝沿用「版面」分頁的字型 */
  font: FontValue | null;
  /** 字級；null＝沿用「版面」 */
  fontSize: number | null;
  /** 行距；null＝沿用「版面」 */
  lineHeight: number | null;
  /** 字距（畫布 px） */
  letterSpacing: number;
  /** 文字對齊；auto＝造型預設 */
  textAlign: TextAlignId;
  /** 文字上下微調（畫布 px，往下為正） */
  textDy: number;
  /** 整個內文斜體、刪除線、底線（2026-10 第二步；和部分格式疊加：其中一個有就有） */
  italic: boolean;
  strike: boolean;
  underline: boolean;
  /** 內距（造型預設的倍數）：左右、上下 */
  padX: number;
  padY: number;
  /** 圓角（畫布 px）；null＝造型預設 */
  radius: number | null;
  corner: CornerId;
  /** 邊框粗細（造型預設的倍數；0＝不畫） */
  borderScale: number;
  softShadow: ShadowModeId;
  /** 底部實色陰影（不模糊，往下錯開） */
  solidShadow: boolean;
  solidColor: string;
  /** 實色陰影往下錯開的距離（畫布 px） */
  solidOffset: number;
  /** 寬度貼合文字（關閉時內文的寬度固定是「文字寬度上限」） */
  fitWidth: boolean;
  /** 想法泡泡的雲朵大小（倍數） */
  cloudPuff: number;
  meta: MetaModeId;
  metaColor: string;
  /** 說話者與日期的字型；null＝和內文相同 */
  metaFont: FontValue | null;
  /** 說話者與日期的字級（內文字級的倍數） */
  metaScale: number;
}

export const FMT_KEYS = [
  'font',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textDy',
  'italic',
  'strike',
  'underline',
  'padX',
  'padY',
  'radius',
  'corner',
  'borderScale',
  'softShadow',
  'solidShadow',
  'solidColor',
  'solidOffset',
  'fitWidth',
  'cloudPuff',
  'meta',
  'metaColor',
  'metaFont',
  'metaScale',
] as const satisfies readonly (keyof Fmt)[];
export type FmtKey = (typeof FMT_KEYS)[number];

/** 可以單獨改、也有「兩側的預設」的樣式項目 */
export const LOOK_KEYS = [
  'style',
  'fill',
  'border',
  'text',
  'accent',
  'icon',
  ...FMT_KEYS,
] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

/** 一整組樣式（一側的預設；也是一個泡泡的樣式） */
export interface Look {
  style: StyleId;
  colors: Palette;
  icon: IconId;
  fmt: Fmt;
}

export type Sides = Record<Align, Look>;

/** 預設值都等於整合前的畫法（沒用到新功能時輸出不變） */
export const DEFAULT_FMT: Fmt = {
  font: null,
  fontSize: null,
  lineHeight: null,
  letterSpacing: 0,
  textAlign: 'auto',
  textDy: 0,
  italic: false,
  strike: false,
  underline: false,
  padX: 1,
  padY: 1,
  radius: null,
  corner: 'auto',
  borderScale: 1,
  softShadow: 'auto',
  solidShadow: false,
  solidColor: '#00000040',
  solidOffset: 4,
  fitWidth: true,
  cloudPuff: 1,
  meta: 'above',
  metaColor: '#8b909a',
  metaFont: null,
  metaScale: 0.62,
};

export const FMT_RANGES = {
  letterSpacing: { min: -5, max: 30, step: 0.5 },
  textDy: { min: -40, max: 40, step: 1 },
  padX: { min: 0.2, max: 3, step: 0.05 },
  padY: { min: 0.2, max: 3, step: 0.05 },
  radius: { min: 0, max: 200, step: 1 },
  borderScale: { min: 0, max: 5, step: 0.1 },
  solidOffset: { min: 1, max: 30, step: 1 },
  cloudPuff: { min: 0.5, max: 2, step: 0.05 },
  metaScale: { min: 0.4, max: 1.5, step: 0.05 },
} as const;

/** 說話者、日期時間的字數上限 */
export const MAX_SPEAKER = 40;
export const MAX_TIME = 40;
/** 自由拖曳的位移上限（每個方向，畫布 px） */
export const MAX_OFFSET = 4000;

/* ---------- 卡片底、頁首與頁尾（2026-10） ---------- */

export const TEXTURE_IDS = ['none', 'paper', 'grain', 'crumple', 'grid', 'dots', 'lines'] as const;
export type TextureId = (typeof TEXTURE_IDS)[number];

export const IMAGE_FIT_IDS = ['cover', 'contain', 'repeat'] as const;
export type ImageFitId = (typeof IMAGE_FIT_IDS)[number];

export const DIVIDER_IDS = ['none', 'solid', 'dashed', 'double'] as const;
export type DividerId = (typeof DIVIDER_IDS)[number];

export const NOTE_ALIGN_IDS = ['left', 'center', 'right'] as const;
export type NoteAlignId = (typeof NOTE_ALIGN_IDS)[number];

export interface CardStyle {
  /** 畫卡片底（關閉時背景透明，和以前相同） */
  bg: boolean;
  color: string;
  /** 卡片的圓角（畫布 px；角落外透明） */
  radius: number;
  /** 背景圖（圖片資產 id） */
  image: string | null;
  imageFit: ImageFitId;
  /** 背景圖的不透明度 0～100 */
  imageOpacity: number;
  texture: TextureId;
  /** 紋理強度 0～100 */
  strength: number;
  /** 深色底自動加強（紋理改用淺色、加深） */
  darkBoost: boolean;
  /** 頁首、頁尾文字（可以換行；空白就不畫） */
  header: string;
  footer: string;
  noteAlign: NoteAlignId;
  noteColor: string;
  /** 頁首、頁尾的字級（畫布 px） */
  noteSize: number;
  /** 頁首、頁尾的字型；null＝沿用「版面」 */
  noteFont: FontValue | null;
  /** 泡泡區上下的分隔線 */
  divider: DividerId;
  dividerColor: string;
}

export const DEFAULT_CARD: CardStyle = {
  bg: false,
  color: '#faf7f0',
  radius: 0,
  image: null,
  imageFit: 'cover',
  imageOpacity: 100,
  texture: 'none',
  strength: 50,
  darkBoost: true,
  header: '',
  footer: '',
  noteAlign: 'center',
  noteColor: '#8a8478',
  noteSize: 14,
  noteFont: null,
  divider: 'none',
  dividerColor: '#d3cbbd',
};

export const CARD_RANGES = {
  radius: { min: 0, max: 200, step: 1 },
  imageOpacity: { min: 0, max: 100, step: 1 },
  strength: { min: 0, max: 100, step: 1 },
  noteSize: { min: 8, max: 64, step: 1 },
} as const;

export const MAX_NOTE = 200;

/* ---------- 版面與動畫 ---------- */

export const ARRANGES = ['column', 'grid', 'pile', 'swap'] as const;
export type Arrange = (typeof ARRANGES)[number];

export const ENTER_IDS = [
  'pop',
  'fade',
  'zoom',
  'side',
  'left',
  'right',
  'up',
  'down',
  'wipe',
  'unroll',
  'glitch',
  'drop',
  'spin',
] as const;
export type EnterId = (typeof ENTER_IDS)[number];

export const EXIT_IDS = [
  'none',
  'fade',
  'zoom',
  'pop',
  'side',
  'left',
  'right',
  'up',
  'down',
  'wipe',
  'unroll',
  'glitch',
  'fall',
  'spin',
] as const;
export type ExitId = (typeof EXIT_IDS)[number];

export const IDLE_IDS = [
  'none',
  'float',
  'breathe',
  'sway',
  'shake',
  'shine',
  'scan',
  'flicker',
  'glitch',
] as const;
export type IdleId = (typeof IDLE_IDS)[number];

export const TEXT_ANIM_IDS = ['with', 'fade', 'type', 'line'] as const;
export type TextAnimId = (typeof TEXT_ANIM_IDS)[number];

export const CURSOR_IDS = ['none', 'block', 'bar'] as const;
export type CursorId = (typeof CURSOR_IDS)[number];

export const ORDER_IDS = ['list', 'random'] as const;
export type OrderId = (typeof ORDER_IDS)[number];

/** 畫布大小：自動（依內容）、正方形、限動（9:16）、橫幅（16:9）、自訂 */
export const CANVAS_MODES = ['auto', 'square', 'story', 'wide', 'fixed'] as const;
export type CanvasMode = (typeof CANVAS_MODES)[number];

export const ANCHOR_IDS: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

export interface SbData {
  /** 最後套用的範本（顯示用；改過內容後仍保留） */
  presetId: string | null;
  bubbles: Bubble[];
  font: FontValue;
  /** 內文字級（畫布 px） */
  fontSize: number;
  /** 行距（字級的倍數） */
  lineHeight: number;
  /** 文字寬度上限：內文超過就換行（畫布 px） */
  wrapWidth: number;
  arrange: Arrange;
  /** 格狀排列的欄數 */
  columns: number;
  /** 泡泡之間的間距（疊放時是每張的位移） */
  gap: number;
  /** 直向排列時，靠左與靠右的泡泡互相錯開的距離 */
  indent: number;
  shadow: boolean;
  canvasMode: CanvasMode;
  /** 最小高度（自動、比例畫布；0＝不限） */
  minHeight: number;
  /** 自動畫布四周的留白；自訂畫布時內容離邊緣的距離 */
  margin: number;
  width: number;
  height: number;
  anchor: Anchor;
  enter: EnterId;
  enterDur: number;
  idle: IdleId;
  textAnim: TextAnimId;
  /** 打字速度（每秒幾個字） */
  typeSpeed: number;
  cursor: CursorId;
  exit: ExitId;
  exitDur: number;
  /** 依序出現的間隔（秒） */
  stagger: number;
  /** 全部出現之後停留幾秒才開始退場 */
  hold: number;
  /** 一起退場（否則依出現的順序、同樣的間隔退場） */
  exitTogether: boolean;
  order: OrderId;
  fps: number;
  /** 靠左、置中、靠右三側各自的預設樣式（改一側的預設會套用到那一側沒有單獨改過的泡泡） */
  sides: Sides;
  /** 卡片底、頁首與頁尾 */
  card: CardStyle;
}

/** 數值範圍（滑桿與整理共用） */
export const RANGES = {
  fontSize: { min: 10, max: 96, step: 1 },
  lineHeight: { min: 1, max: 2.4, step: 0.05 },
  wrapWidth: { min: 80, max: 1200, step: 10 },
  columns: { min: 2, max: 4, step: 1 },
  gap: { min: 0, max: 160, step: 1 },
  indent: { min: 0, max: 400, step: 1 },
  margin: { min: 0, max: 240, step: 1 },
  width: { min: 32, max: 2048, step: 1 },
  height: { min: 32, max: 2048, step: 1 },
  minHeight: { min: 0, max: 4096, step: 1 },
  enterDur: { min: 0.1, max: 2, step: 0.05 },
  exitDur: { min: 0.1, max: 2, step: 0.05 },
  typeSpeed: { min: 2, max: 60, step: 1 },
  stagger: { min: 0, max: 3, step: 0.05 },
  hold: { min: 0, max: 10, step: 0.1 },
  fps: { min: 4, max: 60, step: 1 },
} as const;

/** 泡泡數量上限（2026-10 為了對話卡片從 12 放寬到 40） */
export const MAX_BUBBLES = 40;
export const MAX_TITLE = 40;
export const MAX_TEXT = 400;
export const MAX_BUTTON = 12;
/** 自動畫布的上限（每邊） */
export const MAX_CANVAS = 4096;

export const FPS_OPTIONS = [10, 12, 15, 16, 20, 24, 30] as const;

export const DEFAULT_TEXT_FONT: FontValue = {
  ...DEFAULT_FONT,
  family: 'Noto Sans TC',
  weight: 500,
};

/** 不含泡泡的設定預設值（範本沒寫到的欄位用這些） */
export const BASE_SETTINGS: Omit<SbData, 'bubbles' | 'presetId'> = {
  font: { ...DEFAULT_TEXT_FONT },
  fontSize: 22,
  lineHeight: 1.5,
  wrapWidth: 360,
  arrange: 'column',
  columns: 2,
  gap: 16,
  indent: 64,
  shadow: true,
  canvasMode: 'auto',
  margin: 24,
  width: 640,
  height: 360,
  anchor: 'mc',
  enter: 'pop',
  enterDur: 0.35,
  idle: 'float',
  textAnim: 'with',
  typeSpeed: 16,
  cursor: 'none',
  exit: 'fade',
  exitDur: 0.3,
  stagger: 0.6,
  hold: 2.3,
  exitTogether: false,
  order: 'list',
  fps: 16,
  minHeight: 0,
  sides: {
    left: defaultLook('messenger'),
    center: defaultLook('messenger'),
    right: defaultLook('messenger'),
  },
  card: { ...DEFAULT_CARD },
};

/** 造型的預設樣式（配色、圖示是造型的預設，其他是 DEFAULT_FMT） */
export function defaultLook(style: StyleId): Look {
  const d = styleDefaults(style);
  return { style, colors: { ...d.colors }, icon: d.icon, fmt: { ...DEFAULT_FMT } };
}

/* ---------- 整理（自動儲存、專案檔讀回時） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function clampRange(key: keyof typeof RANGES, v: unknown, fallback: number): number {
  const r = RANGES[key];
  const n = num(v);
  if (n === null) return fallback;
  const c = clamp(n, r.min, r.max);
  return r.step >= 1 ? Math.round(c) : Math.round(c * 1000) / 1000;
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? Array.from(v.replace(/\r\n?/g, '\n')).slice(0, max).join('') : '';

/** 單行（標題、按鈕）：換行換成空白 */
export const singleLine = (v: string): string => v.replace(/\s*\n\s*/g, ' ');

let idSeq = 0;
/** 新的泡泡 id（同一次開頁內不重複） */
export function newBubbleId(): string {
  idSeq += 1;
  return `b${Date.now().toString(36)}${idSeq.toString(36)}`;
}

export function normalizePalette(raw: unknown, fallback: Palette): Palette {
  const r = isObj(raw) ? raw : {};
  return {
    fill: isHexColor(r.fill) ? r.fill.toLowerCase() : fallback.fill,
    border: isHexColor(r.border) ? r.border.toLowerCase() : fallback.border,
    text: isHexColor(r.text) ? r.text.toLowerCase() : fallback.text,
    accent: isHexColor(r.accent) ? r.accent.toLowerCase() : fallback.accent,
  };
}

export function normalizeFont(raw: unknown, fallback: FontValue = DEFAULT_TEXT_FONT): FontValue {
  if (!isObj(raw)) return { ...fallback };
  const source = raw.source === 'google' || raw.source === 'local' || raw.source === 'upload';
  const family = typeof raw.family === 'string' ? raw.family.slice(0, 200) : '';
  if (!source || !family) return { ...fallback };
  const weight = num(raw.weight);
  return {
    source: raw.source as FontValue['source'],
    family,
    weight: weight === null ? 400 : Math.round(clamp(weight, 100, 900) / 100) * 100,
  };
}

const numIn = (v: unknown, r: { min: number; max: number; step: number }, fallback: number) => {
  const n = num(v);
  if (n === null) return fallback;
  const c = clamp(n, r.min, r.max);
  return r.step >= 1 ? Math.round(c) : Math.round(c * 1000) / 1000;
};

const fontOrNull = (v: unknown, fallback: FontValue | null): FontValue | null => {
  if (v === null) return null;
  if (!isObj(v)) return fallback;
  return normalizeFont(v, fallback ?? DEFAULT_TEXT_FONT);
};

const hexOr = (v: unknown, fallback: string): string =>
  isHexColor(v) ? v.toLowerCase() : fallback;

/** 整理樣式的其他項目（缺的、不認得的用 fallback） */
export function normalizeFmt(raw: unknown, fallback: Fmt = DEFAULT_FMT): Fmt {
  const r = isObj(raw) ? raw : {};
  const f = fallback;
  const R = FMT_RANGES;
  const optNum = (v: unknown, key: 'fontSize' | 'lineHeight', fb: number | null) =>
    v === null ? null : num(v) === null ? fb : clampRange(key, v, fb ?? BASE_SETTINGS[key]);
  return {
    font: 'font' in r ? fontOrNull(r.font, f.font) : f.font,
    fontSize: 'fontSize' in r ? optNum(r.fontSize, 'fontSize', f.fontSize) : f.fontSize,
    lineHeight: 'lineHeight' in r ? optNum(r.lineHeight, 'lineHeight', f.lineHeight) : f.lineHeight,
    letterSpacing: numIn(r.letterSpacing, R.letterSpacing, f.letterSpacing),
    textAlign: oneOf(TEXT_ALIGN_IDS, r.textAlign, f.textAlign),
    textDy: numIn(r.textDy, R.textDy, f.textDy),
    italic: typeof r.italic === 'boolean' ? r.italic : f.italic,
    strike: typeof r.strike === 'boolean' ? r.strike : f.strike,
    underline: typeof r.underline === 'boolean' ? r.underline : f.underline,
    padX: numIn(r.padX, R.padX, f.padX),
    padY: numIn(r.padY, R.padY, f.padY),
    radius:
      r.radius === null
        ? null
        : num(r.radius) === null
          ? f.radius
          : numIn(r.radius, R.radius, f.radius ?? 0),
    corner: oneOf(CORNER_IDS, r.corner, f.corner),
    borderScale: numIn(r.borderScale, R.borderScale, f.borderScale),
    softShadow: oneOf(SHADOW_MODE_IDS, r.softShadow, f.softShadow),
    solidShadow: typeof r.solidShadow === 'boolean' ? r.solidShadow : f.solidShadow,
    solidColor: hexOr(r.solidColor, f.solidColor),
    solidOffset: numIn(r.solidOffset, R.solidOffset, f.solidOffset),
    fitWidth: typeof r.fitWidth === 'boolean' ? r.fitWidth : f.fitWidth,
    cloudPuff: numIn(r.cloudPuff, R.cloudPuff, f.cloudPuff),
    meta: oneOf(META_MODE_IDS, r.meta, f.meta),
    metaColor: hexOr(r.metaColor, f.metaColor),
    metaFont: 'metaFont' in r ? fontOrNull(r.metaFont, f.metaFont) : f.metaFont,
    metaScale: numIn(r.metaScale, R.metaScale, f.metaScale),
  };
}

/** 整理一整組樣式（一側的預設） */
export function normalizeLook(
  raw: unknown,
  fallback: Look,
  defaults: (style: StyleId) => { colors: Palette; icon: IconId } = styleDefaults,
): Look {
  if (!isObj(raw)) return cloneLook(fallback);
  const style = oneOf(STYLE_IDS, raw.style, fallback.style);
  const d =
    style === fallback.style ? { colors: fallback.colors, icon: fallback.icon } : defaults(style);
  return {
    style,
    colors: normalizePalette(raw.colors, d.colors),
    icon: oneOf(ICON_IDS, raw.icon, d.icon),
    fmt: normalizeFmt(raw.fmt, fallback.fmt),
  };
}

const noteText = (v: unknown) =>
  typeof v === 'string' ? Array.from(v.replace(/\r\n?/g, '\n')).slice(0, MAX_NOTE).join('') : '';

/** 整理卡片底、頁首與頁尾 */
export function normalizeCard(raw: unknown): CardStyle {
  const r = isObj(raw) ? raw : {};
  const f = DEFAULT_CARD;
  const R = CARD_RANGES;
  return {
    bg: typeof r.bg === 'boolean' ? r.bg : f.bg,
    color: hexOr(r.color, f.color),
    radius: numIn(r.radius, R.radius, f.radius),
    image: typeof r.image === 'string' && r.image ? r.image.slice(0, 128) : null,
    imageFit: oneOf(IMAGE_FIT_IDS, r.imageFit, f.imageFit),
    imageOpacity: numIn(r.imageOpacity, R.imageOpacity, f.imageOpacity),
    texture: oneOf(TEXTURE_IDS, r.texture, f.texture),
    strength: numIn(r.strength, R.strength, f.strength),
    darkBoost: typeof r.darkBoost === 'boolean' ? r.darkBoost : f.darkBoost,
    header: noteText(r.header),
    footer: noteText(r.footer),
    noteAlign: oneOf(NOTE_ALIGN_IDS, r.noteAlign, f.noteAlign),
    noteColor: hexOr(r.noteColor, f.noteColor),
    noteSize: numIn(r.noteSize, R.noteSize, f.noteSize),
    noteFont: 'noteFont' in r ? fontOrNull(r.noteFont, null) : null,
    divider: oneOf(DIVIDER_IDS, r.divider, f.divider),
    dividerColor: hexOr(r.dividerColor, f.dividerColor),
  };
}

/**
 * 整理一個泡泡：缺的欄位補預設；造型不認得時用訊息泡泡；顏色不是色碼時用造型的預設色。
 * `defaults(style)` 給造型的預設配色與圖示。
 * 單獨改過的項目（custom）：資料裡有就照用（只留認得的）；沒有（第 1 版的資料）時留著不填，
 * 由 normalizeData 和兩側的預設比對後算出來。
 */
export function normalizeBubble(
  raw: unknown,
  defaults: (style: StyleId) => { colors: Palette; icon: IconId },
  usedIds?: Set<string>,
): Bubble {
  const r = isObj(raw) ? raw : {};
  const style = oneOf(STYLE_IDS, r.style, 'messenger');
  const d = defaults(style);
  let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : newBubbleId();
  if (usedIds) {
    while (usedIds.has(id)) id = newBubbleId();
    usedIds.add(id);
  }
  const off = (v: unknown) => {
    const n = num(v);
    return n === null ? 0 : Math.round(clamp(n, -MAX_OFFSET, MAX_OFFSET) * 10) / 10;
  };
  const out: Bubble = {
    id,
    style,
    title: singleLine(str(r.title, MAX_TITLE)),
    text: str(r.text, MAX_TEXT),
    icon: oneOf(ICON_IDS, r.icon, d.icon),
    button: singleLine(str(r.button, MAX_BUTTON)),
    align: oneOf(ALIGNS, r.align, 'left'),
    colors: normalizePalette(r.colors, d.colors),
    speaker: singleLine(str(r.speaker, MAX_SPEAKER)),
    time: singleLine(str(r.time, MAX_TIME)),
    fmt: normalizeFmt(r.fmt),
    dx: off(r.dx),
    dy: off(r.dy),
  };
  if (Array.isArray(r.custom)) out.custom = normalizeCustom(r.custom);
  const rich = normalizeRich(r.rich, out.text);
  if (rich) out.rich = rich;
  return out;
}

/* ---------- 內文的部分文字格式（2026-10 第二步） ---------- */

/** 文字顏色的常用色（泡泡的內文色、強調色排在前面） */
export const TEXT_SWATCHES = [
  '#222222',
  '#ffffff',
  '#d93f3f',
  '#e07b1a',
  '#2f8a3e',
  '#2463c4',
  '#7a45c2',
  '#8a8478',
] as const;

/** 螢光筆的常用色（黑色＝把字塗黑，像防雷遮罩） */
export const HIGHLIGHT_SWATCHES = [
  '#fff0a8',
  '#ffd6cc',
  '#d4f2d0',
  '#d6e6ff',
  '#eadcff',
  '#222222',
] as const;

const HEX6 = /^#[0-9a-f]{6}$/i;

/** 片段只留泡泡用得到的格式（粗體、斜體、刪除線、底線、顏色、螢光筆）；顏色只收 6 碼色碼 */
function bubbleRun(r: RichRun): RichRun {
  const out: RichRun = {
    text: r.text,
    bold: !!r.bold,
    color: HEX6.test(r.color) ? r.color.toLowerCase() : '',
  };
  if (r.italic) out.italic = true;
  if (r.strike) out.strike = true;
  if (r.underline) out.underline = true;
  if (r.highlight && HEX6.test(r.highlight)) out.highlight = r.highlight.toLowerCase();
  return out;
}

/** 有沒有任何格式（沒有的話就是純文字，不用存 rich） */
export const hasMarks = (doc: RichDoc): boolean =>
  doc.lines.some((l) =>
    l.runs.some((r) => r.bold || r.italic || r.strike || r.underline || !!r.color || !!r.highlight),
  );

/** 整理外來的內文格式：壞掉、和內文不一致、沒有任何格式時 undefined；字級、字型、段落屬性丟掉 */
export function normalizeRich(raw: unknown, text: string): RichDoc | undefined {
  if (raw === undefined || raw === null) return undefined;
  let doc: RichDoc;
  try {
    doc = validateDoc(raw, MAX_TEXT * 2, { full: true });
  } catch {
    return undefined;
  }
  const out = normalizeDoc({ lines: doc.lines.map((l) => ({ runs: l.runs.map(bubbleRun) })) });
  if (docText(out) !== text || !hasMarks(out)) return undefined;
  return out;
}

/** 這個泡泡的內文格式（沒有、或和內文不一致時 null） */
export const bubbleRich = (b: Pick<Bubble, 'text' | 'rich'>): RichDoc | null =>
  b.rich && docText(b.rich) === b.text ? b.rich : null;

/** 編輯區顯示的內容：有格式就是格式，沒有就是純文字（顏色空白＝泡泡的內文色） */
export const bubbleDoc = (b: Pick<Bubble, 'text' | 'rich'>): RichDoc =>
  bubbleRich(b) ?? plainDoc(b.text, '');

/** 編輯區的內容 → 內文與格式（超過字數上限的截掉；沒有格式時只有 text） */
export function richContent(doc: RichDoc): { text: string; rich?: RichDoc } {
  let d = normalizeDoc({ lines: doc.lines.map((l) => ({ runs: l.runs.map(bubbleRun) })) });
  let text = docText(d);
  const cps = Array.from(text);
  if (cps.length > MAX_TEXT) {
    text = cps.slice(0, MAX_TEXT).join('');
    d = normalizeDoc(sliceDoc(d, 0, text.length));
  }
  return hasMarks(d) ? { text, rich: d } : { text };
}

/** 單獨改過的項目：只留認得的、依 LOOK_KEYS 的順序、不重複 */
export const normalizeCustom = (list: readonly unknown[]): LookKey[] =>
  LOOK_KEYS.filter((k) => list.includes(k));

/** 整理整份資料（自動儲存、專案檔）；不是物件時回傳 null。第 1 版的資料在這裡補成第 2 版。 */
export function normalizeData(
  raw: unknown,
  defaults: (style: StyleId) => { colors: Palette; icon: IconId },
  fallbackBubbles: () => Bubble[],
): SbData | null {
  if (!isObj(raw)) return null;
  const b = BASE_SETTINGS;
  const used = new Set<string>();
  const list = Array.isArray(raw.bubbles)
    ? raw.bubbles.slice(0, MAX_BUBBLES).map((x) => normalizeBubble(x, defaults, used))
    : [];
  const bubbles = list.length ? list : fallbackBubbles();
  /* 兩側的預設：資料裡有就整理，沒有（第 1 版）就從泡泡推出來 */
  const derived = deriveSides(bubbles);
  const rs = isObj(raw.sides) ? raw.sides : null;
  const sides: Sides = {
    left: rs ? normalizeLook(rs.left, derived.left, defaults) : derived.left,
    center: rs ? normalizeLook(rs.center, derived.center, defaults) : derived.center,
    right: rs ? normalizeLook(rs.right, derived.right, defaults) : derived.right,
  };
  for (const x of bubbles) {
    if (!x.custom) x.custom = diffKeys(x, sides[x.align]);
  }
  return {
    presetId: typeof raw.presetId === 'string' ? raw.presetId.slice(0, 64) : null,
    bubbles,
    font: normalizeFont(raw.font),
    fontSize: clampRange('fontSize', raw.fontSize, b.fontSize),
    lineHeight: clampRange('lineHeight', raw.lineHeight, b.lineHeight),
    wrapWidth: clampRange('wrapWidth', raw.wrapWidth, b.wrapWidth),
    arrange: oneOf(ARRANGES, raw.arrange, b.arrange),
    columns: clampRange('columns', raw.columns, b.columns),
    gap: clampRange('gap', raw.gap, b.gap),
    indent: clampRange('indent', raw.indent, b.indent),
    shadow: typeof raw.shadow === 'boolean' ? raw.shadow : b.shadow,
    canvasMode: oneOf(CANVAS_MODES, raw.canvasMode, b.canvasMode),
    minHeight: clampRange('minHeight', raw.minHeight, b.minHeight),
    margin: clampRange('margin', raw.margin, b.margin),
    width: clampRange('width', raw.width, b.width),
    height: clampRange('height', raw.height, b.height),
    anchor: oneOf(ANCHOR_IDS, raw.anchor, b.anchor),
    enter: oneOf(ENTER_IDS, raw.enter, b.enter),
    enterDur: clampRange('enterDur', raw.enterDur, b.enterDur),
    idle: oneOf(IDLE_IDS, raw.idle, b.idle),
    textAnim: oneOf(TEXT_ANIM_IDS, raw.textAnim, b.textAnim),
    typeSpeed: clampRange('typeSpeed', raw.typeSpeed, b.typeSpeed),
    cursor: oneOf(CURSOR_IDS, raw.cursor, b.cursor),
    exit: oneOf(EXIT_IDS, raw.exit, b.exit),
    exitDur: clampRange('exitDur', raw.exitDur, b.exitDur),
    stagger: clampRange('stagger', raw.stagger, b.stagger),
    hold: clampRange('hold', raw.hold, b.hold),
    exitTogether: typeof raw.exitTogether === 'boolean' ? raw.exitTogether : b.exitTogether,
    order: oneOf(ORDER_IDS, raw.order, b.order),
    fps: clampRange('fps', raw.fps, b.fps),
    sides,
    card: normalizeCard(raw.card),
  };
}

/* ---------- 樣式項目的讀寫（兩側的預設 ↔ 泡泡） ---------- */

/** 有樣式的東西（泡泡或一側的預設） */
export type LookLike = Pick<Bubble, 'style' | 'colors' | 'icon'> & { fmt?: Fmt };

export const bubbleFmt = (b: { fmt?: Fmt }): Fmt => b.fmt ?? DEFAULT_FMT;
export const bubbleCustom = (b: { custom?: LookKey[] }): readonly LookKey[] => b.custom ?? [];

export function cloneFmt(f: Fmt): Fmt {
  return {
    ...f,
    font: f.font ? { ...f.font } : null,
    metaFont: f.metaFont ? { ...f.metaFont } : null,
  };
}

export function cloneLook(l: Look): Look {
  return { style: l.style, colors: { ...l.colors }, icon: l.icon, fmt: cloneFmt(l.fmt) };
}

/** 泡泡目前的樣式（一整組，複製一份） */
export const lookOf = (b: LookLike): Look =>
  cloneLook({ style: b.style, colors: b.colors, icon: b.icon, fmt: bubbleFmt(b) });

export function getLook(x: LookLike, k: LookKey): unknown {
  switch (k) {
    case 'style':
      return x.style;
    case 'icon':
      return x.icon;
    case 'fill':
    case 'border':
    case 'text':
    case 'accent':
      return x.colors[k];
    default:
      return bubbleFmt(x)[k];
  }
}

/** 設定一個樣式項目（x 是可以直接改的物件，例如 immer 的 draft） */
export function setLook(x: LookLike, k: LookKey, v: unknown): void {
  switch (k) {
    case 'style':
      x.style = v as StyleId;
      return;
    case 'icon':
      x.icon = v as IconId;
      return;
    case 'fill':
    case 'border':
    case 'text':
    case 'accent':
      x.colors = { ...x.colors, [k]: v as string };
      return;
    default: {
      if (!x.fmt) x.fmt = cloneFmt(DEFAULT_FMT);
      const val = v && typeof v === 'object' ? { ...(v as object) } : v;
      (x.fmt as unknown as Record<string, unknown>)[k] = val;
    }
  }
}

/** 兩個樣式值是否相同（色碼不分大小寫、字型比內容） */
export function sameLookValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if (a && b && typeof a === 'object' && typeof b === 'object')
    return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/** 和那一側的預設不同的項目 */
export const diffKeys = (x: LookLike, side: Look): LookKey[] =>
  LOOK_KEYS.filter((k) => !sameLookValue(getLook(x, k), getLook(side, k)));

/**
 * 從泡泡推出三側的預設（第 1 版的資料、套用範本時）：每一側取那一側的第一個泡泡；
 * 那一側沒有泡泡時取第一個泡泡（只有一種造型的內容，換位置時樣式不變）。
 */
export function deriveSides(bubbles: readonly (LookLike & { align: Align })[]): Sides {
  const pick = (a: Align): Look => {
    const b = bubbles.find((x) => x.align === a) ?? bubbles[0];
    return b ? lookOf(b) : defaultLook('messenger');
  };
  return { left: pick('left'), center: pick('center'), right: pick('right') };
}

/** 泡泡有沒有內容（標題、內文、按鈕都空白的不畫） */
export const hasContent = (b: Pick<Bubble, 'title' | 'text' | 'button'>): boolean =>
  b.title.trim() !== '' || b.text.trim() !== '' || b.button.trim() !== '';

/** 匯出的檔名主體：bubble_<毫秒時間戳> */
export const exportBaseName = (ts: number): string => `bubble_${ts}`;

/** 一個新的泡泡：用那一側的預設樣式 */
export function bubbleFromSide(
  look: Look,
  content: Pick<Bubble, 'text' | 'align'> & Partial<Pick<Bubble, 'title' | 'speaker' | 'time'>>,
): Bubble {
  const l = cloneLook(look);
  return {
    id: newBubbleId(),
    style: l.style,
    title: content.title ?? '',
    text: content.text,
    icon: l.icon,
    button: '',
    align: content.align,
    colors: l.colors,
    speaker: content.speaker ?? '',
    time: content.time ?? '',
    fmt: l.fmt,
    custom: [],
    dx: 0,
    dy: 0,
  };
}
