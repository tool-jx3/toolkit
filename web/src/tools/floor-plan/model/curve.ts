/**
 * 曲線的房間（2026-11-05，跟進 KIIN「マップ制作スタジオ」v2.0 第二批；規格 F289～F296、3.17.1、D97）。
 *
 * 資料：外框（x、y、w、h，整格；意義和長方形的房間相同）＋形狀 `shape`（＋圓角、倒角的 `radius`）。外形是外框裡的
 * 凸多邊形（曲線切成短的折線，每段約 0.25 格以內），形狀的比例照 KIIN v2.0 的定義（圓頂的高＝min(深 × 0.65, 寬 ÷ 2)、
 * 船首的長＝min(深 × 0.85, max(深 × 0.55, 寬 × 0.9))、船體的船首＝深 × 0.42、船尾的圓角＝min(寬 × 0.32, 深 × 0.18)、
 * 八角形的倒角＝短邊 × 0.28…；朝上的形狀轉 90° 就是朝右的形狀，數字一樣）。程式、名稱、圓角的預設值是本站自己的。
 * 沒有 `shape` 的房間（長方形、L 形）完全不經過這裡。
 */
import type { Rect, Room, RoomShape } from './types';

export type Pt = [number, number];

/** 形狀（屬性面板的順序） */
export const ROOM_SHAPES: readonly RoomShape[] = [
  'ellipse',
  'round',
  'chamfer',
  'dome-n',
  'dome-e',
  'dome-s',
  'dome-w',
  'bow-n',
  'bow-e',
  'bow-s',
  'bow-w',
  'hull-n',
  'hull-e',
  'hull-s',
  'hull-w',
];

export const isRoomShape = (v: unknown): v is RoomShape =>
  typeof v === 'string' && (ROOM_SHAPES as readonly string[]).includes(v);

/** 曲線的房間的外框最小幾格（每一邊） */
export const CURVE_MIN = 2;

/** 圓角、倒角可以設 `radius`（格，0.5 一格）；其他形狀沒有這個欄位 */
export const hasRadius = (s: RoomShape | undefined): boolean => s === 'round' || s === 'chamfer';

type Box = Pick<Room, 'x' | 'y' | 'w' | 'h' | 'shape' | 'radius'>;

export const isCurved = (r: Pick<Room, 'shape'> | null | undefined): boolean => !!r?.shape;

const EPS = 1e-9;

/** 圓角、倒角能設的最大值（外框短邊的一半，再留一點） */
export const radiusMax = (w: number, h: number): number => Math.max(0, Math.min(w, h) / 2 - 0.02);

/** 圓角的預設半徑：短邊 × 0.25，取到 0.5 格、至少 0.5 格、最多 2 格（1 m） */
export const defaultRound = (w: number, h: number): number =>
  Math.min(2, Math.max(0.5, Math.round(Math.min(w, h) * 0.5) / 2));

/** 實際用的圓角半徑／倒角寬（沒有設＝預設；夾在 0～短邊的一半） */
export function cornerSize(r: Box): number {
  const max = radiusMax(r.w, r.h);
  if (r.shape === 'round')
    return Math.min(max, r.radius && r.radius > 0 ? r.radius : defaultRound(r.w, r.h));
  if (r.shape === 'chamfer')
    return Math.min(max, r.radius && r.radius > 0.05 ? r.radius : Math.min(r.w, r.h) * 0.28);
  return 0;
}

/** 曲線切幾段：每段約 0.25 格（至少 min 段） */
const segs = (len: number, min: number) => Math.max(min, Math.min(400, Math.ceil(len / 0.25)));

function arc(
  pts: Pt[],
  ox: number,
  oy: number,
  ax: number,
  ay: number,
  a0: number,
  a1: number,
  min = 6,
  skipFirst = false,
): void {
  const len = Math.abs(a1 - a0) * Math.max(ax, ay);
  const n = segs(len, min);
  for (let i = skipFirst ? 1 : 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    pts.push([ox + Math.cos(t) * ax, oy + Math.sin(t) * ay]);
  }
}

function qbez(pts: Pt[], p0: Pt, p1: Pt, p2: Pt, skipFirst = false): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = segs(len, 8);
  for (let i = skipFirst ? 1 : 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
      u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ]);
  }
}

/** 朝上的形狀（圓頂、船首、船體）：轉成朝右／下／左（以外框的中心；外框本身就是轉過的） */
function orientPts(pts: Pt[], b: Rect, dir: 'n' | 'e' | 's' | 'w'): Pt[] {
  if (dir === 'n') return pts;
  /* pts 是在「朝上」的外框（寬 W＝轉之前的寬）裡算的；這裡把它順時針轉 k 次放進 b */
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return pts.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    if (dir === 'e') return [cx - dy, cy + dx] as Pt;
    if (dir === 's') return [cx - dx, cy - dy] as Pt;
    return [cx + dy, cy - dx] as Pt;
  });
}

/** 朝上的形狀：在寬 w、深 h（朝上時的寬深）的外框裡（以 b 的中心為中心）算的點 */
function upright(
  shape: 'dome' | 'bow' | 'hull',
  cx: number,
  cy: number,
  w: number,
  h: number,
): Pt[] {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const rx = w / 2;
  const pts: Pt[] = [];
  if (shape === 'dome') {
    const d = Math.min(h * 0.65, rx);
    arc(pts, cx, y + d, rx, d, Math.PI, Math.PI * 2, 12);
    pts.push([x + w, y + h], [x, y + h]);
    return pts;
  }
  if (shape === 'bow') {
    const l = Math.min(h * 0.85, Math.max(h * 0.55, w * 0.9));
    pts.push([x, y + h]);
    qbez(pts, [x, y + l], [x, y + l * 0.22], [cx, y]);
    qbez(pts, [cx, y], [x + w, y + l * 0.22], [x + w, y + l], true);
    pts.push([x + w, y + h]);
    return pts;
  }
  const l = h * 0.42;
  const sr = Math.min(w * 0.32, h * 0.18);
  qbez(pts, [x, y + l], [x, y + l * 0.2], [cx, y]);
  qbez(pts, [cx, y], [x + w, y + l * 0.2], [x + w, y + l], true);
  arc(pts, x + w - sr, y + h - sr, sr, sr, 0, Math.PI / 2, 4);
  arc(pts, x + sr, y + h - sr, sr, sr, Math.PI / 2, Math.PI, 4);
  return pts;
}

/** 連續重複的點拿掉 */
function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9) continue;
    out.push(p);
  }
  const f = out[0];
  const l = out[out.length - 1];
  if (out.length > 1 && Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
  return out;
}

function computeOutline(r: Box): Pt[] {
  const { x, y, w, h } = r;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const s = r.shape as RoomShape;
  const pts: Pt[] = [];
  if (s === 'ellipse') {
    const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    /* 4 的倍數：上下左右的四點剛好是頂點（外形碰到外框的地方） */
    const n = Math.ceil(Math.max(32, Math.min(800, Math.ceil(per / 0.25))) / 4) * 4;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
    }
    return pts;
  }
  if (s === 'chamfer') {
    const c = cornerSize(r);
    return dedupe([
      [x + c, y],
      [x + w - c, y],
      [x + w, y + c],
      [x + w, y + h - c],
      [x + w - c, y + h],
      [x + c, y + h],
      [x, y + h - c],
      [x, y + c],
    ]);
  }
  if (s === 'round') {
    const cr = cornerSize(r);
    arc(pts, x + w - cr, y + cr, cr, cr, -Math.PI / 2, 0, 4);
    arc(pts, x + w - cr, y + h - cr, cr, cr, 0, Math.PI / 2, 4);
    arc(pts, x + cr, y + h - cr, cr, cr, Math.PI / 2, Math.PI, 4);
    arc(pts, x + cr, y + cr, cr, cr, Math.PI, Math.PI * 1.5, 4);
    return dedupe(pts);
  }
  const [kind, dir] = s.split('-') as ['dome' | 'bow' | 'hull', 'n' | 'e' | 's' | 'w'];
  /* 朝左右的形狀：朝上時的寬深＝外框的深寬 */
  const side = dir === 'e' || dir === 'w';
  const up = upright(kind, cx, cy, side ? h : w, side ? w : h);
  return dedupe(orientPts(up, { x, y, w, h }, dir));
}

const cache = new Map<string, Pt[]>();
const keyOf = (r: Box) => `${r.shape}|${r.x}|${r.y}|${r.w}|${r.h}|${r.radius ?? ''}`;

/** 外形（順時針；畫面的 y 往下） */
export function outlineOf(r: Box): Pt[] {
  const k = keyOf(r);
  const hit = cache.get(k);
  if (hit) return hit;
  let pts = computeOutline(r);
  /* 順時針（畫面座標的有號面積 > 0） */
  if (signedArea(pts) < 0) pts = pts.slice().reverse();
  /* 數值的尾巴：四捨五入到 1e-9，外框上的點剛好在外框上 */
  pts = pts.map(([px, py]) => [snapEdge(px, r.x, r.x + r.w), snapEdge(py, r.y, r.y + r.h)] as Pt);
  if (cache.size > 2000) cache.clear();
  cache.set(k, pts);
  return pts;
}

function snapEdge(v: number, lo: number, hi: number): number {
  if (Math.abs(v - lo) < 1e-7) return lo;
  if (Math.abs(v - hi) < 1e-7) return hi;
  return Math.round(v * 1e9) / 1e9;
}

export function signedArea(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    s += ax * by - bx * ay;
  }
  return s / 2;
}

/** 面積（格²） */
export const curvedArea = (r: Box): number => Math.abs(signedArea(outlineOf(r)));

/** 點到線段的距離 */
function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
  return Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t));
}

/** 點在多邊形裡（ray casting；不含邊） */
export function polyHas(pts: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 點離多邊形的邊多近 */
export function polyEdgeDist(pts: readonly Pt[], x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i++)
    best = Math.min(best, segDist(x, y, pts[i], pts[(i + 1) % pts.length]));
  return best;
}

/** 點在曲線的房間裡（不含邊；在邊上 1e-6 以內不算） */
export function curvedHas(r: Box, x: number, y: number): boolean {
  if (!(x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h)) return false;
  const pts = outlineOf(r);
  return polyHas(pts, x, y) && polyEdgeDist(pts, x, y) > 1e-6;
}

/** 點在曲線的房間裡或邊上 */
export function curvedHasClosed(r: Box, x: number, y: number): boolean {
  if (!(x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6))
    return false;
  const pts = outlineOf(r);
  return polyHas(pts, x, y) || polyEdgeDist(pts, x, y) <= 1e-6;
}

/** 長方形整個在曲線的房間裡（外形是凸的，四個角都在裡面或邊上就是） */
export function curvedContainsRect(r: Box, b: Rect): boolean {
  return (
    curvedHasClosed(r, b.x, b.y) &&
    curvedHasClosed(r, b.x + b.w, b.y) &&
    curvedHasClosed(r, b.x + b.w, b.y + b.h) &&
    curvedHasClosed(r, b.x, b.y + b.h)
  );
}

/** 一組點（轉過的長方形的四個角）整個在曲線的房間裡 */
export const curvedContainsPts = (r: Box, pts: readonly Pt[]): boolean =>
  pts.every(([x, y]) => curvedHasClosed(r, x, y));

/** 兩個凸多邊形有沒有重疊（分離軸；只碰到邊不算） */
export function convexOverlap(a: readonly Pt[], b: readonly Pt[], eps = 1e-6): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = -(q[1] - p[1]);
      const ny = q[0] - p[0];
      if (Math.abs(nx) < EPS && Math.abs(ny) < EPS) continue;
      let amin = Number.POSITIVE_INFINITY;
      let amax = Number.NEGATIVE_INFINITY;
      let bmin = Number.POSITIVE_INFINITY;
      let bmax = Number.NEGATIVE_INFINITY;
      const len = Math.hypot(nx, ny);
      for (const v of a) {
        const d = (v[0] * nx + v[1] * ny) / len;
        amin = Math.min(amin, d);
        amax = Math.max(amax, d);
      }
      for (const v of b) {
        const d = (v[0] * nx + v[1] * ny) / len;
        bmin = Math.min(bmin, d);
        bmax = Math.max(bmax, d);
      }
      if (amax <= bmin + eps || bmax <= amin + eps) return false;
    }
  return true;
}

export const rectPts = (b: Rect): Pt[] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w, b.y + b.h],
  [b.x, b.y + b.h],
];

/** 曲線的房間和長方形有沒有重疊（只碰到邊不算） */
export const curvedOverlapsRect = (r: Box, b: Rect): boolean =>
  b.x < r.x + r.w &&
  r.x < b.x + b.w &&
  b.y < r.y + r.h &&
  r.y < b.y + b.h &&
  convexOverlap(outlineOf(r), rectPts(b));

/** 直的部分（外形落在外框線上的邊）：自動牆照格線的規則算 */
export interface FlatSpan {
  o: 'h' | 'v';
  c: number;
  a: number;
  b: number;
}

const onLine = (v: number, line: number) => Math.abs(v - line) < 1e-7;

/** 外形的一條邊落在外框的哪一條線上（沒有時 null） */
function edgeOnBox(r: Box, p: Pt, q: Pt): FlatSpan | null {
  for (const c of [r.y, r.y + r.h])
    if (onLine(p[1], c) && onLine(q[1], c) && Math.abs(p[0] - q[0]) > 1e-7)
      return { o: 'h', c, a: Math.min(p[0], q[0]), b: Math.max(p[0], q[0]) };
  for (const c of [r.x, r.x + r.w])
    if (onLine(p[0], c) && onLine(q[0], c) && Math.abs(p[1] - q[1]) > 1e-7)
      return { o: 'v', c, a: Math.min(p[1], q[1]), b: Math.max(p[1], q[1]) };
  return null;
}

/** 外形的直的部分（落在外框線上的段） */
export function flatSpans(r: Box): FlatSpan[] {
  const pts = outlineOf(r);
  const out: FlatSpan[] = [];
  for (let i = 0; i < pts.length; i++) {
    const s = edgeOnBox(r, pts[i], pts[(i + 1) % pts.length]);
    if (s) out.push(s);
  }
  return out;
}

/** 外形的曲線部分的邊（不落在外框線上的）：[起點, 終點] */
export function curveEdges(r: Box): [Pt, Pt][] {
  const pts = outlineOf(r);
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (!edgeOnBox(r, p, q)) out.push([p, q]);
  }
  return out;
}

/** 外形的曲線部分上離 (x, y) 最近的一點與那裡的切線方向（度，順著外形的方向） */
export function nearestOnCurve(
  r: Box,
  x: number,
  y: number,
): { x: number; y: number; deg: number; d: number } | null {
  let best: { x: number; y: number; deg: number; d: number } | null = null;
  for (const [a, b] of curveEdges(r)) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < EPS) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
    const px = a[0] + dx * t;
    const py = a[1] + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (!best || d < best.d - 1e-12)
      best = { x: px, y: py, deg: (Math.atan2(dy, dx) * 180) / Math.PI, d };
  }
  return best;
}

/**
 * 曲線的房間裡最大的長方形（名字、編號、鎖與筆記的標記、內裝預設的中心、圓形配置的中心）：外形是凸的，
 * 所以上下兩條水平線之間能放的寬＝兩條線上的寬的交集；上下各取 24 個位置找面積最大的（一樣大時取上面的、再取矮的）。
 */
const mainCache = new Map<string, Rect>();

export function curvedMainRect(r: Box): Rect {
  const k = keyOf(r);
  const hit = mainCache.get(k);
  if (hit) return { ...hit };
  const out = computeMainRect(r);
  if (mainCache.size > 2000) mainCache.clear();
  mainCache.set(k, out);
  return { ...out };
}

function computeMainRect(r: Box): Rect {
  const pts = outlineOf(r);
  const N = 24;
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) ys.push(r.y + (r.h * i) / N);
  const chord = (yy: number): [number, number] | null => {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if (Math.abs(ay - by) < EPS) {
        if (Math.abs(ay - yy) < 1e-7) xs.push(ax, bx);
        continue;
      }
      if ((ay <= yy && by >= yy) || (by <= yy && ay >= yy))
        xs.push(ax + ((bx - ax) * (yy - ay)) / (by - ay));
    }
    if (xs.length < 2) return null;
    return [Math.min(...xs), Math.max(...xs)];
  };
  const chords = ys.map(chord);
  let best: Rect = { x: r.x, y: r.y, w: 0, h: 0 };
  let bestA = -1;
  for (let i = 0; i < ys.length; i++)
    for (let j = i + 1; j < ys.length; j++) {
      const a = chords[i];
      const b = chords[j];
      if (!a || !b) continue;
      const x0 = Math.max(a[0], b[0]);
      const x1 = Math.min(a[1], b[1]);
      if (x1 <= x0) continue;
      const area = (x1 - x0) * (ys[j] - ys[i]);
      if (area > bestA + 1e-9) {
        bestA = area;
        best = { x: x0, y: ys[i], w: x1 - x0, h: ys[j] - ys[i] };
      }
    }
  const q = (v: number) => Math.round(v * 100) / 100;
  return { x: q(best.x), y: q(best.y), w: q(best.w), h: q(best.h) };
}

/** 外接範圍的格子裡，中心在外形裡的（光、家具「這一格是誰的」） */
export function* curvedCells(r: Box): Generator<[number, number]> {
  for (let x = r.x; x < r.x + r.w; x++)
    for (let y = r.y; y < r.y + r.h; y++) if (curvedHas(r, x + 0.5, y + 0.5)) yield [x, y];
}

/* ---------- 轉 90°、反轉：外框換過去，形狀換方向（KIIN 的形狀轉 90° 剛好是另一個方向的形狀） ---------- */

const DIRS = ['n', 'e', 's', 'w'] as const;

function withDir(
  s: RoomShape,
  map: (d: (typeof DIRS)[number]) => (typeof DIRS)[number],
): RoomShape {
  const m = /^(dome|bow|hull)-([nesw])$/.exec(s);
  if (!m) return s;
  return `${m[1]}-${map(m[2] as (typeof DIRS)[number])}` as RoomShape;
}

/** 順時針轉 90° 之後的形狀 */
export const rotateShapeCW = (s: RoomShape): RoomShape =>
  withDir(s, (d) => DIRS[(DIRS.indexOf(d) + 1) % 4]);
/** 左右反轉之後的形狀 */
export const flipShapeX = (s: RoomShape): RoomShape =>
  withDir(s, (d) => (d === 'e' ? 'w' : d === 'w' ? 'e' : d));
/** 上下反轉之後的形狀 */
export const flipShapeY = (s: RoomShape): RoomShape =>
  withDir(s, (d) => (d === 'n' ? 's' : d === 's' ? 'n' : d));

/** 把外形加進目前的路徑 */
export function traceCurved(c: CanvasRenderingContext2D, r: Box): void {
  const pts = outlineOf(r);
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}
