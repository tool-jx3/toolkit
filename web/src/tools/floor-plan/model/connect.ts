/**
 * 連接兩個房間（2026-10-29，參考 KIIN マップ制作スタジオ；規格 F250～F252、3.14.2、D67）。純函式：算出要加的門或走廊，
 * 呼叫端（editor/actions.ts）一次加進去（一步復原）。
 *
 * - 有共用的牆：在共用的牆上放一扇單開門（1.5 格；共用的牆比較短時用那個長度，至少 1 格），從牆段的中點往兩邊找
 *   第一個不壓到門窗、不跨過垂直的牆、開門的範圍與門前一格沒有家具的位置；門往比較大的那一間開（走廊類不當開門的那一側）；
 *   單開門放不下時試拉門。
 * - 沒有共用的牆：畫一條 3 格寬的直的或 L 形走廊（一個轉角），經過的格子沒有房間、不壓到擋路的家具與手畫的牆，
 *   兩端整個貼在兩間房間的外牆上；取面積最小的，兩端各放一扇門（往房間那一側開）。
 */
import { isWallMounted } from './assets';
import { round2, snap, uid } from './geometry';
import { blocking, doorKinds, EPS, hitsDoor, rectHits } from './layoutRules';
import { roomCellArea, roomCells, shapeFromRects } from './shape';
import type { Floor, Opening, OpeningKind, Rect, Room, RoomCut } from './types';
import { edgeKind, wallLines } from './walls';

/** 門的寬度（格；0.75 m）、最短（0.5 m） */
export const DOOR_LEN = 1.5;
export const DOOR_MIN = 1;
/** 走廊的寬度（格；1.5 m） */
export const CORRIDOR_WIDTH = 3;

export type ConnectFail =
  | 'notTwo'
  | 'same'
  | 'noWall'
  | 'connected'
  | 'short'
  | 'blocked'
  | 'noRoute';

export type ConnectResult =
  | { ok: true; kind: 'door'; openings: Opening[] }
  | { ok: true; kind: 'corridor'; room: Room; openings: Opening[]; length: number }
  | { ok: false; reason: ConnectFail; doorId?: string };

type Owner = Map<string, number>;
const key = (x: number, y: number) => `${x},${y}`;

interface Seg {
  o: 'h' | 'v';
  c: number;
  a: number;
  b: number;
}

/** 每一格的主人（最後一個蓋上去的房間的索引；同自動牆） */
function ownerMap(rooms: readonly Room[]): Owner {
  const m: Owner = new Map();
  rooms.forEach((r, i) => {
    for (const [x, y] of roomCells(r)) m.set(key(x, y), i);
  });
  return m;
}

/** 單位邊合成一段一段（同一條線上相連的接起來） */
function merge(units: Seg[]): Seg[] {
  const byLine = new Map<string, Seg[]>();
  for (const u of units) {
    const k = `${u.o}:${u.c}`;
    const l = byLine.get(k);
    if (l) l.push(u);
    else byLine.set(k, [u]);
  }
  const out: Seg[] = [];
  for (const list of byLine.values()) {
    list.sort((p, q) => p.a - q.a);
    let cur = { ...list[0] };
    for (const s of list.slice(1)) {
      if (s.a <= cur.b + EPS) cur.b = Math.max(cur.b, s.b);
      else {
        out.push(cur);
        cur = { ...s };
      }
    }
    out.push(cur);
  }
  return out;
}

/** 兩間房間（索引）之間的共用邊 */
function sharedSegs(owner: Owner, rooms: readonly Room[], ia: number, ib: number): Seg[] {
  const units: Seg[] = [];
  for (const [x, y] of roomCells(rooms[ia])) {
    if (owner.get(key(x, y)) !== ia) continue;
    if (owner.get(key(x + 1, y)) === ib) units.push({ o: 'v', c: x + 1, a: y, b: y + 1 });
    if (owner.get(key(x - 1, y)) === ib) units.push({ o: 'v', c: x, a: y, b: y + 1 });
    if (owner.get(key(x, y + 1)) === ib) units.push({ o: 'h', c: y + 1, a: x, b: x + 1 });
    if (owner.get(key(x, y - 1)) === ib) units.push({ o: 'h', c: y, a: x, b: x + 1 });
  }
  return merge(units);
}

/** 從中間往兩邊：起點的候選（0.25 格一步） */
function startsFromCenter(a: number, b: number, len: number): number[] {
  const lo = a;
  const hi = b - len;
  if (hi < lo - EPS) return [];
  const mid = Math.min(Math.max(snap((a + b) / 2 - len / 2, 0.25), lo), hi);
  const out = [mid];
  for (let d = 0.25; mid - d >= lo - EPS || mid + d <= hi + EPS; d += 0.25) {
    if (mid - d >= lo - EPS) out.push(round2(mid - d));
    if (mid + d <= hi + EPS) out.push(round2(mid + d));
  }
  return out;
}

/**
 * 在共用的邊上放一扇門：segs＝共用的邊、into＝門往哪一間開（索引）。找不到時 null。
 * 規則同範本的格局檢查：不壓到同一條線上的門窗、不跨過垂直接上來的牆（F212）、開門的範圍與門前一格沒有擋路的家具（F194）。
 */
function placeDoor(
  floor: Pick<Floor, 'rooms' | 'walls' | 'openings' | 'items'>,
  owner: Owner,
  segs: readonly Seg[],
  into: number,
): Opening | null {
  const lines = wallLines(floor);
  const blockers = floor.items.filter(blocking);
  const sorted = [...segs].sort((p, q) => q.b - q.a - (p.b - p.a) || p.c - q.c || p.a - q.a);
  for (const seg of sorted) {
    const len0 = seg.b - seg.a;
    if (len0 < DOOR_MIN - EPS) continue;
    const len = Math.min(DOOR_LEN, len0);
    const junctions = lines
      .filter((r) => r.o !== seg.o && r.a <= seg.c + EPS && r.b >= seg.c - EPS)
      .map((r) => r.c);
    const others = floor.openings
      .filter((op) => op.o === seg.o && Math.abs((op.o === 'h' ? op.y : op.x) - seg.c) < EPS)
      .map((op) => [op.o === 'h' ? op.x : op.y, (op.o === 'h' ? op.x : op.y) + op.len] as const);
    for (const start of startsFromCenter(seg.a, seg.b, len)) {
      if (others.some(([a, b]) => a < start + len - EPS && start < b - EPS)) continue;
      if (junctions.some((j) => j > start + EPS && j < start + len - EPS)) continue;
      /* 門往 into 那一間開：+ 側（橫線的下面、直線的右邊）的格子是不是那一間 */
      const mid = Math.floor(start + len / 2);
      const plus = seg.o === 'h' ? owner.get(key(mid, seg.c)) : owner.get(key(seg.c, mid));
      const pref: 1 | -1 = plus === into ? 1 : -1;
      for (const kind of ['door', 'sliding'] as OpeningKind[])
        for (const side of [pref, -pref as 1 | -1])
          for (const hinge of kind === 'door' ? ([0, 1] as const) : ([0] as const)) {
            const o: Opening = {
              id: uid('o'),
              kind,
              o: seg.o,
              x: seg.o === 'h' ? start : seg.c,
              y: seg.o === 'h' ? seg.c : start,
              len,
              side,
              hinge,
            };
            if (!blockers.some((it) => hitsDoor(o, it))) return o;
          }
    }
  }
  return null;
}

/** 門往哪一間開：走廊類不當開門的那一側；都不是（或都是）時比較大的那一間 */
function swingInto(rooms: readonly Room[], ia: number, ib: number): number {
  const ha = rooms[ia].cat === 'hall';
  const hb = rooms[ib].cat === 'hall';
  if (ha !== hb) return ha ? ib : ia;
  return roomCellArea(rooms[ib]) > roomCellArea(rooms[ia]) ? ib : ia;
}

/* ---------- 走廊 ---------- */

/** 格子順時針轉 90°：(x, y) → (−y−1, x)；長方形轉回去（逆時針） */
const rotCell = (x: number, y: number): [number, number] => [-y - 1, x];
const unrotRect = (r: Rect): Rect => ({ x: r.y, y: -(r.x + r.w), w: r.h, h: r.w });

interface Candidate {
  rects: Rect[];
  area: number;
  straight: boolean;
  /** 偏離兩間房間的共同範圍中間多少（越小越好） */
  off: number;
}

/** 某個方向的邊（east：格子的右邊外面沒有房間） */
function facing(owner: Owner, idx: number, dir: 'e' | 'w' | 'n' | 's'): Seg[] {
  const units: Seg[] = [];
  for (const [k, v] of owner) {
    if (v !== idx) continue;
    const [x, y] = k.split(',').map(Number);
    if (dir === 'e' && !owner.has(key(x + 1, y))) units.push({ o: 'v', c: x + 1, a: y, b: y + 1 });
    if (dir === 'w' && !owner.has(key(x - 1, y))) units.push({ o: 'v', c: x, a: y, b: y + 1 });
    if (dir === 's' && !owner.has(key(x, y + 1))) units.push({ o: 'h', c: y + 1, a: x, b: x + 1 });
    if (dir === 'n' && !owner.has(key(x, y - 1))) units.push({ o: 'h', c: y, a: x, b: x + 1 });
  }
  return merge(units);
}

/** 長方形的格子都沒有房間 */
function free(owner: Owner, r: Rect): boolean {
  for (let x = r.x; x < r.x + r.w; x++)
    for (let y = r.y; y < r.y + r.h; y++) if (owner.has(key(x, y))) return false;
  return true;
}

/** 在旋轉過的座標裡：A 的東邊往外，直的接到 B 的西邊，或轉一次彎接到 B 的北邊／南邊 */
function candidatesIn(owner: Owner, ia: number, ib: number, wd: number): Candidate[] {
  const out: Candidate[] = [];
  const east = facing(owner, ia, 'e');
  const west = facing(owner, ib, 'w');
  const north = facing(owner, ib, 'n');
  const south = facing(owner, ib, 's');
  for (const sa of east) {
    for (const sb of west) {
      if (sb.c <= sa.c) continue;
      const lo = Math.max(sa.a, sb.a);
      const hi = Math.min(sa.b, sb.b);
      const mid = (lo + hi) / 2;
      for (let t = lo; t + wd <= hi; t++) {
        const r = { x: sa.c, y: t, w: sb.c - sa.c, h: wd };
        out.push({ rects: [r], area: r.w * r.h, straight: true, off: Math.abs(t + wd / 2 - mid) });
      }
    }
    for (let t = sa.a; t + wd <= sa.b; t++) {
      for (const sb of north) {
        /* B 在下面：橫的一段 y∈[t, t+wd]，直的一段 x∈[u, u+wd] 往下接到 B 的北邊（y＝sb.c） */
        if (sb.c < t + wd + 1) continue;
        for (let u = Math.max(sb.a, sa.c + 1); u + wd <= sb.b; u++) {
          const arm1 = { x: sa.c, y: t, w: u + wd - sa.c, h: wd };
          const arm2 = { x: u, y: t + wd, w: wd, h: sb.c - (t + wd) };
          out.push({
            rects: [arm1, arm2],
            area: arm1.w * arm1.h + arm2.w * arm2.h,
            straight: false,
            off:
              Math.abs(u + wd / 2 - (sb.a + sb.b) / 2) + Math.abs(t + wd / 2 - (sa.a + sa.b) / 2),
          });
        }
      }
      for (const sb of south) {
        /* B 在上面：直的一段往上接到 B 的南邊（y＝sb.c） */
        if (sb.c > t - 1) continue;
        for (let u = Math.max(sb.a, sa.c + 1); u + wd <= sb.b; u++) {
          const arm1 = { x: sa.c, y: t, w: u + wd - sa.c, h: wd };
          const arm2 = { x: u, y: sb.c, w: wd, h: t - sb.c };
          out.push({
            rects: [arm1, arm2],
            area: arm1.w * arm1.h + arm2.w * arm2.h,
            straight: false,
            off:
              Math.abs(u + wd / 2 - (sb.a + sb.b) / 2) + Math.abs(t + wd / 2 - (sa.a + sa.b) / 2),
          });
        }
      }
    }
  }
  return out.filter((c) => c.rects.every((r) => r.w >= 1 && r.h >= 1 && free(owner, r)));
}

/** 四個方向都試（把整張圖轉 0～3 次，A 的那一邊都轉成東邊），長方形轉回原本的座標 */
function corridorCandidates(owner: Owner, ia: number, ib: number, wd: number): Candidate[] {
  const all: Candidate[] = [];
  let m = owner;
  for (let k = 0; k < 4; k++) {
    for (const c of candidatesIn(m, ia, ib, wd)) {
      let rects = c.rects;
      for (let j = 0; j < k; j++) rects = rects.map(unrotRect);
      all.push({ ...c, rects });
    }
    const next: Owner = new Map();
    for (const [kk, v] of m) {
      const [x, y] = kk.split(',').map(Number);
      const [rx, ry] = rotCell(x, y);
      next.set(key(rx, ry), v);
    }
    m = next;
  }
  return all.sort(
    (p, q) =>
      p.area - q.area ||
      Number(q.straight) - Number(p.straight) ||
      p.off - q.off ||
      p.rects[0].x - q.rects[0].x ||
      p.rects[0].y - q.rects[0].y,
  );
}

/** 走廊的範圍裡有擋路的家具或手畫的牆 */
function obstructed(floor: Pick<Floor, 'items' | 'walls'>, rects: readonly Rect[]): boolean {
  if (
    floor.items.some(
      (it) => blocking(it) && !isWallMounted(it.t) && rects.some((r) => rectHits(r, it)),
    )
  )
    return true;
  return floor.walls.some((w) =>
    rects.some((r) => {
      /* 牆從長方形的內部經過（貼在邊上不算） */
      const x1 = Math.min(w.x1, w.x2);
      const x2 = Math.max(w.x1, w.x2);
      const y1 = Math.min(w.y1, w.y2);
      const y2 = Math.max(w.y1, w.y2);
      if (x1 === x2)
        return x1 > r.x + EPS && x1 < r.x + r.w - EPS && y1 < r.y + r.h - EPS && y2 > r.y + EPS;
      if (y1 === y2)
        return y1 > r.y + EPS && y1 < r.y + r.h - EPS && x1 < r.x + r.w - EPS && x2 > r.x + EPS;
      return x1 < r.x + r.w && x2 > r.x && y1 < r.y + r.h && y2 > r.y;
    }),
  );
}

/**
 * 連接兩個房間（id）。成功時回傳要加的門（與走廊）；失敗時資料不變、回傳原因。
 * `corridorName`：走廊的名稱（介面文字由呼叫端給）。
 */
export function connectRooms(
  floor: Floor,
  aId: string,
  bId: string,
  corridorName: string,
): ConnectResult {
  if (aId === bId) return { ok: false, reason: 'same' };
  const ia = floor.rooms.findIndex((r) => r.id === aId);
  const ib = floor.rooms.findIndex((r) => r.id === bId);
  if (ia < 0 || ib < 0) return { ok: false, reason: 'notTwo' };
  const owner = ownerMap(floor.rooms);
  const shared = sharedSegs(owner, floor.rooms, ia, ib);
  if (shared.length) {
    const kind = edgeKind(floor.rooms[ia], floor.rooms[ib]);
    if (kind === null || kind === 'zone') return { ok: false, reason: 'noWall' };
    const existing = floor.openings.find(
      (o) =>
        doorKinds(o) &&
        shared.some(
          (s) =>
            s.o === o.o &&
            Math.abs((o.o === 'h' ? o.y : o.x) - s.c) < EPS &&
            (o.o === 'h' ? o.x : o.y) < s.b - EPS &&
            s.a < (o.o === 'h' ? o.x : o.y) + o.len - EPS,
        ),
    );
    if (existing) return { ok: false, reason: 'connected', doorId: existing.id };
    if (shared.every((s) => s.b - s.a < DOOR_MIN - EPS)) return { ok: false, reason: 'short' };
    const door = placeDoor(floor, owner, shared, swingInto(floor.rooms, ia, ib));
    return door ? { ok: true, kind: 'door', openings: [door] } : { ok: false, reason: 'blocked' };
  }
  const cands = corridorCandidates(owner, ia, ib, CORRIDOR_WIDTH);
  let tried = 0;
  for (const c of cands) {
    if (obstructed(floor, c.rects)) continue;
    if (++tried > 400) break;
    const shape = shapeFromRects(c.rects);
    if (!shape) continue;
    const room: Room = {
      id: uid('r'),
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      name: corridorName,
      cat: 'hall',
      ...(shape.cut ? { cut: shape.cut as RoomCut } : {}),
    };
    const rooms = [...floor.rooms, room];
    const ic = rooms.length - 1;
    const o2 = ownerMap(rooms);
    const f2 = { ...floor, rooms };
    const da = placeDoor(f2, o2, sharedSegs(o2, rooms, ia, ic), ia);
    if (!da) continue;
    const f3 = { ...f2, openings: [...floor.openings, da] };
    const db = placeDoor(f3, o2, sharedSegs(o2, rooms, ib, ic), ib);
    if (!db) continue;
    return {
      ok: true,
      kind: 'corridor',
      room,
      openings: [da, db],
      length: round2((c.area / CORRIDOR_WIDTH) * 0.5),
    };
  }
  return { ok: false, reason: 'noRoute' };
}
