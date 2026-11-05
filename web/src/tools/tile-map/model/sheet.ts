/**
 * 匯入圖塊：把一張圖塊表依「每格寬高、間距、外邊」切成格子；拖曳框起來的一塊（例如 3 × 3）變成一個大圖塊。
 * 完全透明的格子略過（半透明的保留）。
 */
import type { Rect } from './types';

/** 一次匯入、一張圖最多切出幾格 */
export const MAX_SHEET_TILES = 4096;
/** 匯入的圖每邊最多幾 px */
export const MAX_IMAGE_SIDE = 8192;

export class SheetError extends Error {
  constructor(readonly code: 'numbers' | 'count') {
    super(code);
    this.name = 'SheetError';
  }
}

export interface SheetSpec {
  /** 每格的寬高（px） */
  cw: number;
  ch: number;
  /** 格子之間的間距、四周的外邊（px） */
  gap: number;
  margin: number;
}

/** 圖塊表切得出幾欄幾列（只算完整的格子） */
export function sheetGrid(
  width: number,
  height: number,
  s: SheetSpec,
): { cols: number; rows: number } {
  const nums = [width, height, s.cw, s.ch, s.gap, s.margin];
  if (!nums.every(Number.isInteger) || s.cw < 1 || s.ch < 1 || s.gap < 0 || s.margin < 0)
    throw new SheetError('numbers');
  const cols = Math.max(0, Math.floor((width - 2 * s.margin + s.gap) / (s.cw + s.gap)));
  const rows = Math.max(0, Math.floor((height - 2 * s.margin + s.gap) / (s.ch + s.gap)));
  if (!cols || !rows || cols * rows > MAX_SHEET_TILES) throw new SheetError('count');
  return { cols, rows };
}

/** 框成大圖塊的一塊：左上角的格子與欄數、列數 */
export type Group = readonly [number, number, number, number];

export interface SheetEntry {
  rect: Rect;
  /** 大圖塊才有 */
  span?: readonly [number, number];
  gap?: number;
}

/** 格子 (x, y) 在圖上的位置 */
export function cellRect(s: SheetSpec, x: number, y: number, w = 1, h = 1): Rect {
  return [
    s.margin + x * (s.cw + s.gap),
    s.margin + y * (s.ch + s.gap),
    w * s.cw + (w - 1) * s.gap,
    h * s.ch + (h - 1) * s.gap,
  ];
}

/** 切好的圖塊（大圖塊與其餘的單格，依在圖上的位置由上到下、由左到右） */
export function sheetEntries(
  width: number,
  height: number,
  s: SheetSpec,
  groups: readonly Group[] = [],
): SheetEntry[] {
  const { cols, rows } = sheetGrid(width, height, s);
  const covered = new Set<number>();
  const out: SheetEntry[] = [];
  for (const [x, y, w, h] of groups) {
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > cols || y + h > rows) continue;
    out.push({
      rect: cellRect(s, x, y, w, h),
      span: [w, h],
      ...(s.gap ? { gap: s.gap } : {}),
    });
    for (let gy = y; gy < y + h; gy++)
      for (let gx = x; gx < x + w; gx++) covered.add(gy * cols + gx);
  }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (!covered.has(y * cols + x)) out.push({ rect: cellRect(s, x, y) });
  return out.sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
}

/**
 * 拖曳框選（從格子 a 拖到 b）之後的大圖塊清單：和框選範圍重疊的舊大圖塊拿掉；範圍超過 1 格時加進去。
 * 所以在已經框起來的地方點一下＝取消那個大圖塊。
 */
export function toggleGroup(
  groups: readonly Group[],
  a: { x: number; y: number },
  b: { x: number; y: number },
): Group[] {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x) + 1;
  const h = Math.abs(a.y - b.y) + 1;
  const out = groups.filter(
    ([gx, gy, gw, gh]) => !(x < gx + gw && x + w > gx && y < gy + gh && y + h > gy),
  );
  if (w > 1 || h > 1) out.push([x, y, w, h]);
  return out;
}

/** 圖上那個位置是哪一格（px → 格；超出時夾在邊上） */
export function cellAt(
  px: number,
  py: number,
  s: SheetSpec,
  grid: { cols: number; rows: number },
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(grid.cols - 1, Math.floor((px - s.margin) / (s.cw + s.gap)))),
    y: Math.max(0, Math.min(grid.rows - 1, Math.floor((py - s.margin) / (s.ch + s.gap)))),
  };
}

/** RGBA 影像（寬 width）上的這塊範圍有沒有不透明度大於 0 的像素 */
export function hasVisiblePixels(rgba: ArrayLike<number>, width: number, rect: Rect): boolean {
  const [x, y, w, h] = rect;
  for (let py = y; py < y + h; py++) {
    let o = (py * width + x) * 4 + 3;
    for (let px = 0; px < w; px++, o += 4) if (rgba[o]) return true;
  }
  return false;
}
