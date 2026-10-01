/**
 * Google Fonts 目錄。每一筆的字重都已用 `fonts.googleapis.com/css2` 驗證存在（2026-10-01）。
 * 新增字型時請先驗證：
 *   curl -s -o /dev/null -w "%{http_code}" "https://fonts.googleapis.com/css2?family=<名稱>:wght@<字重;…>"
 * 回應 200 才可加入。
 */

/** tc：繁體中文、hk：港式繁中、bpmf：附注音、jp：日文、kr：韓文、latin：拉丁字母 */
export type FontScript = 'tc' | 'hk' | 'bpmf' | 'jp' | 'kr' | 'latin';

export type FontCategory =
  | 'sans'
  | 'serif'
  | 'rounded'
  | 'handwriting'
  | 'display'
  | 'pixel'
  | 'mono';

export interface FontEntry {
  /** Google Fonts 的字型名稱（CSS font-family） */
  family: string;
  /** 介面上顯示的名稱（有中文名時用中文） */
  label: string;
  scripts: readonly FontScript[];
  category: FontCategory;
  /** 可用的字重 */
  weights: readonly number[];
}

const ALL = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const SERIF_ALL = [200, 300, 400, 500, 600, 700, 800, 900] as const;

export const GOOGLE_FONTS: readonly FontEntry[] = [
  /* ---- 繁體中文（基本五套在最前面） ---- */
  {
    family: 'Noto Sans TC',
    label: '思源黑體（Noto Sans TC）',
    scripts: ['tc', 'latin'],
    category: 'sans',
    weights: ALL,
  },
  {
    family: 'Noto Serif TC',
    label: '思源宋體（Noto Serif TC）',
    scripts: ['tc', 'latin'],
    category: 'serif',
    weights: SERIF_ALL,
  },
  {
    family: 'LXGW WenKai TC',
    label: '霞鶩文楷 TC',
    scripts: ['tc', 'latin'],
    category: 'handwriting',
    weights: [300, 400, 700],
  },
  {
    family: 'Chocolate Classical Sans',
    label: '朱古力黑體',
    scripts: ['tc', 'latin'],
    category: 'sans',
    weights: [400],
  },
  {
    family: 'Cactus Classical Serif',
    label: '仙人掌明體',
    scripts: ['tc', 'latin'],
    category: 'serif',
    weights: [400],
  },
  {
    family: 'Huninn',
    label: '粉圓體（Huninn）',
    scripts: ['tc', 'latin'],
    category: 'rounded',
    weights: [400],
  },
  {
    family: 'Iansui',
    label: '芫荽（Iansui）',
    scripts: ['tc', 'latin'],
    category: 'handwriting',
    weights: [400],
  },
  {
    family: 'LXGW WenKai Mono TC',
    label: '霞鶩文楷等寬 TC',
    scripts: ['tc', 'latin'],
    category: 'mono',
    weights: [300, 400, 700],
  },
  {
    family: 'Chiron Hei HK',
    label: '昭源黑體 HK',
    scripts: ['hk', 'tc', 'latin'],
    category: 'sans',
    weights: SERIF_ALL,
  },
  {
    family: 'Chiron Sung HK',
    label: '昭源宋體 HK',
    scripts: ['hk', 'tc', 'latin'],
    category: 'serif',
    weights: SERIF_ALL,
  },
  {
    family: 'Noto Sans HK',
    label: '思源黑體 HK',
    scripts: ['hk', 'tc', 'latin'],
    category: 'sans',
    weights: ALL,
  },
  {
    family: 'Bpmf Huninn',
    label: '粉圓注音',
    scripts: ['bpmf', 'tc'],
    category: 'rounded',
    weights: [400],
  },
  {
    family: 'Bpmf Iansui',
    label: '芫荽注音',
    scripts: ['bpmf', 'tc'],
    category: 'handwriting',
    weights: [400],
  },
  {
    family: 'Bpmf Zihi Kai Std',
    label: '字嗨注音標楷',
    scripts: ['bpmf', 'tc'],
    category: 'handwriting',
    weights: [400],
  },

  /* ---- 日文 ---- */
  {
    family: 'Noto Sans JP',
    label: 'Noto Sans JP',
    scripts: ['jp', 'latin'],
    category: 'sans',
    weights: ALL,
  },
  {
    family: 'Noto Serif JP',
    label: 'Noto Serif JP',
    scripts: ['jp', 'latin'],
    category: 'serif',
    weights: SERIF_ALL,
  },
  {
    family: 'Zen Maru Gothic',
    label: 'Zen Maru Gothic',
    scripts: ['jp', 'latin'],
    category: 'rounded',
    weights: [300, 400, 500, 700, 900],
  },
  {
    family: 'M PLUS Rounded 1c',
    label: 'M PLUS Rounded 1c',
    scripts: ['jp', 'latin'],
    category: 'rounded',
    weights: [100, 300, 400, 500, 700, 800, 900],
  },
  {
    family: 'Kosugi Maru',
    label: 'Kosugi Maru',
    scripts: ['jp', 'latin'],
    category: 'rounded',
    weights: [400],
  },
  {
    family: 'Klee One',
    label: 'Klee One',
    scripts: ['jp', 'latin'],
    category: 'handwriting',
    weights: [400, 600],
  },
  {
    family: 'Shippori Mincho',
    label: 'Shippori Mincho',
    scripts: ['jp', 'latin'],
    category: 'serif',
    weights: [400, 500, 600, 700, 800],
  },
  {
    family: 'Zen Kurenaido',
    label: 'Zen Kurenaido',
    scripts: ['jp', 'latin'],
    category: 'handwriting',
    weights: [400],
  },
  {
    family: 'Yusei Magic',
    label: 'Yusei Magic',
    scripts: ['jp', 'latin'],
    category: 'handwriting',
    weights: [400],
  },
  {
    family: 'Hachi Maru Pop',
    label: 'Hachi Maru Pop',
    scripts: ['jp', 'latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Kaisei Decol',
    label: 'Kaisei Decol',
    scripts: ['jp', 'latin'],
    category: 'serif',
    weights: [400, 500, 700],
  },
  {
    family: 'Dela Gothic One',
    label: 'Dela Gothic One',
    scripts: ['jp', 'latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Reggae One',
    label: 'Reggae One',
    scripts: ['jp', 'latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'RocknRoll One',
    label: 'RocknRoll One',
    scripts: ['jp', 'latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'DotGothic16',
    label: 'DotGothic16',
    scripts: ['jp', 'latin'],
    category: 'pixel',
    weights: [400],
  },

  /* ---- 韓文 ---- */
  {
    family: 'Noto Sans KR',
    label: 'Noto Sans KR',
    scripts: ['kr', 'latin'],
    category: 'sans',
    weights: ALL,
  },
  {
    family: 'Noto Serif KR',
    label: 'Noto Serif KR',
    scripts: ['kr', 'latin'],
    category: 'serif',
    weights: SERIF_ALL,
  },
  {
    family: 'Nanum Myeongjo',
    label: 'Nanum Myeongjo',
    scripts: ['kr', 'latin'],
    category: 'serif',
    weights: [400, 700, 800],
  },
  {
    family: 'Gowun Dodum',
    label: 'Gowun Dodum',
    scripts: ['kr', 'latin'],
    category: 'rounded',
    weights: [400],
  },
  { family: 'Jua', label: 'Jua', scripts: ['kr', 'latin'], category: 'rounded', weights: [400] },
  {
    family: 'Do Hyeon',
    label: 'Do Hyeon',
    scripts: ['kr', 'latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Black Han Sans',
    label: 'Black Han Sans',
    scripts: ['kr', 'latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Nanum Pen Script',
    label: 'Nanum Pen Script',
    scripts: ['kr', 'latin'],
    category: 'handwriting',
    weights: [400],
  },

  /* ---- 拉丁字母 ---- */
  { family: 'Inter', label: 'Inter', scripts: ['latin'], category: 'sans', weights: ALL },
  {
    family: 'Cinzel',
    label: 'Cinzel',
    scripts: ['latin'],
    category: 'serif',
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    family: 'Playfair Display',
    label: 'Playfair Display',
    scripts: ['latin'],
    category: 'serif',
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    family: 'IM Fell English',
    label: 'IM Fell English',
    scripts: ['latin'],
    category: 'serif',
    weights: [400],
  },
  {
    family: 'MedievalSharp',
    label: 'MedievalSharp',
    scripts: ['latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Pirata One',
    label: 'Pirata One',
    scripts: ['latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'UnifrakturMaguntia',
    label: 'UnifrakturMaguntia',
    scripts: ['latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Special Elite',
    label: 'Special Elite',
    scripts: ['latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Creepster',
    label: 'Creepster',
    scripts: ['latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Orbitron',
    label: 'Orbitron',
    scripts: ['latin'],
    category: 'display',
    weights: [400, 500, 600, 700, 800, 900],
  },
  {
    family: 'Bebas Neue',
    label: 'Bebas Neue',
    scripts: ['latin'],
    category: 'display',
    weights: [400],
  },
  {
    family: 'Press Start 2P',
    label: 'Press Start 2P',
    scripts: ['latin'],
    category: 'pixel',
    weights: [400],
  },
  {
    family: 'Noto Sans Mono',
    label: 'Noto Sans Mono',
    scripts: ['latin'],
    category: 'mono',
    weights: ALL,
  },
];

/** 繁中的基本五套 */
export const BASIC_TC_FONTS = [
  'Noto Sans TC',
  'Noto Serif TC',
  'LXGW WenKai TC',
  'Chocolate Classical Sans',
  'Cactus Classical Serif',
] as const;

export const DEFAULT_FONT_FAMILY = 'Noto Sans TC';

export const SCRIPT_LABELS: Record<FontScript, string> = {
  tc: '繁中',
  hk: '港式繁中',
  bpmf: '注音',
  jp: '日文',
  kr: '韓文',
  latin: '英文',
};

export const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: '黑體',
  serif: '明體／襯線',
  rounded: '圓體',
  handwriting: '手寫',
  display: '標題',
  pixel: '像素',
  mono: '等寬',
};

const byFamily = new Map(GOOGLE_FONTS.map((f) => [f.family.toLowerCase(), f]));

export function findGoogleFont(family: string): FontEntry | undefined {
  return byFamily.get(family.trim().toLowerCase());
}

/** Google Fonts css2 網址（family 的所有可用字重，或指定字重） */
export function googleFontCssUrl(
  family: string,
  weights?: readonly number[],
  text?: string,
): string {
  const entry = findGoogleFont(family);
  const ws = [...(weights ?? entry?.weights ?? [400])].sort((a, b) => a - b);
  const fam = encodeURIComponent(entry?.family ?? family).replace(/%20/g, '+');
  const wght = ws.length === 1 && ws[0] === 400 && !weights ? '' : `:wght@${ws.join(';')}`;
  const t = text ? `&text=${encodeURIComponent(text)}` : '';
  return `https://fonts.googleapis.com/css2?family=${fam}${wght}&display=swap${t}`;
}

/** 最接近的可用字重 */
export function nearestWeight(weights: readonly number[], wanted: number): number {
  if (!weights.length) return 400;
  return weights.reduce(
    (best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best),
    weights[0],
  );
}
