/**
 * 圖形工具的格子：長方形、橢圓、正圓、菱形、三角形（尖端朝上）、直線；可以只畫外框（直線沒有外框之分）。
 * 範圍是兩個角所在的格子（含）；正圓取寬高較小的一邊、放在範圍中間。
 *
 * 做法：先把範圍裡每一格的中心換成「相對位置」（範圍中心是 0、左右上下的邊是 ±1），
 * 每種形狀是一個只看相對位置的判斷（FITS 表）；判斷的結果畫成一張遮罩，外框＝遮罩裡上下左右有空格（或碰到範圍邊）的格子。
 */

export type ShapeKind = 'rect' | 'ellipse' | 'circle' | 'diamond' | 'triangle' | 'line';
export const SHAPE_KINDS: readonly ShapeKind[] = [
  'rect',
  'ellipse',
  'circle',
  'diamond',
  'triangle',
  'line',
];

export function isShapeKind(v: unknown): v is ShapeKind {
  return typeof v === 'string' && (SHAPE_KINDS as readonly string[]).includes(v);
}

type Cell = [number, number];

/** 兩格之間的直線經過的格子（含兩端；8 連通，誤差項的整數直線演算法） */
export function lineCells(ax: number, ay: number, bx: number, by: number): Cell[] {
  const run = Math.abs(bx - ax);
  const rise = Math.abs(by - ay);
  const stepX = Math.sign(bx - ax);
  const stepY = Math.sign(by - ay);
  const cells: Cell[] = [[ax, ay]];
  /* d：目前的點離理想直線多遠（放大成整數）；正的偏向還要往橫走、負的偏向還要往直走 */
  let d = run - rise;
  let x = ax;
  let y = ay;
  while (x !== bx || y !== by) {
    const twice = d + d;
    if (twice >= -rise) {
      d -= rise;
      x += stepX;
    }
    if (twice <= run) {
      d += run;
      y += stepY;
    }
    cells.push([x, y]);
  }
  return cells;
}

/** 判斷的容許誤差（浮點的進位，剛好落在邊上的格子算在裡面） */
const TOL = 1e-9;

/**
 * 每種形狀：相對位置 (nx, ny) 的格子中心算不算在形狀裡。nx、ny 是格子中心離範圍中心的距離，
 * 以半寬、半高為 1（所以範圍最外圈的格子中心在 ±(1 − 1／格數)）。
 */
const FITS: Record<Exclude<ShapeKind, 'line'>, (nx: number, ny: number) => boolean> = {
  rect: () => true,
  ellipse: (nx, ny) => nx * nx + ny * ny <= 1 + TOL,
  circle: (nx, ny) => nx * nx + ny * ny <= 1 + TOL,
  diamond: (nx, ny) => Math.abs(nx) + Math.abs(ny) <= 1 + TOL,
  /* 尖端朝上：每一列能用的寬度和「這一列到頂端的距離」成正比，最底下一列幾乎用滿 */
  triangle: (nx, ny) => 2 * Math.abs(nx) <= 1 + ny + TOL,
};

/** 兩個角 → 範圍（左上角與寬高）；正圓取短邊、放在中間（多出來的奇數格偏左上） */
function boxOf(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  square: boolean,
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  const w = Math.abs(bx - ax) + 1;
  const h = Math.abs(by - ay) + 1;
  if (!square) return { x, y, w, h };
  const side = Math.min(w, h);
  return { x: x + Math.floor((w - side) / 2), y: y + Math.floor((h - side) / 2), w: side, h: side };
}

/** 圖形涵蓋的格子（由上到下、由左到右） */
export function shapeCells(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  kind: ShapeKind,
  outline = false,
): Cell[] {
  if (kind === 'line') return lineCells(ax, ay, bx, by);
  const box = boxOf(ax, ay, bx, by, kind === 'circle');
  const fits = FITS[kind];
  /* 遮罩四周多留一圈空格，外框的判斷不必另外處理範圍的邊 */
  const stride = box.w + 2;
  const mask = new Uint8Array(stride * (box.h + 2));
  for (let j = 0; j < box.h; j++) {
    const ny = (2 * j + 1 - box.h) / box.h;
    for (let i = 0; i < box.w; i++)
      if (fits((2 * i + 1 - box.w) / box.w, ny)) mask[(j + 1) * stride + i + 1] = 1;
  }
  const cells: Cell[] = [];
  for (let j = 0; j < box.h; j++)
    for (let i = 0; i < box.w; i++) {
      const k = (j + 1) * stride + i + 1;
      if (!mask[k]) continue;
      if (outline && mask[k - 1] && mask[k + 1] && mask[k - stride] && mask[k + stride]) continue;
      cells.push([box.x + i, box.y + j]);
    }
  return cells;
}

/**
 * 「設定大小」放圖形：以 (x, y) 那一格為中心、寬 w 高 h 格的範圍（正圓的高等於寬）。
 * 寬或高是偶數時中心偏右下（左上角 = 中心 − floor(寬 ÷ 2)）。
 */
export function centeredBox(
  x: number,
  y: number,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = x - Math.floor(w / 2);
  const y0 = y - Math.floor(h / 2);
  return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
}
