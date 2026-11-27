/**
 * 斷面的幾何（只算、不改資料）：每層被通道佔掉的位置、剩下可以放區域的空間、區域與通道的矩形、整張圖的範圍。
 *
 * 規則（數值參考原作）：
 * - 公開的通道（電梯、兩種樓梯、梯子）在它經過的每一層佔一段整數格（寬見 SHAFT_WIDTH），區域不會和它重疊；
 *   兩條公開通道在同一層撞在一起時，後面那條往右挪到前一條的右邊（放不下就那一層不佔）。
 * - GM 專用的通道與祕密通風管不佔位置（畫在區域上面，PL 用的圖不畫）。
 * - 一層扣掉通道之後的每一段，寬 4 格以上才放區域（「空間」）；更窄的縫畫成牆（`gaps`）。
 * - 世界的範圍：建築左邊留 4 格（樓層的標示）、右邊 2 格、上面是屋頂＋2 格的天空、下面 3 格的地層。
 */
import {
  type Building,
  type Floor,
  MIN_ROOM,
  type Room,
  type SectionDoc,
  SHAFT_WIDTH,
  type Shaft,
} from './types';

export interface Span {
  x0: number;
  x1: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Slot extends Span {
  shaft: Shaft;
}

export interface FloorBox {
  floor: Floor;
  /** 從上往下數第幾層（0 起） */
  index: number;
  y0: number;
  y1: number;
  /** 公開通道佔掉的位置 */
  slots: Slot[];
  /** 可以放區域的空間（寬 ≥ 4） */
  bays: Span[];
  /** 太窄、畫成牆的縫 */
  gaps: Span[];
}

export interface RoomBox extends Rect {
  room: Room;
  floor: Floor;
  /** 地下的區域 */
  under: boolean;
}

export interface ShaftBox extends Rect {
  shaft: Shaft;
  /** 經過的樓層（上到下） */
  floors: FloorBox[];
}

export interface Layout {
  width: number;
  storey: number;
  /** 屋頂的高度（RF 顯示時 3 格，不顯示時 1 格） */
  roofH: number;
  /** 所有樓層的高度 */
  totalH: number;
  /** 地面（GL）的 y */
  glY: number;
  floors: FloorBox[];
  rooms: RoomBox[];
  shafts: ShaftBox[];
  /** 世界（地圖本體）的範圍 */
  world: Rect;
}

export const MARGIN = { left: 4, right: 2, sky: 2, ground: 3 } as const;

export const shaftWidth = (s: Pick<Shaft, 'kind'>): number => SHAFT_WIDTH[s.kind] ?? 3;

/** 不佔位置的通道：GM 專用的、祕密通風管 */
export const isGmShaft = (s: Pick<Shaft, 'kind' | 'secret'>): boolean =>
  s.secret || s.kind === 'duct';

/** 通道經過這一層嗎 */
export const passes = (s: Pick<Shaft, 'top' | 'bottom'>, level: number): boolean =>
  level <= s.top && level >= s.bottom;

/** 由上往下排的樓層 */
export const floorsTopDown = (floors: readonly Floor[]): Floor[] =>
  [...floors].sort((a, b) => b.level - a.level);

/** 左到右排好的區域（新陣列） */
export const leftToRight = (rooms: readonly Room[]): Room[] =>
  [...rooms].sort((a, b) => a.x0 - b.x0);

/** 一層裡貼在一起的兩間（左、右），左到右 */
export function touchingPairs(rooms: readonly Room[]): [Room, Room][] {
  const row = leftToRight(rooms);
  const pairs: [Room, Room][] = [];
  row.forEach((r, i) => {
    const next = row[i + 1];
    if (next && r.x1 === next.x0) pairs.push([r, next]);
  });
  return pairs;
}

/** 這些樓層裡所有區域的 id */
export function roomIdsOf(floors: readonly Floor[]): Set<string> {
  const ids = new Set<string>();
  for (const f of floors) for (const r of f.rooms) ids.add(r.id);
  return ids;
}

const clampInt = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

/** 這一層被公開通道佔掉的位置（左到右、不重疊） */
export function slotsOf(b: Pick<Building, 'width' | 'shafts'>, level: number): Slot[] {
  const W = b.width;
  const wanted = b.shafts
    .filter((s) => !isGmShaft(s) && passes(s, level))
    .map((s) => {
      const w = shaftWidth(s);
      const x0 = clampInt(s.x, 0, Math.max(0, W - w));
      return { shaft: s, x0, x1: x0 + w };
    })
    .sort((a, c) => a.x0 - c.x0);
  const out: Slot[] = [];
  for (const s of wanted) {
    const prev = out[out.length - 1];
    if (prev && s.x0 < prev.x1) {
      const w = s.x1 - s.x0;
      if (prev.x1 + w <= W) out.push({ shaft: s.shaft, x0: prev.x1, x1: prev.x1 + w });
    } else out.push(s);
  }
  return out;
}

/** 這一層可以放區域的空間與太窄的縫 */
export function spacesOf(
  b: Pick<Building, 'width' | 'shafts'>,
  level: number,
): { slots: Slot[]; bays: Span[]; gaps: Span[] } {
  const slots = slotsOf(b, level);
  const bays: Span[] = [];
  const gaps: Span[] = [];
  let x = 0;
  const take = (to: number) => {
    if (to - x >= MIN_ROOM) bays.push({ x0: x, x1: to });
    else if (to > x) gaps.push({ x0: x, x1: to });
  };
  for (const s of slots) {
    take(s.x0);
    x = Math.max(x, s.x1);
  }
  take(b.width);
  return { slots, bays, gaps };
}

/** 屋頂的高度 */
export const roofHeight = (b: Pick<Building, 'rooftop'>): number => (b.rooftop ? 3 : 1);

/** 整棟的幾何 */
export function layoutOf(doc: Pick<SectionDoc, 'building'>): Layout {
  const b = doc.building;
  const fh = b.storey === 5 ? 5 : 6;
  const W = b.width;
  const ordered = floorsTopDown(b.floors);
  const floors: FloorBox[] = ordered.map((floor, index) => ({
    floor,
    index,
    y0: index * fh,
    y1: (index + 1) * fh,
    ...spacesOf(b, floor.level),
  }));
  const totalH = ordered.length * fh;
  /* 地面：1F 的下緣；沒有 1F 時是最下面的地上樓層的下緣；全是地下時是最上面 */
  const first = floors.find((f) => f.floor.level === 1);
  const lowestAbove = [...floors].reverse().find((f) => f.floor.level > 0);
  const glY = first ? first.y1 : lowestAbove ? lowestAbove.y1 : 0;

  const rooms: RoomBox[] = [];
  for (const f of floors)
    for (const room of f.floor.rooms)
      rooms.push({
        room,
        floor: f.floor,
        x: room.x0,
        y: f.y0,
        w: room.x1 - room.x0,
        h: fh,
        under: f.floor.level < 0,
      });

  const shafts: ShaftBox[] = [];
  for (const shaft of b.shafts) {
    const through = floors.filter((f) => passes(shaft, f.floor.level));
    if (!through.length) continue;
    /* 公開的通道畫在那一層實際佔到的位置（被擠開時跟著挪；最上一層的位置） */
    const slot = through
      .map((f) => f.slots.find((s) => s.shaft === shaft))
      .find((s) => s !== undefined);
    const w = shaftWidth(shaft);
    const x = slot ? slot.x0 : clampInt(shaft.x, 0, Math.max(0, W - w));
    const y0 = through[0].y0;
    const y1 = through[through.length - 1].y1;
    shafts.push({ shaft, x, y: y0, w, h: y1 - y0, floors: through });
  }

  const roofH = roofHeight(b);
  const top = roofH + MARGIN.sky;
  return {
    width: W,
    storey: fh,
    roofH,
    totalH,
    glY,
    floors,
    rooms,
    shafts,
    world: {
      x: -MARGIN.left,
      y: -top,
      w: W + MARGIN.left + MARGIN.right,
      h: totalH + top + MARGIN.ground,
    },
  };
}

/** 區域的內部（扣掉兩側的牆、天花板的梁、地板） */
export const WALL_T = 0.2;
export const CEIL_T = 0.52;
export const FLOOR_T = 0.34;

export const interiorOf = (r: Rect): Rect => ({
  x: r.x + WALL_T,
  y: r.y + CEIL_T,
  w: r.w - WALL_T * 2,
  h: r.h - CEIL_T - FLOOR_T,
});

/** 點在矩形裡（含邊） */
export const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** 這個點在哪一間區域 */
export const roomAt = (L: Layout, x: number, y: number): RoomBox | undefined =>
  L.rooms.find((r) => inRect(r, x, y));
