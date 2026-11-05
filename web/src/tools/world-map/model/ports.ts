/**
 * 港口的棧橋朝哪邊：在港口的格子周圍 14 格內找最近的「另一邊」（港口在陸地上就找海，在海上就找陸地），
 * 棧橋朝海的方向（左右的差比上下大時是左或右）；附近都找不到時朝右。手動指定方向時照指定。
 */
import { clamp } from './geometry';
import type { Grid } from './terrain';
import { CELL, type DockSide, type Pt } from './types';

export type Side = Exclude<DockSide, 'auto'>;

type Terrain = Pick<Grid, 'cols' | 'rows' | 'terrain'>;

const SEARCH = 14;

/**
 * 從 (x, y) 到周圍 reach 格內最近的、符合 want 的格子中心的向量（同樣近時取上面、左邊的）；都沒有時 null。
 */
function nearestCell(
  grid: Terrain,
  x: number,
  y: number,
  reach: number,
  want: (v: number) => boolean,
): Pt | null {
  const cx = clamp(Math.floor(x / CELL), 0, grid.cols - 1);
  const cy = clamp(Math.floor(y / CELL), 0, grid.rows - 1);
  let found: Pt | null = null;
  let bestSq = Infinity;
  for (let row = Math.max(0, cy - reach); row <= Math.min(grid.rows - 1, cy + reach); row++)
    for (let col = Math.max(0, cx - reach); col <= Math.min(grid.cols - 1, cx + reach); col++) {
      if (!want(grid.terrain[row * grid.cols + col])) continue;
      const v = { x: (col + 0.5) * CELL - x, y: (row + 0.5) * CELL - y };
      const sq = v.x * v.x + v.y * v.y;
      if (sq < bestSq) {
        bestSq = sq;
        found = v;
      }
    }
  return found;
}

/** 向量的主要方向 */
const facing = (v: Pt): Side =>
  Math.abs(v.x) >= Math.abs(v.y) ? (v.x < 0 ? 'left' : 'right') : v.y < 0 ? 'up' : 'down';

export function coastSide(grid: Terrain, x: number, y: number): Side {
  const cx = clamp(Math.floor(x / CELL), 0, grid.cols - 1);
  const cy = clamp(Math.floor(y / CELL), 0, grid.rows - 1);
  const afloat = grid.terrain[cy * grid.cols + cx] === 0;
  /* 在陸地上找最近的海；在海上找最近的陸地，再轉向背對它 */
  const toward = nearestCell(grid, x, y, SEARCH, (v) => (v === 0) !== afloat);
  if (!toward) return 'right';
  return facing(afloat ? { x: -toward.x, y: -toward.y } : toward);
}

export function dockOf(
  grid: Terrain,
  o: { kind: string; dock: DockSide; x: number; y: number },
): Side {
  if (o.kind !== 'port') return 'right';
  return o.dock !== 'auto' ? o.dock : coastSide(grid, o.x, o.y);
}
