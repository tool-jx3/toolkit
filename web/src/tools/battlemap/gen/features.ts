/**
 * 「挖掘式」與「均勻房間」共用的挖地圖工具：岩石地圖、帶牆的房間、直線走道。
 * 參考 rot.js（© Ondrej Zara，BSD-3-Clause；見 ../UPSTREAM_LICENSE）的 Map.Feature（Room、Corridor）：
 * 房間四周一圈必須是岩石、裡面可以挖；走道兩側必須是岩石，碰到東西就截短，盡頭不能撞上房間的角。
 * 座標都是格；房間的 x1～x2、y1～y2 是地板（含），牆在外面一圈。
 */
import type { Random } from '@/core/timeline';
import type { Room } from './types';

export class DigMap {
  readonly cols: number;
  readonly rows: number;
  /** 1＝岩石、0＝挖開 */
  readonly rock: Uint8Array;
  /** 挖開的格數 */
  dug = 0;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.rock = new Uint8Array(cols * rows).fill(1);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** 是岩石（地圖外面不算） */
  isWall(x: number, y: number): boolean {
    return this.inside(x, y) && this.rock[y * this.cols + x] === 1;
  }

  /** 可以挖：不在最外一圈、而且還是岩石 */
  canBeDug(x: number, y: number): boolean {
    return (
      x >= 1 &&
      y >= 1 &&
      x + 1 < this.cols &&
      y + 1 < this.rows &&
      this.rock[y * this.cols + x] === 1
    );
  }

  isEmpty(x: number, y: number): boolean {
    return this.inside(x, y) && this.rock[y * this.cols + x] === 0;
  }

  dig(x: number, y: number): void {
    if (!this.inside(x, y)) return;
    const i = y * this.cols + x;
    if (this.rock[i]) {
      this.rock[i] = 0;
      this.dug++;
    }
  }
}

export interface RoomFeature {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RoomSize {
  width: readonly [number, number];
  height: readonly [number, number];
}

export const toRoom = (r: RoomFeature): Room => ({
  x: r.x1,
  y: r.y1,
  w: r.x2 - r.x1 + 1,
  h: r.y2 - r.y1 + 1,
});

/** 房間：四周一圈是岩石、裡面都還能挖 */
export function roomIsValid(map: DigMap, r: RoomFeature): boolean {
  for (let x = r.x1 - 1; x <= r.x2 + 1; x++) {
    for (let y = r.y1 - 1; y <= r.y2 + 1; y++) {
      const edge = x === r.x1 - 1 || x === r.x2 + 1 || y === r.y1 - 1 || y === r.y2 + 1;
      if (edge ? !map.isWall(x, y) : !map.canBeDug(x, y)) return false;
    }
  }
  return true;
}

/** 挖開房間（門是房間外圍一圈上要挖開的格子） */
export function digRoom(
  map: DigMap,
  r: RoomFeature,
  doors: readonly { x: number; y: number }[] = [],
): void {
  for (let y = r.y1; y <= r.y2; y++) for (let x = r.x1; x <= r.x2; x++) map.dig(x, y);
  for (const d of doors) map.dig(d.x, d.y);
}

/** 在 (x, y) 開一扇門、往 (dx, dy) 方向長出去的隨機大小房間（rot.js Room.createRandomAt） */
export function roomAt(
  rng: Random,
  x: number,
  y: number,
  dx: number,
  dy: number,
  size: RoomSize,
): RoomFeature {
  const width = rng.int(size.width[0], size.width[1]);
  const height = rng.int(size.height[0], size.height[1]);
  if (dx === 1) {
    const y1 = y - Math.floor(rng.next() * height);
    return { x1: x + 1, y1, x2: x + width, y2: y1 + height - 1 };
  }
  if (dx === -1) {
    const y1 = y - Math.floor(rng.next() * height);
    return { x1: x - width, y1, x2: x - 1, y2: y1 + height - 1 };
  }
  if (dy === 1) {
    const x1 = x - Math.floor(rng.next() * width);
    return { x1, y1: y + 1, x2: x1 + width - 1, y2: y + height };
  }
  const x1 = x - Math.floor(rng.next() * width);
  return { x1, y1: y - height, x2: x1 + width - 1, y2: y - 1 };
}

/** 中心在 (cx, cy) 附近的隨機大小房間，整個放得進地圖（rot.js Room.createRandomCenter，加上夾到地圖內） */
export function roomAround(
  rng: Random,
  map: DigMap,
  cx: number,
  cy: number,
  size: RoomSize,
): RoomFeature {
  const width = Math.min(rng.int(size.width[0], size.width[1]), map.cols - 2);
  const height = Math.min(rng.int(size.height[0], size.height[1]), map.rows - 2);
  const x1 = Math.min(map.cols - 1 - width, Math.max(1, cx - Math.floor(rng.next() * width)));
  const y1 = Math.min(map.rows - 1 - height, Math.max(1, cy - Math.floor(rng.next() * height)));
  return { x1, y1, x2: x1 + width - 1, y2: y1 + height - 1 };
}

/** 地圖內隨機位置的房間（rot.js Room.createRandom） */
export function roomAnywhere(rng: Random, map: DigMap, size: RoomSize): RoomFeature {
  const width = Math.min(rng.int(size.width[0], size.width[1]), map.cols - 2);
  const height = Math.min(rng.int(size.height[0], size.height[1]), map.rows - 2);
  const left = map.cols - width - 1;
  const top = map.rows - height - 1;
  const x1 = 1 + Math.floor(rng.next() * left);
  const y1 = 1 + Math.floor(rng.next() * top);
  return { x1, y1, x2: x1 + width - 1, y2: y1 + height - 1 };
}

export interface CorridorFeature {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  /** 盡頭的下一格是岩石（挖掘式會在那裡優先接下一段） */
  endsWithWall: boolean;
}

/** 從 (x, y) 往 (dx, dy) 直直挖 length 格的走道（含起點） */
export function corridorAt(
  rng: Random,
  x: number,
  y: number,
  dx: number,
  dy: number,
  lengthRange: readonly [number, number],
): CorridorFeature {
  const length = rng.int(lengthRange[0], lengthRange[1]);
  return { sx: x, sy: y, ex: x + dx * length, ey: y + dy * length, endsWithWall: true };
}

const unit = (v: number) => (v ? v / Math.abs(v) : 0);

/** 走道是否可以挖（rot.js Corridor#isValid）：碰到東西就截短；會改寫 c 的終點與 endsWithWall */
export function corridorIsValid(map: DigMap, c: CorridorFeature): boolean {
  const dx = unit(c.ex - c.sx);
  const dy = unit(c.ey - c.sy);
  let length = 1 + Math.max(Math.abs(c.ex - c.sx), Math.abs(c.ey - c.sy));
  const nx = dy;
  const ny = -dx;
  for (let i = 0; i < length; i++) {
    const x = c.sx + i * dx;
    const y = c.sy + i * dy;
    const ok = map.canBeDug(x, y) && map.isWall(x + nx, y + ny) && map.isWall(x - nx, y - ny);
    if (!ok) {
      length = i;
      c.ex = x - dx;
      c.ey = y - dy;
      break;
    }
  }
  if (length === 0) return false;
  /* 只有 1 格長時，下一格必須是空地 */
  if (length === 1 && map.isWall(c.ex + dx, c.ey + dy)) return false;
  /* 盡頭不能撞上房間的角：盡頭外的兩個斜角有空地時，盡頭的下一格也必須是空地 */
  const cornerA = !map.isWall(c.ex + dx + nx, c.ey + dy + ny);
  const cornerB = !map.isWall(c.ex + dx - nx, c.ey + dy - ny);
  c.endsWithWall = map.isWall(c.ex + dx, c.ey + dy);
  if ((cornerA || cornerB) && c.endsWithWall) return false;
  return true;
}

/** 挖開走道（起點到終點，直線） */
export function digCorridor(
  map: DigMap,
  c: { sx: number; sy: number; ex: number; ey: number },
): void {
  const dx = unit(c.ex - c.sx);
  const dy = unit(c.ey - c.sy);
  const length = 1 + Math.max(Math.abs(c.ex - c.sx), Math.abs(c.ey - c.sy));
  for (let i = 0; i < length; i++) map.dig(c.sx + i * dx, c.sy + i * dy);
}
