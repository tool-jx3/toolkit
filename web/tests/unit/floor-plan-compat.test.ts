/**
 * 室內平面圖產生器：讀原作新版（v1.05～v1.13）存的 .trpgmap.json（規格 2.2.1～2.2.3、F213、D22～D25）。
 *
 * 範例資料是本站自己寫的（只用原作存檔的欄位名稱與種類代號，房間名稱、格局都是自己編的）。
 */
import { describe, expect, it } from 'vitest';
import { isAsset } from '@/tools/floor-plan/model/assets';
import { CAT } from '@/tools/floor-plan/model/catalog';
import {
  type CompatReport,
  compatCounts,
  LEGACY_OPENINGS,
  LEGACY_ROOM_CATS,
  LEGACY_WALLS,
} from '@/tools/floor-plan/model/compat';
import { type NormalizeReport, normalizeProject } from '@/tools/floor-plan/model/normalize';
import type { Floor, Project } from '@/tools/floor-plan/model/types';
import { computeWalls, wallLines } from '@/tools/floor-plan/model/walls';
import { S } from '@/tools/floor-plan/strings';

/** 原作 v1.13 新增的房間種類：室內／戶外與戶外房間的外圍（原作的定義；換成的種類要相同，自動牆才不會變） */
const UPSTREAM_ROOM_EDGES: Record<string, { outdoor: boolean; edge?: 'rail' | 'rock' | 'none' }> = {
  engawa: { outdoor: false },
  studio: { outdoor: false },
  stone: { outdoor: false },
  roof: { outdoor: false },
  industrial: { outdoor: false },
  grate: { outdoor: false },
  platform: { outdoor: true, edge: 'none' },
  track: { outdoor: true, edge: 'none' },
  road: { outdoor: true, edge: 'none' },
  rooftop: { outdoor: true, edge: 'rail' },
  slab: { outdoor: true, edge: 'none' },
  dirt: { outdoor: true, edge: 'none' },
  gravel: { outdoor: true, edge: 'none' },
  shipdeck: { outdoor: true, edge: 'rail' },
};
/** 原作 v1.13 新增的門窗：會開的門是單開（1）或雙開（2） */
const UPSTREAM_SWING: Record<string, 0 | 1 | 2> = {
  steel: 1,
  firedoor: 1,
  gate: 1,
  big2: 2,
  revolve: 0,
  sealed: 0,
  platewin: 0,
};

const NEW_ROOMS = Object.keys(UPSTREAM_ROOM_EDGES);
const NEW_OPENINGS = Object.keys(UPSTREAM_SWING);
const NEW_WALLS = ['stone', 'sound', 'cracked'];

/** 新的房間種類各一間，排成一列（每間 4×4，彼此相鄰） */
const newRooms = () =>
  NEW_ROOMS.map((cat, i) => ({
    id: `r-${cat}`,
    x: i * 4,
    y: 20,
    w: 4,
    h: 4,
    name: `新種類 ${i + 1}`,
    cat,
  }));

/** v1.13 格式的範例（自己寫的）：1F 是一般的房間，外面是新種類的房間，另有外觀的樓層 */
function v113(): Record<string, unknown> {
  return {
    app: 'indoor-map-maker',
    v: 1,
    tool: 'v1.13',
    name: '新版格式的範例',
    theme: 'paper',
    showSize: 'jo',
    showNames: true,
    tokenGrid: 2,
    floors: [
      {
        id: 'site',
        name: '外觀',
        showInside: true,
        inside: 'f1',
        rooms: [{ id: 'bldg', x: 0, y: 0, w: 20, h: 12, name: '主屋', cat: 'roof' }],
        walls: [],
        openings: [],
        items: [],
        texts: [],
      },
      {
        id: 'f1',
        name: '1F',
        rooms: [
          /* 左邊的大房間（石造、每間房的牆＝石牆）、右邊的隔音室（隔音牆） */
          { id: 'hall', x: 0, y: 0, w: 10, h: 12, name: '大廳', cat: 'stone', wall: 'stone' },
          { id: 'music', x: 10, y: 0, w: 10, h: 12, name: '練團室', cat: 'studio', wall: 'sound' },
          /* 戶外的房間設了 wall：原作也沒有作用，不算 */
          { id: 'yard', x: 0, y: 12, w: 20, h: 4, name: '前院', cat: 'dirt', wall: 'glass' },
          ...newRooms(),
        ],
        walls: [
          { id: 'w1', x1: 2, y1: 4, x2: 8, y2: 4, kind: 'stone' },
          { id: 'w2', x1: 2, y1: 8, x2: 8, y2: 8, kind: 'sound' },
          { id: 'w3', x1: 12, y1: 4, x2: 12, y2: 10, kind: 'cracked', gm: true },
        ],
        openings: [
          /* 上面的外牆：鐵門、防火門、格柵門、大型雙開門 */
          { id: 'o1', kind: 'steel', o: 'h', x: 1, y: 0, len: 1.5, side: 1, hinge: 0 },
          { id: 'o2', kind: 'firedoor', o: 'h', x: 4, y: 0, len: 2, side: -1, hinge: 1 },
          { id: 'o3', kind: 'gate', o: 'h', x: 11, y: 0, len: 2, side: 1, hinge: 0, gm: true },
          { id: 'o4', kind: 'big2', o: 'h', x: 14, y: 0, len: 5, side: 1, hinge: 0 },
          /* 中間的內牆：旋轉門、封印的門 */
          { id: 'o5', kind: 'revolve', o: 'v', x: 10, y: 1, len: 3, side: 1, hinge: 0 },
          { id: 'o6', kind: 'sealed', o: 'v', x: 10, y: 8, len: 2, side: -1, hinge: 0 },
          /* 右邊的外牆：鐵板封住的窗 */
          { id: 'o7', kind: 'platewin', o: 'v', x: 20, y: 2, len: 2, side: 1, hinge: 0 },
          /* 沿牆拉長的開口與最短的牆洞（v1.05） */
          { id: 'o8', kind: 'open', o: 'h', x: 0.5, y: 12, len: 7.25, side: 1, hinge: 0 },
          { id: 'o9', kind: 'hole', o: 'v', x: 0, y: 9, len: 0.5, side: 1, hinge: 0 },
        ],
        items: [
          { id: 'i1', t: 'sofa2', x: 1, y: 1, w: 3.2, h: 1.8, rot: 0 },
          /* 本工具沒有的家具（v1.05、v1.06、v1.10 各一種；同一種兩件） */
          { id: 'i2', t: 'throne', x: 4, y: 1, w: 2, h: 2, rot: 0 },
          { id: 'i3', t: 'npc_guard', x: 6, y: 1, w: 1, h: 1, rot: 0, clue: true },
          { id: 'i4', t: 'npc_guard', x: 7, y: 1, w: 1, h: 1, rot: 90 },
          { id: 'i5', t: 'swing', x: 2, y: 13, w: 2, h: 1, rot: 0 },
          /* 疊在牆上的素材：牆洞在練團室下面的外牆（y＝12）、崩塌在右邊的外牆（x＝20，轉 90°） */
          { id: 'i6', t: 'wall_hole', x: 12, y: 11.5, w: 2, h: 1, rot: 0, gm: true, label: '洞' },
          { id: 'i7', t: 'collapse_wall', x: 19.2, y: 6, w: 1.6, h: 3, rot: 90 },
          /* 不在牆線上的牆洞、和門重疊的崩塌、裂痕（裝飾）：都略過 */
          { id: 'i8', t: 'wall_hole', x: 5, y: 5, w: 2, h: 1, rot: 0 },
          { id: 'i9', t: 'collapse_wall', x: 0, y: -0.8, w: 3, h: 1.6, rot: 0 },
          { id: 'i10', t: 'crack_wall', x: 15, y: 11.6, w: 3, h: 0.8, rot: 0 },
        ],
        texts: [{ id: 't1', x: 5, y: 6, text: '舞台' }],
      },
    ],
    active: 1,
  };
}

function load(raw: unknown): { p: Project; report: NormalizeReport; compat: CompatReport } {
  const report: NormalizeReport = { droppedItems: 0 };
  const p = normalizeProject(raw, isAsset, report) as Project;
  expect(p).not.toBeNull();
  expect(report.compat).toBeDefined();
  return { p, report, compat: report.compat as CompatReport };
}

const conv = (c: CompatReport, type: string) =>
  Object.fromEntries(c.converted.filter((e) => e.type === type).map((e) => [e.from, [e.to, e.n]]));

describe('原作新版的種類換成最接近的種類（2.2.2、D22）', () => {
  it('對應表涵蓋原作 v1.05～v1.13 新增的每一種房間、門窗、牆', () => {
    expect(Object.keys(LEGACY_ROOM_CATS).sort()).toEqual([...NEW_ROOMS].sort());
    expect(Object.keys(LEGACY_OPENINGS).sort()).toEqual([...NEW_OPENINGS].sort());
    expect(Object.keys(LEGACY_WALLS).sort()).toEqual([...NEW_WALLS].sort());
  });

  it('換過的房間：室內／戶外與戶外的外圍和原作相同（自動牆的位置與種類不變）', () => {
    for (const [from, up] of Object.entries(UPSTREAM_ROOM_EDGES)) {
      const to = CAT[LEGACY_ROOM_CATS[from]];
      expect(Boolean(to.outdoor), from).toBe(up.outdoor);
      if (up.outdoor) expect(to.edge, from).toBe(up.edge);
    }
  });

  it('換過的門窗：會開的門換成會開的門，單開、雙開相同', () => {
    const swing = (k: string) => (k === 'door' || k === 'locked' ? 1 : k === 'door2' ? 2 : 0);
    for (const [from, s] of Object.entries(UPSTREAM_SWING))
      if (s) expect(swing(LEGACY_OPENINGS[from]), from).toBe(s);
  });

  it('房間 14 種、門窗 7 種、牆 3 種全部換掉，沒有丟掉；其他欄位照搬', () => {
    const { p, compat } = load(v113());
    const f1 = p.floors[1];
    const byId = Object.fromEntries(f1.rooms.map((r) => [r.id, r]));
    for (const cat of NEW_ROOMS) expect(byId[`r-${cat}`]?.cat, cat).toBe(LEGACY_ROOM_CATS[cat]);
    expect([byId.hall.cat, byId.music.cat, byId.yard.cat]).toEqual(['doma', 'office', 'garden']);
    expect(p.floors[0].rooms[0].cat).toBe('garage');
    /* 原作的 wall 欄位不留 */
    expect('wall' in byId.hall).toBe(false);

    const op = Object.fromEntries(f1.openings.map((o) => [o.id, o]));
    expect(['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'].map((id) => op[id]?.kind)).toEqual([
      'door',
      'door',
      'door',
      'door2',
      'auto',
      'locked',
      'boarded',
    ]);
    expect(op.o2).toEqual({
      id: 'o2',
      kind: 'door',
      o: 'h',
      x: 4,
      y: 0,
      len: 2,
      side: -1,
      hinge: 1,
    });
    expect(op.o3.gm).toBe(true);
    expect(op.o5).toMatchObject({ o: 'v', x: 10, y: 1, len: 3 });

    expect(f1.walls.map((w) => [w.id, w.kind, w.gm ?? false])).toEqual([
      ['w1', 'ext', false],
      ['w2', 'ext', false],
      ['w3', 'int', true],
    ]);

    expect(conv(compat, 'room')).toEqual({
      engawa: ['hall', 1],
      studio: ['office', 2],
      stone: ['doma', 2],
      roof: ['garage', 2],
      industrial: ['garage', 1],
      grate: ['tech', 1],
      platform: ['porch', 1],
      track: ['porch', 1],
      road: ['porch', 1],
      rooftop: ['balcony', 1],
      slab: ['porch', 1],
      dirt: ['garden', 2],
      gravel: ['garden', 1],
      shipdeck: ['balcony', 1],
    });
    expect(conv(compat, 'opening')).toEqual({
      steel: ['door', 1],
      firedoor: ['door', 1],
      gate: ['door', 1],
      big2: ['door2', 1],
      revolve: ['auto', 1],
      sealed: ['locked', 1],
      platewin: ['boarded', 1],
    });
    expect(conv(compat, 'wall')).toEqual({
      stone: ['ext', 1],
      sound: ['ext', 1],
      cracked: ['int', 1],
    });
  });

  it('換過的門窗都在牆上（切開牆），厚度跟著所在的牆', () => {
    const { p } = load(v113());
    const f1 = p.floors[1];
    const lines = wallLines(f1);
    for (const o of f1.openings) {
      const line = o.o === 'h' ? o.y : o.x;
      const start = o.o === 'h' ? o.x : o.y;
      const on = lines.some(
        (r) => r.o === o.o && r.c === line && r.a <= start && start + o.len <= r.b,
      );
      expect(on, o.id).toBe(true);
    }
    const w = computeWalls(f1);
    expect(['o1', 'o3', 'o5', 'o6', 'o7'].map((id) => w.openingKind.get(id))).toEqual([
      'ext',
      'ext',
      'int',
      'int',
      'ext',
    ]);
  });

  it('將來的版本才有的種類：房間 → 客廳類、牆 → 內牆（記下來）；門窗丟掉（記下來）', () => {
    const raw = v113();
    const f = (raw.floors as Record<string, unknown[]>[])[1];
    f.rooms.push({ id: 'z', x: 0, y: 30, w: 2, h: 2, name: '?', cat: 'moonbase' });
    f.walls.push({ id: 'zw', x1: 0, y1: 40, x2: 2, y2: 40, kind: 'forcefield' });
    f.openings.push({ id: 'zo', kind: 'portal', o: 'h', x: 0, y: 30, len: 1, side: 1, hinge: 0 });
    const { p, compat } = load(raw);
    const f1 = p.floors[1];
    expect(f1.rooms.find((r) => r.id === 'z')?.cat).toBe('living');
    expect(f1.walls.find((w) => w.id === 'zw')?.kind).toBe('int');
    expect(f1.openings.find((o) => o.id === 'zo')).toBeUndefined();
    expect(conv(compat, 'room').moonbase).toEqual(['living', 1]);
    expect(conv(compat, 'wall').forcefield).toEqual(['int', 1]);
    expect(compat.droppedOpenings).toEqual([{ kind: 'portal', n: 1 }]);
  });
});

describe('開口、牆洞（D23）', () => {
  it('沿牆拉長的開口、最短的牆洞照讀', () => {
    const { p } = load(v113());
    const op = Object.fromEntries(p.floors[1].openings.map((o) => [o.id, o]));
    expect(op.o8).toEqual({
      id: 'o8',
      kind: 'open',
      o: 'h',
      x: 0.5,
      y: 12,
      len: 7.25,
      side: 1,
      hinge: 0,
    });
    expect(op.o9).toEqual({
      id: 'o9',
      kind: 'hole',
      o: 'v',
      x: 0,
      y: 9,
      len: 0.5,
      side: 1,
      hinge: 0,
    });
  });

  it('疊在牆上的牆洞、崩塌 → 牆上的破洞（中間一段；GM 照搬）；不在牆上、重疊、裝飾的略過', () => {
    const { p, compat } = load(v113());
    const holes = p.floors[1].openings.filter((o) => o.kind === 'hole' && o.id !== 'o9');
    expect(holes.map(({ id: _id, ...o }) => o)).toEqual([
      /* 牆洞 (12～14) 在 y＝12 的外牆 → 中間一半 (12.5～13.5) */
      { kind: 'hole', o: 'h', x: 12.5, y: 12, len: 1, side: 1, hinge: 0, gm: true },
      /* 崩塌 (6～9) 在 x＝20 的外牆 → 兩端各去掉 0.5 (6.5～8.5) */
      { kind: 'hole', o: 'v', x: 20, y: 6.5, len: 2, side: 1, hinge: 0 },
    ]);
    expect(new Set(p.floors[1].openings.map((o) => o.id)).size).toBe(p.floors[1].openings.length);
    expect(conv(compat, 'overlay')).toEqual({ wall_hole: ['hole', 1], collapse_wall: ['hole', 1] });
    /* 家具：throne、npc_guard ×2、swing、不在牆上的牆洞、和門重疊的崩塌、裂痕 */
    expect(Object.fromEntries(compat.droppedItems.map((d) => [d.t, d.n]))).toEqual({
      throne: 1,
      npc_guard: 2,
      swing: 1,
      wall_hole: 1,
      collapse_wall: 1,
      crack_wall: 1,
    });
    expect(p.floors[1].items.map((i) => i.t)).toEqual(['sofa2']);
  });

  it('破洞切開牆；PL 檢視也一樣（和暗門不同）', () => {
    const { p } = load(v113());
    const f1 = p.floors[1];
    const cut = (f: Floor, pv: boolean) =>
      computeWalls(f, { playerView: pv }).runs.filter(
        (r) => r.o === 'h' && r.c === 12 && r.a < 13.5 && r.b > 12.5,
      );
    expect(cut(f1, false)).toEqual([]);
    expect(cut(f1, true)).toEqual([]);
  });
});

describe('略過的設定與家具（D24）', () => {
  it('每間房的牆種類（室內）、顯示內部、棋子方格各自計數；家具依代號計數', () => {
    const { p, report, compat } = load(v113());
    expect([compat.roomWalls, compat.insideFloors, compat.tokenGrid]).toEqual([2, 1, 2]);
    /* 樓層與專案上的這些欄位不留 */
    expect(Object.keys(p.floors[0]).sort()).toEqual(
      ['id', 'items', 'name', 'openings', 'rooms', 'texts', 'walls'].sort(),
    );
    expect('tokenGrid' in p).toBe(false);
    expect([p.showSize, p.theme, p.active, p.name]).toEqual(['ping', 'paper', 1, '新版格式的範例']);
    /* 舊的計數（家具丟掉幾件）照舊 */
    expect(report.droppedItems).toBe(7);
  });

  it('通知的計數與說明（D25）', () => {
    const { compat } = load(v113());
    expect(compatCounts(compat)).toEqual({ converted: 30, items: 7, openings: 0, settings: 4 });
    expect(S.compat.summary(compatCounts(compat))).toBe(
      '30 個換成相近的種類、7 件家具略過、4 項設定略過。',
    );
    expect(S.compat.summary({ converted: 0, items: 1, openings: 2, settings: 0 })).toBe(
      '1 件家具略過、2 個門窗略過。',
    );
  });
});

describe('舊格式（v1.04 以前）', () => {
  it('種類都認得時沒有要通知的東西', () => {
    const { compat } = load({
      app: 'indoor-map-maker',
      v: 1,
      tool: 'v1.04',
      name: '舊的',
      tokenGrid: 0,
      floors: [
        {
          id: 'f',
          name: '1F',
          rooms: [{ id: 'r', x: 0, y: 0, w: 4, h: 4, name: '房', cat: 'cave' }],
          walls: [{ id: 'w', x1: 0, y1: 0, x2: 2, y2: 0, kind: 'rock' }],
          openings: [{ id: 'o', kind: 'brokenwin', o: 'h', x: 0, y: 4, len: 2, side: 1, hinge: 0 }],
          items: [{ id: 'i', t: 'sofa2', x: 1, y: 1, w: 3.2, h: 1.8, rot: 0 }],
          texts: [],
        },
      ],
    });
    expect(compatCounts(compat)).toEqual({ converted: 0, items: 0, openings: 0, settings: 0 });
  });
});
