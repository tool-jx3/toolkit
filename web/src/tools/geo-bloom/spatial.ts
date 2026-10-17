/**
 * 重疊判定（規格 3.2 的步驟 6～8）：
 * - `circlesTouch`、`segmentTouches` 是判定本身（距離的算法照原作：Math.hypot、線段上最近點的參數夾在 0～1）；
 * - `linearIndex` 逐一比對所有圖形（原作的做法）；
 * - `gridIndex` 用空間格子先挑出「可能相碰」的圖形，再用同一個判定確認：只會多挑、不會少挑，所以結果和逐一比對完全相同，
 *   但大畫布（圖形幾千個、每條線最多試 14 次）快上百倍。
 */

export interface Circle {
  x: number;
  y: number;
  /** 外接圓半徑 */
  r: number;
}

/** 兩個外接圓（加上空隙）相碰：中心距離＜兩個半徑＋空隙 */
export function circlesTouch(n: Circle, x: number, y: number, r: number, gap: number): boolean {
  return Math.hypot(n.x - x, n.y - y) < n.r + r + gap;
}

/** 線段 (x1, y1)–(x2, y2) 碰到外接圓：圓心到線段的最短距離＜半徑 */
export function segmentTouches(n: Circle, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((n.x - x1) * dx + (n.y - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x1 + t * dx - n.x, y1 + t * dy - n.y) < n.r;
}

export interface CircleIndex<T extends Circle> {
  add(c: T): void;
  /** 有沒有 ignore 以外的圖形和 (x, y, r) 的圓（加空隙）相碰 */
  overlaps(x: number, y: number, r: number, gap: number, ignore: T | null): boolean;
  /** 有沒有 skip 以外的圖形碰到線段 */
  segmentHits(x1: number, y1: number, x2: number, y2: number, skip: T): boolean;
}

/** 逐一比對（原作的做法；測試用來對照） */
export function linearIndex<T extends Circle>(): CircleIndex<T> {
  const items: T[] = [];
  return {
    add: (c) => {
      items.push(c);
    },
    overlaps(x, y, r, gap, ignore) {
      for (const n of items) if (n !== ignore && circlesTouch(n, x, y, r, gap)) return true;
      return false;
    },
    segmentHits(x1, y1, x2, y2, skip) {
      for (const n of items) if (n !== skip && segmentTouches(n, x1, y1, x2, y2)) return true;
      return false;
    },
  };
}

/** 挑選範圍額外放寬的距離（px）：吸收浮點數的誤差，只會多挑 */
const SLACK = 1;
/** 格子的編號：(ix, iy) → 一個數字。|iy| 很大時可能撞號，撞號只會多挑 */
const cellKey = (ix: number, iy: number) => ix * 1048576 + iy;
const finite = (...v: number[]) => v.every(Number.isFinite);

/**
 * 空間格子：每個圖形登記在它的外接方框（放寬 SLACK）蓋到的每一格；查詢時只看查詢範圍（同樣放寬）蓋到的格子。
 * 外半徑超過 bigRadius 的圖形（中央圓這類）不登記，每次都逐一比對；要看的格子比圖形還多時（很長的線段）也改成逐一比對。
 */
export function gridIndex<T extends Circle>(
  cellSize = 64,
  bigRadius = cellSize * 8,
): CircleIndex<T> {
  const items: T[] = [];
  /** 登記在格子裡的（一般大小） */
  const small: number[] = [];
  /** 不登記、逐一比對的（很大、或座標不是有限數） */
  const big: number[] = [];
  const cells = new Map<number, number[]>();
  /** 這次查詢看過了沒（同一個圖形登記在好幾格） */
  const seen: number[] = [];
  let tick = 0;

  const cellOf = (v: number) => Math.floor(v / cellSize);

  /** 逐一比對一般大小的圖形 */
  const scanSmall = (test: (n: T) => boolean) => {
    for (const i of small) if (test(items[i])) return true;
    return false;
  };

  /** 看範圍 [x0, x1] × [y0, y1]（px）蓋到的格子裡的圖形；格子太多時逐一比對 */
  const scanRange = (x0: number, x1: number, y0: number, y1: number, test: (n: T) => boolean) => {
    if (!small.length) return false;
    if (!finite(x0, x1, y0, y1)) return scanSmall(test);
    const ix0 = cellOf(x0);
    const ix1 = cellOf(x1);
    const iy0 = cellOf(y0);
    const iy1 = cellOf(y1);
    if ((ix1 - ix0 + 1) * (iy1 - iy0 + 1) > small.length) return scanSmall(test);
    tick++;
    for (let ix = ix0; ix <= ix1; ix++)
      for (let iy = iy0; iy <= iy1; iy++) {
        const list = cells.get(cellKey(ix, iy));
        if (!list) continue;
        for (const i of list) {
          if (seen[i] === tick) continue;
          seen[i] = tick;
          if (test(items[i])) return true;
        }
      }
    return false;
  };

  return {
    add(c) {
      const i = items.push(c) - 1;
      seen.push(0);
      if (!finite(c.x, c.y, c.r) || c.r > bigRadius) {
        big.push(i);
        return;
      }
      small.push(i);
      const e = c.r + SLACK;
      const ix0 = cellOf(c.x - e);
      const ix1 = cellOf(c.x + e);
      const iy0 = cellOf(c.y - e);
      const iy1 = cellOf(c.y + e);
      for (let ix = ix0; ix <= ix1; ix++)
        for (let iy = iy0; iy <= iy1; iy++) {
          const k = cellKey(ix, iy);
          const list = cells.get(k);
          if (list) list.push(i);
          else cells.set(k, [i]);
        }
    },
    overlaps(x, y, r, gap, ignore) {
      const test = (n: T) => n !== ignore && circlesTouch(n, x, y, r, gap);
      for (const i of big) if (test(items[i])) return true;
      const e = r + gap + SLACK;
      return scanRange(x - e, x + e, y - e, y + e, test);
    },
    segmentHits(x1, y1, x2, y2, skip) {
      const test = (n: T) => n !== skip && segmentTouches(n, x1, y1, x2, y2);
      for (const i of big) if (test(items[i])) return true;
      return scanRange(
        Math.min(x1, x2) - SLACK,
        Math.max(x1, x2) + SLACK,
        Math.min(y1, y2) - SLACK,
        Math.max(y1, y2) + SLACK,
        test,
      );
    },
  };
}
