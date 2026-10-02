/**
 * 沿框裝飾（F25～F29、規格 3.7）。沿邊類沿著導引線（guide.ts）長出；角落類（蜘蛛網、齒輪、櫻花枝）放在推出去之後的窗角；
 * 星塵與電路散布在窗緣到畫布邊之間的框帶上。每個裝飾用「種類＋圖樣編號」決定的亂數，同設定每次畫出完全相同的圖。
 * 圖案與數值依原作（MIT）改寫。
 */
import { createRandom, seedOf } from '@/core/timeline';
import { type DecoCorner, decoCorners, type GuidePoint, guideRuns } from './guide';
import type { Decoration, DecoType } from './model';
import { type G, shade } from './render';

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type Rand = () => number;
type Ctx = CanvasRenderingContext2D;
type DrawDeco = (c: Ctx, g: G, d: Decoration, rand: Rand, colors: [string, string]) => void;

/** 裝飾的亂數種子：種類的雜湊 XOR（圖樣編號＋1）× 2654435761 */
export function decoSeed(type: DecoType, seed: number): number {
  return (seedOf(type) >>> 0) ^ Math.imul((seed | 0) + 1, 2654435761);
}

const runsOf = (g: G, d: Pick<Decoration, 'placement' | 'coverage' | 'offset'>, step: number) =>
  guideRuns(g.state, d, step);
const cornersOf = (g: G, d: Decoration): DecoCorner[] => decoCorners(g.rect, d.placement, d.offset);

/* ---------- 小工具 ---------- */

interface Wavy {
  x: number;
  y: number;
  p: GuidePoint;
}

function wavy(run: GuidePoint[], amp: number, wave: number, phase: number): Wavy[] {
  return run.map((p) => {
    const w = Math.sin((p.u / wave) * TAU + phase) * amp;
    return { x: p.x + p.nx * w, y: p.y + p.ny * w, p };
  });
}

function smooth(c: Ctx, pts: { x: number; y: number }[]): void {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    c.quadraticCurveTo(
      pts[i].x,
      pts[i].y,
      (pts[i].x + pts[i + 1].x) / 2,
      (pts[i].y + pts[i + 1].y) / 2,
    );
  }
  const last = pts[pts.length - 1];
  c.lineTo(last.x, last.y);
  c.stroke();
}

/** 葉片：底部在 (x, y)，朝 angle 方向 */
function leaf(c: Ctx, x: number, y: number, angle: number, s: number, fill: string, vein: string) {
  c.save();
  c.translate(x, y);
  c.rotate(angle + Math.PI / 2);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(-s * 0.75, -s * 0.15, -s * 0.7, -s * 0.95, 0, -s * 1.3);
  c.bezierCurveTo(s * 0.7, -s * 0.95, s * 0.75, -s * 0.15, 0, 0);
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = vein;
  c.lineWidth = Math.max(0.8, s * 0.07);
  c.beginPath();
  c.moveTo(0, -s * 0.05);
  c.lineTo(0, -s * 1.05);
  c.stroke();
  c.restore();
}

/** 五瓣花 */
function flower(
  c: Ctx,
  x: number,
  y: number,
  rad: number,
  rot: number,
  petal: string,
  center: string,
) {
  c.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * TAU) / 5;
    c.beginPath();
    c.ellipse(
      x + Math.cos(a) * rad * 0.55,
      y + Math.sin(a) * rad * 0.55,
      rad * 0.55,
      rad * 0.37,
      a,
      0,
      TAU,
    );
    c.fill();
  }
  c.fillStyle = center;
  c.beginPath();
  c.arc(x, y, rad * 0.26, 0, TAU);
  c.fill();
}

function sparkle(c: Ctx, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y);
  c.quadraticCurveTo(x, y, x, y + s);
  c.quadraticCurveTo(x, y, x - s, y);
  c.quadraticCurveTo(x, y, x, y - s);
  c.fill();
}

function sweep(a0: number, a1: number): number {
  let d = a1 - a0;
  while (d > Math.PI) d -= TAU;
  while (d <= -Math.PI) d += TAU;
  return d;
}

/** 平滑的起伏（-1～1）：兩個隨機相位的正弦相加 */
function wobble(rand: Rand): (u: number) => number {
  const p1 = rand() * TAU;
  const p2 = rand() * TAU;
  const f1 = 0.9 + rand() * 0.5;
  const f2 = 2.1 + rand() * 1.3;
  return (u) => 0.65 * Math.sin(u * f1 + p1) + 0.35 * Math.sin(u * f2 + p2);
}

function band(c: Ctx, outer: [number, number][], inner: [number, number][]): void {
  c.beginPath();
  outer.forEach(([x, y], i) => {
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  });
  for (let i = inner.length - 1; i >= 0; i--) c.lineTo(inner[i][0], inner[i][1]);
  c.closePath();
}

/** 框帶的寬（窗緣到畫布邊，單位） */
const frameBand = (g: G) => ({
  t: g.rect.y0,
  b: 1080 - g.rect.y1,
  l: g.rect.x0,
  r: g.VW - g.rect.x1,
});

/* ---------- 植物 ---------- */

const ivy: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const run of runsOf(g, d, 6)) {
    if (run.length < 3) continue;
    const phase = rand() * TAU;
    const main = wavy(run, 7 * s, 90 * s, phase);
    c.strokeStyle = c1;
    c.lineWidth = 3.2 * s;
    smooth(c, main);
    c.globalAlpha = 0.8;
    c.lineWidth = 1.6 * s;
    smooth(c, wavy(run, 10 * s, 140 * s, phase + 2));
    c.globalAlpha = 1;
    const spacing = lerp(64, 15, d.density) * s;
    let next = rand() * spacing;
    let flip = 1;
    for (const q of main) {
      if (q.p.u < next) continue;
      next = q.p.u + spacing * (0.6 + rand() * 0.8);
      flip = -flip;
      const ang = Math.atan2(q.p.ty, q.p.tx) + flip * (Math.PI / 2 - 0.35 + rand() * 0.7);
      const px = q.x + Math.cos(ang) * 5 * s;
      const py = q.y + Math.sin(ang) * 5 * s;
      c.strokeStyle = c1;
      c.lineWidth = 1.4 * s;
      c.beginPath();
      c.moveTo(q.x, q.y);
      c.lineTo(px, py);
      c.stroke();
      leaf(
        c,
        px,
        py,
        ang,
        (12 + rand() * 12) * s,
        shade(c2, 0.78 + rand() * 0.42),
        shade(c1, 0.85),
      );
      if (rand() < 0.04 + 0.1 * d.density) {
        /* 捲鬚 */
        const cx = q.x + Math.cos(ang) * 12 * s;
        const cy = q.y + Math.sin(ang) * 12 * s;
        c.lineWidth = 1.1 * s;
        c.beginPath();
        for (let t = 0; t <= 1.001; t += 0.05) {
          const a = ang + Math.PI + t * 4 * Math.PI;
          const rr = 9 * s * (1 - t * 0.85);
          if (t === 0) c.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          else c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        c.stroke();
      }
    }
  }
};

const flowers: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  const spacing = lerp(150, 26, d.density) * s;
  for (const run of runsOf(g, d, 6)) {
    let next = rand() * spacing;
    for (const p of run) {
      if (p.u < next) continue;
      next = p.u + spacing * (0.5 + rand());
      const j = (rand() - 0.5) * 24 * s;
      flower(
        c,
        p.x + p.nx * j,
        p.y + p.ny * j,
        (7 + rand() * 6) * s,
        rand() * TAU,
        shade(c1, 0.9 + rand() * 0.15),
        c2,
      );
    }
  }
};

const thorns: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  c.lineCap = 'round';
  for (const run of runsOf(g, d, 5)) {
    if (run.length < 3) continue;
    const phase = rand() * TAU;
    for (const k of [0, 1]) {
      const stem = wavy(run, 9 * s, 110 * s, phase + k * Math.PI);
      c.strokeStyle = c1;
      c.fillStyle = c1;
      c.lineWidth = (k ? 2 : 2.8) * s;
      smooth(c, stem);
      const every = lerp(42, 12, d.density) * s;
      let next = rand() * every;
      let side = 1;
      for (let i = 1; i < stem.length; i++) {
        const q = stem[i];
        if (q.p.u < next) continue;
        next = q.p.u + every;
        side = -side;
        const dx = q.x - stem[i - 1].x;
        const dy = q.y - stem[i - 1].y;
        const len = Math.hypot(dx, dy) || 1;
        const tx = dx / len;
        const ty = dy / len;
        const nx = -ty * side;
        const ny = tx * side;
        const h = 7 * s;
        const w = 2.2 * s;
        c.beginPath();
        c.moveTo(q.x - tx * w, q.y - ty * w);
        c.lineTo(q.x + nx * h + tx * h * 0.5, q.y + ny * h + ty * h * 0.5);
        c.lineTo(q.x + tx * w, q.y + ty * w);
        c.fill();
      }
    }
    const budEvery = lerp(280, 80, d.density) * s;
    let next = rand() * budEvery;
    c.fillStyle = c2;
    for (const p of run) {
      if (p.u < next) continue;
      next = p.u + budEvery * (0.6 + rand() * 0.8);
      c.beginPath();
      c.arc(p.x, p.y, 4.5 * s, 0, TAU);
      c.fill();
    }
  }
};

const sakura: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  const r = g.rect;
  /* 枝條長度：窗短邊的 55% × 延伸量 × 大小 */
  const reach = Math.min(r.w, r.h) * 0.55 * Math.max(0.2, d.coverage) * s;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const cluster = (x: number, y: number) => {
    for (let i = 0, n = 1 + Math.floor(rand() * (1 + d.density * 3)); i < n; i++) {
      flower(
        c,
        x + (rand() - 0.5) * 22 * s,
        y + (rand() - 0.5) * 22 * s,
        (8 + rand() * 6) * s,
        rand() * TAU,
        shade(c2, 0.94 + rand() * 0.1),
        shade(c2, 0.72),
      );
    }
  };
  const branch = (x: number, y: number, ang: number, len: number, width: number, depth: number) => {
    const segs = 6;
    const pts: [number, number, number][] = [[x, y, ang]];
    let a = ang;
    let px = x;
    let py = y;
    for (let i = 1; i <= segs; i++) {
      a += (rand() - 0.5) * 0.35;
      px += (Math.cos(a) * len) / segs;
      py += (Math.sin(a) * len) / segs;
      pts.push([px, py, a]);
    }
    c.strokeStyle = c1;
    for (let i = 1; i < pts.length; i++) {
      c.lineWidth = Math.max(1, width * (1 - ((i - 1) / segs) * 0.75));
      c.beginPath();
      c.moveTo(pts[i - 1][0], pts[i - 1][1]);
      c.lineTo(pts[i][0], pts[i][1]);
      c.stroke();
    }
    pts.forEach(([bx, by, ba], i) => {
      if (depth > 1 && i >= 2 && i < segs && rand() < 0.5) {
        branch(
          bx,
          by,
          ba + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.4),
          len * 0.5,
          width * 0.55,
          depth - 1,
        );
      }
      if (i >= 2 && (i === segs || rand() < 0.2 + d.density * 0.4)) cluster(bx, by);
    });
  };
  for (const k of cornersOf(g, d)) {
    branch(k.x, k.y, Math.atan2(k.ey, k.ex) + k.turn * 0.18, reach, 9 * s, 3);
    branch(k.x, k.y, Math.atan2(k.fy, k.fx) - k.turn * 0.25, reach * 0.55, 6 * s, 2);
  }
};

const grass: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  const every = lerp(16, 4, d.density) * s;
  for (const run of runsOf(g, d, 3)) {
    let next = 0;
    for (const p of run) {
      if (p.u < next) continue;
      next = p.u + every * (0.5 + rand());
      const h = (16 + rand() * 34) * s;
      const lean = (rand() - 0.5) * 0.9;
      const w = 3.2 * s;
      const ix = -p.nx;
      const iy = -p.ny;
      c.fillStyle = rand() < 0.5 ? c1 : c2;
      c.beginPath();
      c.moveTo(p.x - p.tx * w, p.y - p.ty * w);
      c.quadraticCurveTo(
        p.x + ix * h * 0.6,
        p.y + iy * h * 0.6,
        p.x + ix * h + p.tx * lean * h,
        p.y + iy * h + p.ty * lean * h,
      );
      c.quadraticCurveTo(
        p.x + ix * h * 0.5 + p.tx * w,
        p.y + iy * h * 0.5 + p.ty * w,
        p.x + p.tx * w,
        p.y + p.ty * w,
      );
      c.fill();
    }
  }
};

const stars: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  const bandW = frameBand(g);
  const every = lerp(120, 18, d.density) * s;
  c.shadowBlur = 8 * g.k;
  for (const run of runsOf(g, { ...d, offset: 0 }, 6)) {
    let next = rand() * every;
    for (const p of run) {
      if (p.u < next) continue;
      next = p.u + every * (0.4 + rand() * 1.2);
      const depth = Math.max(4, bandW[p.side] - 4) * rand() + (d.offset || 0);
      const col = rand() < 0.65 ? c1 : c2;
      c.fillStyle = col;
      c.shadowColor = col;
      c.globalAlpha = 0.5 + rand() * 0.5;
      sparkle(c, p.x + p.nx * depth, p.y + p.ny * depth, (2.5 + rand() ** 2 * 9) * s);
    }
  }
};

/* ---------- 其他 ---------- */

const cobweb: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  const R = 150 * s;
  const threads = 5 + Math.round(d.density * 3);
  const rings = 3 + Math.round(d.density * 4);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  cornersOf(g, d).forEach((k, index) => {
    const a0 = Math.atan2(k.ey, k.ex);
    const span = sweep(a0, Math.atan2(k.fy, k.fx));
    const angles: number[] = [];
    c.strokeStyle = c1;
    c.globalAlpha = 0.75;
    c.lineWidth = 1.3 * s;
    for (let i = 0; i < threads; i++) {
      const a = a0 + (span * i) / (threads - 1);
      const len = R * (0.9 + rand() * 0.25);
      angles.push(a);
      c.beginPath();
      c.moveTo(k.x, k.y);
      c.lineTo(k.x + Math.cos(a) * len, k.y + Math.sin(a) * len);
      c.stroke();
    }
    c.globalAlpha = 0.6;
    c.lineWidth = 1 * s;
    for (let j = 1; j <= rings; j++) {
      const rr = (R * j) / (rings + 0.5);
      c.beginPath();
      angles.forEach((a, i) => {
        const x = k.x + Math.cos(a) * rr;
        const y = k.y + Math.sin(a) * rr;
        if (!i) {
          c.moveTo(x, y);
          return;
        }
        const am = (angles[i - 1] + a) / 2;
        const sag = rr * 0.8;
        c.quadraticCurveTo(k.x + Math.cos(am) * sag, k.y + Math.sin(am) * sag, x, y);
      });
      c.stroke();
    }
    c.globalAlpha = 1;
    if (index !== 0 || d.density < 0.4) return;
    /* 垂下的蜘蛛 */
    const a = a0 + span * 0.5;
    const hx = k.x + Math.cos(a) * R * 0.5;
    const hy = k.y + Math.sin(a) * R * 0.5;
    const sx = hx;
    const sy = hy + 60 * s * (0.7 + rand() * 0.7);
    c.globalAlpha = 0.7;
    c.beginPath();
    c.moveTo(hx, hy);
    c.lineTo(sx, sy);
    c.stroke();
    c.globalAlpha = 1;
    c.strokeStyle = c2;
    c.fillStyle = c2;
    c.lineWidth = 1.6 * s;
    for (const side of [-1, 1]) {
      for (let l = 0; l < 4; l++) {
        const ly = sy - 2 * s + l * 3 * s;
        c.beginPath();
        c.moveTo(sx, ly);
        c.quadraticCurveTo(
          sx + side * 9 * s,
          ly - 7 * s + l * 2.5 * s,
          sx + side * 13 * s,
          ly + (l - 1.5) * 4.5 * s,
        );
        c.stroke();
      }
    }
    c.beginPath();
    c.ellipse(sx, sy + 3 * s, 5 * s, 6.5 * s, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(sx, sy - 4.5 * s, 3.5 * s, 0, TAU);
    c.fill();
  });
};

const chain: DrawDeco = (c, g, d, _rand, [c1, c2]) => {
  const s = d.size;
  const span = lerp(460, 150, d.density) * s;
  const depth = span * 0.16;
  const link = 24 * s;
  for (const run of runsOf(g, d, 4)) {
    if (run.length < 2) continue;
    const total = run[run.length - 1].u;
    const swags = Math.max(1, Math.round(total / span));
    const per = total / swags;
    const curve = run.map((p) => {
      const sag = Math.sin(((p.u / per) % 1) * Math.PI) * depth;
      return { x: p.x - p.nx * sag, y: p.y - p.ny * sag, a: 0 };
    });
    for (let i = 1; i < curve.length; i++) {
      curve[i].a =
        curve[i - 1].a + Math.hypot(curve[i].x - curve[i - 1].x, curve[i].y - curve[i - 1].y);
    }
    const length = curve[curve.length - 1].a;
    let i = 0;
    let n = 0;
    for (let a = link / 2; a < length; a += link * 0.78, n++) {
      while (i < curve.length - 2 && curve[i + 1].a < a) i++;
      const p0 = curve[i];
      const p1 = curve[i + 1];
      const t = (a - p0.a) / Math.max(1e-6, p1.a - p0.a);
      c.save();
      c.translate(lerp(p0.x, p1.x, t), lerp(p0.y, p1.y, t));
      c.rotate(Math.atan2(p1.y - p0.y, p1.x - p0.x));
      c.beginPath();
      c.ellipse(0, 0, link * 0.55, n % 2 ? 2.4 * s : 7 * s, 0, 0, TAU);
      c.lineWidth = 5 * s;
      c.strokeStyle = c2;
      c.stroke();
      c.lineWidth = 2.4 * s;
      c.strokeStyle = c1;
      c.stroke();
      c.restore();
    }
    /* 掛點 */
    for (let k = 0; k <= swags; k++) {
      const target = k * per;
      const p = run.reduce(
        (best, q) => (Math.abs(q.u - target) < Math.abs(best.u - target) ? q : best),
        run[0],
      );
      c.beginPath();
      c.arc(p.x, p.y, 7 * s, 0, TAU);
      c.fillStyle = c2;
      c.fill();
      c.beginPath();
      c.arc(p.x, p.y, 4 * s, 0, TAU);
      c.fillStyle = c1;
      c.fill();
    }
  }
};

function gear(
  c: Ctx,
  x: number,
  y: number,
  r: number,
  rot: number,
  fill: string,
  dark: string,
  hub: string,
) {
  const teeth = Math.max(8, Math.round(r / 5.5));
  const tooth = Math.min(11, r * 0.2);
  const step = TAU / teeth;
  c.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    const outline: [number, number][] = [
      [a, r - tooth],
      [a + step * 0.12, r],
      [a + step * 0.42, r],
      [a + step * 0.54, r - tooth],
      [a + step, r - tooth],
    ];
    outline.forEach(([pa, pr], j) => {
      const px = x + Math.cos(pa) * pr;
      const py = y + Math.sin(pa) * pr;
      if (i === 0 && j === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
  }
  c.closePath();
  c.moveTo(x + r * 0.3, y);
  c.arc(x, y, r * 0.3, 0, TAU);
  c.fillStyle = fill;
  c.fill('evenodd');
  c.strokeStyle = dark;
  c.lineWidth = Math.max(1.2, r * 0.035);
  c.stroke();
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, TAU);
  for (let i = 0; i < 5; i++) {
    const a = rot + (i * TAU) / 5;
    c.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
    c.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
  }
  c.stroke();
  c.beginPath();
  c.arc(x, y, r * 0.15, 0, TAU);
  c.fillStyle = hub;
  c.fill();
}

const gears: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  const R = 58 * s;
  const dark = shade(c1, 0.5);
  const mesh = (r1: number, r2: number) =>
    r1 + r2 - (Math.min(11, r1 * 0.2) + Math.min(11, r2 * 0.2)) * 0.45;
  for (const k of cornersOf(g, d)) {
    const bx = k.x + k.dx * R * 0.3;
    const by = k.y + k.dy * R * 0.3;
    const rot = rand() * TAU;
    const list: [number, number, number, number, string][] = [[bx, by, R, rot, c1]];
    const r2 = R * 0.62;
    const g2 = mesh(R, r2);
    list.push([bx + k.ex * g2, by + k.ey * g2, r2, rand() * TAU, shade(c1, 1.15)]);
    if (d.density > 0.3) {
      const r3 = R * 0.46;
      const g3 = mesh(R, r3);
      list.push([bx + k.fx * g3, by + k.fy * g3, r3, rand() * TAU, shade(c1, 0.85)]);
    }
    if (d.density > 0.7) {
      const r4 = R * 0.34;
      const g4 = mesh(r2, r4);
      const [x2, y2] = list[1];
      list.push([
        x2 + k.ex * g4 * 0.7 - k.dx * g4 * 0.5,
        y2 + k.ey * g4 * 0.7 - k.dy * g4 * 0.5,
        r4,
        rand() * TAU,
        shade(c1, 1.05),
      ]);
    }
    for (const [x, y, r, ro, fill] of list.slice().reverse()) gear(c, x, y, r, ro, fill, dark, c2);
  }
};

const circuit: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  const o = d.offset || 0;
  const bandW = frameBand(g);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (const run of runsOf(g, d, 4)) {
    if (run.length < 2) continue;
    const traces = 2 + Math.round(d.density * 2);
    const seg = lerp(220, 70, d.density) * s;
    for (let t = 0; t < traces; t++) {
      let level = rand();
      let next = rand() * seg;
      let padNext = rand() * seg;
      let depth: number | null = null;
      let prev: GuidePoint | null = null;
      const pads: [number, number][] = [];
      c.save();
      c.shadowColor = c1;
      c.shadowBlur = 8 * g.k;
      c.strokeStyle = c1;
      c.lineWidth = 2 * s;
      c.globalAlpha = 0.85;
      c.beginPath();
      for (const p of run) {
        if (p.u >= next) {
          next = p.u + seg * (0.5 + rand());
          level = rand();
        }
        const room = Math.max(0, bandW[p.side] - o - 16 * s);
        const target = 8 * s + level * room;
        const stepLen = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
        depth =
          depth == null ? target : depth + Math.max(-stepLen, Math.min(stepLen, target - depth));
        const x = p.x + p.nx * depth;
        const y = p.y + p.ny * depth;
        if (prev) c.lineTo(x, y);
        else c.moveTo(x, y);
        if (p.u >= padNext) {
          pads.push([x, y]);
          padNext = p.u + seg * (0.8 + rand() * 1.6);
        }
        prev = p;
      }
      c.stroke();
      c.restore();
      for (const [x, y] of pads) {
        c.beginPath();
        c.arc(x, y, 5 * s, 0, TAU);
        c.strokeStyle = c2;
        c.lineWidth = 2 * s;
        c.stroke();
        c.beginPath();
        c.arc(x, y, 2 * s, 0, TAU);
        c.fillStyle = c1;
        c.fill();
      }
    }
  }
};

const snowcap: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  for (const run of runsOf(g, d, 4)) {
    if (run.length < 2) continue;
    const w1 = wobble(rand);
    const w2 = wobble(rand);
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (const p of run) {
      const up = -p.ny;
      const thick = (up < -0.5 ? 3 : 10 + 4 * w1(p.u / 60)) * s;
      const down =
        up > 0.5
          ? (8 + 6 * w2(p.u / 45)) * s
          : up < -0.5
            ? (14 + 10 * (0.5 + 0.5 * w2(p.u / 70))) * s
            : (4 + 2 * w2(p.u / 50)) * s;
      outer.push([p.x + p.nx * thick, p.y + p.ny * thick]);
      inner.push([p.x - p.nx * down, p.y - p.ny * down]);
    }
    band(c, outer, inner);
    c.save();
    c.shadowColor = 'rgba(0,0,0,.25)';
    c.shadowBlur = 6 * g.k;
    c.shadowOffsetY = 2 * g.k;
    c.fillStyle = c1;
    c.fill();
    c.restore();
    c.strokeStyle = c2;
    c.lineWidth = 3 * s;
    c.globalAlpha = 0.6;
    c.beginPath();
    inner.forEach(([x, y], i) => {
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.stroke();
    c.globalAlpha = 1;
    /* 冰柱（只在上緣） */
    const every = lerp(110, 22, d.density) * s;
    let next = rand() * every;
    run.forEach((p, i) => {
      if (-p.ny < 0.7 || p.u < next) return;
      next = p.u + every * (0.5 + rand());
      const [x, y] = inner[i];
      const len = (14 + rand() ** 2 * 70) * s;
      const w = (4 + rand() * 4) * s;
      const grad = c.createLinearGradient(x, y, x, y + len);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, 'rgba(255,255,255,0.2)');
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(x - w, y - 3 * s);
      c.quadraticCurveTo(x - w * 0.3, y + len * 0.4, x, y + len);
      c.quadraticCurveTo(x + w * 0.3, y + len * 0.4, x + w, y - 3 * s);
      c.closePath();
      c.fill();
      c.strokeStyle = c2;
      c.globalAlpha = 0.45;
      c.lineWidth = 1 * s;
      c.stroke();
      c.globalAlpha = 1;
    });
  }
};

const drips: DrawDeco = (c, g, d, rand, [c1, c2]) => {
  const s = d.size;
  for (const run of runsOf(g, d, 4)) {
    if (run.length < 2) continue;
    const w = wobble(rand);
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (const p of run) {
      const lip = (6 + 4 * w(p.u / 40)) * s;
      outer.push([p.x + p.nx * 4 * s, p.y + p.ny * 4 * s]);
      inner.push([p.x - p.nx * lip, p.y - p.ny * lip]);
    }
    band(c, outer, inner);
    c.fillStyle = c1;
    c.fill();
    const every = lerp(140, 26, d.density) * s;
    let next = rand() * every;
    run.forEach((p, i) => {
      if (p.u < next || p.ny > 0.3) return;
      next = p.u + every * (0.4 + rand() * 1.2);
      const [x, y] = inner[i];
      const len = (10 + rand() ** 1.8 * 110) * s;
      const wd = (3 + rand() * 3.5) * s;
      const bulb = wd * (1.1 + rand() * 0.5);
      c.fillStyle = c1;
      c.beginPath();
      c.moveTo(x - wd, y - 4 * s);
      c.bezierCurveTo(
        x - wd * 0.7,
        y + len * 0.45,
        x - bulb,
        y + len - bulb * 0.6,
        x - bulb,
        y + len,
      );
      c.arc(x, y + len, bulb, Math.PI, 0, true);
      c.bezierCurveTo(
        x + bulb,
        y + len - bulb * 0.6,
        x + wd * 0.7,
        y + len * 0.45,
        x + wd,
        y - 4 * s,
      );
      c.closePath();
      c.fill();
      c.fillStyle = c2;
      c.globalAlpha = 0.55;
      c.beginPath();
      c.ellipse(x - bulb * 0.35, y + len - bulb * 0.15, bulb * 0.22, bulb * 0.38, -0.3, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
    });
  }
};

const TYPES: Record<DecoType, DrawDeco> = {
  ivy,
  flowers,
  thorns,
  sakura,
  grass,
  stars,
  cobweb,
  chain,
  gears,
  circuit,
  snowcap,
  drips,
};

/** 依清單順序畫所有裝飾（清單後面的在前面） */
export function drawDecorations(g: G): void {
  for (const d of g.state.decorations) {
    const fn = TYPES[d.type];
    if (!d.on || !fn || !g.visible(d)) continue;
    const rand = createRandom(decoSeed(d.type, d.seed));
    g.ctx.save();
    if (d.clipFrame) {
      g.ctx.beginPath();
      g.traceFrame(g.ctx);
      g.ctx.clip('evenodd');
    }
    fn(g.ctx, g, d, rand.next, [g.color(d.color), g.color(d.color2)]);
    g.ctx.restore();
  }
}
