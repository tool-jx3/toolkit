/**
 * 幾何：格點的吸附、線段的交點、塗色可以吸附的點、草稿的移動／反轉／旋轉（規格 3.2～3.4）。
 * 純函式，不依賴 React 與 DOM。座標是單位（1 格＝UNIT）。
 */
import { type Cell, type Pt, UNIT, type VeinCanvas } from './types';

export type Segment = readonly [Pt, Pt];

export const samePt = (a: Pt, b: Pt): boolean => a[0] === b[0] && a[1] === b[1];

/** 同一條線段（不分方向） */
export const sameSegment = (s: Segment, t: Segment): boolean =>
  (samePt(s[0], t[0]) && samePt(s[1], t[1])) || (samePt(s[0], t[1]) && samePt(s[1], t[0]));

export const ptKey = (p: Pt): string => `${p[0]},${p[1]}`;
export const segKey = (s: Segment): string => {
  const [a, b] = s;
  return a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])
    ? `${ptKey(a)};${ptKey(b)}`
    : `${ptKey(b)};${ptKey(a)}`;
};
export const cellKey = (c: Cell): string => `${c[0]},${c[1]}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 格點的吸附：最近的格點（四捨五入），超出畫布時夾在邊上（世界座標是格） */
export function snapGrid(wx: number, wy: number, size: number): Pt {
  return [clamp(Math.round(wx), 0, size) * UNIT, clamp(Math.round(wy), 0, size) * UNIT];
}

/** 指到的格子（無條件捨去）；在畫布外時 null */
export function cellAt(wx: number, wy: number, size: number): Cell | null {
  const x = Math.floor(wx);
  const y = Math.floor(wy);
  return x >= 0 && y >= 0 && x < size && y < size ? [x, y] : null;
}

/**
 * 兩條線段的交點（整數運算，結果四捨五入到整數單位）。平行或在同一直線上時沒有交點（和原作相同：
 * 重疊的兩條線不產生交點）；只碰到端點也算。
 */
export function intersect(s: Segment, t: Segment): Pt | null {
  const [[x1, y1], [x2, y2]] = s;
  const [[x3, y3], [x4, y4]] = t;
  const rx = x2 - x1;
  const ry = y2 - y1;
  const sx = x4 - x3;
  const sy = y4 - y3;
  let d = rx * sy - ry * sx;
  if (d === 0) return null;
  const qx = x3 - x1;
  const qy = y3 - y1;
  let tn = qx * sy - qy * sx;
  let un = qx * ry - qy * rx;
  if (d < 0) {
    d = -d;
    tn = -tn;
    un = -un;
  }
  if (tn < 0 || tn > d || un < 0 || un > d) return null;
  return [Math.round(x1 + (rx * tn) / d), Math.round(y1 + (ry * tn) / d)];
}

/** 畫布的四邊與預設的對角線（左上到右下；原作每張畫布都有、不能刪） */
export function borderSegments(size: number): Segment[] {
  const m = size * UNIT;
  return [
    [
      [0, 0],
      [0, m],
    ],
    [
      [0, m],
      [m, m],
    ],
    [
      [m, m],
      [m, 0],
    ],
    [
      [m, 0],
      [0, 0],
    ],
  ];
}

export const diagonalSegment = (size: number): Segment => [
  [0, 0],
  [size * UNIT, size * UNIT],
];

/** 傷害格的四邊（重複的邊只留一條）：原作把它們當成看不見的線，塗色時可以吸附到格子的角與邊上的交點 */
export function damageEdges(cells: readonly Cell[]): Segment[] {
  const out = new Map<string, Segment>();
  for (const [cx, cy] of cells) {
    const x0 = cx * UNIT;
    const y0 = cy * UNIT;
    const x1 = x0 + UNIT;
    const y1 = y0 + UNIT;
    const edges: Segment[] = [
      [
        [x0, y0],
        [x1, y0],
      ],
      [
        [x1, y0],
        [x1, y1],
      ],
      [
        [x1, y1],
        [x0, y1],
      ],
      [
        [x0, y1],
        [x0, y0],
      ],
    ];
    for (const e of edges) out.set(segKey(e), e);
  }
  return [...out.values()];
}

/** 畫布上所有的線段（交點的來源）：四邊、對角線、畫上去的線、傷害格的邊 */
export function allSegments(c: Pick<VeinCanvas, 'size' | 'lines' | 'damage'>): Segment[] {
  return [
    ...borderSegments(c.size),
    diagonalSegment(c.size),
    ...c.lines.map((l): Segment => [l.a, l.b]),
    ...damageEdges(c.damage),
  ];
}

const snapCache = new WeakMap<object, Pt[]>();

/**
 * 塗色可以吸附的點：所有線段兩兩的交點（不重複；依 y、x 排序）。
 * 同一張畫布（同一個物件）算過就記住。
 */
export function snapPoints(c: Pick<VeinCanvas, 'size' | 'lines' | 'damage'>): Pt[] {
  const hit = snapCache.get(c);
  if (hit) return hit;
  const segs = allSegments(c);
  const found = new Map<string, Pt>();
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const p = intersect(segs[i], segs[j]);
      if (p) found.set(ptKey(p), p);
    }
  }
  const out = [...found.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  snapCache.set(c, out);
  return out;
}

const eraseSnapCache = new WeakMap<object, Pt[]>();

/**
 * 刪除塗色時可以吸附的點：線的交點，加上現有塗色的頂點（刪掉線之後，塗色的頂點可能不再是交點，
 * 原作那樣就刪不掉了）。
 */
export function eraseFillPoints(c: Pick<VeinCanvas, 'size' | 'lines' | 'damage' | 'fills'>): Pt[] {
  const hit = eraseSnapCache.get(c);
  if (hit) return hit;
  const found = new Map<string, Pt>(snapPoints(c).map((p) => [ptKey(p), p]));
  for (const f of c.fills) for (const p of f.pts) if (!found.has(ptKey(p))) found.set(ptKey(p), p);
  const out = [...found.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  eraseSnapCache.set(c, out);
  return out;
}

/** 最近的點（距離相同時取排在前面的）；沒有點時 null */
export function nearestPoint(points: readonly Pt[], x: number, y: number): Pt | null {
  let best: Pt | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** 一筆的線段（封閉的多加最後一點回到起點；長度 0 的不算） */
export function figureSegments(pts: readonly Pt[], closed: boolean): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < pts.length; i++) {
    if (!samePt(pts[i - 1], pts[i])) out.push([pts[i - 1], pts[i]]);
  }
  if (closed && pts.length > 2 && !samePt(pts[pts.length - 1], pts[0]))
    out.push([pts[pts.length - 1], pts[0]]);
  return out;
}

/* ---------- 草稿的移動、反轉、旋轉（以格為單位） ---------- */

/** 點（單位）全部移動 dx、dy 格；有任何一點超出畫布就不動（回傳 null） */
export function shiftPoints(pts: readonly Pt[], dx: number, dy: number, size: number): Pt[] | null {
  const m = size * UNIT;
  const out: Pt[] = [];
  for (const [x, y] of pts) {
    const nx = x + dx * UNIT;
    const ny = y + dy * UNIT;
    if (nx < 0 || ny < 0 || nx > m || ny > m) return null;
    out.push([nx, ny]);
  }
  return out;
}

/** 格子全部移動；有任何一格超出畫布就不動 */
export function shiftCells(
  cells: readonly Cell[],
  dx: number,
  dy: number,
  size: number,
): Cell[] | null {
  const out: Cell[] = [];
  for (const [x, y] of cells) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) return null;
    out.push([nx, ny]);
  }
  return out;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(pts: readonly Pt[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** 左右反轉：以畫布中線翻過去，再移回原本的左緣（圖形留在原處） */
export function mirrorPoints(pts: readonly Pt[], size: number): Pt[] {
  if (!pts.length) return [];
  const m = size * UNIT;
  const flipped = pts.map(([x, y]): Pt => [m - x, y]);
  const dx = boundsOf(pts).minX - boundsOf(flipped).minX;
  return flipped.map(([x, y]): Pt => [x + dx, y]);
}

/**
 * 順時針轉 90°：(x, y) → (格數 − y, x)，再把外框的中心移回原本的中心附近
 * （位移以格為單位、往 0 取整，夾在畫布裡）。
 */
export function rotatePoints(pts: readonly Pt[], size: number): Pt[] {
  if (!pts.length) return [];
  const m = size * UNIT;
  const turned = pts.map(([x, y]): Pt => [m - y, x]);
  const b0 = boundsOf(pts);
  const b1 = boundsOf(turned);
  const centerShift = (min0: number, max0: number, min1: number, max1: number) => {
    let d = Math.trunc((max0 + min0) / 2 / UNIT - (max1 + min1) / 2 / UNIT) * UNIT;
    if (min1 + d < 0) d = -min1;
    else if (max1 + d > m) d = m - max1;
    return d;
  };
  const dx = centerShift(b0.minX, b0.maxX, b1.minX, b1.maxX);
  const dy = centerShift(b0.minY, b0.maxY, b1.minY, b1.maxY);
  return turned.map(([x, y]): Pt => [x + dx, y + dy]);
}

/** 把點移進畫布（外框比畫布大時 null）：最小的位移，以格為單位 */
export function fitInside(pts: readonly Pt[], size: number): Pt[] | null {
  if (!pts.length) return [];
  const m = size * UNIT;
  const b = boundsOf(pts);
  if (b.maxX - b.minX > m || b.maxY - b.minY > m) return null;
  const move = (min: number, max: number) => {
    if (min < 0) return Math.ceil(-min / UNIT) * UNIT;
    if (max > m) return -Math.ceil((max - m) / UNIT) * UNIT;
    return 0;
  };
  const dx = move(b.minX, b.maxX);
  const dy = move(b.minY, b.maxY);
  const out = pts.map(([x, y]): Pt => [x + dx, y + dy]);
  const c = boundsOf(out);
  return c.minX < 0 || c.minY < 0 || c.maxX > m || c.maxY > m ? null : out;
}
