/**
 * 氣候：某一點附近的地表比例（雪原、沙漠、濕地），決定山、樹、建築、城牆的顏色與積雪，以及地名提案的修飾。
 *
 * - climateAt：半徑 6 格內的陸地格子，以 exp(−r² ÷ 7) 加權，算雪原／沙漠／濕地各佔多少（海不算）。
 * - snowSampler：整張地圖的積雪量一次算好（13 格寬的高斯模糊，除以陸地的比例，海邊的雪原不會變淡），
 *   查詢時雙線性內插，雪原的邊界積雪量平滑變化。
 */
import { clamp } from './geometry';
import type { Grid } from './terrain';
import { CELL, DESERT, MARSH, SNOW } from './types';

export interface Climate {
  snow: number;
  desert: number;
  wet: number;
}

export const NO_CLIMATE: Climate = { snow: 0, desert: 0, wet: 0 };

export function climateAt(
  grid: Pick<Grid, 'cols' | 'rows' | 'ground'>,
  x: number,
  y: number,
): Climate {
  const cx = x / CELL - 0.5;
  const cy = y / CELL - 0.5;
  const radius = 6;
  const out = { snow: 0, desert: 0, wet: 0 };
  let total = 0;
  const y0 = Math.max(0, Math.floor(cy) - radius);
  const y1 = Math.min(grid.rows - 1, Math.ceil(cy) + radius);
  const x0 = Math.max(0, Math.floor(cx) - radius);
  const x1 = Math.min(grid.cols - 1, Math.ceil(cx) + radius);
  for (let iy = y0; iy <= y1; iy++)
    for (let ix = x0; ix <= x1; ix++) {
      const v = grid.ground[iy * grid.cols + ix];
      if (!v) continue;
      const r = Math.hypot(ix - cx, iy - cy);
      if (r > radius) continue;
      const w = Math.exp((-r * r) / 7);
      total += w;
      if (v === SNOW) out.snow += w;
      else if (v === DESERT) out.desert += w;
      else if (v === MARSH) out.wet += w;
    }
  if (total) {
    out.snow /= total;
    out.desert /= total;
    out.wet /= total;
  }
  return out;
}

export type SnowAt = (x: number, y: number) => number;

export function snowSampler(grid: Pick<Grid, 'cols' | 'rows' | 'ground'>): SnowAt {
  const { cols: w, rows: h, ground } = grid;
  if (!ground.includes(SNOW)) return () => 0;
  const kernel = Array.from({ length: 13 }, (_, i) => Math.exp(-((i - 6) ** 2) / 7));
  const n = w * h;
  const tmpSnow = new Float32Array(n);
  const tmpLand = new Float32Array(n);
  const snow = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      for (let k = -6; k <= 6; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        const v = ground[y * w + xx];
        const wt = kernel[k + 6];
        if (v) tmpLand[i] += wt;
        if (v === SNOW) tmpSnow[i] += wt;
      }
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let s = 0;
      let l = 0;
      for (let k = -6; k <= 6; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        const j = yy * w + x;
        const wt = kernel[k + 6];
        s += tmpSnow[j] * wt;
        l += tmpLand[j] * wt;
      }
      snow[i] = l ? s / l : 0;
    }
  return (x, y) => {
    const xx = clamp(x / CELL - 0.5, 0, w - 1);
    const yy = clamp(y / CELL - 0.5, 0, h - 1);
    const x0 = Math.floor(xx);
    const y0 = Math.floor(yy);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = xx - x0;
    const ty = yy - y0;
    return (
      (snow[y0 * w + x0] * (1 - tx) + snow[y0 * w + x1] * tx) * (1 - ty) +
      (snow[y1 * w + x0] * (1 - tx) + snow[y1 * w + x1] * tx) * ty
    );
  };
}
