/**
 * 編輯操作的規則（純函式；要改資料的函式直接改傳進來的物件，給 Immer 的 recipe 用）：
 * 房間裡有什麼、一起移動的東西、旋轉、複製的位移、上下層。
 */
import { SWING_DOORS } from './catalog';
import { openingMid, rectContains, round2, uid } from './geometry';
import {
  type Floor,
  type Item,
  type ObjType,
  type Opening,
  type Rect,
  type Room,
  type SelRef,
  type TextLabel,
  TYPE_KEY,
  type Wall,
} from './types';

export type AnyObj = Room | Item | Opening | Wall | TextLabel;

/** 深拷貝（Immer 的 draft 也可以） */
export const deepClone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function getObj(floor: Floor, type: ObjType, id: string): AnyObj | null {
  const arr = floor[TYPE_KEY[type]] as AnyObj[];
  return arr.find((o) => o.id === id) ?? null;
}

export const refKey = (s: SelRef): string => `${s.type}:${s.id}`;

/** 房間裡的東西：家具（中心在房間內）、文字、門窗（中點在房間邊上或裡面）、巢狀的房間、兩端都在房間裡的手畫牆 */
export function roomContents(floor: Floor, room: Room): SelRef[] {
  const out: SelRef[] = [];
  const closed = (x: number, y: number) =>
    x >= room.x - 1e-6 &&
    x <= room.x + room.w + 1e-6 &&
    y >= room.y - 1e-6 &&
    y <= room.y + room.h + 1e-6;
  const open = (x: number, y: number) =>
    x > room.x && x < room.x + room.w && y > room.y && y < room.y + room.h;
  for (const i of floor.items)
    if (open(i.x + i.w / 2, i.y + i.h / 2)) out.push({ type: 'item', id: i.id });
  for (const t of floor.texts) if (open(t.x, t.y)) out.push({ type: 'text', id: t.id });
  for (const o of floor.openings) {
    const m = openingMid(o);
    if (closed(m.x, m.y)) out.push({ type: 'opening', id: o.id });
  }
  for (const r of floor.rooms)
    if (r.id !== room.id && rectContains(room, r)) out.push({ type: 'room', id: r.id });
  for (const w of floor.walls)
    if (closed(w.x1, w.y1) && closed(w.x2, w.y2)) out.push({ type: 'wall', id: w.id });
  return out;
}

/** 選取的東西＋選取的房間裡的東西（alone＝只有房間本身） */
export function withContents(floor: Floor, sel: readonly SelRef[], alone = false): SelRef[] {
  const seen = new Set<string>();
  const out: SelRef[] = [];
  const add = (s: SelRef) => {
    const k = refKey(s);
    if (seen.has(k) || !getObj(floor, s.type, s.id)) return;
    seen.add(k);
    out.push(s);
  };
  for (const s of sel) add(s);
  if (!alone)
    for (const s of sel) {
      if (s.type !== 'room') continue;
      const r = getObj(floor, 'room', s.id) as Room | null;
      if (r) for (const c of roomContents(floor, r)) add(c);
    }
  return out;
}

const isLockedRoom = (floor: Floor, s: SelRef) =>
  s.type === 'room' && Boolean((getObj(floor, 'room', s.id) as Room | null)?.locked);

/**
 * 可以移動的東西：鎖定的房間不動，它裡面的東西也不動——除非是被一起帶著走的（選取的房間比那個鎖定的房間小，
 * 例如鎖定的大廳裡的衣櫃）或是直接選取的。alone＝只動房間本身（Alt）。
 */
export function movable(floor: Floor, sel: readonly SelRef[], alone = false): SelRef[] {
  const top = sel.filter((s) => !isLockedRoom(floor, s));
  const carried = alone
    ? []
    : top
        .filter((s) => s.type === 'room')
        .map((s) => {
          const room = getObj(floor, 'room', s.id) as Room;
          return { room, keys: new Set(roomContents(floor, room).map(refKey)) };
        });
  const pinned = new Set<string>();
  for (const r of floor.rooms) {
    if (!r.locked) continue;
    pinned.add(`room:${r.id}`);
    for (const c of roomContents(floor, r)) {
      const k = refKey(c);
      if (!carried.some((cr) => cr.keys.has(k) && cr.room.w * cr.room.h < r.w * r.h)) pinned.add(k);
    }
  }
  const picked = new Set(top.map(refKey));
  return withContents(floor, top, alone).filter(
    (s) => !pinned.has(refKey(s)) || (picked.has(refKey(s)) && !isLockedRoom(floor, s)),
  );
}

export function translateObj(type: ObjType, o: AnyObj, dx: number, dy: number): void {
  if (type === 'wall') {
    const w = o as Wall;
    w.x1 = round2(w.x1 + dx);
    w.x2 = round2(w.x2 + dx);
    w.y1 = round2(w.y1 + dy);
    w.y2 = round2(w.y2 + dy);
  } else {
    const p = o as Room | Item | Opening | TextLabel;
    p.x = round2(p.x + dx);
    p.y = round2(p.y + dy);
  }
}

/** 家具以中心轉 delta 度（90 的倍數；寬高對調） */
export function rotateItem(item: Item, delta: number): void {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  item.rot = ((((item.rot || 0) + delta) % 360) + 360) % 360;
  if (Math.abs(delta) % 180 === 90) {
    const w = item.w;
    item.w = item.h;
    item.h = w;
  }
  item.x = round2(cx - item.w / 2);
  item.y = round2(cy - item.h / 2);
}

/**
 * 房間連同裡面的東西（家具、門窗、文字、手畫的牆、巢狀的房間）順時針轉 90°。
 * 中心是所有選取房間的外接範圍中心；轉完讓房間的左上角落在整數格上。`refs` 是要轉的東西（movable 的結果）。
 */
export function rotateRoomsCW(floor: Floor, rooms: readonly Room[], refs: readonly SelRef[]): void {
  if (!rooms.length) return;
  const x1 = Math.min(...rooms.map((r) => r.x));
  const y1 = Math.min(...rooms.map((r) => r.y));
  const x2 = Math.max(...rooms.map((r) => r.x + r.w));
  const y2 = Math.max(...rooms.map((r) => r.y + r.h));
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  /* 順時針 90°：(x, y) → (cx + cy − y, cy − cx + x)；房間的新左上角＝舊的左下角轉過去，取整數 */
  const dx = Math.round(cx + cy - y2) - (cx + cy - y2);
  const dy = Math.round(cy - cx + x1) - (cy - cx + x1);
  const pt = (x: number, y: number): [number, number] => [
    round2(cx + cy - y + dx),
    round2(cy - cx + x + dy),
  ];
  const rect = (o: Rect) => {
    const [ax, ay] = pt(o.x, o.y + o.h);
    const w = o.w;
    o.x = ax;
    o.y = ay;
    o.w = o.h;
    o.h = w;
  };
  for (const { type, id } of refs) {
    const o = getObj(floor, type, id);
    if (!o) continue;
    if (type === 'room') {
      const r = o as Room;
      rect(r);
      if (r.lx || r.ly) {
        const lx = round2(-(r.ly || 0));
        const ly = round2(r.lx || 0);
        delete r.lx;
        delete r.ly;
        if (lx) r.lx = lx;
        if (ly) r.ly = ly;
      }
    } else if (type === 'item') {
      const it = o as Item;
      rect(it);
      it.rot = ((it.rot || 0) + 90) % 360;
    } else if (type === 'text') {
      const t = o as TextLabel;
      [t.x, t.y] = pt(t.x, t.y);
    } else if (type === 'wall') {
      const w = o as Wall;
      [w.x1, w.y1] = pt(w.x1, w.y1);
      [w.x2, w.y2] = pt(w.x2, w.y2);
    } else {
      rotateOpeningCW(o as Opening, pt);
    }
  }
}

/**
 * 門窗順時針轉 90°。開門（弧線）的 side 以畫面方向為準（橫線往下、直線往右是 +）；拉門、摺疊門等以線的方向為準
 * （直線時往左是 +），所以兩種的 side 換法不同。
 */
export function rotateOpeningCW(o: Opening, pt: (x: number, y: number) => [number, number]): void {
  const swing = SWING_DOORS.has(o.kind);
  const flip = () => {
    o.side = o.side === -1 ? 1 : -1;
  };
  if (o.o === 'h') {
    /* 橫 → 直：起點變成上端；下側變成左側 */
    [o.x, o.y] = pt(o.x, o.y);
    o.o = 'v';
    if (swing) flip();
  } else {
    /* 直 → 橫：下端變成起點（左端），所以鉸鍊換邊；右側變成下側、左側變成上側 */
    [o.x, o.y] = pt(o.x, o.y + o.len);
    o.o = 'h';
    o.hinge = o.hinge ? 0 : 1;
    if (!swing) flip();
  }
}

/** 複製、貼上的位移：有房間時往右移「房間們的總寬」，否則右下各 1 格 */
export function copyOffset(floor: Floor, refs: readonly SelRef[]): { dx: number; dy: number } {
  const rooms = refs
    .filter((s) => s.type === 'room')
    .map((s) => getObj(floor, 'room', s.id) as Room | null)
    .filter((r): r is Room => !!r);
  if (!rooms.length) return { dx: 1, dy: 1 };
  const x1 = Math.min(...rooms.map((r) => r.x));
  const x2 = Math.max(...rooms.map((r) => r.x + r.w));
  return { dx: x2 - x1, dy: 0 };
}

/** 複製一個東西（新 id、拿掉鎖定、位移） */
export function cloneObj<T extends AnyObj>(type: ObjType, o: T, dx: number, dy: number): T {
  const copy = deepClone(o);
  copy.id = uid(type[0]);
  delete (copy as Partial<Room>).locked;
  translateObj(type, copy, dx, dy);
  return copy;
}

/** 選取的房間、家具移到最上層（toFront）或最下層；其他種類的順序不影響 */
export function reorder(floor: Floor, sel: readonly SelRef[], toFront: boolean): void {
  for (const type of ['room', 'item'] as const) {
    const ids = new Set(sel.filter((s) => s.type === type).map((s) => s.id));
    if (!ids.size) continue;
    const key = TYPE_KEY[type];
    const arr = floor[key] as (Room | Item)[];
    const moving = arr.filter((o) => ids.has(o.id));
    const rest = arr.filter((o) => !ids.has(o.id));
    (floor[key] as (Room | Item)[]) = toFront ? rest.concat(moving) : moving.concat(rest);
  }
}

/** 下一個樓層的預設名字：現有「nF」的最大 n ＋ 1 */
export function nextFloorName(floors: readonly Floor[]): string {
  const nums = floors.map((f) => {
    const m = /^(\d+)\s*F$/i.exec(f.name || '');
    return m ? Number(m[1]) : 0;
  });
  return `${Math.max(0, ...nums) + 1}F`;
}

/** 範本載入後先顯示的樓層：名字是 1F 的那一層（沒有時第一層） */
export function groundFloorIndex(floors: readonly Floor[]): number {
  const i = floors.findIndex((f) => /^1\s*F$|^1\s*樓$/i.test(f.name.trim()));
  return i >= 0 ? i : 0;
}

/** 整層複製（所有東西換新 id） */
export function cloneFloor(f: Floor, name: string): Floor {
  const copy = deepClone(f);
  copy.id = uid('f');
  copy.name = name;
  for (const type of ['room', 'item', 'opening', 'wall', 'text'] as const)
    for (const o of copy[TYPE_KEY[type]] as AnyObj[]) o.id = uid(type[0]);
  return copy;
}
