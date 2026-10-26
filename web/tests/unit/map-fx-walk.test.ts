/**
 * 地圖演出產生器・進階 3D（規格 docs/refactor/specs/map-fx.md 1.11、3.12）：
 * 整理存檔、房間遮罩當草稿、牆與入口（開口、共用牆、夾在牆上）、找最近的牆、路線與鏡頭（停留、緩起緩停、停在目的地前、
 * 往前看）、影片大小、狀態與動作（框出房間、入口、路線、刪除連帶入口、換圖清空、示範演出、復原）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { initialState, type RedactFrame } from '@/tools/map-fx/model';
import { demoWalk, GRID, ROOMS, roomRect } from '@/tools/map-fx/sample';
import {
  addDoor,
  addPathPoint,
  addRoom,
  clearPath,
  docNow,
  historyStep,
  moveDoor,
  nudgeWalkSelected,
  removeRoom,
  removeWalkSelected,
  resetAll,
  roomsFromRedacts,
  selectWalk,
  setImage,
  setRoomRect,
  setWalkOptions,
  undoPathPoint,
  useWalk,
  walkNow,
} from '@/tools/map-fx/store';
import {
  alongExtended,
  canWalk,
  clampDoorAt,
  clampRoomRect,
  cleanPath,
  doorAt,
  doorSegment,
  doorSpan,
  eyeHeight,
  initialWalk,
  lookAhead,
  nearestWall,
  normalizeWalk,
  nudgeDoorAt,
  roomsFromMasks,
  snapMove,
  snapPoint,
  snapValue,
  solidPieces,
  stopShort,
  WALK_HOLD,
  WALK_LIMITS,
  type WalkRoom,
  walkCamera,
  walkLength,
  walkProgress,
  walkTotal,
  walkVideoSize,
  wallOf,
  wallOpenings,
} from '@/tools/map-fx/walk';

const IMG = { width: 1200, height: 840 };
const room = (o: Partial<WalkRoom> = {}): WalkRoom => ({
  id: 'a',
  kind: 'room',
  x: 100,
  y: 100,
  w: 200,
  h: 100,
  name: '',
  ...o,
});

describe('整理存檔（3.12）', () => {
  it('預設：沒有房間、入口、路線；房名顯示、地圖鋪在地上；牆高 48、入口寬 40、8 秒', () => {
    expect(initialWalk()).toEqual({
      rooms: [],
      doors: [],
      path: [],
      names: true,
      floor: true,
      wall: 48,
      door: 40,
      duration: 8,
    });
    expect(normalizeWalk(undefined, IMG)).toEqual(initialWalk());
  });

  it('範圍夾住並對齊每格；看不懂的房間、入口、點拿掉；入口的房間不在了也拿掉', () => {
    const w = normalizeWalk(
      {
        wall: 999,
        door: 3,
        duration: 7.3,
        names: 'x',
        floor: false,
        rooms: [
          { id: 'a', kind: 'hall', x: -20, y: 10.4, w: 50.6, h: 3, name: '房'.repeat(50) },
          { id: 'a', kind: 'room', x: 0, y: 0, w: 10, h: 10 },
          { id: 'b', kind: 'cave', x: 1190, y: 830, w: 100, h: 100 },
          { id: 'c', x: 'x', y: 0, w: 10, h: 10 },
          null,
        ],
        doors: [
          { id: 'd1', room: 'a', side: 'n', at: 1.5 },
          { id: 'd2', room: 'zz', side: 'n', at: 0.5 },
          { id: 'd3', room: 'b', side: 'up', at: 0.5 },
          { id: 'd1', room: 'b', side: 's', at: 0.5 },
        ],
        path: [{ x: -5, y: 900 }, { x: 'a' }, { x: 10.04, y: 20.06 }],
      },
      IMG,
    );
    expect(w.wall).toBe(240);
    expect(w.door).toBe(12);
    expect(w.duration).toBe(7.5);
    expect(w.names).toBe(true);
    expect(w.floor).toBe(false);
    expect(w.rooms).toEqual([
      { id: 'a', kind: 'hall', x: 0, y: 10, w: 51, h: 8, name: '房'.repeat(40) },
      { id: 'b', kind: 'room', x: 1100, y: 740, w: 100, h: 100, name: '' },
    ]);
    expect(w.doors).toEqual([{ id: 'd1', room: 'a', side: 'n', at: 1 }]);
    expect(w.path).toEqual([
      { x: 0, y: 840 },
      { x: 10, y: 20.1 },
    ]);
  });

  it('沒有地圖時只留設定', () => {
    const w = normalizeWalk({ wall: 60, rooms: [room()], path: [{ x: 1, y: 1 }] }, null);
    expect(w).toEqual({ ...initialWalk(), wall: 60 });
  });

  it('上限：房間 40、入口 80、路線 64 點', () => {
    const rooms = Array.from({ length: 50 }, (_, i) => room({ id: `r${i}` }));
    const doors = Array.from({ length: 90 }, (_, i) => ({
      id: `d${i}`,
      room: 'r0',
      side: 'n',
      at: 0.5,
    }));
    const path = Array.from({ length: 70 }, (_, i) => ({ x: i, y: i }));
    const w = normalizeWalk({ rooms, doors, path }, IMG);
    expect(w.rooms).toHaveLength(WALK_LIMITS.rooms);
    expect(w.doors).toHaveLength(WALK_LIMITS.doors);
    expect(w.path).toHaveLength(WALK_LIMITS.path);
  });

  it('房間的範圍取整、至少 8 px、夾在地圖裡', () => {
    expect(clampRoomRect({ x: 1199, y: -3, w: 2, h: 900 }, IMG)).toEqual({
      x: 1192,
      y: 0,
      w: 8,
      h: 840,
    });
  });
});

describe('房間遮罩當草稿（F74）', () => {
  const mask = (x: number, label: string) => ({ x, y: 10, w: 100, h: 80, label });
  let n = 0;
  const id = () => `n${++n}`;

  it('照清單順序做成房間，房名照抄（去掉頭尾空白）；範圍相同的不重複加', () => {
    n = 0;
    const out = roomsFromMasks(
      [mask(0, ' 書房 '), mask(200, ''), mask(0, '重複')],
      [room({ id: 'old', x: 200, y: 10, w: 100, h: 80 })],
      IMG,
      id,
    );
    expect(out).toEqual([{ id: 'n1', kind: 'room', x: 0, y: 10, w: 100, h: 80, name: '書房' }]);
  });

  it('到上限為止', () => {
    const existing = Array.from({ length: 39 }, (_, i) => room({ id: `r${i}`, x: i * 2 }));
    const out = roomsFromMasks([mask(500, 'A'), mask(700, 'B')], existing, IMG, id);
    expect(out).toHaveLength(1);
  });
});

describe('牆與入口（F75、3.12）', () => {
  const r = room();

  it('四面牆：上下沿 x、左右沿 y', () => {
    expect(wallOf(r, 'n')).toMatchObject({
      a: { x: 100, y: 100 },
      b: { x: 300, y: 100 },
      len: 200,
    });
    expect(wallOf(r, 's')).toMatchObject({ fixed: 200, horizontal: true, from: 100 });
    expect(wallOf(r, 'w')).toMatchObject({ fixed: 100, horizontal: false, from: 100, len: 100 });
    expect(wallOf(r, 'e')).toMatchObject({ fixed: 300, horizontal: false });
  });

  it('入口夾在牆裡；牆比入口短時入口縮到牆長 − 4', () => {
    const w = wallOf(r, 'n');
    expect(clampDoorAt(w, 0, 40)).toBeCloseTo(0.1);
    expect(clampDoorAt(w, 0.98, 40)).toBeCloseTo(0.9);
    expect(doorSpan(w, 0.5, 40)).toEqual([180, 220]);
    const short = wallOf(room({ w: 30 }), 'n');
    expect(doorSpan(short, 0.9, 40)).toEqual([104, 130]);
    expect(doorSegment(r, { id: 'd', room: 'a', side: 'e', at: 0.5 }, 40)).toEqual([
      { x: 300, y: 130 },
      { x: 300, y: 170 },
    ]);
  });

  it('牆上的開口：自己的入口、相鄰房間放在同一條線上的入口（共用的牆兩邊都開口），重疊的合併', () => {
    const a = room({ id: 'a' });
    const b = room({ id: 'b', y: 200, h: 100 });
    const doors = [
      { id: 'd1', room: 'a', side: 's' as const, at: 0.25 },
      { id: 'd2', room: 'b', side: 'n' as const, at: 0.75 },
      { id: 'd3', room: 'a', side: 's' as const, at: 0.3 },
      { id: 'd4', room: 'a', side: 'n' as const, at: 0.5 },
    ];
    expect(wallOpenings(a, 's', [a, b], doors, 40)).toEqual([
      [130, 180],
      [230, 270],
    ]);
    expect(wallOpenings(b, 'n', [a, b], doors, 40)).toEqual([
      [130, 180],
      [230, 270],
    ]);
    expect(wallOpenings(b, 's', [a, b], doors, 40)).toEqual([]);
    expect(solidPieces(wallOf(a, 's'), wallOpenings(a, 's', [a, b], doors, 40))).toEqual([
      [100, 130],
      [180, 230],
      [270, 300],
    ]);
  });

  it('找最近的牆（在容許距離內；同樣近時後面的房間優先）', () => {
    const a = room({ id: 'a' });
    const b = room({ id: 'b', y: 200 });
    expect(nearestWall([a, b], { x: 150, y: 104 }, 10)).toMatchObject({
      room: { id: 'a' },
      side: 'n',
      at: 0.25,
    });
    expect(nearestWall([a, b], { x: 250, y: 200 }, 10)).toMatchObject({
      room: { id: 'b' },
      side: 'n',
    });
    expect(nearestWall([a, b], { x: 200, y: 150 }, 10)).toBeNull();
    expect(nearestWall([a, b], { x: 296, y: 120 }, 10)).toMatchObject({ side: 'e', at: 0.2 });
  });
});

describe('平面圖的吸附與點選（N6、N7）', () => {
  const a = room({ id: 'a', x: 100, y: 100, w: 200, h: 100 });
  const b = room({ id: 'b', x: 300, y: 100, w: 100, h: 100 });

  it('吸附到 tol 以內最近的邊；太遠不動', () => {
    expect(snapValue(203, [100, 200, 300], 6)).toBe(200);
    expect(snapValue(250, [100, 200, 300], 6)).toBe(250);
    expect(snapPoint({ x: 304, y: 197 }, [a, b], 6)).toEqual({ x: 300, y: 200 });
    expect(snapPoint({ x: 304, y: 197 }, [a, b], 6, 'b')).toEqual({ x: 300, y: 200 });
    expect(snapPoint({ x: 404, y: 150 }, [a, b], 6, 'b')).toEqual({ x: 404, y: 150 });
  });

  it('移動時整個框平移到對齊鄰近房間的邊（大小不變）', () => {
    const moved = snapMove({ x: 304, y: 103, w: 100, h: 100 }, [a, b], 6, 'b');
    expect(moved).toEqual({ x: 300, y: 100, w: 100, h: 100 });
    expect(snapMove({ x: 320, y: 140, w: 100, h: 100 }, [a, b], 6, 'b')).toEqual({
      x: 320,
      y: 140,
      w: 100,
      h: 100,
    });
  });

  it('兩個入口很近時，按到最近的那個（不是清單後面的）', () => {
    const w = {
      rooms: [a],
      door: 20,
      doors: [
        { id: 'd1', room: 'a', side: 'n' as const, at: 0.5 },
        { id: 'd2', room: 'a', side: 'n' as const, at: 0.62 },
      ],
    };
    /* d1：x 190～210、d2：x 214～234（y＝100） */
    expect(doorAt(w, { x: 211, y: 102 }, 10)?.id).toBe('d1');
    expect(doorAt(w, { x: 214, y: 102 }, 10)?.id).toBe('d2');
    expect(doorAt(w, { x: 211, y: 140 }, 10)).toBeNull();
  });

  it('方向鍵移動入口：沿牆換算成 at、夾在牆裡', () => {
    const d = { id: 'd', room: 'a', side: 'n' as const, at: 0.5 };
    expect(nudgeDoorAt(a, d, 10, 20)).toBeCloseTo(0.55);
    expect(nudgeDoorAt(a, d, 500, 20)).toBeCloseTo(0.95);
  });
});

describe('路線與鏡頭（F76、F77、3.12）', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 400 },
  ];
  const w = { path, wall: 50, duration: 10 };

  it('相鄰的重複點不算轉角；至少兩個不同的點才能走', () => {
    expect(cleanPath(path)).toHaveLength(3);
    expect(walkLength(path)).toBe(700);
    expect(
      canWalk([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toBe(false);
    expect(canWalk(path)).toBe(true);
  });

  it('時間：開頭停 0.8 秒、走 duration 秒、結尾停 1.2 秒；中間緩起緩停', () => {
    expect(walkTotal(w)).toBeCloseTo(12);
    expect(walkProgress(w, 0)).toBe(0);
    expect(walkProgress(w, WALK_HOLD.start)).toBe(0);
    expect(walkProgress(w, WALK_HOLD.start + 5)).toBeCloseTo(0.5);
    expect(walkProgress(w, WALK_HOLD.start + 1)).toBeLessThan(0.1);
    expect(walkProgress(w, 11)).toBe(1);
  });

  it('沿折線走，超出頭尾時順著第一段／最後一段延長', () => {
    const pts = cleanPath(path);
    expect(alongExtended(pts, 100)).toEqual({ x: 100, y: 0 });
    expect(alongExtended(pts, 400)).toEqual({ x: 300, y: 100 });
    expect(alongExtended(pts, 800)).toEqual({ x: 300, y: 500 });
    expect(alongExtended(pts, -50)).toEqual({ x: -50, y: 0 });
  });

  it('鏡頭：開始在現在位置、眼睛高＝牆高 × 0.55、看著前方 2 倍牆高；結尾停在目的地前 2.2 倍牆高（短路線最多 30%）', () => {
    const c0 = walkCamera(w, 0);
    expect(c0?.pos).toEqual({ x: 0, y: 0 });
    expect(c0?.look).toEqual({ x: lookAhead(50), y: 0 });
    expect(c0?.eye).toBe(eyeHeight(50));
    expect(c0?.eye).toBeCloseTo(27.5);
    const end = walkCamera(w, walkTotal(w));
    expect(stopShort(50, 700)).toBeCloseTo(110);
    expect(stopShort(50, 200)).toBe(60);
    expect(end?.pos.x).toBeCloseTo(300);
    expect(end?.pos.y).toBeCloseTo(290);
    expect(end?.look.y).toBeCloseTo(390);
    /* 快到轉角時已經往轉過去的方向看 */
    const corner = walkCamera({ ...w, duration: 10 }, 0.8 + 4.2);
    expect(corner?.pos.y).toBeCloseTo(0);
    expect(corner?.look.y).toBeGreaterThan(0);
    expect(walkCamera({ ...w, path: [{ x: 1, y: 1 }] }, 0)).toBeNull();
  });

  it('影片大小：畫面等比縮到長邊 1920 以內、偶數', () => {
    expect(walkVideoSize({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
    expect(walkVideoSize({ width: 4000, height: 3001 })).toEqual({ width: 1920, height: 1440 });
    expect(walkVideoSize({ width: 1201, height: 841 })).toEqual({ width: 1200, height: 840 });
  });
});

describe('範例的 3D 設定（示範演出）', () => {
  it('十個房間＋走廊，房名照範例地圖；整理之後不變；入口在範例地圖的門上', () => {
    const w = demoWalk();
    expect(normalizeWalk(w, IMG)).toEqual(w);
    expect(w.rooms.filter((r) => r.kind === 'room').map((r) => r.name)).toEqual(
      ROOMS.map((r) => r.name),
    );
    expect(w.rooms.filter((r) => r.kind === 'hall')).toHaveLength(1);
    expect(w.doors).toHaveLength(12);
    /* 院長室的門：格 6～8、y＝14 格 */
    const director = w.rooms.find((r) => r.id === 'w-director') as WalkRoom;
    expect(director).toMatchObject(roomRect('director'));
    const d = w.doors.find((o) => o.room === 'w-director');
    expect(d && doorSegment(director, d, w.door)).toEqual([
      { x: 6 * GRID, y: 14 * GRID },
      { x: 8 * GRID, y: 14 * GRID },
    ]);
    expect(canWalk(w.path)).toBe(true);
  });
});

describe('狀態與動作（F74～F76、F80、F82）', () => {
  beforeEach(() => {
    resetAll({ ...initialState(), image: { id: 'img', name: 'm.png', ...IMG } });
    useWalk.setState({ tool: 'room', selected: null, camera: 'orbit' });
  });

  it('框出房間（一步復原、選取）、改範圍、刪除時入口一起拿掉', () => {
    const id = addRoom('room', { x: 10.4, y: 20, w: 100, h: 50 }) as string;
    expect(walkNow().rooms).toEqual([{ id, kind: 'room', x: 10, y: 20, w: 100, h: 50, name: '' }]);
    expect(useWalk.getState().selected).toEqual({ kind: 'room', id });
    setRoomRect(id, { x: 1190, y: 20, w: 100, h: 50 });
    expect(walkNow().rooms[0].x).toBe(1100);
    const door = addDoor(id, 's', 0.99) as string;
    expect(walkNow().doors[0]).toMatchObject({ id: door, side: 's' });
    expect(walkNow().doors[0].at).toBeCloseTo(0.8);
    moveDoor(door, id, 'w', 0.5);
    expect(walkNow().doors[0]).toMatchObject({ side: 'w', at: 0.5 });
    removeRoom(id);
    expect(walkNow().rooms).toEqual([]);
    expect(walkNow().doors).toEqual([]);
    historyStep('undo');
    expect(walkNow().rooms).toHaveLength(1);
    expect(walkNow().doors).toHaveLength(1);
  });

  it('刪除選取的：房間或入口', () => {
    const id = addRoom('hall', { x: 0, y: 0, w: 100, h: 100 }) as string;
    const door = addDoor(id, 'n', 0.5) as string;
    selectWalk({ kind: 'door', id: door });
    expect(removeWalkSelected()).toBe(true);
    expect(walkNow().doors).toEqual([]);
    selectWalk({ kind: 'room', id });
    expect(removeWalkSelected()).toBe(true);
    expect(walkNow().rooms).toEqual([]);
    expect(removeWalkSelected()).toBe(false);
  });

  it('路線：一點一步、夾在地圖裡、退回、清除', () => {
    addPathPoint({ x: -10, y: 50 });
    addPathPoint({ x: 500, y: 900 });
    expect(walkNow().path).toEqual([
      { x: 0, y: 50 },
      { x: 500, y: 840 },
    ]);
    undoPathPoint();
    expect(walkNow().path).toHaveLength(1);
    historyStep('undo');
    expect(walkNow().path).toHaveLength(2);
    clearPath();
    expect(walkNow().path).toEqual([]);
  });

  it('從房間遮罩建立：房名帶過來，再按一次不重複加', () => {
    const mask: RedactFrame = {
      id: 'm1',
      kind: 'redact',
      x: 48,
      y: 72,
      w: 240,
      h: 264,
      style: 'dark',
      mode: 'reveal',
      dir: 'fade',
      density: 100,
      grain: 12,
      edge: 'glow',
      glow: 70,
      label: '院長室',
    };
    resetAll({ ...initialState(), image: { id: 'img', name: 'm.png', ...IMG }, frames: [mask] });
    expect(roomsFromRedacts()).toBe(1);
    expect(walkNow().rooms[0]).toMatchObject({ x: 48, y: 72, w: 240, h: 264, name: '院長室' });
    expect(roomsFromRedacts()).toBe(0);
  });

  it('牆高、入口寬、秒數立刻夾住並吸附到間隔（N5）', () => {
    setWalkOptions({ wall: 47, door: 33, duration: 7.3 });
    expect(walkNow()).toMatchObject({ wall: 48, door: 34, duration: 7.5 });
    setWalkOptions({ wall: 999 });
    expect(walkNow().wall).toBe(240);
  });

  it('方向鍵移動選取的房間、入口、路線的點；連按併成一步復原（N6）', () => {
    const id = addRoom('room', { x: 100, y: 100, w: 200, h: 100 }) as string;
    nudgeWalkSelected(1, 0);
    nudgeWalkSelected(10, 0);
    nudgeWalkSelected(0, -1);
    expect(walkNow().rooms[0]).toMatchObject({ x: 111, y: 99 });
    historyStep('undo');
    expect(walkNow().rooms[0]).toMatchObject({ x: 100, y: 100 });
    const door = addDoor(id, 'n', 0.5) as string;
    nudgeWalkSelected(20, 0);
    expect(walkNow().doors[0].at).toBeCloseTo(0.6);
    nudgeWalkSelected(0, 5);
    expect(walkNow().doors[0].at).toBeCloseTo(0.6);
    selectWalk({ kind: 'door', id: door });
    addPathPoint({ x: 10, y: 10 });
    selectWalk({ kind: 'point', index: 0 });
    nudgeWalkSelected(-10, 10);
    expect(walkNow().path[0]).toEqual({ x: 0, y: 20 });
    /* Delete：刪掉選取的點 */
    expect(removeWalkSelected()).toBe(true);
    expect(walkNow().path).toEqual([]);
    selectWalk(null);
    expect(nudgeWalkSelected(1, 0)).toBe(false);
  });

  it('換圖：房間、入口、路線清空（牆高等設定留著）；示範演出一起換上範例的 3D 設定；都可以復原', () => {
    const id = addRoom('room', { x: 0, y: 0, w: 100, h: 100 }) as string;
    addDoor(id, 'n', 0.5);
    addPathPoint({ x: 10, y: 10 });
    resetAll({ ...docNow(), walk: { ...docNow().walk, wall: 80 } });
    setImage({ id: 'img2', name: 'b.png', ...IMG });
    expect(walkNow()).toEqual({ ...initialWalk(), wall: 80 });
    historyStep('undo');
    expect(walkNow().rooms).toHaveLength(1);
    setImage({ id: 'img3', name: 'c.png', ...IMG }, { tool: demoWalk() });
    expect(walkNow()).toEqual(demoWalk());
  });
});
