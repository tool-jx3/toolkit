/**
 * 室內平面圖的範本：格局規則的檢查（規格 F194、F212）。單元測試（floor-plan-templates）與範本的總表共用。
 *
 * 每一層：門窗都在牆上、房間不會半重疊、門的開門範圍與門前一格不放家具、家具不穿過牆、手畫的牆不疊在別的牆上、
 * 門窗不卡在牆裡、地面層以外的門兩側都是房間、線索小物不疊在家具上；整個範本：每間房都走得到。
 * 2026-10 第三批後半：雙開門類（雙開門、大型雙開門）兩端各一片，旋轉門的圓往牆的兩側各凸出半個寬度。
 */
import { ASSET, VERTICAL_LINKS } from '@/tools/floor-plan/model/assets';
import { DOUBLE_DOORS, OPEN, SWING_DOORS } from '@/tools/floor-plan/model/catalog';
import { rectContains, rectsOverlap } from '@/tools/floor-plan/model/geometry';
import { groundFloorIndex } from '@/tools/floor-plan/model/ops';
import type { Floor, Item, Opening, Rect } from '@/tools/floor-plan/model/types';
import { computeWalls, wallLines } from '@/tools/floor-plan/model/walls';

export const EPS = 1e-6;

/* ---------- 格局規則用的幾何 ---------- */

/** 門前（牆的兩側各一條）要空出來的深度：一格 */
export const FRONT = 1;

/** 四分之一圓：圓心（鉸鍊）、半徑（門板長），往 (dx, dy) 那一象限 */
interface Sector {
  cx: number;
  cy: number;
  r: number;
  dx: 1 | -1;
  dy: 1 | -1;
}

/**
 * 門要空出來的範圍：門前一格（牆的兩側，寬度＝門寬）；會開的門另加門板掃過的扇形
 * （單開門類：鉸鍊為圓心、門寬為半徑；雙開門類〔雙開門、大型雙開門，`DOUBLE_DOORS`〕：兩端各一片、半徑是門寬的一半），
 * 折門加門板折出來的深度，旋轉門加圓往牆的兩側凸出的半個寬度（2026-10 第三批後半）。
 */
export function doorClearance(o: Opening): { rects: Rect[]; sectors: Sector[] } {
  const h = o.o === 'h';
  const a = h ? o.x : o.y;
  const c = h ? o.y : o.x;
  const s = o.side < 0 ? -1 : 1;
  /** 沿著牆 [a0, a0＋len]、往牆的 side 那一側 depth 格的長方形 */
  const band = (a0: number, len: number, side: 1 | -1, depth: number): Rect => {
    const c0 = side > 0 ? c : c - depth;
    return h ? { x: a0, y: c0, w: len, h: depth } : { x: c0, y: a0, w: depth, h: len };
  };
  const rects = [band(a, o.len, 1, FRONT), band(a, o.len, -1, FRONT)];
  const sectors: Sector[] = [];
  const leaf = (at: number, dir: 1 | -1, r: number) =>
    sectors.push(h ? { cx: at, cy: c, r, dx: dir, dy: s } : { cx: c, cy: at, r, dx: s, dy: dir });
  if (DOUBLE_DOORS.has(o.kind)) {
    leaf(a, 1, o.len / 2);
    leaf(a + o.len, -1, o.len / 2);
  } else if (SWING_DOORS.has(o.kind)) {
    if (o.hinge) leaf(a + o.len, -1, o.len);
    else leaf(a, 1, o.len);
  } else if (o.kind === 'folding') {
    const panel = o.len >= 2.4 ? o.len / 2 : o.len;
    rects.push(band(a, o.len, s, panel / 2));
  } else if (o.kind === 'revolve') {
    rects.push(band(a, o.len, 1, o.len / 2), band(a, o.len, -1, o.len / 2));
  }
  return { rects, sectors };
}

export const overlapLen = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0);

export const rectHits = (a: Rect, b: Rect) =>
  overlapLen(a.x, a.x + a.w, b.x, b.x + b.w) > EPS &&
  overlapLen(a.y, a.y + a.h, b.y, b.y + b.h) > EPS;

/** 長方形碰到四分之一圓（不算剛好貼著） */
export function sectorHits(s: Sector, r: Rect): boolean {
  const qx0 = Math.min(s.cx, s.cx + s.dx * s.r);
  const qy0 = Math.min(s.cy, s.cy + s.dy * s.r);
  const x0 = Math.max(r.x, qx0);
  const x1 = Math.min(r.x + r.w, qx0 + s.r);
  const y0 = Math.max(r.y, qy0);
  const y1 = Math.min(r.y + r.h, qy0 + s.r);
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return false;
  const px = Math.min(Math.max(s.cx, x0), x1);
  const py = Math.min(Math.max(s.cy, y0), y1);
  return Math.hypot(px - s.cx, py - s.cy) < s.r - 1e-3;
}

/** 擋路的家具：畫在其他家具底下的（地毯、血跡、舞台…）不算 */
export const blocking = (it: Item) => !ASSET[it.t]?.under;

export const doorKinds = (o: Opening) => OPEN[o.kind].group === 'door';
const at = (o: Opening) => `${o.kind}@${o.o}${o.x},${o.y}`;
const box = (it: Item) => `${it.t}(${it.x},${it.y},${it.w}×${it.h})`;

/** 擋在門的開門範圍或門前的家具 */
export function blockedDoors(f: Floor): string[] {
  const out: string[] = [];
  for (const o of f.openings.filter(doorKinds)) {
    const zone = doorClearance(o);
    for (const it of f.items.filter(blocking))
      if (zone.rects.some((r) => rectHits(r, it)) || zone.sectors.some((s) => sectorHits(s, it)))
        out.push(`${f.name}：${at(o)} × ${box(it)}`);
  }
  return out;
}

/** 門窗不在牆上的（要整個落在一段自動牆或手畫的牆上） */
export function openingsOffWall(f: Floor): string[] {
  const lines = wallLines(f);
  return f.openings
    .filter((o) => {
      const line = o.o === 'h' ? o.y : o.x;
      const a = o.o === 'h' ? o.x : o.y;
      return !lines.some(
        (r) =>
          r.o === o.o && Math.abs(r.c - line) < EPS && a >= r.a - EPS && a + o.len <= r.b + EPS,
      );
    })
    .map((o) => `${f.name}：${at(o)}`);
}

/**
 * 穿過牆的家具（牆線從家具中間穿過；複驗發現洋館 2F 的馬桶突出到走道）。
 * 貼牆素材（裂痕、爪痕…，F233）本來就跨在牆線上，不算。
 */
export function itemsAcrossWalls(f: Floor): string[] {
  const lines = wallLines(f);
  return f.items
    .filter((it) => !ASSET[it.t]?.wall)
    .filter((it) =>
      lines.some((r) => {
        const [c0, c1, a0, a1] =
          r.o === 'h'
            ? [it.y, it.y + it.h, it.x, it.x + it.w]
            : [it.x, it.x + it.w, it.y, it.y + it.h];
        return c0 < r.c - EPS && c1 > r.c + EPS && overlapLen(a0, a1, r.a, r.b) > EPS;
      }),
    )
    .map((it) => `${f.name}：${box(it)}`);
}

/** 地面層以外的門：兩側都要是房間（陽台、走廊也算），不能開到建築外面的半空中 */
export function doorsToNowhere(f: Floor): string[] {
  const inRoom = (x: number, y: number) =>
    f.rooms.some(
      (r) => x > r.x + EPS && x < r.x + r.w - EPS && y > r.y + EPS && y < r.y + r.h - EPS,
    );
  return f.openings
    .filter(doorKinds)
    .filter((o) => {
      const mid = o.o === 'h' ? { x: o.x + o.len / 2, y: o.y } : { x: o.x, y: o.y + o.len / 2 };
      const d = 0.25;
      const sides =
        o.o === 'h'
          ? [inRoom(mid.x, mid.y - d), inRoom(mid.x, mid.y + d)]
          : [inRoom(mid.x - d, mid.y), inRoom(mid.x + d, mid.y)];
      return !sides.every(Boolean);
    })
    .map((o) => `${f.name}：${at(o)}`);
}

/** 半重疊的房間（不是分開也不是完全包在裡面） */
export function halfOverlaps(f: Floor): string[] {
  const out: string[] = [];
  for (let i = 0; i < f.rooms.length; i++)
    for (let j = i + 1; j < f.rooms.length; j++) {
      const a = f.rooms[i];
      const b = f.rooms[j];
      if (rectsOverlap(a, b) && !rectContains(a, b) && !rectContains(b, a))
        out.push(`${f.name}：${a.name} / ${b.name}`);
    }
  return out;
}

const runAt = (r: { o: string; c: number; a: number; b: number }) => `${r.o}${r.c}:${r.a}-${r.b}`;

/**
 * 重疊的牆（2026-10）：手畫的牆和自動牆（分區線不算）或別的手畫牆在同一條線上疊在一起。
 * 手畫的玻璃牆、鐵欄杆要畫在「不產生牆」的分區線上，不能疊在自動牆上（兩道牆疊著畫會變成一團）。
 */
export function overlappingWalls(f: Floor): string[] {
  const lines = wallLines(f);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const p = lines[i];
      const q = lines[j];
      if (!p.free && !q.free) continue;
      if (p.o === q.o && Math.abs(p.c - q.c) < EPS && overlapLen(p.a, p.b, q.a, q.b) > EPS)
        out.push(`${f.name}：${runAt(p)} / ${runAt(q)}`);
    }
  return out;
}

/**
 * 卡在牆裡的門窗（2026-10）：和同一條線上別的門窗重疊，或有垂直的牆從門窗的寬度中間接上來（T 字、十字），
 * 門板或窗框會卡進那道牆。門窗的兩端剛好在轉角、接點上不算。
 */
export function stuckOpenings(f: Floor): string[] {
  const lines = wallLines(f);
  const out: string[] = [];
  f.openings.forEach((o, i) => {
    const c = o.o === 'h' ? o.y : o.x;
    const a0 = o.o === 'h' ? o.x : o.y;
    const a1 = a0 + o.len;
    for (const q of f.openings.slice(i + 1)) {
      const qc = q.o === 'h' ? q.y : q.x;
      const qa = q.o === 'h' ? q.x : q.y;
      if (q.o === o.o && Math.abs(qc - c) < EPS && overlapLen(a0, a1, qa, qa + q.len) > EPS)
        out.push(`${f.name}：${at(o)} × ${at(q)}`);
    }
    for (const r of lines)
      if (r.o !== o.o && r.c > a0 + EPS && r.c < a1 - EPS && r.a <= c + EPS && r.b >= c - EPS)
        out.push(`${f.name}：${at(o)} × 牆 ${runAt(r)}`);
  });
  return out;
}

/** 和別的家具疊在一起的線索小物（放入隱藏線索時找不到空位的話會疊上去） */
export function cluesOnFurniture(f: Floor): string[] {
  return f.items
    .filter((it) => it.clue)
    .flatMap((c) =>
      f.items
        .filter((it) => it !== c && blocking(it) && rectHits(c, it))
        .map((it) => `${f.name}：${box(c)} × ${box(it)}`),
    );
}

export const linkKey = (it: Item) => `${it.x},${it.y},${it.w},${it.h}`;
export const links = (f: Floor) => f.items.filter((it) => VERTICAL_LINKS.has(it.t));

/**
 * 走不到的房間：格子的主人＝最後蓋上去的房間，相鄰兩格之間的邊上牆（含手畫的牆、欄杆、岩壁）與窗戶
 * 擋住之後還留下 0.5 格以上的空隙就走得過去（分區線不擋）；地面層（1F）房間外面是起點，
 * 上下層之間由重疊的樓梯、電梯接起來。
 */
export function unreachableRooms(floors: readonly Floor[]): string[] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let x = k;
    while (parent.get(x) !== x) x = parent.get(x) as string;
    parent.set(k, x);
    return x;
  };
  const union = (a: string, b: string) => {
    const x = find(a);
    const y = find(b);
    if (x !== y) parent.set(x, y);
  };
  const ground = groundFloorIndex(floors as Floor[]);
  const owners = floors.map((f) => {
    const owner = new Map<string, number>();
    f.rooms.forEach((r, i) => {
      for (let x = r.x; x < r.x + r.w; x++)
        for (let y = r.y; y < r.y + r.h; y++) owner.set(`${x},${y}`, i);
    });
    return owner;
  });
  floors.forEach((f, fi) => {
    if (!f.rooms.length) return;
    const owner = owners[fi];
    const node = (x: number, y: number) => {
      const i = owner.get(`${x},${y}`);
      return i === undefined ? (fi === ground ? 'out' : `out:${fi}`) : `${fi}:${i}`;
    };
    /* 擋路的範圍：牆（扣掉門窗之後、分區線除外）＋窗戶 */
    const spans = new Map<string, [number, number][]>();
    const add = (o: 'h' | 'v', c: number, a: number, b: number) => {
      const k = `${o}:${c}`;
      const list = spans.get(k) ?? [];
      list.push([a, b]);
      spans.set(k, list);
    };
    for (const r of computeWalls(f).runs) if (r.kind !== 'zone') add(r.o, r.c, r.a, r.b);
    for (const o of f.openings)
      if (!doorKinds(o)) {
        const a = o.o === 'h' ? o.x : o.y;
        add(o.o, o.o === 'h' ? o.y : o.x, a, a + o.len);
      }
    /** 邊 [a, a＋1] 上最長的空隙 ≥ 0.5 格 */
    const passable = (o: 'h' | 'v', c: number, a: number) => {
      const cover = (spans.get(`${o}:${c}`) ?? [])
        .map(([s, e]) => [Math.max(s, a), Math.min(e, a + 1)] as const)
        .filter(([s, e]) => e - s > EPS)
        .sort((p, q) => p[0] - q[0]);
      let pos = a;
      let gap = 0;
      for (const [s, e] of cover) {
        gap = Math.max(gap, s - pos);
        pos = Math.max(pos, e);
      }
      gap = Math.max(gap, a + 1 - pos);
      return gap >= 0.5 - EPS;
    };
    const xs = f.rooms.flatMap((r) => [r.x, r.x + r.w]);
    const ys = f.rooms.flatMap((r) => [r.y, r.y + r.h]);
    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs); x++)
      for (let y = Math.min(...ys) - 1; y <= Math.max(...ys); y++) {
        const here = node(x, y);
        find(here);
        const right = node(x + 1, y);
        const down = node(x, y + 1);
        if (here !== right && passable('v', x + 1, y)) union(here, right);
        if (here !== down && passable('h', y + 1, x)) union(here, down);
      }
  });
  for (let i = 0; i + 1 < floors.length; i++)
    for (const p of links(floors[i]))
      for (const q of links(floors[i + 1])) {
        if (!rectHits(p, q)) continue;
        const key = `${Math.floor(p.x + p.w / 2)},${Math.floor(p.y + p.h / 2)}`;
        const a = owners[i].get(key);
        const b = owners[i + 1].get(key);
        if (a !== undefined && b !== undefined) union(`${i}:${a}`, `${i + 1}:${b}`);
      }
  return floors.flatMap((f, fi) =>
    f.rooms
      .filter((_r, i) => find(`${fi}:${i}`) !== find('out'))
      .map((r) => `${f.name}：${r.name}`),
  );
}

/** 一層的格局問題（F194、F212；`ground`＝地面層，地面層的門可以開到外面） */
export function floorProblems(f: Floor, ground: boolean): string[] {
  return [
    ...openingsOffWall(f).map((x) => `門窗不在牆上 ${x}`),
    ...halfOverlaps(f).map((x) => `房間半重疊 ${x}`),
    ...blockedDoors(f).map((x) => `門前有家具 ${x}`),
    ...overlappingWalls(f).map((x) => `牆重疊 ${x}`),
    ...stuckOpenings(f).map((x) => `門窗卡在牆裡 ${x}`),
    ...itemsAcrossWalls(f).map((x) => `家具穿牆 ${x}`),
    ...(ground ? [] : doorsToNowhere(f).map((x) => `門開到半空中 ${x}`)),
    ...cluesOnFurniture(f).map((x) => `線索疊在家具上 ${x}`),
  ];
}

/** 上下相鄰的樓層沒有位置相同的樓梯或電梯 */
export function unlinkedFloors(floors: readonly Floor[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < floors.length; i++) {
    const below = new Set(links(floors[i - 1]).map(linkKey));
    if (!links(floors[i]).some((it) => below.has(linkKey(it))))
      out.push(`${floors[i - 1].name}→${floors[i].name}`);
  }
  return out;
}

/** 整個範本的格局問題（每一層＋樓梯＋走得到） */
export function layoutProblems(floors: readonly Floor[]): string[] {
  const ground = groundFloorIndex(floors as Floor[]);
  return [
    ...floors.flatMap((f, i) => floorProblems(f, i === ground)),
    ...unlinkedFloors(floors).map((x) => `樓梯沒有對齊 ${x}`),
    ...unreachableRooms(floors).map((x) => `走不到 ${x}`),
  ];
}
