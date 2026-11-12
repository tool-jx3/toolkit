/**
 * VTT 棋子產生器 2026-11-12 跟進 token-workshop（70f1503）：
 * - 畫布貼合（自動邊距的新算法）：外框置中、畫布剛好等於外框或出框需要的大小（原作 tests/frame.test.mjs 的 5 種擺放）；
 *   以前的算法不變（關掉時）；只算看得到的出框（遮罩 ≥ 16）。
 * - 讓出框配合畫布邊界：縮小到剛好、往上下左右推（原作 frame.test.mjs 的案例）。
 * - 外緣淡出：外半徑 R＋1 px 以外沒有像素（鎖鏈、寶石、霓虹與幾何不套用），R 以內不變。
 * - 資料：沒有新欄位（以前存的）＝以前的畫法；嵌進 PNG 時以前的值不寫；讀 TW 的檔案時兩個都打開。
 */
import { describe, expect, it } from 'vitest';
import { encodePng } from '../../src/core/encode/png';
import { makeCanvas } from '../../src/core/image';
import {
  embedInPng,
  embedJson,
  fromTokenWorkshop,
  readEmbedded,
} from '../../src/tools/token-maker/embed';
import { type Mask, maskBoundary, POP_VISIBLE } from '../../src/tools/token-maker/mask';
import {
  autoPad,
  DEFAULT_LOOK,
  defaultAdjust,
  EDGE_FADE_SKIP,
  edgeFadeOn,
  FRAME_IDS,
  fitScaleView,
  geom,
  type Look,
  normalizeLook,
  normalizeState,
  OVERFLOW_EPS,
  overflowMax,
  popBounds,
  popOverflow,
  pushView,
  RELIEF_FRAMES,
  ringMatchSat,
  type TokenView,
} from '../../src/tools/token-maker/model';
import { applyPreset, presetFromLook, RING_PRESETS } from '../../src/tools/token-maker/presets';
import { meanLumSat, renderTokenCanvas } from '../../src/tools/token-maker/render';
import { nodeCanvas } from '../helpers/nodeCanvas';

const canvasLib = await nodeCanvas();

const look = (p: Partial<Look> = {}): Look => normalizeLook({ ...DEFAULT_LOOK, ...p });
const view = (p: Partial<TokenView> = {}): TokenView => ({
  x: 0,
  y: 0,
  zoom: 1,
  rotate: 0,
  flip: false,
  ...p,
});
/** 邊距 → 畫布的半邊長（R 為單位） */
const halfSide = (pad: number) => 1 / (1 - 2 * pad);

/* 200 × 200 的圖（縮放 1：100 px＝1 R）、遮罩同大小：一頂帽子（x 60～140、y 0～40）＋右下角的一把劍（x 170～199、y 150～199） */
const SIZE = { width: 200, height: 200 };
function hatMask(): Mask {
  const data = new Uint8Array(200 * 200);
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 200; x++) {
      if ((x >= 60 && x < 140 && y < 40) || (x >= 170 && y >= 150)) data[y * 200 + x] = 255;
    }
  return { width: 200, height: 200, data };
}
const HAT = maskBoundary(hatMask(), null, SIZE);

describe('出框的上下左右範圍（popBounds）', () => {
  it('邊界點依擺放換算，再往外加半個遮罩 px；旋轉時取外接的寬', () => {
    const pts = Float32Array.from([-50, -100, 50, 0]);
    const b = popBounds(pts, SIZE, view());
    /* 100 px＝1 R，半個 px＝0.005 R */
    expect(b).toEqual({ x0: -0.505, x1: 0.505, y0: -1.005, y1: 0.005 });
    /* 遮罩是圖片的一半大時，半個遮罩 px＝1 個圖片 px */
    expect(popBounds(pts, SIZE, view(), 2)?.x1).toBeCloseTo(0.51, 9);
    /* 移動、縮放跟著擺放 */
    const m = popBounds(pts, SIZE, view({ x: 0.2, zoom: 2 }));
    expect(m?.x1).toBeCloseTo(0.2 + 1 + 0.01, 9);
    /* 旋轉 90°：(0, −100) 跑到 (1, 0)；半格的外接寬 |cos|＋|sin| */
    const r = popBounds(Float32Array.from([0, -100]), SIZE, view({ rotate: 90 }));
    expect(r?.x1).toBeCloseTo(1 + 0.005, 9);
    const r45 = popBounds(Float32Array.from([0, 0]), SIZE, view({ rotate: 45 }));
    expect(r45?.x1).toBeCloseTo(0.005 * Math.SQRT2, 9);
    expect(popBounds(null, SIZE, view())).toBeNull();
    expect(popBounds(new Float32Array(0), SIZE, view())).toBeNull();
  });
});

describe('畫布貼合（token-workshop 70f1503 的 Auto-fit canvas）', () => {
  const tight = look({ tightFit: true, feather: 0 });

  it('外框或出框剛好碰到畫布的邊，不留空（原作 frame.test.mjs 的 5 種擺放，含旋轉、平移）', () => {
    for (const [x, y, rotRad, zoom] of [
      [0, 0, 0, 1],
      [0.3, -0.2, 0.6, 1],
      [-0.5, 0.4, 2.2, 1.4],
      [0, 0, 0, 0.5],
      [0.9, 0.9, 0.785, 1.1],
    ]) {
      const v = view({ x, y, zoom, rotate: (rotRad * 180) / Math.PI });
      const pad = autoPad(HAT, SIZE, v, tight);
      const b = popBounds(HAT, SIZE, v);
      const m = b ? Math.max(-b.x0, b.x1, -b.y0, b.y1) : 0;
      const need = Math.min(Math.max(1, m), 1 / (1 - 2 * 0.45));
      expect(Math.abs(halfSide(pad) - need)).toBeLessThan(0.01);
      /* 外框一直在中間（半徑＝N（0.5 − 邊距）、中心 N／2） */
      expect(geom(512, pad).c).toBe(256);
    }
  });

  it('斜角的出框：以前的算法以最遠的距離為半徑（四邊都留空），貼合時外框不縮小', () => {
    /* 只有右下角的劍：離中心 1.4 R，但上下左右都不超過 1 R */
    const sword = Float32Array.from([70, 70, 99, 99, 60, 99]);
    const old = autoPad(sword, SIZE, view(), look({ feather: 0 }));
    expect(old).toBeGreaterThan(0.1);
    expect(autoPad(sword, SIZE, view(), tight)).toBe(0);
    /* 往右移 0.1 R：右邊超出，剛好碰到 */
    const pad = autoPad(sword, SIZE, view({ x: 0.1 }), tight);
    expect(halfSide(pad)).toBeCloseTo(0.99 + 0.005 + 0.1, 9);
  });

  it('柔邊照樣留空間、陰影不留（陰影只落在外框上）、外光暈至少 1.06；最多 45%', () => {
    const v = view({ y: -0.3 });
    const base = autoPad(HAT, SIZE, v, tight);
    expect(base).toBeGreaterThan(0);
    expect(autoPad(HAT, SIZE, v, look({ tightFit: true, feather: 4 }))).toBeGreaterThan(base);
    expect(autoPad(HAT, SIZE, v, look({ tightFit: true, feather: 0, shadow: 100 }))).toBe(base);
    expect(autoPad(null, SIZE, v, look({ tightFit: true, glow: 'outer' }))).toBeCloseTo(
      0.5 - 0.5 / 1.06,
      12,
    );
    expect(autoPad(Float32Array.from([0, -100000]), SIZE, v, tight)).toBe(0.45);
  });

  it('關掉時（以前存的外觀）和以前的算法完全相同', () => {
    for (const v of [view(), view({ x: 0.3, y: -0.4, zoom: 1.3, rotate: 20, flip: true })])
      for (const l of [look(), look({ shadow: 40, feather: 3 }), look({ glow: 'all' })]) {
        const { tightFit: _t, edgeFade: _e, ...old } = l;
        expect(autoPad(HAT, SIZE, v, old)).toBe(autoPad(HAT, SIZE, v, l));
        /* 以前的算法：最遠的距離 × 1.005＋柔邊＋陰影（規格 3.3） */
        let far = 0;
        const k = 0.01 * v.zoom;
        const a = (v.rotate * Math.PI) / 180;
        for (let i = 0; i < HAT.length; i += 2) {
          const x = HAT[i] * k * (v.flip ? -1 : 1);
          const y = HAT[i + 1] * k;
          far = Math.max(
            far,
            Math.hypot(
              x * Math.cos(a) - y * Math.sin(a) + v.x,
              x * Math.sin(a) + y * Math.cos(a) + v.y,
            ),
          );
        }
        let d = far > 1 ? far * 1.005 + (l.feather > 0 ? l.feather * k : 0) : 1;
        if (far > 1 && l.shadow > 0) d += 0.01 + 0.05 * (l.shadow / 100);
        if (l.glow === 'outer' || l.glow === 'all') d = Math.max(d, 1.06);
        expect(autoPad(HAT, SIZE, v, l)).toBe(Math.min(0.45, Math.max(0, 0.5 - 0.5 / d)));
      }
  });

  it('只算看得到的出框（遮罩 ≥ 16；以前的算法是 > 0）', () => {
    const m: Mask = { width: 10, height: 10, data: new Uint8Array(100) };
    m.data[55] = 255;
    m.data[5] = 15;
    const all = maskBoundary(m, null, { width: 10, height: 10 });
    const seen = maskBoundary(m, null, { width: 10, height: 10 }, POP_VISIBLE);
    expect(all.length).toBe(4);
    expect(Array.from(seen)).toEqual([0.5, 0.5]);
  });
});

describe('讓出框配合畫布邊界（縮小到剛好、往上下左右推）', () => {
  it('縮小到剛好：以外框的中心一起縮小，出框都在外框碰到四邊的圖片裡（原作的案例）', () => {
    const v = view({ zoom: 1.6, x: 0.4, y: -0.3 });
    const b = popBounds(HAT, SIZE, v);
    if (!b) throw new Error('沒有出框');
    expect(overflowMax(popOverflow(b, 0))).toBeGreaterThan(0.1);
    const fit = fitScaleView(v, b, 0);
    if (!fit) throw new Error('應該要縮小');
    const after = popBounds(HAT, SIZE, fit);
    if (!after) throw new Error('沒有出框');
    expect(overflowMax(popOverflow(after, 0))).toBeLessThanOrEqual(0.003);
    expect(overflowMax(popOverflow(after, 0))).toBeGreaterThan(-0.003);
    /* 位移跟著縮放（以外框的中心縮放） */
    expect(fit.x / v.x).toBeCloseTo(fit.zoom / v.zoom, 12);
    expect(fit.y / v.y).toBeCloseTo(fit.zoom / v.zoom, 12);
    /* 已經放得下：null */
    expect(fitScaleView(fit, after, 0)).toBeNull();
    expect(fitScaleView(view(), popBounds(HAT, SIZE, view()) as never, 0)).toBeNull();
  });

  it('往左推到右邊收進畫布；那一邊已經放得下時 null；其他邊還超出時 rest', () => {
    const v = view({ x: 0.3 });
    const b = popBounds(HAT, SIZE, v);
    if (!b) throw new Error('沒有出框');
    expect(popOverflow(b, 0).r).toBeGreaterThan(OVERFLOW_EPS);
    const r = pushView(v, b, 0, 'left');
    if (!r) throw new Error('應該要推');
    const after = popBounds(HAT, SIZE, r.view);
    expect(popOverflow(after as never, 0).r).toBeLessThanOrEqual(0.003);
    expect(r.view.y).toBe(v.y);
    expect(r.rest).toBe(false);
    /* 往右推：左邊本來就放得下 */
    expect(pushView(v, b, 0, 'right')).toBeNull();
    /* 太大了：往左推完左邊還是超出 */
    const big = view({ zoom: 2.4, x: 0.6 });
    const bb = popBounds(HAT, SIZE, big);
    const rr = pushView(big, bb as never, 0, 'left');
    expect(rr?.rest).toBe(true);
    /* 往下推：上面的帽子收進來（手動邊距 10%） */
    const up = view({ y: -0.4 });
    const ub = popBounds(HAT, SIZE, up);
    const d = pushView(up, ub as never, 0.1, 'down');
    expect(popOverflow(popBounds(HAT, SIZE, d?.view as TokenView) as never, 0.1).t).toBeCloseTo(
      0,
      9,
    );
  });
});

type Ctx = CanvasRenderingContext2D;

function ringAlpha(l: Look, N = 128, pad = 0.04): Uint8ClampedArray {
  const c = renderTokenCanvas(
    { N, pad, look: l, token: null, cacheFrame: false },
    {
      image: null,
      size: null,
      popMask: null,
      texture: null,
    },
  );
  return (c.getContext('2d') as Ctx).getImageData(0, 0, N, N).data;
}

describe.runIf(!!canvasLib)('外緣淡出（token-workshop 70f1503 的 featherEdge）', () => {
  const N = 128;
  const { R, c } = geom(N, 0.04);
  const dist = (i: number) => Math.hypot((i % N) + 0.5 - c, Math.floor(i / N) + 0.5 - c);

  it('浮雕環：外半徑＋1 px 以外沒有任何像素；R − 1 以內和關掉時逐位元組相同', () => {
    for (const frame of RELIEF_FRAMES.filter((f) => !EDGE_FADE_SKIP.includes(f))) {
      const on = ringAlpha(look({ frame, edgeFade: true }));
      const off = ringAlpha(look({ frame }));
      let outside = 0;
      let inner = 0;
      for (let i = 0; i < N * N; i++) {
        const d = dist(i);
        if (d > R + 1.05 && on[i * 4 + 3] > 0) outside++;
        if (d < R - 1) for (let k = 0; k < 4; k++) if (on[i * 4 + k] !== off[i * 4 + k]) inner++;
      }
      expect(`${frame}:${outside}`).toBe(`${frame}:0`);
      expect(`${frame}:${inner}`).toBe(`${frame}:0`);
    }
  });

  it('R～R＋1 px：透明度乘上 1 −（離中心的距離 − R），線性淡到 0', () => {
    for (const frame of ['plain', 'gear', 'segments'] as const) {
      const on = ringAlpha(look({ frame, edgeFade: true }));
      const off = ringAlpha(look({ frame }));
      let faded = 0;
      for (let i = 0; i < N * N; i++) {
        const d = dist(i);
        if (d <= R || d > R + 1.05) continue;
        const want = off[i * 4 + 3] * Math.max(0, Math.min(1, R + 1 - d));
        expect(Math.abs(on[i * 4 + 3] - want)).toBeLessThanOrEqual(2);
        if (on[i * 4 + 3] < off[i * 4 + 3]) faded++;
      }
      expect(faded).toBeGreaterThan(10);
    }
  });

  it('鎖鏈、寶石（本來就伸出外緣）、霓虹與幾何、自訂外框不套用：和關掉時相同', () => {
    for (const frame of [...EDGE_FADE_SKIP, 'square', 'hex', 'ring'] as const) {
      expect(edgeFadeOn(look({ frame, edgeFade: true }))).toBe(false);
      expect(ringAlpha(look({ frame, edgeFade: true }))).toEqual(ringAlpha(look({ frame })));
    }
    expect(edgeFadeOn({ frame: 'custom', edgeFade: true })).toBe(false);
    expect(edgeFadeOn({ frame: 'gear', edgeFade: true })).toBe(true);
    expect(edgeFadeOn({ frame: 'gear', edgeFade: false })).toBe(false);
    expect(FRAME_IDS.filter((f) => edgeFadeOn({ frame: f, edgeFade: true })).length).toBe(14);
  });

  it('關掉時（以前存的外觀）每種外框都和沒有這個欄位的外觀逐位元組相同', () => {
    for (const frame of FRAME_IDS) {
      const { tightFit: _t, edgeFade: _e, ...old } = look({ frame, glow: 'all' });
      expect(ringAlpha(normalizeLook(old))).toEqual(ringAlpha(look({ frame, glow: 'all' })));
    }
  });
});

describe('配合外框調整圖片的顏色（原作的 Match picture colour to ring）', () => {
  it('外框與圖片的平均飽和度比 → 原作的飽和度調整（×40、夾在 −30～30；圖片的飽和度至少當成 0.05）', () => {
    expect(ringMatchSat(0.5, 0.5)).toBe(0);
    expect(ringMatchSat(0.6, 0.4)).toBe(20);
    expect(ringMatchSat(0.3, 0.6)).toBe(-20);
    expect(ringMatchSat(0.9, 0.1)).toBe(30);
    expect(ringMatchSat(0, 0.5)).toBe(-30);
    expect(ringMatchSat(0.03, 0)).toBe(-16);
  });

  it.runIf(!!canvasLib)('平均的亮度與飽和度：縮到 48 × 48，只算不透明度 ≥ 200 的像素', () => {
    const solid = (w: number, h: number, fn: (x: number, y: number) => number[]) => {
      const c = makeCanvas(w, h);
      const x = c.getContext('2d') as Ctx;
      const img = x.createImageData(w, h);
      for (let y = 0; y < h; y++)
        for (let xx = 0; xx < w; xx++) img.data.set(fn(xx, y), (y * w + xx) * 4);
      x.putImageData(img, 0, 0);
      return c;
    };
    const red = meanLumSat(solid(96, 96, () => [255, 0, 0, 255]));
    expect(red.s).toBeCloseTo(1, 6);
    expect(red.l).toBeCloseTo(0.299 * 255, 4);
    /* 左半透明、右半灰：只算右半 */
    const half = meanLumSat(solid(96, 96, (x) => (x < 48 ? [255, 0, 0, 0] : [100, 100, 100, 255])));
    expect(half.s).toBeCloseTo(0, 6);
    expect(half.l).toBeCloseTo(100, 4);
    expect(meanLumSat(solid(10, 10, () => [0, 0, 0, 0]))).toEqual({ l: 128, s: 0.3 });
  });
});

describe('資料：畫布貼合、外緣淡出（2026-11-12）', () => {
  it('預設是以前的畫法；以前存的外觀、專案檔、我的預設沒有這兩個欄位＝關', () => {
    expect(DEFAULT_LOOK.tightFit).toBe(false);
    expect(DEFAULT_LOOK.edgeFade).toBe(false);
    const { tightFit: _t, edgeFade: _e, ...old } = DEFAULT_LOOK;
    expect(normalizeLook(old)).toMatchObject({ tightFit: false, edgeFade: false });
    expect(normalizeLook({ ...old, tightFit: true, edgeFade: true })).toMatchObject({
      tightFit: true,
      edgeFade: true,
    });
    /* 不是布林值的當成關 */
    expect(normalizeLook({ ...old, tightFit: 'yes', edgeFade: 1 })).toMatchObject({
      tightFit: false,
      edgeFade: false,
    });
    /* 版本 2 的專案檔（沒有這兩個欄位）→ 關；版本 3 存了再開逐欄位相同 */
    const v2 = normalizeState({ look: old, tokens: [], current: null, custom: {} });
    expect(v2.look).toMatchObject({ tightFit: false, edgeFade: false });
    const v3 = normalizeState({ ...v2, look: { ...v2.look, tightFit: true, edgeFade: true } });
    expect(normalizeState(JSON.parse(JSON.stringify(v3)))).toEqual(v3);
    /* 我的預設（整組外觀）帶著這兩個欄位；浮雕環的預設外觀不換它們 */
    const mine = presetFromLook('m', '我的', v3.look);
    expect(mine.patch).toMatchObject({ tightFit: true, edgeFade: true });
    expect(applyPreset(v3.look, RING_PRESETS[0])).toMatchObject({ tightFit: true, edgeFade: true });
  });

  it('嵌進 PNG：以前的值（關）時不寫、內容和之前相同；打開時寫進去，讀回來還是開', async () => {
    const base = {
      token: {
        name: '哥布林',
        badge: '',
        view: view(),
        popOn: true,
        adjust: defaultAdjust(),
      },
      image: { name: 'a.png', type: 'image/png', bytes: Uint8Array.from([1, 2, 3]) },
      mask: null,
    };
    const { tightFit: _t, edgeFade: _e, ...old } = look();
    const json = embedJson({ ...base, look: look() });
    expect(json).toBe(JSON.stringify(JSON.parse(embedJson({ ...base, look: old as Look }))));
    expect(JSON.parse(json).look).not.toHaveProperty('tightFit');
    expect(JSON.parse(json).look).not.toHaveProperty('edgeFade');
    const on = look({ tightFit: true, edgeFade: true });
    expect(JSON.parse(embedJson({ ...base, look: on })).look).toMatchObject({
      tightFit: true,
      edgeFade: true,
    });
    /* 真的嵌進一張 PNG 再讀回來 */
    const img = await encodePng(new Uint8Array([255, 0, 0, 255]), 1, 1);
    const png = embedInPng(new Uint8Array(img), {
      ...base,
      image: { name: 'a.png', type: 'image/png', bytes: new Uint8Array(img) },
      look: on,
    });
    expect(readEmbedded(png, look())?.look).toMatchObject({ tightFit: true, edgeFade: true });
  });

  it('讀 token-workshop 的檔案：70f1503 起一律貼合、外緣淡出', () => {
    expect(fromTokenWorkshop({ autoFit: true }, look()).look).toMatchObject({
      autoMargin: true,
      tightFit: true,
      edgeFade: true,
    });
  });
});
