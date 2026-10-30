/**
 * 生成法「挖掘式」：像人挖地道一樣，從中央的房間開始，在現有的牆上一次接一個房間或一段走道。
 * 參考 rot.js（© Ondrej Zara，BSD-3-Clause；見 ../UPSTREAM_LICENSE）的 Map.Digger（Mike Anderson 的 Tyrant 演算法）：
 * 隨機挑一面牆（走道盡頭的牆優先）、確認只有一側是空地，往外試 20 次接房間或走道（各半），
 * 挖到地圖的指定比例、而且沒有懸著的走道盡頭為止。
 * 改寫的地方：rot.js 以 1 秒的時間限制收尾，這裡改成固定的嘗試次數（同一個種子一定得到同一張圖）；
 * 第一個房間夾在地圖內（小地圖時 rot.js 的房間可能超出地圖）；亂數用本站的種子亂數。
 */
import type { Random } from '@/core/timeline';
import type { Density } from '../settings';
import {
  type CorridorFeature,
  corridorAt,
  corridorIsValid,
  DigMap,
  digCorridor,
  digRoom,
  type RoomFeature,
  type RoomSize,
  roomAround,
  roomAt,
  roomIsValid,
  toRoom,
} from './features';
import { createMask } from './mask';
import type { Generated } from './types';
import { roomLights } from './types';

/** 挖開的比例（扣掉最外一圈的面積），依密度 */
export const DIGGER_DUG: Record<Density, number> = { low: 0.25, normal: 0.35, high: 0.5 };
const ROOM_SIZE: RoomSize = { width: [3, 7], height: [3, 7] };
const CORRIDOR_LENGTH: readonly [number, number] = [2, 6];
/** 每面牆試幾次 */
const FEATURE_ATTEMPTS = 20;
/** 取代 rot.js 的時間限制：最多挑幾次牆 */
const MAX_WALL_PICKS = 4000;

const DIRS4: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function generateDigger(
  rng: Random,
  cols: number,
  rows: number,
  density: Density,
): Generated {
  const map = new DigMap(cols, rows);
  /** 可以接東西的牆：格子索引 → 1（一般）／2（走道盡頭，優先） */
  const walls = new Map<number, number>();
  const rooms: RoomFeature[] = [];
  const area = (cols - 2) * (rows - 2);
  const key = (x: number, y: number) => y * cols + x;

  const addRoom = (r: RoomFeature, door?: { x: number; y: number }) => {
    digRoom(map, r, door ? [door] : []);
    for (let x = r.x1 - 1; x <= r.x2 + 1; x++) {
      for (let y = r.y1 - 1; y <= r.y2 + 1; y++) {
        const edge = x === r.x1 - 1 || x === r.x2 + 1 || y === r.y1 - 1 || y === r.y2 + 1;
        if (!edge || (door && door.x === x && door.y === y) || !map.inside(x, y)) continue;
        walls.set(key(x, y), 1);
      }
    }
    rooms.push(r);
  };

  /* 第一個房間在正中央 */
  addRoom(roomAround(rng, map, Math.floor(cols / 2), Math.floor(rows / 2), ROOM_SIZE));

  const findWall = (): number | null => {
    const prio2: number[] = [];
    const prio1: number[] = [];
    for (const [k, p] of walls) (p === 2 ? prio2 : prio1).push(k);
    const list = prio2.length ? prio2 : prio1;
    if (!list.length) return null;
    list.sort((a, b) => a - b);
    const k = list[Math.floor(rng.next() * list.length)];
    walls.delete(k);
    return k;
  };

  /** 只有一側是空地時，回傳往外挖的方向 */
  const diggingDirection = (cx: number, cy: number): [number, number] | null => {
    if (cx <= 0 || cy <= 0 || cx >= cols - 1 || cy >= rows - 1) return null;
    let found: [number, number] | null = null;
    for (const d of DIRS4) {
      if (map.isEmpty(cx + d[0], cy + d[1])) {
        if (found) return null;
        found = d;
      }
    }
    return found ? [-found[0], -found[1]] : null;
  };

  const removeSurroundingWalls = (cx: number, cy: number) => {
    for (const [dx, dy] of DIRS4) {
      walls.delete(key(cx + dx, cy + dy));
      walls.delete(key(cx + 2 * dx, cy + 2 * dy));
    }
  };

  const tryFeature = (x: number, y: number, dx: number, dy: number): boolean => {
    if (rng.next() < 0.5) {
      const room = roomAt(rng, x, y, dx, dy, ROOM_SIZE);
      if (!roomIsValid(map, room)) return false;
      addRoom(room, { x, y });
      return true;
    }
    const c: CorridorFeature = corridorAt(rng, x, y, dx, dy, CORRIDOR_LENGTH);
    if (!corridorIsValid(map, c)) return false;
    digCorridor(map, c);
    if (c.endsWithWall) {
      const nx = dy;
      const ny = -dx;
      for (const [px, py] of [
        [c.ex + dx, c.ey + dy],
        [c.ex + nx, c.ey + ny],
        [c.ex - nx, c.ey - ny],
      ])
        if (map.inside(px, py)) walls.set(key(px, py), 2);
    }
    return true;
  };

  const target = DIGGER_DUG[density];
  let priorityWalls = 0;
  for (let picks = 0; picks < MAX_WALL_PICKS; picks++) {
    if (map.dug / area >= target && priorityWalls === 0) break;
    priorityWalls = 0;
    const wall = findWall();
    if (wall === null) break;
    const x = wall % cols;
    const y = (wall - x) / cols;
    const dir = diggingDirection(x, y);
    if (dir) {
      for (let attempt = 0; attempt < FEATURE_ATTEMPTS; attempt++) {
        if (tryFeature(x, y, dir[0], dir[1])) {
          removeSurroundingWalls(x, y);
          removeSurroundingWalls(x - dir[0], y - dir[1]);
          break;
        }
      }
    }
    for (const p of walls.values()) if (p > 1) priorityWalls++;
  }

  const mask = createMask(cols, rows);
  for (let i = 0; i < map.rock.length; i++) mask.open[i] = map.rock[i] ? 0 : 1;
  const out = rooms.map(toRoom);
  return { mask, rooms: out, corridors: [], lights: roomLights(out) };
}
