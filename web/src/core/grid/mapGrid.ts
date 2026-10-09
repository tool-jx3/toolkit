/**
 * 地圖編輯器用的「網格種類」：把方格與四種六角格（平頂／尖頂 × 一般／對齊網格）包成同一組介面，
 * 對應舊版 `trpg_map_maker/map_grid.js` 的 GridAdapter（像素→格、格子的形狀、合併外框、鄰格、吸附、整格位移、格線）。
 * 全部是純函式。座標：方格 (col, row)；六角格是軸座標 (q, r)，放在 Cell 的 col、row（與舊版的存檔相同）。
 *
 * ```ts
 * const g = mapGrid('hex-flat', 72);
 * const cell = g.cellAt(100, 40);              // 點到哪一格
 * const d = loopsToSvgPath(g.outline(cells));  // 同色格子合成一個形狀
 * ```
 */
import {
  axialCenter,
  type HexMetrics,
  hexCorners,
  hexGridPolylines,
  hexMetrics,
  hexNeighbors,
  hexSnapDelta,
  hexSnapPoints,
  pixelToAxial,
} from './hex';
import { hexOutline, squareOutline } from './outline';
import {
  squareCellAt,
  squareCorners,
  squareGridLines,
  squareNeighbors,
  squareSnapDelta,
  squareSnapPoints,
} from './square';
import type { Cell, HexOrientation, Point, SnapDelta, SnapPoint, View } from './types';

export type MapGridType = 'square' | 'hex-flat' | 'hex-flat-fit' | 'hex-pointy' | 'hex-pointy-fit';

export const MAP_GRID_TYPES: readonly MapGridType[] = [
  'square',
  'hex-flat',
  'hex-flat-fit',
  'hex-pointy',
  'hex-pointy-fit',
];

export function isMapGridType(v: unknown): v is MapGridType {
  return typeof v === 'string' && (MAP_GRID_TYPES as readonly string[]).includes(v);
}

/** 由三個選項組出網格種類（舊版新增地圖的精靈） */
export function composeMapGridType(
  kind: 'square' | 'hex',
  orientation: HexOrientation = 'flat',
  fit = false,
): MapGridType {
  if (kind === 'square') return 'square';
  return `hex-${orientation}${fit ? '-fit' : ''}` as MapGridType;
}

/** 網格種類 → 三個選項 */
export function parseMapGridType(type: MapGridType): {
  kind: 'square' | 'hex';
  orientation: HexOrientation;
  fit: boolean;
} {
  if (type === 'square') return { kind: 'square', orientation: 'flat', fit: false };
  return {
    kind: 'hex',
    orientation: type.startsWith('hex-pointy') ? 'pointy' : 'flat',
    fit: type.endsWith('-fit'),
  };
}

export interface MapGrid {
  type: MapGridType;
  /** 格子大小（方格的邊長；六角格平頂時是高、尖頂時是寬） */
  size: number;
  isHex: boolean;
  /** 六角格的尺寸（方格是 null） */
  hex: HexMetrics | null;
  /** 像素 → 所在的格 */
  cellAt(x: number, y: number): Cell;
  /** Map 的鍵「col,row」 */
  cellKey(col: number, row: number): string;
  /** 一格的角（方格 4 個、六角格 6 個；畫面座標） */
  cellCorners(col: number, row: number): Point[];
  /** 一格的中心 */
  cellCenter(col: number, row: number): Point;
  /** 一格的 SVG path（M … L … z） */
  cellPath(col: number, row: number): string;
  /** 一群格子的外框迴圈（洞是反向的迴圈，用 evenodd 填色） */
  outline(cells: readonly Cell[]): Point[][];
  /** 鄰格（方格 4 個：右、左、下、上；六角格 6 個） */
  neighbors(col: number, row: number): Cell[];
  /** 這一點附近的吸附候選 */
  snapPoints(x: number, y: number): SnapPoint[];
  /** 拖曳位移吸附成整格 */
  snapDelta(dx: number, dy: number): SnapDelta;
  /** 蓋滿可見範圍的格線（每條是一條折線） */
  gridLines(view: View): Point[][];
  /** 縮放小於這個倍率時不畫格線（方格 0.25、六角格 0.35；舊版的效能門檻） */
  minZoom: number;
}

const key = (col: number, row: number) => `${col},${row}`;

function pathOf(points: readonly Point[]): string {
  return `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} z`;
}

function squareGrid(size: number): MapGrid {
  return {
    type: 'square',
    size,
    isHex: false,
    hex: null,
    cellAt: (x, y) => squareCellAt(x, y, size),
    cellKey: key,
    cellCorners: (col, row) => squareCorners(col, row, size),
    cellCenter: (col, row) => ({ x: col * size + size / 2, y: row * size + size / 2 }),
    cellPath: (col, row) => pathOf(squareCorners(col, row, size)),
    outline: (cells) => squareOutline(cells, size),
    neighbors: (col, row) => squareNeighbors(col, row),
    snapPoints: (x, y) => squareSnapPoints(x, y, size),
    snapDelta: (dx, dy) => squareSnapDelta(dx, dy, size),
    gridLines: (view) => squareGridLines(view, size).map((s) => [s.from, s.to]),
    minZoom: 0.25,
  };
}

function hexGrid(type: MapGridType, size: number): MapGrid {
  const { orientation, fit } = parseMapGridType(type);
  const m = hexMetrics(size, { orientation, fit });
  const center = (col: number, row: number) => axialCenter(col, row, m);
  const corners = (col: number, row: number) => hexCorners(center(col, row), m);
  return {
    type,
    size,
    isHex: true,
    hex: m,
    cellAt: (x, y) => {
      const a = pixelToAxial(x, y, m);
      return { col: a.q, row: a.r };
    },
    cellKey: key,
    cellCorners: corners,
    cellCenter: center,
    cellPath: (col, row) => pathOf(corners(col, row)),
    outline: (cells) =>
      hexOutline(
        cells.map((c) => ({ q: c.col, r: c.row })),
        m,
      ),
    neighbors: (col, row) =>
      hexNeighbors(col, row, orientation).map((a) => ({ col: a.q, row: a.r })),
    snapPoints: (x, y) => hexSnapPoints(x, y, m),
    snapDelta: (dx, dy) => hexSnapDelta(dx, dy, m),
    gridLines: (view) => hexGridPolylines(view, m),
    minZoom: 0.35,
  };
}

/** 依網格種類建立（未知的種類當作方格，同舊版） */
export function mapGrid(type: MapGridType | string, size: number): MapGrid {
  if (type === 'square' || !isMapGridType(type)) return squareGrid(size);
  return hexGrid(type, size);
}

/**
 * 吸附：候選點裡依 `types` 篩選、距離小於 `threshold`（不含等於）的最近一點；沒有時 null。
 * 舊版：threshold＝18 ÷ 縮放（螢幕上 18 px）。
 */
export function nearestSnap(
  candidates: readonly SnapPoint[],
  x: number,
  y: number,
  threshold: number,
  types: { intersection: boolean; center: boolean; midpoint: boolean },
): Point | null {
  let best: Point | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    if (!types[c.type]) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < threshold && d < bestD) {
      bestD = d;
      best = { x: c.x, y: c.y };
    }
  }
  return best;
}
