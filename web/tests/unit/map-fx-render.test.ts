/**
 * 地圖演出產生器的畫面（node-canvas；沒裝時跳過）：遮罩的淡出與掃描、路線一路畫過去、圖釘、危險區、
 * 房間遮罩 ZIP 的單張遮罩（地圖大小、房間外透明）、框上的文字。規格 3.6～3.9。
 */
import { describe, expect, it } from 'vitest';
import { RenderCache as FxCache } from '@/core/imagefx';
import { drawRoomMask } from '@/tools/map-fx/exporter';
import {
  type Frame,
  initialDefaults,
  initialState,
  type MapState,
  makeFrame,
  type RedactFrame,
  type RouteFrame,
  timelineOf,
} from '@/tools/map-fx/model';
import { frameText, MAP_COLORS, RenderCache, renderToCanvas } from '@/tools/map-fx/render';
import { nodeCanvas } from '../helpers/nodeCanvas';

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

const d = initialDefaults();
const mask = (o: Partial<RedactFrame>): RedactFrame =>
  ({ ...makeFrame('redact', { x: 100, y: 100, w: 200, h: 100 }, d, 'm'), ...o }) as RedactFrame;
const rt = (o: Partial<RouteFrame>): RouteFrame =>
  ({ ...makeFrame('route', { x: 50, y: 50, w: 400, h: 100 }, d, 'r'), ...o }) as RouteFrame;

describe.runIf(nc)('房間遮罩', () => {
  it('黑暗＋淡出揭開：動作前全黑、一半時半透明、結束後露出地圖', () => {
    const img = mapImage();
    const s = state([mask({ style: 'dark', mode: 'reveal', dir: 'fade' })]);
    const corner = [110, 110] as const;
    const before = rgba(render(s, img, 0), ...corner);
    expect(before.slice(0, 3).every((v) => v < 20)).toBe(true);
    const mid = rgba(render(s, img, 0.5), ...corner);
    expect(mid[0]).toBeGreaterThan(60);
    expect(mid[0]).toBeLessThan(160);
    expect(rgba(render(s, img, timelineOf(s).total), ...corner)).toEqual(GRAY);
  });

  it('由左往右掃描：一半時左邊露出、右邊還蓋著；蓋上＋淡出相反', () => {
    const img = mapImage();
    const s = state([mask({ style: 'dark', mode: 'reveal', dir: 'h', edge: 'none' })]);
    const c = render(s, img, 0.5);
    expect(rgba(c, 110, 190)).toEqual(GRAY);
    expect(rgba(c, 290, 190)[0]).toBeLessThan(20);
    const s2 = state([mask({ style: 'dark', mode: 'conceal', dir: 'fade' })]);
    expect(rgba(render(s2, img, 0), 110, 110)).toEqual(GRAY);
    expect(rgba(render(s2, img, 2), 110, 110)[0]).toBeLessThan(20);
  });

  it('禁止進入有琥珀色的斜線、戰爭迷霧比地圖亮（霧）、一直蓋著的一直在', () => {
    const img = mapImage();
    const keep = render(state([mask({ style: 'keepout', mode: 'static' })]), img, 0);
    let amber = 0;
    for (let x = 100; x < 300; x += 3) {
      const p = rgba(keep, x, 150);
      if (p[0] > 200 && p[1] > 140 && p[2] < 80) amber++;
    }
    expect(amber).toBeGreaterThan(10);
    const fog = render(state([mask({ style: 'fog', mode: 'static' })]), img, 0);
    expect(rgba(fog, 200, 150)[0]).toBeGreaterThan(200);
  });

  it('房間遮罩 ZIP 的單張：地圖大小、房間外透明、房間裡蓋滿（揭開的遮罩也是蓋滿的樣子）', () => {
    const img = mapImage();
    const room = mask({ style: 'dark', mode: 'reveal', label: '書房' });
    const s = state([room]);
    const c = nc?.createCanvas(600, 400) as Img;
    drawRoomMask(c.getContext('2d') as G, s, img, room, new FxCache());
    expect(rgba(c, 50, 50)[3]).toBe(0);
    expect(rgba(c, 305, 205)[3]).toBe(0);
    expect(rgba(c, 298, 198)[3]).toBe(255);
    expect(rgba(c, 105, 105)[3]).toBe(255);
    expect(rgba(c, 105, 105)[0]).toBeLessThan(20);
  });
});

describe.runIf(nc)('路線・地點', () => {
  it('移動路線：動作前沒有、結束時沿著中線有紅色、箭頭在終點', () => {
    const img = mapImage();
    const s = state([rt({ style: 'dashed', shape: 'right' })]);
    const red = (c: Img) => {
      let n = 0;
      for (let x = 50; x <= 450; x += 2) {
        const p = rgba(c, x, 100);
        if (p[0] > 180 && p[1] < 100 && p[2] < 100) n++;
      }
      return n;
    };
    expect(red(render(s, img, 0))).toBe(0);
    const half = red(render(s, img, 0.5));
    const end = red(render(s, img, 2));
    expect(half).toBeGreaterThan(10);
    expect(end).toBeGreaterThan(half);
    /* 終點（箭頭的尖端附近）是紅的 */
    expect(rgba(render(s, img, 2), 445, 100)[0]).toBeGreaterThan(180);
  });

  it('點選的 U 字：回程的那一段也畫到', () => {
    const img = mapImage();
    const pts = [
      { x: 100, y: 100 },
      { x: 400, y: 100 },
      { x: 400, y: 300 },
      { x: 100, y: 300 },
    ];
    const s = state([
      rt({ style: 'march', shape: 'points', points: pts, x: 100, y: 100, w: 300, h: 200 }),
    ]);
    const c = render(s, img, 2);
    const p = rgba(c, 250, 300);
    expect(p[0]).toBeGreaterThan(200);
    expect(p[2]).toBeLessThan(120);
  });

  it('目的地圖釘：結束時圖釘在框的中心上方；危險區：紅框與斜線', () => {
    const img = mapImage();
    const pin = render(state([rt({ style: 'pin', x: 200, y: 100, w: 200, h: 200 })]), img, 2);
    /* 圖釘高 clamp(短邊 × 0.42, 16u, 90u)＝90u（u＝400 ÷ 1080）：尖端在 (300, 200)、往上 33 px */
    const head = rgba(pin, 300, 188);
    expect(head[0]).toBeGreaterThan(180);
    expect(head[1]).toBeLessThan(110);
    const danger = render(state([rt({ style: 'danger', x: 100, y: 100, w: 200, h: 100 })]), img, 2);
    const edge = rgba(danger, 200, 100);
    expect(edge[0]).toBeGreaterThan(190);
    expect(edge[1]).toBeLessThan(80);
    expect(MAP_COLORS.danger).toBe('#e0242b');
  });
});

describe('框上的文字（先等字型）', () => {
  it('標籤與房名，有遮罩時加「？」', () => {
    const frames: Frame[] = [rt({ label: '0:10 潛入' }), mask({ label: '書房' })];
    expect(frameText(frames)).toBe('0:10 潛入書房？');
    expect(frameText([rt({ label: '' })])).toBe('');
  });
});
