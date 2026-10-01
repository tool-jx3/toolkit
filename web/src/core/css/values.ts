/**
 * CSS 數值與顏色的格式化：px、百分比、時間、顏色＋不透明度、混色、依底色選字色。
 * 數字一律去掉多餘的 0、不輸出「-0」與科學記號。
 */
import { formatHex, parseColor, type Rgba } from '../color';

/** 數字 → 字串（最多 digits 位小數，去掉多餘的 0） */
export function num(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(digits);
  const t = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  return t === '-0' ? '0' : t;
}

/** px（保留最多 2 位小數）：px(1.5) → '1.5px'、px(0) → '0px'（在 calc() 裡也有效） */
export const px = (n: number, digits = 2): string => `${num(n, digits)}px`;
/** px 取整數：pxInt(12.6) → '13px' */
export const pxInt = (n: number): string => `${num(Math.round(n), 0)}px`;
/** 百分比：pct(83.33333) → '83.333%' */
export const pct = (n: number, digits = 3): string => `${num(n, digits)}%`;
export const em = (n: number, digits = 3): string => `${num(n, digits)}em`;
export const deg = (n: number, digits = 2): string => `${num(n, digits)}deg`;
/** 毫秒 → CSS 時間（整數毫秒用 ms，否則秒）：ms(250) → '250ms' */
export const ms = (n: number): string => `${num(Math.max(0, n), 0)}ms`;
/** 秒：sec(1.1) → '1.1s' */
export const sec = (n: number, digits = 3): string => `${num(Math.max(0, n), digits)}s`;

/** 夾在範圍內 */
export const clampNum = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

/* ---------- 顏色 ---------- */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_FN = /^rgba?\(\s*[-+0-9.%\s,/]+\)$/i;

/**
 * 是不是可以安全寫進 CSS 的顏色：「#」加 3、4、6、8 位十六進位，或 rgb()／rgba() 寫法。
 * （舊存檔或手打的值不合格時要改用預設色，避免 CSS 壞掉）
 */
export function isCssColor(value: string): boolean {
  const s = String(value ?? '').trim();
  return HEX.test(s) || (RGB_FN.test(s) && parseColor(s) !== null);
}

/** 合格就原樣（去掉前後空白）回傳，否則用 fallback（預設白色） */
export function safeCssColor(value: string, fallback = '#ffffff'): string {
  const s = String(value ?? '').trim();
  return isCssColor(s) ? s : fallback;
}

/**
 * 顏色＋不透明度（0～1，會乘上顏色本身的不透明度）→ CSS 顏色。
 * 完全不透明時輸出 #rrggbb，否則 rgba(r, g, b, a)。看不懂的顏色當作黑色。
 */
export function rgba(color: string, alpha = 1): string {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const a = clampNum(c.a * alpha, 0, 1);
  if (a >= 1) return formatHex({ ...c, a: 1 }, false);
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${num(a, 3)})`;
}

/** 顏色＋不透明度百分比（0～100）：withOpacity('#000000', 45) → 'rgba(0, 0, 0, 0.45)' */
export const withOpacity = (color: string, percent: number): string => rgba(color, percent / 100);

/** 兩色混合（t＝0 是 a、1 是 b，含不透明度），回傳 #rrggbb 或 #rrggbbaa */
export function mixColors(a: string, b: string, t: number): string {
  const p = parseColor(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const q = parseColor(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  const k = clampNum(t, 0, 1);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  const out: Rgba = { r: lerp(p.r, q.r), g: lerp(p.g, q.g), b: lerp(p.b, q.b), a: lerp(p.a, q.a) };
  return formatHex(out, out.a < 1);
}

/** 混白：lighten('#ff6040', 0.4) → 頂端的光澤色 */
export const lighten = (color: string, t: number): string => mixColors(color, '#ffffff', t);
/** 混黑：darken('#ff0000', 0.45) → 危急色的暗部 */
export const darken = (color: string, t: number): string => mixColors(color, '#000000', t);

/**
 * 依底色亮度選字色：(299R＋587G＋114B) ÷ 1000 大於門檻（預設 150）用深色（#15161a），否則白色。
 * 擲骰結果的色帶、頁籤狀標題用。
 */
export function yiqTextColor(
  background: string,
  { dark = '#15161a', light = '#ffffff', threshold = 150 } = {},
): string {
  const c = parseColor(background);
  if (!c) return light;
  return (299 * c.r + 587 * c.g + 114 * c.b) / 1000 > threshold ? dark : light;
}
