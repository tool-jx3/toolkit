/**
 * 室內平面圖產生器：2026-10-29（batch-1029d）——範本的 L 形走廊（規格 1.26 的 F270、D81）與
 * 「在地圖演出產生器開啟」帶房間的範圍（F271、D82；map-fx F85）。
 * - 山中小屋 2F、大學社團大樓 1F／2F、博物館 B1／1F 的「樓梯＋走廊」兩間拼起來的地方改成一間 L 形的走廊；
 *   格子＝原本兩間的格子、門窗與線索照舊（格局檢查在 floor-plan-templates.test.ts，57 個範本都跑）。
 * - 魔法師之塔 1F 的「門廳」（有名字）連著樓梯口改成一間 L 形（F272）：名字、編號圓標在最大的那一塊，送到 map-fx 時是一個 L 形。
 * - 範本的組裝工具、找線索的空位、弄舊的處理認得 L 形（缺角裡是空的）。
 * - 房間的範圍換算成匯出的圖的 px（留白、GM 字帶、好幾層排成一張、VTT 的倍率）、PL 用的圖不帶 GM 專用的房間。
 */
import { describe, expect, it } from 'vitest';
import { readHandoffRooms } from '@/core/handoff';
import { exportLayout, floorOffset } from '@/tools/floor-plan/draw/export';
import {
  type ExportSettings,
  exportJobs,
  exportOptions,
  handoffRoomsOf,
} from '@/tools/floor-plan/model/exportPlan';
import { emptyFloor } from '@/tools/floor-plan/model/geometry';
import { numberRooms } from '@/tools/floor-plan/model/numbering';
import {
  roomCells,
  roomContainsRect,
  roomHasPoint,
  roomMainRect,
} from '@/tools/floor-plan/model/shape';
import type { Floor, Project, Room } from '@/tools/floor-plan/model/types';
import { instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { FloorBuilder, Frame, fillYard } from '@/tools/floor-plan/templates/builder';
import { findSpot } from '@/tools/floor-plan/templates/clues';
import { decay } from '@/tools/floor-plan/templates/decay';
import { floorProblems, layoutProblems } from '../helpers/floorPlanLayout';

const room = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
): Room => ({ id, x, y, w, h, name: id, cat: 'living', ...extra });

const floorOf = (patch: Partial<Floor>, name = '1F'): Floor => ({ ...emptyFloor(name), ...patch });

const projectOf = (floors: Floor[], patch: Partial<Project> = {}): Project => ({
  name: 'T',
  theme: 'clean',
  showSize: 'none',
  showNames: true,
  floors,
  active: 0,
  ...patch,
});

const cellsOf = (rects: readonly Pick<Room, 'x' | 'y' | 'w' | 'h' | 'cut'>[]) =>
  rects.flatMap((r) => [...roomCells(r)].map(([x, y]) => `${x},${y}`)).sort();

/* ---------- 範本 ---------- */

/** 改成 L 形的走廊：範本、樓層、名字、原本拼起來的兩間 */
const L_HALLS = [
  {
    id: 'lodge',
    floor: '2F',
    name: '走廊',
    cut: { c: 'nw', w: 18, h: 8 },
    was: [
      { x: 0, y: 8, w: 18, h: 3 },
      { x: 18, y: 0, w: 4, h: 11 },
    ],
    gone: ['樓梯'],
  },
  {
    id: 'club-building',
    floor: '1F',
    name: '走廊',
    cut: { c: 'ne', w: 35, h: 7 },
    was: [
      { x: 0, y: 0, w: 5, h: 7 },
      { x: 0, y: 7, w: 40, h: 3 },
    ],
    gone: ['樓梯間'],
  },
  {
    id: 'club-building',
    floor: '2F',
    name: '走廊',
    cut: { c: 'ne', w: 35, h: 7 },
    was: [
      { x: 0, y: 0, w: 5, h: 7 },
      { x: 0, y: 7, w: 40, h: 3 },
    ],
    gone: ['樓梯間'],
  },
  {
    id: 'museum',
    floor: '1F',
    name: '走廊',
    cut: { c: 'ne', w: 6, h: 8 },
    was: [
      { x: 16, y: 0, w: 6, h: 8 },
      { x: 16, y: 8, w: 12, h: 6 },
    ],
    gone: ['樓梯・貨梯'],
  },
  {
    id: 'museum',
    floor: 'B1',
    name: '地下走廊',
    cut: { c: 'ne', w: 6, h: 8 },
    was: [
      { x: 16, y: 0, w: 6, h: 8 },
      { x: 16, y: 8, w: 12, h: 6 },
    ],
    gone: ['樓梯・貨梯'],
  },
] as const;

describe('範本的 L 形走廊（F270、D81）', () => {
  it('山中小屋 2F、大學社團大樓 1F／2F、博物館 B1／1F：樓梯與走廊是一間 L 形房間，格子和原本拼起來的兩間相同', () => {
    for (const h of L_HALLS) {
      const floors = instantiateTemplate(h.id) ?? [];
      const f = floors.find((x) => x.name === h.floor) as Floor;
      const halls = f.rooms.filter((r) => r.name === h.name);
      expect(halls, `${h.id} ${h.floor}`).toHaveLength(1);
      const L = halls[0];
      expect(L.cut).toEqual(h.cut);
      expect(L.hideLabel).toBe(true);
      expect(L.cat).toBe('hall');
      expect(cellsOf([L])).toEqual(cellsOf(h.was));
      for (const n of h.gone) expect(f.rooms.some((r) => r.name === n)).toBe(false);
      /* 原本兩間之間的開口拿掉了：L 形裡面（兩側都是這一間）沒有門窗 */
      for (const o of f.openings) {
        const [mx, my] = o.o === 'h' ? [o.x + o.len / 2, o.y] : [o.x, o.y + o.len / 2];
        const sides =
          o.o === 'h'
            ? [roomHasPoint(L, mx, my - 0.25), roomHasPoint(L, mx, my + 0.25)]
            : [roomHasPoint(L, mx - 0.25, my), roomHasPoint(L, mx + 0.25, my)];
        expect(sides.every(Boolean), `${h.id} ${h.floor} ${o.kind}@${o.x},${o.y}`).toBe(false);
      }
      expect(floorProblems(f, h.floor === '1F')).toEqual([]);
    }
  });

  it('其他 53 個範本沒有 L 形房間；改的四個範本的有名字的房間、GM 專用的房間、線索的房間都不變', () => {
    const changed = new Set<string>([...L_HALLS.map((h) => h.id), 'wizard-tower']);
    for (const t of TEMPLATES) {
      const floors = instantiateTemplate(t.id, { clues: true }) ?? [];
      const ls = floors.flatMap((f) => f.rooms.filter((r) => r.cut));
      if (!changed.has(t.id)) expect(ls, t.id).toEqual([]);
      else expect(ls.length, t.id).toBeGreaterThan(0);
    }
    const named = (id: string) =>
      (instantiateTemplate(id) ?? []).flatMap((f) =>
        f.rooms.filter((r) => !r.hideLabel).map((r) => `${f.name}/${r.name}${r.gm ? '*' : ''}`),
      );
    expect(named('lodge')).toEqual([
      '1F/廚房',
      '1F/餐廳',
      '1F/客廳',
      '1F/浴室',
      '1F/管理員室',
      '1F/倉庫・柴房',
      '1F/露台',
      '2F/儲藏室',
      '2F/浴室',
      '2F/主人房',
      '2F/客房 1',
      '2F/客房 2',
      '2F/客房 3',
      '2F/客房 4',
    ]);
    expect(named('club-building')).toHaveLength(22);
    expect(named('club-building')).toContain('2F/廢社的社辦*');
    expect(named('museum').sort()).toEqual(
      [
        'B1/收藏庫',
        'B1/燻蒸室*',
        'B1/機房*',
        'B1/未登錄品庫*',
        '1F/常設展示室',
        '1F/修復室',
        '1F/特展室',
        '1F/大廳',
        '1F/館長室',
        '1F/學藝員室*',
        '1F/紀念品店',
        '1F/廁所',
        '1F/前庭',
      ].sort(),
    );
    expect(named('wizard-tower')).toEqual([
      '1F/書庫',
      '1F/門廳',
      '2F/寢室*',
      '2F/研究室',
      '3F/召喚室*',
      '3F/觀星台',
    ]);
    for (const id of ['lodge', 'club-building', 'museum', 'wizard-tower'])
      expect(layoutProblems(instantiateTemplate(id, { clues: true }) ?? []), id).toEqual([]);
  });
});

describe('有名字的 L 形房間：魔法師之塔 1F 的門廳（F272、D81 修訂）', () => {
  const floors = () => instantiateTemplate('wizard-tower', { clues: true }) ?? [];

  it('門廳連著樓梯口是一間 L 形（缺左上角＝書庫）；格子＝原本的門廳＋樓梯間；2F、3F 的樓梯間照舊', () => {
    const [g, u, r] = floors();
    const hall = g.rooms.find((x) => x.name === '門廳') as Room;
    expect(hall).toMatchObject({ x: 0, y: 0, w: 20, h: 20, cut: { c: 'nw', w: 15, h: 8 } });
    expect(hall.hideLabel).toBeUndefined();
    expect(cellsOf([hall])).toEqual(
      cellsOf([
        { x: 0, y: 8, w: 20, h: 12 },
        { x: 15, y: 0, w: 5, h: 8 },
      ]),
    );
    expect(g.rooms.some((x) => x.name === '樓梯間')).toBe(false);
    expect(u.rooms.some((x) => x.name === '樓梯間')).toBe(true);
    expect(r.rooms.some((x) => x.name === '樓梯間')).toBe(true);
    /* 樓梯照舊在樓梯口（上下對齊） */
    const stairs = g.items.find((i) => i.t === 'spiral');
    expect(stairs && roomContainsRect(hall, stairs)).toBe(true);
    expect(floorProblems(g, true)).toEqual([]);
  });

  it('名字與依序編號的圓標在最大的那一塊（南邊的整列，和原本的門廳一樣）；線索放在 L 形裡', () => {
    const [g] = floors();
    const hall = g.rooms.find((x) => x.name === '門廳') as Room;
    const main = roomMainRect(hall);
    expect(main).toEqual({ x: 0, y: 8, w: 20, h: 12 });
    const n = numberRooms(g);
    const badge = n?.badges.find(
      (b) =>
        b.x >= main.x &&
        b.x <= main.x + main.w &&
        b.y >= main.y &&
        b.y <= main.y + main.h &&
        b.y < main.y + 2,
    );
    expect(badge).toBeTruthy();
    const key = g.items.find((i) => i.clue && i.t === 'key');
    expect(key && roomContainsRect(hall, key)).toBe(true);
  });

  it('送到地圖演出產生器：門廳是一個有名字的 L 形（缺角換算成圖的 px）', () => {
    const p = projectOf(floors(), { active: 0 });
    const { rooms } = roomsFor(p, { ...exp, view: 'pl' });
    const hall = rooms.list.find((r) => r.name === '門廳');
    expect(hall).toBeTruthy();
    expect(hall?.cut).toEqual({ c: 'nw', w: 15 * 24, h: 8 * 24 });
    expect(hall).toMatchObject({ w: 20 * 24, h: 20 * 24 });
    expect(rooms.list.map((r) => r.name)).toEqual(['書庫', '門廳']);
  });
});

describe('範本的組裝工具認得 L 形（2026-10-29）', () => {
  it('fillYard：L 形房間的缺角是空的，會被鋪上庭院', () => {
    const b = new FloorBuilder('1F');
    b.room('L', 'living', 0, 0, 6, 4, { cut: { c: 'ne', w: 3, h: 2 } });
    fillYard(b, 0, 0, 6, 4, '庭院');
    const yard = b.f.rooms.filter((r) => r.name === '庭院');
    expect(cellsOf(yard)).toEqual(cellsOf([{ x: 3, y: 0, w: 3, h: 2 }]));
  });

  it('Frame 左右、上下翻過來時缺角跟著翻', () => {
    const corners = (flipX: boolean, flipY: boolean) => {
      const b = new FloorBuilder('1F');
      const f = new Frame(b, 0, 0, 10, 10, flipX, flipY);
      for (const c of ['nw', 'ne', 'se', 'sw'] as const)
        f.room(c, 'living', 0, 0, 4, 4, { cut: { c, w: 1, h: 2 } });
      return b.f.rooms.map((r) => r.cut?.c);
    };
    expect(corners(false, false)).toEqual(['nw', 'ne', 'se', 'sw']);
    expect(corners(true, false)).toEqual(['ne', 'nw', 'sw', 'se']);
    expect(corners(false, true)).toEqual(['sw', 'se', 'ne', 'nw']);
    expect(corners(true, true)).toEqual(['se', 'sw', 'nw', 'ne']);
  });

  it('找線索的空位：不放在缺角裡（含內縮 0.35 格），離最大的那一塊的中心最近', () => {
    const b = new FloorBuilder('1F');
    b.room('L', 'living', 0, 0, 10, 10, { cut: { c: 'ne', w: 6, h: 6 } });
    const L = b.f.rooms[0];
    for (const [w, h] of [
      [1, 1],
      [2, 1.5],
      [3, 0.8],
      [1.2, 5],
    ]) {
      const spot = findSpot(b.f, L, w, h);
      expect(spot).not.toBeNull();
      const r = { x: spot?.x ?? 0, y: spot?.y ?? 0, w, h };
      expect(roomContainsRect(L, { x: r.x - 0.34, y: r.y - 0.34, w: w + 0.68, h: h + 0.68 })).toBe(
        true,
      );
    }
    /* 放不下的（L 的兩隻手都只有 4 格寬，內縮之後 3.3 格）：null，不會放進缺角 */
    expect(findSpot(b.f, L, 3.5, 3.5)).toBeNull();
  });

  it('弄舊的處理：散落的瓦礫、碎玻璃都在 L 形裡面（不落在缺角）', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = new FloorBuilder('1F');
      b.room('L', 'living', 0, 0, 12, 12, { cut: { c: 'sw', w: 7, h: 7 } });
      const [f] = decay([b.f], seed);
      for (const it of f.items)
        expect(roomContainsRect(f.rooms[0], it), `${seed} ${it.t}`).toBe(true);
    }
  });
});

/* ---------- 帶房間的範圍給地圖演出產生器 ---------- */

const exp: ExportSettings = {
  range: 'current',
  view: 'gm',
  clues: 'show',
  px: 24,
  grid: false,
  transparent: false,
};

const roomsFor = (p: Project, e: ExportSettings) => {
  const [job] = exportJobs(p, e);
  const opts = exportOptions(p, e, p.theme, e.px);
  const L = exportLayout(job.floors, opts);
  return { L, rooms: handoffRoomsOf(job.floors, L, opts) };
};

describe('送到地圖演出產生器的房間範圍（F271、D82）', () => {
  const f = floorOf({
    rooms: [
      room('客廳', 0, 0, 12, 10, { cut: { c: 'ne', w: 5, h: 4 }, plName: '大房間' }),
      room('書房', 7, 0, 5, 4),
      room('密室', 12, 0, 6, 10, { gm: true }),
      room('暗櫃', 13, 1, 2, 2),
      room('走道', 0, 10, 18, 2, { hideLabel: true }),
    ],
  });
  const p = projectOf([f]);

  it('GM 用：有名字的房間照「依序編號」的順序（GM 專用的接在後面）；換算成圖的 px（留白 2 格、GM 字帶）；L 形帶缺角', () => {
    const { L, rooms } = roomsFor(p, exp);
    expect(rooms.width).toBe(L.pxWidth);
    expect(rooms.height).toBe(L.pxHeight);
    /* 左上角：留白 2 格 × 24 px；上面多一條 GM 字帶 */
    const ox = 48;
    const oy = 48 + L.badgeH * 24;
    expect(L.badgeH).toBeGreaterThan(0);
    expect(rooms.list).toEqual([
      { name: '客廳', x: ox, y: oy, w: 288, h: 240, cut: { c: 'ne', w: 120, h: 96 } },
      { name: '書房', x: ox + 168, y: oy, w: 120, h: 96 },
      { name: '密室', x: ox + 288, y: oy, w: 144, h: 240, gm: true },
      { name: '暗櫃', x: ox + 312, y: oy + 24, w: 48, h: 48, gm: true },
    ]);
  });

  it('PL 用：不帶 GM 專用的房間與在它裡面的房間；名字用「給 PL 看的名字」；匯出不顯示名字時名字是空的', () => {
    const { rooms } = roomsFor(p, { ...exp, view: 'pl' });
    expect(rooms.list.map((r) => r.name)).toEqual(['大房間', '書房']);
    expect(rooms.list.some((r) => r.gm)).toBe(false);
    /* PL 用的圖沒有 GM 字帶：上面只有留白 */
    expect(rooms.list[0]).toMatchObject({ x: 48, y: 48 });
    const hidden = roomsFor(projectOf([f], { showNames: false }), { ...exp, view: 'pl' }).rooms;
    expect(hidden.list.map((r) => r.name)).toEqual(['', '']);
  });

  it('所有樓層排成一張：每一層的房間照它在圖上的位置（第二層往右一層寬＋間隔）', () => {
    const g = floorOf({ rooms: [room('臥室', 0, 0, 8, 6)] }, '2F');
    const two = projectOf([f, g]);
    const e: ExportSettings = { ...exp, range: 'all', view: 'pl' };
    const { L, rooms } = roomsFor(two, e);
    expect(L.frames).toHaveLength(2);
    const o2 = floorOffset(L, 1);
    expect(o2.x).toBe(L.frames[0].w + L.gap - L.frames[1].x);
    const bed = rooms.list.find((r) => r.name === '臥室');
    expect(bed).toEqual({ name: '臥室', x: o2.x * 24, y: o2.y * 24, w: 192, h: 144 });
    /* 第一層的房間在左邊 */
    const living = rooms.list.find((r) => r.name === '大房間');
    expect(living?.x).toBe(floorOffset(L, 0).x * 24);
    expect((living?.x ?? 0) + (living?.w ?? 0)).toBeLessThan(bed?.x ?? 0);
  });

  it('每層各一張：送的是這一層那一張的房間', () => {
    const g = floorOf({ rooms: [room('臥室', 0, 0, 8, 6)] }, '2F');
    const two = projectOf([f, g], { active: 1 });
    const e: ExportSettings = { ...exp, range: 'each', view: 'pl' };
    const jobs = exportJobs(two, e);
    const job = jobs[two.active];
    const opts = exportOptions(two, e, two.theme, e.px);
    const r = handoffRoomsOf(job.floors, exportLayout(job.floors, opts), opts);
    expect(r.list.map((x) => x.name)).toEqual(['臥室']);
  });

  it('VTT 用（每格 px 不是整數）：每條邊各自四捨五入，相鄰的房間共用同一條線、L 形的缺角對齊牆線', () => {
    const vtt: ExportSettings = { ...exp, view: 'pl', mode: 'vtt', vttPx: 100 };
    const q = projectOf([f], { tokenGrid: 3 });
    const { L, rooms } = roomsFor(q, vtt);
    expect(L.scale).toBeCloseTo(100 / 3);
    const [living, study] = rooms.list;
    for (const v of [living.x, living.y, living.w, living.h, study.x, study.w]) {
      expect(Number.isInteger(v)).toBe(true);
    }
    /* 書房的左緣＝客廳缺角的內側、右緣＝客廳的右緣 */
    expect(study.x).toBe(living.x + living.w - (living.cut?.w ?? 0));
    expect(study.x + study.w).toBe(living.x + living.w);
    expect(study.h).toBe(living.cut?.h);
  });

  it('沒有有名字的房間時是空的清單；共用的 readHandoffRooms 讀得回來', () => {
    const empty = projectOf([floorOf({ rooms: [room('走道', 0, 0, 6, 2, { hideLabel: true })] })]);
    expect(roomsFor(empty, exp).rooms.list).toEqual([]);
    const { rooms } = roomsFor(p, exp);
    expect(readHandoffRooms({ rooms: structuredClone(rooms) })).toEqual(rooms);
  });
});
