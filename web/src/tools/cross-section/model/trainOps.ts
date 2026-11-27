/**
 * 列車的操作（直接改傳進來的資料；store 用 Immer 的草稿呼叫）：車廂的增減與排序、換種類、機關車的蒸氣／電氣、
 * 車廂裡的區域的分隔與合併、床下的祕密空間，以及每次改完之後的整理（`settleTrain`）。
 *
 * 規則（數值參考原作）：最多 10 節、至少 1 節；每節 14 格寬，車廂裡的區域排滿 0～14、整數格、每間至少 3 格（最多 4 間），
 * 寬度比例盡量照舊（和建築的區域同一套分配：前面每間四捨五入、最後一間補到底）。
 * 合併時被併掉的那間的設備與備註搬過去；祕密區域併進一般區域時一律改成 GM 專用。機關車沒有床下的祕密空間。
 */
import { S } from '../strings';
import { LOCO_ROOM_NAMES, presetOf } from './cars';
import { isFixtureKind } from './catalog';
import { inRect } from './layout';
import {
  clamp,
  itemRx,
  itemX,
  mergeContents,
  moveDivider,
  newFixture,
  pinNote,
  shareOut,
  uid,
} from './ops';
import { trainLayoutOf, underId } from './trainLayout';
import {
  CAR_W,
  type Car,
  type CarRoom,
  type CarType,
  type LocoKind,
  MAX_CAR_ROOMS,
  MAX_CARS,
  MIN_CAR_ROOM,
  type Note,
  type Train,
} from './types';

/** 照種類的預設：車廂裡的區域與設備（設備放進 t.items） */
function furnishCar(t: Train, car: Car, type: CarType): void {
  car.rooms = [];
  let x = 0;
  for (const [name, x1, wall, items, role, open] of presetOf(type, t.loco)) {
    const room: CarRoom = { id: uid('cr'), name, wall, secret: false, hideName: false, x0: x, x1 };
    if (role) room.role = role;
    if (open) room.open = true;
    car.rooms.push(room);
    x = x1;
    for (const [kind, rx, ry, flip, variant, scale] of items)
      if (isFixtureKind(kind))
        t.items.push(newFixture(room.id, kind, { rx, ry, flip, variant, scale }));
  }
}

/** 新的一節（設備放進 t.items；還沒接進列車） */
export function makeCar(t: Train, type: CarType): Car {
  const car: Car = {
    id: uid('car'),
    type,
    name: S.cars[type],
    rooms: [],
    coupler: 'normal',
    hatch: type !== 'loco',
    under: false,
    underName: S.train.underName,
  };
  furnishCar(t, car, type);
  return car;
}

/** 新的列車：機關車（蒸氣）＋普通客車＋行李・貨物車 */
export function blankTrain(): Train {
  const t: Train = {
    arrange: 'auto',
    loco: 'steam',
    scenery: 'starlit',
    roofRoute: true,
    cars: [],
    items: [],
    notes: [],
  };
  for (const type of ['loco', 'coach', 'baggage'] as const) t.cars.push(makeCar(t, type));
  return t;
}

export const carById = (t: Train, id: string): Car | undefined => t.cars.find((c) => c.id === id);

export function findCarRoom(t: Train, id: string): { car: Car; room: CarRoom } | null {
  for (const car of t.cars) {
    const room = car.rooms.find((r) => r.id === id);
    if (room) return { car, room };
  }
  return null;
}

/** 這些車廂裡的區域（與開著的床下的祕密空間）的 id */
function liveIds(t: Train): { rooms: Set<string>; boxes: Set<string> } {
  const rooms = new Set<string>();
  const boxes = new Set<string>();
  for (const c of t.cars) {
    for (const r of c.rooms) {
      rooms.add(r.id);
      boxes.add(r.id);
    }
    if (c.under) boxes.add(underId(c.id));
  }
  return { rooms, boxes };
}

/**
 * 改完之後整理一次：最多 10 節；每節的區域左到右排、超過 4 間的由右往左併進左鄰、排滿 0～14（每間至少 3 格）；
 * 機關車沒有床下的祕密空間；拿掉指到不存在的區域的設備與備註。回傳：合併時是否有祕密的東西改成 GM 專用。
 */
export function settleTrain(t: Train): boolean {
  if (t.cars.length > MAX_CARS) t.cars.length = MAX_CARS;
  let leaked = false;
  for (const car of t.cars) {
    if (car.type === 'loco') car.under = false;
    if (!car.rooms.length)
      car.rooms = [
        {
          id: uid('cr'),
          name: car.name,
          wall: 'wood',
          secret: false,
          hideName: false,
          x0: 0,
          x1: CAR_W,
        },
      ];
    const row = [...car.rooms].sort((a, b) => a.x0 - b.x0);
    for (let k = row.length - 1; k >= MAX_CAR_ROOMS; k--)
      if (mergeContents(t, row[k], row[k - 1])) leaked = true;
    row.length = Math.min(row.length, MAX_CAR_ROOMS);
    shareOut({ x0: 0, x1: CAR_W }, row, MIN_CAR_ROOM);
    car.rooms = row;
  }
  const { rooms, boxes } = liveIds(t);
  t.items = t.items.filter((it) => rooms.has(it.room));
  t.notes = t.notes.filter((n) => n.room === null || boxes.has(n.room));
  return leaked;
}

/* ---------- 車廂 ---------- */

/** 在最後面接一節；滿 10 節時回傳 null */
export function addCar(t: Train, type: CarType): Car | null {
  if (t.cars.length >= MAX_CARS) return null;
  const car = makeCar(t, type);
  t.cars.push(car);
  settleTrain(t);
  return car;
}

/** 拿掉一節（至少留一節）：裡面的設備與備註一起拿掉 */
export function removeCar(t: Train, id: string): boolean {
  const at = t.cars.findIndex((c) => c.id === id);
  if (at < 0 || t.cars.length < 2) return false;
  t.cars.splice(at, 1);
  settleTrain(t);
  return true;
}

/** 往前（−1）或往後（＋1）挪一節 */
export function moveCar(t: Train, id: string, dir: -1 | 1): boolean {
  const at = t.cars.findIndex((c) => c.id === id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= t.cars.length) return false;
  const [car] = t.cars.splice(at, 1);
  t.cars.splice(to, 0, car);
  return true;
}

/** 換種類：區域與設備換成那種的預設（原本的設備、區域裡的備註拿掉；名字換成種類名） */
export function setCarType(t: Train, id: string, type: CarType): void {
  const car = carById(t, id);
  if (!car) return;
  const old = new Set(car.rooms.map((r) => r.id));
  t.items = t.items.filter((it) => !old.has(it.room));
  t.notes = t.notes.filter((n) => !(n.room && old.has(n.room)));
  car.type = type;
  car.name = S.cars[type];
  car.hatch = type !== 'loco';
  furnishCar(t, car, type);
  settleTrain(t);
}

/**
 * 機關車換成蒸氣或電氣：每節機關車的駕駛室換到後面（蒸氣）或前面（電氣），寬度照舊、名字沒改過的跟著換，
 * 運轉台與鍋爐的樣式跟著換（設備跟著所在的區域移動）；其他設備與區域的設定都留著。
 */
export function setLocoKind(t: Train, kind: LocoKind): void {
  t.loco = kind;
  const preset = presetOf('loco', kind);
  const names = { cab: '', engine: '' };
  for (const [name, , , , role] of preset)
    if (role === 'cab' || role === 'engine') names[role] = name;
  for (const car of t.cars) {
    if (car.type !== 'loco' || car.rooms.length !== 2) continue;
    const cab = car.rooms.find((r) => r.role === 'cab') ?? car.rooms[1];
    const engine = car.rooms.find((r) => r !== cab) ?? car.rooms[0];
    cab.role = 'cab';
    engine.role = 'engine';
    const cw = clamp(cab.x1 - cab.x0, MIN_CAR_ROOM, CAR_W - MIN_CAR_ROOM);
    const [first, second] = kind === 'electric' ? [cab, engine] : [engine, cab];
    first.x0 = 0;
    first.x1 = first === cab ? cw : CAR_W - cw;
    second.x0 = first.x1;
    second.x1 = CAR_W;
    car.rooms = [first, second];
    for (const r of [cab, engine])
      if (LOCO_ROOM_NAMES.has(r.name)) r.name = names[r.role === 'cab' ? 'cab' : 'engine'];
    for (const it of t.items) {
      if (it.room !== cab.id && it.room !== engine.id) continue;
      if (it.kind === 'cabdesk') {
        if (kind === 'electric') it.variant = 'electric';
        else delete it.variant;
        it.flip = kind === 'electric';
      } else if (it.kind === 'boiler') {
        if (kind === 'electric') it.variant = 'electric';
        else delete it.variant;
      }
    }
  }
  settleTrain(t);
}

/** 床下的祕密空間開關（關掉時裡面的備註留在原地、改成區域外的備註） */
export function setUnder(t: Train, carId: string, on: boolean): void {
  const car = carById(t, carId);
  if (!car || car.type === 'loco') return;
  if (!on) {
    const L = trainLayoutOf(t);
    const box = L.unders.find((u) => u.car.id === carId);
    for (const n of t.notes)
      if (n.room === underId(carId) && box) {
        n.x = box.x + n.rx * box.w;
        n.y = box.y + n.ry * box.h;
        n.room = null;
      }
  }
  car.under = on;
  settleTrain(t);
}

/* ---------- 車廂裡的區域 ---------- */

export type SplitResult = 'ok' | 'max' | 'narrow';

/** 這節多分一間：從最寬的那間的中間分開（要有 6 格以上）；新的一間是空的、內牆照舊，右半邊的設備搬過去 */
export function splitCarRoom(t: Train, carId: string): SplitResult {
  const car = carById(t, carId);
  if (!car) return 'narrow';
  if (car.rooms.length >= MAX_CAR_ROOMS) return 'max';
  const wide = [...car.rooms].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))[0];
  if (!wide || wide.x1 - wide.x0 < MIN_CAR_ROOM * 2) return 'narrow';
  const mid = wide.x0 + Math.floor((wide.x1 - wide.x0) / 2);
  const added: CarRoom = {
    id: uid('cr'),
    name: S.train.newRoom,
    wall: wide.wall,
    secret: false,
    hideName: false,
    x0: mid,
    x1: wide.x1,
  };
  const keep = { x0: wide.x0, x1: mid };
  for (const it of t.items) {
    if (it.room !== wide.id) continue;
    const x = itemX(wide, it.rx);
    const to = x < mid ? keep : added;
    if (to === added) it.room = added.id;
    it.rx = Math.round(clamp(itemRx(to, x), 0.05, 0.95) * 1000) / 1000;
  }
  for (const n of t.notes) {
    if (n.room !== wide.id) continue;
    const x = wide.x0 + n.rx * (wide.x1 - wide.x0);
    const to = x < mid ? keep : added;
    if (to === added) n.room = added.id;
    n.rx = Math.round(clamp((x - to.x0) / (to.x1 - to.x0), 0.02, 0.98) * 1000) / 1000;
  }
  wide.x1 = mid;
  car.rooms.push(added);
  settleTrain(t);
  return 'ok';
}

/** 這節少一間：最右邊兩間合成一間（併進左邊那間） */
export function mergeCarRoom(t: Train, carId: string): { ok: boolean; leaked: boolean } {
  const car = carById(t, carId);
  if (!car || car.rooms.length < 2) return { ok: false, leaked: false };
  const row = [...car.rooms].sort((a, b) => a.x0 - b.x0);
  const right = row[row.length - 1];
  const left = row[row.length - 2];
  const leaked = mergeContents(t, right, left);
  left.x1 = right.x1;
  if (right.role === 'deck' && !left.role) left.role = 'deck';
  car.rooms = car.rooms.filter((r) => r !== right);
  settleTrain(t);
  return { ok: true, leaked };
}

/** 移動車廂裡的隔間（整數格；兩邊都至少 3 格） */
export function moveCarDivider(
  t: Train,
  carId: string,
  leftId: string,
  rightId: string,
  x: number,
): boolean {
  const car = carById(t, carId);
  const l = car?.rooms.find((r) => r.id === leftId);
  const r = car?.rooms.find((v) => v.id === rightId);
  return !!(l && r && moveDivider(l, r, x, MIN_CAR_ROOM));
}

/** 改寬度時要動的隔間（右邊有鄰居就動右邊的，不然動左邊的） */
function widthDivider(t: Train, roomId: string) {
  const hit = findCarRoom(t, roomId);
  if (!hit) return null;
  const row = [...hit.car.rooms].sort((a, b) => a.x0 - b.x0);
  const i = row.indexOf(hit.room);
  if (row[i + 1]) return { room: hit.room, pair: [hit.room, row[i + 1]] as const, onRight: true };
  if (row[i - 1]) return { room: hit.room, pair: [row[i - 1], hit.room] as const, onRight: false };
  return null;
}

export function setCarRoomWidth(t: Train, roomId: string, width: number): boolean {
  const h = widthDivider(t, roomId);
  if (!h) return false;
  const [l, r] = h.pair;
  return moveDivider(l, r, h.onRight ? h.room.x0 + width : h.room.x1 - width, MIN_CAR_ROOM);
}

export function carRoomWidthRange(t: Train, roomId: string): { min: number; max: number } | null {
  const h = widthDivider(t, roomId);
  if (!h) return null;
  const other = h.onRight ? h.pair[1].x1 - h.room.x0 : h.room.x1 - h.pair[0].x0;
  return { min: MIN_CAR_ROOM, max: other - MIN_CAR_ROOM };
}

/* ---------- 備註 ---------- */

/** 把備註放到 (x, y)：在車廂裡的區域或床下的祕密空間裡時跟著它，外面就記世界座標 */
export function placeTrainNote(t: Train, n: Note, x: number, y: number): void {
  const L = trainLayoutOf(t);
  pinNote(
    n,
    x,
    y,
    [...L.rooms, ...L.unders].find((b) => inRect(b, x, y)),
  );
}

/** 放置設備時用：這個點在哪一間（床下的祕密空間不能放設備） */
export function carRoomAt(t: Train, x: number, y: number) {
  return trainLayoutOf(t).rooms.find((b) => inRect(b, x, y));
}
