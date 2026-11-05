/**
 * 圓形配置（2026-11-05，參考 KIIN マップ制作スタジオ v2.0 的「円形配置」；規格 F279、3.16.3）。純函式。
 *
 * - 選一件家具：在「圓心」四周等間隔放 6 或 8 件（含原本那一件），每一件朝著圓心（椅子的正面朝圓心）；也可以整圈朝外。
 * - 圓心：同一間房裡最近的圓桌、全像投影桌、魔法陣、水井、祭壇、儀式台、展台、營火、噴水池；沒有時是房間（L 形是最大的那一塊）的中心。
 * - 半徑：原本那一件到圓心的距離；有圓心的家具時至少「它的長邊的一半＋這件的深度的一半＋0.36 格」；沒有圓心的家具而且太近（不到 0.8 格）時
 *   用房間短邊的 0.32 倍（至少 1.6 格）。
 * - 一圈是一個群組（`ring`）：再按一次可以整圈換成 6／8 件、內外反轉；群組只看同一間房（複製到別的房間的一圈不受影響）。
 * - 放不下（出了房間、和別的家具或彼此疊在一起、擋到門的開門範圍與門前一格）時**不改**；有小物放在上面的家具先拿開小物。
 */
import { ASSET } from './assets';
import {
  itemCorners,
  itemFootprint,
  itemLocalSize,
  normDeg,
  round2,
  swapsAxes,
  uid,
} from './geometry';
import { blocking, doorKinds, hitsDoor } from './layoutRules';
import { deepClone } from './ops';
import { roomHasCell, roomMainRect } from './shape';
import { restingOn } from './tabletop';
import type { Floor, Item, Room } from './types';

/** 一圈幾件（介面上的兩個按鈕） */
export const RING_COUNTS = [6, 8] as const;

/** 可以當圓心的家具 */
export const RING_HUBS: ReadonlySet<string> = new Set([
  'table_round',
  'holo_table',
  'magic_circle',
  'well',
  'altar',
  'ritual_table',
  'pedestal',
  'campfire',
  'fountain',
]);

/** 有圓心的家具時，離它的間隔（格） */
export const RING_GAP = 0.36;

export type RingFail = 'noRoom' | 'tabletop' | 'space';

export type RingResult =
  | { ok: true; ring: string; remove: string[]; items: Item[] }
  | { ok: false; reason: RingFail };

type Pt = { x: number; y: number };

const center = (it: Pick<Item, 'x' | 'y' | 'w' | 'h'>): Pt => ({
  x: it.x + it.w / 2,
  y: it.y + it.h / 2,
});

/** 這一點所在的房間（那一格的主人＝最後蓋上去的房間） */
export function ownerRoom(floor: Floor, x: number, y: number): Room | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let i = floor.rooms.length - 1; i >= 0; i--)
    if (roomHasCell(floor.rooms[i], cx, cy)) return floor.rooms[i];
  return null;
}

/** 同一圈的家具（同一個 ring、而且在同一間房裡） */
export function ringMembers(floor: Floor, item: Item): Item[] {
  if (!item.ring) return [item];
  const c = center(item);
  const room = ownerRoom(floor, c.x, c.y);
  return floor.items.filter((it) => {
    if (it.ring !== item.ring) return false;
    const p = center(it);
    return ownerRoom(floor, p.x, p.y) === room;
  });
}

/** 轉過的長方形（四個角）重疊：分離軸（只碰到邊不算） */
export function cornersOverlap(a: readonly Pt[], b: readonly Pt[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      const proj = (pts: readonly Pt[]) => pts.map((v) => v.x * nx + v.y * ny);
      const pa = proj(a);
      const pb = proj(b);
      const len = Math.hypot(nx, ny) || 1;
      const overlap =
        Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      /* 這一軸上分得開（或只碰到邊）：不重疊 */
      if (overlap <= 1e-6 * len) return false;
    }
  return true;
}

/** 這一件整個在房間（這間房的格子）裡 */
function insideRoom(floor: Floor, room: Room, it: Item): boolean {
  const c = center(it);
  return itemCorners(it).every((p) => {
    /* 角往中心縮一點點再看格子（剛好在邊上的角算在裡面） */
    const x = p.x + (c.x - p.x) * 0.01;
    const y = p.y + (c.y - p.y) * 0.01;
    return ownerRoom(floor, x, y) === room;
  });
}

/** 一件家具放在 (cx, cy)、方向 rot（外框照最接近的 90°） */
function placed(
  src: Item,
  cx: number,
  cy: number,
  rot: number,
): Pick<Item, 'x' | 'y' | 'w' | 'h' | 'rot'> {
  const loc = itemLocalSize(src);
  const swap = swapsAxes(rot);
  const w = swap ? loc.h : loc.w;
  const h = swap ? loc.w : loc.h;
  return { x: round2(cx - w / 2), y: round2(cy - h / 2), w, h, rot };
}

/**
 * 以 itemId 那一件為準排成一圈 count 件。`outward` 沒給時：原本就在一圈裡就照那一圈現在的朝向，不然朝圓心。
 * 成功時回傳要拿掉的家具（同一圈裡其他的舊成員）與新的一圈（第一件是原本那一件、id 不變）。
 */
export function arrangeRing(
  floor: Floor,
  itemId: string,
  count: number,
  outward?: boolean,
): RingResult {
  const src = floor.items.find((i) => i.id === itemId);
  if (!src) return { ok: false, reason: 'noRoom' };
  const c0 = center(src);
  const room = ownerRoom(floor, c0.x, c0.y);
  if (!room) return { ok: false, reason: 'noRoom' };
  const members = ringMembers(floor, src);
  const memberIds = new Set(members.map((m) => m.id));
  if (members.some((m) => restingOn(m, floor.items).length))
    return { ok: false, reason: 'tabletop' };
  const n = Math.max(2, Math.min(16, Math.round(count)));
  /* 圓心：同一間房裡最近的圓桌、魔法陣…；沒有時房間的中心 */
  let hub: Item | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const it of floor.items) {
    if (memberIds.has(it.id) || !RING_HUBS.has(it.t)) continue;
    const p = center(it);
    if (ownerRoom(floor, p.x, p.y) !== room) continue;
    const d = Math.hypot(p.x - c0.x, p.y - c0.y);
    if (d < best) {
      best = d;
      hub = it;
    }
  }
  const main = roomMainRect(room);
  const hc = hub ? center(hub) : { x: main.x + main.w / 2, y: main.y + main.h / 2 };
  const loc = itemLocalSize(src);
  let radius = Math.hypot(c0.x - hc.x, c0.y - hc.y);
  if (hub) {
    const hl = itemLocalSize(hub);
    radius = Math.max(radius, Math.max(hl.w, hl.h) / 2 + loc.h / 2 + RING_GAP);
  } else if (radius < 0.8) radius = Math.max(1.6, Math.min(main.w, main.h) * 0.32);
  const base = radius > 1e-6 ? Math.atan2(c0.y - hc.y, c0.x - hc.x) : -Math.PI / 2;
  const baseDeg = (base * 180) / Math.PI;
  /* 朝向：rot＝角度＋90° 時正面（rot 0 時朝下的那一面）朝圓心；＋270° 朝外 */
  const out =
    outward ?? (!!src.ring && Math.cos((((src.rot || 0) - baseDeg - 90) * Math.PI) / 180) < 0);
  const ring = src.ring || uid('g');
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const ang = base + (i * Math.PI * 2) / n;
    const cx = hc.x + Math.cos(ang) * radius;
    const cy = hc.y + Math.sin(ang) * radius;
    const rot = Math.round(normDeg((ang * 180) / Math.PI + (out ? 270 : 90))) % 360;
    const it: Item = i === 0 ? { ...deepClone(src) } : { ...deepClone(src), id: uid('i') };
    Object.assign(it, placed(src, cx, cy, rot), { ring });
    items.push(it);
  }
  /* 放得下嗎：在房間裡、彼此不疊、不和別的家具疊、不擋門 */
  const others = floor.items.filter(
    (it) => !memberIds.has(it.id) && blocking(it) && !ASSET[it.t]?.wall,
  );
  const otherCorners = others.map((o) => itemCorners(o));
  const doors = floor.openings.filter(doorKinds);
  const corners = items.map((it) => itemCorners(it));
  const fits = items.every((it, i) => {
    if (!insideRoom(floor, room, it)) return false;
    if (!blocking(it)) return true;
    if (otherCorners.some((oc) => cornersOverlap(corners[i], oc))) return false;
    for (let j = 0; j < i; j++) if (cornersOverlap(corners[i], corners[j])) return false;
    const fp = itemFootprint(it);
    return !doors.some((o) => hitsDoor(o, fp));
  });
  if (!fits) return { ok: false, reason: 'space' };
  return { ok: true, ring, remove: members.filter((m) => m.id !== src.id).map((m) => m.id), items };
}

/** 整圈內外反轉（每一件轉 180°，位置不變） */
export function flipRing(floor: Floor, itemId: string): Map<string, number> {
  const src = floor.items.find((i) => i.id === itemId);
  const out = new Map<string, number>();
  if (!src) return out;
  for (const m of ringMembers(floor, src))
    out.set(m.id, Math.round(normDeg((m.rot || 0) + 180)) % 360);
  return out;
}

/**
 * 單獨移動、複製的家具離開群組（KIIN：個別複製・移動は元の円形グループから独立）：
 * `moved` 裡有 ring、但同一圈的成員沒有全部在 `moved` 裡的那幾件。
 */
export function partialRingIds(floor: Floor, moved: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const checked = new Map<string, boolean>();
  for (const it of floor.items) {
    if (!it.ring || !moved.has(it.id)) continue;
    let whole = checked.get(`${it.ring}|${it.id}`);
    if (whole === undefined) {
      whole = ringMembers(floor, it).every((m) => moved.has(m.id));
      checked.set(`${it.ring}|${it.id}`, whole);
    }
    if (!whole) out.push(it.id);
  }
  return out;
}

/** 這一圈現在是不是朝外 */
export function ringOutward(floor: Floor, item: Item): boolean {
  const members = ringMembers(floor, item);
  if (members.length < 2) return false;
  const xs = members.map((m) => center(m));
  const cx = xs.reduce((s, p) => s + p.x, 0) / xs.length;
  const cy = xs.reduce((s, p) => s + p.y, 0) / xs.length;
  const c = center(item);
  const deg = (Math.atan2(c.y - cy, c.x - cx) * 180) / Math.PI;
  return Math.cos((((item.rot || 0) - deg - 90) * Math.PI) / 180) < 0;
}
