/**
 * 進階 3D（規格 1.11、3.12）的資料與規則（純函式，不依賴 three.js、React 與畫布）：
 * 房間與走廊（地圖上框出的範圍）、牆上的入口、依序點選的移動路線、牆與入口的切法、走過去的時間與鏡頭。
 *
 * 座標一律是原圖 px。3D 裡 1 原圖 px＝1 單位：地圖平放在地上，x → X、y → Z、高度 → Y。
 */
import {
  isObj,
  lineText,
  num,
  type Point,
  pick,
  type Rect,
  type Size,
  snapTo,
} from '@/core/imagefx';

/** 房間（有天花板的線、房名）／走廊（沒有天花板的線、牆比較淡） */
export type WalkKind = 'room' | 'hall';
export const WALK_KINDS: readonly WalkKind[] = ['room', 'hall'];

/** 牆：上（北）、右（東）、下（南）、左（西） */
export type Side = 'n' | 'e' | 's' | 'w';
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

export interface WalkRoom extends Rect {
  id: string;
  kind: WalkKind;
  /** 房名（3D 裡浮在房間上方；最多 40 字） */
  name: string;
}

export interface WalkDoor {
  id: string;
  /** 放在哪個房間（走廊）的牆上 */
  room: string;
  side: Side;
  /** 入口的中心在牆上的位置（0＝左端／上端、1＝右端／下端） */
  at: number;
}

export interface WalkState {
  rooms: WalkRoom[];
  doors: WalkDoor[];
  /** 移動路線：現在位置、轉角……、目的地（原圖 px） */
  path: Point[];
  /** 房名顯示 */
  names: boolean;
  /** 地圖鋪在地上 */
  floor: boolean;
  /** 牆高（原圖 px） */
  wall: number;
  /** 入口寬（原圖 px） */
  door: number;
  /** 走完路線的秒數（不含頭尾的停留） */
  duration: number;
}

export const WALK_RANGES = {
  wall: { min: 12, max: 240, step: 2 },
  door: { min: 12, max: 160, step: 2 },
  duration: { min: 2, max: 30, step: 0.5 },
} as const;
export type WalkRangeKey = keyof typeof WALK_RANGES;

export const WALK_LIMITS = {
  rooms: 40,
  doors: 80,
  path: 64,
  /** 房間至少幾 px 見方 */
  minSize: 8,
  name: 40,
} as const;

/** 走過去的頭尾停留（秒）：開始時站在現在位置看著前方、到了目的地停一下 */
export const WALK_HOLD = { start: 0.8, end: 1.2 } as const;
/** 影片：30 fps（同原作）、長邊最多 1920 */
export const WALK_FPS = 30;
export const WALK_MAX_SIDE = 1920;

export const initialWalk = (): WalkState => ({
  rooms: [],
  doors: [],
  path: [],
  names: true,
  floor: true,
  wall: 48,
  door: 40,
  duration: 8,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 房間的範圍取整、至少 minSize、夾在地圖裡 */
export function clampRoomRect(r: Rect, image: Size): Rect {
  const W = Math.max(1, Math.round(image.width));
  const H = Math.max(1, Math.round(image.height));
  const min = Math.min(WALK_LIMITS.minSize, W, H);
  const w = clamp(Math.round(r.w), min, W);
  const h = clamp(Math.round(r.h), min, H);
  return { x: clamp(Math.round(r.x), 0, W - w), y: clamp(Math.round(r.y), 0, H - h), w, h };
}

const clampPoint = (p: Point, image: Size): Point => ({
  x: Math.round(clamp(p.x, 0, image.width) * 10) / 10,
  y: Math.round(clamp(p.y, 0, image.height) * 10) / 10,
});

/** 存檔可能缺欄位或被改壞：補預設、夾範圍；看不懂的房間、入口、點拿掉；入口的房間不在了也拿掉；沒有地圖時只留設定 */
export function normalizeWalk(raw: unknown, image: Size | null): WalkState {
  const d = initialWalk();
  const s = isObj(raw) ? raw : {};
  const base: WalkState = {
    ...d,
    names: typeof s.names === 'boolean' ? s.names : d.names,
    floor: typeof s.floor === 'boolean' ? s.floor : d.floor,
    wall: snapTo(WALK_RANGES.wall, s.wall, d.wall),
    door: snapTo(WALK_RANGES.door, s.door, d.door),
    duration: snapTo(WALK_RANGES.duration, s.duration, d.duration),
  };
  if (!image) return base;
  const ids = new Set<string>();
  const rooms: WalkRoom[] = [];
  for (const r of Array.isArray(s.rooms) ? s.rooms : []) {
    if (rooms.length >= WALK_LIMITS.rooms) break;
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || ids.has(r.id)) continue;
    const x = num(r.x, Number.NaN);
    const y = num(r.y, Number.NaN);
    const w = num(r.w, Number.NaN);
    const h = num(r.h, Number.NaN);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    ids.add(r.id);
    rooms.push({
      id: r.id,
      kind: pick(r.kind, WALK_KINDS, 'room'),
      ...clampRoomRect({ x, y, w, h }, image),
      name: lineText(r.name, WALK_LIMITS.name),
    });
  }
  const doorIds = new Set<string>();
  const doors: WalkDoor[] = [];
  for (const o of Array.isArray(s.doors) ? s.doors : []) {
    if (doors.length >= WALK_LIMITS.doors) break;
    if (!isObj(o) || typeof o.id !== 'string' || !o.id || doorIds.has(o.id)) continue;
    if (typeof o.room !== 'string' || !ids.has(o.room)) continue;
    if (!SIDES.includes(o.side as Side)) continue;
    const at = num(o.at, Number.NaN);
    if (!Number.isFinite(at)) continue;
    doorIds.add(o.id);
    doors.push({
      id: o.id,
      room: o.room,
      side: o.side as Side,
      at: Math.round(clamp(at, 0, 1) * 10000) / 10000,
    });
  }
  const path: Point[] = [];
  for (const p of Array.isArray(s.path) ? s.path : []) {
    if (path.length >= WALK_LIMITS.path) break;
    if (!isObj(p)) continue;
    const x = num(p.x, Number.NaN);
    const y = num(p.y, Number.NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) path.push(clampPoint({ x, y }, image));
  }
  return { ...base, rooms, doors, path };
}

/* ---------- 房間遮罩當草稿 ---------- */

/** 房間遮罩（照清單順序）做成房間：房名照抄；和已有的房間範圍相同的不重複加；到上限為止 */
export function roomsFromMasks(
  masks: readonly (Rect & { label: string })[],
  existing: readonly WalkRoom[],
  image: Size,
  newId: (taken: Set<string>) => string,
): WalkRoom[] {
  const taken = new Set(existing.map((r) => r.id));
  const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  const out: WalkRoom[] = [];
  for (const m of masks) {
    if (existing.length + out.length >= WALK_LIMITS.rooms) break;
    const rect = clampRoomRect(m, image);
    if (existing.some((r) => same(r, rect)) || out.some((r) => same(r, rect))) continue;
    const id = newId(taken);
    taken.add(id);
    out.push({ id, kind: 'room', ...rect, name: lineText(m.label.trim(), WALK_LIMITS.name) });
  }
  return out;
}

/* ---------- 牆與入口 ---------- */

/** 一面牆：從 a 到 b（原圖 px），沿牆的長度 len；固定的那個座標 fixed（上下牆是 y、左右牆是 x） */
export interface Wall {
  side: Side;
  a: Point;
  b: Point;
  len: number;
  /** 上下牆（沿 x 走）＝true */
  horizontal: boolean;
  fixed: number;
  /** 沿牆座標的起點（上下牆是 x、左右牆是 y） */
  from: number;
}

export function wallOf(r: Rect, side: Side): Wall {
  if (side === 'n')
    return {
      side,
      a: { x: r.x, y: r.y },
      b: { x: r.x + r.w, y: r.y },
      len: r.w,
      horizontal: true,
      fixed: r.y,
      from: r.x,
    };
  if (side === 's')
    return {
      side,
      a: { x: r.x, y: r.y + r.h },
      b: { x: r.x + r.w, y: r.y + r.h },
      len: r.w,
      horizontal: true,
      fixed: r.y + r.h,
      from: r.x,
    };
  if (side === 'w')
    return {
      side,
      a: { x: r.x, y: r.y },
      b: { x: r.x, y: r.y + r.h },
      len: r.h,
      horizontal: false,
      fixed: r.x,
      from: r.y,
    };
  return {
    side,
    a: { x: r.x + r.w, y: r.y },
    b: { x: r.x + r.w, y: r.y + r.h },
    len: r.h,
    horizontal: false,
    fixed: r.x + r.w,
    from: r.y,
  };
}

/** 入口的實際寬度：牆比入口短時縮到牆長 − 4（至少 4） */
export const doorWidthOn = (wall: Wall, width: number): number =>
  Math.max(4, Math.min(width, wall.len - 4));

/** 入口的中心夾在牆上，讓整個入口都在牆裡 */
export function clampDoorAt(wall: Wall, at: number, width: number): number {
  const dw = doorWidthOn(wall, width);
  const half = wall.len > 0 ? dw / 2 / wall.len : 0.5;
  return half >= 0.5 ? 0.5 : clamp(at, half, 1 - half);
}

/** 入口在牆上的範圍（沿牆座標，原圖 px） */
export function doorSpan(wall: Wall, at: number, width: number): [number, number] {
  const dw = doorWidthOn(wall, width);
  const c = wall.from + clampDoorAt(wall, at, width) * wall.len;
  return [c - dw / 2, c + dw / 2];
}

/** 入口的兩端（原圖 px；平面圖上畫入口、3D 的門框用） */
export function doorSegment(room: Rect, door: WalkDoor, width: number): [Point, Point] {
  const wall = wallOf(room, door.side);
  const [p, q] = doorSpan(wall, door.at, width);
  return wall.horizontal
    ? [
        { x: p, y: wall.fixed },
        { x: q, y: wall.fixed },
      ]
    : [
        { x: wall.fixed, y: p },
        { x: wall.fixed, y: q },
      ];
}

/** 兩面牆在同一條線上（相鄰的房間共用的牆；誤差 2 px 以內） */
const sameLine = (a: Wall, b: Wall) =>
  a.horizontal === b.horizontal && Math.abs(a.fixed - b.fixed) <= 2;

/**
 * 一面牆上的開口（沿牆座標，由小到大、重疊的合併）：放在這面牆上的入口，加上別的房間放在同一條線上、範圍重疊的入口
 * （相鄰的兩間共用一面牆時，門只放一邊、兩邊的牆都開口）。
 */
export function wallOpenings(
  room: WalkRoom,
  side: Side,
  rooms: readonly WalkRoom[],
  doors: readonly WalkDoor[],
  width: number,
): [number, number][] {
  const wall = wallOf(room, side);
  const lo = wall.from;
  const hi = wall.from + wall.len;
  const spans: [number, number][] = [];
  for (const d of doors) {
    const owner = d.room === room.id ? room : rooms.find((r) => r.id === d.room);
    if (!owner) continue;
    const w2 = wallOf(owner, d.side);
    if (d.room === room.id ? d.side !== side : !sameLine(wall, w2)) continue;
    const [p, q] = doorSpan(w2, d.at, width);
    const a = Math.max(lo, p);
    const b = Math.min(hi, q);
    if (b - a > 0.5) spans.push([a, b]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  return merged;
}

/** 牆被開口切開後剩下的實心段（沿牆座標） */
export function solidPieces(wall: Wall, openings: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let at = wall.from;
  for (const [a, b] of openings) {
    if (a - at > 0.5) out.push([at, a]);
    at = Math.max(at, b);
  }
  const end = wall.from + wall.len;
  if (end - at > 0.5) out.push([at, end]);
  return out;
}

/** 入口的高度：牆高 × 0.8（至少比牆矮 4 px） */
export const doorHeight = (wall: number): number => Math.max(4, Math.min(wall * 0.8, wall - 4));

/** 平面圖上點在哪面牆附近（tolerance：原圖 px）：回傳最近的房間、牆與入口中心的位置 */
export function nearestWall(
  rooms: readonly WalkRoom[],
  p: Point,
  tolerance: number,
): { room: WalkRoom; side: Side; at: number; dist: number } | null {
  let best: { room: WalkRoom; side: Side; at: number; dist: number } | null = null;
  /* 後面的房間畫在上面：同樣近時後面的優先 */
  for (let i = rooms.length - 1; i >= 0; i--) {
    const room = rooms[i];
    for (const side of SIDES) {
      const w = wallOf(room, side);
      const along = w.horizontal ? p.x : p.y;
      const across = w.horizontal ? p.y : p.x;
      if (along < w.from - tolerance || along > w.from + w.len + tolerance) continue;
      const dist = Math.abs(across - w.fixed);
      if (dist > tolerance || (best && dist >= best.dist)) continue;
      best = { room, side, at: w.len > 0 ? clamp((along - w.from) / w.len, 0, 1) : 0.5, dist };
    }
  }
  return best;
}

/* ---------- 平面圖的吸附與點選 ---------- */

/** v 吸附到 candidates 裡最近的一個（距離不超過 tol）；沒有時原樣 */
export function snapValue(v: number, candidates: readonly number[], tol: number): number {
  let best = v;
  let d = tol;
  for (const c of candidates) {
    const e = Math.abs(c - v);
    if (e <= d) {
      d = e;
      best = c;
    }
  }
  return best;
}

/** 其他房間的邊（x 與 y 各一組；exclude 的房間不算） */
export function roomEdges(
  rooms: readonly (Rect & { id?: string })[],
  exclude?: string,
): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rooms) {
    if (exclude && r.id === exclude) continue;
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  }
  return { xs, ys };
}

/** 一個點吸附到鄰近房間的邊（畫房間、拉角改大小時用；tol：原圖 px） */
export function snapPoint(
  p: Point,
  rooms: readonly (Rect & { id?: string })[],
  tol: number,
  exclude?: string,
): Point {
  const { xs, ys } = roomEdges(rooms, exclude);
  return { x: snapValue(p.x, xs, tol), y: snapValue(p.y, ys, tol) };
}

/** 移動房間時整個框吸附：左右邊、上下邊各找最近的鄰近房間的邊，框跟著平移（大小不變） */
export function snapMove(
  r: Rect,
  rooms: readonly (Rect & { id?: string })[],
  tol: number,
  exclude?: string,
): Rect {
  const { xs, ys } = roomEdges(rooms, exclude);
  const shift = (a: number, b: number, list: number[]) => {
    let best = 0;
    let d = tol;
    for (const c of list)
      for (const e of [a, b]) {
        const diff = c - e;
        if (Math.abs(diff) <= d) {
          d = Math.abs(diff);
          best = diff;
        }
      }
    return best;
  };
  return { ...r, x: r.x + shift(r.x, r.x + r.w, xs), y: r.y + shift(r.y, r.y + r.h, ys) };
}

/** 平面圖上按到的入口：離按的點最近、在 tol 以內的那個（不是清單後面的優先） */
export function doorAt(
  w: Pick<WalkState, 'rooms' | 'doors' | 'door'>,
  p: Point,
  tol: number,
): WalkDoor | null {
  let best: WalkDoor | null = null;
  let d = tol;
  for (const door of w.doors) {
    const room = w.rooms.find((r) => r.id === door.room);
    if (!room) continue;
    const [a, b] = doorSegment(room, door, w.door);
    const e = distToSegment(p, a, b);
    if (e <= d) {
      d = e;
      best = door;
    }
  }
  return best;
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * u), p.y - (a.y + dy * u));
}

/** 方向鍵移動入口：沿牆移 px（換算成 at，夾在牆裡） */
export function nudgeDoorAt(room: Rect, door: WalkDoor, px: number, width: number): number {
  const wall = wallOf(room, door.side);
  if (wall.len <= 0) return door.at;
  return clampDoorAt(wall, door.at + px / wall.len, width);
}

/* ---------- 路線與鏡頭 ---------- */

/** 路線上相鄰的重複點拿掉（同一點連點兩次不算轉角） */
export function cleanPath(path: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of path) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) out.push({ x: p.x, y: p.y });
  }
  return out;
}

export function walkLength(path: readonly Point[]): number {
  const pts = cleanPath(path);
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

/** 能不能走：至少兩個不同的點 */
export const canWalk = (path: readonly Point[]): boolean => cleanPath(path).length >= 2;

/** 走過去的總長（秒）：開頭停留＋走路線＋結尾停留 */
export const walkTotal = (w: Pick<WalkState, 'duration'>): number =>
  WALK_HOLD.start + w.duration + WALK_HOLD.end;

/** 第 t 秒走了多遠（0～1）：頭尾停留，中間慢慢起步、慢慢停下（餘弦） */
export function walkProgress(w: Pick<WalkState, 'duration'>, t: number): number {
  const u = clamp((t - WALK_HOLD.start) / Math.max(1e-6, w.duration), 0, 1);
  return (1 - Math.cos(Math.PI * u)) / 2;
}

/**
 * 沿折線走 d（可以超出頭尾：超出時順著第一段／最後一段的方向延長）。pts 至少兩個不同的點。
 */
export function alongExtended(pts: readonly Point[], d: number): Point {
  const n = pts.length;
  if (d <= 0) {
    const a = pts[0];
    const b = pts[1];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x + ((b.x - a.x) / l) * d, y: a.y + ((b.y - a.y) / l) * d };
  }
  let left = d;
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= l || i === n - 1) {
      const u = l > 0 ? left / l : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    left -= l;
  }
  return { ...pts[n - 1] };
}

/** 眼睛的高度：牆高 × 0.55 */
export const eyeHeight = (wall: number): number => wall * 0.55;
/** 往前看多遠：牆高 × 2 */
export const lookAhead = (wall: number): number => wall * 2;

/**
 * 停在目的地前多遠：牆高 × 2.2（路線很短時最多全長的 30%）。往前看 2 倍牆高，所以結尾正對著目的地，
 * 標記的光柱與「目的地」標籤（離地約 1.5 倍牆高）都在畫面裡。
 */
export const stopShort = (wall: number, length: number): number =>
  Math.min(wall * 2.2, length * 0.3);

/**
 * 第 t 秒的鏡頭（原圖 px＋高度）：站在路線上走了 walkProgress 的地方（走到目的地前 stopShort 停下）、
 * 眼睛高 eyeHeight，看著前方 lookAhead 的路線上（所以轉角會提早慢慢轉過去；超過目的地時順著最後一段延長），
 * 看的高度略低一點（稍微往下看）。路線不能走時 null。
 */
export function walkCamera(
  w: Pick<WalkState, 'path' | 'wall' | 'duration'>,
  t: number,
): { pos: Point; look: Point; eye: number; lookHeight: number } | null {
  const pts = cleanPath(w.path);
  if (pts.length < 2) return null;
  const L = walkLength(pts);
  const d = walkProgress(w, t) * (L - stopShort(w.wall, L));
  const pos = alongExtended(pts, d);
  const look = alongExtended(pts, d + lookAhead(w.wall));
  const eye = eyeHeight(w.wall);
  return { pos, look, eye, lookHeight: eye * 0.82 };
}

/** 3D 影片的大小：畫面等比縮到長邊 1920 以內（寬高偶數） */
export function walkVideoSize(canvas: Size): Size {
  const k = Math.min(1, WALK_MAX_SIDE / Math.max(canvas.width, canvas.height));
  const w = Math.max(2, Math.round(canvas.width * k));
  const h = Math.max(2, Math.round(canvas.height * k));
  return { width: w - (w % 2), height: h - (h % 2) };
}

/** 房間（走廊）的外接範圍（沒有房間時用整張地圖） */
export function walkBounds(rooms: readonly Rect[], image: Size): Rect {
  if (!rooms.length) return { x: 0, y: 0, w: image.width, h: image.height };
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rooms) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
