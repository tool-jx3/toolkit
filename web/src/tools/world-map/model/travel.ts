/**
 * 旅程概算（第二批，規格 F76～F81、3.16）：沿著畫出來的路線，依地形、山地的深度、配置的難所素材、
 * 橋、港、街道的據點估算創作用的日數。演算法與數值照原作（和原作的結果並排比對：tests/unit/world-map-travel-parity.test.ts）。
 *
 * - 縮尺：地圖上 100 px 是幾 km；沿著曲線每 1.5 px 取一個點，依那一點所在的格子累計地形別的距離。
 * - 日距：徒步 30／騎乘 65／船 140 km（航路預設船，其他預設徒步；可以自訂）；追加的難度 ×0.8／1／1.5／2。
 * - 陸路的係數＝1＋(地表係數 × 地形係數 × (1＋難所素材) − 1) × 據點補正；船只看距離（陸地與川另外判斷能不能算）。
 * - 「只用距離計算」：不看地形、素材、川與「不能通行」，日數＝距離 ÷ 日距 × 難度。
 * 這是從地形與素材假設的險峻程度，不是實際的高度、天候、休息日、水深、橋的強度。
 */
import { clamp, sampleCurve } from './geometry';
import type { Grid } from './terrain';
import type { MapObject, MapPath, Pt, TravelDifficulty, TravelMode, WorldDoc } from './types';
import { CELL, MOUNTAIN } from './types';

export const DAILY_KM: Record<TravelMode, number> = { walk: 30, horse: 65, ship: 140 };
export const DIFFICULTY: Record<TravelDifficulty, number> = {
  easy: 0.8,
  normal: 1,
  hard: 1.5,
  extreme: 2,
};

/** 難所素材的權重 */
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
const SEVERE = new Set(['volcano', 'range', 'mountain']);
/** 街道經過時減輕惡路負擔的據點 */
export const INFRA_KINDS = new Set(['capital', 'city', 'town', 'village', 'inn', 'castle', 'fort']);

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

interface Circle {
  x: number;
  y: number;
  r: number;
}

/** 有範圍的東西的格子索引（96 px 一格；每個東西登記在外接框蓋到的每一格） */
function spatial<T extends Circle>(items: readonly T[]): (x: number, y: number) => readonly T[] {
  const cell = 96;
  const buckets = new Map<string, T[]>();
  for (const it of items)
    for (let y = Math.floor((it.y - it.r) / cell); y <= Math.floor((it.y + it.r) / cell); y++)
      for (let x = Math.floor((it.x - it.r) / cell); x <= Math.floor((it.x + it.r) / cell); x++) {
        const k = `${x},${y}`;
        const list = buckets.get(k);
        if (list) list.push(it);
        else buckets.set(k, [it]);
      }
  return (x, y) => buckets.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? [];
}

/** 山地格子到非山地的距離（格；四方向兩趟掃描，地圖外當作非山地） */
export function mountainDepth(
  terrain: ArrayLike<number>,
  cols: number,
  rows: number,
): Float32Array {
  const a = new Float32Array(cols * rows);
  for (let i = 0; i < a.length; i++) a[i] = terrain[i] === MOUNTAIN ? 1e6 : 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (a[i]) a[i] = Math.min(a[i], (x ? a[i - 1] : 0) + 1, (y ? a[i - cols] : 0) + 1);
    }
  for (let y = rows - 1; y >= 0; y--)
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (a[i])
        a[i] = Math.min(
          a[i],
          (x < cols - 1 ? a[i + 1] : 0) + 1,
          (y < rows - 1 ? a[i + cols] : 0) + 1,
        );
    }
  return a;
}

export const travelModeOf = (p: Pick<MapPath, 'kind' | 'travelMode'>): TravelMode =>
  p.travelMode ?? (p.kind === 'sea' ? 'ship' : 'walk');

interface Bridge extends Circle {
  halfW: number;
  halfH: number;
  angle: number;
}
interface Hazard extends Circle {
  id: string;
  weight: number;
  cluster: number;
  severe: boolean;
}
interface Crossing {
  length: number;
  radius: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  bridges: Set<Bridge>;
}

/**
 * 一條路線的旅程。samples：路線沿著曲線的取樣（geometry.sampleCurve），rivers：別的川（只用距離計算時給空的）。
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
  const speed =
    p.dailyKm !== undefined && Number.isFinite(p.dailyKm) && p.dailyKm > 0
      ? p.dailyKm
      : DAILY_KM[mode];
  const difficulty = DIFFICULTY[p.difficulty] ?? 1;
  const scale = kmPer100 / 100;
  const simple = p.simpleCalc;
  const horse = mode === 'horse';
  const totals = [0, 0, 0, 0, 0, 0, 0];
  let length = 0;
  let weighted = 0;
  let water = 0;
  let land = 0;
  let river = false;
  let bridged = false;
  let portUsed = false;
  let cliffKm = 0;
  const hazardHits = new Set<string>();
  const infraHits = new Set<string>();

  const depth =
    !simple && mode !== 'ship' && terrain.includes(MOUNTAIN)
      ? mountainDepth(terrain, cols, rows)
      : new Float32Array(cols * rows);

  const bridges: Bridge[] = [];
  const ports: Circle[] = [];
  const infra: (Circle & { id: string })[] = [];
  const hazards: Hazard[] = [];
  if (!simple) {
    const raw: MapObject[] = [];
    for (const o of objects) {
      if (o.kind === 'bridge') {
        const halfW = Math.max(20, o.size * 0.72);
        const halfH = Math.max(16, o.size * 0.52);
        bridges.push({
          x: o.x,
          y: o.y,
          r: Math.hypot(halfW, halfH),
          halfW,
          halfH,
          angle: (o.rotation * Math.PI) / 180,
        });
      } else if (o.kind === 'port') {
        /* 沿岸的港口（範圍裡有海）而且路線的點在範圍裡，才在那裡上下船 */
        const r = Math.max(36, o.size * 1.2);
        let coastal = false;
        const y0 = Math.max(0, Math.floor((o.y - r) / CELL));
        const y1 = Math.min(rows - 1, Math.floor((o.y + r) / CELL));
        const x0 = Math.max(0, Math.floor((o.x - r) / CELL));
        const x1 = Math.min(cols - 1, Math.floor((o.x + r) / CELL));
        for (let yy = y0; yy <= y1 && !coastal; yy++)
          for (let xx = x0; xx <= x1; xx++)
            if (
              !terrain[yy * cols + xx] &&
              Math.hypot((xx + 0.5) * CELL - o.x, (yy + 0.5) * CELL - o.y) <= r
            ) {
              coastal = true;
              break;
            }
        if (coastal && p.points.some((v) => Math.hypot(v.x - o.x, v.y - o.y) <= r))
          ports.push({ x: o.x, y: o.y, r });
      } else if (INFRA_KINDS.has(o.kind))
        infra.push({ id: o.id, x: o.x, y: o.y, r: Math.max(30, o.size * 1.05) });
      else if (HAZARD_WEIGHTS[o.kind]) raw.push(o);
    }
    /* 96 px 內的難所越多越險峻（山類再 ×1.35） */
    const near = spatial(raw.map((o) => ({ x: o.x, y: o.y, r: 96, o })));
    for (const o of raw) {
      let n = 0;
      for (const other of near(o.x, o.y)) {
        if (other.o === o) continue;
        const d = Math.hypot(o.x - other.x, o.y - other.y);
        if (d < 96) n += 1 - 0.5 * (d / 96);
        if (n >= 3.2 / 0.65) break;
      }
      const severe = SEVERE.has(o.kind);
      const cluster = 1 + Math.min(3.2, n * 0.65) * (severe ? 1.35 : 1);
      hazards.push({
        id: o.id,
        x: o.x,
        y: o.y,
        r: Math.max(24, o.size * 0.95),
        weight: HAZARD_WEIGHTS[o.kind] * cluster,
        cluster,
        severe,
      });
    }
  }
  const nearHazards = spatial(hazards);
  const nearInfra = spatial(infra);
  const nearBridges = spatial(bridges);
  const onBridge = (br: Bridge, x: number, y: number) => {
    const dx = x - br.x;
    const dy = y - br.y;
    const c = Math.cos(br.angle);
    const s = Math.sin(br.angle);
    return Math.abs(dx * c + dy * s) <= br.halfW && Math.abs(-dx * s + dy * c) <= br.halfH;
  };

  /* 每條川分開記：一座橋只算它蓋住的那一段渡河，不能讓別的川、或沿著川走很長一段也通行 */
  const crossings = new Map<string, Crossing>();
  const finish = (st: Crossing) => {
    const covered = [...st.bridges].some((br) => {
      const reach = br.r + st.radius + 1.5;
      if (st.length > 2 * reach + 3) return false;
      const far = Math.max(
        ...[st.minX, st.maxX].flatMap((x) =>
          [st.minY, st.maxY].map((y) => Math.hypot(x - br.x, y - br.y)),
        ),
      );
      return far <= reach;
    });
    if (covered) bridged = true;
    else river = true;
  };
  const BIN = 24;
  const bins = new Map<string, { a: Pt; b: Pt; radius: number; id: string }[]>();
  if (!simple && mode !== 'ship' && p.kind !== 'river')
    for (const r of rivers) {
      const radius = Math.max(1, (r.width * 1.25) / 2);
      for (let k = 1; k < r.points.length; k++) {
        const a = r.points[k - 1];
        const b = r.points[k];
        for (
          let y = Math.floor((Math.min(a.y, b.y) - radius) / BIN);
          y <= Math.floor((Math.max(a.y, b.y) + radius) / BIN);
          y++
        )
          for (
            let x = Math.floor((Math.min(a.x, b.x) - radius) / BIN);
            x <= Math.floor((Math.max(a.x, b.x) + radius) / BIN);
            x++
          ) {
            const key = `${x},${y}`;
            const seg = { a, b, radius, id: r.id };
            const list = bins.get(key);
            if (list) list.push(seg);
            else bins.set(key, [seg]);
          }
      }
    }

  const surface: Record<number, number> = horse
    ? { 4: 1.4, 5: 2, 6: 2.2 }
    : { 4: 1.3, 5: 1.6, 6: 1.7 };
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k - 1];
    const b = samples[k];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 1.5));
    const dist = len / steps;
    for (let j = 0; j < steps; j++) {
      const t = (j + 0.5) / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const i =
        clamp(Math.floor(y / CELL), 0, rows - 1) * cols + clamp(Math.floor(x / CELL), 0, cols - 1);
      const v = terrain[i];
      const g = ground[i] || v;
      length += dist;
      totals[v] += dist;
      if (simple) {
        weighted += dist;
        continue;
      }
      const nearBridge = nearBridges(x, y).some((br) => onBridge(br, x, y));
      const nearPort =
        mode === 'ship' && ports.some((pt) => Math.hypot(x - pt.x, y - pt.y) <= pt.r);
      if (v && nearPort) portUsed = true;
      if (!v && nearBridge && mode !== 'ship') bridged = true;
      if (v) {
        if (!nearPort) land += dist;
      } else if (!nearBridge) water += dist;
      if (mode === 'ship') {
        weighted += dist;
        continue;
      }
      let relief = 1;
      if (v === 2) relief = horse ? 1.8 : 1.5;
      else if (v === MOUNTAIN) {
        /* 山腳 3.2／4.5 倍，往山裡（稜線）急增到 10～16 倍 */
        relief =
          (horse ? 4.5 : 3.2) +
          Math.min(horse ? 11.5 : 6.8, Math.max(0, depth[i] - 1) ** 1.45 * (horse ? 2.4 : 1.5));
      }
      let penalty = 0;
      let severeLocal = v === MOUNTAIN && depth[i] >= 3;
      for (const h of nearHazards(x, y)) {
        const d = Math.hypot(x - h.x, y - h.y);
        if (d > h.r) continue;
        const falloff = 1 - (d / h.r) ** 1.6;
        penalty += h.weight * falloff * (horse && h.severe ? 1.35 : 1);
        hazardHits.add(h.id);
        if (h.severe && (h.cluster >= 1.5 || falloff > 0.45)) severeLocal = true;
      }
      let infraRelief = 1;
      if (p.kind === 'road')
        for (const inf of nearInfra(x, y))
          if (Math.hypot(x - inf.x, y - inf.y) <= inf.r) {
            infraRelief = 0.65;
            infraHits.add(inf.id);
            break;
          }
      const local = 1 + ((surface[g] ?? 1) * relief * (1 + penalty) - 1) * infraRelief;
      if (severeLocal && local >= 5.5) cliffKm += dist * scale;
      weighted += dist * local;
      /* 川的渡河 */
      const hits = new Map<string, { radius: number; bridges: Set<Bridge> }>();
      for (const seg of bins.get(`${Math.floor(x / BIN)},${Math.floor(y / BIN)}`) ?? []) {
        const dx = seg.b.x - seg.a.x;
        const dy = seg.b.y - seg.a.y;
        const u = clamp(((x - seg.a.x) * dx + (y - seg.a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const cx = seg.a.x + u * dx;
        const cy = seg.a.y + u * dy;
        if (Math.hypot(x - cx, y - cy) > seg.radius) continue;
        let hit = hits.get(seg.id);
        if (!hit) {
          hit = { radius: seg.radius, bridges: new Set() };
          hits.set(seg.id, hit);
        }
        for (const br of nearBridges(x, y)) if (onBridge(br, x, y)) hit.bridges.add(br);
        for (const br of nearBridges(cx, cy)) if (onBridge(br, cx, cy)) hit.bridges.add(br);
      }
      for (const [id, st] of crossings)
        if (!hits.has(id)) {
          finish(st);
          crossings.delete(id);
        }
      for (const [id, hit] of hits) {
        let st = crossings.get(id);
        if (!st) {
          st = {
            length: 0,
            radius: hit.radius,
            minX: x,
            maxX: x,
            minY: y,
            maxY: y,
            bridges: new Set(),
          };
          crossings.set(id, st);
        }
        st.length += dist;
        st.minX = Math.min(st.minX, x);
        st.maxX = Math.max(st.maxX, x);
        st.minY = Math.min(st.minY, y);
        st.maxY = Math.max(st.maxY, y);
        for (const br of hit.bridges) st.bridges.add(br);
      }
    }
  }
  for (const st of crossings.values()) finish(st);
  let reason: TravelReason | null = null;
  if (!simple) {
    if (p.access === 'blocked') reason = 'blocked';
    else if (p.access !== 'passable') {
      if (mode !== 'ship' && water > 0.01) reason = 'water';
      else if (mode === 'ship' && (land > 0.01 || p.kind === 'river' || totals[0] < 0.01))
        reason = 'ship';
      else if (river) reason = 'river';
    }
  }
  if (length < 0.001) reason = 'length';
  const km = length * scale;
  return {
    km,
    days: reason ? null : ((weighted * scale) / speed) * difficulty,
    pureDays: length < 0.001 ? null : (km / speed) * difficulty,
    simple,
    cliffKm: !simple && reason === null && cliffKm > 0.2 ? cliffKm : 0,
    hazards: [...hazardHits],
    infra: [...infraHits],
    bridged,
    portUsed,
    mode,
    speed,
    difficulty,
    reason,
    manual: p.access === 'passable',
    factor: length ? weighted / length : 1,
    terrain: totals.map((v) => v * scale),
  };
}

/** 地圖上的一條路線（沿著畫出來的曲線取樣；只用距離計算時不看別的川） */
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
