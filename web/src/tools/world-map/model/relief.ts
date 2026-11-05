/**
 * 山與森林的圖案怎麼排（純計算；畫法在 draw/marks.ts）。
 *
 * - 離邊界的距離（px）：同一種地形的格子到「別的地形或地圖邊緣」的距離（斜向 √2 的兩趟掃描，model/distance.ts）。
 *   圖案的大小跟著這個距離：越靠近邊緣越小（山 38 px、樹 32 px 以上是原尺寸），整片地形的顏色不變。
 * - 森林的深度：離邊緣 24 px 以內是 0，之後每 110 px 加到 1；越深的樹越密（多兩個候補位置）、樹冠越深綠。
 * - 森林與山相接（36 px 以內，而且是相連的山與森林，中間隔著平原、雪原、海的不算）：
 *   邊界的距離改用「山＋森林合起來」的距離（交界不再縮小），山腳混進稀疏的樹（越往山裡越少），
 *   靠近森林的山坡帶綠色。
 * - 排法：每 27（樹）／29（山）× 25 px 的交錯格點，依種子的雜湊抖動位置；由上往下、由左往右排（前面的蓋在後面）。
 */
import { OCTILE, sweep } from './distance';
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

const unit = (v: number) => Math.min(1, Math.max(0, v));
const isRelief = (v: number) => v === FOREST || v === MOUNTAIN;

/** 到別的地形或地圖邊緣的距離（px）；不是這種地形的格子是 0 */
export function edgeDistance(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  match: (v: number) => boolean,
): Float32Array {
  const field = new Float32Array(cols * rows);
  field.forEach((_, i) => {
    const x = i % cols;
    const y = (i - x) / cols;
    /* 一開始先填到地圖邊緣的格數 */
    if (match(cells[i])) field[i] = Math.min(x + 1, y + 1, cols - x, rows - y);
  });
  sweep(field, cols, rows, OCTILE, { outside: 1 });
  return field.map((cellsAway) => Math.max(0, cellsAway * CELL - CELL / 2));
}

/** 沿著相連的山與森林格子，到某一種地形的距離（px；隔著別的地形到不了的是很大的值） */
export function reliefProximity(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  value: number,
): Float32Array {
  const field = Float32Array.from({ length: cols * rows }, (_, i) =>
    cells[i] === value ? 0 : 1e6,
  );
  sweep(field, cols, rows, OCTILE, {
    update: (i) => isRelief(cells[i]) && cells[i] !== value,
    from: (j) => isRelief(cells[j]),
    outside: null,
  });
  return field.map((cellsAway) => cellsAway * CELL);
}

export const BLEND_REACH = 36;
/** 離另一種地形 d px 時，交界的混合程度（36 px 以內從 1 降到 0） */
const blendAt = (d: number) => (d <= BLEND_REACH ? 1 - d / BLEND_REACH : 0);

export interface ReliefFields {
  /** 邊界距離（交界處混合過） */
  edge: Float32Array;
  /** 到森林的距離（山與森林都有時） */
  forest: Float32Array | null;
}

function contains(cells: ArrayLike<number>, v: number): boolean {
  for (let i = 0; i < cells.length; i++) if (cells[i] === v) return true;
  return false;
}

export function reliefFields(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  value: number,
): ReliefFields {
  const own = edgeDistance(cells, cols, rows, (v) => v === value);
  if (!contains(cells, FOREST) || !contains(cells, MOUNTAIN)) return { edge: own, forest: null };
  const forest = reliefProximity(cells, cols, rows, FOREST);
  const toOther = value === FOREST ? reliefProximity(cells, cols, rows, MOUNTAIN) : forest;
  const joint = edgeDistance(cells, cols, rows, isRelief);
  const edge = Float32Array.from(own, (d, i) => {
    const t = blendAt(toOther[i]);
    return d * (1 - t) + joint[i] * t;
  });
  return { edge, forest };
}

/** 森林的深度：離邊緣 24 px 以內 0，之後 110 px 到 1 */
export const forestDepth = (edge: number): number => unit((edge - 24) / 110);

/** 一個候補位置（還沒確認那裡是不是這種地形） */
interface Spot {
  x: number;
  y: number;
  n: number;
  extra: 0 | 1 | 2;
  /** 深的森林多出來的位置：雜湊值小於出現機率才放 */
  gate: number;
}

/** 深的森林在格點之間多放的兩個位置：位移（格點間距的比例＋抖動的雜湊鹽）、樣式與出現的雜湊鹽、出現機率 */
const DENSE_SPOTS = [
  {
    extra: 1 as const,
    dx: 0.5,
    dy: 0.5,
    jitterX: 121,
    jitterY: 0,
    look: 87,
    gate: 261,
    odds: (depth: number) => depth * 0.95,
  },
  {
    extra: 2 as const,
    dx: 0.5,
    dy: 0,
    jitterX: 0,
    jitterY: 593,
    look: 399,
    gate: 963,
    odds: (depth: number) => Math.max(0, (depth - 0.35) / 0.65) * 0.82,
  },
];

/** 交錯格點上的候補位置（由上往下、由左往右；深的森林每個格點多兩個） */
function latticeSpots(
  width: number,
  height: number,
  value: typeof FOREST | typeof MOUNTAIN,
  seed: number,
): Spot[] {
  const forest = value === FOREST;
  const gx = forest ? 27 : 29;
  const gy = 25;
  const spots: Spot[] = [];
  for (let row = 0; 8 + row * gy < height; row++) {
    const y = 8 + row * gy;
    for (let col = 0, x = 8 + ((row % 2) * gx) / 2; x < width; x += gx, col++) {
      const h = (salt: number) => hash3(col, row, seed + salt);
      const n = h(value * 97);
      spots.push({
        x: x + (n - 0.5) * gx * 0.47,
        y: y + (h(439) - 0.5) * gy * 0.42,
        n,
        extra: 0,
        gate: 0,
      });
      if (!forest) continue;
      for (const s of DENSE_SPOTS)
        spots.push({
          x: x + gx * s.dx + (s.jitterX ? (h(s.jitterX) - 0.5) * 3 : 0),
          y: y + gy * s.dy + (s.jitterY ? (h(s.jitterY) - 0.5) * 3 : 0),
          n: h(s.look),
          extra: s.extra,
          gate: h(s.gate),
        });
    }
  }
  return spots;
}

export function layoutMarks(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  value: typeof FOREST | typeof MOUNTAIN,
  seed: number,
): Mark[] {
  const fields = reliefFields(cells, cols, rows, value);
  const forest = value === FOREST;
  const place = (s: Spot): Mark | null => {
    const ix = Math.floor(s.x / CELL);
    const iy = Math.floor(s.y / CELL);
    if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) return null;
    const i = iy * cols + ix;
    const wood = fields.forest ? unit(1 - fields.forest[i] / BLEND_REACH) : 0;
    const mixed = forest && cells[i] === MOUNTAIN && wood > 0;
    if (cells[i] !== value && !mixed) return null;
    /* 山上的樹：只放主要的格點，越往山裡越少 */
    if (mixed && (s.extra || hash3(ix, iy, seed + 829) > wood * 0.75)) return null;
    const edge = fields.edge[i] - Math.hypot(s.x - (ix + 0.5) * CELL, s.y - (iy + 0.5) * CELL);
    if (edge < 2) return null;
    const depth = forest ? forestDepth(edge) * (mixed ? wood * 0.45 : 1) : 0;
    if (s.extra && s.gate > DENSE_SPOTS[s.extra - 1].odds(depth)) return null;
    const scale = mixed ? 0.58 + 0.28 * wood : 1;
    return { x: s.x, y: s.y, edge, n: s.n, depth, extra: s.extra, wood, mixed, scale };
  };
  const marks: Mark[] = [];
  for (const s of latticeSpots(cols * CELL, rows * CELL, value, seed)) {
    const m = place(s);
    if (m) marks.push(m);
  }
  return marks.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 樹的大小（相對於原尺寸）：靠邊緣變小，深的森林大一點 */
export function treeScale(m: Mark, variant01: number): number {
  const grown = 4.6 + 6.3 * Math.min(1, m.edge / 32);
  const room = Math.min(1, m.edge / (grown * (0.84 + variant01 * 0.28) * 1.55));
  return (grown / 10.9) * room * (1 + m.depth * 0.14) * m.scale;
}

/** 山的寬、高的縮放（相對於原尺寸）：靠邊緣時又小又矮 */
export function mountainScale(m: Mark, variant01: number): { sx: number; sy: number } {
  const g = Math.min(1, m.edge / 38);
  const baseW = 11 + 17 * g;
  const baseH = 7 + 40 * g;
  const w = baseW * (0.87 + variant01 * 0.25);
  const h = baseH * (0.78 + variant01 * 0.35);
  const room = Math.min(1, m.edge / Math.max(h * 1.12, w * 1.4));
  return { sx: (baseW / 28) * room * m.scale, sy: (baseH / 47) * room * m.scale };
}
