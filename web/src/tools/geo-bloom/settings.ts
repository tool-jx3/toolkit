/**
 * 幾何花紋產生器的設定：欄位、預設值與範圍（規格第 1 節、4.）、讀檔整理（2.、3.8）、
 * 畫圖用的設定（百分比換成比例、最小大於最大時互換、種類清單；F08、F34）、檔名（3.9）。
 * 純資料與規則，不依賴 React 與 DOM（Worker 也用）。
 */
import { fileNameWithExt } from '@/core/files';
import { type Schema, sanitize, sh } from '@/core/share';

/** 圖形的種類（這個順序就是抽種類時的清單順序） */
export const SHAPE_KINDS = ['circle', 'rings', 'semi', 'mix', 'square', 'doubleSquare'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** 子圖形和既有圖形重疊時：換角度重試、只畫線、整條線取消 */
export const OVERLAP_MODES = ['retry', 'line', 'skip'] as const;
export type OverlapMode = (typeof OVERLAP_MODES)[number];

export interface Settings {
  /** 種子（空白時當成「0」） */
  seed: string;
  /** 固定種子：「產生」時不換種子 */
  lockSeed: boolean;
  width: number;
  height: number;
  /** 圖形的最多數（含中央圓） */
  maxShapes: number;
  /** 線的最多數（全部） */
  maxLines: number;
  /** 每個圖形的線數：最少、最多 */
  branchMin: number;
  branchMax: number;
  /** 最大深度（代） */
  maxDepth: number;
  /** 同心圓的最多層數 */
  maxRings: number;
  /** 中央圓的外半徑：最小、最大（px） */
  rootMin: number;
  rootMax: number;
  /** 子圖形的外半徑：最小、最大（px，再乘縮小倍率） */
  childMin: number;
  childMax: number;
  /** 每代的縮小率（%） */
  shrink: number;
  /** 線長：最小、最大（px，再乘縮小倍率） */
  lineMin: number;
  lineMax: number;
  /** 線的末端放圖形（%） */
  pShape: number;
  /** 圖形再長線（%，中央圓一定長） */
  pBranch: number;
  /** 線的末端加點（%） */
  pDot: number;
  /** 角度的等間隔程度（%） */
  regularity: number;
  /** 勾選的圖形種類 */
  shapes: Record<ShapeKind, boolean>;
  /** 不和既有圖形重疊 */
  avoidOverlap: boolean;
  overlapMode: OverlapMode;
  /** 圖形間的空隙（px） */
  gap: number;
  /** 線不穿過既有圖形 */
  lineAvoid: boolean;
  /** 收在畫布內 */
  inBounds: boolean;
  background: string;
  transparent: boolean;
  lineColor: string;
  accentColor: string;
  /** 強調色的比例（%） */
  pAccent: number;
  /** 線寬（px，0.25 一格） */
  lineWidth: number;
  /** 塗滿的比例（%） */
  pFill: number;
  /** 線從圖形的邊緣出發 */
  fromEdge: boolean;
}

export type NumericKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

/** 數值的範圍（照原作的欄位） */
export const RANGE: Record<NumericKey, readonly [number, number]> = {
  width: [64, 8000],
  height: [64, 8000],
  maxShapes: [1, 5000],
  maxLines: [0, 10000],
  branchMin: [0, 100],
  branchMax: [0, 100],
  maxDepth: [0, 40],
  maxRings: [1, 50],
  rootMin: [10, 1500],
  rootMax: [10, 2000],
  childMin: [1, 800],
  childMax: [1, 1200],
  shrink: [30, 100],
  lineMin: [1, 3000],
  lineMax: [1, 4000],
  pShape: [0, 100],
  pBranch: [0, 100],
  pDot: [0, 100],
  regularity: [0, 100],
  gap: [0, 400],
  pAccent: [0, 100],
  lineWidth: [0.25, 40],
  pFill: [0, 100],
};

/** 線寬的一格 */
export const LINE_WIDTH_STEP = 0.25;
export const SEED_MAX_LENGTH = 100;

export const DEFAULT_SETTINGS: Settings = {
  seed: 'bloom',
  lockSeed: false,
  width: 1600,
  height: 1600,
  maxShapes: 60,
  maxLines: 120,
  branchMin: 2,
  branchMax: 7,
  maxDepth: 4,
  maxRings: 5,
  rootMin: 60,
  rootMax: 180,
  childMin: 12,
  childMax: 70,
  shrink: 75,
  lineMin: 60,
  lineMax: 260,
  pShape: 70,
  pBranch: 65,
  pDot: 40,
  regularity: 50,
  shapes: { circle: true, rings: true, semi: true, mix: true, square: true, doubleSquare: true },
  avoidOverlap: true,
  overlapMode: 'retry',
  gap: 8,
  lineAvoid: false,
  inBounds: true,
  background: '#0e0f12',
  transparent: false,
  lineColor: '#e8e4da',
  accentColor: '#d9a441',
  pAccent: 15,
  lineWidth: 2,
  pFill: 10,
  fromEdge: true,
};

/** 數值夾到範圍並取格（整數；線寬取 0.25 的倍數） */
export function clampValue(key: NumericKey, value: number): number {
  const [min, max] = RANGE[key];
  const v = Number.isFinite(value) ? value : DEFAULT_SETTINGS[key];
  const snapped =
    key === 'lineWidth' ? Math.round(v / LINE_WIDTH_STEP) * LINE_WIDTH_STEP : Math.round(v);
  return Math.min(max, Math.max(min, snapped));
}

/* ---------- 讀檔整理（自動儲存、專案檔） ---------- */

const numberSchema = (key: NumericKey): Schema<number> => ({
  fallback: DEFAULT_SETTINGS[key],
  parse(v) {
    const n =
      typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN;
    return Number.isFinite(n) ? clampValue(key, n) : DEFAULT_SETTINGS[key];
  },
});

/** 不透明的 #rrggbb（#rgb 展開；其他寫法用預設） */
const opaqueColor = (fallback: string): Schema<string> => ({
  fallback,
  parse(v) {
    if (typeof v !== 'string') return fallback;
    const s = v.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
    return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : fallback;
  },
});

const d = DEFAULT_SETTINGS;
const SETTINGS_SCHEMA = sh.object({
  seed: sh.string({ default: d.seed, maxLength: SEED_MAX_LENGTH }),
  lockSeed: sh.boolean(d.lockSeed),
  ...(Object.fromEntries(
    (Object.keys(RANGE) as NumericKey[]).map((k) => [k, numberSchema(k)]),
  ) as Record<NumericKey, Schema<number>>),
  shapes: sh.object(
    Object.fromEntries(SHAPE_KINDS.map((k) => [k, sh.boolean(d.shapes[k])])) as Record<
      ShapeKind,
      Schema<boolean>
    >,
  ),
  avoidOverlap: sh.boolean(d.avoidOverlap),
  overlapMode: sh.oneOf(OVERLAP_MODES, d.overlapMode),
  lineAvoid: sh.boolean(d.lineAvoid),
  inBounds: sh.boolean(d.inBounds),
  background: opaqueColor(d.background),
  transparent: sh.boolean(d.transparent),
  lineColor: opaqueColor(d.lineColor),
  accentColor: opaqueColor(d.accentColor),
  fromEdge: sh.boolean(d.fromEdge),
});

/** 不可信的資料（localStorage、專案檔）→ 完整的設定 */
export function sanitizeSettings(raw: unknown): Settings {
  const s = sanitize(SETTINGS_SCHEMA, raw);
  /* 欄位依 DEFAULT_SETTINGS 的順序排（存檔、比對都穩定） */
  return Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((k) => [k, s[k]]),
  ) as unknown as Settings;
}

/** 專案檔看起來是不是這個工具的設定 */
export function looksLikeSettings(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    typeof o.shapes === 'object' &&
    o.shapes !== null
  );
}

/* ---------- 畫圖用的設定 ---------- */

/** 產生與繪製用的設定：百分比換成比例（除以 100）、最小大於最大時互換、勾選的種類清單 */
export interface BloomConfig {
  width: number;
  height: number;
  maxShapes: number;
  maxLines: number;
  branchMin: number;
  branchMax: number;
  maxDepth: number;
  maxRings: number;
  rootMin: number;
  rootMax: number;
  childMin: number;
  childMax: number;
  /** 比例（0.3～1） */
  shrink: number;
  lineMin: number;
  lineMax: number;
  /** 以下為 0～1 的比例 */
  pShape: number;
  pBranch: number;
  pDot: number;
  regularity: number;
  pAccent: number;
  pFill: number;
  /** 抽種類用的清單（至少一個） */
  shapes: readonly ShapeKind[];
  avoidOverlap: boolean;
  overlapMode: OverlapMode;
  gap: number;
  lineAvoid: boolean;
  inBounds: boolean;
  background: string;
  transparent: boolean;
  lineColor: string;
  accentColor: string;
  lineWidth: number;
  fromEdge: boolean;
}

const ordered = (a: number, b: number): [number, number] => (a > b ? [b, a] : [a, b]);

export function resolveConfig(s: Settings): BloomConfig {
  const [branchMin, branchMax] = ordered(s.branchMin, s.branchMax);
  const [rootMin, rootMax] = ordered(s.rootMin, s.rootMax);
  const [childMin, childMax] = ordered(s.childMin, s.childMax);
  const [lineMin, lineMax] = ordered(s.lineMin, s.lineMax);
  const shapes = SHAPE_KINDS.filter((k) => s.shapes[k]);
  /* 百分比一律「除以 100」：乘 0.01 的結果偶爾差一個位元，後面的比較就可能翻轉（規格 5.） */
  return {
    width: Math.min(RANGE.width[1], Math.max(RANGE.width[0], s.width)),
    height: Math.min(RANGE.height[1], Math.max(RANGE.height[0], s.height)),
    maxShapes: s.maxShapes,
    maxLines: s.maxLines,
    branchMin,
    branchMax,
    maxDepth: s.maxDepth,
    maxRings: s.maxRings,
    rootMin,
    rootMax,
    childMin,
    childMax,
    shrink: s.shrink / 100,
    lineMin,
    lineMax,
    pShape: s.pShape / 100,
    pBranch: s.pBranch / 100,
    pDot: s.pDot / 100,
    regularity: s.regularity / 100,
    pAccent: s.pAccent / 100,
    pFill: s.pFill / 100,
    shapes: shapes.length ? shapes : ['circle'],
    avoidOverlap: s.avoidOverlap,
    overlapMode: s.overlapMode,
    gap: s.gap,
    lineAvoid: s.lineAvoid,
    inBounds: s.inBounds,
    background: s.background,
    transparent: s.transparent,
    lineColor: s.lineColor,
    accentColor: s.accentColor,
    lineWidth: s.lineWidth,
    fromEdge: s.fromEdge,
  };
}

/** 匯出的檔名：geometric_<種子>.<副檔名>（不能用的字元換成「_」） */
export function exportFileName(seed: string, ext: 'png' | 'svg'): string {
  return fileNameWithExt(`geometric_${seed}`, ext, {
    fallback: 'geometric',
    maxLength: SEED_MAX_LENGTH + 20,
  });
}
