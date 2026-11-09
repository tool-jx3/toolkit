/**
 * 演出的移動路線怎麼走（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的路線；規格 F316、F317、3.19.3）。純函式。
 * 參考的是原作的演算法與數值（m 換成格 × 2）；資料結構與程式是本站自己的。
 *
 * **一層樓**（`floorNavigator`，class `Walkway`）：
 * - 地面（`Ground`）：每間房一塊（外形＝`roomPolygon`；水面、外觀層的屋頂不能走），一點屬於最上面的那一間；
 *   一塊地扣掉蓋在它上面、外接範圍重疊的房間。
 * - 站點：①門（門窗分頁的「門」那一組；放在曲線上的照曲線上的位置與方向）的兩側各一點，離牆 0.96 格，
 *   兩點在不同的地面上、走到門口不穿過外形才用，不行時 0.44、0.16 格；②沒有牆的邊（兩間戶外房間之間、不產生牆的分區）
 *   每 8 格一個，同樣的做法。經過的代價 2 × 離牆 ＋ 0.8。③地面裡的點（第一次查到時才放）：名字的位置、
 *   外形的內角與蓋在上面的房間的角各往外 (±0.32, ±0.32) 格；角＝前後兩邊的方向差 20° 以上的頂點（曲線取樣的點不算），
 *   點比 8 多的蓋在上面的外形另加外接範圍的四個角。
 * - 同一塊地上兩個站點：直走不穿過外形就連；走廊（`hall`）的斜線改走長邊方向的中線；不然試一個直角的轉彎。
 *   每格的代價：走廊・戶外通道・甲板類 0.78，其他 1.3。
 * - 查詢：起點與終點當成這一次才有的站點接上去，最短路（Dijkstra），再拿掉一直線上多的點（超過 64 點＝走不到）。
 *
 * **跨樓層**：上下樓層的連接（model/stack.ts 的 verticalLinks）。直的樓梯：上下樓的點在前面的平台，往上的在左半、
 * 往下的在右半（同立體圖的樓梯模型），後面的平台是到另一層的地方；其他的在中心。一層一層換：每一座連到下一層的連接，
 * 從目前的每一種走法走過去、只留最短的（`changeFloors`）；房間到房間（`planRoute`）每一層一段。
 *
 * **形狀**（`routePolyline`）：折線的轉角往前後各縮 min(0.64, 0.4 × 兩邊的長度)、也不比到房間外形的距離的 0.8 倍近，
 * 畫成二次曲線。
 */
import { OPEN } from './catalog';
import { polyEdgeDist, polyHas, signedArea, type Pt as XY } from './curve';
import { rectsOverlap } from './geometry';
import { roomMainRect, roomPolygon } from './shape';
import {
  itemFrame,
  type LinkEnd,
  type LinkKind,
  linkKind,
  stackLevels,
  type VerticalLink,
  verticalLinks,
} from './stack';
import { roomKey } from './stageData';
import type { Floor, Project, Rect, Room, StageRoute } from './types';
import { computeWalls, edgeKind, pointOwner } from './walls';

export { roomKey, splitRoomKey } from './stageData';

export interface Pt {
  x: number;
  y: number;
}

/** 一條路線最多幾個點（原作） */
export const ROUTE_MAX_POINTS = 64;

/** 經過門、沒有牆的邊時離牆的距離（格；原作 0.48／0.22／0.08 m），由遠到近試 */
const DOOR_CLEARANCES = [0.96, 0.44, 0.16] as const;
/** 走到門口的那一小段的終點（離門的中線 0.002 格；原作 0.001 m） */
const DOOR_LIP = 0.002;
/** 地面裡的轉角往外多少（格；原作 0.16 m） */
const CORNER_PAD = 0.32;
/** 每格的代價：走廊・戶外通道・甲板類、其他的房間（原作） */
const COST_HALL = 0.78;
const COST_ROOM = 1.3;
/** 沒有牆的邊每多少格放一個通過點（原作一整段一個；很長的戶外交界放幾個，路線才不會繞到正中間） */
const SEAM_SPAN = 8;
/** 頂點轉多少才算「角」（曲線的外形取樣的點每個只轉一兩度）；點比這個多的外形當成曲線 */
const CORNER_SIN = Math.sin((20 * Math.PI) / 180);
const CURVE_VERTICES = 8;

const LOW_COST_CATS = new Set<Room['cat']>([
  'hall',
  'road',
  'porch',
  'engawa',
  'platform',
  'balcony',
  'rooftop',
  'shipdeck',
]);

/* ---------- 幾何（點用 [x, y]，和 model/curve.ts 一樣） ---------- */

const gap = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** c 在 a→b 的哪一邊（正＝左） */
const side = (a: XY, b: XY, c: XY) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** 兩段數值範圍有沒有碰到（端點相接也算） */
const spansMeet = (a: number, b: number, c: number, d: number) =>
  Math.max(a, b) >= Math.min(c, d) && Math.max(c, d) >= Math.min(a, b);

/** 線段 pq 與 ab 相交（端點碰到、共線重疊也算） */
function segmentsMeet(p: XY, q: XY, a: XY, b: XY): boolean {
  if (!spansMeet(p[0], q[0], a[0], b[0]) || !spansMeet(p[1], q[1], a[1], b[1])) return false;
  return side(p, q, a) * side(p, q, b) <= 0 && side(a, b, p) * side(a, b, q) <= 0;
}

/** 折線碰到多邊形的某一條邊 */
function crossesOutline(path: readonly XY[], outline: readonly XY[]): boolean {
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k];
    const b = outline[(k + 1) % outline.length];
    for (let i = 1; i < path.length; i++) if (segmentsMeet(path[i - 1], path[i], a, b)) return true;
  }
  return false;
}

function frameOf(poly: readonly XY[]): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 頂點 p 是角：前後兩邊的方向差 20° 以上（長方形、L 形的頂點都是 90°） */
function isTurn(prev: XY, p: XY, next: XY, turn: number): boolean {
  const a = gap(prev, p);
  const b = gap(p, next);
  if (a < 1e-9 || b < 1e-9) return false;
  const along = (p[0] - prev[0]) * (next[0] - p[0]) + (p[1] - prev[1]) * (next[1] - p[1]);
  return along < 0 || Math.abs(turn) / (a * b) >= CORNER_SIN;
}

const toXY = (p: Pt): XY => [p.x, p.y];
const fromXY = ([x, y]: readonly [number, number]): Pt => ({ x, y });

/** 房間的外形（{x, y} 的點；畫法、測試用） */
export const polyOf = (r: Room): Pt[] => roomPolygon(r).map(fromXY);

/** 點在多邊形裡（射線法；邊上不一定） */
export const inPoly = (poly: readonly Pt[], p: Pt): boolean => polyHas(poly.map(toXY), p.x, p.y);

/** 能走的房間（水面、外觀層的屋頂不能走） */
export const walkableRoom = (r: Room | null | undefined): boolean =>
  !!r && r.cat !== 'water' && r.cat !== 'roof' && r.floor !== 'water';

/** 房間的「名字的位置」（路線的起點、終點；同房間名牌） */
export function roomAnchor(r: Room): Pt {
  const m = roomMainRect(r);
  return { x: m.x + m.w / 2 + (r.lx || 0), y: m.y + m.h / 2 + (r.ly || 0) };
}

/* ---------- 一層樓的走法 ---------- */

export type Navigator = (start: Pt, end: Pt) => Pt[] | null;

interface Ground {
  room: Room;
  rim: XY[];
  frame: Rect;
  /** 蓋在上面、外接範圍重疊的房間的外形 */
  over: XY[][];
  /** 這塊地上的站點（建立的順序） */
  stops: number[];
  seeded: boolean;
}

/** 站點之間的一段：到哪個站點、代價、中間經過的點（照這一段的方向） */
interface Leg {
  to: number;
  cost: number;
  via: XY[];
}

/** 兩個站點之間怎麼走（同一塊地上；走不到時 null） */
type Passage = { cost: number; via: XY[] } | null;

class Walkway {
  private readonly grounds: Ground[];
  private readonly spots: { at: XY; ground: Ground }[] = [];
  private readonly legs: Leg[][] = [];

  constructor(floor: Pick<Floor, 'rooms' | 'openings' | 'walls'>) {
    this.grounds = floor.rooms.map((room) => {
      const rim = roomPolygon(room);
      return { room, rim, frame: frameOf(rim), over: [], stops: [], seeded: false };
    });
    this.grounds.forEach((g, i) => {
      g.over = this.grounds
        .slice(i + 1)
        .filter((h) => rectsOverlap(h.frame, g.frame, 0))
        .map((h) => h.rim);
    });
    this.addDoors(floor);
    if (floor.rooms.length > 1) this.addSeams(floor.rooms);
  }

  /* 地面 */

  private topGround(p: XY): Ground | null {
    for (let i = this.grounds.length - 1; i >= 0; i--)
      if (polyHas(this.grounds[i].rim, p[0], p[1])) return this.grounds[i];
    return null;
  }

  private standsOn(g: Ground, p: XY): boolean {
    return polyHas(g.rim, p[0], p[1]) && !g.over.some((o) => polyHas(o, p[0], p[1]));
  }

  /** 在 g 上沿著折線走得過去（每一點都在地面上、不穿過任何外形） */
  private open(g: Ground, ...path: XY[]): boolean {
    if (!path.every((p) => this.standsOn(g, p))) return false;
    for (let i = 1; i < path.length; i++) {
      const seg = [path[i - 1], path[i]];
      if (crossesOutline(seg, g.rim) || g.over.some((o) => crossesOutline(seg, o))) return false;
    }
    return true;
  }

  /* 站點與連線 */

  private place(at: XY, g: Ground): number {
    this.spots.push({ at, ground: g });
    this.legs.push([]);
    g.stops.push(this.spots.length - 1);
    return this.spots.length - 1;
  }

  private tie(a: number, b: number, cost: number, via: XY[]): void {
    this.legs[a].push({ to: b, cost, via });
    this.legs[b].push({ to: a, cost, via: [...via].reverse() });
  }

  /** 同一塊地上從 p 走到 q：太近＝0；走廊的斜線走中線；直走；一個直角的轉彎 */
  private passage(g: Ground, p: XY, q: XY): Passage {
    const rate = LOW_COST_CATS.has(g.room.cat) ? COST_HALL : COST_ROOM;
    if (gap(p, q) < 1e-7) return { cost: 0, via: [] };
    if (g.room.cat === 'hall' && Math.abs(p[0] - q[0]) > 0.1 && Math.abs(p[1] - q[1]) > 0.1) {
      const f = g.frame;
      const wide = f.w >= f.h;
      const line = wide ? f.y + f.h / 2 : f.x + f.w / 2;
      const m1: XY = wide ? [p[0], line] : [line, p[1]];
      const m2: XY = wide ? [q[0], line] : [line, q[1]];
      if (this.open(g, p, m1) && this.open(g, m1, m2) && this.open(g, m2, q))
        return { cost: rate * (gap(p, m1) + gap(m1, m2) + gap(m2, q)), via: [m1, m2] };
    }
    if (this.open(g, p, q)) return { cost: rate * gap(p, q), via: [] };
    const elbows: XY[] = [
      [p[0], q[1]],
      [q[0], p[1]],
    ];
    const elbow = elbows.find((e) => this.open(g, p, e) && this.open(g, e, q));
    return elbow ? { cost: rate * (gap(p, elbow) + gap(elbow, q)), via: [elbow] } : null;
  }

  private connect(g: Ground, a: number, b: number): void {
    const way = this.passage(g, this.spots[a].at, this.spots[b].at);
    if (way) this.tie(a, b, way.cost, way.via);
  }

  /** 經過一個開口（門口、沒有牆的邊）：中心 c、法線 n 的兩側各一點 */
  private doorway(c: XY, n: XY): void {
    const out = (d: number): XY => [c[0] + d * n[0], c[1] + d * n[1]];
    for (const d of DOOR_CLEARANCES) {
      const a = out(-d);
      const b = out(d);
      const ga = this.topGround(a);
      const gb = this.topGround(b);
      if (!ga || !gb || ga === gb || !walkableRoom(ga.room) || !walkableRoom(gb.room)) continue;
      if (!this.open(ga, a, out(-DOOR_LIP)) || !this.open(gb, b, out(DOOR_LIP))) continue;
      const ia = this.place(a, ga);
      const ib = this.place(b, gb);
      this.tie(ia, ib, 2 * d + 0.8, [c]);
      return;
    }
  }

  private addDoors(floor: Pick<Floor, 'rooms' | 'openings' | 'walls'>): void {
    const curved = floor.rooms.some((r) => r.shape);
    const poses = curved ? computeWalls(floor as Floor).poses : null;
    for (const o of floor.openings) {
      if (OPEN[o.kind]?.group !== 'door') continue;
      const n: XY = o.o === 'h' ? [0, 1] : [1, 0];
      const pose = poses?.get(o.id);
      if (!pose) {
        this.doorway(o.o === 'h' ? [o.x + o.len / 2, o.y] : [o.x, o.y + o.len / 2], n);
        continue;
      }
      const cos = Math.cos(pose.rot);
      const sin = Math.sin(pose.rot);
      this.doorway([pose.x, pose.y], [n[0] * cos - n[1] * sin, n[0] * sin + n[1] * cos]);
    }
  }

  /** 沒有牆的邊：格線上兩側是同一對房間、之間沒有牆的連續一段，每 8 格一個通過點 */
  private addSeams(rooms: readonly Room[]): void {
    const owner = pointOwner(rooms);
    const xs = rooms.flatMap((r) => [Math.floor(r.x), Math.ceil(r.x + r.w)]);
    const ys = rooms.flatMap((r) => [Math.floor(r.y), Math.ceil(r.y + r.h)]);
    const lo = { x: Math.min(...xs), y: Math.min(...ys) };
    const hi = { x: Math.max(...xs), y: Math.max(...ys) };
    const crossable = (a: Room | null, b: Room | null): boolean => {
      if (!a || !b || a === b) return false;
      const k = edgeKind(a, b);
      return k === null || k === 'zone';
    };
    /* 先掃橫的格線（沿 x），再掃直的（沿 y） */
    for (const along of ['x', 'y'] as const) {
      const lineAxis = along === 'x' ? 'y' : 'x';
      const probe = (line: number, s: number, d: number): [number, number] =>
        along === 'x' ? [s, line + d] : [line + d, s];
      const n: XY = along === 'x' ? [0, 1] : [1, 0];
      for (let line = lo[lineAxis] + 1; line < hi[lineAxis]; line++) {
        let run: { a: Room; b: Room; from: number } | null = null;
        const close = (end: number) => {
          if (!run) return;
          const len = end - run.from;
          const parts = Math.max(1, Math.ceil(len / SEAM_SPAN));
          for (let k = 0; k < parts; k++) {
            const t = run.from + ((k + 0.5) * len) / parts;
            this.doorway(along === 'x' ? [t, line] : [line, t], n);
          }
          run = null;
        };
        for (let s = lo[along]; s <= hi[along]; s++) {
          const inside = s < hi[along];
          const a = inside ? owner(...probe(line, s + 0.5, -0.5)) : null;
          const b = inside ? owner(...probe(line, s + 0.5, 0.5)) : null;
          const ok = crossable(a, b);
          if (run && (!ok || run.a !== a || run.b !== b)) close(s);
          if (ok && !run && a && b) run = { a, b, from: s };
        }
      }
    }
  }

  /** 地面裡的點：名字的位置、內角、蓋在上面的房間的角（各往外 ±0.32 格），兩兩接起來 */
  private seed(g: Ground): void {
    if (g.seeded) return;
    g.seeded = true;
    const picks: XY[] = [toXY(roomAnchor(g.room))];
    const pad = (p: XY) => {
      for (const dx of [-CORNER_PAD, CORNER_PAD])
        for (const dy of [-CORNER_PAD, CORNER_PAD]) picks.push([p[0] + dx, p[1] + dy]);
    };
    for (const outline of [g.rim, ...g.over]) {
      const own = outline === g.rim;
      const orient = Math.sign(signedArea(outline));
      outline.forEach((p, i) => {
        const prev = outline[(i + outline.length - 1) % outline.length];
        const next = outline[(i + 1) % outline.length];
        const turn = side(prev, p, next);
        if (!isTurn(prev, p, next, turn)) return;
        if (own && turn * orient >= 0) return;
        pad(p);
      });
      if (!own && outline.length > CURVE_VERTICES) {
        const f = frameOf(outline);
        const box: XY[] = [
          [f.x, f.y],
          [f.x + f.w, f.y],
          [f.x + f.w, f.y + f.h],
          [f.x, f.y + f.h],
        ];
        box.forEach(pad);
      }
    }
    for (const p of picks) if (this.standsOn(g, p)) this.place(p, g);
    g.stops.forEach((id, i) => {
      for (const earlier of g.stops.slice(0, i)) this.connect(g, id, earlier);
    });
  }

  /** 從 start 走到 end 的折線（走不到、起點或終點不在能走的地面上時 null） */
  route(start: Pt, end: Pt): Pt[] | null {
    const s = toXY(start);
    const e = toXY(end);
    const ga = this.topGround(s);
    const gb = this.topGround(e);
    if (!ga || !gb || !walkableRoom(ga.room) || !walkableRoom(gb.room)) return null;
    if (!this.standsOn(ga, s) || !this.standsOn(gb, e)) return null;
    for (const g of this.grounds)
      if (walkableRoom(g.room) && (g.stops.length > 1 || g === ga || g === gb)) this.seed(g);
    /* 起點、終點：這一次才有的站點（編號接在後面，不改原本的圖） */
    const n = this.spots.length;
    const S = n;
    const E = n + 1;
    const extra = new Map<number, Leg[]>();
    const add = (from: number, leg: Leg) => {
      const list = extra.get(from) ?? [];
      list.push(leg);
      extra.set(from, list);
    };
    const hook = (id: number, at: XY, g: Ground, others: readonly number[]) => {
      for (const other of others) {
        const way = this.passage(g, at, other === S ? s : this.spots[other].at);
        if (!way) continue;
        add(id, { to: other, cost: way.cost, via: way.via });
        add(other, { to: id, cost: way.cost, via: [...way.via].reverse() });
      }
    };
    hook(S, s, ga, ga.stops);
    hook(E, e, gb, gb === ga ? [...gb.stops, S] : gb.stops);
    const exits = (u: number): Leg[] =>
      u < n ? [...this.legs[u], ...(extra.get(u) ?? [])] : (extra.get(u) ?? []);
    const where = (id: number): XY => (id === S ? s : id === E ? e : this.spots[id].at);
    /* 最短路：還沒定的站點照放進來的順序，每次取代價最小的（一樣時先放進來的） */
    const spent = new Array<number>(n + 2).fill(Number.POSITIVE_INFINITY);
    const back: { from: number; via: XY[] }[] = [];
    const frontier: number[] = [S];
    const queued = new Set<number>([S]);
    spent[S] = 0;
    while (frontier.length) {
      let k = 0;
      for (let i = 1; i < frontier.length; i++) if (spent[frontier[i]] < spent[frontier[k]]) k = i;
      const u = frontier[k];
      if (u === E) break;
      frontier.splice(k, 1);
      queued.delete(u);
      for (const leg of exits(u)) {
        const c = spent[u] + leg.cost;
        if (c >= spent[leg.to]) continue;
        spent[leg.to] = c;
        back[leg.to] = { from: u, via: leg.via };
        if (!queued.has(leg.to)) {
          queued.add(leg.to);
          frontier.push(leg.to);
        }
      }
    }
    if (!Number.isFinite(spent[E])) return null;
    const pieces: XY[][] = [];
    for (let id = E; id !== S; ) {
      const b = back[id];
      if (!b) break;
      pieces.push([...b.via, where(id)]);
      id = b.from;
    }
    const path: XY[] = [s];
    for (let i = pieces.length - 1; i >= 0; i--) path.push(...pieces[i]);
    return straighten(path);
  }
}

/** 拿掉重疊的點與一直線上多的點；只剩 1 點時重複一次；太多或太少時 null */
function straighten(path: readonly XY[]): Pt[] | null {
  const kept: XY[] = [];
  for (const p of path) {
    const last = kept[kept.length - 1];
    if (last && gap(last, p) < 1e-7) continue;
    while (kept.length >= 2) {
      const a = kept[kept.length - 2];
      const b = kept[kept.length - 1];
      const bends = Math.abs(side(a, b, p)) > 1e-8;
      const turnsBack = (b[0] - a[0]) * (p[0] - b[0]) + (b[1] - a[1]) * (p[1] - b[1]) < 0;
      if (bends || turnsBack) break;
      kept.pop();
    }
    kept.push(p);
  }
  if (kept.length === 1) kept.push(kept[0]);
  return kept.length >= 2 && kept.length <= ROUTE_MAX_POINTS ? kept.map(fromXY) : null;
}

/**
 * 一層樓的導航：回傳「從 start 走到 end」的折線（找不到、起點或終點不在能走的房間裡時 null）。
 * 同一層的多次查詢共用門與地面的站點（地面裡的點第一次用到時才放）。
 */
export function floorNavigator(floor: Pick<Floor, 'rooms' | 'openings' | 'walls'>): Navigator {
  const way = new Walkway(floor);
  return (start, end) => way.route(start, end);
}

/** 折線的長度 */
export function pathLength(pts: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++)
    n += Math.hypot(pts[i - 1].x - pts[i].x, pts[i - 1].y - pts[i].y);
  return n;
}

/* ---------- 樓梯 ---------- */

/** 上下樓的點（直的樓梯：前面的平台、往上的在左半、往下的在右半；後面的平台＝到另一層的地方） */
export interface Hub extends Pt {
  kind: LinkKind;
  /** 直的樓梯的後面的平台（其他沒有） */
  landing: Pt | null;
}

/** 連接的一端的上下樓的點（`up`：往上走的那一半；同立體圖的樓梯模型，3.18.3） */
export function linkHub(end: LinkEnd, kind: LinkKind, up: boolean): Hub {
  const it = end.item;
  if (!it || kind !== 'stairs' || linkKind(it.t) !== 'stairs')
    return { x: end.x, y: end.y, kind, landing: null };
  const f = itemFrame(it);
  const width = f.w * 0.86;
  const depth = f.h * 0.84;
  const rad = (f.rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  /* 家具的座標（橫 u、深 v，v 往前為正）轉到平面上 */
  const onPlan = (u: number, v: number): Pt => ({
    x: f.cx + cos * u - sin * v,
    y: f.cy + sin * u + cos * v,
  });
  const lane = (up ? -1 : 1) * (width / 4 + 0.05);
  const front = onPlan(lane, depth / 2 - Math.min(1.16, depth * 0.18) / 2);
  return { ...front, kind, landing: onPlan(lane, -depth / 2 + Math.min(1.56, depth * 0.25)) };
}

/** 經過一座樓梯（或電梯、梯子）換一層：從 from（出發的那一層的上下樓的點）到 to */
export interface BridgeHop {
  link: VerticalLink;
  /** 立體圖的第幾層 → 第幾層 */
  fromLevel: number;
  toLevel: number;
  from: Hub;
  to: Hub;
  /** 走到 from 的路（第一段的出發點 → from） */
  approach: Pt[];
  /** 最後一段：to → 下一條路線的起點 */
  exit: Pt[];
  /** 兩端所在的房間（樓梯間；房間的鍵） */
  rooms: string[];
}

/** 一張地圖的路線計算（每層的導航、上下樓層的連接；立體圖由下往上的樓層） */
export interface RouteContext {
  floors: Floor[];
  /** 樓層 id → 立體圖的第幾層（外觀層 −1） */
  levelOf: (floorId: string) => number;
  links: VerticalLink[];
  nav: (level: number) => Navigator;
  /** 那一層某一點的房間（最上面的那一間） */
  roomAt: (level: number, p: Pt) => Room | null;
}

/** 同一個鍵只算一次 */
function lazily<K, V>(make: (k: K) => V): (k: K) => V {
  const made = new Map<K, V>();
  return (k) => {
    if (!made.has(k)) made.set(k, make(k));
    return made.get(k) as V;
  };
}

export function routeContext(p: Pick<Project, 'floors'>): RouteContext {
  const floors = stackLevels(p.floors).map((l) => l.floor);
  const levels = new Map(floors.map((f, i) => [f.id, i]));
  const nav = lazily((level: number) => floorNavigator(floors[level]));
  const rims = lazily((level: number) => floors[level].rooms.map((r) => roomPolygon(r)));
  return {
    floors,
    levelOf: (id) => levels.get(id) ?? -1,
    links: verticalLinks(floors),
    nav,
    roomAt: (level, q) => {
      const list = rims(level);
      for (let i = list.length - 1; i >= 0; i--)
        if (polyHas(list[i], q.x, q.y)) return floors[level].rooms[i];
      return null;
    },
  };
}

/** 換一層：往上時從下面那一端的上下樓的點出發、到上面那一端；往下相反 */
function hopEnds(link: VerticalLink, up: boolean): { from: Hub; to: Hub } {
  const low = linkHub(link.low, link.kind, true);
  const high = linkHub(link.high, link.kind, false);
  return up ? { from: low, to: high } : { from: high, to: low };
}

/** 一次換層（兩端所在的房間＝樓梯間） */
function makeHop(
  ctx: RouteContext,
  link: VerticalLink,
  up: boolean,
  ends: { from: Hub; to: Hub },
  approach: Pt[],
  exit: Pt[],
): BridgeHop {
  const fromLevel = up ? link.level : link.level + 1;
  const toLevel = up ? link.level + 1 : link.level;
  const rooms: string[] = [];
  const a = ctx.roomAt(fromLevel, ends.from);
  const b = ctx.roomAt(toLevel, ends.to);
  if (a) rooms.push(roomKey(ctx.floors[fromLevel].id, a.id));
  if (b) rooms.push(roomKey(ctx.floors[toLevel].id, b.id));
  return { link, ...ends, fromLevel, toLevel, rooms, approach, exit };
}

/** 換樓層途中的一種走法：現在在哪、走了多遠、每一層走的那一段、經過的連接 */
interface Trail {
  at: Pt;
  spent: number;
  legs: { level: number; pts: Pt[] }[];
  hops: BridgeHop[];
}

/**
 * 從第 from 層一層一層換到第 to 層：每一座連到下一層的連接，從目前的每一種走法走到它的上下樓的點（`walk`），
 * 只留最短的那一種（每一座一種）；最後一次換層之後 `leave` 從連接走到終點（算進長度）。
 * `record`＝經過的連接要記走到它的路（時間軸）還是只記兩端（房間到房間的路線，每一層一段另外記）。
 */
function changeFloors(
  ctx: RouteContext,
  from: number,
  to: number,
  start: Pt,
  walk: (level: number, a: Pt, b: Pt) => Pt[] | null,
  leave: ((level: number, a: Pt) => Pt[] | null) | null,
  record: 'paths' | 'legs',
): Trail[] {
  let trails: Trail[] = [{ at: start, spent: 0, legs: [], hops: [] }];
  const dir = Math.sign(to - from);
  for (let level = from; level !== to; level += dir) {
    const up = dir > 0;
    const boundary = Math.min(level, level + dir);
    const last = level + dir === to;
    const next: Trail[] = [];
    for (const link of ctx.links) {
      if (link.level !== boundary) continue;
      const ends = hopEnds(link, up);
      let best: Trail | null = null;
      for (const t of trails) {
        const path = walk(level, t.at, ends.from);
        if (!path) continue;
        const tail = last && leave ? leave(to, ends.to) : [];
        if (!tail) continue;
        const spent = t.spent + pathLength(path) + pathLength(tail);
        if (best && spent >= best.spent) continue;
        const hop =
          record === 'paths'
            ? makeHop(ctx, link, up, ends, path, tail)
            : makeHop(ctx, link, up, ends, [ends.from], [ends.to]);
        best = {
          at: ends.to,
          spent,
          legs: record === 'legs' ? [...t.legs, { level, pts: path }] : t.legs,
          hops: [...t.hops, hop],
        };
      }
      if (best) next.push(best);
    }
    if (next.length === 0) return [];
    trails = next;
  }
  return trails;
}

/** 最短的那一個（一樣時前面的） */
function cheapest<T extends { spent: number }>(list: readonly T[]): T | null {
  let best: T | null = null;
  for (const t of list) if (!best || t.spent < best.spent) best = t;
  return best;
}

/**
 * 前一條路線的終點（第 fromLevel 層）到這一條的起點（第 toLevel 層）之間經過的樓梯。兩端剛好是某一座樓梯的
 * 上下樓的點（點房間連起來的路線）時就是那一座；不然一層一層換，前後的路線是照門與走廊算的（`structural`）時
 * 走到樓梯的那一段也照門與走廊走，不然直直走。找不到時空的。
 */
export function stairBridge(
  ctx: RouteContext,
  fromLevel: number,
  toLevel: number,
  start: Pt,
  end: Pt,
  structural: boolean,
): BridgeHop[] {
  if (fromLevel < 0 || toLevel < 0 || fromLevel === toLevel) return [];
  const up = toLevel > fromLevel;
  const same = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  if (Math.abs(toLevel - fromLevel) === 1) {
    const boundary = Math.min(fromLevel, toLevel);
    for (const link of ctx.links.filter((l) => l.level === boundary)) {
      const ends = hopEnds(link, up);
      if (same(ends.from, start) && same(ends.to, end))
        return [makeHop(ctx, link, up, ends, [start], [end])];
    }
  }
  const go = (level: number, a: Pt, b: Pt): Pt[] | null => {
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-5) return [b];
    return structural ? ctx.nav(level)(a, b) : [a, b];
  };
  const leave = (level: number, a: Pt) => go(level, a, end);
  return cheapest(changeFloors(ctx, fromLevel, toLevel, start, go, leave, 'paths'))?.hops ?? [];
}

/** 從一間房走到另一間房（可以跨樓層）：每一層一段的折線 */
export interface RoutePlan {
  cost: number;
  legs: { level: number; pts: Pt[] }[];
  hops: BridgeHop[];
}

export function planRoute(
  ctx: RouteContext,
  from: { level: number; room: Room },
  to: { level: number; room: Room },
): RoutePlan | null {
  if (from.level < 0 || to.level < 0) return null;
  const walk = (level: number, a: Pt, b: Pt) => ctx.nav(level)(a, b);
  const trails = changeFloors(ctx, from.level, to.level, roomAnchor(from.room), walk, null, 'legs');
  const goal = roomAnchor(to.room);
  const done = trails.flatMap((t) => {
    const pts = walk(to.level, t.at, goal);
    if (!pts) return [];
    const legs = [...t.legs, { level: to.level, pts }];
    return [{ spent: t.spent + pathLength(pts), legs, hops: t.hops }];
  });
  const best = cheapest(done);
  return best ? { cost: best.spent, legs: best.legs, hops: best.hops } : null;
}

/* ---------- 路線的形狀 ---------- */

const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** 折線上一半長度的那一點（點房間連起來的路線的控制點） */
export function halfwayPoint(pts: readonly Pt[]): Pt {
  let left = pathLength(pts) / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 0 && d >= left) {
      const t = left / d;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= d;
  }
  return { ...pts[pts.length - 1] };
}

/** 照門與走廊算出來的折線 → 一條路線（每層一條；粗細 1.15，原作） */
export function routeFromPath(id: string, floor: string, pts: readonly Pt[]): StageRoute {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const m = halfwayPoint(pts);
  return {
    id,
    floor,
    x1: r3(a.x),
    y1: r3(a.y),
    cx: r3(m.x),
    cy: r3(m.y),
    x2: r3(b.x),
    y2: r3(b.y),
    pts: pts.map((p) => [r3(p.x), r3(p.y)]),
    w: 1.15,
  };
}

/** 路線的點：折線的點（兩端換成起點、終點），自由的曲線（二次曲線）取 n 段 */
export function routePoints(r: StageRoute, n = 32): Pt[] {
  if (r.pts && r.pts.length >= 2) {
    const inner = r.pts.slice(1, -1).map(fromXY);
    return [{ x: r.x1, y: r.y1 }, ...inner, { x: r.x2, y: r.y2 }];
  }
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * r.x1 + 2 * u * t * r.cx + t * t * r.x2,
      y: u * u * r.y1 + 2 * u * t * r.cy + t * t * r.y2,
    };
  });
}

/** 路線碰到這間房：有一點在外形裡，或有一段穿過外形的邊 */
export function routeTouchesRoom(r: StageRoute, room: Room): boolean {
  const pts = (r.pts ? routePoints(r) : routePoints(r, 64)).map(toXY);
  const rim = roomPolygon(room);
  return pts.some(([x, y]) => polyHas(rim, x, y)) || crossesOutline(pts, rim);
}

/**
 * 畫出來的形狀（平面座標的折線）：照門與走廊的折線在轉角圓一點（往前後各縮 min(0.64, 0.4 × 兩邊的長度)，
 * 也不比到房間外形〔`outlines`，`roomPolygon` 的點〕的距離的 0.8 倍近，畫成二次曲線、取 6 段）；自由的曲線取 32 段。
 */
export function routePolyline(r: StageRoute, outlines: readonly (readonly XY[])[] = []): Pt[] {
  if (!r.pts || r.pts.length < 2) return routePoints(r, 32);
  const pts = routePoints(r);
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const p = pts[i];
    const b = pts[i + 1];
    const d1 = Math.hypot(a.x - p.x, a.y - p.y);
    const d2 = Math.hypot(b.x - p.x, b.y - p.y);
    const near = outlines.reduce(
      (m, o) => Math.min(m, polyEdgeDist(o, p.x, p.y)),
      Number.POSITIVE_INFINITY,
    );
    const trim = Math.min(0.64, 0.4 * d1, 0.4 * d2, 0.8 * near);
    if (trim < 0.01) {
      out.push(p);
      continue;
    }
    const s = { x: p.x + ((a.x - p.x) * trim) / d1, y: p.y + ((a.y - p.y) * trim) / d1 };
    const e = { x: p.x + ((b.x - p.x) * trim) / d2, y: p.y + ((b.y - p.y) * trim) / d2 };
    out.push(s);
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const u = 1 - t;
      out.push({
        x: u * u * s.x + 2 * u * t * p.x + t * t * e.x,
        y: u * u * s.y + 2 * u * t * p.y + t * t * e.y,
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 路線的範圍（鏡頭跟隨用：四周 6.4 格，至少 12 × 10 格；原作 3.2 m、6 × 5 m） */
export function routeFocusRect(r: StageRoute): Rect {
  const f = frameOf(routePoints(r, 32).map(toXY));
  const pad = 6.4;
  return {
    x: f.x - pad,
    y: f.y - pad,
    w: Math.max(12, f.w + pad * 2),
    h: Math.max(10, f.h + pad * 2),
  };
}
