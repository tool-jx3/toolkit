/**
 * 氣候：某一點附近的地表比例（雪原、沙漠、濕地），決定山、樹、建築、城牆的顏色與積雪，以及地名提案的修飾。
 *
 * - climateAt：半徑 6 格內的陸地格子，以 exp(−r² ÷ 7) 加權，算雪原／沙漠／濕地各佔多少（海不算）。
 * - snowSampler：整張地圖的積雪量一次算好（同一個權重的 13 格寬模糊，先橫後直；雪原的量除以陸地的量，
 *   海邊的雪原不會變淡），查詢時雙線性內插，雪原的邊界積雪量平滑變化。
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

type Ground = Pick<Grid, 'cols' | 'rows' | 'ground'>;

/** 影響範圍（格）與權重的寬度 */
const REACH = 6;
const SPREAD = 7;
const weightAt = (r: number) => Math.exp((-r * r) / SPREAD);

/** 地表 → 氣候的哪一項 */
const CLIMATE_OF: Partial<Record<number, keyof Climate>> = {
  [SNOW]: 'snow',
  [DESERT]: 'desert',
  [MARSH]: 'wet',
};

/** 格子中心在 (x, y) 的那一格的座標（格；可以是小數） */
const toCell = (px: number) => px / CELL - 0.5;

export function climateAt(grid: Ground, x: number, y: number): Climate {
  const fx = toCell(x);
  const fy = toCell(y);
  const share: Climate = { snow: 0, desert: 0, wet: 0 };
  let land = 0;
  const top = Math.max(0, Math.ceil(fy - REACH));
  const bottom = Math.min(grid.rows - 1, Math.floor(fy + REACH));
  const left = Math.max(0, Math.ceil(fx - REACH));
  const right = Math.min(grid.cols - 1, Math.floor(fx + REACH));
  for (let row = top; row <= bottom; row++)
    for (let col = left; col <= right; col++) {
      const g = grid.ground[row * grid.cols + col];
      const r = g ? Math.hypot(col - fx, row - fy) : Infinity;
      if (r > REACH) continue;
      const w = weightAt(r);
      land += w;
      const key = CLIMATE_OF[g];
      if (key) share[key] += w;
    }
  if (!land) return share;
  return { snow: share.snow / land, desert: share.desert / land, wet: share.wet / land };
}

export type SnowAt = (x: number, y: number) => number;

/** 模糊用的權重（−6～6 格） */
const KERNEL = Array.from({ length: 2 * REACH + 1 }, (_, k) => weightAt(k - REACH));

/**
 * 沿著一個方向模糊：out[i] += src[鄰格] × 權重（地圖外不算）。
 * out 的型別決定每次累加的精度（Float32Array 每加一次就存回 32 位元）。
 */
function blurAlong<T extends Float32Array | Float64Array>(
  src: ArrayLike<number>,
  cols: number,
  rows: number,
  across: boolean,
  out: T,
): T {
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      KERNEL.forEach((w, k) => {
        const xx = across ? x + k - REACH : x;
        const yy = across ? y : y + k - REACH;
        if (xx >= 0 && xx < cols && yy >= 0 && yy < rows) out[i] += src[yy * cols + xx] * w;
      });
    }
  return out;
}

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

/** 格子上的值，在小數座標雙線性內插（超出範圍的夾在邊緣） */
function bilinear(field: Float32Array, cols: number, rows: number, fx: number, fy: number): number {
  const x = clamp(fx, 0, cols - 1);
  const y = clamp(fy, 0, rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const at = (cx: number, cy: number) => field[cy * cols + cx];
  return lerp(lerp(at(x0, y0), at(x1, y0), x - x0), lerp(at(x0, y1), at(x1, y1), x - x0), y - y0);
}

export function snowSampler(grid: Ground): SnowAt {
  const { cols, rows, ground } = grid;
  if (!ground.includes(SNOW)) return () => 0;
  const n = cols * rows;
  const snowy = Uint8Array.from(ground, (g) => (g === SNOW ? 1 : 0));
  const land = Uint8Array.from(ground, (g) => (g ? 1 : 0));
  const blur2 = (mask: Uint8Array) =>
    blurAlong(
      blurAlong(mask, cols, rows, true, new Float32Array(n)),
      cols,
      rows,
      false,
      new Float64Array(n),
    );
  const snowSum = blur2(snowy);
  const landSum = blur2(land);
  const amount = Float32Array.from(landSum, (l, i) => (l ? snowSum[i] / l : 0));
  return (x, y) => bilinear(amount, cols, rows, toCell(x), toCell(y));
}
