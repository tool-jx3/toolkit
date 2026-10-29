/**
 * 幾何花紋產生器：產生的資料（規格 3.1～3.3、3.11～3.14）。
 * - 和原作相同：同樣的種子與設定，圖形／線／點的數量和原作（al1scut/tkmizGeo edb6828，在 Chromium 裡跑）量到的相同。
 *   逐值（序列化後的 SHA-256）的比較在 e2e（Chromium）做：Node 的 V8 和 Chromium 的 V8 的 Math.cos／sin／pow
 *   有約 3% 的輸入差最後一個位元（實測 Node 22 對 Chromium 141），座標因此不會逐位元相同；同一個瀏覽器裡新版和原作用的是同一個 Math。
 * - 空間格子加速（圖形與線）和逐一比對的結果完全相同（隨機的設定與種子，含原作 2026-10 的新設定）；
 * - 大畫布（8000 × 8000、圖形 5000、線 10000）幾秒內算完（原作約 26 秒）；
 * - 原作 2026-10 的規則：三角形、摩斯環、摩斯橋、放射線的起點、貼著放、線的丟失、線不跨線、中央圖形的意義。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline/random';
import {
  type BloomScene,
  type BloomShape,
  generateBloom,
  rootMeaning,
  sceneStats,
  visibleRings,
} from '@/tools/geo-bloom/generate';
import {
  DEFAULT_SETTINGS,
  OVERLAP_MODES,
  resolveConfig,
  START_RINGS,
  TRI_RINGS,
} from '@/tools/geo-bloom/settings';
import { segmentsCross } from '@/tools/geo-bloom/spatial';
import {
  canon,
  GOLDEN,
  HUGE,
  HUGE_COUNTS,
  type Overrides,
  only,
  settingsWith,
} from '../helpers/geoBloomCases';

const run = (o: Overrides, index?: boolean) =>
  generateBloom(resolveConfig(settingsWith(o)), o.seed ?? DEFAULT_SETTINGS.seed, { index });

const TAU = Math.PI * 2;

describe('數量和原作相同（3.1～3.3）', () => {
  for (const g of GOLDEN) {
    it(g.name, () => {
      const scene = run(g.o);
      expect([scene.shapes.length, scene.lines.length, scene.dots.length]).toEqual(g.counts);
    });
  }

  it('大畫布 8000 × 8000、圖形 5000、線 10000：數量相同，而且幾秒內算完', () => {
    const t0 = performance.now();
    const scene = run(HUGE);
    const ms = performance.now() - t0;
    expect([scene.shapes.length, scene.lines.length, scene.dots.length]).toEqual(HUGE_COUNTS);
    expect(ms).toBeLessThan(8000);
  });
});

describe('空間格子加速不改變結果', () => {
  it('隨機的設定與種子（含三角形、摩斯環、摩斯橋、貼著放、線不跨線、刻種子）：加速與逐一比對的結果逐值相同', () => {
    const rng = createRandom('geo-bloom-index');
    for (let i = 0; i < 60; i++) {
      const o: Overrides = {
        seed: `case-${i}`,
        width: rng.int(64, 3000),
        height: rng.int(64, 3000),
        maxShapes: rng.int(1, 400),
        maxLines: rng.int(0, 800),
        branchMin: rng.int(0, 12),
        branchMax: rng.int(0, 12),
        maxDepth: rng.int(0, 10),
        maxRings: rng.int(1, 8),
        minRings: rng.int(2, 8),
        rootMin: rng.int(10, 600),
        rootMax: rng.int(10, 800),
        childMin: rng.int(1, 200),
        childMax: rng.int(1, 300),
        shrink: rng.int(30, 100),
        lineMin: rng.int(1, 400),
        lineMax: rng.int(1, 600),
        pShape: rng.int(0, 100),
        pBranch: rng.int(0, 100),
        pDot: rng.int(0, 100),
        pAttach: rng.next() < 0.4 ? rng.int(0, 100) : 0,
        attachDepth: rng.int(-50, 80),
        pDrop: rng.int(0, 100),
        regularity: rng.int(0, 100),
        avoidOverlap: rng.next() < 0.7,
        overlapMode: rng.pick(OVERLAP_MODES),
        gap: rng.int(0, 120),
        lineAvoid: rng.next() < 0.5,
        noCross: rng.next() < 0.5,
        inBounds: rng.next() < 0.6,
        fromEdge: rng.next() < 0.7,
        lineWidth: rng.int(1, 160) / 4,
        rootRings: rng.next() < 0.5,
        startRing: rng.pick(START_RINGS),
        endAtRing: rng.next() < 0.5,
        morse: rng.next() < 0.7,
        bridges: rng.next() < 0.5,
        pBridge: rng.int(0, 100),
        triRing: rng.pick(TRI_RINGS),
        pTri: rng.int(0, 100),
        code: rng.next() < 0.3,
        codeVersion: rng.pick(['v1', 'v2'] as const),
        codeSettings: rng.next() < 0.5,
        shapes: {
          triCore: rng.next() < 0.4,
          triRing: rng.next() < 0.4,
          square: rng.next() < 0.7,
          semi: rng.next() < 0.7,
        },
      };
      const fast = run(o, true);
      const slow = run(o, false);
      expect(canon(fast), JSON.stringify(o)).toBe(canon(slow));
    }
  });

  it('碰到極大的圖形（中央圓 2000 px、子圖形 1200 px）也相同', () => {
    for (const seed of ['g1', 'g2', 'g3']) {
      const o: Overrides = {
        seed,
        width: 8000,
        height: 8000,
        rootMin: 1500,
        rootMax: 2000,
        childMin: 400,
        childMax: 1200,
        maxShapes: 200,
        maxLines: 400,
        lineAvoid: true,
        noCross: true,
        inBounds: false,
        shrink: 100,
      };
      expect(canon(run(o, true))).toBe(canon(run(o, false)));
    }
  });
});

/** 畫的順序和三種資料的數量對得上 */
function orderMatches(s: BloomScene) {
  const count = (k: string) => [...s.order].filter((c) => c === k).length;
  return (
    count('s') === s.shapes.length && count('l') === s.lines.length && count('d') === s.dots.length
  );
}

describe('其他規則', () => {
  it('同一個種子、同樣的設定，每次都一樣', () => {
    expect(canon(run({ seed: 'repeat' }))).toBe(canon(run({ seed: 'repeat' })));
  });

  it('中央圓在畫布正中央、第 0 代；預設一定是同心圓，關閉時是圓或同心圓', () => {
    const kinds = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const s = run({ seed, width: 1000, height: 600, shapes: only('square') });
      const root = s.shapes[0];
      expect([root.x, root.y, root.depth, root.kind]).toEqual([500, 300, 0, 'rings']);
      expect(s.shapes.slice(1).every((x) => x.kind === 'square')).toBe(true);
      kinds.add(run({ seed, rootRings: false }).shapes[0].kind);
    }
    expect([...kinds].sort()).toEqual(['circle', 'rings']);
  });

  it('最大深度 0：只有中央圓；線的最多數 0：沒有線', () => {
    const a = run({ seed: 'x', maxDepth: 0 });
    expect([a.shapes.length, a.lines.length, a.dots.length]).toEqual([1, 0, 0]);
    const b = run({ seed: 'x', maxLines: 0 });
    expect([b.shapes.length, b.lines.length]).toEqual([1, 0]);
  });

  it('一般的種類都沒勾：子圖形全部是圓；只勾三角形時全部是三角形', () => {
    const s = run({ seed: 'none', shapes: only(), maxShapes: 80, pBranch: 100, pShape: 100 });
    expect(s.shapes.length).toBeGreaterThan(10);
    expect(s.shapes.slice(1).every((x) => x.kind === 'circle')).toBe(true);
    const t = run({ seed: 'tri', shapes: only('triCore'), maxShapes: 80, pBranch: 100 });
    expect(t.shapes.length).toBeGreaterThan(5);
    expect(t.shapes.slice(1).every((x) => x.kind === 'rings' && x.tri?.mode === 'core')).toBe(true);
  });

  it('同心圓的層數在最少～最多層數之間，半徑由外而內（三角心在最內層補的一層除外）', () => {
    const s = run({
      seed: 'rings',
      shapes: only('rings'),
      minRings: 3,
      maxRings: 6,
      maxShapes: 100,
    });
    const rings = s.shapes.filter((x) => x.kind === 'rings').slice(1);
    expect(rings.length).toBeGreaterThan(5);
    for (const x of rings) {
      const list = (x.rings ?? []).map((g) => g.r);
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.length).toBeLessThanOrEqual(6);
      expect(list[0]).toBe(x.r);
      for (let i = 1; i < list.length; i++) expect(list[i]).toBeLessThan(list[i - 1]);
    }
  });

  it('收在畫布內：子圖形整個在畫布內', () => {
    const s = run({ seed: 'bounds', width: 900, height: 500, maxShapes: 300, maxLines: 600 });
    for (const x of s.shapes.slice(1)) {
      expect(x.x - x.r).toBeGreaterThanOrEqual(-1e-9);
      expect(x.y - x.r).toBeGreaterThanOrEqual(-1e-9);
      expect(x.x + x.r).toBeLessThanOrEqual(900 + 1e-9);
      expect(x.y + x.r).toBeLessThanOrEqual(500 + 1e-9);
    }
  });

  it('不和既有圖形重疊：子圖形的外接圓之間至少空出空隙', () => {
    const s = run({ seed: 'gap', gap: 25, maxShapes: 200, maxLines: 500 });
    for (let i = 0; i < s.shapes.length; i++)
      for (let j = i + 1; j < s.shapes.length; j++) {
        const a = s.shapes[i];
        const b = s.shapes[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r + 25);
      }
  });

  it('畫的順序：中央圖形先畫；連到子圖形的線緊接著那個子圖形；點緊接著它的線', () => {
    const s = run({ seed: 'order', maxShapes: 120, maxLines: 240 });
    expect(orderMatches(s)).toBe(true);
    expect(s.order[0]).toBe('s');
    let li = 0;
    for (let i = 1; i < s.order.length; i++) {
      const k = s.order[i];
      if (k === 'l') {
        const line = s.lines[li++];
        expect(s.order[i + 1] === 's').toBe(!!line.child);
      }
      if (k === 'd') expect(s.order[i - 1]).toBe('l');
    }
  });
});

describe('原作 2026-10 的新規則', () => {
  it('三角形：三角心藏起最內層（三角形的外接圓＝那一層）；三角環內接在第一或第二圈；每個三角形最多長 3 條線', () => {
    const s = run({
      seed: 'tri-rules',
      shapes: only('triCore', 'triRing'),
      triRing: 'random',
      maxShapes: 200,
      maxLines: 400,
      pBranch: 100,
      branchMin: 6,
      branchMax: 9,
    });
    let cores = 0;
    let rings = 0;
    const out = new Map<BloomShape, number>();
    const tris = s.shapes.slice(1).filter((x) => x.tri);
    expect(tris.length).toBeGreaterThan(10);
    for (const x of tris) {
      const list = x.rings ?? [];
      const tri = x.tri as NonNullable<BloomShape['tri']>;
      if (tri.mode === 'core') {
        cores++;
        expect(list[list.length - 1].hidden).toBe(true);
        expect(tri.R).toBe(list[list.length - 1].r);
        expect(x.fill).toBe(false);
      } else {
        rings++;
        const host = list.find((g) => g.r === tri.R);
        expect(host?.segs).toBeNull();
        expect(host?.span).toBe(TAU);
      }
    }
    expect(cores).toBeGreaterThan(0);
    expect(rings).toBeGreaterThan(0);
    /* 線的起點離父圖形中心＝三角形外接圓的一半（邊的中點）：數每個三角形長出的線 */
    for (const l of s.lines) {
      const parent = tris.find(
        (t) => Math.abs(Math.hypot(l.x1 - t.x, l.y1 - t.y) - (t.tri?.R ?? 0) / 2) < 1e-6,
      );
      if (parent) out.set(parent, (out.get(parent) ?? 0) + 1);
    }
    for (const n of out.values()) expect(n).toBeLessThanOrEqual(3);
  });

  it('摩斯環：保留的內圈是實線，外面的圈排成點線（符號都在那一圈上，依序不重疊）', () => {
    const s = run({
      seed: 'morse',
      shapes: only('rings'),
      maxShapes: 80,
      solidFollow: false,
      solidInner: 1,
    });
    for (const x of s.shapes.slice(1)) {
      const list = x.rings ?? [];
      expect(list[list.length - 1].segs).toBeNull();
      for (const g of list.slice(0, -1)) {
        expect(g.segs).not.toBeNull();
        const segs = g.segs ?? [];
        for (let i = 0; i < segs.length; i++) {
          expect(segs[i].a1).toBeGreaterThan(segs[i].a0);
          if (i) expect(segs[i].a0).toBeGreaterThan(segs[i - 1].a1);
        }
        if (segs.length) expect(segs[segs.length - 1].a1 - segs[0].a0).toBeLessThan(TAU);
      }
    }
    /* 關閉時沒有摩斯環（中央圖形依種子可能有一圈） */
    const off = run({ seed: 'morse', shapes: only('rings'), maxShapes: 80, morse: false });
    expect(off.shapes.slice(1).every((x) => (x.rings ?? []).every((g) => g.segs === null))).toBe(
      true,
    );
  });

  it('摩斯橋：外圈的長點連到內圈；開關它不影響其他的圖形（用自己的一串亂數）', () => {
    const o: Overrides = {
      seed: 'bridge-rules',
      solidFollow: false,
      solidInner: 1,
      maxRings: 7,
      maxShapes: 120,
    };
    const off = run(o);
    const on = run({ ...o, bridges: true, pBridge: 100 });
    expect(sceneStats(on).bridges).toBeGreaterThan(10);
    const strip = (sc: BloomScene) =>
      canon({ ...sc, shapes: sc.shapes.map((x) => ({ ...x, bridges: undefined })) });
    expect(strip(on)).toBe(strip(off));
    for (const x of on.shapes)
      for (const b of x.bridges ?? []) {
        const list = x.rings ?? [];
        const i = list.findIndex((g) => g.r === b.r1);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(list[i + 1].r).toBe(b.r0);
        expect(list[i].segs?.some((g) => g.dash && g.a0 <= b.a + 1e-9 && b.a <= g.a1 + 1e-9)).toBe(
          true,
        );
      }
  });

  it('放射線的起點：第一圈、第二圈、中心', () => {
    const o: Overrides = { seed: 'start', shapes: only('rings'), maxShapes: 60, regularity: 100 };
    for (const [startRing, pick] of [
      ['ring1', (x: BloomShape) => x.rings?.[x.rings.length - 1].r],
      ['ring2', (x: BloomShape) => x.rings?.[x.rings.length - 2].r],
      ['center', () => 0],
    ] as const) {
      const s = run({ ...o, startRing, rootRings: true });
      const root = s.shapes[0];
      if (root.tri || rootMeaning('start').motion) continue;
      const r = pick(root) as number;
      const fromRoot = s.lines.filter(
        (l) => Math.abs(Math.hypot(l.x1 - root.x, l.y1 - root.y) - r) < 1e-6,
      );
      expect(fromRoot.length, startRing).toBeGreaterThan(0);
    }
  });

  it('貼著放：子圖形不畫線，貼在父圖形的邊上（圓：中心距離＝兩個半徑，嵌進去時再減）', () => {
    const s = run({
      seed: 'attach-rules',
      pAttach: 100,
      attachDepth: 25,
      shapes: only('circle'),
      maxShapes: 40,
      startRing: 'edge',
    });
    const attached = s.shapes.filter((x) => x.attached);
    expect(attached.length).toBeGreaterThan(3);
    expect(s.lines.length).toBe(0);
    for (const c of attached) {
      const ok = s.shapes.some(
        (p) => p !== c && Math.abs(Math.hypot(c.x - p.x, c.y - p.y) - (p.r + c.r * 0.75)) < 1e-6,
      );
      expect(ok).toBe(true);
    }
  });

  it('線的丟失：只丟連到子圖形的線；丟失率不影響產生的圖形（用自己的一串亂數）', () => {
    const o: Overrides = { seed: 'drop-rules', maxShapes: 150, maxLines: 300 };
    const keep = run(o);
    const drop = run({ ...o, pDrop: 50 });
    const st = sceneStats(drop);
    expect(st.dropped).toBeGreaterThan(5);
    expect(st.lines + st.dropped).toBe(drop.lines.length);
    expect(drop.lines.every((l) => !l.dropped || l.child)).toBe(true);
    const strip = (sc: BloomScene) =>
      canon({ ...sc, lines: sc.lines.map((l) => ({ ...l, dropped: false })) });
    expect(strip(drop)).toBe(strip(keep));
    const all = sceneStats(run({ ...o, pDrop: 100 }));
    expect(all.lines).toBe(drop.lines.filter((l) => !l.child).length);
  });

  it('線不跨過既有的線：任兩條線都沒有交叉（線接在子圖形外圈時；接到內圈的那一段不檢查，照原作）', () => {
    const s = run({
      seed: 'cross-rules',
      noCross: true,
      shapes: only('circle', 'rings'),
      startRing: 'edge',
      maxShapes: 200,
      maxLines: 400,
      maxDepth: 8,
      avoidOverlap: false,
      inBounds: false,
    });
    expect(s.lines.length).toBeGreaterThan(100);
    for (let i = 0; i < s.lines.length; i++)
      for (let j = i + 1; j < s.lines.length; j++) {
        const a = s.lines[i];
        const b = s.lines[j];
        expect(segmentsCross(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)).toBe(false);
      }
  });

  it('中央圖形的意義：同一個種子一定相同；說話中＝三角心、中心的樣子、前進／伸長＝三條線', () => {
    expect(rootMeaning('abc')).toEqual(rootMeaning('abc'));
    const seen = { speak: false, big: false, none: false, motion: false };
    for (let i = 0; i < 40; i++) {
      const seed = `meaning-${i}`;
      const m = rootMeaning(seed);
      const s = run({ seed, maxShapes: 60 });
      const root = s.shapes[0];
      expect(root.core).toBe(m.core);
      expect(root.fill).toBe(false);
      if (m.state === 'speak') {
        seen.speak = true;
        expect(root.tri?.mode).toBe('core');
      }
      if (m.core === 'big') seen.big = true;
      if (m.core === 'none') seen.none = true;
      /* 工作：最內層實線或摩斯環（伸長中可能再往內加一層實線，那時不看） */
      if (m.motion !== 'extend') {
        const first = visibleRings(root).at(-1);
        expect(first?.segs === null).toBe(m.work === 'yes');
      }
      if (m.motion) {
        seen.motion = true;
        const k = m.motion === 'forward' ? 1 : 2;
        const vis = visibleRings(root);
        const r = vis[vis.length - k].r;
        const fromRoot = s.lines.filter(
          (l) => Math.abs(Math.hypot(l.x1 - root.x, l.y1 - root.y) - r) < 1e-6,
        );
        expect(fromRoot.length).toBeLessThanOrEqual(3);
      }
    }
    expect(seen).toEqual({ speak: true, big: true, none: true, motion: true });
  });

  it('中央是圓時沒有意義（原作會停住，D13）：照常長線', () => {
    for (const seed of ['abc', 'b2', 'b4']) {
      const s = run({ seed, rootRings: false });
      if (s.shapes[0].kind !== 'circle') continue;
      expect(s.shapes[0].core).toBeUndefined();
      expect(s.lines.length).toBeGreaterThan(0);
    }
  });
});
