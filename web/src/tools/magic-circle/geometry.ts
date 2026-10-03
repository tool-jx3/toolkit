/**
 * 幾何：貝茲曲線的折線化、截斷、簡化與平滑、對稱複本的座標轉換與出場名次、吸附、對齊與分佈（規格 3.1～3.6）。
 * 純函式（不依賴畫布），單元測試在 Node 跑。
 */
import type { CopyOrder, McElement, McSnap, McSymmetry, PathPoint } from './model';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const rad = (deg: number): number => (deg * Math.PI) / 180;
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
/** 四捨五入到 digits 位小數 */
export const round = (v: number, digits = 2): number => {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
};

export function cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/* ---------- 正多邊形、星形 ---------- */

const corner = (x: number, y: number): PathPoint => ({
  x,
  y,
  inX: x,
  inY: y,
  outX: x,
  outY: y,
  smooth: false,
});

export function regularPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation = -Math.PI / 2,
): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * Math.PI * 2) / sides;
    out.push(corner(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius));
  }
  return out;
}

export function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  count: number,
  rotation = -Math.PI / 2,
): PathPoint[] {
  const out: PathPoint[] = [];
  for (let i = 0; i < count * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / count;
    out.push(corner(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}

/* ---------- 手繪：簡化與平滑（規格 3.4） ---------- */

/** Catmull–Rom 轉成把手（張力 tension；開放路徑頭尾以自己代替缺的鄰點） */
export function catmullRomAnchors(
  points: readonly Point[],
  closed = false,
  tension = 1,
): PathPoint[] {
  if (points.length < 2) return points.map((p) => corner(p.x, p.y));
  const n = points.length;
  const factor = tension / 6;
  return points.map((cur, i) => {
    const prev = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = (next.x - prev.x) * factor;
    const dy = (next.y - prev.y) * factor;
    const head = i === 0 && !closed;
    const tail = i === n - 1 && !closed;
    return {
      x: cur.x,
      y: cur.y,
      inX: head ? cur.x : cur.x - dx,
      inY: head ? cur.y : cur.y - dy,
      outX: tail ? cur.x : cur.x + dx,
      outY: tail ? cur.y : cur.y + dy,
      smooth: true,
    };
  });
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Ramer–Douglas–Peucker */
export function simplifyRDP<P extends Point>(points: readonly P[], epsilon: number): P[] {
  if (points.length < 3) return points.slice();
  let max = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > max) {
      index = i;
      max = d;
    }
  }
  if (max > epsilon) {
    const left = simplifyRDP(points.slice(0, index + 1), epsilon);
    const right = simplifyRDP(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/* ---------- 折線化與截斷（規格 3.4、3.1） ---------- */

export interface Flat {
  points: Point[];
  closed: boolean;
}

/** 路徑與圓的折線（文字回傳空的） */
export function flattenElement(el: McElement, quality = 1): Flat {
  const points: Point[] = [];
  if (el.type === 'path') {
    if (!el.points.length) return { points, closed: false };
    points.push({ x: el.points[0].x, y: el.points[0].y });
    const n = el.points.length;
    const segments = n - 1 + (el.closed ? 1 : 0);
    for (let s = 0; s < segments; s++) {
      const a = el.points[s % n];
      const b = el.points[(s + 1) % n];
      const chord = dist(a, b);
      const handles = dist(a, { x: a.outX, y: a.outY }) + dist(b, { x: b.inX, y: b.inY });
      const samples = clamp(Math.ceil((chord + handles) / (12 / quality)), 8, 70);
      for (let i = 1; i <= samples; i++) {
        points.push(
          cubicBezierPoint(a, { x: a.outX, y: a.outY }, { x: b.inX, y: b.inY }, b, i / samples),
        );
      }
    }
    return { points, closed: el.closed };
  }
  if (el.type === 'circle') {
    const samples = clamp(Math.ceil(Math.max(el.rx, el.ry) * 0.55 * quality), 72, 240);
    const cos = Math.cos(el.rotation || 0);
    const sin = Math.sin(el.rotation || 0);
    for (let i = 0; i <= samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const ex = Math.cos(a) * el.rx;
      const ey = Math.sin(a) * el.ry;
      points.push({ x: el.x + ex * cos - ey * sin, y: el.y + ex * sin + ey * cos });
    }
    return { points, closed: true };
  }
  return { points, closed: false };
}

export function polylineLengths(points: readonly Point[]): { lengths: number[]; total: number } {
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1], points[i]);
    lengths.push(total);
  }
  return { lengths, total };
}

/** 沿長度取前 progress 比例的折線（reverse：從終點開始） */
export function partialPolyline(
  points: readonly Point[],
  progress: number,
  reverse = false,
  metrics?: { lengths: number[]; total: number },
): Point[] {
  if (!points.length) return [];
  const source = reverse ? points.slice().reverse() : points;
  const { lengths, total } = metrics ?? polylineLengths(source);
  if (total <= 0 || progress >= 1) return source.slice();
  if (progress <= 0) return [source[0]];
  const target = total * progress;
  const out: Point[] = [source[0]];
  for (let i = 1; i < source.length; i++) {
    if (lengths[i] <= target) {
      out.push(source[i]);
      continue;
    }
    const segStart = lengths[i - 1];
    const segLen = lengths[i] - segStart;
    const t = segLen ? (target - segStart) / segLen : 0;
    out.push({
      x: lerp(source[i - 1].x, source[i].x, t),
      y: lerp(source[i - 1].y, source[i].y, t),
    });
    break;
  }
  return out;
}

export function pointsBounds(points: readonly Point[]): Bounds {
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) return dist(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

export function rotatePointAround(p: Point, center: Point, angle: number): Point {
  if (!angle) return { x: p.x, y: p.y };
  const x = p.x - center.x;
  const y = p.y - center.y;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: center.x + x * c - y * s, y: center.y + x * s + y * c };
}

/* ---------- 元素的平移與節點編輯 ---------- */

/** 整個元素平移（路徑的節點與把手一起）；回傳新的元素 */
export function translated<E extends McElement>(el: E, dx: number, dy: number): E {
  if (el.type === 'path') {
    return {
      ...el,
      points: el.points.map((p) => ({
        ...p,
        x: p.x + dx,
        y: p.y + dy,
        inX: p.inX + dx,
        inY: p.inY + dy,
        outX: p.outX + dx,
        outY: p.outY + dy,
      })),
    };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

/** 選取點平滑化（規格 F80） */
export function smoothNode(
  points: readonly PathPoint[],
  index: number,
  closed: boolean,
): PathPoint[] {
  const out = points.map((p) => ({ ...p }));
  const cur = out[index];
  if (!cur || out.length < 2) return out;
  const prev = index > 0 ? out[index - 1] : closed ? out[out.length - 1] : cur;
  const next = index < out.length - 1 ? out[index + 1] : closed ? out[0] : cur;
  let tx = next.x - prev.x;
  let ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  const inLen = prev === cur ? 0 : dist(cur, prev) / 3;
  const outLen = next === cur ? 0 : dist(cur, next) / 3;
  cur.inX = cur.x - tx * inLen;
  cur.inY = cur.y - ty * inLen;
  cur.outX = cur.x + tx * outLen;
  cur.outY = cur.y + ty * outLen;
  cur.smooth = true;
  return out;
}

/** 選取點轉角化 */
export function cornerNode(points: readonly PathPoint[], index: number): PathPoint[] {
  return points.map((p, i) =>
    i === index ? { ...p, inX: p.x, inY: p.y, outX: p.x, outY: p.y, smooth: false } : p,
  );
}

/** 反轉筆畫方向：順序倒過來、兩側把手互換 */
export function reversePathPoints(points: readonly PathPoint[]): PathPoint[] {
  return points
    .slice()
    .reverse()
    .map((p) => ({ ...p, inX: p.outX, inY: p.outY, outX: p.inX, outY: p.inY }));
}

/* ---------- 對稱複本（規格 3.1） ---------- */

/** 元素的複本數 */
export function copyCountFor(symmetry: McSymmetry, el: Pick<McElement, 'symmetry'>): number {
  return symmetry.enabled && el.symmetry ? clamp(Math.round(symmetry.count), 1, 64) : 1;
}

export function copyAngle(symmetry: McSymmetry, index: number, count: number): number {
  return rad(symmetry.offset || 0) + (index * Math.PI * 2) / count;
}

export function transformPointForCopy(
  symmetry: McSymmetry,
  p: Point,
  index: number,
  count: number,
): Point {
  if (count === 1 && index === 0) return { x: p.x, y: p.y };
  const cx = symmetry.centerX;
  const cy = symmetry.centerY;
  let x = p.x - cx;
  const y = p.y - cy;
  if (symmetry.mirror && index % 2 === 1) x = -x;
  const a = copyAngle(symmetry, index, count);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: cx + x * c - y * s, y: cy + x * s + y * c };
}

export function inverseTransformPointForCopy(
  symmetry: McSymmetry,
  p: Point,
  index: number,
  count: number,
): Point {
  if (count === 1 && index === 0) return { x: p.x, y: p.y };
  const cx = symmetry.centerX;
  const cy = symmetry.centerY;
  const a = -copyAngle(symmetry, index, count);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p.x - cx;
  const y = p.y - cy;
  let rx = x * c - y * s;
  const ry = x * s + y * c;
  if (symmetry.mirror && index % 2 === 1) rx = -rx;
  return { x: cx + rx, y: cy + ry };
}

/** FNV-1a（32 位元） */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rankCache = new Map<string, Uint8Array>();

/** 複本 index 的出場名次（規格 3.2） */
export function copySequenceRank(
  index: number,
  count: number,
  order: CopyOrder,
  seedText: string,
): number {
  if (count <= 1) return 0;
  if (order === 'counter') return (count - index) % count;
  if (order !== 'alternate' && order !== 'random') return index;
  const key = `${seedText}:${count}:${order}`;
  let ranks = rankCache.get(key);
  if (!ranks) {
    let sequence: number[];
    if (order === 'alternate') {
      sequence = [0];
      for (let step = 1; sequence.length < count; step++) {
        if (step < count) sequence.push(step);
        if (sequence.length < count && count - step !== step) sequence.push(count - step);
      }
    } else {
      sequence = Array.from({ length: count }, (_, i) => i);
      const random = mulberry32(hashString(seedText));
      for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
      }
    }
    ranks = new Uint8Array(count);
    sequence.forEach((copy, rank) => {
      ranks![copy] = rank;
    });
    if (rankCache.size > 2048) rankCache.clear();
    rankCache.set(key, ranks);
  }
  return ranks[index];
}

/* ---------- 吸附（規格 3.3） ---------- */

export type SnapKind = 'grid' | 'centerX' | 'centerY' | 'center' | 'guide' | 'angle';

export interface SnapHit {
  point: Point;
  kind: SnapKind;
}

export interface SnapOptions {
  snap: McSnap;
  symmetry: McSymmetry;
  /** 每畫布單位幾個螢幕 px */
  zoom: number;
  /** 角度吸附的錨點 */
  anchor?: Point | null;
  /** 不吸附（按住 Alt） */
  disable?: boolean;
}

/** 吸附：回傳吸到的點與種類；沒吸到時 null */
export function snapPoint(raw: Point, o: SnapOptions): SnapHit | null {
  const { snap, symmetry } = o;
  if (!snap.enabled || o.disable) return null;
  const threshold = Math.max(1, snap.threshold) / o.zoom;
  const candidates: { point: Point; kind: SnapKind; d: number }[] = [];
  const add = (point: Point, kind: SnapKind) => {
    const d = dist(raw, point);
    if (d <= threshold) candidates.push({ point, kind, d });
  };
  if (snap.grid) {
    const size = Math.max(2, Number(snap.gridSize) || 25);
    add({ x: Math.round(raw.x / size) * size, y: Math.round(raw.y / size) * size }, 'grid');
  }
  if (snap.center) {
    const cx = symmetry.centerX;
    const cy = symmetry.centerY;
    add({ x: cx, y: raw.y }, 'centerX');
    add({ x: raw.x, y: cy }, 'centerY');
    add({ x: cx, y: cy }, 'center');
  }
  if (snap.radial && symmetry.enabled) {
    const cx = symmetry.centerX;
    const cy = symmetry.centerY;
    const dx = raw.x - cx;
    const dy = raw.y - cy;
    const radius = Math.hypot(dx, dy);
    const count = clamp(Math.round(symmetry.count), 1, 64);
    const base = rad(symmetry.offset || 0) - Math.PI / 2;
    const step = (Math.PI * 2) / count;
    const nearest = base + Math.round((Math.atan2(dy, dx) - base) / step) * step;
    add({ x: cx + Math.cos(nearest) * radius, y: cy + Math.sin(nearest) * radius }, 'guide');
  }
  if (snap.angles && o.anchor) {
    const dx = raw.x - o.anchor.x;
    const dy = raw.y - o.anchor.y;
    const radius = Math.hypot(dx, dy);
    if (radius > 0.01) {
      const step = rad(Math.max(1, Number(snap.angleStep) || 15));
      const a = Math.round(Math.atan2(dy, dx) / step) * step;
      add({ x: o.anchor.x + Math.cos(a) * radius, y: o.anchor.y + Math.sin(a) * radius }, 'angle');
    }
  }
  if (!candidates.length) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.d < best.d) best = c;
  return { point: { ...best.point }, kind: best.kind };
}

/* ---------- 對齊與分佈（規格 3.6） ---------- */

export const boundsCenter = (b: Bounds): Point => ({
  x: (b.minX + b.maxX) / 2,
  y: (b.minY + b.maxY) / 2,
});

export function unionBounds(list: readonly (Bounds | null | undefined)[]): Bounds | null {
  const valid = list.filter(
    (b): b is Bounds => !!b && [b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite),
  );
  if (!valid.length) return null;
  return {
    minX: Math.min(...valid.map((b) => b.minX)),
    minY: Math.min(...valid.map((b) => b.minY)),
    maxX: Math.max(...valid.map((b) => b.maxX)),
    maxY: Math.max(...valid.map((b) => b.maxY)),
  };
}

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

export function alignBoundsDelta(
  b: Bounds,
  ref: Bounds,
  mode: AlignMode,
): { dx: number; dy: number } {
  const c = boundsCenter(b);
  const rc = boundsCenter(ref);
  switch (mode) {
    case 'left':
      return { dx: ref.minX - b.minX, dy: 0 };
    case 'center-x':
      return { dx: rc.x - c.x, dy: 0 };
    case 'right':
      return { dx: ref.maxX - b.maxX, dy: 0 };
    case 'top':
      return { dx: 0, dy: ref.minY - b.minY };
    case 'center-y':
      return { dx: 0, dy: rc.y - c.y };
    case 'bottom':
      return { dx: 0, dy: ref.maxY - b.maxY };
  }
}

export interface DistributeItem {
  id: string;
  bounds: Bounds;
  order: number;
}

export function distributeBounds(
  items: readonly DistributeItem[],
  axis: 'x' | 'y',
): { id: string; delta: number }[] {
  const minK = axis === 'x' ? 'minX' : 'minY';
  const maxK = axis === 'x' ? 'maxX' : 'maxY';
  const valid = items.filter(
    (it) => Number.isFinite(it.bounds[minK]) && Number.isFinite(it.bounds[maxK]),
  );
  if (valid.length < 3) return [];
  const ordered = valid.slice().sort((a, b) => {
    const ca = (a.bounds[minK] + a.bounds[maxK]) / 2;
    const cb = (b.bounds[minK] + b.bounds[maxK]) / 2;
    return ca - cb || a.order - b.order || a.id.localeCompare(b.id);
  });
  const start = ordered[0].bounds[minK];
  const end = ordered[ordered.length - 1].bounds[maxK];
  const total = ordered.reduce((s, it) => s + it.bounds[maxK] - it.bounds[minK], 0);
  const gap = (end - start - total) / (ordered.length - 1);
  let cursor = start;
  return ordered.map((it) => {
    const delta = cursor - it.bounds[minK];
    cursor += it.bounds[maxK] - it.bounds[minK] + gap;
    return { id: it.id, delta };
  });
}

export function normalizeRadians(v: number): number {
  const full = Math.PI * 2;
  return ((v % full) + full) % full;
}

export function nearestSymmetryAngle(
  angle: number,
  base: number,
  count: number,
  sectorCenter = false,
): number {
  const step = (Math.PI * 2) / Math.max(1, Math.round(count) || 1);
  const r = (angle - base) / step;
  return base + (sectorCenter ? Math.floor(r) + 0.5 : Math.round(r)) * step;
}

export function distributePolarAngles(
  items: readonly { id: string; angle: number; order: number }[],
): { id: string; angle: number }[] {
  if (items.length < 3) return [];
  const sorted = items
    .map((it) => ({ ...it, angle: normalizeRadians(it.angle) }))
    .sort((a, b) => a.angle - b.angle || a.order - b.order || a.id.localeCompare(b.id));
  let largest = -1;
  let cut = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = i === sorted.length - 1 ? sorted[0].angle + Math.PI * 2 : sorted[i + 1].angle;
    const gap = next - sorted[i].angle;
    if (gap > largest) {
      largest = gap;
      cut = (i + 1) % sorted.length;
    }
  }
  const ordered: { id: string; angle: number }[] = [];
  for (let k = 0; k < sorted.length; k++) {
    const it = sorted[(cut + k) % sorted.length];
    let a = it.angle;
    if (ordered.length && a < ordered[ordered.length - 1].angle) a += Math.PI * 2;
    ordered.push({ id: it.id, angle: a });
  }
  const first = ordered[0].angle;
  const step = (ordered[ordered.length - 1].angle - first) / (ordered.length - 1);
  return ordered.map((it, i) => ({ id: it.id, angle: first + step * i }));
}

export function distributePolarRadii(
  items: readonly { id: string; radius: number; order: number }[],
): { id: string; radius: number }[] {
  if (items.length < 3) return [];
  const ordered = items
    .slice()
    .sort((a, b) => a.radius - b.radius || a.order - b.order || a.id.localeCompare(b.id));
  const first = ordered[0].radius;
  const step = (ordered[ordered.length - 1].radius - first) / (ordered.length - 1);
  return ordered.map((it, i) => ({ id: it.id, radius: first + step * i }));
}
