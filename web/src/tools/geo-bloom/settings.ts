/**
 * 幾何花紋產生器的設定：欄位、預設值與範圍（規格第 1 節、4.、1.11 原作 2026-10 更新）、讀檔整理（2.、3.8，含舊版資料的轉換）、
 * 畫圖用的設定（百分比換成比例、最小大於最大時互換、種類清單；F08、F34）、檔名（3.9）。
 * 純資料與規則，不依賴 React 與 DOM（Worker 也用）。
 */
import { fileNameWithExt } from '@/core/files';
import { type Schema, sanitize, sh } from '@/core/share';

/** 圖形的種類（這個順序就是抽種類時的清單順序） */
export const SHAPE_KINDS = ['circle', 'rings', 'semi', 'mix', 'square', 'doubleSquare'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** 三角形的圖形（原作 2026-10）：三角心＝最內層換成三角形；三角環＝三角形內接在某一層圓裡 */
export const TRI_KINDS = ['triCore', 'triRing'] as const;
export type TriKind = (typeof TRI_KINDS)[number];

/** 「圖形的種類」的勾選（六種＋兩種三角形） */
export const SHAPE_TOGGLES = [...SHAPE_KINDS, ...TRI_KINDS] as const;
export type ShapeToggle = (typeof SHAPE_TOGGLES)[number];

/** 子圖形和既有圖形重疊時：換角度重試、只畫線、整條線取消 */
export const OVERLAP_MODES = ['retry', 'line', 'skip'] as const;
export type OverlapMode = (typeof OVERLAP_MODES)[number];

/** 放射線從同心圓的哪一圈出發：第一圈、第二圈、第一或第二圈、最外圈、中心、每條線各自從實線的內圈隨機選 */
export const START_RINGS = ['ring1', 'ring2', 'ring12', 'edge', 'center', 'any'] as const;
export type StartRing = (typeof START_RINGS)[number];

/** 三角環內接在哪一圈：第一圈（最內層）、第二圈、隨機 */
export const TRI_RINGS = ['first', 'second', 'random'] as const;
export type TriRing = (typeof TRI_RINGS)[number];

/** 把種子刻進圖形的方式：新（自然符號）、舊（環上的二進位） */
export const CODE_VERSIONS = ['v2', 'v1'] as const;
export type CodeVersion = (typeof CODE_VERSIONS)[number];

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
  /** 不畫線、直接貼著父圖形放子圖形（%） */
  pAttach: number;
  /** 貼著放時嵌進父圖形的程度（%，負的＝離開一點） */
  attachDepth: number;
  /** 線的丟失率（%）：連到子圖形的線不畫 */
  pDrop: number;
  /** 角度的等間隔程度（%） */
  regularity: number;
  /** 勾選的圖形種類 */
  shapes: Record<ShapeToggle, boolean>;
  /** 三角形的出現率（%；有勾三角形、也有勾其他種類時） */
  pTri: number;
  /** 三角環內接在哪一圈 */
  triRing: TriRing;
  /** 不和既有圖形重疊 */
  avoidOverlap: boolean;
  overlapMode: OverlapMode;
  /** 圖形間的空隙（px） */
  gap: number;
  /** 線不穿過既有圖形 */
  lineAvoid: boolean;
  /** 線不跨過既有的線 */
  noCross: boolean;
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
  /** 線從圖形的邊緣出發（圓、正方形、半圓這些單純的圖形） */
  fromEdge: boolean;
  /** 放射線的起點（同心圓） */
  startRing: StartRing;
  /** 連到子圖形的同心圓時，也接在同一圈 */
  endAtRing: boolean;
  /** 中央一定是同心圓 */
  rootRings: boolean;
  /** 同心圓的最少層數 */
  minRings: number;
  /** 摩斯環：內圈以外的環畫成摩斯電碼的點線 */
  morse: boolean;
  /** 保留成實線的內圈數 */
  solidInner: number;
  /** 實線的圈數跟著放射線的起點（第一圈＝1、第二圈＝2） */
  solidFollow: boolean;
  /** 每一圈變成摩斯環的機率（%） */
  pMorse: number;
  /** 短點的長度（px，0.5 一格） */
  morseDot: number;
  /** 長點＝短點 × 這個倍數 */
  morseDash: number;
  /** 同一個字母裡的間隔（× 短點） */
  morseGap: number;
  /** 字母之間的間隔（× 短點） */
  morseLetterGap: number;
  /** 單字之間的間隔（× 短點） */
  morseWordGap: number;
  /** 隨機時長點的比例（%） */
  pMorseDash: number;
  /** 隨機時插入單字間隔的機率（%） */
  pMorseWord: number;
  /** 摩斯線的粗細（× 線寬） */
  morseWidth: number;
  /** 短點也跟著每代縮小（%） */
  morseShrink: number;
  /** 短點畫成圓點 */
  morseRound: boolean;
  /** 點線的兩端是圓的 */
  morseCap: boolean;
  /** 摩斯電碼的文字（空白＝隨機） */
  morseText: string;
  /** 摩斯橋：相鄰的兩圈用長點連起來 */
  bridges: boolean;
  /** 每個字母架橋的機率（%） */
  pBridge: number;
  /** 把種子刻進圖形 */
  code: boolean;
  codeVersion: CodeVersion;
  /** 設定也一起刻（和預設不同的設定） */
  codeSettings: boolean;
  /** 刻種子的短點長度（px，0.5 一格） */
  codeUnit: number;
  /** 舊方式：一個圖形最少放幾個位元（放不下這麼多的不刻） */
  codeMin: number;
  /** 舊方式：一個圖形最多放幾個位元（越小分得越散） */
  codeMax: number;
  /** 子圖形放大幾倍（方便刻；0.1 一格） */
  codeScale: number;
  /** 舊方式：圓、圓＋半圓也換成刻資料的同心圓 */
  codeConvert: boolean;
  /** 舊方式：放得下全部的圖形刻全部 */
  codeWhole: boolean;
  /** 舊方式：圖形的方向也放 3 個位元 */
  codeOrient: boolean;
  /** 舊方式：線不經過刻了資料的圖形 */
  codeGuard: boolean;
  /** 刻種子的線寬（× 線寬，0.25 一格） */
  codeWidth: number;
  /** 舊方式：放不下時放大中央的圖形 */
  codeFit: boolean;
  /** 舊方式：中央的最小半徑（px） */
  codeRootR: number;
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
  pAttach: [0, 100],
  attachDepth: [-50, 80],
  pDrop: [0, 100],
  regularity: [0, 100],
  pTri: [0, 100],
  gap: [0, 400],
  pAccent: [0, 100],
  lineWidth: [0.25, 40],
  pFill: [0, 100],
  minRings: [2, 50],
  solidInner: [0, 20],
  pMorse: [0, 100],
  morseDot: [1, 80],
  morseDash: [1.5, 12],
  morseGap: [0.5, 8],
  morseLetterGap: [1, 15],
  morseWordGap: [2, 30],
  pMorseDash: [0, 100],
  pMorseWord: [0, 100],
  morseWidth: [0.25, 5],
  morseShrink: [0, 100],
  pBridge: [0, 100],
  codeUnit: [3, 30],
  codeMin: [4, 64],
  codeMax: [8, 127],
  codeScale: [1, 4],
  codeWidth: [0.5, 4],
  codeRootR: [0, 800],
};

/** 不是整數的數值的一格（其他都是整數） */
export const STEP: Partial<Record<NumericKey, number>> = {
  lineWidth: 0.25,
  morseDot: 0.5,
  morseDash: 0.5,
  morseGap: 0.25,
  morseLetterGap: 0.5,
  morseWordGap: 0.5,
  morseWidth: 0.25,
  codeUnit: 0.5,
  codeScale: 0.1,
  codeWidth: 0.25,
};

/** 線寬的一格 */
export const LINE_WIDTH_STEP = 0.25;
export const SEED_MAX_LENGTH = 100;
/** 摩斯電碼的文字最多幾個字（原作沒有限制） */
export const MORSE_TEXT_MAX_LENGTH = 200;

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
  pAttach: 0,
  attachDepth: 0,
  pDrop: 0,
  regularity: 50,
  shapes: {
    circle: true,
    rings: true,
    semi: true,
    mix: true,
    square: true,
    doubleSquare: true,
    triCore: false,
    triRing: false,
  },
  pTri: 30,
  triRing: 'first',
  avoidOverlap: true,
  overlapMode: 'retry',
  gap: 8,
  lineAvoid: false,
  noCross: false,
  inBounds: true,
  background: '#0e0f12',
  transparent: false,
  lineColor: '#e8e4da',
  accentColor: '#d9a441',
  pAccent: 15,
  lineWidth: 2,
  pFill: 10,
  fromEdge: true,
  startRing: 'ring2',
  endAtRing: true,
  rootRings: true,
  minRings: 3,
  morse: true,
  solidInner: 2,
  solidFollow: true,
  pMorse: 100,
  morseDot: 6,
  morseDash: 3,
  morseGap: 1,
  morseLetterGap: 3,
  morseWordGap: 7,
  pMorseDash: 45,
  pMorseWord: 18,
  morseWidth: 1,
  morseShrink: 60,
  morseRound: false,
  morseCap: true,
  morseText: '',
  bridges: false,
  pBridge: 50,
  code: false,
  codeVersion: 'v2',
  codeSettings: false,
  codeUnit: 5,
  codeMin: 8,
  codeMax: 48,
  codeScale: 1.8,
  codeConvert: true,
  codeWhole: true,
  codeOrient: true,
  codeGuard: true,
  codeWidth: 1,
  codeFit: true,
  codeRootR: 0,
};

/**
 * 舊版（資料版本 1，原作 3097b39 時的設定）沒有的欄位：開舊的專案檔、舊的自動儲存時用這組，畫出來最接近當時的圖
 * （中央是圓或同心圓、沒有摩斯環、線從最外圈出發、同心圓至少 2 層……；3.8）。
 */
export const LEGACY_FIELDS: Partial<Settings> = {
  rootRings: false,
  minRings: 2,
  startRing: 'edge',
  morse: false,
  bridges: false,
  pAttach: 0,
  pDrop: 0,
  noCross: false,
};

/** 數值夾到範圍並取格（整數；線寬等取 STEP 的倍數） */
export function clampValue(key: NumericKey, value: number): number {
  const [min, max] = RANGE[key];
  const v = Number.isFinite(value) ? value : DEFAULT_SETTINGS[key];
  /* 一格是 1／k：乘 k 取整數再除（0.1 這類的一格用除的才會剛好是 1.8，不是 1.8000000000000003） */
  const k = Math.round(1 / (STEP[key] ?? 1));
  const snapped = Math.round(v * k) / k;
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
    Object.fromEntries(SHAPE_TOGGLES.map((k) => [k, sh.boolean(d.shapes[k])])) as Record<
      ShapeToggle,
      Schema<boolean>
    >,
  ),
  triRing: sh.oneOf(TRI_RINGS, d.triRing),
  avoidOverlap: sh.boolean(d.avoidOverlap),
  overlapMode: sh.oneOf(OVERLAP_MODES, d.overlapMode),
  lineAvoid: sh.boolean(d.lineAvoid),
  noCross: sh.boolean(d.noCross),
  inBounds: sh.boolean(d.inBounds),
  background: opaqueColor(d.background),
  transparent: sh.boolean(d.transparent),
  lineColor: opaqueColor(d.lineColor),
  accentColor: opaqueColor(d.accentColor),
  fromEdge: sh.boolean(d.fromEdge),
  startRing: sh.oneOf(START_RINGS, d.startRing),
  endAtRing: sh.boolean(d.endAtRing),
  rootRings: sh.boolean(d.rootRings),
  morse: sh.boolean(d.morse),
  solidFollow: sh.boolean(d.solidFollow),
  morseRound: sh.boolean(d.morseRound),
  morseCap: sh.boolean(d.morseCap),
  morseText: sh.string({ default: d.morseText, maxLength: MORSE_TEXT_MAX_LENGTH }),
  bridges: sh.boolean(d.bridges),
  code: sh.boolean(d.code),
  codeVersion: sh.oneOf(CODE_VERSIONS, d.codeVersion),
  codeSettings: sh.boolean(d.codeSettings),
  codeConvert: sh.boolean(d.codeConvert),
  codeWhole: sh.boolean(d.codeWhole),
  codeOrient: sh.boolean(d.codeOrient),
  codeGuard: sh.boolean(d.codeGuard),
  codeFit: sh.boolean(d.codeFit),
});

/** 不可信的資料（localStorage、專案檔）→ 完整的設定 */
export function sanitizeSettings(raw: unknown): Settings {
  const s = sanitize(SETTINGS_SCHEMA, raw);
  /* 欄位依 DEFAULT_SETTINGS 的順序排（存檔、比對都穩定） */
  return Object.fromEntries(
    (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).map((k) => [k, s[k]]),
  ) as unknown as Settings;
}

/**
 * 舊的資料版本 → 目前的設定（3.8）。版本 1（原作 3097b39 時的設定）沒有的欄位補 LEGACY_FIELDS（不是預設值），
 * 其餘缺的、型別不對的照 sanitizeSettings 整理。
 */
export function upgradeSettings(raw: unknown, fromVersion: number): Settings {
  if (fromVersion < 2 && raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const filled: Record<string, unknown> = { ...o };
    for (const [k, v] of Object.entries(LEGACY_FIELDS)) if (!(k in o)) filled[k] = v;
    return sanitizeSettings(filled);
  }
  return sanitizeSettings(raw);
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
  /** 以下為 0～1 的比例（attachDepth 是 −0.5～0.8） */
  pShape: number;
  pBranch: number;
  pDot: number;
  pAttach: number;
  attachDepth: number;
  pDrop: number;
  regularity: number;
  pAccent: number;
  pFill: number;
  pTri: number;
  /** 抽種類用的清單（至少一個） */
  shapes: readonly ShapeKind[];
  /** 一般的種類一個都沒勾（勾了三角形時就一定是三角形） */
  noPlainShapes: boolean;
  /** 勾選的三角形（三角心在前） */
  tris: readonly TriKind[];
  triRing: TriRing;
  avoidOverlap: boolean;
  overlapMode: OverlapMode;
  gap: number;
  lineAvoid: boolean;
  noCross: boolean;
  inBounds: boolean;
  background: string;
  transparent: boolean;
  lineColor: string;
  accentColor: string;
  lineWidth: number;
  fromEdge: boolean;
  startRing: StartRing;
  endAtRing: boolean;
  rootRings: boolean;
  minRings: number;
  morse: boolean;
  solidInner: number;
  solidFollow: boolean;
  pMorse: number;
  morseDot: number;
  morseDash: number;
  morseGap: number;
  morseLetterGap: number;
  morseWordGap: number;
  pMorseDash: number;
  pMorseWord: number;
  morseWidth: number;
  /** 比例（0～1） */
  morseShrink: number;
  morseRound: boolean;
  morseCap: boolean;
  morseText: string;
  bridges: boolean;
  pBridge: number;
  code: boolean;
  codeVersion: CodeVersion;
  /** 一起刻的設定（差異文字，3.15）；不刻設定時空字串 */
  codeSettingsText: string;
  codeUnit: number;
  codeMin: number;
  codeMax: number;
  codeScale: number;
  codeConvert: boolean;
  codeWhole: boolean;
  codeOrient: boolean;
  codeGuard: boolean;
  codeWidth: number;
  codeFit: boolean;
  codeRootR: number;
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
    pAttach: s.pAttach / 100,
    attachDepth: s.attachDepth / 100,
    pDrop: s.pDrop / 100,
    regularity: s.regularity / 100,
    pAccent: s.pAccent / 100,
    pFill: s.pFill / 100,
    pTri: s.pTri / 100,
    shapes: shapes.length ? shapes : ['circle'],
    noPlainShapes: !shapes.length,
    tris: TRI_KINDS.filter((k) => s.shapes[k]),
    triRing: s.triRing,
    avoidOverlap: s.avoidOverlap,
    overlapMode: s.overlapMode,
    gap: s.gap,
    lineAvoid: s.lineAvoid,
    noCross: s.noCross,
    inBounds: s.inBounds,
    background: s.background,
    transparent: s.transparent,
    lineColor: s.lineColor,
    accentColor: s.accentColor,
    lineWidth: s.lineWidth,
    fromEdge: s.fromEdge,
    startRing: s.startRing,
    endAtRing: s.endAtRing,
    rootRings: s.rootRings,
    minRings: s.minRings,
    morse: s.morse,
    solidInner: s.solidInner,
    solidFollow: s.solidFollow,
    pMorse: s.pMorse / 100,
    morseDot: s.morseDot,
    morseDash: s.morseDash,
    morseGap: s.morseGap,
    morseLetterGap: s.morseLetterGap,
    morseWordGap: s.morseWordGap,
    pMorseDash: s.pMorseDash / 100,
    pMorseWord: s.pMorseWord / 100,
    morseWidth: s.morseWidth,
    morseShrink: s.morseShrink / 100,
    morseRound: s.morseRound,
    morseCap: s.morseCap,
    morseText: s.morseText,
    bridges: s.bridges,
    pBridge: s.pBridge / 100,
    code: s.code,
    codeVersion: s.codeVersion,
    codeSettingsText: s.code && s.codeSettings ? settingsDiff(s) : '',
    codeUnit: s.codeUnit,
    codeMin: s.codeMin,
    codeMax: s.codeMax,
    codeScale: s.codeScale,
    codeConvert: s.codeConvert,
    codeWhole: s.codeWhole,
    codeOrient: s.codeOrient,
    codeGuard: s.codeGuard,
    codeWidth: s.codeWidth,
    codeFit: s.codeFit,
    codeRootR: s.codeRootR,
  };
}

/* ---------- 刻進圖形的設定（和原作相同的差異文字，3.15） ---------- */

const bool = (v: boolean) => (v ? '1' : '0');
const TRI_RING_CODE: Record<TriRing, string> = { first: '1', second: '2', random: 'r' };
const START_RING_CODE: Record<StartRing, string> = {
  ring1: '1',
  ring2: '2',
  ring12: '12',
  edge: 'edge',
  center: 'center',
  any: 'all',
};
const reverse = <K extends string>(m: Record<K, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;

type Control = readonly [
  /** 讀：設定 → 原作欄位的值 */
  (s: Settings) => string,
  /** 寫：原作欄位的值 → 設定（不可信的資料，之後再整理） */
  (s: Record<string, unknown>, v: string) => void,
];
const num = (k: NumericKey): Control => [
  (s) => String(s[k]),
  (s, v) => {
    s[k] = Number(v);
  },
];
const flag = (k: keyof Settings): Control => [
  (s) => bool(s[k] as boolean),
  (s, v) => {
    s[k] = v === '1';
  },
];
const shape = (k: ShapeToggle): Control => [
  (s) => bool(s.shapes[k]),
  (s, v) => {
    (s.shapes as Record<string, boolean>)[k] = v === '1';
  },
];
const text = (
  k: 'background' | 'lineColor' | 'accentColor' | 'morseText' | 'overlapMode',
): Control => [
  (s) => s[k],
  (s, v) => {
    s[k] = v;
  },
];
const mapped = <K extends 'triRing' | 'startRing'>(
  k: K,
  m: Record<Settings[K], string>,
): Control => [
  (s) => m[s[k]],
  (s, v) => {
    s[k] = reverse(m)[v] ?? v;
  },
];

/**
 * 原作的設定欄位（畫面上的順序；種子、固定種子、即時繪製、讀圖的方式不算）。刻設定時寫「第幾個欄位（36 進位）＝值」，
 * 只寫和預設不同的，用「;」接起來——順序與值的寫法照原作，兩邊刻的設定互相讀得懂。
 */
const UPSTREAM_CONTROLS: readonly Control[] = [
  num('width'),
  num('height'),
  num('maxShapes'),
  num('maxLines'),
  num('branchMax'),
  num('branchMin'),
  num('maxDepth'),
  num('maxRings'),
  num('rootMin'),
  num('rootMax'),
  num('childMin'),
  num('childMax'),
  num('shrink'),
  num('lineMin'),
  num('lineMax'),
  num('pShape'),
  num('pBranch'),
  num('pDot'),
  num('pAttach'),
  num('attachDepth'),
  num('pDrop'),
  num('regularity'),
  shape('circle'),
  shape('rings'),
  shape('semi'),
  shape('mix'),
  shape('square'),
  shape('doubleSquare'),
  shape('triCore'),
  shape('triRing'),
  num('pTri'),
  mapped('triRing', TRI_RING_CODE),
  flag('avoidOverlap'),
  text('overlapMode'),
  num('gap'),
  flag('lineAvoid'),
  flag('noCross'),
  flag('inBounds'),
  text('background'),
  flag('transparent'),
  text('lineColor'),
  text('accentColor'),
  num('pAccent'),
  num('lineWidth'),
  num('pFill'),
  flag('fromEdge'),
  mapped('startRing', START_RING_CODE),
  flag('endAtRing'),
  flag('rootRings'),
  num('minRings'),
  flag('morse'),
  num('solidInner'),
  flag('solidFollow'),
  num('pMorse'),
  num('morseDot'),
  num('morseDash'),
  num('morseGap'),
  num('morseLetterGap'),
  num('morseWordGap'),
  num('pMorseDash'),
  num('pMorseWord'),
  num('morseWidth'),
  num('morseShrink'),
  flag('morseRound'),
  flag('morseCap'),
  text('morseText'),
  flag('code'),
  [
    (s) => s.codeVersion,
    (s, v) => {
      s.codeVersion = v;
    },
  ],
  num('codeUnit'),
  num('codeMin'),
  num('codeMax'),
  num('codeScale'),
  flag('codeConvert'),
  flag('codeWhole'),
  flag('codeOrient'),
  flag('codeGuard'),
  num('codeWidth'),
  flag('codeFit'),
  num('codeRootR'),
  flag('bridges'),
  num('pBridge'),
];

/** 和預設不同的設定 → 差異文字（「0=1200;17=3」這樣） */
export function settingsDiff(s: Settings): string {
  return UPSTREAM_CONTROLS.map(([get], i) => [get(s), get(DEFAULT_SETTINGS), i] as const)
    .filter(([v, def]) => v !== def)
    .map(([v, , i]) => `${i.toString(36)}=${v}`)
    .join(';');
}

/**
 * 差異文字 → 設定（預設值＋差異；看不懂的欄位略過；種子另外給）。
 * 有差異文字就表示刻的時候「設定也一起刻」是開的（這個開關不在差異裡）：讀回來也打開，重畫出來才是同一張（D24）。
 */
export function applySettingsDiff(text: string, seed: string): Settings {
  const raw: Record<string, unknown> = {
    ...structuredClone(DEFAULT_SETTINGS),
    seed,
    codeSettings: true,
  };
  for (const kv of text.split(';')) {
    if (!kv) continue;
    const i = kv.indexOf('=');
    const c = UPSTREAM_CONTROLS[Number.parseInt(kv.slice(0, i), 36)];
    if (c) c[1](raw, kv.slice(i + 1));
  }
  return sanitizeSettings(raw);
}

/** 匯出的檔名：geometric_<種子>.<副檔名>（不能用的字元換成「_」） */
export function exportFileName(seed: string, ext: 'png' | 'svg'): string {
  return fileNameWithExt(`geometric_${seed}`, ext, {
    fallback: 'geometric',
    maxLength: SEED_MAX_LENGTH + 20,
  });
}
