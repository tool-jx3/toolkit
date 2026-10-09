/**
 * 動態對話泡泡產生器的資料：型別、預設值、範圍與整理（規格 docs/refactor/specs/speech-bubble.md）。
 * 這個檔案不依賴 React 與瀏覽器（單元測試在 Node 跑）。
 */
import { DEFAULT_FONT, type FontValue } from '@/core/fonts';
import type { Anchor } from '@/core/typeset/fit';

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
}

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

export const CANVAS_MODES = ['auto', 'fixed'] as const;
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
  enterDur: { min: 0.1, max: 2, step: 0.05 },
  exitDur: { min: 0.1, max: 2, step: 0.05 },
  typeSpeed: { min: 2, max: 60, step: 1 },
  stagger: { min: 0, max: 3, step: 0.05 },
  hold: { min: 0, max: 10, step: 0.1 },
  fps: { min: 4, max: 60, step: 1 },
} as const;

export const MAX_BUBBLES = 12;
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
};

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

/**
 * 整理一個泡泡：缺的欄位補預設；造型不認得時用訊息泡泡；顏色不是色碼時用造型的預設色。
 * `defaults(style)` 給造型的預設配色與圖示（styles.ts，避免這裡依賴繪圖程式）。
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
  return {
    id,
    style,
    title: singleLine(str(r.title, MAX_TITLE)),
    text: str(r.text, MAX_TEXT),
    icon: oneOf(ICON_IDS, r.icon, d.icon),
    button: singleLine(str(r.button, MAX_BUTTON)),
    align: oneOf(ALIGNS, r.align, 'left'),
    colors: normalizePalette(r.colors, d.colors),
  };
}

/** 整理整份資料（自動儲存、專案檔）；不是物件時回傳 null */
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
  return {
    presetId: typeof raw.presetId === 'string' ? raw.presetId.slice(0, 64) : null,
    bubbles: list.length ? list : fallbackBubbles(),
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
  };
}

/** 泡泡有沒有內容（標題、內文、按鈕都空白的不畫） */
export const hasContent = (b: Pick<Bubble, 'title' | 'text' | 'button'>): boolean =>
  b.title.trim() !== '' || b.text.trim() !== '' || b.button.trim() !== '';

/** 匯出的檔名主體：bubble_<毫秒時間戳> */
export const exportBaseName = (ts: number): string => `bubble_${ts}`;
