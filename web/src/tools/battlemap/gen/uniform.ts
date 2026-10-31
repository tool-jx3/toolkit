/**
 * 生成法「均勻房間」：先在整張地圖上平均地撒互不重疊的房間，再從房間的牆開門、用直線、L 形或 S 形的走道接起來。
 * 參考 rot.js（© Ondrej Zara，BSD-3-Clause；見 ../UPSTREAM_LICENSE）的 Map.Uniform：
 * 每次從已接上的房間裡隨機挑一間，找最近的還沒接上的房間，再接到離它最近的已接上的房間；
 * 兩間的中心橫向差得多就接左右的牆、縱向差得多就接上下的牆，依門的位置選直線、L 形或 S 形。
 * 改寫的地方：rot.js 以 1 秒的時間限制收尾，這裡改成固定的重試次數（同一個種子一定得到同一張圖），
 * 還是接不起來時改用通用的隧道把剩下的房間接上；亂數用本站的種子亂數。
 */
import type { Random } from '@/core/timeline';
import type { Density } from '../settings';
import { connectRegions } from './connect';
import {
  DigMap,
  digCorridor,
  digRoom,
  type RoomFeature,
  type RoomSize,
  roomAnywhere,
  roomIsValid,
  toRoom,
} from './features';
import { createMask, shuffle } from './mask';
import type { Generated } from './types';
import { roomLights } from './types';

/** 房間佔地圖（扣掉最外一圈）的比例，依密度 */
export const UNIFORM_DUG: Record<Density, number> = { low: 0.15, normal: 0.22, high: 0.3 };
const ROOM_SIZE: RoomSize = { width: [3, 7], height: [3, 7] };
const ROOM_ATTEMPTS = 20;
const CORRIDOR_ATTEMPTS = 20;
/** 取代 rot.js 的時間限制：整張重來幾次 */
const MAX_TRIES = 30;

type Point = [number, number];

const center = (r: RoomFeature): Point => [
  Math.round((r.x1 + r.x2) / 2),
  Math.round((r.y1 + r.y2) / 2),
];

function closestRoom(rooms: readonly RoomFeature[], room: RoomFeature): RoomFeature | null {
  let best: RoomFeature | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  const [cx, cy] = center(room);
  for (const r of rooms) {
    const [x, y] = center(r);
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/** 方向：0 上、1 右、2 下、3 左 */
function placeInWall(rng: Random, map: DigMap, r: RoomFeature, dir: number): Point | null {
  let start: Point;
  let step: Point;
  let length: number;
  if (dir === 0) {
    step = [1, 0];
    start = [r.x1, r.y1 - 1];
    length = r.x2 - r.x1 + 1;
  } else if (dir === 1) {
    step = [0, 1];
    start = [r.x2 + 1, r.y1];
    length = r.y2 - r.y1 + 1;
  } else if (dir === 2) {
    step = [1, 0];
    start = [r.x1, r.y2 + 1];
    length = r.x2 - r.x1 + 1;
  } else {
    step = [0, 1];
    start = [r.x1 - 1, r.y1];
    length = r.y2 - r.y1 + 1;
  }
  /* 牆上可以開門的格子：還是岩石，而且旁邊沒有已經挖開的格子（不和別的門、走道並排） */
  const avail: (Point | null)[] = [];
  let lastBad = -2;
  for (let i = 0; i < length; i++) {
    const x = start[0] + i * step[0];
    const y = start[1] + i * step[1];
    avail.push(null);
    if (map.isWall(x, y)) {
      if (lastBad !== i - 1) avail[i] = [x, y];
    } else {
      lastBad = i;
      if (i) avail[i - 1] = null;
    }
  }
  const list = avail.filter((p): p is Point => p !== null);
  return list.length ? list[Math.floor(rng.next() * list.length)] : null;
}

function digLine(map: DigMap, points: readonly Point[]): void {
  for (let i = 1; i < points.length; i++) {
    const [sx, sy] = points[i - 1];
    const [ex, ey] = points[i];
    digCorridor(map, { sx, sy, ex, ey });
  }
}

function connectRooms(rng: Random, map: DigMap, room1: RoomFeature, room2: RoomFeature): boolean {
  const c1 = center(room1);
  const c2 = center(room2);
  const diffX = c2[0] - c1[0];
  const diffY = c2[1] - c1[1];
  let dir1: number;
  let dir2: number;
  let min: number;
  let max: number;
  let index: 0 | 1;
  if (Math.abs(diffX) < Math.abs(diffY)) {
    /* 接上下的牆 */
    dir1 = diffY > 0 ? 2 : 0;
    dir2 = (dir1 + 2) % 4;
    min = room2.x1;
    max = room2.x2;
    index = 0;
  } else {
    /* 接左右的牆 */
    dir1 = diffX > 0 ? 1 : 3;
    dir2 = (dir1 + 2) % 4;
    min = room2.y1;
    max = room2.y2;
    index = 1;
  }
  const start = placeInWall(rng, map, room1, dir1);
  if (!start) return false;
  const other = index === 0 ? 1 : 0;
  let end: Point;
  if (start[index] >= min && start[index] <= max) {
    /* 直線 */
    end = [start[0], start[1]];
    end[other] =
      dir2 === 0
        ? room2.y1 - 1
        : dir2 === 1
          ? room2.x2 + 1
          : dir2 === 2
            ? room2.y2 + 1
            : room2.x1 - 1;
    digLine(map, [start, end]);
  } else if (start[index] < min - 1 || start[index] > max + 1) {
    /* L 形：改接對方側面的牆 */
    const diff = start[index] - c2[index];
    const rotation = dir2 === 0 || dir2 === 1 ? (diff < 0 ? 3 : 1) : diff < 0 ? 1 : 3;
    dir2 = (dir2 + rotation) % 4;
    const e = placeInWall(rng, map, room2, dir2);
    if (!e) return false;
    end = e;
    const mid: Point = [0, 0];
    mid[index] = start[index];
    mid[other] = end[other];
    digLine(map, [start, mid, end]);
  } else {
    /* S 形：同一對牆，中間轉兩次 */
    const e = placeInWall(rng, map, room2, dir2);
    if (!e) return false;
    end = e;
    const mid = Math.round((end[other] + start[other]) / 2);
    const mid1: Point = [0, 0];
    const mid2: Point = [0, 0];
    mid1[index] = start[index];
    mid1[other] = mid;
    mid2[index] = end[index];
    mid2[other] = mid;
    digLine(map, [start, mid1, mid2, end]);
  }
  return true;
}

export function generateUniform(
  rng: Random,
  cols: number,
  rows: number,
  density: Density,
): Generated {
  const area = (cols - 2) * (rows - 2);
  const target = UNIFORM_DUG[density];
  let rooms: RoomFeature[] = [];
  let map = new DigMap(cols, rows);
  let ok = false;
  for (let tries = 0; tries < MAX_TRIES && !ok; tries++) {
    /* 撒房間 */
    map = new DigMap(cols, rows);
    rooms = [];
    for (;;) {
      let placed: RoomFeature | null = null;
      for (let a = 0; a < ROOM_ATTEMPTS && !placed; a++) {
        const r = roomAnywhere(rng, map, ROOM_SIZE);
        if (roomIsValid(map, r)) placed = r;
      }
      if (!placed) break;
      digRoom(map, placed);
      rooms.push(placed);
      if (map.dug / area > target) break;
    }
    if (rooms.length < 2) continue;
    /* 接走道：失敗就把走道全部拿掉重接，重接幾次都不行就整張重來 */
    for (let c = 0; c < CORRIDOR_ATTEMPTS && !ok; c++) {
      map = new DigMap(cols, rows);
      for (const r of rooms) digRoom(map, r);
      const unconnected = shuffle(rooms, rng);
      const connected: RoomFeature[] = [unconnected.pop() as RoomFeature];
      for (;;) {
        const from = connected[Math.floor(rng.next() * connected.length)];
        const room1 = closestRoom(unconnected, from);
        if (!room1) break;
        const room2 = closestRoom(connected, room1);
        if (!room2) break;
        if (!connectRooms(rng, map, room1, room2)) break;
        for (const r of [room1, room2]) {
          const i = unconnected.indexOf(r);
          if (i >= 0) {
            unconnected.splice(i, 1);
            connected.push(r);
          }
        }
        if (!unconnected.length) {
          ok = true;
          break;
        }
      }
    }
  }
  const mask = createMask(cols, rows);
  for (let i = 0; i < map.rock.length; i++) mask.open[i] = map.rock[i] ? 0 : 1;
  /* 重試用完還接不起來（很小的地圖才會發生）：剩下的用隧道接 */
  if (!ok) connectRegions(mask, rng);
  const out = rooms.map(toRoom);
  return { mask, rooms: out, corridors: [], lights: roomLights(out) };
}
