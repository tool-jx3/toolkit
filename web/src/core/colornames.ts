/**
 * 顏色的色系（color-palette 併入色票櫃時新增，2026-10）。
 *
 * - `colorFamily(hex)`：色系（紅、橙、黃、綠、藍、紫、粉紅、棕、黑、灰、白）。依 HSV 分界；分界值參考
 *   saturn97v/Color-shelf 的自動分類（只參考數值）。
 *
 * ```ts
 * colorFamily('#8a5a3c');             // 'brown'
 * ```
 */
import { parseColor, rgbToHsv } from './color';

/* ---------- 色系 ---------- */

export type ColorFamily =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'black'
  | 'gray'
  | 'white';

/** 色系的順序（排序用：紅 → 橙 → … → 白） */
export const COLOR_FAMILIES: readonly ColorFamily[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'brown',
  'black',
  'gray',
  'white',
];

export const COLOR_FAMILY_LABELS: Readonly<Record<ColorFamily, string>> = {
  red: '紅',
  orange: '橙',
  yellow: '黃',
  green: '綠',
  blue: '藍',
  purple: '紫',
  pink: '粉紅',
  brown: '棕',
  black: '黑',
  gray: '灰',
  white: '白',
};

/** 色系的代表色（標籤旁的小圓點用；本站自選） */
export const COLOR_FAMILY_SWATCHES: Readonly<Record<ColorFamily, string>> = {
  red: '#d94040',
  orange: '#ef7d2d',
  yellow: '#f2c230',
  green: '#3a9a5c',
  blue: '#3f86e0',
  purple: '#8a5cc2',
  pink: '#ee7fb0',
  brown: '#8a5a3c',
  black: '#1d1e22',
  gray: '#9a9a96',
  white: '#ffffff',
};

/**
 * 顏色 → 色系（HSV 分界）：很暗是黑；飽和度很低（或低而暗）是白／黑／灰；暗或混濁的橙紅是棕；
 * 色相 345°～12° 是紅（淡而亮的是粉紅），之後依色相分橙、黃、綠、藍、紫、粉紅。看不懂的顏色當作灰。
 */
export function colorFamily(hex: string): ColorFamily {
  const c = parseColor(hex);
  if (!c) return 'gray';
  const { h, s, v } = rgbToHsv(c);
  if (v < 0.16) return 'black';
  if (s < 0.13 || (s < 0.22 && v < 0.32)) {
    if (v > 0.86) return 'white';
    if (v < 0.26) return 'black';
    return 'gray';
  }
  if (h >= 8 && h < 45 && (v < 0.62 || (s < 0.5 && v < 0.8))) return 'brown';
  if (h >= 345 || h < 12) return s < 0.55 && v > 0.7 ? 'pink' : 'red';
  if (h < 40) return 'orange';
  if (h < 68) return 'yellow';
  if (h < 165) return 'green';
  if (h < 262) return 'blue';
  if (h < 295) return 'purple';
  return 'pink';
}
