/**
 * 外觀層的「顯示內部」（2026-10 第二批，原作 v1.12；規格 F230、3.10）。
 *
 * 外觀層＝用「建物（屋頂）」房間畫建築物外觀的樓層（敷地圖），門窗和室內層的座標相同。打開「顯示內部」時：
 * - 拿掉這一層的屋頂房間，以及整個落在屋頂或內部樓層的某一間房間裡的其他房間（屋頂上的露台、蓋在建物上的東西）；
 *   放在這些房間上面的家具、文字、手畫的牆（中心點在房間裡面）一起拿掉。包住整棟建物的大庭院留著
 *   （內部的房間疊在它上面，牆照一般的規則；原作用「中心點在內部的房間裡」判斷，大庭院也會被拿掉，D41）；
 * - 把內部樓層的房間（屋頂除外）、手畫的牆、門窗、家具、文字疊在同樣的位置；
 * - 外觀層和內部樓層在同一個位置、同一個方向的門窗只留內部樓層的那一個（不會畫兩次）；
 * - 留下來的外觀房間（大庭院）的名字落在內部樓層的房間裡時不畫（不然「庭院」寫在室內的房間上）。
 *
 * 畫面與匯出畫的是疊好的樓層（composedFloor）；點選、框選、全選、編輯只對外觀層自己留下來的東西（ownFloor）。
 */
import { ROOF_CATEGORY } from './catalog';
import { rectContains } from './geometry';
import type { Floor, Opening, Room } from './types';

/** 疊上來的樓層：`inside` 指的那一層，找不到時第一個別的樓層；沒有打開或只有一層時 null */
export function interiorFloor(floor: Floor, floors: readonly Floor[]): Floor | null {
  if (!floor.showInside) return null;
  const others = floors.filter((f) => f !== floor && f.id !== floor.id);
  return others.find((f) => f.id === floor.inside) ?? others[0] ?? null;
}

const strictlyIn = (rooms: readonly Room[], x: number, y: number) =>
  rooms.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

const openingKey = (o: Pick<Opening, 'o' | 'x' | 'y'>) =>
  `${o.o}|${Math.round(o.x * 1000)}|${Math.round(o.y * 1000)}`;

interface Split {
  /** 外觀層自己留下來的東西 */
  own: Floor;
  /** 疊好的樓層 */
  composed: Floor;
}

function split(floor: Floor, floors: readonly Floor[]): Split | null {
  const inner = interiorFloor(floor, floors);
  if (!inner) return null;
  const roofs = floor.rooms.filter((r) => r.cat === ROOF_CATEGORY);
  const drop = floor.rooms.filter(
    (r) =>
      r.cat === ROOF_CATEGORY ||
      roofs.some((g) => rectContains(g, r)) ||
      inner.rooms.some((g) => rectContains(g, r)),
  );
  const seen = new Set(inner.openings.map(openingKey));
  const own: Floor = {
    ...floor,
    rooms: floor.rooms.filter((r) => !drop.includes(r)),
    walls: floor.walls.filter((w) => !strictlyIn(drop, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2)),
    openings: floor.openings.filter((o) => !seen.has(openingKey(o))),
    items: floor.items.filter((i) => !strictlyIn(drop, i.x + i.w / 2, i.y + i.h / 2)),
    texts: floor.texts.filter((t) => !strictlyIn(drop, t.x, t.y)),
  };
  const labelInside = (r: Room) =>
    !r.hideLabel &&
    strictlyIn(inner.rooms, r.x + r.w / 2 + (r.lx || 0), r.y + r.h / 2 + (r.ly || 0));
  const composed: Floor = {
    ...own,
    rooms: own.rooms
      .map((r) => (labelInside(r) ? { ...r, hideLabel: true } : r))
      .concat(inner.rooms.filter((r) => r.cat !== ROOF_CATEGORY)),
    walls: own.walls.concat(inner.walls),
    openings: own.openings.concat(inner.openings),
    items: own.items.concat(inner.items),
    texts: own.texts.concat(inner.texts),
  };
  return { own, composed };
}

/** 畫面與匯出用：打開「顯示內部」時疊好的樓層，沒有時原本的樓層 */
export function composedFloor(floor: Floor, floors: readonly Floor[]): Floor {
  return split(floor, floors)?.composed ?? floor;
}

/** 點選、編輯用：打開「顯示內部」時外觀層自己留下來的東西（拿掉的屋頂與上面的東西點不到），沒有時原本的樓層 */
export function ownFloor(floor: Floor, floors: readonly Floor[]): Floor {
  return split(floor, floors)?.own ?? floor;
}

/** 好幾層一起（匯出、範本縮圖） */
export const composeFloors = (floors: readonly Floor[], all: readonly Floor[] = floors): Floor[] =>
  floors.map((f) => composedFloor(f, all));
