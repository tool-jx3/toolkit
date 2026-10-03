/**
 * 魔法陣製作器：幾何（規格 3.1、3.3、3.4、3.6）——折線化、截斷、簡化與平滑、複本轉換、出場名次、吸附、對齊與分佈、節點編輯。
 */
import { describe, expect, it } from 'vitest';
import {
  alignBoundsDelta,
  catmullRomAnchors,
  copyCountFor,
  copySequenceRank,
  cornerNode,
  distributeBounds,
  distributePolarAngles,
  distributePolarRadii,
  flattenElement,
  hashString,
  inverseTransformPointForCopy,
  mulberry32,
  nearestSymmetryAngle,
  partialPolyline,
  regularPolygonPoints,
  reversePathPoints,
  simplifyRDP,
  smoothNode,
  snapPoint,
  starPoints,
  transformPointForCopy,
  translated,
} from '../../src/tools/magic-circle/geometry';
import {
  createCircle,
  createPath,
  DEFAULT_SNAP,
  type McSymmetry,
  pathPoint,
} from '../../src/tools/magic-circle/model';

const sym = (o: Partial<McSymmetry> = {}): McSymmetry => ({
  enabled: true,
  count: 8,
  mirror: false,
  centerX: 500,
  centerY: 500,
  offset: 0,
  ...o,
});

/* 舊版的 mulberry32（seed 以浮點數累加，位元運算時才轉 32 位元）：用來確認新版的寫法結果相同 */
function legacyMulberry32(seed: number) {
  let s = seed;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('折線化與截斷', () => {
  it('路徑每段 8～70 個點；圓 72～240 段且回到起點', () => {
    const p = createPath([pathPoint(0, 0), pathPoint(10, 0)]);
    expect(flattenElement(p, 1).points).toHaveLength(1 + 8);
    const long = createPath([pathPoint(0, 0), pathPoint(2000, 0)]);
    expect(flattenElement(long, 1).points).toHaveLength(1 + 70);
    const mid = createPath([pathPoint(0, 0), pathPoint(240, 0)]);
    expect(flattenElement(mid, 1).points).toHaveLength(1 + 20);
    const closed = createPath([pathPoint(0, 0), pathPoint(240, 0), pathPoint(240, 240)], {
      closed: true,
    });
    expect(flattenElement(closed, 1).closed).toBe(true);
    const c = createCircle(0, 0, 10);
    const f = flattenElement(c, 1).points;
    expect(f).toHaveLength(73);
    expect(f[0].x).toBeCloseTo(10);
    expect(f[72].x).toBeCloseTo(10);
    expect(flattenElement(createCircle(0, 0, 378), 1).points).toHaveLength(209);
    expect(flattenElement(createCircle(0, 0, 1000), 1).points).toHaveLength(241);
  });

  it('沿長度截斷；反方向從終點開始', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(partialPolyline(pts, 0.25)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    expect(partialPolyline(pts, 0.75)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ]);
    expect(partialPolyline(pts, 0)).toEqual([{ x: 0, y: 0 }]);
    expect(partialPolyline(pts, 1)).toEqual(pts);
    expect(partialPolyline(pts, 0.25, true)).toEqual([
      { x: 10, y: 10 },
      { x: 10, y: 5 },
    ]);
  });
});

describe('手繪：簡化與平滑', () => {
  it('RDP 留下偏離超過容許誤差的點', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: 0 },
      { x: 3, y: 5 },
      { x: 4, y: 0 },
    ];
    expect(simplifyRDP(pts, 1)).toEqual([pts[0], pts[2], pts[3], pts[4]]);
    expect(simplifyRDP(pts, 10)).toEqual([pts[0], pts[4]]);
  });

  it('Catmull–Rom（張力 0.9）的把手；開放路徑頭尾收在點上', () => {
    const a = catmullRomAnchors(
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 60 },
      ],
      false,
      0.9,
    );
    expect(a[0]).toMatchObject({ inX: 0, inY: 0, outX: 9, outY: 0, smooth: true });
    expect(a[1].inX).toBeCloseTo(51);
    expect(a[1].inY).toBeCloseTo(-9);
    expect(a[1].outX).toBeCloseTo(69);
    expect(a[1].outY).toBeCloseTo(9);
    expect(a[2]).toMatchObject({ outX: 60, outY: 60 });
    expect(a[2].inY).toBeCloseTo(51);
  });
});

describe('正多邊形、星形', () => {
  it('第一個頂點在旋轉角的方向（範本是正上方）', () => {
    const p = regularPolygonPoints(500, 500, 292, 5);
    expect(p).toHaveLength(5);
    expect(p[0].x).toBeCloseTo(500);
    expect(p[0].y).toBeCloseTo(208);
    const s = starPoints(500, 500, 246, 96, 6);
    expect(s).toHaveLength(12);
    expect(s[0].y).toBeCloseTo(254);
    expect(Math.hypot(s[1].x - 500, s[1].y - 500)).toBeCloseTo(96);
    const r = regularPolygonPoints(0, 0, 10, 4, 0);
    expect(r[0].x).toBeCloseTo(10);
    expect(r[1].y).toBeCloseTo(10);
  });
});

describe('複本', () => {
  it('份數：對稱尺開啟且元素套用對稱時才複製，夾在 1～64', () => {
    expect(copyCountFor(sym({ count: 12 }), { symmetry: true })).toBe(12);
    expect(copyCountFor(sym({ count: 12 }), { symmetry: false })).toBe(1);
    expect(copyCountFor(sym({ enabled: false }), { symmetry: true })).toBe(1);
    expect(copyCountFor(sym({ count: 100 }), { symmetry: true })).toBe(64);
    expect(copyCountFor(sym({ count: 2.6 }), { symmetry: true })).toBe(3);
  });

  it('旋轉起始角＋k × 360°÷n（畫面上順時針）；鏡射只翻奇數複本；反轉換回到原點', () => {
    const s = sym({ count: 4 });
    const p = { x: 500, y: 400 };
    const q1 = transformPointForCopy(s, p, 1, 4);
    expect(q1.x).toBeCloseTo(600);
    expect(q1.y).toBeCloseTo(500);
    const m = sym({ count: 4, mirror: true });
    const a = { x: 520, y: 400 };
    const r1 = transformPointForCopy(m, a, 1, 4);
    expect(r1.x).toBeCloseTo(600);
    expect(r1.y).toBeCloseTo(480);
    for (const [s2, k] of [
      [sym({ count: 7, offset: 13 }), 3],
      [sym({ count: 6, mirror: true, offset: -40 }), 5],
    ] as const) {
      const back = inverseTransformPointForCopy(
        s2,
        transformPointForCopy(s2, a, k, s2.count),
        k,
        s2.count,
      );
      expect(back.x).toBeCloseTo(a.x);
      expect(back.y).toBeCloseTo(a.y);
    }
    /* n＝1：起始角不作用 */
    expect(transformPointForCopy(sym({ offset: 45 }), a, 0, 1)).toEqual(a);
  });

  it('出場名次：順時針、逆時針、兩側交錯', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => copySequenceRank(k, 6, 'clockwise', 'x'))).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect([0, 1, 2, 3, 4, 5].map((k) => copySequenceRank(k, 6, 'counter', 'x'))).toEqual([
      0, 5, 4, 3, 2, 1,
    ]);
    /* 出場順序 0、1、5、2、4、3 → 名次 */
    expect([0, 1, 2, 3, 4, 5].map((k) => copySequenceRank(k, 6, 'alternate', 'x'))).toEqual([
      0, 1, 3, 5, 4, 2,
    ]);
    expect(copySequenceRank(0, 1, 'random', 'x')).toBe(0);
  });

  it('固定隨機：以 id 的 FNV-1a 為種子洗牌，與舊版的亂數相同', () => {
    expect(hashString('')).toBe(2166136261);
    for (const seed of ['path-a', 'circle-1234', 'text-ᚱ', 'x']) {
      const a = mulberry32(hashString(seed));
      const b = legacyMulberry32(hashString(seed));
      for (let i = 0; i < 50; i++) expect(a()).toBe(b());
      const n = 12;
      const seq = Array.from({ length: n }, (_, i) => i);
      const rnd = legacyMulberry32(hashString(seed));
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [seq[i], seq[j]] = [seq[j], seq[i]];
      }
      const ranks = Array.from({ length: n }, (_, k) => copySequenceRank(k, n, 'random', seed));
      for (const [rank, copy] of seq.entries()) expect(ranks[copy]).toBe(rank);
    }
  });
});

describe('吸附', () => {
  const base = { snap: { ...DEFAULT_SNAP }, symmetry: sym(), zoom: 1 };

  it('取感應距離內最近的候選', () => {
    expect(snapPoint({ x: 153, y: 248 }, base)).toEqual({
      point: { x: 150, y: 250 },
      kind: 'grid',
    });
    expect(snapPoint({ x: 162, y: 238 }, base)).toBeNull();
    expect(
      snapPoint({ x: 496, y: 312 }, { ...base, snap: { ...DEFAULT_SNAP, grid: false } }),
    ).toEqual({
      point: { x: 500, y: 312 },
      kind: 'centerX',
    });
    /* 縮放 0.5：感應距離 22 畫布 px */
    expect(snapPoint({ x: 162, y: 238 }, { ...base, zoom: 0.5 })?.kind).toBe('grid');
  });

  it('對稱線保持半徑；角度以錨點為準；Alt 或關閉時不吸附', () => {
    const noGrid = { ...DEFAULT_SNAP, grid: false, center: false };
    const g = snapPoint({ x: 507, y: 300 }, { ...base, snap: noGrid });
    expect(g?.kind).toBe('guide');
    expect(g?.point.x).toBeCloseTo(500);
    expect(g?.point.y).toBeCloseTo(500 - Math.hypot(7, 200));
    const a = snapPoint(
      { x: 100, y: 3 },
      { ...base, snap: { ...noGrid, radial: false }, anchor: { x: 0, y: 0 } },
    );
    expect(a?.kind).toBe('angle');
    expect(a?.point.y).toBeCloseTo(0);
    expect(a?.point.x).toBeCloseTo(Math.hypot(100, 3));
    expect(snapPoint({ x: 153, y: 248 }, { ...base, disable: true })).toBeNull();
    expect(
      snapPoint({ x: 153, y: 248 }, { ...base, snap: { ...DEFAULT_SNAP, enabled: false } }),
    ).toBeNull();
  });
});

describe('對齊與分佈', () => {
  const b = (minX: number, minY: number, maxX: number, maxY: number) => ({
    minX,
    minY,
    maxX,
    maxY,
  });

  it('邊界與置中', () => {
    const ref = b(0, 0, 1000, 1000);
    const x = b(100, 200, 300, 260);
    expect(alignBoundsDelta(x, ref, 'left')).toEqual({ dx: -100, dy: 0 });
    expect(alignBoundsDelta(x, ref, 'center-x')).toEqual({ dx: 300, dy: 0 });
    expect(alignBoundsDelta(x, ref, 'right')).toEqual({ dx: 700, dy: 0 });
    expect(alignBoundsDelta(x, ref, 'top')).toEqual({ dx: 0, dy: -200 });
    expect(alignBoundsDelta(x, ref, 'center-y')).toEqual({ dx: 0, dy: 270 });
    expect(alignBoundsDelta(x, ref, 'bottom')).toEqual({ dx: 0, dy: 740 });
  });

  it('等距分佈：首尾不動、間隙相等', () => {
    const r = distributeBounds(
      [
        { id: 'a', bounds: b(0, 0, 10, 10), order: 0 },
        { id: 'c', bounds: b(90, 0, 100, 10), order: 1 },
        { id: 'b', bounds: b(20, 0, 50, 10), order: 2 },
      ],
      'x',
    );
    expect(r).toEqual([
      { id: 'a', delta: 0 },
      { id: 'b', delta: 15 },
      { id: 'c', delta: 0 },
    ]);
    expect(distributeBounds([{ id: 'a', bounds: b(0, 0, 1, 1), order: 0 }], 'x')).toEqual([]);
  });

  it('角度：最近的對稱線、扇形中央；從最大空隙切開等分', () => {
    const base = -Math.PI / 2;
    expect(nearestSymmetryAngle(-Math.PI / 2 + 0.3, base, 4)).toBeCloseTo(-Math.PI / 2);
    expect(nearestSymmetryAngle(-Math.PI / 2 + 0.3, base, 4, true)).toBeCloseTo(-Math.PI / 4);
    const r = distributePolarAngles([
      { id: 'a', angle: 0, order: 0 },
      { id: 'b', angle: 0.2, order: 1 },
      { id: 'c', angle: 1, order: 2 },
    ]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r[1].angle).toBeCloseTo(0.5);
    const wrap = distributePolarAngles([
      { id: 'a', angle: -0.5, order: 0 },
      { id: 'b', angle: 0.1, order: 1 },
      { id: 'c', angle: 0.5, order: 2 },
    ]);
    expect(wrap.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(wrap[1].angle - wrap[0].angle).toBeCloseTo(0.5);
    expect(
      distributePolarRadii([
        { id: 'a', radius: 10, order: 0 },
        { id: 'b', radius: 90, order: 1 },
        { id: 'c', radius: 20, order: 2 },
      ]),
    ).toEqual([
      { id: 'a', radius: 10 },
      { id: 'c', radius: 50 },
      { id: 'b', radius: 90 },
    ]);
  });
});

describe('節點編輯與平移', () => {
  const pts = [pathPoint(0, 0), pathPoint(30, 0), pathPoint(30, 60)];

  it('平滑化：把手沿「前一點→後一點」、長度各為距離的 1/3；轉角化收回', () => {
    const s = smoothNode(pts, 1, false);
    const len = Math.hypot(30, 60);
    expect(s[1].smooth).toBe(true);
    expect(s[1].inX).toBeCloseTo(30 - (30 / len) * 10);
    expect(s[1].inY).toBeCloseTo(0 - (60 / len) * 10);
    expect(s[1].outX).toBeCloseTo(30 + (30 / len) * 20);
    expect(s[1].outY).toBeCloseTo((60 / len) * 20);
    /* 開放路徑的頭：前一側長度 0 */
    const h = smoothNode(pts, 0, false);
    expect(h[0]).toMatchObject({ inX: 0, inY: 0 });
    expect(h[0].outX).toBeCloseTo(10);
    expect(cornerNode(s, 1)[1]).toEqual({ ...pts[1], smooth: false });
  });

  it('反轉：順序倒過來、把手互換', () => {
    const p = [pathPoint(0, 0, null, { x: 5, y: 1 }), pathPoint(10, 0, { x: 7, y: 2 }, null)];
    const r = reversePathPoints(p);
    expect(r[0]).toMatchObject({ x: 10, inX: 10, outX: 7, outY: 2 });
    expect(r[1]).toMatchObject({ x: 0, inX: 5, inY: 1, outX: 0 });
  });

  it('平移整個元素（節點與把手一起）', () => {
    const el = createPath([pathPoint(0, 0, { x: -1, y: -1 }, { x: 1, y: 1 })]);
    const t = translated(el, 18, 18);
    expect(t.points[0]).toMatchObject({ x: 18, y: 18, inX: 17, inY: 17, outX: 19, outY: 19 });
    expect(translated(createCircle(1, 2, 3), 18, 18)).toMatchObject({ x: 19, y: 20, rx: 3 });
  });
});
