/**
 * 逐字透視的誤差（lyric-fx 規格 3.6、D14）：每個字的中心用精確的投影、字形用那一點的局部線性近似（glyphAffine）。
 * 量法：預設的透視（X 50、Y 30、補償 3），句子的錨點在畫面的四個角落與中央，字身＝[0, 字寬] × [−0.88, 0.12] 字級
 * （中日韓字），在字身的邊上取 41 × 41 個點，比較近似和真正的投影差多少 px。
 */
import { describe, expect, it } from 'vitest';
import { glyphAffine, localAffine, type Perspective, perspectiveAt, project } from '@/core/lyricfx';
import { GLYPH_CENTER_UP } from '@/core/lyricfx/styles/scatter';

type M6 = [number, number, number, number, number, number];
const apply = (m: M6, u: number, v: number) => ({
  x: m[4] + m[0] * u + m[2] * v,
  y: m[5] + m[1] * u + m[3] * v,
});

/** 一個字在 (X, Y)（基線起點）時，字身範圍內近似與投影的最大差距 */
function maxError(p: Perspective, X: number, Y: number, size: number, m: M6): number {
  let worst = 0;
  const N = 40;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const u = (size * i) / N;
      const v = size * (-0.88 + j / N);
      const a = apply(m, u, v);
      const b = project(p, X + u, Y + v);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
  return worst;
}

function worstCase(size: number) {
  const W = 1920;
  const H = 1080;
  let center = 0;
  let origin = 0;
  for (const [x, y] of [
    [80, 80],
    [1700, 80],
    [80, 1000],
    [1700, 1000],
    [960, 540],
  ]) {
    const p = perspectiveAt(x, y, W, H, 50e-6, 30e-5, 0.03);
    /* 句子裡的字：錨點附近到往右 1,400 px */
    for (const dx of [0, 400, 800, 1400]) {
      const X = Math.min(W, x + dx);
      const Y = y;
      center = Math.max(
        center,
        maxError(p, X, Y, size, glyphAffine(p, X, Y, size / 2, -size * GLYPH_CENTER_UP)),
      );
      origin = Math.max(origin, maxError(p, X, Y, size, localAffine(p, X, Y)));
    }
  }
  return { center, origin };
}

describe('逐字透視的誤差（D14）', () => {
  it('中心的位置是精確的投影', () => {
    const p = perspectiveAt(1700, 1000, 1920, 1080, 50e-6, 30e-5, 0.03);
    const m = glyphAffine(p, 1500, 900, 18, -14);
    const c = apply(m, 18, -14);
    const q = project(p, 1518, 886);
    expect(c.x).toBeCloseTo(q.x, 9);
    expect(c.y).toBeCloseTo(q.y, 9);
  });
  it('預設字級 37 px：最大約 0.22 px（在基線起點近似時約 0.39 px）', () => {
    const e = worstCase(37);
    expect(e.center).toBeLessThan(0.24);
    expect(e.origin).toBeGreaterThan(e.center * 1.6);
  });
  it('60 px 約 0.6 px、80 px 約 1.05 px、133 px（上限）約 2.9 px', () => {
    expect(worstCase(60).center).toBeLessThan(0.62);
    expect(worstCase(80).center).toBeLessThan(1.1);
    expect(worstCase(133).center).toBeLessThan(3);
  });
});
