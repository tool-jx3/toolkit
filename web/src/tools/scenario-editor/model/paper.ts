/**
 * 每頁的紙色與背景花紋（2026-10，上游 v3.12.0～v3.13.2，規格 F264～F266、3.17.2～3.17.3）。
 * 紙色和內文的墨色要有 7:1 以上的對比（WCAG AAA）：太暗的顏色維持色相、調亮到 7:1。
 */
import { contrastRatio, parseColor } from '@/core/color';
import type { PageBg } from './types';

/** 沒有指定紙色時的顏色（米白） */
export const PAPER_DEFAULT = '#f7f3ea';
/** 內文的墨色 */
export const INK = '#23201c';
/** 「上下色帶」的花紋沒有指定紙色時用的底色 */
export const BAND_PAPER = '#f1efea';

/** 紙色的按鈕（10 色；值照原作，名稱改成繁中的一般色名） */
export const PAPERS: readonly { c: string; name: string }[] = [
  { c: '#f7f3ea', name: '米白' },
  { c: '#fbfbf8', name: '白' },
  { c: '#f6f0dc', name: '奶油色' },
  { c: '#f1e8d8', name: '米色' },
  { c: '#f8ece9', name: '淡粉紅' },
  { c: '#eef2e2', name: '淡黃綠' },
  { c: '#e9f0f3', name: '淡水藍' },
  { c: '#efecf4', name: '淡紫' },
  { c: '#eeeeec', name: '淡灰' },
  { c: '#e6e4df', name: '灰' },
];

export type PaperMood = 'dreamy' | 'sherbet' | 'sunset' | 'earth' | 'mono';

/** 「隨機配色」的氣氛：色相範圍（null＝全部）、彩度、亮度（HSL 的 %） */
export const PAPER_MOODS: Readonly<
  Record<PaperMood, { name: string; hue: readonly [number, number] | null; s: number; l: number }>
> = {
  dreamy: { name: '夢幻', hue: null, s: 34, l: 94 },
  sherbet: { name: '雪酪', hue: null, s: 24, l: 96 },
  sunset: { name: '夕陽', hue: [332, 410], s: 44, l: 91 },
  earth: { name: '大地', hue: [14, 62], s: 22, l: 92 },
  mono: { name: '單色', hue: null, s: 8, l: 94 },
};

/** 背景花紋：新版可以選的 9 種（素色、紙紋＋原作 v3.12.0 的 7 種；D11） */
export const PATTERNS: readonly { k: string; name: string }[] = [
  { k: 'none', name: '素色' },
  { k: 'bg-paper', name: '紙紋' },
  { k: 'bg-grid5', name: '方格' },
  { k: 'bg-dot5', name: '圓點' },
  { k: 'bg-aged', name: '舊紙' },
  { k: 'bg-washi', name: '和紙' },
  { k: 'bg-frame', name: '裝飾框' },
  { k: 'bg-corner', name: '四角花飾' },
  { k: 'bg-band2', name: '上下色帶' },
];

/** 舊原稿的花紋（照樣顯示，不提供選擇） */
const OLD_PATTERNS: Readonly<Record<string, string>> = {
  'bg-grid': '方格（舊）',
  'bg-rule': '橫線',
  'bg-dot': '點（舊）',
  'bg-vignette': '暗角',
  'bg-band': '色帶（舊）',
  'bg-parch': '羊皮紙',
  'bg-fog': '霧',
};

export const patternName = (k: string): string =>
  PATTERNS.find((p) => p.k === k)?.name ?? OLD_PATTERNS[k] ?? k;

/** 飾邊類的花紋：大小跟著紙面間距（頁面要帶 --mv、--mh） */
export const MARGIN_PATTERNS: readonly string[] = ['bg-frame', 'bg-corner', 'bg-band2'];

/* ---------- 顏色 ---------- */

const isHex6 = (c: unknown): c is string => /^#[0-9a-f]{6}$/i.test(String(c ?? ''));

/** 頁面指定的紙色（沒有指定時空字串） */
export const pageColor = (bg: Pick<PageBg, 'color'> | undefined): string =>
  isHex6(bg?.color) ? String(bg?.color).toLowerCase() : '';

/** 頁面實際的紙色（沒有指定時：上下色帶是淡灰，其他是米白） */
export const pagePaper = (bg: Pick<PageBg, 'color' | 'preset'> | undefined): string =>
  pageColor(bg) || (bg?.preset === 'bg-band2' ? BAND_PAPER : PAPER_DEFAULT);

function hexRgb(hex: string): [number, number, number] {
  const c = parseColor(hex) ?? { r: 0, g: 0, b: 0, a: 1 };
  return [c.r, c.g, c.b];
}

export function hslHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.min(100, Math.max(0, s)) / 100;
  const ll = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const [r, g, b] =
    hh < 60
      ? [c, x, 0]
      : hh < 120
        ? [x, c, 0]
        : hh < 180
          ? [0, c, x]
          : hh < 240
            ? [0, x, c]
            : hh < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** [色相 0～360, 彩度 %, 亮度 %] */
export function rgbHsl(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const mx = Math.max(R, G, B);
  const mn = Math.min(R, G, B);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h =
      mx === R
        ? 60 * (((G - B) / d) % 6)
        : mx === G
          ? 60 * ((B - R) / d + 2)
          : 60 * ((R - G) / d + 4);
  }
  return [((h % 360) + 360) % 360, s * 100, l * 100];
}

/** 和墨色的對比 */
export const inkContrast = (paper: string): number => contrastRatio(INK, paper);

/** 對比的等級：AAA（≥ 7）、AA（≥ 4.5）、A（≥ 3）、— */
export const contrastGrade = (r: number): string =>
  r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'A' : '—';

/** 讀得清楚的紙色：和墨色的對比不到 7:1 時，色相、彩度不變，亮度一格一格調高到 7:1（都不行就白色） */
export function readablePaper(hex: string): string {
  if (!isHex6(hex)) return PAPER_DEFAULT;
  const c = hex.toLowerCase();
  if (inkContrast(c) >= 7) return c;
  const [h, s, l] = rgbHsl(...hexRgb(c));
  for (let L = Math.ceil(l); L <= 100; L++) {
    const x = hslHex(h, s, L);
    if (inkContrast(x) >= 7) return x;
  }
  return '#ffffff';
}

/** 隨機配色：氣氛的色相範圍裡取一個淡的紙色（亮度 ±2 的變化） */
export function paperFromMood(mood: PaperMood, rnd: () => number = Math.random): string {
  const m = PAPER_MOODS[mood] ?? PAPER_MOODS.dreamy;
  const h = m.hue ? m.hue[0] + rnd() * (m.hue[1] - m.hue[0]) : rnd() * 360;
  return readablePaper(hslHex(h, m.s, m.l + (rnd() - 0.5) * 4));
}

/**
 * 顏色的一般名稱（隨機配色、自訂的顏色用）：依色相、鮮豔度（最強與最弱的光的差）、亮度。
 * 白色附近的顏色 HSL 彩度會偏高，所以鮮豔度不用 HSL 的彩度。
 */
export function colorName(hex: string): string {
  const [r, g, b] = hexRgb(hex);
  const [h, , l] = rgbHsl(r, g, b);
  const chroma = ((Math.max(r, g, b) - Math.min(r, g, b)) / 255) * 100;
  if (chroma < 3)
    return l >= 96 ? '白' : l >= 85 ? '淡灰' : l >= 45 ? '灰' : l >= 20 ? '深灰' : '黑';
  let n: string;
  if (h < 15 || h >= 345) n = l >= 65 ? '粉紅' : '紅';
  else if (h < 40) n = l >= 85 && chroma < 15 ? '米色' : '橘';
  else if (h < 65) n = l >= 85 && chroma < 20 ? '奶油色' : '黃';
  else if (h < 100) n = '黃綠';
  else if (h < 160) n = '綠';
  else if (h < 200) n = l >= 70 ? '水藍' : '青綠';
  else if (h < 250) n = l >= 75 ? '水藍' : '藍';
  else if (h < 290) n = '紫';
  else n = l >= 65 ? '粉紅' : '紫紅';
  return l >= 88 && n !== '米色' && n !== '奶油色' ? `淡${n}` : n;
}

/** 紙色的名稱：按鈕上的顏色用按鈕的名稱，其他用一般名稱 */
export const paperName = (hex: string): string =>
  PAPERS.find((p) => p.c === hex.toLowerCase())?.name ?? colorName(hex);
