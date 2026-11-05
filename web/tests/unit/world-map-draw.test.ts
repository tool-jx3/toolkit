/**
 * 世界地圖產生器：素材、樹、山的圖形（規格 F09、F31、3.4、3.9）——用記錄座標的假 canvas 量：
 * 每種都畫得出東西、不超出範圍（畫面上的山林用預先畫好的小圖，超出小圖的範圍會被切掉）。
 */
import { describe, expect, it } from 'vitest';
import { drawAsset } from '@/tools/world-map/draw/assets';
import { drawMountain, drawReeds, drawTree } from '@/tools/world-map/draw/marks';
import { buildColors, deepForest, reliefColors } from '@/tools/world-map/draw/palette';
import { ASSETS } from '@/tools/world-map/model/assets';
import { THEME_IDS } from '@/tools/world-map/model/types';

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

function boundsCtx() {
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, paints: 0 };
  const pt = (x: number, y: number) => {
    const X = m[0] * x + m[2] * y + m[4];
    const Y = m[1] * x + m[3] * y + m[5];
    b.x0 = Math.min(b.x0, X);
    b.y0 = Math.min(b.y0, Y);
    b.x1 = Math.max(b.x1, X);
    b.y1 = Math.max(b.y1, Y);
  };
  const box = (x: number, y: number, w: number, h: number) => {
    pt(x, y);
    pt(x + w, y + h);
    pt(x + w, y);
    pt(x, y + h);
  };
  const methods: Record<string, (...a: number[]) => void> = {
    save: () => stack.push([...m] as M),
    restore: () => {
      m = stack.pop() ?? m;
    },
    translate: (x, y) => {
      m = mul(m, [1, 0, 0, 1, x, y]);
    },
    scale: (x, y) => {
      m = mul(m, [x, 0, 0, y, 0, 0]);
    },
    rotate: (a) => {
      m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    },
    moveTo: (x, y) => pt(x, y),
    lineTo: (x, y) => pt(x, y),
    quadraticCurveTo: (cx, cy, x, y) => {
      pt(cx, cy);
      pt(x, y);
    },
    bezierCurveTo: (a, b2, c, d, x, y) => {
      pt(a, b2);
      pt(c, d);
      pt(x, y);
    },
    arc: (x, y, r) => box(x - r, y - r, 2 * r, 2 * r),
    ellipse: (x, y, rx, ry) => box(x - rx, y - ry, 2 * rx, 2 * ry),
    rect: (x, y, w, h) => box(x, y, w, h),
    roundRect: (x, y, w, h) => box(x, y, w, h),
    fillRect: (x, y, w, h) => {
      box(x, y, w, h);
      b.paints++;
    },
    strokeRect: (x, y, w, h) => box(x, y, w, h),
    fill: () => {
      b.paints++;
    },
    stroke: () => {
      b.paints++;
    },
  };
  const props: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) =>
      typeof k === 'string' && k in methods
        ? methods[k]
        : typeof k === 'string' && k in props
          ? props[k]
          : () => {},
    set: (_t, k, v) => {
      props[k as string] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, b };
}

describe('32 種素材（F31）', () => {
  it('每種都畫得出東西、在 ±40 × −42～＋30 的範圍裡（各主題、積雪、港口的四個方向）', () => {
    expect(ASSETS.length).toBe(32);
    for (const theme of THEME_IDS)
      for (const a of ASSETS)
        for (const snow of [0, 1]) {
          const { ctx, b } = boundsCtx();
          drawAsset(ctx, a.kind, { theme, climate: { snow, desert: 0, wet: 0 }, dock: 'down' });
          expect(b.paints, a.kind).toBeGreaterThan(0);
          expect(b.x0, a.kind).toBeGreaterThanOrEqual(-40);
          expect(b.x1, a.kind).toBeLessThanOrEqual(40);
          expect(b.y0, a.kind).toBeGreaterThanOrEqual(-42);
          expect(b.y1, a.kind).toBeLessThanOrEqual(31);
        }
    for (const dock of ['left', 'right', 'up', 'down'] as const) {
      const { ctx, b } = boundsCtx();
      drawAsset(ctx, 'port', { theme: 'parchment', dock });
      expect(Math.max(-b.x0, b.x1, -b.y0, b.y1)).toBeLessThanOrEqual(40);
    }
  });

  it('不存在的種類什麼都不畫', () => {
    const { ctx, b } = boundsCtx();
    drawAsset(ctx, 'nope', { theme: 'parchment' });
    expect(b.paints).toBe(0);
  });
});

describe('山林的圖形在小圖的範圍裡（F09、F13）', () => {
  it('樹：所有變體、積雪、深度都在 (−17, −18, 34, 36) 裡', () => {
    for (const theme of THEME_IDS)
      for (let v = 0; v < 6; v++)
        for (const snow of [0, 0.5, 1])
          for (const density of [0, 1]) {
            const { ctx, b } = boundsCtx();
            drawTree(
              ctx,
              deepForest(reliefColors(theme, { snow, desert: 0, wet: 0 }), density),
              (v + 0.5) / 6,
              snow,
            );
            expect(b.x0).toBeGreaterThanOrEqual(-17);
            expect(b.x1).toBeLessThanOrEqual(17);
            expect(b.y0).toBeGreaterThanOrEqual(-18);
            expect(b.y1).toBeLessThanOrEqual(18);
          }
  });

  it('山：所有變體、積雪、帶綠都在 (−40, −57, 80, 69) 裡', () => {
    for (let v = 0; v < 16; v++)
      for (const snow of [0, 1])
        for (const wood of [0, 1]) {
          const { ctx, b } = boundsCtx();
          drawMountain(
            ctx,
            reliefColors('parchment', { snow, desert: 0, wet: 0 }),
            (v + 0.5) / 16,
            snow,
            wood,
          );
          expect(b.x0).toBeGreaterThanOrEqual(-40);
          expect(b.x1).toBeLessThanOrEqual(40);
          expect(b.y0).toBeGreaterThanOrEqual(-57);
          expect(b.y1).toBeLessThanOrEqual(12);
        }
  });

  it('蘆葦叢畫得出東西', () => {
    const { ctx, b } = boundsCtx();
    drawReeds(ctx, buildColors('night'), '#557755', 1);
    expect(b.paints).toBeGreaterThan(2);
  });
});
