/**
 * 重疊判定（規格 3.2 的步驟 6～8）：
 * - `circlesTouch`、`segmentTouches` 是判定本身（距離的算法照原作：Math.hypot、線段上最近點的參數夾在 0～1）；
 * - `linearIndex` 逐一比對所有圖形（原作的做法）；
 * - `gridIndex` 用空間格子先挑出「可能相碰」的圖形，再用同一個判定確認：只會多挑、不會少挑，所以結果和逐一比對完全相同，
 *   但大畫布（圖形幾千個、每條線最多試 14 次）快上百倍。
 * - `segmentsCross` 與 `lineIndex`：線不跨過既有的線（原作 2026-10，F76）；同樣先用格子挑、再用原作的判定確認。
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

/* ---------- 線段（線不跨過既有的線） ---------- */

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 兩條線段真的交叉（照原作：平行的不算；交點要在兩條線段的內部，離兩端都超過線長的 0.1%，所以接在同一點的線不算交叉）。
 * 運算的順序照原作（差一個位元就可能翻轉）。
 */
export function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const rx = bx - ax;
  const ry = by - ay;
  const qx = dx - cx;
  const qy = dy - cy;
  const den = rx * qy - ry * qx;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * qy - (cy - ay) * qx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t > 1e-3 && t < 1 - 1e-3 && u > 1e-3 && u < 1 - 1e-3;
}

/** 線段碰到圓（圓心到線段的最短距離＜半徑；同 segmentTouches，半徑另給） */
export function segmentHitsCircle(s: Segment, x: number, y: number, r: number): boolean {
  return segmentTouches({ x, y, r }, s.x1, s.y1, s.x2, s.y2);
}

export interface SegmentIndex<T extends Segment> {
  add(s: T): void;
  /** 線段 (x1, y1)–(x2, y2) 有沒有跨過已經登記的線 */
  crosses(x1: number, y1: number, x2: number, y2: number): boolean;
  /** 圓 (x, y, r) 有沒有碰到 skip 以外已經登記的線 */
  circleHits(x: number, y: number, r: number, skip: T | null): boolean;
}

/**
 * 線段的格子：沿著線段每半格取一點，登記在那一點所在的格子與周圍 8 格；查詢的線段也一樣取點、看周圍 9 格。
 * 交叉點離兩條線段各自最近的取樣點都不到半格，所以兩邊的格子一定相鄰——只會多挑、不會少挑（結果和逐一比對相同）。
 */
export function lineIndex<T extends Segment>(cellSize = 64): SegmentIndex<T> {
  const items: T[] = [];
  const cells = new Map<number, number[]>();
  const seen: number[] = [];
  let tick = 0;
  const cellOf = (v: number) => Math.floor(v / cellSize);

  /** 線段經過的格子（含周圍一格）；座標不是有限數時回傳 null（改成逐一比對） */
  const cellsAlong = (x1: number, y1: number, x2: number, y2: number): number[] | null => {
    if (!finite(x1, y1, x2, y2)) return null;
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (cellSize / 2)));
    const keys = new Set<number>();
    for (let i = 0; i <= steps; i++) {
      const ix = cellOf(x1 + ((x2 - x1) * i) / steps);
      const iy = cellOf(y1 + ((y2 - y1) * i) / steps);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) keys.add(cellKey(ix + dx, iy + dy));
    }
    return [...keys];
  };
  /** 不登記在格子裡的（座標不是有限數） */
  const loose: number[] = [];

  const visit = (keys: number[] | null, test: (s: T) => boolean): boolean => {
    for (const i of loose) if (test(items[i])) return true;
    if (!keys) {
      for (const s of items) if (test(s)) return true;
      return false;
    }
    tick++;
    for (const k of keys) {
      const list = cells.get(k);
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
    add(s) {
      const i = items.push(s) - 1;
      seen.push(0);
      const keys = cellsAlong(s.x1, s.y1, s.x2, s.y2);
      if (!keys) {
        loose.push(i);
        return;
      }
      for (const k of keys) {
        const list = cells.get(k);
        if (list) list.push(i);
        else cells.set(k, [i]);
      }
    },
    crosses(x1, y1, x2, y2) {
      return visit(cellsAlong(x1, y1, x2, y2), (s) =>
        segmentsCross(x1, y1, x2, y2, s.x1, s.y1, s.x2, s.y2),
      );
    },
    circleHits(x, y, r, skip) {
      const e = r + SLACK;
      if (!finite(x, y, e)) return visit(null, (s) => s !== skip && segmentHitsCircle(s, x, y, r));
      const keys: number[] = [];
      const ix0 = cellOf(x - e);
      const ix1 = cellOf(x + e);
      const iy0 = cellOf(y - e);
      const iy1 = cellOf(y + e);
      if ((ix1 - ix0 + 1) * (iy1 - iy0 + 1) > items.length * 9 + 9)
        return visit(null, (s) => s !== skip && segmentHitsCircle(s, x, y, r));
      for (let ix = ix0; ix <= ix1; ix++)
        for (let iy = iy0; iy <= iy1; iy++) keys.push(cellKey(ix, iy));
      return visit(keys, (s) => s !== skip && segmentHitsCircle(s, x, y, r));
    },
  };
}

/** 線段逐一比對（測試用來對照 lineIndex） */
export function linearSegments<T extends Segment>(): SegmentIndex<T> {
  const items: T[] = [];
  return {
    add: (s) => {
      items.push(s);
    },
    crosses: (x1, y1, x2, y2) =>
      items.some((s) => segmentsCross(x1, y1, x2, y2, s.x1, s.y1, s.x2, s.y2)),
    circleHits: (x, y, r, skip) => items.some((s) => s !== skip && segmentHitsCircle(s, x, y, r)),
  };
}
