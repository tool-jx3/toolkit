/**
 * 室內平面圖的範本：格局規則的檢查（規格 F194、F212）。單元測試（floor-plan-templates）與範本的總表共用。
 *
 * 每一層：門窗都在牆上、房間不會半重疊、門的開門範圍與門前一格不放家具、家具不穿過牆、手畫的牆不疊在別的牆上、
 * 門窗不卡在牆裡、地面層以外的門兩側都是房間、線索小物不疊在家具上；整個範本：每間房都走得到。
 * 2026-10 第三批後半：雙開門類（雙開門、大型雙開門）兩端各一片，旋轉門的圓往牆的兩側各凸出半個寬度。
 * 2026-10-22（7.18）：家具不重疊（畫在底下的、桌上的小物除外）。
 */
import { ASSET, VERTICAL_LINKS } from '@/tools/floor-plan/model/assets';
import {
  blocking,
  doorClearance,
  doorKinds,
  EPS,
  overlapLen,
  rectHits,
  sectorHits,
} from '@/tools/floor-plan/model/layoutRules';
import { groundFloorIndex } from '@/tools/floor-plan/model/ops';
import {
  roomCells,
  roomContainsRoom,
  roomHasPoint,
  roomsOverlap,
} from '@/tools/floor-plan/model/shape';
import { restsOn } from '@/tools/floor-plan/model/tabletop';
import type { Floor, Item, Opening } from '@/tools/floor-plan/model/types';
import { computeWalls, wallLines } from '@/tools/floor-plan/model/walls';

/*
 * 門的開門範圍、門前一格、擋路的家具、長方形的重疊：2026-10-29 搬到 `model/layoutRules.ts`
 * （連接房間放門、整理家具也用同一份規則），這裡照舊匯出。
 */
export {
  blocking,
  doorClearance,
  doorKinds,
  EPS,
  FRONT,
  overlapLen,
  rectHits,
  sectorHits,
} from '@/tools/floor-plan/model/layoutRules';
/* 桌上的小物的名單：2026-10-29 搬到 `model/tabletop.ts`（F255、F256） */
export { SURFACES, TABLETOP } from '@/tools/floor-plan/model/tabletop';

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
  /* L 形房間（2026-10-29）：缺角裡不算 */
  const inRoom = (x: number, y: number) => f.rooms.some((r) => roomHasPoint(r, x, y));
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
      if (roomsOverlap(a, b) && !roomContainsRoom(a, b) && !roomContainsRoom(b, a))
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

/**
 * 有意疊放：小物放在有桌面的家具上（2026-10-29 起和「桌上的小物跟著桌子」同一條規則：
 * 中心在桌面上、面積 70% 以上在桌面上，F256；原本是整個落在桌面上）
 */
const onSurface = restsOn;

/**
 * 疊在一起的家具（2026-10-22 依 7.18：三合院的床壓在衣櫃上）：兩件家具的外框重疊（只碰到邊不算）。
 * 有意疊放的不算：①畫在其他家具底下的（地毯、血跡、舞台、水池、斑馬線…，`under`）；
 * ②桌上的小物（`TABLETOP` 放在 `SURFACES` 上：中心在桌面上、面積 70% 以上在桌面上〔F256〕，例如祭壇上的蠟燭與神像、桌上的筆電與照片）。
 * 貼牆素材也算（不要蓋在靠牆的家具上）。
 */
export function overlappingItems(f: Floor): string[] {
  const out: string[] = [];
  const list = f.items.filter(blocking);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const p = list[i];
      const q = list[j];
      if (!rectHits(p, q) || onSurface(p, q) || onSurface(q, p)) continue;
      out.push(`${f.name}：${box(p)} × ${box(q)}`);
    }
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
      for (const [x, y] of roomCells(r)) owner.set(`${x},${y}`, i);
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
    ...overlappingItems(f).map((x) => `家具重疊 ${x}`),
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
