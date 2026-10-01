/**
 * 戰鬥地圖的格局：房間、走道、牆與空無（純資料，不依賴 DOM，方便單元測試）。
 *
 * 規則（規格 F12～F16）：
 * - 22 欄 × 16 列；房間 5～8 間，長方形，每邊 3～5 格，彼此不重疊也不相貼（至少隔一格）。
 * - 房間依產生順序用寬 1 格的 L 形走道串成一條鏈，沿房間正中那一列／欄進出（偶數邊長取偏右／偏下）。
 * - 不是地板、但八方向上與地板相鄰的格子是牆；其餘是空無。
 * - 地板只出現在第 1～19 欄、第 1～13 列（右邊與下邊比左邊與上邊多空一格）。
 */
import { createRandom, type Random } from '@/core/timeline';

export const COLS = 22;
export const ROWS = 16;
export const CELL = 70;
export const MAP_WIDTH = COLS * CELL;
export const MAP_HEIGHT = ROWS * CELL;

/** 地板可以出現的範圍（含） */
export const FLOOR_MIN_COL = 1;
export const FLOOR_MAX_COL = COLS - 3;
export const FLOOR_MIN_ROW = 1;
export const FLOOR_MAX_ROW = ROWS - 3;

export const MIN_ROOMS = 5;
export const MAX_ROOMS = 8;
export const MIN_ROOM_SIDE = 3;
export const MAX_ROOM_SIDE = 5;

/** 種子範圍：0～999,999,999 */
export const MAX_SEED = 999_999_999;

export const VOID = 0;
export const WALL = 1;
export const FLOOR = 2;
export type CellKind = typeof VOID | typeof WALL | typeof FLOOR;

export interface Room {
  /** 左上角的欄、列 */
  x: number;
  y: number;
  /** 寬、高（格） */
  w: number;
  h: number;
}

export interface Corridor {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** true：先橫後直；false：先直後橫 */
  horizontalFirst: boolean;
}

export interface Layout {
  seed: number;
  rooms: Room[];
  corridors: Corridor[];
  /** COLS × ROWS，逐列排列（VOID／WALL／FLOOR） */
  cells: Uint8Array;
}

/** 房間正中那一格（偶數邊長取偏右／偏下） */
export function roomCenter(r: Room): { x: number; y: number } {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

/** 兩個房間是否重疊或相貼（中間至少要隔一格） */
function tooClose(a: Room, b: Room): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** 放置房間的嘗試次數（調整這個值會改變房間數的分布） */
const PLACE_ATTEMPTS = 250;

function placeRooms(rng: Random): Room[] {
  for (;;) {
    const target = rng.int(MIN_ROOMS, MAX_ROOMS);
    const rooms: Room[] = [];
    for (let i = 0; i < PLACE_ATTEMPTS && rooms.length < target; i++) {
      const w = rng.int(MIN_ROOM_SIDE, MAX_ROOM_SIDE);
      const h = rng.int(MIN_ROOM_SIDE, MAX_ROOM_SIDE);
      const x = rng.int(FLOOR_MIN_COL, FLOOR_MAX_COL - w + 1);
      const y = rng.int(FLOOR_MIN_ROW, FLOOR_MAX_ROW - h + 1);
      const room = { x, y, w, h };
      if (rooms.every((r) => !tooClose(r, room))) rooms.push(room);
    }
    if (rooms.length >= MIN_ROOMS) return rooms;
  }
}

/** 由種子產生格局。同一個種子永遠得到同一個格局。 */
export function generateLayout(seed: number): Layout {
  const rng = createRandom(seed);
  const rooms = placeRooms(rng);
  const cells = new Uint8Array(COLS * ROWS);
  const setFloor = (x: number, y: number) => {
    cells[y * COLS + x] = FLOOR;
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
  /* 牆：八方向上與地板相鄰的非地板格 */
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (cells[y * COLS + x] === FLOOR) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          if (cells[ny * COLS + nx] === FLOOR) {
            near = true;
            break;
          }
        }
      }
      if (near) cells[y * COLS + x] = WALL;
    }
  }
  return { seed, rooms, corridors, cells };
}

export const cellAt = (layout: Layout, x: number, y: number): CellKind =>
  layout.cells[y * COLS + x] as CellKind;

/** 新的隨機種子（0～999,999,999）。只有「取新種子」用 Math.random；畫圖一律用決定性亂數。 */
export function randomSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1));
}

/** 解析網址參數 ?seed=<整數>（測試用）；不合法時回傳 null */
export function parseSeedParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,9}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 0 && n <= MAX_SEED ? n : null;
}

/** 統計格子種類 */
export function countCells(layout: Layout): { void: number; wall: number; floor: number } {
  const out = { void: 0, wall: 0, floor: 0 };
  for (const c of layout.cells) {
    if (c === FLOOR) out.floor++;
    else if (c === WALL) out.wall++;
    else out.void++;
  }
  return out;
}
