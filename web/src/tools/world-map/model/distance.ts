/**
 * 格子上的距離轉換（倒角距離）：由上往下、再由下往上兩趟，每一格取「已經走過的鄰格＋步長」的最小值。
 * 山與森林的邊界距離（relief.ts）、山地的深度（travel.ts）、離海的格數（generate.ts）共用。
 */

/** 鄰格的位移與步長；往下的那一趟自動取反方向 */
export type Step = readonly [dx: number, dy: number, cost: number];

/** 上、左（四方向） */
export const ORTHOGONAL: readonly Step[] = [
  [-1, 0, 1],
  [0, -1, 1],
];
/** 上、左、左上、右上（斜向 √2） */
export const OCTILE: readonly Step[] = [...ORTHOGONAL, [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2]];

export interface SweepRule {
  /** 這一格要不要更新（預設：值不是 0 的格子） */
  update?: (i: number) => boolean;
  /** 可以從這個鄰格走過來（預設：都可以） */
  from?: (j: number) => boolean;
  /** 直向、橫向的鄰格在地圖外時的距離（當作外面是 0 的格子；null＝地圖外不算） */
  outside: number | null;
}

/** 就地更新 field（cols × rows） */
export function sweep(
  field: Float32Array,
  cols: number,
  rows: number,
  steps: readonly Step[],
  rule: SweepRule,
): Float32Array {
  const update = rule.update ?? ((i: number) => field[i] !== 0);
  const relax = (x: number, y: number, dir: 1 | -1) => {
    const i = y * cols + x;
    if (!update(i)) return;
    let best = field[i];
    for (const [sx, sy, cost] of steps) {
      const xx = x + sx * dir;
      const yy = y + sy * dir;
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) {
        if (rule.outside !== null && (sx === 0 || sy === 0)) best = Math.min(best, rule.outside);
        continue;
      }
      const j = yy * cols + xx;
      if (!rule.from || rule.from(j)) best = Math.min(best, field[j] + cost);
    }
    field[i] = best;
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) relax(x, y, 1);
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) relax(x, y, -1);
  return field;
}
