/**
 * 山與森林的圖案怎麼排（純計算；畫法在 draw/marks.ts）。
 *
 * - 離邊界的距離（px）：同一種地形的格子到「別的地形或地圖邊緣」的距離（斜向 √2 的兩趟掃描）。
 *   圖案的大小跟著這個距離：越靠近邊緣越小（山 38 px、樹 32 px 以上是原尺寸），整片地形的顏色不變。
 * - 森林的深度：離邊緣 24 px 以內是 0，之後每 110 px 加到 1；越深的樹越密（多兩個候補位置）、樹冠越深綠。
 * - 森林與山相接（36 px 以內，而且是相連的山與森林，中間隔著平原、雪原、海的不算）：
 *   邊界的距離改用「山＋森林合起來」的距離（交界不再縮小），山腳混進稀疏的樹（越往山裡越少），
 *   靠近森林的山坡帶綠色。
 * - 排法：每 27（樹）／29（山）× 25 px 的交錯格點，依種子的雜湊抖動位置；由上往下、由左往右排（前面的蓋在後面）。
 */
import { CELL, FOREST, MOUNTAIN } from './types';

export interface Mark {
  x: number;
  y: number;
  /** 離邊界的距離（px） */
  edge: number;
  /** 0～1 的變化值（決定樣式的變體） */
  n: number;
  /** 森林的深度（0～1） */
  depth: number;
  /** 0＝主要的格點，1、2＝深的森林多出來的位置 */
  extra: 0 | 1 | 2;
  /** 靠近另一種地形的程度（0～1；山：靠近森林、樹：靠近山） */
  wood: number;
  /** 長在山上的樹（山與森林的交界） */
  mixed: boolean;
  /** 整體的縮放（山上的樹比較小） */
  scale: number;
}

/** 整數的雜湊 → [0, 1) */
export function hash3(x: number, y: number, seed: number): number {
  let n = Math.imul(x + 911, 0x27d4eb2d) ^ Math.imul(y + 577, 0x165667b1) ^ (seed | 0);
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/** 到別的地形或地圖邊緣的距離（px）；不是這種地形的格子是 0 */
export function edgeDistance(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  match: (v: number) => boolean,
): Float32Array {
  const a = new Float32Array(cols * rows);
  const D = Math.SQRT2;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      a[y * cols + x] = match(cells[y * cols + x]) ? Math.min(x + 1, y + 1, cols - x, rows - y) : 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!a[i]) continue;
      a[i] = Math.min(
        a[i],
        x ? a[i - 1] + 1 : 1,
        y ? a[i - cols] + 1 : 1,
        x && y ? a[i - cols - 1] + D : 1e6,
        x < cols - 1 && y ? a[i - cols + 1] + D : 1e6,
      );
    }
  for (let y = rows - 1; y >= 0; y--)
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (!a[i]) continue;
      a[i] = Math.min(
        a[i],
        x < cols - 1 ? a[i + 1] + 1 : 1,
        y < rows - 1 ? a[i + cols] + 1 : 1,
        x < cols - 1 && y < rows - 1 ? a[i + cols + 1] + D : 1e6,
        x && y < rows - 1 ? a[i + cols - 1] + D : 1e6,
      );
    }
  for (let i = 0; i < a.length; i++) a[i] = Math.max(0, a[i] * CELL - CELL / 2);
  return a;
}

/** 沿著相連的山與森林格子，到某一種地形的距離（px；隔著別的地形到不了的是很大的值） */
export function reliefProximity(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  value: number,
): Float32Array {
  const a = new Float32Array(cols * rows);
  for (let i = 0; i < a.length; i++) a[i] = cells[i] === value ? 0 : 1e6;
  const pass = (v: number) => v === FOREST || v === MOUNTAIN;
  const D = Math.SQRT2;
  const relax = (x: number, y: number, step: number) => {
    const i = y * cols + x;
    if (!pass(cells[i]) || cells[i] === value) return;
    const near: [number, number, number][] = [
      [step, 0, 1],
      [0, step, 1],
      [step, step, D],
      [-step, step, D],
    ];
    for (const [dx, dy, cost] of near) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const j = yy * cols + xx;
      if (pass(cells[j])) a[i] = Math.min(a[i], a[j] + cost);
    }
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) relax(x, y, -1);
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) relax(x, y, 1);
  for (let i = 0; i < a.length; i++) a[i] *= CELL;
  return a;
}

export const BLEND_REACH = 36;

export interface ReliefFields {
  /** 邊界距離（交界處混合過） */
  edge: Float32Array;
  /** 到森林的距離（山與森林都有時） */
  forest: Float32Array | null;
}

export function reliefFields(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  value: number,
): ReliefFields {
  const own = edgeDistance(cells, cols, rows, (v) => v === value);
  let hasF = false;
  let hasM = false;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === FOREST) hasF = true;
    else if (cells[i] === MOUNTAIN) hasM = true;
  }
  if (!hasF || !hasM) return { edge: own, forest: null };
  const forest = reliefProximity(cells, cols, rows, FOREST);
  const other = value === FOREST ? reliefProximity(cells, cols, rows, MOUNTAIN) : forest;
  const joint = edgeDistance(cells, cols, rows, (v) => v === FOREST || v === MOUNTAIN);
  const edge = new Float32Array(own.length);
  for (let i = 0; i < own.length; i++) {
    const t = other[i] <= BLEND_REACH ? 1 - other[i] / BLEND_REACH : 0;
    edge[i] = own[i] * (1 - t) + joint[i] * t;
  }
  return { edge, forest };
}

/** 森林的深度：離邊緣 24 px 以內 0，之後 110 px 到 1 */
export const forestDepth = (edge: number): number => Math.min(1, Math.max(0, (edge - 24) / 110));

export function layoutMarks(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  value: typeof FOREST | typeof MOUNTAIN,
  seed: number,
): Mark[] {
  const W = cols * CELL;
  const H = rows * CELL;
  const fields = reliefFields(cells, cols, rows, value);
  const forest = value === FOREST;
  const sx = forest ? 27 : 29;
  const sy = 25;
  const marks: Mark[] = [];
  const add = (px: number, py: number, n: number, extra: 0 | 1 | 2 = 0, threshold = 0) => {
    const ix = Math.floor(px / CELL);
    const iy = Math.floor(py / CELL);
    if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) return;
    const i = iy * cols + ix;
    const wood = fields.forest ? Math.min(1, Math.max(0, 1 - fields.forest[i] / BLEND_REACH)) : 0;
    const mixed = forest && cells[i] === MOUNTAIN && wood > 0;
    if (cells[i] !== value && !mixed) return;
    /* 山上的樹：只放主要的格點，越往山裡越少 */
    if (mixed && (extra || hash3(ix, iy, seed + 829) > wood * 0.75)) return;
    const edge = Math.max(
      0.5,
      fields.edge[i] - Math.hypot(px - (ix + 0.5) * CELL, py - (iy + 0.5) * CELL),
    );
    if (edge < 2) return;
    const depth = forest ? forestDepth(edge) * (mixed ? wood * 0.45 : 1) : 0;
    const chance = extra === 1 ? depth * 0.95 : Math.max(0, (depth - 0.35) / 0.65) * 0.82;
    if (extra && threshold > chance) return;
    marks.push({
      x: px,
      y: py,
      edge,
      n,
      depth,
      extra,
      wood,
      mixed,
      scale: mixed ? 0.58 + 0.28 * wood : 1,
    });
  };
  for (let row = 0, y = 8; y < H; y += sy, row++)
    for (let col = 0, x = 8 + ((row % 2) * sx) / 2; x < W; x += sx, col++) {
      const n = hash3(col, row, seed + value * 97);
      add(x + (n - 0.5) * sx * 0.47, y + (hash3(col, row, seed + 439) - 0.5) * sy * 0.42, n);
      if (forest) {
        add(
          x + sx * 0.5 + (hash3(col, row, seed + 121) - 0.5) * 3,
          y + sy * 0.5,
          hash3(col, row, seed + 87),
          1,
          hash3(col, row, seed + 261),
        );
        add(
          x + sx * 0.5,
          y + (hash3(col, row, seed + 593) - 0.5) * 3,
          hash3(col, row, seed + 399),
          2,
          hash3(col, row, seed + 963),
        );
      }
    }
  return marks.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 樹的大小（相對於原尺寸）：靠邊緣變小，深的森林大一點 */
export function treeScale(m: Mark, variant01: number): number {
  const g = Math.min(1, m.edge / 32);
  const r = (4.6 + 6.3 * g) * (0.84 + variant01 * 0.28);
  const safe = Math.min(1, m.edge / (r * 1.55));
  return ((4.6 + 6.3 * g) / 10.9) * safe * (1 + m.depth * 0.14) * m.scale;
}

/** 山的寬、高的縮放（相對於原尺寸）：靠邊緣時又小又矮 */
export function mountainScale(m: Mark, variant01: number): { sx: number; sy: number } {
  const g = Math.min(1, m.edge / 38);
  const w = (11 + 17 * g) * (0.87 + variant01 * 0.25);
  const h = (7 + 40 * g) * (0.78 + variant01 * 0.35);
  const safe = Math.min(1, m.edge / Math.max(h * 1.12, w * 1.4));
  return { sx: ((11 + 17 * g) / 28) * safe * m.scale, sy: ((7 + 40 * g) / 47) * safe * m.scale };
}
