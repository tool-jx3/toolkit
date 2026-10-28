/**
 * 顏色的名字（繁中）與色系（color-palette 併入色票櫃、配色卡時新增，2026-10）。
 *
 * - `COLOR_NAMES`：本站自己編的繁中色名表（113 個常用的顏色詞）。**來源與做法**：名字是本站挑的常用中文顏色詞；
 *   每個名字的顏色由本站直接在 OKLCH 色彩空間指定（明度 L 取整數百分比、色度 C 取到小數兩位、色相 h 取 5° 的倍數），
 *   載入時換算成 sRGB 的 HEX（`oklchToOklab` → `oklabToRgb`）。沒有參考或比對任何其他色名表的色碼；
 *   要增修時直接改下面的 OKLCH 數值（單元測試檢查：名字不重複、都在 sRGB 色域內、每個顏色最接近的名字是自己）。
 * - `colorName(hex, used?)`：最接近的色名（Oklab 距離）；給 `used` 時跳過已經用過的名字（同一張圖上不重複），
 *   全部用過時才回到最接近的那個。
 * - `colorFamily(hex)`：色系（紅、橙、黃、綠、藍、紫、粉紅、棕、黑、灰、白）。依 HSV 分界；分界值參考
 *   saturn97v/Color-shelf 的自動分類（只參考數值）。
 *
 * ```ts
 * colorName('#ea6c5a');               // '珊瑚紅'
 * const used = new Set<string>();
 * colors.map((c) => colorName(c, used)); // 同一組裡不重複
 * colorFamily('#8a5a3c');             // 'brown'
 * ```
 */
import {
  formatHex,
  type Oklab,
  oklabDistance,
  oklabToRgb,
  oklchToOklab,
  parseColor,
  rgbToHsv,
  rgbToOklab,
} from './color';

export interface NamedColor {
  name: string;
  /** #rrggbb（由 OKLCH 換算） */
  hex: string;
  /** 本站指定的 OKLCH：L（0～1）、C、h（度） */
  oklch: readonly [number, number, number];
}

/** [名字, L（%）, C, h（度）]：本站直接在 OKLCH 指定的顏色（依色系排列；名字不重複） */
const OKLCH_TABLE: readonly (readonly [string, number, number, number])[] = [
  /* 白、灰、黑 */
  ['雪白', 98, 0, 0],
  ['珍珠白', 95, 0.01, 80],
  ['象牙白', 95, 0.03, 95],
  ['米白', 92, 0.02, 85],
  ['亞麻', 89, 0.03, 80],
  ['霧灰', 89, 0.01, 230],
  ['淺灰', 82, 0, 0],
  ['銀灰', 76, 0.01, 240],
  ['鴿灰', 70, 0.01, 80],
  ['灰色', 63, 0, 0],
  ['暖灰', 68, 0.02, 70],
  ['灰褐', 58, 0.03, 60],
  ['石板灰', 55, 0.02, 250],
  ['鐵灰', 45, 0.01, 250],
  ['炭灰', 35, 0.01, 260],
  ['墨黑', 25, 0.01, 270],
  ['漆黑', 17, 0, 0],
  /* 粉、紅 */
  ['櫻花粉', 90, 0.04, 355],
  ['淺粉紅', 85, 0.06, 0],
  ['蜜桃粉', 86, 0.07, 40],
  ['粉紅', 77, 0.12, 355],
  ['桃紅', 65, 0.18, 0],
  ['玫瑰粉', 70, 0.09, 5],
  ['乾燥玫瑰', 64, 0.06, 10],
  ['藕粉', 76, 0.04, 350],
  ['鮭魚粉', 76, 0.11, 35],
  ['珊瑚紅', 68, 0.16, 30],
  ['西瓜紅', 64, 0.19, 15],
  ['洋紅', 55, 0.22, 355],
  ['玫瑰紅', 52, 0.19, 15],
  ['朱紅', 60, 0.2, 35],
  ['正紅', 55, 0.21, 27],
  ['櫻桃紅', 48, 0.18, 15],
  ['胭脂紅', 43, 0.15, 5],
  ['磚紅', 50, 0.12, 35],
  ['酒紅', 36, 0.12, 10],
  ['深酒紅', 28, 0.08, 10],
  /* 膚、橙、棕 */
  ['淺膚色', 93, 0.03, 60],
  ['膚色', 88, 0.05, 60],
  ['小麥膚', 75, 0.08, 65],
  ['杏色', 85, 0.08, 70],
  ['蜜桃橘', 80, 0.11, 55],
  ['橙色', 74, 0.16, 60],
  ['南瓜橘', 69, 0.16, 50],
  ['柿子橘', 64, 0.17, 42],
  ['琥珀', 72, 0.13, 75],
  ['赭石', 61, 0.11, 70],
  ['焦糖', 58, 0.11, 60],
  ['肉桂', 52, 0.1, 50],
  ['紅棕', 43, 0.11, 40],
  ['栗色', 38, 0.08, 35],
  ['巧克力', 33, 0.05, 50],
  ['深咖啡', 26, 0.03, 50],
  ['咖啡', 42, 0.05, 55],
  ['棕色', 50, 0.07, 60],
  ['駝色', 68, 0.07, 75],
  ['卡其', 72, 0.05, 95],
  ['沙色', 83, 0.05, 85],
  ['奶茶', 76, 0.05, 70],
  /* 黃、金 */
  ['奶油黃', 95, 0.07, 100],
  ['淡黃', 93, 0.1, 105],
  ['檸檬黃', 90, 0.17, 105],
  ['鵝黃', 88, 0.14, 95],
  ['金黃', 82, 0.15, 85],
  ['芥末黃', 72, 0.13, 95],
  ['金色', 75, 0.12, 85],
  ['蜂蜜', 76, 0.13, 75],
  ['橄欖', 55, 0.09, 110],
  /* 綠 */
  ['薄荷綠', 88, 0.07, 165],
  ['淺綠', 84, 0.1, 145],
  ['嫩綠', 83, 0.15, 130],
  ['草綠', 68, 0.15, 135],
  ['蘋果綠', 78, 0.18, 140],
  ['翠綠', 60, 0.15, 150],
  ['祖母綠', 56, 0.11, 165],
  ['森林綠', 42, 0.1, 150],
  ['墨綠', 33, 0.06, 160],
  ['抹茶綠', 70, 0.09, 120],
  ['苔綠', 52, 0.08, 120],
  ['軍綠', 45, 0.06, 115],
  ['灰綠', 65, 0.04, 150],
  ['青瓷', 75, 0.06, 175],
  ['松石綠', 70, 0.11, 185],
  ['孔雀綠', 50, 0.08, 200],
  /* 藍、青 */
  ['冰藍', 93, 0.03, 220],
  ['天空藍', 80, 0.08, 230],
  ['淺藍', 85, 0.05, 240],
  ['水藍', 75, 0.1, 220],
  ['湖水藍', 65, 0.11, 215],
  ['青色', 72, 0.12, 200],
  ['蔚藍', 62, 0.14, 245],
  ['寶藍', 48, 0.18, 262],
  ['鈷藍', 50, 0.15, 258],
  ['藍色', 55, 0.17, 255],
  ['靛藍', 38, 0.12, 270],
  ['海軍藍', 32, 0.08, 260],
  ['午夜藍', 24, 0.06, 265],
  ['霧藍', 70, 0.05, 245],
  ['灰藍', 58, 0.05, 245],
  ['牛仔藍', 52, 0.08, 250],
  ['長春花', 68, 0.1, 280],
  /* 紫 */
  ['薰衣草', 82, 0.06, 300],
  ['淡紫', 76, 0.08, 305],
  ['丁香紫', 70, 0.1, 315],
  ['紫藤', 64, 0.11, 300],
  ['紫色', 52, 0.17, 305],
  ['葡萄紫', 40, 0.14, 315],
  ['茄紫', 30, 0.09, 320],
  ['深紫', 33, 0.12, 295],
  ['紫羅蘭', 55, 0.2, 295],
  ['梅紫', 45, 0.12, 345],
  ['灰紫', 60, 0.05, 310],
  ['青銅', 55, 0.08, 80],
];

/** 本站自編的繁中色名表（HEX 由上面的 OKLCH 換算） */
export const COLOR_NAMES: readonly NamedColor[] = OKLCH_TABLE.map(([name, L, C, h]) => ({
  name,
  hex: formatHex(oklabToRgb(oklchToOklab(L / 100, C, h)), false),
  oklch: [L / 100, C, h] as const,
}));

let labCache: { name: string; lab: Oklab }[] | null = null;
const table = () => {
  if (!labCache) {
    labCache = COLOR_NAMES.map((c) => ({
      name: c.name,
      lab: rgbToOklab(parseColor(c.hex) ?? { r: 0, g: 0, b: 0, a: 1 }),
    }));
  }
  return labCache;
};

/**
 * 最接近的色名（Oklab 距離）。`used` 有給時跳過裡面的名字、選到的名字加進去（同一組顏色不重複）；
 * 表裡的名字全部用過時回傳最接近的那個（可能重複）。看不懂的顏色回傳空字串。
 */
export function colorName(hex: string, used?: Set<string>): string {
  const c = parseColor(hex);
  if (!c) return '';
  const lab = rgbToOklab(c);
  const ranked = table()
    .map((t) => ({ name: t.name, d: oklabDistance(lab, t.lab) }))
    .sort((a, b) => a.d - b.d);
  const pick = used ? ranked.find((r) => !used.has(r.name)) : undefined;
  const name = (pick ?? ranked[0]).name;
  used?.add(name);
  return name;
}

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

/** 低彩度、很暗的顏色：黑／灰／白（不是無彩色時 null） */
function neutralFamily(s: number, v: number): ColorFamily | null {
  if (v < 0.16) return 'black';
  const muted = s < 0.13 || (s < 0.22 && v < 0.32);
  if (!muted) return null;
  if (v > 0.86) return 'white';
  return v < 0.26 ? 'black' : 'gray';
}

/** 暗或混濁的橙紅（棕） */
const isBrown = (h: number, s: number, v: number) =>
  h >= 8 && h < 45 && (v < 0.62 || (s < 0.5 && v < 0.8));

/** 色相環的分段：[上界（不含）, 色系]，由 0° 往上找第一個 */
const HUE_BANDS: readonly (readonly [number, ColorFamily])[] = [
  [12, 'red'],
  [40, 'orange'],
  [68, 'yellow'],
  [165, 'green'],
  [262, 'blue'],
  [295, 'purple'],
  [345, 'pink'],
  [Number.POSITIVE_INFINITY, 'red'],
];

/**
 * 顏色 → 色系（HSV）：先看是不是無彩色（黑、灰、白），再看是不是棕，最後依色相分段；
 * 紅色裡淡而亮的（飽和度 < 0.55、明度 > 0.7）算粉紅。看不懂的顏色當作灰。
 */
export function colorFamily(hex: string): ColorFamily {
  const c = parseColor(hex);
  if (!c) return 'gray';
  const { h, s, v } = rgbToHsv(c);
  const neutral = neutralFamily(s, v);
  if (neutral) return neutral;
  if (isBrown(h, s, v)) return 'brown';
  const band = HUE_BANDS.find(([max]) => h < max)?.[1] ?? 'red';
  return band === 'red' && s < 0.55 && v > 0.7 ? 'pink' : band;
}
