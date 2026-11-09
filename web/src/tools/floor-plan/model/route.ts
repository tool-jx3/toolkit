/**
 * 演出的移動路線怎麼走（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的路線演算法；規格 F316、F317、3.19.3）。純函式。
 *
 * - **一層樓裡**（floorNavigator）：每間房是一塊能走的區域（水面、外觀層的屋頂不能走；後面的房間蓋在前面的上面，
 *   巢狀的房間另外算）。區域之間只能經過「門」（門窗分頁的門那一組，含開口、牆上的破洞）與「沒有牆的邊」
 *   （兩間戶外房間之間、不產生牆的分區）。門的兩側各一個點（離牆 0.96／0.44／0.16 格，能放的最遠那一個），
 *   區域裡的點＝名字的位置、L 形的內角與疊在上面的房間的角各往外 0.32 格（角＝轉 20° 以上的頂點：曲線的外形取樣的點
 *   不算，點多的外形另加外接範圍的四個角）；同一塊區域裡兩點之間能直走（不穿過外形）
 *   就連起來，不能時試一個轉角，走廊（玄關・走廊・樓梯）裡的斜線改走走廊的中線。走廊、戶外通道、甲板每格的代價 0.78，
 *   一般的房間 1.3，經過門 2 × 離牆 ＋ 0.8。最短路（Dijkstra）之後拿掉一直線上多的點。原作是公尺，這裡換成格（× 2）。
 * - **跨樓層**：上下樓層的連接（model/stack.ts 的 verticalLinks：樓梯、螺旋梯、電梯、梯子）。直的樓梯的上下樓的點在
 *   前面的平台、往上的在左半、往下的在右半（同立體圖的樓梯模型），後面的平台是到上一層或下一層的地方；其他在中心。
 *   出發的房間到目的的房間：每一層走到樓梯（每一座樓梯只留最近的走法）、換一層再走，最後走到目的的房間（planRoute）。
 *   跨樓層的路線拆成每一層一條。
 * - 圓角的轉折（routePolyline）：轉角往前後各縮 min(0.64, 0.4 × 兩邊的長度)、也不比離牆 0.8 倍近，畫成二次曲線。
 */
import { OPEN } from './catalog';
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
import type { Floor, Project, Rect, Room, StageRoute } from './types';
import { computeWalls, edgeKind, pointOwner } from './walls';

export interface Pt {
  x: number;
  y: number;
}

const pt = (x: number, y: number): Pt => ({ x, y });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

/** 經過門時離牆的距離（格；原作 0.48／0.22／0.08 m） */
const INSETS = [0.96, 0.44, 0.16];
/** 區域裡的轉角往外的距離（格；原作 0.16 m） */
const CORNER = 0.32;
/** 走廊、通道、甲板每格的代價（原作）；一般的房間 */
const HALL_COST = 0.78;
const ROOM_COST = 1.3;
/** 一條路線最多幾個點（原作） */
export const ROUTE_MAX_POINTS = 64;
/** 外形的頂點轉多少才算「角」（曲線的外形取樣的點每個只轉一兩度）；點比這個多的外形當成曲線 */
const CORNER_TURN = Math.sin((20 * Math.PI) / 180);
const CURVE_POINTS = 8;

/** 頂點 p 是角（前後兩邊的方向差 20° 以上；長方形、L 形的頂點都是 90°） */
function isCorner(prev: Pt, p: Pt, next: Pt, turn: number): boolean {
  const a = dist(prev, p);
  const b = dist(p, next);
  if (a < 1e-9 || b < 1e-9) return false;
  const dot = (p.x - prev.x) * (next.x - p.x) + (p.y - prev.y) * (next.y - p.y);
  return dot < 0 || Math.abs(turn) / (a * b) >= CORNER_TURN;
}

/** 點在多邊形裡（射線法；邊上不一定） */
export function inPoly(poly: readonly Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** 兩條線段相交（端點碰到也算，原作） */
function segHit(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y)
  )
    return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}

export const polyOf = (r: Room): Pt[] => roomPolygon(r).map(([x, y]) => pt(x, y));

/** 走廊類（每格的代價低） */
const HALLISH = new Set<Room['cat']>([
  'hall',
  'road',
  'porch',
  'engawa',
  'platform',
  'balcony',
  'rooftop',
  'shipdeck',
]);

/** 能走的房間（水面、外觀層的屋頂不能走） */
export const walkableRoom = (r: Room | null | undefined): boolean =>
  !!r && r.cat !== 'water' && r.cat !== 'roof' && r.floor !== 'water';

/** 房間的「名字的位置」（路線的起點、終點；同房間名牌） */
export function roomAnchor(r: Room): Pt {
  const m = roomMainRect(r);
  return pt(m.x + m.w / 2 + (r.lx || 0), m.y + m.h / 2 + (r.ly || 0));
}

export type Navigator = (start: Pt, end: Pt) => Pt[] | null;

interface Region {
  room: Room;
  poly: Pt[];
  box: Rect;
  /** 自己的外形＋疊在上面、範圍重疊的房間的外形 */
  outlines: Pt[][];
  nodes: number[];
}

interface Edge {
  to: number;
  cost: number;
  via: Pt[];
}

const boxOf = (poly: readonly Pt[]): Rect => {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 兩間房之間沒有牆（能直接走過去）：兩間戶外房間之間、不產生牆的分區 */
const passable = (a: Room, b: Room) => {
  const k = edgeKind(a, b);
  return k === null || k === 'zone';
};

/** 沒有牆的邊每多少格放一個通過點（原作一整段一個；很長的戶外交界放幾個，路線才不會繞到正中間） */
const PASSAGE_SPAN = 8;

/**
 * 一層樓的導航：回傳「從 start 走到 end」的折線（找不到、起點或終點不在能走的房間裡時 null）。
 * 同一層的多次查詢共用門與區域的圖（區域裡的點第一次用到時才建）。
 */
export function floorNavigator(floor: Pick<Floor, 'rooms' | 'openings' | 'walls'>): Navigator {
  const regions: Region[] = floor.rooms.map((room) => {
    const poly = polyOf(room);
    return { room, poly, box: boxOf(poly), outlines: [], nodes: [] };
  });
  for (const [i, r] of regions.entries())
    r.outlines = [
      r.poly,
      ...regions
        .slice(i + 1)
        .filter((q) => overlap(q.box, r.box))
        .map((q) => q.poly),
    ];
  const contains = (r: Region, p: Pt) =>
    inPoly(r.poly, p) && !r.outlines.slice(1).some((poly) => inPoly(poly, p));
  const owner = (p: Pt): Region | null => {
    for (let i = regions.length - 1; i >= 0; i--) if (inPoly(regions[i].poly, p)) return regions[i];
    return null;
  };
  const walkable = (r: Region | null): r is Region => !!r && walkableRoom(r.room);
  const nodes: { p: Pt; region: Region }[] = [];
  const graph: Edge[][] = [];
  const node = (p: Pt, r: Region) => {
    const id = nodes.length;
    nodes.push({ p, region: r });
    graph.push([]);
    r.nodes.push(id);
    return id;
  };
  const edge = (a: number, b: number, cost: number, via: Pt[] = []) => {
    graph[a].push({ to: b, cost, via });
    graph[b].push({ to: a, cost, via: [...via].reverse() });
  };
  const clear = (r: Region, p: Pt, q: Pt) => {
    if (!contains(r, p) || !contains(r, q)) return false;
    for (const poly of r.outlines)
      for (let i = 0; i < poly.length; i++)
        if (segHit(p, q, poly[i], poly[(i + 1) % poly.length])) return false;
    return true;
  };
  const portal = (center: Pt, n: Pt) => {
    for (const inset of INSETS) {
      const a = pt(center.x - inset * n.x, center.y - inset * n.y);
      const b = pt(center.x + inset * n.x, center.y + inset * n.y);
      const ra = owner(a);
      const rb = owner(b);
      if (!walkable(ra) || !walkable(rb) || ra === rb) continue;
      const nearA = pt(center.x - n.x * 0.002, center.y - n.y * 0.002);
      const nearB = pt(center.x + n.x * 0.002, center.y + n.y * 0.002);
      if (!clear(ra, a, nearA) || !clear(rb, b, nearB)) continue;
      edge(node(a, ra), node(b, rb), 2 * inset + 0.8, [center]);
      return;
    }
  };
  /* 門（門窗分頁的「門」那一組）：放在曲線上的照曲線上的位置與方向 */
  const poses = floor.rooms.some((r) => r.shape)
    ? computeWalls(floor as Floor).poses
    : new Map<string, { x: number; y: number; rot: number }>();
  for (const o of floor.openings) {
    if (OPEN[o.kind]?.group !== 'door') continue;
    const pose = poses.get(o.id);
    const base = o.o === 'h' ? pt(0, 1) : pt(1, 0);
    if (pose) {
      const c = Math.cos(pose.rot);
      const s = Math.sin(pose.rot);
      portal(pt(pose.x, pose.y), pt(base.x * c - base.y * s, base.x * s + base.y * c));
    } else portal(o.o === 'h' ? pt(o.x + o.len / 2, o.y) : pt(o.x, o.y + o.len / 2), base);
  }
  /* 沒有牆的邊（兩間戶外房間之間、不產生牆的分區）：格線上兩側是不同的房間、而且之間沒有牆的段 */
  if (floor.rooms.length > 1) {
    const own = pointOwner(floor.rooms);
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const r of floor.rooms) {
      x0 = Math.min(x0, Math.floor(r.x));
      y0 = Math.min(y0, Math.floor(r.y));
      x1 = Math.max(x1, Math.ceil(r.x + r.w));
      y1 = Math.max(y1, Math.ceil(r.y + r.h));
    }
    const emit = (horizontal: boolean, line: number, from: number, to: number) => {
      const len = to - from;
      const parts = Math.max(1, Math.ceil(len / PASSAGE_SPAN));
      for (let k = 0; k < parts; k++) {
        const t = from + ((k + 0.5) * len) / parts;
        portal(horizontal ? pt(t, line) : pt(line, t), horizontal ? pt(0, 1) : pt(1, 0));
      }
    };
    const scan = (horizontal: boolean) => {
      const [l0, l1, s0, s1] = horizontal ? [y0, y1, x0, x1] : [x0, x1, y0, y1];
      for (let line = l0 + 1; line < l1; line++) {
        let run: { a: Room; b: Room; from: number } | null = null;
        for (let s = s0; s <= s1; s++) {
          let a: Room | null = null;
          let b: Room | null = null;
          if (s < s1) {
            a = horizontal ? own(s + 0.5, line - 0.5) : own(line - 0.5, s + 0.5);
            b = horizontal ? own(s + 0.5, line + 0.5) : own(line + 0.5, s + 0.5);
          }
          const ok = !!a && !!b && a !== b && passable(a, b);
          if (run && (!ok || run.a !== a || run.b !== b)) {
            emit(horizontal, line, run.from, s);
            run = null;
          }
          if (ok && !run && a && b) run = { a, b, from: s };
        }
      }
    };
    scan(true);
    scan(false);
  }
  const insideEdge = (r: Region, a: number, b: number) => {
    const p = nodes[a].p;
    const q = nodes[b].p;
    const weight = HALLISH.has(r.room.cat) ? HALL_COST : ROOM_COST;
    if (dist(p, q) < 1e-7) {
      edge(a, b, 0);
      return;
    }
    /* 走廊的斜線改走中線（原作） */
    if (r.room.cat === 'hall' && Math.abs(p.x - q.x) > 0.1 && Math.abs(p.y - q.y) > 0.1) {
      const across = r.box.w >= r.box.h;
      const mid = across ? r.box.y + r.box.h / 2 : r.box.x + r.box.w / 2;
      const axis = across ? [pt(p.x, mid), pt(q.x, mid)] : [pt(mid, p.y), pt(mid, q.y)];
      if (clear(r, p, axis[0]) && clear(r, axis[0], axis[1]) && clear(r, axis[1], q)) {
        edge(a, b, weight * (dist(p, axis[0]) + dist(axis[0], axis[1]) + dist(axis[1], q)), axis);
        return;
      }
    }
    if (clear(r, p, q)) {
      edge(a, b, weight * dist(p, q));
      return;
    }
    for (const bend of [pt(p.x, q.y), pt(q.x, p.y)])
      if (clear(r, p, bend) && clear(r, bend, q)) {
        edge(a, b, weight * (dist(p, bend) + dist(bend, q)), [bend]);
        return;
      }
  };
  /* 區域裡的點：名字的位置、內角與疊在上面的房間的角各往外一點（不必依地圖的大小鋪格子） */
  const built = new Set<Region>();
  const buildInterior = (r: Region) => {
    if (built.has(r)) return;
    built.add(r);
    const cands = [roomAnchor(r.room)];
    const around = (p: Pt) => {
      for (const dx of [-CORNER, CORNER])
        for (const dy of [-CORNER, CORNER]) cands.push(pt(p.x + dx, p.y + dy));
    };
    for (const poly of r.outlines) {
      const area = poly.reduce((s, v, i) => {
        const w = poly[(i + 1) % poly.length];
        return s + v.x * w.y - v.y * w.x;
      }, 0);
      const winding = Math.sign(area);
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const prev = poly[(i + poly.length - 1) % poly.length];
        const next = poly[(i + 1) % poly.length];
        const turn = cross(prev, p, next);
        if (!isCorner(prev, p, next, turn)) continue;
        if (poly === r.poly && turn * winding >= 0) continue;
        around(p);
      }
      /* 點多的外形（曲線）：疊在上面的房間另加外接範圍的四個角（繞過去用） */
      if (poly !== r.poly && poly.length > CURVE_POINTS) {
        const b = boxOf(poly);
        for (const p of [
          pt(b.x, b.y),
          pt(b.x + b.w, b.y),
          pt(b.x + b.w, b.y + b.h),
          pt(b.x, b.y + b.h),
        ])
          around(p);
      }
    }
    for (const p of cands) if (contains(r, p)) node(p, r);
    for (let i = 0; i < r.nodes.length; i++)
      for (let j = 0; j < i; j++) insideEdge(r, r.nodes[i], r.nodes[j]);
  };
  return (start, end) => {
    const ra = owner(start);
    const rb = owner(end);
    if (!walkable(ra) || !walkable(rb) || !contains(ra, start) || !contains(rb, end)) return null;
    for (const r of regions)
      if (walkable(r) && (r.nodes.length > 1 || r === ra || r === rb)) buildInterior(r);
    const size = nodes.length;
    const endpoint = (p: Pt, r: Region) => {
      const id = node(p, r);
      for (const other of r.nodes) if (other !== id) insideEdge(r, id, other);
      return id;
    };
    const first = endpoint(start, ra);
    const last = endpoint(end, rb);
    const best = nodes.map(() => Number.POSITIVE_INFINITY);
    const prev: ({ id: number; via: Pt[] } | undefined)[] = [];
    const pending = new Set([first]);
    best[first] = 0;
    while (pending.size) {
      let u = -1;
      for (const id of pending) if (u < 0 || best[id] < best[u]) u = id;
      if (u === last) break;
      pending.delete(u);
      for (const e of graph[u])
        if (best[u] + e.cost < best[e.to]) {
          best[e.to] = best[u] + e.cost;
          prev[e.to] = { id: u, via: e.via };
          pending.add(e.to);
        }
    }
    const path: Pt[] = [];
    if (Number.isFinite(best[last])) {
      let id = last;
      path.push(nodes[id].p);
      while (id !== first) {
        const e = prev[id];
        if (!e) break;
        path.push(...[...e.via].reverse(), nodes[e.id].p);
        id = e.id;
      }
      path.reverse();
    }
    /* 拿掉這次查詢加的兩個端點 */
    for (const id of [last, first]) {
      for (const e of graph[id]) graph[e.to] = graph[e.to].filter((x) => x.to !== id);
      nodes[id].region.nodes.pop();
    }
    graph.length = size;
    nodes.length = size;
    return simplify(path);
  };
}

/** 拿掉重複的點與一直線上多的點（原作）；1 點時重複一次；太多或太少時 null */
function simplify(path: readonly Pt[]): Pt[] | null {
  const out: Pt[] = [];
  for (const p of path) {
    if (out.length && dist(out[out.length - 1], p) < 1e-7) continue;
    while (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      if (
        Math.abs(cross(a, b, p)) > 1e-8 ||
        (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) < 0
      )
        break;
      out.pop();
    }
    out.push(pt(p.x, p.y));
  }
  if (out.length === 1) out.push({ ...out[0] });
  return out.length >= 2 && out.length <= ROUTE_MAX_POINTS ? out : null;
}

/** 折線的長度 */
export function pathLength(pts: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += dist(pts[i - 1], pts[i]);
  return n;
}

/* ---------- 樓梯 ---------- */

/** 上下樓的點（直的樓梯：前面的平台、往上的在左半、往下的在右半；後面的平台＝到另一層的地方） */
export interface Hub extends Pt {
  kind: LinkKind;
  /** 直的樓梯的後面的平台（其他沒有） */
  landing: Pt | null;
}

/** 連接的一端的上下樓的點（`up`：往上走的那一半；原作的 hubs） */
export function linkHub(end: LinkEnd, kind: LinkKind, up: boolean): Hub {
  const it = end.item;
  if (!it || kind !== 'stairs' || linkKind(it.t) !== 'stairs')
    return { x: end.x, y: end.y, kind, landing: null };
  const f = itemFrame(it);
  const w = f.w * 0.86;
  const h = f.h * 0.84;
  const rad = (f.rot * Math.PI) / 180;
  const at = (u: number, v: number) =>
    pt(f.cx + Math.cos(rad) * u - Math.sin(rad) * v, f.cy + Math.sin(rad) * u + Math.cos(rad) * v);
  const u = (up ? -1 : 1) * (w / 4 + 0.05);
  const front = at(u, h / 2 - Math.min(1.16, h * 0.18) / 2);
  return { ...front, kind, landing: at(u, -h / 2 + Math.min(1.56, h * 0.25)) };
}

/** 經過一座樓梯（或電梯、梯子）換一層：從 from（出發的那一層的上下樓的點）到 to */
export interface BridgeHop {
  link: VerticalLink;
  /** 立體圖的第幾層 → 第幾層 */
  fromLevel: number;
  toLevel: number;
  from: Hub;
  to: Hub;
  /** 走到 from 的路（第一段的出發點 → from；原作的 approach） */
  approach: Pt[];
  /** 最後一段：to → 下一條路線的起點（原作的 exitPath） */
  exit: Pt[];
  /** 兩端所在的房間（樓梯間；`floorId/roomId`） */
  rooms: string[];
}

/** 房間的鍵（樓層 id＋房間 id；中間是不會出現在 id 裡的控制字元） */
export const roomKey = (floor: string, room: string): string => `${floor}\u0001${room}`;
/** 鍵 → 樓層 id、房間 id */
export function splitRoomKey(key: string): { floor: string; room: string } {
  const i = key.indexOf('\u0001');
  return { floor: key.slice(0, i), room: key.slice(i + 1) };
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

export function routeContext(p: Pick<Project, 'floors'>): RouteContext {
  const floors = stackLevels(p.floors).map((l) => l.floor);
  const index = new Map(floors.map((f, i) => [f.id, i]));
  const navs = new Map<number, Navigator>();
  const owners = new Map<number, (x: number, y: number) => Room | null>();
  return {
    floors,
    levelOf: (id) => index.get(id) ?? -1,
    links: verticalLinks(floors),
    nav: (level) => {
      let n = navs.get(level);
      if (!n) {
        n = floorNavigator(floors[level]);
        navs.set(level, n);
      }
      return n;
    },
    roomAt: (level, q) => {
      let o = owners.get(level);
      if (!o) {
        const rooms = floors[level].rooms;
        o = (x, y) => {
          for (let i = rooms.length - 1; i >= 0; i--)
            if (inPoly(polyOf(rooms[i]), pt(x, y))) return rooms[i];
          return null;
        };
        owners.set(level, o);
      }
      return o(q.x, q.y);
    },
  };
}

/** 從第 level 層走到上一層／下一層的連接：進去的點、出來的點 */
function hopEnds(link: VerticalLink, up: boolean): { from: Hub; to: Hub } {
  const low = linkHub(link.low, link.kind, true);
  const high = linkHub(link.high, link.kind, false);
  return up ? { from: low, to: high } : { from: high, to: low };
}

function hopRooms(
  ctx: RouteContext,
  link: VerticalLink,
  up: boolean,
  ends: { from: Hub; to: Hub },
) {
  const fromLevel = up ? link.level : link.level + 1;
  const toLevel = up ? link.level + 1 : link.level;
  const out: string[] = [];
  const a = ctx.roomAt(fromLevel, ends.from);
  const b = ctx.roomAt(toLevel, ends.to);
  if (a) out.push(roomKey(ctx.floors[fromLevel].id, a.id));
  if (b) out.push(roomKey(ctx.floors[toLevel].id, b.id));
  return { fromLevel, toLevel, rooms: out };
}

/**
 * 前一條路線的終點（第 fromLevel 層）到這一條的起點（第 toLevel 層）之間經過的樓梯（原作的 stairRouteLinks）。
 * 前後的路線是照門與走廊算出來的（`structural`）時，走到樓梯的那一段也照門與走廊走；不然直直走。找不到時空的。
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
  /* 點房間連起來的路線：兩端剛好是某一座樓梯的上下樓的點 */
  if (Math.abs(toLevel - fromLevel) === 1) {
    const low = Math.min(fromLevel, toLevel);
    for (const link of ctx.links) {
      if (link.level !== low) continue;
      const ends = hopEnds(link, up);
      if (dist(ends.from, start) < 1e-6 && dist(ends.to, end) < 1e-6)
        return [
          { link, ...ends, ...hopRooms(ctx, link, up, ends), approach: [start], exit: [end] },
        ];
    }
  }
  const step = up ? 1 : -1;
  const approach = (level: number, p: Pt, q: Pt): Pt[] | null => {
    if (dist(p, q) < 1e-5) return [q];
    if (!structural) return [p, q];
    return ctx.nav(level)(p, q);
  };
  let states: { point: Pt; cost: number; hops: BridgeHop[] }[] = [
    { point: start, cost: 0, hops: [] },
  ];
  for (let i = fromLevel; i !== toLevel; i += step) {
    const low = Math.min(i, i + step);
    const next: typeof states = [];
    for (const link of ctx.links) {
      if (link.level !== low) continue;
      const ends = hopEnds(link, up);
      let best: (typeof states)[number] | null = null;
      for (const st of states) {
        const path = approach(i, st.point, ends.from);
        if (!path) continue;
        const exit = i + step === toLevel ? approach(toLevel, ends.to, end) : [];
        if (!exit) continue;
        const cost = st.cost + pathLength(path) + pathLength(exit);
        if (!best || cost < best.cost)
          best = {
            point: ends.to,
            cost,
            hops: [
              ...st.hops,
              { link, ...ends, ...hopRooms(ctx, link, up, ends), approach: path, exit },
            ],
          };
      }
      if (best) next.push(best);
    }
    if (!next.length) return [];
    states = next;
  }
  states.sort((a, b) => a.cost - b.cost);
  return states[0].hops;
}

/** 從一間房走到另一間房（可以跨樓層）：每一層一段的折線（原作的 scenarioPlanner） */
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
  let states: { point: Pt; cost: number; legs: RoutePlan['legs']; hops: BridgeHop[] }[] = [
    { point: roomAnchor(from.room), cost: 0, legs: [], hops: [] },
  ];
  const step = Math.sign(to.level - from.level);
  for (let i = from.level; i !== to.level; i += step) {
    const low = Math.min(i, i + step);
    const up = step > 0;
    const next: typeof states = [];
    for (const link of ctx.links) {
      if (link.level !== low) continue;
      const ends = hopEnds(link, up);
      let best: (typeof states)[number] | null = null;
      for (const st of states) {
        const pts = ctx.nav(i)(st.point, ends.from);
        if (!pts) continue;
        const cost = st.cost + pathLength(pts);
        if (!best || cost < best.cost)
          best = {
            point: ends.to,
            cost,
            legs: [...st.legs, { level: i, pts }],
            hops: [
              ...st.hops,
              {
                link,
                ...ends,
                ...hopRooms(ctx, link, up, ends),
                approach: [ends.from],
                exit: [ends.to],
              },
            ],
          };
      }
      if (best) next.push(best);
    }
    if (!next.length) return null;
    states = next;
  }
  let best: RoutePlan | null = null;
  for (const st of states) {
    const pts = ctx.nav(to.level)(st.point, roomAnchor(to.room));
    if (!pts) continue;
    const cost = st.cost + pathLength(pts);
    if (!best || cost < best.cost)
      best = { cost, legs: [...st.legs, { level: to.level, pts }], hops: st.hops };
  }
  return best;
}

/* ---------- 路線的形狀 ---------- */

const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** 折線上一半長度的那一點（點房間連起來的路線的控制點） */
export function halfwayPoint(pts: readonly Pt[]): Pt {
  const total = pathLength(pts);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (d >= left && d > 0) {
      const t = left / d;
      return pt(
        pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      );
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

/** 路線的點：折線的點，自由的曲線取 n 段 */
export function routePoints(r: StageRoute, n = 32): Pt[] {
  if (r.pts && r.pts.length >= 2) {
    const pts = r.pts.map(([x, y]) => pt(x, y));
    pts[0] = pt(r.x1, r.y1);
    pts[pts.length - 1] = pt(r.x2, r.y2);
    return pts;
  }
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      pt(
        u * u * r.x1 + 2 * u * t * r.cx + t * t * r.x2,
        u * u * r.y1 + 2 * u * t * r.cy + t * t * r.y2,
      ),
    );
  }
  return out;
}

/** 路線碰到這間房（有一點在裡面，或穿過它的外形；原作的 lineTouchesRoomPoly） */
export function routeTouchesRoom(r: StageRoute, room: Room): boolean {
  const pts = r.pts ? routePoints(r) : routePoints(r, 64);
  const poly = polyOf(room);
  if (pts.some((p) => inPoly(poly, p))) return true;
  for (let i = 1; i < pts.length; i++)
    for (let j = 0; j < poly.length; j++)
      if (segHit(pts[i - 1], pts[i], poly[j], poly[(j + 1) % poly.length])) return true;
  return false;
}

/**
 * 畫出來的形狀（平面座標的折線）：照門與走廊的折線在轉角圓一點（往前後各縮 min(0.64, 0.4 × 兩邊的長度)，
 * 也不比離房間外形的距離的 0.8 倍近，畫成二次曲線、取 6 段）；自由的曲線取 32 段。
 */
export function routePolyline(r: StageRoute, outlines: readonly (readonly Pt[])[] = []): Pt[] {
  if (!r.pts || r.pts.length < 2) return routePoints(r, 32);
  const pts = routePoints(r);
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    const d1 = dist(a, p);
    const d2 = dist(b, p);
    let trim = Math.min(0.64, 0.4 * d1, 0.4 * d2);
    for (const poly of outlines)
      for (let k = 0; k < poly.length; k++) {
        const u = poly[k];
        const v = poly[(k + 1) % poly.length];
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const t = Math.min(
          1,
          Math.max(0, ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy || 1)),
        );
        trim = Math.min(trim, 0.8 * Math.hypot(p.x - u.x - dx * t, p.y - u.y - dy * t));
      }
    if (trim < 0.01) {
      out.push(p);
      continue;
    }
    const s = pt(p.x + ((a.x - p.x) * trim) / d1, p.y + ((a.y - p.y) * trim) / d1);
    const e = pt(p.x + ((b.x - p.x) * trim) / d2, p.y + ((b.y - p.y) * trim) / d2);
    out.push(s);
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const u = 1 - t;
      out.push(
        pt(
          u * u * s.x + 2 * u * t * p.x + t * t * e.x,
          u * u * s.y + 2 * u * t * p.y + t * t * e.y,
        ),
      );
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 路線的範圍（鏡頭跟隨用：四周 6.4 格，至少 12 × 10 格；原作 3.2 m、6 × 5 m） */
export function routeFocusRect(r: StageRoute): Rect {
  const pts = routePoints(r, 32);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  const pad = 6.4;
  return { x: x - pad, y: y - pad, w: Math.max(12, w + pad * 2), h: Math.max(10, h + pad * 2) };
}
