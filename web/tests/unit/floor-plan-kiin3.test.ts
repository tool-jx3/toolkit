/**
 * 室內平面圖產生器 2026-11-05 跟進 KIIN「マップ制作スタジオ」v2.0 第二批（規格 1.28、3.17、F289～F302）：
 * 曲線的房間（形狀、格子、面積、最大的那一塊）、沿著曲線的自動牆、放在曲線上的門窗、疊放的甲板（欄杆、段差線）、
 * 家具的碰撞與「在房間裡」、整張變形與旋轉、專案檔與分享連結、送給地圖演出產生器的外形。
 */
import { describe, expect, it } from 'vitest';
import { readHandoffRooms } from '@/core/handoff';
import { RenderCache as FxCache } from '@/core/imagefx';
import { exportLayout } from '@/tools/floor-plan/draw/export';
import { arrangeRoom } from '@/tools/floor-plan/model/arrange';
import { isAsset } from '@/tools/floor-plan/model/assets';
import { arrangeRing } from '@/tools/floor-plan/model/circle';
import { connectRooms } from '@/tools/floor-plan/model/connect';
import {
  curvedMainRect,
  flatSpans,
  flipShapeX,
  flipShapeY,
  outlineOf,
  ROOM_SHAPES,
  rotateShapeCW,
  signedArea,
} from '@/tools/floor-plan/model/curve';
import {
  type ExportSettings,
  exportJobs,
  exportOptions,
  handoffRoomsOf,
} from '@/tools/floor-plan/model/exportPlan';
import { FURNISH_PRESETS, furnishRoom } from '@/tools/floor-plan/model/furnish';
import { emptyFloor, itemCorners, roomArea } from '@/tools/floor-plan/model/geometry';
import { darknessAt } from '@/tools/floor-plan/model/lights';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import { rotateRoomsCW } from '@/tools/floor-plan/model/ops';
import {
  roomCells,
  roomContainsRoom,
  roomHasPoint,
  roomHasPointClosed,
  roomMainRect,
} from '@/tools/floor-plan/model/shape';
import { encodeMapHash, readMapHash } from '@/tools/floor-plan/model/share';
import { snapOpening } from '@/tools/floor-plan/model/snap';
import { transformProject } from '@/tools/floor-plan/model/transform';
import type { Floor, Item, Opening, Project, Room } from '@/tools/floor-plan/model/types';
import {
  computeWalls,
  curvedWalls,
  curveSnapLines,
  roomRuns,
  wallLines,
} from '@/tools/floor-plan/model/walls';
import { instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { drawRoomMask } from '@/tools/map-fx/exporter';
import {
  initialDefaults,
  initialState,
  type MapState,
  makeFrame,
  maskMainRect,
  maskPieces,
  maskPolygon,
  masksFromPlan,
  normalizePoly,
  normalizeState,
  type RedactFrame,
} from '@/tools/map-fx/model';
import { RenderCache, renderToCanvas } from '@/tools/map-fx/render';
import { nodeCanvas } from '../helpers/nodeCanvas';

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

const project = (floors: Floor[], patch: Partial<Project> = {}): Project => ({
  name: '測試',
  theme: 'clean',
  showSize: 'none',
  showNames: true,
  floors,
  active: 0,
  ...patch,
});

const door = (id: string, o: 'h' | 'v', x: number, y: number, len = 1.5): Opening => ({
  id,
  kind: 'door',
  o,
  x,
  y,
  len,
  side: 1,
  hinge: 0,
});

/* ---------- 形狀（F289、3.17.1） ---------- */

describe('曲線的房間的形狀（F289）', () => {
  it('15 種形狀：外形順時針、在外框裡、凸的；直的部分落在外框線上；面積小於外框', () => {
    expect(ROOM_SHAPES).toHaveLength(15);
    for (const shape of ROOM_SHAPES)
      for (const [w, h] of [
        [8, 6],
        [5, 9],
        [2, 2],
        [24, 10],
      ]) {
        const r = room('r', 3, 4, w, h, { shape });
        const pts = outlineOf(r);
        expect(pts.length, shape).toBeGreaterThanOrEqual(6);
        expect(signedArea(pts), shape).toBeGreaterThan(0);
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(3 - 1e-9);
          expect(x).toBeLessThanOrEqual(3 + w + 1e-9);
          expect(y).toBeGreaterThanOrEqual(4 - 1e-9);
          expect(y).toBeLessThanOrEqual(4 + h + 1e-9);
        }
        /* 凸：每三個連續的點都不往外轉（順時針：叉積 ≥ 0） */
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const c = pts[(i + 2) % pts.length];
          const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
          expect(cross, `${shape} ${w}x${h} @${i}`).toBeGreaterThanOrEqual(-1e-9);
        }
        for (const s of flatSpans(r)) {
          const onBox = s.o === 'h' ? s.c === 4 || s.c === 4 + h : s.c === 3 || s.c === 3 + w;
          expect(onBox, shape).toBe(true);
        }
        expect(roomArea(r)).toBeLessThan(w * h * 0.25);
        expect(roomArea(r)).toBeGreaterThan(w * h * 0.25 * 0.5);
      }
  });

  it('KIIN 的比例：圓頂的高＝min(深 × 0.65, 寬 ÷ 2)、船首＝min(深 × 0.85, max(深 × 0.55, 寬 × 0.9))、船體的船首＝深 × 0.42', () => {
    const flat = (r: Room, o: 'h' | 'v', c: number) =>
      flatSpans(r).find((s) => s.o === o && s.c === c);
    /* 圓頂（上）8 × 6：d＝min(3.9, 4)＝3.9 → 兩側的直牆從 y＝3.9 起 */
    expect(flat(room('r', 0, 0, 8, 6, { shape: 'dome-n' }), 'v', 0)?.a).toBeCloseTo(3.9, 6);
    /* 船首（右）6 × 8：l＝min(5.1, max(3.3, 7.2))＝5.1 → 上下的直牆到 x＝0.9 */
    expect(flat(room('r', 0, 0, 6, 8, { shape: 'bow-e' }), 'h', 0)?.b).toBeCloseTo(0.9, 6);
    /* 船體（船首朝上）8 × 20：船首 8.4、船尾的圓角 min(2.56, 3.6)＝2.56 */
    const hull = room('r', 0, 0, 8, 20, { shape: 'hull-n' });
    expect(flat(hull, 'v', 0)?.a).toBeCloseTo(8.4, 6);
    expect(flat(hull, 'v', 0)?.b).toBeCloseTo(20 - 2.56, 6);
    expect(flat(hull, 'h', 20)?.a).toBeCloseTo(2.56, 6);
    /* 八角形：倒角＝短邊 × 0.28；設了 radius 時用 radius */
    expect(flat(room('r', 0, 0, 10, 10, { shape: 'chamfer' }), 'h', 0)?.a).toBeCloseTo(2.8, 6);
    expect(flat(room('r', 0, 0, 10, 10, { shape: 'chamfer', radius: 1 }), 'h', 0)?.a).toBe(1);
    /* 圓角：預設＝短邊 × 0.25（0.5 格一格，0.5～2） */
    expect(flat(room('r', 0, 0, 8, 6, { shape: 'round' }), 'h', 0)?.a).toBe(1.5);
    expect(flat(room('r', 0, 0, 20, 20, { shape: 'round' }), 'h', 0)?.a).toBe(2);
  });

  it('格子的判斷：點在外形裡；外框的角落（外形外面）不算；格子＝中心在外形裡', () => {
    const e = room('e', 0, 0, 8, 6, { shape: 'ellipse' });
    expect(roomHasPoint(e, 4, 3)).toBe(true);
    expect(roomHasPoint(e, 0.3, 0.3)).toBe(false);
    expect(roomHasPointClosed(e, 4, 0)).toBe(true);
    expect(roomHasPointClosed(e, 0, 0)).toBe(false);
    const cells = [...roomCells(e)];
    expect(cells.some(([x, y]) => x === 0 && y === 0)).toBe(false);
    expect(cells.some(([x, y]) => x === 3 && y === 2)).toBe(true);
    for (const [x, y] of cells) expect(roomHasPoint(e, x + 0.5, y + 0.5)).toBe(true);
    /* 長方形的房間照舊 */
    expect([...roomCells(room('r', 0, 0, 3, 2))]).toHaveLength(6);
  });

  it('最大的那一塊：在外形裡、面積是外框的一半以上（橢圓約 1/√2 × 1/√2）', () => {
    for (const shape of ROOM_SHAPES) {
      const r = room('r', 2, 1, 12, 8, { shape });
      const m = roomMainRect(r);
      expect(m.w * m.h, shape).toBeGreaterThan(12 * 8 * 0.45);
      for (const [x, y] of [
        [m.x, m.y],
        [m.x + m.w, m.y],
        [m.x, m.y + m.h],
        [m.x + m.w, m.y + m.h],
      ])
        expect(
          roomHasPointClosed({ ...r }, x + (x > 8 ? -0.01 : 0.01), y + (y > 5 ? -0.01 : 0.01)),
          shape,
        ).toBe(true);
    }
    const m = curvedMainRect(room('r', 0, 0, 10, 10, { shape: 'ellipse' }));
    expect(m.w).toBeCloseTo(10 / Math.SQRT2, 0);
  });

  it('轉 90°、反轉：形狀換方向；轉四次、反兩次回到原樣；轉過的外形＝外形轉過去', () => {
    for (const s of ROOM_SHAPES) {
      expect(rotateShapeCW(rotateShapeCW(rotateShapeCW(rotateShapeCW(s))))).toBe(s);
      expect(flipShapeX(flipShapeX(s))).toBe(s);
      expect(flipShapeY(flipShapeY(s))).toBe(s);
    }
    expect(rotateShapeCW('hull-n')).toBe('hull-e');
    expect(flipShapeX('bow-e')).toBe('bow-w');
    expect(flipShapeY('dome-n')).toBe('dome-s');
    expect(flipShapeX('ellipse')).toBe('ellipse');
    /* 8 × 6 的圓頂（上）順時針轉成 6 × 8 的圓頂（右）：外形的點逐一對應 */
    const a = outlineOf(room('r', 0, 0, 8, 6, { shape: 'dome-n' }));
    const b = outlineOf(room('r', 0, 0, 6, 8, { shape: 'dome-e' }));
    const rotated = a.map(([x, y]) => [6 - y, x]);
    for (const p of rotated)
      expect(b.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)).toBe(true);
  });
});

/* ---------- 自動牆（F290、3.17.2） ---------- */

const runsOf = (f: Floor) =>
  computeWalls(f).runs.map((r) => `${r.o}${r.c}:${+r.a.toFixed(2)}-${+r.b.toFixed(2)} ${r.kind}`);

describe('沿著曲線的自動牆（F290）', () => {
  it('單獨一間橢圓：沒有直的牆，一圈外牆（曲線）', () => {
    const w = computeWalls(floorOf({ rooms: [room('e', 0, 0, 8, 6, { shape: 'ellipse' })] }));
    expect(w.runs).toEqual([]);
    expect(w.curves).toHaveLength(1);
    expect(w.curves[0].kind).toBe('ext');
    const pts = w.curves[0].pts;
    expect(Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1])).toBeLessThan(1e-9);
  });

  it('圓角：四條直的外牆（接到曲線的那一端不往外延伸）＋四個角的曲線', () => {
    const w = computeWalls(floorOf({ rooms: [room('r', 0, 0, 8, 6, { shape: 'round' })] }));
    expect(runsOf(floorOf({ rooms: [room('r', 0, 0, 8, 6, { shape: 'round' })] }))).toEqual([
      'h0:1.5-6.5 ext',
      'h6:1.5-6.5 ext',
      'v0:1.5-4.5 ext',
      'v8:1.5-4.5 ext',
    ]);
    expect(w.runs.every((r) => !r.capA && !r.capB)).toBe(true);
    expect(w.curves).toHaveLength(4);
  });

  it('大廳裡的圓形房間：曲線是內牆；外框的角落是大廳（沒有牆）', () => {
    const f = floorOf({
      rooms: [room('h', -4, -4, 16, 14), room('e', 0, 0, 8, 6, { shape: 'ellipse' })],
    });
    expect(runsOf(f)).toEqual(['h-4:-4-12 ext', 'h10:-4-12 ext', 'v-4:-4-10 ext', 'v12:-4-10 ext']);
    const w = computeWalls(f);
    expect(w.curves.map((c) => c.kind)).toEqual(['int']);
  });

  it('隔壁的長方形房間：接在直的部分是內牆，對著外框的角落（外形外面）是外牆', () => {
    /* 圓頂（右）的左邊是直的，接著西邊的房間 */
    const f = floorOf({
      rooms: [room('w', -4, 0, 4, 6), room('d', 0, 0, 8, 6, { shape: 'dome-e' })],
    });
    expect(runsOf(f)).toContain('v0:0-6 int');
    /* 橢圓的左邊只有一點碰到外框：隔壁的東牆整條是外牆 */
    const g = floorOf({
      rooms: [room('w', -4, 0, 4, 6), room('e', 0, 0, 8, 6, { shape: 'ellipse' })],
    });
    expect(runsOf(g)).toContain('v0:0-6 ext');
  });

  it('蓋在曲線房間上的房間：被蓋住的曲線不畫（只畫在上面那間的格子外面）', () => {
    const f = floorOf({
      rooms: [room('e', 0, 0, 12, 8, { shape: 'ellipse' }), room('c', 4, -2, 4, 4)],
    });
    const w = computeWalls(f);
    for (const c of w.curves)
      for (const [x, y] of c.pts) expect(x > 4 + 1e-6 && x < 8 - 1e-6 && y < 2 - 1e-6).toBe(false);
  });

  it('沒有曲線的房間時照原本的格子算（另一套算法對 57 個範本的每一層結果相同）', () => {
    for (const t of TEMPLATES)
      for (const f of instantiateTemplate(t.id) ?? []) {
        if (!f.rooms.length) continue;
        expect(curvedWalls(f.rooms).straight, `${t.id}/${f.name}`).toEqual(roomRuns(f.rooms));
      }
  });
});

/* ---------- 門窗（F291） ---------- */

describe('放在曲線上的門窗（F291）', () => {
  const dome = () => room('d', 0, 0, 8, 6, { shape: 'dome-e' });

  it('外框線上、那裡沒有直的牆的門：畫在外形上最近的一點、沿著切線；曲線的牆在那裡切開門的寬度', () => {
    /* 圓頂（右）8 × 6：圓頂的高 3，曲線從 x＝5 起；東邊的外框線 x＝8 上的門 → 畫在圓頂的尖端 */
    const f = floorOf({ rooms: [dome()], openings: [door('o', 'v', 8, 2.25)] });
    const w = computeWalls(f);
    const p = w.poses.get('o');
    expect(p?.x).toBeCloseTo(8, 6);
    expect(p?.y).toBeCloseTo(3, 1);
    expect(p).toBeTruthy();
    expect(roomHasPointClosed(dome(), p!.x, p!.y)).toBe(true);
    expect(Math.abs(p!.rot)).toBeLessThan(0.1);
    /* 斜的地方：北邊的外框線 x＝6～7.5 的窗 → 轉了 */
    const slanted = computeWalls(floorOf({ rooms: [dome()], openings: [door('s', 'h', 6, 0)] }));
    expect(Math.abs(slanted.poses.get('s')?.rot ?? 0)).toBeGreaterThan(0.2);
    expect(w.openingKind.get('o')).toBe('ext');
    /* 曲線的長度少了門的寬度（1.5 格） */
    const len = (pts: [number, number][]) =>
      pts.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
    const full = computeWalls(floorOf({ rooms: [dome()] })).curves.reduce(
      (s, c) => s + len(c.pts),
      0,
    );
    const cut = w.curves.reduce((s, c) => s + len(c.pts), 0);
    expect(full - cut).toBeCloseTo(1.5, 3);
  });

  it('直的部分上的門照舊（不轉）；切的是直的牆', () => {
    const f = floorOf({ rooms: [dome()], openings: [door('o', 'h', 1, 0)] });
    const w = computeWalls(f);
    expect(w.poses.has('o')).toBe(false);
    expect(runsOf(f).filter((r) => r.startsWith('h0:'))).toEqual(['h0:0-1 ext', 'h0:2.5-5 ext']);
  });

  it('沒有曲線的房間時沒有 pose、沒有曲線的牆（輸出和以前相同）', () => {
    const f = floorOf({ rooms: [room('r', 0, 0, 8, 6)], openings: [door('o', 'h', 3, 0)] });
    const w = computeWalls(f);
    expect(w.poses.size).toBe(0);
    expect(w.curves).toEqual([]);
  });

  it('吸附：曲線的房間的外框線上沒有直的牆的段；游標在曲線附近時吸到曲線上（預覽帶著 pose、開的那一側照游標）', () => {
    const f = floorOf({ rooms: [room('e', 0, 0, 10, 8, { shape: 'ellipse' })] });
    const lines = wallLines(f).concat(curveSnapLines(f));
    expect(curveSnapLines(f).length).toBe(4);
    /* 游標在東北的曲線附近、房間裡面 */
    const g = snapOpening(lines, [], 8.2, 1.6, 'door');
    expect(g?.pose).toBeTruthy();
    expect(Math.hypot(g!.pose!.x - 8.2, g!.pose!.y - 1.6)).toBeLessThan(1.25);
    /* 放下去之後畫在同一個位置 */
    const placed: Opening = {
      id: 'n',
      kind: 'door',
      o: g!.o,
      x: g!.x,
      y: g!.y,
      len: g!.len,
      side: g!.side,
      hinge: 0,
    };
    const p = computeWalls({ ...f, openings: [placed] }).poses.get('n');
    expect(p?.x).toBeCloseTo(g!.pose!.x, 9);
    expect(p?.y).toBeCloseTo(g!.pose!.y, 9);
  });
});

/* ---------- 甲板、疊放（F299、F300） ---------- */

describe('甲板與疊放（F299、F300）', () => {
  it('海面上的船體甲板：外圍（曲線與直的部分）是欄杆；甲板上的船首甲板是段差線；船室是外牆', () => {
    const f = floorOf({
      rooms: [
        room('sea', 0, 0, 40, 20, { cat: 'water' }),
        room('hull', 4, 4, 30, 12, { cat: 'shipdeck', shape: 'hull-e' }),
        room('fore', 24, 7, 8, 6, { cat: 'shipdeck', shape: 'bow-e' }),
        room('cabin', 8, 7, 8, 6),
      ],
    });
    const w = computeWalls(f);
    expect(new Set(w.curves.map((c) => c.kind))).toEqual(new Set(['rail', 'step']));
    expect(w.runs.filter((r) => r.kind === 'rail').length).toBeGreaterThan(0);
    expect(
      w.runs.filter((r) => r.c === 7 && r.o === 'h' && r.a >= 8 && r.b <= 16).map((r) => r.kind),
    ).toEqual(['ext']);
    /* 段差線不是牆：門窗不吸 */
    expect(wallLines(f).some((r) => r.kind === 'step')).toBe(false);
  });

  it('長方形的甲板疊在水上也是欄杆；沒有疊放時（相鄰）照舊沒有牆', () => {
    const stacked = floorOf({
      rooms: [
        room('sea', 0, 0, 20, 10, { cat: 'water' }),
        room('d', 4, 2, 8, 4, { cat: 'shipdeck' }),
      ],
    });
    expect(runsOf(stacked).filter((r) => r.endsWith('rail'))).toHaveLength(4);
    const side = floorOf({
      rooms: [
        room('sea', 0, 0, 4, 4, { cat: 'water' }),
        room('d', 4, 0, 4, 4, { cat: 'shipdeck' }),
      ],
    });
    expect(runsOf(side).filter((r) => r.startsWith('v4:'))).toEqual([]);
  });

  it('甲板上的兩間船室：打通兩間房鋪一條走廊在甲板上（走廊整條在甲板裡）', () => {
    const f = floorOf({
      rooms: [
        room('deck', 0, 0, 30, 14, { cat: 'shipdeck' }),
        room('a', 2, 4, 6, 6),
        room('b', 20, 4, 6, 6),
      ],
    });
    const r = connectRooms(f, 'a', 'b', '走廊');
    expect(r.ok).toBe(true);
    if (r.ok && r.kind === 'corridor') {
      expect(r.room.x).toBeGreaterThanOrEqual(0);
      expect(r.room.x + r.room.w).toBeLessThanOrEqual(30);
      expect(r.openings).toHaveLength(2);
    } else expect.fail('應該是走廊');
  });

  it('曲線的房間只在直的部分打通（共用的邊在曲線上時不放門）', () => {
    const ok = floorOf({
      rooms: [room('a', -6, 0, 6, 6), room('d', 0, 0, 8, 6, { shape: 'dome-e' })],
    });
    const r = connectRooms(ok, 'a', 'd', '走廊');
    expect(r.ok && r.kind === 'door').toBe(true);
    const curved = floorOf({
      rooms: [room('a', 8, 0, 6, 6), room('d', 0, 0, 8, 6, { shape: 'dome-e' })],
    });
    const c = connectRooms(curved, 'a', 'd', '走廊');
    expect(c.ok && c.kind === 'door').toBe(false);
  });
});

/* ---------- 家具（F293） ---------- */

const inside = (r: Room, it: Item) => itemCorners(it).every((q) => roomHasPointClosed(r, q.x, q.y));

describe('家具的碰撞與「在房間裡」照形狀（F293）', () => {
  it('自動擺放家具：圓形的房間裡排好的家具都在外形裡；靠牆的家具貼著曲線', () => {
    const e = room('e', 0, 0, 14, 12, { shape: 'ellipse' });
    const items = [
      item('b1', 'bookshelf', 6, 1.2, 2, 0.8),
      item('t', 'table', 6, 5, 2.4, 1.6),
      item('w', 'wardrobe', 11, 5, 1.2, 2.4, 90),
    ];
    const f = floorOf({ rooms: [e], items });
    const r = arrangeRoom(f, 'e');
    expect(r.ok).toBe(true);
    for (const it of items) {
      const m = r.moves.get(it.id) ?? it;
      expect(inside(e, { ...it, ...m }), it.id).toBe(true);
    }
  });

  it('內裝預設：七種在 16 × 12 的橢圓裡都放得下、全部在外形裡；太小的圓形放不下時地圖不變', () => {
    const e = room('e', 0, 0, 16, 12, { shape: 'ellipse' });
    for (const p of FURNISH_PRESETS) {
      const f = floorOf({ rooms: [e], openings: [door('o', 'v', 0, 5.25)] });
      const r = furnishRoom(f, 'e', p.id);
      if (!r.ok) continue;
      for (const it of r.add) expect(inside(e, it), `${p.id} ${it.t}`).toBe(true);
    }
    const ok = FURNISH_PRESETS.filter(
      (p) => furnishRoom(floorOf({ rooms: [e] }), 'e', p.id).ok,
    ).length;
    expect(ok).toBeGreaterThanOrEqual(6);
    const tiny = room('t', 0, 0, 4, 4, { shape: 'ellipse' });
    expect(furnishRoom(floorOf({ rooms: [tiny] }), 't', 'bedroom').ok).toBe(false);
  });

  it('內裝預設的 1,008 組掃描不受影響（長方形、L 形照舊；這裡抽三組）', () => {
    const f = floorOf({ rooms: [room('r', 0, 0, 9, 7)], openings: [door('o', 'h', 3.75, 7)] });
    const r = furnishRoom(f, 'r', 'study');
    expect(r.ok).toBe(true);
  });

  it('圓形配置：圓形的房間裡排一圈；超出外形時不改', () => {
    const e = room('e', 0, 0, 12, 12, { shape: 'ellipse' });
    const f = floorOf({
      rooms: [e],
      items: [item('t', 'table_round', 5, 5, 2, 2), item('c', 'chair', 5.6, 7.4, 0.8, 0.8)],
    });
    const r = arrangeRing(f, 'c', 6);
    expect(r.ok).toBe(true);
    if (r.ok) for (const it of r.items) expect(inside(e, it)).toBe(true);
    /* 扁的橢圓、椅子在左邊：一圈的半徑比橢圓的深大，上下的椅子出了外形，不改 */
    const wide = room('w', 0, 0, 16, 8, { shape: 'ellipse' });
    const g = floorOf({ rooms: [wide], items: [item('c', 'chair', 0.8, 3.6, 0.8, 0.8)] });
    expect(arrangeRing(g, 'c', 8).ok).toBe(false);
  });

  it('夜的光源只照亮所在的曲線房間：外框的角落（外形外面）是底下的房間，不亮', () => {
    const f = floorOf({
      rooms: [room('h', 0, 0, 12, 12), room('e', 2, 2, 8, 8, { shape: 'ellipse' })],
      items: [item('c', 'candle', 5.7, 5.7, 0.6, 0.6)],
    });
    expect(darknessAt(f, 0.6, 6, 6)).toBeLessThan(0.2);
    /* 外框的左上角：在外形外面、離燭台 4.2 格（半徑 5 以內），是大廳的，不亮 */
    expect(darknessAt(f, 0.6, 2.4, 2.4)).toBeCloseTo(0.6, 6);
  });
});

/* ---------- 整張變形、旋轉、存檔、分享連結（F295、F296） ---------- */

describe('帶著形狀到各處（F295、F296）', () => {
  const curvedProject = () =>
    project([
      floorOf({
        rooms: [
          room('sea', 0, 0, 30, 16, { cat: 'water', hideLabel: true }),
          room('hull', 2, 2, 24, 10, { cat: 'shipdeck', shape: 'hull-e' }),
          room('dome', 6, 4, 6, 5, { shape: 'dome-w' }),
          room('round', 14, 4, 5, 4, { shape: 'round', radius: 1 }),
        ],
        openings: [door('o', 'h', 9, 4)],
      }),
    ]);

  it('整張地圖轉 90°：形狀跟著轉；轉四次、反兩次回到原樣', () => {
    const p = curvedProject();
    const orig = JSON.stringify(p);
    transformProject(p, 'rotate');
    expect(p.floors[0].rooms.find((r) => r.id === 'hull')?.shape).toBe('hull-s');
    expect(p.floors[0].rooms.find((r) => r.id === 'dome')?.shape).toBe('dome-n');
    for (let i = 0; i < 3; i++) transformProject(p, 'rotate');
    expect(JSON.stringify(p)).toBe(orig);
    transformProject(p, 'flipX');
    expect(p.floors[0].rooms.find((r) => r.id === 'dome')?.shape).toBe('dome-e');
    transformProject(p, 'flipX');
    transformProject(p, 'flipY');
    transformProject(p, 'flipY');
    expect(JSON.stringify(p)).toBe(orig);
  });

  it('房間旋轉（R）：形狀跟著轉', () => {
    const f = curvedProject().floors[0];
    const dome = f.rooms.find((r) => r.id === 'dome') as Room;
    rotateRoomsCW(f, [dome], [{ type: 'room', id: 'dome' }]);
    expect(f.rooms.find((r) => r.id === 'dome')?.shape).toBe('dome-n');
  });

  it('整理（讀檔、分享連結、自動儲存）：認得的形狀留著；外框不到 2 × 2、不認得的拿掉；radius 取 0.5 格、夾到短邊的一半；有形狀時沒有缺角', () => {
    const raw = {
      ...curvedProject(),
      floors: [
        {
          ...curvedProject().floors[0],
          rooms: [
            room('a', 0, 0, 8, 6, { shape: 'ellipse', cut: { c: 'ne', w: 2, h: 2 } }),
            room('b', 0, 0, 1, 6, { shape: 'ellipse' }),
            { ...room('c', 0, 0, 8, 6), shape: 'star' },
            room('d', 0, 0, 8, 6, { shape: 'round', radius: 1.3 }),
            room('e', 0, 0, 8, 6, { shape: 'chamfer', radius: 9 }),
            room('f', 0, 0, 8, 6, { shape: 'ellipse', radius: 2 }),
            { ...room('g', 0, 0, 8, 6, { shape: 'round' }), radius: '2.2' },
          ],
        },
      ],
    };
    const p = normalizeProject(raw, isAsset);
    const rs = p?.floors[0].rooms ?? [];
    expect(rs[0].shape).toBe('ellipse');
    expect(rs[0].cut).toBeUndefined();
    expect(rs[1].shape).toBeUndefined();
    expect(rs[2].shape).toBeUndefined();
    expect(rs[3].radius).toBe(1.5);
    expect(rs[4].radius).toBeCloseTo(2.98, 6);
    expect(rs[5].radius).toBeUndefined();
    expect(rs[6].radius).toBe(2);
  });

  it('分享連結（完整與 PL 用）帶著形狀；PL 用連結裡 GM 專用的曲線房間的牆框也是曲線', () => {
    const p = curvedProject();
    p.floors[0].rooms[2].gm = true;
    for (const mode of ['full', 'pl'] as const) {
      const share = encodeMapHash(p, mode);
      const back = readMapHash(share.hash);
      if (back.kind !== 'ok') expect.fail('讀不回來');
      const rooms = normalizeProject(back.raw, isAsset)?.floors[0].rooms ?? [];
      expect(rooms.map((r) => r.shape ?? '')).toEqual(['', 'hull-e', 'dome-w', 'round']);
      expect(rooms[3].radius).toBe(1);
    }
  });

  it('沒有曲線的房間的分享連結沒有新的鍵', () => {
    const p = project([floorOf({ rooms: [room('r', 0, 0, 8, 6)] })]);
    const share = encodeMapHash(p, 'full');
    const back = readMapHash(share.hash);
    if (back.kind !== 'ok') expect.fail('讀不回來');
    const r0 = (back.raw as Project).floors[0].rooms[0];
    expect('shape' in r0).toBe(false);
    expect('radius' in r0).toBe(false);
  });

  it('巢狀的判斷照外形：圓形房間裡的小房間、外框的角落裡的小房間不算在圓形房間裡', () => {
    const e = room('e', 0, 0, 12, 12, { shape: 'ellipse' });
    expect(roomContainsRoom(e, room('in', 4, 4, 4, 4))).toBe(true);
    expect(roomContainsRoom(e, room('corner', 0, 0, 2, 2))).toBe(false);
    expect(roomContainsRoom(e, room('e2', 3, 3, 6, 6, { shape: 'ellipse' }))).toBe(true);
  });
});

/* ---------- 送給地圖演出產生器（F297；map-fx F89） ---------- */

const exp: ExportSettings = {
  mode: 'image',
  vttPx: 100,
  range: 'current',
  view: 'gm',
  clues: 'show',
  px: 24,
  grid: false,
  transparent: false,
};

describe('送給地圖演出產生器的外形（F297、map-fx F89）', () => {
  const plan = () => {
    const p = project([
      floorOf({
        rooms: [
          room('客廳', 0, 0, 12, 10),
          room('圓廳', 12, 0, 10, 10, { shape: 'ellipse' }),
          room('密室', 22, 0, 6, 10, { shape: 'dome-e', gm: true }),
        ],
      }),
    ]);
    const [job] = exportJobs(p, exp);
    const opts = exportOptions(p, exp, p.theme, exp.px);
    const L = exportLayout(job.floors, opts);
    return handoffRoomsOf(job.floors, L, opts);
  };

  it('曲線的房間帶 poly（圖的 px、在外框裡）；長方形的房間不帶；落在外框線上的點和外框一樣', () => {
    const rooms = plan();
    const [rect, round, gm] = rooms.list;
    expect(rect.poly).toBeUndefined();
    expect(round.poly?.length).toBeGreaterThan(20);
    for (const [x, y] of round.poly ?? []) {
      expect(x).toBeGreaterThanOrEqual(round.x);
      expect(x).toBeLessThanOrEqual(round.x + round.w);
      expect(y).toBeGreaterThanOrEqual(round.y);
      expect(y).toBeLessThanOrEqual(round.y + round.h);
    }
    expect(gm.gm).toBe(true);
    expect(gm.poly?.some(([x]) => x === gm.x)).toBe(true);
  });

  it('readHandoffRooms：poly 照讀；壞掉的 poly（不到 3 點、不是數字）拿掉、照外框；舊的格式照舊', () => {
    const rooms = plan();
    const back = readHandoffRooms({ rooms });
    expect(back?.list[1].poly).toEqual(rooms.list[1].poly);
    const bad = readHandoffRooms({
      rooms: {
        width: 100,
        height: 100,
        list: [
          {
            name: 'a',
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            poly: [
              [0, 0],
              [1, 1],
            ],
          },
          {
            name: 'b',
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            poly: [
              [0, 0],
              [10, 0],
              ['x', 5],
            ],
          },
          { name: 'c', x: 0, y: 0, w: 10, h: 10 },
        ],
      },
    });
    expect(bad?.list.map((r) => r.poly)).toEqual([undefined, undefined, undefined]);
  });

  it('地圖演出產生器做成曲線的房間遮罩：外形存外框的比例；「？」的那一塊在外形裡；3D 用那一塊；存檔照讀', () => {
    const rooms = plan();
    const d = initialDefaults();
    let n = 0;
    const r = masksFromPlan(
      rooms,
      { width: rooms.width, height: rooms.height },
      d.redact,
      () => `m${++n}`,
    );
    const round = r.frames[1] as RedactFrame;
    expect(round.poly?.length).toBeGreaterThan(20);
    expect(round.cut).toBeUndefined();
    for (const [u, v] of round.poly ?? []) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const box = { x: round.x, y: round.y, w: round.w, h: round.h };
    const poly = maskPolygon(round, box);
    expect(poly.length).toBe(round.poly?.length);
    const m = maskMainRect(round, box);
    expect(m.w * m.h).toBeGreaterThan(box.w * box.h * 0.45);
    expect(maskPieces(round)).toHaveLength(1);
    expect(maskPieces(round)[0].w).toBeLessThan(box.w);
    /* 長方形的房間照舊 */
    expect((r.frames[0] as RedactFrame).poly).toBeUndefined();
    /* 存檔往返 */
    const s = normalizeState({
      frames: r.frames,
      image: { id: 'i', name: 'a.png', width: rooms.width, height: rooms.height },
    });
    expect((s.frames[1] as RedactFrame).poly).toEqual(round.poly);
  });

  it('normalizePoly：夾到 0～1、四位小數、拿掉重複的點；不到 3 點或面積 0 時 null；超過 512 點平均地挑', () => {
    expect(
      normalizePoly([
        [0, 0],
        [1.2, 0],
        [1, 1],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(
      normalizePoly([
        [0, 0],
        [0, 0],
        [1, 1],
      ]),
    ).toBeNull();
    expect(
      normalizePoly([
        [0, 0],
        [0.5, 0.5],
        [1, 1],
      ]),
    ).toBeNull();
    expect(normalizePoly('x')).toBeNull();
    const many = Array.from({ length: 1000 }, (_, i) => [
      0.5 + 0.5 * Math.cos((i / 1000) * Math.PI * 2),
      0.5 + 0.5 * Math.sin((i / 1000) * Math.PI * 2),
    ]);
    const p = normalizePoly(many);
    expect(p?.length).toBeLessThanOrEqual(512);
    expect(p?.length).toBeGreaterThan(400);
  });
});

/* ---------- 地圖演出產生器的曲線遮罩的畫面（node-canvas；沒裝時跳過） ---------- */

const nc = await nodeCanvas();
type Img = OffscreenCanvas;
type G = OffscreenCanvasRenderingContext2D;

describe.runIf(nc)('地圖演出產生器的曲線遮罩：只蓋在外形裡（map-fx F89）', () => {
  const GRAY = [200, 200, 200, 255];
  const mapImage = (): Img => {
    const c = nc?.createCanvas(600, 400) as Img;
    const g = c.getContext('2d') as G;
    g.fillStyle = 'rgb(200, 200, 200)';
    g.fillRect(0, 0, 600, 400);
    return c;
  };
  const rgba = (c: Img, x: number, y: number) =>
    Array.from((c.getContext('2d') as G).getImageData(x, y, 1, 1).data);
  const ellipse = (): [number, number][] =>
    Array.from({ length: 64 }, (_, i) => [
      0.5 + 0.5 * Math.cos((i / 64) * Math.PI * 2),
      0.5 + 0.5 * Math.sin((i / 64) * Math.PI * 2),
    ]);
  const mask = (o: Partial<RedactFrame> = {}): RedactFrame => ({
    ...(makeFrame(
      'redact',
      { x: 100, y: 100, w: 300, h: 200 },
      initialDefaults(),
      'E',
    ) as RedactFrame),
    poly: ellipse(),
    ...o,
  });
  const state = (frames: RedactFrame[]): MapState => {
    const s = initialState();
    s.canvas = 'original';
    s.bg.mode = 'transparent';
    s.shot = { scale: 100, radius: 0, shadow: 0, spotlight: 0 };
    s.image = { id: 'img', name: 'map.png', width: 600, height: 400 };
    s.timing = { intro: 0, popup: 0, action: 1, outro: 1, order: 'sequential', fps: 15 };
    s.frames = frames;
    return s;
  };

  it('四種樣子：外形裡蓋著、外框的四個角落露出地圖；長方形的框照舊蓋滿外框', () => {
    const img = mapImage();
    for (const style of ['dark', 'keepout', 'fog', 'mosaic'] as const) {
      const c = renderToCanvas(
        { state: state([mask({ style, mode: 'static', label: '圓廳' })]), image: img },
        0,
        new RenderCache(),
      ) as Img;
      expect(rgba(c, 108, 108), style).toEqual(GRAY);
      expect(rgba(c, 392, 292), style).toEqual(GRAY);
      if (style !== 'mosaic') expect(rgba(c, 250, 120), style).not.toEqual(GRAY);
      const r = renderToCanvas(
        { state: state([mask({ style, mode: 'static', poly: undefined })]), image: img },
        0,
        new RenderCache(),
      ) as Img;
      if (style !== 'mosaic') expect(rgba(r, 108, 108), style).not.toEqual(GRAY);
    }
  });

  it('房間遮罩 ZIP 的單張：外形外面是透明的', () => {
    const img = mapImage();
    const room = mask({ style: 'dark', mode: 'reveal', label: '圓廳' });
    const c = nc?.createCanvas(600, 400) as Img;
    drawRoomMask(c.getContext('2d') as G, state([room]), img, room, new FxCache());
    expect(rgba(c, 105, 105)[3]).toBe(0);
    expect(rgba(c, 250, 200)[3]).toBe(255);
  });
});

describe('規格 3.17.4 的例子', () => {
  it('圓廳 (12, 0, 10 × 10) → 外框 (336, 96, 240 × 240)、poly 128 點（最左 336、最上 96）；密室的左邊的直線 x＝576', () => {
    const p = project([
      floorOf({
        rooms: [
          room('客廳', 0, 0, 12, 10),
          room('圓廳', 12, 0, 10, 10, { shape: 'ellipse' }),
          room('密室', 22, 0, 6, 10, { shape: 'dome-e', gm: true }),
        ],
      }),
    ]);
    const [job] = exportJobs(p, exp);
    const opts = exportOptions(p, exp, p.theme, exp.px);
    const rooms = handoffRoomsOf(job.floors, exportLayout(job.floors, opts), opts);
    const [, round, gm] = rooms.list;
    expect([round.x, round.y, round.w, round.h]).toEqual([336, 96, 240, 240]);
    expect(round.poly).toHaveLength(128);
    expect(Math.min(...(round.poly ?? []).map((q) => q[0]))).toBe(336);
    expect(Math.min(...(round.poly ?? []).map((q) => q[1]))).toBe(96);
    expect((gm.poly ?? []).filter(([x]) => x === 576).length).toBeGreaterThanOrEqual(2);
  });
});
