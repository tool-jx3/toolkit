/**
 * 自動產生世界的町與道路（populateWorld）。
 *
 * - 只看 70 格以上的陸塊，最大的 5 塊；離海至少 2 格、不在山上的格子。
 * - 每塊 1～4 個（最大的那塊最多 4、其他最多 3；每 300 格多一個），依序挑「離已經放的最遠」的格子（間隔至少 100 px）；
 *   最大陸塊的第一個是王都，其他第一個是城市、第二個是町、之後是村；離海 2 格以內的（第一個以外）是港口。
 * - 名字依種類與那裡的氣候提案，不重複。
 * - 道路：從最近的已放據點走到新的據點（只走陸地；山 5、森林 2、濕地 3、其他 1 的成本，route.ts），
 *   簡化成每段最多 6 格、整條平滑曲線都在陸地上（含 2.5 px 的寬度）；曲線碰到海時退回只留轉角的折線。
 */
import { ORTHOGONAL, sweep } from './distance';
import { newObject, newPath } from './factory';
import { sampleCurve } from './geometry';
import { suggestName } from './names';
import { cheapestRoute, eachNeighbor } from './route';
import { cellCenter } from './terrain';
import {
  CELL,
  DESERT,
  FOREST,
  MARSH,
  type MapObject,
  type MapPath,
  MOUNTAIN,
  type Pt,
  SNOW,
} from './types';

export interface Populated {
  objects: MapObject[];
  paths: MapPath[];
}

const MIN_MASS = 70;
const MAX_MASSES = 5;
/** 據點之間至少隔多遠（px） */
const SITE_GAP = 100;
/** 道路簡化時一段最多幾格、曲線最多幾個點 */
const ROAD_REACH = 6;
const ROAD_MAX_POINTS = 256;
/** 道路的寬：曲線上每一點的中心與上下左右 2.5 px 都要在陸地上 */
const ROAD_HALF = 2.5;

/** 走進一格的成本（海不能走） */
const ENTER_COST: Partial<Record<number, number>> = { [MOUNTAIN]: 5, [FOREST]: 2, [MARSH]: 3 };

/** 相連的陸地（四方向），格數 minSize 以上的，大的在前（同樣大時照掃描的順序） */
function landMasses(terrain: Uint8Array, cols: number, rows: number, minSize: number): number[][] {
  const owner = new Int32Array(terrain.length).fill(-1);
  const masses: number[][] = [];
  terrain.forEach((v, seed) => {
    if (!v || owner[seed] >= 0) return;
    const mass = [seed];
    owner[seed] = seed;
    for (let k = 0; k < mass.length; k++)
      eachNeighbor(mass[k], cols, rows, (j) => {
        if (terrain[j] && owner[j] < 0) {
          owner[j] = seed;
          mass.push(j);
        }
      });
    if (mass.length >= minSize) masses.push(mass);
  });
  return masses.sort((a, b) => b.length - a.length);
}

/** 每一格離海的格數（四方向） */
function seaDistance(terrain: Uint8Array, cols: number, rows: number): Float32Array {
  const field = Float32Array.from(terrain, (v) => (v ? 32767 : 0));
  return sweep(field, cols, rows, ORTHOGONAL, { outside: null });
}

/** 據點的種類：第幾個（k）、是不是最大的陸塊、離海的格數 */
function siteKind(k: number, mainland: boolean, shore: number): string {
  if (k === 0) return mainland ? 'capital' : 'city';
  if (shore <= 2) return 'port';
  return k === 1 ? 'town' : 'village';
}

export function populateWorld(
  terrain: Uint8Array,
  ground: Uint8Array,
  cols: number,
  rows: number,
  seed: number,
  makeId: () => string,
): Populated {
  const shore = seaDistance(terrain, cols, rows);
  const center = (i: number) => cellCenter(i, cols);
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  /** 每一格固定的 0～1 雜湊（同樣遠時挑哪一格） */
  const jitter = (i: number) => {
    let h = Math.imul(i + 1, 0x2545f491) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 0x9e3779b1);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  /* ---------- 道路的形狀 ---------- */
  const isLand = (x: number, y: number) => {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    return cx >= 0 && cx < cols && cy >= 0 && cy < rows && terrain[cy * cols + cx] > 0;
  };
  const PROBES = [
    [0, 0],
    [-ROAD_HALF, 0],
    [ROAD_HALF, 0],
    [0, -ROAD_HALF],
    [0, ROAD_HALF],
  ];
  const roadFits = (p: Pt) => PROBES.every(([dx, dy]) => isLand(p.x + dx, p.y + dy));
  /** 直線 ab 每 1.5 px 都放得下道路 */
  const clearLine = (a: Pt, b: Pt) => {
    const n = Math.max(1, Math.ceil(dist(a, b) / 1.5));
    for (let j = 0; j <= n; j++) {
      const p = { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n };
      if (!roadFits(p)) return false;
    }
    return true;
  };
  /** 平滑曲線（畫出來的形狀）整條都放得下道路 */
  const clearCurve = (pts: Pt[]) =>
    sampleCurve(pts, true).every((p, k, all) => k === 0 || clearLine(all[k - 1], p));
  /** 只留轉彎的格子 */
  const corners = (cells: number[]) =>
    cells
      .filter((c, k) => k === 0 || k === cells.length - 1 || 2 * c !== cells[k - 1] + cells[k + 1])
      .map(center);
  /** 從頭開始，每次跳到 6 格內最遠、直線放得下道路的格子 */
  const straighten = (cells: number[]) => {
    const out = [center(cells[0])];
    let at = 0;
    while (at < cells.length - 1) {
      let to = Math.min(at + ROAD_REACH, cells.length - 1);
      while (to > at + 1 && !clearLine(center(cells[at]), center(cells[to]))) to--;
      out.push(center(cells[to]));
      at = to;
    }
    return out;
  };
  const road = (from: number, to: number, name: string): MapPath | null => {
    const cells = cheapestRoute(cols, rows, from, to, (j) =>
      terrain[j] ? (ENTER_COST[terrain[j]] ?? 1) : null,
    );
    if (!cells) return null;
    let points = straighten(cells);
    let smooth = true;
    if (points.length > ROAD_MAX_POINTS || !clearCurve(points)) {
      points = corners(cells);
      smooth = clearCurve(points);
    }
    if (points.length > ROAD_MAX_POINTS || points.length < 2) return null;
    const p = newPath('road', points, makeId);
    p.name = name;
    p.smooth = smooth;
    return p;
  };

  /* ---------- 名字 ---------- */
  const taken = new Set<string>();
  let placed = 0;
  const climateOf = (i: number) => ({
    snow: ground[i] === SNOW ? 1 : 0,
    desert: ground[i] === DESERT ? 1 : 0,
    wet: ground[i] === MARSH ? 1 : 0,
  });
  const freshName = (kind: string, i: number) => {
    let name = '';
    for (let n = 0; n < 100; n++) {
      name = suggestName(kind, (seed + i * 313 + placed * 97 + n * 131) >>> 0, climateOf(i));
      if (!taken.has(name)) {
        taken.add(name);
        return name;
      }
    }
    return `${name}・${placed}`;
  };

  /* ---------- 據點 ---------- */
  /** pool 裡離已經放的據點最遠的格子（第一個：離海越遠越好，最多算 8 格）；放不下時 -1 */
  const farthest = (pool: readonly number[], sites: readonly number[]) => {
    let pick = -1;
    let best = -Infinity;
    for (const i of pool) {
      const p = center(i);
      let room = sites.length ? Infinity : Math.min(shore[i], 8) * CELL;
      for (const j of sites) room = Math.min(room, dist(p, center(j)));
      if (sites.length && room < SITE_GAP) continue;
      const score = room * (0.75 + jitter(i) * 0.25);
      if (score > best) {
        best = score;
        pick = i;
      }
    }
    return pick;
  };
  const nearestSite = (sites: readonly number[], p: Pt) => {
    let pick = sites[0];
    let best = Infinity;
    for (const j of sites) {
      const d = dist(center(j), p);
      if (d < best) {
        best = d;
        pick = j;
      }
    }
    return pick;
  };

  const objects: MapObject[] = [];
  const paths: MapPath[] = [];
  landMasses(terrain, cols, rows, MIN_MASS)
    .slice(0, MAX_MASSES)
    .forEach((mass, m) => {
      const inland = mass.filter((i) => shore[i] >= 2 && terrain[i] !== MOUNTAIN);
      const pool = inland.length ? inland : mass.filter((i) => shore[i] >= 2);
      const quota = Math.min(m === 0 ? 4 : 3, Math.max(1, Math.floor(mass.length / 300) + 1));
      const sites: number[] = [];
      while (pool.length && sites.length < quota) {
        const at = farthest(pool, sites);
        if (at < 0) break;
        const p = center(at);
        const kind = siteKind(sites.length, m === 0, shore[at]);
        placed++;
        const o = newObject(kind, p.x, p.y, makeId);
        o.name = freshName(kind, at);
        objects.push(o);
        if (sites.length) {
          const rd = road(nearestSite(sites, p), at, suggestName('road', (seed + at * 97) >>> 0));
          if (rd) paths.push(rd);
        }
        sites.push(at);
      }
    });
  return { objects, paths };
}
