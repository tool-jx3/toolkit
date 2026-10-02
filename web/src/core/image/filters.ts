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
  /**
   * r' = m0·r + m1·g + m2·b + m3（g'、b' 依序）。選填的亮部／暗部項（bg-motion 原作的時段濾鏡）：
   * r' 再加 highlight[0]·H + shadow[0]·S，H＝clamp((亮度 − 112) ÷ 143)、S＝clamp((132 − 亮度) ÷ 132)（亮度＝Rec.601、0～1）；
   * highlightAbove：H 不大於這個值時亮部項當成 0。
   */
  | {
      op: 'matrix';
      m: readonly number[];
      highlight?: Rgb;
      shadow?: Rgb;
      highlightAbove?: number;
    }
  | { op: 'contrast'; amount: number; pivot?: number }
  | { op: 'brightness'; amount: number | Rgb }
  | { op: 'saturate'; amount: number }
  | { op: 'posterize'; levels: number }
  /** v' = lift + (gain − lift) × (v ÷ 255)^gamma（各色可分開） */
  | { op: 'curve'; gamma?: number | Rgb; lift?: number | Rgb; gain?: number | Rgb }
  /**
   * 模糊副本（半徑 px，約略的高斯 σ）以 blend 混合、不透明度 mix 疊回；brightness：模糊副本的亮度倍率（選填）。
   * canvas：照瀏覽器畫布 `filter: blur(σ px) brightness(b)` 再以 globalAlpha＝mix 畫回的做法——三次方框模糊
   * （SVG 規格的寬度 d＝⌊σ·3·√(2π)÷4＋0.5⌋）、畫面外視為透明（靠邊的模糊層變半透明），只用一般混合（blend 不作用）。
   */
  | {
      op: 'blur';
      radius: number;
      mix: number;
      blend?: BlendMode;
      brightness?: number;
      canvas?: boolean;
    }
  /** 反銳利遮罩：v + amount × (v − 模糊(v, radius)) */
  | { op: 'sharpen'; amount: number; radius?: number }
  /**
   * 馬賽克（size px 一格）。sample：mean＝整格平均（預設）；center＝照畫布「低品質縮小再最近鄰放大」的做法：
   * 格數＝round(寬 ÷ size)（格寬可以不是整數），每格取格子中心的雙線性取樣（size 為偶數時約是中央 2 × 2 的平均）。
   */
  | { op: 'mosaic'; size: number; sample?: 'mean' | 'center' }
  /** 各色的位移（px，正值往右／往下） */
  | {
      op: 'shift';
      r?: readonly [number, number];
      g?: readonly [number, number];
      b?: readonly [number, number];
    }
  /**
   * 線稿：亮度差超過 threshold 的地方畫線（線的濃度＝(差 − threshold) ÷ softness，夾在 0～1）；dark 黑線白底或 light 白線黑底。
   * kernel：max＝與上下左右最亮的鄰居比，只畫在較暗那一側（預設）；forward＝bg-motion 原作的做法：
   * |自己 − 右邊| ＋ |自己 − 下面|（線畫在交界的左／上那一格，1 px 細線）。
   */
  | {
      op: 'lines';
      mode: 'dark' | 'light';
      threshold?: number;
      softness?: number;
      kernel?: 'max' | 'forward';
    }
  /** 在原圖上疊暗線（水墨） */
  | { op: 'edges'; amount: number; threshold?: number; softness?: number }
  | { op: 'fill'; color: Rgb; alpha: number; blend?: BlendMode }
  /**
   * 線性漸層：從 (x0, y0) 到 (x1, y1)（畫面比例）。色標的顏色與不透明度各自線性內插（同畫布，不預乘）。
   * space：unit＝在 0～1 的正規化座標上投影（預設）；pixel＝照畫布 createLinearGradient：換成 px 座標、以像素中心投影
   * （斜向漸層會隨長寬比改變方向）。
   */
  | {
      op: 'gradient';
      from: readonly [number, number];
      to: readonly [number, number];
      stops: readonly GradientStop[];
      blend?: BlendMode;
      space?: 'unit' | 'pixel';
    }
  /**
   * 放射狀漸層（照畫布 createRadialGradient 的同心圓）：中心（畫面比例）、內外半徑 r0、r1（畫面長邊的比例），
   * 像素中心到中心的距離 d → t＝(d − r0) ÷ (r1 − r0)，夾在 0～1（內圈以內用第一個色標、外圈以外用最後一個）。
   * 色標不預乘內插，預設一般混合。
   */
  | {
      op: 'radial';
      center: readonly [number, number];
      r0?: number;
      r1: number;
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
  /**
   * 顆粒：標準差約 amount 的決定性雜訊（每格不同：frame 換了就換一組）；mono＝三色同一個值。
   * shape：normal＝近似常態（預設）；uniform＝均勻分布（寬 amount·√12，同原作的 (亂數 − 0.5) × 寬）。
   */
  | { op: 'grain'; amount: number; mono?: boolean; shape?: 'normal' | 'uniform' };

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

/**
 * 垂直方框模糊：每一欄各自的累加值放在一列陣列裡，逐列往下推（記憶體連續讀取，比逐欄快很多；
 * 每一欄的累加順序與逐欄算時相同，結果一樣）。
 */
function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const k = 1 / (2 * r + 1);
  const acc = new Float64Array(w);
  for (let i = -r; i <= r; i++) {
    const row = Math.min(h - 1, Math.max(0, i)) * w;
    for (let x = 0; x < w; x++) acc[x] += src[row + x];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const add = Math.min(h - 1, y + r + 1) * w;
    const sub = Math.max(0, y - r) * w;
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc[x] * k;
      acc[x] += src[add + x] - src[sub + x];
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

/* ---------- 畫布式模糊（filter: blur()：三次方框、畫面外透明） ---------- */

/**
 * SVG 規格（瀏覽器的 blur() 也照這個）的三次方框：d＝⌊σ·3·√(2π)÷4＋0.5⌋；d 為奇數時三個寬 d 的置中方框，
 * 偶數時兩個寬 d（分別偏左、偏右半格）與一個寬 d＋1 的方框。回傳每個方框的視窗 [lo, hi]（含兩端）。
 */
function svgBoxes(sigma: number): [number, number][] {
  const d = Math.floor((sigma * 3 * Math.sqrt(2 * Math.PI)) / 4 + 0.5);
  if (d < 2) return [];
  if (d % 2) {
    const r = (d - 1) / 2;
    return [
      [-r, r],
      [-r, r],
      [-r, r],
    ];
  }
  const h = d / 2;
  return [
    [-h, h - 1],
    [-h + 1, h],
    [-h, h],
  ];
}

/** 一維方框（視窗 [x + lo, x + hi]，範圍外視為 0），src 從 so 起、間隔 1 的 n 個值寫到 dst */
function boxLine(
  src: Float32Array,
  dst: Float32Array,
  so: number,
  n: number,
  lo: number,
  hi: number,
): void {
  const k = 1 / (hi - lo + 1);
  let acc = 0;
  for (let i = Math.max(0, lo); i <= Math.min(n - 1, hi); i++) acc += src[so + i];
  /* 分三段（左端、中段、右端），中段不必檢查範圍；lo ≤ 0 ≤ hi */
  let x = 0;
  const xa = Math.min(n, -lo);
  for (; x < xa; x++) {
    dst[so + x] = acc * k;
    const inn = x + hi + 1;
    if (inn < n) acc += src[so + inn];
  }
  const xb = Math.max(x, n - hi - 1);
  for (; x < xb; x++) {
    dst[so + x] = acc * k;
    acc += src[so + x + hi + 1] - src[so + x + lo];
  }
  for (; x < n; x++) {
    dst[so + x] = acc * k;
    const out = x + lo;
    if (out >= 0) acc -= src[so + out];
  }
}

/**
 * 三個色版同時做 boxLine（三條累加互不相依，比分開做快）：s[c]、d[c] 是三個色版的來源與目的，
 * 各自從 so 起、間隔 1 的 n 個值；視窗 [x + lo, x + hi]，範圍外視為 0，lo ≤ 0 ≤ hi。
 */
function boxLine3(
  s: readonly Float32Array[],
  d: readonly Float32Array[],
  so: number,
  n: number,
  lo: number,
  hi: number,
): void {
  const [s0, s1, s2] = s;
  const [d0, d1, d2] = d;
  const k = 1 / (hi - lo + 1);
  let a0 = 0;
  let a1 = 0;
  let a2 = 0;
  for (let i = so + Math.max(0, lo); i <= so + Math.min(n - 1, hi); i++) {
    a0 += s0[i];
    a1 += s1[i];
    a2 += s2[i];
  }
  let x = 0;
  const xa = Math.min(n, -lo);
  for (; x < xa; x++) {
    const o = so + x;
    d0[o] = a0 * k;
    d1[o] = a1 * k;
    d2[o] = a2 * k;
    if (x + hi + 1 < n) {
      const j = o + hi + 1;
      a0 += s0[j];
      a1 += s1[j];
      a2 += s2[j];
    }
  }
  const xb = Math.max(x, n - hi - 1);
  for (; x < xb; x++) {
    const o = so + x;
    const j = o + hi + 1;
    const q = o + lo;
    d0[o] = a0 * k;
    d1[o] = a1 * k;
    d2[o] = a2 * k;
    a0 += s0[j] - s0[q];
    a1 += s1[j] - s1[q];
    a2 += s2[j] - s2[q];
  }
  for (; x < n; x++) {
    const o = so + x;
    d0[o] = a0 * k;
    d1[o] = a1 * k;
    d2[o] = a2 * k;
    if (x + lo >= 0) {
      const q = o + lo;
      a0 -= s0[q];
      a1 -= s1[q];
      a2 -= s2[q];
    }
  }
}

/**
 * 垂直方向的一維方框（逐列推進；每一欄各自累加，範圍外視為 0）。平面寬 w、高 h，只算 [x0, x1) 這幾欄
 * （其他欄不寫）。
 */
function boxColumns(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  lo: number,
  hi: number,
  x0 = 0,
  x1 = w,
): void {
  const k = 1 / (hi - lo + 1);
  const n = x1 - x0;
  const acc = new Float64Array(n);
  for (let i = Math.max(0, lo); i <= Math.min(h - 1, hi); i++) {
    const row = i * w + x0;
    for (let x = 0; x < n; x++) acc[x] += src[row + x];
  }
  for (let y = 0; y < h; y++) {
    const o = y * w + x0;
    const out = y + lo;
    const inn = y + hi + 1;
    if (out >= 0 && inn < h) {
      /* 中段：寫出、加一列、減一列一起做 */
      const ro = out * w + x0;
      const ri = inn * w + x0;
      for (let x = 0; x < n; x++) {
        const a = acc[x];
        dst[o + x] = a * k;
        acc[x] = a + src[ri + x] - src[ro + x];
      }
      continue;
    }
    for (let x = 0; x < n; x++) dst[o + x] = acc[x] * k;
    if (out >= 0 && out < h) {
      const r = out * w + x0;
      for (let x = 0; x < n; x++) acc[x] -= src[r + x];
    }
    if (inn < h) {
      const r = inn * w + x0;
      for (let x = 0; x < n; x++) acc[x] += src[r + x];
    }
  }
}

/** 長 n 的一排不透明像素模糊後的不透明度（0～1；靠兩端的變小） */
function coverage1d(n: number, boxes: readonly [number, number][]): Float32Array {
  const pad = boxes.reduce((s, [lo, hi]) => s + Math.max(-lo, hi), 0);
  const len = n + 2 * pad;
  let a = new Float32Array(len);
  a.fill(1, pad, pad + n);
  let b = new Float32Array(len);
  for (const [lo, hi] of boxes) {
    boxLine(a, b, 0, len, lo, hi);
    [a, b] = [b, a];
  }
  return a.slice(pad, pad + n);
}

/* ---------- 色標查表（gradient 的 pixel 座標、radial 用） ---------- */

const LUT_N = 4096;

/** 色標在 t＝0～1 的 LUT_N 個取樣（每格 r, g, b, a） */
function stopsLut(stops: readonly GradientStop[]): Float32Array {
  const lut = new Float32Array(LUT_N * 4);
  const c: Paint = { r: 0, g: 0, b: 0, a: 0 };
  for (let i = 0; i < LUT_N; i++) {
    sampleStops(stops, i / (LUT_N - 1), c);
    lut[i * 4] = c.r;
    lut[i * 4 + 1] = c.g;
    lut[i * 4 + 2] = c.b;
    lut[i * 4 + 3] = c.a;
  }
  return lut;
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

/*
 * 疊層：fill、glow、vignette 先算出每個像素的不透明度，再一次混合到整張圖（gradient 每個像素取色後直接混合）。
 * 混合時 normal／screen／multiply 各有專用的算式（與 blendChannel 相同，結果一樣，但快很多），
 * 其他模式逐像素呼叫 blendChannel。
 */

/** 每個像素的不透明度 A（≤ 0 的不動），顏色固定 */
function blendPlanes(p: Planes, mode: BlendMode, A: Float64Array, color: Rgb): void {
  const { r: R, g: G, b: B } = p;
  const n = R.length;
  const [cr, cg, cb] = color;
  if (mode === 'normal') {
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a <= 0) continue;
      const r = R[i];
      const g = G[i];
      const b = B[i];
      R[i] = r + (cr - r) * a;
      G[i] = g + (cg - g) * a;
      B[i] = b + (cb - b) * a;
    }
    return;
  }
  if (mode === 'screen') {
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a <= 0) continue;
      const r = R[i];
      const g = G[i];
      const b = B[i];
      R[i] = r + (r + cr - (r * cr) / 255 - r) * a;
      G[i] = g + (g + cg - (g * cg) / 255 - g) * a;
      B[i] = b + (b + cb - (b * cb) / 255 - b) * a;
    }
    return;
  }
  if (mode === 'multiply') {
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a <= 0) continue;
      const r = R[i];
      const g = G[i];
      const b = B[i];
      R[i] = r + ((r * cr) / 255 - r) * a;
      G[i] = g + ((g * cg) / 255 - g) * a;
      B[i] = b + ((b * cb) / 255 - b) * a;
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = A[i];
    if (a <= 0) continue;
    const r = R[i];
    const g = G[i];
    const b = B[i];
    R[i] = r + (blendChannel(mode, r, cr) - r) * a;
    G[i] = g + (blendChannel(mode, g, cg) - g) * a;
    B[i] = b + (blendChannel(mode, b, cb) - b) * a;
  }
}

/**
 * 只跟畫面大小有關的不透明度圖（光團、暗角）：同一個步驟（物件）、同樣大小時沿用上一次算好的
 * （動畫逐格套同一組濾鏡時不必每格重算）。上下一致的圖（applyFilterRows）不快取。
 */
const alphaCache = new WeakMap<FilterOp, { key: string; alpha: Float64Array }>();

function cachedAlpha(op: FilterOp, geo: Geom, build: (A: Float64Array) => void): Float64Array {
  const key = `${geo.w}x${geo.h}`;
  const hit = geo.stacked ? undefined : alphaCache.get(op);
  if (hit && hit.key === key) return hit.alpha;
  const alpha = new Float64Array(geo.w * geo.h);
  build(alpha);
  if (!geo.stacked) alphaCache.set(op, { key, alpha });
  return alpha;
}

const blendKind = (mode: BlendMode) =>
  mode === 'normal' ? 0 : mode === 'screen' ? 1 : mode === 'multiply' ? 2 : 3;

/** 第 i 個像素以色標查表第 j 格的顏色與不透明度混合（kind 見 blendKind；專用算式與 blendChannel 相同） */
function mixLut(
  p: Planes,
  i: number,
  lut: Float32Array,
  j: number,
  kind: number,
  mode: BlendMode,
): void {
  const o = j * 4;
  const a = lut[o + 3];
  if (a <= 0) return;
  const cr = lut[o];
  const cg = lut[o + 1];
  const cb = lut[o + 2];
  const r = p.r[i];
  const g = p.g[i];
  const b = p.b[i];
  if (kind === 0) {
    p.r[i] = r + (cr - r) * a;
    p.g[i] = g + (cg - g) * a;
    p.b[i] = b + (cb - b) * a;
  } else if (kind === 1) {
    p.r[i] = r + (cr - (r * cr) / 255) * a;
    p.g[i] = g + (cg - (g * cg) / 255) * a;
    p.b[i] = b + (cb - (b * cb) / 255) * a;
  } else if (kind === 2) {
    p.r[i] = r + ((r * cr) / 255 - r) * a;
    p.g[i] = g + ((g * cg) / 255 - g) * a;
    p.b[i] = b + ((b * cb) / 255 - b) * a;
  } else {
    p.r[i] = r + (blendChannel(mode, r, cr) - r) * a;
    p.g[i] = g + (blendChannel(mode, g, cg) - g) * a;
    p.b[i] = b + (blendChannel(mode, b, cb) - b) * a;
  }
}

/** t（0～1，範圍外夾住）→ 查表的格號 */
const lutIndex = (t: number) => (t <= 0 ? 0 : t >= 1 ? LUT_N - 1 : Math.round(t * (LUT_N - 1)));

/**
 * 漸層（gradient 的 pixel 座標、radial）每個像素的查表格號只跟畫面大小有關：同一個步驟（物件）、同樣大小時沿用
 * （動畫逐格套同一組濾鏡時不必每格重算距離）。上下一致的圖（applyFilterRows）不快取。
 */
const indexCache = new WeakMap<FilterOp, { key: string; idx: Uint16Array; lut: Float32Array }>();

function cachedIndex(
  op: FilterOp,
  geo: Geom,
  stops: readonly GradientStop[],
  build: (idx: Uint16Array) => void,
): { idx: Uint16Array; lut: Float32Array } {
  const key = `${geo.w}x${geo.h}`;
  const hit = geo.stacked ? undefined : indexCache.get(op);
  if (hit && hit.key === key) return hit;
  const idx = new Uint16Array(geo.w * geo.h);
  build(idx);
  const entry = { key, idx, lut: stopsLut(stops) };
  if (!geo.stacked) indexCache.set(op, entry);
  return entry;
}

/** 依格號圖與色標查表混合整張圖（一般混合走專用迴圈） */
function paintIndexed(p: Planes, idx: Uint16Array, lut: Float32Array, mode: BlendMode): void {
  const kind = blendKind(mode);
  if (kind !== 0) {
    for (let i = 0; i < idx.length; i++) mixLut(p, i, lut, idx[i], kind, mode);
    return;
  }
  const { r: R, g: G, b: B } = p;
  for (let i = 0; i < idx.length; i++) {
    const o = idx[i] * 4;
    const a = lut[o + 3];
    if (a <= 0) continue;
    const r = R[i];
    const g = G[i];
    const b = B[i];
    R[i] = r + (lut[o] - r) * a;
    G[i] = g + (lut[o + 1] - g) * a;
    B[i] = b + (lut[o + 2] - b) * a;
  }
}

/**
 * 照畫布 filter: blur(σ) brightness(b) 畫出模糊副本、再以不透明度 mix 一般混合疊回（見 FilterOp 的 blur.canvas）。
 * 模糊副本是預乘色：畫面外透明，所以靠邊的不透明度＝橫向 × 縱向的覆蓋率；亮度倍率作用在未預乘的顏色上、夾在 255。
 */
function canvasBlurOverlay(
  p: Planes,
  geo: Geom,
  sigma: number,
  mix: number,
  brightness: number,
): void {
  const { w, h, stacked } = geo;
  const boxes = svgBoxes(sigma);
  const pad = boxes.reduce((s, [lo, hi]) => s + Math.max(-lo, hi), 0);
  const ax = coverage1d(w, boxes);
  const fullY = coverage1d(geo.fullH, boxes);
  const ay = new Float32Array(h);
  for (let y = 0; y < h; y++) ay[y] = fullY[geo.rowY(y)];
  const PW = w + 2 * pad;
  /* 上下一致的圖（stacked）只做橫向，縱向的覆蓋率另外乘上 */
  const PH = stacked ? h : h + 2 * pad;
  const oy = stacked ? 0 : pad;
  const keys = ['r', 'g', 'b'] as const;
  let a = keys.map(() => new Float32Array(PW * PH));
  let b = keys.map(() => new Float32Array(PW * PH));
  /* 橫向：逐列在小暫存裡做完三個方框再寫進加了留白的平面（上下的留白一直是 0）；三個色版一起做 */
  {
    let ra = keys.map(() => new Float32Array(PW));
    let rb = keys.map(() => new Float32Array(PW));
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        ra[c].fill(0);
        ra[c].set(p[keys[c]].subarray(y * w, y * w + w), pad);
      }
      for (const [lo, hi] of boxes) {
        boxLine3(ra, rb, 0, PW, lo, hi);
        [ra, rb] = [rb, ra];
      }
      for (let c = 0; c < 3; c++) a[c].set(ra[c], (y + oy) * PW);
    }
  }
  const { r: R, g: G, b: B } = p;
  if (!stacked && boxes.length) {
    /* 縱向：前面的方框整張做，最後一個方框只推進原圖那幾列、那幾欄，邊推進邊疊回（不寫出模糊平面） */
    for (const [lo, hi] of boxes.slice(0, -1)) {
      /* 橫向已經做完，左右留白那幾欄之後用不到 */
      for (let c = 0; c < 3; c++) boxColumns(a[c], b[c], PW, PH, lo, hi, pad, pad + w);
      [a, b] = [b, a];
    }
    const [lo, hi] = boxes[boxes.length - 1];
    const k = (1 / (hi - lo + 1)) * brightness;
    const [SR, SG, SB] = a;
    const accR = new Float64Array(w);
    const accG = new Float64Array(w);
    const accB = new Float64Array(w);
    for (let r = Math.max(0, oy + lo); r <= Math.min(PH - 1, oy + hi); r++) {
      const o = r * PW + pad;
      for (let x = 0; x < w; x++) {
        accR[x] += SR[o + x];
        accG[x] += SG[o + x];
        accB[x] += SB[o + x];
      }
    }
    for (let y = 0; y < h; y++) {
      const ayv = ay[y];
      for (let x = 0, i = y * w; x < w; x++, i++) {
        const al = ax[x] * ayv;
        const cap = 255 * al;
        const cr = Math.min(cap, accR[x] * k);
        const cg = Math.min(cap, accG[x] * k);
        const cb = Math.min(cap, accB[x] * k);
        const keep = 1 - mix * al;
        R[i] = R[i] * keep + cr * mix;
        G[i] = G[i] * keep + cg * mix;
        B[i] = B[i] * keep + cb * mix;
      }
      const out = y + oy + lo;
      const inn = y + oy + hi + 1;
      if (out >= 0) {
        const o = out * PW + pad;
        for (let x = 0; x < w; x++) {
          accR[x] -= SR[o + x];
          accG[x] -= SG[o + x];
          accB[x] -= SB[o + x];
        }
      }
      if (inn < PH) {
        const o = inn * PW + pad;
        for (let x = 0; x < w; x++) {
          accR[x] += SR[o + x];
          accG[x] += SG[o + x];
          accB[x] += SB[o + x];
        }
      }
    }
    return;
  }
  /* 上下一致的圖（只做了橫向，縱向乘上覆蓋率）或沒有模糊（σ 太小） */
  const [BR, BG, BB] = a;
  for (let y = 0; y < h; y++) {
    const row = (y + oy) * PW + pad;
    const kyv = stacked ? ay[y] : 1;
    for (let x = 0, i = y * w; x < w; x++, i++) {
      const a = ax[x] * ay[y];
      const cap = 255 * a;
      const j = row + x;
      const cr = Math.min(cap, BR[j] * kyv * brightness);
      const cg = Math.min(cap, BG[j] * kyv * brightness);
      const cb = Math.min(cap, BB[j] * kyv * brightness);
      const keep = 1 - mix * a;
      R[i] = R[i] * keep + cr * mix;
      G[i] = G[i] * keep + cg * mix;
      B[i] = B[i] * keep + cb * mix;
    }
  }
}

/**
 * 照畫布「低品質縮小（雙線性）再最近鄰放大」的馬賽克：格數 round(寬 ÷ size) × round(高 ÷ size)，
 * 每格取格子中心的雙線性取樣；放大時第 X 欄用第 ⌊(X ＋ 0.5) × 格數 ÷ 寬⌋ 格。上下一致的圖只做橫向。
 */
function mosaicCenter(p: Planes, geo: Geom, size: number): void {
  const { w, h, stacked } = geo;
  const sw = Math.max(1, Math.round(w / size));
  const sh = stacked ? h : Math.max(1, Math.round(h / size));
  /* 每一格（欄、列）的取樣位置：左右兩個來源像素與權重 */
  const taps = (n: number, m: number) => {
    const i0 = new Int32Array(m);
    const i1 = new Int32Array(m);
    const f = new Float32Array(m);
    for (let k = 0; k < m; k++) {
      const u = Math.max(0, Math.min(n - 1, ((k + 0.5) * n) / m - 0.5));
      const a = Math.floor(u);
      i0[k] = a;
      i1[k] = Math.min(n - 1, a + 1);
      f[k] = u - a;
    }
    return { i0, i1, f };
  };
  const tx = taps(w, sw);
  const ty = stacked ? null : taps(h, sh);
  /* 輸出的每一欄、每一列對應到哪一格 */
  const cellX = new Int32Array(w);
  for (let x = 0; x < w; x++) cellX[x] = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / w));
  const cellY = new Int32Array(h);
  for (let y = 0; y < h; y++)
    cellY[y] = stacked ? y : Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / h));
  for (const key of ['r', 'g', 'b'] as const) {
    const src = p[key];
    const small = new Float32Array(sw * sh);
    for (let j = 0; j < sh; j++) {
      const y0 = ty ? ty.i0[j] : j;
      const y1 = ty ? ty.i1[j] : j;
      const fy = ty ? ty.f[j] : 0;
      for (let i = 0; i < sw; i++) {
        const x0 = tx.i0[i];
        const x1 = tx.i1[i];
        const fx = tx.f[i];
        const top = src[y0 * w + x0] * (1 - fx) + src[y0 * w + x1] * fx;
        const bot = src[y1 * w + x0] * (1 - fx) + src[y1 * w + x1] * fx;
        small[j * sw + i] = top * (1 - fy) + bot * fy;
      }
    }
    for (let y = 0, o = 0; y < h; y++) {
      const srow = cellY[y] * sw;
      for (let x = 0; x < w; x++, o++) src[o] = small[srow + cellX[x]];
    }
  }
}

/** 每一欄的 fx(x)、每一列的 fy(y)（畫面比例），疊層的迴圈用 */
function axes(geo: Geom): { ax: Float64Array; ay: Float64Array } {
  const ax = new Float64Array(geo.w);
  const ay = new Float64Array(geo.h);
  for (let x = 0; x < geo.w; x++) ax[x] = geo.fx(x);
  for (let y = 0; y < geo.h; y++) ay[y] = geo.fy(y);
  return { ax, ay };
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

/** 前向差分的邊緣量：|自己 − 右邊| ＋ |自己 − 下面|（最右欄、最下列的鄰居是自己；上下一致的圖沒有縱向差） */
function forwardEdge(p: Planes, w: number, h: number, stacked = false): Float32Array {
  const L = new Float32Array(w * h);
  for (let i = 0; i < L.length; i++) L[i] = luma601(p.r[i], p.g[i], p.b[i]);
  const out = new Float32Array(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    const down = !stacked && y < h - 1 ? w : 0;
    for (let x = 0; x < w; x++, i++) {
      const v = L[i];
      const right = x < w - 1 ? L[i + 1] : v;
      out[i] = Math.abs(v - right) + Math.abs(v - L[i + down]);
    }
  }
  return out;
}

const ramp = (v: number, t: number, s: number) =>
  Math.max(0, Math.min(1, (v - t) / Math.max(1e-6, s)));

function applyOp(p: Planes, geo: Geom, op: FilterOp, ctx: FilterContext) {
  const { w, h, stacked } = geo;
  switch (op.op) {
    /* 逐像素調色：直接寫迴圈（不經過回呼），算式與順序照舊 */
    case 'gray': {
      const k = op.amount ?? 1;
      const { r: R, g: G, b: B } = p;
      for (let i = 0; i < R.length; i++) {
        const r = R[i];
        const g = G[i];
        const b = B[i];
        const l = luma601(r, g, b);
        R[i] = r + (l - r) * k;
        G[i] = g + (l - g) * k;
        B[i] = b + (l - b) * k;
      }
      return;
    }
    case 'sepia': {
      const k = op.amount ?? 1;
      const { r: R, g: G, b: B } = p;
      for (let i = 0; i < R.length; i++) {
        const r = R[i];
        const g = G[i];
        const b = B[i];
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        R[i] = r + (sr - r) * k;
        G[i] = g + (sg - g) * k;
        B[i] = b + (sb - b) * k;
      }
      return;
    }
    case 'matrix': {
      const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11] = op.m;
      const { r: R, g: G, b: B } = p;
      if (op.highlight || op.shadow) {
        const [h0, h1, h2] = op.highlight ?? [0, 0, 0];
        const [s0, s1, s2] = op.shadow ?? [0, 0, 0];
        const above = op.highlightAbove;
        for (let i = 0; i < R.length; i++) {
          const r = R[i];
          const g = G[i];
          const b = B[i];
          const l = luma601(r, g, b);
          let hl = l <= 112 ? 0 : l >= 255 ? 1 : (l - 112) / 143;
          if (above !== undefined && !(hl > above)) hl = 0;
          const sh = l >= 132 ? 0 : l <= 0 ? 1 : (132 - l) / 132;
          R[i] = clampByte(m0 * r + m1 * g + m2 * b + m3 + h0 * hl + s0 * sh);
          G[i] = clampByte(m4 * r + m5 * g + m6 * b + m7 + h1 * hl + s1 * sh);
          B[i] = clampByte(m8 * r + m9 * g + m10 * b + m11 + h2 * hl + s2 * sh);
        }
        return;
      }
      /* 截斷直接在迴圈裡做（結果與之後再掃一次相同，見 keepsRange） */
      for (let i = 0; i < R.length; i++) {
        const r = R[i];
        const g = G[i];
        const b = B[i];
        R[i] = clampByte(m0 * r + m1 * g + m2 * b + m3);
        G[i] = clampByte(m4 * r + m5 * g + m6 * b + m7);
        B[i] = clampByte(m8 * r + m9 * g + m10 * b + m11);
      }
      return;
    }
    case 'contrast': {
      const c = op.amount;
      const pv = op.pivot ?? 128;
      const { r: R, g: G, b: B } = p;
      for (let i = 0; i < R.length; i++) {
        R[i] = (R[i] - pv) * c + pv;
        G[i] = (G[i] - pv) * c + pv;
        B[i] = (B[i] - pv) * c + pv;
      }
      return;
    }
    case 'brightness': {
      const [kr, kg, kb] = perChannel(op.amount, 1);
      const { r: R, g: G, b: B } = p;
      for (let i = 0; i < R.length; i++) {
        R[i] = R[i] * kr;
        G[i] = G[i] * kg;
        B[i] = B[i] * kb;
      }
      return;
    }
    case 'saturate': {
      const s = op.amount;
      const { r: R, g: G, b: B } = p;
      for (let i = 0; i < R.length; i++) {
        const r = R[i];
        const g = G[i];
        const b = B[i];
        const l = luma601(r, g, b);
        R[i] = l + (r - l) * s;
        G[i] = l + (g - l) * s;
        B[i] = l + (b - l) * s;
      }
      return;
    }
    case 'posterize': {
      const n = Math.max(2, Math.round(op.levels));
      const step = 256 / (n - 1);
      const q = (v: number) => Math.min(255, Math.round(clampByte(v) / step) * step);
      const { r: R, g: G, b: B } = p;
      for (let i = 0; i < R.length; i++) {
        R[i] = q(R[i]);
        G[i] = q(G[i]);
        B[i] = q(B[i]);
      }
      return;
    }
    case 'curve': {
      const gm = perChannel(op.gamma, 1);
      const lf = perChannel(op.lift, 0);
      const gn = perChannel(op.gain, 255);
      const f = (v: number, c: 0 | 1 | 2) =>
        lf[c] + (gn[c] - lf[c]) * (Math.max(0, Math.min(255, v)) / 255) ** gm[c];
      const { r: R, g: G, b: B } = p;
      for (let i = 0; i < R.length; i++) {
        R[i] = f(R[i], 0);
        G[i] = f(G[i], 1);
        B[i] = f(B[i], 2);
      }
      return;
    }
    case 'blur': {
      if (op.canvas) {
        canvasBlurOverlay(p, geo, op.radius, op.mix, op.brightness ?? 1);
        return;
      }
      const br = blurPlane(p.r, w, h, op.radius, !stacked);
      const bg = blurPlane(p.g, w, h, op.radius, !stacked);
      const bb = blurPlane(p.b, w, h, op.radius, !stacked);
      const k = op.brightness ?? 1;
      if (k !== 1) {
        for (let i = 0; i < br.length; i++) {
          br[i] = Math.min(255, br[i] * k);
          bg[i] = Math.min(255, bg[i] * k);
          bb[i] = Math.min(255, bb[i] * k);
        }
      }
      const mode = op.blend ?? 'normal';
      const a = op.mix;
      if (mode === 'normal') {
        const { r: R, g: G, b: B } = p;
        for (let i = 0; i < R.length; i++) {
          R[i] += (br[i] - R[i]) * a;
          G[i] += (bg[i] - G[i]) * a;
          B[i] += (bb[i] - B[i]) * a;
        }
        return;
      }
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
      if (op.sample === 'center') {
        mosaicCenter(p, geo, Math.max(1, op.size));
        return;
      }
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
      const d =
        op.kernel === 'forward' ? forwardEdge(p, w, h, stacked) : darkSide(p, w, h, stacked);
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
    case 'fill': {
      if (op.alpha <= 0) return;
      if ((op.blend ?? 'normal') === 'normal') {
        /* 一般混合：整片同一個不透明度（算式同 blendPlanes，不配置整張的不透明度圖） */
        const a = op.alpha;
        const [cr, cg, cb] = op.color;
        const { r: R, g: G, b: B } = p;
        for (let i = 0; i < R.length; i++) {
          const r = R[i];
          const g = G[i];
          const b = B[i];
          R[i] = r + (cr - r) * a;
          G[i] = g + (cg - g) * a;
          B[i] = b + (cb - b) * a;
        }
        return;
      }
      const A = new Float64Array(w * h).fill(op.alpha);
      blendPlanes(p, op.blend ?? 'normal', A, op.color);
      return;
    }
    case 'gradient': {
      if (op.space === 'pixel') {
        /* 畫布的線性漸層：px 座標、像素中心投影到起點→終點，色標查表 */
        const { idx, lut } = cachedIndex(op, geo, op.stops, (idx) => {
          const H = geo.fullH;
          const px0 = op.from[0] * w;
          const py0 = op.from[1] * H;
          const dx = (op.to[0] - op.from[0]) * w;
          const dy = (op.to[1] - op.from[1]) * H;
          const len2 = dx * dx + dy * dy || 1;
          for (let y = 0, i = 0; y < h; y++) {
            const ty = (geo.rowY(y) + 0.5 - py0) * dy;
            for (let x = 0; x < w; x++, i++) idx[i] = lutIndex(((x + 0.5 - px0) * dx + ty) / len2);
          }
        });
        paintIndexed(p, idx, lut, op.blend ?? 'normal');
        return;
      }
      const [x0, y0] = op.from;
      const [x1, y1] = op.to;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len2 = dx * dx + dy * dy || 1;
      const mode = op.blend ?? 'normal';
      const { ax, ay } = axes(geo);
      const { r: R, g: G, b: B } = p;
      const c: Paint = { r: 0, g: 0, b: 0, a: 0 };
      /* 每個像素取色後直接混合（不配置整張的暫存）；常用的三種模式各有專用的算式（與 blendChannel 相同） */
      const kind = mode === 'normal' ? 0 : mode === 'screen' ? 1 : mode === 'multiply' ? 2 : 3;
      for (let y = 0, i = 0; y < h; y++) {
        const ty = (ay[y] - y0) * dy;
        for (let x = 0; x < w; x++, i++) {
          const t = ((ax[x] - x0) * dx + ty) / len2;
          sampleStops(op.stops, Math.max(0, Math.min(1, t)), c);
          const a = c.a;
          if (a <= 0) continue;
          const r = R[i];
          const g = G[i];
          const b = B[i];
          if (kind === 0) {
            R[i] = r + (c.r - r) * a;
            G[i] = g + (c.g - g) * a;
            B[i] = b + (c.b - b) * a;
          } else if (kind === 1) {
            R[i] = r + (r + c.r - (r * c.r) / 255 - r) * a;
            G[i] = g + (g + c.g - (g * c.g) / 255 - g) * a;
            B[i] = b + (b + c.b - (b * c.b) / 255 - b) * a;
          } else if (kind === 2) {
            R[i] = r + ((r * c.r) / 255 - r) * a;
            G[i] = g + ((g * c.g) / 255 - g) * a;
            B[i] = b + ((b * c.b) / 255 - b) * a;
          } else {
            R[i] = r + (blendChannel(mode, r, c.r) - r) * a;
            G[i] = g + (blendChannel(mode, g, c.g) - g) * a;
            B[i] = b + (blendChannel(mode, b, c.b) - b) * a;
          }
        }
      }
      return;
    }
    case 'radial': {
      /* 畫布的同心圓放射狀漸層：半徑以畫面長邊計，像素中心的距離 → t，色標查表 */
      const { idx, lut } = cachedIndex(op, geo, op.stops, (idx) => {
        const H = geo.fullH;
        const M = Math.max(w, H);
        const cx = op.center[0] * w;
        const cy = op.center[1] * H;
        const r0 = (op.r0 ?? 0) * M;
        const span = Math.max(1e-6, op.r1 * M - r0);
        for (let y = 0, i = 0; y < h; y++) {
          const dy = geo.rowY(y) + 0.5 - cy;
          const dy2 = dy * dy;
          for (let x = 0; x < w; x++, i++) {
            const dx = x + 0.5 - cx;
            idx[i] = lutIndex((Math.sqrt(dx * dx + dy2) - r0) / span);
          }
        }
      });
      paintIndexed(p, idx, lut, op.blend ?? 'normal');
      return;
    }
    case 'glow': {
      const A = cachedAlpha(op, geo, (A) => {
        const [cx, cy] = op.center;
        const rx = Math.max(1e-6, op.radius);
        const ry = rx * (op.aspect ?? w / Math.max(1, geo.fullH));
        const k = op.falloff ?? 2;
        const { ax, ay } = axes(geo);
        const gx2 = ax.map((v) => ((v - cx) / rx) ** 2);
        for (let y = 0; y < h; y++) {
          const gy = (ay[y] - cy) / ry;
          const gy2 = gy * gy;
          /* 光團以外（距離 ≥ 1）不透明度是 0 */
          if (gy2 >= 1) continue;
          for (let x = 0, i = y * w; x < w; x++, i++) {
            const d2 = gx2[x] + gy2;
            if (d2 < 1) A[i] = op.alpha * (1 - Math.sqrt(d2) ** k) ** 2;
          }
        }
      });
      blendPlanes(p, op.blend ?? 'screen', A, op.color);
      return;
    }
    case 'vignette': {
      const A = cachedAlpha(op, geo, (A) => {
        const inner = op.inner ?? 0.5;
        const outer = op.outer ?? 1;
        const pw = op.power ?? 2;
        const span = Math.max(1e-6, outer - inner);
        const { ax, ay } = axes(geo);
        const vx2 = ax.map((v) => (v * 2 - 1) ** 2);
        for (let y = 0; y < h; y++) {
          const vy2 = (ay[y] * 2 - 1) ** 2;
          for (let x = 0, i = y * w; x < w; x++, i++) {
            /* 橢圓距離：中心 0、四角 1 */
            const d = Math.sqrt(vx2[x] + vy2) / Math.SQRT2;
            const t = Math.max(0, Math.min(1, (d - inner) / span));
            A[i] = op.amount * t ** pw;
          }
        }
      });
      blendPlanes(p, 'normal', A, op.color ?? [0, 0, 0]);
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
      const { r: R, g: G, b: B } = p;
      if (op.shape === 'uniform') {
        /* 均勻分布：(亂數 − 0.5) × 寬，寬＝amount·√12（標準差 amount） */
        const span = op.amount * Math.sqrt(12);
        for (let i = 0; i < R.length; i++) {
          const idx = stacked ? geo.rowY(Math.floor(i / w)) * w + (i % w) : i;
          if (op.mono) {
            const v = (hashUnit(seed, idx, 0) - 0.5) * span;
            R[i] += v;
            G[i] += v;
            B[i] += v;
          } else {
            R[i] += (hashUnit(seed, idx, 0) - 0.5) * span;
            G[i] += (hashUnit(seed, idx, 1) - 0.5) * span;
            B[i] += (hashUnit(seed, idx, 2) - 0.5) * span;
          }
        }
        return;
      }
      /* 三個均勻亂數相加 ≈ 常態，標準差 amount */
      const k = op.amount * 2;
      for (let i = 0; i < R.length; i++) {
        const idx = stacked ? geo.rowY(Math.floor(i / w)) * w + (i % w) : i;
        if (op.mono) {
          const v =
            (hashUnit(seed, idx, 0) + hashUnit(seed, idx, 3) + hashUnit(seed, idx, 6) - 1.5) * k;
          R[i] += v;
          G[i] += v;
          B[i] += v;
        } else {
          R[i] +=
            (hashUnit(seed, idx, 0) + hashUnit(seed, idx, 3) + hashUnit(seed, idx, 6) - 1.5) * k;
          G[i] +=
            (hashUnit(seed, idx, 1) + hashUnit(seed, idx, 4) + hashUnit(seed, idx, 7) - 1.5) * k;
          B[i] +=
            (hashUnit(seed, idx, 2) + hashUnit(seed, idx, 5) + hashUnit(seed, idx, 8) - 1.5) * k;
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

const inByte = (c: Rgb) => c.every((v) => v >= 0 && v <= 255);
const inUnit = (a: number) => a >= 0 && a <= 1;
const stopsInRange = (stops: readonly GradientStop[]) =>
  stops.every((s) => inByte(s.color) && inUnit(s.alpha));

/**
 * 輸入都在 0～255 時，輸出一定也在 0～255 的步驟（截斷是多餘的，跳過也逐位元組相同）：
 * 在迴圈裡就截斷的 matrix、搬移像素（shift、mosaic）、乘上 0～1（scanlines）、
 * 一般混合的疊層（r + (c − r)·a，c 在範圍內、a 在 0～1）、畫布式模糊副本（夾在 255·不透明度）。
 */
function keepsRange(op: FilterOp): boolean {
  switch (op.op) {
    case 'matrix':
    case 'shift':
    case 'mosaic':
      return true;
    case 'scanlines':
      return inUnit(op.dark);
    case 'fill':
      return (op.blend ?? 'normal') === 'normal' && inByte(op.color) && inUnit(op.alpha);
    case 'gradient':
    case 'radial':
      return (op.blend ?? 'normal') === 'normal' && stopsInRange(op.stops);
    case 'vignette':
      return inUnit(op.amount) && inByte(op.color ?? [0, 0, 0]);
    case 'blur':
      return !!op.canvas && inUnit(op.mix) && (op.brightness ?? 1) >= 0;
    default:
      return false;
  }
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
    /* 截斷在 0～255（與畫布上逐步處理的結果一致）；輸出一定在範圍內的步驟不必再掃一次 */
    if (keepsRange(op)) continue;
    const { r: R, g: G, b: B } = p;
    for (let i = 0; i < n; i++) {
      const r = R[i];
      const g = G[i];
      const b = B[i];
      if (r < 0) R[i] = 0;
      else if (r > 255) R[i] = 255;
      if (g < 0) G[i] = 0;
      else if (g > 255) G[i] = 255;
      if (b < 0) B[i] = 0;
      else if (b > 255) B[i] = 255;
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
