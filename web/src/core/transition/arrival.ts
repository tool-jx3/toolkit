/**
 * 到達先後圖（arrival map）：每個像素一個 0～255 的「到達先後」，最早被蓋上的是 0、最晚的是 255。
 * 同一階的像素永遠同時變化；畫面由 render.ts 依「到達先後 → 透明度」的查表（256 項）畫出。
 *
 * 20 種形狀（scene-transition 規格 3.6）。比例以畫面的寬、高為準（與輸出尺寸無關），方塊、帶寬等以 px 計的參數另外註明。
 * 各形狀的公式照原作（scene-transition 的 app.v6.js）：先算每個像素的原始值，再依整張圖的最小、最大值正規化到 0～1，
 * 四捨五入成 256 階；原作直接取 256 階的形狀（兩側合攏、百葉窗、圓形、旋轉合攏、方塊溶解）不再拉滿，以 ArrivalMap.range 記下實際範圍。
 */

import { profileAt, type ShapeKind, shapeRadialProfile } from '../shapes';
import { createRandom } from '../timeline/random';

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
  /**
   * levels 實際用到的範圍 [最小, 最大]（不給＝[0, 255]）。兩側合攏、百葉窗、旋轉合攏照原作先取 256 階、
   * 不再拉滿（例如偶數行的兩側合攏最大 254），查表時以這個範圍為全程（transitionLut 的 range）。
   */
  range?: readonly [number, number];
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
 * edge＝true：0～1 對應畫面的邊（0.5 → 320），同原作（圓形、時鐘、螺旋、同心環、暈染）。
 */
const centerOf = (p: ArrivalParams, W: number, H: number, edge = false): [number, number] => {
  const [cx, cy] = p.center ?? [0.5, 0.5];
  return edge ? [cx * W, cy * H] : [cx * (W - 1), cy * (H - 1)];
};

/** 中心（畫面座標，0～W、0～H）到畫面四個角的最遠距離 */
const farthestEdgeCorner = (cx: number, cy: number, W: number, H: number) =>
  Math.max(
    Math.hypot(cx, cy),
    Math.hypot(W - cx, cy),
    Math.hypot(cx, H - cy),
    Math.hypot(W - cx, H - cy),
  ) || 1;

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

/*
 * 花紋用的格點雜湊與值雜訊（暈染、垂流、撕裂帶、方塊雨、六角格的隨機順序；方塊溶解與格子用 createRandom＝原作的 mulberry32）：演算法與常數照原作，
 * 同一個花紋編號得到和原作相同的花紋，覆蓋率曲線、邊界的不規則幅度等統計自然一致（規格 3.10-2）。
 */

/** 整數格點（x, y）＋種子 → [0, 1) */
function latticeHash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 平滑的值雜訊 0～1（1 單位＝1 格，格點之間以 smoothstep 權重內插） */
function latticeNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = latticeHash(xi, yi, seed);
  const b = latticeHash(xi + 1, yi, seed);
  const c = latticeHash(xi, yi + 1, seed);
  const d = latticeHash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** 五層值雜訊 0～1：大尺度成團、小尺度破碎（每層頻率 ×2、振幅 ×0.5，各層種子 +101） */
function latticeFbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 5; o++) {
    sum += amp * latticeNoise(x * freq, y * freq, seed + o * 101);
    amp *= 0.5;
    freq *= 2;
  }
  return sum / 0.96875;
}

/* ---------- 各形狀 ---------- */

/**
 * 填入每個像素的原始值。回傳：true＝依整張圖的最小、最大值正規化到 0～255；false＝原始值已是 0～1；
 * 'levels'＝原始值已是 0～255 的整數階（不再正規化，查表以實際的最小、最大值為全程，同原作）。
 */
type Fill = (raw: Float32Array, W: number, H: number, p: ArrivalParams) => boolean | 'levels';

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
    if (useCorner) {
      /*
       * 斜線擦除：水平、垂直各自先取 256 階再平均（無條件捨去），與原作相同。
       * 同一列的階數成段重複，壓縮後的檔案比直接平均小（scene-transition 的 1.5 倍上限）。
       */
      const fromRight = d.endsWith('left');
      const fromBottom = d.startsWith('up');
      const col = Array.from({ length: W }, (_, x) =>
        Math.round(255 * (fromRight ? 1 - x * kx : x * kx)),
      );
      const row = Array.from({ length: H }, (_, y) =>
        Math.round(255 * (fromBottom ? 1 - y * ky : y * ky)),
      );
      perPixel(raw, W, H, (x, y) => (col[x] + row[y]) >> 1);
      return true;
    }
    perPixel(raw, W, H, (x, y) => directional(d, x * kx, y * ky, W, H, useCorner)[0]);
    return true;
  };

const FILLS: Record<Exclude<TransitionShape, 'flat'>, Fill> = {
  linear: linearFill(false),
  diagonal: linearFill(true),

  split: (raw, W, H, p) => {
    const vertical = (p.axis ?? 'vertical') === 'vertical';
    /* 兩緣 0、中央 255 的三角形（256 階；偶數行時中央最大只有 254，查表以實際範圍為全程，同原作） */
    const n = vertical ? H : W;
    const line = new Float32Array(n);
    for (let i = 0; i < n; i++)
      line[i] = Math.round(255 * (1 - Math.abs((2 * i) / Math.max(1, n - 1) - 1)));
    perPixel(raw, W, H, (x, y) => line[vertical ? y : x]);
    return 'levels';
  },

  blinds: (raw, W, H, p) => {
    const vertical = (p.axis ?? 'vertical') === 'vertical';
    const n = Math.max(1, Math.round(p.count ?? 10));
    const band = (vertical ? H : W) / n;
    /*
     * 帶內的位置＝(第幾行 mod 帶高) ÷ 帶高，取 256 階；查表以整張圖實際的最大值為全程（同原作）。
     * 帶高可以是小數：各帶的第一行不一定剛好是 0，最後一行也不一定一樣；整數帶高時等於「每條帶第一行 0、最後一行 1」。
     */
    const line = new Float32Array(vertical ? H : W);
    for (let i = 0; i < line.length; i++) line[i] = Math.round(255 * ((i % band) / band));
    perPixel(raw, W, H, (x, y) => line[vertical ? y : x]);
    return 'levels';
  },

  circle: (raw, W, H, p) => {
    /*
     * 正圓：以「中心到最遠角落的距離」為全程；橢圓：水平全程＝中心到左右較遠一邊 × √2（剛好通過最遠的角落），垂直同理。
     * 取 256 階（超過全程的地方是 255），查表以實際的範圍為全程。同原作。
     */
    const [cx, cy] = centerOf(p, W, H, true);
    const rx = p.ellipse
      ? Math.max(cx, W - cx) * Math.SQRT2 || 1
      : farthestEdgeCorner(cx, cy, W, H);
    const ry = p.ellipse ? Math.max(cy, H - cy) * Math.SQRT2 || 1 : rx;
    perPixel(raw, W, H, (x, y) =>
      Math.min(255, Math.round(255 * Math.hypot((x - cx) / rx, (y - cy) / ry))),
    );
    return 'levels';
  },

  dissolve: (raw, W, H, p) => {
    /*
     * 畫面切成邊長約「方塊大小」px 的方塊（橫向塊數＝寬 ÷ 方塊大小 無條件捨去，縱向同理，方塊略放大以剛好排滿），
     * 每塊依花紋編號的亂數分到一個 256 階的到達先後（同原作：同一編號同花紋），查表以實際的最小、最大值為全程。
     */
    const size = Math.max(1, p.blockSize ?? 1);
    const cols = Math.max(1, Math.floor(W / size));
    const rows = Math.max(1, Math.floor(H / size));
    const rnd = createRandom((p.seed ?? 7) | 0);
    const cells = new Uint8Array(cols * rows);
    for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(rnd.next() * 256);
    const colOf = new Int32Array(W);
    for (let x = 0; x < W; x++) colOf[x] = Math.min(cols - 1, Math.floor((x * cols) / W));
    for (let y = 0, i = 0; y < H; y++) {
      const row = Math.min(rows - 1, Math.floor((y * rows) / H)) * cols;
      for (let x = 0; x < W; x++, i++) raw[i] = cells[row + colOf[x]];
    }
    return 'levels';
  },

  rotate: (raw, W, H, p) => {
    /*
     * 兩條帶往一條穿過畫面中心、角度為 angle 的線合攏（同兩側合攏）。以該角度下最遠的角落為全程（開始時剛好全透明）；
     * 以像素中心量距離，取 256 階；查表以整張圖實際的最小、最大值為全程（同原作）。
     */
    const a = p.angle ?? 0;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const reach = Math.abs(nx) * (W / 2) + Math.abs(ny) * (H / 2) || 1;
    perPixel(raw, W, H, (x, y) => {
      const d = Math.abs((x + 0.5 - W / 2) * nx + (y + 0.5 - H / 2) * ny);
      return Math.max(0, Math.round(255 * (1 - d / reach)));
    });
    return 'levels';
  },

  wave: (raw, W, H, p) => {
    const d = p.direction ?? 'right';
    const n = Math.max(1, p.count ?? 3);
    /* 起伏（峰到谷）＝強度 ÷ 100 × 0.3 的全程；八個方向都一樣（斜向同斜線擦除，從角落起算） */
    const amp = (Math.max(0, Math.min(100, p.strength ?? 50)) / 100) * 0.3;
    const form = p.wave ?? 'sine';
    /* 波形 −0.5～0.5：圓滑波＝正弦；鋸齒＝三角波；方波＝tanh(5·sin)（圓角方波，兩段平台），同原作 */
    const shape = (q: number) => {
      const ph = q * n;
      if (form === 'saw') {
        const f = ph - Math.floor(ph);
        return (f < 0.5 ? f * 4 - 1 : 3 - f * 4) / 2;
      }
      const s = Math.sin(ph * Math.PI * 2);
      if (form === 'square') return Math.tanh(5 * s) / 2;
      return s / 2;
    };
    /* 以像素中心的位置計算（同原作；方波的斜坡很陡，差半個像素就會差幾階） */
    perPixel(raw, W, H, (x, y) => {
      const [b, q] = directional(d, (x + 0.5) / W, (y + 0.5) / H, W, H, true);
      return b + amp * shape(q);
    });
    return true;
  },

  ink: (raw, W, H, p) => {
    const strength = Math.max(0, Math.min(100, p.strength ?? 50)) / 100;
    const seed = (p.seed ?? 7) | 0;
    const fromCenter = p.spread === 'center';
    /* 以像素中心計算；中心 0～1 對應畫面的邊，以最遠的角落為全程（同原作） */
    const [cx, cy] = centerOf(p, W, H, true);
    const R = farthestEdgeCorner(cx, cy, W, H);
    const d = p.direction ?? 'right';
    const aspect = W / H;
    /*
     * 起伏＝強度 ÷ 100 × 0.6 ×（雜訊 − 0.5），同原作：雜訊是五層值雜訊（1 單位＝畫面高的 1/3，最大的團塊；
     * 細節到約 1/48）。強度 100 時邊界前後約 ±0.3 的全程；雜訊高的地方比主要的邊界更早到達，形成零星的島狀斑點。
     */
    const amp = strength * 0.6;
    perPixel(raw, W, H, (x, y) => {
      const u = (x + 0.5) / W;
      const v = (y + 0.5) / H;
      const base = fromCenter
        ? Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R
        : directional(d, u, v, W, H, true)[0];
      return base + amp * (latticeFbm(u * aspect * 3, v * 3, seed) - 0.5);
    });
    return true;
  },

  drip: (raw, W, H, p) => {
    /*
     * 由上往下蓋。主前緣是略為起伏（約 3% 畫面高）的水平線；「數量」條液滴（像手指，末端圓頭）比主前緣先垂下：
     * 位置隨機、半寬 0.4%～1.4% 畫面寬、長度＝最大長度 ×（25%～100%），最大長度＝強度 × 0.55% 個畫面高。
     * 同原作（同一個花紋編號得到相同的液滴），最後依整張圖的最小、最大值正規化。
     */
    const seed = (p.seed ?? 7) | 0;
    const rnd = createRandom(seed);
    const length = (Math.max(0, Math.min(100, p.strength ?? 60)) / 100) * 0.55;
    const aspect = W / H;
    const drops = Array.from({ length: Math.max(1, Math.round(p.count ?? 22)) }, () => ({
      at: rnd.next(),
      half: 0.004 + rnd.next() * 0.01,
      reach: 0.25 + 0.75 * rnd.next(),
    }));
    const lead = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      let e = 0.03 * latticeNoise(u * 8, 0.5, seed);
      for (const d of drops) {
        const du = Math.abs(u - d.at) / d.half;
        if (du >= 1) continue;
        /* 末端是半徑＝半寬的圓頭（以畫面高計） */
        const radius = d.half * aspect;
        const tip = length * d.reach - radius * (1 - Math.sqrt(1 - du * du));
        if (tip > e) e = tip;
      }
      lead[x] = e;
    }
    perPixel(raw, W, H, (x, y) => (y + 0.5) / H - lead[x]);
    return true;
  },

  clock: (raw, W, H, p) => {
    /*
     * 以像素中心量角度（中心 0～1 對應畫面的邊），再依整張圖的最小、最大值拉滿（同原作）：
     * 中心在畫面裡時等於 0～1 圈；中心在邊上或角落時，畫面裡實際有的角度範圍佔滿整段時間。
     */
    const [cx, cy] = centerOf(p, W, H, true);
    const sym = p.clock === 'symmetric';
    perPixel(raw, W, H, (x, y) => {
      const t = turnFromTop(x + 0.5 - cx, y + 0.5 - cy);
      return sym ? (t > 0.5 ? 1 - t : t) * 2 : t;
    });
    return true;
  },

  spiral: (raw, W, H, p) => {
    /* 阿基米德螺旋：每轉一圈往內一層。以像素中心計算，中心 0～1 對應畫面的邊，以最遠的角落為全程（同原作） */
    const n = Math.max(1, p.count ?? 3);
    const [cx, cy] = centerOf(p, W, H, true);
    const R = farthestEdgeCorner(cx, cy, W, H);
    perPixel(raw, W, H, (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy) / R;
      return (n * (1 - r) + turnFromTop(dx, dy)) / (n + 1);
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
    /*
     * 「數量」欄 ×（數量 × 高 ÷ 寬，四捨五入）列。每格從自己的中心長出（方形／圓形／菱形），開始時間依出現順序錯開：
     * 錯開佔 60%、自己長滿佔 40%；交錯分組是棋盤格兩組，各佔 50%。同原作（格子中心以畫面比例計）。
     */
    const cols = Math.max(1, Math.round(p.count ?? 10));
    const rows = Math.max(1, Math.round((cols * H) / W));
    const cw = W / cols;
    const ch = H / rows;
    const cell = p.cell ?? 'square';
    const start = cellStarts(
      p,
      cols * rows,
      (k) => [((k % cols) + 0.5) / cols, (Math.floor(k / cols) + 0.5) / rows],
      (k) => ((k % cols) + Math.floor(k / cols)) % 2,
      W,
      H,
    );
    const spread = p.order === 'alternate' ? 0.5 : 0.6;
    perPixel(raw, W, H, (x, y) => {
      const i = Math.min(cols - 1, Math.floor(x / cw));
      const j = Math.min(rows - 1, Math.floor(y / ch));
      const dx = Math.abs(x + 0.5 - (i + 0.5) * cw) / (cw / 2);
      const dy = Math.abs(y + 0.5 - (j + 0.5) * ch) / (ch / 2);
      /* 不夾在 1 以內：格高不是整數時，像素中心可能落在下一格（原作也是如此，整張圖的最大值跟著變） */
      const local =
        cell === 'circle'
          ? Math.hypot(dx, dy) / Math.SQRT2
          : cell === 'diamond'
            ? (dx + dy) / 2
            : Math.max(dx, dy);
      return start[j * cols + i] * spread + local * (1 - spread);
    });
    return true;
  },

  tear: (raw, W, H, p) => {
    /*
     * 水平帶（平均高＝畫面高 ÷ 數量，個別 0.25～1.75 倍，以畫面比例計，預覽與匯出相同）。
     * 每條帶在隨機的時間（錯開佔 70%）從隨機的一側橫向掃過（佔 30%）；前緣沿水平切成 14 段，
     * 每段前後錯開 ±0.06 的畫面寬（鋸齒）。同原作，最後依整張圖的最小、最大值正規化。
     */
    const seed = (p.seed ?? 7) | 0;
    const rnd = createRandom(seed);
    const avg = 1 / Math.max(2, Math.round(p.count ?? 26));
    const bands: { end: number; start: number; fromLeft: boolean }[] = [];
    for (let v0 = 0; v0 < 1; ) {
      const v1 = Math.min(1, v0 + avg * (0.25 + rnd.next() * 1.5));
      bands.push({ end: v1, start: rnd.next(), fromLeft: rnd.next() < 0.5 });
      v0 = v1;
    }
    let b = 0;
    for (let y = 0, i = 0; y < H; y++) {
      const v = (y + 0.5) / H;
      while (b < bands.length - 1 && v >= bands[b].end) b++;
      const band = bands[b];
      for (let x = 0; x < W; x++, i++) {
        const u = (x + 0.5) / W;
        const jag = (latticeHash(b, Math.floor(u * 14), seed) - 0.5) * 0.12;
        raw[i] = band.start * 0.7 + ((band.fromLeft ? u : 1 - u) + jag) * 0.3;
      }
    }
    return true;
  },

  rain: (raw, W, H, p) => {
    /*
     * 正方形格（邊長＝寬 ÷ 欄數）。每欄在隨機的時間開始（錯開佔 45%），由上往下一格格填（佔 55%，每格另加 0～4% 的隨機）；
     * 格子之間的細縫最後才補滿。細縫以像素的左上角判斷（格內位置 < 8% 或 > 92%），格子 ≥ 6 px 才有，
     * 所以每條格線約 1～2 px（格子 10 px 時 1 px），同原作。
     */
    const cols = Math.max(4, Math.round(p.count ?? 48));
    const side = W / cols;
    const rows = Math.max(1, Math.ceil(H / side));
    const seed = (p.seed ?? 7) | 0;
    const gaps = side >= 6;
    const inGap = (f: number) => gaps && (f < 0.08 || f > 0.92);
    for (let y = 0, i = 0; y < H; y++) {
      const j = Math.floor(y / side);
      const gapY = inGap(y / side - j);
      for (let x = 0; x < W; x++, i++) {
        const c = Math.floor(x / side);
        raw[i] =
          gapY || inGap(x / side - c)
            ? 1.05
            : latticeHash(c, 0, seed) * 0.45 +
              (j / rows) * 0.55 +
              latticeHash(c, j, seed + 1) * 0.04;
      }
    }
    return true;
  },

  interlace: (raw, W, H, p) => {
    const n = Math.max(2, Math.round(p.count ?? 72));
    /*
     * 第 1、3、5…條（i 為偶數）在前半段、其餘在後半段，各自由上往下（線內也逐行推進）。
     * 每一行依像素中心分線（線高可以是小數），最後依整張圖的最小、最大值正規化（條數是奇數時最後一條在前半段）。同原作。
     */
    perPixel(raw, W, H, (_x, y) => {
      const v = (y + 0.5) / H;
      return (Math.floor(v * n) % 2) * 0.5 + v * 0.5;
    });
    return true;
  },

  rings: (raw, W, H, p) => {
    const n = Math.max(1, Math.round(p.count ?? 8));
    /*
     * 以最遠的角落為最外圈，切成 n 個等寬的環；第 1、3、5…環（由內往外）在前半段、其餘在後半段。
     * 以像素中心量距離（中心 0～1 對應畫面的邊），最後依整張圖的最小、最大值正規化（環數是奇數時最外環在前半段）。同原作。
     */
    const [cx, cy] = centerOf(p, W, H, true);
    const R = farthestEdgeCorner(cx, cy, W, H);
    perPixel(raw, W, H, (x, y) => {
      const r = Math.min(1, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R);
      const ring = Math.min(n - 1, Math.floor(r * n));
      return (ring % 2) * 0.5 + r * 0.5;
    });
    return true;
  },

  hex: (raw, W, H, p) => {
    /*
     * 平頂六角格：中心到角＝寬 ÷（數量 × 1.5）。每個像素（以像素中心）歸到最近的格子（立方座標四捨五入），
     * 每格從中心長出填滿六角形；出現順序同格子（交錯分組＝三組依序，各佔 1/3）。同原作。
     */
    const size = W / (Math.max(1, p.count ?? 14) * 1.5);
    const S3 = Math.sqrt(3);
    const qs = new Int32Array(W * H);
    const rs = new Int32Array(W * H);
    const keys: number[] = [];
    const seen = new Map<number, number>();
    const cellQ: number[] = [];
    const cellR: number[] = [];
    for (let y = 0, k = 0; y < H; y++) {
      for (let x = 0; x < W; x++, k++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const fq = ((2 / 3) * px) / size;
        const fr = (-px / 3 + (S3 / 3) * py) / size;
        const fs = -fq - fr;
        let q = Math.round(fq);
        let r = Math.round(fr);
        const s = Math.round(fs);
        const dq = Math.abs(q - fq);
        const dr = Math.abs(r - fr);
        const ds = Math.abs(s - fs);
        if (dq > dr && dq > ds) q = -r - s;
        else if (dr > ds) r = -q - s;
        qs[k] = q;
        rs[k] = r;
        const key = q * 4096 + r;
        if (!seen.has(key)) {
          seen.set(key, keys.length);
          keys.push(key);
          cellQ.push(q);
          cellR.push(r);
        }
      }
    }
    const start = cellStarts(
      p,
      keys.length,
      (n) => [(size * 1.5 * cellQ[n]) / W, (size * S3 * (cellR[n] + cellQ[n] / 2)) / H],
      (n) => (((cellQ[n] - cellR[n]) % 3) + 3) % 3,
      W,
      H,
      (n) => latticeHash(cellQ[n], cellR[n], (p.seed ?? 7) | 0),
    );
    const spread = p.order === 'alternate' ? 2 / 3 : 0.6;
    for (let y = 0, k = 0; y < H; y++) {
      for (let x = 0; x < W; x++, k++) {
        const q = qs[k];
        const r = rs[k];
        const dx = Math.abs(x + 0.5 - size * 1.5 * q);
        const dy = Math.abs(y + 0.5 - size * S3 * (r + q / 2));
        const local = Math.min(1, Math.max(dy / ((S3 / 2) * size), (dx + dy / S3) / size));
        raw[k] = start[seen.get(q * 4096 + r) as number] * spread + local * (1 - spread);
      }
    }
    return true;
  },
};

/**
 * 格子類每一格的開始時間（0～1，依所有格子的最小、最大值正規化）。同原作：
 * - 沿方向：格子中心（畫面比例 u、v，夾在 0～1）沿方向的位置；
 * - 從中心：與中心的距離（水平方向按長寬比換算）；
 * - 隨機：花紋編號的亂數（格子依序取，六角格用格點雜湊）；
 * - 交錯分組：組別（格子 0、1；六角格 0、1、2）。
 */
function cellStarts(
  p: ArrivalParams,
  count: number,
  centerAt: (k: number) => [number, number],
  groupOf: (k: number) => number,
  W: number,
  H: number,
  randomOf?: (k: number) => number,
): Float32Array {
  const order = p.order ?? 'direction';
  const d = p.direction ?? 'right';
  const [c0, c1] = p.center ?? [0.5, 0.5];
  const aspect = W / H;
  const rnd = createRandom((p.seed ?? 7) | 0);
  const start = new Float32Array(count);
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < count; k++) {
    const [u, v] = centerAt(k);
    const value =
      order === 'center'
        ? Math.hypot((u - c0) * aspect, v - c1)
        : order === 'random'
          ? randomOf
            ? randomOf(k)
            : rnd.next()
          : order === 'alternate'
            ? groupOf(k)
            : directional(
                d,
                Math.min(1, Math.max(0, u)),
                Math.min(1, Math.max(0, v)),
                W,
                H,
                true,
              )[0];
    start[k] = value;
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  const span = hi > lo ? hi - lo : 1;
  for (let k = 0; k < count; k++) start[k] = (start[k] - lo) / span;
  return start;
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
  if (normalize === 'levels') {
    const levels = new Uint8Array(raw.length);
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i] < 0 ? 0 : raw[i] > 255 ? 255 : Math.round(raw[i]);
      levels[i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const map: ArrivalMap = { width: W, height: H, levels, flat: false };
    if (lo !== 0 || hi !== 255) map.range = [lo, hi];
    return map;
  }
  return { width: W, height: H, levels: quantize(raw, normalize), flat: false };
}
