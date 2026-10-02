/**
 * core/image 濾鏡的快速路徑（bg-motion 實作時為匯出速度改寫）：疊層（fill、gradient、glow、vignette）的專用混合算式、
 * 只跟畫面大小有關的不透明度圖快取、逐列推進的垂直模糊，結果都要與「逐像素呼叫 blendChannel」的直接算法相同。
 */
import { describe, expect, it } from 'vitest';
import {
  applyFilterOps,
  type BlendMode,
  blendChannel,
  blurPlane,
  type FilterOp,
  type GradientStop,
} from '@/core/image';

const W = 53;
const H = 37;
const IMG = (() => {
  const a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      a.set([(x * 9 + y * 2) & 255, (x * y + 17) & 255, (x * 3 + y * 7) & 255, 255], o);
    }
  return a;
})();
const MODES: BlendMode[] = [
  'normal',
  'screen',
  'multiply',
  'overlay',
  'soft-light',
  'lighten',
  'darken',
  'add',
];

/** 直接算法：每個像素依 (x, y) 求顏色與不透明度，呼叫 blendChannel 混合，最後四捨五入、夾在 0～255 */
function naive(
  mode: BlendMode,
  at: (fx: number, fy: number) => { r: number; g: number; b: number; a: number },
): number[] {
  const out: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const c = at(x / (W - 1), y / (H - 1));
      for (let k = 0; k < 3; k++) {
        const v = IMG[o + k];
        const p = [c.r, c.g, c.b][k];
        const r = c.a > 0 ? v + (blendChannel(mode, v, p) - v) * c.a : v;
        out.push(Math.round(Math.max(0, Math.min(255, r))));
      }
    }
  return out;
}
const rgb = (img: Uint8ClampedArray) => Array.from(img).filter((_, i) => i % 4 !== 3);
const maxDiff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

describe('疊層的快速路徑與直接算法相同', () => {
  it('fill：每種混合模式', () => {
    for (const blend of MODES) {
      const op: FilterOp = { op: 'fill', color: [200, 40, 120], alpha: 0.55, blend };
      const got = rgb(applyFilterOps(IMG, W, H, [op]));
      const want = naive(blend, () => ({ r: 200, g: 40, b: 120, a: 0.55 }));
      /* 實作以 Float32 存中間值，四捨五入時可能差 1 */
      expect(maxDiff(got, want), blend).toBeLessThanOrEqual(1);
    }
  });
  it('gradient：每種混合模式（三個色標）', () => {
    const stops: GradientStop[] = [
      { at: 0, color: [10, 200, 30], alpha: 0.7 },
      { at: 0.4, color: [250, 0, 100], alpha: 0.2 },
      { at: 1, color: [0, 0, 255], alpha: 0.9 },
    ];
    for (const blend of MODES) {
      const op: FilterOp = { op: 'gradient', from: [0.1, 0.2], to: [0.9, 0.7], stops, blend };
      const got = rgb(applyFilterOps(IMG, W, H, [op]));
      const want = naive(blend, (fx, fy) => {
        const t = Math.max(0, Math.min(1, ((fx - 0.1) * 0.8 + (fy - 0.2) * 0.5) / 0.89));
        const i = t <= 0.4 ? 0 : 1;
        const k = (t - stops[i].at) / (stops[i + 1].at - stops[i].at);
        const m = (u: number, v: number) => u + (v - u) * k;
        return {
          r: m(stops[i].color[0], stops[i + 1].color[0]),
          g: m(stops[i].color[1], stops[i + 1].color[1]),
          b: m(stops[i].color[2], stops[i + 1].color[2]),
          a: m(stops[i].alpha, stops[i + 1].alpha),
        };
      });
      expect(maxDiff(got, want), blend).toBeLessThanOrEqual(1);
    }
  });
  it('glow、vignette：不透明度圖（第二次用快取）', () => {
    for (const blend of MODES) {
      const op: FilterOp = {
        op: 'glow',
        center: [0.3, 0.6],
        radius: 0.4,
        aspect: 0.8,
        color: [255, 200, 100],
        alpha: 0.8,
        blend,
        falloff: 3,
      };
      const want = naive(blend, (fx, fy) => {
        const d = Math.hypot((fx - 0.3) / 0.4, (fy - 0.6) / 0.32);
        return { r: 255, g: 200, b: 100, a: d >= 1 ? 0 : 0.8 * (1 - d ** 3) ** 2 };
      });
      expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [op])), want), blend).toBeLessThanOrEqual(1);
      expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [op])), want), blend).toBeLessThanOrEqual(1);
    }
    const v: FilterOp = { op: 'vignette', amount: 0.6, inner: 0.2, outer: 0.9, power: 1.7 };
    const want = naive('normal', (fx, fy) => {
      const d = Math.hypot(fx * 2 - 1, fy * 2 - 1) / Math.SQRT2;
      const t = Math.max(0, Math.min(1, (d - 0.2) / 0.7));
      return { r: 0, g: 0, b: 0, a: 0.6 * t ** 1.7 };
    });
    expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [v])), want)).toBeLessThanOrEqual(1);
    /* 換尺寸時重算（快取不會拿錯） */
    const small = applyFilterOps(IMG.subarray(0, 20 * 10 * 4), 20, 10, [v]);
    const again = applyFilterOps(IMG.subarray(0, 20 * 10 * 4), 20, 10, [v]);
    expect(Array.from(small)).toEqual(Array.from(again));
    expect(maxDiff(rgb(applyFilterOps(IMG, W, H, [v])), want)).toBeLessThanOrEqual(1);
  });
});

describe('模糊', () => {
  it('垂直方框模糊逐列推進：與逐欄計算相同', () => {
    const plane = new Float32Array(W * H).map((_, i) => (i * 37) % 251);
    const got = blurPlane(plane, W, H, 3.2);
    /* 直接算法：先水平再垂直，三次方框（同 blurPlane 的寬度） */
    const n = 3;
    const sigma = 3.2;
    const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    let cur = Array.from(plane);
    const at = (a: number[], x: number, y: number) =>
      a[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    for (let i = 0; i < n; i++) {
      const r = ((i < m ? wl : wu) - 1) / 2;
      if (r < 1) continue;
      const hz = cur.map((_, k) => {
        const x = k % W;
        const y = Math.floor(k / W);
        let s = 0;
        for (let d = -r; d <= r; d++) s += at(cur, x + d, y);
        return s / (2 * r + 1);
      });
      cur = hz.map((_, k) => {
        const x = k % W;
        const y = Math.floor(k / W);
        let s = 0;
        for (let d = -r; d <= r; d++) s += at(hz, x, y + d);
        return s / (2 * r + 1);
      });
    }
    expect(Math.max(...cur.map((v, k) => Math.abs(v - got[k])))).toBeLessThan(0.01);
  });
});
