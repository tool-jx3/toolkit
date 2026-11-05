/**
 * 世界地圖產生器：國名的面積重心、川的粗細、內側的城牆、複製的位移、比例尺、港口的方向、山林的排法
 * （規格 F19、F23、F25、F35、F44、F62、3.4、3.6、3.8、3.9、3.11）。
 */
import { describe, expect, it } from 'vitest';
import {
  centroid,
  clampShift,
  duplicateShift,
  innerWallPoints,
  pointInPolygon,
  polygonArea,
  riverRadii,
  sampleCurve,
  selfIntersects,
} from '@/tools/world-map/model/geometry';
import { coastSide, dockOf } from '@/tools/world-map/model/ports';
import {
  BLEND_REACH,
  edgeDistance,
  forestDepth,
  layoutMarks,
  mountainScale,
  treeScale,
} from '@/tools/world-map/model/relief';
import { formatKm, niceScaleBar, pathKm } from '@/tools/world-map/model/scale';
import { FOREST, MOUNTAIN, type Pt } from '@/tools/world-map/model/types';

const P = (list: [number, number][]): Pt[] => list.map(([x, y]) => ({ x, y }));

describe('國名的位置：面積重心（F19）', () => {
  it('長方形與三角形', () => {
    expect(
      centroid(
        P([
          [0, 0],
          [100, 0],
          [100, 50],
          [0, 50],
        ]),
      ),
    ).toEqual({ x: 50, y: 25 });
    const c = centroid(
      P([
        [0, 0],
        [90, 0],
        [0, 90],
      ]),
    );
    expect(c.x).toBeCloseTo(30);
    expect(c.y).toBeCloseTo(30);
  });

  it('L 形：面積重心和頂點平均不同', () => {
    const L = P([
      [0, 0],
      [300, 0],
      [300, 60],
      [60, 60],
      [60, 300],
      [0, 300],
    ]);
    const c = centroid(L);
    const avg = { x: L.reduce((s, p) => s + p.x, 0) / 6, y: L.reduce((s, p) => s + p.y, 0) / 6 };
    expect(c.x).toBeCloseTo(c.y);
    expect(c.x).toBeCloseTo((300 * 60 * 150 + 60 * 240 * 30) / (300 * 60 + 60 * 240));
    expect(Math.abs(c.x - avg.x)).toBeGreaterThan(20);
  });

  it('面積幾乎是 0 時用頂點平均', () => {
    expect(
      centroid(
        P([
          [0, 0],
          [10, 10],
          [20, 20],
        ]),
      ),
    ).toEqual({ x: 10, y: 10 });
  });
});

describe('川的粗細（F25、3.6）', () => {
  it('上游 0.42 倍、河口 1.25 倍，沿著長度單調變粗', () => {
    const pts = sampleCurve(
      P([
        [0, 0],
        [200, 50],
        [400, 0],
      ]),
      true,
    );
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts.at(-1)).toEqual({ x: 400, y: 0 });
    const r = riverRadii(pts, 10);
    expect(r[0]).toBeCloseTo(2.1);
    expect(r.at(-1)).toBeCloseTo(6.25);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
  });

  it('取樣的點距：短的路線 12 px 以內', () => {
    const pts = sampleCurve(
      P([
        [0, 0],
        [100, 0],
      ]),
      false,
    );
    expect(pts.length).toBe(10);
    for (let i = 1; i < pts.length; i++) expect(pts[i].x - pts[i - 1].x).toBeLessThanOrEqual(12);
  });
});

describe('內側的城牆（F23、3.8）', () => {
  it('正方形：縮成 66％，每個角都在裡面', () => {
    const sq = P([
      [100, 100],
      [400, 100],
      [400, 400],
      [100, 400],
    ]);
    const inner = innerWallPoints(sq)!;
    expect(inner).not.toBeNull();
    expect(polygonArea(inner) / polygonArea(sq)).toBeCloseTo(0.66 ** 2);
    expect(inner.every((p) => pointInPolygon(p, sq))).toBe(true);
  });

  it('自己交叉的形狀不做；太小的不做', () => {
    const bow = P([
      [0, 0],
      [100, 100],
      [100, 0],
      [0, 100],
    ]);
    expect(selfIntersects(bow)).toBe(true);
    expect(innerWallPoints(bow)).toBeNull();
    expect(
      innerWallPoints(
        P([
          [0, 0],
          [8, 0],
          [8, 8],
          [0, 8],
        ]),
      ),
    ).toBeNull();
  });

  it('凹的形狀：放得進去才做，邊不和原本的相交', () => {
    const U = P([
      [0, 0],
      [300, 0],
      [300, 300],
      [200, 300],
      [200, 80],
      [100, 80],
      [100, 300],
      [0, 300],
    ]);
    const inner = innerWallPoints(U);
    if (inner) expect(inner.every((p) => pointInPolygon(p, U))).toBe(true);
  });
});

describe('複製與移動（F62、F63）', () => {
  it('往右下 24 px，碰到邊緣時往反方向或夾住', () => {
    expect(duplicateShift(100, 100, 1536)).toBe(24);
    expect(duplicateShift(1530, 1530, 1536)).toBe(-24);
    expect(duplicateShift(10, 1530, 1536)).toBe(-10);
    expect(duplicateShift(14, 1520, 1536)).toBe(16);
    expect(duplicateShift(20, 1526, 1536)).toBe(-20);
  });
  it('整個留在地圖裡', () => {
    expect(
      clampShift(
        P([
          [10, 10],
          [50, 50],
        ]),
        -30,
        2000,
        1536,
        960,
      ),
    ).toEqual({ x: -10, y: 910 });
  });
});

describe('比例尺（F44、3.11）', () => {
  it('取最接近 140 px 的整齊長度', () => {
    expect(niceScaleBar(50)).toEqual({ km: 50, px: 100 });
    const b = niceScaleBar(30);
    expect(b.km).toBe(50);
    expect(b.px).toBeCloseTo(166.67, 1);
    expect(niceScaleBar(1).km).toBe(1);
    expect(niceScaleBar(100).km).toBe(100);
    expect(niceScaleBar(0.5).km).toBe(0.5);
    expect(formatKm(12500)).toBe('12,500');
  });
  it('路線的總長沿著曲線量', () => {
    expect(
      pathKm(
        {
          kind: 'road',
          smooth: false,
          points: P([
            [0, 0],
            [300, 400],
          ]),
        },
        50,
      ),
    ).toBeCloseTo(250);
  });
});

describe('港口的棧橋（F35、3.9）', () => {
  const cols = 30;
  const rows = 20;
  const grid = { cols, rows, terrain: new Uint8Array(cols * rows) };
  for (let y = 0; y < rows; y++) for (let x = 0; x < 15; x++) grid.terrain[y * cols + x] = 1;
  it('陸地上的港口朝最近的海；海上的朝陸地的反方向', () => {
    expect(coastSide(grid, 12 * 12, 100)).toBe('right');
    expect(coastSide(grid, 17 * 12, 100)).toBe('right');
  });
  it('附近沒有海時朝右；手動指定時照指定', () => {
    const all = { cols, rows, terrain: new Uint8Array(cols * rows).fill(1) };
    expect(coastSide(all, 100, 100)).toBe('right');
    expect(dockOf(grid, { kind: 'port', dock: 'up', x: 0, y: 0 })).toBe('up');
    const top = { cols, rows, terrain: new Uint8Array(cols * rows).fill(1) };
    for (let x = 0; x < cols; x++) top.terrain[x] = 0;
    expect(coastSide(top, 100, 5 * 12)).toBe('up');
  });
});

describe('山與森林的排法（F09、F10、3.4）', () => {
  const cols = 64;
  const rows = 40;
  const t = new Uint8Array(cols * rows);
  for (let y = 5; y < 35; y++) for (let x = 5; x < 30; x++) t[y * cols + x] = FOREST;
  for (let y = 5; y < 35; y++) for (let x = 30; x < 55; x++) t[y * cols + x] = MOUNTAIN;
  it('離邊界的距離：邊緣半格、裡面越來越大', () => {
    const d = edgeDistance(t, cols, rows, (v) => v === FOREST);
    expect(d[5 * cols + 5]).toBe(6);
    expect(d[20 * cols + 17]).toBeGreaterThan(d[20 * cols + 6]);
    expect(d[0]).toBe(0);
  });
  it('森林的深度：24 px 以內 0、134 px 以上 1', () => {
    expect(forestDepth(10)).toBe(0);
    expect(forestDepth(79)).toBeCloseTo(0.5);
    expect(forestDepth(200)).toBe(1);
  });
  it('同一個種子同樣的排法；圖案只在那種地形（或交界的山上）', () => {
    const a = layoutMarks(t, cols, rows, FOREST, 7);
    expect(layoutMarks(t, cols, rows, FOREST, 7)).toEqual(a);
    expect(layoutMarks(t, cols, rows, FOREST, 8)).not.toEqual(a);
    for (const m of a) {
      const v = t[Math.floor(m.y / 12) * cols + Math.floor(m.x / 12)];
      expect(v === FOREST || (v === MOUNTAIN && m.mixed)).toBe(true);
      if (m.mixed) expect(m.wood).toBeGreaterThan(0);
    }
    expect(a.some((m) => m.mixed)).toBe(true);
    const mt = layoutMarks(t, cols, rows, MOUNTAIN, 7);
    expect(
      mt.every((m) => t[Math.floor(m.y / 12) * cols + Math.floor(m.x / 12)] === MOUNTAIN),
    ).toBe(true);
    /* 靠近森林的山（36 px 內）帶綠 */
    expect(mt.some((m) => m.wood > 0)).toBe(true);
    expect(mt.filter((m) => m.x > 30 * 12 + BLEND_REACH + 12).every((m) => m.wood === 0)).toBe(
      true,
    );
  });
  it('靠邊緣的圖案比較小', () => {
    const edge = {
      x: 0,
      y: 0,
      edge: 6,
      n: 0.5,
      depth: 0,
      extra: 0 as const,
      wood: 0,
      mixed: false,
      scale: 1,
    };
    const deep = { ...edge, edge: 80 };
    expect(treeScale(edge, 0.5)).toBeLessThan(treeScale(deep, 0.5));
    expect(mountainScale(edge, 0.5).sy).toBeLessThan(mountainScale(deep, 0.5).sy);
  });
});
