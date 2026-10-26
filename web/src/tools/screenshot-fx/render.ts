/**
 * 截圖演出的外觀（規格 3.6、3.7）：螢光筆與紅筆、四種放大框的樣式。畫一格的流程、背景、陰影、塗黑、邊界演出、
 * 運鏡、圖層都在共用的圖片演出引擎（core/imagefx 的 renderFrame）；這裡把截圖演出的框交給它（kit）。
 * 螢光筆、塗黑、放大框的外觀都是本站自己設計的（原作的程式與樣式拿不到，也不能沿用）。
 */

import { roundRectPath } from '@/core/image';
import {
  type CardEnv,
  type Ctx,
  type FrameInput,
  growRect,
  paintShadowOnlyCard,
  RenderCache,
  type RenderKit,
  type RenderOptions,
  renderFrame as renderFxFrame,
  renderToCanvas as renderFxToCanvas,
  strokePartial,
} from '@/core/imagefx';
import { clamp01, hashSigned, seedOf } from '@/core/timeline';
import {
  type Frame,
  type FxState,
  HIGHLIGHT_COLORS,
  isActionFrame,
  isCameraCandidate,
  isHighlight,
  type MarkerFrame,
  RED_PEN,
  type Rect,
  spanRect,
  type ZoomFrame,
} from './model';

export {
  type AnyCanvas,
  blockAverage,
  CREDIT_FONT_FAMILY,
  CREDIT_FONT_WEIGHT,
  type Ctx,
  drawEdge,
  EDGE_GOLD,
  EDGE_SCAN,
  frostSigma,
  type ImageSource,
  type Mapping,
  mosaicCells,
  type Pixels,
  RenderCache,
  type RenderOptions,
  type ShadowSpec,
  shadowOutside,
  UI_FONT_STACK,
} from '@/core/imagefx';

/* ---------- 螢光筆 ---------- */

/** 紅筆的線寬（畫面 px；短邊 1080 時 4.5 px，至少 2，自訂） */
export const penWidth = (u: number): number => Math.max(2, 4.5 * u);

/** 手繪的圈：從左上角附近出發繞一圈、收尾時越過起點一點；每個框的抖動固定（依 id） */
function handBoxPoints(r: Rect, pad: number, seed: number, dir: 'h' | 'v'): [number, number][] {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;
  const jx = Math.min(pad * 0.5, (x1 - x0) * 0.03);
  const jy = Math.min(pad * 0.5, (y1 - y0) * 0.06);
  const j = (i: number, amp: number) => hashSigned(seed, i) * amp;
  const W = x1 - x0;
  const H = y1 - y0;
  /* 角稍微圓、邊上加一點起伏；橫向＝先往右（順時針），直向＝先往下（逆時針）；收尾越過起點一點 */
  const pts: [number, number][] =
    dir === 'h'
      ? [
          [x0 + W * 0.08, y0 + j(1, jy)],
          [x1 - W * 0.04 + j(2, jx), y0 + j(3, jy)],
          [x1 + j(4, jx), y0 + H * 0.18],
          [x1 + j(5, jx), y1 - H * 0.12],
          [x1 - W * 0.06, y1 + j(6, jy)],
          [x0 + W * 0.05 + j(7, jx), y1 + j(8, jy)],
          [x0 + j(9, jx), y1 - H * 0.16],
          [x0 + j(10, jx), y0 + H * 0.14],
          [x0 + W * 0.06, y0 - jy * 0.6],
          [x0 + W * 0.24, y0 + j(11, jy)],
        ]
      : [
          [x0 + j(1, jx), y0 + H * 0.08],
          [x0 + j(2, jx), y1 - H * 0.04 + j(3, jy)],
          [x0 + W * 0.18, y1 + j(4, jy)],
          [x1 - W * 0.12, y1 + j(5, jy)],
          [x1 + j(6, jx), y1 - H * 0.06],
          [x1 + j(7, jx), y0 + H * 0.05 + j(8, jy)],
          [x1 - W * 0.16, y0 + j(9, jy)],
          [x0 + W * 0.14, y0 + j(10, jy)],
          [x0 - jx * 0.6, y0 + H * 0.06],
          [x0 + j(11, jx), y0 + H * 0.24],
        ];
  /* 中間插點讓線有點彎 */
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push(a);
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    const bow = hashSigned(seed, 40 + i) * Math.min(pad * 0.35, 3 + nl * 0.01);
    out.push([(a[0] + b[0]) / 2 + (nx / nl) * bow, (a[1] + b[1]) / 2 + (ny / nl) * bow]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 一條稍微不直的線（a → b） */
function wobblyLine(
  a: [number, number],
  b: [number, number],
  seed: number,
  amp: number,
): [number, number][] {
  const n = 6;
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const nl = Math.hypot(nx, ny) || 1;
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const off = i === 0 || i === n ? 0 : hashSigned(seed, i) * amp;
    return [a[0] + (b[0] - a[0]) * u + (nx / nl) * off, a[1] + (b[1] - a[1]) * u + (ny / nl) * off];
  });
}

export function drawMarker(
  g: Ctx,
  f: MarkerFrame,
  r: Rect,
  q: number,
  lw: number,
  multiply = true,
): void {
  if (q <= 0 || r.w <= 0 || r.h <= 0) return;
  const seed = seedOf(f.id);
  g.save();
  if (isHighlight(f.style)) {
    /* 螢光筆：色塊以色彩增值疊上，兩端稍圓，沿方向長出（圖層匯出時一般疊上，剪輯軟體裡再設色彩增值） */
    if (multiply) g.globalCompositeOperation = 'multiply';
    g.fillStyle = HIGHLIGHT_COLORS[f.style];
    g.globalAlpha = 0.92;
    const grow = spanRect(r, f.dir, 0, q);
    const inset = f.dir === 'h' ? r.h * 0.04 : r.w * 0.04;
    const body =
      f.dir === 'h'
        ? { x: grow.x, y: grow.y + inset, w: grow.w, h: grow.h - inset * 2 }
        : { x: grow.x + inset, y: grow.y, w: grow.w - inset * 2, h: grow.h };
    const rad = Math.min(body.w, body.h) * 0.22;
    g.beginPath();
    roundRectPath(g, body.x, body.y, body.w, body.h, rad);
    g.fill();
    g.restore();
    return;
  }
  g.strokeStyle = RED_PEN;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = 0.95;
  if (f.style === 'redBox') {
    const pad = Math.max(lw * 1.6, Math.min(r.w, r.h) * 0.12);
    strokePartial(g, handBoxPoints(r, pad, seed, f.dir), q);
  } else if (f.style === 'redLine') {
    const amp = lw * 0.35;
    const pts =
      f.dir === 'h'
        ? wobblyLine([r.x, r.y + r.h + lw * 0.9], [r.x + r.w, r.y + r.h + lw * 0.6], seed, amp)
        : wobblyLine([r.x + r.w + lw * 0.9, r.y], [r.x + r.w + lw * 0.6, r.y + r.h], seed, amp);
    strokePartial(g, pts, q);
  } else {
    /* 雙刪除線：先畫第一條、再畫第二條 */
    const amp = lw * 0.25;
    const lines: [[number, number], [number, number]][] =
      f.dir === 'h'
        ? [
            [
              [r.x, r.y + r.h * 0.42],
              [r.x + r.w, r.y + r.h * 0.38],
            ],
            [
              [r.x, r.y + r.h * 0.64],
              [r.x + r.w, r.y + r.h * 0.6],
            ],
          ]
        : [
            [
              [r.x + r.w * 0.6, r.y],
              [r.x + r.w * 0.62, r.y + r.h],
            ],
            [
              [r.x + r.w * 0.38, r.y],
              [r.x + r.w * 0.4, r.y + r.h],
            ],
          ];
    strokePartial(g, wobblyLine(lines[0][0], lines[0][1], seed, amp), clamp01(q * 2));
    strokePartial(g, wobblyLine(lines[1][0], lines[1][1], seed + 7, amp), clamp01(q * 2 - 1));
  }
  g.restore();
}

/* ---------- 放大框 ---------- */

/** 撕紙的邊（依 id 固定）：沿外框每隔一段往內縮一點 */
function tornPath(g: Ctx, r: Rect, depth: number, step: number, seed: number) {
  const pts: [number, number][] = [];
  const edge = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    nx: number,
    ny: number,
    s: number,
  ) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const d = (hashSigned(seed, s * 1000 + i) * 0.5 + 0.5) * depth;
      pts.push([ax + (bx - ax) * u + nx * d, ay + (by - ay) * u + ny * d]);
    }
  };
  edge(r.x, r.y, r.x + r.w, r.y, 0, 1, 1);
  edge(r.x + r.w, r.y, r.x + r.w, r.y + r.h, -1, 0, 2);
  edge(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 0, -1, 3);
  edge(r.x, r.y + r.h, r.x, r.y, 1, 0, 4);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath();
}

/** 放大框的外觀參數（畫面 px；u＝短邊 1080 為 1） */
export const CARD = {
  radius: 12,
  cyan: '#3be6ff',
  paper: '#f3ecdb',
  tape: 'rgba(236, 222, 180, 0.78)',
} as const;

/** 四種樣式：白卡、撕紙、發光螢幕、只有陰影（3.6） */
function paintCard(g: Ctx, zf: ZoomFrame, env: CardEnv): void {
  const { C, a, b, u, ds, content } = env;
  const rectPath = (r: Rect, rad: number) => {
    g.beginPath();
    roundRectPath(g, r.x, r.y, r.w, r.h, rad);
  };
  if (zf.style === 'card') {
    const R = CARD.radius * u;
    const outer = growRect(C, b);
    g.save();
    g.shadowColor = `rgba(0, 0, 0, ${(0.5 * a).toFixed(3)})`;
    g.shadowBlur = 36 * u * a * ds;
    g.shadowOffsetY = 14 * u * a * ds;
    g.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
    rectPath(outer, R + b);
    g.fill();
    g.restore();
    content(() => rectPath(C, R));
    return;
  }
  if (zf.style === 'torn') {
    const mg = (6 + 2.5 * zf.border) * u;
    const paper = growRect(C, mg);
    const seed = seedOf(zf.id);
    g.save();
    g.globalAlpha = a;
    g.shadowColor = 'rgba(0, 0, 0, 0.45)';
    g.shadowBlur = 24 * u * ds;
    g.shadowOffsetY = 8 * u * ds;
    g.fillStyle = CARD.paper;
    tornPath(g, paper, mg * 0.55, 12 * u, seed);
    g.fill();
    g.restore();
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    /* 上緣中間貼一段膠帶 */
    const tw = Math.min(paper.w * 0.28, 180 * u);
    const th = Math.max(14 * u, mg * 1.6);
    g.save();
    g.globalAlpha = a;
    g.translate(paper.x + paper.w / 2, paper.y + mg * 0.2);
    g.rotate((-3 * Math.PI) / 180);
    g.fillStyle = CARD.tape;
    g.fillRect(-tw / 2, -th / 2, tw, th);
    g.restore();
    return;
  }
  if (zf.style === 'cyber') {
    g.save();
    g.globalAlpha = a;
    g.fillStyle = '#04121a';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.restore();
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    /* 掃描線與淡淡的青色 */
    g.save();
    g.beginPath();
    g.rect(C.x, C.y, C.w, C.h);
    g.clip();
    g.globalAlpha = a;
    g.fillStyle = 'rgba(59, 230, 255, 0.07)';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.fillStyle = 'rgba(0, 0, 0, 0.08)';
    const gap = Math.max(3, 4 * u);
    for (let y = C.y; y < C.y + C.h; y += gap) g.fillRect(C.x, y, C.w, Math.max(1, gap * 0.4));
    g.restore();
    /* 發光的框與四角的括號 */
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = CARD.cyan;
    g.shadowColor = CARD.cyan;
    g.shadowBlur = 18 * u * ds;
    g.lineWidth = b;
    g.strokeRect(C.x - b / 2, C.y - b / 2, C.w + b, C.h + b);
    const L = Math.min(C.w, C.h) * 0.18;
    const o = b * 2.5;
    g.lineWidth = b * 2;
    g.lineCap = 'square';
    g.beginPath();
    for (const [x, y, sx, sy] of [
      [C.x - o, C.y - o, 1, 1],
      [C.x + C.w + o, C.y - o, -1, 1],
      [C.x + C.w + o, C.y + C.h + o, -1, -1],
      [C.x - o, C.y + C.h + o, 1, -1],
    ] as const) {
      g.moveTo(x + sx * L, y);
      g.lineTo(x, y);
      g.lineTo(x, y + sy * L);
    }
    g.stroke();
    g.restore();
    return;
  }
  /* 只有陰影（陰影只在卡片外面：框裡的截圖有透明處時看得到底下的畫面，不是黑底） */
  paintShadowOnlyCard(g, env);
}

/* ---------- 交給引擎 ---------- */

/** 截圖演出的框：螢光筆（標記）、放大框的四種樣式；塗黑用引擎內建的黑塊、馬賽克、毛玻璃 */
export const KIT: RenderKit<Frame> = {
  isAction: isActionFrame,
  isCameraCandidate,
  drawMark: (g, f, r, q, env) =>
    drawMarker(g, f as MarkerFrame, r, q, penWidth(env.u) * env.m.k, env.multiply),
  paintCard: (g, z, env) => paintCard(g, z as ZoomFrame, env),
};

/** 畫 t 秒的那一格（畫布大小要等於畫面大小） */
export function renderFrame(
  g: Ctx,
  input: FrameInput<FxState>,
  t: number,
  cache: RenderCache,
  opts: RenderOptions = {},
): void {
  renderFxFrame(g, input, t, cache, KIT, opts);
}

/** 畫成一張新的畫布 */
export const renderToCanvas = (
  input: FrameInput<FxState>,
  t: number,
  cache = new RenderCache(),
  opts: RenderOptions = {},
) => renderFxToCanvas(input, t, KIT, cache, opts);
