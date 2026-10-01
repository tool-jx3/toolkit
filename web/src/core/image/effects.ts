/**
 * 剪影效果：描邊（圓形向外擴張）、光暈（模糊）、偏移陰影——都畫在角色**後面**。
 * 全部是像素陣列上的純函式（Node 也能測），結果逐像素固定。
 *
 * ```ts
 * const px = getImageData(cropped);
 * const out = applySilhouetteEffects(px, outlineLayers('glow-strong', { color: '#ffffff', width: 5, blur: 12 }));
 * ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
 * ```
 *
 * - 角色＝透明度大於 threshold（預設 0）的像素。
 * - 描邊：每個透明像素到最近角色像素的歐氏距離 d，覆蓋率 clamp(粗細 ＋ 1 − d)（直邊剛好 N px，轉角是圓弧並有反鋸齒）。
 * - 模糊：σ ＝ 模糊 ÷ 2（與 canvas 的 shadowBlur 相同的換算），以三次方框模糊近似高斯；圖外視為透明。
 *   也可以直接指定 σ（SilhouetteLayer.sigma；outlineLayers 的 blurMode: 'filter' 是 σ ＝ 模糊，同 CSS 的 filter: blur()）。
 * - 陰影：整個剪影（可先擴張）模糊後往右下偏移。
 * - keepPartial（預設 true）：原圖透明度 > 0 的像素（含半透明的邊）**原封不動**，效果只出現在完全透明的地方；
 *   false 時改成一般的「角色疊在效果上面」。
 */
import { parseColor } from '../color';
import type { PixelBuffer } from './index';

export interface SilhouetteLayer {
  /** 顏色 #rrggbb（透明度用 opacity） */
  color: string;
  /** 0～1（預設 1）；線條的實際透明度就是這個值 */
  opacity?: number;
  /** 先把剪影向外擴張幾 px（圓形擴張；預設 0＝剪影本身） */
  spread?: number;
  /** 只取擴張出來的那一圈（像一條 spread 粗的描邊線，剪影本身不算；預設 false）。spread 為 0 時沒有東西 */
  hollow?: boolean;
  /** 模糊（px，σ ＝ blur ÷ 2；預設 0） */
  blur?: number;
  /** 直接指定高斯模糊的 σ（px）；給了就不看 blur */
  sigma?: number;
  /** 模糊後的濃度倍率（> 1 讓光暈更濃，夾到 1；預設 1） */
  gain?: number;
  /** 偏移（px，往右／往下為正） */
  offsetX?: number;
  offsetY?: number;
}

export interface SilhouetteOptions {
  /** 透明度大於這個值才算角色（預設 0） */
  threshold?: number;
  /** 原圖透明度 > 0 的像素保持不變（預設 true） */
  keepPartial?: boolean;
}

export interface RgbaBuffer {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

const INF = 1e20;

/** 一維平方距離轉換（Felzenszwalb & Huttenlocher） */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * 每個像素到最近「inside」像素的歐氏距離（像素中心之間；inside 本身是 0）。沒有 inside 時全部是 Infinity。
 */
export function distanceField(inside: Uint8Array, width: number, height: number): Float32Array {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const tmp = new Float64Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = inside[y * width + x] ? 0 : INF;
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) tmp[y * width + x] = d[y];
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = tmp[row + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++)
      out[row + x] = d[x] >= INF / 2 ? Number.POSITIVE_INFINITY : Math.sqrt(d[x]);
  }
  return out;
}

/** 剪影遮罩：透明度 > threshold 的像素為 1 */
export function silhouetteMask({ data, width, height }: PixelBuffer, threshold = 0): Uint8Array {
  const m = new Uint8Array(width * height);
  for (let i = 0, p = 3; i < m.length; i++, p += 4) m[i] = data[p] > threshold ? 1 : 0;
  return m;
}

/** 高斯 σ 對應的三個框寬（奇數） */
function boxesForGauss(sigma: number, n = 3): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}

function boxPass(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w;
  const prefix = new Float64Array(len + 1);
  const size = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * w : l;
    for (let i = 0; i < len; i++) prefix[i + 1] = prefix[i] + src[base + i * stride];
    for (let i = 0; i < len; i++) {
      const a = Math.max(0, i - r);
      const b = Math.min(len, i + r + 1);
      dst[base + i * stride] = (prefix[b] - prefix[a]) / size;
    }
  }
}

/** 小 σ 用真正的高斯核（框模糊在 σ 很小時沒有作用） */
function gaussPass(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  kernel: Float64Array,
  horizontal: boolean,
) {
  const r = (kernel.length - 1) / 2;
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? 1 : w;
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * w : l;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) {
        const j = i + k;
        if (j >= 0 && j < len) s += src[base + j * stride] * kernel[k + r];
      }
      dst[base + i * stride] = s;
    }
  }
}

/** 0～1 的遮罩做高斯模糊（σ ＝ blur ÷ 2；σ ≥ 2 用三次方框模糊近似；圖外視為 0） */
export function blurMask(
  mask: Float32Array,
  width: number,
  height: number,
  blur: number,
): Float32Array {
  return gaussianBlurMask(mask, width, height, blur / 2);
}

/** 0～1 的遮罩以指定的 σ（px）做高斯模糊（σ ≥ 2 用三次方框模糊近似；圖外視為 0） */
export function gaussianBlurMask(
  mask: Float32Array,
  width: number,
  height: number,
  sigma: number,
): Float32Array {
  if (!(sigma > 0)) return mask.slice();
  if (sigma < 2) {
    const r = Math.max(1, Math.ceil(sigma * 3));
    const kernel = new Float64Array(2 * r + 1);
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += kernel[k + r] = Math.exp(-(k * k) / (2 * sigma * sigma));
    for (let k = 0; k < kernel.length; k++) kernel[k] /= sum;
    const tmp = new Float32Array(mask.length);
    const out = new Float32Array(mask.length);
    gaussPass(mask, tmp, width, height, kernel, true);
    gaussPass(tmp, out, width, height, kernel, false);
    return out;
  }
  const a = mask.slice();
  const b = new Float32Array(mask.length);
  for (const box of boxesForGauss(sigma)) {
    const r = (box - 1) / 2;
    if (r <= 0) continue;
    boxPass(a, b, width, height, r, true);
    boxPass(b, a, width, height, r, false);
  }
  return a;
}

/** 一層效果的覆蓋率（0～1），尚未乘上 opacity */
function layerCoverage(
  src: PixelBuffer,
  layer: SilhouetteLayer,
  dist: () => Float32Array,
): Float32Array {
  const { width, height, data } = src;
  const n = width * height;
  const spread = Math.max(0, layer.spread ?? 0);
  let cov: Float32Array = new Float32Array(n);
  if (layer.hollow) {
    if (spread > 0) {
      const d = dist();
      for (let i = 0; i < n; i++)
        cov[i] = d[i] > 0 ? Math.min(1, Math.max(0, spread + 1 - d[i])) : 0;
    }
  } else if (spread > 0) {
    const d = dist();
    for (let i = 0; i < n; i++) cov[i] = Math.min(1, Math.max(0, spread + 1 - d[i]));
  } else {
    for (let i = 0, p = 3; i < n; i++, p += 4) cov[i] = data[p] / 255;
  }
  const sigma = layer.sigma ?? (layer.blur ?? 0) / 2;
  if (sigma > 0) cov = gaussianBlurMask(cov, width, height, sigma);
  const gain = layer.gain ?? 1;
  if (gain !== 1) for (let i = 0; i < n; i++) cov[i] = Math.min(1, cov[i] * gain);
  const dx = Math.round(layer.offsetX ?? 0);
  const dy = Math.round(layer.offsetY ?? 0);
  if (dx || dy) {
    const shifted = new Float32Array(n);
    for (let y = 0; y < height; y++) {
      const sy = y - dy;
      if (sy < 0 || sy >= height) continue;
      for (let x = 0; x < width; x++) {
        const sx = x - dx;
        if (sx >= 0 && sx < width) shifted[y * width + x] = cov[sy * width + sx];
      }
    }
    cov = shifted;
  }
  return cov;
}

/**
 * 把效果層（第一層在最下面）畫在角色後面，回傳新的像素陣列（尺寸不變，不會往外擴大）。
 */
export function applySilhouetteEffects(
  src: PixelBuffer,
  layers: readonly SilhouetteLayer[],
  { threshold = 0, keepPartial = true }: SilhouetteOptions = {},
): RgbaBuffer {
  const { width, height, data } = src;
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  /* 效果合成（預乘透明度） */
  const ea = new Float32Array(n);
  const er = new Float32Array(n);
  const eg = new Float32Array(n);
  const eb = new Float32Array(n);
  let distCache: Float32Array | null = null;
  const dist = () => {
    distCache ??= distanceField(silhouetteMask(src, threshold), width, height);
    return distCache;
  };
  for (const layer of layers) {
    const opacity = Math.min(1, Math.max(0, layer.opacity ?? 1));
    if (opacity <= 0) continue;
    const c = parseColor(layer.color) ?? { r: 0, g: 0, b: 0, a: 1 };
    const cov = layerCoverage(src, layer, dist);
    for (let i = 0; i < n; i++) {
      const a = cov[i] * opacity;
      if (a <= 0) continue;
      const k = 1 - a;
      er[i] = c.r * a + er[i] * k;
      eg[i] = c.g * a + eg[i] * k;
      eb[i] = c.b * a + eb[i] * k;
      ea[i] = a + ea[i] * k;
    }
  }
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const sa = data[p + 3];
    if (keepPartial && sa > 0) {
      out[p] = data[p];
      out[p + 1] = data[p + 1];
      out[p + 2] = data[p + 2];
      out[p + 3] = sa;
      continue;
    }
    /* 角色（透明度 s）疊在效果上面 */
    const s = sa / 255;
    const a = s + ea[i] * (1 - s);
    if (a <= 0) continue;
    out[p] = Math.round((data[p] * s + er[i] * (1 - s)) / a);
    out[p + 1] = Math.round((data[p + 1] * s + eg[i] * (1 - s)) / a);
    out[p + 2] = Math.round((data[p + 2] * s + eb[i] * (1 - s)) / a);
    out[p + 3] = Math.round(a * 255);
  }
  return { data: out, width, height };
}

export type OutlineStyle = 'stroke' | 'glow-soft' | 'glow-strong' | 'shadow';

export interface OutlineParams {
  color: string;
  /** 粗細（px） */
  width: number;
  /** 模糊（px；光暈至少當 1 px） */
  blur?: number;
  /** 陰影往右下的位移（px） */
  offset?: number;
  /** 0～1 */
  opacity?: number;
  /**
   * 模糊值的意思與光暈的做法（預設 'shadow'，不給時結果和以前完全相同）：
   * - 'shadow'：像 canvas 的 shadowBlur／CSS drop-shadow，σ ＝ 模糊 ÷ 2；光暈是擴張後整個剪影的影子。
   * - 'filter'：像對描邊線條套 CSS `filter: blur()`，σ ＝ 模糊；光暈是「粗細 N 的那一圈線」本身的模糊，
   *   所以光暈的總量幾乎不隨模糊值改變（模糊越大越淡、越長）。陰影仍是整個剪影（σ ＝ 模糊）。
   */
  blurMode?: 'shadow' | 'filter';
}

/**
 * blurMode 'filter' 的光暈：線條模糊後濃度 × gain（夾到 1），柔和再乘上 softOpacity。
 * 以 ccfolia-cropper 舊版下載的檔案校準：粗細 5、模糊 12 時，舊版實線外的光暈總量（一列的透明度加總）約 1050；
 * 強烈約 1180（＋13%）、柔和約 1020（−3%，含細線外的 2 px；從粗細外起算約 890）。
 */
export const FILTER_GLOW = { gain: 2.2, softOpacity: 0.75 } as const;

/**
 * 立繪常用的四種外框效果 → 效果層（可直接交給 applySilhouetteEffects）：
 * - stroke：實線描邊（粗細 N）。
 * - glow-strong：實線＋濃的光暈。
 * - glow-soft：細一半的實線＋淡的光暈，兩者看得出差別。
 * - shadow：整個剪影（擴張 N）模糊後往右下偏移（不畫實線）。
 *
 * 光暈的做法依 blurMode：'shadow'（預設）＝擴張後整個剪影模糊，強烈濃度 ×1.8、柔和 ×0.6（線也細一半）；
 * 'filter' ＝粗細 N 的那一圈線模糊（σ ＝ 模糊）、濃度 ×2.2；柔和的實線細一半，光暈來源仍是 N 粗的線、
 * 再乘 0.75（每個距離上柔和都比強烈淡）。
 */
export function outlineLayers(style: OutlineStyle, params: OutlineParams): SilhouetteLayer[] {
  const { color, width, offset = 0, opacity = 1 } = params;
  const w = Math.max(0, width);
  const filter = params.blurMode === 'filter';
  const blur = Math.max(1, params.blur ?? 0);
  const line = Math.max(1, Math.round(w / 2));
  switch (style) {
    case 'stroke':
      return [{ color, spread: w, opacity }];
    case 'glow-strong':
      return filter
        ? [
            { color, spread: w, hollow: true, sigma: blur, gain: FILTER_GLOW.gain, opacity },
            { color, spread: w, opacity },
          ]
        : [
            { color, spread: w, blur, gain: 1.8, opacity },
            { color, spread: w, opacity },
          ];
    case 'glow-soft':
      return filter
        ? [
            {
              color,
              spread: w,
              hollow: true,
              sigma: blur,
              gain: FILTER_GLOW.gain,
              opacity: opacity * FILTER_GLOW.softOpacity,
            },
            { color, spread: line, opacity },
          ]
        : [
            { color, spread: line, blur, opacity: opacity * 0.6 },
            { color, spread: line, opacity },
          ];
    case 'shadow': {
      const b = Math.max(0, params.blur ?? 0);
      return [
        {
          color,
          spread: w,
          ...(filter ? { sigma: b } : { blur: b }),
          offsetX: offset,
          offsetY: offset,
          opacity,
        },
      ];
    }
  }
}

/**
 * 某幾列（y0 ≤ y < y1）裡透明度 > threshold 的像素的最左與最右 x；那幾列都透明時回傳 null。
 * 例：頭部中心＝角色最上方約 35% 高度內的左右界中點。
 */
export function opaqueSpanInRows(
  { data, width, height }: PixelBuffer,
  y0: number,
  y1: number,
  threshold = 0,
): { left: number; right: number } | null {
  const from = Math.max(0, Math.floor(y0));
  const to = Math.min(height, Math.ceil(y1));
  let left = width;
  let right = -1;
  for (let y = from; y < to; y++) {
    const row = y * width * 4 + 3;
    for (let x = 0; x < left; x++) {
      if (data[row + x * 4] > threshold) {
        left = x;
        break;
      }
    }
    for (let x = width - 1; x > right; x--) {
      if (data[row + x * 4] > threshold) {
        right = x;
        break;
      }
    }
  }
  return right < 0 ? null : { left, right };
}
