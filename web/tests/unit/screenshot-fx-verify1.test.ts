/**
 * 截圖演出產生器：第一批驗證後的修正（規格 §7.1 的 R1、R5、R7、R8、R10）。
 * - R1 陰影只在截圖外面：透明背景時，截圖的透明處 alpha＝0（截圖的陰影、「只有陰影」的放大框、聚光、圖層 ZIP 的背景圖層）；
 * - R5 馬賽克是嚴格的區塊平均：直條色塊上每格＝框內、那一格裡的像素平均，不混進隔壁格與框外；
 * - R7 點一下與 Shift＋點一下用同一個疊放順序；R8 圓標大小；R10 離散的操作各自一步復原。
 * 畫面的測試要真畫布（node-canvas，tests/helpers/nodeCanvas.ts）；沒裝時跳過那幾個，純函式照跑。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  badgeDiameter,
  computeLayout,
  type Frame,
  type FxState,
  frameAt,
  initialState,
  type MarkerFrame,
  type RedactFrame,
  stackOrder,
  timelineOf,
  type ZoomFrame,
} from '@/tools/screenshot-fx/model';
import { blockAverage, RenderCache, renderToCanvas } from '@/tools/screenshot-fx/render';
import {
  addFrame,
  docNow,
  duplicate,
  edit,
  gesture,
  historyStep,
  moveFrame,
  removeFrame,
  resetAll,
  setFrameRect,
  setImage,
  useDoc,
} from '@/tools/screenshot-fx/store';
import { nodeCanvas } from '../helpers/nodeCanvas';

const nc = await nodeCanvas();

type Img = OffscreenCanvas;
type G = OffscreenCanvasRenderingContext2D;

/** 400 × 300：左半透明、右半不透明的紅（驗證報告的 alpha.png） */
function halfTransparent(): Img {
  const c = nc?.createCanvas(400, 300) as Img;
  const g = c.getContext('2d') as G;
  g.fillStyle = '#ff0000';
  g.fillRect(200, 0, 200, 300);
  return c;
}

function transparentState(): FxState {
  const s = initialState();
  s.canvas = 'original';
  s.bg.mode = 'transparent';
  s.image = { id: 'img', name: 'alpha.png', width: 400, height: 300 };
  return s;
}

function rgba(c: Img, x: number, y: number): number[] {
  const g = c.getContext('2d') as G;
  return Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data);
}

const zoom = (o: Partial<ZoomFrame> = {}): ZoomFrame => ({
  id: 'z',
  kind: 'zoom',
  x: 20,
  y: 60,
  w: 120,
  h: 90,
  scale: 1.25,
  style: 'card',
  border: 4,
  ...o,
});

describe.runIf(nc)('R1：陰影只在截圖外面（透明背景時透明處 alpha＝0）', () => {
  it('截圖的陰影：透明處完全透明、截圖外面照樣有陰影（預設陰影 32）', () => {
    const s = transparentState();
    const img = halfTransparent();
    const L = computeLayout(s, img);
    const out = renderToCanvas({ state: s, image: img }, 0, new RenderCache()) as Img;
    const { shot } = L;
    /* 透明那一半的中央、靠上緣、靠左緣（陰影最濃的地方都在截圖範圍裡） */
    for (const [fx, fy] of [
      [0.25, 0.5],
      [0.25, 0.06],
      [0.03, 0.5],
      [0.25, 0.97],
    ])
      expect(rgba(out, shot.x + shot.w * fx, shot.y + shot.h * fy)[3]).toBe(0);
    /* 不透明的那一半是紅 */
    expect(rgba(out, shot.x + shot.w * 0.75, shot.y + shot.h * 0.5)).toEqual([255, 0, 0, 255]);
    /* 截圖下方（外面）有陰影 */
    expect(rgba(out, shot.x + shot.w * 0.75, shot.y + shot.h + 4)[3]).toBeGreaterThan(20);
  });

  it('「只有陰影」的放大框蓋在透明處：卡片裡沒有黑底、聚光不把透明處變黑', () => {
    const s = transparentState();
    s.frames = [zoom({ style: 'shadow' })];
    const img = halfTransparent();
    const L = computeLayout(s, img);
    const end = timelineOf(s).total;
    const out = renderToCanvas({ state: s, image: img }, end, new RenderCache()) as Img;
    const k = L.shot.f;
    /* 卡片的中心＝框的中心（放大後還在透明的那一半） */
    const cx = L.shot.x + (20 + 60) * k;
    const cy = L.shot.y + (60 + 45) * k;
    expect(rgba(out, cx, cy)[3]).toBe(0);
    /* 聚光照樣把不透明的地方調暗 */
    const red = rgba(out, L.shot.x + L.shot.w * 0.85, L.shot.y + L.shot.h * 0.5);
    expect(red[3]).toBe(255);
    expect(red[0]).toBeLessThan(200);
  });

  it('圖層 ZIP 的背景圖層：透明處 alpha＝0', () => {
    const s = transparentState();
    const img = halfTransparent();
    const L = computeLayout(s, img);
    const out = renderToCanvas({ state: s, image: img }, 0, new RenderCache(), {
      layer: 'background',
    }) as Img;
    expect(rgba(out, L.shot.x + L.shot.w * 0.25, L.shot.y + L.shot.h * 0.5)[3]).toBe(0);
    expect(rgba(out, L.shot.x + L.shot.w * 0.25, L.shot.y + L.shot.h * 0.04)[3]).toBe(0);
  });
});

/* ---------- R5 馬賽克 ---------- */

/** 直條色塊：每條 w px 寬，顏色依序循環 */
function stripes(width: number, height: number, w: number, colors: number[][]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set(colors[Math.floor(x / w) % colors.length], (y * width + x) * 4);
  return { data, width, height };
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const WHITE = [255, 255, 255, 255];

describe('R5：馬賽克是嚴格的區塊平均', () => {
  it('直條色塊：每格只平均那一格裡的像素', () => {
    /* 3 px 寬的紅藍白直條；框 x 0～12、一格 4 px：第一格＝紅 3 ＋藍 1 */
    const src = stripes(12, 4, 3, [RED, BLUE, WHITE]);
    const cells = blockAverage(src, 0, 0, { x: 0, y: 0, w: 12, h: 4 }, 3, 1);
    expect(Array.from(cells.subarray(0, 4))).toEqual([191, 0, 64, 255]);
    /* 第二格＝藍 2 ＋白 2 */
    expect(Array.from(cells.subarray(4, 8))).toEqual([128, 128, 255, 255]);
    /* 第三格（x 8～11）＝白 1 ＋紅 3 */
    expect(Array.from(cells.subarray(8, 12))).toEqual([255, 64, 64, 255]);
  });

  it('框外的像素不算進去（框貼著別的顏色也不混色）', () => {
    /* 原圖 0～11 是紅、12～23 是藍；框 x 12～24 只有藍 */
    const src = stripes(24, 2, 12, [RED, BLUE]);
    const cells = blockAverage(src, 0, 0, { x: 12, y: 0, w: 12, h: 2 }, 2, 1);
    expect(Array.from(cells)).toEqual([...BLUE, ...BLUE]);
    /* 讀的那一塊從 (ox, oy) 開始也一樣 */
    const part = stripes(12, 2, 12, [BLUE]);
    expect(Array.from(blockAverage(part, 12, 0, { x: 12, y: 0, w: 12, h: 2 }, 2, 1))).toEqual([
      ...BLUE,
      ...BLUE,
    ]);
  });

  it('依不透明度加權：透明的像素不會把顏色拉黑', () => {
    const src = stripes(4, 1, 2, [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
    ]);
    expect(Array.from(blockAverage(src, 0, 0, { x: 0, y: 0, w: 4, h: 1 }, 1, 1))).toEqual([
      255, 0, 0, 128,
    ]);
  });

  it('格比 1 px 小（沒有像素中心）時取最接近格中心的像素', () => {
    const src = stripes(3, 1, 1, [RED, BLUE, WHITE]);
    const cells = blockAverage(src, 0, 0, { x: 0, y: 0, w: 3, h: 1 }, 4, 1);
    expect(cells.length).toBe(16);
    for (let i = 0; i < 4; i++) expect(cells[i * 4 + 3]).toBe(255);
  });

  it.runIf(nc)('畫出來的馬賽克：直條上每格的顏色＝那一格的嚴格平均', () => {
    const img = nc?.createCanvas(240, 120) as Img;
    const g = img.getContext('2d') as G;
    const cols = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000'];
    for (let x = 0; x < 240; x += 7) {
      g.fillStyle = cols[(x / 7) % cols.length];
      g.fillRect(x, 0, 7, 120);
    }
    const s = initialState();
    s.canvas = 'original';
    s.image = { id: 'img', name: 'stripes.png', width: 240, height: 120 };
    s.shot.scale = 100;
    s.shot.radius = 0;
    s.shot.shadow = 0;
    const f: RedactFrame = {
      id: 'm',
      kind: 'redact',
      x: 30,
      y: 20,
      w: 120,
      h: 60,
      style: 'mosaic',
      mode: 'static',
      dir: 'h',
      density: 100,
      grain: 20,
      edge: 'glow',
      glow: 70,
    };
    s.frames = [f];
    const L = computeLayout(s, img);
    expect(L.shot.f).toBe(1);
    const out = renderToCanvas({ state: s, image: img }, 0, new RenderCache()) as Img;
    const src = (img.getContext('2d') as G).getImageData(0, 0, 240, 120);
    const expected = blockAverage(src, 0, 0, f, 6, 3);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 6; col++) {
        const got = rgba(out, L.shot.x + 30 + col * 20 + 10, L.shot.y + 20 + row * 20 + 10);
        const want = Array.from(expected.subarray((row * 6 + col) * 4, (row * 6 + col) * 4 + 4));
        for (let ch = 0; ch < 4; ch++) expect(Math.abs(got[ch] - want[ch])).toBeLessThanOrEqual(1);
      }
  });
});

/* ---------- R7、R8 ---------- */

const marker = (o: Partial<MarkerFrame> = {}): MarkerFrame => ({
  id: 'a',
  kind: 'marker',
  x: 30,
  y: 70,
  w: 60,
  h: 20,
  style: 'yellow',
  dir: 'h',
  ...o,
});

describe('R7：疊放順序＝命中順序', () => {
  const frames: Frame[] = [marker(), zoom({ id: 'b' }), marker({ id: 'c', x: 200, y: 200 })];

  it('放大框在下、螢光筆與塗黑在上（各自照清單順序），選取中的最上面', () => {
    expect(stackOrder(frames).map((f) => f.id)).toEqual(['b', 'a', 'c']);
    expect(stackOrder(frames, 'b').map((f) => f.id)).toEqual(['a', 'c', 'b']);
  });

  it('點在重疊處選到上面的那個；選取中的放大框蓋住裡面的螢光筆；pad 擴大點選範圍', () => {
    expect(frameAt(frames, null, { x: 40, y: 80 })?.id).toBe('a');
    expect(frameAt(frames, 'b', { x: 40, y: 80 })?.id).toBe('b');
    expect(frameAt(frames, null, { x: 25, y: 65 })?.id).toBe('b');
    expect(frameAt(frames, null, { x: 5, y: 5 })).toBeNull();
    expect(frameAt(frames, null, { x: 198, y: 199 })).toBeNull();
    expect(frameAt(frames, null, { x: 198, y: 199 }, 3)?.id).toBe('c');
  });
});

describe('R8：序號圓標跟著舞台縮小', () => {
  it('舞台寬的 1/40，夾在 12～20 px', () => {
    expect(badgeDiameter(340)).toBe(12);
    expect(badgeDiameter(600)).toBe(15);
    expect(badgeDiameter(960)).toBe(20);
    expect(badgeDiameter(4000)).toBe(20);
  });
});

/* ---------- R10 ---------- */

describe('R10：只有連續的操作合成一步復原', () => {
  beforeEach(() => {
    resetAll(initialState());
    useDoc.temporal.getState().clear();
    setImage({ id: 'img', name: 'a.png', width: 400, height: 300 });
  });

  const count = () => docNow().frames.length;

  it('新增、複製三次、上移、刪除：一次各一步（連續做也不合併）', () => {
    const id = addFrame({ x: 10, y: 10, w: 50, h: 40 }, 'marker') as string;
    const ids = [duplicate(id), duplicate(id), duplicate(id)];
    expect(count()).toBe(4);
    moveFrame(ids[2] as string, -1);
    removeFrame(ids[0] as string);
    expect(count()).toBe(3);
    historyStep('undo');
    expect(count()).toBe(4);
    const order = docNow().frames.map((f) => f.id);
    historyStep('undo');
    expect(docNow().frames.map((f) => f.id)).not.toEqual(order);
    for (const n of [3, 2, 1, 0]) {
      historyStep('undo');
      expect(count()).toBe(n);
    }
    /* 再一步：回到換圖之前 */
    historyStep('undo');
    expect(docNow().image).toBeNull();
  });

  it('選項（離散）各一步；方向鍵連按 0.4 秒內合成一步；滑桿一次拖曳一步', () => {
    const id = addFrame({ x: 10, y: 10, w: 50, h: 40 }, 'zoom') as string;
    edit((d) => {
      d.bg.mode = 'solid';
    });
    edit((d) => {
      d.timing.order = 'simultaneous';
    });
    for (let i = 1; i <= 3; i++) setFrameRect(id, { x: 10 + i, y: 10, w: 50, h: 40 }, true);
    expect(docNow().frames[0].x).toBe(13);
    const slide = gesture.live((v: number) =>
      edit((d) => {
        d.shot.radius = v;
      }),
    );
    slide(12);
    slide(14);
    slide(16);
    useDoc.endGesture();
    expect(docNow().shot.radius).toBe(16);
    historyStep('undo');
    expect(docNow().shot.radius).toBe(initialState().shot.radius);
    historyStep('undo');
    expect(docNow().frames[0].x).toBe(10);
    historyStep('undo');
    expect(docNow().timing.order).toBe('sequential');
    historyStep('undo');
    expect(docNow().bg.mode).toBe(initialState().bg.mode);
    historyStep('undo');
    expect(count()).toBe(0);
  });
});
