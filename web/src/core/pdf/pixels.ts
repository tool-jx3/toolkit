/**
 * 影像像素的處理（純 JavaScript，Worker 與 Node 都能用；不用 canvas）。
 * - 解開 PNG／TIFF 預測器（PDF 的 Flate 影像常用）
 * - 灰階／RGB → RGBA
 * - 面積平均縮小（box filter：每個輸出像素是它涵蓋的來源範圍的加權平均，大幅縮小也不會跳過像素）
 * - 「看起來像照片」的判斷（Flate 影像要不要轉成 JPEG，自訂）
 */

export interface PredictorParams {
  /** 1：沒有；2：TIFF；10～15：PNG */
  predictor: number;
  /** 每個像素幾個成分 */
  colors: number;
  bitsPerComponent: number;
  /** 一列幾個像素 */
  columns: number;
}

/** 一列的位元組數 */
export function rowBytes(columns: number, colors: number, bpc: number): number {
  return Math.ceil((columns * colors * bpc) / 8);
}

/**
 * 解開預測器，回傳 rows 列的原始樣本（每列 rowBytes 個位元組；資料不夠時補 0）。
 * PNG 預測器：每列前面有一個濾波種類的位元組（0 None、1 Sub、2 Up、3 Average、4 Paeth）。
 */
export function undoPredictor(data: Uint8Array, p: PredictorParams, rows: number): Uint8Array {
  const rb = rowBytes(p.columns, p.colors, p.bitsPerComponent);
  const out = new Uint8Array(rb * rows);
  if (p.predictor < 2) {
    out.set(data.subarray(0, out.length));
    return out;
  }
  const bpp = Math.max(1, Math.ceil((p.colors * p.bitsPerComponent) / 8));
  if (p.predictor === 2) {
    out.set(data.subarray(0, out.length));
    if (p.bitsPerComponent === 8) {
      for (let y = 0; y < rows; y++) {
        const o = y * rb;
        for (let x = bpp; x < rb; x++) out[o + x] = (out[o + x] + out[o + x - bpp]) & 0xff;
      }
    }
    return out;
  }
  let src = 0;
  for (let y = 0; y < rows; y++) {
    if (src >= data.length) break;
    const type = data[src++];
    const o = y * rb;
    const up = o - rb;
    for (let x = 0; x < rb; x++) {
      const raw = src + x < data.length ? data[src + x] : 0;
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[up + x] : 0;
      let v: number;
      switch (type) {
        case 1:
          v = raw + a;
          break;
        case 2:
          v = raw + b;
          break;
        case 3:
          v = raw + ((a + b) >> 1);
          break;
        case 4: {
          const c = y > 0 && x >= bpp ? out[up + x - bpp] : 0;
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = raw;
      }
      out[o + x] = v & 0xff;
    }
    src += rb;
  }
  return out;
}

/** 8 位元的灰階或 RGB 樣本 → RGBA（不透明） */
export function samplesToRgba(
  samples: Uint8Array,
  width: number,
  height: number,
  components: 1 | 3,
): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  if (components === 1) {
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      const v = samples[i] ?? 0;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  } else {
    for (let i = 0, s = 0, o = 0; i < n; i++, s += 3, o += 4) {
      out[o] = samples[s] ?? 0;
      out[o + 1] = samples[s + 1] ?? 0;
      out[o + 2] = samples[s + 2] ?? 0;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** 一個方向的面積權重：每個輸出位置涵蓋的來源範圍（起點、個數）與各來源格的權重 */
interface AreaAxis {
  start: Int32Array;
  count: Int32Array;
  weights: Float32Array;
  offsets: Int32Array;
}

function areaAxis(src: number, dst: number): AreaAxis {
  const scale = src / dst;
  const start = new Int32Array(dst);
  const count = new Int32Array(dst);
  const offsets = new Int32Array(dst);
  const list: number[] = [];
  for (let d = 0; d < dst; d++) {
    const a = d * scale;
    const b = Math.min(src, (d + 1) * scale);
    const s0 = Math.floor(a);
    const s1 = Math.min(src, Math.ceil(b));
    start[d] = s0;
    count[d] = s1 - s0;
    offsets[d] = list.length;
    for (let s = s0; s < s1; s++) {
      const w = Math.min(b, s + 1) - Math.max(a, s);
      list.push(w / (b - a));
    }
  }
  return { start, count, weights: Float32Array.from(list), offsets };
}

/**
 * RGBA 面積平均縮小（只縮不放大；尺寸相同時回傳複本）。
 * 一列一列做：先橫向縮好來源的一列，再依權重累加到輸出的列，記憶體只多用兩列。
 */
export function downscaleArea(
  rgba: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8ClampedArray {
  if (dw >= sw && dh >= sh) return rgba.slice(0, sw * sh * 4);
  dw = Math.max(1, Math.min(dw, sw));
  dh = Math.max(1, Math.min(dh, sh));
  const xs = areaAxis(sw, dw);
  const ys = areaAxis(sh, dh);
  const out = new Uint8ClampedArray(dw * dh * 4);
  const hrow = new Float32Array(dw * 4);
  const acc = new Float32Array(dw * 4);
  let cachedY = -1;
  const horizontal = (y: number) => {
    if (cachedY === y) return;
    cachedY = y;
    const row = y * sw * 4;
    for (let dx = 0; dx < dw; dx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const s0 = xs.start[dx];
      const off = xs.offsets[dx];
      for (let k = 0; k < xs.count[dx]; k++) {
        const w = xs.weights[off + k];
        const i = row + (s0 + k) * 4;
        r += rgba[i] * w;
        g += rgba[i + 1] * w;
        b += rgba[i + 2] * w;
        a += rgba[i + 3] * w;
      }
      const o = dx * 4;
      hrow[o] = r;
      hrow[o + 1] = g;
      hrow[o + 2] = b;
      hrow[o + 3] = a;
    }
  };
  for (let dy = 0; dy < dh; dy++) {
    acc.fill(0);
    const s0 = ys.start[dy];
    const off = ys.offsets[dy];
    for (let k = 0; k < ys.count[dy]; k++) {
      horizontal(s0 + k);
      const w = ys.weights[off + k];
      for (let i = 0; i < acc.length; i++) acc[i] += hrow[i] * w;
    }
    out.set(acc, dy * dw * 4);
  }
  return out;
}

/** 照片類的判斷用：取樣的格數上限 */
const PHOTO_SAMPLES = 16_384;
/** 取樣裡不同顏色至少幾種才算照片（自訂） */
export const PHOTO_MIN_COLORS = 256;
/** Flate 壓縮後至少是原始大小的幾成才算照片（圖表、截圖壓得很小；自訂） */
export const PHOTO_MIN_RATIO = 0.15;

/** 取樣裡有幾種不同的顏色（最多算到 limit） */
export function sampledColorCount(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  limit = PHOTO_MIN_COLORS * 4,
): number {
  const n = width * height;
  const step = Math.max(1, Math.floor(n / PHOTO_SAMPLES));
  const seen = new Set<number>();
  for (let i = 0; i < n; i += step) {
    const o = i * 4;
    seen.add((rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]);
    if (seen.size >= limit) break;
  }
  return seen.size;
}

/**
 * 沒有壓縮或 Flate 壓縮的影像看起來是不是照片（轉成 JPEG 不會明顯變醜）：
 * 取樣的顏色夠多、而且 Flate 壓不太下去（storedBytes ÷ 原始大小 ≥ PHOTO_MIN_RATIO）。
 */
export function looksPhotographic(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  storedBytes: number,
  rawBytes: number,
): boolean {
  if (rawBytes > 0 && storedBytes / rawBytes < PHOTO_MIN_RATIO) return false;
  return sampledColorCount(rgba, width, height) >= PHOTO_MIN_COLORS;
}

/** RGBA 是不是灰階（每個像素 R、G、B 差距 ≤ tolerance） */
export function isGrayRgba(rgba: Uint8ClampedArray, tolerance = 2): boolean {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (Math.abs(r - g) > tolerance || Math.abs(r - b) > tolerance || Math.abs(g - b) > tolerance) {
      return false;
    }
  }
  return true;
}

/** RGBA 疊在白底上（JPEG 沒有透明） */
export function flattenOnWhite(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 255) continue;
    const k = a / 255;
    rgba[i] = rgba[i] * k + 255 * (1 - k);
    rgba[i + 1] = rgba[i + 1] * k + 255 * (1 - k);
    rgba[i + 2] = rgba[i + 2] * k + 255 * (1 - k);
    rgba[i + 3] = 255;
  }
}
