/**
 * 刮刮卡的內容（自動儲存、專案檔、復原的對象）與整理規則。純函式，不依賴瀏覽器。
 * 規格：docs/refactor/specs/scratch-card.md（第 1、2、3.9 節）。
 */
import { S } from './strings';

/* ---------- 型別 ---------- */

export type ContentKind = 'icons' | 'sentence' | 'image-icon' | 'image-full';
export const CONTENT_KINDS: readonly ContentKind[] = [
  'icons',
  'sentence',
  'image-icon',
  'image-full',
];

export type CoverShape = 'zone' | 'circle' | 'rect';
export const COVER_SHAPES: readonly CoverShape[] = ['zone', 'circle', 'rect'];

export type ImageStyle = 'rounded' | 'circle' | 'square' | 'circle-flat' | 'contain';
export const IMAGE_STYLES: readonly ImageStyle[] = [
  'rounded',
  'circle',
  'square',
  'circle-flat',
  'contain',
];

export type BgFit = 'cover' | 'contain';
export const BG_FITS: readonly BgFit[] = ['cover', 'contain'];

/** 標題的位置：t／m／b（上中下）＋ l／c／r（左中右），同共用的 AnchorPicker */
export type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
export const ANCHORS: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

/** 上傳的圖（資產庫的 id）或網址 */
export type ImageRef =
  | { kind: 'asset'; id: string; name: string; width: number; height: number }
  | { kind: 'url'; url: string; name: string };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScratchState {
  /** 進階設定（原作的專家模式；關閉時背景、刮開區、標題、句子顏色、塗層形狀都不作用） */
  expert: boolean;
  /** 自己指定種子（抽新的一張時不換種子） */
  fixedSeed: boolean;
  seed: number;
  width: number;
  height: number;
  bgColor: string;
  bgImage: ImageRef | null;
  bgFit: BgFit;
  zone: Rect;
  titleText: string;
  titleColor: string;
  titleSize: number;
  titlePos: Anchor;
  coverText: string;
  coverColor: string;
  brush: number;
  kind: ContentKind;
  count: number;
  coverShape: CoverShape;
  sentences: string;
  sentenceSize: number;
  sentenceColor: string;
  imageSize: number;
  imageStyle: ImageStyle;
  trim: boolean;
  images: ImageRef[];
}

/* ---------- 範圍與預設 ---------- */

export const LIMITS = {
  width: [100, 1200],
  height: [60, 1200],
  zoneXY: [0, 1199],
  zoneWH: [1, 1200],
  titleSize: [8, 120],
  brush: [10, 80],
  count: [1, 10],
  sentenceSize: [8, 120],
  imageSize: [20, 300],
  /** 以 32 位元計（負數、超過 2^31 的照樣可以；原作同） */
  seed: [-2_147_483_648, 4_294_967_295],
  coverText: 30,
  titleText: 60,
  sentences: 5000,
  images: 30,
  url: 2000,
} as const;

/** 圖片的長邊超過這個值時先縮小再存（規格 2.） */
export const IMAGE_MAX_SIDE = 1024;

export const DEFAULT_COVER_COLOR = '#9ca3af';
export const DEFAULT_TEXT_COLOR = '#1f2937';

/** 隨機種子（沒有自己指定時抽新的一張用；原作 0～999,999） */
export const randomSeed = (): number => Math.floor(Math.random() * 1_000_000);

export function initialState(seed = randomSeed()): ScratchState {
  return {
    expert: false,
    fixedSeed: false,
    seed,
    width: 350,
    height: 180,
    bgColor: '#ffffff',
    bgImage: null,
    bgFit: 'cover',
    zone: { x: 20, y: 20, w: 310, h: 140 },
    titleText: '',
    titleColor: DEFAULT_TEXT_COLOR,
    titleSize: 18,
    titlePos: 'tc',
    coverText: S.defaultCoverText,
    coverColor: DEFAULT_COVER_COLOR,
    brush: 35,
    kind: 'icons',
    count: 3,
    coverShape: 'zone',
    sentences: S.defaultSentences.join('\n'),
    sentenceSize: 28,
    sentenceColor: DEFAULT_TEXT_COLOR,
    imageSize: 80,
    imageStyle: 'rounded',
    trim: false,
    images: [],
  };
}

/* ---------- 文字 ---------- */

const chars = (s: string) => Array.from(s);

/** 單行：換行與控制字元換成空白，截到上限（字元計） */
export function oneLine(text: string, max: number): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 控制字元換成空白
  const s = String(text ?? '').replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ');
  const c = chars(s);
  return c.length > max ? c.slice(0, max).join('') : s;
}

/** 多行：統一換行，截到上限 */
export function multiLine(text: string, max: number): string {
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  const c = chars(s);
  return c.length > max ? c.slice(0, max).join('') : s;
}

/** 句子清單：一行一句，空白行不算（句子照原樣，不去頭尾空白；原作同） */
export const sentenceList = (text: string): string[] =>
  text.split('\n').filter((t) => t.trim() !== '');

/* ---------- 網址 ---------- */

/** http(s) 圖片網址（去頭尾空白；不合格時 null） */
export function cleanImageUrl(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s || chars(s).length > LIMITS.url || !/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return s;
  } catch {
    return null;
  }
}

/** 網址圖片的名稱：網址最後一段（沒有時主機名稱） */
export function urlImageName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponentSafe(last) : u.hostname;
  } catch {
    return url;
  }
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/* ---------- 整理（讀回自動儲存、專案檔、分享連結） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function clampInt(v: unknown, [min, max]: readonly [number, number], fallback: number) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 不透明的 #rrggbb（#rgb 展開、轉小寫）；不合格時 fallback */
export function cleanColor(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map((c) => c + c).join('')}`;
  return fallback;
}

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

/** 一張圖片的參照（壞掉時 null） */
export function cleanImageRef(v: unknown): ImageRef | null {
  if (!isObj(v)) return null;
  if (v.kind === 'url') {
    const url = typeof v.url === 'string' ? cleanImageUrl(v.url) : null;
    if (!url) return null;
    return { kind: 'url', url, name: oneLine(str(v.name, '') || urlImageName(url), 200) };
  }
  if (v.kind === 'asset' && typeof v.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v.id)) {
    const w = clampInt(v.width, [1, 100_000], 1);
    const h = clampInt(v.height, [1, 100_000], 1);
    return { kind: 'asset', id: v.id, name: oneLine(str(v.name, ''), 200), width: w, height: h };
  }
  return null;
}

export function normalizeState(raw: unknown): ScratchState {
  const base = initialState(0);
  const d = isObj(raw) ? raw : {};
  const zone = isObj(d.zone) ? d.zone : {};
  const images = Array.isArray(d.images)
    ? d.images
        .map(cleanImageRef)
        .filter((x): x is ImageRef => !!x)
        .slice(0, LIMITS.images)
    : [];
  return {
    expert: bool(d.expert, base.expert),
    fixedSeed: bool(d.fixedSeed, base.fixedSeed),
    seed: clampInt(d.seed, LIMITS.seed, randomSeed()),
    width: clampInt(d.width, LIMITS.width, base.width),
    height: clampInt(d.height, LIMITS.height, base.height),
    bgColor: cleanColor(d.bgColor, base.bgColor),
    bgImage: d.bgImage ? cleanImageRef(d.bgImage) : null,
    bgFit: oneOf(d.bgFit, BG_FITS, base.bgFit),
    zone: {
      x: clampInt(zone.x, LIMITS.zoneXY, base.zone.x),
      y: clampInt(zone.y, LIMITS.zoneXY, base.zone.y),
      w: clampInt(zone.w, LIMITS.zoneWH, base.zone.w),
      h: clampInt(zone.h, LIMITS.zoneWH, base.zone.h),
    },
    titleText: oneLine(str(d.titleText, base.titleText), LIMITS.titleText),
    titleColor: cleanColor(d.titleColor, base.titleColor),
    titleSize: clampInt(d.titleSize, LIMITS.titleSize, base.titleSize),
    titlePos: oneOf(d.titlePos, ANCHORS, base.titlePos),
    coverText: oneLine(str(d.coverText, base.coverText), LIMITS.coverText),
    coverColor: cleanColor(d.coverColor, base.coverColor),
    brush: clampInt(d.brush, LIMITS.brush, base.brush),
    kind: oneOf(d.kind, CONTENT_KINDS, base.kind),
    count: clampInt(d.count, LIMITS.count, base.count),
    coverShape: oneOf(d.coverShape, COVER_SHAPES, base.coverShape),
    sentences: multiLine(str(d.sentences, base.sentences), LIMITS.sentences),
    sentenceSize: clampInt(d.sentenceSize, LIMITS.sentenceSize, base.sentenceSize),
    sentenceColor: cleanColor(d.sentenceColor, base.sentenceColor),
    imageSize: clampInt(d.imageSize, LIMITS.imageSize, base.imageSize),
    imageStyle: oneOf(d.imageStyle, IMAGE_STYLES, base.imageStyle),
    trim: bool(d.trim, base.trim),
    images,
  };
}

/** 狀態裡用到的資產 id（背景圖＋上傳的圖片） */
export function assetIds(d: Pick<ScratchState, 'bgImage' | 'images'>): string[] {
  const out: string[] = [];
  if (d.bgImage?.kind === 'asset') out.push(d.bgImage.id);
  for (const im of d.images) if (im.kind === 'asset') out.push(im.id);
  return out;
}

/** 圖片的辨識鍵（快取、對照用） */
export const imageKey = (im: ImageRef): string =>
  im.kind === 'asset' ? `a:${im.id}` : `u:${im.url}`;
