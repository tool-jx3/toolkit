/**
 * 短文圖片產生器的資料與規則（純函式，不依賴 React 與畫布；規格 docs/refactor/specs/prose-card.md）：
 * 狀態與預設值、整理存檔、數值的範圍與選項、字型清單、頁碼與檔名。
 */
import { defineFontChoices, findGoogleFont } from '@/core/fonts';
import { DEFAULT_PLACEMENT, type FramePlacement, normalizePlacement } from '@/core/image';
import {
  normalizeDoc,
  RICH_ALIGNS,
  type RichAlign,
  type RichDoc,
  RichTextError,
  validateDoc,
} from '@/core/richtext';
import { SAMPLE } from './strings';

/* ---------- 尺寸 ---------- */

/** 一頁的大小（輸出 1 倍；預設輸出 2 倍＝2400 × 3200） */
export const PAGE_W = 1200;
export const PAGE_H = 1600;
/** 最多幾頁 */
export const MAX_PAGES = 60;
/** 本文最多幾字 */
export const BODY_MAX = 20_000;

/* ---------- 選項與範圍 ---------- */

/** 本文字級（px） */
export const BODY_SIZES = [22, 24, 26, 28, 30, 32, 34, 36, 40] as const;
/** 選取文字的字級（px） */
export const INLINE_SIZES = [18, 20, 22, 26, 30, 34, 40, 48, 58, 72] as const;
/** 行距（倍數） */
export const LINE_HEIGHTS = [1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.6] as const;
/** 「照片＋文字」的本文比設定小幾 px */
export const PHOTO_BODY_SHRINK = 4;

export const PHOTO_HEIGHT = { min: 200, max: 1100, step: 10 } as const;
export const BLUR_RANGE = { min: 0, max: 24 } as const;
export const SATURATION_RANGE = { min: 0, max: 180 } as const;
export const DIM_RANGE = { min: 0, max: 70 } as const;
export const ANGLE_RANGE = { min: 0, max: 360 } as const;
export const PAGE_START_RANGE = { min: 0, max: 999 } as const;
export const ICON_MAX = 8;
export const TEXT_MAX = 120;
/** 照片、背景圖片的縮放上限（以蓋滿或完整顯示為 1） */
export const ZOOM_MAX = 4;
/** 圖片檔的大小上限（MB）與存進資產庫時的長邊上限（px） */
export const IMAGE_MAX_MB = 40;
export const IMAGE_MAX_SIDE = 3200;
/** 字型檔的大小上限（MB） */
export const FONT_MAX_MB = 40;

/**
 * 文字顏色的常用色（本站自己挑的，D22）：預設字色（墨）、白，其他取自本站調色盤的預設色
 * （ColorField 的 DEFAULT_SWATCHES：灰、紅、橘、黃、綠、藍、紫、棕）。
 */
export const TEXT_SWATCHES = [
  '#1e1a16',
  '#95a5a6',
  '#ffffff',
  '#c0392b',
  '#e67e22',
  '#f1c40f',
  '#27ae60',
  '#2980b9',
  '#7b5ea7',
  '#8e6e53',
] as const;
/**
 * 螢光筆的常用色（本站自己挑的，D22）：本站調色盤的預設色混白——黃 50%、橘 45%、紅 40%、紫 40%、藍 40%、
 * 青 40%、綠 40%、灰 40%（其餘是白）。
 */
export const HIGHLIGHT_SWATCHES = [
  '#f8e287',
  '#f4c59c',
  '#e6b0aa',
  '#cabfdc',
  '#a9cce3',
  '#a3e4d7',
  '#a9dfbf',
  '#d5dbdb',
] as const;

/**
 * 預設的紙色與字色（D22）：紙色是本站平面圖工具的「紙」（floor-plan 的 #f3e8cf），字色是元件展示頁配色「墨與紙」的墨（#1e1a16）；
 * 漸層從紙色到「紙色混 20% 的本站棕色 #8e6e53」，由上往下。
 */
export const PAPER_COLOR = '#f3e8cf';
export const INK_COLOR = '#1e1a16';
export const PAPER_SHADE = '#dfd0b6';

/* ---------- 字型 ---------- */

/** 內建的字型（Google Fonts 的繁中字型；本站自己挑，規格 D2） */
export const FONT_CHOICES = defineFontChoices([
  { family: 'Noto Serif TC', label: '思源宋體', data: { serif: true } },
  { family: 'Noto Sans TC', label: '思源黑體', data: { serif: false } },
  { family: 'LXGW WenKai TC', label: '霞鶩文楷', data: { serif: true } },
  { family: 'Cactus Classical Serif', label: '仙人掌明體', data: { serif: true } },
  { family: 'Chiron Sung HK', label: '昭源宋體', data: { serif: true } },
  { family: 'Chiron Hei HK', label: '昭源黑體', data: { serif: false } },
  { family: 'Chocolate Classical Sans', label: '朱古力黑體', data: { serif: false } },
  { family: 'Huninn', label: '粉圓體', data: { serif: false } },
  { family: 'Iansui', label: '芫荽', data: { serif: false } },
  { family: 'LXGW WenKai Mono TC', label: '霞鶩文楷等寬（打字機風）', data: { serif: true } },
]);
export const DEFAULT_FONT = FONT_CHOICES[0].font.family;

/** 是不是內建的字型（不是的話是使用者自己加的字型） */
export const isBuiltinFont = (family: string): boolean =>
  FONT_CHOICES.some((c) => c.font.family === family) || !!findGoogleFont(family);

/* ---------- 狀態 ---------- */

export type Layout = 'cover' | 'page' | 'photo';
export const LAYOUTS: readonly Layout[] = ['cover', 'page', 'photo'];
export type BgKind = 'solid' | 'gradient' | 'image';
export const BG_KINDS: readonly BgKind[] = ['solid', 'gradient', 'image'];
export type PhotoFit = 'cover' | 'contain';
export const PHOTO_FITS: readonly PhotoFit[] = ['cover', 'contain'];

/** 資產庫裡的一張圖 */
export interface ImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface Background {
  kind: BgKind;
  color: string;
  from: string;
  to: string;
  /** 漸層的角度（CSS 的規則：0° 由下往上、90° 由左往右） */
  angle: number;
  image: ImageRef | null;
  /** 背景圖片的位置（蓋滿為 1） */
  place: FramePlacement;
  /** 模糊（px） */
  blur: number;
  /** 飽和度（%） */
  saturation: number;
  /** 變暗（%） */
  dim: number;
}

export interface Photo {
  image: ImageRef | null;
  /** 照片框的高度（px） */
  height: number;
  fit: PhotoFit;
  /** 照片在框裡的位置（以「蓋滿」或「完整顯示」為 1 的縮放、以框寬高為 1 的位移、轉了幾個 90°） */
  place: FramePlacement;
}

export interface ProseState {
  layout: Layout;
  title: string;
  kicker: string;
  icon: string;
  header: string;
  footerLeft: string;
  footerRight: string;
  autoNumber: boolean;
  pageStart: number;
  /** 整份的字型（family） */
  font: string;
  body: RichDoc;
  align: RichAlign;
  bodySize: number;
  lineHeight: number;
  /** 預設字色 */
  textColor: string;
  texture: boolean;
  bg: Background;
  photo: Photo;
}

export function initialState(): ProseState {
  return {
    layout: 'cover',
    title: SAMPLE.title,
    kicker: SAMPLE.kicker,
    icon: '✦',
    header: SAMPLE.header,
    footerLeft: SAMPLE.footerLeft,
    footerRight: '01',
    autoNumber: true,
    pageStart: 1,
    font: DEFAULT_FONT,
    body: normalizeDoc(SAMPLE.body),
    align: 'left',
    bodySize: 30,
    lineHeight: 1.9,
    textColor: INK_COLOR,
    texture: true,
    bg: {
      kind: 'solid',
      color: PAPER_COLOR,
      from: PAPER_COLOR,
      to: PAPER_SHADE,
      angle: 180,
      image: null,
      place: { ...DEFAULT_PLACEMENT },
      blur: 5,
      saturation: 80,
      dim: 18,
    },
    photo: {
      image: null,
      height: 600,
      fit: 'cover',
      place: { ...DEFAULT_PLACEMENT },
    },
  };
}

/* ---------- 整理存檔、專案檔 ---------- */

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: unknown, fallback: string) =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback;
const str = (v: unknown, fallback: string, max = TEXT_MAX) =>
  typeof v === 'string'
    ? Array.from(v.replace(/[\r\n]+/g, ' '))
        .slice(0, max)
        .join('')
    : fallback;
const num = (v: unknown, fallback: number, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;
const nearest = (v: unknown, list: readonly number[], fallback: number) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), list[0]);
};

function imageRef(v: unknown): ImageRef | null {
  const o = v as Partial<ImageRef> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id) return null;
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name.slice(0, 200) : '',
    width: num(o.width, 1, 1, 100_000),
    height: num(o.height, 1, 1, 100_000),
  };
}

/** 本文（格式化文字）：壞掉時回傳 null */
export function readBody(v: unknown): RichDoc | null {
  try {
    return validateDoc(v, BODY_MAX, { full: true, sizeRange: [8, 200] });
  } catch (e) {
    if (e instanceof RichTextError) return null;
    throw e;
  }
}

/** 存檔、專案檔讀回來的狀態：缺的欄位補預設、超出範圍的夾回、看不懂的換成預設 */
export function normalizeState(raw: unknown): ProseState {
  const d = initialState();
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bg = (o.bg && typeof o.bg === 'object' ? o.bg : {}) as Record<string, unknown>;
  const ph = (o.photo && typeof o.photo === 'object' ? o.photo : {}) as Record<string, unknown>;
  return {
    layout: oneOf(o.layout, LAYOUTS, d.layout),
    title: str(o.title, d.title),
    kicker: str(o.kicker, d.kicker),
    icon: typeof o.icon === 'string' ? Array.from(o.icon).slice(0, ICON_MAX).join('') : d.icon,
    header: str(o.header, d.header),
    footerLeft: str(o.footerLeft, d.footerLeft),
    footerRight: str(o.footerRight, d.footerRight),
    autoNumber: typeof o.autoNumber === 'boolean' ? o.autoNumber : d.autoNumber,
    pageStart: Math.round(
      num(o.pageStart, d.pageStart, PAGE_START_RANGE.min, PAGE_START_RANGE.max),
    ),
    font: typeof o.font === 'string' && o.font.trim() ? o.font.slice(0, 200) : d.font,
    body: readBody(o.body) ?? d.body,
    align: oneOf(o.align, RICH_ALIGNS, d.align),
    bodySize: nearest(o.bodySize, BODY_SIZES, d.bodySize),
    lineHeight: nearest(o.lineHeight, LINE_HEIGHTS, d.lineHeight),
    textColor: hex(o.textColor, d.textColor),
    texture: typeof o.texture === 'boolean' ? o.texture : d.texture,
    bg: {
      kind: oneOf(bg.kind, BG_KINDS, d.bg.kind),
      color: hex(bg.color, d.bg.color),
      from: hex(bg.from, d.bg.from),
      to: hex(bg.to, d.bg.to),
      angle: Math.round(num(bg.angle, d.bg.angle, ANGLE_RANGE.min, ANGLE_RANGE.max)),
      image: imageRef(bg.image),
      place: normalizePlacement(bg.place, { minZoom: 1, maxZoom: ZOOM_MAX, limit: 2 }),
      blur: num(bg.blur, d.bg.blur, BLUR_RANGE.min, BLUR_RANGE.max),
      saturation: num(bg.saturation, d.bg.saturation, SATURATION_RANGE.min, SATURATION_RANGE.max),
      dim: num(bg.dim, d.bg.dim, DIM_RANGE.min, DIM_RANGE.max),
    },
    photo: {
      image: imageRef(ph.image),
      height:
        Math.round(num(ph.height, d.photo.height, PHOTO_HEIGHT.min, PHOTO_HEIGHT.max) / 10) * 10,
      fit: oneOf(ph.fit, PHOTO_FITS, d.photo.fit),
      place: normalizePlacement(ph.place, { minZoom: 0.05, maxZoom: ZOOM_MAX, limit: 4 }),
    },
  };
}

/** 狀態用到的圖（資產 id） */
export const stateAssetIds = (s: ProseState): string[] =>
  [s.bg.image?.id, s.photo.image?.id].filter((x): x is string => !!x);

/** 狀態用到的字型（整份的字型＋本文選取文字的字型） */
export function stateFonts(s: ProseState): string[] {
  const set = new Set<string>([s.font]);
  for (const l of s.body.lines) for (const r of l.runs) if (r.font) set.add(r.font);
  return [...set];
}

/* ---------- 頁碼與檔名 ---------- */

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 頁尾右邊的文字：自動頁碼時是「起始頁碼＋第幾頁−1」（兩位數），否則是頁尾右邊的文字 */
export const footerRightText = (s: ProseState, pageIndex: number): string =>
  s.autoNumber ? pad2(s.pageStart + pageIndex) : s.footerRight;

/** 檔名的主體：標題拿掉不能用的字（換成 -）；空白時「短文圖片」 */
export function fileBase(title: string, fallback: string): string {
  const t = Array.from(title.trim(), (ch) =>
    ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '-' : ch,
  )
    .join('')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\s-]+|[.\s]+$/g, '');
  return Array.from(t).slice(0, 60).join('') || fallback;
}

/** 第 i 頁的檔名（只有一頁時不加頁碼） */
export const pageFileName = (base: string, index: number, total: number): string =>
  total > 1 ? `${base}-${pad2(index + 1)}.png` : `${base}.png`;
