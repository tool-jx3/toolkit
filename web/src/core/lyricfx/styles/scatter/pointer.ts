/**
 * 「散落」在預覽上的操作（lyric-fx 規格 3.8、F76）：一句目前的位置與看得到的範圍（placement）、點到哪一句（hitTest）、
 * 拖曳時錨點要放在哪裡（anchorAt）、旋轉時指向哪個角度（angleTo）。座標一律是畫面的比例（0～1）。
 *
 * 透視（3.6）是射影變換 (X, Y) → (sx X ÷ w, Y ÷ w)、w＝1＋qx X＋qy Y：反算一個點是一個 2 × 2 的一次方程式（unproject），
 * 所以點選與旋轉都是精確的；拖曳時透視的參數跟著錨點變，用牛頓法反算（anchorAt）。
 */
import { type Perspective, perspectiveAt, project } from '../../perspective';
import type { LyricLinePlacement, LyricPoint, LyricRegion } from '../../types';
import { lineStateAt, linesInDrawOrder } from './draw';
import { frameSpan, type ScatterLinePlan, type ScatterPlan, TEXT_HEIGHT_RATIO } from './plan';
import type { ScatterSettings } from './settings';

/** 字身在基線上、下各幾個字級（中日韓字約 0.88、0.12：和 draw.ts 的 GLYPH_CENTER_UP 同一個假設） */
const ASCENT = 0.88;
const DESCENT = 0.12;
/** 中文樣式的影子往右下 3 px */
const SHADOW = 3;

/** 投影的反算：畫面上的 (u, v) 是基準畫面上的哪一點（同一組透視參數） */
export function unproject(p: Perspective, u: number, v: number): { x: number; y: number } {
  /* u (1 ＋ qx X ＋ qy Y)＝sx X、v (1 ＋ qx X ＋ qy Y)＝Y */
  const a = u * p.qx - p.sx;
  const b = u * p.qy;
  const c = v * p.qx;
  const d = v * p.qy - 1;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return { x: u, y: v };
  return { x: (-u * d + b * v) / det, y: (-a * v + c * u) / det };
}

/** 這一句的字高、字級 */
function sizes(plan: ScatterPlan, p: ScatterLinePlan) {
  const th = p.th ?? plan.th;
  return { th, fs: th / TEXT_HEIGHT_RATIO };
}

/** 每個字的格子（基準畫面、透視前；時間 t 的上飄已經算進去；不含抖動）：[左, 上, 右, 下] */
function glyphCells(
  plan: ScatterPlan,
  p: ScatterLinePlan,
  rise: number,
  pad: number,
  count = p.glyphs.length,
): [number, number, number, number][] {
  const { th, fs } = sizes(plan, p);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const g = p.glyphs[i];
    const X = p.x + g.ox;
    const Y = p.y - rise + g.oy + th / 3;
    out.push([X - pad, Y - ASCENT * fs - pad, X + (g.adv ?? fs) + pad, Y + DESCENT * fs + pad]);
  }
  return out;
}

const toRegion = (
  W: number,
  H: number,
  l: number,
  t: number,
  r: number,
  b: number,
): LyricRegion => ({ x: l / W, y: t / H, width: (r - l) / W, height: (b - t) / H });

/** 這一句在時間 t 的上飄（不在畫面上＝null） */
function riseAt(p: ScatterLinePlan, t: number, s: ScatterSettings): number | null {
  const st = lineStateAt(p, t, s);
  return st ? st.rise : null;
}

/** 一句完整出現的時間：打完字（亮態＝開始）之後一點點，不晚於變成殘影 */
function shownAt(p: ScatterLinePlan): number {
  const typed = p.bright ? 0 : (p.glyphs.length * p.interval) / 1000;
  const end = Number.isFinite(p.fadeStart) ? p.fadeStart : p.start + typed + 1;
  const want = p.start + typed + 0.05;
  if (want < end - 0.02) return want;
  return Math.max(p.start + 0.001, (p.start + end) / 2);
}

/** 錨點能放的範圍（基準畫面的 px）：整塊（含光暈、影子的 pad）留在畫面內；和 placement.bounds、排位置的夾法是同一個 */
function anchorSpan(plan: ScatterPlan, p: ScatterLinePlan) {
  return frameSpan(
    {
      left: p.box.x - p.x,
      top: p.box.y - p.y,
      right: p.box.x + p.box.width - p.x,
      bottom: p.box.y + p.box.height - p.y,
    },
    plan.width,
    plan.height,
  );
}

/** 一句目前的位置與時間 t 看得到的範圍（規格 3.8 的 placement） */
export function scatterPlacement(
  plan: ScatterPlan,
  s: ScatterSettings,
  key: string,
  t: number,
): LyricLinePlacement | null {
  const p = plan.byKey.get(key);
  if (!p?.glyphs.length) return null;
  const { width: W, height: H } = plan;
  const span = anchorSpan(plan, p);
  const rise = riseAt(p, t, s);
  const r = rise ?? 0;
  const proj = (X: number, Y: number) => {
    const q = project(p.persp, X, Y);
    return { x: q.x / W, y: q.y / H };
  };
  let box: LyricRegion | null = null;
  if (rise != null) {
    const glow = s.glow ? s.glowSize / 2 : 0;
    let l = Number.POSITIVE_INFINITY;
    let tp = Number.POSITIVE_INFINITY;
    let rt = Number.NEGATIVE_INFINITY;
    let b = Number.NEGATIVE_INFINITY;
    for (const [x0, y0, x1, y1] of glyphCells(plan, p, r, glow + 1)) {
      for (const [X, Y] of [
        [x0, y0],
        [x1 + SHADOW, y0],
        [x0, y1 + SHADOW],
        [x1 + SHADOW, y1 + SHADOW],
      ] as const) {
        const q = project(p.persp, X, Y);
        l = Math.min(l, q.x);
        rt = Math.max(rt, q.x);
        tp = Math.min(tp, q.y);
        b = Math.max(b, q.y);
      }
    }
    box = toRegion(W, H, l, tp, rt, b);
  }
  /* 第一行的尾端：第一行最後一個字的右邊，沿著角度（第一行的字在 c (cos a, sin a)） */
  const rad = (p.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const last = p.glyphs[Math.max(0, Array.from(p.rows[0] ?? '').length - 1)];
  const reach = Math.max(sizes(plan, p).fs, last.ox * cos + last.oy * sin + (last.adv ?? 0));
  const tipX = p.x + reach * cos;
  const tipY = p.y - r + reach * sin;
  return {
    x: p.x / W,
    y: p.y / H,
    angle: p.angle,
    bounds: toRegion(W, H, span.x.lo, span.y.lo, span.x.hi, span.y.hi),
    box,
    pivot: proj(p.x, p.y - r),
    tip: proj(tipX, tipY),
    shownAt: shownAt(p),
    fixed: !!p.pinned || p.locked,
    rows: [...p.rows],
    color: p.textColor ?? s.textColor,
    glowColor: p.glowColor ?? s.glowColor,
    font: { ...(p.face ?? (p.latin && s.latinFont ? s.latinFont : s.font)) },
  };
}

/** 時間 t、畫面上 (x, y) 看得到的那一句（上面的優先；透明度 0 的不算） */
export function scatterHitTest(
  plan: ScatterPlan,
  s: ScatterSettings,
  t: number,
  x: number,
  y: number,
): string | null {
  const u = x * plan.width;
  const v = y * plan.height;
  const order = linesInDrawOrder(plan, t, s);
  for (let i = order.length - 1; i >= 0; i--) {
    const [p, st] = order[i];
    if (p.opacity != null && p.opacity <= 0) continue;
    if (st.alpha <= 0) continue;
    const q = unproject(p.persp, u, v);
    const { fs } = sizes(plan, p);
    /* 字和字之間、行和行之間也算點到（每個字的格子往外放大一點） */
    const pad = Math.max(6, 0.2 * fs);
    for (const [x0, y0, x1, y1] of glyphCells(plan, p, st.rise, pad, st.count))
      if (q.x >= x0 && q.x <= x1 + SHADOW && q.y >= y0 && q.y <= y1 + SHADOW) return p.key;
  }
  return null;
}

/**
 * 拖曳：要讓錨點在時間 t 的畫面上落在 (x, y)，錨點要放在哪裡（畫面的比例）。
 * 透視的參數由錨點決定，所以用牛頓法（兩軸輪流、數值微分）解 project(參數(A), A − 上飄)＝目標。
 * 錨點的每一軸都夾在「整塊留在畫面內」的範圍（和 placement.bounds 同一個，工具寫進存檔前的夾法也是它），而且是**解的過程中**
 * 就夾住：到不了的那一軸停在邊上，另一軸用「停住的那一軸的真正位置」去解，所以照樣對得上指標。
 * （先夾在整個畫面、之後才夾進整塊的範圍，兩次夾法不一致，透視讓另一軸偏掉：規格 7.5。）
 * 透視把畫面下方往上縮（預設的透視 Y，錨點在最下面時看起來約在 76% 的高度），到不了的目標停在邊上。
 */
export function scatterAnchorAt(
  plan: ScatterPlan,
  s: ScatterSettings,
  key: string,
  t: number,
  x: number,
  y: number,
): LyricPoint | null {
  const p = plan.byKey.get(key);
  if (!p) return null;
  const { width: W, height: H } = plan;
  const span = anchorSpan(plan, p);
  const inX = (v: number) => Math.min(span.x.hi, Math.max(span.x.lo, v));
  const inY = (v: number) => Math.min(span.y.hi, Math.max(span.y.lo, v));
  const r = riseAt(p, t, s) ?? 0;
  const u = x * W;
  const v = y * H;
  if (!s.perspective) return { x: inX(u) / W, y: inY(v + r) / H };
  const persp = (X: number, Y: number) =>
    perspectiveAt(X, Y, W, H, s.perspX * 1e-6, s.perspY * 1e-5, s.perspComp * 0.01);
  const f = (X: number, Y: number) => project(persp(X, Y), X, Y - r);
  /* 起點：用目前這一句的透視參數反算 */
  const first = unproject(p.persp, u, v);
  let X = inX(first.x);
  let Y = inY(first.y + r);
  const h = 0.5;
  /*
   * 一維的一步：牛頓法的步伐夾進範圍；殘差沒有變小就把步伐減半（透視很強時，螢幕上的位置不隨錨點單調，
   * 牛頓法會跳到另一邊，這樣就停在最接近的地方）。
   */
  const damped = (
    cur: number,
    delta: number,
    inside: (v: number) => number,
    err: (v: number) => number,
  ) => {
    const e0 = err(cur);
    let k = 1;
    for (let j = 0; j < 8; j++, k /= 2) {
      const next = inside(cur - delta * k);
      if (err(next) <= e0) return next;
    }
    return cur;
  };
  /* 兩軸輪流做一維的牛頓法（兩軸的交互作用很小，收斂得很快；到不了的那一軸停在邊上） */
  for (let i = 0; i < 24; i++) {
    let q = f(X, Y);
    if (Math.abs(q.x - u) < 1e-4 && Math.abs(q.y - v) < 1e-4) break;
    const X0 = X;
    const Y0 = Y;
    const a = (f(X + h, Y).x - q.x) / h;
    if (Math.abs(a) > 1e-9) X = damped(X, (q.x - u) / a, inX, (c) => Math.abs(f(c, Y).x - u));
    q = f(X, Y);
    const d = (f(X, Y + h).y - q.y) / h;
    if (Math.abs(d) > 1e-9) Y = damped(Y, (q.y - v) / d, inY, (c) => Math.abs(f(X, c).y - v));
    /* 停在邊上的軸不會再動：兩軸都不動了就結束 */
    if (Math.abs(X - X0) < 1e-7 && Math.abs(Y - Y0) < 1e-7) break;
  }
  return { x: X / W, y: Y / H };
}

/** 旋轉：從錨點指向畫面上 (x, y) 的方向是幾度（透視把直線投影成直線，所以反算一個點就精確） */
export function scatterAngleTo(
  plan: ScatterPlan,
  s: ScatterSettings,
  key: string,
  t: number,
  x: number,
  y: number,
): number | null {
  const p = plan.byKey.get(key);
  if (!p) return null;
  const r = riseAt(p, t, s) ?? 0;
  const q = unproject(p.persp, x * plan.width, y * plan.height);
  const dx = q.x - p.x;
  const dy = q.y - (p.y - r);
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return p.angle;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}
