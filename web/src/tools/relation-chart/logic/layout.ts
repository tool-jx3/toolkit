/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 排列與碰撞（原作的 layoutCircle／layoutLine／layoutShape／layoutCross／layoutRandom、separateAll、pushAwayFrom、
 * getNonOverlappingPosition、fitLayoutToCanvas、fitCanvasToContent）。直接改傳進來的角色座標（可以是 Immer 的 draft）。
 */
import {
  charLevel,
  charNameSize,
  charRadius,
  clampToCanvas,
  type SheetCtx,
  spacingFactor,
} from '../engine/geom';
import type { Char, LayoutKind } from '../model/types';

type Rand = () => number;

/** 排列的對象：未釘選的角色 */
export const layoutTargets = (ctx: SheetCtx): Char[] => ctx.sheet.chars.filter((c) => !c.locked);

const TIER_SPLIT_THRESHOLD = 10;
const circleR = (n: number) => (n <= 1 ? 0 : 150 + n * 22);
/** 弧上相鄰角色的目標間距（圓心距） */
const arcSpacing = (rn: number, sf: number) => Math.max(2 * rn + 24, (2 * rn + 90) * sf);

interface Tier {
  lv: number;
  g: Char[];
}
interface SubTier extends Tier {
  tierGroup: number;
  subRow: number;
}

/** 依重要度分層（大的在內圈／前排）；重要度反向排列時反轉 */
function levelTiers(ctx: SheetCtx, free: Char[]): Tier[] {
  const values = [...new Set(free.map((c) => charLevel(c)))].sort((a, b) => b - a);
  const tiers = values.map((lv) => ({ lv, g: free.filter((c) => charLevel(c) === lv) }));
  if (ctx.s.pinFlip) tiers.reverse();
  return tiers;
}

/** 依每排容量把同一層切成多排（自訂換排人數優先） */
function splitTiers(
  ctx: SheetCtx,
  tiers: Tier[],
  capOf: (t: Tier) => number,
  capCeil = TIER_SPLIT_THRESHOLD,
): SubTier[] {
  const out: SubTier[] = [];
  tiers.forEach((tier, tierIdx) => {
    const custom = Math.trunc(Number(ctx.s.wrapCaps[String(tier.lv)]));
    const cap =
      Number.isFinite(custom) && custom >= 2
        ? custom
        : Math.max(2, Math.min(capOf(tier) || capCeil, capCeil));
    const n = tier.g.length;
    if (n <= cap) {
      out.push({ lv: tier.lv, g: tier.g, tierGroup: tierIdx, subRow: 0 });
      return;
    }
    const k = Math.ceil(n / cap);
    const size = Math.ceil(n / k);
    for (let s = 0; s < k; s++) {
      const g = tier.g.slice(s * size, (s + 1) * size);
      if (g.length) out.push({ lv: tier.lv, g, tierGroup: tierIdx, subRow: s % 2 });
    }
  });
  return out;
}

const maxR = (ctx: SheetCtx, g: Char[]) => Math.max(...g.map((c) => charRadius(ctx, c)));

/** 排列不出界：以畫布中心等比收縮（只縮不放大，最少 10%） */
export function fitLayoutToCanvas(ctx: SheetCtx, moved: Char[]): void {
  if (!ctx.s.fitLayout || !moved.length) return;
  const { W, H } = ctx;
  const Cx = W / 2;
  const Cy = H / 2;
  let s = 1;
  for (const c of moved) {
    const r = charRadius(ctx, c) + 10;
    const maxDx = Math.max(0, W / 2 - r);
    const maxDy = Math.max(0, H / 2 - r);
    const dx = Math.abs(c.x - Cx);
    const dy = Math.abs(c.y - Cy);
    if (maxDx > 0 && dx > maxDx) s = Math.min(s, maxDx / dx);
    if (maxDy > 0 && dy > maxDy) s = Math.min(s, maxDy / dy);
  }
  if (s < 0.1) s = 0.1;
  if (s >= 1) return;
  for (const c of moved) {
    c.x = Cx + (c.x - Cx) * s;
    c.y = Cy + (c.y - Cy) * s;
  }
}

function layoutCircle(ctx: SheetCtx, free: Char[]): void {
  const { W, H } = ctx;
  const tiers = levelTiers(ctx, free);
  const ringCap = (tier: Tier) => {
    const rn = maxR(ctx, tier.g);
    const Rc = Math.max(rn + 30, Math.min(W, H) / 2 - rn - 24);
    const half = Math.min(1, arcSpacing(rn, 1) / 2 / Rc);
    return Math.floor(Math.PI / Math.asin(half));
  };
  const sub = splitTiers(ctx, tiers, ringCap);
  const sf = spacingFactor(ctx.s);
  let radii: number[] = [];
  for (let iter = 0; iter < 3; iter++) {
    radii = [];
    let prevR = 0;
    let prevNode = 0;
    sub.forEach((tier, i) => {
      const rn = maxR(ctx, tier.g);
      const n = tier.g.length;
      const chord = n <= 1 ? 0 : arcSpacing(rn, sf) / (2 * Math.sin(Math.PI / n));
      const Rfit = Math.max(chord, Math.min(W, H) / 2 - rn - 24);
      const rWant =
        i === 0
          ? n === 1
            ? 0
            : Math.max(chord, (120 + n * 12) * sf)
          : Math.max(chord, tier.lv === 0 ? circleR(n) * sf : 0, prevR + prevNode + (rn + 60) * sf);
      const rMin = Math.max(chord, i === 0 ? 0 : prevR + prevNode + rn + 14);
      const r = i === 0 && n === 1 ? 0 : Math.max(rMin, Math.min(rWant, Rfit));
      radii.push(r);
      prevR = r;
      prevNode = rn;
    });
  }
  const Cx = W / 2;
  const Cy = H / 2;
  sub.forEach((tier, i) => {
    const r = radii[i];
    const n = tier.g.length;
    if (r === 0) {
      tier.g[0].x = Cx;
      tier.g[0].y = Cy;
      return;
    }
    const off = i % 2 && !ctx.s.layoutNoStagger ? Math.PI / n : 0;
    tier.g.forEach((c, k) => {
      const a = -Math.PI / 2 + off + (k * 2 * Math.PI) / n;
      c.x = Cx + r * Math.cos(a);
      c.y = Cy + r * Math.sin(a);
    });
  });
}

function layoutLine(ctx: SheetCtx, free: Char[], axis: 'h' | 'v'): void {
  const tiers = levelTiers(ctx, free);
  const sf = spacingFactor(ctx.s);
  const GAP = 70 * sf;
  const along = axis === 'h' ? ctx.W : ctx.H;
  const cross = axis === 'h' ? ctx.H : ctx.W;
  const rowCap = (tier: Tier) => {
    const rn = maxR(ctx, tier.g);
    const avail = along - 2 * (rn + 24);
    return Math.max(1, Math.floor((avail + GAP) / (2 * rn + GAP)));
  };
  const rows = splitTiers(ctx, tiers, rowCap);
  const ys: { dy: number; rn: number }[] = [];
  let prevRn = 0;
  let dy = 0;
  rows.forEach((tier, i) => {
    const rn = maxR(ctx, tier.g);
    const prev = i ? rows[i - 1] : null;
    const tierGap = prev && prev.tierGroup === tier.tierGroup ? 52 * sf : 90 * sf;
    if (i) dy += prevRn + rn + tierGap;
    ys.push({ dy, rn });
    prevRn = rn;
  });
  const cross0 = cross / 2 - dy / 2;
  rows.forEach((tier, i) => {
    const { dy: d, rn } = ys[i];
    const rowWidth = tier.g.length * 2 * rn + GAP * (tier.g.length - 1);
    let pos = along / 2 - rowWidth / 2;
    if (tier.subRow === 1 && !ctx.s.layoutNoStagger) pos += (rn + GAP) * 0.5;
    for (const c of tier.g) {
      pos += rn;
      if (axis === 'h') {
        c.x = pos;
        c.y = cross0 + d;
      } else {
        c.x = cross0 + d;
        c.y = pos;
      }
      pos += rn + GAP;
    }
  });
}

interface Pt {
  x: number;
  y: number;
}
const regularVerts = (k: number, r: number, ang0: number): Pt[] =>
  Array.from({ length: k }, (_, i) => {
    const a = ang0 + (i * 2 * Math.PI) / k;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });

interface ShapeDef {
  verts?: Pt[];
  priority?: number[];
  path?: (t: number) => Pt;
  anchorT?: number;
}

export const SHAPE_DEFS: Record<string, ShapeDef> = {
  triangle: { verts: regularVerts(3, 1.15, -Math.PI / 2) },
  square: {
    verts: [
      { x: -0.9, y: -0.9 },
      { x: 0.9, y: -0.9 },
      { x: 0.9, y: 0.9 },
      { x: -0.9, y: 0.9 },
    ],
  },
  pentagon: { verts: regularVerts(5, 1.1, -Math.PI / 2) },
  hexagon: { verts: regularVerts(6, 1.05, -Math.PI / 2) },
  octagon: { verts: regularVerts(8, 1.05, -Math.PI / 2 + Math.PI / 8) },
  star: {
    verts: Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 1.3 : 0.55;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }),
    priority: [0, 2, 4, 6, 8, 1, 3, 5, 7, 9],
  },
  heart: {
    path: (t) => {
      const a = t * 2 * Math.PI;
      const s = Math.sin(a);
      return {
        x: 1.18 * s * s * s,
        y: -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 14,
      };
    },
    anchorT: 0.5,
  },
};

function layoutShape(ctx: SheetCtx, free: Char[], key: string): void {
  const def = SHAPE_DEFS[key];
  const { W, H } = ctx;
  const sf = spacingFactor(ctx.s);
  const Cx = W / 2;
  const Cy = H / 2;
  let per: number;
  let avgR: number;
  let maxRad: number;
  let placeTier: (g: Char[], s: number) => void;
  let minScaleFor: (n: number, spacing: number) => number;
  if (def.verts) {
    const V = def.verts.length;
    const verts = def.verts;
    const edgeLen = verts.map((p, i) => {
      const q = verts[(i + 1) % V];
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    per = edgeLen.reduce((a, b) => a + b, 0);
    avgR = verts.reduce((a, p) => a + Math.hypot(p.x, p.y), 0) / V;
    maxRad = Math.max(...verts.map((p) => Math.hypot(p.x, p.y)));
    const extrasFor = (n: number) => {
      const m = Math.max(0, n - V);
      const out: number[] = [];
      for (let e = 0; e < V; e++) out.push(Math.floor(((e + 1) * m) / V) - Math.floor((e * m) / V));
      return out;
    };
    minScaleFor = (n, spacing) => {
      if (n <= V) return n <= 1 ? 0 : (n * spacing) / per;
      const extra = extrasFor(n);
      let worst = 0;
      for (let e = 0; e < V; e++) worst = Math.max(worst, ((extra[e] + 1) * spacing) / edgeLen[e]);
      return worst;
    };
    placeTier = (g, s) => {
      const n = g.length;
      const P = (p: Pt) => ({ x: Cx + p.x * s, y: Cy + p.y * s });
      if (n <= V) {
        let idxs: number[];
        if (def.priority) idxs = def.priority.slice(0, n).sort((a, b) => a - b);
        else {
          idxs = [...new Set(Array.from({ length: n }, (_, k) => Math.round((k * V) / n) % V))];
          for (let i2 = 0; i2 < V && idxs.length < n; i2++) if (!idxs.includes(i2)) idxs.push(i2);
          idxs.sort((a, b) => a - b);
        }
        g.forEach((c, k) => {
          const p = P(verts[idxs[k]]);
          c.x = p.x;
          c.y = p.y;
        });
        return;
      }
      const extra = extrasFor(n);
      let gi = 0;
      for (let e = 0; e < V; e++) {
        const A = verts[e];
        const B = verts[(e + 1) % V];
        const pv = P(A);
        g[gi].x = pv.x;
        g[gi].y = pv.y;
        gi++;
        for (let j = 1; j <= extra[e]; j++) {
          const f = j / (extra[e] + 1);
          const p = P({ x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f });
          g[gi].x = p.x;
          g[gi].y = p.y;
          gi++;
        }
      }
    };
  } else {
    const path = def.path as (t: number) => Pt;
    const N = 512;
    const pts: Pt[] = [];
    for (let i = 0; i <= N; i++) pts.push(path((i % N) / N));
    const cum = [0];
    for (let i = 1; i <= N; i++)
      cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    per = cum[N];
    avgR = pts.slice(0, N).reduce((a, p) => a + Math.hypot(p.x, p.y), 0) / N;
    maxRad = Math.max(...pts.slice(0, N).map((p) => Math.hypot(p.x, p.y)));
    const pointAt = (sArc0: number, scale: number) => {
      const sArc = ((sArc0 % per) + per) % per;
      let lo = 1;
      let hi = N;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < sArc) lo = mid + 1;
        else hi = mid;
      }
      const seg = cum[lo] - cum[lo - 1] || 1e-9;
      const f = (sArc - cum[lo - 1]) / seg;
      return {
        x: Cx + (pts[lo - 1].x + (pts[lo].x - pts[lo - 1].x) * f) * scale,
        y: Cy + (pts[lo - 1].y + (pts[lo].y - pts[lo - 1].y) * f) * scale,
      };
    };
    const anchorS = (def.anchorT || 0) * per;
    minScaleFor = (n, spacing) => (n <= 1 ? 0 : (n * spacing) / per);
    placeTier = (g, s) => {
      const n = g.length;
      g.forEach((c, k) => {
        const p = pointAt(anchorS + (k * per) / n, s);
        c.x = p.x;
        c.y = p.y;
      });
    };
  }
  const tiers = levelTiers(ctx, free);
  const cap = (tier: Tier) => {
    const rn = maxR(ctx, tier.g);
    const sCanvas = Math.max(0.2, (Math.min(W, H) / 2 - rn - 24) / maxRad);
    return Math.max(2, Math.floor((sCanvas * per) / arcSpacing(rn, 1)));
  };
  const sub = splitTiers(ctx, tiers, cap, def.verts ? Math.max(20, def.verts.length * 3) : 24);
  let prevS = 0;
  let prevNode = 0;
  sub.forEach((tier, i) => {
    const rn = maxR(ctx, tier.g);
    const n = tier.g.length;
    const sPerim = minScaleFor(n, arcSpacing(rn, sf));
    const sFit = Math.max(sPerim, (Math.min(W, H) / 2 - rn - 24) / maxRad);
    const sWant =
      i === 0
        ? n === 1
          ? 0
          : Math.max(sPerim, ((120 + n * 12) * sf) / avgR)
        : Math.max(sPerim, (prevS * avgR + prevNode + (rn + 60) * sf) / avgR);
    const sMin = Math.max(sPerim, i === 0 ? 0 : (prevS * avgR + prevNode + rn + 14) / avgR);
    const s = i === 0 && n === 1 ? 0 : Math.max(sMin, Math.min(sWant, sFit));
    if (s === 0) {
      tier.g[0].x = Cx;
      tier.g[0].y = Cy;
    } else placeTier(tier.g, s);
    prevS = s;
    prevNode = rn;
  });
}

function layoutCross(ctx: SheetCtx, free: Char[]): void {
  const sf = spacingFactor(ctx.s);
  const Cx = ctx.W / 2;
  const Cy = ctx.H / 2;
  const ordered = [...free].sort((a, b) => charLevel(b) - charLevel(a));
  if (ctx.s.pinFlip) ordered.reverse();
  const n = ordered.length;
  const rn = maxR(ctx, free);
  if (n === 1) {
    ordered[0].x = Cx;
    ordered[0].y = Cy;
    return;
  }
  const m = n - 1;
  const counts: number[] = [];
  for (let a = 0; a < 4; a++) counts.push(Math.floor(((a + 1) * m) / 4) - Math.floor((a * m) / 4));
  const maxCount = Math.max(...counts);
  const step = arcSpacing(rn, sf);
  const armLen = Math.max(maxCount * (2 * rn + 24), step * maxCount);
  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const spots = [{ x: Cx, y: Cy, d: 0 }];
  for (let a = 0; a < 4; a++)
    for (let j = 1; j <= counts[a]; j++) {
      const dist = (armLen * j) / counts[a];
      spots.push({ x: Cx + dirs[a][0] * dist, y: Cy + dirs[a][1] * dist, d: dist });
    }
  spots.sort((p, q) => p.d - q.d);
  ordered.forEach((c, i) => {
    c.x = spots[i].x;
    c.y = spots[i].y;
  });
}

/** 不和別人重疊的位置（從起點以螺旋往外找） */
export function nonOverlapping(
  ctx: SheetCtx,
  startX: number,
  startY: number,
  ignore: Char | null,
): { x: number; y: number } {
  const { W, H } = ctx;
  const rA = ignore ? charRadius(ctx, ignore) : charRadius(ctx, undefined);
  const safe = (cx: number, cy: number) =>
    !ctx.sheet.chars.some(
      (o) => o !== ignore && Math.hypot(cx - o.x, cy - o.y) < rA + charRadius(ctx, o) + 20,
    );
  if (safe(startX, startY)) return { x: startX, y: startY };
  let angle = 0;
  let radius = 60;
  for (let step = 0; step < 100; step++) {
    const x = Math.max(80, Math.min(W - 80, startX + Math.cos(angle) * radius));
    const y = Math.max(80, Math.min(H - 80, startY + Math.sin(angle) * radius));
    if (safe(x, y)) return { x, y };
    angle += 0.6;
    radius += 18;
  }
  return { x: startX, y: startY };
}

function layoutRandom(ctx: SheetCtx, free: Char[], rand: Rand): void {
  for (const c of free) {
    const r = charRadius(ctx, c) + 14;
    const x = r + rand() * Math.max(1, ctx.W - 2 * r);
    const y = r + rand() * Math.max(1, ctx.H - 2 * r);
    const p = nonOverlapping(ctx, x, y, c);
    c.x = p.x;
    c.y = p.y;
  }
}

/** 套用陣型（未釘選的角色）；回傳有沒有動到人 */
export function applyLayout(ctx: SheetCtx, kind: LayoutKind, rand: Rand = Math.random): boolean {
  const free = layoutTargets(ctx);
  ctx.s.lastLayout = kind;
  if (!free.length) return false;
  if (kind === 'random') layoutRandom(ctx, free, rand);
  else {
    if (kind === 'line') layoutLine(ctx, free, 'h');
    else if (kind === 'vline') layoutLine(ctx, free, 'v');
    else if (kind === 'cross') layoutCross(ctx, free);
    else if (SHAPE_DEFS[kind]) layoutShape(ctx, free, kind);
    else layoutCircle(ctx, free);
    fitLayoutToCanvas(ctx, free);
  }
  separateAll(ctx);
  return true;
}

/* ---------- 碰撞 ---------- */

const PUSH_PAD = 16;

/** 把 b 推離 a：單位向量與所需距離（沒重疊回 null） */
function nodePush(ctx: SheetCtx, a: Char, b: Char, pad: number, rand: Rand) {
  const minD = charRadius(ctx, a) + charRadius(ctx, b) + pad;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  if (d >= minD) return null;
  if (d === 0) {
    const ang = rand() * Math.PI * 2;
    dx = Math.cos(ang);
    dy = Math.sin(ang);
    d = 1;
  }
  return { ux: dx / d, uy: dy / d, need: minD - d };
}

function makeGrid(chars: Char[], cell: number) {
  const g = new Map<string, Char[]>();
  for (const c of chars) {
    const k = `${Math.floor(c.x / cell)}:${Math.floor(c.y / cell)}`;
    let arr = g.get(k);
    if (!arr) {
      arr = [];
      g.set(k, arr);
    }
    arr.push(c);
  }
  return (c: Char) => {
    const cx = Math.floor(c.x / cell);
    const cy = Math.floor(c.y / cell);
    const out: Char[] = [];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const arr = g.get(`${cx + i}:${cy + j}`);
        if (arr) out.push(...arr);
      }
    return out;
  };
}

/** 解開重疊（釘選的與 anchor 不動）；碰撞推擠關閉時不做 */
export function separateAll(
  ctx: SheetCtx,
  anchor: Char | null = null,
  rand: Rand = Math.random,
): void {
  if (ctx.s.noCollision) return;
  const live = ctx.sheet.chars;
  if (live.length < 2) return;
  const fixed = (c: Char) => c.locked || c === anchor;
  const maxRad = Math.max(0, ...live.map((c) => charRadius(ctx, c)));
  const cell = Math.max(80, maxRad * 2 + PUSH_PAD + 2);
  const idx = new Map(live.map((c, i) => [c, i]));
  for (let it = 0; it < 5; it++) {
    let moved = false;
    const near = makeGrid(live, cell);
    for (const a of live) {
      for (const b of near(a)) {
        if ((idx.get(b) ?? 0) <= (idx.get(a) ?? 0)) continue;
        if (fixed(a) && fixed(b)) continue;
        const v = nodePush(ctx, a, b, PUSH_PAD, rand);
        if (!v) continue;
        const { ux, uy, need } = v;
        if (fixed(a)) {
          b.x += ux * need;
          b.y += uy * need;
          clampToCanvas(ctx, b);
        } else if (fixed(b)) {
          a.x -= ux * need;
          a.y -= uy * need;
          clampToCanvas(ctx, a);
        } else {
          a.x -= (ux * need) / 2;
          a.y -= (uy * need) / 2;
          b.x += (ux * need) / 2;
          b.y += (uy * need) / 2;
          clampToCanvas(ctx, a);
          clampToCanvas(ctx, b);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** 拖曳時把 anchor 周圍的人推開（連鎖），再把 anchor 推離釘選的人 */
export function pushAwayFrom(ctx: SheetCtx, anchor: Char, rand: Rand = Math.random): void {
  const live = ctx.sheet.chars;
  const active = new Set<Char>([anchor]);
  clampToCanvas(ctx, anchor);
  const maxRad = Math.max(0, ...live.map((c) => charRadius(ctx, c)));
  const cell = Math.max(80, maxRad * 2 + PUSH_PAD + 2);
  for (let it = 0; it < 4; it++) {
    let moved = false;
    const near = makeGrid(live, cell);
    for (const a of live) {
      if (!active.has(a)) continue;
      for (const b of near(a)) {
        if (a === b) continue;
        const v = nodePush(ctx, a, b, PUSH_PAD, rand);
        if (!v) continue;
        const { ux, uy, need } = v;
        if (!b.locked && b !== anchor) {
          b.x += ux * need;
          b.y += uy * need;
          clampToCanvas(ctx, b);
          active.add(b);
          moved = true;
        } else if (a === anchor) {
          a.x -= ux * need;
          a.y -= uy * need;
          clampToCanvas(ctx, a);
          moved = true;
        } else if (!a.locked) {
          a.x -= ux * need;
          a.y -= uy * need;
          clampToCanvas(ctx, a);
          active.add(a);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  for (let it = 0; it < 4; it++) {
    let moved = false;
    for (const b of live) {
      if (b === anchor) continue;
      const v = nodePush(ctx, b, anchor, PUSH_PAD, rand);
      if (!v) continue;
      anchor.x += v.ux * v.need;
      anchor.y += v.uy * v.need;
      clampToCanvas(ctx, anchor);
      moved = true;
    }
    if (!moved) break;
  }
}

export interface GroupMember {
  c: Char;
  /** 相對於帶頭的角色（被抓著的那位）的位置 */
  dx: number;
  dy: number;
}

/**
 * 整組拖曳（原作的 getOverflow／resist）：帶頭的角色移到 (x, y)，其他人保持隊形；
 * 整組超出畫布時只加邊緣阻力（超出量 × 0.35，算兩次），不各自夾回，可以進出血區；不推人。
 */
export function groupDragTo(
  ctx: SheetCtx,
  lead: Char,
  members: readonly GroupMember[],
  x: number,
  y: number,
): void {
  const all: GroupMember[] = [{ c: lead, dx: 0, dy: 0 }, ...members];
  const RESIST = 0.35;
  const overflow = (ax: number, ay: number) => {
    let left = 0;
    let right = 0;
    let top = 0;
    let bottom = 0;
    for (const m of all) {
      const r = charRadius(ctx, m.c);
      const mx = ax + m.dx;
      const my = ay + m.dy;
      left = Math.max(left, -(mx - r));
      right = Math.max(right, mx + r - ctx.W);
      top = Math.max(top, -(my - r));
      bottom = Math.max(bottom, my + r - ctx.H);
    }
    return { left, right, top, bottom };
  };
  for (let k = 0; k < 2; k++) {
    const o = overflow(x, y);
    x += (o.left - o.right) * RESIST;
    y += (o.top - o.bottom) * RESIST;
  }
  for (const m of all) {
    m.c.x = x + m.dx;
    m.c.y = y + m.dy;
  }
}

/** 打亂座位：洗牌未釘選角色（有選取時只洗選取的）的現有位置；洗完不會全部留在原地 */
export function shuffleSeats(pool: Char[], rand: Rand = Math.random): boolean {
  const free = pool.filter((c) => !c.locked);
  if (free.length < 2) return false;
  const pos = free.map((c) => ({ x: c.x, y: c.y }));
  for (let i = pos.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pos[i], pos[j]] = [pos[j], pos[i]];
  }
  if (pos.every((p, i) => p.x === free[i].x && p.y === free[i].y))
    pos.push(pos.shift() as { x: number; y: number });
  free.forEach((c, i) => {
    c.x = pos[i].x;
    c.y = pos[i].y;
  });
  return true;
}

/** 畫布貼合內容：剛好框住所有角色（含名字）＋四周 60 px（最小 200 × 200） */
export function fitCanvasToContent(ctx: SheetCtx): boolean {
  const chars = ctx.sheet.chars;
  if (!chars.length) return false;
  const PAD = 60;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of chars) {
    const r = charRadius(ctx, c);
    let bottom = c.y + r;
    if (!c.noAvatar && c.name && ctx.s.showNames) {
      const ns = charNameSize(ctx, c);
      bottom = Math.max(bottom, c.y + r + 6 + c.name.split('\n').length * ns * 1.25 + 6);
    }
    minX = Math.min(minX, c.x - r);
    maxX = Math.max(maxX, c.x + r);
    minY = Math.min(minY, c.y - r);
    maxY = Math.max(maxY, bottom);
  }
  const nw = Math.max(200, Math.round(maxX - minX + PAD * 2));
  const nh = Math.max(200, Math.round(maxY - minY + PAD * 2));
  const dx = PAD - minX;
  const dy = PAD - minY;
  for (const c of chars) {
    c.x += dx;
    c.y += dy;
  }
  ctx.sheet.W = nw;
  ctx.sheet.H = nh;
  return true;
}

/** 改畫布尺寸：rect 是新畫布在舊座標裡的範圍（角色跟著新原點平移） */
export function resizeCanvas(
  sheet: { W: number; H: number; chars: Char[] },
  rect: { x: number; y: number; w: number; h: number },
): void {
  const ox = Math.round(rect.x);
  const oy = Math.round(rect.y);
  if (ox || oy)
    for (const c of sheet.chars) {
      c.x -= ox;
      c.y -= oy;
    }
  sheet.W = Math.max(0, Math.round(rect.w));
  sheet.H = Math.max(0, Math.round(rect.h));
}

/** 角色清單換順序後，未釘選的角色依新順序接手舊順序的位置（陣型跟著順序走） */
export function reorderKeepSlots(chars: Char[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= chars.length || to >= chars.length) return;
  const oldFree = chars.filter((c) => !c.locked);
  const pos = new Map(oldFree.map((c) => [c.id, { x: c.x, y: c.y }]));
  const oldOrder = oldFree.map((c) => c.id);
  const [it] = chars.splice(from, 1);
  chars.splice(to, 0, it);
  const newFree = chars.filter((c) => !c.locked);
  newFree.forEach((c, i) => {
    const p = pos.get(oldOrder[i]);
    if (p) {
      c.x = p.x;
      c.y = p.y;
    }
  });
}
