/**
 * 幾何：多邊形的面積與面積重心、點在不在多邊形裡、線段距離、路線的曲線（取樣與畫法一致）、
 * 內側的城牆（縮小的多邊形要整個在原本的裡面）。
 */
import type { PathSink } from './terrain';
import type { Pt } from './types';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** 有號面積（畫面座標下順時針為正） */
export function signedArea(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const polygonArea = (pts: readonly Pt[]): number => Math.abs(signedArea(pts));

/** 面積重心（國名的基準位置）；面積幾乎是 0 時改用頂點平均 */
export function centroid(pts: readonly Pt[]): Pt {
  if (!pts.length) return { x: 0, y: 0 };
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) < 1e-5) {
    const n = pts.length;
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / n,
      y: pts.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export function distToPolyline(p: Pt, pts: readonly Pt[]): number {
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
  return best;
}

export function polylineLength(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++)
    s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/**
 * 路線的形狀（畫在地圖上的就是這條）：平滑時以每兩個點的中點為端點、點本身為控制點的二次曲線，最後一段直線到終點；
 * 不平滑或少於 3 點時是折線。
 */
export function tracePath(points: readonly Pt[], smooth: boolean, sink: PathSink): void {
  if (!points.length) return;
  sink.moveTo(points[0].x, points[0].y);
  if (!smooth || points.length < 3) {
    for (let i = 1; i < points.length; i++) sink.lineTo(points[i].x, points[i].y);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    sink.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = points[points.length - 1];
  sink.lineTo(last.x, last.y);
}

/** 沿著 tracePath 的形狀取樣（點距約 max(12, 全長 ÷ 1200) px），川的粗細、點選、長度都用它 */
export function sampleCurve(points: readonly Pt[], smooth: boolean): Pt[] {
  if (!points.length) return [];
  const out: Pt[] = [{ ...points[0] }];
  const spacing = Math.max(12, polylineLength(points) / 1200);
  const add = (p: Pt) => {
    const a = out[out.length - 1];
    if (Math.hypot(p.x - a.x, p.y - a.y) > 1e-6) out.push(p);
  };
  const line = (a: Pt, b: Pt) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      add({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  };
  if (!smooth || points.length < 3) {
    for (let i = 1; i < points.length; i++) line(points[i - 1], points[i]);
    return out;
  }
  let a = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const c = points[i];
    const n = points[i + 1];
    const b = { x: (c.x + n.x) / 2, y: (c.y + n.y) / 2 };
    const steps = Math.max(
      4,
      Math.ceil((Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y)) / spacing),
    );
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      add({
        x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      });
    }
    a = b;
  }
  line(a, points[points.length - 1]);
  return out;
}

/**
 * 川的粗細：從上游（第一個點）到下游（最後一個點）沿著長度變粗，
 * 半徑＝寬 ×（0.42＋0.83 × 走過的比例）÷ 2（上游約 0.42 倍、河口約 1.25 倍）。
 */
export function riverRadii(samples: readonly Pt[], width: number): number[] {
  const dist = [0];
  for (let i = 1; i < samples.length; i++)
    dist.push(
      dist[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y),
    );
  const total = dist[dist.length - 1] || 1;
  return dist.map((d) => (width * (0.42 + (0.83 * d) / total)) / 2);
}

/* ---------- 內側的城牆 ---------- */

const cross3 = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSeg = (a: Pt, b: Pt, p: Pt) =>
  Math.abs(cross3(a, b, p)) < 1e-6 &&
  p.x >= Math.min(a.x, b.x) - 1e-6 &&
  p.x <= Math.max(a.x, b.x) + 1e-6 &&
  p.y >= Math.min(a.y, b.y) - 1e-6 &&
  p.y <= Math.max(a.y, b.y) + 1e-6;

export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const u = cross3(a, b, c);
  const v = cross3(a, b, d);
  const w = cross3(c, d, a);
  const z = cross3(c, d, b);
  return (
    (u * v < 0 && w * z < 0) || onSeg(a, b, c) || onSeg(a, b, d) || onSeg(c, d, a) || onSeg(c, d, b)
  );
}

/** 多邊形自己交叉（不相鄰的兩邊相交） */
export function selfIntersects(pts: readonly Pt[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  return false;
}

/** 點到多邊形邊界的最短距離 */
export function distToOutline(p: Pt, pts: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++)
    best = Math.min(best, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  return best;
}

/**
 * 內側的一圈城牆：以面積重心（或離邊界最遠的格點）為中心，依序試縮成 66％、50％、35％、20％，
 * 取第一個「每個角都在原本的裡面且離邊界超過 2 px、邊和原本的邊不相交、面積至少 36 px²」的形狀。
 * 自己交叉的多邊形、怎麼縮都放不進去的凹形回傳 null。
 */
export function innerWallPoints(points: readonly Pt[]): Pt[] | null {
  if (points.length < 3 || selfIntersects(points)) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let pole: Pt | null = null;
  let best = 0;
  for (let y = 1; y < 16; y++)
    for (let x = 1; x < 16; x++) {
      const p = { x: minX + ((maxX - minX) * x) / 16, y: minY + ((maxY - minY) * y) / 16 };
      if (!pointInPolygon(p, points)) continue;
      const d = distToOutline(p, points);
      if (d > best) {
        best = d;
        pole = p;
      }
    }
  const centers = [centroid(points), pole].filter((p): p is Pt => !!p && pointInPolygon(p, points));
  const n = points.length;
  for (const k of [0.66, 0.5, 0.35, 0.2])
    for (const c of centers) {
      const out = points.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
      if (polygonArea(out) < 36) continue;
      if (!out.every((p) => pointInPolygon(p, points) && distToOutline(p, points) > 2)) continue;
      let crosses = false;
      for (let i = 0; i < n && !crosses; i++)
        for (let j = 0; j < n && !crosses; j++)
          if (segmentsIntersect(out[i], out[(i + 1) % n], points[j], points[(j + 1) % n]))
            crosses = true;
      if (crosses) continue;
      return out;
    }
  return null;
}

/** 複製時的位移：往右下 24 px，碰到地圖邊緣時往反方向或夾在邊緣 */
export function duplicateShift(min: number, max: number, limit: number): number {
  const right = limit - max;
  const left = min;
  if (right >= 24) return 24;
  if (left >= 24) return -24;
  return right >= left ? Math.max(0, right) : -Math.max(0, left);
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
