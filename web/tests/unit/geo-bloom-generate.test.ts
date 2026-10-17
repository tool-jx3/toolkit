/**
 * 幾何花紋產生器：產生的資料（規格 3.1～3.3）。
 * - 和原作相同：同樣的種子與設定，圖形／線／點的數量和原作（al1scut/tkmizGeo 3097b39，在 Chromium 裡跑）量到的相同。
 *   逐值（序列化後的 SHA-256）的比較在 e2e（Chromium）做：Node 的 V8 和 Chromium 的 V8 的 Math.cos／sin／pow
 *   有約 3% 的輸入差最後一個位元（實測 Node 22 對 Chromium 141），座標因此不會逐位元相同；同一個瀏覽器裡新版和原作用的是同一個 Math。
 * - 空間格子加速和逐一比對的結果完全相同（隨機的設定與種子）；
 * - 大畫布（8000 × 8000、圖形 5000、線 10000）幾秒內算完（原作約 60 秒）。
 */
import { describe, expect, it } from 'vitest';
import { createRandom } from '@/core/timeline/random';
import { generateBloom } from '@/tools/geo-bloom/generate';
import { DEFAULT_SETTINGS, resolveConfig } from '@/tools/geo-bloom/settings';
import { canon, GOLDEN, HUGE, type Overrides, only, settingsWith } from '../helpers/geoBloomCases';

const run = (o: Overrides, index?: boolean) =>
  generateBloom(resolveConfig(settingsWith(o)), o.seed ?? DEFAULT_SETTINGS.seed, { index });

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
    expect([scene.shapes.length, scene.lines.length, scene.dots.length]).toEqual([5000, 5021, 7]);
    expect(ms).toBeLessThan(8000);
  });
});

describe('空間格子加速不改變結果', () => {
  it('隨機的設定與種子：加速與逐一比對的結果逐值相同', () => {
    const rng = createRandom('geo-bloom-index');
    const modes = ['retry', 'line', 'skip'] as const;
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
        regularity: rng.int(0, 100),
        avoidOverlap: rng.next() < 0.7,
        overlapMode: rng.pick(modes),
        gap: rng.int(0, 120),
        lineAvoid: rng.next() < 0.5,
        inBounds: rng.next() < 0.6,
        fromEdge: rng.next() < 0.7,
        lineWidth: rng.int(1, 160) / 4,
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
        inBounds: false,
        shrink: 100,
      };
      expect(canon(run(o, true))).toBe(canon(run(o, false)));
    }
  });
});

describe('其他規則', () => {
  it('同一個種子、同樣的設定，每次都一樣', () => {
    expect(canon(run({ seed: 'repeat' }))).toBe(canon(run({ seed: 'repeat' })));
  });

  it('中央圓在畫布正中央、第 0 代，只會是圓或同心圓', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const s = run({ seed, width: 1000, height: 600, shapes: only('square') });
      const root = s.shapes[0];
      expect([root.x, root.y, root.depth]).toEqual([500, 300, 0]);
      expect(['circle', 'rings']).toContain(root.kind);
      expect(s.shapes.slice(1).every((x) => x.kind === 'square')).toBe(true);
    }
  });

  it('最大深度 0：只有中央圓；線的最多數 0：沒有線', () => {
    const a = run({ seed: 'x', maxDepth: 0 });
    expect([a.shapes.length, a.lines.length, a.dots.length]).toEqual([1, 0, 0]);
    const b = run({ seed: 'x', maxLines: 0 });
    expect([b.shapes.length, b.lines.length]).toEqual([1, 0]);
  });

  it('一個種類都沒勾：子圖形全部是圓', () => {
    const s = run({ seed: 'none', shapes: only(), maxShapes: 80, pBranch: 100, pShape: 100 });
    expect(s.shapes.length).toBeGreaterThan(10);
    expect(s.shapes.slice(1).every((x) => x.kind === 'circle')).toBe(true);
  });

  it('同心圓的層數在 2～最多層數之間，半徑由外而內', () => {
    const s = run({ seed: 'rings', shapes: only('rings'), maxRings: 6, maxShapes: 100 });
    const rings = s.shapes.filter((x) => x.kind === 'rings');
    expect(rings.length).toBeGreaterThan(5);
    for (const x of rings) {
      const list = x.rings ?? [];
      expect(list.length).toBeGreaterThanOrEqual(2);
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
});
