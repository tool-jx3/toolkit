/**
 * 格子圖層的資料規則（純資料，不碰畫面；單元測試可以直接用）：一格的資料、填滿（規格 F092）、整格移動。
 */
import type { MapGrid } from '@/core/grid';

/** 格子圖層的一格（`_cellEntries`） */
export interface CellEntry {
  col: number;
  row: number;
  fillKey: string;
  mode: 'solid' | 'pattern';
  solidColor?: string;
  patternId?: string;
  patOffX?: number;
  patOffY?: number;
  patRot?: number;
  patScale?: number;
}

/** 填滿的上限（格） */
export const FILL_MAX_CELLS = 10000;

/** 單色的一格（填色鍵＝`solid:<顏色>`） */
export function solidEntry(col: number, row: number, color: string): CellEntry {
  return { col, row, fillKey: `solid:${color}`, mode: 'solid', solidColor: color };
}

export type FillResult =
  | { ok: true; count: number }
  | { ok: false; reason: 'empty' | 'outside' | 'limit' | 'same' };

/**
 * 填滿（F092）：外接框內、與起點相連（鄰格依網格）且同一種填色（或同樣空白）的格子換成 newEntry。
 * 純資料（不碰畫面）；成功時已寫進 _cellData，呼叫端再 commit。
 */
export function floodFill(
  data: Map<string, CellEntry>,
  grid: MapGrid,
  col: number,
  row: number,
  newEntry: (col: number, row: number) => CellEntry,
): FillResult {
  if (data.size === 0) return { ok: false, reason: 'empty' };
  let minC = Number.POSITIVE_INFINITY;
  let maxC = Number.NEGATIVE_INFINITY;
  let minR = Number.POSITIVE_INFINITY;
  let maxR = Number.NEGATIVE_INFINITY;
  for (const e of data.values()) {
    minC = Math.min(minC, e.col);
    maxC = Math.max(maxC, e.col);
    minR = Math.min(minR, e.row);
    maxR = Math.max(maxR, e.row);
  }
  if (col < minC || col > maxC || row < minR || row > maxR) return { ok: false, reason: 'outside' };
  const target = data.get(grid.cellKey(col, row))?.fillKey ?? null;
  if (newEntry(col, row).fillKey === target) return { ok: false, reason: 'same' };
  const visited = new Set([grid.cellKey(col, row)]);
  const queue: [number, number][] = [[col, row]];
  const toFill: [number, number][] = [];
  while (queue.length) {
    const [c, r] = queue.shift() as [number, number];
    if (c < minC || c > maxC || r < minR || r > maxR) continue;
    const k = data.get(grid.cellKey(c, r))?.fillKey ?? null;
    if (k !== target) continue;
    toFill.push([c, r]);
    if (toFill.length > FILL_MAX_CELLS) return { ok: false, reason: 'limit' };
    for (const n of grid.neighbors(c, r)) {
      const key = grid.cellKey(n.col, n.row);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([n.col, n.row]);
      }
    }
  }
  for (const [c, r] of toFill) data.set(grid.cellKey(c, r), newEntry(c, r));
  return { ok: true, count: toFill.length };
}

/** 整格移動：每一格的位置加上位移 */
export function shiftedCells(
  data: Map<string, CellEntry>,
  grid: MapGrid,
  colDelta: number,
  rowDelta: number,
): Map<string, CellEntry> {
  const next = new Map<string, CellEntry>();
  for (const e of data.values()) {
    const moved = { ...e, col: e.col + colDelta, row: e.row + rowDelta };
    next.set(grid.cellKey(moved.col, moved.row), moved);
  }
  return next;
}
