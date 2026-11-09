/**
 * 室內平面圖產生器 2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」第二批（演出；規格 1.30、3.19、F313～F328）：
 * 演出的資料（藏起來的房間與樓層、移動路線）的整理與舊版、路線怎麼走（門、走廊、跨樓層經過樓梯）、自動產生演出、
 * 時間軸（每一步公開什麼、長度、某一個時間的狀態、鏡頭）、控制點的拖曳、PL 用的演出畫面沒有 GM 的內容、分享連結。
 */
import { describe, expect, it } from 'vitest';
import { createProjectFile, parseProject } from '@/core/storage';
import {
  drawStageFrame,
  drawStageState,
  stageFloor,
  stageScene,
} from '@/tools/floor-plan/draw/stage';
import { getTheme } from '@/tools/floor-plan/draw/themes';
import { DATA_VERSION } from '@/tools/floor-plan/editor/store';
import { isAsset } from '@/tools/floor-plan/model/assets';
import { visibleFloor } from '@/tools/floor-plan/model/geometry';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import {
  floorNavigator,
  inPoly,
  planRoute,
  polyOf,
  roomAnchor,
  roomKey,
  routeContext,
  routeTouchesRoom,
} from '@/tools/floor-plan/model/route';
import { encodeMapHash, readMapHash } from '@/tools/floor-plan/model/share';
import {
  autoStage,
  buildTimeline,
  dragRouteHandle,
  hasStage,
  normalizeStage,
  removeStageRoute,
  STAGE_TIMING,
  stageCameraAt,
  stageFrameAt,
  stepAt,
  stepState,
  toggleStageRoom,
} from '@/tools/floor-plan/model/stage';
import type {
  Floor,
  Item,
  Opening,
  Project,
  Room,
  StageRoute,
} from '@/tools/floor-plan/model/types';
import { instantiateTemplate } from '@/tools/floor-plan/templates';
import {
  installRecordingDocument,
  type RecordingCanvas,
  recordingCanvas,
} from '../helpers/recordingCanvas';

const room = (
  id: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
): Room => ({
  id,
  name,
  cat: 'living',
  x,
  y,
  w,
  h,
  ...extra,
});
const door = (id: string, o: 'h' | 'v', x: number, y: number, len = 2): Opening => ({
  id,
  kind: 'door',
  o,
  x,
  y,
  len,
  side: 1,
  hinge: 0,
});
const item = (
  id: string,
  t: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Item> = {},
): Item => ({
  id,
  t,
  x,
  y,
  w,
  h,
  rot: 0,
  ...extra,
});
const floorOf = (id: string, name: string, f: Partial<Floor>): Floor => ({
  id,
  name,
  rooms: [],
  walls: [],
  openings: [],
  items: [],
  texts: [],
  ...f,
});

function projectOf(floors: Floor[], patch: Partial<Project> = {}): Project {
  return {
    name: '測試',
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors,
    active: 0,
    ...patch,
  };
}

/**
 * 兩層樓：1F 玄關（0..8）、走廊（8..12，樓梯在走廊北端）、書房（12..20）；2F 樓梯間（8..12）、臥室（12..20）。
 * 門：玄關↔走廊（x=8, y 5..7）、走廊↔書房（x=12, y 9..11）、2F 樓梯間↔臥室（x=12, y 5..7）。
 */
function twoFloors(): Floor[] {
  const g = floorOf('f1', '1F', {
    rooms: [
      room('entry', '玄關', 0, 0, 8, 12, { cat: 'hall' }),
      room('hall1', '走廊', 8, 0, 4, 12, { cat: 'hall' }),
      room('study', '書房', 12, 0, 8, 12, { cat: 'office' }),
    ],
    openings: [door('d1', 'v', 8, 5), door('d2', 'v', 12, 9)],
    items: [item('s1', 'stairs', 9, 0.5, 2, 5)],
  });
  const t = floorOf('f2', '2F', {
    rooms: [
      room('hall2', '樓梯間', 8, 0, 4, 12, { cat: 'hall' }),
      room('bed', '臥室', 12, 0, 8, 12, { cat: 'bedroom' }),
    ],
    openings: [door('d3', 'v', 12, 5)],
    items: [item('s2', 'stairs', 9, 0.5, 2, 5)],
  });
  return [g, t];
}

const clock = (): Project =>
  projectOf(instantiateTemplate('clockshop') ?? [], { name: '鐘錶行', active: 1 });

/** 折線每一段都在某一間房裡（不穿牆）：每段取 9 點，都在某一間房的外形裡或邊上（門的位置） */
function insideRooms(f: Floor, pts: { x: number; y: number }[]): boolean {
  const polys = f.rooms.map(polyOf);
  const near = (p: { x: number; y: number }) =>
    polys.some((poly) => inPoly(poly, p)) ||
    f.openings.some((o) =>
      o.o === 'v'
        ? Math.abs(p.x - o.x) < 1.1 && p.y >= o.y && p.y <= o.y + o.len
        : Math.abs(p.y - o.y) < 1.1 && p.x >= o.x && p.x <= o.x + o.len,
    );
  for (let i = 1; i < pts.length; i++)
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const p = {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
      };
      if (!near(p)) return false;
    }
  return true;
}

describe('專案檔與整理（版本 11、F327、D121）', () => {
  it('版本 11；演出照讀，指到不存在的房間、樓層的拿掉，路線的數字夾回來、時機指到不見的路線變成最後', () => {
    expect(DATA_VERSION).toBe(11);
    const floors = twoFloors();
    const raw = {
      ...projectOf(floors),
      stage: {
        rooms: [
          { floor: 'f1', room: 'study', when: 'route:a1', order: 2.4 },
          { floor: 'f1', room: 'nope' },
          { floor: 'zz', room: 'study' },
          { floor: 'f2', room: 'bed', when: 'route:missing' },
          { floor: 'f2', room: 'bed' },
          { floor: 'f2', room: 'hall2', when: 'manual' },
        ],
        floors: ['f2', 'f2', 'nope'],
        routes: [
          { id: 'a1', floor: 'f1', x1: 1, y1: 2, cx: 3, cy: 4, x2: 9999, y2: 6, w: 9 },
          {
            id: 'a1',
            floor: 'f1',
            x1: 0,
            y1: 0,
            x2: 1,
            y2: 1,
            pts: [
              [0, 0],
              [1, 1],
            ],
          },
          { id: 'bad', floor: 'f1', x1: 'x', y1: 0, x2: 1, y2: 1 },
          { id: 'b', floor: 'nope', x1: 0, y1: 0, x2: 1, y2: 1 },
        ],
      },
    };
    const p = normalizeProject(raw, isAsset) as Project;
    expect(p.stage?.rooms).toEqual([
      { floor: 'f1', room: 'study', when: 'route:a1', order: 2 },
      { floor: 'f2', room: 'bed', when: 'after' },
      { floor: 'f2', room: 'hall2', when: 'manual' },
    ]);
    expect(p.stage?.floors).toEqual(['f2']);
    expect(p.stage?.routes).toHaveLength(2);
    expect(p.stage?.routes?.[0]).toEqual({
      id: 'a1',
      floor: 'f1',
      x1: 1,
      y1: 2,
      cx: 3,
      cy: 4,
      x2: 4096,
      y2: 6,
      w: 3,
    });
    /* 重複的 id 換新的；沒有控制點時放中點 */
    expect(p.stage?.routes?.[1].id).not.toBe('a1');
    expect(p.stage?.routes?.[1]).toMatchObject({
      cx: 0.5,
      cy: 0.5,
      pts: [
        [0, 0],
        [1, 1],
      ],
    });
    /* 空的演出不寫 */
    expect(normalizeStage({ rooms: [], floors: [], routes: [] }, floors)).toBeUndefined();
    expect(normalizeProject({ ...projectOf(floors), stage: 'x' }, isAsset)?.stage).toBeUndefined();
  });

  it('版本 10 的檔（沒有演出）照讀；專案檔往返演出不變；改演出不碰祕密樓層', () => {
    const v10 = normalizeProject(projectOf(twoFloors()), isAsset) as Project;
    expect(v10.stage).toBeUndefined();
    expect(hasStage(v10)).toBe(false);
    const p = structuredClone(v10);
    toggleStageRoom(p, 'f1', 'study');
    p.stage = {
      ...p.stage,
      floors: ['f2'],
      routes: [{ id: 'r', floor: 'f1', x1: 1, y1: 1, cx: 2, cy: 2, x2: 3, y2: 3 }],
    };
    const file = parseProject<Project>(
      JSON.stringify(createProjectFile('floor-plan', DATA_VERSION, p)),
      'floor-plan',
    );
    expect(file.version).toBe(11);
    expect(normalizeProject(file.data, isAsset)).toEqual(p);
    expect(p.floors.some((f) => f.secret)).toBe(false);
    /* 刪掉路線：指到它的時機改成「所有路線之後」 */
    p.stage.rooms = [{ floor: 'f1', room: 'study', when: 'route:r' }];
    removeStageRoute(p, 'r');
    expect(p.stage?.rooms).toEqual([{ floor: 'f1', room: 'study', when: 'after' }]);
  });

  it('分享連結：完整的帶演出（樓層、房間、路線換成順序再換回來）、PL 用的不帶', () => {
    const p = normalizeProject(projectOf(twoFloors()), isAsset) as Project;
    p.stage = {
      rooms: [
        { floor: 'f1', room: 'study', when: 'route:r2', order: 1 },
        { floor: 'f2', room: 'bed', when: 'manual' },
      ],
      floors: ['f2'],
      routes: [
        { id: 'r1', floor: 'f1', x1: 1, y1: 1, cx: 2, cy: 2, x2: 3, y2: 3 },
        {
          id: 'r2',
          floor: 'f2',
          x1: 9,
          y1: 2,
          cx: 10,
          cy: 2,
          x2: 11,
          y2: 3,
          pts: [
            [9, 2],
            [11, 3],
          ],
          w: 1.15,
        },
      ],
    };
    const full = readMapHash(encodeMapHash(p, 'full').hash);
    const back = normalizeProject(full.kind === 'ok' ? full.raw : null, isAsset) as Project;
    const fid = (i: number) => back.floors[i].id;
    expect(back.stage?.floors).toEqual([fid(1)]);
    expect(back.stage?.rooms).toEqual([
      {
        floor: fid(0),
        room: back.floors[0].rooms[2].id,
        when: `route:${back.stage?.routes?.[1].id}`,
        order: 1,
      },
      { floor: fid(1), room: back.floors[1].rooms[1].id, when: 'manual' },
    ]);
    expect(back.stage?.routes?.map(({ id: _i, floor, ...r }) => ({ ...r, floor }))).toEqual(
      p.stage.routes?.map(({ id: _i, floor, ...r }) => ({
        ...r,
        floor: floor === 'f1' ? fid(0) : fid(1),
      })),
    );
    const pl = encodeMapHash(p, 'pl');
    expect(pl.removed.stage).toBe(1);
    const plBack = readMapHash(pl.hash);
    expect((plBack.kind === 'ok' ? (plBack.raw as Project) : null)?.stage).toBeUndefined();
    /* 沒有演出時連結不變（長度同改版前） */
    const plain = normalizeProject(projectOf(twoFloors()), isAsset) as Project;
    expect(encodeMapHash(plain, 'full').hash).not.toContain('stage');
  });
});

describe('路線怎麼走（F316、F317、3.19.3）', () => {
  it('一層樓：經過門（門的兩側離牆 0.96 格），每一段都在房間裡', () => {
    const [g] = twoFloors();
    const nav = floorNavigator(g);
    const a = roomAnchor(g.rooms[0]);
    const b = roomAnchor(g.rooms[2]);
    const pts = nav(a, b);
    expect(pts).not.toBeNull();
    expect(pts?.[0]).toEqual(a);
    expect(pts?.[pts.length - 1]).toEqual(b);
    /* 經過兩扇門：穿過 x＝8、x＝12 的地方都在門的範圍裡 */
    const crossAt = (x: number) =>
      (pts ?? []).flatMap((p, i, a) => {
        const q = a[i - 1];
        if (!q || (q.x - x) * (p.x - x) > 0 || q.x === p.x) return [];
        return [q.y + ((p.y - q.y) * (x - q.x)) / (p.x - q.x)];
      });
    expect(crossAt(8).length).toBe(1);
    expect(crossAt(8).every((y) => y > 5 && y < 7)).toBe(true);
    expect(crossAt(12).every((y) => y > 9 && y < 11)).toBe(true);
    expect(insideRooms(g, pts ?? [])).toBe(true);
    /* 沒有門的房間走不到 */
    const closed = { ...g, openings: [] };
    expect(floorNavigator(closed)(a, b)).toBeNull();
  });

  it('沒有牆的邊（兩間戶外房間之間）可以直接走過去', () => {
    const f = floorOf('f', '1F', {
      rooms: [
        room('g1', '庭院', 0, 0, 10, 10, { cat: 'garden' }),
        room('g2', '門廊', 10, 0, 6, 10, { cat: 'porch' }),
      ],
    });
    const pts = floorNavigator(f)(roomAnchor(f.rooms[0]), roomAnchor(f.rooms[1]));
    expect(pts).not.toBeNull();
  });

  it('跨樓層：1F 玄關 → 2F 臥室，經過樓梯（1F 一段、2F 一段），樓梯間是經過的房間', () => {
    const p = projectOf(twoFloors());
    const ctx = routeContext(p);
    const plan = planRoute(
      ctx,
      { level: 0, room: p.floors[0].rooms[0] },
      { level: 1, room: p.floors[1].rooms[1] },
    );
    expect(plan?.legs.map((l) => l.level)).toEqual([0, 1]);
    expect(plan?.hops).toHaveLength(1);
    expect(plan?.hops[0].rooms).toEqual([roomKey('f1', 'hall1'), roomKey('f2', 'hall2')]);
    /* 1F 那一段走到樓梯前面的平台（左半＝往上）、2F 那一段從樓梯前面的平台（右半）出發 */
    const leg1 = plan?.legs[0].pts ?? [];
    const leg2 = plan?.legs[1].pts ?? [];
    expect(leg1[leg1.length - 1].x).toBeLessThan(10);
    expect(leg2[0].x).toBeGreaterThan(10);
    expect(insideRooms(p.floors[0], leg1)).toBe(true);
    expect(insideRooms(p.floors[1], leg2)).toBe(true);
    /* 樓梯拿掉就走不到 */
    const none = projectOf(twoFloors().map((f) => ({ ...f, items: [] })));
    const c2 = routeContext(none);
    expect(
      planRoute(
        c2,
        { level: 0, room: none.floors[0].rooms[0] },
        { level: 1, room: none.floors[1].rooms[1] },
      ),
    ).toBeNull();
  });

  it('鐘錶行：1F 店面 → 2F 書房經過東北角的樓梯', () => {
    const p = clock();
    const ctx = routeContext(p);
    const shop = p.floors[1].rooms.find((r) => r.name === '店面') as Room;
    const study = p.floors[2].rooms.find((r) => r.name === '書房') as Room;
    const plan = planRoute(ctx, { level: 1, room: shop }, { level: 2, room: study });
    expect(plan?.legs).toHaveLength(2);
    const stairs = (f: Floor) => f.rooms.find((r) => r.name === '樓梯間') as Room;
    expect(plan?.hops[0].rooms).toEqual([
      roomKey(p.floors[1].id, stairs(p.floors[1]).id),
      roomKey(p.floors[2].id, stairs(p.floors[2]).id),
    ]);
  });
});

describe('自動產生演出（F320）', () => {
  it('鐘錶行：從 1F 的入口出發、往上；房間藏起來、路線經過樓梯；祕密樓層不碰', () => {
    const p = clock();
    const r = autoStage(p);
    expect(r).not.toBeNull();
    const stage = r?.stage;
    const f1 = p.floors[1];
    expect(r?.start).toBe(f1.id);
    /* 入口（第一間：店面）一開始就公開；走廊・樓梯、陽台、地面、GM 專用的不藏 */
    const hidden = (f: Floor) =>
      f.rooms
        .filter((x) => stage?.rooms?.some((e) => e.floor === f.id && e.room === x.id))
        .map((x) => x.name);
    expect(hidden(f1)).toEqual(['修理工房']);
    expect(hidden(p.floors[2])).toEqual(['客廳', '臥室', '浴室', '書房']);
    expect(hidden(p.floors[0])).toEqual([]);
    /* 1F 兩條（店面 → 修理工房 → 樓梯）、2F 三條 */
    expect(stage?.routes?.map((x) => x.floor)).toEqual([
      f1.id,
      f1.id,
      p.floors[2].id,
      p.floors[2].id,
      p.floors[2].id,
    ]);
    expect(stage?.routes?.every((x) => x.pts && x.w === 1.15)).toBe(true);
    expect(r?.disconnected).toBe(0);
  });

  it('曲線的房間（夜航蒸汽客輪）：船體、甲板的外形取樣的點不當成轉角，路線照樣走得到、每段都在房間裡', () => {
    const p = projectOf(instantiateTemplate('steamliner') ?? [], { name: '客輪', active: 1 });
    const r = autoStage(p);
    expect(r?.disconnected).toBe(0);
    const routes = r?.stage?.routes ?? [];
    expect(routes.length).toBeGreaterThan(3);
    for (const x of routes) {
      const f = p.floors.find((q) => q.id === x.floor) as Floor;
      expect(
        insideRooms(
          f,
          (x.pts ?? []).map(([px, py]) => ({ x: px, y: py })),
        ),
      ).toBe(true);
    }
  });

  it('走不到的房間最後公開；只有一間房時藏起來、最後公開；沒有房間時 null', () => {
    const [g] = twoFloors();
    const lone = room('lone', '倉庫', 30, 0, 6, 6, { cat: 'storage' });
    const p = projectOf([{ ...g, rooms: [...g.rooms, lone] }]);
    const r = autoStage(p);
    expect(r?.disconnected).toBe(1);
    const tl = buildTimeline({ ...p, stage: r?.stage });
    expect(tl.steps[tl.steps.length - 1]).toMatchObject({
      kind: 'room',
      revealRooms: [roomKey(g.id, 'lone')],
    });
    const one = projectOf([floorOf('f', '1F', { rooms: [room('a', '客廳', 0, 0, 6, 6)] })]);
    expect(autoStage(one)?.stage?.rooms).toEqual([{ floor: 'f', room: 'a', when: 'after' }]);
    expect(autoStage(projectOf([floorOf('f', '1F', {})]))).toBeNull();
  });
});

describe('時間軸（F319、F321、3.19.4）', () => {
  /** 兩層：1F 玄關 → 書房（路線 1）、2F 臥室（路線 2 經過樓梯）；2F 整層藏起來；書房、臥室藏起來；倉庫手動 */
  function staged(): Project {
    const p = normalizeProject(projectOf(twoFloors()), isAsset) as Project;
    const ctx = routeContext(p);
    const [g, t] = p.floors;
    const plan1 = floorNavigator(g)(roomAnchor(g.rooms[0]), roomAnchor(g.rooms[2]));
    const plan2 = planRoute(ctx, { level: 0, room: g.rooms[2] }, { level: 1, room: t.rooms[1] });
    const toRoute = (id: string, floor: string, pts: { x: number; y: number }[]): StageRoute => ({
      id,
      floor,
      x1: pts[0].x,
      y1: pts[0].y,
      cx: pts[1].x,
      cy: pts[1].y,
      x2: pts[pts.length - 1].x,
      y2: pts[pts.length - 1].y,
      pts: pts.map((q) => [q.x, q.y]),
    });
    const legs = plan2?.legs ?? [];
    p.stage = {
      rooms: [
        { floor: g.id, room: 'study' },
        { floor: t.id, room: 'bed' },
        { floor: g.id, room: 'entry', when: 'manual' },
      ],
      floors: [t.id],
      routes: [
        toRoute('a', g.id, plan1 ?? []),
        toRoute('b', g.id, legs[0].pts),
        toRoute('c', t.id, legs[1].pts),
      ],
    };
    return p;
  }

  it('每一步公開什麼、長度（開始前 0.8、路線 1.7、經過樓梯再 0.7）', () => {
    const p = staged();
    const tl = buildTimeline(p);
    const [g, t] = p.floors;
    expect(tl.steps.map((s) => s.kind)).toEqual(['start', 'route', 'route', 'route']);
    expect(tl.steps.map((s) => s.duration)).toEqual([0.8, 1.7, 1.7, 2.4]);
    expect(tl.total).toBe(6.6);
    expect(tl.steps[0].hidden.size).toBe(3);
    expect(tl.steps[0].hiddenFloors.has(t.id)).toBe(true);
    /* 路線 a 碰到書房 → 公開；路線 c 經過樓梯：2F 整層公開、樓梯過場、臥室公開 */
    expect(tl.steps[1].revealRooms).toEqual([roomKey(g.id, 'study')]);
    expect(tl.steps[2].revealRooms).toEqual([]);
    expect(tl.steps[3]).toMatchObject({
      bridge: true,
      revealFloors: [t.id],
      revealRooms: [roomKey(t.id, 'bed')],
    });
    expect(tl.steps[3].hops).toHaveLength(1);
    /* 手動的玄關一直藏著 */
    expect(tl.manual).toEqual([roomKey(g.id, 'entry')]);
    expect([...tl.steps[3].hidden]).toEqual([roomKey(g.id, 'entry')]);
    expect(tl.info.get(roomKey(g.id, 'study'))).toMatchObject({
      mode: 'route',
      index: 0,
      via: 'touch',
    });
    expect(tl.info.get(roomKey(g.id, 'entry'))).toEqual({ mode: 'manual' });
  });

  it('某一個時間的畫面：淡入 0.32 秒、路線 0.88 秒畫完才有箭頭、經過樓梯的過場', () => {
    const tl = buildTimeline(staged());
    const s1 = tl.steps[1];
    const at = (t: number) => stageFrameAt(tl, t);
    expect(stepAt(tl, 0.79)).toBe(0);
    expect(at(0.5)).toMatchObject({ step: 0, from: null, alpha: 1 });
    const f = at(s1.start + 0.16);
    expect(f.step).toBe(1);
    expect(f.alpha).toBeCloseTo(0.5, 5);
    expect(f.to.routes).toHaveLength(1);
    expect(f.to.routes[0]).toMatchObject({ id: 'a', head: false });
    expect(f.to.routes[0].progress).toBeCloseTo(0.16 / STAGE_TIMING.routeDraw, 9);
    expect(at(s1.start + 1).to.routes[0]).toEqual({ id: 'a', progress: 1, head: true });
    expect(at(s1.start + 1).from).toBeNull();
    /* 經過樓梯：前 0.7 秒是過場（臥室還藏著、路線 c 還沒出現、走樓梯的線畫出來） */
    const s3 = tl.steps[3];
    const bridge = at(s3.start + 0.34);
    expect(bridge.to.routes.map((r) => r.id)).toEqual(['a', 'b']);
    expect(bridge.to.bridges).toHaveLength(1);
    expect(bridge.to.bridges[0]).toMatchObject({ id: 'c', index: 2, head: false });
    expect(bridge.to.bridges[0].progress).toBeCloseTo(0.5, 9);
    expect(bridge.to.hidden.has(roomKey(s3.floor, 'bed'))).toBe(true);
    const after = at(s3.start + 0.7 + 0.44);
    expect(after.to.routes.at(-1)).toMatchObject({ id: 'c', head: false });
    expect(after.to.routes.at(-1)?.progress).toBeCloseTo(0.5, 9);
    expect(after.to.hidden.has(roomKey(s3.floor, 'bed'))).toBe(false);
    expect(after.from).toBeNull();
    /* 過場之後的頭 0.32 秒：從畫好的走樓梯的線淡入 */
    expect(at(s3.start + 0.7 + 0.1).from?.bridges[0].progress).toBe(1);
    /* 減少動態效果：不淡入、一次畫好 */
    expect(stageFrameAt(tl, s1.start + 0.1, true)).toMatchObject({ from: null, alpha: 1 });
    expect(stageFrameAt(tl, s1.start + 0.1, true).to.routes[0].progress).toBe(1);
  });

  it('沒有路線時：整層藏起來的樓層一層一步，再「所有路線之後」的房間照順序（順序一樣時下面的樓層先）', () => {
    const p = normalizeProject(projectOf(twoFloors()), isAsset) as Project;
    p.stage = {
      rooms: [
        { floor: 'f2', room: 'bed', when: 'after', order: 0 },
        { floor: 'f1', room: 'study' },
        { floor: 'f1', room: 'hall1', when: 'after', order: 0 },
      ],
      floors: ['f2'],
    };
    const tl = buildTimeline(p);
    expect(tl.steps.map((s) => [s.kind, s.revealFloors, s.revealRooms])).toEqual([
      ['start', [], []],
      ['floor', ['f2'], []],
      ['room', [], [roomKey('f1', 'hall1')]],
      ['room', [], [roomKey('f2', 'bed')]],
      ['room', [], [roomKey('f1', 'study')]],
    ]);
    expect(tl.steps.slice(1).map((s) => s.duration)).toEqual([1, 1, 1, 1]);
    expect(stepState(tl, 4).hidden.size).toBe(0);
    /* 什麼都沒有：只有開始前、不能播 */
    const empty = buildTimeline(normalizeProject(projectOf(twoFloors()), isAsset) as Project);
    expect(empty.steps).toHaveLength(1);
    expect(empty.playable).toBe(false);
    expect(empty.total).toBe(0);
  });

  it('鏡頭：固定＝全體；跟著＝0.48 秒移到這一步的範圍，最後 0.4 秒回到全體', () => {
    const tl = buildTimeline(staged());
    const whole = { x: 0, y: 0, w: 100, h: 50 };
    const box = (f: { rect: { x: number; y: number; w: number; h: number } }) => f.rect;
    const s1 = tl.steps[1];
    expect(stageCameraAt(tl, s1.start + 1, 'fixed', box, () => whole, false)).toEqual(whole);
    expect(stageCameraAt(tl, s1.start + 0.6, 'follow', box, () => whole, false)).toEqual(
      s1.focus?.rect,
    );
    const mid = stageCameraAt(tl, s1.start + 0.24, 'follow', box, () => whole, false);
    expect(mid.w).toBeLessThan(100);
    expect(mid.w).toBeGreaterThan(s1.focus?.rect.w ?? 0);
    expect(stageCameraAt(tl, tl.total, 'follow', box, () => whole, false)).toEqual(whole);
    /* 經過樓梯的過場時鏡頭不動 */
    const s3 = tl.steps[3];
    expect(stageCameraAt(tl, s3.start + 0.3, 'follow', box, () => whole, false)).toEqual(
      tl.steps[2].focus?.rect,
    );
  });
});

describe('拖曳路線的控制點（F318）', () => {
  const r = (id: string, x1: number, y1: number, x2: number, y2: number): StageRoute => ({
    id,
    floor: 'f',
    x1,
    y1,
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2,
    x2,
    y2,
  });
  it('起點（編號圓標）移動：接在一起的路線跟著動（Alt 只動這一條）；小方塊改成曲線', () => {
    const before = [r('a', 0, 0, 4, 0), r('b', 4, 0, 8, 0)];
    const moved = dragRouteHandle(before, 'b', 'p1', { x: 4, y: 2 }, false, () => null);
    expect(moved[1]).toMatchObject({ x1: 4, y1: 2, cx: 6, cy: 1 });
    expect(moved[0]).toMatchObject({ x2: 4, y2: 2, cx: 2, cy: 1 });
    expect(before[0].x2).toBe(4);
    const alone = dragRouteHandle(before, 'b', 'p1', { x: 4, y: 2 }, true, () => null);
    expect(alone[0]).toEqual(before[0]);
    const curved = dragRouteHandle(
      [
        {
          ...before[0],
          pts: [
            [0, 0],
            [4, 0],
          ],
        },
      ],
      'a',
      'ctrl',
      { x: 2, y: 3 },
      false,
      () => null,
    );
    expect(curved[0]).toMatchObject({ cx: 2, cy: 3 });
    expect(curved[0].pts).toBeUndefined();
  });

  it('終點移動：照門與走廊重新算（走得到時有折線）', () => {
    const [g] = twoFloors();
    const nav = floorNavigator(g);
    const a = roomAnchor(g.rooms[0]);
    const before: StageRoute[] = [
      {
        id: 'a',
        floor: 'f1',
        x1: a.x,
        y1: a.y,
        cx: 6,
        cy: 6,
        x2: 6,
        y2: 6,
        pts: [
          [a.x, a.y],
          [6, 6],
        ],
      },
    ];
    const b = roomAnchor(g.rooms[2]);
    const moved = dragRouteHandle(before, 'a', 'p2', b, false, () => nav);
    expect(moved[0].pts?.length).toBeGreaterThan(2);
    expect(moved[0]).toMatchObject({ x2: b.x, y2: b.y });
  });
});

describe('PL 用的演出畫面（F323、F324）', () => {
  it('藏起來的房間：裡面的家具、文字與房間邊上的門拿掉，外形蓋灰；路線碰到的判斷', () => {
    const [g] = twoFloors();
    const f: Floor = {
      ...g,
      items: [...g.items, item('desk', 'desk', 14, 2, 3, 2)],
      texts: [{ id: 't', x: 15, y: 6, text: '日記' }],
    };
    const hidden = new Set([roomKey('f1', 'study')]);
    const s = stageFloor(f, hidden, new Set());
    expect(s.items.map((i) => i.id)).toEqual(['s1']);
    expect(s.texts).toEqual([]);
    expect(s.openings.map((o) => o.id)).toEqual(['d1']);
    expect(s.rooms.find((r) => r.id === 'study')).toMatchObject({ masked: true, name: '' });
    const v = visibleFloor(s, true);
    expect(v.rooms.find((r) => r.id === 'study')?.masked).toBe(true);
    /* 整層藏起來＝PL 檢視只留輪廓 */
    expect(visibleFloor(stageFloor(f, hidden, new Set(['f1'])), true).veiled).toBe(true);
    const route: StageRoute = { id: 'x', floor: 'f1', x1: 2, y1: 6, cx: 5, cy: 6, x2: 9, y2: 6 };
    expect(routeTouchesRoom(route, f.rooms[1])).toBe(true);
    expect(routeTouchesRoom(route, f.rooms[2])).toBe(false);
  });

  it('GM 專用的房間、家具、文字與祕密樓層的內容改了，PL 的演出畫面（三種畫面、每一步）逐指令相同', () => {
    const restore = installRecordingDocument();
    try {
      const base = clock();
      base.stage = autoStage(base)?.stage;
      const extra = structuredClone(base);
      const [b1, f1] = extra.floors;
      /* 祕密樓層 B1 多一個遠處的文字與家具、1F 多 GM 專用的家具與文字（GM 專用的房間 PL 照舊看得到牆框，不在這裡比） */
      b1.texts.push({ id: 'far', x: 80, y: 60, text: '祕密' });
      b1.items.push(item('gx', 'desk', 2, 2, 3, 2));
      f1.items.push(item('gi', 'desk', 2, 2, 3, 2, { gm: true }));
      f1.texts.push({ id: 'gt', x: 5, y: 5, text: 'GM 筆記', gm: true });
      const hash = (p: Project, view: 'plan' | 'stack' | 'board') => {
        const tl = buildTimeline(p);
        const sc = stageScene(p, tl, view, { playerView: true, hideClues: false });
        const out: string[] = [];
        for (let k = 0; k < tl.steps.length; k++) {
          const c = recordingCanvas(800, 600);
          const g = c.getContext('2d');
          drawStageFrame(
            g,
            sc,
            {
              theme: getTheme(p.theme),
              zoom: 24,
              showSize: 'none',
              hideNames: false,
              hideClues: false,
              activeLevel: -1,
            },
            { from: null, to: stepState(tl, k), alpha: 1 },
          );
          out.push((c as RecordingCanvas).hash);
        }
        return out;
      };
      for (const view of ['plan', 'stack', 'board'] as const)
        expect(hash(extra, view), view).toEqual(hash(base, view));
      /* GM 的準備畫面就不同（看得到 GM 的東西） */
      const gm = (p: Project) => {
        const tl = buildTimeline(p);
        const sc = stageScene(p, tl, 'plan', { playerView: false, hideClues: false });
        const c = recordingCanvas(800, 600);
        drawStageState(
          c.getContext('2d'),
          sc,
          {
            theme: getTheme(p.theme),
            zoom: 24,
            showSize: 'none',
            hideNames: false,
            hideClues: false,
            activeLevel: -1,
            planFloor: p.floors[1].id,
          },
          null,
        );
        return (c as RecordingCanvas).hash;
      };
      expect(gm(extra)).not.toBe(gm(base));
    } finally {
      restore();
    }
  });
});
