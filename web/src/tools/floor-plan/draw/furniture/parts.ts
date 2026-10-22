/**
 * 2026-10 第三批（家具擴充）共用的小零件：車輛、人物、管線、斜紋…。
 * 和 kit.ts 一樣：座標是家具自己的（0, 0）～（w, h），單位是格，背面（靠牆的一邊）在上。
 * 顏色只用樣式的家具配色（FurnStyle），所以五種顯示樣式都畫得出來。
 */
import {
  block,
  type Ctx,
  disc,
  type FurnStyle,
  lw,
  oval,
  paint,
  poly,
  rrect,
  seeded,
  seg,
  TAU,
} from './kit';

export type Pt = readonly [number, number];

/** 只描線的圓 */
export function ring(c: Ctx, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, Math.max(0, r), 0, TAU);
  c.stroke();
}

/** 細線（線寬 k 倍）畫完恢復 */
export function thin(c: Ctx, S: FurnStyle, k: number, f: () => void): void {
  c.save();
  lw(c, S, k);
  f();
  c.restore();
}

/** 換線色畫（畫完恢復） */
export function inked(c: Ctx, color: string, f: () => void): void {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  f();
  c.restore();
}

/** 一排直線（x0～x1 每隔 step 一條垂直線） */
export function hatchCols(
  c: Ctx,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  step: number,
): void {
  c.beginPath();
  for (let x = x0 + step; x < x1 - 1e-6; x += step) {
    c.moveTo(x, y0);
    c.lineTo(x, y1);
  }
  c.stroke();
}

/** 多邊形裁到矩形裡（Sutherland–Hodgman；畫斜紋時不必靠 clip，點也不會跑出家具的外框） */
export function clipToRect(
  pts: readonly Pt[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out: Pt[] = [...pts];
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

/** 矩形裡的斜紋（警示條紋：底色＋另一色的斜帶） */
export function hazard(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  a: string,
  b: string,
  step = 0.3,
): void {
  c.save();
  c.fillStyle = a;
  c.fillRect(x, y, w, h);
  c.fillStyle = b;
  for (let d = -h; d < w + h; d += step * 2) {
    const band = clipToRect(
      [
        [x + d, y + h],
        [x + d + step, y + h],
        [x + d + step + h, y],
        [x + d + h, y],
      ],
      x,
      y,
      x + w,
      y + h,
    );
    if (band.length < 3) continue;
    poly(c, band);
    c.fill();
  }
  c.restore();
}

/** 正方形裡的兩組斜線（網格紋），線段裁在正方形裡 */
export function crossHatch(c: Ctx, x: number, y: number, size: number, step: number): void {
  c.beginPath();
  for (let d = step; d < size * 2; d += step) {
    for (const dir of [1, -1]) {
      const seg = clipToRect(
        dir > 0
          ? [
              [x + d - size, y],
              [x + d, y + size],
            ]
          : [
              [x + d, y],
              [x + d - size, y + size],
            ],
        x,
        y,
        x + size,
        y + size,
      );
      if (seg.length < 2) continue;
      c.moveTo(seg[0][0], seg[0][1]);
      c.lineTo(seg[1][0], seg[1][1]);
    }
  }
  c.stroke();
}

/** 粗細漸變的線（觸手、藤蔓、尾巴）：沿著折線，寬度從 w0 變到 w1 */
export function taper(c: Ctx, pts: readonly Pt[], w0: number, w1: number): void {
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(n - 1, i + 1)];
    let dx = bx - ax;
    let dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const half = (w0 + ((w1 - w0) * i) / Math.max(1, n - 1)) / 2;
    left.push([x - dy * half, y + dx * half]);
    right.push([x + dy * half, y - dx * half]);
  }
  poly(c, [...left, ...right.reverse()]);
}

/** 二次曲線取樣成折線（給 taper 用） */
export function curve(a: Pt, ctrl: Pt, b: Pt, n = 10): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1],
    ] as Pt;
  });
}

/** 風扇：圓框＋n 片葉片＋中心 */
export function fan(c: Ctx, S: FurnStyle, cx: number, cy: number, r: number, n = 4): void {
  disc(c, S, cx, cy, r, S.tint);
  c.save();
  c.fillStyle = S.shade;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.35;
    c.beginPath();
    c.moveTo(cx, cy);
    c.quadraticCurveTo(
      cx + Math.cos(a - 0.5) * r * 0.9,
      cy + Math.sin(a - 0.5) * r * 0.9,
      cx + Math.cos(a + 0.15) * r * 0.86,
      cy + Math.sin(a + 0.15) * r * 0.86,
    );
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.restore();
  disc(c, S, cx, cy, r * 0.16, S.ink);
}

/** 圓的格柵（同心圓） */
export function grille(c: Ctx, S: FurnStyle, cx: number, cy: number, r: number, n = 3): void {
  thin(c, S, 0.5, () => {
    for (let i = 1; i <= n; i++) ring(c, cx, cy, (r * i) / (n + 1));
  });
}

/** 螺絲、鉚釘（小實心點） */
export function bolts(c: Ctx, S: FurnStyle, pts: readonly Pt[], r = 0.05): void {
  c.save();
  c.fillStyle = S.ink;
  for (const [x, y] of pts) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** 管子（圓角長條＋亮線） */
export function tube(
  c: Ctx,
  S: FurnStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string = S.tint,
): void {
  block(c, S, x, y, w, h, Math.min(w, h) / 2, fill);
  thin(c, S, 0.45, () => {
    inked(c, S.paper, () => {
      if (w >= h) seg(c, x + h * 0.5, y + h * 0.3, x + w - h * 0.5, y + h * 0.3);
      else seg(c, x + w * 0.3, y + w * 0.5, x + w * 0.3, y + h - w * 0.5);
    });
  });
}

/** 由上往下看的輪胎（深色小圓角矩形） */
export function wheel(c: Ctx, S: FurnStyle, x: number, y: number, w: number, h: number): void {
  c.save();
  c.fillStyle = S.ink;
  rrect(c, x, y, w, h, Math.min(w, h) * 0.3);
  c.fill();
  c.restore();
}

/**
 * 由上往下看的車身：輪胎、車身、前擋風玻璃、車頂、後窗。車頭朝下（y＝h）。
 * `cab`：只有車頭有駕駛艙（貨車類，車頂只畫在前段）。回傳車頂的範圍（畫警示燈、標記用）。
 */
export function carBody(
  c: Ctx,
  S: FurnStyle,
  w: number,
  h: number,
  opts: { fill?: string; roof?: string; cab?: number; rearWindow?: boolean } = {},
): { x: number; y: number; w: number; h: number } {
  const fill = opts.fill ?? S.tint;
  const tw = Math.min(0.32, w * 0.09);
  const th = Math.min(h * 0.13, 1.4);
  for (const y of [h * 0.17, h * 0.72]) {
    wheel(c, S, 0, y, tw + 0.05, th);
    wheel(c, S, w - tw - 0.05, y, tw + 0.05, th);
  }
  block(c, S, tw * 0.5, 0, w - tw, h, Math.min(w * 0.22, 0.9), fill);
  const cab = opts.cab ?? 0;
  const roofTop = cab ? h - cab : h * 0.36;
  const roofBot = cab ? h - cab * 0.38 : h * 0.72;
  /* 前擋風玻璃 */
  poly(c, [
    [w * 0.2, roofBot],
    [w * 0.8, roofBot],
    [w * 0.84, roofBot + h * 0.08],
    [w * 0.16, roofBot + h * 0.08],
  ]);
  paint(c, S.water);
  const roof = { x: w * 0.22, y: roofTop, w: w * 0.56, h: roofBot - roofTop };
  block(c, S, roof.x, roof.y, roof.w, roof.h, 0.12, opts.roof ?? S.paper);
  if (opts.rearWindow !== false && !cab)
    poly(c, [
      [w * 0.22, roofTop],
      [w * 0.78, roofTop],
      [w * 0.74, roofTop - h * 0.06],
      [w * 0.26, roofTop - h * 0.06],
    ]);
  if (opts.rearWindow !== false && !cab) paint(c, S.water);
  /* 後照鏡 */
  for (const x of [tw * 0.5 - 0.12, w - tw * 0.5]) {
    c.save();
    c.fillStyle = fill;
    rrect(c, x, roofBot + h * 0.02, 0.14, 0.24, 0.04);
    c.fill();
    c.stroke();
    c.restore();
  }
  return roof;
}

/** 警示燈列（車頂）：左右兩色 */
export function lightBar(c: Ctx, S: FurnStyle, x: number, y: number, w: number, h: number): void {
  block(c, S, x, y, w, h, h / 2, S.ink);
  c.save();
  c.fillStyle = S.alert;
  rrect(c, x + h * 0.2, y + h * 0.2, w / 2 - h * 0.3, h * 0.6, h * 0.25);
  c.fill();
  c.fillStyle = S.screen;
  rrect(c, x + w / 2 + h * 0.1, y + h * 0.2, w / 2 - h * 0.3, h * 0.6, h * 0.25);
  c.fill();
  c.restore();
}

/* ---------- 人物（由上往下看：肩膀＋頭，臉朝下） ---------- */

export type HeadWear =
  | 'none'
  | 'hair'
  | 'long'
  | 'cap'
  | 'helmet'
  | 'hardhat'
  | 'nurse'
  | 'hood'
  | 'gray'
  | 'beret';

export interface PersonOpts {
  /** 衣服 */
  body: string;
  /** 頭上的東西 */
  head?: HeadWear;
  /** 帽子、頭髮的顏色 */
  hat?: string;
  /** 身體的比例（小孩小一點） */
  scale?: number;
  /** 手臂（左右兩個小圓） */
  arms?: boolean;
  /** 胸前的小標記（警徽、名牌、十字） */
  badge?: string;
}

/** 一個人（中心 cx, cy；寬 rw＝肩寬的一半） */
export function person(
  c: Ctx,
  S: FurnStyle,
  cx: number,
  cy: number,
  rw: number,
  o: PersonOpts,
): void {
  const k = o.scale ?? 1;
  const sw = rw * k;
  const sh = sw * 0.52;
  if (o.arms !== false) {
    disc(c, S, cx - sw * 0.92, cy + sh * 0.35, sw * 0.24, o.body);
    disc(c, S, cx + sw * 0.92, cy + sh * 0.35, sw * 0.24, o.body);
  }
  oval(c, S, cx, cy, sw, sh, o.body);
  if (o.badge) {
    c.save();
    c.fillStyle = o.badge;
    c.beginPath();
    c.arc(cx + sw * 0.42, cy + sh * 0.45, sw * 0.12, 0, TAU);
    c.fill();
    c.restore();
  }
  const hr = sw * 0.46;
  const hy = cy - sh * 0.05;
  const hat = o.hat ?? S.shade;
  const head = o.head ?? 'hair';
  if (head === 'long') oval(c, S, cx, hy - hr * 0.35, hr * 1.12, hr * 1.25, hat);
  if (head === 'hood') {
    c.beginPath();
    c.moveTo(cx - hr * 1.3, hy + hr * 0.5);
    c.quadraticCurveTo(cx - hr * 1.4, hy - hr * 1.7, cx, hy - hr * 1.9);
    c.quadraticCurveTo(cx + hr * 1.4, hy - hr * 1.7, cx + hr * 1.3, hy + hr * 0.5);
    c.closePath();
    paint(c, hat);
  }
  disc(c, S, cx, hy, hr, head === 'hood' ? S.shade : S.cloth);
  switch (head) {
    case 'hair':
    case 'long':
    case 'gray':
      c.beginPath();
      c.arc(cx, hy, hr, Math.PI * 1.02, Math.PI * 1.98);
      c.quadraticCurveTo(cx, hy - hr * 0.2, cx - hr, hy - hr * 0.06);
      paint(c, head === 'gray' ? S.paper : hat);
      break;
    case 'cap':
    case 'beret':
      disc(c, S, cx, hy - hr * 0.1, hr * 0.95, hat);
      if (head === 'cap') {
        c.beginPath();
        c.ellipse(cx, hy + hr * 0.62, hr * 0.7, hr * 0.32, 0, 0, Math.PI);
        paint(c, hat);
      }
      break;
    case 'helmet':
      disc(c, S, cx, hy, hr * 1.12, hat);
      thin(c, S, 0.5, () => ring(c, cx, hy, hr * 0.7));
      break;
    case 'hardhat':
      disc(c, S, cx, hy, hr * 1.08, hat);
      thin(c, S, 0.6, () => seg(c, cx, hy - hr, cx, hy + hr));
      break;
    case 'nurse':
      disc(c, S, cx, hy - hr * 0.15, hr * 0.85, S.paper);
      c.save();
      c.fillStyle = S.alert;
      c.fillRect(cx - hr * 0.08, hy - hr * 0.45, hr * 0.16, hr * 0.5);
      c.fillRect(cx - hr * 0.25, hy - hr * 0.28, hr * 0.5, hr * 0.16);
      c.restore();
      break;
    default:
      break;
  }
  /* 臉朝的方向（下）：小鼻子 */
  if (head !== 'hood') {
    c.save();
    c.fillStyle = S.ink;
    c.beginPath();
    c.arc(cx, hy + hr * 0.82, Math.max(hr * 0.12, 0.025), 0, TAU);
    c.fill();
    c.restore();
  }
}

/** 決定論亂數的別名（新的畫法用） */
export const rand = seeded;

/** 散落的小石頭、碎片（rx、ry 的範圍內 n 個） */
export function rubble(
  c: Ctx,
  S: FurnStyle,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  seed: number,
  size = 0.1,
): void {
  const rnd = seeded(seed);
  for (let i = 0; i < n; i++) {
    const x = cx + (rnd() * 2 - 1) * rx;
    const y = cy + (rnd() * 2 - 1) * ry;
    const s = size * (0.5 + rnd());
    const a = rnd() * TAU;
    poly(
      c,
      Array.from({ length: 5 }, (_, j) => {
        const b = a + (j / 5) * TAU;
        const k = 0.6 + rnd() * 0.4;
        return [x + Math.cos(b) * s * k, y + Math.sin(b) * s * k] as Pt;
      }),
    );
    paint(c, i % 3 ? S.tint : S.shade);
  }
}

/** 文字（家具上的小字，例：站名牌、標誌）；字級 size（格） */
export { word } from './kit';
