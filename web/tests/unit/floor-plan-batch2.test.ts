/**
 * 室內平面圖產生器：2026-10 第二批跟進原作 v1.05～v1.14（規格 F226～F231、3.10、D39～D45）。
 * - 新的門窗 7 種、牆 3 種、房間種類 14 種的資料與畫法（畫法用記錄呼叫的假 canvas 量：畫得出東西、和別的種類不同、不超出範圍）；
 * - 房間的牆種類（兩側都有設時取厚的）、PL 檢視的牆框；
 * - 外觀層的「顯示內部」（疊法、編輯的範圍、匯出）；
 * - 專案檔、分享連結帶著新的欄位。
 */
import { describe, expect, it } from 'vitest';
import { exportLayout } from '@/tools/floor-plan/draw/export';
import { drawOpening, drawPattern, drawRun } from '@/tools/floor-plan/draw/render';
import { THEMES } from '@/tools/floor-plan/draw/themes';
import { isAsset } from '@/tools/floor-plan/model/assets';
import {
  CAT,
  CATEGORIES,
  DOUBLE_DOORS,
  OPEN,
  OPENINGS,
  ROOF_CATEGORY,
  ROOM_PRESET_GROUPS,
  ROOM_WALL_KINDS,
  SWING_DOORS,
  WALL,
  WALL_KINDS,
} from '@/tools/floor-plan/model/catalog';
import { exportFloors, exportJobs, exportOptions } from '@/tools/floor-plan/model/exportPlan';
import {
  emptyFloor,
  floorBounds,
  openingReach,
  openingRect,
  visibleFloor,
} from '@/tools/floor-plan/model/geometry';
import {
  composedFloor,
  composeFloors,
  interiorFloor,
  ownFloor,
} from '@/tools/floor-plan/model/interior';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import {
  encodeMapHash,
  packProject,
  playerProject,
  readMapHash,
  unpackProject,
} from '@/tools/floor-plan/model/share';
import type {
  Floor,
  Opening,
  OpeningKind,
  Project,
  Room,
  RoomCategory,
  WallKind,
} from '@/tools/floor-plan/model/types';
import { computeWalls, edgeKind, roomWallKind, type WallRun } from '@/tools/floor-plan/model/walls';
import { S } from '@/tools/floor-plan/strings';

const NEW_ROOMS: RoomCategory[] = [
  'engawa',
  'studio',
  'stone',
  'roof',
  'industrial',
  'grate',
  'platform',
  'track',
  'road',
  'rooftop',
  'slab',
  'dirt',
  'gravel',
  'shipdeck',
];
const NEW_OPENINGS: OpeningKind[] = [
  'steel',
  'firedoor',
  'gate',
  'big2',
  'revolve',
  'sealed',
  'platewin',
];
const NEW_WALLS: WallKind[] = ['stone', 'sound', 'cracked'];

const room = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
): Room => ({ id, x, y, w, h, name: id, cat: 'living', ...extra });

const floorOf = (patch: Partial<Floor>): Floor => ({ ...emptyFloor('1F'), ...patch });

const runs = (f: Floor, opts?: Parameters<typeof computeWalls>[1]) =>
  computeWalls(f, opts).runs.map((r) => `${r.o}${r.c}:${r.a}-${r.b}:${r.kind}`);

/* ---------- 記錄呼叫的假 canvas：路徑與矩形的點換算成世界座標 ---------- */

type M = [number, number, number, number, number, number];
interface Rec {
  ops: string[];
  pts: [number, number][];
}

function recorder(): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { ops: [], pts: [] };
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const tp = (x: number, y: number): [number, number] => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
  const add = (x: number, y: number) => rec.pts.push(tp(x, y));
  const arcPts = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rot: number,
    a0: number,
    a1: number,
    ccw: boolean,
  ) => {
    let d = a1 - a0;
    if (!ccw && d < 0) d += Math.PI * 2;
    if (ccw && d > 0) d -= Math.PI * 2;
    if (Math.abs(a1 - a0) >= Math.PI * 2) d = Math.PI * 2;
    for (let i = 0; i <= 24; i++) {
      const a = a0 + (d * i) / 24;
      const ex = rx * Math.cos(a);
      const ey = ry * Math.sin(a);
      add(
        cx + ex * Math.cos(rot) - ey * Math.sin(rot),
        cy + ex * Math.sin(rot) + ey * Math.cos(rot),
      );
    }
  };
  const impl: Record<string, (...a: number[]) => unknown> = {
    save: () => stack.push([...m]),
    restore: () => {
      m = stack.pop() ?? m;
    },
    translate: (x, y) => {
      m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y];
    },
    rotate: (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = [
        m[0] * c + m[2] * s,
        m[1] * c + m[3] * s,
        -m[0] * s + m[2] * c,
        -m[1] * s + m[3] * c,
        m[4],
        m[5],
      ];
    },
    scale: (x, y) => {
      m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]];
    },
    moveTo: (x, y) => add(x, y),
    lineTo: (x, y) => add(x, y),
    quadraticCurveTo: (_cx, _cy, x, y) => add(x, y),
    bezierCurveTo: (_a, _b, _c, _d, x, y) => add(x, y),
    rect: (x, y, w, h) => {
      add(x, y);
      add(x + w, y + h);
    },
    fillRect: (x, y, w, h) => {
      add(x, y);
      add(x + w, y + h);
    },
    strokeRect: (x, y, w, h) => {
      add(x, y);
      add(x + w, y + h);
    },
    arc: (x, y, r, a0, a1, ccw) => arcPts(x, y, r, r, 0, a0, a1, Boolean(ccw)),
    ellipse: (x, y, rx, ry, rot, a0, a1, ccw) => arcPts(x, y, rx, ry, rot, a0, a1, Boolean(ccw)),
    measureText: () => ({ width: 1 }),
  };
  const ctx = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k in impl)
          return (...a: number[]) => {
            rec.ops.push(k);
            return impl[k](...a);
          };
        return (..._a: unknown[]) => {
          rec.ops.push(k);
        };
      },
      set(_t, k, v) {
        /* 顏色也算畫法的一部分（鐵門與防火門的形狀相同、顏色不同） */
        if (k === 'fillStyle' || k === 'strokeStyle') rec.ops.push(`${String(k)}=${String(v)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, rec };
}

const box = (pts: [number, number][]) => ({
  x0: Math.min(...pts.map((p) => p[0])),
  y0: Math.min(...pts.map((p) => p[1])),
  x1: Math.max(...pts.map((p) => p[0])),
  y1: Math.max(...pts.map((p) => p[1])),
});

const theme = THEMES.clean;
const LW = 1 / 22;

/* ---------- 資料 ---------- */

describe('新的種類的資料（F226、F227、F229）', () => {
  it('房間種類 14 種：室內 6、戶外 8（外圍：屋頂平台與甲板是欄杆，其他沒有牆），每種一個自己的花紋', () => {
    expect(NEW_ROOMS.every((c) => CAT[c])).toBe(true);
    expect(NEW_ROOMS.filter((c) => !CAT[c].outdoor)).toEqual([
      'engawa',
      'studio',
      'stone',
      'roof',
      'industrial',
      'grate',
    ]);
    expect(NEW_ROOMS.filter((c) => CAT[c].edge === 'rail')).toEqual(['rooftop', 'shipdeck']);
    for (const c of NEW_ROOMS) {
      const p = CAT[c].pattern;
      expect(
        CATEGORIES.filter((o) => o.pattern === p).map((o) => o.id),
        c,
      ).toEqual([c]);
      expect(S.categories[c], c).toBeTruthy();
    }
    expect(ROOF_CATEGORY).toBe('roof');
    expect(CATEGORIES).toHaveLength(35);
  });

  it('房間卡片：新的兩組，每種新的房間種類一張（共 51 張）', () => {
    const groups = ROOM_PRESET_GROUPS.slice(-2);
    expect(groups.map((g) => g.id)).toEqual(['build', 'transit']);
    expect(groups.flatMap((g) => g.items.map((p) => p.cat)).sort()).toEqual([...NEW_ROOMS].sort());
    expect(ROOM_PRESET_GROUPS.flatMap((g) => g.items)).toHaveLength(51);
    for (const g of groups) {
      expect(S.presetGroups[g.id]).toBeTruthy();
      for (const p of g.items) expect(S.presets[p.id], p.id).toBeTruthy();
    }
  });

  it('門窗 7 種：門 6、窗 1；預設寬度；會開的門與雙開門；開門的範圍', () => {
    expect(NEW_OPENINGS.map((k) => [k, OPEN[k].group, OPEN[k].len])).toEqual([
      ['steel', 'door', 1.5],
      ['firedoor', 'door', 2],
      ['gate', 'door', 2],
      ['big2', 'door', 5],
      ['revolve', 'door', 4],
      ['sealed', 'door', 2],
      ['platewin', 'window', 2],
    ]);
    expect(NEW_OPENINGS.filter((k) => SWING_DOORS.has(k))).toEqual([
      'steel',
      'firedoor',
      'gate',
      'big2',
    ]);
    expect(NEW_OPENINGS.filter((k) => DOUBLE_DOORS.has(k))).toEqual(['big2']);
    expect(NEW_OPENINGS.map((kind) => openingReach({ kind, len: 4 }))).toEqual([
      4, 4, 4, 2, 2, 0.5, 0.5,
    ]);
    expect(OPENINGS).toHaveLength(24);
    for (const k of NEW_OPENINGS) expect(S.openings[k], k).toBeTruthy();
  });

  it('牆 3 種：厚度（石牆 0.6、隔音牆 0.48、有裂痕的牆 0.24）；房間可以設的牆種類（欄杆、圍籬除外）', () => {
    expect(NEW_WALLS.map((k) => WALL[k].t)).toEqual([0.6, 0.48, 0.24]);
    expect(WALL_KINDS).toHaveLength(12);
    expect(ROOM_WALL_KINDS).toEqual([
      'ext',
      'int',
      'thin',
      'glass',
      'bars',
      'broken',
      'rock',
      'stone',
      'sound',
      'cracked',
    ]);
    for (const k of NEW_WALLS) expect(S.walls[k], k).toBeTruthy();
  });
});

/* ---------- 房間的牆種類 ---------- */

describe('房間的牆種類（F228、D40）', () => {
  it('只有一側設了：那個種類（內牆、外牆都換）；兩側都設了：取厚的；一樣厚時取上面／左邊的', () => {
    const glass = room('g', 0, 0, 1, 1, { wall: 'glass' });
    const stone = room('s', 0, 0, 1, 1, { wall: 'stone' });
    const bars = room('b', 0, 0, 1, 1, { wall: 'bars' });
    const plain = room('p', 0, 0, 1, 1);
    expect(edgeKind(glass, plain)).toBe('glass');
    expect(edgeKind(plain, glass)).toBe('glass');
    expect(edgeKind(glass, null)).toBe('glass');
    expect(edgeKind(null, stone)).toBe('stone');
    expect(edgeKind(glass, stone)).toBe('stone');
    expect(edgeKind(stone, glass)).toBe('stone');
    /* 玻璃牆與鐵欄杆一樣厚（0.14）：前面（上面／左邊）那一間的 */
    expect(edgeKind(glass, bars)).toBe('glass');
    expect(edgeKind(bars, glass)).toBe('bars');
    expect(roomWallKind(plain, null)).toBe(null);
  });

  it('戶外房間的設定沒有作用；和戶外房間之間用室內那一間的；「不產生牆」照舊是分區線', () => {
    const yard = room('y', 0, 0, 1, 1, { cat: 'garden', wall: 'stone' });
    const deck = room('d', 0, 0, 1, 1, { cat: 'balcony', wall: 'stone' });
    const glass = room('g', 0, 0, 1, 1, { wall: 'glass' });
    expect(edgeKind(yard, null)).toBe(null);
    expect(edgeKind(deck, null)).toBe('rail');
    expect(edgeKind(yard, room('p', 0, 0, 1, 1))).toBe('ext');
    expect(edgeKind(yard, glass)).toBe('glass');
    expect(edgeKind(glass, room('z', 0, 0, 1, 1, { noWall: true }))).toBe('zone');
  });

  it('自動牆：溫室（玻璃）在客廳旁、石造大廳在外面；門窗的厚度跟著牆', () => {
    const f = floorOf({
      rooms: [
        room('a', 0, 0, 4, 3),
        room('b', 4, 0, 3, 3, { wall: 'glass' }),
        room('c', 0, 3, 7, 3, { cat: 'stone', wall: 'stone' }),
      ],
      openings: [
        { id: 'd', kind: 'door', o: 'v', x: 4, y: 1, len: 1, side: 1, hinge: 0 },
        { id: 'w', kind: 'window', o: 'h', x: 1, y: 6, len: 2, side: 1, hinge: 0 },
      ],
    });
    expect(runs(f, { openings: false })).toEqual([
      'h0:0-4:ext',
      'h0:4-7:glass',
      'h3:0-7:stone',
      'h6:0-7:stone',
      'v0:0-3:ext',
      'v0:3-6:stone',
      'v4:0-3:glass',
      'v7:0-3:glass',
      'v7:3-6:stone',
    ]);
    const w = computeWalls(f);
    expect([w.openingKind.get('d'), w.openingKind.get('w')]).toEqual(['glass', 'stone']);
  });

  it('沒有設牆種類的地圖：牆和以前一樣（同一份資料加上 wall: undefined 不影響）', () => {
    const rooms = [room('a', 0, 0, 4, 3), room('b', 4, 0, 3, 3, { cat: 'balcony' })];
    const before = runs(floorOf({ rooms }));
    const after = runs(floorOf({ rooms: rooms.map((r) => ({ ...r, wall: undefined })) }));
    expect(after).toEqual(before);
    expect(before).toEqual([
      'h0:0-4:ext',
      'h0:4-7:rail',
      'h3:0-4:ext',
      'h3:4-7:rail',
      'v0:0-3:ext',
      'v4:0-3:ext',
      'v7:0-3:rail',
    ]);
  });

  it('PL 檢視：GM 專用房間的牆框照樣是它的牆種類（PL 用連結也帶著）', () => {
    const f = floorOf({
      rooms: [room('a', 0, 0, 4, 3), room('vault', 4, 0, 3, 3, { gm: true, wall: 'stone' })],
    });
    const pl = visibleFloor(f, true);
    expect(pl.rooms[1]).toMatchObject({ masked: true, wall: 'stone' });
    expect(runs(pl as Floor)).toEqual(runs(f));
    const p: Project = { ...emptyProjectOf([f]) };
    expect(playerProject(p).project.floors[0].rooms[1]).toEqual({
      id: 'vault',
      x: 4,
      y: 0,
      w: 3,
      h: 3,
      name: '',
      cat: 'living',
      gm: true,
      wall: 'stone',
    });
  });
});

function emptyProjectOf(floors: Floor[]): Project {
  return { name: '測試', theme: 'clean', showSize: 'none', showNames: true, floors, active: 0 };
}

/* ---------- 外觀層與顯示內部 ---------- */

/** 外觀層：庭院 (0,0,24,16) 上一棟建物（屋頂 4,4,12,8）、屋頂上的水塔、庭院的樹與文字；正門與 1F 同一個位置 */
function siteProject(): Project {
  const site: Floor = {
    id: 'site',
    name: '外觀',
    rooms: [
      room('yard', 0, 0, 24, 16, { cat: 'garden' }),
      room('bldg', 4, 4, 12, 8, { cat: 'roof', name: '主屋' }),
      room('shed', 18, 4, 4, 4, { cat: 'roof', name: '倉庫' }),
    ],
    walls: [{ id: 'fence', x1: 0, y1: 15, x2: 6, y2: 15, kind: 'fence' }],
    openings: [
      { id: 'front', kind: 'door2', o: 'h', x: 8, y: 12, len: 3, side: 1, hinge: 0 },
      { id: 'back', kind: 'door', o: 'h', x: 6, y: 4, len: 1.5, side: -1, hinge: 0 },
      { id: 'shedDoor', kind: 'shutter', o: 'v', x: 18, y: 5, len: 2, side: -1, hinge: 0 },
    ],
    items: [
      { id: 'tank', t: 'barrel', x: 6, y: 6, w: 1, h: 1, rot: 0 },
      { id: 'tree', t: 'tree', x: 1, y: 1, w: 2, h: 2, rot: 0 },
    ],
    texts: [
      { id: 'roofText', x: 10, y: 8, text: '瓦屋頂' },
      { id: 'yardText', x: 2, y: 14, text: '前院' },
    ],
    showInside: true,
    inside: 'f1',
  };
  const f1: Floor = {
    id: 'f1',
    name: '1F',
    rooms: [
      room('hall', 4, 4, 6, 8, { name: '大廳' }),
      room('room', 10, 4, 6, 8, { name: '客房' }),
    ],
    walls: [],
    openings: [
      { id: 'front1', kind: 'door2', o: 'h', x: 8, y: 12, len: 3, side: 1, hinge: 0 },
      { id: 'inner', kind: 'door', o: 'v', x: 10, y: 6, len: 1.5, side: 1, hinge: 0 },
    ],
    items: [{ id: 'sofa', t: 'sofa2', x: 5, y: 5, w: 3.2, h: 1.8, rot: 0 }],
    texts: [],
  };
  return { ...emptyProjectOf([site, f1]) };
}

describe('外觀層的「顯示內部」（F230、D41）', () => {
  it('疊上來的樓層：inside 指的那一層；找不到時第一個別的樓層；沒打開或只有一層時沒有', () => {
    const p = siteProject();
    const [site, f1] = p.floors;
    expect(interiorFloor(site, p.floors)).toBe(f1);
    expect(interiorFloor({ ...site, inside: 'nope' }, p.floors)).toBe(f1);
    expect(interiorFloor({ ...site, showInside: undefined }, p.floors)).toBeNull();
    expect(interiorFloor(site, [site])).toBeNull();
    /* 沒打開時原樣（同一個物件） */
    expect(composedFloor(f1, p.floors)).toBe(f1);
    expect(ownFloor(f1, p.floors)).toBe(f1);
  });

  it('疊法：拿掉屋頂（含別的建物的屋頂）與上面的東西，內部的房間、門窗、家具疊上來；同一個位置的門窗只留內部的', () => {
    const p = siteProject();
    const c = composedFloor(p.floors[0], p.floors);
    expect(c.rooms.map((r) => r.id)).toEqual(['yard', 'hall', 'room']);
    expect(c.openings.map((o) => o.id)).toEqual(['back', 'shedDoor', 'front1', 'inner']);
    expect(c.items.map((i) => i.id)).toEqual(['tree', 'sofa']);
    expect(c.texts.map((t) => t.id)).toEqual(['yardText']);
    expect(c.walls.map((w) => w.id)).toEqual(['fence']);
    /* 原本的資料沒有動 */
    expect(p.floors[0].rooms).toHaveLength(3);
    /* 編輯的範圍：外觀層自己留下來的東西 */
    const own = ownFloor(p.floors[0], p.floors);
    expect(own.rooms.map((r) => r.id)).toEqual(['yard']);
    expect(own.openings.map((o) => o.id)).toEqual(['back', 'shedDoor']);
    expect(own.items.map((i) => i.id)).toEqual(['tree']);
    expect(own.texts.map((t) => t.id)).toEqual(['yardText']);
  });

  it('疊好之後的牆：內部的房間照自己的規則（內牆、外牆），屋頂的牆不見了；正門切開牆', () => {
    const p = siteProject();
    const c = composedFloor(p.floors[0], p.floors);
    const r = runs(c);
    expect(r).toContain('v10:4-6:int');
    expect(r).toContain('h12:4-8:ext');
    expect(r).toContain('h12:11-16:ext');
    /* 不開的時候：屋頂的外圍是外牆、裡面沒有牆 */
    const plain = runs(p.floors[0]);
    expect(plain.some((x) => x.startsWith('v10:'))).toBe(false);
  });

  it('屋頂上、內部房間裡的其他房間也拿掉；包住整棟建物的大庭院、只蓋到一部分的門廊留著（D41）', () => {
    const p = siteProject();
    p.floors[0].rooms.push(
      room('terrace', 9, 9, 2, 2, { cat: 'rooftop' }),
      room('onHall', 5, 5, 2, 2, { cat: 'porch' }),
      room('porch', 14, 11, 4, 3, { cat: 'porch' }),
    );
    const c = composedFloor(p.floors[0], p.floors);
    expect(c.rooms.map((r) => r.id)).toEqual(['yard', 'porch', 'hall', 'room']);
    /* 大庭院的名字（中心 12, 8）落在客房裡：疊好的樓層裡不畫；門廊的名字在外面，照畫；原本的資料不變 */
    expect(c.rooms.map((r) => !!r.hideLabel)).toEqual([true, false, false, false]);
    expect(p.floors[0].rooms[0].hideLabel).toBeUndefined();
    expect(ownFloor(p.floors[0], p.floors).rooms[0].hideLabel).toBeUndefined();
    /* 內部的房間在後面（格子的主人），門廊與客房重疊的地方是客房 */
    expect(runs(c)).toContain('v16:4-12:ext');
  });

  it('PL 檢視：內部的 GM 專用房間只剩牆框（疊好之後再照 PL 檢視整理）', () => {
    const p = siteProject();
    p.floors[1].rooms[1].gm = true;
    const pl = visibleFloor(composedFloor(p.floors[0], p.floors), true);
    expect(pl.rooms.find((r) => r.id === 'room')).toMatchObject({ masked: true, name: '' });
  });

  it('匯出：這一層、所有樓層、每層各一張都畫疊好的樓層；範圍＝疊好之後的範圍', () => {
    const p = siteProject();
    expect(exportFloors(p, 'current')[0].rooms.map((r) => r.id)).toEqual(['yard', 'hall', 'room']);
    expect(exportFloors(p, 'all').map((f) => f.rooms.length)).toEqual([3, 2]);
    const exp = {
      range: 'each' as const,
      view: 'pl' as const,
      clues: 'show' as const,
      px: 48 as const,
      grid: false,
      transparent: false,
    };
    expect(exportJobs(p, exp).map((j) => j.floors[0].rooms.length)).toEqual([3, 2]);
    expect(composeFloors(p.floors).map((f) => f.items.length)).toEqual([2, 1]);
    /* 庭院 24 × 16 格＋四周 2 格 */
    expect(floorBounds(exportFloors(p, 'current')[0])).toEqual({ x: 0, y: 0, w: 24, h: 16 });
    const L = exportLayout(exportFloors(p, 'current'), exportOptions(p, exp, 'clean', 48));
    expect([L.pxWidth, L.pxHeight]).toEqual([28 * 48, 20 * 48]);
  });
});

/* ---------- 存檔、分享連結 ---------- */

describe('存進專案檔與分享連結（F231）', () => {
  it('整理兩次結果相同；新的欄位都留著', () => {
    const p = siteProject();
    p.floors[1].rooms[0].wall = 'sound';
    p.floors[1].openings.push({
      id: 'pw',
      kind: 'platewin',
      o: 'h',
      x: 4,
      y: 4,
      len: 2,
      side: 1,
      hinge: 0,
    });
    p.floors[1].walls.push({ id: 'sw', x1: 5, y1: 10, x2: 8, y2: 10, kind: 'cracked' });
    const a = normalizeProject(p, isAsset);
    const b = normalizeProject(a, isAsset);
    expect(b).toEqual(a);
    expect(a?.floors[0]).toMatchObject({ showInside: true, inside: 'f1' });
    expect(a?.floors[1].rooms[0].wall).toBe('sound');
    expect(a?.floors[0].rooms[1].cat).toBe('roof');
  });

  it('分享連結：疊上來的樓層寫成順序，讀回時接回新的 id；完整連結除了 id 都相同', () => {
    const p = siteProject();
    p.floors[1].rooms[0].wall = 'stone';
    const packed = packProject(p);
    expect((packed.floors as Record<string, unknown>[])[0]).toMatchObject({
      showInside: true,
      inside: 1,
    });
    expect('inside' in (packed.floors as Record<string, unknown>[])[1]).toBe(false);
    const read = readMapHash(encodeMapHash(p, 'full').hash);
    if (read.kind !== 'ok') throw new Error(read.kind);
    const back = normalizeProject(read.raw, isAsset) as Project;
    expect(back.floors[0].showInside).toBe(true);
    expect(back.floors[0].inside).toBe(back.floors[1].id);
    expect(composedFloor(back.floors[0], back.floors).rooms.map((r) => r.name)).toEqual([
      'yard',
      '大廳',
      '客房',
    ]);
    const strip = (x: Project) =>
      JSON.stringify(x, (k, v) => (k === 'id' || k === 'inside' ? undefined : v));
    expect(strip(back)).toBe(strip(normalizeProject(p, isAsset) as Project));
  });

  it('分享連結：疊上來的樓層順序壞掉（超出範圍）時不接，用第一個別的樓層', () => {
    const raw = unpackProject({
      floors: [
        { name: 'a', rooms: [], showInside: true, inside: 9 },
        { name: 'b', rooms: [] },
      ],
    }) as { floors: Record<string, unknown>[] };
    expect(raw.floors[0].inside).toBeUndefined();
    expect(raw.floors[1].id).toBeUndefined();
  });

  it('PL 用連結：「顯示內部」帶著；內部樓層的 GM 房間照樣只剩牆框', () => {
    const p = siteProject();
    p.floors[1].rooms[1].gm = true;
    const pl = playerProject(p).project;
    expect(pl.floors[0]).toMatchObject({ showInside: true, inside: 'f1' });
    expect(pl.floors[1].rooms[1]).toMatchObject({ gm: true, name: '' });
  });
});

/* ---------- 畫法（純函式的部分：用假 canvas 量） ---------- */

describe('畫法（3.10）', () => {
  it('地板花紋：每種新的房間都畫得出東西、點都在房間裡、和別的種類的花紋不同（橫的、直的房間都一樣）', () => {
    for (const [w, h] of [
      [12, 8],
      [5, 14],
    ]) {
      const sig = new Map<string, string>();
      for (const c of CATEGORIES) {
        if (!c.pattern) continue;
        const { ctx, rec } = recorder();
        const r = room('r', 3, 2, w, h, { cat: c.id });
        drawPattern(ctx, r, theme, LW);
        if (!NEW_ROOMS.includes(c.id)) {
          sig.set(c.id, rec.ops.join());
          continue;
        }
        expect(rec.ops.filter((o) => o === 'stroke' || o === 'fill').length, c.id).toBeGreaterThan(
          0,
        );
        const b = box(rec.pts);
        expect(b.x0, c.id).toBeGreaterThanOrEqual(3 - 0.15);
        expect(b.y0, c.id).toBeGreaterThanOrEqual(2 - 0.15);
        expect(b.x1, c.id).toBeLessThanOrEqual(3 + w + 0.15);
        expect(b.y1, c.id).toBeLessThanOrEqual(2 + h + 0.15);
        sig.set(c.id, `${rec.ops.join()}|${rec.pts.length}`);
      }
      expect(new Set(NEW_ROOMS.map((c) => sig.get(c))).size).toBe(NEW_ROOMS.length);
    }
  });

  it('門窗：每種新的門窗都畫得出東西，不超出「開門的範圍」（匯出範圍不會切到）；和以前換成的種類畫法不同', () => {
    const sig = (kind: OpeningKind) => {
      const { ctx, rec } = recorder();
      drawOpening(
        ctx,
        { id: 'x', kind, o: 'h', x: 0, y: 0, len: OPEN[kind].len, side: 1, hinge: 0 },
        0.34,
        theme,
        LW,
        { playerView: false, editor: false },
      );
      return rec.ops.join();
    };
    const before: Record<string, OpeningKind> = {
      steel: 'door',
      firedoor: 'door',
      gate: 'door',
      big2: 'door2',
      revolve: 'auto',
      sealed: 'locked',
      platewin: 'boarded',
    };
    for (const kind of NEW_OPENINGS) {
      expect(sig(kind), kind).not.toBe(sig(before[kind]));
      for (const o of ['h', 'v'] as const)
        for (const side of [1, -1] as const)
          for (const hinge of [0, 1] as const) {
            const op: Opening = { id: 'x', kind, o, x: 3, y: 5, len: OPEN[kind].len, side, hinge };
            const { ctx, rec } = recorder();
            drawOpening(ctx, op, 0.34, theme, LW, { playerView: true, editor: false });
            expect(rec.pts.length, kind).toBeGreaterThan(0);
            const b = box(rec.pts);
            const lim = openingRect(op, Math.max(openingReach(op), 0.34 * 0.75));
            const pad = 0.2;
            expect(b.x0, `${kind} ${o}`).toBeGreaterThanOrEqual(lim.x - pad);
            expect(b.y0, `${kind} ${o}`).toBeGreaterThanOrEqual(lim.y - pad);
            expect(b.x1, `${kind} ${o}`).toBeLessThanOrEqual(lim.x + lim.w + pad);
            expect(b.y1, `${kind} ${o}`).toBeLessThanOrEqual(lim.y + lim.h + pad);
          }
    }
    expect(new Set(NEW_OPENINGS.map(sig)).size).toBe(NEW_OPENINGS.length);
  });

  it('門窗：PL 檢視照樣畫（不是秘密）；設成只有 GM 看得到時 PL 檢視不畫', () => {
    for (const kind of NEW_OPENINGS) {
      const op: Opening = { id: 'x', kind, o: 'h', x: 0, y: 0, len: 2, side: 1, hinge: 0 };
      const a = recorder();
      drawOpening(a.ctx, op, 0.34, theme, LW, { playerView: true, editor: true });
      expect(a.rec.ops.length, kind).toBeGreaterThan(0);
      const b = recorder();
      drawOpening(b.ctx, { ...op, gm: true }, 0.34, theme, LW, { playerView: true, editor: true });
      expect(b.rec.ops, kind).toEqual([]);
    }
  });

  it('牆：每種新的牆都畫得出東西，在牆的厚度裡（橫、直；兩端收邊）；和實心牆的畫法不同', () => {
    const sig = (kind: WallKind) => {
      const { ctx, rec } = recorder();
      drawRun(ctx, { o: 'h', c: 0, a: 0, b: 6, kind, capA: true, capB: true }, theme, LW, false);
      return rec.ops.join();
    };
    for (const kind of NEW_WALLS) {
      expect(sig(kind), kind).not.toBe(sig('ext'));
      for (const o of ['h', 'v'] as const) {
        const run: WallRun = { o, c: 2, a: 1, b: 7.5, kind, capA: true, capB: false };
        const { ctx, rec } = recorder();
        drawRun(ctx, run, theme, LW, false);
        const t = WALL[kind].t;
        const b = box(rec.pts);
        const along = o === 'h' ? [b.x0, b.x1] : [b.y0, b.y1];
        const across = o === 'h' ? [b.y0, b.y1] : [b.x0, b.x1];
        expect(along[0], kind).toBeGreaterThanOrEqual(1 - t / 2 - 1e-6);
        expect(along[1], kind).toBeLessThanOrEqual(7.5 + 1e-6);
        expect(across[0], kind).toBeGreaterThanOrEqual(2 - t / 2 - 1e-6);
        expect(across[1], kind).toBeLessThanOrEqual(2 + t / 2 + 1e-6);
      }
    }
    expect(new Set(NEW_WALLS.map(sig)).size).toBe(3);
  });

  it('五種樣式都畫得出來（透明背景時裂痕用樣式原本的背景色）', () => {
    for (const th of Object.values(THEMES))
      for (const kind of NEW_WALLS) {
        const { ctx, rec } = recorder();
        drawRun(
          ctx,
          { o: 'h', c: 0, a: 0, b: 4, kind, capA: true, capB: true },
          { ...th, bg: 'transparent' },
          LW,
          false,
        );
        expect(rec.ops.length).toBeGreaterThan(0);
      }
  });
});
