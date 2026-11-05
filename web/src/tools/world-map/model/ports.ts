/**
 * 港口的棧橋朝哪邊：在港口的格子周圍 14 格內找最近的「另一邊」（港口在陸地上就找海，在海上就找陸地），
 * 棧橋朝海的方向（左右的差比上下大時是左或右）；附近都找不到時朝右。手動指定方向時照指定。
 */
import type { Grid } from './terrain';
import { CELL, type DockSide } from './types';

export type Side = Exclude<DockSide, 'auto'>;

export function coastSide(
  grid: Pick<Grid, 'cols' | 'rows' | 'terrain'>,
  x: number,
  y: number,
): Side {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / CELL)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / CELL)));
  const sea = grid.terrain[cy * grid.cols + cx] === 0;
  let best = Infinity;
  let dx = 1;
  let dy = 0;
  let found = false;
  for (let yy = Math.max(0, cy - 14); yy <= Math.min(grid.rows - 1, cy + 14); yy++)
    for (let xx = Math.max(0, cx - 14); xx <= Math.min(grid.cols - 1, cx + 14); xx++) {
      if ((grid.terrain[yy * grid.cols + xx] === 0) === sea) continue;
      const vx = (xx + 0.5) * CELL - x;
      const vy = (yy + 0.5) * CELL - y;
      const d = vx * vx + vy * vy;
      if (d < best) {
        best = d;
        dx = vx;
        dy = vy;
        found = true;
      }
    }
  if (!found) return 'right';
  if (sea) {
    dx = -dx;
    dy = -dy;
  }
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}

export function dockOf(
  grid: Pick<Grid, 'cols' | 'rows' | 'terrain'>,
  o: { kind: string; dock: DockSide; x: number; y: number },
): Side {
  if (o.kind !== 'port') return 'right';
  return o.dock !== 'auto' ? o.dock : coastSide(grid, o.x, o.y);
}
