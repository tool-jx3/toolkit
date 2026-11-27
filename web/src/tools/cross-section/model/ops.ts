/**
 * 改結構的操作（直接改傳進來的資料；store 用 Immer 的草稿呼叫）：樓層的增減、區域的分隔與合併、隔間的位置、
 * 通道的增減與挪位置，以及每次改完之後的整理（`settle`：區域重新排滿每一段空間、通道不重疊、車廂停在經過的樓層）。
 *
 * 規則（參考原作）：
 * - 一層最多 12 層、每層最多 5 間、一間至少 4 格寬；區域的左右一律是整數格，排滿每一段空間、中間沒有縫。
 * - 合併時被併掉的區域裡的設備與備註搬到留下來的區域（位置照原本在建築裡的位置換算）；
 *   祕密區域併進一般區域時，搬過去的東西一律改成 GM 專用（不會在 PL 用的圖裡露出來）。
 */
import { S } from '../strings';
import { fixtureDef, isFixtureKind, USE_PRESETS } from './catalog';
import {
  floorsTopDown,
  isGmShaft,
  layoutOf,
  passes,
  roomAt,
  roomIdsOf,
  type Span,
  shaftWidth,
  spacesOf,
  touchingPairs,
} from './layout';
import {
  type Building,
  type Fixture,
  type Floor,
  floorCode,
  MAX_FLOORS,
  MAX_ROOMS,
  MIN_ROOM,
  type Note,
  RANGES,
  type Room,
  type RoomUse,
  type SectionDoc,
  SHAFT_WIDTH,
  type Shaft,
  type ShaftKind,
} from './types';

/* ---------- 小工具 ---------- */

let serial = 0;
/** 新的 id（時間＋流水號；同一份資料裡不重複就好） */
export function uid(prefix: string): string {
  serial = (serial + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${serial.toString(36)}`;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** 設備在區域裡左右留的邊（格） */
export const ITEM_PAD = 0.32;

/** 區域裡的左右位置 ↔ 建築裡的 x */
export const itemX = (room: Span, rx: number): number =>
  room.x0 + ITEM_PAD + rx * Math.max(0.8, room.x1 - room.x0 - ITEM_PAD * 2);
export const itemRx = (room: Span, x: number): number =>
  (x - room.x0 - ITEM_PAD) / Math.max(0.8, room.x1 - room.x0 - ITEM_PAD * 2);

/* ---------- 設備 ---------- */

export interface FixtureInit {
  rx?: number;
  ry?: number;
  flip?: boolean;
  variant?: string;
  only?: Fixture['only'] | 'any';
  scale?: number;
}

/** 新的設備（出現時機沒指定時照種類的預設：事件・異變只在事件後） */
export function makeFixture(room: string, kind: string, init: FixtureInit = {}): Fixture {
  const def = fixtureDef(kind);
  const it: Fixture = {
    id: uid('it'),
    room,
    kind,
    rx: round3(clamp(init.rx ?? 0.5, RANGES.rx.min, RANGES.rx.max)),
    ry: round3(clamp(init.ry ?? 0.44, RANGES.ry.min, RANGES.ry.max)),
    scale: clamp(init.scale ?? 1, RANGES.scale.min, RANGES.scale.max),
    flip: !!init.flip,
  };
  const only = init.only === undefined ? def?.only : init.only === 'any' ? undefined : init.only;
  if (only) it.only = only;
  if (init.variant && def?.styles?.includes(init.variant) && init.variant !== def.styles[0])
    it.variant = init.variant;
  return it;
}

/** 照用途重新擺這個區域的設備（原本的設備拿掉） */
export function furnish(doc: SectionDoc, roomId: string, use: RoomUse): void {
  doc.items = doc.items.filter((it) => it.room !== roomId);
  for (const [kind, rx, ry, flip, variant] of USE_PRESETS[use].items)
    if (isFixtureKind(kind)) doc.items.push(makeFixture(roomId, kind, { rx, ry, flip, variant }));
}

/** 換用途：名字、內牆、設備一起換 */
export function applyUse(doc: SectionDoc, room: Room, use: RoomUse): void {
  room.use = use;
  room.wall = USE_PRESETS[use].wall;
  room.name = S.uses[use];
  furnish(doc, room.id, use);
}

const newRoom = (span: Span, use: RoomUse, name = S.uses[use]): Room => ({
  id: uid('rm'),
  name,
  use,
  wall: USE_PRESETS[use].wall,
  secret: false,
  hideName: false,
  x0: span.x0,
  x1: span.x1,
});

/* ---------- 合併 ---------- */

/**
 * 把 victim 併進 survivor（兩間在同一層、相鄰）：設備與備註搬過去、位置照建築裡的位置換算。
 * 回傳：祕密區域的東西是否因此改成 GM 專用。區域本身的左右由呼叫的人改。
 */
export function mergeRoomInto(doc: SectionDoc, victim: Room, survivor: Room): boolean {
  const leak = victim.secret && !survivor.secret;
  const merged: Span = {
    x0: Math.min(victim.x0, survivor.x0),
    x1: Math.max(victim.x1, survivor.x1),
  };
  for (const it of doc.items) {
    const from = it.room === victim.id ? victim : it.room === survivor.id ? survivor : null;
    if (!from) continue;
    const x = itemX(from, it.rx);
    it.rx = round3(clamp(itemRx(merged, x), RANGES.rx.min, RANGES.rx.max));
    if (from === victim) {
      it.room = survivor.id;
      if (leak) it.secret = true;
    }
  }
  const width = merged.x1 - merged.x0;
  for (const n of doc.notes) {
    const from = n.room === victim.id ? victim : n.room === survivor.id ? survivor : null;
    if (!from) continue;
    const x = from.x0 + n.rx * (from.x1 - from.x0);
    n.rx = round3(clamp((x - merged.x0) / width, 0.02, 0.98));
    if (from === victim) {
      n.room = survivor.id;
      if (leak) n.secret = true;
    }
  }
  return leak;
}

/* ---------- 整理 ---------- */

/** 一層的區域重新排滿每一段空間（區域的寬度比例盡量照舊；空間不夠時併掉右邊的） */
function settleFloor(doc: SectionDoc, floor: Floor): boolean {
  const bays = spacesOf(doc.building, floor.level).bays;
  if (bays.length === 0) {
    floor.rooms = [];
    return false;
  }
  if (floor.rooms.length === 0) {
    const code = floorCode(floor.level);
    floor.rooms = bays.map((bay, n) => newRoom(bay, 'empty', `${code}-${n + 1}`));
    return false;
  }
  /* 每間分到中點最近的那一段空間 */
  const groups: Room[][] = bays.map(() => []);
  for (const r of floor.rooms) {
    const mid = (r.x0 + r.x1) / 2;
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    bays.forEach((b, i) => {
      const d = Math.abs(mid - clamp(mid, b.x0, b.x1));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    groups[best].push(r);
  }
  /* 沒有分到的空間：從有兩間以上的借一間，都沒有就放一間空房 */
  groups.forEach((g, i) => {
    if (g.length) return;
    const donor = groups.find((d) => d.length > 1);
    const taken = donor?.pop();
    g.push(taken ?? newRoom(bays[i], 'empty'));
  });
  let leaked = false;
  const out: Room[] = [];
  groups.forEach((g, i) => {
    const bay = bays[i];
    const row = g.sort((a, b) => a.x0 - b.x0);
    /* 放不下的從右邊開始併進左鄰 */
    const room = Math.max(1, Math.floor((bay.x1 - bay.x0) / MIN_ROOM));
    while (row.length > room) {
      const gone = row.pop() as Room;
      const into = row[row.length - 1];
      if (mergeRoomInto(doc, gone, into)) leaked = true;
      into.x1 = Math.max(into.x1, gone.x1);
    }
    shareOut(bay, row);
    out.push(...row);
  });
  floor.rooms = out;
  return leaked;
}

/** 一段空間依區域原本的寬度比例分成整數格：每間至少 4 格，最後一間補到底 */
function shareOut(bay: Span, row: Room[]): void {
  const span = bay.x1 - bay.x0;
  const share = row.map((r) => Math.max(MIN_ROOM, r.x1 - r.x0 || span / row.length));
  const sum = share.reduce((a, v) => a + v, 0);
  let edge = bay.x0;
  row.forEach((r, k) => {
    const after = row.length - 1 - k;
    const w =
      after === 0
        ? bay.x1 - edge
        : clamp(Math.round((share[k] / sum) * span), MIN_ROOM, bay.x1 - edge - after * MIN_ROOM);
    r.x0 = edge;
    edge += w;
    r.x1 = edge;
  });
}

/** 有沒有和別的公開通道在同一層的同一段重疊 */
const overlapsVertically = (a: Shaft, b: Shaft) => a.top >= b.bottom && b.top >= a.bottom;

/**
 * 改完結構之後整理一次：樓層由上往下排、通道的上下端夾在現有的樓層裡、公開通道不重疊、
 * 電梯車廂停在經過的樓層、每層的區域排滿、拿掉指到不存在的區域的設備與備註。
 * 回傳：合併時是否有祕密區域的東西改成 GM 專用。
 */
export function settle(doc: SectionDoc): boolean {
  const b = doc.building;
  b.floors = floorsTopDown(b.floors);
  const levels = b.floors.map((f) => f.level);
  /* 已經由上往下排好：第一個最高、最後一個最低 */
  const hi = levels[0] ?? 1;
  const lo = levels[levels.length - 1] ?? 1;
  const W = b.width;
  const placed: Shaft[] = [];
  for (const s of b.shafts) {
    const w = SHAFT_WIDTH[s.kind] ?? 3;
    if (s.kind === 'duct') s.secret = true;
    let top = clamp(Math.round(s.top), lo, hi);
    let bottom = clamp(Math.round(s.bottom), lo, hi);
    if (top < bottom) [top, bottom] = [bottom, top];
    s.top = top;
    s.bottom = bottom;
    const want = clamp(Math.round(s.x), 0, Math.max(0, W - w));
    if (isGmShaft(s)) s.x = want;
    else {
      const blockers = placed.filter((p) => overlapsVertically(p, s));
      const hits = (x: number) => blockers.some((p) => x < p.x + shaftWidth(p) && x + w > p.x);
      let x = want;
      if (hits(x)) {
        for (let d = 1; d <= W; d++) {
          if (want + d <= W - w && !hits(want + d)) {
            x = want + d;
            break;
          }
          if (want - d >= 0 && !hits(want - d)) {
            x = want - d;
            break;
          }
        }
      }
      s.x = x;
      placed.push(s);
    }
    if (s.kind === 'elevator') {
      const through = levels.filter((l) => l <= s.top && l >= s.bottom);
      if (through.length && !through.includes(s.cab))
        s.cab = through[Math.floor(through.length / 2)];
    }
  }
  let leaked = false;
  for (const f of b.floors) if (settleFloor(doc, f)) leaked = true;
  dropOrphans(doc);
  return leaked;
}

/** 區域不在了的設備與備註（自由放的備註不算）一起刪掉 */
function dropOrphans(doc: SectionDoc): void {
  const live = roomIdsOf(doc.building.floors);
  const stays = (room: string | null) => room === null || live.has(room);
  doc.items = doc.items.filter((it) => stays(it.room));
  doc.notes = doc.notes.filter((n) => stays(n.room));
}

/* ---------- 樓層 ---------- */

const floorById = (doc: SectionDoc, id: string): Floor | undefined =>
  doc.building.floors.find((f) => f.id === id);

/** 加一層（地上：最上面再往上；地下：最下面再往下）；滿 12 層時回傳 null */
export function addFloor(doc: SectionDoc, where: 'above' | 'below'): Floor | null {
  const floors = doc.building.floors;
  if (floors.length >= MAX_FLOORS) return null;
  const levels = floors.map((f) => f.level);
  let level: number;
  if (where === 'above') {
    const top = Math.max(0, ...levels);
    level = top < 1 ? 1 : top + 1;
  } else {
    const bottom = Math.min(1, ...levels);
    level = bottom === 1 ? -1 : bottom - 1;
  }
  if (levels.includes(level)) return null;
  const floor: Floor = {
    id: uid('fl'),
    level,
    name: level > 0 ? S.floor.aboveName : S.floor.belowName,
    rooms: [],
  };
  floors.push(floor);
  settle(doc);
  const use: RoomUse = level > 0 ? 'office' : 'storage';
  for (const r of floor.rooms) applyUse(doc, r, use);
  return floor;
}

/** 刪掉一層（至少留一層）：裡面的設備與備註一起刪 */
export function removeFloor(doc: SectionDoc, floorId: string): boolean {
  const list = doc.building.floors;
  const at = list.findIndex((f) => f.id === floorId);
  if (list.length < 2 || at < 0) return false;
  /* 拿掉之後整理一次：那層的設備與備註會跟著區域一起消失 */
  list.splice(at, 1);
  settle(doc);
  return true;
}

export type SplitResult = 'ok' | 'max' | 'narrow';

/** 這一層多分一間：從最寬的那間的中間分開（要有 8 格以上） */
export function splitFloor(doc: SectionDoc, floorId: string): SplitResult {
  const floor = floorById(doc, floorId);
  if (!floor) return 'narrow';
  if (floor.rooms.length >= MAX_ROOMS) return 'max';
  const widest = [...floor.rooms].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))[0];
  if (!widest || widest.x1 - widest.x0 < MIN_ROOM * 2) return 'narrow';
  const mid = widest.x0 + Math.floor((widest.x1 - widest.x0) / 2);
  const added = newRoom({ x0: mid, x1: widest.x1 }, 'empty');
  added.wall = widest.wall;
  /* 右半邊的設備跟著搬到新的區域 */
  for (const it of doc.items) {
    if (it.room !== widest.id) continue;
    const x = itemX(widest, it.rx);
    if (x < mid) continue;
    it.room = added.id;
    it.rx = round3(clamp(itemRx(added, x), RANGES.rx.min, RANGES.rx.max));
  }
  const keep: Span = { x0: widest.x0, x1: mid };
  for (const it of doc.items)
    if (it.room === widest.id)
      it.rx = round3(clamp(itemRx(keep, itemX(widest, it.rx)), RANGES.rx.min, RANGES.rx.max));
  for (const n of doc.notes) {
    if (n.room !== widest.id) continue;
    const x = widest.x0 + n.rx * (widest.x1 - widest.x0);
    const to = x < mid ? keep : added;
    if (to === added) n.room = added.id;
    n.rx = round3(clamp((x - to.x0) / (to.x1 - to.x0), 0.02, 0.98));
  }
  widest.x1 = mid;
  floor.rooms.push(added);
  settle(doc);
  if (!doc.items.some((it) => it.room === added.id)) furnish(doc, added.id, 'empty');
  return 'ok';
}

/** 這一層少一間：最右邊一組相鄰的兩間合成一間（併進左邊那間） */
export function mergeFloor(doc: SectionDoc, floorId: string): { ok: boolean; leaked: boolean } {
  const floor = floorById(doc, floorId);
  const pair = floor ? touchingPairs(floor.rooms).pop() : undefined;
  if (!floor || !pair) return { ok: false, leaked: false };
  const [left, right] = pair;
  const leaked = mergeRoomInto(doc, right, left);
  left.x1 = right.x1;
  floor.rooms.splice(floor.rooms.indexOf(right), 1);
  settle(doc);
  return { ok: true, leaked };
}

/** 隔間（相鄰兩間的分界）可以移動的範圍 */
export function dividerRange(left: Room, right: Room): { min: number; max: number } {
  return { min: left.x0 + MIN_ROOM, max: right.x1 - MIN_ROOM };
}

/** 移動隔間（整數格；夾在兩間都至少 4 格的範圍裡）；有移動時回傳 true */
export function moveDivider(left: Room, right: Room, x: number): boolean {
  if (left.x1 !== right.x0) return false;
  const { min, max } = dividerRange(left, right);
  const nx = clamp(Math.round(x), min, max);
  if (nx === left.x1) return false;
  left.x1 = nx;
  right.x0 = nx;
  return true;
}

/** 區域的寬：動右邊的隔間（最右一間時動左邊的） */
export function setRoomWidth(doc: SectionDoc, roomId: string, width: number): boolean {
  const h = widthDivider(doc, roomId);
  if (!h) return false;
  const [l, r] = h.pair;
  return moveDivider(l, r, h.onRight ? h.room.x0 + width : h.room.x1 - width);
}

/** 改區域寬度時要動的隔間：右邊貼著別間就動右邊的，不然動左邊的 */
function widthDivider(
  doc: SectionDoc,
  roomId: string,
): { room: Room; pair: [Room, Room]; onRight: boolean } | null {
  for (const f of doc.building.floors) {
    const room = f.rooms.find((r) => r.id === roomId);
    if (!room) continue;
    const pairs = touchingPairs(f.rooms);
    const right = pairs.find((p) => p[0] === room);
    if (right) return { room, pair: right, onRight: true };
    const left = pairs.find((p) => p[1] === room);
    return left ? { room, pair: left, onRight: false } : null;
  }
  return null;
}

/** 這間區域的寬可以改到多少（不能改時 null） */
export function roomWidthRange(
  doc: SectionDoc,
  roomId: string,
): { min: number; max: number } | null {
  const h = widthDivider(doc, roomId);
  if (!h) return null;
  /* 另一間至少留 4 格 */
  const other = h.onRight ? h.pair[1].x1 - h.room.x0 : h.room.x1 - h.pair[0].x0;
  return { min: MIN_ROOM, max: other - MIN_ROOM };
}

/* ---------- 通道 ---------- */

/**
 * 找一個放得下的位置（經過的樓層都不和別的公開通道重疊，而且每層至少留一段 4 格的空間）：
 * 從 prefer 往左右找最近的；找不到回傳 -1。
 */
export function freeShaftX(
  b: Building,
  width: number,
  top: number,
  bottom: number,
  prefer?: number,
  exclude?: string,
): number {
  const W = b.width;
  const w = clamp(Math.round(width), 1, Math.max(1, W - MIN_ROOM));
  const probe = { top, bottom } as Shaft;
  const blockers = b.shafts
    .filter((s) => !isGmShaft(s) && s.id !== exclude && overlapsVertically(s, probe))
    .map((s) => ({ x0: s.x, x1: s.x + shaftWidth(s) }));
  const ok = (x: number) => {
    if (x < 0 || x + w > W) return false;
    if (blockers.some((s) => x < s.x1 && x + w > s.x0)) return false;
    const all = [...blockers, { x0: x, x1: x + w }].sort((a, c) => a.x0 - c.x0);
    let cur = 0;
    let widest = 0;
    for (const s of all) {
      widest = Math.max(widest, s.x0 - cur);
      cur = Math.max(cur, s.x1);
    }
    widest = Math.max(widest, W - cur);
    return widest >= MIN_ROOM;
  };
  const start = clamp(Math.round(prefer ?? (W - w) / 2), 0, W - w);
  for (let d = 0; d <= W; d++) {
    if (ok(start + d)) return start + d;
    if (d > 0 && ok(start - d)) return start - d;
  }
  return -1;
}

/** 加一條通道（經過所有樓層）；放不下時回傳 null */
export function addShaft(doc: SectionDoc, kind: ShaftKind): Shaft | null {
  const b = doc.building;
  const levels = b.floors.map((f) => f.level);
  const top = Math.max(...levels);
  const bottom = Math.min(...levels);
  const w = SHAFT_WIDTH[kind];
  const x =
    kind === 'duct'
      ? Math.max(0, b.width - 2)
      : freeShaftX(b, w, top, bottom, Math.floor((b.width - w) / 2));
  if (x < 0) return null;
  const s: Shaft = {
    id: uid('sh'),
    kind,
    x,
    top,
    bottom,
    cab: top,
    cabState: 'normal',
    secret: kind === 'duct',
  };
  b.shafts.push(s);
  settle(doc);
  return s;
}

export function removeShaft(doc: SectionDoc, id: string): boolean {
  const list = doc.building.shafts;
  const at = list.findIndex((s) => s.id === id);
  if (at < 0) return false;
  list.splice(at, 1);
  settle(doc);
  return true;
}

/** 通道經過的樓層（上到下） */
export const shaftFloors = (b: Building, s: Shaft): Floor[] =>
  floorsTopDown(b.floors).filter((f) => passes(s, f.level));

/** 換通道的種類（寬跟著變；祕密通風管一律 GM 專用） */
export function setShaftKind(doc: SectionDoc, s: Shaft, kind: ShaftKind): void {
  s.kind = kind;
  if (kind === 'duct') s.secret = true;
  s.x = clamp(s.x, 0, Math.max(0, doc.building.width - SHAFT_WIDTH[kind]));
  settle(doc);
}

/** 電梯車廂停的樓層夾在通道經過的樓層裡 */
export function clampCab(doc: SectionDoc, s: Shaft): void {
  const through = shaftFloors(doc.building, s);
  if (through.length && !through.some((f) => f.level === s.cab)) s.cab = through[0].level;
}

/* ---------- 備註 ---------- */

/** 把備註放到 (x, y)（建築的座標）：在區域裡時跟著那間區域，區域外就記世界座標 */
export function placeNote(doc: SectionDoc, n: Note, x: number, y: number): void {
  const hit = roomAt(layoutOf(doc), x, y);
  n.x = round3(x);
  n.y = round3(y);
  if (hit) {
    n.room = hit.room.id;
    n.rx = round3(clamp((x - hit.x) / hit.w, 0.02, 0.98));
    n.ry = round3(clamp((y - hit.y) / hit.h, 0.02, 0.98));
  } else {
    n.room = null;
    n.rx = 0.5;
    n.ry = 0.5;
  }
}

/** 新的備註（三個字以內畫成圓形的編號） */
export function makeNote(text: string): Note {
  const t = text.slice(0, 60);
  return {
    id: uid('nt'),
    text: t,
    style: [...t].length <= 3 ? 'badge' : 'box',
    size: RANGES.noteSize.def,
    room: null,
    rx: 0.5,
    ry: 0.5,
    x: 0,
    y: 0,
  };
}
