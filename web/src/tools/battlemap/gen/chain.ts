/**
 * 生成法「房間＋走道」（改版前唯一的格局，規格 F13、F14、F16）：
 * - 房間是長方形、每邊 3～5 格，彼此不重疊也不相貼（至少隔一格）。
 * - 房間依產生順序用寬 1 格的 L 形走道串成一條鏈，沿房間正中那一列／欄進出（偶數邊長取偏右／偏下）。
 * - 地板只出現在第 1～(欄數−3) 欄、第 1～(列數−3) 列（右邊與下邊比左邊與上邊多空一格）。
 *
 * 2026-10-30：房間數依地圖大小與密度調整。22 × 16 格、密度「標準」時是 5～8 間、放 250 次，
 * 和改版前取亂數的順序完全相同（同一個種子得到同一張圖）。
 */
import type { Random } from '@/core/timeline';
import type { Density } from '../settings';
import { createMask } from './mask';
import type { Corridor, Generated, Room } from './types';
import { roomLights } from './types';

export const MIN_ROOM_SIDE = 3;
export const MAX_ROOM_SIDE = 5;
/** 改版前（22 × 16 格）的房間數與放置次數 */
export const BASE_MIN_ROOMS = 5;
export const BASE_MAX_ROOMS = 8;
const BASE_ATTEMPTS = 250;
/** 改版前地板可以出現的範圍：19 × 13 格 */
const BASE_AREA = 19 * 13;
/** 一直湊不到最少房間數時，最多重來幾輪（之後取房間最多的那一輪） */
const MAX_ROUNDS = 40;

export const DENSITY_FACTOR: Record<Density, number> = { low: 0.6, normal: 1, high: 1.5 };

/** 這個大小與密度的房間數範圍與放置次數 */
export function chainCounts(
  cols: number,
  rows: number,
  density: Density,
): { min: number; max: number; attempts: number } {
  const k = (((cols - 3) * (rows - 3)) / BASE_AREA) * DENSITY_FACTOR[density];
  const min = Math.max(2, Math.round(BASE_MIN_ROOMS * k));
  const max = Math.max(min, Math.round(BASE_MAX_ROOMS * k));
  return { min, max, attempts: Math.max(BASE_ATTEMPTS, Math.round(BASE_ATTEMPTS * k)) };
}

/** 房間正中那一格（偶數邊長取偏右／偏下） */
export function roomCenter(r: Room): { x: number; y: number } {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

/** 兩個房間是否重疊或相貼（中間至少要隔一格） */
function tooClose(a: Room, b: Room): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function placeRooms(rng: Random, cols: number, rows: number, density: Density): Room[] {
  const { min, max, attempts } = chainCounts(cols, rows, density);
  const maxCol = cols - 3;
  const maxRow = rows - 3;
  let best: Room[] = [];
  for (let round = 0; ; round++) {
    const target = rng.int(min, max);
    const rooms: Room[] = [];
    for (let i = 0; i < attempts && rooms.length < target; i++) {
      const w = rng.int(MIN_ROOM_SIDE, MAX_ROOM_SIDE);
      const h = rng.int(MIN_ROOM_SIDE, MAX_ROOM_SIDE);
      const x = rng.int(1, maxCol - w + 1);
      const y = rng.int(1, maxRow - h + 1);
      const room = { x, y, w, h };
      if (rooms.every((r) => !tooClose(r, room))) rooms.push(room);
    }
    if (rooms.length >= min) return rooms;
    if (rooms.length > best.length) best = rooms;
    if (round >= MAX_ROUNDS - 1) return best;
  }
}

export function generateChain(
  rng: Random,
  cols: number,
  rows: number,
  density: Density,
): Generated {
  const rooms = placeRooms(rng, cols, rows, density);
  const mask = createMask(cols, rows);
  const open = mask.open;
  const setFloor = (x: number, y: number) => {
    open[y * cols + x] = 1;
  };
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setFloor(x, y);
  }
  const corridors: Corridor[] = [];
  for (let i = 1; i < rooms.length; i++) {
    const from = roomCenter(rooms[i - 1]);
    const to = roomCenter(rooms[i]);
    const horizontalFirst = rng.next() < 0.5;
    corridors.push({ from, to, horizontalFirst });
    const corner = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    for (const [a, b] of [
      [from, corner],
      [corner, to],
    ]) {
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      let { x, y } = a;
      setFloor(x, y);
      while (x !== b.x || y !== b.y) {
        x += dx;
        y += dy;
        setFloor(x, y);
      }
    }
  }
  return { mask, rooms, corridors, lights: roomLights(rooms) };
}
