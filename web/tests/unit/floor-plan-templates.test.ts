/**
 * 室內平面圖的範本（規格 D10、F191～F194）：每個範本都畫得出來、「只載入格局」「放入隱藏線索」、
 * 廢墟的處理固定（同樣的種子同樣的結果）、範本的分類涵蓋規定的類型。
 *
 * 格局規則（F194）每個範本、每一層都檢查：門窗都在牆上、房間不會半重疊（巢狀的完全包在裡面）、
 * 上下相鄰的樓層至少一座樓梯或電梯位置相同、門的開門範圍（弧線掃過的扇形）與門前一格不放家具、每間房都走得到。
 */
import { describe, expect, it } from 'vitest';
import { ASSET, VERTICAL_LINKS } from '@/tools/floor-plan/model/assets';
import { OPEN, SWING_DOORS } from '@/tools/floor-plan/model/catalog';
import { emptyFloor, rectContains, rectsOverlap } from '@/tools/floor-plan/model/geometry';
import { groundFloorIndex } from '@/tools/floor-plan/model/ops';
import type { Floor, Item, Opening, Rect } from '@/tools/floor-plan/model/types';
import { computeWalls, wallLines } from '@/tools/floor-plan/model/walls';
import { getTemplate, instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { findSpot, wrapClueText } from '@/tools/floor-plan/templates/clues';

const build = (id: string, opts = {}) => instantiateTemplate(id, opts) as Floor[];

const EPS = 1e-6;

/* ---------- 格局規則用的幾何 ---------- */

/** 門前（牆的兩側各一條）要空出來的深度：一格 */
const FRONT = 1;

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
 * （單開門類：鉸鍊為圓心、門寬為半徑；雙開門：兩端各一片、半徑是門寬的一半），折門加門板折出來的深度。
 */
function doorClearance(o: Opening): { rects: Rect[]; sectors: Sector[] } {
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
  if (o.kind === 'door2') {
    leaf(a, 1, o.len / 2);
    leaf(a + o.len, -1, o.len / 2);
  } else if (SWING_DOORS.has(o.kind)) {
    if (o.hinge) leaf(a + o.len, -1, o.len);
    else leaf(a, 1, o.len);
  } else if (o.kind === 'folding') {
    const panel = o.len >= 2.4 ? o.len / 2 : o.len;
    rects.push(band(a, o.len, s, panel / 2));
  }
  return { rects, sectors };
}

const overlapLen = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0);

const rectHits = (a: Rect, b: Rect) =>
  overlapLen(a.x, a.x + a.w, b.x, b.x + b.w) > EPS &&
  overlapLen(a.y, a.y + a.h, b.y, b.y + b.h) > EPS;

/** 長方形碰到四分之一圓（不算剛好貼著） */
function sectorHits(s: Sector, r: Rect): boolean {
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
const blocking = (it: Item) => !ASSET[it.t]?.under;

const doorKinds = (o: Opening) => OPEN[o.kind].group === 'door';
const at = (o: Opening) => `${o.kind}@${o.o}${o.x},${o.y}`;
const box = (it: Item) => `${it.t}(${it.x},${it.y},${it.w}×${it.h})`;

/** 擋在門的開門範圍或門前的家具 */
function blockedDoors(f: Floor): string[] {
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
function openingsOffWall(f: Floor): string[] {
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

/** 穿過牆的家具（牆線從家具中間穿過；複驗發現洋館 2F 的馬桶突出到走道） */
function itemsAcrossWalls(f: Floor): string[] {
  const lines = wallLines(f);
  return f.items
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
function doorsToNowhere(f: Floor): string[] {
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
function halfOverlaps(f: Floor): string[] {
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

const linkKey = (it: Item) => `${it.x},${it.y},${it.w},${it.h}`;
const links = (f: Floor) => f.items.filter((it) => VERTICAL_LINKS.has(it.t));

/**
 * 走不到的房間：格子的主人＝最後蓋上去的房間，相鄰兩格之間的邊上牆（含手畫的牆、欄杆、岩壁）與窗戶
 * 擋住之後還留下 0.5 格以上的空隙就走得過去（分區線不擋）；地面層（1F）房間外面是起點，
 * 上下層之間由重疊的樓梯、電梯接起來。
 */
function unreachableRooms(floors: readonly Floor[]): string[] {
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

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('範本 %s', (id, tpl) => {
  const floors = build(id);

  it('有名字、說明、樓層；家具都在目錄裡；id 不重複', () => {
    expect(tpl.name).toBeTruthy();
    expect(tpl.description).toBeTruthy();
    expect(floors.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const f of floors) {
      for (const it of f.items) expect(ASSET[it.t], it.t).toBeTruthy();
      for (const o of [...f.rooms, ...f.items, ...f.openings, ...f.walls, ...f.texts]) {
        expect(ids.has(o.id)).toBe(false);
        ids.add(o.id);
      }
    }
  });

  describe.each(floors.map((f) => [f.name, f] as const))('格局規則（F194）：%s', (_name, f) => {
    it('門窗都在牆上（自動牆或手畫的牆）', () => {
      expect(openingsOffWall(f)).toEqual([]);
    });

    it('房間不會半重疊（不是分開就是完全包在裡面）', () => {
      expect(halfOverlaps(f)).toEqual([]);
    });

    it('門的開門範圍（扇形）與門前一格沒有家具', () => {
      expect(blockedDoors(f)).toEqual([]);
    });

    it('家具不穿過牆', () => {
      expect(itemsAcrossWalls(f)).toEqual([]);
    });

    it('地面層以外的門兩側都是房間（不開到半空中）', () => {
      if (floors.indexOf(f) === groundFloorIndex(floors)) return;
      expect(doorsToNowhere(f)).toEqual([]);
    });

    it('和下一層之間，樓梯或電梯至少有一座位置相同', () => {
      const i = floors.indexOf(f);
      if (i === 0) return;
      const below = new Set(links(floors[i - 1]).map(linkKey));
      expect(
        links(f).some((it) => below.has(linkKey(it))),
        `${floors[i - 1].name}→${f.name}`,
      ).toBe(true);
    });
  });

  it('每間房都走得到（從 1F 外面經過門、開口與樓梯）', () => {
    expect(unreachableRooms(floors)).toEqual([]);
  });

  it('只載入格局：沒有家具與文字；房間、門窗照舊', () => {
    const bare = build(id, { structureOnly: true });
    expect(bare.every((f) => f.items.length === 0 && f.texts.length === 0)).toBe(true);
    expect(bare.map((f) => f.rooms.length)).toEqual(floors.map((f) => f.rooms.length));
  });

  it('放入隱藏線索：每條線索一件小物＋一段說明，都標成線索，放在指定的房間裡', () => {
    const withClues = build(id, { clues: true });
    for (const c of tpl.clues) {
      const f = withClues.find((x) => x.name === c.floor) as Floor;
      const room = f.rooms.find((r) => r.name === c.room);
      expect(room, `${c.floor} ${c.room}`).toBeTruthy();
      const item = f.items.find((it) => it.clue && it.t === c.t && room && rectContains(room, it));
      expect(item, `${c.room} ${c.t}`).toBeTruthy();
      const text = f.texts.find((t) => t.clue && t.text.replace('\n', '') === c.text);
      expect(text, c.text).toBeTruthy();
    }
    const total = withClues.reduce((n, f) => n + f.items.filter((i) => i.clue).length, 0);
    expect(total).toBe(tpl.clues.length);
    /* 線索小物也照 F194：不放在門的開門範圍與門前一格（複驗發現透天厝 1F 的「刀」在開口前） */
    for (const f of withClues) expect(blockedDoors(f), f.name).toEqual([]);
  });
});

describe('格局規則的檢查本身（抓得到違規）', () => {
  /** 兩間房：A (0,0,6,4)、B (6,0,4,4)；A 的南邊對外有一扇門 */
  const plan = (): Floor => ({
    ...emptyFloor('1F'),
    rooms: [
      { id: 'a', x: 0, y: 0, w: 6, h: 4, name: 'A', cat: 'living' },
      { id: 'b', x: 6, y: 0, w: 4, h: 4, name: 'B', cat: 'bedroom' },
    ],
    openings: [{ id: 'o', kind: 'door', o: 'h', x: 1, y: 4, len: 1.5, side: -1, hinge: 0 }],
  });
  const chair = (x: number, y: number): Item => ({ id: 'c', t: 'chair', x, y, w: 1, h: 1, rot: 0 });

  it('開門範圍（扇形）裡、門前一格裡的家具；扇形外面、地毯不算', () => {
    const f = plan();
    expect(blockedDoors(f)).toEqual([]);
    f.items = [chair(1.6, 2.8)];
    expect(blockedDoors(f)).toHaveLength(1);
    /* 扇形的外接方塊的角落（離鉸鍊超過門寬）不算 */
    f.items = [chair(2.2, 2)];
    expect(blockedDoors(f)).toEqual([]);
    /* 門外（不開門的那一側）一格以內 */
    f.items = [chair(1.5, 4.6)];
    expect(blockedDoors(f)).toHaveLength(1);
    f.items = [{ id: 'r', t: 'rug', x: 0, y: 2, w: 4, h: 3, rot: 0 }];
    expect(blockedDoors(f)).toEqual([]);
    /* 雙開門：兩端各一片 */
    f.openings = [{ id: 'o', kind: 'door2', o: 'h', x: 1, y: 4, len: 3, side: -1, hinge: 0 }];
    f.items = [chair(3, 2)];
    expect(blockedDoors(f)).toHaveLength(1);
  });

  it('線索的空位不放在門前一格（開口也算；複驗發現線索小物落在開口前 0.85 格）', () => {
    /* A 的左邊被床佔滿，只剩靠 B 的那一側；A、B 之間的牆上有開口 (6, 1)～(6, 3) */
    const f = {
      name: '1F',
      rooms: [
        { x: 0, y: 0, w: 6, h: 4, name: 'A', cat: 'living' },
        { x: 6, y: 0, w: 4, h: 4, name: 'B', cat: 'bedroom' },
      ],
      walls: [],
      openings: [{ kind: 'open', o: 'v', x: 6, y: 1, len: 2, side: 1, hinge: 0 }],
      items: [{ t: 'bed', x: 0, y: 0, w: 4.2, h: 4, rot: 0 }],
      texts: [],
    } as unknown as Parameters<typeof findSpot>[0];
    const spot = findSpot(f, f.rooms[0], 0.6, 0.6);
    const front = { x: 6 - FRONT, y: 1, w: FRONT * 2, h: 2 };
    if (spot) expect(rectsOverlap({ ...spot, w: 0.6, h: 0.6 }, front)).toBe(false);
  });

  it('走得到：沒有門的房間走不到；窗戶不能走；樓梯接到上一層', () => {
    const f = plan();
    expect(unreachableRooms([f])).toEqual(['1F：B']);
    f.openings.push({ id: 'w', kind: 'window', o: 'v', x: 6, y: 1, len: 2, side: 1, hinge: 0 });
    expect(unreachableRooms([f])).toEqual(['1F：B']);
    f.openings.push({ id: 'd', kind: 'sliding', o: 'v', x: 6, y: 3, len: 1, side: 1, hinge: 0 });
    expect(unreachableRooms([f])).toEqual([]);
    const up: Floor = {
      ...emptyFloor('2F'),
      rooms: [{ id: 'u', x: 0, y: 0, w: 6, h: 4, name: 'U', cat: 'hall' }],
    };
    expect(unreachableRooms([f, up])).toEqual(['2F：U']);
    const stairs = { id: 's', t: 'stairs', x: 3, y: 0, w: 2, h: 4, rot: 0 };
    f.items = [stairs];
    up.items = [{ ...stairs, id: 't' }];
    expect(unreachableRooms([f, up])).toEqual([]);
  });

  it('門窗不在牆上、房間半重疊', () => {
    const f = plan();
    f.openings.push({ id: 'x', kind: 'door', o: 'h', x: 1, y: 2, len: 1.5, side: 1, hinge: 0 });
    expect(openingsOffWall(f)).toEqual(['1F：door@h1,2']);
    f.rooms.push({ id: 'c', x: 5, y: 1, w: 3, h: 2, name: 'C', cat: 'wet' });
    expect(halfOverlaps(f)).toEqual(['1F：A / C', '1F：B / C']);
  });
});

describe('範本目錄', () => {
  it('類型涵蓋住宅、洋館、飯店、醫院、廢墟（派工的 D 項）', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'studio',
        'townhouse',
        'mansion',
        'hotel',
        'hospital',
        'abandoned-hospital',
        'ruined-house',
      ]),
    );
    expect(new Set(TEMPLATES.map((t) => t.group))).toEqual(new Set(['home', 'facility', 'ruins']));
  });

  it('洋館的密室是 GM 專用、用暗門連到酒窖；廢墟的處理每次相同', () => {
    const m = build('mansion');
    const b1 = m.find((f) => f.name === 'B1') as Floor;
    expect(b1.rooms.find((r) => r.name === '密室')?.gm).toBe(true);
    expect(b1.openings.some((o) => o.kind === 'secret')).toBe(true);
    const strip = (fs: Floor[]) =>
      fs.map((f) => [f.openings.map((o) => o.kind), f.items.map((i) => [i.t, i.x, i.y])]);
    expect(strip(build('abandoned-hospital'))).toEqual(strip(build('abandoned-hospital')));
    expect(
      build('abandoned-hospital')
        .flatMap((f) => f.openings)
        .some((o) => o.kind === 'brokenwin' || o.kind === 'boarded'),
    ).toBe(true);
  });

  it('沒有這個範本時 null；getTemplate 找得到', () => {
    expect(instantiateTemplate('nope')).toBeNull();
    expect(getTemplate('hotel')?.name).toBe('商務飯店');
  });

  it('長的線索說明斷成兩行（靠近中間的標點，沒有時正中間）', () => {
    expect(wrapClueText('短短的')).toBe('短短的');
    expect(wrapClueText('被撕下的、住宿登記表')).toBe('被撕下的、\n住宿登記表');
    expect(wrapClueText('一二三四五六七八')).toBe('一二三四\n五六七八');
  });
});
