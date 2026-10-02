/**
 * 到達先後圖（arrival map）：每個像素一個 0～255 的「到達先後」，最早被蓋上的是 0、最晚的是 255。
 * 同一階的像素永遠同時變化；畫面由 render.ts 依「到達先後 → 透明度」的查表（256 項）畫出。
 *
 * 20 種形狀（scene-transition 規格 3.6）。比例以畫面的寬、高為準（與輸出尺寸無關），方塊、帶寬等以 px 計的參數另外註明。
 * 一般做法：先算每個像素的原始值，再依整張圖的最小、最大值正規化到 0～1，四捨五入成 256 階。
 */

import { profileAt, type ShapeKind, shapeRadialProfile } from '../shapes';
import { fbm2 } from '../timeline/noise';
import { createRandom, hashUnit } from '../timeline/random';

export type TransitionShape =
  | 'flat'
  | 'linear'
  | 'diagonal'
  | 'split'
  | 'blinds'
  | 'circle'
  | 'dissolve'
  | 'rotate'
  | 'wave'
  | 'ink'
  | 'drip'
  | 'clock'
  | 'spiral'
  | 'figure'
  | 'grid'
  | 'tear'
  | 'rain'
  | 'interlace'
  | 'rings'
  | 'hex';

export const TRANSITION_SHAPES: readonly TransitionShape[] = [
  'flat',
  'linear',
  'diagonal',
  'split',
  'blinds',
  'circle',
  'dissolve',
  'rotate',
  'wave',
  'ink',
  'drip',
  'clock',
  'spiral',
  'figure',
  'grid',
  'tear',
  'rain',
  'interlace',
  'rings',
  'hex',
];

/** 移動方向（畫面座標）：往右、往左、往下、往上、往右下（從左上角起）… */
export type Direction8 =
  | 'right'
  | 'left'
  | 'down'
  | 'up'
  | 'down-right'
  | 'down-left'
  | 'up-right'
  | 'up-left';

export const DIRECTIONS: readonly Direction8[] = [
  'right',
  'left',
  'down',
  'up',
  'down-right',
  'down-left',
  'up-right',
  'up-left',
];

export type WaveForm = 'sine' | 'saw' | 'square';
export type FigureKind = Extract<ShapeKind, 'star' | 'heart' | 'diamond' | 'square' | 'hexagon'>;
export type ClockKind = 'clockwise' | 'symmetric';
export type GridCell = 'square' | 'circle' | 'diamond';
export type CellOrder = 'direction' | 'center' | 'random' | 'alternate';

export interface ArrivalParams {
  /** linear、diagonal、wave、ink（沿方向）、grid／hex（沿方向） */
  direction?: Direction8;
  /** split、blinds：'vertical'＝上下（水平帶）、'horizontal'＝左右（垂直帶） */
  axis?: 'vertical' | 'horizontal';
  /** blinds（帶）、wave（波）、drip（液滴）、grid（橫向格數）、spiral（圈）、tear（帶）、rain（直欄）、interlace（線）、hex（橫向格數）、rings（環） */
  count?: number;
  /** 0～100：wave（起伏高度）、ink（不規則程度）、drip（液滴最大長度） */
  strength?: number;
  /** dissolve：方塊邊長（px） */
  blockSize?: number;
  /** circle：橢圓（配合畫面長寬） */
  ellipse?: boolean;
  /** 中心（0～1；circle、figure、clock、spiral、rings、ink 從中心、grid／hex 從中心） */
  center?: readonly [number, number];
  /** 花紋編號（dissolve、ink、drip、tear、rain、grid／hex 隨機） */
  seed?: number;
  /** wave 的波形 */
  wave?: WaveForm;
  /** figure 的圖形 */
  figure?: FigureKind;
  /** clock：順時針、左右對稱 */
  clock?: ClockKind;
  /** grid 每格長出的形狀 */
  cell?: GridCell;
  /** grid、hex 的出現順序 */
  order?: CellOrder;
  /** ink：'direction'（沿方向）或 'center'（從中心） */
  spread?: 'direction' | 'center';
  /** rotate：目前的角度（弧度，從水平順時針） */
  angle?: number;
}

export interface ArrivalMap {
  width: number;
  height: number;
  /** 每個像素的到達先後（0～255），列優先 */
  levels: Uint8Array;
  /** 整片（所有像素同一階）：透明度＝進度 × 255，不受柔和度影響 */
  flat: boolean;
}

/** 是否每一格都要重建（旋轉合攏：線跟著動作旋轉） */
export const isDynamicShape = (shape: TransitionShape): boolean => shape === 'rotate';

/** 各形狀用到哪些參數（給設定面板決定顯示哪些欄位） */
export function shapeParams(
  shape: TransitionShape,
  p: ArrivalParams = {},
): (keyof ArrivalParams)[] {
  switch (shape) {
    case 'linear':
    case 'diagonal':
      return ['direction'];
    case 'split':
      return ['axis'];
    case 'blinds':
      return ['axis', 'count'];
    case 'circle':
      return ['ellipse', 'center'];
    case 'dissolve':
      return ['blockSize', 'seed'];
    case 'rotate':
      return ['strength'];
    case 'wave':
      return ['wave', 'direction', 'count', 'strength'];
    case 'ink':
      return p.spread === 'center'
        ? ['spread', 'center', 'strength', 'seed']
        : ['spread', 'direction', 'strength', 'seed'];
    case 'drip':
      return ['count', 'strength', 'seed'];
    case 'clock':
      return ['clock', 'center'];
    case 'spiral':
      return ['count', 'center'];
    case 'figure':
      return ['figure', 'center'];
    case 'grid':
    case 'hex': {
      const base: (keyof ArrivalParams)[] = shape === 'grid' ? ['cell', 'order'] : ['order'];
      const o = p.order ?? 'direction';
      if (o === 'direction') base.push('direction');
      else if (o === 'center') base.push('center');
      else if (o === 'random') base.push('seed');
      base.push('count');
      return base;
    }
    case 'tear':
    case 'rain':
      return ['count', 'seed'];
    case 'interlace':
      return ['count'];
    case 'rings':
      return ['count', 'center'];
    default:
      return [];
  }
}

/** 各形狀「數量」的範圍與預設（scene-transition F15） */
export const SHAPE_COUNT_RANGE: Partial<Record<TransitionShape, readonly [number, number]>> = {
  blinds: [2, 40],
  wave: [1, 16],
  drip: [4, 60],
  grid: [3, 40],
  spiral: [1, 8],
  tear: [6, 60],
  rain: [8, 120],
  interlace: [8, 180],
  hex: [4, 40],
  rings: [2, 24],
};

/* ---------- 共用的座標 ---------- */

const isDiagonal = (d: Direction8) => d.includes('-');

/** 方向的單位向量（畫面座標） */
function dirVector(d: Direction8): [number, number] {
  const s = Math.SQRT1_2;
  switch (d) {
    case 'left':
      return [-1, 0];
    case 'down':
      return [0, 1];
    case 'up':
      return [0, -1];
    case 'down-right':
      return [s, s];
    case 'down-left':
      return [-s, s];
    case 'up-right':
      return [s, -s];
    case 'up-left':
      return [-s, -s];
    default:
      return [1, 0];
  }
}

/**
 * 沿方向的位置（0～1 之前的原始值）：
 * - 直向：起點那一側第一行／列是 0、終點側最後一行／列是 1；
 * - 斜向（corner＝true）：從起點角落算，水平與垂直位置（各 0～1）的平均（等到達線平行於另外兩個角落的連線）；
 * - 斜向（corner＝false）：沿 45° 方向的投影（真正的斜向直線擦除）。
 * 回傳 [沿方向, 沿邊界]（沿邊界：邊界方向上的位置 0～1，給波浪、鋸齒用）。
 */
function directional(
  d: Direction8,
  u: number,
  v: number,
  W: number,
  H: number,
  corner: boolean,
): [number, number] {
  if (!isDiagonal(d)) {
    switch (d) {
      case 'left':
        return [1 - u, v];
      case 'down':
        return [v, u];
      case 'up':
        return [1 - v, u];
      default:
        return [u, v];
    }
  }
  const fx = d.endsWith('right') ? u : 1 - u;
  const fy = d.startsWith('down') ? v : 1 - v;
  if (corner) return [(fx + fy) / 2, (fx - fy + 1) / 2];
  const [dx, dy] = dirVector(d);
  const x = u * (W - 1);
  const y = v * (H - 1);
  return [x * dx + y * dy, (x * -dy + y * dx) / Math.max(W, H)];
}

/** 正規化成 0～255（依最小、最大值；全部相同時都是 0） */
function quantize(raw: Float32Array, normalize: boolean): Uint8Array {
  let lo = Infinity;
  let hi = -Infinity;
  if (normalize) {
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  } else {
    lo = 0;
    hi = 1;
  }
  const out = new Uint8Array(raw.length);
  const span = hi - lo;
  if (!(span > 0)) return out;
  const k = 255 / span;
  for (let i = 0; i < raw.length; i++) {
    const v = Math.round((raw[i] - lo) * k);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/**
 * 中心（像素座標）：0～1 對應第一個到最後一個像素（640 寬、0.5 → 319.5）。
 * 圓形用 edge＝true：0～1 對應畫面的邊（0.5 → 320），與附件的量測一致。
 */
const centerOf = (p: ArrivalParams, W: number, H: number, edge = false): [number, number] => {
  const [cx, cy] = p.center ?? [0.5, 0.5];
  return edge ? [cx * W, cy * H] : [cx * (W - 1), cy * (H - 1)];
};

/** 中心到最遠角落的距離 */
const farthestCorner = (cx: number, cy: number, W: number, H: number) =>
  Math.max(
    Math.hypot(cx, cy),
    Math.hypot(W - 1 - cx, cy),
    Math.hypot(cx, H - 1 - cy),
    Math.hypot(W - 1 - cx, H - 1 - cy),
  );

/** 以正上方為 0、順時針一圈為 1 的角度 */
const turnFromTop = (dx: number, dy: number) => {
  const a = Math.atan2(dx, -dy) / (Math.PI * 2);
  return a < 0 ? a + 1 : a;
};

/** 除以最大值（從中心往外的形狀：中心是 0、最遠的像素是 1） */
function divideByMax(raw: Float32Array): void {
  let max = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] > max) max = raw[i];
  if (max > 0) for (let i = 0; i < raw.length; i++) raw[i] /= max;
}

/* ---------- 各形狀 ---------- */

type Fill = (raw: Float32Array, W: number, H: number, p: ArrivalParams) => boolean;

/** 逐像素：f(x, y) → 原始值 */
function perPixel(raw: Float32Array, W: number, H: number, f: (x: number, y: number) => number) {
  for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) raw[i] = f(x, y);
}

const linearFill =
  (corner: boolean): Fill =>
  (raw, W, H, p) => {
    const d = p.direction ?? (corner ? 'down-right' : 'right');
    const useCorner = corner && isDiagonal(d);
    const kx = 1 / Math.max(1, W - 1);
    const ky = 1 / Math.max(1, H - 1);
    perPixel(raw, W, H, (x, y) => directional(d, x * kx, y * ky, W, H, useCorner)[0]);
    return true;
  };

const FILLS: Record<Exclude<TransitionShape, 'flat'>, Fill> = {
  linear: linearFill(false),
  diagonal: linearFill(true),

  split: (raw, W, H, p) => {
    const vertical = (p.axis ?? 'vertical') === 'vertical';
    perPixel(raw, W, H, (x, y) => (vertical ? Math.min(y, H - 1 - y) : Math.min(x, W - 1 - x)));
    return true;
  },

  blinds: (raw, W, H, p) => {
    const vertical = (p.axis ?? 'vertical') === 'vertical';
    const n = Math.max(1, Math.round(p.count ?? 10));
    const band = (vertical ? H : W) / n;
    perPixel(raw, W, H, (x, y) => {
      /* 每條帶的第一行是 0、最後一行是 1（同直線擦除）；帶高可以是小數 */
      const pos = vertical ? y : x;
      const local = (pos - Math.floor(pos / band) * band) / Math.max(1, band - 1);
      return Math.min(1, local);
    });
    return false;
  },

  circle: (raw, W, H, p) => {
    const [cx, cy] = centerOf(p, W, H, true);
    if (p.ellipse) {
      /* 橢圓：水平全程＝中心到左右較遠一邊 × √2（剛好通過最遠的角落），垂直同理 */
      const rx = Math.max(cx, W - cx) * Math.SQRT2 || 1;
      const ry = Math.max(cy, H - cy) * Math.SQRT2 || 1;
      perPixel(raw, W, H, (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry));
    } else perPixel(raw, W, H, (x, y) => Math.hypot(x - cx, y - cy));
    divideByMax(raw);
    return false;
  },

  dissolve: (raw, W, H, p) => {
    const size = Math.max(1, p.blockSize ?? 1);
    const cols = Math.max(1, Math.floor(W / size));
    const rows = Math.max(1, Math.floor(H / size));
    const bw = W / cols;
    const bh = H / rows;
    const seed = (p.seed ?? 7) | 0;
    const colOf = new Int32Array(W);
    for (let x = 0; x < W; x++) colOf[x] = Math.min(cols - 1, Math.floor(x / bw));
    for (let y = 0, i = 0; y < H; y++) {
      const r = Math.min(rows - 1, Math.floor(y / bh));
      for (let x = 0; x < W; x++, i++) raw[i] = hashUnit(seed * 7919 + 1, colOf[x], r);
    }
    return false;
  },

  rotate: (raw, W, H, p) => {
    const a = p.angle ?? 0;
    const cx = (W - 1) / 2;
    const cy = (H - 1) / 2;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const dist = (x: number, y: number) => Math.abs((x - cx) * nx + (y - cy) * ny);
    const far = Math.max(dist(0, 0), dist(W - 1, 0), dist(0, H - 1), dist(W - 1, H - 1)) || 1;
    perPixel(raw, W, H, (x, y) => 1 - dist(x, y) / far);
    return false;
  },

  wave: (raw, W, H, p) => {
    const d = p.direction ?? 'right';
    const n = Math.max(1, p.count ?? 3);
    const amp = (Math.max(0, Math.min(100, p.strength ?? 50)) / 100) * 0.3;
    const form = p.wave ?? 'sine';
    const shape = (q: number) => {
      const ph = q * n;
      if (form === 'saw') {
        const f = ph - Math.floor(ph);
        return (f < 0.5 ? f * 4 - 1 : 3 - f * 4) / 2;
      }
      const s = Math.sin(ph * Math.PI * 2);
      if (form === 'square') return Math.max(-1, Math.min(1, s * 2.5)) / 2;
      return s / 2;
    };
    const kx = 1 / Math.max(1, W - 1);
    const ky = 1 / Math.max(1, H - 1);
    const diag = isDiagonal(d);
    perPixel(raw, W, H, (x, y) => {
      const [b, q] = directional(d, x * kx, y * ky, W, H, true);
      /* 斜向時邊界方向上的位置換成實際長度比例，波的數量才是「沿邊界」數 */
      return b + amp * (diag ? 0.5 : 1) * shape(q);
    });
    return true;
  },

  ink: (raw, W, H, p) => {
    const strength = Math.max(0, Math.min(100, p.strength ?? 50)) / 100;
    const seed = (p.seed ?? 7) | 0;
    const kx = 1 / Math.max(1, W - 1);
    const ky = 1 / Math.max(1, H - 1);
    const fromCenter = p.spread === 'center';
    const [cx, cy] = centerOf(p, W, H);
    const R = farthestCorner(cx, cy, W, H) || 1;
    const d = p.direction ?? 'right';
    /* 雜訊：1 單位＝畫面高的 1/3（最大的團塊），5 層到約 1/48；在粗一點的格點上算再內插（大圖也快） */
    const unit = H / 3;
    const step = Math.max(1, Math.round(H / 360));
    const gw = Math.ceil(W / step) + 2;
    const gh = Math.ceil(H / step) + 2;
    const field = (s: number, u: number, octaves: number) => {
      const g = new Float32Array(gw * gh);
      for (let j = 0; j < gh; j++)
        for (let i = 0; i < gw; i++)
          g[j * gw + i] = fbm2(s, (i * step) / u, (j * step) / u, { octaves });
      return (x: number, y: number) => {
        const fx = x / step;
        const fy = y / step;
        const i = Math.floor(fx);
        const j = Math.floor(fy);
        const tx = fx - i;
        const ty = fy - j;
        const o = j * gw + i;
        const top = g[o] + (g[o + 1] - g[o]) * tx;
        const bot = g[o + gw] + (g[o + gw + 1] - g[o + gw]) * tx;
        return top + (bot - top) * ty;
      };
    };
    const noise = field(seed, unit, 5);
    /* 零星的島狀斑點：較小尺度的雜訊超過門檻的地方提早到達（比主要的邊界更前面） */
    const islands = field(seed + 101, H / 10, 3);
    const T = 0.72;
    const K = 1.5;
    /* 強度 100 時主要邊界的起伏約 ±0.15（640 寬、往右、50% 時約 70 px 寬） */
    const amp = strength * 0.3;
    perPixel(raw, W, H, (x, y) => {
      const base = fromCenter
        ? Math.hypot(x - cx, y - cy) / R
        : directional(d, x * kx, y * ky, W, H, true)[0];
      const isl = Math.max(0, islands(x, y) - T) / (1 - T);
      return base + amp * (noise(x, y) - 0.5) - amp * K * isl;
    });
    return true;
  },

  drip: (raw, W, H, p) => {
    const n = Math.max(1, Math.round(p.count ?? 22));
    const strength = Math.max(0, Math.min(100, p.strength ?? 60));
    const rnd = createRandom(`drip:${p.seed ?? 7}`);
    const maxLen = strength * 0.0055;
    /* 主前緣：約 3% 畫面高的平緩起伏（兩個頻率的正弦） */
    const ph1 = rnd.next() * Math.PI * 2;
    const ph2 = rnd.next() * Math.PI * 2;
    const front = (u: number) =>
      0.015 *
      (Math.sin(u * Math.PI * 2 * 1.7 + ph1) * 0.6 + Math.sin(u * Math.PI * 2 * 4.3 + ph2) * 0.4);
    /* 液滴：位置、寬（0.8%～2.8% 畫面寬）、長（最大長度的 25%～100%；最長的一條固定是最大長度的 80%） */
    const drops = Array.from({ length: n }, (_, i) => ({
      x: rnd.next(),
      w: 0.008 + rnd.next() * 0.02,
      len: maxLen * (0.25 + 0.75 * rnd.next()),
      i,
    }));
    const longest = drops.reduce((m, dr) => (dr.len > m.len ? dr : m), drops[0]);
    const scale = longest && longest.len > 0 ? (maxLen * 0.8) / longest.len : 1;
    for (const dr of drops) dr.len *= scale;
    const lead = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const u = x / Math.max(1, W - 1);
      let best = 0;
      for (const dr of drops) {
        const half = dr.w / 2;
        const dx = Math.abs(u - dr.x);
        if (dx >= half) continue;
        /* 手指形：中間最長、兩側圓頭 */
        const k = Math.sqrt(1 - (dx / half) ** 2);
        const l = dr.len * (0.75 + 0.25 * k) - (1 - k) * dr.w * (W / H) * 0.5;
        if (l > best) best = l;
      }
      lead[x] = best - front(u);
    }
    const ky = 1 / Math.max(1, H - 1);
    perPixel(raw, W, H, (x, y) => y * ky - lead[x]);
    return true;
  },

  clock: (raw, W, H, p) => {
    const [cx, cy] = centerOf(p, W, H);
    const sym = p.clock === 'symmetric';
    perPixel(raw, W, H, (x, y) => {
      const t = turnFromTop(x - cx, y - cy);
      return sym ? (t > 0.5 ? 1 - t : t) * 2 : t;
    });
    return false;
  },

  spiral: (raw, W, H, p) => {
    const n = Math.max(1, p.count ?? 3);
    const [cx, cy] = centerOf(p, W, H);
    const R = farthestCorner(cx, cy, W, H) || 1;
    perPixel(raw, W, H, (x, y) => {
      const r = Math.hypot(x - cx, y - cy) / R;
      return (n * (1 - r) + turnFromTop(x - cx, y - cy)) / (n + 1);
    });
    return true;
  },

  figure: (raw, W, H, p) => {
    const [cx, cy] = centerOf(p, W, H);
    const kind = p.figure ?? 'star';
    const profile = shapeRadialProfile(kind, { innerRatio: 0.42 }, 1440);
    perPixel(raw, W, H, (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      return Math.hypot(dx, dy) / profileAt(profile, Math.atan2(dy, dx));
    });
    divideByMax(raw);
    return false;
  },

  grid: (raw, W, H, p) => {
    const cols = Math.max(1, Math.round(p.count ?? 10));
    const rows = Math.max(1, Math.round((cols * H) / W));
    const cw = W / cols;
    const ch = H / rows;
    const cell = p.cell ?? 'square';
    const order = cellOrder(
      p,
      cols * rows,
      (k) => {
        const i = k % cols;
        const j = Math.floor(k / cols);
        return [(i + 0.5) * cw, (j + 0.5) * ch, (i + j) % 2];
      },
      W,
      H,
    );
    perPixel(raw, W, H, (x, y) => {
      const i = Math.min(cols - 1, Math.floor(x / cw));
      const j = Math.min(rows - 1, Math.floor(y / ch));
      const dx = Math.abs(x + 0.5 - (i + 0.5) * cw) / (cw / 2);
      const dy = Math.abs(y + 0.5 - (j + 0.5) * ch) / (ch / 2);
      const local =
        cell === 'circle'
          ? Math.hypot(dx, dy) / Math.SQRT2
          : cell === 'diamond'
            ? (dx + dy) / 2
            : Math.max(dx, dy);
      return order.arrive(j * cols + i, Math.min(1, local));
    });
    return false;
  },

  tear: (raw, W, H, p) => {
    const n = Math.max(1, Math.round(p.count ?? 26));
    const rnd = createRandom(`tear:${p.seed ?? 7}`);
    const mean = H / n;
    const bands: { y0: number; y1: number; start: number; fromLeft: boolean; jag: number[] }[] = [];
    let y = 0;
    while (y < H) {
      const h = Math.max(1, mean * (0.25 + 1.5 * rnd.next()));
      bands.push({
        y0: y,
        y1: Math.min(H, y + h),
        start: rnd.next() * 0.7,
        fromLeft: rnd.next() < 0.5,
        jag: Array.from({ length: 14 }, () => (rnd.next() * 2 - 1) * 0.06),
      });
      y += h;
    }
    const kx = 1 / Math.max(1, W - 1);
    let b = 0;
    for (let yy = 0, i = 0; yy < H; yy++) {
      while (b < bands.length - 1 && yy >= bands[b].y1) b++;
      const band = bands[b];
      const seg = Math.min(13, Math.floor(((yy - band.y0) / Math.max(1, band.y1 - band.y0)) * 14));
      for (let x = 0; x < W; x++, i++) {
        const u = band.fromLeft ? x * kx : 1 - x * kx;
        const local = Math.max(0, Math.min(1, (u + band.jag[seg] + 0.06) / 1.12));
        raw[i] = band.start + 0.3 * local;
      }
    }
    return true;
  },

  rain: (raw, W, H, p) => {
    const cols = Math.max(1, Math.round(p.count ?? 48));
    const side = W / cols;
    const rows = Math.max(1, Math.ceil(H / side));
    const rnd = createRandom(`rain:${p.seed ?? 7}`);
    const start = Array.from({ length: cols }, () => rnd.next() * 0.45);
    const seed = (p.seed ?? 7) | 0;
    const gap = side >= 6 ? side * 0.08 : 0;
    for (let y = 0, i = 0; y < H; y++) {
      const j = Math.min(rows - 1, Math.floor(y / side));
      const oy = y + 0.5 - j * side;
      const inGapY = gap > 0 && (oy < gap || oy > side - gap);
      for (let x = 0; x < W; x++, i++) {
        const c = Math.min(cols - 1, Math.floor(x / side));
        const ox = x + 0.5 - c * side;
        if (inGapY || (gap > 0 && (ox < gap || ox > side - gap))) {
          raw[i] = 1;
          continue;
        }
        const jitter = (hashUnit(seed, c, j) - 0.5) * 0.04;
        raw[i] = Math.max(0, Math.min(0.995, start[c] + 0.53 * ((j + 0.5) / rows) + jitter));
      }
    }
    return false;
  },

  interlace: (raw, W, H, p) => {
    const n = Math.max(1, Math.round(p.count ?? 72));
    const lh = H / n;
    const ky = 1 / Math.max(1, H - 1);
    /* 第 1、3、5…條（i 為偶數）在前半段、其餘在後半段，各自由上往下（線內也逐行推進） */
    perPixel(raw, W, H, (_x, y) => {
      const i = Math.min(n - 1, Math.floor(y / lh));
      return (i % 2) * 0.5 + y * ky * 0.5;
    });
    return false;
  },

  rings: (raw, W, H, p) => {
    const n = Math.max(1, Math.round(p.count ?? 8));
    const [cx, cy] = centerOf(p, W, H);
    const R = farthestCorner(cx, cy, W, H) || 1;
    perPixel(raw, W, H, (x, y) => {
      const r = Math.min(1, Math.hypot(x - cx, y - cy) / R);
      const ring = Math.min(n - 1, Math.floor(r * n));
      return (ring % 2) * 0.5 + r * 0.5;
    });
    return false;
  },

  hex: (raw, W, H, p) => {
    const n = Math.max(1, p.count ?? 14);
    const R = W / (n * 1.5);
    const A = (Math.sqrt(3) / 2) * R;
    /* 平頂六角格：欄距 1.5R、列距 2A，奇數欄往下 A */
    const colsN = Math.ceil(W / (1.5 * R)) + 2;
    const rowsN = Math.ceil(H / (2 * A)) + 2;
    const centerOfCell = (q: number, r: number): [number, number] => [
      q * 1.5 * R,
      r * 2 * A + (q & 1 ? A : 0),
    ];
    const index = (q: number, r: number) => (r + 1) * (colsN + 2) + (q + 1);
    const count = (colsN + 2) * (rowsN + 2);
    const order = cellOrder(
      p,
      count,
      (k) => {
        const q = (k % (colsN + 2)) - 1;
        const r = Math.floor(k / (colsN + 2)) - 1;
        const [x, y] = centerOfCell(q, r);
        /* 三組：立方座標 (x − y) mod 3 */
        const cz = r - (q - (q & 1)) / 2;
        return [x, y, (((q - cz) % 3) + 3) % 3];
      },
      W,
      H,
      3,
      (x, y) => x > -R && x < W + R && y > -A && y < H + A,
    );
    perPixel(raw, W, H, (x, y) => {
      /* 找最近的六角格中心（檢查附近的格子） */
      const q0 = Math.round(x / (1.5 * R));
      let best = Infinity;
      let bq = 0;
      let br = 0;
      for (let q = q0 - 1; q <= q0 + 1; q++) {
        const off = q & 1 ? A : 0;
        const r0 = Math.round((y - off) / (2 * A));
        for (let r = r0 - 1; r <= r0 + 1; r++) {
          const [hx, hy] = centerOfCell(q, r);
          const d = (x - hx) ** 2 + (y - hy) ** 2;
          if (d < best) {
            best = d;
            bq = q;
            br = r;
          }
        }
      }
      const [hx, hy] = centerOfCell(bq, br);
      const dx = Math.abs(x - hx);
      const dy = Math.abs(y - hy);
      const local = Math.min(1, Math.max(dy / A, (dx * (Math.sqrt(3) / 2) + dy / 2) / A));
      return order.arrive(index(bq, br), local);
    });
    return false;
  },
};

/**
 * 格子類的出現順序：每格一個開始時間（0～1），錯開佔 60%、自己長滿佔 40%；
 * 交錯分組：groups 組依序（各佔 1/groups，組內同時長滿）。
 */
function cellOrder(
  p: ArrivalParams,
  count: number,
  cellAt: (k: number) => [number, number, number],
  W: number,
  H: number,
  groups = 2,
  visible: (x: number, y: number) => boolean = () => true,
): { arrive: (k: number, local: number) => number } {
  const order = p.order ?? 'direction';
  if (order === 'alternate') {
    return {
      arrive: (k, local) => (cellAt(k)[2] + local) / groups,
    };
  }
  const start = new Float32Array(count);
  const seed = (p.seed ?? 7) | 0;
  const d = p.direction ?? 'right';
  const [cx, cy] = centerOf(p, W, H);
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < count; k++) {
    const [x, y] = cellAt(k);
    let v: number;
    if (order === 'random') v = hashUnit(seed * 31 + 5, k, 17);
    else if (order === 'center') v = Math.hypot(x - cx, y - cy);
    else {
      const u = Math.max(0, Math.min(1, x / Math.max(1, W - 1)));
      const w = Math.max(0, Math.min(1, y / Math.max(1, H - 1)));
      v = directional(d, u, w, W, H, true)[0];
    }
    start[k] = v;
    if (visible(x, y)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = hi - lo || 1;
  for (let k = 0; k < count; k++) start[k] = Math.max(0, Math.min(1, (start[k] - lo) / span));
  return { arrive: (k, local) => 0.6 * start[k] + 0.4 * local };
}

/**
 * 建立到達先後圖。
 *
 * ```ts
 * const map = buildArrivalMap('circle', 480, 270, { ellipse: false, center: [0.5, 0.5] });
 * drawTransition(ctx, map, { progress: 0.4, mode: 'cover', softness: 12, color: '#000000' });
 * ```
 */
export function buildArrivalMap(
  shape: TransitionShape,
  width: number,
  height: number,
  params: ArrivalParams = {},
): ArrivalMap {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  if (shape === 'flat') return { width: W, height: H, levels: new Uint8Array(W * H), flat: true };
  const raw = new Float32Array(W * H);
  const normalize = (FILLS[shape] ?? FILLS.linear)(raw, W, H, params);
  return { width: W, height: H, levels: quantize(raw, normalize), flat: false };
}
