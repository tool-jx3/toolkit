/**
 * 生成法「格狀房間」：把地圖切成 m × n 格，每格放一間房間，相鄰的房間用彎一次的走道接起來（經典 Rogue 的做法）。
 * 參考 rot.js（© Ondrej Zara，BSD-3-Clause；見 ../UPSTREAM_LICENSE）的 Map.Rogue（hyakugei 改寫 Mark Damon Hughes 的說明）：
 * 從隨機的一格出發，往還沒接過的鄰格亂走、一路接起來；走不下去時，剩下沒接上的房間各自接一間相鄰的房間；
 * 走道從房間牆外兩格出發，在長的那個方向上隨機的位置轉彎。
 * 改寫的地方：房間的位置直接限制在自己那一格裡（rot.js 用迴圈往外推，小地圖時房間可能縮成 0 格），
 * 房間每邊至少 3 格；最後確認所有地板都連通（沒接上的用隧道接）；亂數用本站的種子亂數。
 */
import type { Random } from '@/core/timeline';
import type { Density } from '../settings';
import { connectRegions } from './connect';
import { createMask, type Mask, shuffle } from './mask';
import type { Generated, Room } from './types';
import { roomLights } from './types';

/** 每一格大約幾格寬（依密度；越小房間越多） */
export const ROGUE_CELL: Record<Density, number> = { low: 10, normal: 7, high: 5 };
const MIN_SIDE = 3;
/** 每一格四周留給走道的空間 */
const MARGIN = 1;

/** 方向：0 上、1 右、2 下、3 左 */
const STEP: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

interface GridRoom extends Room {
  gx: number;
  gy: number;
  links: number[];
}

/** 房間的格數：每格大約 ROGUE_CELL 格寬、至少能放下 3 格的房間加兩側的空間；至少兩間 */
export function rogueGrid(
  cols: number,
  rows: number,
  density: Density,
): { gw: number; gh: number } {
  const t = ROGUE_CELL[density];
  const cellsAcross = (cells: number) =>
    Math.max(
      1,
      Math.min(Math.floor((cells - 2) / t), Math.floor((cells - 2) / (MIN_SIDE + 2 * MARGIN))),
    );
  let gw = cellsAcross(cols);
  let gh = cellsAcross(rows);
  if (gw * gh === 1) {
    if (cols >= rows) gw = 2;
    else gh = 2;
  }
  return { gw, gh };
}

function carve(m: Mask, x: number, y: number): void {
  if (x >= 1 && y >= 1 && x < m.cols - 1 && y < m.rows - 1) m.open[y * m.cols + x] = 1;
}

/** 房間牆外兩格的出發點，並把中間那一格（門）挖開 */
function wallPosition(rng: Random, m: Mask, r: Room, dir: number): [number, number] {
  if (dir === 0 || dir === 2) {
    const x = rng.int(r.x + 1, r.x + r.w - 2);
    const door = dir === 0 ? r.y - 1 : r.y + r.h;
    carve(m, x, door);
    return [x, dir === 0 ? r.y - 2 : r.y + r.h + 1];
  }
  const y = rng.int(r.y + 1, r.y + r.h - 2);
  const door = dir === 3 ? r.x - 1 : r.x + r.w;
  carve(m, door, y);
  return [dir === 3 ? r.x - 2 : r.x + r.w + 1, y];
}

/** 走道：長的方向先走一段（隨機的比例）、再走完短的方向、最後走完長的方向 */
function drawCorridor(rng: Random, m: Mask, from: [number, number], to: [number, number]): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const p = rng.next();
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const moves: [number, number, number][] = [];
  if (Math.abs(dx) < Math.abs(dy)) {
    const first = Math.ceil(Math.abs(dy) * p);
    moves.push([0, sy, first], [sx, 0, Math.abs(dx)], [0, sy, Math.abs(dy) - first]);
  } else {
    const first = Math.ceil(Math.abs(dx) * p);
    moves.push([sx, 0, first], [0, sy, Math.abs(dy)], [sx, 0, Math.abs(dx) - first]);
  }
  let [x, y] = from;
  carve(m, x, y);
  for (const [mx, my, n] of moves) {
    for (let k = 0; k < n; k++) {
      x += mx;
      y += my;
      carve(m, x, y);
    }
  }
}

export function generateRogue(
  rng: Random,
  cols: number,
  rows: number,
  density: Density,
): Generated {
  const { gw, gh } = rogueGrid(cols, rows, density);
  const cellW = Math.floor((cols - 2) / gw);
  const cellH = Math.floor((rows - 2) / gh);
  const ox = 1 + Math.floor((cols - 2 - cellW * gw) / 2);
  const oy = 1 + Math.floor((rows - 2 - cellH * gh) / 2);
  const grid: GridRoom[] = [];
  const at = (gx: number, gy: number) => grid[gy * gw + gx];
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) grid.push({ x: 0, y: 0, w: 0, h: 0, gx, gy, links: [] });

  /* 1. 從隨機的一格出發，往還沒接過的鄰格亂走 */
  let cx = rng.int(0, gw - 1);
  let cy = rng.int(0, gh - 1);
  const visited = new Set([cy * gw + cx]);
  for (;;) {
    const dirs = shuffle([0, 1, 2, 3], rng);
    let moved = false;
    for (const d of dirs) {
      const nx = cx + STEP[d][0];
      const ny = cy + STEP[d][1];
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || visited.has(ny * gw + nx)) continue;
      at(nx, ny).links.push(cy * gw + cx);
      visited.add(ny * gw + nx);
      cx = nx;
      cy = ny;
      moved = true;
      break;
    }
    if (!moved) break;
  }
  /* 2. 還沒接上的房間各自接一間相鄰的房間（優先接已經接上的） */
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const id = gy * gw + gx;
      if (visited.has(id)) continue;
      const near = shuffle([0, 1, 2, 3], rng)
        .map((d) => [gx + STEP[d][0], gy + STEP[d][1]])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < gw && y < gh)
        .map(([x, y]) => y * gw + x);
      const target = near.find((n) => visited.has(n)) ?? near[0];
      if (target === undefined) continue;
      grid[id].links.push(target);
      visited.add(id);
    }
  }

  /* 3. 每一格裡放一間房間（四周留空間給走道） */
  const mask = createMask(cols, rows);
  for (const r of grid) {
    const availW = cellW - 2 * MARGIN;
    const availH = cellH - 2 * MARGIN;
    /* 很小的地圖時格子放不下 3 格的房間，就用 2 格 */
    const minW = Math.min(MIN_SIDE, availW);
    const minH = Math.min(MIN_SIDE, availH);
    const maxW = Math.max(minW, Math.min(availW, Math.floor(cellW * 0.8)));
    const maxH = Math.max(minH, Math.min(availH, Math.floor(cellH * 0.8)));
    r.w = rng.int(minW, maxW);
    r.h = rng.int(minH, maxH);
    r.x = ox + r.gx * cellW + MARGIN + rng.int(0, availW - r.w);
    r.y = oy + r.gy * cellH + MARGIN + rng.int(0, availH - r.h);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(mask, x, y);
  }

  /* 4. 走道 */
  for (const r of grid) {
    for (const link of r.links) {
      const o = grid[link];
      const dir = o.gx > r.gx ? 1 : o.gx < r.gx ? 3 : o.gy > r.gy ? 2 : 0;
      const a = wallPosition(rng, mask, r, dir);
      const b = wallPosition(rng, mask, o, (dir + 2) % 4);
      drawCorridor(rng, mask, a, b);
    }
  }
  connectRegions(mask, rng);
  const rooms: Room[] = grid.map(({ x, y, w, h }) => ({ x, y, w, h }));
  return { mask, rooms, corridors: [], lights: roomLights(rooms) };
}
