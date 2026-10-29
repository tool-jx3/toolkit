/**
 * 座標標示（A1、B2…；2026-10-29，參考 KIIN マップ制作スタジオ；規格 F264、3.14.7、D76）。
 *
 * - 一格＝棋子方格的大小（F220）；沒有棋子方格時 1 m（2 格）。
 * - 起點＝所有樓層的房間（含戶外的區塊）的外接範圍的左上角，往左上取到一格的倍數（從世界座標 0 算，
 *   所以和棋子方格線對得齊；所有樓層同一套座標，PL／GM 檢視也一樣）。
 * - 欄（A、B…Z、AA…）寫在上緣、列（1、2…）寫在左緣；字放在這一層看得到的東西的外面，不蓋到門的開門範圍。
 */
import { DEFAULT_CELL } from './catalog';
import { roomRects } from './shape';
import type { Floor, Rect } from './types';

/** 欄名：0 → A、25 → Z、26 → AA、27 → AB…（同試算表） */
export function columnName(i: number): string {
  let n = Math.max(0, Math.floor(i)) + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface CoordGrid {
  /** 一格（格） */
  cell: number;
  /** 起點（世界座標，一格的倍數） */
  x0: number;
  y0: number;
  cols: number;
  rows: number;
}

/** 座標的格子（沒有房間時 null） */
export function coordGrid(floors: readonly Floor[], tokenGrid?: number): CoordGrid | null {
  const cell = tokenGrid && tokenGrid > 0 ? tokenGrid : DEFAULT_CELL;
  let x1 = Number.POSITIVE_INFINITY;
  let y1 = Number.POSITIVE_INFINITY;
  let x2 = Number.NEGATIVE_INFINITY;
  let y2 = Number.NEGATIVE_INFINITY;
  for (const f of floors)
    for (const r of f.rooms)
      for (const p of roomRects(r)) {
        x1 = Math.min(x1, p.x);
        y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x + p.w);
        y2 = Math.max(y2, p.y + p.h);
      }
  if (!Number.isFinite(x1)) return null;
  const x0 = Math.floor(x1 / cell + 1e-9) * cell;
  const y0 = Math.floor(y1 / cell + 1e-9) * cell;
  return {
    cell,
    x0,
    y0,
    cols: Math.max(1, Math.ceil((x2 - x0) / cell - 1e-9)),
    rows: Math.max(1, Math.ceil((y2 - y0) / cell - 1e-9)),
  };
}

export interface CoordLabels extends CoordGrid {
  /** 字級（格） */
  font: number;
  /** 欄名的中心的 y、列號的右緣的 x */
  colY: number;
  rowX: number;
  /** 欄名、列號佔的範圍（匯出的範圍要包進來） */
  rect: Rect;
}

/** 列號的字寬（估計，格）：數字約 0.62 個字級 */
const rowWidth = (rows: number, font: number) => String(rows).length * font * 0.62;

/** 字與東西之間的空隙（格） */
const GAP = 0.35;

/**
 * 欄名與列號的位置：content＝這一層看得到的東西的外接範圍（字寫在它的外面）；沒有時貼著座標的格子。
 */
export function coordLabels(grid: CoordGrid, content: Rect | null): CoordLabels {
  const font = Math.min(1.1, Math.max(0.42, grid.cell * 0.42));
  const top = Math.min(grid.y0, content ? content.y : grid.y0);
  const left = Math.min(grid.x0, content ? content.x : grid.x0);
  const colY = top - GAP - font / 2;
  const rowX = left - GAP;
  const rw = rowWidth(grid.rows, font);
  const x = rowX - rw;
  const y = colY - font / 2;
  return {
    ...grid,
    font,
    colY,
    rowX,
    rect: {
      x,
      y,
      w: grid.x0 + grid.cols * grid.cell - x,
      h: grid.y0 + grid.rows * grid.cell - y,
    },
  };
}
