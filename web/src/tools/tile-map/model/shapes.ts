/**
 * 圖形工具的格子：長方形、橢圓、正圓、菱形、三角形（尖端朝上）、直線；可以只畫外框（直線沒有外框之分）。
 * 範圍是兩個角所在的格子（含）；正圓取寬高較小的一邊、放在範圍中間。
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

/** 兩點之間的直線經過的格子（Bresenham，含兩端） */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

const EPS = 1e-9;

/** 圖形涵蓋的格子（由上到下、由左到右） */
export function shapeCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  kind: ShapeKind,
  outline = false,
): [number, number][] {
  if (kind === 'line') return lineCells(x0, y0, x1, y1);
  let left = Math.min(x0, x1);
  let top = Math.min(y0, y1);
  let right = Math.max(x0, x1);
  let bottom = Math.max(y0, y1);
  if (kind === 'circle') {
    const side = Math.min(right - left + 1, bottom - top + 1);
    left += Math.floor((right - left + 1 - side) / 2);
    top += Math.floor((bottom - top + 1 - side) / 2);
    right = left + side - 1;
    bottom = top + side - 1;
  }
  const w = right - left + 1;
  const h = bottom - top + 1;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = w / 2;
  const ry = h / 2;
  const inside = (x: number, y: number): boolean => {
    if (x < left || x > right || y < top || y > bottom) return false;
    switch (kind) {
      case 'rect':
        return true;
      case 'diamond':
        return Math.abs(x - cx) / rx + Math.abs(y - cy) / ry <= 1 + EPS;
      case 'triangle':
        /* 每一列的半寬照「這一列的中線離頂端多遠」成比例：頂端一列最窄、底下一列最寬 */
        return Math.abs(x - cx) <= (w / 2) * ((y - top + 0.5) / h) + EPS;
      default:
        return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + EPS;
    }
  };
  const out: [number, number][] = [];
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      if (!inside(x, y)) continue;
      if (outline && inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))
        continue;
      out.push([x, y]);
    }
  return out;
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
