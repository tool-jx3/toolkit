/**
 * 家具跟著房間縮放（2026-10-29，參考 KIIN マップ制作スタジオ；規格 F254、3.14.3、D69）。
 *
 * 改房間的大小（控制點、屬性面板的寬深）時，房間裡的東西跟著移動：
 * - 貼著牆的（離那面牆 0.35 格以內）跟著那面牆（離牆的距離不變）；其他的照在外框裡的相對位置（比例）移動，對齊 0.25 格；
 * - 放在桌上的小物和桌子一組（F255）；家具的大小與方向不變；
 * - 房間的邊上的門窗、貼牆素材跟著那條邊平移（沿著牆的位置不變、夾在新的邊上）；
 * - 文字照比例移動；巢狀的房間與它裡面的東西、手畫的牆不動；
 * - 放不下的夾在新的外框裡（L 形時推出缺角），回傳這種家具的組數。
 */
import { isWallMounted } from './assets';
import { round2, snap } from './geometry';
import { getObj, roomContents } from './ops';
import { cutRect, roomContainsRect, roomContainsRoom, roomPolygon } from './shape';
import { restingOn, SURFACES } from './tabletop';
import type { Floor, Item, Opening, Rect, Room, TextLabel } from './types';

/** 離牆幾格以內算「貼著牆」 */
export const HUG = 0.35;
const EPS = 1e-6;

type Geo = Pick<Room, 'x' | 'y' | 'w' | 'h' | 'cut'>;

interface Edge {
  /** v＝直的邊（x 固定）、h＝橫的邊 */
  o: 'h' | 'v';
  c: number;
  a: number;
  b: number;
}

function edgesOf(r: Geo): Edge[] {
  const pts = roomPolygon(r);
  return pts.map(([x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    return x1 === x2
      ? { o: 'v' as const, c: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) }
      : { o: 'h' as const, c: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) };
  });
}

/** 舊外形的座標 → 新外形的座標（頂點一一對應；不是頂點的照外框的比例） */
function axisMap(
  oldVals: number[],
  newVals: number[],
  o0: number,
  ow: number,
  n0: number,
  nw: number,
) {
  return (v: number) => {
    const i = oldVals.findIndex((u) => Math.abs(u - v) < EPS);
    if (i >= 0) return newVals[i];
    return n0 + ((v - o0) / (ow || 1)) * nw;
  };
}

function unionBox(rs: readonly Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rs.map((r) => r.x + r.w)) - x,
    h: Math.max(...rs.map((r) => r.y + r.h)) - y,
  };
}

/**
 * 一次改大小的手勢（拖曳控制點、屬性面板的寬深欄位從開始打字到確定）：`floor` 裡的家具、門窗、文字先回到手勢開始時
 * （`before`）的位置，再照 `next` 跟著移動（`follow`＝false 時只回到原位）。每一步都從開始時算，所以拖曳或打字的
 * 中間經過很小的大小（例：打「14」先經過 1）也不會把家具擠在一起（2026-10-29 驗證後修訂）。回傳放不下的組數。
 */
export function resizeWithFollow(
  floor: Floor,
  before: Floor,
  orig: Room,
  next: Geo,
  follow: boolean,
): number {
  for (const key of ['items', 'openings', 'texts'] as const)
    for (const ob of before[key] as readonly (Item | Opening | TextLabel)[]) {
      const cur = (floor[key] as (Item | Opening | TextLabel)[]).find((o) => o.id === ob.id);
      if (cur) Object.assign(cur, structuredClone(ob));
    }
  return follow ? followRoomResize(before, orig, next, floor) : 0;
}

/**
 * 房間 orig（改之前）改成 next 的外形之後，把 before（改之前的樓層）裡房間的東西移到 floor（要改的樓層，Immer 的 draft 也可以）。
 * 回傳放不下（不在新的外形裡）的家具組數。外形的種類（長方形／L 形）不同時不動、回傳 0。
 */
export function followRoomResize(before: Floor, orig: Room, next: Geo, floor: Floor): number {
  if (!!orig.cut !== !!next.cut) return 0;
  const op = roomPolygon(orig);
  const np = roomPolygon(next);
  if (op.length !== np.length) return 0;
  const mapX = axisMap(
    op.map((p) => p[0]),
    np.map((p) => p[0]),
    orig.x,
    orig.w,
    next.x,
    next.w,
  );
  const mapY = axisMap(
    op.map((p) => p[1]),
    np.map((p) => p[1]),
    orig.y,
    orig.h,
    next.y,
    next.h,
  );
  const edges = edgesOf(orig);
  const mapEdge = (e: Edge): Edge =>
    e.o === 'v'
      ? { o: 'v', c: mapX(e.c), a: mapY(e.a), b: mapY(e.b) }
      : { o: 'h', c: mapY(e.c), a: mapX(e.a), b: mapX(e.b) };

  /* 房間的東西（巢狀的房間與它裡面的東西不算） */
  const refs = roomContents(before, orig);
  const nested = refs
    .filter((r) => r.type === 'room')
    .map((r) => getObj(before, 'room', r.id) as Room)
    .filter((r) => r && roomContainsRoom(orig, r));
  const skip = new Set<string>();
  for (const n of nested) for (const c of roomContents(before, n)) skip.add(`${c.type}:${c.id}`);
  const mine = refs.filter((r) => !skip.has(`${r.type}:${r.id}`));
  const itemIds = new Set(mine.filter((r) => r.type === 'item').map((r) => r.id));
  const items = before.items.filter((i) => itemIds.has(i.id));

  /* 家具分組：桌子＋放在上面的小物 */
  const units: Item[][] = [];
  const grouped = new Set<string>();
  for (const it of items) {
    if (grouped.has(it.id) || isWallMounted(it.t)) continue;
    if (SURFACES.has(it.t)) {
      const smalls = restingOn(it, before.items).filter((s) => itemIds.has(s.id));
      units.push([it, ...smalls]);
      grouped.add(it.id);
      for (const s of smalls) grouped.add(s.id);
    }
  }
  for (const it of items)
    if (!grouped.has(it.id) && !isWallMounted(it.t)) {
      units.push([it]);
      grouped.add(it.id);
    }

  const ob: Rect = { x: orig.x, y: orig.y, w: orig.w, h: orig.h };
  const nb: Rect = { x: next.x, y: next.y, w: next.w, h: next.h };
  const k = cutRect(next);
  const target = (id: string) => floor.items.find((i) => i.id === id);
  let misfit = 0;

  for (const unit of units) {
    const b = unionBox(unit);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    /* 直的方向：貼著直的邊就跟著那條邊，不然照比例 */
    const along = (o: 'h' | 'v') => {
      const lo = o === 'v' ? b.x : b.y;
      const size = o === 'v' ? b.w : b.h;
      const mid = o === 'v' ? cx : cy;
      const [s0, s1] = o === 'v' ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
      let best: { gap: number; pos: number } | null = null;
      for (const e of edges) {
        if (e.o !== o || !(e.a < s1 - EPS && e.b > s0 + EPS)) continue;
        const m = o === 'v' ? mapX(e.c) : mapY(e.c);
        if (mid < e.c) {
          const gap = e.c - (lo + size);
          if (gap >= -EPS && gap <= HUG && (!best || gap < best.gap))
            best = { gap, pos: m - gap - size };
        } else {
          const gap = lo - e.c;
          if (gap >= -EPS && gap <= HUG && (!best || gap < best.gap)) best = { gap, pos: m + gap };
        }
      }
      if (best) return best.pos;
      const [o0, ow, n0, nw] = o === 'v' ? [ob.x, ob.w, nb.x, nb.w] : [ob.y, ob.h, nb.y, nb.h];
      return snap(n0 + ((mid - o0) / ow) * nw - size / 2, 0.25);
    };
    let nx = along('v');
    let ny = along('h');
    const clampSpan = (v: number, size: number, lo: number, span: number) =>
      size > span ? lo : Math.min(Math.max(v, lo), lo + span - size);
    nx = clampSpan(nx, b.w, nb.x, nb.w);
    ny = clampSpan(ny, b.h, nb.y, nb.h);
    /* L 形：碰到缺角時往房間裡推（移動量小的那個方向） */
    if (k && next.cut) {
      const hit =
        nx < k.x + k.w - EPS &&
        k.x < nx + b.w - EPS &&
        ny < k.y + k.h - EPS &&
        k.y < ny + b.h - EPS;
      if (hit) {
        const west = next.cut.c === 'nw' || next.cut.c === 'sw';
        const north = next.cut.c === 'nw' || next.cut.c === 'ne';
        const px = west ? k.x + k.w : k.x - b.w;
        const py = north ? k.y + k.h : k.y - b.h;
        if (Math.abs(px - nx) <= Math.abs(py - ny)) nx = px;
        else ny = py;
        nx = clampSpan(nx, b.w, nb.x, nb.w);
        ny = clampSpan(ny, b.h, nb.y, nb.h);
      }
    }
    const dx = nx - b.x;
    const dy = ny - b.y;
    for (const it of unit) {
      const t = target(it.id);
      if (!t) continue;
      t.x = round2(it.x + dx);
      t.y = round2(it.y + dy);
    }
    if (!roomContainsRect(next, { x: nx, y: ny, w: b.w, h: b.h })) misfit++;
  }

  /* 房間的邊上的貼牆素材、門窗：跟著那條邊 */
  const onEdge = (o: 'h' | 'v', line: number, a0: number, a1: number) =>
    edges.find(
      (e) => e.o === o && Math.abs(e.c - line) < 0.01 && a0 >= e.a - EPS && a1 <= e.b + EPS,
    );
  for (const it of items) {
    if (!isWallMounted(it.t)) continue;
    const t = target(it.id);
    if (!t) continue;
    const horiz = it.w >= it.h;
    const line = horiz ? it.y + it.h / 2 : it.x + it.w / 2;
    const a0 = horiz ? it.x : it.y;
    const len = horiz ? it.w : it.h;
    const e = onEdge(horiz ? 'h' : 'v', line, a0 + len / 2, a0 + len / 2);
    if (!e) continue;
    const ne = mapEdge(e);
    const start = ne.b - ne.a >= len ? Math.min(Math.max(a0, ne.a), ne.b - len) : ne.a;
    if (horiz) {
      t.x = round2(start);
      t.y = round2(ne.c - it.h / 2);
    } else {
      t.x = round2(ne.c - it.w / 2);
      t.y = round2(start);
    }
  }
  const openingIds = new Set(mine.filter((r) => r.type === 'opening').map((r) => r.id));
  for (const o of before.openings) {
    if (!openingIds.has(o.id)) continue;
    const line = o.o === 'h' ? o.y : o.x;
    const a0 = o.o === 'h' ? o.x : o.y;
    const e = onEdge(o.o, line, a0, a0 + o.len);
    const t = floor.openings.find((x) => x.id === o.id) as Opening | undefined;
    if (!e || !t) continue;
    const ne = mapEdge(e);
    const start = ne.b - ne.a >= o.len ? Math.min(Math.max(a0, ne.a), ne.b - o.len) : ne.a;
    if (o.o === 'h') {
      t.x = round2(start);
      t.y = round2(ne.c);
    } else {
      t.x = round2(ne.c);
      t.y = round2(start);
    }
  }
  /* 文字：照比例 */
  const textIds = new Set(mine.filter((r) => r.type === 'text').map((r) => r.id));
  for (const tx of before.texts) {
    if (!textIds.has(tx.id)) continue;
    const t = floor.texts.find((x) => x.id === tx.id) as TextLabel | undefined;
    if (!t) continue;
    t.x = round2(snap(nb.x + ((tx.x - ob.x) / ob.w) * nb.w, 0.25));
    t.y = round2(snap(nb.y + ((tx.y - ob.y) / ob.h) * nb.h, 0.25));
  }
  return misfit;
}
