/**
 * 角色切入產生器的資料：演員（立繪＋文字＋臉的位置）、六種型各自的樣式、匯出設定。
 * 全部是純資料（不依賴 React／DOM），存檔、專案檔、復原都搬這一份；立繪本身在資產庫（`store.ts` 的 assets），這裡只記 id。
 */
import type { FontValue } from '@/core/fonts';

export const TOOL_ID = 'char-cutin';
/** 專案檔與自動儲存的資料版本 */
export const DOC_VERSION = 1;

/* ---------- 型 ---------- */

/** 六種型（規格 F20～F26） */
export type CutKind = 'strike' | 'glide' | 'gaze' | 'lift' | 'impact' | 'versus';
export const CUT_KINDS: readonly CutKind[] = [
  'strike',
  'glide',
  'gaze',
  'lift',
  'impact',
  'versus',
];

/* ---------- 範圍 ---------- */

/** 數值欄的範圍（規格 3.2） */
export const RANGES = {
  scale: { min: 40, max: 200, step: 1, def: 100 },
  eyeY: { min: 0, max: 70, step: 0.5 },
  eyeX: { min: 5, max: 95, step: 0.5 },
  zoom: { min: 40, max: 200, step: 1, def: 100 },
  pace: { min: 0.3, max: 1.5, step: 0.05, def: 1 },
  impactX: { min: -60, max: 60, step: 1, def: 0 },
  impactY: { min: -40, max: 40, step: 1, def: 0 },
  impactSize: { min: 40, max: 160, step: 1, def: 100 },
  impactTrack: { min: -40, max: 60, step: 1, def: 0 },
  impactGap: { min: -80, max: 80, step: 1, def: 0 },
} as const;

/** 文字欄的字數上限（字素） */
export const MAX_CHARS = { name: 16, tag: 16, quote: 24, rivalName: 16, impact: 6 } as const;

/* ---------- 資料 ---------- */

export interface Actor {
  id: string;
  /** 資產庫的 id */
  image: string;
  name: string;
  /** 小標題（ROUND 01 等） */
  tag: string;
  /** 一句台詞 */
  quote: string;
  /** 大小（%） */
  scale: number;
  /** 眼睛的高度（圖高的 %，0 在上） */
  eyeY: number;
  /** 臉的橫向位置（圖寬的 %） */
  eyeX: number;
  /** 臉的基準長度（圖高的比例；自動對準算出來，不給使用者改） */
  headLen: number;
  /** 代表色：null＝和全員相同 */
  color: string | null;
}

/** 重擊字的配置（只有「重擊」型用） */
export interface ImpactLayout {
  /** 橫向位置（畫面寬的 %） */
  x: number;
  /** 縱向位置（畫面高的 %） */
  y: number;
  /** 大小（%） */
  size: number;
  /** 字距（字級的 %） */
  track: number;
  /** 逐字的間距（第 i 字與第 i+1 字之間，字級的 %；加在字距上） */
  gaps: number[];
}

/** 一種型的樣式（規格 F27～F33；每種型各自記） */
export interface KindStyle {
  /** 主色：帶、線、小標題（VS 的左側） */
  main: string;
  /** 背景色：立繪後面、窗的底色 */
  base: string;
  /** VS 右側的色 */
  right: string;
  nameFont: FontValue;
  quoteFont: FontValue;
  impactFont: FontValue;
  /** 立繪放大（%；這個型的全員共通倍率） */
  zoom: number;
  /** 速度（倍） */
  pace: number;
  impact: ImpactLayout;
}

export type OutFormat = 'webp' | 'apng' | 'video';
export type OutSize = 'small' | 'large';
export type VideoSize = '720' | '1080';

export interface OutSettings {
  format: OutFormat;
  /** WebP／APNG：small＝640×360（1 MB 以下）、large＝1280×720 */
  size: OutSize;
  videoSize: VideoSize;
  /** 背景：透明或單色（影片一律單色） */
  background: 'clear' | 'color';
  color: string;
  /** 播放一次（播完變透明）；false＝重複 */
  once: boolean;
}

export interface Doc {
  actors: Actor[];
  kind: CutKind;
  styles: Record<CutKind, KindStyle>;
  /** 重擊字（全部的型共用一個字串） */
  impactText: string;
  /** VS 的對手：'mystery'＝謎之剪影，否則演員 id */
  rival: string;
  /** 謎之剪影的名字（空白＝不顯示名字） */
  mysteryName: string;
  out: OutSettings;
}

export const MYSTERY = 'mystery';

/* ---------- 預設值 ---------- */

const gothic = (weight: number): FontValue => ({
  source: 'google',
  family: 'Noto Sans TC',
  weight,
});

/** 主色的色票（本站自己配的） */
export const MAIN_SWATCHES = [
  '#3f7be0',
  '#e2533a',
  '#d9485f',
  '#e5b94a',
  '#2fa58a',
  '#8f6ad8',
  '#f4f2ee',
  '#22202a',
] as const;

/** 背景色的色票 */
export const BASE_SWATCHES = [
  '#141824',
  '#15121c',
  '#13201d',
  '#2a1418',
  '#f3f1ec',
  '#3a3d46',
] as const;

const style = (main: string, base: string, extra: Partial<KindStyle> = {}): KindStyle => ({
  main,
  base,
  right: '#d9485f',
  nameFont: gothic(900),
  quoteFont: gothic(700),
  impactFont: { source: 'google', family: 'Yuji Boku', weight: 400 },
  zoom: RANGES.zoom.def,
  pace: RANGES.pace.def,
  impact: { x: 0, y: 0, size: 100, track: 0, gaps: [] },
  ...extra,
});

/** 每種型的初始樣式（「回到初始值」回到這裡） */
export function defaultStyle(kind: CutKind): KindStyle {
  switch (kind) {
    case 'strike':
      return style('#3f7be0', '#141824');
    case 'glide':
      return style('#e5b94a', '#141824', {
        nameFont: { source: 'google', family: 'Noto Serif TC', weight: 900 },
        pace: 0.9,
      });
    case 'gaze':
      return style('#d9485f', '#15121c');
    case 'lift':
      return style('#2fa58a', '#13201d');
    case 'impact':
      return style('#e2533a', '#15121c');
    case 'versus':
      return style('#3f7be0', '#121420', { right: '#d9485f' });
  }
}

export const DEFAULT_IMPACT_TEXT = '反擊';
export const DEFAULT_MYSTERY_NAME = '？？？';
/** 單色背景與影片的預設顏色（綠幕） */
export const DEFAULT_OUT_COLOR = '#00b140';

export function defaultDoc(): Doc {
  return {
    actors: [],
    kind: 'strike',
    styles: Object.fromEntries(CUT_KINDS.map((k) => [k, defaultStyle(k)])) as Record<
      CutKind,
      KindStyle
    >,
    impactText: DEFAULT_IMPACT_TEXT,
    rival: MYSTERY,
    mysteryName: DEFAULT_MYSTERY_NAME,
    out: {
      format: 'webp',
      size: 'small',
      videoSize: '720',
      background: 'clear',
      color: DEFAULT_OUT_COLOR,
      once: false,
    },
  };
}

/* ---------- 整理（存檔、專案檔讀回） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const clampNum = (v: unknown, min: number, max: number, fallback: number, step = 0): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const c = Math.min(max, Math.max(min, v));
  return step > 0 ? Number((Math.round(c / step) * step).toFixed(6)) : c;
};

const HEX = /^#[0-9a-f]{6}$/i;
const hexOr = (v: unknown, fallback: string): string =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback;

/** 字素數的上限（emoji、組合字不切斷） */
export function clipChars(s: string, max: number): string {
  const seg =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? [...new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }).segment(s)].map(
          (x) => x.segment,
        )
      : Array.from(s);
  return seg.length > max ? seg.slice(0, max).join('') : s;
}

/** 字素清單（重擊字逐字排、算間距用） */
export function graphemes(s: string): string[] {
  return typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }).segment(s)].map(
        (x) => x.segment,
      )
    : Array.from(s);
}

const text = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? clipChars(v.replace(/[\r\n]+/g, ' '), max) : fallback;

const FONT_SOURCES = new Set(['google', 'local', 'upload']);
function cleanFont(v: unknown, fallback: FontValue): FontValue {
  if (!isObj(v)) return fallback;
  const source = typeof v.source === 'string' && FONT_SOURCES.has(v.source) ? v.source : null;
  const family = typeof v.family === 'string' ? v.family.slice(0, 120) : null;
  if (!source || family === null || (!family && source !== 'local')) return fallback;
  return {
    source: source as FontValue['source'],
    family,
    weight: clampNum(v.weight, 100, 900, fallback.weight, 100),
  };
}

function cleanImpact(v: unknown, fallback: ImpactLayout): ImpactLayout {
  if (!isObj(v)) return fallback;
  const R = RANGES;
  const gaps = Array.isArray(v.gaps)
    ? v.gaps
        .slice(0, MAX_CHARS.impact - 1)
        .map((g) => clampNum(g, R.impactGap.min, R.impactGap.max, 0, 1))
    : [];
  while (gaps.length && gaps[gaps.length - 1] === 0) gaps.pop();
  return {
    x: clampNum(v.x, R.impactX.min, R.impactX.max, fallback.x, 1),
    y: clampNum(v.y, R.impactY.min, R.impactY.max, fallback.y, 1),
    size: clampNum(v.size, R.impactSize.min, R.impactSize.max, fallback.size, 1),
    track: clampNum(v.track, R.impactTrack.min, R.impactTrack.max, fallback.track, 1),
    gaps,
  };
}

function cleanStyle(v: unknown, kind: CutKind): KindStyle {
  const d = defaultStyle(kind);
  if (!isObj(v)) return d;
  const R = RANGES;
  return {
    main: hexOr(v.main, d.main),
    base: hexOr(v.base, d.base),
    right: hexOr(v.right, d.right),
    nameFont: cleanFont(v.nameFont, d.nameFont),
    quoteFont: cleanFont(v.quoteFont, d.quoteFont),
    impactFont: cleanFont(v.impactFont, d.impactFont),
    zoom: clampNum(v.zoom, R.zoom.min, R.zoom.max, d.zoom, 1),
    pace: Math.round(clampNum(v.pace, R.pace.min, R.pace.max, d.pace) * 100) / 100,
    impact: cleanImpact(v.impact, d.impact),
  };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function cleanActor(v: unknown): Actor | null {
  if (!isObj(v)) return null;
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) return null;
  if (typeof v.image !== 'string' || !ID_RE.test(v.image)) return null;
  const R = RANGES;
  return {
    id: v.id,
    image: v.image,
    name: text(v.name, MAX_CHARS.name),
    tag: text(v.tag, MAX_CHARS.tag),
    quote: text(v.quote, MAX_CHARS.quote),
    scale: clampNum(v.scale, R.scale.min, R.scale.max, R.scale.def, 1),
    eyeY: clampNum(v.eyeY, R.eyeY.min, R.eyeY.max, 25, 0.1),
    eyeX: clampNum(v.eyeX, R.eyeX.min, R.eyeX.max, 50, 0.1),
    headLen: clampNum(v.headLen, 0.05, 4, 1),
    color: v.color === null || v.color === undefined ? null : hexOr(v.color, '') || null,
  };
}

/** 讀回的資料整理成合法的 Doc（缺的補預設、壞的丟掉、數值夾在範圍內） */
export function cleanDoc(v: unknown): Doc {
  const d = defaultDoc();
  if (!isObj(v)) return d;
  const seen = new Set<string>();
  const actors: Actor[] = [];
  if (Array.isArray(v.actors))
    for (const a of v.actors) {
      const c = cleanActor(a);
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        actors.push(c);
      }
    }
  const styles = { ...d.styles };
  const rawStyles = isObj(v.styles) ? v.styles : {};
  for (const k of CUT_KINDS) styles[k] = cleanStyle(rawStyles[k], k);
  const o = isObj(v.out) ? v.out : {};
  const rival = typeof v.rival === 'string' && seen.has(v.rival) ? v.rival : MYSTERY;
  return {
    actors,
    kind: CUT_KINDS.includes(v.kind as CutKind) ? (v.kind as CutKind) : d.kind,
    styles,
    impactText: text(v.impactText, MAX_CHARS.impact, d.impactText),
    rival,
    mysteryName: text(v.mysteryName, MAX_CHARS.rivalName, d.mysteryName),
    out: {
      format: (['webp', 'apng', 'video'] as const).includes(o.format as OutFormat)
        ? (o.format as OutFormat)
        : d.out.format,
      size: o.size === 'large' ? 'large' : 'small',
      videoSize: o.videoSize === '1080' ? '1080' : '720',
      background: o.background === 'color' ? 'color' : 'clear',
      color: hexOr(o.color, d.out.color),
      once: o.once === true,
    },
  };
}

/* ---------- 演員 ---------- */

/** VS 的對手（演員；謎之剪影或找不到時 null） */
export function rivalActor(d: Pick<Doc, 'actors' | 'rival'>): Actor | null {
  return d.rival === MYSTERY ? null : (d.actors.find((a) => a.id === d.rival) ?? null);
}

/** 換位置（上移／下移、拖曳排序） */
export function moveActor(list: readonly Actor[], from: number, to: number): Actor[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length)
    return [...list];
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}
