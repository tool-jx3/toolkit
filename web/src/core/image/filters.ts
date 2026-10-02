/**
 * 圖片濾鏡零件（G2：動態背景的調色與風格濾鏡）。純函式：RGBA 像素進、RGBA 像素出（Node 可測）。
 *
 * 一個濾鏡＝一串步驟（FilterOp[]），依序作用在整張畫面上：
 * - 逐像素調色：gray（Rec.601 亮度）、sepia（經典暖褐矩陣）、matrix（3×4 仿射）、contrast（以 128 為中心）、
 *   brightness（各色相乘）、saturate、posterize（每色 n 階）、curve（伽瑪＋黑白點）；
 * - 空間：blur（模糊副本以混合模式疊回）、sharpen（反銳利遮罩）、mosaic（方塊平均）、shift（RGB 各自位移）、
 *   lines（線稿：只在亮度變化處、畫在較暗的那一側）、edges（在原圖上疊暗線）；
 * - 疊層：fill（整片）、gradient（線性漸層）、glow（放射狀光團）、vignette（暗角）、scanlines（掃描線）、grain（決定性顆粒）。
 * 尺寸類（模糊、方塊、位移、掃描線、顆粒）以輸出像素計；位置類（漸層、光團、暗角）以畫面比例計。
 *
 * FILTER_PRESETS 是動態背景用的 26 種濾鏡（名稱由工具決定），輸出以 bg-motion.examples.json 的量測驗證（有單元測試）。
 */
import { hashUnit } from '../timeline/random';

export type BlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'soft-light'
  | 'lighten'
  | 'darken'
  | 'add';

export type Rgb = readonly [number, number, number];

export interface GradientStop {
  /** 0～1 */
  at: number;
  color: Rgb;
  /** 0～1 */
  alpha: number;
}

export type FilterOp =
  | { op: 'gray'; amount?: number }
  | { op: 'sepia'; amount?: number }
  /** r' = m0·r + m1·g + m2·b + m3（g'、b' 依序） */
  | { op: 'matrix'; m: readonly number[] }
  | { op: 'contrast'; amount: number; pivot?: number }
  | { op: 'brightness'; amount: number | Rgb }
  | { op: 'saturate'; amount: number }
  | { op: 'posterize'; levels: number }
  /** v' = lift + (gain − lift) × (v ÷ 255)^gamma（各色可分開） */
  | { op: 'curve'; gamma?: number | Rgb; lift?: number | Rgb; gain?: number | Rgb }
  /** 模糊副本（半徑 px，約略的高斯 σ）以 blend 混合、不透明度 mix 疊回 */
  | { op: 'blur'; radius: number; mix: number; blend?: BlendMode }
  /** 反銳利遮罩：v + amount × (v − 模糊(v, radius)) */
  | { op: 'sharpen'; amount: number; radius?: number }
  | { op: 'mosaic'; size: number }
  /** 各色的位移（px，正值往右／往下） */
  | {
      op: 'shift';
      r?: readonly [number, number];
      g?: readonly [number, number];
      b?: readonly [number, number];
    }
  /** 線稿：亮度差超過 threshold 的地方畫線（只畫在較暗那一側、1 px 寬）；ink 黑線白底或 light 白線黑底 */
  | { op: 'lines'; mode: 'dark' | 'light'; threshold?: number; softness?: number }
  /** 在原圖上疊暗線（水墨） */
  | { op: 'edges'; amount: number; threshold?: number; softness?: number }
  | { op: 'fill'; color: Rgb; alpha: number; blend?: BlendMode }
  /** 線性漸層：從 (x0, y0) 到 (x1, y1)（畫面比例） */
  | {
      op: 'gradient';
      from: readonly [number, number];
      to: readonly [number, number];
      stops: readonly GradientStop[];
      blend?: BlendMode;
    }
  /** 放射狀光團：中心（畫面比例）、半徑（畫面寬的比例；aspect 為垂直半徑÷水平半徑）、中心不透明度 alpha、往外平滑淡出 */
  | {
      op: 'glow';
      center: readonly [number, number];
      radius: number;
      aspect?: number;
      color: Rgb;
      alpha: number;
      blend?: BlendMode;
      /** 淡出的形狀指數（預設 2：越大越集中） */
      falloff?: number;
    }
  /** 暗角：橢圓距離 inner 以內不變，到 outer（角落＝1）漸暗到 amount */
  | { op: 'vignette'; amount: number; inner?: number; outer?: number; color?: Rgb; power?: number }
  /** 掃描線：每 period px 一條（offset 起），該列亮度 × (1 − dark) */
  | { op: 'scanlines'; period: number; dark: number; offset?: number; width?: number }
  /** 顆粒：標準差約 amount 的決定性雜訊（每格不同：frame 換了就換一組）；mono＝三色同一個值 */
  | { op: 'grain'; amount: number; mono?: boolean };

export interface FilterContext {
  /** 第幾格（顆粒每格不同） */
  frame?: number;
  /** 顆粒的種子 */
  seed?: number;
}

/* ---------- 混合模式 ---------- */

/** 0～255 的 a（底）與 b（上）混合 */
export function blendChannel(mode: BlendMode, a: number, b: number): number {
  switch (mode) {
    case 'screen':
      return a + b - (a * b) / 255;
    case 'multiply':
      return (a * b) / 255;
    case 'overlay':
      return a < 128 ? (2 * a * b) / 255 : 255 - (2 * (255 - a) * (255 - b)) / 255;
    case 'soft-light': {
      const A = a / 255;
      const B = b / 255;
      const D = A <= 0.25 ? ((16 * A - 12) * A + 4) * A : Math.sqrt(A);
      const r = B <= 0.5 ? A - (1 - 2 * B) * A * (1 - A) : A + (2 * B - 1) * (D - A);
      return r * 255;
    }
    case 'lighten':
      return Math.max(a, b);
    case 'darken':
      return Math.min(a, b);
    case 'add':
      return a + b;
    default:
      return b;
  }
}

const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const luma601 = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const perChannel = (v: number | Rgb | undefined, d: number): Rgb =>
  v === undefined ? [d, d, d] : typeof v === 'number' ? [v, v, v] : v;

/* ---------- 模糊（三次方框模糊 ≈ 高斯） ---------- */

function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[o + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc * k;
      acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
}

function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * k;
      acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
    }
  }
}

/** 單一通道的近似高斯模糊（σ ≈ sigma；三次方框模糊），回傳新陣列 */
export function blurPlane(
  plane: Float32Array,
  w: number,
  h: number,
  sigma: number,
  vertical = true,
): Float32Array {
  const out = new Float32Array(plane);
  if (sigma <= 0) return out;
  /* 三個方框的寬度（Kovesi 的近似） */
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const tmp = new Float32Array(plane.length);
  for (let i = 0; i < n; i++) {
    const r = Math.max(0, ((i < m ? wl : wu) - 1) / 2);
    if (r < 1) continue;
    boxBlurH(out, tmp, w, h, r);
    if (vertical) boxBlurV(tmp, out, w, h, r);
    else out.set(tmp);
  }
  return out;
}

/* ---------- 主程式 ---------- */

interface Planes {
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

/**
 * 座標：一般是整張圖；stacked（applyFilterRows）時每一列是「上下一致的圖」的某一列（rowY 是它原本的 y），
 * 垂直方向的空間運算視為不變（上下鄰居＝自己），位置類的疊層用原本的 y。
 */
interface Geom {
  w: number;
  h: number;
  fx: (x: number) => number;
  fy: (y: number) => number;
  rowY: (y: number) => number;
  stacked: boolean;
  /** 原圖的高（stacked 時不是 h） */
  fullH: number;
}

function geomOf(w: number, h: number, rows?: readonly number[], fullH?: number): Geom {
  const H = rows ? (fullH ?? h) : h;
  const rowY = rows ? (y: number) => rows[y] : (y: number) => y;
  return {
    w,
    h,
    fx: (x: number) => (w > 1 ? x / (w - 1) : 0.5),
    fy: (y: number) => (H > 1 ? rowY(y) / (H - 1) : 0.5),
    rowY,
    stacked: !!rows,
    fullH: H,
  };
}

function sampleStops(stops: readonly GradientStop[], t: number, out: Paint): void {
  if (!stops.length) {
    out.a = 0;
    return;
  }
  let s0 = stops[0];
  let s1 = stops[0];
  if (t > stops[0].at) {
    s0 = stops[stops.length - 1];
    s1 = s0;
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i].at) {
        s0 = stops[i - 1];
        s1 = stops[i];
        break;
      }
    }
  }
  const k = s1.at > s0.at ? Math.max(0, Math.min(1, (t - s0.at) / (s1.at - s0.at))) : 1;
  out.r = s0.color[0] + (s1.color[0] - s0.color[0]) * k;
  out.g = s0.color[1] + (s1.color[1] - s0.color[1]) * k;
  out.b = s0.color[2] + (s1.color[2] - s0.color[2]) * k;
  out.a = s0.alpha + (s1.alpha - s0.alpha) * k;
}

/** 疊層的顏色與不透明度（at 寫進這個物件，避免每個像素配置記憶體） */
interface Paint {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** 依 (x, y) 決定顏色與不透明度的疊層 */
function overlay(
  p: Planes,
  w: number,
  h: number,
  blend: BlendMode,
  at: (x: number, y: number, out: Paint) => void,
) {
  const c: Paint = { r: 0, g: 0, b: 0, a: 0 };
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      at(x, y, c);
      const a = c.a;
      if (a <= 0) continue;
      const r = p.r[i];
      const g = p.g[i];
      const b = p.b[i];
      p.r[i] = r + (blendChannel(blend, r, c.r) - r) * a;
      p.g[i] = g + (blendChannel(blend, g, c.g) - g) * a;
      p.b[i] = b + (blendChannel(blend, b, c.b) - b) * a;
    }
  }
}

/** 逐像素調色：f 讀 (r, g, b)、把結果寫進 out[0..2] */
function perPixel(p: Planes, f: (r: number, g: number, b: number, out: Float64Array) => void) {
  const o = new Float64Array(3);
  for (let i = 0; i < p.r.length; i++) {
    f(p.r[i], p.g[i], p.b[i], o);
    p.r[i] = o[0];
    p.g[i] = o[1];
    p.b[i] = o[2];
  }
}

/** 亮度差（取上下左右鄰居中最亮的減掉自己；正值＝自己是較暗的那一側） */
function darkSide(p: Planes, w: number, h: number, stacked = false): Float32Array {
  const L = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) L[i] = luma601(p.r[i], p.g[i], p.b[i]);
  const out = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const v = L[i];
      let m = v;
      if (x > 0) m = Math.max(m, L[i - 1]);
      if (x < w - 1) m = Math.max(m, L[i + 1]);
      if (!stacked && y > 0) m = Math.max(m, L[i - w]);
      if (!stacked && y < h - 1) m = Math.max(m, L[i + w]);
      out[i] = m - v;
    }
  }
  return out;
}

const ramp = (v: number, t: number, s: number) =>
  Math.max(0, Math.min(1, (v - t) / Math.max(1e-6, s)));

function applyOp(p: Planes, geo: Geom, op: FilterOp, ctx: FilterContext) {
  const { w, h, fx, fy, stacked } = geo;
  switch (op.op) {
    case 'gray': {
      const k = op.amount ?? 1;
      perPixel(p, (r, g, b, o) => {
        const l = luma601(r, g, b);
        o[0] = r + (l - r) * k;
        o[1] = g + (l - g) * k;
        o[2] = b + (l - b) * k;
      });
      return;
    }
    case 'sepia': {
      const k = op.amount ?? 1;
      perPixel(p, (r, g, b, o) => {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        o[0] = r + (sr - r) * k;
        o[1] = g + (sg - g) * k;
        o[2] = b + (sb - b) * k;
      });
      return;
    }
    case 'matrix': {
      const m = op.m;
      perPixel(p, (r, g, b, o) => {
        o[0] = m[0] * r + m[1] * g + m[2] * b + m[3];
        o[1] = m[4] * r + m[5] * g + m[6] * b + m[7];
        o[2] = m[8] * r + m[9] * g + m[10] * b + m[11];
      });
      return;
    }
    case 'contrast': {
      const c = op.amount;
      const pv = op.pivot ?? 128;
      perPixel(p, (r, g, b, o) => {
        o[0] = (r - pv) * c + pv;
        o[1] = (g - pv) * c + pv;
        o[2] = (b - pv) * c + pv;
      });
      return;
    }
    case 'brightness': {
      const [kr, kg, kb] = perChannel(op.amount, 1);
      perPixel(p, (r, g, b, o) => {
        o[0] = r * kr;
        o[1] = g * kg;
        o[2] = b * kb;
      });
      return;
    }
    case 'saturate': {
      const s = op.amount;
      perPixel(p, (r, g, b, o) => {
        const l = luma601(r, g, b);
        o[0] = l + (r - l) * s;
        o[1] = l + (g - l) * s;
        o[2] = l + (b - l) * s;
      });
      return;
    }
    case 'posterize': {
      const n = Math.max(2, Math.round(op.levels));
      const step = 256 / (n - 1);
      const q = (v: number) => Math.min(255, Math.round(clampByte(v) / step) * step);
      perPixel(p, (r, g, b, o) => {
        o[0] = q(r);
        o[1] = q(g);
        o[2] = q(b);
      });
      return;
    }
    case 'curve': {
      const gm = perChannel(op.gamma, 1);
      const lf = perChannel(op.lift, 0);
      const gn = perChannel(op.gain, 255);
      const f = (v: number, c: 0 | 1 | 2) =>
        lf[c] + (gn[c] - lf[c]) * (Math.max(0, Math.min(255, v)) / 255) ** gm[c];
      perPixel(p, (r, g, b, o) => {
        o[0] = f(r, 0);
        o[1] = f(g, 1);
        o[2] = f(b, 2);
      });
      return;
    }
    case 'blur': {
      const br = blurPlane(p.r, w, h, op.radius, !stacked);
      const bg = blurPlane(p.g, w, h, op.radius, !stacked);
      const bb = blurPlane(p.b, w, h, op.radius, !stacked);
      const mode = op.blend ?? 'normal';
      const a = op.mix;
      for (let i = 0; i < p.r.length; i++) {
        p.r[i] += (blendChannel(mode, p.r[i], br[i]) - p.r[i]) * a;
        p.g[i] += (blendChannel(mode, p.g[i], bg[i]) - p.g[i]) * a;
        p.b[i] += (blendChannel(mode, p.b[i], bb[i]) - p.b[i]) * a;
      }
      return;
    }
    case 'sharpen': {
      const rad = op.radius ?? 1;
      for (const key of ['r', 'g', 'b'] as const) {
        const src = p[key];
        const bl = blurPlane(src, w, h, rad, !stacked);
        for (let i = 0; i < src.length; i++) src[i] += (src[i] - bl[i]) * op.amount;
      }
      return;
    }
    case 'mosaic': {
      const s = Math.max(1, Math.round(op.size));
      for (const key of ['r', 'g', 'b'] as const) {
        const src = p[key];
        const sy = stacked ? 1 : s;
        for (let by = 0; by < h; by += sy) {
          for (let bx = 0; bx < w; bx += s) {
            const x1 = Math.min(w, bx + s);
            const y1 = Math.min(h, by + sy);
            let sum = 0;
            for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) sum += src[y * w + x];
            const v = Math.floor(sum / ((x1 - bx) * (y1 - by)));
            for (let y = by; y < y1; y++) for (let x = bx; x < x1; x++) src[y * w + x] = v;
          }
        }
      }
      return;
    }
    case 'shift': {
      const move = (src: Float32Array, d?: readonly [number, number]) => {
        if (!d || (!d[0] && !d[1])) return src;
        const dx = Math.round(d[0]);
        const dy = stacked ? 0 : Math.round(d[1]);
        if (!dx && !dy) return src;
        const out = new Float32Array(src.length);
        for (let y = 0, i = 0; y < h; y++) {
          const sy = Math.min(h - 1, Math.max(0, y - dy));
          for (let x = 0; x < w; x++, i++) {
            const sx = Math.min(w - 1, Math.max(0, x - dx));
            out[i] = src[sy * w + sx];
          }
        }
        return out;
      };
      p.r = move(p.r, op.r);
      p.g = move(p.g, op.g);
      p.b = move(p.b, op.b);
      return;
    }
    case 'lines': {
      const d = darkSide(p, w, h, stacked);
      const t = op.threshold ?? 24;
      const s = op.softness ?? 40;
      for (let i = 0; i < d.length; i++) {
        const line = ramp(d[i], t, s);
        const v = op.mode === 'dark' ? 255 * (1 - line) : 255 * line;
        p.r[i] = v;
        p.g[i] = v;
        p.b[i] = v;
      }
      return;
    }
    case 'edges': {
      const d = darkSide(p, w, h, stacked);
      const t = op.threshold ?? 16;
      const s = op.softness ?? 48;
      for (let i = 0; i < d.length; i++) {
        const k = 1 - op.amount * ramp(d[i], t, s);
        p.r[i] *= k;
        p.g[i] *= k;
        p.b[i] *= k;
      }
      return;
    }
    case 'fill':
      overlay(p, w, h, op.blend ?? 'normal', (_x, _y, o) => {
        o.r = op.color[0];
        o.g = op.color[1];
        o.b = op.color[2];
        o.a = op.alpha;
      });
      return;
    case 'gradient': {
      const [x0, y0] = op.from;
      const [x1, y1] = op.to;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy || 1;
      overlay(p, w, h, op.blend ?? 'normal', (x, y, o) => {
        const t = ((fx(x) - x0) * dx + (fy(y) - y0) * dy) / len2;
        sampleStops(op.stops, Math.max(0, Math.min(1, t)), o);
      });
      return;
    }
    case 'glow': {
      const [cx, cy] = op.center;
      const rx = Math.max(1e-6, op.radius);
      const ry = rx * (op.aspect ?? w / Math.max(1, geo.fullH));
      const k = op.falloff ?? 2;
      overlay(p, w, h, op.blend ?? 'screen', (x, y, o) => {
        const d = Math.hypot((fx(x) - cx) / rx, (fy(y) - cy) / ry);
        o.r = op.color[0];
        o.g = op.color[1];
        o.b = op.color[2];
        o.a = d >= 1 ? 0 : op.alpha * (1 - d ** k) ** 2;
      });
      return;
    }
    case 'vignette': {
      const inner = op.inner ?? 0.5;
      const outer = op.outer ?? 1;
      const pw = op.power ?? 2;
      const col = op.color ?? [0, 0, 0];
      overlay(p, w, h, 'normal', (x, y, o) => {
        /* 橢圓距離：中心 0、四角 1 */
        const d = Math.hypot(fx(x) * 2 - 1, fy(y) * 2 - 1) / Math.SQRT2;
        const t = Math.max(0, Math.min(1, (d - inner) / Math.max(1e-6, outer - inner)));
        o.r = col[0];
        o.g = col[1];
        o.b = col[2];
        o.a = op.amount * t ** pw;
      });
      return;
    }
    case 'scanlines': {
      const per = Math.max(1, op.period);
      const off = op.offset ?? 0;
      const wid = Math.max(0, Math.min(per, op.width ?? 1));
      for (let y = 0; y < h; y++) {
        const yy = geo.rowY(y);
        /* 這一列 [yy, yy + 1) 被暗帶 [off + k·per, off + k·per + wid) 蓋住的比例（可以是小數：反鋸齒的細線） */
        const ph = (((yy - off) % per) + per) % per;
        let cover = Math.max(0, Math.min(1, wid - ph));
        if (ph + 1 > per) cover += Math.max(0, Math.min(1, ph + 1 - per, wid));
        if (cover <= 0) continue;
        const k = 1 - op.dark * Math.min(1, cover);
        for (let x = 0, i = y * w; x < w; x++, i++) {
          p.r[i] *= k;
          p.g[i] *= k;
          p.b[i] *= k;
        }
      }
      return;
    }
    case 'grain': {
      const f = (ctx.frame ?? 0) | 0;
      const seed = ((ctx.seed ?? 1) * 7919 + f * 104729) | 0;
      /* 三個均勻亂數相加 ≈ 常態，標準差 amount */
      const k = op.amount * 2;
      for (let i = 0; i < p.r.length; i++) {
        const idx = stacked ? geo.rowY(Math.floor(i / w)) * w + (i % w) : i;
        const n = (c: number) =>
          (hashUnit(seed, idx, c) + hashUnit(seed, idx, c + 3) + hashUnit(seed, idx, c + 6) - 1.5) *
          k;
        if (op.mono) {
          const v = n(0);
          p.r[i] += v;
          p.g[i] += v;
          p.b[i] += v;
        } else {
          p.r[i] += n(0);
          p.g[i] += n(1);
          p.b[i] += n(2);
        }
      }
      return;
    }
  }
}

/**
 * 依序套用濾鏡步驟（不改原陣列，回傳新的 RGBA；透明度照原本）。
 * 每一步之間不截斷數值，最後才四捨五入、夾在 0～255。
 */
export function applyFilterOps(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  ops: readonly FilterOp[],
  ctx: FilterContext = {},
): Uint8ClampedArray<ArrayBuffer> {
  return run(rgba, geomOf(width, height), ops, ctx);
}

/**
 * 只算「上下一致的圖」（每一列都一樣，例如單色、左右漸層、左右分界）的幾列：rgba 是 rowsY.length 列疊起來，
 * rowsY 是每一列在原圖（高 fullHeight）的 y。垂直方向的模糊、銳化、方塊、位移視為不變（與整張圖逐列相同），
 * 位置類的疊層、掃描線、顆粒照原本的 y 計算。給縮圖與測試用（快很多）。
 */
export function applyFilterRows(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  fullHeight: number,
  rowsY: readonly number[],
  ops: readonly FilterOp[],
  ctx: FilterContext = {},
): Uint8ClampedArray<ArrayBuffer> {
  return run(rgba, geomOf(width, rowsY.length, rowsY, fullHeight), ops, ctx);
}

function run(
  rgba: Uint8ClampedArray | Uint8Array,
  geo: Geom,
  ops: readonly FilterOp[],
  ctx: FilterContext,
): Uint8ClampedArray<ArrayBuffer> {
  const n = geo.w * geo.h;
  const p: Planes = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    p.r[i] = rgba[o];
    p.g[i] = rgba[o + 1];
    p.b[i] = rgba[o + 2];
  }
  for (const op of ops) {
    applyOp(p, geo, op, ctx);
    /* 截斷在 0～255（與畫布上逐步處理的結果一致） */
    for (let i = 0; i < n; i++) {
      p.r[i] = clampByte(p.r[i]);
      p.g[i] = clampByte(p.g[i]);
      p.b[i] = clampByte(p.b[i]);
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    out[o] = Math.round(p.r[i]);
    out[o + 1] = Math.round(p.g[i]);
    out[o + 2] = Math.round(p.b[i]);
    out[o + 3] = rgba[o + 3];
  }
  return out;
}

/** 濾鏡有沒有每格不同的部分（顆粒） */
export const filterIsAnimated = (ops: readonly FilterOp[]): boolean =>
  ops.some((o) => o.op === 'grain');

/** 套到 canvas（就地：讀出、處理、寫回整張） */
export function applyFilterToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ops: readonly FilterOp[],
  filterCtx: FilterContext = {},
): void {
  if (!ops.length) return;
  const { width, height } = ctx.canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const out = applyFilterOps(img.data, width, height, ops, filterCtx);
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}
