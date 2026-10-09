/**
 * 顏色：Discord 四種主題的預覽配色、經典 8 色、自訂色與效果的預設值、效果（彩虹、漸層、斑馬）的逐字配色。
 * 數值照原作（rebane2001／Discord Colored Text Generator，2026 年 10 月版）。
 */

/* ---------- Discord 主題（預覽用） ---------- */

export type ThemeId = 'light' | 'ash' | 'dark' | 'onyx';

export const THEME_IDS: readonly ThemeId[] = ['light', 'ash', 'dark', 'onyx'];

/** 經典 8 色的順序：黑、紅、綠、黃（棕）、藍、洋紅（粉紅）、青（藍綠）、白（淺灰）＝代碼 30～37／40～47 */
export type ClassicIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const CLASSIC_INDEXES: readonly ClassicIndex[] = [0, 1, 2, 3, 4, 5, 6, 7];

export interface DiscordTheme {
  /** 聊天畫面的底色 */
  base: string;
  /** 程式碼區塊的底色（半透明，疊在底色上） */
  code: string;
  /** 程式碼區塊的框線 */
  border: string;
  /** 程式碼區塊的字色 */
  text: string;
  /** 經典 8 色（索引同 ClassicIndex） */
  ansi: readonly string[];
  /** 淺色主題：選取範圍改用深色 */
  light: boolean;
}

const NEUTRAL_20 = 'hsl(230 4.286% 72.549%)';
const BLACK = 'hsl(0 0% 0%)';

/** Discord 的 HSL 色票（飽和度係數 1）：Ash（原作的預設、Discord 的 dark）、Light、Dark（darker）、Onyx（midnight） */
export const THEMES: Record<ThemeId, DiscordTheme> = {
  light: {
    base: 'hsl(0 0% 98.431%)',
    code: 'hsl(234.935 85.556% 64.706% / 0.0392156862745098)',
    border: 'hsl(240 4% 60.784% / 0.4)',
    text: 'hsl(232.5 6.897% 22.745%)',
    ansi: [
      BLACK,
      'hsl(0 74.869% 62.549%)',
      'hsl(142.041 46.226% 41.569%)',
      'hsl(36.875 100% 37.647%)',
      'hsl(212.514 80.995% 56.667%)',
      'hsl(315.375 74.766% 58.039%)',
      'hsl(184.049 100% 31.961%)',
      NEUTRAL_20,
    ],
    light: true,
  },
  ash: {
    base: 'hsl(231.429 6.542% 20.98%)',
    code: 'hsl(234.935 85.556% 64.706% / 0.0784313725490196)',
    border: 'hsl(240 4% 60.784% / 0.2)',
    text: 'hsl(0 0% 100%)',
    ansi: [
      BLACK,
      'hsl(0.863 78.531% 65.294%)',
      'hsl(141.064 40.517% 45.49%)',
      'hsl(37.573 100% 40.392%)',
      'hsl(212.695 81.463% 59.804%)',
      'hsl(315.349 89.583% 62.353%)',
      'hsl(183.976 95.402% 34.118%)',
      NEUTRAL_20,
    ],
    light: false,
  },
  dark: {
    base: 'hsl(240 7.143% 10.98%)',
    code: 'hsl(234.935 85.556% 64.706% / 0.0784313725490196)',
    border: 'hsl(240 4% 60.784% / 0.2)',
    text: 'hsl(240 3.846% 89.804%)',
    ansi: [
      BLACK,
      'hsl(358.421 69.725% 57.255%)',
      'hsl(146.316 67.857% 32.941%)',
      'hsl(36.201 100% 35.098%)',
      'hsl(211.176 80.315% 50.196%)',
      'hsl(315.6 64.103% 54.118%)',
      'hsl(184.832 100% 29.216%)',
      NEUTRAL_20,
    ],
    light: false,
  },
  onyx: {
    base: 'hsl(240 12.5% 3.137%)',
    code: 'hsl(234.935 85.556% 64.706% / 0.0784313725490196)',
    border: 'hsl(240 4% 60.784% / 0.23921568627450981)',
    text: 'hsl(240 4.545% 82.745%)',
    ansi: [
      BLACK,
      'hsl(355.636 64.706% 50%)',
      'hsl(151.406 100% 25.098%)',
      'hsl(35.273 100% 32.353%)',
      'hsl(209.151 100% 41.569%)',
      'hsl(315.672 55.372% 47.451%)',
      'hsl(184.889 100% 26.471%)',
      NEUTRAL_20,
    ],
    light: false,
  },
};

export const DEFAULT_THEME: ThemeId = 'ash';

/* ---------- 自訂色與效果的預設值 ---------- */

export const CUSTOM_COUNT = 8;

/** 自訂色的預設 8 色 */
export const DEFAULT_CUSTOM: readonly string[] = [
  '#000000',
  '#FFFFFF',
  '#DE4040',
  '#40DE40',
  '#4040DE',
  '#FFD800',
  '#F5A9B8',
  '#5BCEFA',
];

export const DEFAULT_GRADIENT: readonly [string, string] = ['#FD9855', '#D161A2'];
export const DEFAULT_ZEBRA: readonly [string, string] = ['#A35454', '#FFB2B2'];

/** 色碼整理成大寫 #RRGGBB；不是 #rgb／#rrggbb 時回傳 null */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(v))
    return `#${v
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`.toUpperCase();
  return null;
}

/* ---------- 效果 ---------- */

export type EffectId = 'rainbow' | 'gradient' | 'zebra';
export const EFFECT_IDS: readonly EffectId[] = ['rainbow', 'gradient', 'zebra'];

const hex2 = (v: number) => Math.floor(v).toString(16).padStart(2, '0');
const toHex = (rgb: readonly number[]) => `#${rgb.map(hex2).join('')}`.toUpperCase();

/** HSL（色相 0～360、飽和度與亮度 0～1）→ RGB 0～1 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

/**
 * 第 index 個字在 count 個字裡的位置（0～1）。原作只有一個字時是 0÷0（色碼變成無效的 NaN）；
 * 新版當作 0（第一個顏色）。見規格 5. D 項。
 */
const position = (index: number, count: number) => (count > 1 ? index / (count - 1) : 0);

/** 彩虹：色相從 0° 平均走到 360°（飽和度 100%、亮度 50%），各色版乘 255 後無條件捨去 */
export function rainbowColor(index: number, count: number): string {
  const t = position(index, count);
  return toHex(hslToRgb(t * 360, 1, 0.5).map((v) => v * 255));
}

/** 漸層：兩色逐色版直線內插，無條件捨去 */
export function gradientColor(from: string, to: string, index: number, count: number): string {
  const t = position(index, count);
  const a = [1, 3, 5].map((i) => Number.parseInt(from.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => Number.parseInt(to.slice(i, i + 2), 16));
  return toHex(a.map((v, i) => v * (1 - t) + b[i] * t));
}

/** 斑馬：兩色輪流 */
export function zebraColor(colors: readonly [string, string], index: number): string {
  return colors[index % 2];
}

/** 把文字切成一個一個字（字素：表情符號、組合字算一個字） */
export function splitGraphemes(value: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Seg) return Array.from(value);
  return Array.from(new Seg().segment(value), (s) => s.segment);
}

export interface EffectColors {
  gradient: readonly [string, string];
  zebra: readonly [string, string];
}

/** 效果套用在 count 個字時，每個字的顏色 */
export function effectColors(effect: EffectId, count: number, colors: EffectColors): string[] {
  return Array.from({ length: count }, (_, i) => {
    if (effect === 'rainbow') return rainbowColor(i, count);
    if (effect === 'gradient')
      return gradientColor(colors.gradient[0], colors.gradient[1], i, count);
    return zebraColor(colors.zebra, i);
  });
}
