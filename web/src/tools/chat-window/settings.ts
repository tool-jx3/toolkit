/**
 * 聊天視窗產生器的設定：型別、可調範圍、預設值、存檔與專案檔讀入時的補齊與修正。
 * 純邏輯（不依賴 React），單元測試直接 import。
 */
import { formatHex, parseColor } from '@/core/color';
import type { FontValue } from '@/core/fonts';
import { CSS_WEIGHT_CHOICES, findGoogleFont } from '@/core/fonts/catalog';

export type SizeMode = 'fill' | 'fit';
export type Anchor = 'bottom' | 'top';
export type Order = 'newest-bottom' | 'newest-top';
export type Texture = 'none' | 'paper' | 'grain' | 'scanlines';
export type TitleMode = 'none' | 'text' | 'tab' | 'text-tab';
export type TitleStyle = 'plain' | 'band' | 'underline' | 'tab' | 'lines';
export type Align = 'left' | 'center' | 'right';
export type BoxShape = 'card' | 'bubble' | 'none';
export type Accent = 'none' | 'character' | 'custom' | 'outcome';
export type AvatarShape = 'square' | 'rounded' | 'circle';
export type AvatarAlign = 'top' | 'center';
export type NameStyle = 'plain' | 'underline' | 'pill' | 'prefix';
export type NameColorMode = 'character' | 'custom';
export type TextEffect = 'soft' | 'stroke' | 'glow' | 'none';
export type ResultStyle = 'plain' | 'outline' | 'solid';
export type Enter = 'none' | 'fade' | 'up' | 'down' | 'left' | 'right' | 'pop' | 'blur';

export interface ChatSettings {
  /** 最後套用的範本 id（寫進 CSS 開頭說明）；沒有或無效時 null */
  templateId: string | null;

  /* ---- 不屬於外觀（套用範本時保留） ---- */
  width: number;
  height: number;
  room: string;
  /** 只在滑鼠移上時顯示分頁列（OBS 互動） */
  hoverTabs: boolean;
  fileName: string;

  /* ---- 要顯示的訊息 ---- */
  count: number;
  diceOnly: boolean;
  hideSystem: boolean;
  order: Order;
  gap: number;

  /* ---- 視窗 ---- */
  sizeMode: SizeMode;
  anchor: Anchor;
  margin: number;
  padding: number;
  bg: string;
  texture: Texture;
  borderWidth: number;
  borderColor: string;
  radius: number;
  shadow: number;
  brackets: boolean;
  bracketColor: string;

  /* ---- 標題 ---- */
  titleMode: TitleMode;
  titleText: string;
  titleStyle: TitleStyle;
  titleFont: FontValue;
  titleSize: number;
  titleColor: string;
  titleLineColor: string;
  titleBandColor: string;
  titleAlign: Align;
  titleGap: number;
  titleLock: boolean;

  /* ---- 秘匿分頁的參加者頭像 ---- */
  participants: boolean;
  participantPrefix: string;
  participantPrefixSize: number;
  participantSize: number;
  participantGap: number;
  participantRing: number;
  participantRingColor: string;

  /* ---- 方框 ---- */
  boxShape: BoxShape;
  boxBg: string;
  boxBorderWidth: number;
  boxBorderColor: string;
  boxRadius: number;
  boxShadow: number;
  boxPadX: number;
  boxPadY: number;
  accent: Accent;
  accentWidth: number;
  accentColor: string;
  outcomeGlow: boolean;
  divider: boolean;
  dividerColor: string;

  /* ---- 角色頭像 ---- */
  avatar: boolean;
  avatarSize: number;
  avatarShape: AvatarShape;
  avatarBorder: number;
  avatarBorderColor: string;
  avatarGap: number;
  avatarAlign: AvatarAlign;

  /* ---- 名稱 ---- */
  name: boolean;
  nameStyle: NameStyle;
  nameFont: FontValue;
  nameSize: number;
  nameColorMode: NameColorMode;
  nameColor: string;
  nameGap: number;
  time: boolean;
  timeColor: string;

  /* ---- 內文 ---- */
  bodyFont: FontValue;
  bodySize: number;
  bodyColor: string;
  lineHeight: number;
  letterSpacing: number;
  effect: TextEffect;
  effectColor: string;
  effectWidth: number;
  clampLines: number;

  /* ---- 擲骰結果 ---- */
  resultFont: FontValue;
  resultSize: number;
  resultStyle: ResultStyle;
  resultBreak: boolean;
  successColor: string;
  failureColor: string;
  otherColor: string;
  resultGlow: boolean;
  resultFlash: boolean;

  /* ---- 動態 ---- */
  enter: Enter;
  enterDuration: number;
  scroll: boolean;
  scrollDelay: number;
  scrollDuration: number;
  fade: boolean;
  fadeStay: number;
  fadeDuration: number;
}

export type NumberKey = {
  [K in keyof ChatSettings]: ChatSettings[K] extends number ? K : never;
}[keyof ChatSettings];

/** 數值設定的範圍：[最小, 最大, 間隔] */
export const RANGES: Readonly<Record<NumberKey, readonly [number, number, number]>> = {
  width: [120, 3840, 1],
  height: [80, 2160, 1],
  count: [1, 30, 1],
  gap: [0, 30, 1],
  margin: [0, 60, 1],
  padding: [0, 40, 1],
  borderWidth: [0, 8, 1],
  radius: [0, 40, 1],
  shadow: [0, 100, 5],
  titleSize: [10, 40, 1],
  titleGap: [0, 30, 1],
  participantPrefixSize: [8, 28, 1],
  participantSize: [14, 56, 1],
  participantGap: [-20, 16, 1],
  participantRing: [0, 4, 1],
  boxBorderWidth: [0, 6, 1],
  boxRadius: [0, 30, 1],
  boxShadow: [0, 100, 5],
  boxPadX: [0, 30, 1],
  boxPadY: [0, 30, 1],
  accentWidth: [1, 10, 1],
  avatarSize: [16, 120, 1],
  avatarBorder: [0, 6, 1],
  avatarGap: [0, 30, 1],
  nameSize: [8, 40, 1],
  nameGap: [0, 20, 1],
  bodySize: [8, 48, 1],
  lineHeight: [1, 2.4, 0.05],
  letterSpacing: [0, 0.3, 0.01],
  effectWidth: [1, 5, 0.5],
  clampLines: [0, 10, 1],
  resultSize: [8, 64, 1],
  enterDuration: [0.1, 2, 0.05],
  scrollDelay: [0, 10, 0.5],
  scrollDuration: [5, 120, 1],
  fadeStay: [2, 60, 1],
  fadeDuration: [0.2, 3, 0.1],
};

/** 列舉型設定的可用值 */
export const ENUMS = {
  order: ['newest-bottom', 'newest-top'],
  sizeMode: ['fill', 'fit'],
  anchor: ['bottom', 'top'],
  texture: ['none', 'paper', 'grain', 'scanlines'],
  titleMode: ['none', 'text', 'tab', 'text-tab'],
  titleStyle: ['plain', 'band', 'underline', 'tab', 'lines'],
  titleAlign: ['left', 'center', 'right'],
  boxShape: ['card', 'bubble', 'none'],
  accent: ['none', 'character', 'custom', 'outcome'],
  avatarShape: ['square', 'rounded', 'circle'],
  avatarAlign: ['top', 'center'],
  nameStyle: ['plain', 'underline', 'pill', 'prefix'],
  nameColorMode: ['character', 'custom'],
  effect: ['soft', 'stroke', 'glow', 'none'],
  resultStyle: ['plain', 'outline', 'solid'],
  enter: ['none', 'fade', 'up', 'down', 'left', 'right', 'pop', 'blur'],
} as const satisfies Partial<Record<keyof ChatSettings, readonly string[]>>;

/** 可以調不透明度的顏色（存成 #rrggbbaa）；其他顏色一律不透明 */
export const ALPHA_COLORS = [
  'bg',
  'borderColor',
  'bracketColor',
  'titleBandColor',
  'participantRingColor',
  'boxBg',
  'boxBorderColor',
  'dividerColor',
  'avatarBorderColor',
  'timeColor',
  'effectColor',
] as const satisfies readonly (keyof ChatSettings)[];

export const SOLID_COLORS = [
  'titleColor',
  'titleLineColor',
  'accentColor',
  'nameColor',
  'bodyColor',
  'successColor',
  'failureColor',
  'otherColor',
] as const satisfies readonly (keyof ChatSettings)[];

export const FONT_KEYS = ['titleFont', 'nameFont', 'bodyFont', 'resultFont'] as const;

export const TEXT_KEYS = ['titleText', 'participantPrefix', 'room', 'fileName'] as const;

export const BOOL_KEYS = [
  'hoverTabs',
  'diceOnly',
  'hideSystem',
  'brackets',
  'titleLock',
  'participants',
  'outcomeGlow',
  'divider',
  'avatar',
  'name',
  'time',
  'resultBreak',
  'resultGlow',
  'resultFlash',
  'scroll',
  'fade',
] as const satisfies readonly (keyof ChatSettings)[];

/** 來源大小的預設（空白或 0 時回到這裡） */
export const DEFAULT_SOURCE = { width: 480, height: 460 } as const;
export const DEFAULT_FILE_NAME = 'chatwindow';

/** 四個常用尺寸 */
export const SIZE_PRESETS = [
  { width: 480, height: 400 },
  { width: 420, height: 720 },
  { width: 640, height: 240 },
  { width: 560, height: 180 },
] as const;

/** 套用範本時保留的欄位（不屬於外觀） */
export const NON_APPEARANCE_KEYS = ['width', 'height', 'room', 'hoverTabs', 'fileName'] as const;

const font = (family: string, weight: number): FontValue => ({ source: 'google', family, weight });

/**
 * 「基礎外觀」：範本只寫跟這裡不同的部分。全部重來時是「基礎外觀＋第 1 個範本」。
 */
export const BASE_SETTINGS: ChatSettings = {
  templateId: null,
  width: DEFAULT_SOURCE.width,
  height: DEFAULT_SOURCE.height,
  room: '',
  hoverTabs: true,
  fileName: DEFAULT_FILE_NAME,

  count: 6,
  diceOnly: false,
  hideSystem: false,
  order: 'newest-bottom',
  gap: 6,

  sizeMode: 'fill',
  anchor: 'bottom',
  margin: 10,
  padding: 12,
  bg: '#14161cb8',
  texture: 'none',
  borderWidth: 0,
  borderColor: '#ffffff40',
  radius: 12,
  shadow: 30,
  brackets: false,
  bracketColor: '#ffffffcc',

  titleMode: 'none',
  titleText: '聊天',
  titleStyle: 'plain',
  titleFont: font('Noto Sans TC', 700),
  titleSize: 16,
  titleColor: '#ffffff',
  titleLineColor: '#e8b04a',
  titleBandColor: '#00000066',
  titleAlign: 'left',
  titleGap: 8,
  titleLock: true,

  participants: false,
  participantPrefix: '',
  participantPrefixSize: 13,
  participantSize: 26,
  participantGap: -6,
  participantRing: 2,
  participantRingColor: '#14161cff',

  boxShape: 'card',
  boxBg: '#ffffff12',
  boxBorderWidth: 0,
  boxBorderColor: '#ffffff33',
  boxRadius: 8,
  boxShadow: 0,
  boxPadX: 10,
  boxPadY: 7,
  accent: 'none',
  accentWidth: 3,
  accentColor: '#e8b04a',
  outcomeGlow: false,
  divider: false,
  dividerColor: '#ffffff33',

  avatar: true,
  avatarSize: 40,
  avatarShape: 'rounded',
  avatarBorder: 0,
  avatarBorderColor: '#ffffffcc',
  avatarGap: 10,
  avatarAlign: 'top',

  name: true,
  nameStyle: 'plain',
  nameFont: font('Noto Sans TC', 700),
  nameSize: 14,
  nameColorMode: 'character',
  nameColor: '#ffffff',
  nameGap: 2,
  time: false,
  timeColor: '#ffffff80',

  bodyFont: font('Noto Sans TC', 400),
  bodySize: 15,
  bodyColor: '#f2f2f2',
  lineHeight: 1.5,
  letterSpacing: 0.02,
  effect: 'soft',
  effectColor: '#000000b3',
  effectWidth: 2,
  clampLines: 0,

  resultFont: font('Noto Sans TC', 700),
  resultSize: 15,
  resultStyle: 'plain',
  resultBreak: false,
  successColor: '#4fb3ff',
  failureColor: '#ff5c7a',
  otherColor: '#d0d0d0',
  resultGlow: false,
  resultFlash: false,

  enter: 'up',
  enterDuration: 0.35,
  scroll: false,
  scrollDelay: 2,
  scrollDuration: 20,
  fade: false,
  fadeStay: 10,
  fadeDuration: 0.8,
};

/* ---------- 修正 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const decimals = (step: number) => {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
};

/** 數值：轉成數字、夾在範圍內、對齊間隔的小數位數；不是數字時用 fallback */
export function clampSetting(key: NumberKey, value: unknown, fallback: number): number {
  const [min, max, step] = RANGES[key];
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(max, Math.max(min, n));
  return Number(c.toFixed(decimals(step)));
}

/**
 * 來源寬高欄的修正（離開欄位時）：四捨五入成整數、夾在範圍內；空白、無效或 0 回到預設（480／460），
 * 負數夾到下限。
 */
export function normalizeSourceSize(axis: 'width' | 'height', raw: string | number): number {
  const s = typeof raw === 'number' ? String(raw) : String(raw ?? '').trim();
  const n = s === '' ? NaN : Number(s);
  if (!Number.isFinite(n) || Math.round(n) === 0) return DEFAULT_SOURCE[axis];
  const [min, max] = RANGES[axis];
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeColor(value: unknown, fallback: string, alpha: boolean): string {
  if (typeof value !== 'string') return fallback;
  const c = parseColor(value.trim());
  if (!c) return fallback;
  return formatHex(alpha ? c : { ...c, a: 1 }, alpha);
}

function normalizeFont(value: unknown, fallback: FontValue): FontValue {
  if (!isObj(value)) return { ...fallback };
  const source = value.source === 'local' ? 'local' : value.source === 'google' ? 'google' : null;
  const family = typeof value.family === 'string' ? value.family : null;
  if (!source || family === null) return { ...fallback };
  if (source === 'google' && !findGoogleFont(family)) return { ...fallback };
  const w = Number(value.weight);
  const weight = CSS_WEIGHT_CHOICES.includes(w) ? w : (fallback.weight ?? 400);
  return {
    source,
    family: source === 'local' ? family.replace(/\s+/g, ' ').trim() : family,
    weight,
  };
}

/**
 * 自動存檔、專案檔讀入的資料 → 完整且合法的設定：缺的欄位用預設、型別不符用預設、範圍外夾回、
 * 未知的範本 id 當作沒有範本。fallback 是補齊用的預設（通常是開頁的初始狀態）。
 */
export function normalizeSettings(
  raw: unknown,
  fallback: ChatSettings = BASE_SETTINGS,
  isTemplateId: (id: string) => boolean = () => true,
): ChatSettings {
  const src = isObj(raw) ? raw : {};
  const out: ChatSettings = { ...fallback };
  const o = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(RANGES) as NumberKey[]) {
    out[key] = clampSetting(key, src[key], fallback[key]);
  }
  /* 來源寬高：0 也當作無效 */
  for (const axis of ['width', 'height'] as const) {
    if (src[axis] !== undefined) {
      const v = Number(src[axis]);
      out[axis] =
        Number.isFinite(v) && Math.round(v) !== 0 ? normalizeSourceSize(axis, v) : fallback[axis];
    }
  }
  for (const [key, values] of Object.entries(ENUMS)) {
    const v = src[key];
    if (typeof v === 'string' && (values as readonly string[]).includes(v)) o[key] = v;
  }
  for (const key of BOOL_KEYS) if (typeof src[key] === 'boolean') o[key] = src[key];
  for (const key of TEXT_KEYS) if (typeof src[key] === 'string') o[key] = src[key];
  for (const key of ALPHA_COLORS) o[key] = normalizeColor(src[key], fallback[key], true);
  for (const key of SOLID_COLORS) o[key] = normalizeColor(src[key], fallback[key], false);
  for (const key of FONT_KEYS) out[key] = normalizeFont(src[key], fallback[key]);
  const tid = src.templateId;
  out.templateId =
    'templateId' in src
      ? typeof tid === 'string' && isTemplateId(tid)
        ? tid
        : null
      : fallback.templateId;
  return out;
}

/* ---------- 衍生值 ---------- */

/** 長訊息慢慢捲動實際生效（開啟且則數 1） */
export const scrollActive = (s: Pick<ChatSettings, 'scroll' | 'count'>): boolean =>
  s.scroll && s.count === 1;

/** 名稱是「名稱：」前綴且有顯示 */
export const namePrefixActive = (s: Pick<ChatSettings, 'name' | 'nameStyle'>): boolean =>
  s.name && s.nameStyle === 'prefix';

/** 標題含分頁名稱 */
export const titleHasTab = (m: TitleMode): boolean => m === 'tab' || m === 'text-tab';
/** 標題含自訂文字 */
export const titleHasText = (m: TitleMode): boolean => m === 'text' || m === 'text-tab';

/** 用到的字型（決定 Google Fonts 的載入與電腦字型提醒） */
export function usedFonts(s: ChatSettings): FontValue[] {
  const out: FontValue[] = [s.bodyFont, s.resultFont];
  if (s.name) out.push(s.nameFont);
  if (s.titleMode !== 'none' || (s.participants && s.participantPrefix.trim()))
    out.push(s.titleFont);
  return out;
}

/** 任何一個字型選了電腦字型 */
export const anyLocalFont = (s: ChatSettings): boolean =>
  FONT_KEYS.some((k) => s[k].source !== 'google');

/**
 * 下載檔名的主幹：Windows 不能用的字元（\ / : * ? " < > |）換成「_」、去掉前後空白；空字串時用 chatwindow。
 */
export function fileStem(name: string): string {
  const s = String(name ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return s || DEFAULT_FILE_NAME;
}

/** 專案檔名：<主幹>.chatwindow.json */
export const projectFileName = (name: string): string => `${fileStem(name)}.chatwindow.json`;
