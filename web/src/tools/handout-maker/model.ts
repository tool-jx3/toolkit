/**
 * 線索道具產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/handout-maker.md）：
 * 主題、字型代號、印章、質感、濾鏡的清單與預設值；一張線索道具（Handout）的欄位、範圍、整理存檔；
 * 尺寸與 24 px 對齊；換主題時的配色；匯出的檔名。
 *
 * 座標與大小一律以「畫面 px」計（＝匯出 1 倍的像素）；匯出 2 倍時整張乘 2。
 */

/* ---------- 主題 ---------- */

export const THEME_IDS = [
  'basic',
  'memo',
  'sticky',
  'polaroid',
  'newspaper',
  'wanted',
  'window',
  'status',
  'terminal',
  'sms',
  'email',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/* ---------- 字型 ---------- */

export const FONT_IDS = [
  'theme',
  'noto-sans',
  'chocolate',
  'noto-serif',
  'cactus',
  'wenkai',
  'iansui',
  'huninn',
  'cubic',
  'fusion',
  'wenkai-mono',
] as const;
export type FontId = (typeof FONT_IDS)[number];
/** 實際的字型（「主題預設」以外） */
export type ConcreteFontId = Exclude<FontId, 'theme'>;

/* ---------- 其他選項 ---------- */

export const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export type Align = (typeof ALIGNS)[number];

export const STAMP_IDS = [
  'none',
  'important',
  'locked',
  'investigating',
  'danger',
  'question',
  'hidden',
  'done',
] as const;
export type StampId = (typeof STAMP_IDS)[number];

export const TEXTURE_IDS = [
  'none',
  'parchment',
  'grid',
  'ruled',
  'checker',
  'dot',
  'noise',
  'fine',
] as const;
export type TextureId = (typeof TEXTURE_IDS)[number];

export const IMAGE_FILTER_IDS = ['none', 'gray', 'sepia', 'blur', 'vivid', 'invert'] as const;
export type ImageFilterId = (typeof IMAGE_FILTER_IDS)[number];

export const BG_FITS = ['cover', 'contain', 'repeat'] as const;
export type BgFit = (typeof BG_FITS)[number];

/** 主題專用的文字欄（只在對應的主題出現） */
export const EXTRA_KEYS = [
  'masthead',
  'dateline',
  'heading',
  'label',
  'prompt',
  'from',
  'to',
  'date',
  'contact',
] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];
export type Extras = Record<ExtraKey, string>;

/* ---------- 範圍與預設 ---------- */

/** 寬、高（px）：原作預設 384 × 528、每次 ±10；對齊 24 px 時取 24 的倍數 */
export const SIZE_RANGE = { min: 96, max: 2400 } as const;
export const DEFAULT_SIZE = { width: 384, height: 528 } as const;
export const SIZE_STEP = 10;
export const GRID_PX = 24;
/** 本文字級（px）：原作預設 15、最小 8 */
export const FONT_SIZE_RANGE = { min: 8, max: 72 } as const;
export const DEFAULT_FONT_SIZE = 15;
/** 附圖寬度（％，相對內容寬）：原作 10～100、預設 90 */
export const IMAGE_SIZE_RANGE = { min: 10, max: 100 } as const;
export const DEFAULT_IMAGE_SIZE = 90;
/** 背景圖：模糊 0～20 px、色調 0～360°、不透明度 10～100％（原作） */
export const BG_BLUR_RANGE = { min: 0, max: 20 } as const;
export const BG_HUE_RANGE = { min: 0, max: 360 } as const;
export const BG_OPACITY_RANGE = { min: 10, max: 100 } as const;
/** 匯出倍率（原作固定 2 倍） */
export const SCALES = [1, 2, 3] as const;
export type ExportScale = (typeof SCALES)[number];
export const DEFAULT_SCALE: ExportScale = 2;
/** 文字長度上限（以字元計；自訂的防呆） */
export const TITLE_MAX = 120;
export const BODY_MAX = 4000;
export const EXTRA_MAX = 80;
/** 清單最多幾張（自訂的防呆） */
export const HANDOUT_MAX = 60;

/* ---------- 狀態 ---------- */

/** 資產庫裡的一張圖 */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface BgLayer {
  image: ImageRef | null;
  fit: BgFit;
  blur: number;
  hue: number;
  opacity: number;
}

export interface Handout {
  id: string;
  theme: ThemeId;
  font: FontId;
  title: string;
  body: string;
  fontSize: number;
  align: Align;
  stamp: StampId;
  image: ImageRef | null;
  imageSize: number;
  imageFilter: ImageFilterId;
  texture: TextureId;
  bg: BgLayer;
  /** 寬高對齊 24 px 的倍數 */
  snap: boolean;
  width: number;
  height: number;
  /** 背景色（#rrggbb 或 #rrggbbaa：可以半透明、全透明） */
  bgColor: string;
  /** 文字與框線的顏色（#rrggbb） */
  textColor: string;
  extra: Extras;
}

export interface HandoutState {
  items: Handout[];
}

/* ---------- 主題的預設 ---------- */

export interface ThemeDefaults {
  bg: string;
  text: string;
  font: ConcreteFontId;
}

/** 各主題的預設配色與字型（原作有的配色照原作；報紙、便條用本站的） */
export const THEME_DEFAULTS: Record<ThemeId, ThemeDefaults> = {
  basic: { bg: '#ffffff', text: '#333333', font: 'noto-sans' },
  memo: { bg: '#ffffff', text: '#333333', font: 'iansui' },
  sticky: { bg: '#fdfd96', text: '#333333', font: 'iansui' },
  polaroid: { bg: '#ffffff', text: '#333333', font: 'wenkai' },
  newspaper: { bg: '#f4f1ea', text: '#222222', font: 'noto-serif' },
  wanted: { bg: '#e8dcc6', text: '#3b2a1a', font: 'noto-serif' },
  window: { bg: '#ffffff', text: '#333333', font: 'noto-sans' },
  status: { bg: '#0f1928', text: '#44ddff', font: 'cubic' },
  terminal: { bg: '#000000', text: '#00ff00', font: 'cubic' },
  sms: { bg: '#ffffff', text: '#333333', font: 'noto-sans' },
  email: { bg: '#ffffff', text: '#333333', font: 'noto-sans' },
};

const DEFAULT_BGS = new Set(Object.values(THEME_DEFAULTS).map((d) => d.bg));
const DEFAULT_TEXTS = new Set(Object.values(THEME_DEFAULTS).map((d) => d.text));

/** 主題各自用到的欄位（設定欄依它顯示或藏起來） */
export interface ThemeFields {
  title: boolean;
  stamp: boolean;
  align: boolean;
  imageSize: boolean;
  extras: readonly ExtraKey[];
  /** `||文字||` 的意思：塗黑或自己發的訊息 */
  marker: 'censor' | 'sent';
}

export const THEME_FIELDS: Record<ThemeId, ThemeFields> = {
  basic: { title: true, stamp: true, align: true, imageSize: true, extras: [], marker: 'censor' },
  memo: { title: true, stamp: true, align: true, imageSize: true, extras: [], marker: 'censor' },
  sticky: { title: true, stamp: true, align: true, imageSize: true, extras: [], marker: 'censor' },
  polaroid: {
    title: true,
    stamp: true,
    align: false,
    imageSize: false,
    extras: [],
    marker: 'censor',
  },
  newspaper: {
    title: true,
    stamp: true,
    align: true,
    imageSize: true,
    extras: ['masthead', 'dateline'],
    marker: 'censor',
  },
  wanted: {
    title: true,
    stamp: true,
    align: false,
    imageSize: true,
    extras: ['heading'],
    marker: 'censor',
  },
  window: { title: true, stamp: true, align: true, imageSize: true, extras: [], marker: 'censor' },
  status: {
    title: true,
    stamp: true,
    align: true,
    imageSize: true,
    extras: ['label'],
    marker: 'censor',
  },
  terminal: {
    title: true,
    stamp: true,
    align: true,
    imageSize: true,
    extras: ['prompt'],
    marker: 'censor',
  },
  sms: {
    title: false,
    stamp: false,
    align: false,
    imageSize: true,
    extras: ['contact'],
    marker: 'sent',
  },
  email: {
    title: true,
    stamp: true,
    align: true,
    imageSize: true,
    extras: ['from', 'to', 'date'],
    marker: 'censor',
  },
};

/** 主題專用文字欄的預設（新的一張） */
export const DEFAULT_EXTRAS: Extras = {
  masthead: '',
  dateline: '',
  heading: '懸賞通緝',
  label: '【系統通知】',
  prompt: 'kp@archive',
  from: '',
  to: '',
  date: '',
  contact: '',
};

/** 這張實際用的字型（「主題預設」換成主題的字型） */
export const resolveFontId = (h: Pick<Handout, 'font' | 'theme'>): ConcreteFontId =>
  h.font === 'theme' ? THEME_DEFAULTS[h.theme].font : h.font;

/* ---------- 尺寸 ---------- */

/** 對齊 24 px：四捨五入到 24 的倍數，夾在範圍內 */
export function snapSize(v: number): number {
  const n = Number.isFinite(v) ? v : DEFAULT_SIZE.width;
  const k = Math.round(n / GRID_PX) * GRID_PX;
  return Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, k));
}

/** 一般的寬高：取整數、夾在範圍內；snap 時再對齊 24 px */
export function normalizeSize(v: number, snap: boolean): number {
  if (snap) return snapSize(v);
  const n = Number.isFinite(v) ? Math.round(v) : DEFAULT_SIZE.width;
  return Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, n));
}

/** 寬高調整一格（數字欄的微調、滾輪）：對齊時先對齊再 ±24，否則 ±10 */
export function stepSize(v: number, dir: 1 | -1, snap: boolean): number {
  if (snap) return snapSize(snapSize(v) + dir * GRID_PX);
  return normalizeSize(v + dir * SIZE_STEP, false);
}

/** 寬高各佔幾格（24 px 一格） */
export const gridCells = (px: number): number => px / GRID_PX;

/* ---------- 配色 ---------- */

const HEX6 = /^#[0-9a-f]{6}$/;
const HEX8 = /^#[0-9a-f]{8}$/;

/** 顏色整理：#rgb、#rrggbb、#rrggbbaa（alpha 時）轉小寫；看不懂的用預設 */
export function normalizeColor(v: unknown, fallback: string, alpha = false): string {
  if (typeof v !== 'string') return fallback;
  let s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(s)) s = `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  if (HEX6.test(s)) return s;
  if (alpha && HEX8.test(s)) return s.endsWith('ff') ? s.slice(0, 7) : s;
  return fallback;
}

/**
 * 換主題時的配色：目前的背景色與文字色都還是「某個主題的預設」時，換成新主題的預設（同原作）；
 * 使用者改過任何一個就不動。
 */
export function colorsForTheme(
  h: Pick<Handout, 'bgColor' | 'textColor'>,
  theme: ThemeId,
): { bgColor: string; textColor: string } {
  const bgDefault = DEFAULT_BGS.has(h.bgColor.toLowerCase());
  const textDefault = DEFAULT_TEXTS.has(h.textColor.toLowerCase());
  if (bgDefault && textDefault)
    return { bgColor: THEME_DEFAULTS[theme].bg, textColor: THEME_DEFAULTS[theme].text };
  return { bgColor: h.bgColor, textColor: h.textColor };
}

/* ---------- 新的一張 ---------- */

let idSeq = 0;
/** 新的 id（時間＋序號，同一毫秒也不重複） */
export function newHandoutId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    idSeq = (idSeq + 1) % 1_000_000;
    const id = `h${Date.now().toString(36)}${idSeq.toString(36)}`;
    if (!used.has(id)) return id;
  }
}

/** 某個主題的空白一張（配色、字型照主題預設） */
export function blankHandout(theme: ThemeId = 'basic', id = newHandoutId()): Handout {
  const d = THEME_DEFAULTS[theme];
  return {
    id,
    theme,
    font: 'theme',
    title: '',
    body: '',
    fontSize: DEFAULT_FONT_SIZE,
    align: 'left',
    stamp: 'none',
    image: null,
    imageSize: DEFAULT_IMAGE_SIZE,
    imageFilter: 'none',
    texture: 'none',
    bg: { image: null, fit: 'cover', blur: 0, hue: 0, opacity: 100 },
    snap: false,
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
    bgColor: d.bg,
    textColor: d.text,
    extra: { ...DEFAULT_EXTRAS },
  };
}

/* ---------- 整理存檔 ---------- */

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** 依字元（不是 UTF-16）截斷 */
export const clipChars = (s: string, max: number): string => {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('') : s;
};

/** 換行統一成 \n */
export const unifyNewlines = (s: string): string => s.replace(/\r\n?/g, '\n');

function normalizeImage(v: unknown): ImageRef | null {
  const o = obj(v);
  if (typeof o.id !== 'string' || !o.id) return null;
  const w = num(o.width, 0, 0, 100_000);
  const hh = num(o.height, 0, 0, 100_000);
  if (!w || !hh) return null;
  return {
    id: o.id,
    name: clipChars(str(o.name), 200),
    width: Math.round(w),
    height: Math.round(hh),
  };
}

/** 一張的整理（缺的欄位補預設、超出範圍夾回、看不懂的換預設） */
export function normalizeHandout(raw: unknown, id?: string): Handout {
  const o = obj(raw);
  const theme = pick(THEME_IDS, o.theme, 'basic');
  const d = blankHandout(theme, id ?? (typeof o.id === 'string' && o.id ? o.id : newHandoutId()));
  const bg = obj(o.bg);
  const ex = obj(o.extra);
  const snap = o.snap === true;
  const extra = { ...DEFAULT_EXTRAS };
  for (const k of EXTRA_KEYS)
    if (typeof ex[k] === 'string')
      extra[k] = clipChars(unifyNewlines(ex[k] as string).replace(/\n/g, ' '), EXTRA_MAX);
  return {
    id: d.id,
    theme,
    font: pick(FONT_IDS, o.font, 'theme'),
    title: clipChars(unifyNewlines(str(o.title)).replace(/\n/g, ' '), TITLE_MAX),
    body: clipChars(unifyNewlines(str(o.body)), BODY_MAX),
    fontSize: Math.round(num(o.fontSize, d.fontSize, FONT_SIZE_RANGE.min, FONT_SIZE_RANGE.max)),
    align: pick(ALIGNS, o.align, 'left'),
    stamp: pick(STAMP_IDS, o.stamp, 'none'),
    image: normalizeImage(o.image),
    imageSize: Math.round(
      num(o.imageSize, d.imageSize, IMAGE_SIZE_RANGE.min, IMAGE_SIZE_RANGE.max),
    ),
    imageFilter: pick(IMAGE_FILTER_IDS, o.imageFilter, 'none'),
    texture: pick(TEXTURE_IDS, o.texture, 'none'),
    bg: {
      image: normalizeImage(bg.image),
      fit: pick(BG_FITS, bg.fit, 'cover'),
      blur: Math.round(num(bg.blur, 0, BG_BLUR_RANGE.min, BG_BLUR_RANGE.max)),
      hue: Math.round(num(bg.hue, 0, BG_HUE_RANGE.min, BG_HUE_RANGE.max)),
      opacity: Math.round(num(bg.opacity, 100, BG_OPACITY_RANGE.min, BG_OPACITY_RANGE.max)),
    },
    snap,
    width: normalizeSize(num(o.width, d.width, -1e9, 1e9), snap),
    height: normalizeSize(num(o.height, d.height, -1e9, 1e9), snap),
    bgColor: normalizeColor(o.bgColor, d.bgColor, true),
    textColor: normalizeColor(o.textColor, d.textColor),
    extra,
  };
}

/** 整份的整理：至少一張、最多 HANDOUT_MAX 張、id 不重複 */
export function normalizeState(raw: unknown, fallback: () => HandoutState): HandoutState {
  const o = obj(raw);
  const list = Array.isArray(o.items) ? o.items.slice(0, HANDOUT_MAX) : [];
  const items: Handout[] = [];
  const used = new Set<string>();
  for (const it of list) {
    const rawId = obj(it).id;
    const id =
      typeof rawId === 'string' && /^[\w-]{1,40}$/.test(rawId) && !used.has(rawId)
        ? rawId
        : newHandoutId(used);
    used.add(id);
    items.push(normalizeHandout(it, id));
  }
  return items.length ? { items } : fallback();
}

/** 一張用到的圖（資產 id） */
export const handoutAssetIds = (h: Handout): string[] => [
  ...(h.image ? [h.image.id] : []),
  ...(h.bg.image ? [h.bg.image.id] : []),
];

/** 整份用到的圖 */
export const stateAssetIds = (s: HandoutState): string[] => [
  ...new Set(s.items.flatMap(handoutAssetIds)),
];

/* ---------- 名稱與檔名 ---------- */

/** 清單上與檔名用的名稱：標題（簡訊用對話對象）→ 本文第一行 → 空字串 */
export function handoutName(h: Handout): string {
  const head = THEME_FIELDS[h.theme].title ? h.title : h.extra.contact;
  const name = head.trim() || h.body.trim().split('\n')[0]?.replace(/\|\|/g, '').trim() || '';
  return clipChars(name, 40);
}
