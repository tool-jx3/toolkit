/**
 * 顏色的名字（繁中）與色系（color-palette 併入色票櫃、配色卡時新增，2026-10）。
 *
 * - `COLOR_NAMES`：本站自己編的繁中色名表（約 130 個常用的顏色詞，色碼是本站自己挑的代表色；
 *   不是任何標準或別人的色名資料，可以自由修改、增加）。
 * - `colorName(hex, used?)`：最接近的色名（Oklab 距離）；給 `used` 時跳過已經用過的名字（同一張圖上不重複），
 *   全部用過時才回到最接近的那個。
 * - `colorFamily(hex)`：色系（紅、橙、黃、綠、藍、紫、粉紅、棕、黑、灰、白）。依 HSV 分界；分界值參考
 *   saturn97v/Color-shelf 的自動分類（只參考數值）。
 *
 * ```ts
 * colorName('#f2a18c');               // '鮭魚粉'
 * const used = new Set<string>();
 * colors.map((c) => colorName(c, used)); // 同一組裡不重複
 * colorFamily('#8a5a3c');             // 'brown'
 * ```
 */
import { type Oklab, oklabDistance, parseColor, rgbToHsv, rgbToOklab } from './color';

export interface NamedColor {
  name: string;
  /** #rrggbb */
  hex: string;
}

/** 本站自編的繁中色名表（依色系排列；名字不重複） */
export const COLOR_NAMES: readonly NamedColor[] = [
  /* 白、灰、黑 */
  { name: '雪白', hex: '#fbfbf8' },
  { name: '珍珠白', hex: '#f2efe8' },
  { name: '象牙白', hex: '#f6f0dc' },
  { name: '米白', hex: '#ece4d2' },
  { name: '亞麻', hex: '#e6dcc8' },
  { name: '霧灰', hex: '#dcdfe1' },
  { name: '淺灰', hex: '#c8cbcd' },
  { name: '銀灰', hex: '#b4b8bc' },
  { name: '灰色', hex: '#8d8d8d' },
  { name: '暖灰', hex: '#a39b92' },
  { name: '灰褐', hex: '#8f8378' },
  { name: '鴿灰', hex: '#a3a19e' },
  { name: '石板灰', hex: '#6f7780' },
  { name: '鐵灰', hex: '#55595e' },
  { name: '炭灰', hex: '#3d3f43' },
  { name: '墨黑', hex: '#22242a' },
  { name: '漆黑', hex: '#111214' },
  /* 粉、紅 */
  { name: '櫻花粉', hex: '#f7d3dc' },
  { name: '淺粉紅', hex: '#f5c1cc' },
  { name: '蜜桃粉', hex: '#f9c4b4' },
  { name: '粉紅', hex: '#f29cb5' },
  { name: '桃紅', hex: '#e8608f' },
  { name: '玫瑰粉', hex: '#d9879a' },
  { name: '乾燥玫瑰', hex: '#c08a90' },
  { name: '藕粉', hex: '#c9a9b4' },
  { name: '鮭魚粉', hex: '#f4a08b' },
  { name: '珊瑚紅', hex: '#f0786a' },
  { name: '西瓜紅', hex: '#ef5d6c' },
  { name: '洋紅', hex: '#d0307f' },
  { name: '玫瑰紅', hex: '#c9304f' },
  { name: '朱紅', hex: '#e24a2a' },
  { name: '正紅', hex: '#d42a2a' },
  { name: '櫻桃紅', hex: '#b81d36' },
  { name: '胭脂紅', hex: '#9e2440' },
  { name: '磚紅', hex: '#a8483a' },
  { name: '酒紅', hex: '#7d1f33' },
  { name: '深酒紅', hex: '#561a2a' },
  /* 橙、棕、膚 */
  { name: '淺膚色', hex: '#f8e1cf' },
  { name: '膚色', hex: '#f2d0b5' },
  { name: '小麥膚', hex: '#d9a77c' },
  { name: '杏色', hex: '#f6c99c' },
  { name: '蜜桃橘', hex: '#f8b07a' },
  { name: '橙色', hex: '#f39233' },
  { name: '南瓜橘', hex: '#ec8130' },
  { name: '柿子橘', hex: '#e66a2c' },
  { name: '琥珀', hex: '#d9952e' },
  { name: '赭石', hex: '#b5772f' },
  { name: '焦糖', hex: '#b46d34' },
  { name: '肉桂', hex: '#9c5a33' },
  { name: '紅棕', hex: '#8a3f26' },
  { name: '栗子色', hex: '#7a4a33' },
  { name: '咖啡', hex: '#6a4a36' },
  { name: '可可', hex: '#5a3b2c' },
  { name: '深咖啡', hex: '#3f2a20' },
  { name: '奶茶色', hex: '#c8a586' },
  { name: '拿鐵', hex: '#b8946f' },
  { name: '駝色', hex: '#c19a6b' },
  { name: '卡其', hex: '#b8a67c' },
  { name: '沙色', hex: '#dcc8a6' },
  { name: '小麥色', hex: '#e2c792' },
  /* 黃 */
  { name: '奶油黃', hex: '#fff1b8' },
  { name: '鵝黃', hex: '#fbe9a0' },
  { name: '檸檬黃', hex: '#f5e04a' },
  { name: '向日葵黃', hex: '#f7c625' },
  { name: '蜂蜜黃', hex: '#e8b33c' },
  { name: '芥末黃', hex: '#c9a22c' },
  { name: '金色', hex: '#d4af37' },
  { name: '香檳金', hex: '#e6d2a4' },
  { name: '橄欖黃', hex: '#a59a3a' },
  /* 綠 */
  { name: '嫩綠', hex: '#c2e08e' },
  { name: '青蘋果綠', hex: '#a8d26a' },
  { name: '抹茶綠', hex: '#9db86a' },
  { name: '鼠尾草綠', hex: '#9eae8a' },
  { name: '橄欖綠', hex: '#6d7a3e' },
  { name: '苔蘚綠', hex: '#5f6e3d' },
  { name: '草綠', hex: '#5fa83a' },
  { name: '翠綠', hex: '#2f9e57' },
  { name: '祖母綠', hex: '#1e7d5a' },
  { name: '森林綠', hex: '#2c5a3f' },
  { name: '墨綠', hex: '#1f3d30' },
  { name: '松石綠', hex: '#2e6b5e' },
  { name: '翡翠綠', hex: '#3aa38a' },
  { name: '薄荷綠', hex: '#b5e5cf' },
  { name: '青瓷', hex: '#a9cbbd' },
  { name: '湖水綠', hex: '#6cc7b7' },
  /* 青、藍 */
  { name: '冰藍', hex: '#d6ecf5' },
  { name: '水藍', hex: '#a9daf0' },
  { name: '薄荷藍', hex: '#7fd6cc' },
  { name: '天空藍', hex: '#7fbfe9' },
  { name: '淺藍', hex: '#b5cde6' },
  { name: '霧藍', hex: '#8fa5c0' },
  { name: '灰藍', hex: '#6f8399' },
  { name: '青色', hex: '#26b0c7' },
  { name: '湖藍', hex: '#3e8fb0' },
  { name: '孔雀藍', hex: '#0f7c8c' },
  { name: '蔚藍', hex: '#3f8fe0' },
  { name: '寶藍', hex: '#2b55c4' },
  { name: '鈷藍', hex: '#1f4aa0' },
  { name: '牛仔藍', hex: '#4a6c9b' },
  { name: '靛藍', hex: '#2e3a78' },
  { name: '海軍藍', hex: '#24365c' },
  { name: '午夜藍', hex: '#172340' },
  { name: '長春花藍', hex: '#9aa6e8' },
  /* 紫 */
  { name: '薰衣草紫', hex: '#c3b4e3' },
  { name: '丁香紫', hex: '#cbb2d8' },
  { name: '藤紫', hex: '#9c86c4' },
  { name: '紫羅蘭', hex: '#7d5bbf' },
  { name: '煙燻紫', hex: '#8e7f96' },
  { name: '蘭花紫', hex: '#c47ac0' },
  { name: '梅紫', hex: '#8b4f7d' },
  { name: '紫紅', hex: '#a03a78' },
  { name: '葡萄紫', hex: '#5e3a7a' },
  { name: '茄紫', hex: '#3e2a48' },
];

let labCache: { hex: string; name: string; lab: Oklab }[] | null = null;
const table = () => {
  if (!labCache) {
    labCache = COLOR_NAMES.map((c) => ({
      ...c,
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
  const sorted = table()
    .map((t) => ({ name: t.name, d: oklabDistance(lab, t.lab) }))
    .sort((a, b) => a.d - b.d);
  if (!used) return sorted[0].name;
  for (const s of sorted) {
    if (!used.has(s.name)) {
      used.add(s.name);
      return s.name;
    }
  }
  return sorted[0].name;
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
