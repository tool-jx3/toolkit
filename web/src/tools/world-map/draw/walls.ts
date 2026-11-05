/**
 * 城牆（本站自己的畫法）：從斜上方看的石牆——正面（依方向明暗）、牆頂的走道、垛口、一道石縫，
 * 轉角與每隔一段距離一座圓塔（垛口＋箭窗），依底邊由上往下排，前面的蓋住後面的。
 *
 * - 牆的高＝round(粗細 × 1.75＋3)，底邊在線的下方 0.32、頂在上方 0.68；牆頂的寬＝max(2.2, 粗細 × 0.52)。
 * - 長的牆切成至少 max(42, 全長 ÷ 900) px 一段；塔的間隔 max(76, 全長 ÷ 180) px，相距不到間隔 0.35 倍的塔只留一座
 *   （長城不會畫出幾千座塔）。
 * - 雪原上（積雪量見 model/climate.ts）石頭偏白、牆頂與塔頂積雪。
 *
 * 先排好（planWall：每一段牆、每一座塔），再依底邊的高度畫。
 */
import type { SnowAt } from '../model/climate';
import { clamp, polylineLength } from '../model/geometry';
import type { Pt, ThemeId } from '../model/types';
import { mix, SNOW_WHITE } from './palette';

type Ctx = CanvasRenderingContext2D;

/* ---------- 排法 ---------- */

/** 一段牆（端點、方向、所在的那條邊的長度與這一段的長度） */
interface Span {
  from: Pt;
  to: Pt;
  dx: number;
  dy: number;
  edgeLen: number;
  len: number;
}

interface WallPlan {
  spans: Span[];
  towers: Pt[];
  /** 全長（px） */
  total: number;
}

function planWall(points: readonly Pt[], closed: boolean): WallPlan {
  const line = closed ? [...points, points[0]] : [...points];
  const total = polylineLength(line);
  const spacing = Math.max(76, total / 180);
  const pieceLen = Math.max(42, total / 900);
  const spans: Span[] = [];
  const towers: Pt[] = [];
  const tower = (p: Pt) => {
    const crowded = towers.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < spacing * 0.35);
    if (!crowded) towers.push(p);
  };
  line.forEach((a, k) => {
    const b = line[k + 1];
    if (!b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const edgeLen = Math.hypot(dx, dy);
    if (edgeLen < 1e-6) return;
    const cuts = Math.max(1, Math.ceil(edgeLen / pieceLen));
    const at = (s: number) => ({ x: a.x + (dx * s) / cuts, y: a.y + (dy * s) / cuts });
    for (let s = 0; s < cuts; s++)
      spans.push({ from: at(s), to: at(s + 1), dx, dy, edgeLen, len: edgeLen / cuts });
    /* 這條邊的起點一座，中間每隔 spacing 一座 */
    tower(a);
    const between = Math.floor(edgeLen / spacing);
    for (let t = 1; t <= between; t++) {
      const f = t / (between + 1);
      tower({ x: a.x + dx * f, y: a.y + dy * f });
    }
  });
  if (!closed) tower(line[line.length - 1]);
  return { spans, towers, total };
}

/* ---------- 顏色 ---------- */

const WALL_COLORS = {
  day: {
    ink: '#55452f',
    stone: '#d2bf93',
    shade: '#a28c69',
    top: '#efe0b6',
    dark: '#7a6649',
    slit: '#4f3b2c',
  },
  night: {
    ink: '#2a4240',
    stone: '#b4c4b0',
    shade: '#728f88',
    top: '#dbe5dc',
    dark: '#4a6c67',
    slit: '#33504c',
  },
};
const SECRET_INK = '#6f4a80';

/** 積雪時往白（或灰綠）靠：[顏色, 雪的顏色, 比例] */
const SNOWY = {
  stone: ['#e3e9e1', 0.75],
  shade: ['#a1b3ad', 0.6],
  top: [SNOW_WHITE, 0.9],
  dark: ['#839c95', 0.55],
} as const;

type Stone = { stone: string; shade: string; top: string; dark: string };

function stoneColors(base: Stone, snow: number): Stone {
  if (snow <= 0.01) return { stone: base.stone, shade: base.shade, top: base.top, dark: base.dark };
  const tint = (k: keyof Stone) => mix(base[k], SNOWY[k][0], snow * SNOWY[k][1]);
  return { stone: tint('stone'), shade: tint('shade'), top: tint('top'), dark: tint('dark') };
}

/* ---------- 畫法 ---------- */

/** 依序連起來的形狀（close：接回起點） */
function outline(ctx: Ctx, pts: readonly (readonly [number, number])[], close: boolean): void {
  ctx.beginPath();
  pts.forEach(([x, y], k) => {
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  if (close) ctx.closePath();
}

const solid = (ctx: Ctx) => {
  ctx.fill();
  ctx.stroke();
};

interface Look {
  ink: string;
  slit: string;
  base: Stone;
  /** 粗細（至少 3） */
  w: number;
  /** 牆的高、牆頂在線上方多少、底邊在線下方多少、牆頂的寬 */
  height: number;
  rise: number;
  drop: number;
  thick: number;
  total: number;
}

function drawSpan(ctx: Ctx, s: Span, look: Look, snow: number): void {
  const { from: p, to: q } = s;
  const { rise, drop, thick, height, w } = look;
  const c = stoneColors(look.base, snow);
  const nx = (-s.dy / s.edgeLen) * (thick / 2);
  const ny = (s.dx / s.edgeLen) * (thick / 2);
  const face = mix(
    c.stone,
    c.shade,
    clamp((Math.abs(s.dy) / s.edgeLen) * 0.55 + (s.dx < 0 ? 0.18 : 0), 0, 0.85),
  );
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  /* 落在地上的影子 */
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = look.ink;
  ctx.lineWidth = thick + 3;
  outline(
    ctx,
    [
      [p.x, p.y + drop + 1.8],
      [q.x, q.y + drop + 1.8],
    ],
    false,
  );
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = look.ink;
  /* 牆身（含厚度） */
  ctx.lineWidth = 1;
  ctx.fillStyle = c.dark;
  outline(
    ctx,
    [
      [p.x - nx, p.y + drop - ny],
      [q.x - nx, q.y + drop - ny],
      [q.x + nx, q.y + drop + ny],
      [q.x + nx, q.y - rise + ny],
      [p.x + nx, p.y - rise + ny],
      [p.x - nx, p.y - rise - ny],
    ],
    true,
  );
  solid(ctx);
  /* 正面 */
  ctx.fillStyle = face;
  outline(
    ctx,
    [
      [p.x, p.y + drop],
      [q.x, q.y + drop],
      [q.x, q.y - rise],
      [p.x, p.y - rise],
    ],
    true,
  );
  solid(ctx);
  /* 石縫 */
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 0.6;
  outline(
    ctx,
    [
      [p.x, p.y + drop - height * 0.38],
      [q.x, q.y + drop - height * 0.38],
    ],
    false,
  );
  ctx.stroke();
  ctx.globalAlpha = 1;
  /* 牆頂的走道 */
  ctx.lineWidth = 0.85;
  ctx.fillStyle = c.top;
  outline(
    ctx,
    [
      [p.x - nx, p.y - rise - ny],
      [q.x - nx, q.y - rise - ny],
      [q.x + nx, q.y - rise + ny],
      [p.x + nx, p.y - rise + ny],
    ],
    true,
  );
  solid(ctx);
  /* 垛口：沿著牆頂前緣一個個小方塊 */
  const count = Math.floor(s.len / Math.max(6, w * 1.4, look.total / 5000));
  const tall = Math.max(2.2, w * 0.45);
  ctx.fillStyle = snow > 0.25 ? c.top : face;
  const edgeAt = (t: number): [number, number] => [
    p.x + nx + (q.x - p.x) * t,
    p.y - rise + ny + (q.y - p.y) * t,
  ];
  for (let m = 0; m < count; m++) {
    const t0 = (m + 0.25) / count;
    const [x0, y0] = edgeAt(t0);
    const [x1, y1] = edgeAt(Math.min(0.95, t0 + 0.5 / count));
    outline(
      ctx,
      [
        [x0, y0],
        [x1, y1],
        [x1, y1 - tall],
        [x0, y0 - tall],
      ],
      true,
    );
    solid(ctx);
  }
  ctx.restore();
}

function drawTower(ctx: Ctx, p: Pt, look: Look, snow: number): void {
  const c = stoneColors(look.base, snow);
  const width = Math.max(7, Math.round(look.w * 1.55 + 2.5));
  const tall = Math.round(look.height * 1.32 + 3);
  const r = width / 2;
  const foot = look.drop + 1.2;
  const crown = foot - tall;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = look.ink;
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = look.ink;
  ctx.beginPath();
  ctx.ellipse(0, foot + 1, r * 1.25, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  /* 圓柱 */
  ctx.lineWidth = 1.05;
  ctx.fillStyle = c.stone;
  ctx.beginPath();
  ctx.moveTo(-r, crown);
  ctx.lineTo(-r, foot);
  ctx.ellipse(0, foot, r, r * 0.38, 0, Math.PI, 0, true);
  ctx.lineTo(r, crown);
  ctx.closePath();
  solid(ctx);
  ctx.fillStyle = c.shade;
  ctx.beginPath();
  ctx.moveTo(r * 0.2, crown);
  ctx.lineTo(r, crown);
  ctx.lineTo(r, foot);
  ctx.ellipse(0, foot, r, r * 0.38, 0, 0, Math.PI * 0.42);
  ctx.closePath();
  ctx.fill();
  /* 塔頂：一圈平台＋三個垛 */
  ctx.fillStyle = c.top;
  ctx.beginPath();
  ctx.ellipse(0, crown, r * 1.12, r * 0.42, 0, 0, Math.PI * 2);
  solid(ctx);
  const mw = r * 0.5;
  const mh = Math.max(2.4, r * 0.55);
  ctx.fillStyle = snow > 0.25 ? c.top : c.stone;
  for (const mx of [-r * 0.95, -mw / 2, r * 0.95 - mw]) {
    ctx.beginPath();
    ctx.rect(mx, crown - mh + r * 0.18, mw, mh);
    solid(ctx);
  }
  if (snow > 0.05) {
    ctx.globalAlpha = snow;
    ctx.fillStyle = SNOW_WHITE;
    ctx.beginPath();
    ctx.ellipse(0, crown - mh + r * 0.18, r * 1.05, 1.2 + snow * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  /* 箭窗 */
  ctx.fillStyle = look.slit;
  ctx.fillRect(-r * 0.16, crown + tall * 0.3, r * 0.32, Math.max(3.5, tall * 0.24));
  ctx.restore();
}

export function drawWall(
  ctx: Ctx,
  points: readonly Pt[],
  closed: boolean,
  width: number,
  theme: ThemeId,
  secret: boolean,
  snowAt: SnowAt | null,
): void {
  if (points.length < (closed ? 3 : 2)) return;
  const plan = planWall(points, closed);
  const palette = theme === 'night' ? WALL_COLORS.night : WALL_COLORS.day;
  const w = Math.max(3, width);
  const height = Math.round(w * 1.75 + 3);
  const look: Look = {
    ink: secret ? SECRET_INK : palette.ink,
    slit: palette.slit,
    base: palette,
    w,
    height,
    rise: height * 0.68,
    drop: height * 0.32,
    thick: Math.max(2.2, w * 0.52),
    total: plan.total,
  };
  const snowAtPt = (x: number, y: number) => (snowAt ? snowAt(x, y) : 0);
  /* 由上往下畫：牆段以較低的端點、塔以底邊為準（同樣高時牆段在前） */
  const queue = [
    ...plan.spans.map((s) => ({
      y: Math.max(s.from.y, s.to.y),
      draw: () =>
        drawSpan(ctx, s, look, snowAtPt((s.from.x + s.to.x) / 2, (s.from.y + s.to.y) / 2)),
    })),
    ...plan.towers.map((p) => ({
      y: p.y + 1.5,
      draw: () => drawTower(ctx, p, look, snowAtPt(p.x, p.y)),
    })),
  ];
  queue.sort((a, b) => a.y - b.y);
  for (const item of queue) item.draw();
}
