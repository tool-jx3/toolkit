/**
 * 方格：格子 (col, row) 佔 [col × size, (col + 1) × size) × [row × size, (row + 1) × size)；
 * (0, 0) 格的左上角在原點。負的欄列也有效（地圖編輯器的無限畫布）。
 */
import type { Cell, Point, Segment, SnapDelta, SnapPoint, View } from './types';

/** 像素 → 所在的格子（落在格線上算右邊／下面那一格） */
export function squareCellAt(x: number, y: number, size: number): Cell {
  return { col: Math.floor(x / size), row: Math.floor(y / size) };
}

/** 格子中心 */
export function squareCellCenter(col: number, row: number, size: number): Point {
  return { x: col * size + size / 2, y: row * size + size / 2 };
}

export interface SquareRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 格子的範圍；`scale` < 1 時在格子中央縮小（每一格所佔的範圍不變，四周留出 size × (1 − scale) ÷ 2 的間隙）。
 */
export function squareCellRect(col: number, row: number, size: number, scale = 1): SquareRect {
  const margin = (size * (1 - scale)) / 2;
  const side = size * scale;
  return { x: col * size + margin, y: row * size + margin, width: side, height: side };
}

/** 四個角，順時針：左上、右上、右下、左下（第 i 條邊＝角 i → 角 i＋1，外側是 SQUARE_NEIGHBORS 的第 i 個方向） */
export function squareCorners(col: number, row: number, size: number): Point[] {
  const x = col * size;
  const y = row * size;
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

/** 四個鄰格的方向，順序對應 squareCorners 的四條邊：上、右、下、左 */
export const SQUARE_EDGE_NEIGHBORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** 四鄰格（填色的 BFS 用）：右、左、下、上（與舊版地圖編輯器相同的順序） */
export function squareNeighbors(col: number, row: number): Cell[] {
  return [
    { col: col + 1, row },
    { col: col - 1, row },
    { col, row: row + 1 },
    { col, row: row - 1 },
  ];
}

/** 這一點附近的吸附候選：最近的格子點、所在格子的中心、所在格子上下兩邊與左右兩邊最近的中點 */
export function squareSnapPoints(x: number, y: number, size: number): SnapPoint[] {
  const gx = Math.round(x / size) * size;
  const gy = Math.round(y / size) * size;
  const cx = (Math.floor(x / size) + 0.5) * size;
  const cy = (Math.floor(y / size) + 0.5) * size;
  return [
    { x: gx, y: gy, type: 'intersection' },
    { x: cx, y: cy, type: 'center' },
    { x: cx, y: gy, type: 'midpoint' },
    { x: gx, y: cy, type: 'midpoint' },
  ];
}

/** 拖曳位移吸附成整格（四捨五入） */
export function squareSnapDelta(dx: number, dy: number, size: number): SnapDelta {
  const colDelta = Math.round(dx / size);
  const rowDelta = Math.round(dy / size);
  return { colDelta, rowDelta, dx: colDelta * size, dy: rowDelta * size };
}

/**
 * 蓋滿可見範圍的格線（四周各多一格）：先直線（左到右）再橫線（上到下）。
 * 地圖編輯器畫無限網格用；網格圖產生器的整張圖用 `squareSheetLines`。
 */
export function squareGridLines(view: View, size: number): Segment[] {
  const c0 = Math.floor(view.left / size) - 1;
  const c1 = Math.ceil(view.right / size) + 1;
  const r0 = Math.floor(view.top / size) - 1;
  const r1 = Math.ceil(view.bottom / size) + 1;
  const out: Segment[] = [];
  for (let c = c0; c <= c1; c++)
    out.push({ from: { x: c * size, y: r0 * size }, to: { x: c * size, y: r1 * size } });
  for (let r = r0; r <= r1; r++)
    out.push({ from: { x: c0 * size, y: r * size }, to: { x: c1 * size, y: r * size } });
  return out;
}

/** cols × rows 格的整張圖的尺寸 */
export function squareSheetSize(cols: number, rows: number, size: number) {
  return { width: cols * size, height: rows * size };
}

/**
 * 整張 cols × rows 的格線：直線 x＝0、size、…、cols × size（從上緣畫到下緣），再橫線 y＝0…rows × size。
 * 線剛好落在格子邊界（不加半像素位移），所以最外圈的線有一半在畫布外。
 */
export function squareSheetLines(cols: number, rows: number, size: number): Segment[] {
  const { width, height } = squareSheetSize(cols, rows, size);
  const out: Segment[] = [];
  for (let c = 0; c <= cols; c++)
    out.push({ from: { x: c * size, y: 0 }, to: { x: c * size, y: height } });
  for (let r = 0; r <= rows; r++)
    out.push({ from: { x: 0, y: r * size }, to: { x: width, y: r * size } });
  return out;
}
