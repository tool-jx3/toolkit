/**
 * 室內平面圖產生器的規則（規格 1.4～1.9、第 3 節）：自動牆壁、PL 檢視、面積文字、讀檔整理（含原作的 .trpgmap.json）、
 * 房間的內容與鎖定、旋轉、吸附、複製位移、匯出的版面與檔名。
 */
import { describe, expect, it } from 'vitest';
import { exportLayout } from '@/tools/floor-plan/draw/export';
import { isAsset } from '@/tools/floor-plan/model/assets';
import { exportFileName, exportJobs, fileBase } from '@/tools/floor-plan/model/exportPlan';
import {
  clueCount,
  emptyFloor,
  floorBounds,
  openingReach,
  sizeText,
  visibleFloor,
} from '@/tools/floor-plan/model/geometry';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import {
  copyOffset,
  groundFloorIndex,
  movable,
  nextFloorName,
  reorder,
  roomContents,
  rotateItem,
  rotateRoomsCW,
} from '@/tools/floor-plan/model/ops';
import {
  axisLock,
  itemGhost,
  magnet,
  snapOpening,
  snapWallPoint,
} from '@/tools/floor-plan/model/snap';
import type { Floor, Item, Opening, Project, Room } from '@/tools/floor-plan/model/types';
import { computeWalls, edgeKind, wallLines } from '@/tools/floor-plan/model/walls';

const room = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
): Room => ({
  id,
  x,
  y,
  w,
  h,
  name: id,
  cat: 'living',
  ...extra,
});

const floorOf = (patch: Partial<Floor>): Floor => ({ ...emptyFloor('1F'), ...patch });

const runs = (f: Floor, opts?: Parameters<typeof computeWalls>[1]) =>
  computeWalls(f, opts).runs.map(
    (r) => `${r.o}${r.c}:${r.a}-${r.b}:${r.kind}${r.capA ? '' : '<'}${r.capB ? '' : '>'}`,
  );

describe('自動牆壁', () => {
  it('兩個相鄰的房間：外圍外牆、中間內牆', () => {
    const f = floorOf({ rooms: [room('a', 0, 0, 4, 3), room('b', 4, 0, 3, 3)] });
    expect(runs(f)).toEqual(['h0:0-7:ext', 'h3:0-7:ext', 'v0:0-3:ext', 'v4:0-3:int', 'v7:0-3:ext']);
  });

  it('房間裡的房間（後放的在上）：只有它的四邊是內牆', () => {
    const f = floorOf({
      rooms: [room('big', 0, 0, 6, 6), room('bath', 0, 0, 2, 2, { cat: 'wet' })],
    });
    const r = runs(f);
    expect(r).toContain('h2:0-2:int');
    expect(r).toContain('v2:0-2:int');
    expect(r).toContain('h0:0-6:ext');
  });

  it('戶外：陽台是欄杆、庭院不畫；戶外與室內之間是外牆；兩個戶外之間沒有牆', () => {
    expect(edgeKind(room('b', 0, 0, 1, 1, { cat: 'balcony' }), null)).toBe('rail');
    expect(edgeKind(room('g', 0, 0, 1, 1, { cat: 'garden' }), null)).toBe(null);
    expect(edgeKind(null, room('c', 0, 0, 1, 1, { cat: 'cave' }))).toBe('rock');
    expect(
      edgeKind(room('g', 0, 0, 1, 1, { cat: 'garden' }), room('w', 0, 0, 1, 1, { cat: 'water' })),
    ).toBe(null);
    expect(edgeKind(room('g', 0, 0, 1, 1, { cat: 'garden' }), room('l', 0, 0, 1, 1))).toBe('ext');
  });

  it('「不產生牆」的房間與鄰居之間是分區線（zone）', () => {
    const f = floorOf({ rooms: [room('a', 0, 0, 4, 3), room('b', 4, 0, 3, 3, { noWall: true })] });
    expect(runs(f)).toContain('v4:0-3:zone');
  });

  it('門窗把牆切開，切口不加收邊；門窗所在的牆種類記下來', () => {
    const door: Opening = {
      id: 'd',
      kind: 'door',
      o: 'v',
      x: 4,
      y: 1,
      len: 1.5,
      side: 1,
      hinge: 0,
    };
    const win: Opening = { id: 'w', kind: 'window', o: 'h', x: 1, y: 0, len: 2, side: 1, hinge: 0 };
    const f = floorOf({
      rooms: [room('a', 0, 0, 4, 3), room('b', 4, 0, 3, 3)],
      openings: [door, win],
    });
    const w = computeWalls(f);
    expect(runs(f)).toEqual([
      'h0:0-1:ext>',
      'h0:3-7:ext<',
      'h3:0-7:ext',
      'v0:0-3:ext',
      'v4:0-1:int>',
      'v4:2.5-3:int<',
      'v7:0-3:ext',
    ]);
    expect(w.openingKind.get('d')).toBe('int');
    expect(w.openingKind.get('w')).toBe('ext');
  });

  it('PL 檢視時暗門不切開牆；wallLines 不扣門窗、不含分區線', () => {
    const secret: Opening = {
      id: 's',
      kind: 'secret',
      o: 'v',
      x: 4,
      y: 1,
      len: 1,
      side: 1,
      hinge: 0,
    };
    const f = floorOf({
      rooms: [room('a', 0, 0, 4, 3), room('b', 4, 0, 3, 3)],
      openings: [secret],
    });
    expect(runs(f, { playerView: true })).toContain('v4:0-3:int');
    expect(runs(f)).toContain('v4:0-1:int>');
    expect(wallLines(f).find((r) => r.o === 'v' && r.c === 4)).toMatchObject({ a: 0, b: 3 });
  });

  it('手畫的牆：水平、垂直的會被門窗切開；斜的另外列', () => {
    const f = floorOf({
      walls: [
        { id: 'h', x1: 0, y1: 5, x2: 6, y2: 5, kind: 'fence' },
        { id: 'd', x1: 0, y1: 0, x2: 3, y2: 4, kind: 'int' },
      ],
      openings: [{ id: 'g', kind: 'open', o: 'h', x: 2, y: 5, len: 2, side: 1, hinge: 0 }],
    });
    const w = computeWalls(f);
    expect(w.runs.map((r) => `${r.a}-${r.b}:${r.kind}:${r.free}`)).toEqual([
      '0-2:fence:h',
      '4-6:fence:h',
    ]);
    expect(w.diagonal.map((x) => x.id)).toEqual(['d']);
    expect(w.openingKind.get('g')).toBe('fence');
  });
});

describe('PL 檢視與隱藏線索', () => {
  const f = floorOf({
    rooms: [
      room('hall', 0, 0, 10, 6),
      room('secret', 10, 0, 4, 6, { gm: true, note: 'x', plName: '?' }),
      room('closet', 11, 1, 2, 2),
    ],
    items: [
      { id: 'in', t: 'safe', x: 11, y: 4, w: 1.2, h: 1.2, rot: 0 },
      { id: 'gm', t: 'chair', x: 1, y: 1, w: 1, h: 1, rot: 0, gm: true },
      { id: 'clue', t: 'key', x: 3, y: 3, w: 0.9, h: 0.45, rot: 0, clue: true },
    ],
    openings: [
      { id: 'edge', kind: 'door', o: 'v', x: 10, y: 2, len: 1.5, side: 1, hinge: 0 },
      { id: 'sec', kind: 'secret', o: 'h', x: 2, y: 6, len: 1.5, side: 1, hinge: 0 },
    ],
    texts: [
      { id: 't', x: 12, y: 5, text: 'GM' },
      { id: 'tc', x: 3, y: 4, text: '鑰匙', clue: true },
    ],
  });

  it('GM 專用的房間只剩框（沒有名字），裡面的東西、巢狀的房間拿掉；邊上的門留著、暗門拿掉', () => {
    const v = visibleFloor(f, true);
    expect(v.rooms.map((r) => [r.id, r.masked ?? false, r.name])).toEqual([
      ['hall', false, 'hall'],
      ['secret', true, ''],
    ]);
    expect(v.items.map((i) => i.id)).toEqual(['clue']);
    expect(v.openings.map((o) => o.id)).toEqual(['edge']);
    expect(v.texts.map((t) => t.id)).toEqual(['tc']);
  });

  it('隱藏線索與 GM／PL 檢視分開；個數：小物優先，沒有小物時算文字', () => {
    expect(visibleFloor(f, false, true).items.map((i) => i.id)).toEqual(['in', 'gm']);
    expect(visibleFloor(f, false, true).texts.map((t) => t.id)).toEqual(['t']);
    expect(clueCount([f])).toBe(1);
    expect(clueCount([floorOf({ texts: [{ id: 'a', x: 0, y: 0, text: 'a', clue: true }] })])).toBe(
      1,
    );
  });
});

describe('面積與範圍', () => {
  it('坪、平方公尺、公尺', () => {
    const r = room('r', 0, 0, 7, 8);
    expect(sizeText(r, 'none')).toBe('');
    expect(sizeText(r, 'm2')).toBe('14.0㎡');
    expect(sizeText(r, 'ping')).toBe('4.2 坪');
    expect(sizeText(r, 'm')).toBe('3.5×4.0m');
  });

  it('樓層的外接範圍含開門的弧線（長的門、拉門不會太寬）', () => {
    expect(openingReach({ kind: 'door', len: 1.5 })).toBe(1.5);
    expect(openingReach({ kind: 'door2', len: 3 })).toBe(1.5);
    expect(openingReach({ kind: 'sliding', len: 1.5 })).toBe(0.5);
    const f = floorOf({
      rooms: [room('a', 0, 0, 4, 4)],
      openings: [{ id: 'd', kind: 'door', o: 'v', x: 0, y: 1, len: 1.5, side: -1, hinge: 0 }],
    });
    expect(floorBounds(f)).toEqual({ x: -1.5, y: 0, w: 5.5, h: 4 });
    expect(floorBounds(emptyFloor('x'))).toBeNull();
  });
});

describe('讀檔整理', () => {
  it('原作的 .trpgmap.json：帖換成坪、認不得的家具丟掉並回報、欄位夾回範圍', () => {
    const report = { droppedItems: 0 };
    const p = normalizeProject(
      {
        app: 'indoor-map-maker',
        v: 1,
        name: '古い洋館',
        theme: 'paper',
        showSize: 'jo',
        floors: [
          {
            id: 'f1',
            name: '1F',
            rooms: [
              {
                id: 'r',
                x: 0.4,
                y: 0,
                w: 5.6,
                h: 4,
                name: 'ホール',
                cat: 'nope',
                gm: true,
                color: '#ABC',
              },
              { id: 'bad', x: 0, y: 0, w: 0, h: 3 },
            ],
            items: [
              { id: 'i1', t: 'sofa2', x: 1, y: 1, w: 3.2, h: 1.8, rot: 45 },
              { id: 'i2', t: 'teleporter', x: 1, y: 1, w: 1, h: 1, rot: 0 },
            ],
            openings: [{ id: 'o', kind: 'door', o: 'v', x: 0, y: 1, len: 1.5, side: -1, hinge: 1 }],
            walls: [{ id: 'w', x1: 0, y1: 0, x2: 2, y2: 0, kind: 'nope' }],
            texts: [{ id: 't', x: 1, y: 1, text: 'メモ', size: 9 }],
          },
        ],
        active: 5,
      },
      isAsset,
      report,
    ) as Project;
    expect(p.showSize).toBe('ping');
    expect(p.theme).toBe('paper');
    expect(p.active).toBe(0);
    expect(p.floors[0].rooms).toEqual([
      {
        id: 'r',
        x: 0,
        y: 0,
        w: 6,
        h: 4,
        name: 'ホール',
        cat: 'living',
        gm: true,
        color: '#aabbcc',
      },
    ]);
    expect(p.floors[0].items.map((i) => [i.t, i.rot])).toEqual([['sofa2', 0]]);
    expect(report.droppedItems).toBe(1);
    expect(p.floors[0].walls[0].kind).toBe('int');
    expect(p.floors[0].texts[0].size).toBe(4);
    expect(p.floors[0].openings[0]).toMatchObject({ side: -1, hinge: 1 });
  });

  it('不是專案時 null；沒有樓層時補一層；重複的 id 換新', () => {
    expect(normalizeProject(null, isAsset)).toBeNull();
    expect(normalizeProject({ name: 'x' }, isAsset)).toBeNull();
    expect(normalizeProject({ floors: [] }, isAsset)?.floors).toHaveLength(1);
    const p = normalizeProject(
      { floors: [{ rooms: [room('same', 0, 0, 1, 1), room('same', 2, 0, 1, 1)] }] },
      isAsset,
    );
    const ids = p?.floors[0].rooms.map((r) => r.id) ?? [];
    expect(new Set(ids).size).toBe(2);
  });
});

describe('房間的內容、鎖定、旋轉', () => {
  const base = () =>
    floorOf({
      rooms: [room('big', 0, 0, 10, 8), room('closet', 1, 1, 2, 2)],
      items: [
        { id: 'bed', t: 'bed_single', x: 5, y: 1, w: 2, h: 4, rot: 0 },
        { id: 'out', t: 'chair', x: 12, y: 1, w: 1, h: 1, rot: 0 },
      ],
      openings: [{ id: 'door', kind: 'door', o: 'h', x: 4, y: 8, len: 1.5, side: 1, hinge: 0 }],
      texts: [{ id: 'tx', x: 8, y: 6, text: '!' }],
      walls: [{ id: 'part', x1: 4, y1: 0, x2: 4, y2: 3, kind: 'thin' }],
    });

  it('房間裡的東西：家具（中心）、文字、邊上的門、巢狀的房間、兩端都在裡面的牆', () => {
    const f = base();
    expect(roomContents(f, f.rooms[0]).map((s) => s.id)).toEqual([
      'bed',
      'tx',
      'door',
      'closet',
      'part',
    ]);
  });

  it('鎖定的房間不動，裡面的東西也不動；直接選取的照樣可以動；Alt 只動房間', () => {
    const f = base();
    f.rooms[0].locked = true;
    expect(movable(f, [{ type: 'room', id: 'big' }])).toEqual([]);
    expect(movable(f, [{ type: 'item', id: 'bed' }]).map((s) => s.id)).toEqual(['bed']);
    /* 被小房間帶著走的東西可以動 */
    f.items.push({ id: 'shoe', t: 'chair', x: 1.5, y: 1.5, w: 1, h: 1, rot: 0 });
    expect(movable(f, [{ type: 'room', id: 'closet' }]).map((s) => s.id)).toEqual([
      'closet',
      'shoe',
    ]);
    expect(movable(f, [{ type: 'room', id: 'closet' }], true).map((s) => s.id)).toEqual(['closet']);
  });

  it('家具以中心轉 90°（寬高對調）', () => {
    const it: Item = { id: 'i', t: 'bed_single', x: 0, y: 0, w: 2, h: 4, rot: 0 };
    rotateItem(it, 90);
    expect(it).toMatchObject({ x: -1, y: 1, w: 4, h: 2, rot: 90 });
    rotateItem(it, -90);
    expect(it).toMatchObject({ x: 0, y: 0, w: 2, h: 4, rot: 0 });
  });

  it('房間連同內容順時針轉 90°，左上角落在整數格上；門窗換到直線上、開的方向跟著轉', () => {
    const f = floorOf({
      rooms: [room('r', 0, 0, 4, 3, { lx: 1 })],
      items: [{ id: 'bed', t: 'bed_single', x: 0, y: 0, w: 2, h: 1, rot: 0 }],
      openings: [
        { id: 'd', kind: 'door', o: 'h', x: 1, y: 3, len: 1.5, side: 1, hinge: 0 },
        { id: 's', kind: 'sliding', o: 'h', x: 0, y: 0, len: 1.5, side: 1, hinge: 0 },
      ],
    });
    const refs = movable(f, [{ type: 'room', id: 'r' }]);
    rotateRoomsCW(f, [f.rooms[0]], refs);
    expect(f.rooms[0]).toMatchObject({ x: 1, y: 0, w: 3, h: 4, ly: 1 });
    expect(f.rooms[0].lx).toBeUndefined();
    expect(f.items[0]).toMatchObject({ x: 3, y: 0, w: 1, h: 2, rot: 90 });
    expect(f.openings[0]).toMatchObject({ o: 'v', x: 1, y: 1, side: -1, hinge: 0 });
    expect(f.openings[1]).toMatchObject({ o: 'v', x: 4, y: 0, side: 1 });
  });

  it('複製的位移：有房間時往右移房間的總寬，否則右下 1 格', () => {
    const f = base();
    expect(copyOffset(f, [{ type: 'room', id: 'big' }])).toEqual({ dx: 10, dy: 0 });
    expect(copyOffset(f, [{ type: 'item', id: 'bed' }])).toEqual({ dx: 1, dy: 1 });
  });

  it('上下層：房間、家具移到最上（陣列尾）或最下', () => {
    const f = base();
    reorder(
      f,
      [
        { type: 'room', id: 'big' },
        { type: 'item', id: 'out' },
      ],
      true,
    );
    expect(f.rooms.map((r) => r.id)).toEqual(['closet', 'big']);
    reorder(f, [{ type: 'item', id: 'out' }], false);
    expect(f.items.map((i) => i.id)).toEqual(['out', 'bed']);
  });

  it('樓層名稱：下一個 nF；載入範本先顯示 1F', () => {
    expect(nextFloorName([emptyFloor('1F'), emptyFloor('3F'), emptyFloor('屋頂')])).toBe('4F');
    expect(nextFloorName([emptyFloor('地下')])).toBe('1F');
    expect(groundFloorIndex([emptyFloor('B1'), emptyFloor('1F'), emptyFloor('2F')])).toBe(1);
    expect(groundFloorIndex([emptyFloor('B1')])).toBe(0);
  });
});

describe('吸附', () => {
  const f = floorOf({ rooms: [room('a', 0, 0, 8, 6), room('b', 8, 0, 6, 6)] });
  const lines = wallLines(f);

  it('門窗：最近的牆線、寬度不超過牆段、起點對齊 0.25 並夾在牆段內、往游標那一側開', () => {
    const g = snapOpening(lines, [], 8.4, 3, 'door');
    expect(g).toMatchObject({ o: 'v', x: 8, y: 2.25, len: 1.5, side: 1, clash: false, t: 0.2 });
    expect(snapOpening(lines, [], 7.8, 0.3, 'door')).toMatchObject({ o: 'v', y: 0, side: -1 });
    expect(snapOpening(lines, [], 4, -0.5, 'window2')).toMatchObject({
      o: 'h',
      y: 0,
      len: 3.5,
      t: 0.34,
    });
    expect(snapOpening(lines, [], 4, 3, 'door')).toBeNull();
  });

  it('和既有的門窗重疊時 clash；拖曳自己時不算', () => {
    const o: Opening = { id: 'x', kind: 'door', o: 'v', x: 8, y: 2, len: 1.5, side: 1, hinge: 0 };
    expect(snapOpening(lines, [o], 8.2, 3, 'door')?.clash).toBe(true);
    expect(snapOpening(lines, [o], 8.2, 3, 'door', 1.5, 'x')?.clash).toBe(false);
  });

  it('家具：邊緣離牆 0.3 格內貼牆；會背面朝牆的家具靠牆時自動轉向', () => {
    expect(magnet(lines, { x: 0.2, y: 2, w: 1, h: 1 })).toMatchObject({ x: 0, y: 2 });
    expect(magnet(lines, { x: 2, y: 4.8, w: 1, h: 1 })).toMatchObject({ y: 5 });
    /* 床靠右牆（x＝8）：背面朝右＝轉 90° */
    const g = itemGhost(lines, 7, 3, { t: 'bed_single', rot: 0 });
    expect(g).toMatchObject({ rot: 90, x: 4, w: 4, h: 2 });
    expect(itemGhost(lines, 7, 3, { t: 'bed_single', rot: 0 }, true)).toMatchObject({
      rot: 0,
      x: 6,
      y: 1,
    });
    expect(itemGhost(lines, 7, 3, { t: 'bed_single', rot: 180, manual: true }).rot).toBe(180);
  });

  it('手畫的牆：0.5 格、吸到既有的端點；不按 Shift 時只能水平或垂直', () => {
    const fl = floorOf({ walls: [{ id: 'w', x1: 1.25, y1: 1.25, x2: 4, y2: 1.25, kind: 'int' }] });
    expect(snapWallPoint(fl, 0.9, 0.7, 0.35)).toEqual({ x: 1, y: 0.5 });
    expect(snapWallPoint(fl, 1.4, 1.1, 0.35)).toEqual({ x: 1.25, y: 1.25 });
    expect(axisLock({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual({ x: 3, y: 0 });
    expect(axisLock({ x: 0, y: 0 }, { x: 1, y: -3 })).toEqual({ x: 0, y: -3 });
  });
});

describe('匯出的版面與檔名', () => {
  const opts = {
    theme: 'clean' as const,
    px: 48,
    showSize: 'none' as const,
    hideNames: false,
    playerView: true,
    hideClues: false,
    grid: false,
    transparent: false,
  };
  const one = floorOf({ name: '1F', rooms: [room('a', 0, 0, 10, 8)] });

  it('一層：範圍＋四周 2 格；GM 用的圖上方多一條字帶', () => {
    const L = exportLayout([one], opts);
    expect([L.width, L.height, L.pxWidth, L.pxHeight, L.titleH]).toEqual([14, 12, 672, 576, 0]);
    const gm = exportLayout([one], { ...opts, gmBadge: 'GM 用' });
    expect(gm.badgeH).toBeCloseTo(1.1 * 1.6);
    expect(gm.pxHeight).toBe(Math.round((12 + 1.1 * 1.6) * 48));
  });

  it('好幾層：共同範圍、上方 2 格寫樓層名稱、間隔 1 格；太長時折成接近 4:3', () => {
    const a = floorOf({ name: '1F', rooms: [room('a', 0, 0, 10, 4)] });
    const b = floorOf({ name: '2F', rooms: [room('b', 2, 0, 10, 4)] });
    const L = exportLayout([a, b], opts);
    expect(L.frames[0]).toEqual({ x: -2, y: -4, w: 16, h: 10 });
    expect([L.cols, L.width, L.height]).toEqual([2, 33, 10]);
    const many = Array.from({ length: 6 }, (_, i) =>
      floorOf({ name: `${i + 1}F`, rooms: [room('r', 0, 0, 30, 4)] }),
    );
    const W = exportLayout(many, opts);
    expect(W.cols).toBeLessThan(6);
    expect(W.rows).toBe(Math.ceil(6 / W.cols));
  });

  it('太大時自動縮小', () => {
    const big = floorOf({ rooms: [room('a', 0, 0, 400, 10)] });
    const L = exportLayout([big], { ...opts, px: 96 });
    expect(L.scale).toBeLessThan(96);
    expect(L.pxWidth).toBeLessThanOrEqual(16000);
  });

  it('檔名：地圖名稱[_樓層]_PL／GM[_無線索]', () => {
    const p: Project = {
      name: '山中 洋館/本館',
      theme: 'clean',
      showSize: 'none',
      showNames: true,
      floors: [
        one,
        floorOf({
          name: '2F',
          items: [{ id: 'k', t: 'key', x: 0, y: 0, w: 1, h: 1, rot: 0, clue: true }],
        }),
      ],
      active: 1,
    };
    const exp = {
      range: 'current' as const,
      view: 'pl' as const,
      clues: 'hide' as const,
      px: 48 as const,
      grid: false,
      transparent: false,
    };
    expect(fileBase(p.name)).toBe('山中_洋館_本館');
    expect(fileBase('  ')).toBe('未命名地圖');
    expect(exportFileName(p, exp, p.floors[1])).toBe('山中_洋館_本館_2F_PL_無線索.png');
    expect(exportJobs(p, { ...exp, clues: 'show' }).map((j) => j.name)).toEqual([
      '山中_洋館_本館_2F_PL.png',
    ]);
    expect(
      exportJobs(p, { ...exp, range: 'all', view: 'gm', clues: 'show' }).map((j) => j.name),
    ).toEqual(['山中_洋館_本館_GM.png']);
    expect(exportJobs(p, { ...exp, range: 'each', clues: 'show' }).map((j) => j.name)).toEqual([
      '山中_洋館_本館_1F_PL.png',
      '山中_洋館_本館_2F_PL.png',
    ]);
    expect(exportJobs({ ...p, floors: [one], active: 0 }, { ...exp, clues: 'show' })[0].name).toBe(
      '山中_洋館_本館_PL.png',
    );
  });
});
