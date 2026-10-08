/**
 * 作圖的幾何與數值規則（規格 3.4、3.3、1.6）。全部是純函式，單元測試可以直接用。
 * 數值照舊版 map_editor.js（getDashArray、buildBezierPath、roundedPolyPath、fmtCells、exportCellDims…）。
 */
import type { MapGridType } from '@/core/grid';
import type { StrokeStyle } from './model';

export interface Pt {
  x: number;
  y: number;
}

/** 線型 → 虛線陣列（實線 null）；w＝線寬（牆壁是厚度） */
export function dashArray(style: StrokeStyle, w: number): number[] | null {
  if (style === 'dashed') return [w * 5, w * 3];
  if (style === 'dotted') return [w, w * 2];
  if (style === 'dashdot') return [w * 5, w * 2, w, w * 2];
  if (style === 'longdash') return [w * 10, w * 4];
  return null;
}

/** 虛線陣列 → 線型（舊版讀存檔時的判斷：4 個是點劃線；2 個時看前後比例） */
export function styleOfDash(arr: readonly number[] | null | undefined): StrokeStyle {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return 'solid';
  if (arr.length === 4) return 'dashdot';
  if (arr.length !== 2) return 'solid';
  const r = arr[0] / arr[1];
  if (r < 1) return 'dotted';
  if (r >= 2.2) return 'longdash';
  return 'dashed';
}

/** 網格的線型（只有實線、虛線、點線）：null 或空的＝實線、前段比後段短＝點線、其他都是虛線 */
export function gridStyleOfDash(
  arr: readonly number[] | null | undefined,
): 'solid' | 'dashed' | 'dotted' {
  if (!arr || arr.length === 0) return 'solid';
  return styleOfDash(arr) === 'dotted' ? 'dotted' : 'dashed';
}

/** 曲線（F075）：控制點 → SVG path（通過中點的二次貝茲） */
export function bezierPath(pts: readonly Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `${d} L ${pts[1].x} ${pts[1].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (i === pts.length - 2) d += ` Q ${p1.x} ${p1.y}, ${p2.x} ${p2.y}`;
    else d += ` Q ${p1.x} ${p1.y}, ${(p1.x + p2.x) / 2} ${(p1.y + p2.y) / 2}`;
  }
  return d;
}

/** 封閉曲線（F076）：從 P0、P1 的中點起，每個點當控制點、到它與下一點的中點，繞一圈 */
export function closedBezierPath(pts: readonly Pt[]): string {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} Z`;
  let d = `M ${(pts[0].x + pts[1].x) / 2} ${(pts[0].y + pts[1].y) / 2}`;
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n];
    const next = pts[(i + 1) % n];
    d += ` Q ${p.x} ${p.y}, ${(p.x + next.x) / 2} ${(p.y + next.y) / 2}`;
  }
  return `${d} Z`;
}

/**
 * 圓角（F086、3.4）：折線（closed＝false，端點不修圓）、多邊形（true，全部修圓並封閉）、
 * 房間的地面（'fill'：端點不修圓、最後直線封閉）。r ≤ 0 或少於 3 點時 null（用一般的折線／多邊形）。
 */
export function roundedPolyPath(
  points: readonly Pt[],
  closed: boolean | 'fill',
  r: number,
): string | null {
  const P = points;
  const n = P.length;
  if (n < 3 || !(r > 0)) return null;
  const f = (v: number) => v.toFixed(2);
  const len = (vx: number, vy: number) => Math.hypot(vx, vy) || 1;
  const trim = (V: Pt, prev: Pt, next: Pt) => {
    const apx = prev.x - V.x;
    const apy = prev.y - V.y;
    const anx = next.x - V.x;
    const any = next.y - V.y;
    const dp = len(apx, apy);
    const dn = len(anx, any);
    const t = Math.min(r, dp / 2, dn / 2);
    return {
      p1: { x: V.x + (apx / dp) * t, y: V.y + (apy / dp) * t },
      p2: { x: V.x + (anx / dn) * t, y: V.y + (any / dn) * t },
    };
  };
  if (closed === true) {
    const c = P.map((V, i) => trim(V, P[(i - 1 + n) % n], P[(i + 1) % n]));
    let d = `M ${f(c[0].p2.x)} ${f(c[0].p2.y)}`;
    for (let i = 1; i < n; i++)
      d += ` L ${f(c[i].p1.x)} ${f(c[i].p1.y)} Q ${f(P[i].x)} ${f(P[i].y)} ${f(c[i].p2.x)} ${f(c[i].p2.y)}`;
    d += ` L ${f(c[0].p1.x)} ${f(c[0].p1.y)} Q ${f(P[0].x)} ${f(P[0].y)} ${f(c[0].p2.x)} ${f(c[0].p2.y)} Z`;
    return d;
  }
  let d = `M ${f(P[0].x)} ${f(P[0].y)}`;
  for (let i = 1; i < n - 1; i++) {
    const t = trim(P[i], P[i - 1], P[i + 1]);
    d += ` L ${f(t.p1.x)} ${f(t.p1.y)} Q ${f(P[i].x)} ${f(P[i].y)} ${f(t.p2.x)} ${f(t.p2.y)}`;
  }
  d += ` L ${f(P[n - 1].x)} ${f(P[n - 1].y)}`;
  if (closed === 'fill') d += ' Z';
  return d;
}

/** 測量顯示的格數（F039）：整數（差 0.05 以內）或小數 1 位 */
export function fmtCells(px: number, cellSize: number): string {
  const v = px / (cellSize || 72);
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

/** 線段的角度（F039）：右＝0°、逆時針為正（畫面的 y 往下），0～359 的整數 */
export function segmentAngle(dx: number, dy: number): number {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  return Math.round(((a % 360) + 360) % 360) % 360;
}

/** 沿線文字的旋轉角度（字不會倒過來：−90～90°） */
export function labelAngle(dx: number, dy: number): number {
  let ta = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ta > 90) ta -= 180;
  else if (ta < -90) ta += 180;
  return ta;
}

/** R／Shift＋R 的角度表（F064） */
export const ROTATE_STOPS = [
  0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330,
];

/** 目前的角度 → 下一個（reverse：上一個）；到頭時循環 */
export function nextRotateStop(cur: number, reverse: boolean): number {
  const c = (((cur || 0) % 360) + 360) % 360;
  if (reverse) {
    const prev = [...ROTATE_STOPS].reverse().find((a) => a < c - 0.5);
    return prev !== undefined ? prev : ROTATE_STOPS[ROTATE_STOPS.length - 1];
  }
  const next = ROTATE_STOPS.find((a) => a > c + 0.5);
  return next !== undefined ? next : ROTATE_STOPS[0];
}

/** 矩形／外框橢圓的範圍（兩點）；中心模式：第一點是中心、半徑＝round(距離) */
export function boxFromPoints(
  a: Pt,
  b: Pt,
  centerMode: boolean,
): { left: number; top: number; w: number; h: number } {
  if (centerMode) {
    const r = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    return { left: a.x - r, top: a.y - r, w: r * 2, h: r * 2 };
  }
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

/** 匯出範圍的格數（檔名用，3.3）；不合理時 null */
export function exportCellDims(
  r: { w: number; h: number },
  gridType: MapGridType,
  cellSize: number,
): { n: number; m: number } {
  const cs = cellSize || 72;
  const half = (v: number) => Math.round(v * 2) / 2;
  if (!gridType.startsWith('hex')) return { n: Math.round(r.w / cs), m: Math.round(r.h / cs) };
  if (gridType.endsWith('-fit'))
    return { n: Math.round((2 * r.w) / cs), m: Math.round((2 * r.h) / cs) };
  const SQ3 = Math.sqrt(3);
  if (gridType.includes('flat')) return { n: half((2 * r.w) / (cs * SQ3)), m: half(r.h / cs) };
  return { n: half(r.w / cs), m: half((2 * r.h) / (cs * SQ3)) };
}

/** 匯出的檔名：trpg-map_<N>x<M>.<ext>（3.3） */
export function exportFileName(
  r: { w: number; h: number },
  gridType: MapGridType,
  cellSize: number,
  ext: 'png' | 'jpg' | 'svg',
): string {
  const d = exportCellDims(r, gridType, cellSize);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const suffix = d.n > 0 && d.m > 0 ? `_${fmt(d.n)}x${fmt(d.m)}` : '';
  return `trpg-map${suffix}.${ext}`;
}

/** `#rrggbb`＋不透明度 → `rgba(r,g,b,a)`（舊版 rgba()：格子的填色鍵、文字、手繪都用這個寫法） */
export function rgbaOf(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3 || h.length === 4
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const r = Number.parseInt(full.slice(0, 2), 16) || 0;
  const g = Number.parseInt(full.slice(2, 4), 16) || 0;
  const b = Number.parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

/** `#rrggbbaa` → `#rrggbb`＋不透明度（0～1，兩位小數以內） */
export function splitAlpha(hex8: string): { hex: string; alpha: number } {
  const h = hex8.replace('#', '').toLowerCase();
  const full =
    h.length === 3 || h.length === 4
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const hex = `#${full.slice(0, 6)}`;
  const alpha = full.length >= 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { hex, alpha: Math.round(alpha * 1000) / 1000 };
}

/** `#rrggbb`＋不透明度 → `#rrggbbaa`（ColorField 的值） */
export function joinAlpha(hex: string, alpha: number): string {
  const base = hex.replace('#', '').slice(0, 6).toLowerCase().padEnd(6, '0');
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${base}${a}`;
}

/**
 * CSS 顏色（`#rgb`、`#rrggbb(aa)`、`rgb()`、`rgba()`）→ `#rrggbbaa`；看不懂時 null。
 * 選取物件的填色、描邊顯示在 ColorField 用。
 */
export function cssToHex8(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  const hm = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hm) {
    const h = hm[1];
    if (h.length === 3 || h.length === 4) {
      const full = h
        .split('')
        .map((c) => c + c)
        .join('');
      return `#${full.padEnd(8, 'f')}`;
    }
    if (h.length === 6) return `#${h}ff`;
    if (h.length === 8) return `#${h}`;
    return null;
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/.exec(s);
  if (!m) return null;
  const c = (x: string) =>
    Math.max(0, Math.min(255, Math.round(Number(x))))
      .toString(16)
      .padStart(2, '0');
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  const aa = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${c(m[1])}${c(m[2])}${c(m[3])}${aa}`;
}

/** 縮圖的尺寸（等比、不放大，寬 ≤ maxW、高 ≤ maxH） */
export function thumbSize(w: number, h: number, maxW = 400, maxH = 250): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 1, h: 1 };
  const s = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
