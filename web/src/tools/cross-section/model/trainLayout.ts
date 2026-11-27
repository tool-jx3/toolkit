/**
 * 列車的幾何（只算、不改資料）：每節車廂、車廂裡的區域、床下的祕密空間、連結器、每一排的位置、整張圖的範圍。
 *
 * 數值參考原作：每節 14 × 6 格、車廂之間隔 1 格；一排的高度 12 格＝車頂 2＋車廂 6＋床下 2＋軌道 2，兩排之間 2 格；
 * 排法「自動」是 4 節以上折成兩排（前一半在上排，多的一節在上排），「兩段折返」2 節以上就折；兩排都是由左往右（機關車在左邊、往左跑）。
 * 床下的祕密空間在前後轉向架之間（車廂左 3 格到右 3 格、8 × 2 格）。世界的範圍：左右各留 3 格（折返的接續牌）、上下各 2 格。
 */
import type { Rect } from './layout';
import {
  type Arrange,
  CAR_GAP,
  CAR_H,
  CAR_W,
  type Car,
  type CarRoom,
  type Coupler,
  type Train,
} from './types';

/** 一排的組成（格） */
export const ROW = { roof: 2, under: 2, track: 2, gap: 2 } as const;
export const ROW_H = ROW.roof + CAR_H + ROW.under + ROW.track;
export const TRAIN_MARGIN = { side: 3, top: 2, bottom: 2 } as const;
/** 床下的祕密空間：車廂左右各縮 3 格 */
export const UNDER_INSET = 3;

/** 床下的祕密空間在資料裡的 id（備註放進去時用） */
export const underId = (carId: string): string => `under:${carId}`;

export interface CarBox extends Rect {
  car: Car;
  /** 第幾節（0 起；車廂編號是 index＋1） */
  index: number;
  row: number;
}

/** 車廂裡的一間（或床下的祕密空間） */
export interface CarRoomBox extends Rect {
  room: CarRoom;
  car: Car;
  index: number;
  /** 床下的祕密空間 */
  under: boolean;
}

export interface CouplerBox extends Rect {
  from: Car;
  to: Car;
  state: Coupler;
}

export interface RowBox {
  index: number;
  /** 這一排的頂（車頂的上面） */
  y: number;
  /** 車廂的頂與底 */
  cabin: number;
  floor: number;
  /** 軌道（鐵軌的上緣） */
  rail: number;
  /** 這一排的寬（從 0 起） */
  w: number;
  cars: CarBox[];
}

export interface TrainLayout {
  folded: boolean;
  rows: RowBox[];
  cars: CarBox[];
  rooms: CarRoomBox[];
  unders: CarRoomBox[];
  couplers: CouplerBox[];
  /** 所有排的高度 */
  depth: number;
  world: Rect;
}

/** 這個排法、這麼多節時折不折成兩排 */
export const twoRows = (arrange: Arrange, n: number): boolean =>
  arrange === 'folded' ? n >= 2 : arrange === 'auto' && n >= 4;

/** 床下的祕密空間當成一間（備註、點選、CCFOLIA 的偽裝用） */
export const underRoom = (car: Car): CarRoom => ({
  id: underId(car.id),
  name: car.underName,
  wall: 'metal',
  secret: true,
  hideName: true,
  x0: UNDER_INSET,
  x1: CAR_W - UNDER_INSET,
});

export function trainLayoutOf(
  t: Pick<Train, 'cars' | 'arrange'>,
  arrange = t.arrange,
): TrainLayout {
  const cars = t.cars;
  const folded = twoRows(arrange, cars.length);
  const split = folded ? Math.ceil(cars.length / 2) : cars.length;
  const groups = folded ? [cars.slice(0, split), cars.slice(split)] : [cars];
  const rows: RowBox[] = [];
  const all: CarBox[] = [];
  const rooms: CarRoomBox[] = [];
  const unders: CarRoomBox[] = [];
  const couplers: CouplerBox[] = [];
  groups.forEach((list, r) => {
    const y = r * (ROW_H + ROW.gap);
    const cabin = y + ROW.roof;
    const row: RowBox = {
      index: r,
      y,
      cabin,
      floor: cabin + CAR_H,
      rail: cabin + CAR_H + ROW.under,
      w: list.length * CAR_W + Math.max(0, list.length - 1) * CAR_GAP,
      cars: [],
    };
    list.forEach((car, k) => {
      const index = r === 0 ? k : split + k;
      const x = k * (CAR_W + CAR_GAP);
      const box: CarBox = { car, index, row: r, x, y: cabin, w: CAR_W, h: CAR_H };
      row.cars.push(box);
      all.push(box);
      for (const room of car.rooms)
        rooms.push({
          room,
          car,
          index,
          under: false,
          x: x + room.x0,
          y: cabin,
          w: room.x1 - room.x0,
          h: CAR_H,
        });
      if (car.under && car.type !== 'loco')
        unders.push({
          room: underRoom(car),
          car,
          index,
          under: true,
          x: x + UNDER_INSET,
          y: cabin + CAR_H,
          w: CAR_W - UNDER_INSET * 2,
          h: ROW.under,
        });
      const next = list[k + 1];
      if (next)
        couplers.push({
          from: car,
          to: next,
          state: car.coupler,
          x: x + CAR_W,
          y: cabin,
          w: CAR_GAP,
          h: CAR_H,
        });
    });
    rows.push(row);
  });
  const depth = rows.length * ROW_H + Math.max(0, rows.length - 1) * ROW.gap;
  const width = Math.max(CAR_W, ...rows.map((r) => r.w));
  return {
    folded,
    rows,
    cars: all,
    rooms,
    unders,
    couplers,
    depth,
    world: {
      x: -TRAIN_MARGIN.side,
      y: -TRAIN_MARGIN.top,
      w: width + TRAIN_MARGIN.side * 2,
      h: depth + TRAIN_MARGIN.top + TRAIN_MARGIN.bottom,
    },
  };
}
