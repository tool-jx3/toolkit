/**
 * 室內平面圖產生器：2026-11-05 跟進 KIIN「マップ制作スタジオ」v2.0 第一批（規格 1.27、3.16）——
 * 整張地圖轉 90°／反轉（轉四次、反兩次回到原樣，57 個範本轉過之後格局檢查照樣通過）、圓形配置的幾何、
 * 內裝預設放得下的判斷、夜的光源只照亮所在的房間、PL 用不含秘密的光源、自由線、家具的細角度與倍率、專案檔版本 8。
 */
import { describe, expect, it } from 'vitest';
import { exportLayout, renderImage } from '@/tools/floor-plan/draw/export';
import { isAsset } from '@/tools/floor-plan/model/assets';
import {
  arrangeRing,
  cornersOverlap,
  flipRing,
  partialRingIds,
  ringMembers,
} from '@/tools/floor-plan/model/circle';
import {
  type ExportSettings,
  exportFileName,
  exportOptions,
} from '@/tools/floor-plan/model/exportPlan';
import { FURNISH_PRESETS, furnishRoom } from '@/tools/floor-plan/model/furnish';
import {
  emptyFloor,
  floorBounds,
  itemCorners,
  itemFootprint,
  itemHasPoint,
  itemLocalSize,
  quarterTurn,
  visibleFloor,
} from '@/tools/floor-plan/model/geometry';
import { blocking, hitsDoor } from '@/tools/floor-plan/model/layoutRules';
import { darknessAt, lightsOf } from '@/tools/floor-plan/model/lights';
import {
  bendTo,
  flipLine,
  lineBounds,
  lineDistance,
  lineMid,
} from '@/tools/floor-plan/model/lines';
import { normalizeProject } from '@/tools/floor-plan/model/normalize';
import { countRefs, deepClone, roomContents, rotateItem } from '@/tools/floor-plan/model/ops';
import { roomHasPointClosed } from '@/tools/floor-plan/model/shape';
import {
  encodeMapHash,
  packProject,
  playerProject,
  readMapHash,
} from '@/tools/floor-plan/model/share';
import { transformFrame, transformProject } from '@/tools/floor-plan/model/transform';
import type { Floor, FreeLine, Item, Opening, Project, Room } from '@/tools/floor-plan/model/types';
import { instantiateTemplate, TEMPLATES } from '@/tools/floor-plan/templates';
import { layoutProblems } from '../helpers/floorPlanLayout';
import { installRecordingDocument, type RecordingCanvas } from '../helpers/recordingCanvas';

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

const project = (floors: Floor[], patch: Partial<Project> = {}): Project => ({
  name: '測試',
  theme: 'clean',
  showSize: 'none',
  showNames: true,
  floors,
  active: 0,
  ...patch,
});

const floorOf = (patch: Partial<Floor>): Floor => ({ ...emptyFloor('1F'), ...patch });

/* ---------- 整張地圖轉 90°、反轉（F276） ---------- */

/** 數值取到小數 6 位（範本裡有 15.399999999999999 這種浮點數的尾巴，轉過一次就變成 15.4） */
const tidy = <T>(v: T): T =>
  JSON.parse(
    JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 + 0 : x)),
  ) as T;

describe('整張地圖轉 90°、左右／上下反轉（F276）', () => {
  it('57 個範本：轉四次、左右反兩次、上下反兩次都回到原樣（逐欄位相同）', () => {
    for (const t of TEMPLATES) {
      const floors = instantiateTemplate(t.id, { clues: true }) ?? [];
      const p = project(floors);
      const orig = tidy(p);
      for (let i = 0; i < 4; i++) expect(transformProject(p, 'rotate'), t.id).toBe(true);
      expect(tidy(p), `${t.id} 轉四次`).toEqual(orig);
      /* 第一次之後已經是小數 2 位，再轉四次逐位元組相同 */
      const once = deepClone(p);
      for (let i = 0; i < 4; i++) transformProject(p, 'rotate');
      expect(p, `${t.id} 再轉四次`).toEqual(once);
      transformProject(p, 'flipX');
      transformProject(p, 'flipX');
      expect(p, `${t.id} 左右兩次`).toEqual(once);
      transformProject(p, 'flipY');
      transformProject(p, 'flipY');
      expect(p, `${t.id} 上下兩次`).toEqual(once);
    }
  });

  it('57 個範本轉 90°、反轉之後格局檢查照樣通過（門窗在牆上、開門的範圍與門前沒有家具、樓梯對齊、走得到…）', () => {
    for (const t of TEMPLATES) {
      const before = layoutProblems(instantiateTemplate(t.id) ?? []);
      for (const mode of ['rotate', 'flipX', 'flipY'] as const) {
        const p = project(instantiateTemplate(t.id) ?? []);
        transformProject(p, mode);
        expect(layoutProblems(p.floors), `${t.id} ${mode}`).toEqual(before);
      }
    }
  });

  it('房間還在整格上、棋子方格對得齊；範圍以中心轉（寬深的差是單位的偶數倍時中心不動）', () => {
    const p = project([floorOf({ rooms: [room('a', 2, 4, 10, 6), room('b', 12, 4, 4, 6)] })], {
      tokenGrid: 2,
    });
    const B0 = transformFrame(p.floors, 2);
    expect(B0).toEqual({ x: 2, y: 4, w: 14, h: 6 });
    transformProject(p, 'rotate');
    const B1 = transformFrame(p.floors, 2);
    /* 寬 14、深 6：差 8＝單位 2 的 4 倍（偶數）→ 中心 (9, 7) 不動 */
    expect(B1).toEqual({ x: 6, y: 0, w: 6, h: 14 });
    for (const r of p.floors[0].rooms) {
      for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isInteger(v)).toBe(true);
      expect(r.x % 2).toBe(0);
      expect(r.y % 2).toBe(0);
    }
    /* a (2,4,10,6) 順時針轉：左上角＝原本的左下角轉過去 */
    expect(p.floors[0].rooms[0]).toMatchObject({ x: 6, y: 0, w: 6, h: 10 });
  });

  it('門窗：方向、鉸鍊、開的那一側跟著轉（會開的門以畫面方向、拉門以線的方向）；L 形的缺角、名字的位移也轉', () => {
    const door: Opening = {
      id: 'd',
      kind: 'door',
      o: 'h',
      x: 4,
      y: 0,
      len: 1.5,
      side: 1,
      hinge: 0,
    };
    const slide: Opening = {
      id: 's',
      kind: 'sliding',
      o: 'v',
      x: 0,
      y: 2,
      len: 1.5,
      side: 1,
      hinge: 1,
    };
    const L = room('L', 0, 0, 8, 6, { cut: { c: 'ne', w: 3, h: 2 }, lx: 1, ly: -0.5 });
    const p = project([floorOf({ rooms: [deepClone(L)], openings: [deepClone(door), slide] })]);
    transformProject(p, 'rotate');
    const [d, s] = p.floors[0].openings;
    /* 橫線往下開的門 → 直線往左開（side −1）、鉸鍊照舊在起點（上端） */
    expect(d).toMatchObject({ o: 'v', side: -1, hinge: 0 });
    /* 直線的拉門 → 橫線；下端變成起點，鉸鍊換邊；拉門的 side 以線的方向為準（直線 +＝左 → 橫線 −＝上） */
    expect(s).toMatchObject({ o: 'h', hinge: 0, side: -1 });
    const r = p.floors[0].rooms[0];
    expect(r.cut).toEqual({ c: 'se', w: 2, h: 3 });
    expect([r.lx, r.ly]).toEqual([0.5, 1]);
    /* 左右反轉：缺角左右換、門的開的那一側照畫面鏡像 */
    const q = project([floorOf({ rooms: [deepClone(L)], openings: [deepClone(door)] })]);
    transformProject(q, 'flipX');
    expect(q.floors[0].rooms[0].cut?.c).toBe('nw');
    expect(q.floors[0].openings[0]).toMatchObject({ o: 'h', side: 1, hinge: 1 });
  });

  it('家具：轉 90° 是 +90°；左右反轉是 −角度、上下反轉是 180° − 角度，左右翻轉跟著切換；文字只動位置', () => {
    const p = project([
      floorOf({
        rooms: [room('a', 0, 0, 10, 8)],
        items: [item('i', 'sofa2', 1, 1, 3.2, 1.8, 0), item('j', 'chair', 5, 5, 1, 1, 30)],
        texts: [{ id: 't', x: 3, y: 2, text: '字' }],
      }),
    ]);
    transformProject(p, 'rotate');
    const [i, j] = p.floors[0].items;
    expect(i.rot).toBe(90);
    expect([i.w, i.h]).toEqual([1.8, 3.2]);
    expect(j.rot).toBe(120);
    transformProject(p, 'flipX');
    expect(p.floors[0].items[0]).toMatchObject({ rot: 270, flip: true });
    expect(p.floors[0].items[1].rot).toBe(240);
    transformProject(p, 'flipY');
    expect(p.floors[0].items[0].rot).toBe(270);
    expect(p.floors[0].items[0].flip).toBeUndefined();
    expect(p.floors[0].texts[0]).not.toHaveProperty('rot');
  });

  it('沒有東西時不動（回傳 false）', () => {
    const p = project([emptyFloor('1F')]);
    expect(transformProject(p, 'rotate')).toBe(false);
  });
});

/* ---------- 家具的細角度與倍率（F277、F278） ---------- */

describe('家具的細角度（F277）', () => {
  it('外框照最接近的 90° 對調寬深；90° 的倍數和以前相同', () => {
    expect([0, 44, 45, 46, 134, 135, 180, 270, 315, 359].map(quarterTurn)).toEqual([
      0, 0, 1, 1, 1, 2, 2, 3, 0, 0,
    ]);
    const it = item('i', 'bed_single', 2, 2, 2, 4);
    rotateItem(it, 15);
    expect(it.rot).toBe(15);
    expect([it.w, it.h]).toEqual([2, 4]);
    rotateItem(it, 45);
    expect(it.rot).toBe(60);
    expect([it.w, it.h]).toEqual([4, 2]);
    /* 中心不動 */
    expect([it.x + it.w / 2, it.y + it.h / 2]).toEqual([3, 4]);
    rotateItem(it, -60);
    expect(it).toMatchObject({ rot: 0, x: 2, y: 2, w: 2, h: 4 });
    /* 轉 24 次 15° 回到原樣 */
    for (let k = 0; k < 24; k++) rotateItem(it, 15);
    expect(it).toMatchObject({ rot: 0, x: 2, y: 2, w: 2, h: 4 });
  });

  it('轉過的範圍與點選：45° 的 2 × 1 格家具外接範圍約 2.12 格見方；角落點不到', () => {
    const it = item('i', 'table', 0, 0, 2, 1, 45);
    const b = itemFootprint(it);
    expect(b.w).toBeCloseTo(2.1213, 3);
    expect(b.h).toBeCloseTo(2.1213, 3);
    expect(itemHasPoint(it, 1, 0.5)).toBe(true);
    expect(itemHasPoint(it, 0.02, 0.02)).toBe(false);
    /* 90° 的倍數就是外框 */
    expect(itemFootprint(item('k', 'table', 1, 2, 3, 4, 90))).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('讀檔：任何整數度照讀；原作（くま。）的地圖檔只認 90° 的倍數', () => {
    const raw = {
      floors: [{ items: [{ t: 'chair', x: 0, y: 0, w: 1, h: 1, rot: 375.4 }] }],
    };
    expect(normalizeProject(raw, isAsset)?.floors[0].items[0].rot).toBe(15);
    const legacy = { app: 'indoor-map-maker', ...raw };
    expect(normalizeProject(legacy, isAsset)?.floors[0].items[0].rot).toBe(0);
  });
});

/* ---------- 圓形配置（F279） ---------- */

describe('圓形配置（F279）', () => {
  const ringFloor = () =>
    floorOf({
      rooms: [room('hall', 0, 0, 16, 16)],
      items: [item('tbl', 'table_round', 7, 7, 1.8, 1.8), item('ch', 'chair', 7.4, 4, 1, 1)],
    });

  it('6 個一圈：圍著最近的圓桌、等間隔、朝著圓心（rot＝角度＋90°）、都在房間裡而且不重疊', () => {
    const f = ringFloor();
    const r = arrangeRing(f, 'ch', 6);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(6);
    expect(r.items[0].id).toBe('ch');
    const cx = 7.9;
    const cy = 7.9;
    const radii = r.items.map((it) => Math.hypot(it.x + it.w / 2 - cx, it.y + it.h / 2 - cy));
    for (const d of radii) expect(Math.abs(d - radii[0])).toBeLessThan(0.02);
    /* 半徑至少圓桌的一半＋椅子深度的一半＋0.36 */
    expect(radii[0]).toBeGreaterThanOrEqual(0.9 + 0.5 + 0.36 - 0.01);
    for (const it of r.items) {
      const ang = (Math.atan2(it.y + it.h / 2 - cy, it.x + it.w / 2 - cx) * 180) / Math.PI;
      const expected = (((Math.round(ang + 90) % 360) + 360) % 360) % 360;
      expect(it.rot).toBe(expected);
      expect(it.ring).toBe(r.ring);
      for (const p of itemCorners(it)) expect(roomHasPointClosed(f.rooms[0], p.x, p.y)).toBe(true);
    }
    const corners = r.items.map(itemCorners);
    for (let a = 0; a < corners.length; a++)
      for (let b = a + 1; b < corners.length; b++)
        expect(cornersOverlap(corners[a], corners[b])).toBe(false);
  });

  it('整圈換成 8 個（舊的成員拿掉）、內外反轉（每一件轉 180°）、單獨移動的離開群組', () => {
    const f = ringFloor();
    const six = arrangeRing(f, 'ch', 6);
    if (!six.ok) throw new Error('6');
    f.items = f.items.filter((it) => it.id !== 'ch').concat(six.items);
    expect(ringMembers(f, six.items[2])).toHaveLength(6);
    const eight = arrangeRing(f, six.items[2].id, 8);
    if (!eight.ok) throw new Error('8');
    expect(eight.remove).toHaveLength(5);
    expect(eight.items).toHaveLength(8);
    expect(eight.ring).toBe(six.ring);
    const flips = flipRing(f, 'ch');
    expect(flips.size).toBe(6);
    for (const it of six.items) expect(flips.get(it.id)).toBe((it.rot + 180) % 360);
    /* 只動其中兩件：那兩件離開；整圈一起動：不離開 */
    expect(partialRingIds(f, new Set([six.items[0].id, six.items[1].id]))).toHaveLength(2);
    expect(partialRingIds(f, new Set(six.items.map((it) => it.id)))).toEqual([]);
  });

  it('放不下時不改（房間太小）；放著小物的桌子不能排', () => {
    const small = floorOf({
      rooms: [room('r', 0, 0, 4, 4)],
      items: [item('t', 'table_round', 1.1, 1.1, 1.8, 1.8), item('c', 'chair', 1.5, 0.05, 1, 1)],
    });
    expect(arrangeRing(small, 'c', 8)).toEqual({ ok: false, reason: 'space' });
    const desk = floorOf({
      rooms: [room('r', 0, 0, 16, 16)],
      items: [item('d', 'desk', 4, 4, 2.4, 1.2), item('p', 'memo', 4.8, 4.3, 0.6, 0.6)],
    });
    expect(arrangeRing(desk, 'd', 6)).toEqual({ ok: false, reason: 'tabletop' });
  });

  it('沒有圓心的家具：以房間的中心排', () => {
    const f = floorOf({
      rooms: [room('r', 0, 0, 12, 12)],
      items: [item('c', 'chair', 5.5, 2, 1, 1)],
    });
    const r = arrangeRing(f, 'c', 6);
    if (!r.ok) throw new Error('ring');
    for (const it of r.items)
      expect(Math.hypot(it.x + it.w / 2 - 6, it.y + it.h / 2 - 6)).toBeCloseTo(3.5, 1);
  });
});

/* ---------- 內裝預設（F275） ---------- */

describe('內裝預設（F275）', () => {
  it('七種都在夠大的房間裡放得下：家具都在房間裡、不重疊、不擋門；換掉原本的家具，貼牆素材與隱藏線索留著', () => {
    for (const preset of FURNISH_PRESETS) {
      const f = floorOf({
        rooms: [room('r', 0, 0, 12, 10)],
        openings: [{ id: 'd', kind: 'door', o: 'h', x: 5, y: 10, len: 1.5, side: -1, hinge: 0 }],
        items: [
          item('old', 'bed_single', 1, 1, 2, 4),
          { ...item('clue', 'diary', 10, 7, 0.8, 0.8), clue: true },
          item('crack', 'crack_wall', 4, -0.4, 3, 0.8),
        ],
      });
      const r = furnishRoom(f, 'r', preset.id);
      expect(r.ok, preset.id).toBe(true);
      if (!r.ok) continue;
      expect(r.remove).toEqual(['old']);
      expect(r.dropped, preset.id).toBe(0);
      const items = f.items.filter((it) => it.id !== 'old').concat(r.add);
      for (const it of r.add) {
        for (const p of itemCorners(it))
          expect(roomHasPointClosed(f.rooms[0], p.x, p.y), `${preset.id} ${it.t}`).toBe(true);
        if (blocking(it)) expect(hitsDoor(f.openings[0], it), `${preset.id} ${it.t}`).toBe(false);
      }
      const solid = items.filter((it) => blocking(it) && it.t !== 'crack_wall');
      for (let a = 0; a < solid.length; a++)
        for (let b = a + 1; b < solid.length; b++) {
          const A = solid[a];
          const B = solid[b];
          const ov =
            Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > 1e-6 &&
            Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 1e-6;
          /* 桌上的小物（燭台、檯燈、顯微鏡）放在桌面上 */
          const small = ['candle', 'desk_lamp', 'microscope'];
          if (ov && !small.includes(A.t) && !small.includes(B.t))
            throw new Error(`${preset.id}：${A.t} 和 ${B.t} 疊在一起`);
        }
      /* 線索沒有動 */
      expect(items.find((it) => it.id === 'clue')).toMatchObject({ x: 10, y: 7 });
    }
  });

  it('房間不夠大時少放幾件；太小時整個不改；水邊、道路不能用', () => {
    const mid = floorOf({ rooms: [room('r', 0, 0, 6, 6)] });
    const r = furnishRoom(mid, 'r', 'study');
    expect(r.ok).toBe(true);
    const tiny = floorOf({
      rooms: [room('r', 0, 0, 2, 2)],
      items: [item('a', 'chair', 0.5, 0.5, 1, 1)],
    });
    expect(furnishRoom(tiny, 'r', 'lab')).toEqual({ ok: false, reason: 'full' });
    const pond = floorOf({ rooms: [room('r', 0, 0, 10, 10, { cat: 'water' })] });
    expect(furnishRoom(pond, 'r', 'study')).toEqual({ ok: false, reason: 'kind' });
  });
});

/* ---------- 夜的暗度與光源（F273、F274） ---------- */

describe('夜的暗度與光源（F273、F274）', () => {
  /* 兩間相鄰的房間：A 有燭台；A 裡面巢狀的小房間 N */
  const nightFloor = (): Floor =>
    floorOf({
      rooms: [room('A', 0, 0, 10, 8), room('B', 10, 0, 8, 8), room('N', 6, 4, 3, 3)],
      items: [item('c', 'candle', 4.6, 2.6, 0.8, 0.8)],
    });

  it('光只照亮所在的房間：隔壁的房間、巢狀的房間照樣是夜色', () => {
    const f = visibleFloor(nightFloor(), false);
    const lights = lightsOf(f);
    expect(lights).toHaveLength(1);
    expect(lights[0].rooms).toEqual(['A']);
    expect(darknessAt(f, 0.6, 5, 3)).toBeLessThan(0.6 * 0.2);
    /* 牆的另一邊（B，離燭台 5.5 格以內）照樣全暗 */
    expect(darknessAt(f, 0.6, 10.5, 3)).toBe(0.6);
    /* 巢狀的房間 N（離燭台約 2.5 格） */
    expect(darknessAt(f, 0.6, 6.5, 4.5)).toBe(0.6);
    /* 房間外面不蓋夜色 */
    expect(darknessAt(f, 0.6, -2, -2)).toBe(0);
  });

  it('窗照亮牆兩側的房間（月光）；封住的窗不亮；家具放大時光圈跟著變大', () => {
    const f = floorOf({
      rooms: [room('A', 0, 0, 8, 8), room('B', 8, 0, 8, 8)],
      openings: [
        { id: 'w', kind: 'window', o: 'v', x: 8, y: 3, len: 2, side: 1, hinge: 0 },
        { id: 'p', kind: 'platewin', o: 'h', x: 2, y: 0, len: 2, side: 1, hinge: 0 },
      ],
      items: [item('s', 'candle', 2, 5, 0.8, 0.8), item('b', 'candle', 12, 5, 1.6, 1.6)],
    });
    const lights = lightsOf(visibleFloor(f, false));
    const win = lights.find((l) => l.tone === 'moon');
    expect(win?.rooms.sort()).toEqual(['A', 'B']);
    expect(lights.filter((l) => l.tone === 'moon')).toHaveLength(1);
    const [small, big] = lights.filter((l) => l.tone === 'fire');
    expect(big.r / small.r).toBeCloseTo(2, 5);
  });

  it('PL 用：GM 專用的光源、GM 專用房間裡的光源都不亮，蓋灰的 GM 房間不被照亮；藏起來的線索也不亮', () => {
    const f = floorOf({
      rooms: [room('A', 0, 0, 10, 8), room('S', 10, 0, 6, 8, { gm: true })],
      openings: [{ id: 'w', kind: 'window', o: 'v', x: 10, y: 3, len: 2, side: 1, hinge: 0 }],
      items: [
        { ...item('g', 'candle', 2, 2, 0.8, 0.8), gm: true },
        item('s', 'magic_circle', 11, 2, 5, 5),
        { ...item('k', 'desk_lamp', 6, 6, 0.7, 0.7), clue: true },
      ],
    });
    expect(lightsOf(visibleFloor(f, false))).toHaveLength(4);
    const pl = lightsOf(visibleFloor(f, true));
    expect(pl.map((l) => l.tone)).toEqual(['fire', 'moon']);
    /* 窗的光只照 PL 看得到的那一間 */
    expect(pl.find((l) => l.tone === 'moon')?.rooms).toEqual(['A']);
    expect(lightsOf(visibleFloor(f, true, true)).map((l) => l.tone)).toEqual(['moon']);
  });

  it('專案檔：5%～85%、0 以下不寫；匯出的選項帶著暗度；沒有暗度時匯出的指令和以前一樣（render-hash 測試）', () => {
    const n = (v: unknown) => normalizeProject({ floors: [], night: v }, isAsset)?.night;
    expect([n(0.3), n(0.01), n(2), n(0), n(-1), n('0.45'), n('x')]).toEqual([
      0.3,
      0.05,
      0.85,
      undefined,
      undefined,
      0.45,
      undefined,
    ]);
    const p = project([nightFloor()], { night: 0.5 });
    const exp: ExportSettings = {
      range: 'current',
      view: 'pl',
      clues: 'show',
      px: 24,
      grid: false,
      transparent: true,
    };
    expect(exportOptions(p, exp, 'clean', 24).night).toBe(0.5);
    expect(exportOptions(project([nightFloor()]), exp, 'clean', 24)).not.toHaveProperty('night');
  });

  it('畫法：夜色只畫在房間的範圍（另一張畫布貼回去），每個光源各一個光暈；透明背景照樣畫', () => {
    const restore = installRecordingDocument();
    try {
      const p = project([nightFloor()], { night: 0.5 });
      const exp: ExportSettings = {
        range: 'current',
        view: 'gm',
        clues: 'show',
        px: 24,
        grid: false,
        transparent: true,
      };
      const opts = exportOptions(p, exp, 'clean', 24);
      const a = renderImage(p.floors, opts) as unknown as RecordingCanvas;
      const b = renderImage(
        project([nightFloor()]).floors,
        exportOptions(project([nightFloor()]), exp, 'clean', 24),
      ) as unknown as RecordingCanvas;
      expect(a.hash).not.toBe(b.hash);
      expect(a.calls).toBeGreaterThan(b.calls);
      /* 範圍和沒有夜色時一樣 */
      const L = exportLayout(p.floors, opts);
      expect([L.pxWidth, L.pxHeight]).toEqual([a.width, a.height]);
    } finally {
      restore();
    }
  });
});

/* ---------- 自由線（F285、F286） ---------- */

describe('自由線（F285、F286）', () => {
  const line = (patch: Partial<FreeLine> = {}): FreeLine => ({
    id: 'l',
    kind: 'rail',
    x1: 0,
    y1: 0,
    cx: 2,
    cy: 2,
    x2: 4,
    y2: 0,
    ...patch,
  });

  it('中間的控制點在曲線的正中間；拖它＝曲線通過那一點', () => {
    const l = line();
    expect(lineMid(l)).toEqual({ x: 2, y: 1 });
    const c = bendTo(l, { x: 2, y: 3 });
    expect(lineMid({ ...l, cx: c.x, cy: c.y })).toEqual({ x: 2, y: 3 });
    expect(lineDistance(l, 2, 1)).toBeCloseTo(0, 3);
    expect(lineDistance(l, 2, -1)).toBeGreaterThan(1.9);
  });

  it('範圍、反轉（反兩次回到原樣）、房間裡的東西（兩端都在房間裡）', () => {
    const b = lineBounds(line());
    expect(b.x).toBeLessThan(0);
    expect(b.y + b.h).toBeGreaterThan(1);
    const l = line({ cx: 1, cy: 3 });
    flipLine(l, 'x');
    expect(l).toMatchObject({ x1: 4, x2: 0, cx: 3 });
    flipLine(l, 'x');
    expect(l).toEqual(line({ cx: 1, cy: 3 }));
    const f = floorOf({ rooms: [room('r', -1, -1, 6, 6)], lines: [line()] });
    expect(roomContents(f, f.rooms[0])).toContainEqual({ type: 'line', id: 'l' });
    expect(countRefs([{ type: 'line', id: 'l' }])).toMatchObject({ line: 1, item: 0 });
    expect(countRefs([])).not.toHaveProperty('line');
  });

  it('PL 檢視與 PL 用連結：GM 專用的線、GM 專用房間裡的線拿掉', () => {
    const f = floorOf({
      rooms: [room('g', 10, 0, 6, 6, { gm: true })],
      lines: [
        line(),
        line({ id: 'gm', gm: true }),
        line({ id: 'in', x1: 11, y1: 2, x2: 14, y2: 2, cx: 12, cy: 3 }),
      ],
    });
    expect(visibleFloor(f, true).lines?.map((l) => l.id)).toEqual(['l']);
    const pl = playerProject(project([f])).project;
    expect(pl.floors[0].lines?.map((l) => l.kind)).toEqual(['rail']);
    expect(pl.floors[0].lines?.[0]).not.toHaveProperty('gm');
  });

  it('範圍：匯出的外接範圍算進曲線', () => {
    const f = floorOf({ lines: [line({ cy: 10 })] });
    const b = floorBounds(f);
    expect(b?.h).toBeGreaterThan(4.9);
  });
});

/* ---------- 專案檔版本 8、分享連結（F287） ---------- */

describe('專案檔版本 8、分享連結（F287）', () => {
  const full = (): Project =>
    project(
      [
        floorOf({
          rooms: [
            room('a', 0, 0, 10, 8, { floor: 'carpet' }),
            room('b', 10, 0, 6, 8, { floor: 'water' }),
          ],
          items: [
            { ...item('i', 'chair', 2, 2, 1, 1, 30), ring: 'g1' },
            item('m', 'mast', 4, 4, 4, 1.6),
          ],
          lines: [
            { id: 'l', kind: 'arrow', x1: 1, y1: 1, cx: 3, cy: 0, x2: 5, y2: 1, w: 1.5 },
            { id: 'k', kind: 'rope', x1: 1, y1: 5, cx: 2, cy: 6, x2: 3, y2: 5, gm: true },
          ],
        }),
      ],
      { night: 0.4 },
    );

  it('整理：新的欄位照讀、不認得的拿掉；沒有自由線時不寫 lines', () => {
    const p = normalizeProject(full(), isAsset) as Project;
    expect(p.night).toBe(0.4);
    expect(p.floors[0].rooms.map((r) => r.floor)).toEqual(['carpet', 'water']);
    expect(p.floors[0].items[0]).toMatchObject({ rot: 30, ring: 'g1' });
    expect(p.floors[0].lines).toHaveLength(2);
    const odd = normalizeProject(
      {
        floors: [
          {
            rooms: [{ ...room('a', 0, 0, 4, 4), floor: 'lava' }],
            lines: [
              { kind: 'zigzag', x1: 0, y1: 0, x2: 2, y2: 0, w: 9 },
              { kind: 'wall', x1: 'a', y1: 0, x2: 2, y2: 0 },
            ],
          },
          { rooms: [] },
        ],
      },
      isAsset,
    ) as Project;
    expect(odd.floors[0].rooms[0]).not.toHaveProperty('floor');
    expect(odd.floors[0].lines).toEqual([
      expect.objectContaining({ kind: 'rail', cx: 1, cy: 0, w: 3 }),
    ]);
    expect(odd.floors[1]).not.toHaveProperty('lines');
  });

  it('分享連結：完整連結往返相同；PL 用連結拿掉 GM 專用的線、帶著夜的暗度；沒有新功能時連結的內容和以前一樣（沒有新的鍵）', () => {
    const p = normalizeProject(full(), isAsset) as Project;
    const back = readMapHash(encodeMapHash(p, 'full').hash);
    if (back.kind !== 'ok') throw new Error('link');
    const q = normalizeProject(back.raw, isAsset) as Project;
    const noIds = (x: Project) =>
      JSON.parse(JSON.stringify(x, (k, v) => (k === 'id' ? undefined : v)));
    expect(noIds(q)).toEqual(noIds(p));
    const pl = readMapHash(encodeMapHash(p, 'pl').hash);
    if (pl.kind !== 'ok') throw new Error('pl');
    const plp = normalizeProject(pl.raw, isAsset) as Project;
    expect(plp.night).toBe(0.4);
    expect(plp.floors[0].lines?.map((l) => l.kind)).toEqual(['arrow']);
    /* 沒有用到新功能的地圖：連結裡沒有新的鍵 */
    for (const t of TEMPLATES.slice(0, 12)) {
      const packed = JSON.stringify(packProject(project(instantiateTemplate(t.id) ?? [])));
      for (const k of ['"night"', '"lines"', '"ring"', '"floor"'])
        expect(packed, t.id).not.toContain(k);
    }
  });

  it('揭露用的檔名（F284）', () => {
    const p = project([floorOf({ rooms: [room('a', 0, 0, 4, 4)] })]);
    const exp: ExportSettings = {
      range: 'current',
      view: 'reveal',
      clues: 'show',
      px: 24,
      grid: false,
      transparent: false,
    };
    expect(exportFileName(p, exp, null)).toBe('測試_揭露.png');
    const o = exportOptions(p, exp, 'clean', 24);
    expect(o.reveal).toBe(true);
    expect(o.playerView).toBe(false);
    expect(o.gmBadge).toBeNull();
  });
});

/* ---------- 家具的倍率（F278） ---------- */

describe('家具的倍率（F278）', () => {
  it('在自己的座標系裡等比例；細角度時外框照最接近的 90°', () => {
    const it = item('i', 'sofa2', 0, 0, 1.8, 3.2, 90);
    expect(itemLocalSize(it)).toEqual({ w: 3.2, h: 1.8 });
  });
});
