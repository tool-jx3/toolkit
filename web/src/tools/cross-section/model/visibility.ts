/**
 * 誰看得到什麼（GM 用／PL 用／公開差分用）與出現的時機（事件前／事件後）。
 *
 * - PL 用：祕密區域偽裝——地上的蓋成和牆一樣的砌石，地下的不畫（地層接著畫過去）；GM 專用的設備、備註、
 *   通道（含祕密通風管）都不畫；祕密區域裡的備註也不畫；「PL 用不寫名字」的區域不寫名字。
 * - 公開差分用：祕密區域照常畫（不畫 GM 的虛線框），GM 專用的設備、備註、通道、不寫名字的名字一樣拿掉。
 * - 出現時機：只在事件前的東西在「事件後」的環境不畫，只在事件後的東西在其他三種環境不畫。
 */
import { type Box, inRect, isGmShaft } from './layout';
import type { Audience, Fixture, Moment, Note, Room, SectionDoc, Shaft } from './types';

export const shownAt = (o: { only?: Moment }, m: Moment): boolean => !o.only || o.only === m;

export type RoomLook = 'normal' | 'camo' | 'hidden';

/** 區域怎麼畫：照常、偽裝成牆、不畫（地層照畫過去） */
export function roomLook(r: Pick<Box, 'room' | 'under'>, audience: Audience): RoomLook {
  if (audience !== 'player' || !r.room.secret) return 'normal';
  return r.under ? 'hidden' : 'camo';
}

export const fixtureShown = (it: Fixture, audience: Audience, m: Moment): boolean =>
  (audience === 'gm' || !it.secret) && shownAt(it, m);

export const shaftShown = (s: Shaft, audience: Audience): boolean =>
  audience === 'gm' || !isGmShaft(s);

export const nameShown = (room: Pick<Room, 'hideName' | 'secret'>, audience: Audience): boolean =>
  audience === 'gm' || (!room.hideName && !(audience === 'player' && room.secret));

/** 有區域的平面（建築的 Layout、列車的區域＋床下的祕密空間） */
export interface Boxes {
  rooms: readonly Box[];
}

/** 備註的位置（建築的座標）與它所在的區域 */
export function notePlace(L: Boxes, n: Note): { x: number; y: number; owner: Box | null } {
  if (n.room) {
    const r = L.rooms.find((v) => v.room.id === n.room);
    if (r) return { x: r.x + n.rx * r.w, y: r.y + n.ry * r.h, owner: r };
  }
  return { x: n.x, y: n.y, owner: null };
}

/** 這則備註看得到嗎 */
export function noteShown(L: Boxes, n: Note, audience: Audience, m: Moment): boolean {
  if (!shownAt(n, m)) return false;
  if (audience === 'gm') return true;
  if (n.secret) return false;
  if (n.room && !L.rooms.some((r) => r.room.id === n.room)) return false;
  if (audience !== 'player') return true;
  const p = notePlace(L, n);
  if (p.owner) return !p.owner.room.secret;
  return !L.rooms.some((r) => r.room.secret && inRect(r, p.x, p.y));
}

/** 地圖的數字（屬性欄的概要、匯出的說明） */
export function docStats(doc: SectionDoc) {
  const rooms = doc.building.floors.flatMap((f) => f.rooms);
  return {
    floors: doc.building.floors.length,
    above: doc.building.floors.filter((f) => f.level > 0).length,
    below: doc.building.floors.filter((f) => f.level < 0).length,
    rooms: rooms.filter((r) => !r.secret).length,
    secrets: rooms.filter((r) => r.secret).length,
    shafts: doc.building.shafts.length,
    items: doc.items.length,
    gmItems:
      doc.items.filter((it) => it.secret).length +
      doc.notes.filter((n) => n.secret).length +
      doc.building.shafts.filter(isGmShaft).length,
  };
}
