/**
 * 地形的格子：字串與陣列的轉換、筆刷（方格／自由）、地表的推算、海岸線（格子的外框接成迴圈）。
 *
 * 筆刷的規則（看得到的結果）：
 * - 平原：連同山與森林一起換成平原。
 * - 森林、山地：畫在原本的地表上面（海上畫的話地表當成平原）。
 * - 沙漠、雪原、濕地：只換地表，上面的山與森林留著。
 * - 回到海：地形與地表都清掉。只擦山與森林：回到底下的地表。
 * - 方格：以 24 px 的格子蓋章（n × n 格、n 是偶數）；斜著移動時多蓋一塊，讓筆跡的邊相連（圓角之後不會斷開）。
 * - 自由：以圓形的筆（直徑＝筆刷大小 × 12 px），格子中心在圓裡的就塗。
 */
import {
  type BrushAction,
  CELL,
  DESERT,
  type DrawMode,
  FOREST,
  GRID_STEP,
  MARSH,
  MOUNTAIN,
  PLAIN,
  type Pt,
  SEA,
  SNOW,
} from './types';

export interface Grid {
  cols: number;
  rows: number;
  terrain: Uint8Array;
  ground: Uint8Array;
}

const DIGITS = '0123456';

export function decodeCells(s: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  const len = Math.min(n, s.length);
  for (let i = 0; i < len; i++) {
    const v = s.charCodeAt(i) - 48;
    out[i] = v >= 0 && v <= 6 ? v : 0;
  }
  return out;
}

export function encodeCells(a: ArrayLike<number>): string {
  let s = '';
  const chunk: string[] = [];
  for (let i = 0; i < a.length; i++) {
    chunk.push(DIGITS[a[i]] ?? '0');
    if (chunk.length >= 4096) {
      s += chunk.join('');
      chunk.length = 0;
    }
  }
  return s + chunk.join('');
}

export const blankCells = (n: number): string => '0'.repeat(n);

export const isRelief = (v: number): boolean => v === FOREST || v === MOUNTAIN;
export const isSurface = (v: number): boolean =>
  v === PLAIN || v === DESERT || v === SNOW || v === MARSH;

export function gridOf(d: { cols: number; rows: number; terrain: string; ground: string }): Grid {
  const n = d.cols * d.rows;
  const terrain = decodeCells(d.terrain, n);
  const ground = fixGround(terrain, decodeCells(d.ground, n));
  return { cols: d.cols, rows: d.rows, terrain, ground };
}

/** 地表的一致性：山與森林底下一定有地表（沒有時當平原）、其他格子的地表＝地形 */
export function fixGround(terrain: Uint8Array, ground: Uint8Array): Uint8Array {
  const out = new Uint8Array(terrain.length);
  for (let i = 0; i < terrain.length; i++) {
    const t = terrain[i];
    out[i] = isRelief(t) ? (isSurface(ground[i]) ? ground[i] : PLAIN) : t;
  }
  return out;
}

/**
 * 只有地形、沒有地表時（舊資料、原作 v1 以前的檔案）：山與森林底下的地表從相連的最近一格地表延伸過來，
 * 整片都沒有地表時當平原。
 */
export function inferGround(terrain: Uint8Array, cols: number, rows: number): Uint8Array {
  const g = new Uint8Array(terrain.length);
  const queue: number[] = [];
  for (let i = 0; i < terrain.length; i++) {
    if (isSurface(terrain[i])) {
      g[i] = terrain[i];
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % cols;
    const y = (i - x) / cols;
    const near = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, y > 0 ? i - cols : -1];
    near.push(y < rows - 1 ? i + cols : -1);
    for (const j of near) {
      if (j >= 0 && !g[j] && isRelief(terrain[j])) {
        g[j] = g[i];
        queue.push(j);
      }
    }
  }
  for (let i = 0; i < g.length; i++) if (!g[i] && isRelief(terrain[i])) g[i] = PLAIN;
  return g;
}

/** 塗一格（規則見檔頭） */
export function paintCell(grid: Grid, i: number, action: BrushAction): void {
  const { terrain, ground } = grid;
  const t = terrain[i];
  if (action === 'sea') {
    terrain[i] = SEA;
    ground[i] = SEA;
  } else if (action === 'relief') {
    if (isRelief(t)) terrain[i] = ground[i] || PLAIN;
  } else if (action === PLAIN) {
    terrain[i] = PLAIN;
    ground[i] = PLAIN;
  } else if (action === FOREST || action === MOUNTAIN) {
    if (t === SEA) ground[i] = PLAIN;
    terrain[i] = action;
  } else {
    ground[i] = action;
    if (!isRelief(t)) terrain[i] = action;
  }
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 方格筆刷蓋的範圍（px）：n × n 個格子（n＝筆刷大小取最接近的偶數，至少 2），左上角對齊 24 px 的格線，
 * 指標所在的那一格大約在正中間。
 */
export function brushBox(p: Pt, size: number): Box {
  const n = Math.max(GRID_STEP, Math.round(size / GRID_STEP) * GRID_STEP);
  const unit = CELL * GRID_STEP;
  const half = Math.floor(n / GRID_STEP / 2) * GRID_STEP;
  const cx = Math.floor(p.x / unit + 1e-9) * GRID_STEP - half;
  const cy = Math.floor(p.y / unit + 1e-9) * GRID_STEP - half;
  return { x: cx * CELL, y: cy * CELL, w: n * CELL, h: n * CELL };
}

function stampBox(grid: Grid, box: Box, action: BrushAction, touched: Set<number> | null): void {
  const x0 = Math.max(0, box.x / CELL);
  const y0 = Math.max(0, box.y / CELL);
  const x1 = Math.min(grid.cols, (box.x + box.w) / CELL);
  const y1 = Math.min(grid.rows, (box.y + box.h) / CELL);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * grid.cols + x;
      paintCell(grid, i, action);
      touched?.add(i);
    }
}

/**
 * 從 a 畫到 b（一筆的一段）。每 0.45 格取一個點蓋章，快速移動也不會漏格。
 * 回傳有沒有改變任何一格。
 */
export function brushStroke(
  grid: Grid,
  a: Pt,
  b: Pt,
  size: number,
  action: BrushAction,
  mode: DrawMode,
): boolean {
  const before = grid.terrain.slice();
  const beforeGround = grid.ground.slice();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (CELL * 0.45)));
  const r = size / 2;
  let prev: Box | null = null;
  for (let k = 0; k <= steps; k++) {
    const px = a.x + (dx * k) / steps;
    const py = a.y + (dy * k) / steps;
    if (mode === 'grid') {
      const box = brushBox({ x: px, y: py }, size);
      /* 斜著跨到下一格時補一塊（同一列、上一塊的欄），筆跡的邊才相連 */
      if (prev && prev.x !== box.x && prev.y !== box.y)
        stampBox(grid, { ...box, x: prev.x }, action, null);
      stampBox(grid, box, action, null);
      prev = box;
    } else {
      const cx = px / CELL;
      const cy = py / CELL;
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(grid.rows, Math.ceil(cy + r));
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(grid.cols, Math.ceil(cx + r));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r)
            paintCell(grid, y * grid.cols + x, action);
    }
  }
  for (let i = 0; i < before.length; i++)
    if (before[i] !== grid.terrain[i] || beforeGround[i] !== grid.ground[i]) return true;
  return false;
}

/* ---------- 外框 ---------- */

/**
 * 符合條件的格子的外框，接成一圈一圈的迴圈（px 座標，格子的角）。
 * 方向：陸地在前進方向的右手邊（畫面座標下順時針）；湖、內海是反方向的內圈，用 evenodd 填色就會挖空。
 * 兩塊只有一個角相接時，在那個角往右轉，分成兩圈。
 */
/**
 * 格子的四條邊，依前進方向（0 右、1 下、2 左、3 上）：那一邊的鄰格、邊的起點是格子的哪個角。
 * 沿著符合條件的格子外緣走時，格子永遠在右手邊。
 */
const SIDES = [
  { nx: 0, ny: -1, cx: 0, cy: 0 },
  { nx: 1, ny: 0, cx: 1, cy: 0 },
  { nx: 0, ny: 1, cx: 1, cy: 1 },
  { nx: -1, ny: 0, cx: 0, cy: 1 },
];
/** 到了一個角，下一條邊依序試：右轉、直走、左轉、回頭（相對於目前方向的轉動量） */
const TURN_ORDER = [1, 0, 3, 2];

export function traceOutlines(
  cells: ArrayLike<number>,
  cols: number,
  rows: number,
  test: (v: number) => boolean,
): Pt[][] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < cols && y < rows && test(cells[y * cols + x]);
  /* 角的編號＝列 × (cols + 1)＋行；每個角往每個方向最多一條邊 */
  const W = cols + 1;
  const advance = [1, W, -1, -W];
  const exits = new Int32Array(W * (rows + 1) * 4).fill(-1);
  const origin: number[] = [];
  const heading: number[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (!inside(x, y)) continue;
      SIDES.forEach((side, dir) => {
        if (inside(x + side.nx, y + side.ny)) return;
        const corner = (y + side.cy) * W + x + side.cx;
        exits[corner * 4 + dir] = origin.length;
        origin.push(corner);
        heading.push(dir);
      });
    }
  const walked = new Uint8Array(origin.length);
  const nextEdge = (corner: number, dir: number) => {
    for (const turn of TURN_ORDER) {
      const k = exits[corner * 4 + ((dir + turn) % 4)];
      if (k >= 0 && !walked[k]) return k;
    }
    return -1;
  };
  const cornerPt = (corner: number): Pt => ({
    x: (corner % W) * CELL,
    y: Math.floor(corner / W) * CELL,
  });
  const loops: Pt[][] = [];
  origin.forEach((home, start) => {
    if (walked[start]) return;
    const ring: Pt[] = [];
    for (let e = start, n = 0; e >= 0 && !walked[e] && n <= origin.length; n++) {
      walked[e] = 1;
      ring.push(cornerPt(origin[e]));
      const reached = origin[e] + advance[heading[e]];
      if (reached === home) {
        loops.push(ring);
        return;
      }
      e = nextEdge(reached, heading[e]);
    }
  });
  return loops;
}

/** 畫路徑的介面（Path2D、CanvasRenderingContext2D 都符合；測試用記錄器） */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
}

/** 方格模式的海岸線：拿掉一直線上的點，每個轉角以半徑 ≤ 8 px（且不超過兩邊各一半）的弧修圓 */
export function roundedOutline(loops: Pt[][], sink: PathSink): void {
  for (const raw of loops) {
    const n0 = raw.length;
    const p = raw.filter((v, i) => {
      const a = raw[(i + n0 - 1) % n0];
      const b = raw[(i + 1) % n0];
      return (v.x - a.x) * (b.y - v.y) !== (v.y - a.y) * (b.x - v.x);
    });
    if (p.length < 3) continue;
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n];
      const v = p[i];
      const b = p[(i + 1) % n];
      const la = Math.hypot(v.x - a.x, v.y - a.y);
      const lb = Math.hypot(b.x - v.x, b.y - v.y);
      const r = Math.min(8, la / 2, lb / 2);
      const ux = v.x + ((a.x - v.x) * r) / la;
      const uy = v.y + ((a.y - v.y) * r) / la;
      const wx = v.x + ((b.x - v.x) * r) / lb;
      const wy = v.y + ((b.y - v.y) * r) / lb;
      if (i === 0) sink.moveTo(ux, uy);
      else sink.lineTo(ux, uy);
      sink.quadraticCurveTo(v.x, v.y, wx, wy);
    }
    sink.closePath();
  }
}

/**
 * 自由模式的海岸線：12 個點以上的迴圈先做 5 點移動平均，再以每兩點的中點為端點、原來的點為控制點連成曲線。
 */
export function smoothOutline(loops: Pt[][], sink: PathSink): void {
  for (const raw of loops) {
    if (!raw.length) continue;
    const n = raw.length;
    const p =
      n < 12
        ? raw
        : raw.map((_, i) => {
            let x = 0;
            let y = 0;
            for (let k = -2; k <= 2; k++) {
              const q = raw[(i + k + n) % n];
              x += q.x;
              y += q.y;
            }
            return { x: x / 5, y: y / 5 };
          });
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const start = mid(p[p.length - 1], p[0]);
    sink.moveTo(start.x, start.y);
    for (let i = 0; i < p.length; i++) {
      const m = mid(p[i], p[(i + 1) % p.length]);
      sink.quadraticCurveTo(p[i].x, p[i].y, m.x, m.y);
    }
    sink.closePath();
  }
}

export function outlineInto(loops: Pt[][], mode: DrawMode, sink: PathSink): void {
  if (mode === 'grid') roundedOutline(loops, sink);
  else smoothOutline(loops, sink);
}

/** 格子的中心（px） */
export const cellCenter = (i: number, cols: number): Pt => ({
  x: ((i % cols) + 0.5) * CELL,
  y: (Math.floor(i / cols) + 0.5) * CELL,
});

/** 某一點所在的格子（地圖外夾回邊緣） */
export function cellAt(grid: { cols: number; rows: number }, x: number, y: number): number {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / CELL)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / CELL)));
  return cy * grid.cols + cx;
}

/** 地形相同（字串比較）時不必重畫 */
export const sameTerrain = (a: Grid, b: Grid): boolean =>
  a.terrain.length === b.terrain.length &&
  a.terrain.every((v, i) => v === b.terrain[i]) &&
  a.ground.every((v, i) => v === b.ground[i]);
