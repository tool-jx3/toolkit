/**
 * 距離（量尺用）：方格 5 種算法、六角格的步數與「直線」近似。規則與數值照舊版的量尺。
 */
import { axialDistance, colParity, oddqToAxial } from './hex';

/**
 * 方格的距離算法：
 * - `manhattan`（曼哈頓）：|dx| ＋ |dy|，只能上下左右走的步數；
 * - `chebyshev`（切比雪夫）：max(|dx|, |dy|)，斜走也算一步；
 * - `ceil`／`round`／`floor`：直線距離 √(dx² ＋ dy²) 無條件進位／四捨五入／無條件捨去。
 */
export type SquareDistanceMethod = 'manhattan' | 'chebyshev' | 'ceil' | 'round' | 'floor';
export const SQUARE_DISTANCE_METHODS: readonly SquareDistanceMethod[] = [
  'manhattan',
  'chebyshev',
  'ceil',
  'round',
  'floor',
];

export function squareDistance(dx: number, dy: number, method: SquareDistanceMethod): number {
  if (method === 'chebyshev') return Math.max(Math.abs(dx), Math.abs(dy));
  const raw = Math.sqrt(dx * dx + dy * dy);
  if (method === 'ceil') return Math.ceil(raw);
  if (method === 'round') return Math.round(raw);
  if (method === 'floor') return Math.floor(raw);
  return Math.abs(dx) + Math.abs(dy);
}

/**
 * 六角格的距離算法：
 * - `steps`（格數）：在六角格之間移動的步數（立方座標距離）；
 * - `straight`（直線）：兩格中心的直線距離換算成格數（以正六角形的列距為 1），加 0.14 後四捨五入。
 */
export type HexDistanceMethod = 'steps' | 'straight';
export const HEX_DISTANCE_METHODS: readonly HexDistanceMethod[] = ['steps', 'straight'];

/** odd-q 偏移座標 (col, row) 到原點 (0, 0)（偶數欄）的步數 */
export function oddqStepDistance(col: number, row: number): number {
  return axialDistance(oddqToAxial(col, row), { q: 0, r: 0 });
}

/**
 * odd-q 偏移座標 (col, row) 到原點 (0, 0) 的「直線」格數：
 * round(√(3 × col² ÷ 4 ＋ (2 × row ＋ 奇數欄)² ÷ 4) ＋ 0.14)。
 * 不論是否網格化都用正六角形的比例計算（舊版如此）。
 */
export function oddqStraightDistance(col: number, row: number): number {
  const odd = colParity(col);
  return Math.round(
    Math.sqrt((col * col * 3) / 4 + ((row * 2 + odd) * (row * 2 + odd)) / 4) + 0.14,
  );
}

export function hexDistance(col: number, row: number, method: HexDistanceMethod): number {
  return method === 'steps' ? oddqStepDistance(col, row) : oddqStraightDistance(col, row);
}
