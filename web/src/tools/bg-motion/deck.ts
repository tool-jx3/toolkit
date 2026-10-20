/**
 * 「圖片切換」模式的資料（規格 3.11.1、3.11.10）：圖片清單與每張的秒數／效果、一次設定、頭尾演出、整體設定、匯出設定，
 * 以及資料整理（讀自動儲存、專案檔時檢查型別與範圍）。純資料與純函式，不碰畫布。
 */
import type { AssetImageRef } from '@/core/assets';

/* ---------- 效果 ---------- */

/** 26 個效果，順序＝對話框與「隨機」的順序（規格 3.11.6）；字母＝新圖進來的方向：R 右、L 左、B 下、T 上 */
export const TRANS_KINDS = [
  'cut',
  'fade',
  'dipblack',
  'dipwhite',
  'slideR',
  'slideL',
  'slideB',
  'slideT',
  'coverR',
  'coverL',
  'coverB',
  'coverT',
  'wipeR',
  'wipeL',
  'wipeB',
  'wipeT',
  'zoomIn',
  'zoomOut',
  'circle',
  'circleClose',
  'blindsV',
  'blindsH',
  'blur',
  'pixelate',
  'flip',
  'random',
] as const;

export type TransKind = (typeof TRANS_KINDS)[number];
/** 實際會畫的效果（不含「不切換」與「隨機」） */
export type ConcreteKind = Exclude<TransKind, 'cut' | 'random'>;

/** 「隨機」抽的 24 個效果（上表由上到下，不含「不切換」與「隨機」） */
export const RANDOM_POOL: readonly ConcreteKind[] = TRANS_KINDS.filter(
  (k): k is ConcreteKind => k !== 'cut' && k !== 'random',
);

export const isTransKind = (v: unknown): v is TransKind =>
  typeof v === 'string' && (TRANS_KINDS as readonly string[]).includes(v);

export const DECK_FITS = ['contain', 'cover', 'stretch'] as const;
export type DeckFit = (typeof DECK_FITS)[number];
export const DECK_EASINGS = ['inout', 'out', 'linear'] as const;
export type DeckEasing = (typeof DECK_EASINGS)[number];
export const DECK_FORMATS = ['webp', 'apng', 'gif'] as const;
export type DeckFormat = (typeof DECK_FORMATS)[number];
/** 圖片切換的 FPS 選項（只影響切換段的影格數） */
export const DECK_FPS = [10, 12, 15, 20, 24, 30] as const;

/* ---------- 範圍與預設（規格第 2 節） ---------- */

export interface Limit {
  min: number;
  max: number;
  def: number;
}

export const LIMITS = {
  /** 顯示秒數 */
  hold: { min: 0.1, max: 60, def: 1.5 },
  /** 切換秒數（每張、一次設定、頭尾） */
  dur: { min: 0.1, max: 10, def: 0.8 },
  width: { min: 16, max: 4096, def: 640 },
  height: { min: 16, max: 4096, def: 360 },
  quality: { min: 10, max: 100, def: 90 },
  plays: { min: 1, max: 1000, def: 1 },
  cap: { min: 0.1, max: 100, def: 5 },
} as const satisfies Record<string, Limit>;

/** 圖片的長邊上限（輸出最大 4096，再大用不到） */
export const DECK_IMAGE_MAX_SIDE = 4096;
/** 影格數上限（匯出） */
export const DECK_MAX_FRAMES = 4000;
/** 資訊列在影格數超過這個數字時加警告 */
export const DECK_MANY_FRAMES = 400;

/** 數字欄：空白或不是數字＝預設值，超出範圍夾進範圍（不是整格的值照用） */
export function clampNum(v: unknown, limit: Limit): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  const x = Number.isFinite(n) ? n : limit.def;
  return Math.min(limit.max, Math.max(limit.min, x));
}

/* ---------- 資料 ---------- */

export interface DeckSlide {
  /** 清單裡這一列的識別（複製會換新的；圖片 id 是內容雜湊，複製的列共用同一張） */
  uid: string;
  image: AssetImageRef;
  hold: number;
  /** 切到下一張的效果 */
  trans: TransKind;
  dur: number;
}

export interface DeckEdge {
  trans: TransKind;
  dur: number;
}

export interface DeckBulk {
  hold: number;
  trans: TransKind;
  dur: number;
}

export interface DeckState {
  slides: DeckSlide[];
  bulk: DeckBulk;
  intro: DeckEdge;
  outro: DeckEdge;
  width: number;
  height: number;
  fit: DeckFit;
  bg: string;
  transparent: boolean;
  loopBack: boolean;
  easing: DeckEasing;
  /** 抽籤種子 */
  seed: number;
  format: DeckFormat;
  fps: number;
  quality: number;
  /** 播放次數：0＝無限循環 */
  plays: number;
  quantize: boolean;
  capOn: boolean;
  capMb: number;
}

/** 清單列的識別碼（夠不重複即可） */
export const newUid = (): string =>
  `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const initialDeck = (): DeckState => ({
  slides: [],
  bulk: { hold: LIMITS.hold.def, trans: 'fade', dur: LIMITS.dur.def },
  intro: { trans: 'cut', dur: LIMITS.dur.def },
  outro: { trans: 'cut', dur: LIMITS.dur.def },
  width: LIMITS.width.def,
  height: LIMITS.height.def,
  fit: 'contain',
  bg: '#ffffff',
  transparent: false,
  loopBack: false,
  easing: 'inout',
  seed: 0,
  format: 'webp',
  fps: 15,
  quality: LIMITS.quality.def,
  plays: 0,
  quantize: false,
  capOn: true,
  capMb: LIMITS.cap.def,
});

/** 預設尺寸（F123） */
export const SIZE_PRESETS: readonly (readonly [number, number])[] = [
  [400, 400],
  [512, 512],
  [800, 800],
  [800, 450],
  [1280, 720],
  [1080, 1080],
];

/** 「照第一張」：第一張的尺寸，長邊超過 800 px 時等比縮小到長邊 800 px（至少 16 px） */
export function fitFirstSize(w: number, h: number): { width: number; height: number } {
  const r = Math.min(1, 800 / Math.max(1, w, h));
  return {
    width: Math.max(LIMITS.width.min, Math.round(w * r)),
    height: Math.max(LIMITS.height.min, Math.round(h * r)),
  };
}

/** 用到的圖片 id（每個一次） */
export const deckAssetIds = (d: Pick<DeckState, 'slides'>): string[] => [
  ...new Set(d.slides.map((s) => s.image.id)),
];

/* ---------- 整理（讀自動儲存、專案檔） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const oneOf = <T extends string>(v: unknown, list: readonly T[], def: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : def;

const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);

const edgeOf = (v: unknown): DeckEdge => {
  const o = isObj(v) ? v : {};
  return {
    trans: isTransKind(o.trans) ? o.trans : 'cut',
    dur: clampNum(o.dur, LIMITS.dur),
  };
};

function imageOf(v: unknown): AssetImageRef | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const dim = (x: unknown) => {
    const n = typeof x === 'number' ? x : Number.parseFloat(String(x ?? ''));
    return Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1;
  };
  return {
    id: v.id,
    name: typeof v.name === 'string' ? v.name : '',
    width: dim(v.width),
    height: dim(v.height),
  };
}

/**
 * 把讀進來的資料（自動儲存、專案檔，型別未知）整理成合法的 DeckState：
 * 每個欄位檢查型別，數值夾進範圍，不認得的效果／選項換成預設，沒有圖片 id 的列丟掉，列的識別碼不重複。
 */
export function normalizeDeck(raw: unknown): DeckState {
  const base = initialDeck();
  if (!isObj(raw)) return base;
  const seen = new Set<string>();
  const slides: DeckSlide[] = [];
  for (const item of Array.isArray(raw.slides) ? raw.slides : []) {
    if (!isObj(item)) continue;
    const image = imageOf(item.image);
    if (!image) continue;
    let uid = typeof item.uid === 'string' && item.uid ? item.uid : newUid();
    while (seen.has(uid)) uid = newUid();
    seen.add(uid);
    slides.push({
      uid,
      image,
      hold: clampNum(item.hold, LIMITS.hold),
      trans: isTransKind(item.trans) ? item.trans : 'fade',
      dur: clampNum(item.dur, LIMITS.dur),
    });
  }
  const bulk = isObj(raw.bulk) ? raw.bulk : {};
  const plays = typeof raw.plays === 'number' ? Math.round(raw.plays) : 0;
  const seed = typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? Math.floor(raw.seed) : 0;
  const fps = typeof raw.fps === 'number' ? raw.fps : base.fps;
  return {
    slides,
    bulk: {
      hold: clampNum(bulk.hold, LIMITS.hold),
      trans: isTransKind(bulk.trans) ? bulk.trans : 'fade',
      dur: clampNum(bulk.dur, LIMITS.dur),
    },
    intro: edgeOf(raw.intro),
    outro: edgeOf(raw.outro),
    width: Math.round(clampNum(raw.width, LIMITS.width)),
    height: Math.round(clampNum(raw.height, LIMITS.height)),
    fit: oneOf(raw.fit, DECK_FITS, base.fit),
    bg:
      typeof raw.bg === 'string' && /^#[0-9a-f]{6}$/i.test(raw.bg) ? raw.bg.toLowerCase() : base.bg,
    transparent: bool(raw.transparent, base.transparent),
    loopBack: bool(raw.loopBack, base.loopBack),
    easing: oneOf(raw.easing, DECK_EASINGS, base.easing),
    seed: Math.max(0, seed),
    format: oneOf(raw.format, DECK_FORMATS, base.format),
    fps: (DECK_FPS as readonly number[]).includes(fps) ? fps : base.fps,
    quality: Math.round(clampNum(raw.quality, LIMITS.quality)),
    plays: plays >= 1 ? Math.min(LIMITS.plays.max, plays) : 0,
    quantize: bool(raw.quantize, base.quantize),
    capOn: bool(raw.capOn, base.capOn),
    capMb: clampNum(raw.capMb, LIMITS.cap),
  };
}
