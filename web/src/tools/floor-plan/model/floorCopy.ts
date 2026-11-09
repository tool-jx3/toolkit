/**
 * 上層樓的快速建立（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的 MULTI-FLOOR QUICK SETUP；規格 F308、F309、3.18.4）：
 * 從別一層沿用「外框與樓梯」或整層複製到空的樓層。純函式。
 *
 * 「外框與樓梯」（原作「建物外枠＋階段」的定義）：
 * - 房間：地面類的戶外房間（庭院、門廊・步道、田地、水邊、洞窟、月台、鐵軌、道路、泥土、枯山水）以外的房間，形狀、種類、牆種類、
 *   名字照抄（原作是名字前面加上樓層名，本工具的名字不加）；GM 筆記與鎖定不抄。甲板類（陽台、屋頂平台、甲板）與施工樓板照抄。
 * - 門窗：窗在抄過去的房間的邊上就抄；門只抄兩側都是抄過去的房間的（通到外面的門在上面的樓層會開到半空中，不抄）。
 * - 手畫的牆：中點在抄過去的房間裡（含邊）就抄。
 * - 家具：只抄上下樓層的連接（樓梯、螺旋梯、電梯、梯子、地板的暗門…）。文字、自由線不抄。
 * 「整層複製」：房間、手畫的牆、門窗、家具、自由線全部（文字不抄：線索的說明、房間編號是那一層的）。
 */
import { VERTICAL_LINKS } from './assets';
import { OPEN } from './catalog';
import { openingMid, uid } from './geometry';
import { roomHasPoint, roomHasPointClosed } from './shape';
import type { Floor, Opening, Room, RoomCategory } from './types';

export type FloorCopyMode = 'shell' | 'full';

/** 地面類的戶外房間（外框不抄：上面的樓層沒有地面） */
export const GROUND_CATS: ReadonlySet<RoomCategory> = new Set<RoomCategory>([
  'garden',
  'porch',
  'field',
  'water',
  'cave',
  'platform',
  'track',
  'road',
  'dirt',
  'gravel',
]);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 門窗的兩側（中點往牆的兩側 0.3 格） */
function sides(o: Opening): [{ x: number; y: number }, { x: number; y: number }] {
  const m = openingMid(o);
  return o.o === 'h'
    ? [
        { x: m.x, y: m.y - 0.3 },
        { x: m.x, y: m.y + 0.3 },
      ]
    : [
        { x: m.x - 0.3, y: m.y },
        { x: m.x + 0.3, y: m.y },
      ];
}

/** 抄到別一層的內容（新的 id；不含文字） */
export interface FloorContent {
  rooms: Room[];
  walls: Floor['walls'];
  openings: Opening[];
  items: Floor['items'];
  lines?: Floor['lines'];
}

/** 「外框與樓梯」：見檔案開頭的說明 */
export function floorShell(src: Floor): FloorContent {
  const rooms = src.rooms.filter((r) => !GROUND_CATS.has(r.cat));
  const inRoom = (x: number, y: number) => rooms.some((r) => roomHasPoint(r, x, y));
  const onRoom = (x: number, y: number) => rooms.some((r) => roomHasPointClosed(r, x, y));
  const openings = src.openings.filter((o) => {
    const [a, b] = sides(o);
    if (OPEN[o.kind]?.group === 'window') return inRoom(a.x, a.y) || inRoom(b.x, b.y);
    return inRoom(a.x, a.y) && inRoom(b.x, b.y);
  });
  return {
    rooms: rooms.map((r) => {
      const { note: _n, locked: _l, ...rest } = clone(r);
      return { ...rest, id: uid('r') };
    }),
    walls: src.walls
      .filter((w) => onRoom((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2))
      .map((w) => ({ ...clone(w), id: uid('w') })),
    openings: openings.map((o) => ({ ...clone(o), id: uid('o') })),
    items: src.items
      .filter((i) => VERTICAL_LINKS.has(i.t))
      .map((i) => {
        const { ring: _r, ...rest } = clone(i);
        return { ...rest, id: uid('i') };
      }),
  };
}

/** 「整層複製」：文字以外全部（新的 id；圓形配置的群組換成新的） */
export function floorFullCopy(src: Floor): FloorContent {
  const rings = new Map<string, string>();
  const out: FloorContent = {
    rooms: src.rooms.map((r) => ({ ...clone(r), id: uid('r') })),
    walls: src.walls.map((w) => ({ ...clone(w), id: uid('w') })),
    openings: src.openings.map((o) => ({ ...clone(o), id: uid('o') })),
    items: src.items.map((i) => {
      const c = { ...clone(i), id: uid('i') };
      if (c.ring) {
        if (!rings.has(c.ring)) rings.set(c.ring, uid('g'));
        c.ring = rings.get(c.ring);
      }
      return c;
    }),
  };
  if (src.lines?.length) out.lines = src.lines.map((l) => ({ ...clone(l), id: uid('l') }));
  return out;
}

export const floorCopy = (src: Floor, mode: FloorCopyMode): FloorContent =>
  mode === 'shell' ? floorShell(src) : floorFullCopy(src);

/**
 * 抄進空的樓層：原本的東西（還沒有房間的樓層上的文字、家具…）留著，抄過來的放在下面（清單的前面）。
 * `replace`＝先清空那一層（「把外框複製到上一層」取代有內容的樓層，確認之後）。
 */
export function pasteFloorContent(target: Floor, c: FloorContent, replace = false): void {
  if (replace) {
    target.rooms = [];
    target.walls = [];
    target.openings = [];
    target.items = [];
    target.texts = [];
    delete target.lines;
  }
  target.rooms = [...c.rooms, ...target.rooms];
  target.walls = [...c.walls, ...target.walls];
  target.openings = [...c.openings, ...target.openings];
  target.items = [...c.items, ...target.items];
  const lines = [...(c.lines ?? []), ...(target.lines ?? [])];
  if (lines.length) target.lines = lines;
  else delete target.lines;
}

/** 這一層完全沒有東西 */
export const isBlankFloor = (f: Floor): boolean =>
  !f.rooms.length &&
  !f.walls.length &&
  !f.openings.length &&
  !f.items.length &&
  !f.texts.length &&
  !f.lines?.length;

/**
 * 快速建立時抄哪一層（原作「下の階」優先）：下一層（左邊）有房間就用它，不然上一層，再不然最近的有房間的樓層；
 * 外觀層（打開「顯示內部」的）不算。沒有時 −1。
 */
export function donorFloorIndex(floors: readonly Floor[], active: number): number {
  const ok = (i: number) =>
    i >= 0 &&
    i < floors.length &&
    i !== active &&
    !floors[i].showInside &&
    !!floors[i].rooms.length;
  for (let d = 1; d < floors.length; d++) {
    if (ok(active - d)) return active - d;
    if (ok(active + d)) return active + d;
  }
  return -1;
}
