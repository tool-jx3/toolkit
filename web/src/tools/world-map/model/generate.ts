/**
 * 自動產生世界：地形（六種構成）＋町與道路（settle.ts）。同一個種子一定得到同一張地圖。
 *
 * 地形（以 2 × 2 格為單位）：
 * - 構成：種子 ÷ 6 的餘數決定——0 大陸（不對稱的半島與沿岸小島、一側挖出海灣）、1 隔海的兩塊大陸、
 *   2 群島（3 × 3 的島群，約 12％ 缺一個）、3 環抱內海的新月形（一端開口）、4 弧形的列島＋另一串小島、
 *   5 南北兩岸夾著寬海峽（中間一座島）。每一種是幾個橢圓（陸地與挖掉的海灣）的配置。
 * - 整體隨機左右／上下翻轉、轉 ±0.2 弧度；用連續的值雜訊扭曲海岸（不是一格一格的雜點）；四周留海。
 * - 氣候：北邊（y 小於雪線 0.13～0.24）是雪原、一塊橢圓的乾燥區是沙漠、一塊濕潤區是濕地，其他是平原；
 *   一條斜向蜿蜒的山脈、雜訊高的地方是森林（沙漠上不長）。
 */
import { createRandom, type Random } from '@/core/timeline/random';
import { populateWorld } from './settle';
import { encodeCells } from './terrain';
import { DESERT, FOREST, MARSH, MOUNTAIN, PLAIN, SNOW, type WorldDoc } from './types';

export { type Populated, populateWorld } from './settle';

export const FAMILY_COUNT = 6;
export const familyOf = (seed: number): number => (seed >>> 0) % FAMILY_COUNT;

/* ---------- 構成：橢圓的配置 ---------- */

/** 地圖座標（0～1）上的橢圓 */
interface Oval {
  x: number;
  y: number;
  rx: number;
  ry: number;
  cos: number;
  sin: number;
}

/** 轉角沒給時隨機 ±0.55 弧度（在其他參數之後抽） */
const oval = (
  r: Random,
  x: number,
  y: number,
  rx: number,
  ry: number,
  angle = r.range(-0.55, 0.55),
): Oval => ({ x, y, rx, ry, cos: Math.cos(angle), sin: Math.sin(angle) });

/** 橢圓的高度：中心 1、邊緣 0、外面是負的 */
function ovalLevel(o: Oval, x: number, y: number): number {
  const dx = x - o.x;
  const dy = y - o.y;
  return 1 - Math.hypot((dx * o.cos + dy * o.sin) / o.rx, (-dx * o.sin + dy * o.cos) / o.ry);
}

const highest = (ovals: readonly Oval[], x: number, y: number) =>
  ovals.reduce((best, o) => Math.max(best, ovalLevel(o, x, y)), -10);

interface Layout {
  land: Oval[];
  bays: Oval[];
}

/** 0：大陸＋周圍 4～6 個半島或島，一側挖出海灣 */
function continent(r: Random): Layout {
  const cx = r.range(0.38, 0.58);
  const cy = r.range(0.4, 0.59);
  const land = [oval(r, cx, cy, r.range(0.23, 0.29), r.range(0.28, 0.34))];
  const lobes = 4 + Math.floor(r.next() * 3);
  for (let k = 0; k < lobes; k++) {
    const dir = r.range(0, Math.PI * 2);
    const ox = cx + Math.cos(dir) * r.range(0.16, 0.23);
    const oy = cy + Math.sin(dir) * r.range(0.18, 0.26);
    land.push(oval(r, ox, oy, r.range(0.09, 0.15), r.range(0.1, 0.17)));
  }
  const bx = cx + r.range(0.15, 0.25);
  const by = cy + r.range(-0.16, 0.16);
  return { land, bays: [oval(r, bx, by, 0.11, r.range(0.08, 0.13))] };
}

/** 1：左右兩塊大陸，各帶三個小塊 */
function twinLands(r: Random): Layout {
  const land: Oval[] = [];
  for (const cx of [0.25, 0.75]) {
    const cy = r.range(0.38, 0.62);
    land.push(oval(r, cx, cy, r.range(0.15, 0.2), r.range(0.24, 0.32)));
    for (let k = 0; k < 3; k++) {
      const ox = cx + r.range(-0.08, 0.08);
      const oy = cy + r.range(-0.22, 0.22);
      land.push(oval(r, ox, oy, r.range(0.09, 0.14), r.range(0.1, 0.16)));
    }
  }
  return { land, bays: [] };
}

/** 2：3 × 3 的島群（每個 12％ 的機率缺掉） */
function archipelago(r: Random): Layout {
  const land: Oval[] = [];
  for (let slot = 0; slot < 9; slot++) {
    if (r.next() < 0.12) continue;
    const ox = 0.19 + (slot % 3) * 0.3 + r.range(-0.035, 0.035);
    const oy = 0.21 + Math.floor(slot / 3) * 0.29 + r.range(-0.025, 0.025);
    land.push(oval(r, ox, oy, r.range(0.085, 0.13), r.range(0.075, 0.12)));
  }
  return { land, bays: [] };
}

/** 3：九個橢圓排成一圈，留一個開口（內海） */
function crescent(r: Random): Layout {
  const cx = r.range(0.44, 0.55);
  const cy = r.range(0.44, 0.55);
  const rx = r.range(0.25, 0.29);
  const ry = r.range(0.23, 0.28);
  const opening = r.range(-0.65, 0.65);
  const land = Array.from({ length: 9 }, (_, k) => {
    const dir = opening + 0.65 + (k * (Math.PI * 2 - 1.3)) / 8;
    const px = cx + Math.cos(dir) * rx;
    const py = cy + Math.sin(dir) * ry;
    return oval(r, px, py, r.range(0.11, 0.15), r.range(0.1, 0.14), dir);
  });
  return { land, bays: [] };
}

/** 4：沿正弦曲線的六座島＋北邊三座小島 */
function arcIslands(r: Random): Layout {
  const bend = r.range(0.08, 0.18);
  const phase = r.range(-1, 1);
  const land = Array.from({ length: 6 }, (_, k) =>
    oval(
      r,
      0.15 + k * 0.14,
      0.48 + Math.sin(k * 0.85 + phase) * bend,
      r.range(0.08, 0.12),
      r.range(0.1, 0.17),
    ),
  );
  for (let k = 0; k < 3; k++) {
    const oy = 0.19 + r.range(-0.025, 0.025);
    land.push(oval(r, 0.27 + k * 0.23, oy, r.range(0.05, 0.08), r.range(0.045, 0.065)));
  }
  return { land, bays: [] };
}

/** 5：南北兩岸各三塊，海峽中間一座島 */
function strait(r: Random): Layout {
  const shift = r.range(-0.04, 0.04);
  const land: Oval[] = [];
  for (const shoreY of [0.23, 0.77])
    for (let k = 0; k < 3; k++) {
      const ox = 0.23 + k * 0.27 + r.range(-0.035, 0.035);
      const oy = shoreY + shift + r.range(-0.035, 0.035);
      land.push(oval(r, ox, oy, r.range(0.15, 0.2), r.range(0.13, 0.18)));
    }
  const isle = r.range(0.4, 0.6);
  land.push(oval(r, isle, 0.5, r.range(0.055, 0.08), r.range(0.05, 0.07)));
  return { land, bays: [] };
}

const RECIPES: readonly ((r: Random) => Layout)[] = [
  continent,
  twinLands,
  archipelago,
  crescent,
  arcIslands,
  strait,
];

const TITLES = ['無名大陸', '雙生大陸', '千島之海', '環海之地', '弧形列島', '海峽諸國'];
export const familyTitle = (family: number): string => TITLES[family] ?? TITLES[0];

/* ---------- 雜訊 ---------- */

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/** 整數格點上的值（0～1）加上雙三次平滑內插的值雜訊；salt 換一組獨立的雜訊 */
function valueNoise(seed: number): (x: number, y: number, salt: number) => number {
  const corner = (x: number, y: number, salt: number) => {
    let h = Math.imul(x, 0x1b873593) ^ Math.imul(y, 0x5bd1e995) ^ seed ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x, y, salt) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = smoothstep(x - ix);
    const v = smoothstep(y - iy);
    const top = lerp(corner(ix, iy, salt), corner(ix + 1, iy, salt), u);
    const bottom = lerp(corner(ix, iy + 1, salt), corner(ix + 1, iy + 1, salt), u);
    return lerp(top, bottom, v);
  };
}

/* ---------- 地形 ---------- */

export interface GeneratedTerrain {
  terrain: Uint8Array;
  ground: Uint8Array;
  family: number;
}

/** 氣候與地勢的參數（構成之後依序抽） */
function drawClimate(r: Random) {
  return {
    ridge: {
      angle: r.range(0, Math.PI),
      offset: r.range(-0.14, 0.14),
      width: r.range(0.025, 0.045),
    },
    forestLine: r.range(0.51, 0.61),
    snowLine: r.range(0.13, 0.24),
    dry: { x: r.range(0.2, 0.8), y: r.range(0.4, 0.78) },
    wet: { x: r.range(0.2, 0.8), y: r.range(0.3, 0.8) },
  };
}

/** 四周留海的範圍（地圖座標） */
const inMargin = (nx: number, ny: number) =>
  nx >= 0.055 && nx <= 0.945 && ny >= 0.075 && ny <= 0.925;

export function generateTerrain(seed: number, cols: number, rows: number): GeneratedTerrain {
  const s0 = seed >>> 0;
  const r = createRandom(s0 || 1);
  const family = familyOf(s0);
  const mirror = { x: r.next() < 0.5, y: r.next() < 0.5 };
  const turn = r.range(-0.2, 0.2);
  const layout = RECIPES[family](r);
  const noise = valueNoise(s0);
  const climate = drawClimate(r);
  const { ridge, dry, wet } = climate;

  /** 一個 2 × 2 區塊的 [地形, 地表]；海是 null */
  const classify = (nx: number, ny: number): [number, number] | null => {
    const px = (mirror.x ? 1 - nx : nx) - 0.5;
    const py = (mirror.y ? 1 - ny : ny) - 0.5;
    const u = 0.5 + px * Math.cos(turn) - py * Math.sin(turn);
    const v = 0.5 + px * Math.sin(turn) + py * Math.cos(turn);
    if (!inMargin(nx, ny)) return null;
    const wx = u + (noise(u * 5, v * 5, 101) - 0.5) * 0.075;
    const wy = v + (noise(u * 5, v * 5, 211) - 0.5) * 0.075;
    const ragged = (noise(u * 18, v * 18, 307) - 0.5) * 0.2;
    if (highest(layout.land, wx, wy) + ragged <= 0 || highest(layout.bays, wx, wy) > 0) return null;
    const moist = noise(nx * 5, ny * 5, 401);
    const arid = Math.hypot((nx - dry.x) / 0.26, (ny - dry.y) / 0.23) < 0.85 + (moist - 0.5) * 0.6;
    const damp = Math.hypot((nx - wet.x) / 0.15, (ny - wet.y) / 0.13) < 0.65 && moist > 0.43;
    const base =
      ny < climate.snowLine + (moist - 0.5) * 0.1 ? SNOW : arid ? DESERT : damp ? MARSH : PLAIN;
    const along = (u - 0.5) * Math.cos(ridge.angle) + (v - 0.5) * Math.sin(ridge.angle);
    const across = -(u - 0.5) * Math.sin(ridge.angle) + (v - 0.5) * Math.cos(ridge.angle);
    const offRidge = Math.abs(across - ridge.offset - Math.sin(along * 11) * 0.055);
    const woods = noise(u * 6, v * 6, 503) * 0.76 + noise(u * 13, v * 13, 601) * 0.24;
    if (offRidge < ridge.width && Math.abs(along) < 0.43) return [MOUNTAIN, base];
    if (woods > climate.forestLine && base !== DESERT) return [FOREST, base];
    return [base, base];
  };

  const terrain = new Uint8Array(cols * rows);
  const ground = new Uint8Array(cols * rows);
  for (let by = 0; by < rows; by += 2)
    for (let bx = 0; bx < cols; bx += 2) {
      const cell = classify((bx + 1) / cols, (by + 1) / rows);
      if (!cell) continue;
      for (let y = by; y < Math.min(rows, by + 2); y++)
        for (let x = bx; x < Math.min(cols, bx + 2); x++) {
          terrain[y * cols + x] = cell[0];
          ground[y * cols + x] = cell[1];
        }
    }
  return { terrain, ground, family };
}

/** 兩張地形的陸地重疊程度（交集 ÷ 聯集） */
export function landSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > 0 && b[i] > 0) both++;
    if (a[i] > 0 || b[i] > 0) either++;
  }
  return either ? both / either : 0;
}

/** 候補的種子：每次抽一個，和目前的構成一樣時加 1 */
function* candidateSeeds(rand: () => number, current: number, tries: number): Generator<number> {
  for (let k = 0; k < tries; k++) {
    const s = Math.floor(rand() * 4294967296) >>> 0;
    yield familyOf(s) === familyOf(current) ? (s + 1) >>> 0 : s;
  }
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
  let pick: { seed: number; terrain: GeneratedTerrain; overlap: number } | null = null;
  for (const seed of candidateSeeds(rand, current.seed, 10)) {
    const t = generateTerrain(seed, cols, rows);
    /* 換了尺寸時沒有可以比的陸地：第一個就用 */
    const overlap =
      current.terrain.length === t.terrain.length ? landSimilarity(current.terrain, t.terrain) : 0;
    if (!pick || overlap < pick.overlap) pick = { seed, terrain: t, overlap };
    if (pick.overlap < 0.48) break;
  }
  if (!pick) throw new Error('沒有候補的種子');
  return { seed: pick.seed, terrain: pick.terrain };
}

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
