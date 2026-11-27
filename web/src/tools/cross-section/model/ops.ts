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
  partition,
  passes,
  roomAt,
  roomIdsOf,
  type Span,
  shaftWidth,
  touchingPairs,
} from './layout';
import {
  type Building,
  CAPS,
  type Fixture,
  type Floor,
  levelTag,
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
export function newFixture(room: string, kind: string, init: FixtureInit = {}): Fixture {
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
    if (isFixtureKind(kind)) doc.items.push(newFixture(roomId, kind, { rx, ry, flip, variant }));
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
 * 把 gone 併進 keeper（兩間在同一層、相鄰）：設備與備註搬過去、位置照建築裡的位置換算。
 * 回傳：祕密區域的東西是否因此改成 GM 專用。區域本身的左右由呼叫的人改。
 */
export function mergeRoomInto(doc: SectionDoc, gone: Room, keeper: Room): boolean {
  return mergeContents(doc, gone, keeper);
}

/** 兩間的左右與祕密（建築的區域、車廂裡的區域共用） */
type Mergeable = Span & { id: string; secret: boolean };

/**
 * 合併時搬設備與備註（建築與列車共用）：lists 是那一邊的設備與備註（建築：doc；列車：doc.train）。
 * 祕密區域併進一般區域時搬過去的東西一律改成 GM 專用。
 */
export function mergeContents(
  lists: { items: Fixture[]; notes: Note[] },
  gone: Mergeable,
  keeper: Mergeable,
): boolean {
  const doc = lists;
  const leak = gone.secret && !keeper.secret;
  const merged: Span = {
    x0: Math.min(gone.x0, keeper.x0),
    x1: Math.max(gone.x1, keeper.x1),
  };
  for (const it of doc.items) {
    const from = it.room === gone.id ? gone : it.room === keeper.id ? keeper : null;
    if (!from) continue;
    const x = itemX(from, it.rx);
    it.rx = round3(clamp(itemRx(merged, x), RANGES.rx.min, RANGES.rx.max));
    if (from === gone) {
      it.room = keeper.id;
      if (leak) it.secret = true;
    }
  }
  const width = merged.x1 - merged.x0;
  for (const n of doc.notes) {
    const from = n.room === gone.id ? gone : n.room === keeper.id ? keeper : null;
    if (!from) continue;
    const x = from.x0 + n.rx * (from.x1 - from.x0);
    n.rx = round3(clamp((x - merged.x0) / width, 0.02, 0.98));
    if (from === gone) {
      n.room = keeper.id;
      if (leak) n.secret = true;
    }
  }
  return leak;
}

/* ---------- 整理 ---------- */

const crosses = (a: Span, b: Span) => a.x0 < b.x1 && b.x0 < a.x1;

/** 上下有重疊（共用至少一層） */
const sharesLevels = (a: Pick<Shaft, 'top' | 'bottom'>, b: Pick<Shaft, 'top' | 'bottom'>) =>
  a.top >= b.bottom && b.top >= a.bottom;

/** 從 start 開始由近到遠的整數位置（一樣遠時右邊先），只給 lo～hi 裡的 */
function* nearestFirst(start: number, lo: number, hi: number, far: number): Generator<number> {
  for (let d = 0; d <= far; d++) {
    if (start + d >= lo && start + d <= hi) yield start + d;
    if (d > 0 && start - d >= lo && start - d <= hi) yield start - d;
  }
}

function firstOf<T>(list: Iterable<T>, ok: (v: T) => boolean): T | undefined {
  for (const v of list) if (ok(v)) return v;
  return undefined;
}

/** 點到一段的距離（在段裡是 0） */
const gapTo = (sp: Span, x: number) => Math.max(0, sp.x0 - x, x - sp.x1);

/** 離 x 最近的一段（一樣近時取左邊的） */
function nearestSpan(spans: readonly Span[], x: number): number {
  let best = 0;
  spans.forEach((sp, i) => {
    if (gapTo(sp, x) < gapTo(spans[best], x)) best = i;
  });
  return best;
}

/**
 * 一段空間依區域原本的寬度比例分給每一間：先算每間想要的整數格，
 * 再由左往右排，每間至少 4 格、右邊還沒排的也各留 4 格，最後一間拿剩下的。
 */
export function shareOut(span: Span, row: Span[], min: number = MIN_ROOM): void {
  const total = span.x1 - span.x0;
  const weight = row.map((r) => Math.max(min, r.x1 - r.x0 || total / row.length));
  const sum = weight.reduce((a, v) => a + v, 0);
  const wish = weight.map((v) => Math.round((v / sum) * total));
  row.reduce((left, r, k) => {
    const rest = row.length - 1 - k;
    const right = rest === 0 ? span.x1 : clamp(left + wish[k], left + min, span.x1 - rest * min);
    r.x0 = left;
    r.x1 = right;
    return right;
  }, span.x0);
}

/**
 * 一層的區域重新排滿每一段空間：
 * 1. 每間記下「中點最近的那一段」；
 * 2. 沒有區域的段向還有兩間以上的段借一間（借最後記進去的），沒得借就放一間空房；
 * 3. 每段放得下 ⌊寬 ÷ 4⌋ 間，多的由右往左併進左鄰（只搬設備與備註）；
 * 4. 每段照比例分寬度。
 * 回傳：合併時是否有祕密區域的東西改成 GM 專用。
 */
function settleFloor(doc: SectionDoc, floor: Floor): boolean {
  const spans = partition(doc.building, floor.level).spaces;
  if (spans.length === 0) {
    floor.rooms = [];
    return false;
  }
  if (floor.rooms.length === 0) {
    const tag = levelTag(floor.level);
    floor.rooms = spans.map((sp, n) => newRoom(sp, 'empty', `${tag}-${n + 1}`));
    return false;
  }
  const rooms = [...floor.rooms];
  const home = rooms.map((r) => nearestSpan(spans, (r.x0 + r.x1) / 2));
  const count = (i: number) => home.reduce((n, h) => n + (h === i ? 1 : 0), 0);
  spans.forEach((sp, i) => {
    if (count(i) > 0) return;
    const lender = spans.findIndex((_, j) => count(j) > 1);
    if (lender >= 0) home[home.lastIndexOf(lender)] = i;
    else {
      rooms.push(newRoom(sp, 'empty'));
      home.push(i);
    }
  });
  let leaked = false;
  floor.rooms = spans.flatMap((sp, i) => {
    const row = rooms.filter((_, k) => home[k] === i).sort((a, b) => a.x0 - b.x0);
    const fit = Math.max(1, Math.floor((sp.x1 - sp.x0) / MIN_ROOM));
    for (let k = row.length - 1; k >= fit; k--)
      if (mergeRoomInto(doc, row[k], row[k - 1])) leaked = true;
    row.length = Math.min(row.length, fit);
    shareOut(sp, row);
    return row;
  });
  return leaked;
}

/** 通道的上下端夾在現有的樓層裡（上下顛倒時對調）；通風管一定是 GM 專用 */
function tidyEnds(s: Shaft, hi: number, lo: number): void {
  if (s.kind === 'duct') s.secret = true;
  const a = clamp(Math.round(s.top), lo, hi);
  const z = clamp(Math.round(s.bottom), lo, hi);
  s.top = Math.max(a, z);
  s.bottom = Math.min(a, z);
}

/** 通道的位置：GM 專用的照原位；公開的避開已經排好、上下有重疊的公開通道，找最近的空位（找不到就照原位） */
function shaftSpot(b: Building, s: Shaft, settled: readonly Shaft[]): number {
  const w = shaftWidth(s);
  const want = clamp(Math.round(s.x), 0, Math.max(0, b.width - w));
  if (isGmShaft(s)) return want;
  const others = settled
    .filter((o) => sharesLevels(o, s))
    .map((o) => ({ x0: o.x, x1: o.x + shaftWidth(o) }));
  const free = (x: number) => !others.some((o) => crosses(o, { x0: x, x1: x + w }));
  return firstOf(nearestFirst(want, 0, b.width - w, b.width), free) ?? want;
}

/** 電梯的車廂停在經過的樓層（不在時停中間那層） */
function parkCab(s: Shaft, levels: readonly number[]): void {
  const stops = levels.filter((l) => passes(s, l));
  if (stops.length && !stops.includes(s.cab)) s.cab = stops[Math.floor(stops.length / 2)];
}

/**
 * 改完結構之後整理一次：樓層由上往下排、通道的上下端夾在現有的樓層裡、公開通道不重疊、
 * 電梯車廂停在經過的樓層、每層的區域排滿、拿掉指到不存在的區域的設備與備註。
 * 回傳：合併時是否有祕密區域的東西改成 GM 專用。
 */
export function settle(doc: SectionDoc): boolean {
  const b = doc.building;
  b.floors = floorsTopDown(b.floors);
  const levels = b.floors.map((f) => f.level);
  const hi = levels[0] ?? 1;
  const lo = levels[levels.length - 1] ?? 1;
  const settled: Shaft[] = [];
  for (const s of b.shafts) {
    tidyEnds(s, hi, lo);
    s.x = shaftSpot(b, s, settled);
    if (!isGmShaft(s)) settled.push(s);
    if (s.kind === 'elevator') parkCab(s, levels);
  }
  const leaks = b.floors.map((f) => settleFloor(doc, f));
  dropOrphans(doc);
  return leaks.includes(true);
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
  const roomiest = [...floor.rooms].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))[0];
  if (!roomiest || roomiest.x1 - roomiest.x0 < MIN_ROOM * 2) return 'narrow';
  const mid = roomiest.x0 + Math.floor((roomiest.x1 - roomiest.x0) / 2);
  const added = newRoom({ x0: mid, x1: roomiest.x1 }, 'empty');
  added.wall = roomiest.wall;
  /* 右半邊的設備跟著搬到新的區域 */
  for (const it of doc.items) {
    if (it.room !== roomiest.id) continue;
    const x = itemX(roomiest, it.rx);
    if (x < mid) continue;
    it.room = added.id;
    it.rx = round3(clamp(itemRx(added, x), RANGES.rx.min, RANGES.rx.max));
  }
  const keep: Span = { x0: roomiest.x0, x1: mid };
  for (const it of doc.items)
    if (it.room === roomiest.id)
      it.rx = round3(clamp(itemRx(keep, itemX(roomiest, it.rx)), RANGES.rx.min, RANGES.rx.max));
  for (const n of doc.notes) {
    if (n.room !== roomiest.id) continue;
    const x = roomiest.x0 + n.rx * (roomiest.x1 - roomiest.x0);
    const to = x < mid ? keep : added;
    if (to === added) n.room = added.id;
    n.rx = round3(clamp((x - to.x0) / (to.x1 - to.x0), 0.02, 0.98));
  }
  roomiest.x1 = mid;
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
export function dividerRange(
  left: Span,
  right: Span,
  least = MIN_ROOM,
): { min: number; max: number } {
  return { min: left.x0 + least, max: right.x1 - least };
}

/** 移動隔間（整數格；夾在兩間都至少 4 格〔車廂裡 3 格〕的範圍裡）；有移動時回傳 true */
export function moveDivider(left: Span, right: Span, x: number, least = MIN_ROOM): boolean {
  if (left.x1 !== right.x0) return false;
  const { min, max } = dividerRange(left, right, least);
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

/** 這些範圍蓋不到的地方（0～W）裡最長的一段 */
function longestOpening(spans: readonly Span[], W: number): number {
  let edge = 0;
  let best = 0;
  for (const s of [...spans].sort((a, c) => a.x0 - c.x0)) {
    best = Math.max(best, s.x0 - edge);
    edge = Math.max(edge, s.x1);
  }
  return Math.max(best, W - edge);
}

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
  const others = b.shafts
    .filter((s) => !isGmShaft(s) && s.id !== exclude && sharesLevels(s, { top, bottom }))
    .map((s) => ({ x0: s.x, x1: s.x + shaftWidth(s) }));
  const fits = (x: number) => {
    const mine = { x0: x, x1: x + w };
    return (
      !others.some((o) => crosses(o, mine)) && longestOpening([...others, mine], W) >= MIN_ROOM
    );
  };
  const start = clamp(Math.round(prefer ?? (W - w) / 2), 0, W - w);
  return firstOf(nearestFirst(start, 0, W - w, W), fits) ?? -1;
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

/** 改通道的一端：上端選到比下端低（或下端比上端高）時兩端對調 */
export function setShaftEnd(s: Shaft, end: 'top' | 'bottom', level: number): void {
  const other = end === 'top' ? s.bottom : s.top;
  s.top = Math.max(level, other);
  s.bottom = Math.min(level, other);
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
  pinNote(n, x, y, roomAt(layoutOf(doc), x, y));
}

/** 備註放到 (x, y)：hit＝那個點所在的區域（建築或車廂；沒有時記世界座標） */
export function pinNote(
  n: Note,
  x: number,
  y: number,
  hit: { room: { id: string }; x: number; y: number; w: number; h: number } | undefined,
): void {
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
export function makeNote(text: string, style: Note['style'] = 'box'): Note {
  return {
    id: uid('nt'),
    text: text.slice(0, CAPS.note),
    style,
    size: RANGES.noteSize.def,
    room: null,
    rx: 0.5,
    ry: 0.5,
    x: 0,
    y: 0,
  };
}
