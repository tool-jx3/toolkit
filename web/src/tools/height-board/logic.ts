/**
 * 立繪身高比較板：純邏輯（不依賴 React 與 DOM，Node 可測）。
 *
 * 座標：x 是公分（往右）；高度也是公分（往上為正）。盤面（PanZoomViewport）的世界座標 y＝−高度。
 * 每位角色只用「去除透明留白後的範圍」（crop）；頭頂線、腳底線是這個範圍的百分比（0～100）。
 */
import { limitResolution } from '@/core/image';
import { ceilTo } from '@/core/ruler';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Character {
  id: string;
  name: string;
  /** 身高（cm）：頭頂線到腳底線的距離 */
  height: number;
  /** 圖的左緣（cm） */
  x: number;
  /** 頭頂線（去除留白後範圍的 %，0～100） */
  top: number;
  /** 腳底線（%） */
  bottom: number;
  visible: boolean;
  /** 圖片資產庫的 id */
  imageId: string;
  /** 去除透明留白後的範圍（原圖 px） */
  crop: Rect;
}

export interface BoardData {
  /** 依前後順序：第一個在最後面（最先畫），最後一個在最前面 */
  characters: Character[];
}

export const EMPTY_BOARD: BoardData = { characters: [] };

/* ---------- 數值（規格 1、4.2） ---------- */

/** 透明門檻：不透明度大於 16／255 才算內容（F06） */
export const OPAQUE_THRESHOLD = 16;
/** 新角色、排列的起點與間隔（cm） */
export const GAP_CM = 5;
/** 盤面上緣的下限（cm）與倍率 */
export const MIN_TOP_CM = 180;
export const TOP_FACTOR = 1.06;
/** 盤面上緣進位的單位（cm） */
export const TOP_STEP_CM = 10;
/** 盤面寬度的下限與右側留白（cm） */
export const MIN_WIDTH_CM = 120;
export const RIGHT_PAD_CM = 8;
/** 兩條基準線的最小間距（%） */
export const MIN_LINE_GAP = 5;
/** 頭頂線、腳底線滑桿的範圍（%） */
export const TOP_SLIDER = { min: 0, max: 45, step: 0.1 } as const;
export const BOTTOM_SLIDER = { min: 55, max: 100, step: 0.1 } as const;
/** 身高（主控裁定：加入與之後修改統一為 1～1000） */
export const HEIGHT = { min: 1, max: 1000, step: 0.1 } as const;
/** 刻度（cm） */
export const TICK_CM = 10;
export const MAJOR_TICK_CM = 50;
/** 復原步數、方向鍵合併間隔、自動保存延遲 */
export const HISTORY_LIMIT = 60;
export const NUDGE_MERGE_MS = 800;
export const AUTOSAVE_DELAY_MS = 400;
/** 縮放 */
export const ZOOM = { min: 0.2, max: 4, button: 1.25, wheelPer100: 1.16 } as const;
/** 匯出：左右留白、刻度欄寬（cm）、字級比例、上下邊（× 字高） */
export const EXPORT = {
  sidePadCm: 8,
  gutterCm: 14,
  fontRatio: 0.24,
  minFontPx: 10,
  marginRatio: 0.75,
} as const;

/* ---------- 名稱（F05） ---------- */

export const UNTITLED = '未命名';

/** 檔名 → 預設名稱：去掉路徑與最後一個副檔名；以「.」開頭的保留全名；空白時「未命名」 */
export function nameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.trim() ? stem : UNTITLED;
}

/** 確認時的名稱：空白（含只有空白字元）時用推得的名稱 */
export function resolveName(input: string, fallback: string): string {
  const v = input.trim();
  return v || fallback;
}

/* ---------- 身高 ---------- */

/** 加入對話框的身高字串是否合法（1～1000、0.1 為單位；同瀏覽器數字欄的檢查） */
export function isValidHeight(raw: string): boolean {
  if (raw.trim() === '') return false;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < HEIGHT.min || n > HEIGHT.max) return false;
  const k = (n - HEIGHT.min) / HEIGHT.step;
  return Math.abs(k - Math.round(k)) < 1e-7;
}

/** 身高的顯示：四捨五入到 0.1、去掉多餘的 0（160 → "160"、160.25 → "160.3"） */
export function formatHeight(h: number): string {
  const r = Math.round(h * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

/** 百分比的顯示（一位小數） */
export function formatPercent(v: number): string {
  return `${(Math.round(v * 10) / 10).toFixed(1)}%`;
}

/* ---------- 換算（3.1） ---------- */

export interface Geometry {
  /** 原圖每 cm 幾 px */
  pxPerCm: number;
  /** 圖寬（cm） */
  width: number;
  /** 圖片上緣、下緣的高度（cm；地面＝0） */
  imageTop: number;
  imageBottom: number;
  /** 世界座標的範圍（y＝−高度） */
  box: Rect;
}

export function geometry(c: Pick<Character, 'height' | 'x' | 'top' | 'bottom' | 'crop'>): Geometry {
  const H = Math.max(1, c.crop.height);
  const W = Math.max(1, c.crop.width);
  const span = Math.max(1e-6, c.bottom - c.top);
  /** 每 px 幾 cm */
  const k = (c.height * 100) / (span * H);
  const imageTop = (c.height * c.bottom) / span;
  const imageBottom = (c.height * (c.bottom - 100)) / span;
  const width = W * k;
  const height = (c.height * 100) / span;
  return {
    pxPerCm: 1 / k,
    width,
    imageTop,
    imageBottom,
    box: { x: c.x, y: -imageTop, width, height },
  };
}

export const rightOf = (c: Character): number => c.x + geometry(c).width;

/* ---------- 盤面範圍（F11、F12） ---------- */

export interface BoardRange {
  /** 上緣（cm，10 的倍數，至少 180） */
  top: number;
  /** 下緣（cm；0，或有圖沉到地面以下時最低的圖片下緣） */
  bottom: number;
  /** 盤面寬度（cm）：最右側顯示中角色的右緣＋8，至少 120 */
  width: number;
}

/** 只算顯示中的角色 */
export function boardRange(characters: readonly Character[]): BoardRange {
  let peak = 0;
  let bottom = 0;
  let right = 0;
  for (const c of characters) {
    if (!c.visible) continue;
    const g = geometry(c);
    peak = Math.max(peak, c.height, g.imageTop);
    bottom = Math.min(bottom, g.imageBottom);
    right = Math.max(right, c.x + g.width);
  }
  return {
    top: ceilTo(Math.max(MIN_TOP_CM, peak * TOP_FACTOR), TOP_STEP_CM),
    bottom,
    width: Math.max(MIN_WIDTH_CM, right + RIGHT_PAD_CM),
  };
}

/* ---------- 新角色的位置（F07） ---------- */

/** 一般加入的起點：顯示中角色的最右緣往右 5 cm；一個都沒有時 5 cm */
export function nextX(characters: readonly Character[]): number {
  let right = Number.NEGATIVE_INFINITY;
  for (const c of characters) if (c.visible) right = Math.max(right, rightOf(c));
  return Number.isFinite(right) ? right + GAP_CM : GAP_CM;
}

/** 一般加入：第一張在 start，之後每張接在前一張右緣往右 5 cm */
export function placeInRow(start: number, widths: readonly number[]): number[] {
  const out: number[] = [];
  let x = start;
  for (const w of widths) {
    out.push(x);
    x += w + GAP_CM;
  }
  return out;
}

/**
 * 拖放到盤面上：第一張的中心對準放開的位置（左緣不小於 0）；之後每張的中心＝前一張的中心＋前一張的寬＋5 cm
 * （主控裁定：維持舊行為，寬度不同的圖間距會偏離 5 cm，例如前寬 90、後寬 50 時間距 25 cm）。
 */
export function placeDropped(dropX: number, widths: readonly number[]): number[] {
  const out: number[] = [];
  let center = dropX;
  for (const w of widths) {
    out.push(Math.max(0, center - w / 2));
    center += w + GAP_CM;
  }
  return out;
}

/* ---------- 排列（F24、F25） ---------- */

function relayout(characters: readonly Character[], order: readonly Character[]): Character[] {
  const xs = placeInRow(
    GAP_CM,
    order.map((c) => geometry(c).width),
  );
  const pos = new Map(order.map((c, i) => [c.id, xs[i]]));
  return characters.map((c) => {
    const x = pos.get(c.id);
    return x === undefined || x === c.x ? c : { ...c, x };
  });
}

/** 依目前由左到右的順序（左緣相同時依前後順序）等間隔排開；隱藏的角色不動 */
export function arrangeEvenly(characters: readonly Character[]): Character[] {
  const order = characters
    .map((c, i) => ({ c, i }))
    .filter((v) => v.c.visible)
    .sort((a, b) => a.c.x - b.c.x || a.i - b.i)
    .map((v) => v.c);
  return relayout(characters, order);
}

export type SortDirection = 'desc' | 'asc';

/** 依身高排開（desc：左邊最高）；身高相同時維持目前由左到右的順序 */
export function arrangeByHeight(
  characters: readonly Character[],
  direction: SortDirection,
): Character[] {
  const sign = direction === 'desc' ? -1 : 1;
  const order = characters
    .map((c, i) => ({ c, i }))
    .filter((v) => v.c.visible)
    .sort((a, b) => sign * (a.c.height - b.c.height) || a.c.x - b.c.x || a.i - b.i)
    .map((v) => v.c);
  return relayout(characters, order);
}

/* ---------- 兩條基準線（F17、F29、F30） ---------- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 頭頂線：0 ～（腳底線 − 5%） */
export function clampTopLine(v: number, bottom: number): number {
  return clamp(v, 0, Math.max(0, bottom - MIN_LINE_GAP));
}

/** 腳底線：（頭頂線 ＋ 5%）～ 100 */
export function clampBottomLine(v: number, top: number): number {
  return clamp(v, Math.min(100, top + MIN_LINE_GAP), 100);
}

/* ---------- 前後順序（F34）與清單排序（F40） ---------- */

export type OrderMove = 'back' | 'backward' | 'forward' | 'front';

/** 前後順序：back 置底、backward 下移一層、forward 上移一層、front 置頂；不能動時順序不變 */
export function moveOrder<T extends { id: string }>(
  list: readonly T[],
  id: string,
  move: OrderMove,
): T[] {
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return list.slice();
  const to =
    move === 'back' ? 0 : move === 'front' ? list.length - 1 : move === 'backward' ? i - 1 : i + 1;
  if (to < 0 || to >= list.length || to === i) return list.slice();
  const next = list.slice();
  const [it] = next.splice(i, 1);
  next.splice(to, 0, it);
  return next;
}

/** 清單（最前面的在最上面）的第 from 列移到第 to 列 → 陣列（最後面的在前）的移動 */
export function moveListRow<T>(list: readonly T[], from: number, to: number): T[] {
  const n = list.length;
  const a = n - 1 - from;
  const b = n - 1 - to;
  if (a < 0 || a >= n || b < 0 || b >= n || a === b) return list.slice();
  const next = list.slice();
  const [it] = next.splice(a, 1);
  next.splice(b, 0, it);
  return next;
}

/* ---------- 複製（F32） ---------- */

export function duplicateOf(c: Character, id: string, suffix: string): Character {
  return { ...c, id, name: `${c.name}${suffix}`, x: rightOf(c) + GAP_CM };
}

/* ---------- 清單篩選（F41、F42） ---------- */

export interface ListFilter {
  query: string;
  visibleOnly: boolean;
}

export const isFiltering = (f: ListFilter): boolean => f.query.trim() !== '' || f.visibleOnly;

/** 清單要列出的角色（最前面的在最上面） */
export function listRows(characters: readonly Character[], f: ListFilter): Character[] {
  const q = f.query.trim().toLocaleLowerCase();
  const out: Character[] = [];
  for (let i = characters.length - 1; i >= 0; i--) {
    const c = characters[i];
    if (f.visibleOnly && !c.visible) continue;
    if (q && !c.name.toLocaleLowerCase().includes(q)) continue;
    out.push(c);
  }
  return out;
}

/* ---------- 匯出（3.2） ---------- */

export interface ExportLayout {
  /** 每 cm 幾 px */
  pxPerCm: number;
  width: number;
  height: number;
  /** 左側刻度欄寬（px） */
  gutter: number;
  /** 刻度數字字級（px） */
  fontPx: number;
  /** 上下邊（px） */
  margin: number;
  /** 盤面範圍（cm） */
  top: number;
  bottom: number;
  /** 匯出範圍的左緣（cm） */
  left: number;
  /** 寬度（cm，不含刻度欄） */
  span: number;
}

/** 匯出的版面；沒有顯示中的角色時 null */
export function exportLayout(characters: readonly Character[]): ExportLayout | null {
  const vis = characters.filter((c) => c.visible);
  if (!vis.length) return null;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let desired = 0;
  for (const c of vis) {
    const g = geometry(c);
    left = Math.min(left, c.x);
    right = Math.max(right, c.x + g.width);
    desired = Math.max(desired, g.pxPerCm);
  }
  left -= EXPORT.sidePadCm;
  right += EXPORT.sidePadCm;
  const span = right - left;
  const { top, bottom } = boardRange(vis);
  const pxPerCm = limitResolution(desired, {
    width: span + EXPORT.gutterCm,
    height: top - bottom,
  });
  const gutter = Math.max(1, Math.round(EXPORT.gutterCm * pxPerCm));
  const fontPx = Math.max(EXPORT.minFontPx, EXPORT.fontRatio * gutter);
  const margin = Math.ceil(EXPORT.marginRatio * fontPx);
  return {
    pxPerCm,
    width: Math.max(1, gutter + Math.round(span * pxPerCm)),
    height: Math.max(1, Math.round((top - bottom) * pxPerCm + 2 * margin)),
    gutter,
    fontPx,
    margin,
    top,
    bottom,
    left,
    span,
  };
}

/** 匯出畫布上的位置（px） */
export function exportPoint(l: ExportLayout, xCm: number, heightCm: number) {
  return {
    x: l.gutter + (xCm - l.left) * l.pxPerCm,
    y: l.margin + (l.top - heightCm) * l.pxPerCm,
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** height-board_YYYYMMDD-HHMM（本機時間） */
export function fileStamp(now: Date): string {
  return `height-board_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
}

export const exportFileName = (now: Date): string => `${fileStamp(now)}.png`;

/* ---------- 專案檔的資料檢查 ---------- */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 專案檔（或自動保存）讀回的資料：格式不對時 null；數值夾到合法範圍 */
export function sanitizeBoard(raw: unknown): BoardData | null {
  if (!raw || typeof raw !== 'object') return null;
  const list = (raw as { characters?: unknown }).characters;
  if (!Array.isArray(list)) return null;
  const out: Character[] = [];
  const ids = new Set<string>();
  for (const it of list) {
    if (!it || typeof it !== 'object') return null;
    const c = it as Partial<Character>;
    const crop = c.crop as Partial<Rect> | undefined;
    if (
      typeof c.id !== 'string' ||
      !c.id ||
      ids.has(c.id) ||
      typeof c.imageId !== 'string' ||
      !c.imageId ||
      !isNum(c.height) ||
      !isNum(c.x) ||
      !isNum(c.top) ||
      !isNum(c.bottom) ||
      !crop ||
      !isNum(crop.x) ||
      !isNum(crop.y) ||
      !isNum(crop.width) ||
      !isNum(crop.height) ||
      crop.width <= 0 ||
      crop.height <= 0
    )
      return null;
    ids.add(c.id);
    const top = clamp(c.top, 0, 100 - MIN_LINE_GAP);
    out.push({
      id: c.id,
      name: typeof c.name === 'string' ? c.name : UNTITLED,
      height: clamp(c.height, HEIGHT.min, HEIGHT.max),
      x: Math.max(0, c.x),
      top,
      bottom: clampBottomLine(c.bottom, top),
      visible: c.visible !== false,
      imageId: c.imageId,
      crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    });
  }
  return { characters: out };
}
