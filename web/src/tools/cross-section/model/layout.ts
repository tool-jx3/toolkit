/**
 * 斷面的幾何（只算、不改資料）：每層被通道佔掉的位置、剩下可以放區域的空間、區域與通道的矩形、整張圖的範圍。
 *
 * 規則（數值參考原作）：
 * - 公開的通道（電梯、兩種樓梯、梯子）在它經過的每一層佔一段整數格（寬見 SHAFT_WIDTH），區域不會和它重疊；
 *   兩條公開通道在同一層撞在一起時，後面那條往右挪到前一條的右邊（放不下就那一層不佔）。
 * - GM 專用的通道與祕密通風管不佔位置（畫在區域上面，PL 用的圖不畫）。
 * - 一層扣掉通道之後的每一段，寬 4 格以上才放區域（「空間」）；更窄的縫畫成牆（`slivers`）。
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

export interface Cut extends Span {
  shaft: Shaft;
}

export interface FloorBox {
  floor: Floor;
  /** 從上往下數第幾層（0 起） */
  index: number;
  y0: number;
  y1: number;
  /** 公開通道佔掉的位置 */
  cuts: Cut[];
  /** 可以放區域的空間（寬 ≥ 4） */
  spaces: Span[];
  /** 太窄、畫成牆的縫 */
  slivers: Span[];
}

/** 一間區域的矩形（建築的區域、車廂裡的區域、床下的祕密空間共用的部分） */
export interface Box extends Rect {
  room: Pick<Room, 'id' | 'name' | 'wall' | 'secret' | 'hideName'>;
  /** 地下的區域（PL 用時不畫）；列車的床下的祕密空間也是 */
  under: boolean;
}

export interface RoomBox extends Box {
  room: Room;
  floor: Floor;
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
  roofDepth: number;
  /** 所有樓層的高度 */
  stackDepth: number;
  /** 地面（GL）的 y */
  groundY: number;
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

/**
 * 這一層被公開通道佔掉的位置（左到右、不重疊）：照通道的位置由左往右排，
 * 和左邊已經排好的重疊時往右推到它的右邊；推出建築外的不排（那一層照樣有牆）。
 */
export function cutsAt(b: Pick<Building, 'width' | 'shafts'>, level: number): Cut[] {
  const W = b.width;
  const queue = b.shafts
    .filter((s) => !isGmShaft(s) && passes(s, level))
    .map((s) => {
      const w = shaftWidth(s);
      return { shaft: s, w, x: clampInt(s.x, 0, Math.max(0, W - w)) };
    })
    .sort((a, c) => a.x - c.x);
  const cuts: Cut[] = [];
  let reach = Number.NEGATIVE_INFINITY;
  for (const { shaft, w, x } of queue) {
    const from = Math.max(x, reach);
    if (from + w > W) continue;
    cuts.push({ shaft, x0: from, x1: from + w });
    reach = from + w;
  }
  return cuts;
}

/** 一層切開來：通道佔的位置、放得下區域的空間（≥ 4 格）、太窄的縫（畫成牆） */
export function partition(
  b: Pick<Building, 'width' | 'shafts'>,
  level: number,
): { cuts: Cut[]; spaces: Span[]; slivers: Span[] } {
  const cuts = cutsAt(b, level);
  /* 通道之間（與兩端）的空白：[0, 第一條的左], [第一條的右, 第二條的左], …, [最後一條的右, 寬] */
  const edges = [0, ...cuts.flatMap((c) => [c.x0, c.x1]), b.width];
  const spaces: Span[] = [];
  const slivers: Span[] = [];
  for (let i = 0; i < edges.length; i += 2) {
    const run = { x0: edges[i], x1: edges[i + 1] };
    const w = run.x1 - run.x0;
    if (w >= MIN_ROOM) spaces.push(run);
    else if (w > 0) slivers.push(run);
  }
  return { cuts, spaces, slivers };
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
    ...partition(b, floor.level),
  }));
  const stackDepth = ordered.length * fh;
  /* 地面：地上的樓層裡最低的那層（通常是 1F）的下緣；全是地下時是最上面 */
  const aboveGround = floors.filter((f) => f.floor.level > 0);
  const groundY = aboveGround.length ? aboveGround[aboveGround.length - 1].y1 : 0;

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
      .map((f) => f.cuts.find((s) => s.shaft === shaft))
      .find((s) => s !== undefined);
    const w = shaftWidth(shaft);
    const x = slot ? slot.x0 : clampInt(shaft.x, 0, Math.max(0, W - w));
    const y0 = through[0].y0;
    const y1 = through[through.length - 1].y1;
    shafts.push({ shaft, x, y: y0, w, h: y1 - y0, floors: through });
  }

  const roofDepth = roofHeight(b);
  const top = roofDepth + MARGIN.sky;
  return {
    width: W,
    storey: fh,
    roofDepth,
    stackDepth,
    groundY,
    floors,
    rooms,
    shafts,
    world: {
      x: -MARGIN.left,
      y: -top,
      w: W + MARGIN.left + MARGIN.right,
      h: stackDepth + top + MARGIN.ground,
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
