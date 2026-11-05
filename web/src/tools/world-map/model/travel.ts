/**
 * 旅程概算（第二批，規格 F76～F81、3.16）：沿著畫出來的路線，依地形、山地的深度、配置的難所素材、
 * 橋、港、街道的據點估算創作用的日數。計算方式與數值參考原作，結果和原作並排比對
 * （tests/unit/world-map-travel-parity.test.ts）。
 *
 * 結構：
 * 1. collectSites：把配置的素材分成橋、港、據點、難所四種範圍（光看距離換算時不看）。
 * 2. 沿著路線每 1.5 px 走一步（walkSteps），每一步看所在格子的地形與附近的範圍，累計到 Ledger。
 *    陸路的係數＝1＋(地表係數 × 地形係數 × (1＋難所的負擔) − 1) × 據點的減輕；船只看距離。
 * 3. 渡河（FordLog）：每條川分開記，橋只算它蓋住的那一段。
 * 4. verdict：不能算的理由；最後換成 km 與日數。
 * 這是從地形與素材假設的險峻程度，不是實際的高度、天候、休息日、水深、橋的強度。
 */
import { ORTHOGONAL, sweep } from './distance';
import { clamp, nearestOnSegment, sampleCurve } from './geometry';
import type { Grid } from './terrain';
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
  type TravelDifficulty,
  type TravelMode,
  type WorldDoc,
} from './types';

/** 一天走的距離（km） */
export const DAILY_KM: Record<TravelMode, number> = { walk: 30, horse: 65, ship: 140 };
/** 追加的難度 */
export const DIFFICULTY: Record<TravelDifficulty, number> = {
  easy: 0.8,
  normal: 1,
  hard: 1.5,
  extreme: 2,
};

/** 難所素材的負擔 */
export const HAZARD_WEIGHTS: Record<string, number> = {
  volcano: 6.5,
  range: 4.2,
  mountain: 3.2,
  marsh: 1.8,
  forest: 1.4,
  pine: 1.3,
  dungeon: 1.6,
  cave: 1.4,
  ruins: 1.2,
  mine: 1.2,
  hill: 1.1,
  cactus: 0.9,
};
/** 山類的難所（密集時更險峻、騎乘更吃力、算進「險峻的山岳」） */
const STEEP_KINDS = new Set(['volcano', 'range', 'mountain']);
/** 街道經過時減輕惡路負擔的據點 */
export const INFRA_KINDS = new Set(['capital', 'city', 'town', 'village', 'inn', 'castle', 'fort']);

/** 陸路的步調：地表、森林、山地的負擔 */
interface Gait {
  /** 沙漠、雪原、濕地的係數（其他 1） */
  surface: Partial<Record<number, number>>;
  forest: number;
  /** 山腳的係數，往山裡每深一格加 (深度 − 1)^1.45 × rise，最多加 cap */
  foothill: number;
  rise: number;
  cap: number;
  /** 山類難所的負擔再乘 */
  steep: number;
}
const GAITS: Record<'walk' | 'horse', Gait> = {
  walk: {
    surface: { [DESERT]: 1.3, [SNOW]: 1.6, [MARSH]: 1.7 },
    forest: 1.5,
    foothill: 3.2,
    rise: 1.5,
    cap: 6.8,
    steep: 1,
  },
  horse: {
    surface: { [DESERT]: 1.4, [SNOW]: 2, [MARSH]: 2.2 },
    forest: 1.8,
    foothill: 4.5,
    rise: 2.4,
    cap: 11.5,
    steep: 1.35,
  },
};

/** 每一步的距離（px） */
const STEP_PX = 1.5;
/** 據點範圍裡的街道：惡路的負擔剩 65％ */
const TOWN_EASE = 0.65;
/** 一點的係數到這個值以上、而且是險峻的山或難所時，算進「險峻的山岳」 */
const CLIFF_FACTOR = 5.5;

export type TravelReason = 'blocked' | 'water' | 'ship' | 'river' | 'length';

export interface TravelResult {
  km: number;
  /** 必要日數（不能算時 null） */
  days: number | null;
  /** 只看距離的日數（長度是 0 時 null） */
  pureDays: number | null;
  simple: boolean;
  /** 險峻的山岳、難所（km；沒有時 0） */
  cliffKm: number;
  hazards: string[];
  infra: string[];
  bridged: boolean;
  portUsed: boolean;
  mode: TravelMode;
  speed: number;
  difficulty: number;
  reason: TravelReason | null;
  manual: boolean;
  /** 地形・素材的平均係數 */
  factor: number;
  /** 地形別的距離（km）：0 海、1 平原、2 森林、3 山地、4 沙漠、5 雪原、6 濕地 */
  terrain: number[];
}

export interface RiverCurve {
  id: string;
  width: number;
  points: Pt[];
}

/* ---------- 範圍的索引 ---------- */

/** 固定大小的方格桶：東西登記在外接框蓋到的每一格，查詢時只看那一點所在的桶 */
class Buckets<T> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly size: number) {}

  private key(gx: number, gy: number): string {
    return `${gx}:${gy}`;
  }

  add(item: T, x0: number, y0: number, x1: number, y1: number): void {
    const s = this.size;
    for (let gy = Math.floor(y0 / s); gy <= Math.floor(y1 / s); gy++)
      for (let gx = Math.floor(x0 / s); gx <= Math.floor(x1 / s); gx++) {
        const k = this.key(gx, gy);
        const list = this.cells.get(k);
        if (list) list.push(item);
        else this.cells.set(k, [item]);
      }
  }

  at(x: number, y: number): readonly T[] {
    return this.cells.get(this.key(Math.floor(x / this.size), Math.floor(y / this.size))) ?? [];
  }
}

interface Zone {
  x: number;
  y: number;
  r: number;
}

/** 圓形範圍的索引（96 px 的桶） */
function zoneIndex<T extends Zone>(zones: readonly T[]): Buckets<T> {
  const b = new Buckets<T>(96);
  for (const z of zones) b.add(z, z.x - z.r, z.y - z.r, z.x + z.r, z.y + z.r);
  return b;
}

const within = (z: Zone, x: number, y: number) => Math.hypot(x - z.x, y - z.y) <= z.r;

/* ---------- 素材的範圍 ---------- */

interface BridgeZone extends Zone {
  halfW: number;
  halfH: number;
  cos: number;
  sin: number;
}
interface TownZone extends Zone {
  id: string;
}
interface Danger extends Zone {
  id: string;
  /** 負擔（素材的負擔 × 密集度） */
  load: number;
  /** 密集度（1＝附近沒有別的難所） */
  density: number;
  steep: boolean;
}

/** 橋的長方形（依旋轉）蓋住這一點 */
function bridgeCovers(b: BridgeZone, x: number, y: number): boolean {
  const dx = x - b.x;
  const dy = y - b.y;
  return (
    Math.abs(dx * b.cos + dy * b.sin) <= b.halfW && Math.abs(-dx * b.sin + dy * b.cos) <= b.halfH
  );
}

function bridgeZone(o: MapObject): BridgeZone {
  const halfW = Math.max(20, o.size * 0.72);
  const halfH = Math.max(16, o.size * 0.52);
  const angle = (o.rotation * Math.PI) / 180;
  return {
    x: o.x,
    y: o.y,
    r: Math.hypot(halfW, halfH),
    halfW,
    halfH,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
  };
}

type Terrain = Pick<Grid, 'cols' | 'rows' | 'terrain'>;

/** 範圍裡有沒有海的格子（以格子中心判斷） */
function touchesSea(grid: Terrain, z: Zone): boolean {
  const { cols, rows, terrain } = grid;
  const top = Math.max(0, Math.floor((z.y - z.r) / CELL));
  const bottom = Math.min(rows - 1, Math.floor((z.y + z.r) / CELL));
  const left = Math.max(0, Math.floor((z.x - z.r) / CELL));
  const right = Math.min(cols - 1, Math.floor((z.x + z.r) / CELL));
  for (let row = top; row <= bottom; row++)
    for (let col = left; col <= right; col++)
      if (!terrain[row * cols + col] && within(z, (col + 0.5) * CELL, (row + 0.5) * CELL))
        return true;
  return false;
}

/** 96 px 內的別的難所越多越密集：每個 1 − 0.5 × 距離 ÷ 96，× 0.65，最多 3.2（山類再 × 1.35） */
const CROWD_REACH = 96;
const CROWD_CAP = 3.2;

function dangerZones(found: readonly MapObject[]): Danger[] {
  const near = zoneIndex(found.map((o) => ({ x: o.x, y: o.y, r: CROWD_REACH, o })));
  return found.map((o) => {
    let crowd = 0;
    for (const other of near.at(o.x, o.y)) {
      if (other.o === o || crowd * 0.65 >= CROWD_CAP) continue;
      const d = Math.hypot(o.x - other.x, o.y - other.y);
      if (d < CROWD_REACH) crowd += 1 - 0.5 * (d / CROWD_REACH);
    }
    const steep = STEEP_KINDS.has(o.kind);
    const density = 1 + Math.min(CROWD_CAP, crowd * 0.65) * (steep ? 1.35 : 1);
    return {
      id: o.id,
      x: o.x,
      y: o.y,
      r: Math.max(24, o.size * 0.95),
      load: HAZARD_WEIGHTS[o.kind] * density,
      density,
      steep,
    };
  });
}

interface Sites {
  bridges: Buckets<BridgeZone>;
  /** 沿岸、而且路線的點在範圍裡的港（船在那裡上下） */
  harbors: Zone[];
  towns: Buckets<TownZone>;
  dangers: Buckets<Danger>;
}

function collectSites(grid: Terrain, objects: readonly MapObject[], route: readonly Pt[]): Sites {
  const bridges: BridgeZone[] = [];
  const harbors: Zone[] = [];
  const towns: TownZone[] = [];
  const found: MapObject[] = [];
  for (const o of objects) {
    if (o.kind === 'bridge') bridges.push(bridgeZone(o));
    else if (o.kind === 'port') {
      const z = { x: o.x, y: o.y, r: Math.max(36, o.size * 1.2) };
      if (touchesSea(grid, z) && route.some((v) => within(z, v.x, v.y))) harbors.push(z);
    } else if (INFRA_KINDS.has(o.kind))
      towns.push({ id: o.id, x: o.x, y: o.y, r: Math.max(30, o.size * 1.05) });
    else if (HAZARD_WEIGHTS[o.kind]) found.push(o);
  }
  return {
    bridges: zoneIndex(bridges),
    harbors,
    towns: zoneIndex(towns),
    dangers: zoneIndex(dangerZones(found)),
  };
}

const NO_SITES: Sites = {
  bridges: new Buckets(96),
  harbors: [],
  towns: new Buckets(96),
  dangers: new Buckets(96),
};

/* ---------- 川 ---------- */

interface RiverPiece {
  id: string;
  a: Pt;
  b: Pt;
  radius: number;
}

/** 別的川的每一段（24 px 的桶；半徑＝寬 × 1.25 ÷ 2，至少 1） */
function riverIndex(rivers: readonly RiverCurve[]): Buckets<RiverPiece> {
  const index = new Buckets<RiverPiece>(24);
  for (const river of rivers) {
    const radius = Math.max(1, (river.width * 1.25) / 2);
    river.points.forEach((b, k) => {
      if (!k) return;
      const a = river.points[k - 1];
      index.add(
        { id: river.id, a, b, radius },
        Math.min(a.x, b.x) - radius,
        Math.min(a.y, b.y) - radius,
        Math.max(a.x, b.x) + radius,
        Math.max(a.y, b.y) + radius,
      );
    });
  }
  return index;
}

/** 這一步碰到的一條川：半徑、蓋住這一點（或川上最近的點）的橋 */
interface Touch {
  radius: number;
  bridges: Set<BridgeZone>;
}

/** 一次渡河：碰到同一條川的連續幾步 */
interface Ford extends Touch {
  length: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** 渡河的紀錄：離開一條川時，看有沒有一座橋蓋住整段（渡河的長度、範圍都在橋的範圍內） */
class FordLog {
  private readonly open = new Map<string, Ford>();
  bridged = false;
  unbridged = false;

  step(x: number, y: number, dist: number, touching: ReadonlyMap<string, Touch>): void {
    for (const [id, ford] of this.open)
      if (!touching.has(id)) {
        this.close(ford);
        this.open.delete(id);
      }
    for (const [id, t] of touching) {
      let ford = this.open.get(id);
      if (!ford) {
        ford = { radius: t.radius, bridges: new Set(), length: 0, x0: x, x1: x, y0: y, y1: y };
        this.open.set(id, ford);
      }
      ford.length += dist;
      ford.x0 = Math.min(ford.x0, x);
      ford.x1 = Math.max(ford.x1, x);
      ford.y0 = Math.min(ford.y0, y);
      ford.y1 = Math.max(ford.y1, y);
      for (const b of t.bridges) ford.bridges.add(b);
    }
  }

  finish(): void {
    for (const ford of this.open.values()) this.close(ford);
    this.open.clear();
  }

  private close(ford: Ford): void {
    const spanned = [...ford.bridges].some((b) => {
      const reach = b.r + ford.radius + 1.5;
      if (ford.length > 2 * reach + 3) return false;
      const corners = [ford.x0, ford.x1].flatMap((x) =>
        [ford.y0, ford.y1].map((y) => Math.hypot(x - b.x, y - b.y)),
      );
      return Math.max(...corners) <= reach;
    });
    if (spanned) this.bridged = true;
    else this.unbridged = true;
  }
}

/** 這一點碰到的川 */
function riversAt(
  pieces: Buckets<RiverPiece>,
  bridges: Buckets<BridgeZone>,
  x: number,
  y: number,
): Map<string, Touch> {
  const out = new Map<string, Touch>();
  const here = { x, y };
  for (const seg of pieces.at(x, y)) {
    const c = nearestOnSegment(here, seg.a, seg.b);
    if (Math.hypot(x - c.x, y - c.y) > seg.radius) continue;
    let t = out.get(seg.id);
    if (!t) {
      t = { radius: seg.radius, bridges: new Set() };
      out.set(seg.id, t);
    }
    for (const p of [here, c])
      for (const b of bridges.at(p.x, p.y)) if (bridgeCovers(b, p.x, p.y)) t.bridges.add(b);
  }
  return out;
}

/* ---------- 地形 ---------- */

/** 山地格子到非山地的距離（格；四方向兩趟掃描，地圖外當作非山地） */
export function mountainDepth(
  terrain: ArrayLike<number>,
  cols: number,
  rows: number,
): Float32Array {
  const field = Float32Array.from({ length: cols * rows }, (_, i) =>
    terrain[i] === MOUNTAIN ? 1e6 : 0,
  );
  return sweep(field, cols, rows, ORTHOGONAL, { outside: 1 });
}

/** 地形的係數：森林固定，山地從山腳往稜線急增 */
function reliefLoad(gait: Gait, v: number, depth: number): number {
  if (v === FOREST) return gait.forest;
  if (v !== MOUNTAIN) return 1;
  return gait.foothill + Math.min(gait.cap, Math.max(0, depth - 1) ** 1.45 * gait.rise);
}

export const travelModeOf = (p: Pick<MapPath, 'kind' | 'travelMode'>): TravelMode =>
  p.travelMode ?? (p.kind === 'sea' ? 'ship' : 'walk');

/** 沿著取樣的折線每 1.5 px 一步：步的中點與長度 */
function* walkSteps(samples: readonly Pt[]): Generator<{ x: number; y: number; dist: number }> {
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k - 1];
    const b = samples[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / STEP_PX));
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n;
      yield { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dist: len / n };
    }
  }
}

/** 累計（px；cliff 是 km） */
interface Ledger {
  length: number;
  weighted: number;
  /** 陸路走在海上（沒有橋） */
  water: number;
  /** 船走在陸地上（不在港的範圍） */
  land: number;
  cliff: number;
  byTerrain: number[];
  bridgedSea: boolean;
  portUsed: boolean;
  hazards: Set<string>;
  towns: Set<string>;
}

function verdict(
  p: MapPath,
  mode: TravelMode,
  sum: Ledger,
  unbridgedRiver: boolean,
): TravelReason | null {
  if (p.access === 'blocked') return 'blocked';
  if (p.access === 'passable') return null;
  if (mode === 'ship')
    return sum.land > 0.01 || p.kind === 'river' || sum.byTerrain[0] < 0.01 ? 'ship' : null;
  if (sum.water > 0.01) return 'water';
  return unbridgedRiver ? 'river' : null;
}

/**
 * 一條路線的旅程。samples：路線沿著曲線的取樣（geometry.sampleCurve），rivers：別的川（光看距離換算時給空的）。
 */
export function travelMetrics(
  grid: Pick<Grid, 'cols' | 'rows' | 'terrain' | 'ground'>,
  objects: readonly MapObject[],
  kmPer100: number,
  p: MapPath,
  samples: readonly Pt[],
  rivers: readonly RiverCurve[],
): TravelResult {
  const { cols, rows, terrain, ground } = grid;
  const mode = travelModeOf(p);
  const custom = p.dailyKm;
  const speed =
    custom !== undefined && Number.isFinite(custom) && custom > 0 ? custom : DAILY_KM[mode];
  const difficulty = DIFFICULTY[p.difficulty] ?? 1;
  const kmPerPx = kmPer100 / 100;
  const simple = p.simpleCalc;
  const ship = mode === 'ship';
  const gait = ship ? null : GAITS[mode];
  const sites = simple ? NO_SITES : collectSites(grid, objects, p.points);
  const depth =
    gait && !simple && terrain.includes(MOUNTAIN) ? mountainDepth(terrain, cols, rows) : null;
  /* 每條川分開記：一座橋只算它蓋住的那一段渡河，不能讓別的川、或沿著川走很長一段也通行 */
  const pieces = gait && !simple && p.kind !== 'river' ? riverIndex(rivers) : null;
  const fords = new FordLog();
  const sum: Ledger = {
    length: 0,
    weighted: 0,
    water: 0,
    land: 0,
    cliff: 0,
    byTerrain: [0, 0, 0, 0, 0, 0, 0],
    bridgedSea: false,
    portUsed: false,
    hazards: new Set(),
    towns: new Set(),
  };

  for (const { x, y, dist } of walkSteps(samples)) {
    const i =
      clamp(Math.floor(y / CELL), 0, rows - 1) * cols + clamp(Math.floor(x / CELL), 0, cols - 1);
    const v = terrain[i];
    sum.length += dist;
    sum.byTerrain[v] += dist;
    if (simple) {
      sum.weighted += dist;
      continue;
    }
    const onBridge = sites.bridges.at(x, y).some((b) => bridgeCovers(b, x, y));
    const inHarbor = ship && sites.harbors.some((h) => within(h, x, y));
    if (v) {
      if (inHarbor) sum.portUsed = true;
      else sum.land += dist;
    } else if (onBridge) {
      if (!ship) sum.bridgedSea = true;
    } else sum.water += dist;
    if (!gait) {
      sum.weighted += dist;
      continue;
    }
    const d = depth ? depth[i] : 0;
    let steep = v === MOUNTAIN && d >= 3;
    let burden = 0;
    for (const h of sites.dangers.at(x, y)) {
      const r = Math.hypot(x - h.x, y - h.y);
      if (r > h.r) continue;
      const falloff = 1 - (r / h.r) ** 1.6;
      burden += h.load * falloff * (h.steep ? gait.steep : 1);
      sum.hazards.add(h.id);
      if (h.steep && (h.density >= 1.5 || falloff > 0.45)) steep = true;
    }
    let ease = 1;
    if (p.kind === 'road') {
      const town = sites.towns.at(x, y).find((z) => within(z, x, y));
      if (town) {
        ease = TOWN_EASE;
        sum.towns.add(town.id);
      }
    }
    const surface = gait.surface[ground[i] || v] ?? 1;
    const local = 1 + (surface * reliefLoad(gait, v, d) * (1 + burden) - 1) * ease;
    if (steep && local >= CLIFF_FACTOR) sum.cliff += dist * kmPerPx;
    sum.weighted += dist * local;
    if (pieces) fords.step(x, y, dist, riversAt(pieces, sites.bridges, x, y));
  }
  fords.finish();

  const reason =
    sum.length < 0.001 ? 'length' : simple ? null : verdict(p, mode, sum, fords.unbridged);
  const km = sum.length * kmPerPx;
  return {
    km,
    days: reason ? null : ((sum.weighted * kmPerPx) / speed) * difficulty,
    pureDays: sum.length < 0.001 ? null : (km / speed) * difficulty,
    simple,
    cliffKm: !simple && reason === null && sum.cliff > 0.2 ? sum.cliff : 0,
    hazards: [...sum.hazards],
    infra: [...sum.towns],
    bridged: sum.bridgedSea || fords.bridged,
    portUsed: sum.portUsed,
    mode,
    speed,
    difficulty,
    reason,
    manual: p.access === 'passable',
    factor: sum.length ? sum.weighted / sum.length : 1,
    terrain: sum.byTerrain.map((v) => v * kmPerPx),
  };
}

/** 地圖上的一條路線（沿著畫出來的曲線取樣；光看距離換算時不看別的川） */
export function travelForPath(
  doc: Pick<WorldDoc, 'objects' | 'paths' | 'settings'>,
  grid: Pick<Grid, 'cols' | 'rows' | 'terrain' | 'ground'>,
  p: MapPath,
): TravelResult {
  const rivers = p.simpleCalc
    ? []
    : doc.paths
        .filter((q) => q.kind === 'river' && q.id !== p.id)
        .map((q) => ({ id: q.id, width: q.width, points: sampleCurve(q.points, q.smooth) }));
  return travelMetrics(
    grid,
    doc.objects,
    doc.settings.kmPer100,
    p,
    sampleCurve(p.points, p.kind === 'wall' ? false : p.smooth),
    rivers,
  );
}
