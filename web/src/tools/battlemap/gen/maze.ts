/**
 * 生成法「迷宮」：三種演算法都參考 rot.js（© Ondrej Zara，BSD-3-Clause；見 ../UPSTREAM_LICENSE）：
 * - 分割法（Map.DividedMaze）：遞迴地用一橫一直的牆把區域切成四塊，三段牆各開一個洞；牆長而直，像建築物。
 * - Eller（Map.EllerMaze）：一列一列往下做，每格隨機決定往右、往下打通；橫向的走道比較多。
 * - 蜿蜒（Map.IceyMaze，規則度 0）：從隨機的格子一路往沒挖過的方向挖，走道彎來彎去、死路多。
 *
 * 三種都先在「格子」上做 1 格寬的迷宮（奇數位置是通道、偶數位置是牆），再放大到地圖上：
 * 通道放大成 width 格寬、牆維持 1 格（戰鬥地圖上 1 格的走道太窄，棋子錯不開；預設 2 格）。
 * 放不滿的格數平均分到兩邊。亂數用本站的種子亂數（rot.js 的亂數是全域狀態）。
 */
import type { Random } from '@/core/timeline';
import type { MazeStyle } from '../settings';
import { scatterLights } from './lights';
import { createMask, type Mask } from './mask';
import type { Generated } from './types';

/** 迷宮格子：w × h（都是奇數），1＝牆、0＝通道 */
interface Lattice {
  w: number;
  h: number;
  wall: Uint8Array;
}

const latticeOf = (w: number, h: number, fill: number): Lattice => ({
  w,
  h,
  wall: new Uint8Array(w * h).fill(fill),
});

const pick = <T>(rng: Random, items: readonly T[]): T =>
  items[Math.floor(rng.next() * items.length)];

/* ---------- 分割法 ---------- */

function dividedMaze(rng: Random, w: number, h: number): Lattice {
  const L = latticeOf(w, h, 0);
  const at = (x: number, y: number) => L.wall[y * w + x];
  const set = (x: number, y: number, v: number) => {
    L.wall[y * w + x] = v;
  };
  for (let x = 0; x < w; x++) {
    set(x, 0, 1);
    set(x, h - 1, 1);
  }
  for (let y = 0; y < h; y++) {
    set(0, y, 1);
    set(w - 1, y, 1);
  }
  /* 區域：[左, 上, 右, 下]（含） */
  const queue: [number, number, number, number][] = [[1, 1, w - 2, h - 2]];
  while (queue.length) {
    const [left, top, right, bottom] = queue.shift() as [number, number, number, number];
    const availX: number[] = [];
    const availY: number[] = [];
    for (let i = left + 1; i < right; i++)
      if (at(i, top - 1) && at(i, bottom + 1) && i % 2 === 0) availX.push(i);
    for (let j = top + 1; j < bottom; j++)
      if (at(left - 1, j) && at(right + 1, j) && j % 2 === 0) availY.push(j);
    if (!availX.length || !availY.length) continue;
    const x = pick(rng, availX);
    const y = pick(rng, availY);
    set(x, y, 1);
    const parts: [number, number][][] = [[], [], [], []];
    for (let i = left; i < x; i++) {
      set(i, y, 1);
      if (i % 2) parts[0].push([i, y]);
    }
    for (let i = x + 1; i <= right; i++) {
      set(i, y, 1);
      if (i % 2) parts[1].push([i, y]);
    }
    for (let j = top; j < y; j++) {
      set(x, j, 1);
      if (j % 2) parts[2].push([x, j]);
    }
    for (let j = y + 1; j <= bottom; j++) {
      set(x, j, 1);
      if (j % 2) parts[3].push([x, j]);
    }
    /* 四段牆裡留一段不開洞，其餘三段各開一個 */
    const solid = pick(rng, parts);
    for (const part of parts) {
      if (part === solid) continue;
      const [hx, hy] = pick(rng, part);
      set(hx, hy, 0);
    }
    queue.push([left, top, x - 1, y - 1]);
    queue.push([x + 1, top, right, y - 1]);
    queue.push([left, y + 1, x - 1, bottom]);
    queue.push([x + 1, y + 1, right, bottom]);
  }
  return L;
}

/* ---------- Eller ---------- */

/** Eller 法打通的門檻（rot.js 的 9/24：亂數大於它才打通右邊、或是不往下接） */
const ELLER_RAND = 9 / 24;

function ellerMaze(rng: Random, w: number, h: number): Lattice {
  const L = latticeOf(w, h, 1);
  const open = (x: number, y: number) => {
    L.wall[y * w + x] = 0;
  };
  const n = Math.ceil((w - 2) / 2);
  /* 同一組的格子串成雙向環狀串列：left[i]、right[i] */
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    left.push(i);
    right.push(i);
  }
  left.push(n - 1); /* 右端的假擋塊 */
  const join = (i: number) => {
    right[left[i + 1]] = right[i];
    left[right[i]] = left[i + 1];
    right[i] = i + 1;
    left[i + 1] = i;
  };
  const remove = (i: number) => {
    right[left[i]] = right[i];
    left[right[i]] = left[i];
    right[i] = i;
    left[i] = i;
  };
  let j = 1;
  for (; j + 3 < h; j += 2) {
    for (let i = 0; i < n; i++) {
      const x = 2 * i + 1;
      open(x, j);
      if (i !== left[i + 1] && rng.next() > ELLER_RAND) {
        join(i);
        open(x + 1, j);
      }
      if (i !== left[i] && rng.next() > ELLER_RAND) remove(i);
      else open(x, j + 1);
    }
  }
  /* 最後一列：還沒接上的一律往右打通 */
  for (let i = 0; i < n; i++) {
    const x = 2 * i + 1;
    open(x, j);
    if (i !== left[i + 1] && (i === left[i] || rng.next() > ELLER_RAND)) {
      join(i);
      open(x + 1, j);
    }
    remove(i);
  }
  return L;
}

/* ---------- 蜿蜒（Icey） ---------- */

/** 四個方向的四種排列（rot.js 的 IceyMaze#_randomize） */
const ICEY_ORDERS: readonly (readonly [number, number][])[] = [
  [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ],
  [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ],
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ],
];

function iceyMaze(rng: Random, w: number, h: number): Lattice {
  const L = latticeOf(w, h, 1);
  const iw = w - 1;
  const ih = h - 1;
  const at = (x: number, y: number) => L.wall[y * w + x];
  const open = (x: number, y: number) => {
    L.wall[y * w + x] = 0;
  };
  const free = (x: number, y: number) => x >= 1 && y >= 1 && x < iw && y < ih && at(x, y) === 1;
  const total = (iw * ih) / 4;
  let done = 0;
  do {
    let cx = 1 + 2 * Math.floor((rng.next() * (iw - 1)) / 2);
    let cy = 1 + 2 * Math.floor((rng.next() * (ih - 1)) / 2);
    if (!done) open(cx, cy);
    if (at(cx, cy) === 0) {
      let blocked = false;
      while (!blocked) {
        /* 規則度 0：每一步都重新排方向 */
        const dirs = ICEY_ORDERS[Math.floor(rng.next() * 4)];
        blocked = true;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx * 2;
          const ny = cy + dy * 2;
          if (free(nx, ny)) {
            open(nx, ny);
            open(cx + dx, cy + dy);
            cx = nx;
            cy = ny;
            blocked = false;
            done++;
            break;
          }
        }
      }
    }
  } while (done + 1 < total);
  return L;
}

/* ---------- 放大到地圖 ---------- */

/** 這個地圖寬度能放幾個迷宮格、放大後的起點（置中） */
export function mazeFit(cells: number, width: number): { n: number; offset: number } {
  const period = width + 1;
  const n = Math.max(1, Math.floor((cells - 1) / period));
  return { n, offset: Math.floor((cells - 1 - n * period) / 2) };
}

/** 迷宮格子的第 k 條（偶數＝牆、奇數＝通道）在地圖上從第幾格開始、佔幾格 */
const span = (k: number, width: number, offset: number): [number, number] =>
  k % 2 === 0
    ? [offset + (k / 2) * (width + 1), 1]
    : [offset + ((k - 1) / 2) * (width + 1) + 1, width];

export function mazeMask(
  rng: Random,
  cols: number,
  rows: number,
  style: MazeStyle,
  width: number,
): Mask {
  const fx = mazeFit(cols, width);
  const fy = mazeFit(rows, width);
  const lw = 2 * fx.n + 1;
  const lh = 2 * fy.n + 1;
  const L =
    style === 'eller'
      ? ellerMaze(rng, lw, lh)
      : style === 'icey'
        ? iceyMaze(rng, lw, lh)
        : dividedMaze(rng, lw, lh);
  const mask = createMask(cols, rows);
  for (let ly = 0; ly < lh; ly++) {
    const [y0, hh] = span(ly, width, fy.offset);
    for (let lx = 0; lx < lw; lx++) {
      if (L.wall[ly * lw + lx]) continue;
      const [x0, ww] = span(lx, width, fx.offset);
      for (let y = y0; y < y0 + hh; y++)
        for (let x = x0; x < x0 + ww; x++) mask.open[y * cols + x] = 1;
    }
  }
  return mask;
}

export function generateMaze(
  rng: Random,
  cols: number,
  rows: number,
  style: MazeStyle,
  width: number,
): Generated {
  const mask = mazeMask(rng, cols, rows, style, width);
  return { mask, rooms: null, corridors: [], lights: scatterLights(mask, rng) };
}
