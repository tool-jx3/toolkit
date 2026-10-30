/**
 * 地圖演出的外觀（規格 3.5～3.8，全部是本站自己設計的）：路線・地點（四種路線、目的地圖釘、鎖定準星、危險區）與標籤、
 * 房間遮罩的四種樣子（黑暗＋「？房名」、禁止進入斜線、戰爭迷霧、馬賽克）、區域放大的四種框。
 * 畫一格的流程、背景、陰影、塗黑的剪裁與淡出、邊界演出、圖層都在共用的圖片演出引擎（core/imagefx 的 renderFrame）。
 */
import { roundRectPath } from '@/core/image';
import {
  type CardEnv,
  type Ctx,
  devScale,
  type FrameInput,
  growRect,
  type MarkEnv,
  mapPoint,
  paintCrop,
  paintShadowOnlyCard,
  type RedactEnv,
  type RedactFrameBase,
  RenderCache,
  type RenderKit,
  type RenderOptions,
  renderFrame as renderFxFrame,
  renderToCanvas as renderFxToCanvas,
  UI_FONT_STACK,
} from '@/core/imagefx';
import { clamp, clamp01, EASE, hashSigned, hashUnit, seedOf } from '@/core/timeline';
import {
  type Frame,
  isActionFrame,
  lPolygon,
  type MapState,
  maskCutRect,
  maskMainRect,
  maskPolygon,
  type Point,
  pathLength,
  pathUntil,
  pointAlong,
  type Rect,
  type RedactFrame,
  type RouteFrame,
  routePath,
  type ZoomFrame,
} from './model';

export {
  type AnyCanvas,
  type Ctx,
  type ImageSource,
  RenderCache,
  type RenderOptions,
  UI_FONT_STACK,
} from '@/core/imagefx';

/** 各種的顏色（自訂） */
export const MAP_COLORS = {
  dashed: '#e5323b',
  footprints: '#2a211b',
  neon: '#35f2ff',
  march: '#f2c14e',
  marchEdge: '#3b2a05',
  pin: '#e5363d',
  target: '#ff3b30',
  targetSeek: '#ffb020',
  danger: '#e0242b',
  amber: '#f2b31b',
  tactical: '#4dff9a',
} as const;

const font = (px: number) => `700 ${px}px ${UI_FONT_STACK}`;
const rgba = (hex: string, a: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp01(a).toFixed(3)})`;
};

/* ---------- 標籤 ---------- */

/** 標籤的字級（畫面 px；短邊 1080 時 20 px，至少 11；在放大框裡跟著放大） */
export const labelPx = (u: number, k: number): number => Math.max(11, 20 * u) * k;

type Anchor = 'above' | 'below' | 'aboveRight' | 'inside';

/**
 * 深色圓角底＋白字的小標籤，左邊一條種類的顏色；夾在畫面裡。
 * anchor：above＝底邊中點在 (x, y)、below＝頂邊中點、aboveRight＝左下角、inside＝左上角。
 */
function drawLabel(
  g: Ctx,
  text: string,
  x: number,
  y: number,
  anchor: Anchor,
  color: string,
  alpha: number,
  env: Pick<MarkEnv, 'u' | 'm' | 'canvas'>,
) {
  const value = text.trim();
  if (!value || alpha <= 0) return;
  const px = labelPx(env.u, env.m.k);
  g.save();
  g.font = font(px);
  const tw = Math.min(g.measureText(value).width, env.canvas.width * 0.6);
  const padX = px * 0.55;
  const bar = Math.max(2, px * 0.18);
  const w = tw + padX * 2 + bar;
  const h = px * 1.55;
  let bx = anchor === 'above' || anchor === 'below' ? x - w / 2 : x;
  let by = anchor === 'above' ? y - h : anchor === 'aboveRight' ? y - h : y;
  bx = clamp(bx, 2, Math.max(2, env.canvas.width - w - 2));
  by = clamp(by, 2, Math.max(2, env.canvas.height - h - 2));
  g.globalAlpha *= alpha;
  g.shadowColor = 'rgba(0, 0, 0, 0.35)';
  g.shadowBlur = px * 0.3 * devScale(g);
  g.fillStyle = 'rgba(12, 14, 20, 0.86)';
  g.beginPath();
  roundRectPath(g, bx, by, w, h, h * 0.28);
  g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = color;
  g.beginPath();
  roundRectPath(g, bx, by, bar + h * 0.2, h, h * 0.28);
  g.fill();
  g.fillStyle = 'rgba(12, 14, 20, 0.86)';
  g.fillRect(bx + bar, by, h * 0.22, h);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(value, bx + bar + padX, by + h / 2 + px * 0.04, tw);
  g.restore();
}

/* ---------- 路線 ---------- */

/** 箭頭（尖端在 (x, y)，朝 angle） */
function arrowHead(
  g: Ctx,
  x: number,
  y: number,
  angle: number,
  size: number,
  fill: string,
  edge?: { color: string; width: number },
) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(-size, -size * 0.55);
  g.lineTo(-size * 0.72, 0);
  g.lineTo(-size, size * 0.55);
  g.closePath();
  if (edge) {
    g.lineJoin = 'round';
    g.strokeStyle = edge.color;
    g.lineWidth = edge.width;
    g.stroke();
  }
  g.fillStyle = fill;
  g.fill();
  g.restore();
}

function strokePath(g: Ctx, pts: readonly Point[]) {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.stroke();
}

/** 一個腳印（腳尖朝 angle；side：左右腳） */
function footprint(g: Ctx, x: number, y: number, angle: number, len: number, side: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(1, side);
  g.beginPath();
  g.ellipse(len * 0.16, len * 0.03, len * 0.3, len * 0.19, 0.12, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(-len * 0.32, 0, len * 0.15, len * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** 四種路線（q＝已套曲線的進度，沿著路線畫到 q） */
function drawPath(g: Ctx, f: RouteFrame, pts: Point[], q: number, env: MarkEnv) {
  const { u, m } = env;
  const k = m.k;
  const ds = devScale(g);
  const L = pathLength(pts);
  if (L <= 0 || q <= 0) return;
  const d = L * clamp01(q);
  const tip = pointAlong(pts, d);
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (f.style === 'dashed') {
    const w = Math.max(2, 5 * u) * k;
    const head = w * 3;
    g.shadowColor = 'rgba(0, 0, 0, 0.4)';
    g.shadowBlur = 3 * u * k * ds;
    g.fillStyle = MAP_COLORS.dashed;
    g.beginPath();
    g.arc(pts[0].x, pts[0].y, w * 0.95, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = MAP_COLORS.dashed;
    g.lineWidth = w;
    g.setLineDash([w * 2.1, w * 1.5]);
    strokePath(g, pathUntil(pts, Math.max(0, d - head * 0.55)));
    g.setLineDash([]);
    if (d > head * 0.4)
      arrowHead(g, tip.x, tip.y, tip.angle, head, MAP_COLORS.dashed, {
        color: 'rgba(255, 255, 255, 0.9)',
        width: Math.max(1, 1.6 * u * k),
      });
  } else if (f.style === 'footprints') {
    const foot = Math.max(12, 24 * u) * k;
    const stride = foot * 1.2;
    const n = Math.floor(L / stride);
    g.fillStyle = MAP_COLORS.footprints;
    g.shadowColor = 'rgba(255, 255, 255, 0.75)';
    g.shadowBlur = 2.5 * u * k * ds;
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * stride;
      if (s > d) break;
      const a = clamp01((d - s) / (stride * 0.8));
      const P = pointAlong(pts, s);
      const side = i % 2 === 0 ? -1 : 1;
      const off = foot * 0.3 * side;
      g.globalAlpha = 0.88 * a;
      footprint(
        g,
        P.x - Math.sin(P.angle) * off,
        P.y + Math.cos(P.angle) * off,
        P.angle,
        foot,
        side,
      );
    }
  } else if (f.style === 'neon') {
    const w = Math.max(2, 4 * u) * k;
    const part = pathUntil(pts, d);
    g.shadowColor = MAP_COLORS.neon;
    g.shadowBlur = 14 * u * k * ds;
    g.strokeStyle = rgba(MAP_COLORS.neon, 0.55);
    g.lineWidth = w * 2.4;
    strokePath(g, part);
    g.shadowBlur = 6 * u * k * ds;
    g.strokeStyle = '#d8feff';
    g.lineWidth = w * 0.8;
    strokePath(g, part);
    g.fillStyle = MAP_COLORS.neon;
    g.beginPath();
    g.arc(pts[0].x, pts[0].y, w * 0.9, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 18 * u * k * ds;
    if (q < 1) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(tip.x, tip.y, w * 1.5, 0, Math.PI * 2);
      g.fill();
    } else {
      g.strokeStyle = MAP_COLORS.neon;
      g.lineWidth = w * 0.8;
      g.beginPath();
      g.arc(tip.x, tip.y, w * 2.3, 0, Math.PI * 2);
      g.stroke();
    }
  } else {
    /* 行軍箭頭：金色粗實線＋深色描邊＋大箭頭 */
    const w = Math.max(3, 9 * u) * k;
    const head = w * 2.6;
    const part = pathUntil(pts, Math.max(0, d - head * 0.6));
    g.shadowColor = 'rgba(0, 0, 0, 0.35)';
    g.shadowBlur = 4 * u * k * ds;
    g.strokeStyle = MAP_COLORS.marchEdge;
    g.lineWidth = w + 3 * u * k;
    strokePath(g, part);
    g.shadowColor = 'transparent';
    g.strokeStyle = MAP_COLORS.march;
    g.lineWidth = w;
    strokePath(g, part);
    if (d > head * 0.4)
      arrowHead(g, tip.x, tip.y, tip.angle, head, MAP_COLORS.march, {
        color: MAP_COLORS.marchEdge,
        width: Math.max(1.5, 3 * u * k),
      });
  }
  g.restore();
  const color =
    f.style === 'neon'
      ? MAP_COLORS.neon
      : f.style === 'march'
        ? MAP_COLORS.march
        : MAP_COLORS.dashed;
  const w0 = Math.max(2, 5 * u) * k;
  drawLabel(
    g,
    f.label,
    pts[0].x + w0 * 1.2,
    pts[0].y - w0 * 1.4,
    'aboveRight',
    color,
    clamp01(q / 0.15),
    env,
  );
}

/** 目的地圖釘：圖釘落下、聲納的圈往外擴散，最後停成兩三個淡淡的圈 */
function drawPin(g: Ctx, f: RouteFrame, r: Rect, q: number, env: MarkEnv) {
  const { u, m } = env;
  const k = m.k;
  const ds = devScale(g);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = Math.min(r.w, r.h) / 2;
  const lw = Math.max(1.5, 2.5 * u) * k;
  g.save();
  const finals: [number, number][] = [
    [0.45, 0.55],
    [0.72, 0.38],
    [1, 0.22],
  ];
  finals.forEach(([fr, fa], i) => {
    const t = clamp01((q - 0.2 - 0.15 * i) / 0.45);
    if (t <= 0) return;
    const rad = R * fr * EASE.out(t);
    g.strokeStyle = rgba(MAP_COLORS.pin, 0.95 + (fa - 0.95) * t);
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cy, Math.max(0.5, rad), 0, Math.PI * 2);
    g.stroke();
  });
  /* 掃過的一圈（只在動作中） */
  if (q > 0.2 && q < 1) {
    const t = ((q - 0.2) / 0.8) % 1;
    g.strokeStyle = rgba(MAP_COLORS.pin, 0.5 * (1 - t));
    g.lineWidth = lw * 0.8;
    g.beginPath();
    g.arc(cx, cy, Math.max(0.5, R * 1.15 * t), 0, Math.PI * 2);
    g.stroke();
  }
  /* 圖釘：尖端在中心，從上方落下 */
  const drop = clamp01(q / 0.3);
  if (drop > 0) {
    const H = clamp(Math.min(r.w, r.h) * 0.42, 16 * u * k, 90 * u * k);
    const head = H * 0.31;
    const oy = -(1 - EASE.back(drop)) * H * 1.2;
    g.globalAlpha = clamp01(q / 0.12);
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    g.beginPath();
    g.ellipse(cx, cy, head * 0.7, head * 0.25, 0, 0, Math.PI * 2);
    g.fill();
    g.translate(0, oy);
    const hy = cy - H + head;
    g.shadowColor = 'rgba(0, 0, 0, 0.35)';
    g.shadowBlur = 4 * u * k * ds;
    g.fillStyle = MAP_COLORS.pin;
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(1.2, 2 * u * k);
    g.beginPath();
    g.moveTo(cx, cy);
    g.bezierCurveTo(cx - head * 0.55, hy + head * 1.2, cx - head, hy + head * 0.5, cx - head, hy);
    g.arc(cx, hy, head, Math.PI, 0);
    g.bezierCurveTo(cx + head, hy + head * 0.5, cx + head * 0.55, hy + head * 1.2, cx, cy);
    g.closePath();
    g.fill();
    g.shadowColor = 'transparent';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, hy, head * 0.38, 0, Math.PI * 2);
    g.fill();
    g.translate(0, -oy);
    g.globalAlpha = 1;
    drawLabel(
      g,
      f.label,
      cx,
      cy - H - 4 * u * k,
      'above',
      MAP_COLORS.pin,
      clamp01((q - 0.25) / 0.15),
      env,
    );
  }
  g.restore();
}

/** 鎖定準星：四角的括號轉著收進框、圓與十字畫出來，鎖定時從琥珀色變紅、閃一下 */
function drawTarget(g: Ctx, f: RouteFrame, r: Rect, q: number, env: MarkEnv) {
  const { u, m } = env;
  const k = m.k;
  if (q <= 0) return;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const R = (Math.min(r.w, r.h) / 2) * 0.62;
  const lw = Math.max(2, 3 * u) * k;
  const lock = q >= 0.65;
  const a = EASE.out(clamp01(q / 0.65));
  const color = lock ? MAP_COLORS.target : MAP_COLORS.targetSeek;
  g.save();
  g.lineCap = 'square';
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.shadowColor = 'rgba(0, 0, 0, 0.45)';
  g.shadowBlur = 3 * u * k * devScale(g);
  /* 四角的括號 */
  const s = 1 + 0.8 * (1 - a);
  const rot = (Math.PI / 4) * (1 - a);
  const hw = (r.w / 2) * s;
  const hh = (r.h / 2) * s;
  const L = Math.min(r.w, r.h) * 0.22 * s;
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.globalAlpha = clamp01(q / 0.15);
  g.beginPath();
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    g.moveTo(sx * hw, sy * hh + -sy * L);
    g.lineTo(sx * hw, sy * hh);
    g.lineTo(sx * hw + -sx * L, sy * hh);
  }
  g.stroke();
  g.restore();
  /* 圓與十字 */
  const arc = clamp01((q - 0.15) / 0.5);
  if (arc > 0) {
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * arc);
    g.stroke();
    g.globalAlpha = arc;
    g.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      g.moveTo(cx + dx * R * 0.45, cy + dy * R * 0.45);
      g.lineTo(cx + dx * R * 1.25, cy + dy * R * 1.25);
    }
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, lw * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  /* 鎖定的閃光 */
  if (q >= 0.65 && q < 0.85) {
    g.globalAlpha = 1;
    g.fillStyle = rgba(MAP_COLORS.target, 0.28 * (1 - (q - 0.65) / 0.2));
    g.beginPath();
    g.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  drawLabel(
    g,
    f.label,
    cx,
    cy + R * 1.35 + 4 * u * k,
    'below',
    MAP_COLORS.target,
    clamp01((q - 0.6) / 0.15),
    env,
  );
}

/** 危險區：紅框沿著邊畫出來，斜線從左上往右下掃滿 */
function drawDanger(g: Ctx, f: RouteFrame, r: Rect, q: number, env: MarkEnv) {
  const { u, m } = env;
  const k = m.k;
  if (q <= 0) return;
  const lw = Math.max(2, 3 * u) * k;
  g.save();
  const fill = clamp01((q - 0.25) / 0.75);
  if (fill > 0) {
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    g.fillStyle = rgba(MAP_COLORS.danger, 0.12 * fill);
    g.fillRect(r.x, r.y, r.w, r.h);
    const gap = Math.max(8, 16 * u) * k;
    const sw = gap * 0.42;
    const reach = (r.w + r.h) * fill;
    g.fillStyle = rgba(MAP_COLORS.danger, 0.45);
    for (let t = -r.h; t < r.w; t += gap) {
      if (t + r.h > reach) break;
      g.beginPath();
      g.moveTo(r.x + t, r.y + r.h);
      g.lineTo(r.x + t + r.h, r.y);
      g.lineTo(r.x + t + r.h + sw, r.y);
      g.lineTo(r.x + t + sw, r.y + r.h);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  const edge = clamp01(q / 0.5);
  g.strokeStyle = MAP_COLORS.danger;
  g.lineWidth = lw;
  g.lineJoin = 'miter';
  const per = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
    { x: r.x, y: r.y },
  ];
  strokePath(g, pathUntil(per, pathLength(per) * edge));
  g.restore();
  drawLabel(
    g,
    f.label,
    r.x + lw,
    r.y + lw,
    'inside',
    MAP_COLORS.danger,
    clamp01((q - 0.3) / 0.2),
    env,
  );
}

/** 路線・地點 */
export function drawRoute(g: Ctx, f: RouteFrame, r: Rect, q: number, env: MarkEnv): void {
  if (q <= 0 || r.w <= 0 || r.h <= 0) return;
  if (f.style === 'pin') drawPin(g, f, r, q, env);
  else if (f.style === 'target') drawTarget(g, f, r, q, env);
  else if (f.style === 'danger') drawDanger(g, f, r, q, env);
  else
    drawPath(
      g,
      f,
      routePath(f).map((p) => mapPoint(env.m, p)),
      q,
      env,
    );
}

/* ---------- 房間遮罩 ---------- */

/** 房名的字級（框內；畫面 px） */
const nameSize = (r: Rect, env: RedactEnv) =>
  clamp(Math.min(r.h * 0.16, r.w * 0.14), 7, 30 * env.u * env.m.k);

/** 深色小牌子＋文字（置中） */
function namePlate(
  g: Ctx,
  text: string,
  r: Rect,
  env: RedactEnv,
  colors: { bg: string; fg: string; edge?: string },
) {
  const value = text.trim();
  if (!value) return;
  const px = nameSize(r, env);
  g.save();
  g.font = font(px);
  const tw = Math.min(g.measureText(value).width, r.w * 0.86);
  const w = tw + px * 1.1;
  const h = px * 1.6;
  const x = r.x + (r.w - w) / 2;
  const y = r.y + (r.h - h) / 2;
  g.fillStyle = colors.bg;
  g.beginPath();
  roundRectPath(g, x, y, w, h, h * 0.25);
  g.fill();
  if (colors.edge) {
    g.strokeStyle = colors.edge;
    g.lineWidth = Math.max(1, px * 0.09);
    g.stroke();
  }
  g.fillStyle = colors.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(value, r.x + r.w / 2, y + h / 2 + px * 0.04, tw);
  g.restore();
}

/** 把多邊形加進路徑（新的路徑） */
function tracePolygon(g: Ctx, pts: readonly [number, number][]) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath();
}

/**
 * 黑暗：深色的房間＋大大的「？」與房名。
 * L 形（2026-10-29）：內緣的線照 L 形往內縮（外框縮一圈、缺角的大小不變），「？」與房名放在最大的那一塊（m）。
 */
function paintDark(g: Ctx, f: RedactFrame, box: Rect, r: Rect, env: RedactEnv) {
  const d = f.density / 100;
  g.fillStyle = `rgba(8, 10, 16, ${d.toFixed(3)})`;
  g.fillRect(box.x, box.y, box.w, box.h);
  const lw = Math.max(1, 1.5 * env.u * env.m.k);
  g.strokeStyle = 'rgba(150, 162, 186, 0.28)';
  g.lineWidth = lw;
  const k = maskCutRect(f, box);
  if (k && f.cut) {
    const i = lw * 1.5;
    tracePolygon(
      g,
      lPolygon(
        { x: box.x + i, y: box.y + i, w: box.w - i * 2, h: box.h - i * 2 },
        {
          c: f.cut.c,
          w: k.w,
          h: k.h,
        },
      ),
    );
    g.stroke();
  } else g.strokeRect(box.x + lw * 1.5, box.y + lw * 1.5, box.w - lw * 3, box.h - lw * 3);
  const name = f.label.trim();
  const qs = clamp(Math.min(r.h * (name ? 0.36 : 0.5), r.w * 0.42), 8, 150 * env.u * env.m.k);
  const cx = r.x + r.w / 2;
  g.save();
  g.fillStyle = 'rgba(224, 229, 242, 0.88)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(qs);
  const cy = name ? r.y + r.h * 0.42 : r.y + r.h / 2;
  g.fillText('？', cx, cy);
  if (name) {
    const ns = Math.min(nameSize(r, env), qs * 0.5);
    g.font = font(ns);
    g.fillText(name, cx, cy + qs * 0.58 + ns * 0.55, r.w * 0.9);
  }
  g.restore();
}

/** 禁止進入：深色底＋琥珀色的斜線帶，房名放在中間的牌子上（L 形：最大的那一塊的中間） */
function paintKeepout(g: Ctx, f: RedactFrame, box: Rect, r: Rect, env: RedactEnv) {
  const d = f.density / 100;
  g.fillStyle = `rgba(20, 18, 14, ${(0.85 * d).toFixed(3)})`;
  g.fillRect(box.x, box.y, box.w, box.h);
  const sw = Math.max(6, 12 * env.u) * env.m.k;
  g.fillStyle = rgba(MAP_COLORS.amber, d);
  for (let t = -box.h; t < box.w; t += sw * 2) {
    g.beginPath();
    g.moveTo(box.x + t, box.y + box.h);
    g.lineTo(box.x + t + box.h, box.y);
    g.lineTo(box.x + t + box.h + sw, box.y);
    g.lineTo(box.x + t + sw, box.y + box.h);
    g.closePath();
    g.fill();
  }
  namePlate(g, f.label, r, env, {
    bg: 'rgba(14, 14, 16, 0.92)',
    fg: MAP_COLORS.amber,
    edge: MAP_COLORS.amber,
  });
}

/** 戰爭迷霧：毛玻璃＋冷灰的霧與幾團柔軟的白霧（依框固定）；房名的牌子在 r（L 形：最大的那一塊） */
function paintFog(g: Ctx, f: RedactFrame, box: Rect, r: Rect, env: RedactEnv) {
  const d = f.density / 100;
  paintCrop(g, f, box, env, 'frost');
  g.fillStyle = `rgba(176, 188, 202, ${(0.18 + 0.3 * d).toFixed(3)})`;
  g.fillRect(box.x, box.y, box.w, box.h);
  const seed = seedOf(f.id);
  const base = Math.min(box.w, box.h);
  for (let i = 0; i < 7; i++) {
    const bx = box.x + box.w * hashUnit(seed, i, 1);
    const by = box.y + box.h * hashUnit(seed, i, 2);
    const br = base * (0.3 + 0.45 * hashUnit(seed, i, 3)) + Math.abs(hashSigned(seed, i)) * 2;
    const grad = g.createRadialGradient(bx, by, 0, bx, by, br);
    grad.addColorStop(0, `rgba(255, 255, 255, ${(0.16 + 0.22 * d).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(box.x, box.y, box.w, box.h);
  }
  namePlate(g, f.label, r, env, { bg: 'rgba(240, 244, 248, 0.55)', fg: 'rgba(30, 38, 52, 0.85)' });
}

/**
 * 四種房間遮罩（引擎先剪到蓋住的那一段〔L 形時再剪到 L 形，KIT.redactShape〕、乘上淡出的透明度）。
 * 底色、斜線、霧、馬賽克畫滿外框 r；「？」、房名、房名的牌子放在 L 形裡最大的那一塊（長方形的框就是 r）。
 */
export function paintRoomMask(g: Ctx, f: RedactFrame, r: Rect, env: RedactEnv): void {
  const m = maskMainRect(f, r);
  if (f.style === 'dark') paintDark(g, f, r, m, env);
  else if (f.style === 'keepout') paintKeepout(g, f, r, m, env);
  else if (f.style === 'fog') paintFog(g, f, r, m, env);
  else {
    paintCrop(g, f, r, env, 'mosaic');
    namePlate(g, f.label, m, env, { bg: 'rgba(12, 14, 20, 0.78)', fg: '#ffffff' });
  }
}

/** L 形的房間遮罩：外形加進路徑（引擎剪到這個形狀畫遮罩與邊界演出）；長方形的框不動、回傳 false */
export function roomMaskShape(g: Ctx, f: RedactFrame, r: Rect): boolean {
  if (!f.cut) return false;
  tracePolygon(g, maskPolygon(f, r));
  return true;
}

/* ---------- 區域放大的框 ---------- */

/** 古地圖的毛邊（依 id 固定）：每隔一段往內縮一點，偶爾缺一大口 */
function deckle(g: Ctx, r: Rect, depth: number, step: number, seed: number) {
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
    const n = Math.max(3, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const bite = hashUnit(seed, s * 1000 + i, 7) < 0.1 ? 1.5 : 1;
      const dd = (0.25 + 0.75 * hashUnit(seed, s * 1000 + i, 3)) * depth * bite;
      pts.push([ax + (bx - ax) * t + nx * dd, ay + (by - ay) * t + ny * dd]);
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

/** 戰術面板的外框：切角的矩形 */
function chamferPath(g: Ctx, r: Rect, c: number) {
  g.beginPath();
  g.moveTo(r.x + c, r.y);
  g.lineTo(r.x + r.w - c, r.y);
  g.lineTo(r.x + r.w, r.y + c);
  g.lineTo(r.x + r.w, r.y + r.h - c);
  g.lineTo(r.x + r.w - c, r.y + r.h);
  g.lineTo(r.x + c, r.y + r.h);
  g.lineTo(r.x, r.y + r.h - c);
  g.lineTo(r.x, r.y + c);
  g.closePath();
}

/** 四種框：白框（細的深色內線＋指北的小圓章）、古地圖（毛邊的舊紙、泛黃）、戰術面板（綠色切角發光框＋網格）、只有陰影 */
function paintMapCard(g: Ctx, z: ZoomFrame, env: CardEnv): void {
  const { C, a, b, u, ds, content } = env;
  if (z.style === 'plain') {
    const R = 8 * u;
    const outer = growRect(C, b);
    g.save();
    g.shadowColor = `rgba(0, 0, 0, ${(0.45 * a).toFixed(3)})`;
    g.shadowBlur = 30 * u * a * ds;
    g.shadowOffsetY = 12 * u * a * ds;
    g.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
    g.beginPath();
    roundRectPath(g, outer.x, outer.y, outer.w, outer.h, R + b);
    g.fill();
    g.restore();
    content(() => {
      g.beginPath();
      roundRectPath(g, C.x, C.y, C.w, C.h, R);
    });
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = 'rgba(28, 34, 46, 0.6)';
    g.lineWidth = Math.max(1, 1.2 * u);
    g.beginPath();
    roundRectPath(g, C.x, C.y, C.w, C.h, R);
    g.stroke();
    /* 右上角的指北小圓章 */
    const nr = Math.max(8, 13 * u);
    const nx = outer.x + outer.w - nr * 0.35;
    const ny = outer.y + nr * 0.35;
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(28, 34, 46, 0.75)';
    g.lineWidth = Math.max(1, 1.2 * u);
    g.beginPath();
    g.arc(nx, ny, nr, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.moveTo(nx, ny - nr * 0.72);
    g.lineTo(nx + nr * 0.32, ny);
    g.lineTo(nx - nr * 0.32, ny);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(28, 34, 46, 0.8)';
    g.beginPath();
    g.moveTo(nx, ny + nr * 0.72);
    g.lineTo(nx + nr * 0.32, ny);
    g.lineTo(nx - nr * 0.32, ny);
    g.closePath();
    g.fill();
    g.restore();
    return;
  }
  if (z.style === 'oldmap') {
    const mg = (8 + 2.5 * z.border) * u;
    const paper = growRect(C, mg);
    const seed = seedOf(z.id);
    g.save();
    g.globalAlpha = a;
    g.shadowColor = 'rgba(40, 25, 5, 0.45)';
    g.shadowBlur = 22 * u * ds;
    g.shadowOffsetY = 8 * u * ds;
    const grad = g.createRadialGradient(
      paper.x + paper.w / 2,
      paper.y + paper.h / 2,
      Math.min(paper.w, paper.h) * 0.2,
      paper.x + paper.w / 2,
      paper.y + paper.h / 2,
      Math.max(paper.w, paper.h) * 0.7,
    );
    grad.addColorStop(0, '#f1e3be');
    grad.addColorStop(1, '#cfae74');
    g.fillStyle = grad;
    deckle(g, paper, mg * 0.5, 9 * u, seed);
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(110, 70, 25, 0.55)';
    g.lineWidth = Math.max(1, 2 * u);
    g.stroke();
    g.restore();
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    g.save();
    g.beginPath();
    g.rect(C.x, C.y, C.w, C.h);
    g.clip();
    g.globalAlpha = a;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(232, 206, 150, 0.45)';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.restore();
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = 'rgba(90, 60, 25, 0.55)';
    g.lineWidth = Math.max(1, 1 * u);
    g.strokeRect(C.x, C.y, C.w, C.h);
    g.restore();
    return;
  }
  if (z.style === 'tactical') {
    g.save();
    g.globalAlpha = a;
    g.fillStyle = '#031109';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.restore();
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    g.save();
    g.beginPath();
    g.rect(C.x, C.y, C.w, C.h);
    g.clip();
    g.globalAlpha = a;
    g.fillStyle = 'rgba(70, 255, 160, 0.08)';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.strokeStyle = 'rgba(90, 255, 170, 0.16)';
    g.lineWidth = Math.max(1, 0.8 * u);
    const step = Math.max(12, 28 * u);
    g.beginPath();
    for (let x = C.x + step; x < C.x + C.w; x += step) {
      g.moveTo(x, C.y);
      g.lineTo(x, C.y + C.h);
    }
    for (let y = C.y + step; y < C.y + C.h; y += step) {
      g.moveTo(C.x, y);
      g.lineTo(C.x + C.w, y);
    }
    g.stroke();
    g.restore();
    const c = Math.max(6, 10 * u) + b;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = MAP_COLORS.tactical;
    g.shadowColor = MAP_COLORS.tactical;
    g.shadowBlur = 16 * u * ds;
    g.lineWidth = b;
    chamferPath(g, growRect(C, b / 2), c);
    g.stroke();
    g.shadowBlur = 8 * u * ds;
    g.fillStyle = MAP_COLORS.tactical;
    const bw = Math.max(6, 18 * u);
    g.fillRect(C.x + c, C.y - b * 2.6, bw, Math.max(1.5, b * 0.8));
    g.fillRect(C.x + c + bw * 1.4, C.y - b * 2.6, bw * 0.5, Math.max(1.5, b * 0.8));
    g.restore();
    return;
  }
  paintShadowOnlyCard(g, env);
}

/* ---------- 交給引擎 ---------- */

/** 框上的文字（標籤、房名、「？」）：先等字型 */
export function frameText(frames: readonly Frame[]): string {
  let text = '';
  for (const f of frames) if (f.kind !== 'zoom' && f.label.trim()) text += f.label.trim();
  return frames.some((f) => f.kind === 'redact') ? `${text}？` : text;
}

/** 地圖演出的框：路線・地點（標記）、房間遮罩的四種、區域放大的四種框 */
export const KIT: RenderKit<Frame> = {
  isAction: isActionFrame,
  drawMark: (g, f, r, q, env) => drawRoute(g, f as RouteFrame, r, q, env),
  paintCard: (g, z, env) => paintMapCard(g, z as ZoomFrame, env),
  paintRedact: (g, f: RedactFrameBase, r, env) => {
    paintRoomMask(g, f as RedactFrame, r, env);
    return true;
  },
  redactShape: (g, f: RedactFrameBase, r) => roomMaskShape(g, f as RedactFrame, r),
  fontText: frameText,
};

/** 畫 t 秒的那一格（畫布大小要等於畫面大小） */
export function renderFrame(
  g: Ctx,
  input: FrameInput<MapState>,
  t: number,
  cache: RenderCache,
  opts: RenderOptions = {},
): void {
  renderFxFrame(g, input, t, cache, KIT, opts);
}

/** 畫成一張新的畫布 */
export const renderToCanvas = (
  input: FrameInput<MapState>,
  t: number,
  cache = new RenderCache(),
  opts: RenderOptions = {},
) => renderFxToCanvas(input, t, KIT, cache, opts);
