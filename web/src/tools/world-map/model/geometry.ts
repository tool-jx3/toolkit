/**
 * 幾何：多邊形的面積與面積重心、點在不在多邊形裡、線段距離、路線的曲線（畫法與取樣共用同一份分段）、
 * 內側的城牆（縮小的多邊形要整個在原本的裡面）。
 */
import { pointInPolygon as insideShape } from '@/core/shapes';
import type { PathSink } from './terrain';
import type { Pt } from './types';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const gap = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/** 多邊形的每一條邊（最後一個點接回第一個點） */
function eachEdge(ring: readonly Pt[], visit: (from: Pt, to: Pt) => void): void {
  ring.forEach((from, k) => {
    visit(from, ring[k + 1 === ring.length ? 0 : k + 1]);
  });
}

/** 兩點的外積（鞋帶公式的一項） */
const shoelace = (p: Pt, q: Pt): number => p.x * q.y - q.x * p.y;

/** 有號面積（畫面座標下順時針為正） */
export function signedArea(pts: readonly Pt[]): number {
  let twice = 0;
  eachEdge(pts, (p, q) => {
    twice += shoelace(p, q);
  });
  return twice / 2;
}

export const polygonArea = (pts: readonly Pt[]): number => Math.abs(signedArea(pts));

/** 面積重心（國名的基準位置）；面積幾乎是 0 時改用頂點平均 */
export function centroid(pts: readonly Pt[]): Pt {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  const acc = { w: 0, x: 0, y: 0 };
  eachEdge(pts, (p, q) => {
    const k = shoelace(p, q);
    acc.w += k;
    acc.x += (p.x + q.x) * k;
    acc.y += (p.y + q.y) * k;
  });
  if (Math.abs(acc.w) >= 1e-5) return { x: acc.x / (3 * acc.w), y: acc.y / (3 * acc.w) };
  const mean = (pick: (p: Pt) => number) => pts.reduce((s, p) => s + pick(p), 0) / n;
  return { x: mean((p) => p.x), y: mean((p) => p.y) };
}

/** 點在多邊形裡（奇偶規則；共用的圖形模組） */
export const pointInPolygon = (p: Pt, poly: readonly Pt[]): boolean => insideShape(poly, p.x, p.y);

/** 線段 ab 上離 p 最近的點 */
export function nearestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const along = clamp(((p.x - a.x) * ux + (p.y - a.y) * uy) / (ux * ux + uy * uy || 1), 0, 1);
  return { x: a.x + along * ux, y: a.y + along * uy };
}

export const distToSegment = (p: Pt, a: Pt, b: Pt): number => gap(p, nearestOnSegment(p, a, b));

export function distToPolyline(p: Pt, pts: readonly Pt[]): number {
  if (pts.length === 1) return gap(p, pts[0]);
  return pts.reduce(
    (best, q, k) => (k ? Math.min(best, distToSegment(p, pts[k - 1], q)) : best),
    Infinity,
  );
}

export const polylineLength = (pts: readonly Pt[]): number =>
  pts.reduce((sum, q, k) => (k ? sum + gap(pts[k - 1], q) : sum), 0);

/* ---------- 路線的曲線 ---------- */

/** 曲線的一段：bend 是二次曲線的控制點，沒有時是直線 */
interface Piece {
  from: Pt;
  to: Pt;
  bend?: Pt;
}

/**
 * 路線的分段（畫在地圖上的就是這條）：平滑時以相鄰兩點的中點為端點、點本身為控制點的二次曲線，
 * 最後一段直線到終點；不平滑或少於 3 點時是折線。
 */
function curvePieces(points: readonly Pt[], smooth: boolean): Piece[] {
  const last = points.length - 1;
  if (!smooth || points.length < 3)
    return points.slice(1).map((to, k) => ({ from: points[k], to }));
  const pieces: Piece[] = [];
  let from = points[0];
  for (let k = 1; k < last; k++) {
    const bend = points[k];
    const next = points[k + 1];
    const to = { x: (bend.x + next.x) / 2, y: (bend.y + next.y) / 2 };
    pieces.push({ from, bend, to });
    from = to;
  }
  pieces.push({ from, to: points[last] });
  return pieces;
}

function pieceAt({ from, bend, to }: Piece, t: number): Pt {
  if (!bend) return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  const s = 1 - t;
  return {
    x: s * s * from.x + 2 * s * t * bend.x + t * t * to.x,
    y: s * s * from.y + 2 * s * t * bend.y + t * t * to.y,
  };
}

/** 一段要切成幾份：直線至少 1、曲線至少 4（曲線用兩條控制邊的長度估） */
function pieceSteps({ from, bend, to }: Piece, spacing: number): number {
  if (!bend) return Math.max(1, Math.ceil(gap(from, to) / spacing));
  return Math.max(4, Math.ceil((gap(from, bend) + gap(bend, to)) / spacing));
}

export function tracePath(points: readonly Pt[], smooth: boolean, sink: PathSink): void {
  if (!points.length) return;
  sink.moveTo(points[0].x, points[0].y);
  for (const { bend, to } of curvePieces(points, smooth)) {
    if (bend) sink.quadraticCurveTo(bend.x, bend.y, to.x, to.y);
    else sink.lineTo(to.x, to.y);
  }
}

/** 沿著 tracePath 的形狀取樣（點距約 max(12, 全長 ÷ 1200) px），川的粗細、點選、長度都用它 */
export function sampleCurve(points: readonly Pt[], smooth: boolean): Pt[] {
  if (!points.length) return [];
  const spacing = Math.max(12, polylineLength(points) / 1200);
  const samples: Pt[] = [{ ...points[0] }];
  for (const piece of curvePieces(points, smooth)) {
    const n = pieceSteps(piece, spacing);
    for (let k = 1; k <= n; k++) {
      const p = pieceAt(piece, k / n);
      if (gap(samples[samples.length - 1], p) > 1e-6) samples.push(p);
    }
  }
  return samples;
}

/**
 * 川的粗細：從上游（第一個點）到下游（最後一個點）沿著長度變粗，
 * 半徑＝寬 ×（0.42＋0.83 × 走過的比例）÷ 2（上游約 0.42 倍、河口約 1.25 倍）。
 */
export function riverRadii(samples: readonly Pt[], width: number): number[] {
  const walked: number[] = [];
  let sum = 0;
  samples.forEach((p, k) => {
    if (k) sum += gap(samples[k - 1], p);
    walked.push(sum);
  });
  const total = sum || 1;
  return walked.map((d) => (width * (0.42 + (0.83 * d) / total)) / 2);
}

/* ---------- 線段相交（內側的城牆、自己交叉的檢查） ---------- */

const EPS = 1e-6;
/** c 在 ab 的哪一側（外積；0 是同一直線） */
const side = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const within = (v: number, a: number, b: number) =>
  v >= Math.min(a, b) - EPS && v <= Math.max(a, b) + EPS;
/** p 剛好落在線段 ab 上 */
const touches = (a: Pt, b: Pt, p: Pt) =>
  Math.abs(side(a, b, p)) < EPS && within(p.x, a.x, b.x) && within(p.y, a.y, b.y);

export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const straddleCD = side(a, b, c) * side(a, b, d) < 0;
  const straddleAB = side(c, d, a) * side(c, d, b) < 0;
  if (straddleCD && straddleAB) return true;
  return touches(a, b, c) || touches(a, b, d) || touches(c, d, a) || touches(c, d, b);
}

/** 多邊形自己交叉（不相鄰的兩邊相交） */
export function selfIntersects(pts: readonly Pt[]): boolean {
  const n = pts.length;
  const at = (k: number) => pts[k % n];
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++)
      if (!(i === 0 && j === n - 1) && segmentsIntersect(at(i), at(i + 1), at(j), at(j + 1)))
        return true;
  return false;
}

/** 點到多邊形邊界的最短距離 */
export function distToOutline(p: Pt, pts: readonly Pt[]): number {
  let best = Infinity;
  eachEdge(pts, (a, b) => {
    best = Math.min(best, distToSegment(p, a, b));
  });
  return best;
}

/** 多邊形裡離邊界最遠的格點（外接框切 16 等分的內側 15 × 15 點；都在外面時 null） */
function interiorPole(poly: readonly Pt[]): Pt | null {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const spanX = Math.max(...xs) - x0;
  const spanY = Math.max(...ys) - y0;
  let pole: Pt | null = null;
  let room = 0;
  for (let gy = 1; gy < 16; gy++)
    for (let gx = 1; gx < 16; gx++) {
      const p = { x: x0 + (spanX * gx) / 16, y: y0 + (spanY * gy) / 16 };
      if (!pointInPolygon(p, poly)) continue;
      const d = distToOutline(p, poly);
      if (d > room) {
        room = d;
        pole = p;
      }
    }
  return pole;
}

/** inner 整個在 outer 裡面：每個角在裡面且離邊界超過 2 px、兩者的邊不相交 */
function fitsInside(inner: readonly Pt[], outer: readonly Pt[]): boolean {
  if (!inner.every((p) => pointInPolygon(p, outer) && distToOutline(p, outer) > 2)) return false;
  let crossed = false;
  eachEdge(inner, (a, b) => {
    if (crossed) return;
    eachEdge(outer, (c, d) => {
      crossed ||= segmentsIntersect(a, b, c, d);
    });
  });
  return !crossed;
}

const SHRINK = [0.66, 0.5, 0.35, 0.2];
const MIN_INNER_AREA = 36;

/**
 * 內側的一圈城牆：以面積重心（或離邊界最遠的格點）為中心，依序試縮成 66％、50％、35％、20％，
 * 取第一個「每個角都在原本的裡面且離邊界超過 2 px、邊和原本的邊不相交、面積至少 36 px²」的形狀。
 * 自己交叉的多邊形、怎麼縮都放不進去的凹形回傳 null。
 */
export function innerWallPoints(points: readonly Pt[]): Pt[] | null {
  if (points.length < 3 || selfIntersects(points)) return null;
  const anchors = [centroid(points), interiorPole(points)].filter(
    (p): p is Pt => p !== null && pointInPolygon(p, points),
  );
  for (const k of SHRINK)
    for (const c of anchors) {
      const ring = points.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
      if (polygonArea(ring) >= MIN_INNER_AREA && fitsInside(ring, points)) return ring;
    }
  return null;
}

/* ---------- 複製與移動 ---------- */

const DUPLICATE_STEP = 24;

/** 複製時的位移：往右下 24 px；那邊空間不夠就往空間比較大的一邊，最多移到邊緣 */
export function duplicateShift(min: number, max: number, limit: number): number {
  const ahead = limit - max;
  const forward = ahead >= DUPLICATE_STEP || (min < DUPLICATE_STEP && ahead >= min);
  return forward ? clamp(ahead, 0, DUPLICATE_STEP) : -clamp(min, 0, DUPLICATE_STEP);
}

/** 把位移夾在讓所有點都留在地圖裡的範圍 */
export function clampShift(pts: readonly Pt[], dx: number, dy: number, w: number, h: number): Pt {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x: clamp(dx, -Math.min(...xs), w - Math.max(...xs)),
    y: clamp(dy, -Math.min(...ys), h - Math.max(...ys)),
  };
}
