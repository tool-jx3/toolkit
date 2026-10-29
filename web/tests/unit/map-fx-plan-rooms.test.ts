/**
 * 地圖演出產生器：平面圖產生器送來的房間範圍（2026-10-29，F85）與 L 形的房間遮罩（F86）——
 * 房間 → 房間遮罩（照新畫的框的預設、GM 專用的一直蓋著不寫房名、換算成這張圖的 px、框的上限）、
 * 缺角（外框的比例）的整理與跟著外框縮放、最大的那一塊、外形、拆成兩塊（進階 3D）、畫面（缺角裡露出地圖、邊界演出不畫進缺角、
 * ZIP 的單張缺角透明）、專案檔照讀。規格 docs/refactor/specs/map-fx.md 1.14、3.13。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { HandoffRooms } from '@/core/handoff';
import { RenderCache as FxCache, LIMITS } from '@/core/imagefx';
import { drawRoomMask } from '@/tools/map-fx/exporter';
import {
  applyRect,
  CUT_MAX,
  CUT_MIN,
  cutFromPx,
  defaultCut,
  duplicateFrame,
  type Frame,
  initialDefaults,
  initialState,
  type MapState,
  makeFrame,
  maskMainRect,
  maskPieces,
  maskPolygon,
  masksFromPlan,
  normalizeCut,
  normalizeState,
  type RedactFrame,
  timelineOf,
} from '@/tools/map-fx/model';
import { RenderCache, renderToCanvas } from '@/tools/map-fx/render';
import { docNow, edit, resetAll, roomsFromRedacts } from '@/tools/map-fx/store';
import { nodeCanvas } from '../helpers/nodeCanvas';

const d = initialDefaults();
let seq = 0;
const ids = () => `m${++seq}`;

const plan: HandoffRooms = {
  width: 600,
  height: 400,
  list: [
    { name: '客廳', x: 48, y: 48, w: 288, h: 240, cut: { c: 'ne', w: 120, h: 96 } },
    { name: '書房', x: 216, y: 48, w: 120, h: 96 },
    { name: '密室', x: 336, y: 48, w: 144, h: 240, gm: true },
  ],
};

describe('平面圖送來的房間 → 房間遮罩（F85）', () => {
  it('照新畫的框的預設；房名＝房間的名字；範圍照原圖 px、L 形的缺角換成外框的比例；GM 專用的一直蓋著、濃度 100%、不寫房名', () => {
    const r = masksFromPlan(plan, { width: 600, height: 400 }, d.redact, ids);
    expect(r.total).toBe(3);
    expect(r.frames.map((f) => [f.label, f.x, f.y, f.w, f.h, f.cut ?? null])).toEqual([
      ['客廳', 48, 48, 288, 240, { c: 'ne', w: 120 / 288, h: 96 / 240 }],
      ['書房', 216, 48, 120, 96, null],
      ['', 336, 48, 144, 240, null],
    ]);
    const [living, , secret] = r.frames;
    expect(living).toMatchObject({ kind: 'redact', style: 'dark', mode: 'reveal', dir: 'fade' });
    expect(secret).toMatchObject({ style: 'dark', mode: 'static', density: 100 });
    expect(new Set(r.frames.map((f) => f.id)).size).toBe(3);
  });

  it('預設是迷霧或馬賽克時，GM 專用的房間改成黑暗（看得出底下）；禁止進入照用', () => {
    for (const [style, want] of [
      ['fog', 'dark'],
      ['mosaic', 'dark'],
      ['keepout', 'keepout'],
    ] as const) {
      const r = masksFromPlan(plan, { width: 600, height: 400 }, { ...d.redact, style }, ids);
      expect(r.frames[0].style).toBe(style);
      expect(r.frames[2].style).toBe(want);
    }
  });

  it('圖的大小和送來的不同時照比例換算（缺角也是）；超出圖的夾進來', () => {
    const r = masksFromPlan(plan, { width: 300, height: 200 }, d.redact, ids);
    expect(r.frames[0]).toMatchObject({
      x: 24,
      y: 24,
      w: 144,
      h: 120,
      cut: { c: 'ne', w: 120 / 288, h: 0.4 },
    });
    const out = masksFromPlan(
      { width: 100, height: 100, list: [{ name: 'a', x: 90, y: 90, w: 40, h: 40 }] },
      { width: 100, height: 100 },
      d.redact,
      ids,
    );
    expect(out.frames[0]).toMatchObject({ x: 60, y: 60, w: 40, h: 40 });
  });

  it('框的上限：最多做到 room 個，total 是全部的房間數', () => {
    const many: HandoffRooms = {
      width: 1000,
      height: 1000,
      list: Array.from({ length: 70 }, (_, i) => ({
        name: `房${i}`,
        x: (i % 10) * 100,
        y: Math.floor(i / 10) * 100,
        w: 100,
        h: 100,
      })),
    };
    const r = masksFromPlan(many, { width: 1000, height: 1000 }, d.redact, ids);
    expect(r.total).toBe(70);
    expect(r.frames).toHaveLength(LIMITS.frames);
    expect(r.frames.at(-1)?.label).toBe('房59');
    expect(
      masksFromPlan(many, { width: 1000, height: 1000 }, d.redact, ids, 5).frames,
    ).toHaveLength(5);
  });
});

describe('L 形的房間遮罩（F86）', () => {
  const L = (): RedactFrame => ({
    ...(makeFrame('redact', { x: 100, y: 100, w: 300, h: 200 }, d, 'L') as RedactFrame),
    cut: { c: 'ne', w: 0.4, h: 0.4 },
  });

  it('整理：角看不懂、比例不是 0～1 之間的數字時拿掉（＝長方形）；太靠近 0、1 的夾到 1%～99%；存檔照讀', () => {
    expect(normalizeCut({ c: 'ne', w: 0.4, h: 0.25 })).toEqual({ c: 'ne', w: 0.4, h: 0.25 });
    expect(normalizeCut({ c: 'nw', w: 0.999, h: 0.0001 })).toEqual({
      c: 'nw',
      w: CUT_MAX,
      h: CUT_MIN,
    });
    expect(normalizeCut({ c: 'ne', w: 0.4, h: '0.4' })).toBeNull();
    expect(normalizeCut({ c: 'up', w: 0.4, h: 0.4 })).toBeNull();
    expect(normalizeCut({ c: 'se', w: 0, h: 0.4 })).toBeNull();
    expect(normalizeCut({ c: 'se', w: 1, h: 0.4 })).toBeNull();
    expect(normalizeCut({ c: 'se', w: 120, h: 80 })).toBeNull();
    expect(normalizeCut(null)).toBeNull();
    expect(cutFromPx('sw', 120, 80, 300, 200)).toEqual({ c: 'sw', w: 0.4, h: 0.4 });
    expect(cutFromPx('sw', 300, 80, 300, 200)).toBeNull();
    expect(cutFromPx('sw', 0, 80, 300, 200)).toBeNull();
    const s = normalizeState({
      ...initialState(),
      image: { id: 'i', name: 'm.png', width: 600, height: 400 },
      frames: [L(), { ...L(), id: 'R', cut: { c: 'zz', w: 0.5, h: 0.5 } }],
    });
    expect((s.frames[0] as RedactFrame).cut).toEqual({ c: 'ne', w: 0.4, h: 0.4 });
    expect('cut' in s.frames[1]).toBe(false);
    /* 新畫的框是長方形；形狀改成 L 形時缺角是外框的一半 */
    expect('cut' in makeFrame('redact', { x: 0, y: 0, w: 50, h: 50 }, d, 'n')).toBe(false);
    expect(defaultCut('sw')).toEqual({ c: 'sw', w: 0.5, h: 0.5 });
  });

  it('外框改大小、移動、複製時缺角的比例不變（一步一步拖也不走樣）', () => {
    const f = L();
    for (let w = 301; w <= 600; w++) applyRect(f, { x: 100, y: 100, w, h: 200 });
    expect(f.cut).toEqual({ c: 'ne', w: 0.4, h: 0.4 });
    /* 600 × 200 的 40%：缺角 240 × 80；整列（下面 600 × 120）和整欄（左邊 360 × 200）一樣大，取整列 */
    expect(maskPieces(f)).toEqual([
      { x: 100, y: 180, w: 600, h: 120 },
      { x: 100, y: 100, w: 360, h: 80 },
    ]);
    const copy = duplicateFrame(f, { width: 1000, height: 1000 }, 'c') as RedactFrame;
    expect(copy.cut).toEqual({ c: 'ne', w: 0.4, h: 0.4 });
  });

  it('外形 6 點、最大的那一塊（「？」與房名）、拆成兩塊；畫面上照外框的比例換算（框跟著放大時）', () => {
    const f = { ...L(), cut: { c: 'ne' as const, w: 0.4, h: 0.4 } };
    const box = { x: 100, y: 100, w: 300, h: 200 };
    expect(maskPolygon(f, box)).toEqual([
      [100, 100],
      [280, 100],
      [280, 180],
      [400, 180],
      [400, 300],
      [100, 300],
    ]);
    /* 整列（下面 300 × 120）和整欄（左邊 180 × 200）一樣大：取整列；另一塊在缺角的左邊 */
    expect(maskMainRect(f, box)).toEqual({ x: 100, y: 180, w: 300, h: 120 });
    expect(maskPieces(f)).toEqual([
      { x: 100, y: 180, w: 300, h: 120 },
      { x: 100, y: 100, w: 180, h: 80 },
    ]);
    /* 缺角深一點：整欄比較大，另一塊在缺角的下面 */
    const deep = { ...f, cut: { c: 'ne' as const, w: 0.4, h: 0.5 } };
    expect(maskMainRect(deep, box)).toEqual({ x: 100, y: 100, w: 180, h: 200 });
    expect(maskPieces(deep)).toEqual([
      { x: 100, y: 100, w: 180, h: 200 },
      { x: 280, y: 200, w: 120, h: 100 },
    ]);
    const wide = { ...f, cut: { c: 'sw' as const, w: 0.2, h: 0.75 } };
    expect(maskMainRect(wide, box)).toEqual({ x: 160, y: 100, w: 240, h: 200 });
    expect(maskPieces(wide)).toEqual([
      { x: 160, y: 100, w: 240, h: 200 },
      { x: 100, y: 100, w: 60, h: 50 },
    ]);
    /* 畫面上放大一倍 */
    expect(maskPolygon(f, { x: 0, y: 0, w: 600, h: 400 })[2]).toEqual([360, 160]);
    /* 長方形 */
    const rect = { ...f, cut: undefined };
    expect(maskPolygon(rect, box)).toHaveLength(4);
    expect(maskMainRect(rect, box)).toBe(box);
    expect(maskPieces(rect)).toEqual([box]);
  });

  describe('進階 3D 的「從房間遮罩建立」', () => {
    beforeEach(() => {
      resetAll({ ...initialState(), image: { id: 'img', name: 'm.png', width: 600, height: 400 } });
    });

    it('L 形的遮罩拆成兩個長方形的房間：最大的那一塊寫房名，另一塊不寫', () => {
      edit((s) => {
        s.frames = [{ ...L(), label: '客廳' }];
      });
      expect(roomsFromRedacts()).toBe(2);
      expect(docNow().walk.rooms.map((r) => [r.name, r.x, r.y, r.w, r.h])).toEqual([
        ['客廳', 100, 180, 300, 120],
        ['', 100, 100, 180, 80],
      ]);
      /* 再按一次：範圍相同的不重複加 */
      expect(roomsFromRedacts()).toBe(0);
    });
  });
});

/* ---------- 畫面（node-canvas；沒裝時跳過） ---------- */

const nc = await nodeCanvas();
type Img = OffscreenCanvas;
type G = OffscreenCanvasRenderingContext2D;
const GRAY = [200, 200, 200, 255];

function mapImage(): Img {
  const c = nc?.createCanvas(600, 400) as Img;
  const g = c.getContext('2d') as G;
  g.fillStyle = 'rgb(200, 200, 200)';
  g.fillRect(0, 0, 600, 400);
  return c;
}

function state(frames: Frame[]): MapState {
  const s = initialState();
  s.canvas = 'original';
  s.bg.mode = 'transparent';
  s.shot = { scale: 100, radius: 0, shadow: 0, spotlight: 0 };
  s.image = { id: 'img', name: 'map.png', width: 600, height: 400 };
  s.timing = { intro: 0, popup: 0, action: 1, outro: 1, order: 'sequential', fps: 15 };
  s.frames = frames;
  return s;
}

const rgba = (c: Img, x: number, y: number) =>
  Array.from((c.getContext('2d') as G).getImageData(Math.round(x), Math.round(y), 1, 1).data);
const render = (s: MapState, img: Img, t: number) =>
  renderToCanvas({ state: s, image: img }, t, new RenderCache()) as Img;

const lMask = (o: Partial<RedactFrame> = {}): RedactFrame => ({
  ...(makeFrame('redact', { x: 100, y: 100, w: 300, h: 200 }, d, 'L') as RedactFrame),
  cut: { c: 'ne', w: 0.4, h: 0.4 },
  ...o,
});

describe.runIf(nc)('L 形的房間遮罩的畫面（F86）', () => {
  it('四種樣子：L 形裡蓋著、缺角裡露出地圖', () => {
    const img = mapImage();
    for (const style of ['dark', 'keepout', 'fog', 'mosaic'] as const) {
      const c = render(state([lMask({ style, mode: 'static', label: '客廳' })]), img, 0);
      /* 缺角（右上 120 × 80）裡是地圖 */
      expect(rgba(c, 390, 110), style).toEqual(GRAY);
      expect(rgba(c, 300, 170), style).toEqual(GRAY);
      /* L 形裡不是地圖（馬賽克在單色的地圖上還是同一個顏色：看房名的牌子，在最大的那一塊〔下面的整列〕的中間） */
      if (style !== 'mosaic') {
        expect(rgba(c, 110, 290), style).not.toEqual(GRAY);
        expect(rgba(c, 390, 290), style).not.toEqual(GRAY);
      }
      expect(rgba(c, 250, 240), style).not.toEqual(GRAY);
    }
  });

  it('由左往右掃描＋金光：移動中的邊不畫進缺角；長方形的框照舊畫滿整個高度', () => {
    const img = mapImage();
    const f = lMask({ mode: 'reveal', dir: 'h', edge: 'glow', glow: 100 });
    const s = state([f]);
    const w = timelineOf(s).windows[f.id];
    /* 邊走到 x≈340（缺角的中間） */
    const t = w.start + (w.end - w.start) * 0.5;
    const c = render(s, img, t);
    let gold = 0;
    for (let y = 102; y < 178; y += 2) {
      const p = rgba(c, 340, y);
      if (p[0] !== 200 || p[1] !== 200 || p[2] !== 200) gold++;
    }
    expect(gold).toBe(0);
    const rect = state([{ ...f, cut: undefined }]);
    const r = render(rect, img, t);
    let lit = 0;
    for (let y = 102; y < 178; y += 2) {
      const p = rgba(r, 340, y);
      if (p[0] !== 200 || p[1] !== 200 || p[2] !== 200) lit++;
    }
    expect(lit).toBeGreaterThan(20);
  });

  it('房間遮罩 ZIP 的單張：缺角是透明的、L 形裡蓋滿', () => {
    const img = mapImage();
    const room = lMask({ style: 'dark', mode: 'reveal', label: '客廳' });
    const s = state([room]);
    const c = nc?.createCanvas(600, 400) as Img;
    drawRoomMask(c.getContext('2d') as G, s, img, room, new FxCache());
    expect(rgba(c, 390, 110)[3]).toBe(0);
    expect(rgba(c, 105, 105)[3]).toBe(255);
    expect(rgba(c, 395, 295)[3]).toBe(255);
  });
});
