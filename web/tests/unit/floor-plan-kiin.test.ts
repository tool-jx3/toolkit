/**
 * 室內平面圖產生器：2026-10-29 參考 KIIN マップ制作スタジオ的四組功能（規格 1.25、3.14）——
 * L 形房間（牆、面積、內容、旋轉、整理、連結）、連接兩個房間（共用的牆放門、自動走廊、接不起來）、整理家具、
 * 家具跟著房間縮放、桌上的小物、座標標示、VTT 匯出、專案檔版本 7。
 */
import { describe, expect, it } from 'vitest';
import { exportLayout } from '@/tools/floor-plan/draw/export';
import { arrangeRoom } from '@/tools/floor-plan/model/arrange';
import { isAsset } from '@/tools/floor-plan/model/assets';
import { CORRIDOR_WIDTH, connectRooms } from '@/tools/floor-plan/model/connect';
import { columnName, coordGrid, coordLabels } from '@/tools/floor-plan/model/coords';
import {
  type ExportSettings,
  exportFileName,
  exportJobs,
  exportOptions,
  vttCells,
  vttTooLarge,
  wearSheet,
} from '@/tools/floor-plan/model/exportPlan';
import { followRoomResize } from '@/tools/floor-plan/model/follow';
import { emptyFloor, roomArea, sizeText, visibleFloor } from '@/tools/floor-plan/model/geometry';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import { roomContents, rotateRoomsCW } from '@/tools/floor-plan/model/ops';
import {
  cutRect,
  roomCellArea,
  roomHasPoint,
  roomHasPointClosed,
  roomMainRect,
  roomPolygon,
  shapeFromRects,
} from '@/tools/floor-plan/model/shape';
import { encodeMapHash, playerProject, readMapHash } from '@/tools/floor-plan/model/share';
import { restsOn, supportOf, withTabletop } from '@/tools/floor-plan/model/tabletop';
import type { Floor, Item, Opening, Project, Room } from '@/tools/floor-plan/model/types';
import { computeWalls } from '@/tools/floor-plan/model/walls';
import { instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { floorProblems } from '../helpers/floorPlanLayout';

const room = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<Room> = {},
): Room => ({ id, x, y, w, h, name: id, cat: 'living', ...extra });

const item = (
  id: string,
  t: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
): Item => ({
  id,
  t,
  x,
  y,
  w,
  h,
  rot,
});

const floorOf = (patch: Partial<Floor>): Floor => ({ ...emptyFloor('1F'), ...patch });

const runs = (f: Floor) =>
  computeWalls(f)
    .runs.map((r) => `${r.o}${r.c}:${r.a}-${r.b}:${r.kind}`)
    .sort();

const projectOf = (floors: Floor[], patch: Partial<Project> = {}): Project => ({
  name: 'T',
  theme: 'clean',
  showSize: 'none',
  showNames: true,
  floors,
  active: 0,
  ...patch,
});

describe('L 形房間（F257）：外形與包含', () => {
  const L = room('L', 0, 0, 6, 4, { cut: { c: 'ne', w: 3, h: 2 } });

  it('缺角、外形、面積、最大的那一塊', () => {
    expect(cutRect(L)).toEqual({ x: 3, y: 0, w: 3, h: 2 });
    expect(roomPolygon(L)).toEqual([
      [0, 0],
      [3, 0],
      [3, 2],
      [6, 2],
      [6, 4],
      [0, 4],
    ]);
    expect(roomCellArea(L)).toBe(18);
    expect(roomArea(L)).toBeCloseTo(4.5);
    /* 整列（下面 6 × 2）與整欄（左邊 3 × 4）一樣大時取整列 */
    expect(roomMainRect(L)).toEqual({ x: 0, y: 2, w: 6, h: 2 });
    expect(roomMainRect({ ...L, cut: { c: 'ne', w: 2, h: 3 } })).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 4,
    });
  });

  it('點在裡面：缺角裡不算；缺角的內側的邊算邊上', () => {
    expect(roomHasPoint(L, 1, 1)).toBe(true);
    expect(roomHasPoint(L, 4, 1)).toBe(false);
    expect(roomHasPoint(L, 4, 3)).toBe(true);
    expect(roomHasPointClosed(L, 3, 1)).toBe(true);
    expect(roomHasPointClosed(L, 4, 2)).toBe(true);
    expect(roomHasPointClosed(L, 4, 0)).toBe(false);
    expect(roomHasPointClosed(L, 6, 1)).toBe(false);
    expect(roomHasPointClosed(L, 6, 3)).toBe(true);
  });

  it('面積顯示：坪與㎡照 L 形的面積；長 × 寬是外框加（L 形）', () => {
    expect(sizeText(L, 'm2')).toBe('4.5㎡');
    expect(sizeText(L, 'm')).toBe('3.0×2.0m（L 形）');
    expect(sizeText(room('r', 0, 0, 6, 4), 'm')).toBe('3.0×2.0m');
  });

  it('兩塊長方形 → 外框＋缺角', () => {
    expect(
      shapeFromRects([
        { x: 0, y: 0, w: 6, h: 2 },
        { x: 4, y: 2, w: 2, h: 3 },
      ]),
    ).toEqual({ x: 0, y: 0, w: 6, h: 5, cut: { c: 'sw', w: 4, h: 3 } });
    expect(shapeFromRects([{ x: 1, y: 1, w: 3, h: 2 }])).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    /* 不是 L 形（T 形）的合不起來 */
    expect(
      shapeFromRects([
        { x: 0, y: 0, w: 6, h: 2 },
        { x: 2, y: 2, w: 2, h: 3 },
      ]),
    ).toBeNull();
  });
});

describe('L 形房間的自動牆（F257）', () => {
  it('單獨一間：六條邊都是外牆（含轉角裡面的兩條）', () => {
    const f = floorOf({ rooms: [room('L', 0, 0, 6, 4, { cut: { c: 'ne', w: 3, h: 2 } })] });
    expect(runs(f)).toEqual(
      ['h0:0-3:ext', 'h2:3-6:ext', 'h4:0-6:ext', 'v0:0-4:ext', 'v3:0-2:ext', 'v6:2-4:ext'].sort(),
    );
  });

  it('缺角裡放另一間：共用的兩條邊是內牆', () => {
    const f = floorOf({
      rooms: [
        room('L', 0, 0, 6, 4, { cut: { c: 'ne', w: 3, h: 2 } }),
        room('b', 3, 0, 3, 2, { cat: 'wet' }),
      ],
    });
    const r = runs(f);
    expect(r).toContain('v3:0-2:int');
    expect(r).toContain('h2:3-6:int');
    expect(r).toContain('h0:0-6:ext');
    expect(r).toContain('v6:0-4:ext');
  });

  it('缺角是戶外的陽台：陽台與 L 之間是外牆，陽台外面是欄杆；L 先放、陽台蓋在外框上也一樣', () => {
    const f = floorOf({
      rooms: [
        room('L', 0, 0, 6, 4, { cut: { c: 'se', w: 2, h: 2 } }),
        room('deck', 4, 2, 2, 2, { cat: 'balcony' }),
      ],
    });
    const r = runs(f);
    expect(r).toContain('v4:2-4:ext');
    expect(r).toContain('h2:4-6:ext');
    expect(r).toContain('v6:2-4:rail');
    expect(r).toContain('h4:4-6:rail');
  });

  it('兩間 L 形相鄰：共用邊是內牆；房間的牆種類取厚的', () => {
    const f = floorOf({
      rooms: [
        room('a', 0, 0, 4, 4, { cut: { c: 'se', w: 2, h: 2 } }),
        room('b', 2, 2, 4, 4, { cut: { c: 'nw', w: 0 + 2, h: 0 + 2 }, wall: 'stone' }),
      ],
    });
    const r = runs(f);
    /* a 的缺角 (2..4, 2..4) 被 b 的下半部佔掉？b 的缺角是 (2..4, 2..4)，兩間都沒佔：缺角是外面 */
    expect(r).toContain('v2:2-4:ext');
    expect(r).toContain('h2:2-4:ext');
    /* a 的右邊 (4, 0..2) 與 b 的上邊 (4..6, 2) 不相鄰 */
    expect(r.some((x) => x.includes(':stone'))).toBe(true);
  });
});

describe('L 形房間的內容、旋轉、PL 檢視、連結', () => {
  const L = room('L', 0, 0, 6, 4, { cut: { c: 'ne', w: 3, h: 2 } });
  const f = floorOf({
    rooms: [L],
    items: [item('in', 'chair', 1, 1, 1, 1), item('cut', 'chair', 4, 0.5, 1, 1)],
    texts: [{ id: 't', x: 4.5, y: 1, text: '缺角' }],
    openings: [{ id: 'o', kind: 'door', o: 'v', x: 3, y: 0.25, len: 1.5, side: 1, hinge: 0 }],
  });

  it('缺角裡的東西不算在房間裡；轉角裡面的邊上的門算', () => {
    const c = roomContents(f, L).map((r) => r.id);
    expect(c).toContain('in');
    expect(c).not.toContain('cut');
    expect(c).not.toContain('t');
    expect(c).toContain('o');
  });

  it('順時針轉 90°：缺角 ne → se，寬深對調', () => {
    const g = structuredClone(f);
    rotateRoomsCW(g, [g.rooms[0]], [{ type: 'room', id: 'L' }]);
    expect(g.rooms[0]).toMatchObject({ w: 4, h: 6, cut: { c: 'se', w: 2, h: 3 } });
  });

  it('PL 檢視：GM 專用的 L 形房間只剩牆框（L 形），缺角裡的東西照樣看得到', () => {
    const g = floorOf({ ...f, rooms: [{ ...L, gm: true }] });
    const v = visibleFloor(g, true);
    expect(v.rooms[0]).toMatchObject({ masked: true, cut: { c: 'ne', w: 3, h: 2 } });
    expect(v.items.map((i) => i.id)).toEqual(['cut']);
    const pl = playerProject(projectOf([g])).project;
    expect(pl.floors[0].rooms[0].cut).toEqual({ c: 'ne', w: 3, h: 2 });
  });

  it('專案檔整理：合法的缺角留著，不合法的拿掉（當成長方形）', () => {
    const p = normalizeProject(
      projectOf([
        floorOf({
          rooms: [
            L,
            room('bad', 10, 0, 4, 4, { cut: { c: 'ne', w: 4, h: 1 } }),
            room('bad2', 20, 0, 4, 4, { cut: { c: 'xx' as never, w: 1, h: 1 } }),
            room('tiny', 30, 0, 1, 4, { cut: { c: 'ne', w: 1, h: 1 } }),
          ],
        }),
      ]),
      isAsset,
    );
    expect(p?.floors[0].rooms.map((r) => r.cut ?? null)).toEqual([
      { c: 'ne', w: 3, h: 2 },
      null,
      null,
      null,
    ]);
  });

  it('分享連結往返：缺角、污漬、座標、家具不跟著房間都帶著', () => {
    const p = normalizeProject(
      projectOf([floorOf({ rooms: [L] })], {
        wear: 0.6,
        wearSeed: 1234,
        coords: true,
        fixedFurniture: true,
        theme: 'noir',
      }),
      isAsset,
    ) as Project;
    const share = encodeMapHash(p, 'full');
    const back = readMapHash(share.hash);
    expect(back.kind).toBe('ok');
    const q = normalizeProject(back.kind === 'ok' ? back.raw : null, isAsset) as Project;
    expect(q.floors[0].rooms[0].cut).toEqual({ c: 'ne', w: 3, h: 2 });
    expect(q).toMatchObject({
      wear: 0.6,
      wearSeed: 1234,
      coords: true,
      fixedFurniture: true,
      theme: 'noir',
    });
  });
});

describe('專案檔版本 6 → 7（F268、D79）', () => {
  it('沒有新欄位的舊資料：整理後不多出任何欄位', () => {
    const raw = projectOf([floorOf({ rooms: [room('a', 0, 0, 4, 4)] })], { tokenGrid: 2 });
    const p = normalizeProject(raw, isAsset) as Project;
    expect(Object.keys(p).sort()).toEqual(
      ['active', 'floors', 'name', 'showNames', 'showSize', 'theme', 'tokenGrid'].sort(),
    );
    expect(p.floors[0].rooms[0]).not.toHaveProperty('cut');
  });

  it('新的值夾在範圍裡、不認得的拿掉', () => {
    const p = normalizeProject(
      { ...projectOf([floorOf({})]), wear: 5, wearSeed: -12.6, coords: 'yes', fixedFurniture: 1 },
      isAsset,
    ) as Project;
    expect(p.wear).toBe(1);
    expect(p.wearSeed).toBe(13);
    expect(p.coords).toBeUndefined();
    expect(p.fixedFurniture).toBeUndefined();
    expect(normalizeProject({ ...projectOf([floorOf({})]), wear: 0.01 }, isAsset)?.wear).toBe(0.1);
  });

  it('污漬：0 以下＝關、數字字串照讀；種子取整數、絕對值、除以 1,000,000 的餘數；缺角的小數四捨五入、字串照讀（3.14.1、3.14.6）', () => {
    const one = (extra: Record<string, unknown>) =>
      normalizeProject({ ...projectOf([floorOf({})]), ...extra }, isAsset) as Project;
    expect(one({ wear: 0 })).not.toHaveProperty('wear');
    expect(one({ wear: -0.5 })).not.toHaveProperty('wear');
    expect(one({ wear: '0.55' }).wear).toBe(0.55);
    expect(one({ wear: 'x' })).not.toHaveProperty('wear');
    expect(one({ wearSeed: 1_000_005 }).wearSeed).toBe(5);
    expect(one({ wearSeed: '42' }).wearSeed).toBe(42);
    const withCut = (cut: unknown) =>
      (
        normalizeProject(
          projectOf([floorOf({ rooms: [{ ...room('r', 0, 0, 6, 4), cut } as Room] })]),
          isAsset,
        ) as Project
      ).floors[0].rooms[0].cut;
    expect(withCut({ c: 'ne', w: 2.4, h: '1.6' })).toEqual({ c: 'ne', w: 2, h: 2 });
    expect(withCut({ c: 'ne', w: 5.6, h: 2 })).toBeUndefined();
    expect(withCut({ c: 'ne', w: 'x', h: 2 })).toBeUndefined();
    expect(withCut({ c: 'up', w: 2, h: 2 })).toBeUndefined();
  });

  it('新的樣式認得，不認得的換回彩色', () => {
    expect(
      normalizeProject({ ...projectOf([floorOf({})]), theme: 'terminal' }, isAsset)?.theme,
    ).toBe('terminal');
    expect(normalizeProject({ ...projectOf([floorOf({})]), theme: 'sepia' }, isAsset)?.theme).toBe(
      'clean',
    );
  });
});

describe('桌上的小物（F255、F256）', () => {
  const desk = item('desk', 'desk', 0, 0, 2.4, 1.2);

  it('中心在桌面上、面積 70% 以上在桌面上', () => {
    expect(restsOn(item('l', 'laptop', 0.5, 0.2, 1.2, 0.9), desk)).toBe(true);
    /* 一半在桌外（50%）：不算 */
    expect(restsOn(item('l', 'laptop', 1.8, 0.2, 1.2, 0.9), desk)).toBe(false);
    /* 中心在桌上、75% 在桌上：算 */
    expect(restsOn(item('l', 'laptop', 1.5, 0.2, 1.2, 0.9), desk)).toBe(true);
    /* 不是小物（椅子）、不是桌面（床）不算 */
    expect(restsOn(item('c', 'chair', 0.5, 0.1, 1, 1), desk)).toBe(false);
    expect(restsOn(item('l', 'laptop', 0.5, 0.2, 1.2, 0.9), item('b', 'bed', 0, 0, 4, 6))).toBe(
      false,
    );
  });

  it('圓桌（橢圓）、全像投影桌（圓）：用桌面的形狀判定，外框的四個角不算（D70）', () => {
    const round = item('rt', 'table_round', 0, 0, 3, 3);
    /* 外框的角：外框的規則會算在桌上，橢圓不算 */
    expect(restsOn(item('c', 'candle', 0.1, 0.1, 0.5, 0.5), round)).toBe(false);
    expect(restsOn(item('c', 'candle', 1.25, 1.25, 0.5, 0.5), round)).toBe(true);
    /* 靠邊：中心在橢圓裡、七成以上在橢圓裡 */
    expect(restsOn(item('c', 'candle', 1.25, 0.05, 0.5, 0.5), round)).toBe(true);
    /* 中心在橢圓裡但一半以上在外面 */
    expect(restsOn(item('m', 'memo', 2.3, 1.0, 1.0, 1.0), round)).toBe(false);
    /* 橫長的圓桌＝內接的橢圓 */
    const oval = item('ov', 'table_round', 0, 0, 4, 2);
    expect(restsOn(item('c', 'candle', 3.2, 0.75, 0.5, 0.5), oval)).toBe(true);
    expect(restsOn(item('c', 'candle', 3.4, 0.1, 0.5, 0.5), oval)).toBe(false);
    /* 全像投影桌：短邊的內接圓 */
    const holo = item('h', 'holo_table', 0, 0, 4, 3);
    expect(restsOn(item('c', 'crystal_ball', 0.1, 1.25, 0.5, 0.5), holo)).toBe(false);
    expect(restsOn(item('c', 'crystal_ball', 1.75, 1.25, 0.5, 0.5), holo)).toBe(true);
  });

  it('好幾件桌面時算最小的那一件；選了桌子時小物一起帶著', () => {
    const big = item('big', 'table', -1, -1, 6, 4);
    const lamp = item('lamp', 'desk_lamp', 0.3, 0.2, 0.7, 0.7);
    expect(supportOf(lamp, [big, desk, lamp])?.id).toBe('desk');
    const f = floorOf({ items: [big, desk, lamp] });
    expect(withTabletop(f, [{ type: 'item', id: 'desk' }]).map((r) => r.id)).toEqual([
      'desk',
      'lamp',
    ]);
    expect(withTabletop(f, [{ type: 'item', id: 'big' }]).map((r) => r.id)).toEqual(['big']);
  });

  it('格局檢查：放在桌上（70%）的小物不算重疊，超出太多的算', () => {
    const ok = floorOf({
      rooms: [room('r', -2, -2, 10, 10)],
      items: [desk, item('m', 'desk_monitor', 1.5, 0, 1.2, 0.5)],
    });
    expect(floorProblems(ok, true).filter((x) => x.startsWith('家具重疊'))).toEqual([]);
    const bad = floorOf({
      rooms: [room('r', -2, -2, 10, 10)],
      items: [desk, item('m', 'desk_monitor', 1.9, 0, 1.2, 0.5)],
    });
    expect(floorProblems(bad, true).filter((x) => x.startsWith('家具重疊'))).toHaveLength(1);
  });
});

describe('座標標示（F264）', () => {
  it('欄名：A～Z、AA、AZ、BA、ZZ、AAA', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('起點：所有樓層的房間的左上角，往左上取到一格（棋子方格；沒有時 1 m）', () => {
    const floors = [
      floorOf({ rooms: [room('a', 3, 5, 6, 4)] }),
      floorOf({ rooms: [room('b', 1, 6, 4, 9)] }),
    ];
    expect(coordGrid(floors)).toEqual({ cell: 2, x0: 0, y0: 4, cols: 5, rows: 6 });
    expect(coordGrid(floors, 3)).toEqual({ cell: 3, x0: 0, y0: 3, cols: 3, rows: 4 });
    expect(coordGrid([floorOf({})])).toBeNull();
  });

  it('字寫在東西的外面；匯出的範圍包進來、左上角仍在單位上', () => {
    const f = floorOf({ rooms: [room('a', 0, 0, 8, 6)] });
    const grid = coordGrid([f], 2);
    expect(grid).not.toBeNull();
    const L = coordLabels(grid as NonNullable<typeof grid>, { x: -1, y: -2, w: 10, h: 9 });
    expect(L.colY).toBeLessThan(-2);
    expect(L.rowX).toBeLessThan(-1);
    const p = projectOf([f], { coords: true, tokenGrid: 2 });
    const exp: ExportSettings = {
      range: 'current',
      view: 'pl',
      clues: 'show',
      px: 48,
      grid: false,
      transparent: false,
    };
    const without = exportLayout([f], exportOptions({ ...p, coords: false }, exp, 'clean', 48));
    const withC = exportLayout([f], exportOptions(p, exp, 'clean', 48));
    expect(withC.width).toBeGreaterThan(without.width - 1e-9);
    expect(withC.height).toBeGreaterThan(without.height);
    for (const fr of withC.frames) {
      expect(Math.abs(fr.x % 2)).toBe(0);
      expect(Math.abs(fr.y % 2)).toBe(0);
    }
    expect(withC.coords[0]?.cols).toBe(4);
  });
});

describe('紙的污漬與摺痕：編輯畫面的紙＝匯出這一層的整張圖（F263、D75）', () => {
  const exp: ExportSettings = {
    range: 'all',
    view: 'gm',
    clues: 'show',
    px: 48,
    grid: false,
    transparent: false,
  };
  const p = projectOf(
    [
      floorOf({ rooms: [room('a', 0, 0, 10, 8)] }),
      floorOf({ id: 'f2', name: '2F', rooms: [room('b', 20, 4, 6, 6)] }),
    ],
    { wear: 0.6, wearSeed: 7, tokenGrid: 3 },
  );

  it('只看目前這一層；含四周的留白、GM 字帶（匯出設定是 GM 用時）、座標的字', () => {
    for (const active of [0, 1]) {
      const q = { ...p, active };
      const sheet = wearSheet(q, exp, true);
      const L = exportLayout(
        [q.floors[active]],
        exportOptions(q, { ...exp, range: 'current' }, 'clean', 24),
      );
      expect(sheet).toEqual({ x: L.frames[0].x, y: L.frames[0].y, w: L.width, h: L.height });
      expect(L.badgeH).toBeGreaterThan(0);
    }
    expect(wearSheet(p, exp, true)?.x).toBe(-3);
    expect((wearSheet(p, exp, true) as { x: number; w: number }).w).toBeLessThan(20);
    const withCoords = wearSheet({ ...p, coords: true }, { ...exp, view: 'pl' }, true);
    const plain = wearSheet(p, { ...exp, view: 'pl' }, true);
    expect(withCoords && plain && withCoords.w > plain.w).toBe(true);
    expect(wearSheet(projectOf([floorOf({})]), exp, true)).toBeNull();
  });
});

describe('VTT 用的匯出（F265、F266）', () => {
  const f = floorOf({ rooms: [room('a', 0, 0, 13, 9)] });
  const base: ExportSettings = {
    range: 'current',
    view: 'pl',
    clues: 'show',
    px: 48,
    grid: false,
    transparent: false,
    mode: 'vtt',
    vttPx: 100,
  };

  it('整數格、每格 px 照選的、不自動縮小；檔名加格數', () => {
    for (const tokenGrid of [undefined, 1, 2, 3, 4, 6] as const) {
      const p = projectOf([f], tokenGrid ? { tokenGrid } : {});
      for (const vttPx of [50, 70, 100] as const) {
        const L = exportLayout([f], exportOptions(p, { ...base, vttPx }, 'clean', 48));
        const cell = tokenGrid ?? 2;
        const cells = vttCells(L, cell);
        expect(L.width % cell).toBe(0);
        expect(L.height % cell).toBe(0);
        expect(L.pxWidth).toBe(cells.x * vttPx);
        expect(L.pxHeight).toBe(cells.y * vttPx);
        for (const fr of L.frames) expect(Math.abs(fr.x % cell)).toBe(0);
      }
    }
    const p = projectOf([f], { tokenGrid: 2 });
    const L = exportLayout([f], exportOptions(p, base, 'clean', 48));
    const cells = vttCells(L, 2);
    expect(exportFileName(p, base, null, cells)).toBe(`T_PL_${cells.x}x${cells.y}.png`);
    expect(exportJobs(p, base)[0].name).toBe(`T_PL_${cells.x}x${cells.y}.png`);
  });

  it('上限：任一邊 8192 px 或 3200 萬像素', () => {
    expect(vttTooLarge({ pxWidth: 8192, pxHeight: 3900 })).toBe(false);
    expect(vttTooLarge({ pxWidth: 8193, pxHeight: 100 })).toBe(true);
    expect(vttTooLarge({ pxWidth: 6000, pxHeight: 6000 })).toBe(true);
    const big = floorOf({ rooms: [room('a', 0, 0, 200, 60)] });
    const L = exportLayout([big], exportOptions(projectOf([big]), base, 'clean', 48));
    expect(L.scale).toBe(50);
    expect(vttTooLarge(L)).toBe(true);
  });

  it('一般圖片照舊（沒有 VTT 的欄位時版面不變）', () => {
    const p = projectOf([f]);
    const a = exportLayout([f], exportOptions(p, { ...base, mode: undefined }, 'clean', 48));
    const b = exportLayout([f], exportOptions(p, { ...base, mode: 'image' }, 'clean', 48));
    expect(a.pxWidth).toBe(b.pxWidth);
    expect(a.scale).toBe(48);
  });
});

describe('連接兩個房間（F250～F252）', () => {
  const NAME = '走廊';

  it('共用的牆：中間放一扇單開門，往大的那一間開', () => {
    const f = floorOf({ rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8)] });
    const r = connectRooms(f, 'a', 'b', NAME);
    expect(r.ok && r.kind).toBe('door');
    if (!r.ok) return;
    const o = r.openings[0];
    expect(o).toMatchObject({ kind: 'door', o: 'v', x: 10, len: 1.5 });
    expect(o.y).toBeCloseTo(3.25);
    /* a 比較大：往左（−） */
    expect(o.side).toBe(-1);
    const g = floorOf({ ...f, openings: [o] });
    expect(floorProblems(g, true)).toEqual([]);
  });

  it('門的位置有家具：往旁邊找；都被擋住時改拉門或失敗', () => {
    const f = floorOf({
      rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8)],
      items: [item('s', 'shelf', 8.5, 2, 1.5, 4)],
    });
    const r = connectRooms(f, 'a', 'b', NAME);
    expect(r.ok).toBe(true);
    if (r.ok) expect(floorProblems(floorOf({ ...f, openings: r.openings }), true)).toEqual([]);
    const blocked = floorOf({
      rooms: [room('a', 0, 0, 4, 4), room('b', 4, 0, 4, 4)],
      items: [item('s1', 'shelf', 3, 0, 1, 4), item('s2', 'shelf', 4, 0, 1, 4)],
    });
    expect(connectRooms(blocked, 'a', 'b', NAME)).toEqual({ ok: false, reason: 'blocked' });
  });

  it('牆的中間放不下單開門（兩邊的開門範圍都有家具）時，先找整面牆別的位置的單開門，才改拉門', () => {
    const f = floorOf({
      rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8)],
      items: [item('l', 'shelf', 8, 3.2, 0.8, 1.6), item('r', 'shelf', 11.2, 3.2, 0.8, 1.6)],
    });
    const r = connectRooms(f, 'a', 'b', NAME);
    expect(r.ok && r.kind).toBe('door');
    if (!r.ok) return;
    expect(r.openings[0].kind).toBe('door');
    expect(Math.abs(r.openings[0].y - 3.25)).toBeGreaterThan(0.2);
    expect(floorProblems(floorOf({ ...f, openings: r.openings }), true)).toEqual([]);
    /* 整面牆都放不下單開門：拉門（只要門前一格空著） */
    const tight = floorOf({
      rooms: [room('a', 0, 0, 10, 4), room('b', 10, 0, 6, 4)],
      items: [item('l', 'shelf', 8, 0, 0.8, 4), item('r', 'shelf', 11.2, 0, 0.8, 4)],
    });
    const t = connectRooms(tight, 'a', 'b', NAME);
    expect(t.ok && t.openings[0].kind).toBe('sliding');
  });

  it('已經有門、沒有牆、共用的牆太短', () => {
    const door: Opening = { id: 'd', kind: 'open', o: 'v', x: 10, y: 1, len: 2, side: 1, hinge: 0 };
    const f = floorOf({
      rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8)],
      openings: [door],
    });
    expect(connectRooms(f, 'a', 'b', NAME)).toEqual({
      ok: false,
      reason: 'connected',
      doorId: 'd',
    });
    const zone = floorOf({
      rooms: [room('a', 0, 0, 10, 8), room('b', 10, 0, 6, 8, { noWall: true })],
    });
    expect(connectRooms(zone, 'a', 'b', NAME)).toEqual({ ok: false, reason: 'noWall' });
    const outdoor = floorOf({
      rooms: [room('a', 0, 0, 10, 8, { cat: 'garden' }), room('b', 10, 0, 6, 8, { cat: 'garden' })],
    });
    expect(connectRooms(outdoor, 'a', 'b', NAME)).toEqual({ ok: false, reason: 'noWall' });
  });

  it('沒有共用的牆：直的走廊（3 格寬），兩端各一扇門', () => {
    const f = floorOf({ rooms: [room('a', 0, 0, 8, 8), room('b', 14, 0, 8, 8)] });
    const r = connectRooms(f, 'a', 'b', NAME);
    expect(r.ok && r.kind).toBe('corridor');
    if (!r.ok || r.kind !== 'corridor') return;
    expect(r.room).toMatchObject({ x: 8, w: 6, h: CORRIDOR_WIDTH, cat: 'hall', name: NAME });
    expect(r.room.cut).toBeUndefined();
    expect(r.length).toBe(3);
    const g = floorOf({ rooms: [...f.rooms, r.room], openings: r.openings });
    expect(floorProblems(g, true)).toEqual([]);
    expect(r.openings.map((o) => o.x).sort((p, q) => p - q)).toEqual([8, 14]);
  });

  it('錯開的兩間：L 形的走廊（一個轉角）', () => {
    const f = floorOf({ rooms: [room('a', 0, 0, 8, 6), room('b', 14, 12, 8, 6)] });
    const r = connectRooms(f, 'a', 'b', NAME);
    expect(r.ok && r.kind).toBe('corridor');
    if (!r.ok || r.kind !== 'corridor') return;
    expect(r.room.cut).toBeDefined();
    const g = floorOf({ rooms: [...f.rooms, r.room], openings: r.openings });
    expect(floorProblems(g, true)).toEqual([]);
  });

  it('被其他房間擋住時繞開；完全擋住時失敗、不改資料', () => {
    const f = floorOf({
      rooms: [room('a', 0, 0, 8, 8), room('wall', 8, -20, 4, 48), room('b', 12, 0, 8, 8)],
    });
    /* a 和 wall、wall 和 b 都相鄰：a 和 b 之間沒有共用的牆，走廊找不到 */
    expect(connectRooms(f, 'a', 'b', NAME)).toEqual({ ok: false, reason: 'noRoute' });
    /* 直的會穿過 mid：改走 L 形（從 a 的下面往下、再往右接到 b 的西邊） */
    const g = floorOf({
      rooms: [room('a', 0, 0, 8, 8), room('mid', 10, 0, 4, 8), room('b', 16, 10, 8, 8)],
    });
    const r = connectRooms(g, 'a', 'b', NAME);
    expect(r.ok && r.kind).toBe('corridor');
    if (r.ok && r.kind === 'corridor') {
      expect(r.room.cut).toBeDefined();
      const h = floorOf({ rooms: [...g.rooms, r.room], openings: r.openings });
      expect(floorProblems(h, true)).toEqual([]);
    }
  });
});

describe('自動擺放家具（F253）', () => {
  it('靠牆的貼到牆上、背面朝牆；門前留空；結果通過格局檢查', () => {
    const f = floorOf({
      rooms: [room('r', 0, 0, 12, 10)],
      openings: [{ id: 'd', kind: 'door', o: 'h', x: 5, y: 10, len: 1.5, side: -1, hinge: 0 }],
      items: [
        item('shelf', 'bookshelf', 4, 1.5, 3, 0.8),
        /* 房間中間（離牆超過 1 m）的靠牆家具：照原位 */
        item('mid', 'bookshelf', 5.5, 5, 2, 0.8),
        item('bed', 'bed', 5, 6.5, 2, 4),
        item('desk', 'desk', 1, 3, 2.4, 1.2),
        item('lap', 'laptop', 1.4, 3.1, 1.2, 0.9),
        item('ch', 'chair', 1.6, 4.3, 1, 1),
        item('rug', 'rug', 3, 3, 4, 3),
      ],
    });
    const r = arrangeRoom(f, 'r');
    expect(r.ok).toBe(true);
    const g = structuredClone(f);
    for (const it of g.items) {
      const m = r.moves.get(it.id);
      if (m) Object.assign(it, m);
    }
    expect(floorProblems(g, true)).toEqual([]);
    /* 書架貼牆：外框有一邊在牆線上 */
    const shelf = g.items.find((i) => i.id === 'shelf') as Item;
    const onWall =
      shelf.x === 0 || shelf.y === 0 || shelf.x + shelf.w === 12 || shelf.y + shelf.h === 10;
    expect(onWall).toBe(true);
    /* 地毯不動；房間中間的書架不推到牆邊 */
    expect(g.items.find((i) => i.id === 'rug')).toMatchObject({ x: 3, y: 3 });
    expect(g.items.find((i) => i.id === 'mid')).toMatchObject({ x: 5.5, y: 5, rot: 0 });
    /* 筆電仍在桌上 */
    const desk = g.items.find((i) => i.id === 'desk') as Item;
    const lap = g.items.find((i) => i.id === 'lap') as Item;
    expect(restsOn(lap, desk)).toBe(true);
  });

  it('L 形房間也可以；沒有家具時 empty；排不下時 full', () => {
    const L = room('L', 0, 0, 10, 8, { cut: { c: 'ne', w: 5, h: 4 } });
    const f = floorOf({ rooms: [L], items: [item('s', 'bookshelf', 6, 5, 3, 0.8)] });
    const r = arrangeRoom(f, 'L');
    expect(r.ok).toBe(true);
    const g = structuredClone(f);
    Object.assign(g.items[0], r.moves.get('s'));
    expect(floorProblems(g, true)).toEqual([]);
    expect(arrangeRoom(floorOf({ rooms: [L] }), 'L').reason).toBe('empty');
    const tiny = floorOf({
      rooms: [room('t', 0, 0, 3, 3)],
      items: [item('a', 'bed', 0, 0, 2, 4), item('b', 'bed', 1, 0, 2, 4)],
    });
    expect(arrangeRoom(tiny, 't').reason).toBe('full');
  });
});

describe('家具跟著房間縮放（F254）', () => {
  it('貼東牆的還貼東牆、中間的照比例；東牆上的門跟著移動', () => {
    const r0 = room('r', 0, 0, 10, 8);
    const before = floorOf({
      rooms: [r0],
      items: [item('e', 'bookshelf', 9.2, 2, 0.8, 3, 90), item('m', 'table', 4, 3, 2, 2)],
      openings: [{ id: 'o', kind: 'door', o: 'v', x: 10, y: 3, len: 1.5, side: -1, hinge: 0 }],
    });
    const after = structuredClone(before);
    const next = { ...r0, w: 14 };
    after.rooms[0].w = 14;
    const misfit = followRoomResize(before, r0, next, after);
    expect(misfit).toBe(0);
    expect(after.items.find((i) => i.id === 'e')?.x).toBeCloseTo(13.2);
    /* 中心 5 → 7 */
    expect(after.items.find((i) => i.id === 'm')?.x).toBeCloseTo(6);
    expect(after.openings[0]).toMatchObject({ x: 14, y: 3 });
  });

  it('縮小到放不下：夾在房間裡、回傳放不下的組數；桌上的小物和桌子一起', () => {
    const r0 = room('r', 0, 0, 10, 8);
    const before = floorOf({
      rooms: [r0],
      items: [
        item('t', 'table', 6, 3, 3, 2),
        item('c', 'candle', 7, 3.5, 0.8, 0.8),
        item('big', 'bed', 1, 1, 4, 6),
      ],
    });
    const after = structuredClone(before);
    const next = { ...r0, w: 3, h: 8 };
    after.rooms[0].w = 3;
    const misfit = followRoomResize(before, r0, next, after);
    expect(misfit).toBe(1);
    const t = after.items.find((i) => i.id === 't') as Item;
    const c = after.items.find((i) => i.id === 'c') as Item;
    expect(c.x - t.x).toBeCloseTo(1);
    expect(t.x + t.w).toBeLessThanOrEqual(3 + 1e-9);
  });
});

describe('57 個範本：整理家具、連接房間的結果都通過格局檢查（F253、F250～F252）', () => {
  it('每一間房「自動擺放家具」：成功的（沒有留在原處的）都通過 F194、F212、F242', () => {
    const n = { ok: 0, pinned: 0, full: 0, empty: 0 };
    const bad: string[] = [];
    for (const t of TEMPLATES)
      for (const f of instantiateTemplate(t.id) ?? [])
        for (const r of f.rooms) {
          const res = arrangeRoom(f, r.id);
          if (!res.ok) {
            n[res.reason === 'full' ? 'full' : 'empty']++;
            continue;
          }
          if (res.pinned.length) {
            n.pinned++;
            continue;
          }
          n.ok++;
          const g = structuredClone(f);
          for (const it of g.items) {
            const m = res.moves.get(it.id);
            if (m) Object.assign(it, m);
          }
          const p = floorProblems(g, true).filter((x) => !x.startsWith('門開到半空中'));
          if (p.length) bad.push(`${t.id}/${f.name}/${r.name}：${p[0]}`);
        }
    expect(bad).toEqual([]);
    expect(n.ok).toBeGreaterThan(800);
  }, 120_000);

  it('每一層前 5 間房的每一對「打通兩間房」：加的門、走廊都通過 F194、F212、F242', () => {
    const n = { door: 0, corridor: 0, fail: 0 };
    const bad: string[] = [];
    for (const t of TEMPLATES)
      for (const f of instantiateTemplate(t.id) ?? []) {
        const rs = f.rooms.slice(0, 5);
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const r = connectRooms(f, rs[i].id, rs[j].id, '走廊');
            if (!r.ok) {
              n.fail++;
              continue;
            }
            n[r.kind]++;
            const g = {
              ...f,
              rooms: r.kind === 'corridor' ? [...f.rooms, r.room] : f.rooms,
              openings: [...f.openings, ...r.openings],
            };
            const p = floorProblems(g, true).filter((x) => !x.startsWith('門開到半空中'));
            if (p.length) bad.push(`${t.id}/${f.name}/${rs[i].name}－${rs[j].name}：${p[0]}`);
          }
      }
    expect(bad).toEqual([]);
    expect(n.door).toBeGreaterThan(100);
    expect(n.corridor).toBeGreaterThan(5);
  }, 120_000);
});
