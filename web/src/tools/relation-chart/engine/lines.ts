/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 線條樣式與端點樣式的 SVG（原作的 wavyPathD、zigzag／square／lace、圖章線、capDecoSvg、跳線 buildBridgedPathD）。
 * 幾何一律以 bez(t)（0～1）取樣，直線、彎曲、自我關係、圖例樣本共用。
 */
import type { CapStyle, LineStyle } from '../model/types';

export interface Pt {
  x: number;
  y: number;
}
export type Bez = (t: number) => Pt;
/** 外框（線身先畫加寬的底色描邊；端點用描邊） */
export interface Outline {
  col: string;
  w: number;
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();

export const FANCY_LINE_STYLES: ReadonlySet<LineStyle> = new Set([
  'zigzag',
  'square',
  'lace',
  'hearts',
  'stars',
  'melody',
]);
export const FANCY_CAPS: ReadonlySet<CapStyle> = new Set([
  'harrow',
  'diamond',
  'hdiamond',
  'block',
  'bar',
  'hdot',
  'heart',
  'star',
]);

export function bezArcLen(bez: Bez): number {
  let len = 0;
  let prev = bez(0);
  for (let i = 1; i <= 20; i++) {
    const q = bez(i / 20);
    len += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }
  return len;
}

/** 線上某參數點的位置與單位切線、法線 */
export function bezFrame(bez: Bez, t: number) {
  const q = bez(t);
  const q2 = bez(Math.min(1, t + 0.01));
  const tx = q2.x - q.x;
  const ty = q2.y - q.y;
  const tl = Math.hypot(tx, ty) || 1;
  return { x: q.x, y: q.y, tx: tx / tl, ty: ty / tl, nx: -ty / tl, ny: tx / tl };
}

/** 波浪線（k＝波形縮放、ampMax＝振幅上限、sw＝實際線寬） */
export function wavyPathD(bez: Bez, k = 1, ampMax = Number.POSITIVE_INFINITY, sw = 3.5): string {
  const P0 = bez(0);
  const len = bezArcLen(bez);
  const wl = Math.max(18 * k, sw * 2.2);
  const amp = Math.min(Math.max(4 * k, sw * 0.55), ampMax, Math.max(4, len * 0.35));
  const waves = Math.max(sw > 10 ? 1 : 2, Math.round(len / wl));
  const steps = Math.max(waves * 10, 40);
  let d = `M ${f1(P0.x)} ${f1(P0.y)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const q = bez(t);
    const q2 = bez(Math.min(1, t + 0.01));
    const tx = q2.x - q.x;
    const ty = q2.y - q.y;
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl;
    const ny = tx / tl;
    const taper = Math.min(1, 6 * t, 6 * (1 - t));
    const off = Math.sin(t * waves * 2 * Math.PI) * amp * taper;
    d += ` L ${f1(q.x + nx * off)} ${f1(q.y + ny * off)}`;
  }
  return d;
}

function zigzagPathD(bez: Bez, k = 1, ampMax = Number.POSITIVE_INFINITY, sw = 3.5): string {
  const len = bezArcLen(bez);
  const wl = Math.max(16 * k, sw * 2.4);
  const amp = Math.min(Math.max(4 * k, sw * 0.6), ampMax, Math.max(4, len * 0.35));
  const n = Math.max(2, Math.round(len / wl));
  const P0 = bez(0);
  const P1 = bez(1);
  let d = `M ${f1(P0.x)} ${f1(P0.y)}`;
  for (let j = 0; j < n; j++) {
    const f = bezFrame(bez, (j + 0.5) / n);
    const off = (j % 2 ? -1 : 1) * amp;
    d += ` L ${f1(f.x + f.nx * off)} ${f1(f.y + f.ny * off)}`;
  }
  return `${d} L ${f1(P1.x)} ${f1(P1.y)}`;
}

function squarePathD(bez: Bez, k = 1, ampMax = Number.POSITIVE_INFINITY, sw = 3.5): string {
  const len = bezArcLen(bez);
  const wl = Math.max(15 * k, sw * 2.6);
  const amp = Math.min(Math.max(3.5 * k, sw * 0.55), ampMax, Math.max(3, len * 0.3));
  const n = Math.max(2, Math.round(len / wl));
  const P0 = bez(0);
  const P1 = bez(1);
  let d = `M ${f1(P0.x)} ${f1(P0.y)}`;
  for (let j = 0; j < n; j++) {
    const off = (j % 2 ? -1 : 1) * amp;
    const a = bezFrame(bez, j / n);
    const b = bezFrame(bez, (j + 1) / n);
    d += ` L ${f1(a.x + a.nx * off)} ${f1(a.y + a.ny * off)} L ${f1(b.x + b.nx * off)} ${f1(b.y + b.ny * off)}`;
  }
  return `${d} L ${f1(P1.x)} ${f1(P1.y)}`;
}

function laceLineMarkup(bez: Bez, col: string, lw: number, outline: Outline | null): string {
  const len = bezArcLen(bez);
  const step = Math.max(9, lw * 3);
  const n = Math.max(2, Math.round(len / step));
  const P0 = bez(0);
  let base = `M ${f1(P0.x)} ${f1(P0.y)}`;
  for (let i = 1; i <= 24; i++) {
    const q = bez(i / 24);
    base += ` L ${f1(q.x)} ${f1(q.y)}`;
  }
  let prev = P0;
  let arcs = `M ${f1(P0.x)} ${f1(P0.y)}`;
  for (let j = 1; j <= n; j++) {
    const q = bez(j / n);
    const r = Math.max(1, Math.hypot(q.x - prev.x, q.y - prev.y) / 2);
    arcs += ` A ${f1(r)} ${f1(r)} 0 0 1 ${f1(q.x)} ${f1(q.y)}`;
    prev = q;
  }
  const bw = Math.max(1, lw * 0.9);
  const aw = Math.max(1, lw * 0.55);
  const mk = (d: string, w: number, c: string) =>
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="${f1(w)}" stroke-linecap="round"/>`;
  return (
    (outline
      ? mk(base, bw + outline.w * 2, outline.col) + mk(arcs, aw + outline.w * 2, outline.col)
      : '') +
    mk(base, bw, col) +
    mk(arcs, aw, col)
  );
}

/** 圖章字形：座標約在 ±1 的小路徑（y 向下） */
export const LINE_GLYPHS: Record<'hearts' | 'stars' | 'melody', readonly (string | number)[]> = {
  hearts: [
    'M',
    0,
    0.75,
    'C',
    -0.6,
    0.25,
    -1,
    -0.05,
    -1,
    -0.4,
    'C',
    -1,
    -0.8,
    -0.6,
    -0.95,
    -0.35,
    -0.9,
    'C',
    -0.15,
    -0.86,
    0,
    -0.7,
    0,
    -0.5,
    'C',
    0,
    -0.7,
    0.15,
    -0.86,
    0.35,
    -0.9,
    'C',
    0.6,
    -0.95,
    1,
    -0.8,
    1,
    -0.4,
    'C',
    1,
    -0.05,
    0.6,
    0.25,
    0,
    0.75,
    'Z',
  ],
  stars: [
    'M',
    0,
    -1,
    'L',
    0.25,
    -0.34,
    'L',
    0.95,
    -0.31,
    'L',
    0.4,
    0.13,
    'L',
    0.59,
    0.81,
    'L',
    0,
    0.42,
    'L',
    -0.59,
    0.81,
    'L',
    -0.4,
    0.13,
    'L',
    -0.95,
    -0.31,
    'L',
    -0.25,
    -0.34,
    'Z',
  ],
  melody: [
    'M',
    -0.1,
    0.6,
    'C',
    -0.1,
    0.77,
    -0.23,
    0.9,
    -0.4,
    0.9,
    'C',
    -0.57,
    0.9,
    -0.7,
    0.77,
    -0.7,
    0.6,
    'C',
    -0.7,
    0.43,
    -0.57,
    0.3,
    -0.4,
    0.3,
    'C',
    -0.23,
    0.3,
    -0.1,
    0.43,
    -0.1,
    0.6,
    'Z',
    'M',
    -0.1,
    0.6,
    'L',
    -0.1,
    -0.85,
    'L',
    0.04,
    -0.85,
    'L',
    0.04,
    0.6,
    'Z',
    'M',
    0.04,
    -0.85,
    'Q',
    0.5,
    -0.62,
    0.55,
    -0.15,
    'Q',
    0.44,
    -0.42,
    0.04,
    -0.45,
    'Z',
  ],
};

export function glyphPathAt(
  cmds: readonly (string | number)[],
  cx: number,
  cy: number,
  ang: number,
  s: number,
): string {
  const cos = Math.cos(ang) * s;
  const sin = Math.sin(ang) * s;
  let d = '';
  let i = 0;
  while (i < cmds.length) {
    const c = cmds[i++] as string;
    if (c === 'Z') {
      d += ' Z';
      continue;
    }
    const nPts = c === 'C' ? 3 : c === 'Q' ? 2 : 1;
    d += ` ${c}`;
    for (let j = 0; j < nPts; j++) {
      const x = cmds[i++] as number;
      const y = cmds[i++] as number;
      d += ` ${f1(cx + x * cos - y * sin)} ${f1(cy + x * sin + y * cos)}`;
    }
  }
  return d;
}

function glyphLineD(bez: Bez, cmds: readonly (string | number)[], gs: number, gap: number): string {
  const len = bezArcLen(bez);
  const n = Math.max(1, Math.round(len / gap));
  let d = '';
  for (let j = 0; j < n; j++) {
    const f = bezFrame(bez, (j + 0.5) / n);
    d += glyphPathAt(cmds, f.x, f.y, Math.atan2(f.ty, f.tx), gs);
  }
  return d;
}

/** 波浪與進階線條（實線、虛線、點線由呼叫端自己畫） */
export function styledLineMarkup(
  style: LineStyle,
  bez: Bez,
  col: string,
  lw: number,
  ampMax: number,
  outline: Outline | null,
): string {
  const strokePair = (d: string) =>
    (outline
      ? `<path d="${d}" fill="none" stroke="${outline.col}" stroke-width="${f1(lw + outline.w * 2)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : '') +
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(lw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (style === 'wavy') return strokePair(wavyPathD(bez, Math.max(1, lw / 3), ampMax, lw));
  if (style === 'zigzag') return strokePair(zigzagPathD(bez, Math.max(1, lw / 3), ampMax, lw));
  if (style === 'square') return strokePair(squarePathD(bez, Math.max(1, lw / 3), ampMax, lw));
  if (style === 'lace') return laceLineMarkup(bez, col, lw, outline);
  if (style === 'hearts' || style === 'stars' || style === 'melody') {
    let gs = Math.max(4.5, lw * 1.9) * (style === 'melody' ? 1.2 : 1);
    if (Number.isFinite(ampMax)) gs = Math.min(gs, Math.max(3.5, ampMax));
    const d = glyphLineD(bez, LINE_GLYPHS[style], gs, gs * (style === 'melody' ? 2.6 : 2.3));
    const o = outline
      ? ` stroke="${outline.col}" stroke-width="${f1(outline.w * 2)}" paint-order="stroke" stroke-linejoin="round"`
      : '';
    return `<path d="${d}" fill="${col}"${o}/>`;
  }
  return '';
}

export interface CapDeco {
  deco: string;
  /** 線身縮進距離 */
  ins: number;
  /** 超出尖端座標多少（迷你預覽用） */
  out: number;
}

/**
 * 進階端點：(x, y)＝尖端、(dx, dy)＝指向尖端的單位方向、(px, py)＝垂直單位向量；AL／dotR＝箭頭長／圓點半徑基準。
 */
export function capDecoSvg(
  cs: CapStyle,
  x: number,
  y: number,
  dx: number,
  dy: number,
  px: number,
  py: number,
  AL: number,
  dotR: number,
  lw: number,
  col: string,
  o: Outline | null,
): CapDeco {
  const capO = o
    ? ` stroke="${o.col}" stroke-width="${f1(o.w * 2)}" paint-order="stroke" stroke-linejoin="round"`
    : '';
  const sw = Math.max(1.6, lw * 0.8);
  const hollow = (d: string) =>
    (o
      ? `<path d="${d}" fill="none" stroke="${o.col}" stroke-width="${f1(sw + o.w * 2)}" stroke-linejoin="round"/>`
      : '') +
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(sw)}" stroke-linejoin="round"/>`;
  const P = (ox: number, oy: number) => `${f1(x + dx * ox + px * oy)} ${f1(y + dy * ox + py * oy)}`;
  const half = (w: number) => (w + (o ? o.w * 2 : 0)) / 2;
  if (cs === 'harrow') {
    const d = `M ${P(0, 0)} L ${P(-AL, AL * 0.5)} L ${P(-AL, -AL * 0.5)} Z`;
    return { deco: hollow(d), ins: AL * 0.95, out: half(sw) };
  }
  if (cs === 'diamond' || cs === 'hdiamond') {
    const L = AL * 1.15;
    const hw = AL * 0.42;
    const d = `M ${P(0, 0)} L ${P(-L / 2, hw)} L ${P(-L, 0)} L ${P(-L / 2, -hw)} Z`;
    return cs === 'diamond'
      ? { deco: `<path d="${d}" fill="${col}"${capO}/>`, ins: L * 0.55, out: o ? o.w : 0 }
      : { deco: hollow(d), ins: L * 0.98, out: half(sw) };
  }
  if (cs === 'block') {
    const s = AL * 0.8;
    const d = `M ${P(0, s / 2)} L ${P(0, -s / 2)} L ${P(-s, -s / 2)} L ${P(-s, s / 2)} Z`;
    return { deco: `<path d="${d}" fill="${col}"${capO}/>`, ins: s * 0.5, out: o ? o.w : 0 };
  }
  if (cs === 'bar') {
    const hw = Math.max(AL * 0.5, dotR);
    const tb = Math.max(2.5, lw * 1.1);
    const d = `M ${P(-tb / 2, hw)} L ${P(-tb / 2, -hw)}`;
    return {
      deco:
        (o
          ? `<path d="${d}" fill="none" stroke="${o.col}" stroke-width="${f1(tb + o.w * 2)}" stroke-linecap="round"/>`
          : '') +
        `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(tb)}" stroke-linecap="round"/>`,
      ins: tb,
      out: Math.max(0, half(tb) - tb / 2),
    };
  }
  if (cs === 'hdot') {
    return {
      deco:
        (o
          ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(dotR)}" fill="none" stroke="${o.col}" stroke-width="${f1(sw + o.w * 2)}"/>`
          : '') +
        `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(dotR)}" fill="none" stroke="${col}" stroke-width="${f1(sw)}"/>`,
      ins: dotR + sw / 2,
      out: dotR + half(sw),
    };
  }
  if (cs === 'heart') {
    const s = Math.max(4, AL * 0.62);
    const A = Math.atan2(-dx, dy);
    return {
      deco: `<path d="${glyphPathAt(LINE_GLYPHS.hearts, x - dx * 0.75 * s, y - dy * 0.75 * s, A, s)}" fill="${col}"${capO}/>`,
      ins: 1.3 * s,
      out: 0.25 * s + (o ? o.w : 0),
    };
  }
  if (cs === 'star') {
    const s = Math.max(4, AL * 0.6);
    const A = Math.atan2(dx, -dy);
    return {
      deco: `<path d="${glyphPathAt(LINE_GLYPHS.stars, x - dx * s, y - dy * s, A, s)}" fill="${col}"${capO}/>`,
      ins: 1.35 * s,
      out: o ? o.w : 0,
    };
  }
  return { deco: '', ins: 0, out: 0 };
}

/* ---------- 跳線 ---------- */

function segIntersect(p0: Pt, p1: Pt, p2: Pt, p3: Pt): (Pt & { t: number }) | null {
  const s1x = p1.x - p0.x;
  const s1y = p1.y - p0.y;
  const s2x = p3.x - p2.x;
  const s2y = p3.y - p2.y;
  const denom = -s2x * s1y + s1x * s2y;
  if (Math.abs(denom) < 1e-5) return null;
  const s = (-s1y * (p0.x - p2.x) + s1x * (p0.y - p2.y)) / denom;
  const t = (s2x * (p0.y - p2.y) - s2y * (p0.x - p2.x)) / denom;
  if (s >= 0.08 && s <= 0.92 && t >= 0.08 && t <= 0.92) {
    return { x: p0.x + t * s1x, y: p0.y + t * s1y, t };
  }
  return null;
}

/** 後畫的線碰到先畫的線（geo[0..myIndex-1]）時，在交點畫半徑 6 的半圓跳過 */
export function bridgedPathD(
  p0: Pt,
  p1: Pt,
  ctrl: Pt | null,
  myIndex: number,
  geo: readonly (readonly Pt[])[],
): string {
  const steps = ctrl ? 48 : 1;
  const bez = (t: number): Pt & { t: number } =>
    ctrl
      ? {
          x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * ctrl.x + t * t * p1.x,
          y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * ctrl.y + t * t * p1.y,
          t,
        }
      : { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y), t };
  const points: (Pt & { t: number })[] = [];
  for (let i = 0; i <= steps; i++) points.push(bez(i / steps));
  const hits: (Pt & { t: number })[] = [];
  for (let j = 0; j < myIndex; j++) {
    const other = geo[j];
    if (!other) continue;
    for (let s = 0; s < points.length - 1; s++) {
      for (let os = 0; os < other.length - 1; os++) {
        const h = segIntersect(points[s], points[s + 1], other[os], other[os + 1]);
        if (h) hits.push({ x: h.x, y: h.y, t: (s + h.t) / steps });
      }
    }
  }
  if (!hits.length) {
    return ctrl
      ? `M ${f1(p0.x)} ${f1(p0.y)} Q ${f1(ctrl.x)} ${f1(ctrl.y)} ${f1(p1.x)} ${f1(p1.y)}`
      : `M ${f1(p0.x)} ${f1(p0.y)} L ${f1(p1.x)} ${f1(p1.y)}`;
  }
  hits.sort((a, b) => a.t - b.t);
  const clean: (Pt & { t: number })[] = [];
  for (const h of hits)
    if (!clean.some((c) => Math.hypot(c.x - h.x, c.y - h.y) < 14)) clean.push(h);
  const R = 6;
  const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  let d = `M ${f1(points[0].x)} ${f1(points[0].y)}`;
  let lastT = 0;
  for (const h of clean) {
    const tStart = Math.max(0, h.t - R / segLen);
    const tEnd = Math.min(1, h.t + R / segLen);
    for (const pt of points) if (pt.t > lastT && pt.t < tStart) d += ` L ${f1(pt.x)} ${f1(pt.y)}`;
    const prev = points[Math.max(0, Math.floor(h.t * steps) - 1)];
    const ux = h.x - prev.x || 1;
    const uy = h.y - prev.y || 0;
    const len = Math.hypot(ux, uy) || 1;
    d += ` L ${f1(h.x - (ux / len) * R)} ${f1(h.y - (uy / len) * R)}`;
    d += ` A ${R} ${R} 0 0 1 ${f1(h.x + (ux / len) * R)} ${f1(h.y + (uy / len) * R)}`;
    lastT = tEnd;
  }
  for (const pt of points) if (pt.t > lastT) d += ` L ${f1(pt.x)} ${f1(pt.y)}`;
  return d;
}

export { f1 };
