/**
 * 外框的畫法（純繪圖，不碰 DOM）：
 * - 浮雕環 16 種：token-workshop（MIT）的程式畫的環形外框，顏色依光照方向做成金屬般的漸層，有內側陰影；
 * - 霓虹與幾何 12 種：eidolon-ui（MIT）的外框，主色加選填的配色細節，形狀可以是圓、方、多邊形。
 * 兩組共用同一套「主色填色」（光照強度 0 就是平塗），所以每一種外框都可以配任何顏色、光照與質感。
 *
 * 每種外框定義：所屬的組、開口（圖片被剪成的形狀）的形狀與位置（從外緣往內算，外框寬的比例）、
 * 有沒有用到第二色、樣式參數（數量、深度、線寬）的名稱與範圍，以及畫法。
 */
import type { FrameId } from './model';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Fill = string | CanvasGradient;

export type ShapeId = 'circle' | 'square' | 'box' | 'clip' | 'hex' | 'octa' | 'diamond';

export interface Light {
  /** 光從哪個方向來（弧度：0 右、π／2 下） */
  angle: number;
  /** 強度（0＝平塗，1＝原作的預設） */
  strength: number;
}

/** 畫一種外框需要的東西 */
export interface FrameKit {
  ctx: Ctx2D;
  /** 中心 */
  c: number;
  /** 外半徑、外框寬、內半徑（R − w）、中線半徑（R − w／2） */
  R: number;
  w: number;
  ri: number;
  rm: number;
  /** 細線的單位（N ÷ 512） */
  u: number;
  /** 樣式參數：數量、深度（0～1）、線寬（外框寬的比例） */
  n: number;
  d: number;
  lw: number;
  /** 主色、第二色（色碼） */
  col: string;
  acc: string;
  /** 主色的填色（依光照的漸層；平塗時就是色碼） */
  fill: Fill;
  /** 第二色的填色；霓虹與幾何的樣式關掉配色細節時是 null（不畫） */
  accFill: Fill | null;
  light: Light;
}

export interface FrameParam {
  /** 參數名稱的 key（strings.ts 的 S.param） */
  label: string;
  min: number;
  max: number;
  def: number;
}

export interface FrameDef {
  id: FrameId;
  group: 'relief' | 'neon';
  shape: ShapeId;
  /** 開口在外緣往內幾個外框寬的地方（圖片剪到這裡、背景也只填到這裡） */
  cut: number;
  /** 第二色：always＝一定用、optional＝打開配色細節才畫、none＝沒有 */
  accent: 'always' | 'optional' | 'none';
  count?: FrameParam;
  depth?: FrameParam;
  lineW?: FrameParam;
  draw(k: FrameKit): void;
}

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ---------- 顏色 ---------- */

function hexRgb(h: string): [number, number, number] {
  let s = h.replace('#', '');
  if (s.length === 3) s = [...s].map((x) => x + x).join('');
  const n = Number.parseInt(s.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 兩個色碼混色（t＝0 是 a、1 是 b） */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return `#${A.map((v, i) =>
    Math.round(v + (B[i] - v) * t)
      .toString(16)
      .padStart(2, '0'),
  ).join('')}`;
}

/** 金屬漸層的五個色標（亮、本色、暗、次亮、最暗）；強度 0 時全部是本色 */
export function metalStops(base: string, strength: number): string[] {
  const m = (to: string, x: number) => mixHex(base, to, clamp01(x * strength));
  return [m('#ffffff', 0.72), base, m('#000000', 0.5), m('#ffffff', 0.28), m('#000000', 0.62)];
}

/** 主色的填色：沿光照方向的線性漸層（亮的一邊朝光） */
export function litFill(ctx: Ctx2D, c: number, R: number, base: string, light: Light): Fill {
  if (light.strength <= 0) return base;
  const dx = Math.cos(light.angle) * R;
  const dy = Math.sin(light.angle) * R;
  const g = ctx.createLinearGradient(c + dx, c + dy, c - dx, c - dy);
  const st = metalStops(base, light.strength);
  st.forEach((s, i) => {
    g.addColorStop(i / (st.length - 1), s);
  });
  return g;
}

const pol = (c: number, a: number, r: number): [number, number] => [
  c + Math.cos(a) * r,
  c + Math.sin(a) * r,
];

/* ---------- 浮雕環的零件 ---------- */

/** 以極座標的半徑函式畫一圈封閉的路徑 */
function polar(ctx: Ctx2D, c: number, fn: (t: number) => number, steps = 720): void {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU;
    const r = fn(t);
    const x = c + Math.cos(t) * r;
    const y = c + Math.sin(t) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function polarArc(
  ctx: Ctx2D,
  c: number,
  fn: (t: number) => number,
  t0: number,
  t1: number,
  steps = 80,
): void {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const r = fn(t);
    const x = c + Math.cos(t) * r;
    const y = c + Math.sin(t) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
}

/** 外緣（半徑函式）到內圓之間的環 */
function annulus(
  ctx: Ctx2D,
  c: number,
  outer: (t: number) => number,
  ri: number,
  fill: Fill,
): void {
  polar(ctx, c, outer);
  ctx.moveTo(c + ri, c);
  ctx.arc(c, c, ri, 0, TAU, true);
  ctx.fillStyle = fill;
  ctx.fill('evenodd');
}

function clipBand(ctx: Ctx2D, c: number, R: number, ri: number): void {
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.moveTo(c + ri, c);
  ctx.arc(c, c, ri, 0, TAU, true);
  ctx.clip('evenodd');
}

function ringStroke(ctx: Ctx2D, c: number, r: number, width: number, style: Fill): void {
  ctx.beginPath();
  ctx.arc(c, c, Math.max(0, r), 0, TAU);
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke();
}

/** 從光的方向打過來的白色高光 */
function lightSheen(k: FrameKit, a0: number, a1: number): Fill {
  const { ctx, c, R, light } = k;
  const [x, y] = pol(c, light.angle, R);
  const [x2, y2] = pol(c, light.angle + Math.PI, R);
  const g = ctx.createLinearGradient(x, y, x2, y2);
  const q = (a: number) => `rgba(255,255,255,${Math.min(1, a * light.strength)})`;
  g.addColorStop(0, q(a0));
  g.addColorStop(0.5, q(a1));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  return g;
}

/** 內緣往內的陰影（畫在開口裡，圖片的邊緣看起來陷進外框下面） */
function innerShadow(k: FrameKit): void {
  const { ctx, c, ri, R } = k;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, ri, 0, TAU);
  ctx.clip();
  const g = ctx.createRadialGradient(c, c, ri * 0.9, c, c, ri);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.38)');
  ctx.fillStyle = g;
  ctx.fillRect(c - R, c - R, R * 2, R * 2);
  ctx.restore();
}

/** 外緣與內緣的細線＋內側陰影 */
function rims(k: FrameKit, outer?: (t: number) => number): void {
  const { ctx, c, R, ri } = k;
  const lw = Math.max(1, R * 0.007);
  if (outer) {
    polar(ctx, c, outer);
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.stroke();
  } else ringStroke(ctx, c, R - lw / 2, lw, 'rgba(0,0,0,.5)');
  ringStroke(ctx, c, ri, lw, 'rgba(0,0,0,.55)');
  innerShadow(k);
}

/** 單純的環的斜面：外緣高光、中間的溝 */
function bevel(k: FrameKit): void {
  const { ctx, c, R, ri, w } = k;
  const lw = Math.max(1, R * 0.007);
  ringStroke(ctx, c, R - lw / 2, lw, 'rgba(0,0,0,.5)');
  ringStroke(ctx, c, R - w * 0.1, w * 0.1, lightSheen(k, 0.75, 0.05));
  ringStroke(ctx, c, (R + ri) / 2, w * 0.035, 'rgba(0,0,0,.35)');
  ringStroke(ctx, c, (R + ri) / 2 + w * 0.04, w * 0.025, 'rgba(255,255,255,.28)');
  ringStroke(ctx, c, ri, lw, 'rgba(0,0,0,.6)');
  innerShadow(k);
}

/** 有光照的小圓球（鉚釘） */
function sphere(ctx: Ctx2D, x: number, y: number, r: number, col: string, light: Light): void {
  const g = ctx.createRadialGradient(
    x + Math.cos(light.angle) * r * 0.35,
    y + Math.sin(light.angle) * r * 0.35,
    r * 0.1,
    x,
    y,
    r,
  );
  g.addColorStop(0, mixHex(col, '#ffffff', 0.75));
  g.addColorStop(0.55, col);
  g.addColorStop(1, mixHex(col, '#000000', 0.6));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, r * 0.07);
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.stroke();
}

/** 決定性的雜湊（0～1）：火焰的長短與質感的雜訊用 */
export function hash3(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const lit = (k: FrameKit, base: string): Fill => litFill(k.ctx, k.c, k.R, base, k.light);

/* ---------- 霓虹與幾何的零件 ---------- */

const POLY: Partial<Record<ShapeId, { n: number; a0: number }>> = {
  hex: { n: 6, a0: -Math.PI / 2 },
  octa: { n: 8, a0: -Math.PI / 2 + Math.PI / 8 },
  diamond: { n: 4, a0: -Math.PI / 2 },
};

function polyPoints(n: number, a0: number, c: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * TAU) / n;
    out.push([c + r * Math.cos(a), c + r * Math.sin(a)]);
  }
  return out;
}

/**
 * 把形狀（外半徑 r、往內縮 d px）的外框線加進目前的路徑（不 beginPath：兩次＋evenodd 就是一圈）。
 * 開口、光暈的內外分界也用這個。
 */
export function shapePath(ctx: Ctx2D, shape: ShapeId, c: number, r: number, d = 0): void {
  if (shape === 'square') {
    const h = r - d;
    const k = Math.max(0, r * 0.1 - d * 0.6);
    ctx.moveTo(c - h + k, c - h);
    ctx.arcTo(c + h, c - h, c + h, c + h, k);
    ctx.arcTo(c + h, c + h, c - h, c + h, k);
    ctx.arcTo(c - h, c + h, c - h, c - h, k);
    ctx.arcTo(c - h, c - h, c + h, c - h, k);
    ctx.closePath();
  } else if (shape === 'box') {
    const h = r - d;
    ctx.moveTo(c - h, c - h);
    ctx.lineTo(c + h, c - h);
    ctx.lineTo(c + h, c + h);
    ctx.lineTo(c - h, c + h);
    ctx.closePath();
  } else if (shape === 'clip') {
    const h = r - d;
    const k = Math.max(0, r * 0.34 - d * (Math.SQRT2 - 1));
    ctx.moveTo(c - h + k, c - h);
    ctx.lineTo(c + h, c - h);
    ctx.lineTo(c + h, c + h - k);
    ctx.lineTo(c + h - k, c + h);
    ctx.lineTo(c - h, c + h);
    ctx.lineTo(c - h, c - h + k);
    ctx.closePath();
  } else if (POLY[shape]) {
    const p = POLY[shape] as { n: number; a0: number };
    const pts = polyPoints(p.n, p.a0, c, r - d / Math.cos(Math.PI / p.n));
    pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  } else {
    const rr = Math.max(0, r - d);
    ctx.moveTo(c + rr, c);
    ctx.arc(c, c, rr, 0, TAU);
    ctx.closePath();
  }
}

/** 形狀往內 d0～d1 之間的一圈 */
function band(k: FrameKit, shape: ShapeId, d0: number, d1: number, fill: Fill | null): void {
  if (!fill) return;
  const { ctx, c, R } = k;
  ctx.fillStyle = fill;
  ctx.beginPath();
  shapePath(ctx, shape, c, R, d0);
  shapePath(ctx, shape, c, R, d1);
  ctx.fill('evenodd');
}

/** 圓弧（角度：0＝正上方、順時針，度） */
function arcDeg(
  k: FrameKit,
  r: number,
  a0: number,
  a1: number,
  width: number,
  style: Fill | null,
): void {
  if (!style) return;
  const { ctx, c } = k;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(c, c, r, ((a0 - 90) * Math.PI) / 180, ((a1 - 90) * Math.PI) / 180);
  ctx.stroke();
}

function dot(ctx: Ctx2D, x: number, y: number, r: number, fill: Fill | null): void {
  if (!fill) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** 角落的 L 形（轉角在 (x, y)，兩臂往 (sx, sy) 的方向） */
function bracket(
  ctx: Ctx2D,
  x: number,
  y: number,
  sx: number,
  sy: number,
  len: number,
  width: number,
  style: Fill | null,
): void {
  if (!style) return;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x + sx * len, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + sy * len);
  ctx.stroke();
}

/** 多邊形每個角往內的 V 形（內縮 d 的線上，兩臂長＝邊長 × f） */
function polyCorners(
  k: FrameKit,
  shape: ShapeId,
  d: number,
  f: number,
  width: number,
  style: Fill | null,
): void {
  if (!style) return;
  const p = POLY[shape] as { n: number; a0: number };
  const { ctx, c, R } = k;
  const pts = polyPoints(p.n, p.a0, c, R - d / Math.cos(Math.PI / p.n));
  const n = pts.length;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const [px, py] = pts[(i + n - 1) % n];
    const [nx, ny] = pts[(i + 1) % n];
    ctx.moveTo(x + (px - x) * f, y + (py - y) * f);
    ctx.lineTo(x, y);
    ctx.lineTo(x + (nx - x) * f, y + (ny - y) * f);
  });
  ctx.stroke();
}

const hair = (k: FrameKit) => Math.max(1, k.u * 2.2);
const GLITCH_RED = '#ff003c';

/* ---------- 外框定義 ---------- */

const RELIEF_CUT = 0.7;
const NEON_CUT = 0.5;

const relief = (
  id: FrameId,
  def: Omit<FrameDef, 'id' | 'group' | 'shape' | 'cut' | 'accent'> & {
    accent?: FrameDef['accent'];
  },
): FrameDef => ({ id, group: 'relief', shape: 'circle', cut: RELIEF_CUT, accent: 'none', ...def });

const neon = (
  id: FrameId,
  shape: ShapeId,
  draw: (k: FrameKit) => void,
  cut = NEON_CUT,
): FrameDef => ({ id, group: 'neon', shape, cut, accent: 'optional', draw });

export const FRAMES: Record<FrameId, FrameDef> = {
  /* ----- 浮雕環 ----- */
  plain: relief('plain', {
    draw(k) {
      annulus(k.ctx, k.c, () => k.R, k.ri, k.fill);
      bevel(k);
    },
  }),
  gear: relief('gear', {
    count: { label: 'teeth', min: 6, max: 60, def: 24 },
    depth: { label: 'toothDepth', min: 0, max: 100, def: 55 },
    draw(k) {
      const { R, w, n, d } = k;
      const f = (t: number) => R - w * d * 0.9 * (1 - clamp01(0.5 + Math.sin(n * t) * 1.5));
      annulus(k.ctx, k.c, f, k.ri, k.fill);
      rims(k, f);
    },
  }),
  scallop: relief('scallop', {
    count: { label: 'scallops', min: 6, max: 48, def: 18 },
    depth: { label: 'scallopDepth', min: 0, max: 100, def: 60 },
    draw(k) {
      const { R, w, n, d } = k;
      const f = (t: number) => R - w * d * 0.75 * (1 - Math.abs(Math.sin((n * t) / 2)));
      annulus(k.ctx, k.c, f, k.ri, k.fill);
      rims(k, f);
    },
  }),
  facet: relief('facet', {
    count: { label: 'sides', min: 3, max: 16, def: 8 },
    depth: { label: 'bevel', min: 0, max: 100, def: 50 },
    draw(k) {
      const { ctx, c, R, ri, n, d } = k;
      const s = TAU / n;
      const f = (t: number) => {
        const x = (((t % s) + s) % s) - s / 2;
        return (R * Math.cos(Math.PI / n)) / Math.cos(x);
      };
      annulus(ctx, c, f, ri, k.fill);
      ctx.save();
      clipBand(ctx, c, R, ri);
      for (let i = 0; i < n; i++) {
        const t0 = i * s;
        const t1 = t0 + s;
        polarArc(ctx, c, f, t0, t1, 6);
        ctx.arc(c, c, ri, t1, t0, true);
        ctx.closePath();
        ctx.fillStyle =
          i % 2 ? `rgba(255,255,255,${0.08 + 0.2 * d})` : `rgba(0,0,0,${0.06 + 0.18 * d})`;
        ctx.fill();
      }
      ctx.restore();
      rims(k, f);
    },
  }),
  segments: relief('segments', {
    accent: 'always',
    count: { label: 'segments', min: 4, max: 48, def: 16 },
    draw(k) {
      const { ctx, c, R, ri, n } = k;
      const g1 = k.fill;
      const g2 = lit(k, k.acc);
      for (let i = 0; i < n; i++) {
        const a0 = (i * TAU) / n;
        const a1 = ((i + 1) * TAU) / n;
        ctx.beginPath();
        ctx.arc(c, c, R, a0, a1);
        ctx.arc(c, c, ri, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? g2 : g1;
        ctx.fill();
        ctx.lineWidth = Math.max(0.6, R * 0.004);
        ctx.strokeStyle = 'rgba(0,0,0,.4)';
        ctx.stroke();
      }
      rims(k);
    },
  }),
  rope: relief('rope', {
    count: { label: 'strands', min: 12, max: 90, def: 44 },
    depth: { label: 'twist', min: 0, max: 100, def: 50 },
    draw(k) {
      const { ctx, c, R, w, ri, n, d, col } = k;
      ctx.save();
      clipBand(ctx, c, R, ri);
      ctx.fillStyle = mixHex(col, '#000000', 0.6);
      ctx.fillRect(c - R, c - R, R * 2, R * 2);
      const skew = 0.1 + d * 0.5;
      const sw = ((TAU * (ri + w / 2)) / n) * 0.7;
      ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n;
        const a2 = a + skew;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * (ri - w * 0.2), c + Math.sin(a) * (ri - w * 0.2));
        ctx.lineTo(c + Math.cos(a2) * (R + w * 0.2), c + Math.sin(a2) * (R + w * 0.2));
        ctx.lineWidth = sw;
        ctx.strokeStyle = i % 2 ? mixHex(col, '#000000', 0.25) : col;
        ctx.stroke();
        ctx.lineWidth = sw * 0.25;
        ctx.strokeStyle = mixHex(col, '#ffffff', 0.5);
        ctx.stroke();
      }
      ctx.restore();
      rims(k);
    },
  }),
  chain: relief('chain', {
    accent: 'always',
    count: { label: 'links', min: 12, max: 44, def: 28 },
    depth: { label: 'linkThickness', min: 0, max: 100, def: 50 },
    draw(k) {
      const { ctx, c, w, ri, rm, R, d, col, acc, light } = k;
      const n = Math.max(4, Math.round(k.n / 2) * 2);
      const s = (TAU * rm) / n;
      const hw = w * 0.36;
      const th = w * (0.12 + 0.14 * d);
      const half = s * 0.98;
      annulus(ctx, c, () => R, ri, mixHex(acc, '#000000', 0.5));
      const linkFill = (i: number, rad: number) => {
        const a = light.angle - ((i * TAU) / n + Math.PI / 2);
        const dx = Math.cos(a) * rad;
        const dy = Math.sin(a) * rad;
        const g = ctx.createLinearGradient(dx, dy, -dx, -dy);
        const st = metalStops(col, light.strength);
        st.forEach((q, j) => {
          g.addColorStop(j / (st.length - 1), q);
        });
        return g;
      };
      const at = (i: number, fn: () => void) => {
        const [x, y] = pol(c, (i * TAU) / n, rm);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((i * TAU) / n + Math.PI / 2);
        fn();
        ctx.restore();
      };
      const face = (i: number) => {
        ctx.beginPath();
        ctx.roundRect(-half, -hw, half * 2, hw * 2, hw);
        ctx.lineJoin = 'round';
        ctx.lineWidth = th * 1.45;
        ctx.strokeStyle = 'rgba(0,0,0,.72)';
        ctx.stroke();
        ctx.lineWidth = th;
        ctx.strokeStyle = linkFill(i, hw + th);
        ctx.stroke();
      };
      const edge = (i: number) => {
        const eh = th * 1.05;
        const el = s * 0.8;
        ctx.beginPath();
        ctx.roundRect(-el, -eh, el * 2, eh * 2, eh);
        ctx.fillStyle = linkFill(i, eh * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1, th * 0.28);
        ctx.strokeStyle = 'rgba(0,0,0,.72)';
        ctx.stroke();
      };
      for (let i = 1; i < n; i += 2) at(i, () => edge(i));
      for (let i = 0; i < n; i += 2) at(i, () => face(i));
      /* 側面的環再蓋回半邊，看起來一環扣一環 */
      for (let i = 1; i < n; i += 2)
        at(i, () => {
          ctx.beginPath();
          ctx.rect(0, -hw * 2, s * 2, hw * 4);
          ctx.clip();
          edge(i);
        });
      rims(k);
    },
  }),
  braid: relief('braid', {
    accent: 'always',
    count: { label: 'weaves', min: 3, max: 24, def: 10 },
    depth: { label: 'waveHeight', min: 0, max: 100, def: 60 },
    draw(k) {
      const { ctx, c, R, w, ri, rm, n, d, acc } = k;
      annulus(ctx, c, () => R, ri, acc);
      const A = w * (0.14 + 0.2 * d);
      const sw = w * 0.3;
      const f1 = (t: number) => rm + A * Math.sin(n * t);
      const f2 = (t: number) => rm - A * Math.sin(n * t);
      const strand = (fn: (t: number) => number, t0: number, t1: number) => {
        polarArc(ctx, c, fn, t0, t1, t1 - t0 > 6 ? 900 : 60);
        ctx.lineCap = 'butt';
        ctx.lineWidth = sw * 1.35;
        ctx.strokeStyle = 'rgba(0,0,0,.65)';
        ctx.stroke();
        ctx.lineWidth = sw;
        ctx.strokeStyle = k.fill;
        ctx.stroke();
      };
      strand(f1, 0, TAU);
      strand(f2, 0, TAU);
      /* 一條在上、一條在下交錯：把第一條的每隔一段再畫一次 */
      for (let j = 0; j < n; j++)
        strand(f1, (-Math.PI / 2 + j * TAU) / n, (Math.PI / 2 + j * TAU) / n);
      rims(k);
    },
  }),
  moire: relief('moire', {
    accent: 'always',
    count: { label: 'waves', min: 2, max: 30, def: 9 },
    depth: { label: 'waveHeight', min: 0, max: 100, def: 50 },
    lineW: { label: 'lineWidth', min: 2, max: 16, def: 6 },
    draw(k) {
      const { ctx, c, R, w, ri, rm, n, d, col, acc, lw } = k;
      annulus(ctx, c, () => R, ri, acc);
      const A = w * (0.06 + 0.2 * d);
      const lane = w * 0.2;
      const tw = Math.max(1.2, w * lw);
      ctx.save();
      clipBand(ctx, c, R, ri);
      const tints = [mixHex(col, '#ffffff', 0.45), col, mixHex(col, '#000000', 0.2)];
      [-1, 0, 1].forEach((o, j) => {
        polar(ctx, c, (t) => rm + o * lane + A * Math.sin((n + j * 2) * t + j * 2.1), 900);
        ctx.lineWidth = tw + Math.max(1, w * 0.03);
        ctx.strokeStyle = 'rgba(0,0,0,.4)';
        ctx.stroke();
        ctx.lineWidth = tw;
        ctx.strokeStyle = tints[j];
        ctx.stroke();
      });
      ctx.restore();
      rims(k);
    },
  }),
  studs: relief('studs', {
    accent: 'always',
    count: { label: 'studs', min: 6, max: 40, def: 16 },
    depth: { label: 'studSize', min: 0, max: 100, def: 50 },
    draw(k) {
      const { ctx, c, R, w, ri, rm, n, d, col, acc, light } = k;
      annulus(ctx, c, () => R, ri, acc);
      ringStroke(ctx, c, rm, w * 0.8, k.fill);
      const r = Math.min(w * (0.16 + 0.18 * d), ((Math.PI * rm) / n) * 0.8);
      for (let i = 0; i < n; i++) {
        const [x, y] = pol(c, ((i + 0.5) * TAU) / n, rm);
        ctx.beginPath();
        ctx.arc(x + r * 0.12, y + r * 0.2, r * 1.08, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.fill();
        sphere(ctx, x, y, r, col, light);
      }
      rims(k);
    },
  }),
  gems: relief('gems', {
    accent: 'always',
    count: { label: 'gems', min: 4, max: 30, def: 12 },
    depth: { label: 'gemSize', min: 0, max: 100, def: 50 },
    draw(k) {
      const { ctx, c, R, w, rm, n, d, acc } = k;
      annulus(ctx, c, () => R, k.ri, k.fill);
      bevel(k);
      const r = Math.min(w * (0.3 + 0.22 * d), ((Math.PI * rm) / n) * 0.85);
      for (let i = 0; i < n; i++) {
        const [x, y] = pol(c, ((i + 0.5) * TAU) / n, rm);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((i + 0.5) * TAU) / n);
        const gr = ctx.createLinearGradient(-r, -r, r, r);
        gr.addColorStop(0, mixHex(acc, '#ffffff', 0.8));
        gr.addColorStop(0.5, acc);
        gr.addColorStop(1, mixHex(acc, '#000000', 0.55));
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(0, r * 0.85);
        ctx.lineTo(-r, 0);
        ctx.lineTo(0, -r * 0.85);
        ctx.closePath();
        ctx.lineWidth = r * 0.4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.stroke();
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.lineWidth = Math.max(0.6, r * 0.06);
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.moveTo(0, -r * 0.85);
        ctx.lineTo(0, r * 0.85);
        ctx.stroke();
        ctx.restore();
      }
    },
  }),
  thorns: relief('thorns', {
    count: { label: 'spikes', min: 6, max: 48, def: 20 },
    depth: { label: 'spikeLength', min: 0, max: 100, def: 60 },
    draw(k) {
      const { ctx, c, R, w, ri, n, d } = k;
      const rb = ri + Math.max(0.3 * w, w * (1 - 0.75 * d));
      annulus(ctx, c, () => rb, ri, k.fill);
      const h = Math.PI / n;
      for (let i = 0; i < n; i++) {
        const a = ((i + 0.5) * TAU) / n;
        ctx.beginPath();
        ctx.moveTo(...pol(c, a - h, rb - 1));
        ctx.lineTo(...pol(c, a, R));
        ctx.lineTo(...pol(c, a + h, rb - 1));
        ctx.closePath();
        ctx.fillStyle = k.fill;
        ctx.fill();
        ctx.lineWidth = Math.max(0.6, R * 0.004);
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.stroke();
      }
      ringStroke(ctx, c, ri, Math.max(1, R * 0.007), 'rgba(0,0,0,.6)');
      innerShadow(k);
    },
  }),
  flames: relief('flames', {
    count: { label: 'flames', min: 5, max: 30, def: 16 },
    depth: { label: 'flameHeight', min: 0, max: 100, def: 60 },
    draw(k) {
      const { ctx, c, R, w, ri, n, d, col } = k;
      annulus(ctx, c, () => ri + w * 0.3, ri, k.fill);
      const tongue = (H: number, L: number, b: number) => {
        ctx.moveTo(0, -b);
        ctx.bezierCurveTo(H * 0.3, -b * 1.35, H * 0.6, -b * 0.6 + L * 0.2, H, L);
        ctx.bezierCurveTo(H * 0.72, b * 0.05 + L * 0.55, H * 0.4, b * 1.45, 0, b);
        ctx.closePath();
      };
      /* 大小兩排火舌；三層（外、中、芯）依序縮小變亮 */
      const layer = (sx: number, sy: number) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++)
          for (const small of [1, 0]) {
            const r = hash3(i * 2 + small, 3, 11);
            const ang = ((i + (small ? 0 : 0.5)) * TAU) / n;
            const [px, py] = pol(c, ang, ri + w * 0.12);
            const H = w * 0.88 * (0.5 + 0.5 * d) * (0.75 + 0.25 * r) * (small ? 0.55 : 1);
            const L = H * (0.2 + 0.3 * r);
            const bw = Math.min(((Math.PI * ri) / n) * 0.9, H * 0.3);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(ang);
            ctx.scale(sx, sy);
            tongue(H, L, bw);
            ctx.restore();
          }
      };
      layer(1, 1);
      ctx.fillStyle = k.fill;
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, R * 0.005);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.stroke();
      layer(0.7, 0.62);
      ctx.fillStyle = lit(k, mixHex(col, '#ffe9a8', 0.45));
      ctx.fill();
      layer(0.42, 0.36);
      ctx.fillStyle = lit(k, mixHex(col, '#ffffff', 0.78));
      ctx.fill();
      ringStroke(ctx, c, ri, Math.max(1, R * 0.007), 'rgba(0,0,0,.6)');
      innerShadow(k);
    },
  }),
  tally: relief('tally', {
    accent: 'always',
    count: { label: 'ticks', min: 12, max: 90, def: 40 },
    depth: { label: 'tickLength', min: 0, max: 100, def: 70 },
    lineW: { label: 'tickWidth', min: 3, max: 30, def: 10 },
    draw(k) {
      const { ctx, c, R, w, ri, n, d, acc, lw } = k;
      const ga = lit(k, acc);
      annulus(ctx, c, () => ri + w * 0.34, ri, k.fill);
      ctx.lineCap = 'round';
      const tw = Math.max(1.2, w * lw);
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n;
        const fr = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
        const L = w * (0.45 + 0.55 * d * fr);
        ctx.beginPath();
        ctx.moveTo(...pol(c, a, ri + w * 0.2));
        ctx.lineTo(...pol(c, a, ri + L));
        ctx.lineWidth = tw + Math.max(1, R * 0.006);
        ctx.strokeStyle = 'rgba(0,0,0,.45)';
        ctx.stroke();
        ctx.lineWidth = tw;
        ctx.strokeStyle = i % 5 === 0 ? ga : k.fill;
        ctx.stroke();
      }
      ringStroke(ctx, c, ri, Math.max(1, R * 0.007), 'rgba(0,0,0,.6)');
      innerShadow(k);
    },
  }),
  twin: relief('twin', {
    accent: 'always',
    depth: { label: 'lineBalance', min: 0, max: 100, def: 50 },
    draw(k) {
      const { ctx, c, R, w, ri, d, acc } = k;
      annulus(ctx, c, () => R, ri, acc);
      const tO = w * 0.34;
      const tI = w * (0.1 + 0.2 * (1 - d));
      ringStroke(ctx, c, R - tO / 2, tO, k.fill);
      ringStroke(ctx, c, ri + tI / 2, tI, k.fill);
      ringStroke(ctx, c, R - tO / 2, tO * 0.22, 'rgba(255,255,255,.35)');
      rims(k);
    },
  }),
  scales: relief('scales', {
    count: { label: 'scales', min: 8, max: 48, def: 22 },
    depth: { label: 'scaleSize', min: 0, max: 100, def: 40 },
    draw(k) {
      const { ctx, c, R, w, ri, n, d, col } = k;
      ctx.save();
      clipBand(ctx, c, R, ri);
      ctx.fillStyle = mixHex(col, '#000000', 0.6);
      ctx.fillRect(c - R, c - R, R * 2, R * 2);
      const rho = Math.max(w * (0.75 + 0.5 * d), ((TAU * ri) / n) * 0.62);
      for (let i = 0; i < n; i++) {
        const [x, y] = pol(c, (i * TAU) / n, ri);
        ctx.beginPath();
        ctx.arc(x, y, rho, 0, TAU);
        ctx.fillStyle = k.fill;
        ctx.fill();
        ctx.lineWidth = Math.max(1, R * 0.006);
        ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.stroke();
      }
      ctx.restore();
      rims(k);
    },
  }),

  /* ----- 霓虹與幾何 ----- */
  ring: neon('ring', 'circle', (k) => {
    band(k, 'circle', 0, k.w, k.fill);
    band(k, 'circle', k.w + k.u * 5, k.w + k.u * 5 + hair(k), k.accFill);
  }),
  double: neon(
    'double',
    'circle',
    (k) => {
      band(k, 'circle', 0, k.w * 0.3, k.fill);
      band(k, 'circle', k.w * 0.45, k.w * 0.55, k.accFill);
      band(k, 'circle', k.w * 0.7, k.w, k.fill);
    },
    0.15,
  ),
  arcs: neon('arcs', 'circle', (k) => {
    const r = k.R - k.w / 2;
    for (const [a, b] of [
      [10, 110],
      [130, 230],
      [250, 350],
    ])
      arcDeg(k, r, a, b, k.w, k.fill);
    for (const a of [0, 120, 240]) arcDeg(k, r, a - 4, a + 4, k.w * 0.45, k.accFill);
    band(k, 'circle', k.w + k.u * 5, k.w + k.u * 5 + hair(k), k.accFill);
  }),
  glitch: neon('glitch', 'circle', (k) => {
    const { ctx, c, R, w, u } = k;
    const off = Math.max(1.5, u * 5);
    /* 紅與第二色往兩邊錯開，再疊上主色 */
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(-off, 0);
    band(k, 'circle', 0, w, GLITCH_RED);
    ctx.translate(off * 2, off * 0.4);
    band(k, 'circle', 0, w, k.accFill);
    ctx.restore();
    band(k, 'circle', 0, w, k.fill);
    /* 訊號斷掉的缺口 */
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (const [a, len] of [
      [28, 6],
      [152, 3],
      [205, 9],
      [311, 4],
    ])
      arcDeg(k, R - w / 2, a, a + len, w + 2, '#000000');
    ctx.restore();
    /* 從圓邊往內的錯位橫條（剪在圓裡）：[列（R 的比例）、長（R 的比例）、哪一邊、顏色、粗細（u）] */
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.clip();
    const slices: [number, number, number, 'm' | 'a' | 'r', number][] = [
      [-0.86, 0.12, 1, 'm', 2],
      [-0.74, 0.2, -1, 'a', 3],
      [-0.62, 0.14, -1, 'm', 3],
      [-0.55, 0.08, 1, 'r', 2],
      [-0.41, 0.1, 1, 'm', 4],
      [-0.18, 0.07, -1, 'r', 2],
      [0.05, 0.12, 1, 'a', 2],
      [0.22, 0.09, -1, 'm', 5],
      [0.34, 0.22, 1, 'a', 3],
      [0.47, 0.13, -1, 'r', 2],
      [0.58, 0.06, 1, 'm', 2],
      [0.71, 0.1, -1, 'm', 3],
      [0.83, 0.16, 1, 'r', 2],
    ];
    const pal = { m: k.fill, a: k.accFill ?? k.fill, r: GLITCH_RED };
    for (const [y, len, side, col, th] of slices) {
      ctx.fillStyle = pal[col];
      const h = Math.max(1, u * th);
      const yy = c + y * R;
      const edge = Math.sqrt(Math.max(0, R * R - (y * R) ** 2));
      const x0 = side > 0 ? c + edge - R * len : c - edge;
      ctx.fillRect(x0, yy, R * len, h);
    }
    ctx.restore();
  }),
  circuit: neon('circuit', 'circle', (k) => {
    const { ctx, c, R, w } = k;
    band(k, 'circle', 0, w, k.fill);
    if (k.accFill) {
      ctx.strokeStyle = k.accFill;
      ctx.lineWidth = hair(k) * 1.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const a = ((i * 22.5 + 11.25) * Math.PI) / 180;
        const len = w * (i % 3 === 0 ? 1.6 : i % 2 ? 0.9 : 1.2);
        const r0 = R - w * 0.35;
        const r1 = R - w - len;
        const x1 = c + r1 * Math.sin(a);
        const y1 = c - r1 * Math.cos(a);
        ctx.beginPath();
        ctx.moveTo(c + r0 * Math.sin(a), c - r0 * Math.cos(a));
        ctx.lineTo(x1, y1);
        ctx.stroke();
        dot(ctx, x1, y1, Math.max(1.5, w * 0.16), k.accFill);
      }
    }
    band(k, 'circle', w * 0.3, w * 0.3 + hair(k), k.accFill);
  }),
  square: neon('square', 'square', (k) => {
    const { ctx, c, R, w, u } = k;
    band(k, 'square', 0, w, k.fill);
    const h = R - w - u * 8;
    const len = R * 0.22;
    const lw = Math.max(1, w * 0.22);
    bracket(ctx, c - h, c - h, 1, 1, len, lw, k.accFill);
    bracket(ctx, c + h, c - h, -1, 1, len, lw, k.accFill);
    bracket(ctx, c - h, c + h, 1, -1, len, lw, k.accFill);
    bracket(ctx, c + h, c + h, -1, -1, len, lw, k.accFill);
  }),
  box: neon('box', 'box', (k) => {
    band(k, 'box', 0, k.w, k.fill);
    band(k, 'box', k.w + k.u * 5, k.w + k.u * 5 + hair(k), k.accFill);
  }),
  clip: neon('clip', 'clip', (k) => {
    const { ctx, c, R, w, u } = k;
    band(k, 'clip', 0, w, k.fill);
    const h = R - w - u * 8;
    const len = R * 0.26;
    const lw = Math.max(1, w * 0.28);
    bracket(ctx, c + h, c - h, -1, 1, len, lw, k.accFill);
    bracket(ctx, c - h, c + h, 1, -1, len, lw, k.accFill);
  }),
  hex: neon('hex', 'hex', (k) => {
    band(k, 'hex', 0, k.w, k.fill);
    const lw = Math.max(1, k.w * 0.22);
    polyCorners(k, 'hex', k.w + k.u * 6 + lw / 2, 0.24, lw, k.accFill);
  }),
  octa: neon('octa', 'octa', (k) => {
    band(k, 'octa', 0, k.w, k.fill);
    band(k, 'octa', k.w + k.u * 5, k.w + k.u * 5 + hair(k), k.accFill);
  }),
  diamond: neon('diamond', 'diamond', (k) => {
    band(k, 'diamond', 0, k.w, k.fill);
    polyCorners(k, 'diamond', k.w / 2, 0.2, Math.max(1, k.w * 0.22), k.accFill);
  }),
  none: neon('none', 'circle', () => {}, 0),
  /* 自訂外框：圖由繪製時另外畫（render.ts），開口依「開口半徑」 */
  custom: { id: 'custom', group: 'neon', shape: 'circle', cut: 0, accent: 'none', draw: () => {} },
};

export const frameDef = (id: FrameId): FrameDef => FRAMES[id] ?? FRAMES.plain;

/** 換外框時樣式參數的預設值（數量、深度、線寬） */
export function frameDefaults(id: FrameId): { count: number; depth: number; lineW: number } {
  const f = frameDef(id);
  return {
    count: f.count?.def ?? 1,
    depth: f.depth?.def ?? 50,
    lineW: f.lineW?.def ?? 10,
  };
}

/** 開口（圖片剪到這裡）往內縮的 px：外框寬 × cut */
export const cutInset = (def: FrameDef, w: number): number => def.cut * w;

/** 浮雕環畫在內側陰影裡的範圍要從質感裡扣掉（內半徑）；霓虹的樣式沒有 */
export const textureHole = (def: FrameDef, ri: number): number | null =>
  def.group === 'relief' ? ri : null;
