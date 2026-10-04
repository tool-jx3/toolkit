/**
 * 壓克力周邊工房（acrylic-goods）的外框抽取（規格 3.1）：由透明度算外框、外框留白（外擴）、描邊、平滑與簡化、
 * 多塊與洞裡的塊、縮圖比例、換算回原圖 px、圖片平面的位置。
 */
import { describe, expect, it } from 'vitest';
import {
  type AlphaMap,
  contourScale,
  contourShape,
  dilateMask,
  pointInPolygon,
  smoothContour,
  solidMask,
  traceContours,
} from '@/tools/acrylic-goods/contour';

/** w × h 的透明度圖；fill(x, y) 回傳 0～255 */
function alphaMap(w: number, h: number, fill: (x: number, y: number) => number): AlphaMap {
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = fill(x, y);
  return { width: w, height: h, alpha, sourceWidth: w, sourceHeight: h };
}

const rect =
  (x0: number, y0: number, x1: number, y1: number, a = 255) =>
  (x: number, y: number) =>
    x >= x0 && x < x1 && y >= y0 && y < y1 ? a : 0;

function mask(w: number, h: number, fill: (x: number, y: number) => boolean) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = fill(x, y) ? 1 : 0;
  return m;
}

describe('縮圖比例（長邊最多 500 px）', () => {
  it('不超過時不縮', () => {
    expect(contourScale(300, 400)).toEqual({ scale: 1, width: 300, height: 400 });
  });
  it('超過時等比縮小、無條件捨去', () => {
    expect(contourScale(1000, 801)).toEqual({ scale: 0.5, width: 500, height: 400 });
    expect(contourScale(333, 1000)).toEqual({ scale: 0.5, width: 166, height: 500 });
  });
});

describe('描邊', () => {
  it('長方形：外緣的像素一圈、順時針、起點在左上', () => {
    const m = mask(10, 8, (x, y) => x >= 2 && x < 7 && y >= 1 && y < 5);
    const [poly] = traceContours(m, 10, 8, { minPixels: 1 });
    expect(poly[0]).toEqual({ x: 2, y: 1 });
    /* 5 × 4 的長方形外緣有 2 × (5 + 4) − 4 ＝ 14 個像素 */
    expect(poly).toHaveLength(14);
    expect(poly[1]).toEqual({ x: 3, y: 1 });
    expect(Math.min(...poly.map((p) => p.x))).toBe(2);
    expect(Math.max(...poly.map((p) => p.x))).toBe(6);
    expect(Math.max(...poly.map((p) => p.y))).toBe(4);
  });

  it('分開的兩塊各一條外框；洞裡的塊略過；太小的塊略過', () => {
    const m = mask(30, 30, (x, y) => {
      const ring = x >= 2 && x < 20 && y >= 2 && y < 20 && !(x >= 5 && x < 17 && y >= 5 && y < 17);
      const inHole = x >= 9 && x < 13 && y >= 9 && y < 13;
      const other = x >= 23 && x < 28 && y >= 22 && y < 28;
      const dot = x === 25 && y === 0;
      return ring || inHole || other || dot;
    });
    const polys = traceContours(m, 30, 30);
    expect(polys).toHaveLength(2);
    expect(polys[0][0]).toEqual({ x: 2, y: 2 });
    expect(polys[1][0]).toEqual({ x: 23, y: 22 });
  });

  it('只靠斜角相連的兩塊：回到起點後還會繞完另一邊（整塊一條外框）', () => {
    /* 起點 (5,0) 的左下、右下各接一塊 */
    const m = mask(
      12,
      8,
      (x, y) =>
        (x === 5 && y === 0) || (y >= 1 && y < 5 && (x === 3 || x === 4 || x === 6 || x === 7)),
    );
    const polys = traceContours(m, 12, 8, { minPixels: 1 });
    expect(polys).toHaveLength(1);
    const xs = polys[0].map((p) => p.x);
    expect(Math.min(...xs)).toBe(3);
    expect(Math.max(...xs)).toBe(7);
  });

  it('點在多邊形裡', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
});

describe('平滑與簡化', () => {
  it('少於 7 點時原樣回傳', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(smoothContour(pts)).toEqual(pts);
  });
  it('7 點移動平均（環狀），再去掉距離不到 2 的點', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({
      x: i < 20 ? i : 40 - i,
      y: i < 20 ? 0 : 5,
    }));
    const out = smoothContour(pts);
    for (let i = 1; i < out.length; i++)
      expect(Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y)).toBeGreaterThan(2);
    /* 第一點＝第 −3～3 點的平均 */
    const first = [-3, -2, -1, 0, 1, 2, 3].map((k) => pts[(k + 40) % 40]);
    expect(out[0].x).toBeCloseTo(first.reduce((s, p) => s + p.x, 0) / 7, 9);
    expect(out[0].y).toBeCloseTo(first.reduce((s, p) => s + p.y, 0) / 7, 9);
  });
});

describe('外擴（外框留白）', () => {
  it('四周留 pad、透明度 > 30 才算', () => {
    const map = alphaMap(4, 3, (x) => (x === 0 ? 30 : x === 1 ? 31 : 0));
    const s = solidMask(map, 2);
    expect([s.width, s.height]).toEqual([8, 7]);
    expect(s.mask[2 * 8 + 2]).toBe(0);
    expect(s.mask[2 * 8 + 3]).toBe(1);
  });
  it('距離 ≤ 半徑的都變成實心（圓形外擴）', () => {
    const w = 21;
    const m = mask(w, w, (x, y) => x === 10 && y === 10);
    const d = dilateMask(m, w, w, 5);
    expect(d[10 * w + 15]).toBe(1);
    expect(d[10 * w + 16]).toBe(0);
    /* 斜角 (3,4) 的距離 5 */
    expect(d[14 * w + 13]).toBe(1);
    expect(d[15 * w + 14]).toBe(0);
    expect(dilateMask(m, w, w, 0)).toBe(m);
  });
});

describe('一張圖的外框（換算回原圖 px）', () => {
  it('整張透明：抓不到外框', () => {
    expect(
      contourShape(
        alphaMap(40, 40, () => 0),
        10,
      ),
    ).toBeNull();
    expect(
      contourShape(
        alphaMap(40, 40, () => 30),
        0,
      ),
    ).toBeNull();
  });

  it('留白 0：範圍是不透明的範圍（像素中心），中心為原點、y 往上', () => {
    const c = contourShape(alphaMap(100, 60, rect(10, 10, 90, 50)), 0)!;
    expect(c.outlines).toHaveLength(1);
    /* 像素中心 10.5～89.5、10.5～49.5，平滑會把直角內縮一點，範圍不變 */
    expect(c.bounds.maxX - c.bounds.minX).toBeCloseTo(79, 0);
    expect(c.bounds.maxY - c.bounds.minY).toBeCloseTo(39, 0);
    expect(c.bounds.minX).toBeCloseTo(-c.bounds.maxX, 6);
    expect(c.planeOffset.x).toBeCloseTo(0, 6);
    expect(c.planeOffset.y).toBeCloseTo(0, 6);
    expect([c.imageWidth, c.imageHeight]).toEqual([100, 60]);
  });

  it('留白 15：每邊多 15 px', () => {
    const c = contourShape(alphaMap(100, 60, rect(10, 10, 90, 50)), 15)!;
    expect(c.bounds.maxX - c.bounds.minX).toBeCloseTo(79 + 30, 0);
    expect(c.bounds.maxY - c.bounds.minY).toBeCloseTo(39 + 30, 0);
  });

  it('不透明的部分偏左上：圖片平面往右下移（外框以範圍中心為原點）', () => {
    const c = contourShape(alphaMap(100, 100, rect(0, 0, 40, 20)), 0)!;
    /* 像素中心 0.5～39.5、0.5～19.5：外框中心 (20, 10)，圖片中心 (50, 50)：往右 30、往下 40（y 往上為負） */
    expect(c.planeOffset.x).toBeCloseTo(30, 1);
    expect(c.planeOffset.y).toBeCloseTo(-40, 1);
  });

  it('大圖先縮小再算，結果換算回原圖 px', () => {
    const small = alphaMap(500, 250, rect(50, 50, 450, 200));
    const big: AlphaMap = { ...small, sourceWidth: 1000, sourceHeight: 500 };
    const c = contourShape(big, 20)!;
    /* 縮圖上寬 399＋2 × 10（留白 20 × 0.5）＝ 419 → 原圖 838 */
    expect(c.bounds.maxX - c.bounds.minX).toBeCloseTo(838, -1);
    expect(c.bounds.maxY - c.bounds.minY).toBeCloseTo(((149 + 20) / 250) * 500, -1);
  });

  it('兩塊分開的圖各自一條外框，範圍涵蓋兩塊', () => {
    const c = contourShape(
      alphaMap(100, 40, (x, y) => rect(0, 0, 20, 40)(x, y) || rect(60, 10, 100, 30)(x, y)),
      2,
    )!;
    expect(c.outlines).toHaveLength(2);
    expect(c.bounds.maxX - c.bounds.minX).toBeGreaterThan(95);
  });
});
