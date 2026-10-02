/**
 * 角色配色條產生器的純邏輯（不依賴 React 與 DOM，Node 可測）：
 * 設定的型別與預設值、數值範圍、色條排版（規格 3.1、3.2）、裁邊範圍（3.3）、
 * 清單操作（新增／刪除條與段、排序、取色結果取代整條）、畫布把手拖動的比例換算（F18）。
 */
import { formatHex, parseColor } from '@/core/color';

/* ---------- 型別 ---------- */

export interface Segment {
  id: string;
  /** #rrggbb（小寫） */
  color: string;
  /** 比例（各段長度＝色條總長 × 比例 ÷ 全部比例和） */
  ratio: number;
}

export interface Bar {
  id: string;
  /** 倍率（色條長＝基準長度 × 倍率 ÷ 基準倍率），通常填身高 */
  scale: number;
  segments: Segment[];
}

export interface Settings {
  /** 背景色 */
  background: string;
  /** 線條粗細（色條寬，px） */
  thickness: number;
  /** 基準長度（倍率等於基準倍率的色條長幾 px） */
  baseLength: number;
  /** 基準倍率（通常填基準身高） */
  baseScale: number;
  /** 自動調整畫布 */
  autoSize: boolean;
  /** 手動畫布寬、高（px） */
  width: number;
  height: number;
  /** 留白（px）：自動調整時色條四周、裁邊儲存時保留的留白 */
  padding: number;
  bars: Bar[];
}

/** 取色結果（由上到下） */
export interface PickedColor {
  color: string;
  ratio: number;
}

/* ---------- 固定值 ---------- */

/** 相鄰兩條色條邊緣的距離（px，固定，不隨任何設定改變） */
export const BAR_GAP = 60;
/** 最多幾條 */
export const MAX_BARS = 24;
/** 自動調整時畫布的最小寬高 */
export const MIN_CANVAS = 100;
/** 沒有段（或比例和為 0）時整條的顏色 */
export const EMPTY_BAR_COLOR = '#cccccc';
/** 新增一條時的那一段 */
export const NEW_BAR_COLOR = '#000000';
/** 新增一段的顏色 */
export const NEW_SEGMENT_COLOR = '#333333';
/** 畫布把手拖動時每段比例的下限 */
export const HANDLE_MIN_RATIO = 0.05;
/** 畫布把手的大小（畫布 px）：寬＝max(粗細＋12, 20)、高 10 */
export const HANDLE_HEIGHT = 10;
export const handleWidth = (thickness: number) => Math.max(thickness + 12, 20);

/** 輸出檔名 */
export const FILE_FULL = 'palette_full.png';
export const FILE_CROP = 'palette_crop.png';

/** 數值欄的範圍（主控裁定：依標示範圍檢查） */
export const RANGE = {
  thickness: { min: 1, max: 100 },
  baseLength: { min: 10, max: 4000 },
  baseScale: { min: 1 },
  canvas: { min: 100, max: 5000 },
  padding: { min: 0, max: 500 },
  barScale: { min: 1 },
  segmentRatio: { min: 0.01 },
  /** 取色數量（手動）／段數（自動） */
  pickCount: { min: 1, max: 20, default: 5 },
  /** 相近色容許值 */
  tolerance: { min: 1, max: 50, default: 20 },
  /** 主預覽倍率（%） */
  previewZoom: { min: 10, max: 300, step: 5 },
  /** 取色視窗的縮放（%） */
  pickerZoom: { min: 20, max: 500, step: 10 },
} as const;

/**
 * 畫布大小的安全上限（瀏覽器配置不到更大的畫布）：超過時不畫、不能儲存，提示調小。
 * 規格沒有上限（舊版也不檢查），這是新版自己加的保護。
 */
export const CANVAS_LIMIT = { maxSide: 16384, maxPixels: 50_000_000 };

/* ---------- 預設值 ---------- */

/** 開頁的初始內容（F09）：1 條、倍率 160、3 段等比例的鮮明顏色（本站自選） */
export const INITIAL_COLORS = ['#e4572e', '#f3c13a', '#2e86ab'] as const;

export const DEFAULT_SETTINGS: Settings = {
  background: '#f3f4f6',
  thickness: 10,
  baseLength: 300,
  baseScale: 160,
  autoSize: true,
  width: 400,
  height: 500,
  padding: 80,
  bars: [
    {
      id: 'bar-initial',
      scale: 160,
      segments: INITIAL_COLORS.map((color, i) => ({ id: `seg-initial-${i + 1}`, color, ratio: 1 })),
    },
  ],
};

let seq = 0;
/** 新的條、段 id（同一頁內唯一；存檔讀回來的 id 不會撞到，因為有亂數） */
export function newId(prefix: 'bar' | 'seg'): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- 數值 ---------- */

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const cleanColor = (v: unknown, fallback: string) => {
  if (typeof v !== 'string') return fallback;
  const c = parseColor(v);
  return c ? formatHex({ ...c, a: 1 }, false) : fallback;
};

/** 色條長（px）＝基準長度 × 倍率 ÷ 基準倍率 */
export function barLength(s: Pick<Settings, 'baseLength' | 'baseScale'>, scale: number): number {
  /* 和舊版相同的運算順序（影響畫布尺寸捨去小數時的邊界） */
  return (s.baseLength / s.baseScale) * scale;
}

/** 段的比例和 */
export function ratioSum(segments: readonly Pick<Segment, 'ratio'>[]): number {
  let sum = 0;
  for (const seg of segments) sum += Math.max(0, seg.ratio);
  return sum;
}

/* ---------- 排版（規格 3.1、3.2、3.3） ---------- */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SegmentLayout {
  color: string;
  /** 畫布座標（精確值，可能有小數） */
  y0: number;
  y1: number;
}

export interface BarLayout {
  id: string;
  /** 左緣 x（畫布座標） */
  x: number;
  /** 上端、下端 y */
  top: number;
  bottom: number;
  width: number;
  length: number;
  /** 比例和（0 ＝ 整條淺灰） */
  total: number;
  segments: SegmentLayout[];
  /** 相鄰兩段交界的 y（段數 − 1 個；比例和為 0 時沒有） */
  boundaries: number[];
}

export interface PaletteLayout {
  /** 畫布寬高（整數 px） */
  width: number;
  height: number;
  bars: BarLayout[];
  /** 所有色條的外接範圍寬（條數 × 粗細 ＋（條數 − 1）× 60；沒有色條時 0） */
  groupWidth: number;
  /** 最長的色條 */
  maxLength: number;
  /** 裁邊儲存的範圍（畫布座標，整數；沒有色條時 null） */
  crop: Rect | null;
}

/** 所有色條的外接寬度 */
export function groupWidth(count: number, thickness: number): number {
  return count > 0 ? count * thickness + (count - 1) * BAR_GAP : 0;
}

/** 畫布尺寸：自動＝內容＋兩邊留白（至少 100）；手動＝輸入值。有小數時捨去（和舊版把小數指定給畫布的結果相同） */
export function canvasSize(s: Settings): { width: number; height: number } {
  if (!s.autoSize) return { width: Math.floor(s.width), height: Math.floor(s.height) };
  const gw = groupWidth(s.bars.length, s.thickness);
  const maxLen = s.bars.reduce((m, b) => Math.max(m, barLength(s, b.scale)), 0);
  return {
    width: Math.max(MIN_CANVAS, Math.floor(gw + 2 * s.padding)),
    height: Math.max(MIN_CANVAS, Math.floor(maxLen + 2 * s.padding)),
  };
}

export function layoutPalette(s: Settings): PaletteLayout {
  const { width, height } = canvasSize(s);
  const t = s.thickness;
  const gw = groupWidth(s.bars.length, t);
  const lengths = s.bars.map((b) => barLength(s, b.scale));
  const maxLength = lengths.reduce((m, l) => Math.max(m, l), 0);
  /* 整組水平置中；底部對齊，讓最長的那條垂直置中 */
  const x0 = (width - gw) / 2;
  const bottom = (height + maxLength) / 2;
  const bars = s.bars.map((bar, i): BarLayout => {
    const length = lengths[i];
    const top = bottom - length;
    const total = ratioSum(bar.segments);
    const segments: SegmentLayout[] = [];
    const boundaries: number[] = [];
    if (total > 0) {
      let acc = 0;
      bar.segments.forEach((seg, k) => {
        const y0 = top + (length * acc) / total;
        acc += Math.max(0, seg.ratio);
        const y1 = k === bar.segments.length - 1 ? bottom : top + (length * acc) / total;
        segments.push({ color: seg.color, y0, y1 });
        if (k < bar.segments.length - 1) boundaries.push(y1);
      });
    }
    return {
      id: bar.id,
      x: x0 + i * (t + BAR_GAP),
      top,
      bottom,
      width: t,
      length,
      total,
      segments,
      boundaries,
    };
  });
  const crop = s.bars.length
    ? {
        x: Math.round(x0 - s.padding),
        y: Math.round(bottom - maxLength - s.padding),
        width: Math.floor(gw + 2 * s.padding),
        height: Math.floor(maxLength + 2 * s.padding),
      }
    : null;
  return { width, height, bars, groupWidth: gw, maxLength, crop };
}

/** 畫布是否大到瀏覽器可能配置不到 */
export function tooLarge(size: { width: number; height: number } | null): boolean {
  if (!size) return false;
  return (
    size.width > CANVAS_LIMIT.maxSide ||
    size.height > CANVAS_LIMIT.maxSide ||
    size.width * size.height > CANVAS_LIMIT.maxPixels
  );
}

/* ---------- 清單操作（都回傳新的陣列，不改動傳入的值） ---------- */

/** 新增一條（F08）：倍率＝當下的基準倍率，內含一段黑色、比例 1；滿 24 條時不變 */
export function addBar(bars: readonly Bar[], baseScale: number): Bar[] {
  if (bars.length >= MAX_BARS) return bars.slice();
  return [
    ...bars,
    {
      id: newId('bar'),
      scale: baseScale,
      segments: [{ id: newId('seg'), color: NEW_BAR_COLOR, ratio: 1 }],
    },
  ];
}

export function removeBar(bars: readonly Bar[], barId: string): Bar[] {
  return bars.filter((b) => b.id !== barId);
}

function mapBar(bars: readonly Bar[], barId: string, fn: (bar: Bar) => Bar): Bar[] {
  return bars.map((b) => (b.id === barId ? fn(b) : b));
}

export function setBarScale(bars: readonly Bar[], barId: string, scale: number): Bar[] {
  return mapBar(bars, barId, (b) => ({ ...b, scale }));
}

/** 新增一段（F13）：在該條最下面加一段深灰、比例 1 */
export function addSegment(bars: readonly Bar[], barId: string): Bar[] {
  return mapBar(bars, barId, (b) => ({
    ...b,
    segments: [...b.segments, { id: newId('seg'), color: NEW_SEGMENT_COLOR, ratio: 1 }],
  }));
}

export function removeSegment(bars: readonly Bar[], barId: string, segId: string): Bar[] {
  return mapBar(bars, barId, (b) => ({
    ...b,
    segments: b.segments.filter((s) => s.id !== segId),
  }));
}

export function updateSegment(
  bars: readonly Bar[],
  barId: string,
  segId: string,
  patch: Partial<Pick<Segment, 'color' | 'ratio'>>,
): Bar[] {
  return mapBar(bars, barId, (b) => ({
    ...b,
    segments: b.segments.map((s) => (s.id === segId ? { ...s, ...patch } : s)),
  }));
}

/** 段的排序（F17）：把 from 移到 to（往下落在目標後、往上落在目標前），只在同一條之內 */
export function moveSegment(bars: readonly Bar[], barId: string, from: number, to: number): Bar[] {
  return mapBar(bars, barId, (b) => {
    const n = b.segments.length;
    if (from === to || from < 0 || from >= n || to < 0 || to >= n) return b;
    const next = b.segments.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return { ...b, segments: next };
  });
}

/** 取色結果取代該條的全部分段（F36；不是追加） */
export function replaceSegments(
  bars: readonly Bar[],
  barId: string,
  picks: readonly PickedColor[],
): Bar[] {
  return mapBar(bars, barId, (b) => ({
    ...b,
    segments: picks.map((p) => ({ id: newId('seg'), color: p.color, ratio: p.ratio })),
  }));
}

/** 手動滴管的結果：依點選順序、比例都是 1 */
export function picksFromPoints(points: readonly { color: string }[]): PickedColor[] {
  return points.map((p) => ({ color: p.color, ratio: 1 }));
}

/* ---------- 畫布把手（F18） ---------- */

/**
 * 拖動第 k 段與第 k＋1 段之間的交界：上段 a0、下段 b0 加減 delta（比例單位），兩段比例和不變；
 * 每段不小於 0.05，四捨五入到小數 3 位。兩段比例和不到 0.1（放不下兩個下限）時回傳 null（不動）。
 */
export function moveBoundary(a0: number, b0: number, delta: number): [number, number] | null {
  const pair = a0 + b0;
  if (pair < 2 * HANDLE_MIN_RATIO - 1e-9) return null;
  const a = round(Math.min(pair - HANDLE_MIN_RATIO, Math.max(HANDLE_MIN_RATIO, a0 + delta)), 3);
  const b = round(pair - a, 3);
  return [a, b];
}

/** 畫布上移動 dy px（畫布座標）等於多少比例：dy × 比例和 ÷ 色條長 */
export function pxToRatio(dy: number, total: number, length: number): number {
  return length > 0 ? (dy * total) / length : 0;
}

/* ---------- 讀回存檔、專案檔 ---------- */

function cleanSegment(v: unknown): Segment | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const ratio = clampNum(o.ratio, RANGE.segmentRatio.min, Number.MAX_SAFE_INTEGER, 1);
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId('seg'),
    color: cleanColor(o.color, NEW_SEGMENT_COLOR),
    ratio,
  };
}

function cleanBar(v: unknown, baseScale: number): Bar | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const segments = Array.isArray(o.segments)
    ? o.segments.map(cleanSegment).filter((s): s is Segment => !!s)
    : [];
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId('bar'),
    scale: clampNum(o.scale, RANGE.barScale.min, Number.MAX_SAFE_INTEGER, baseScale),
    segments,
  };
}

/** 把任何來源（自動存檔、專案檔）的資料整理成合法的設定：補預設值、夾在範圍內、id 不重複 */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const baseScale = clampNum(
    o.baseScale,
    RANGE.baseScale.min,
    Number.MAX_SAFE_INTEGER,
    d.baseScale,
  );
  const bars = Array.isArray(o.bars)
    ? o.bars
        .map((b) => cleanBar(b, baseScale))
        .filter((b): b is Bar => !!b)
        .slice(0, MAX_BARS)
    : d.bars;
  /* id 重複（手改的專案檔）時換新的，React 的 key 與拖曳才不會混淆 */
  const seen = new Set<string>();
  const unique = <T extends { id: string }>(x: T, prefix: 'bar' | 'seg'): T => {
    if (!seen.has(x.id)) {
      seen.add(x.id);
      return x;
    }
    const id = newId(prefix);
    seen.add(id);
    return { ...x, id };
  };
  return {
    background: cleanColor(o.background, d.background),
    thickness: clampNum(o.thickness, RANGE.thickness.min, RANGE.thickness.max, d.thickness),
    baseLength: clampNum(o.baseLength, RANGE.baseLength.min, RANGE.baseLength.max, d.baseLength),
    baseScale,
    autoSize: typeof o.autoSize === 'boolean' ? o.autoSize : d.autoSize,
    width: Math.round(clampNum(o.width, RANGE.canvas.min, RANGE.canvas.max, d.width)),
    height: Math.round(clampNum(o.height, RANGE.canvas.min, RANGE.canvas.max, d.height)),
    padding: clampNum(o.padding, RANGE.padding.min, RANGE.padding.max, d.padding),
    bars: bars.map((b) => {
      const bar = unique(b, 'bar');
      return { ...bar, segments: bar.segments.map((s) => unique(s, 'seg')) };
    }),
  };
}
