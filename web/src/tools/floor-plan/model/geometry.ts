/**
 * 幾何與資料的小工具（純函式）：id、對齊、範圍、門窗的佔位、樓層的外接範圍、面積文字、PL 檢視的樓層。
 */
import { CAT, CELL_M, OPEN, PING_M2 } from './catalog';
import type { Floor, Item, Opening, Project, Rect, Room, SizeMode, TextLabel } from './types';

let seq = 0;
/** 新的 id（同一頁面裡不重複） */
export function uid(prefix: string): string {
  seq = (seq + 1) % 1_679_616;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const snap = (v: number, step: number): number => Math.round(v / step) * step;
export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function emptyFloor(name: string): Floor {
  return { id: uid('f'), name, rooms: [], walls: [], openings: [], items: [], texts: [] };
}

export function emptyProject(name = ''): Project {
  return {
    name,
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors: [emptyFloor('1F')],
    active: 0,
  };
}

/** 家具在自己的座標系（轉向前）的寬、深 */
export function itemLocalSize(item: Pick<Item, 'w' | 'h' | 'rot'>): { w: number; h: number } {
  const swap = item.rot === 90 || item.rot === 270;
  return swap ? { w: item.h, h: item.w } : { w: item.w, h: item.h };
}

export function rectsOverlap(a: Rect, b: Rect, eps = 1e-6): boolean {
  return (
    a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps
  );
}

export function rectContains(outer: Rect, inner: Rect, eps = 1e-6): boolean {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.w <= outer.x + outer.w + eps &&
    inner.y + inner.h <= outer.y + outer.h + eps
  );
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** 門窗佔的範圍（線的兩側各 pad 格） */
export function openingRect(o: Pick<Opening, 'o' | 'x' | 'y' | 'len'>, pad = 0.3): Rect {
  return o.o === 'h'
    ? { x: o.x, y: o.y - pad, w: o.len, h: pad * 2 }
    : { x: o.x - pad, y: o.y, w: pad * 2, h: o.len };
}

/** 門窗的中點 */
export function openingMid(o: Pick<Opening, 'o' | 'x' | 'y' | 'len'>): { x: number; y: number } {
  return o.o === 'h' ? { x: o.x + o.len / 2, y: o.y } : { x: o.x, y: o.y + o.len / 2 };
}

/** 門窗畫出牆外的距離（開門的弧線…）；長的門、拉門不讓外接範圍變得太寬 */
export function openingReach(o: Pick<Opening, 'kind' | 'len'>): number {
  switch (o.kind) {
    case 'door':
    case 'locked':
    case 'broken':
    case 'secret':
      return o.len;
    case 'door2':
      return o.len / 2;
    case 'auto':
      return o.len * 0.35;
    case 'folding':
      return o.len * 0.42;
    case 'hole':
      return 1;
    default:
      return 0.5;
  }
}

/** 文字的大略範圍（外接範圍、範圍選取的備用值；精確的範圍要量字寬，見 draw/labels.ts） */
export function roughTextRect(t: Pick<TextLabel, 'x' | 'y'>): Rect {
  return { x: t.x - 2, y: t.y - 0.5, w: 4, h: 1 };
}

/** 樓層所有東西的外接範圍（沒有東西時 null） */
export function floorBounds(floor: Floor): Rect | null {
  let box: Rect | null = null;
  for (const r of floor.rooms) box = unionRect(box, r);
  for (const i of floor.items) box = unionRect(box, i);
  for (const w of floor.walls) {
    box = unionRect(box, {
      x: Math.min(w.x1, w.x2),
      y: Math.min(w.y1, w.y2),
      w: Math.abs(w.x2 - w.x1),
      h: Math.abs(w.y2 - w.y1),
    });
  }
  for (const o of floor.openings) box = unionRect(box, openingRect(o, openingReach(o)));
  for (const t of floor.texts) box = unionRect(box, roughTextRect(t));
  return box;
}

/** 好幾層的共同外接範圍 */
export function floorsBounds(floors: readonly Floor[]): Rect | null {
  let box: Rect | null = null;
  for (const f of floors) {
    const b = floorBounds(f);
    if (b) box = unionRect(box, b);
  }
  return box;
}

/** 房間面積（㎡） */
export function roomArea(room: Pick<Room, 'w' | 'h'>): number {
  return room.w * room.h * CELL_M * CELL_M;
}

/** 一位小數（去掉 -0） */
const fixed1 = (v: number) => (Math.round(v * 10) / 10 + 0).toFixed(1);

/** 公尺的寫法：去掉多餘的 0（1.5、2、0.25） */
export const meterText = (cells: number): string => String(round2(cells * CELL_M));

/** 「3×2.5m」 */
export const metersText = (w: number, h: number): string => `${meterText(w)}×${meterText(h)}m`;

/** 坪數（一位小數） */
export const pingText = (areaM2: number): string => `${fixed1(areaM2 / PING_M2)} 坪`;

/** 房間名字下方的面積文字 */
export function sizeText(room: Pick<Room, 'w' | 'h'>, mode: SizeMode | undefined): string {
  if (!mode || mode === 'none') return '';
  const area = roomArea(room);
  if (mode === 'ping') return pingText(area);
  if (mode === 'm2') return `${fixed1(area)}㎡`;
  return `${fixed1(room.w * CELL_M)}×${fixed1(room.h * CELL_M)}m`;
}

/** 畫面／匯出用的房間（PL 檢視的 GM 房間只剩框：masked） */
export type ShownRoom = Room & { masked?: boolean };
export type ShownFloor = Omit<Floor, 'rooms'> & { rooms: ShownRoom[] };

/** 拿掉隱藏線索（clue）的家具與文字 */
export function withoutClues<F extends ShownFloor>(floor: F): F {
  if (!floor.items.some((i) => i.clue) && !floor.texts.some((t) => t.clue)) return floor;
  return {
    ...floor,
    items: floor.items.filter((i) => !i.clue),
    texts: floor.texts.filter((t) => !t.clue),
  };
}

/**
 * 看得到的樓層：
 * - `hideClues`：拿掉隱藏線索（與 GM／PL 檢視分開切換）。
 * - `playerView`（PL 檢視）：GM 專用的房間只留牆框、名字拿掉（masked，裡面蓋灰）；房間裡的家具、文字、手畫的牆、
 *   巢狀的房間、內側的門窗都拿掉（房間邊上的門窗留著）；其他 GM 專用的東西與暗門也拿掉。
 */
export function visibleFloor(floor: Floor, playerView: boolean, hideClues = false): ShownFloor {
  const f: ShownFloor = hideClues ? withoutClues(floor) : floor;
  if (!playerView) return f;
  const hidden = f.rooms.filter((r) => r.gm);
  const inside = (x: number, y: number) =>
    hidden.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
  const masked = (r: Room): ShownRoom => ({
    id: r.id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    cat: r.cat,
    noWall: r.noWall,
    name: '',
    masked: true,
  });
  return {
    ...f,
    rooms: f.rooms
      .filter((r) => r.gm || !hidden.some((g) => rectContains(g, r)))
      .map((r) => (r.gm ? masked(r) : r)),
    walls: f.walls.filter((w) => !w.gm && !inside((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2)),
    openings: f.openings.filter((o) => {
      if (o.gm || OPEN[o.kind]?.gmOnly) return false;
      const m = openingMid(o);
      return !inside(m.x, m.y);
    }),
    items: f.items.filter((i) => !i.gm && !inside(i.x + i.w / 2, i.y + i.h / 2)),
    texts: f.texts.filter((t) => !t.gm && !inside(t.x, t.y)),
  };
}

/** 有沒有隱藏線索 */
export const floorHasClues = (f: Floor): boolean =>
  f.items.some((i) => i.clue) || f.texts.some((t) => t.clue);

/** 隱藏線索的個數：一個小物＋說明文字算一個；沒有小物時算文字的數量 */
export function clueCount(floors: readonly Floor[]): number {
  return floors.reduce(
    (n, f) => n + (f.items.filter((i) => i.clue).length || f.texts.filter((t) => t.clue).length),
    0,
  );
}

/** 房間種類是不是戶外 */
export const isOutdoor = (cat: Room['cat']): boolean => Boolean(CAT[cat]?.outdoor);
