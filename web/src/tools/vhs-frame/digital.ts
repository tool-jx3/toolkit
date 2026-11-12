/**
 * 數位攝影（規格 3.14、F83～F86）：照片先被一台數位攝影機「拍」下來、壓縮，再當成類比訊號錄上錄影帶。
 * NTSCRT 跑真的影片編碼器；本站在瀏覽器裡用自己寫的近似（純函式，不依賴畫布）：
 * - 相機（不隨時間變，算一次）：鋸齒（最近點取樣混進平滑取樣、紅藍錯開半格）、鏡頭柔焦、單場（一個圖場、每列重複）、
 *   曝光（各色版各自截斷）、色溫與色調、飽和度、黑位、銳利化（反銳利遮罩）、降噪；
 * - 每一格：感光雜訊（色度比亮度多）→ YCbCr、色度次取樣（4:4:4／4:2:2／4:2:0／4:1:1）→ 8 × 8 DCT 量化（JPEG 的量化表、品質換算）；
 *   關鍵影格之間是預測影格（第 j 個預測影格的殘差以關鍵影格的 max(0.2, 0.7^j) 倍的量化補上：畫面在關鍵影格之後的幾格裡越來越細、
 *   到下一個關鍵影格又變粗）；
 *   資料遺失：一段一段的巨集區塊（16 × 16）沒收到——關鍵影格時拿錯位的內容補（閃一下就消失），預測影格時留著舊的、錯到下一個關鍵影格；
 *   datamosh：關鍵影格被丟掉時，之後的影格只剩移動、沒有殘差，舊的畫面被一片慢慢變化的移動場拖著糊開，直到下一個留下來的關鍵影格
 *   （靜態照片沒有真的移動，移動場是本站造的，D35）；解碼後可以柔化方塊的邊。
 * 2026-11-12 參考 NTSCRT `352b4dc`（MIT，© 2026 Finn McKenty；授權全文在同一個資料夾的 UPSTREAM_LICENSE）加的：
 *   彩虹鋸齒（三色差三分之一格取樣、超過一半時加強細節）、CCD 的反應（自動曝光、眩光、膝點、黑位）、低光雜訊（亮度的中位數）、
 *   銳利化的寬度（方框模糊的半徑）；第二種編碼「方塊色」（Microsoft Video 1）在 colorblock.ts。都是預設不作用，沒用時和加入之前逐位元組相同。
 * 決定性：同樣的照片、設定與影格號碼，結果永遠相同（雜訊、遺失、丟關鍵影格都由影格號碼的雜湊決定）。
 * 移動場的雜訊用 ntsc.ts 的 simplex（改寫自 ntsc-rs 的 noise/，其本身改寫自 Clatter，https://github.com/Ralith/clatter，MIT／Apache-2.0／zlib）。
 */
import { CHROMA_SUBSAMPLING, type Digital } from './look';
import { simplex2 } from './ntsc';

/* ---------- 小工具 ---------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 由整數決定的 0～1 的數（32 位元的雜湊） */
export function hash01(a: number, b = 0, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) ^ Math.imul(c ^ 0x7f4a7c15, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** 1-2-1 的模糊（橫、直各一次）；src 與 dst 可以是同一個 */
function blur121(src: Float32Array, w: number, h: number, ch: number, dst: Float32Array): void {
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < ch; c++) {
        const l = src[(y * w + Math.max(0, x - 1)) * ch + c];
        const m = src[(y * w + x) * ch + c];
        const r = src[(y * w + Math.min(w - 1, x + 1)) * ch + c];
        tmp[(y * w + x) * ch + c] = (l + 2 * m + r) * 0.25;
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < ch; c++) {
        const u = tmp[(Math.max(0, y - 1) * w + x) * ch + c];
        const m = tmp[(y * w + x) * ch + c];
        const d = tmp[(Math.min(h - 1, y + 1) * w + x) * ch + c];
        dst[(y * w + x) * ch + c] = (u + 2 * m + d) * 0.25;
      }
}

/* ---------- 相機（不隨時間變） ---------- */

/** 相機用到的設定 */
export type CameraSettings = Pick<
  Digital,
  | 'alias'
  | 'rainbow'
  | 'lens'
  | 'interlace'
  | 'exposure'
  | 'warmth'
  | 'tint'
  | 'saturation'
  | 'black'
  | 'sharpen'
  | 'halo'
  | 'denoise'
  | 'ccd'
>;

/**
 * 感光元件讀到的畫面（RGB，每個像素 3 個 0～1 的數）：smooth＝照片以高品質縮成擷取的大小、sharp＝以最近點縮的（鋸齒用；alias 是 0 時不用）、
 * thirds＝以最近點畫成擷取的 3 × 3 倍（彩虹鋸齒用；rainbow 是 0 時不用）。之後是鏡頭的柔焦與單場（每列重複）。
 */
export function cameraSample(
  smooth: Uint8ClampedArray,
  sharp: Uint8ClampedArray | null,
  w: number,
  h: number,
  d: Pick<CameraSettings, 'alias' | 'rainbow' | 'lens' | 'interlace'>,
  thirds: Uint8ClampedArray | null = null,
): Float32Array {
  const rgb = new Float32Array(w * h * 3);
  const a = sharp ? d.alias / 100 : 0;
  /* 鋸齒：最近點取樣混進去；紅、藍的感光元件各錯開半格（3CCD），細紋變成彩虹 */
  const half = a * 0.5;
  const at = (src: Uint8ClampedArray, x: number, y: number, c: number) => {
    const xi = Math.max(0, Math.min(w - 1, x));
    return src[(y * w + xi) * 4 + c] / 255;
  };
  const sample = (x: number, y: number, c: number, shift: number) => {
    const base = at(smooth, x, y, c);
    if (!sharp || a === 0) return base;
    const x0 = Math.floor(x + shift);
    const f = x + shift - x0;
    const s = at(sharp, x0, y, c) * (1 - f) + at(sharp, x0 + 1, y, c) * f;
    return base * (1 - a) + s * a;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      rgb[o] = sample(x, y, 0, -half);
      rgb[o + 1] = sample(x, y, 1, 0);
      rgb[o + 2] = sample(x, y, 2, half);
    }
  if (thirds && d.rainbow > 0) rainbowAlias(rgb, thirds, w, h, d.rainbow / 100);
  /* 鏡頭的柔焦：1-2-1 模糊做幾次 */
  for (let k = Math.round((d.lens / 100) * 4); k > 0; k--) blur121(rgb, w, h, 3, rgb);
  /* 單場：只用偶數列，奇數列重複上一列 */
  if (d.interlace)
    for (let y = 1; y < h; y += 2) rgb.copyWithin(y * w * 3, (y - 1) * w * 3, y * w * 3);
  return rgb;
}

/**
 * 彩虹鋸齒（2026-11-12，參考 NTSCRT 的 Aliasing）：紅、綠、藍各自在一格的左三分之一、中間、右三分之一點取樣
 * （thirds 是 3 × 3 倍的最近點畫面，第 3x、3x ＋ 1、3x ＋ 2 欄、第 3y ＋ 1 列），往這些點靠 min(1, 2a)；
 * 慢慢飄的摩爾紋在三色差 120° 的相位上被讀到，顏色繞一圈＝彩虹。a 超過 0.5 時每個點先加強細節
 * （v ＋ 1.5(2a − 1)(v − 周圍 3 × 3 的平均)：照片沒有比擷取的大小細很多時也有明顯的摩爾紋）。
 */
function rainbowAlias(
  rgb: Float32Array,
  thirds: Uint8ClampedArray,
  w: number,
  h: number,
  a: number,
): void {
  const tw = w * 3;
  const th = h * 3;
  const mix = Math.min(1, a * 2);
  const boost = Math.max(0, a * 2 - 1) * 1.5;
  const read = (sx: number, sy: number, c: number) => {
    const v = thirds[(sy * tw + sx) * 4 + c];
    if (!(boost > 0)) return v / 255;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = Math.min(th - 1, Math.max(0, sy + dy));
      for (let dx = -1; dx <= 1; dx++)
        sum += thirds[(yy * tw + Math.min(tw - 1, Math.max(0, sx + dx))) * 4 + c];
    }
    return clamp01((v + boost * (v - sum / 9)) / 255);
  };
  for (let y = 0; y < h; y++) {
    const sy = Math.min(th - 1, y * 3 + 1);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const p = read(Math.min(tw - 1, x * 3 + c), sy, c);
        rgb[o + c] += (p - rgb[o + c]) * mix;
      }
    }
  }
}

/** sRGB（0～1）→ 線性的光 */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** 線性的光 → sRGB（0～1；超過白的不截斷，膝點還看得到超出多少） */
const toSrgb = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);

/**
 * CCD 的反應（2026-11-12，照 NTSCRT 的 CCDResponse：照 VX1000 的畫面調的 90 年代 3CCD 攝影機），強度 s（0～1）：
 * - 自動曝光：中間重的測光（線性的亮度，每 2 × 2 取一點）把平均拉到 0.40，增益夾在 0.5～4 倍、再取 s 次方；
 * - 鏡頭的眩光：整張的光散開一點（0.03 × s × 曝光後的平均，亮的畫面暗部浮得多）；
 * - 膝點：每一色在 0.72 以上壓縮（斜率 1 − 0.62s），各自到白就截斷（暖的膚色、天空先變黃再變白）；
 * - 黑位：NTSC DV 的 7.5 IRE 處理錯，黑色浮成灰（亮度 ＋ 0.065s × (1 − 亮度)，見 ccdSetup）。
 */
export interface CcdResponse {
  gain: number;
  flare: number;
  slope: number;
  setup: number;
}
export const CCD = {
  target: 0.4,
  minGain: 0.5,
  maxGain: 4,
  flare: 0.03,
  knee: 0.72,
  kneeSlope: 0.62,
  setup: 0.065,
} as const;

/** 測光：中間重（權重 max(0.15, 1 − 0.6r²)）的線性亮度平均，每 2 × 2 取一點 */
export function meteredMean(rgb: Float32Array, w: number, h: number): number {
  let sum = 0;
  let weight = 0;
  for (let y = 0; y < h; y += 2) {
    const dy = ((y + 0.5) / h) * 2 - 1;
    for (let x = 0; x < w; x += 2) {
      const dx = ((x + 0.5) / w) * 2 - 1;
      const wt = Math.max(0.15, 1 - 0.6 * (dx * dx + dy * dy));
      const o = (y * w + x) * 3;
      const l =
        0.2126 * toLinear(rgb[o]) + 0.7152 * toLinear(rgb[o + 1]) + 0.0722 * toLinear(rgb[o + 2]);
      sum += l * wt;
      weight += wt;
    }
  }
  return weight > 0 ? sum / weight : 0.18;
}

/** 強度 s、測光的平均 m → 這張的曝光增益、眩光、膝點的斜率、黑位 */
export function ccdResponse(s: number, m: number): CcdResponse {
  const full = Math.min(CCD.maxGain, Math.max(CCD.minGain, CCD.target / Math.max(m, 1e-4)));
  const gain = full ** s;
  return {
    gain,
    flare: CCD.flare * s * m * gain,
    slope: 1 - CCD.kneeSlope * s,
    setup: CCD.setup * s,
  };
}

/** 膝點：v（0～1，可以超過 1）在 0.72 以上照斜率壓縮，再截在 1 */
export const ccdKnee = (v: number, slope: number): number =>
  v > CCD.knee ? Math.min(1, CCD.knee + (v - CCD.knee) * slope) : v;

/** CCD 的曲線（0～1 → 0～1：線性的光乘上曝光、加眩光，回到 sRGB 再過膝點）：先算成 4096 段的表，逐像素查表內插（每個值兩次乘冪太慢） */
const CURVE_STEPS = 4096;
export function ccdCurve(cr: CcdResponse): (v: number) => number {
  const lut = new Float64Array(CURVE_STEPS + 1);
  for (let k = 0; k <= CURVE_STEPS; k++)
    lut[k] = ccdKnee(toSrgb(toLinear(k / CURVE_STEPS) * cr.gain + cr.flare), cr.slope);
  return (v) => {
    const x = (v < 0 ? 0 : v > 1 ? 1 : v) * CURVE_STEPS;
    const k = Math.min(CURVE_STEPS - 1, Math.floor(x));
    return lut[k] + (lut[k + 1] - lut[k]) * (x - k);
  };
}

/**
 * 相機的電路（就地改 cameraSample 的畫面）：曝光、色溫與色調（各色版各自截斷）→〔CCD 的反應〕→ 飽和度 → 黑位 →〔CCD 的黑位〕
 * → 銳利化（反銳利遮罩：邊上多一圈亮、暗的光暈；寬度 1＝1-2-1 模糊，2～4＝那個半徑的方框模糊）與降噪（往 1-2-1 模糊的那張靠）。
 */
export function cameraTone(
  rgb: Float32Array,
  w: number,
  h: number,
  d: Omit<CameraSettings, 'alias' | 'rainbow' | 'lens' | 'interlace'>,
): Float32Array {
  const n = w * h;
  const gain = 2 ** (d.exposure / 100);
  const warm = d.warmth / 100;
  const tint = d.tint / 100;
  const gr = gain * (1 + 0.18 * warm) * (1 + 0.06 * tint);
  const gg = gain * (1 - 0.12 * tint);
  const gb = gain * (1 - 0.18 * warm) * (1 + 0.06 * tint);
  const sat = d.saturation / 100;
  const lift = d.black / 100;
  const ccd = d.ccd / 100;
  if (ccd > 0) {
    /* 測光在曝光、色溫之後（截斷過的） */
    for (let i = 0; i < n * 3; i += 3) {
      rgb[i] = clamp01(rgb[i] * gr);
      rgb[i + 1] = clamp01(rgb[i + 1] * gg);
      rgb[i + 2] = clamp01(rgb[i + 2] * gb);
    }
    const cr = ccdResponse(ccd, meteredMean(rgb, w, h));
    const tone = ccdCurve(cr);
    for (let i = 0; i < n * 3; i += 3) {
      const r = tone(rgb[i]);
      const g = tone(rgb[i + 1]);
      const b = tone(rgb[i + 2]);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const lr = lift + clamp01(l + (r - l) * sat) * (1 - lift);
      const lg = lift + clamp01(l + (g - l) * sat) * (1 - lift);
      const lb = lift + clamp01(l + (b - l) * sat) * (1 - lift);
      /* 黑位：只抬亮度（三色加同樣的量） */
      const up = cr.setup * (1 - (0.299 * lr + 0.587 * lg + 0.114 * lb));
      rgb[i] = clamp01(lr + up);
      rgb[i + 1] = clamp01(lg + up);
      rgb[i + 2] = clamp01(lb + up);
    }
  } else
    for (let i = 0; i < n * 3; i += 3) {
      const r = clamp01(rgb[i] * gr);
      const g = clamp01(rgb[i + 1] * gg);
      const b = clamp01(rgb[i + 2] * gb);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      rgb[i] = lift + clamp01(l + (r - l) * sat) * (1 - lift);
      rgb[i + 1] = lift + clamp01(l + (g - l) * sat) * (1 - lift);
      rgb[i + 2] = lift + clamp01(l + (b - l) * sat) * (1 - lift);
    }
  const amt = (d.sharpen / 100) * 2;
  const dn = (d.denoise / 100) * 0.6;
  if (amt > 0 || dn > 0) {
    const soft = new Float32Array(rgb.length);
    blur121(rgb, w, h, 3, soft);
    const halo = Math.round(d.halo);
    const wide = amt > 0 && halo > 1 ? boxBlur(rgb, w, h, 3, halo) : soft;
    for (let i = 0; i < rgb.length; i++) {
      const v = rgb[i] + (rgb[i] - wide[i]) * amt;
      rgb[i] = clamp01(v + (soft[i] - v) * dn);
    }
  }
  return rgb;
}

/** 方框模糊（半徑 r，橫、直各一次，邊上取邊上的值） */
function boxBlur(src: Float32Array, w: number, h: number, ch: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < ch; c++) {
        let s = 0;
        for (let d = -r; d <= r; d++)
          s += src[(y * w + Math.min(w - 1, Math.max(0, x + d))) * ch + c];
        tmp[(y * w + x) * ch + c] = s * k;
      }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < ch; c++) {
        let s = 0;
        for (let d = -r; d <= r; d++)
          s += tmp[(Math.min(h - 1, Math.max(0, y + d)) * w + x) * ch + c];
        out[(y * w + x) * ch + c] = s * k;
      }
  return out;
}

/** 相機的固定部分（cameraSample → cameraTone；2026-11-10 的寫法，測試用） */
export function cameraBase(
  smooth: Uint8ClampedArray,
  sharp: Uint8ClampedArray | null,
  w: number,
  h: number,
  d: CameraSettings,
  thirds: Uint8ClampedArray | null = null,
): Float32Array {
  return cameraTone(cameraSample(smooth, sharp, w, h, d, thirds), w, h, d);
}

/**
 * 低光雜訊（2026-11-12，照 NTSCRT 的 Low-light noise）：畫面越暗，相機的增益（與感光雜訊）越高。
 * 以亮度的中位數判斷（Y′ 每 2 × 2 取一點，換成線性的光；不用測光的平均：照片是別台相機已經曝光好的，夜景中間亮、一半是黑的）：
 * 中位數在 sRGB 100 以上時 1 倍，越暗越高，最多 8 倍（＋18 dB）；雜訊乘上 1 ＋ 低光雜訊 × (增益 − 1)。
 */
export const LOW_LIGHT = { knee: toLinear(100 / 255), maxGain: 8 } as const;

export function medianLuma(rgb: Float32Array, w: number, h: number): number {
  const counts = new Uint32Array(256);
  let n = 0;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      const o = (y * w + x) * 3;
      const l = Math.floor(255 * (0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2]));
      counts[Math.max(0, Math.min(255, l))]++;
      n++;
    }
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += counts[v];
    if (seen * 2 >= n) return toLinear(v / 255);
  }
  return 1;
}

export const sensorGain = (median: number): number =>
  Math.min(LOW_LIGHT.maxGain, Math.max(1, LOW_LIGHT.knee / Math.max(median, 1e-4)));

/** 感光雜訊要乘的倍數（低光雜訊 0 或沒有雜訊時 1） */
export function lowLightNoise(
  sampled: Float32Array,
  w: number,
  h: number,
  d: Pick<Digital, 'lowLight' | 'noise'>,
): number {
  if (!(d.lowLight > 0 && d.noise > 0)) return 1;
  return 1 + (d.lowLight / 100) * (sensorGain(medianLuma(sampled, w, h)) - 1);
}

/* ---------- YCbCr 的平面（長寬補到 16 的倍數；色度依次取樣） ---------- */

export interface Planes {
  /** 亮度 Y 與色度 Cb、Cr（0～255 的數，不截斷） */
  y: Float32Array;
  cb: Float32Array;
  cr: Float32Array;
  /** 亮度平面的寬高（16 的倍數）、色度平面的寬高（8 的倍數） */
  w: number;
  h: number;
  cw: number;
  ch: number;
  /** 色度的格子（橫、直） */
  sx: number;
  sy: number;
}

const ceilTo = (v: number, m: number) => Math.ceil(v / m) * m;

export const clonePlanes = (p: Planes): Planes => ({
  ...p,
  y: p.y.slice(),
  cb: p.cb.slice(),
  cr: p.cr.slice(),
});

/** RGB（0～1，w × h）→ YCbCr 平面（BT.601 全範圍）；右、下補邊 */
export function toPlanes(rgb: Float32Array, w: number, h: number, chroma: number): Planes {
  const sub = CHROMA_SUBSAMPLING[Math.max(0, Math.min(3, chroma))];
  const W = ceilTo(w, 16);
  const H = ceilTo(h, 16);
  const cw = ceilTo(W / sub.x, 8);
  const ch = ceilTo(H / sub.y, 8);
  const y = new Float32Array(W * H);
  const fullCb = new Float32Array(W * H);
  const fullCr = new Float32Array(W * H);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const o = (Math.min(h - 1, py) * w + Math.min(w - 1, px)) * 3;
      const r = rgb[o] * 255;
      const g = rgb[o + 1] * 255;
      const b = rgb[o + 2] * 255;
      const d = py * W + px;
      y[d] = 0.299 * r + 0.587 * g + 0.114 * b;
      fullCb[d] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      fullCr[d] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
  /* 色度：每一格取平均 */
  const cb = new Float32Array(cw * ch);
  const cr = new Float32Array(cw * ch);
  const k = 1 / (sub.x * sub.y);
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      let sb = 0;
      let sr = 0;
      for (let dy = 0; dy < sub.y; dy++)
        for (let dx = 0; dx < sub.x; dx++) {
          const o = Math.min(H - 1, cy * sub.y + dy) * W + Math.min(W - 1, cx * sub.x + dx);
          sb += fullCb[o];
          sr += fullCr[o];
        }
      cb[cy * cw + cx] = sb * k;
      cr[cy * cw + cx] = sr * k;
    }
  return { y, cb, cr, w: W, h: H, cw, ch, sx: sub.x, sy: sub.y };
}

/** YCbCr 平面 → RGBA（w × h；色度以最近點放大） */
export function fromPlanes(p: Planes, w: number, h: number, out: Uint8ClampedArray): void {
  for (let py = 0; py < h; py++) {
    const crow = Math.min(p.ch - 1, Math.floor(py / p.sy)) * p.cw;
    for (let px = 0; px < w; px++) {
      const Y = p.y[py * p.w + px];
      const c = crow + Math.min(p.cw - 1, Math.floor(px / p.sx));
      const Cb = p.cb[c] - 128;
      const Cr = p.cr[c] - 128;
      const o = (py * w + px) * 4;
      out[o] = Y + 1.402 * Cr;
      out[o + 1] = Y - 0.344136 * Cb - 0.714136 * Cr;
      out[o + 2] = Y + 1.772 * Cb;
      out[o + 3] = 255;
    }
  }
}

/* ---------- 8 × 8 DCT 與量化 ---------- */

/** DCT 的基底：C[k][n] = c(k) / 2 × cos((2n ＋ 1)kπ ÷ 16) */
const DCT = (() => {
  const m = new Float32Array(64);
  for (let k = 0; k < 8; k++)
    for (let n = 0; n < 8; n++)
      m[k * 8 + n] =
        (k === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * n + 1) * k * Math.PI) / 16);
  return m;
})();

/** JPEG 標準（ITU-T T.81 附錄 K）的量化表：亮度、色度 */
const Q_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
  92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const Q_CHROMA = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];

/** 品質（1～100）→ 量化表（IJG 的換算：50 以下 5000 ÷ q，以上 200 − 2q） */
export function quantTable(base: readonly number[], quality: number): Float32Array {
  const q = Math.max(1, Math.min(100, quality));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  return Float32Array.from(base, (v) =>
    Math.max(1, Math.min(255, Math.floor((v * scale + 50) / 100))),
  );
}

const blockBuf = new Float32Array(64);
const tmpBuf = new Float32Array(64);

/**
 * 平面上 (bx, by) 起的 8 × 8：減掉 pred（沒有＝減 128）→ DCT → 以 table 量化、還原 → IDCT → 加回 pred，寫到 out。
 */
function codeBlock(
  src: Float32Array,
  pred: Float32Array | null,
  out: Float32Array,
  stride: number,
  bx: number,
  by: number,
  table: Float32Array,
): void {
  const b = blockBuf;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const o = (by + y) * stride + bx + x;
      b[y * 8 + x] = src[o] - (pred ? pred[o] : 128);
    }
  /* F = C · B · Cᵀ */
  for (let k = 0; k < 8; k++)
    for (let x = 0; x < 8; x++) {
      let s = 0;
      for (let n = 0; n < 8; n++) s += DCT[k * 8 + n] * b[n * 8 + x];
      tmpBuf[k * 8 + x] = s;
    }
  for (let k = 0; k < 8; k++)
    for (let l = 0; l < 8; l++) {
      let s = 0;
      for (let n = 0; n < 8; n++) s += tmpBuf[k * 8 + n] * DCT[l * 8 + n];
      const q = table[k * 8 + l];
      b[k * 8 + l] = Math.round(s / q) * q;
    }
  /* B = Cᵀ · F · C */
  for (let n = 0; n < 8; n++)
    for (let l = 0; l < 8; l++) {
      let s = 0;
      for (let k = 0; k < 8; k++) s += DCT[k * 8 + n] * b[k * 8 + l];
      tmpBuf[n * 8 + l] = s;
    }
  for (let n = 0; n < 8; n++)
    for (let m = 0; m < 8; m++) {
      let s = 0;
      for (let l = 0; l < 8; l++) s += tmpBuf[n * 8 + l] * DCT[l * 8 + m];
      const o = (by + n) * stride + bx + m;
      out[o] = s + (pred ? pred[o] : 128);
    }
}

/** 一個平面全部編碼、解碼（pred 給了就是預測影格的殘差） */
function codePlane(
  src: Float32Array,
  pred: Float32Array | null,
  out: Float32Array,
  w: number,
  h: number,
  table: Float32Array,
): void {
  for (let by = 0; by < h; by += 8)
    for (let bx = 0; bx < w; bx += 8) codeBlock(src, pred, out, w, bx, by, table);
}

/* ---------- 一格的編碼、解碼 ---------- */

/** 預測影格越來越細：第 j 個（從 1 起）的量化表＝關鍵影格的 max(REFINE_FLOOR, REFINE_STEP^j) 倍 */
const REFINE_STEP = 0.7;
const REFINE_FLOOR = 0.2;
/** 第幾個預測影格之後量化表就不再變細 */
const REFINE_STEPS = Math.ceil(Math.log(REFINE_FLOOR) / Math.log(REFINE_STEP));

/** 每一格的編碼設定（由 Digital 算出） */
export interface CodecSettings {
  /** 量化表：關鍵影格（亮度、色度）；預測影格（第 j 個用 refine[min(j, 長度) − 1]，越後面越細） */
  intra: [Float32Array, Float32Array];
  refine: [Float32Array, Float32Array][];
  /** 關鍵影格的間隔（格；0＝每一格都是關鍵影格） */
  gop: number;
  /** 感光雜訊（亮度的標準差，0～255 的單位） */
  noise: number;
  /** 一格裡每一列巨集區塊開始遺失的機率 */
  loss: number;
  /** 關鍵影格被丟掉的機率 */
  mosh: number;
  /** 解碼後柔化方塊的邊（0～1） */
  smoothing: number;
}

/** noiseGain：感光雜訊再乘的倍數（低光雜訊，lowLightNoise；不給＝1） */
export function codecSettings(d: Digital, noiseGain = 1): CodecSettings {
  const intra: [Float32Array, Float32Array] = [
    quantTable(Q_LUMA, d.quality),
    quantTable(Q_CHROMA, d.quality),
  ];
  /* 預測影格的殘差一格比一格量化得細（關鍵影格之後畫面慢慢變細） */
  const refine = Array.from(
    { length: REFINE_STEPS },
    (_, k) =>
      intra.map((t) =>
        t.map((v) => Math.max(1, v * Math.max(REFINE_FLOOR, REFINE_STEP ** (k + 1)))),
      ) as [Float32Array, Float32Array],
  );
  return {
    intra,
    refine,
    gop: Math.round((d.keyframe / 10) * d.fps),
    noise: (d.noise / 100) * 14 * (1 - 0.6 * (d.denoise / 100)) * noiseGain,
    loss: (d.loss / 100) * 0.35,
    mosh: d.mosh / 100,
    smoothing: d.blockSmooth / 100,
  };
}

/** 第 n 格的來源：相機的固定畫面＋感光雜訊（色度的雜訊是亮度的兩倍） */
export function sourceFrame(base: Planes, c: CodecSettings, n: number): Planes {
  if (!(c.noise > 0)) return base;
  const out = clonePlanes(base);
  const s = c.noise;
  for (let i = 0; i < out.y.length; i++)
    out.y[i] += (hash01(n, i, 1) + hash01(n, i, 2) - 1) * s * 1.7;
  for (let i = 0; i < out.cb.length; i++) {
    out.cb[i] += (hash01(n, i, 3) + hash01(n, i, 4) - 1) * s * 3.4;
    out.cr[i] += (hash01(n, i, 5) + hash01(n, i, 6) - 1) * s * 3.4;
  }
  return out;
}

/** 第 n 格遺失的巨集區塊（16 × 16）：每一列以 loss 的機率從隨機的位置開始掉 2～8 個 */
export function dropBlocks(p: Planes, c: CodecSettings, n: number): Uint8Array {
  const mw = p.w / 16;
  const mh = p.h / 16;
  const lost = new Uint8Array(mw * mh);
  if (!(c.loss > 0)) return lost;
  for (let my = 0; my < mh; my++) {
    if (hash01(n, my, 11) >= c.loss) continue;
    const from = Math.floor(hash01(n, my, 12) * mw);
    const len = 2 + Math.floor(hash01(n, my, 13) * 7);
    for (let mx = from; mx < Math.min(mw, from + len); mx++) lost[my * mw + mx] = 1;
  }
  return lost;
}

/** 對選到的每一個巨集區塊（第 m 個）的三個平面做 fn(平面, 區塊左上, 區塊寬高, m)：亮度 16 × 16、色度依次取樣 */
export function eachMacroblock(
  p: Planes,
  pick: Uint8Array,
  fn: (plane: 'y' | 'cb' | 'cr', x: number, y: number, bw: number, bh: number, m: number) => void,
): void {
  const mw = p.w / 16;
  for (let m = 0; m < pick.length; m++) {
    if (!pick[m]) continue;
    const mx = (m % mw) * 16;
    const my = Math.floor(m / mw) * 16;
    fn('y', mx, my, 16, 16, m);
    for (const k of ['cb', 'cr'] as const) fn(k, mx / p.sx, my / p.sy, 16 / p.sx, 16 / p.sy, m);
  }
}

/** 平面 k 的格子是亮度的幾倍（橫、直） */
export const cell = (p: Planes, k: 'y' | 'cb' | 'cr') =>
  k === 'y' ? { x: 1, y: 1 } : { x: p.sx, y: p.sy };

const planeWidth = (p: Planes, k: 'y' | 'cb' | 'cr') => (k === 'y' ? p.w : p.cw);
const planeHeight = (p: Planes, k: 'y' | 'cb' | 'cr') => (k === 'y' ? p.h : p.ch);

/** 把 from 的 (x ＋ dx, y ＋ dy) 起的區塊複製到 to 的 (x, y)（超出邊界的取邊上） */
export function copyBlock(
  from: Planes,
  to: Planes,
  k: 'y' | 'cb' | 'cr',
  x: number,
  y: number,
  bw: number,
  bh: number,
  dx: number,
  dy: number,
): void {
  const W = planeWidth(from, k);
  const H = planeHeight(from, k);
  const src = from[k];
  const dst = to[k];
  for (let j = 0; j < bh; j++)
    for (let i = 0; i < bw; i++) {
      const sx = Math.max(0, Math.min(W - 1, Math.round(x + i + dx)));
      const sy = Math.max(0, Math.min(H - 1, Math.round(y + j + dy)));
      dst[(y + j) * W + x + i] = src[sy * W + sx];
    }
}

/** 關鍵影格：整張各自壓縮 */
function intraFrame(src: Planes, c: CodecSettings): Planes {
  const out = clonePlanes(src);
  codePlane(src.y, null, out.y, src.w, src.h, c.intra[0]);
  codePlane(src.cb, null, out.cb, src.cw, src.ch, c.intra[1]);
  codePlane(src.cr, null, out.cr, src.cw, src.ch, c.intra[1]);
  return out;
}

/** 關鍵影格之後的第 j 個預測影格：以 ref 為預測、殘差量化後加回 */
function interFrame(src: Planes, ref: Planes, c: CodecSettings, j: number): Planes {
  const [ty, tc] = c.refine[Math.max(0, Math.min(c.refine.length, j) - 1)];
  const out = clonePlanes(src);
  codePlane(src.y, ref.y, out.y, src.w, src.h, ty);
  codePlane(src.cb, ref.cb, out.cb, src.cw, src.ch, tc);
  codePlane(src.cr, ref.cr, out.cr, src.cw, src.ch, tc);
  return out;
}

/** datamosh 的移動場：每個巨集區塊一個向量（px／格），隨位置與時間慢慢變 */
function moshFlow(p: Planes, c: CodecSettings, n: number, seed: number): Float32Array {
  const mw = p.w / 16;
  const mh = p.h / 16;
  const v = new Float32Array(mw * mh * 2);
  /* simplex2 的值大約在 ±0.03（ntsc-rs 的邊緣波動也是除以 0.022 再用）：換成 ±1 左右再乘上每格幾 px */
  const amp = (1.5 + 4.5 * c.mosh) / 0.022;
  for (let my = 0; my < mh; my++)
    for (let mx = 0; mx < mw; mx++) {
      const o = (my * mw + mx) * 2;
      v[o] = simplex2(mx * 0.31 + 3.7, my * 0.31 + n * 0.04, seed) * amp * 0.6;
      v[o + 1] = simplex2(mx * 0.31 + 17.1, my * 0.31 - n * 0.03, seed + 1) * amp * 0.4;
    }
  return v;
}

/** 依移動場把畫面拖一格（每個巨集區塊從「反方向」那裡取） */
function dragFrame(p: Planes, flow: Float32Array): Planes {
  const out = clonePlanes(p);
  eachMacroblock(p, new Uint8Array(flow.length / 2).fill(1), (k, x, y, bw, bh, m) => {
    const g = cell(p, k);
    copyBlock(p, out, k, x, y, bw, bh, -flow[m * 2] / g.x, -flow[m * 2 + 1] / g.y);
  });
  return out;
}

/** 解碼後柔化方塊的邊（8 px 的格線兩側往中間靠） */
function smoothBlockEdges(p: Planes, amount: number): void {
  if (!(amount > 0)) return;
  const a = amount * 0.5;
  for (const k of ['y', 'cb', 'cr'] as const) {
    const W = planeWidth(p, k);
    const H = planeHeight(p, k);
    const d = p[k];
    for (let y = 0; y < H; y++)
      for (let x = 8; x < W; x += 8) {
        const o = y * W + x;
        const step = (d[o] - d[o - 1]) * a;
        d[o - 1] += step * 0.5;
        d[o] -= step * 0.5;
        d[o - 2] += step * 0.25;
        d[o + 1] -= step * 0.25;
      }
    for (let y = 8; y < H; y += 8)
      for (let x = 0; x < W; x++) {
        const o = y * W + x;
        const step = (d[o] - d[o - W]) * a;
        d[o - W] += step * 0.5;
        d[o] -= step * 0.5;
        d[o - 2 * W] += step * 0.25;
        d[o + W] -= step * 0.25;
      }
  }
}

/** 第 g 個關鍵影格有沒有留下來（每 3 個一定留一個：最多連續丟 2 個，往回算的格數有上限） */
export const keyframeKept = (g: number, mosh: number): boolean =>
  g % 3 === 0 || hash01(g, 0, 21) >= mosh;

/** 一種編碼的編碼器＋解碼器：decode(n) 回傳第 n 格解碼後的畫面（BlockCodec＝DCT、ColorBlockCodec＝方塊色） */
export interface FrameCodec {
  decode(n: number): Planes;
}

/**
 * 一台數位攝影機的編碼器＋解碼器：記著上一次解到哪一格（依序往後要時接著算，播放、匯出動畫不必從頭算）。
 * decode(n) 回傳第 n 格解碼後的畫面。
 */
export class BlockCodec implements FrameCodec {
  private readonly base: Planes;
  private readonly c: CodecSettings;
  /** 依序算的狀態：從哪一個留下來的關鍵影格開始、算到第幾格、編碼器與解碼器各自的參考畫面、是不是已經在 datamosh */
  private chain: { start: number; n: number; enc: Planes; dec: Planes; moshed: boolean } | null =
    null;

  constructor(base: Planes, settings: CodecSettings) {
    this.base = base;
    this.c = settings;
  }

  /** 第 n 格的關鍵影格是從哪一格開始的那一段（往回找最近一個留下來的關鍵影格） */
  private chainStart(n: number): number {
    const K = this.c.gop;
    if (K <= 0) return n;
    let g = Math.floor(n / K);
    while (g > 0 && !keyframeKept(g, this.c.mosh)) g--;
    return g * K;
  }

  private keyframe(n: number): { enc: Planes; dec: Planes } {
    const src = sourceFrame(this.base, this.c, n);
    const enc = intraFrame(src, this.c);
    const dec = clonePlanes(enc);
    /* 關鍵影格的遺失：拿錯位的內容補（閃一下，下一格就沒了） */
    eachMacroblock(enc, dropBlocks(enc, this.c, n), (plane, x, y, bw, bh, m) => {
      const g = cell(enc, plane);
      const dx = Math.round((hash01(n, m, 31) - 0.5) * 48) / g.x;
      const dy = Math.round((hash01(n, m, 32) - 0.5) * 32) / g.y;
      copyBlock(enc, dec, plane, x, y, bw, bh, dx, dy);
    });
    return { enc, dec };
  }

  decode(n: number): Planes {
    const K = this.c.gop;
    let out: Planes;
    if (K <= 0) out = this.keyframe(n).dec;
    else {
      const start = this.chainStart(n);
      let ch = this.chain;
      if (!ch || ch.start !== start || ch.n > n) {
        const first = this.keyframe(start);
        ch = { start, n: start, enc: first.enc, dec: first.dec, moshed: false };
      }
      for (let m = ch.n + 1; m <= n; m++) {
        if (m % K === 0) {
          /* 被丟掉的關鍵影格（留下來的不會在這段的中間）：編碼器照樣更新，解碼器沒收到 */
          ch.enc = intraFrame(sourceFrame(this.base, this.c, m), this.c);
          ch.moshed = true;
          continue;
        }
        if (ch.moshed) {
          ch.dec = dragFrame(ch.dec, moshFlow(ch.dec, this.c, m, 7));
          continue;
        }
        const enc = interFrame(sourceFrame(this.base, this.c, m), ch.enc, this.c, m % K);
        const dec = clonePlanes(enc);
        /* 解碼器的參考和編碼器不同的地方（之前遺失的）照樣錯下去：殘差加在解碼器自己的參考上 */
        for (const k of ['y', 'cb', 'cr'] as const) {
          const e = enc[k];
          const d = dec[k];
          const re = ch.enc[k];
          const rd = ch.dec[k];
          for (let i = 0; i < d.length; i++) d[i] = rd[i] + (e[i] - re[i]);
        }
        const ref = ch.dec;
        eachMacroblock(enc, dropBlocks(enc, this.c, m), (plane, x, y, bw, bh) =>
          copyBlock(ref, dec, plane, x, y, bw, bh, 0, 0),
        );
        ch.enc = enc;
        ch.dec = dec;
      }
      ch.n = n;
      this.chain = ch;
      out = ch.dec;
    }
    if (this.c.smoothing > 0) {
      out = clonePlanes(out);
      smoothBlockEdges(out, this.c.smoothing);
    }
    return out;
  }
}

/** 時間 t（秒）→ 數位攝影的第幾格 */
export const digitalFrameAt = (t: number, fps: number): number => Math.floor(t * fps + 1e-6);
