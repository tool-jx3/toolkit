/**
 * 自動產生世界：地形（六種構成）＋町與道路。同一個種子一定得到同一張地圖。
 *
 * 地形（以 2 × 2 格為單位）：
 * - 構成：種子 ÷ 6 的餘數決定——0 大陸（不對稱的半島與沿岸小島、一側挖出海灣）、1 隔海的兩塊大陸、
 *   2 群島（3 × 3 的島群，約 12％ 缺一個）、3 環抱內海的新月形（一端開口）、4 弧形的列島＋另一串小島、
 *   5 南北兩岸夾著寬海峽（中間一座島）。
 * - 整體隨機左右／上下翻轉、轉 ±0.2 弧度；用連續的值雜訊扭曲海岸（不是一格一格的雜點）；四周留海。
 * - 氣候：北邊（y 小於雪線 0.13～0.24）是雪原、一塊橢圓的乾燥區是沙漠、一塊濕潤區是濕地，其他是平原；
 *   一條斜向蜿蜒的山脈、雜訊高的地方是森林（沙漠上不長）。
 *
 * 町與道路（populateWorld）：
 * - 只看 70 格以上的陸塊，最大的 5 塊；離海至少 2 格、不在山上的格子。
 * - 每塊 1～4 個（最大的那塊最多 4、其他最多 3；每 300 格多一個），依序挑「離已經放的最遠」的格子（間隔至少 100 px）；
 *   最大陸塊的第一個是王都，其他第一個是城市、第二個是町、之後是村；離海 2 格以內的（第一個以外）是港口。
 * - 名字依種類與那裡的氣候提案，不重複。
 * - 道路：從最近的已放據點走到新的據點（只走陸地；山 5、森林 2、濕地 3、其他 1 的成本），
 *   簡化成每段最多 6 格、整條平滑曲線都在陸地上（含 2.5 px 的寬度）；曲線碰到海時退回原本的折線。
 */
import { createRandom } from '@/core/timeline/random';
import { newObject, newPath } from './factory';
import { sampleCurve } from './geometry';
import { suggestName } from './names';
import { cellCenter, encodeCells } from './terrain';
import {
  CELL,
  DESERT,
  FOREST,
  MARSH,
  type MapObject,
  type MapPath,
  MOUNTAIN,
  PLAIN,
  type Pt,
  SNOW,
  type WorldDoc,
} from './types';

export const FAMILY_COUNT = 6;
export const familyOf = (seed: number): number => (seed >>> 0) % FAMILY_COUNT;

interface Blob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  c: number;
  s: number;
}

function valueNoise(seed: number) {
  const hash = (x: number, y: number, salt: number) => {
    let h = Math.imul(x, 0x1b873593) ^ Math.imul(y, 0x5bd1e995) ^ seed ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x: number, y: number, salt: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const sx = x - ix;
    const sy = y - iy;
    const u = sx * sx * (3 - 2 * sx);
    const v = sy * sy * (3 - 2 * sy);
    return (
      (1 - v) * (hash(ix, iy, salt) * (1 - u) + hash(ix + 1, iy, salt) * u) +
      v * (hash(ix, iy + 1, salt) * (1 - u) + hash(ix + 1, iy + 1, salt) * u)
    );
  };
}

export interface GeneratedTerrain {
  terrain: Uint8Array;
  ground: Uint8Array;
  family: number;
}

/** 地形（陸地、氣候、山脈、森林） */
export function generateTerrain(seed: number, cols: number, rows: number): GeneratedTerrain {
  const s0 = seed >>> 0;
  const r = createRandom(s0 || 1);
  const range = (a: number, b: number) => a + (b - a) * r.next();
  const family = familyOf(s0);
  const land: Blob[] = [];
  const cuts: Blob[] = [];
  const flipX = r.next() < 0.5;
  const flipY = r.next() < 0.5;
  const turn = range(-0.2, 0.2);
  const blob = (
    list: Blob[],
    x: number,
    y: number,
    rx: number,
    ry: number,
    a = range(-0.55, 0.55),
  ) => list.push({ x, y, rx, ry, c: Math.cos(a), s: Math.sin(a) });
  if (family === 0) {
    const cx = range(0.38, 0.58);
    const cy = range(0.4, 0.59);
    blob(land, cx, cy, range(0.23, 0.29), range(0.28, 0.34));
    const n = 4 + Math.floor(r.next() * 3);
    for (let i = 0; i < n; i++) {
      const a = range(0, Math.PI * 2);
      blob(
        land,
        cx + Math.cos(a) * range(0.16, 0.23),
        cy + Math.sin(a) * range(0.18, 0.26),
        range(0.09, 0.15),
        range(0.1, 0.17),
      );
    }
    blob(cuts, cx + range(0.15, 0.25), cy + range(-0.16, 0.16), 0.11, range(0.08, 0.13));
  } else if (family === 1) {
    for (const cx of [0.25, 0.75]) {
      const cy = range(0.38, 0.62);
      blob(land, cx, cy, range(0.15, 0.2), range(0.24, 0.32));
      for (let i = 0; i < 3; i++)
        blob(
          land,
          cx + range(-0.08, 0.08),
          cy + range(-0.22, 0.22),
          range(0.09, 0.14),
          range(0.1, 0.16),
        );
    }
  } else if (family === 2) {
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        if (r.next() < 0.12) continue;
        blob(
          land,
          0.19 + col * 0.3 + range(-0.035, 0.035),
          0.21 + row * 0.29 + range(-0.025, 0.025),
          range(0.085, 0.13),
          range(0.075, 0.12),
        );
      }
  } else if (family === 3) {
    const cx = range(0.44, 0.55);
    const cy = range(0.44, 0.55);
    const rx = range(0.25, 0.29);
    const ry = range(0.23, 0.28);
    const gap = range(-0.65, 0.65);
    for (let i = 0; i < 9; i++) {
      const a = gap + 0.65 + (i * (Math.PI * 2 - 1.3)) / 8;
      blob(
        land,
        cx + Math.cos(a) * rx,
        cy + Math.sin(a) * ry,
        range(0.11, 0.15),
        range(0.1, 0.14),
        a,
      );
    }
  } else if (family === 4) {
    const bend = range(0.08, 0.18);
    const phase = range(-1, 1);
    for (let i = 0; i < 6; i++)
      blob(
        land,
        0.15 + i * 0.14,
        0.48 + Math.sin(i * 0.85 + phase) * bend,
        range(0.08, 0.12),
        range(0.1, 0.17),
      );
    for (let i = 0; i < 3; i++)
      blob(
        land,
        0.27 + i * 0.23,
        0.19 + range(-0.025, 0.025),
        range(0.05, 0.08),
        range(0.045, 0.065),
      );
  } else {
    const offset = range(-0.04, 0.04);
    for (const cy of [0.23, 0.77])
      for (let i = 0; i < 3; i++)
        blob(
          land,
          0.23 + i * 0.27 + range(-0.035, 0.035),
          cy + offset + range(-0.035, 0.035),
          range(0.15, 0.2),
          range(0.13, 0.18),
        );
    blob(land, range(0.4, 0.6), 0.5, range(0.055, 0.08), range(0.05, 0.07));
  }
  const noise = valueNoise(s0);
  const field = (list: Blob[], x: number, y: number) => {
    let best = -10;
    for (const b of list) {
      const dx = x - b.x;
      const dy = y - b.y;
      best = Math.max(
        best,
        1 - Math.hypot((dx * b.c + dy * b.s) / b.rx, (-dx * b.s + dy * b.c) / b.ry),
      );
    }
    return best;
  };
  const ridgeAngle = range(0, Math.PI);
  const ridgeCenter = range(-0.14, 0.14);
  const ridgeWidth = range(0.025, 0.045);
  const forestLine = range(0.51, 0.61);
  const snowLine = range(0.13, 0.24);
  const dryX = range(0.2, 0.8);
  const dryY = range(0.4, 0.78);
  const wetX = range(0.2, 0.8);
  const wetY = range(0.3, 0.8);
  const terrain = new Uint8Array(cols * rows);
  const ground = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y += 2)
    for (let x = 0; x < cols; x += 2) {
      const nx = (x + 1) / cols;
      const ny = (y + 1) / rows;
      const px = (flipX ? 1 - nx : nx) - 0.5;
      const py = (flipY ? 1 - ny : ny) - 0.5;
      const u = 0.5 + px * Math.cos(turn) - py * Math.sin(turn);
      const v = 0.5 + px * Math.sin(turn) + py * Math.cos(turn);
      const wx = u + (noise(u * 5, v * 5, 101) - 0.5) * 0.075;
      const wy = v + (noise(u * 5, v * 5, 211) - 0.5) * 0.075;
      const coast = (noise(u * 18, v * 18, 307) - 0.5) * 0.2;
      if (nx < 0.055 || nx > 0.945 || ny < 0.075 || ny > 0.925) continue;
      if (field(land, wx, wy) + coast <= 0 || field(cuts, wx, wy) > 0) continue;
      const climate = noise(nx * 5, ny * 5, 401);
      let g: number = PLAIN;
      if (ny < snowLine + (climate - 0.5) * 0.1) g = SNOW;
      else if (Math.hypot((nx - dryX) / 0.26, (ny - dryY) / 0.23) < 0.85 + (climate - 0.5) * 0.6)
        g = DESERT;
      else if (Math.hypot((nx - wetX) / 0.15, (ny - wetY) / 0.13) < 0.65 && climate > 0.43)
        g = MARSH;
      const along = (u - 0.5) * Math.cos(ridgeAngle) + (v - 0.5) * Math.sin(ridgeAngle);
      const across = -(u - 0.5) * Math.sin(ridgeAngle) + (v - 0.5) * Math.cos(ridgeAngle);
      const ridge = Math.abs(across - ridgeCenter - Math.sin(along * 11) * 0.055);
      const woods = noise(u * 6, v * 6, 503) * 0.76 + noise(u * 13, v * 13, 601) * 0.24;
      const t =
        ridge < ridgeWidth && Math.abs(along) < 0.43
          ? MOUNTAIN
          : woods > forestLine && g !== DESERT
            ? FOREST
            : g;
      for (let yy = y; yy < Math.min(rows, y + 2); yy++)
        for (let xx = x; xx < Math.min(cols, x + 2); xx++) {
          terrain[yy * cols + xx] = t;
          ground[yy * cols + xx] = g;
        }
    }
  return { terrain, ground, family };
}

/** 兩張地形的陸地重疊程度（交集 ÷ 聯集） */
export function landSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let both = 0;
  let any = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] > 0;
    const y = b[i] > 0;
    if (x && y) both++;
    if (x || y) any++;
  }
  return any ? both / any : 0;
}

/**
 * 「自動產生世界」每按一次：最多試 10 個種子（構成和目前不同），挑陸地和目前最不像的一個
 * （重疊 < 0.48 就直接用）。rand 是 [0, 1) 的亂數來源（測試可以固定）。
 */
export function pickNewSeed(
  current: { seed: number; terrain: ArrayLike<number> },
  cols: number,
  rows: number,
  rand: () => number = Math.random,
): { seed: number; terrain: GeneratedTerrain } {
  let best: { seed: number; terrain: GeneratedTerrain } | null = null;
  let bestSim = Infinity;
  for (let attempt = 0; attempt < 10; attempt++) {
    let seed = Math.floor(rand() * 4294967296) >>> 0;
    if (familyOf(seed) === familyOf(current.seed)) seed = (seed + 1) >>> 0;
    const t = generateTerrain(seed, cols, rows);
    /* 換了尺寸時沒有可以比的陸地：第一個就用 */
    const sim =
      current.terrain.length === t.terrain.length ? landSimilarity(current.terrain, t.terrain) : 0;
    if (sim < bestSim) {
      bestSim = sim;
      best = { seed, terrain: t };
    }
    if (bestSim < 0.48) break;
  }
  return best!;
}

/* ---------- 町與道路 ---------- */

function neighbors4(i: number, cols: number, rows: number): number[] {
  const x = i % cols;
  const y = (i - x) / cols;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < cols - 1) out.push(i + 1);
  if (y > 0) out.push(i - cols);
  if (y < rows - 1) out.push(i + cols);
  return out;
}

const STEP_COST = (v: number) => (v === MOUNTAIN ? 5 : v === FOREST ? 2 : v === MARSH ? 3 : 1);

export interface Populated {
  objects: MapObject[];
  paths: MapPath[];
}

export function populateWorld(
  terrain: Uint8Array,
  ground: Uint8Array,
  cols: number,
  rows: number,
  seed: number,
  makeId: () => string,
): Populated {
  const N = cols * rows;
  const seen = new Uint8Array(N);
  const comps: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (!terrain[i] || seen[i]) continue;
    const cells = [i];
    seen[i] = 1;
    for (let q = 0; q < cells.length; q++)
      for (const j of neighbors4(cells[q], cols, rows))
        if (terrain[j] && !seen[j]) {
          seen[j] = 1;
          cells.push(j);
        }
    if (cells.length >= 70) comps.push(cells);
  }
  comps.sort((a, b) => b.length - a.length);
  /* 離海的格數 */
  const coast = new Int16Array(N).fill(32767);
  const queue: number[] = [];
  for (let i = 0; i < N; i++)
    if (!terrain[i]) {
      coast[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++)
    for (const j of neighbors4(queue[q], cols, rows))
      if (coast[j] > coast[queue[q]] + 1) {
        coast[j] = coast[queue[q]] + 1;
        queue.push(j);
      }
  const center = (i: number) => cellCenter(i, cols);
  const noise = (i: number) => {
    let h = Math.imul(i + 1, 0x2545f491) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 0x9e3779b1);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const landAt = (p: Pt) =>
    [
      [0, 0],
      [-2.5, 0],
      [2.5, 0],
      [0, -2.5],
      [0, 2.5],
    ].every(([dx, dy]) => {
      const x = Math.floor((p.x + dx) / CELL);
      const y = Math.floor((p.y + dy) / CELL);
      return x >= 0 && x < cols && y >= 0 && y < rows && terrain[y * cols + x] > 0;
    });
  const safeLine = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
    for (let j = 0; j <= n; j++)
      if (!landAt({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n })) return false;
    return true;
  };
  const safeCurve = (pts: Pt[]) => {
    const s = sampleCurve(pts, true);
    for (let i = 1; i < s.length; i++) if (!safeLine(s[i - 1], s[i])) return false;
    return true;
  };

  const road = (start: number, goal: number, name: string): MapPath | null => {
    const cost = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap: [number, number][] = [];
    const push = (i: number, c: number) => {
      let k = heap.length;
      heap.push([i, c]);
      while (k) {
        const p = (k - 1) >> 1;
        if (heap[p][1] <= c) break;
        heap[k] = heap[p];
        k = p;
      }
      heap[k] = [i, c];
    };
    const pop = () => {
      const first = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        let k = 0;
        while (k * 2 + 1 < heap.length) {
          let c = k * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1][1] < heap[c][1]) c++;
          if (heap[c][1] >= last[1]) break;
          heap[k] = heap[c];
          k = c;
        }
        heap[k] = last;
      }
      return first;
    };
    cost[start] = 0;
    push(start, 0);
    while (heap.length) {
      const [i, c] = pop();
      if (c !== cost[i]) continue;
      if (i === goal) break;
      for (const j of neighbors4(i, cols, rows)) {
        if (!terrain[j]) continue;
        const nc = c + STEP_COST(terrain[j]);
        if (nc < cost[j]) {
          cost[j] = nc;
          prev[j] = i;
          push(j, nc);
        }
      }
    }
    if (!Number.isFinite(cost[goal])) return null;
    const cells: number[] = [];
    for (let i = goal; i !== -1; i = prev[i]) {
      cells.push(i);
      if (i === start) break;
    }
    cells.reverse();
    /* 原本的折線：只留轉彎的格子 */
    const original = cells
      .filter((i, k) => !k || k === cells.length - 1 || i - cells[k - 1] !== cells[k + 1] - i)
      .map(center);
    const simplified = [center(cells[0])];
    for (let last = 0; last < cells.length - 1; ) {
      let next = Math.min(last + 6, cells.length - 1);
      while (next > last + 1 && !safeLine(center(cells[last]), center(cells[next]))) next--;
      simplified.push(center(cells[next]));
      last = next;
    }
    let pts = simplified;
    let smooth = true;
    if (pts.length > 256 || !safeCurve(pts)) {
      pts = original;
      smooth = safeCurve(pts);
    }
    if (pts.length > 256 || pts.length < 2) return null;
    const p = newPath('road', pts, makeId);
    p.name = name;
    p.smooth = smooth;
    return p;
  };

  const objects: MapObject[] = [];
  const paths: MapPath[] = [];
  const used = new Set<string>();
  let count = 0;
  const climateAtCell = (i: number) => ({
    snow: ground[i] === SNOW ? 1 : 0,
    desert: ground[i] === DESERT ? 1 : 0,
    wet: ground[i] === MARSH ? 1 : 0,
  });
  const uniqueName = (kind: string, i: number) => {
    let name = '';
    for (let n = 0; n < 100; n++) {
      name = suggestName(kind, (seed + i * 313 + count * 97 + n * 131) >>> 0, climateAtCell(i));
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    return `${name}・${count}`;
  };
  comps.slice(0, 5).forEach((cells, ci) => {
    const inland = cells.filter((i) => coast[i] >= 2 && terrain[i] !== MOUNTAIN);
    const pool = inland.length ? inland : cells.filter((i) => coast[i] >= 2);
    if (!pool.length) return;
    const chosen: number[] = [];
    const n = Math.min(ci === 0 ? 4 : 3, Math.max(1, Math.floor(cells.length / 300) + 1));
    for (let k = 0; k < n; k++) {
      let best = -1;
      let score = -Infinity;
      for (const i of pool) {
        if (chosen.includes(i)) continue;
        const p = center(i);
        const gap = chosen.length
          ? Math.min(
              ...chosen.map((j) => {
                const q = center(j);
                return Math.hypot(p.x - q.x, p.y - q.y);
              }),
            )
          : Math.min(coast[i], 8) * CELL;
        if (k && gap < 100) continue;
        const s = gap * (0.75 + noise(i) * 0.25);
        if (s > score) {
          score = s;
          best = i;
        }
      }
      if (best < 0) break;
      const p = center(best);
      const kind =
        ci === 0 && k === 0
          ? 'capital'
          : coast[best] <= 2 && k > 0
            ? 'port'
            : k === 0
              ? 'city'
              : k === 1
                ? 'town'
                : 'village';
      count++;
      const o = newObject(kind, p.x, p.y, makeId);
      o.name = uniqueName(kind, best);
      objects.push(o);
      if (chosen.length) {
        const nearest = chosen.reduce((a, b) => {
          const A = center(a);
          const B = center(b);
          return Math.hypot(A.x - p.x, A.y - p.y) <= Math.hypot(B.x - p.x, B.y - p.y) ? a : b;
        });
        const rd = road(nearest, best, suggestName('road', (seed + best * 97) >>> 0));
        if (rd) paths.push(rd);
      }
      chosen.push(best);
    }
  });
  return { objects, paths };
}

const TITLES = ['無名大陸', '雙生大陸', '千島之海', '環海之地', '弧形列島', '海峽諸國'];
export const familyTitle = (family: number): string => TITLES[family] ?? TITLES[0];

/** 整張產生好的地圖（主題、畫法、設定沿用目前的地圖） */
export function generateWorld(
  base: WorldDoc,
  seed: number,
  pre: GeneratedTerrain | null,
  makeId: () => string,
): WorldDoc {
  const t = pre ?? generateTerrain(seed, base.cols, base.rows);
  const pop = populateWorld(t.terrain, t.ground, base.cols, base.rows, seed, makeId);
  return {
    ...base,
    seed,
    title: familyTitle(t.family),
    terrain: encodeCells(t.terrain),
    ground: encodeCells(t.ground),
    regions: [],
    notes: [],
    objects: pop.objects,
    paths: pop.paths,
    settings: { ...base.settings, details: true },
  };
}
