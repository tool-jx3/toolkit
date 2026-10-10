/**
 * 去背的處理流程（純函式；主執行緒與 Worker 共用，預覽與匯出走同一條路，結果相同）：
 *
 *   原圖 → 基礎遮罩（AI：模型的遮罩套色階；純色：色鍵；AI＋背景色：兩者合併）→ 去掉孤島 → 收縮／擴張 → 羽化 → 筆刷
 *   → 套到原圖（用背景色的方式可去色邊）→ 輸出
 *
 * 遮罩一律是 0～255。AI 的浮點數遮罩存成 floor(m × 255)（同原作的 `(mask * 255).astype(np.uint8)`），
 * 用的時候再套色階（AI_LEVELS）：舊版存的遮罩也是同一套規則，不必重跑 AI。
 */

import { parseColor } from '@/core/color';
import { decodePng } from '@/core/decode/png';
import { encodePng } from '@/core/encode/png';
import { canvasWebpEncoder } from '@/core/encode/webp';
import type { BorderColor, KeyColors, Rgb } from '@/core/image';
import {
  applyMask,
  applyRegion,
  applyStroke,
  borderColors,
  colorKeyMask,
  colorRegion,
  decontaminate,
  estimateBackground,
  featherMask,
  flattenRgba,
  growMask,
  keepPieces,
  levelsMask,
  type Mask,
  maskPieces,
  maskToRgba,
  piecesTouching,
  quantizeMask,
  removeIslands,
} from '@/core/image';
import { fromModelOutput, type Letterbox, MODEL_SIZE, toModelInput } from './animeSeg';
import {
  type FillStroke,
  isFillStroke,
  type OutBackground,
  type OutContent,
  type OutFormat,
  type Settings,
  type StoredStroke,
} from './model';

export interface SourceImage {
  width: number;
  height: number;
  /** RGBA（直接存色，不預乘） */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

/* ---------- 讀圖 ---------- */

const isPngBytes = (b: Uint8Array) =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/**
 * 解碼原圖。PNG（含 APNG 的預設圖）用本站的純 JavaScript 解碼器：像素與 OpenCV 讀到的完全相同
 * （不經過畫布：畫布會預乘透明度、套色彩描述檔）。其他格式由瀏覽器解碼（不套色彩描述檔）。
 */
export async function decodeSource(blob: Blob): Promise<SourceImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isPngBytes(bytes)) {
    try {
      const { width, height, rgba } = decodePng(bytes);
      return { width, height, rgba };
    } catch {
      /* 不認得的 PNG 變體交給瀏覽器 */
    }
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
  } catch {
    throw new Error('decode');
  }
  const { width, height } = bitmap;
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('decode');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
}

/* ---------- 基礎遮罩 ---------- */

export interface KeyParams {
  /** 第一個背景色；null＝自動偵測（從四邊找最多的顏色） */
  color: Rgb | null;
  /** 其他背景色（所有圖共用） */
  extra: Rgb[];
  /** 兩個背景色之間的混色也算背景 */
  blend: boolean;
  tolerance: number;
  softness: number;
  connected: boolean;
}

const rgbOrNull = (hex: string): Rgb | null => {
  const c = parseColor(hex);
  return c ? [c.r, c.g, c.b] : null;
};

/**
 * 設定 → 色鍵的參數：第一色自動或指定、其他背景色；只有一個背景色時混色當成關（結果相同，切換時不必重算）；
 * AI＋背景色用自己的容許度／柔邊。
 */
export function keyParamsOf(s: Settings): KeyParams {
  const extra = s.keyExtra.map(rgbOrNull).filter((c): c is Rgb => !!c);
  const combo = s.mode === 'combo';
  return {
    color: s.keyAuto ? null : rgbOrNull(s.keyColor),
    extra,
    blend: extra.length > 0 && s.keyBlend,
    tolerance: combo ? s.comboTolerance : s.tolerance,
    softness: combo ? s.comboSoftness : s.softness,
    connected: s.connected,
  };
}

/** 四邊其他常見的顏色：比例到這麼多才列成建議 */
export const SUGGEST_MIN_RATIO = 0.1;

export interface ColorBase {
  mask: Mask;
  /** 實際用的第一個背景色（自動偵測時是偵測到的顏色） */
  bg: [number, number, number];
  /** 自動偵測時四邊是這個顏色的比例 */
  ratio: number;
  /** 實際用的背景色集合（去色邊用） */
  keys: KeyColors;
  /** 四邊常見的顏色（比例 ≥ SUGGEST_MIN_RATIO，由多到少；介面拿掉已經在清單裡的，其餘列成建議） */
  suggest: BorderColor[];
}

export function colorBase(src: SourceImage, p: KeyParams): ColorBase {
  const est = p.color ? null : estimateBackground(src.rgba, src.width, src.height);
  const bg: [number, number, number] = p.color ? [p.color[0], p.color[1], p.color[2]] : est!.color;
  const mask = colorKeyMask(src.rgba, src.width, src.height, {
    color: bg,
    extra: p.extra,
    blend: p.blend,
    tolerance: p.tolerance,
    softness: p.softness,
    connected: p.connected,
  }) as Mask;
  return {
    mask,
    bg,
    ratio: est?.ratio ?? 1,
    keys: { colors: [bg, ...p.extra], blend: p.blend },
    suggest: borderColors(src.rgba, src.width, src.height, { minRatio: SUGGEST_MIN_RATIO }),
  };
}

/** AI 的前處理（給推論 Worker 的張量） */
export function aiInput(src: SourceImage): { tensor: Float32Array; box: Letterbox } {
  return toModelInput(src.rgba, src.width, src.height, MODEL_SIZE);
}

/** AI 的後處理：模型輸出 → 原圖尺寸的 0～255 遮罩（存起來的就是這個：同原作無條件捨去） */
export function aiMask(pred: Float32Array, box: Letterbox): Mask {
  return quantizeMask(fromModelOutput(pred, box));
}

/**
 * AI 遮罩的色階（存著的 8 位元值）：≤ 5（模型輸出 < 約 0.024）→ 0、≥ 204（≥ 0.8）→ 255，中間線性。
 * 模型的輸出到不了 1.0（內部多半是 254，有些地方 200 多），淡霧 1～5 佔了大片背景；量測見規格第 5 節 D13。
 */
export const AI_LEVELS = { lo: 5, hi: 204 } as const;

/** AI 的基礎遮罩：存著的 8 位元遮罩套色階（新舊遮罩同一套規則） */
export function aiBase(stored: Mask): Mask {
  return levelsMask(stored, AI_LEVELS.lo, AI_LEVELS.hi);
}

/** AI＋背景色：背景色的結果以這個門檻分塊（至少一半不透明才算連在一起） */
export const COMBO_LINK = 128;

/**
 * AI＋背景色的合併（ai 是套過色階的 AI 遮罩、key 是色鍵的遮罩）：
 * - AI 認定是角色（255）的地方：255（和背景同色的荷葉邊、白衣服也留著）；
 * - 否則背景色的結果是 0（是背景色，開著「只去掉相連的」時還要連到圖外）：0（去掉 AI 留下的半透明邊、淡霧）；
 * - 否則取 AI 和「背景色的結果裡連到 AI 角色的塊」較大的（AI 漏掉的翅膀、尾巴補回來，邊緣用背景色的柔邊；
 *   和角色分開的花紋、方塊不會被加回來）。塊＝背景色的結果 ≥ COMBO_LINK 的八連通塊，塊裡有 AI 255 的像素才算連到角色。
 */
export function comboMask(ai: Mask, key: Mask, w: number, h: number): Mask {
  const pieces = maskPieces(key, w, h, COMBO_LINK);
  const linked = keepPieces(key, w, h, pieces, piecesTouching(pieces, ai, 255));
  const out = new Uint8Array(w * h) as Mask;
  for (let i = 0; i < out.length; i++) {
    const a = ai[i];
    out[i] = a === 255 ? 255 : key[i] === 0 ? 0 : a > linked[i] ? a : linked[i];
  }
  return out;
}

/** AI＋背景色的基礎遮罩（ai 已套色階）；背景色的偵測、建議同 colorBase */
export function comboBase(src: SourceImage, ai: Mask, p: KeyParams): ColorBase {
  const key = colorBase(src, p);
  return { ...key, mask: comboMask(ai, key.mask, src.width, src.height) };
}

/* ---------- 邊緣調整與筆刷 ---------- */

/**
 * 邊緣調整：去掉孤島（islands＝留比最大一塊的這個比例大的塊，0～1；null＝關）→ 收縮／擴張 → 羽化。
 * 都沒做時回傳複本。
 */
export function refineMask(
  base: Mask,
  w: number,
  h: number,
  grow: number,
  feather: number,
  islands: number | null = null,
): Mask {
  let m = islands === null ? base : removeIslands(base, w, h, { minRatio: islands });
  if (grow) m = growMask(m, w, h, grow);
  if (feather > 0) m = featherMask(m, w, h, feather);
  return m === base ? (new Uint8Array(base) as Mask) : m;
}

/** 同色擦掉／補回的範圍（依目前的遮罩與原圖的顏色） */
export function fillRegion(mask: Mask, src: SourceImage, f: FillStroke) {
  return colorRegion(src.rgba, mask, src.width, src.height, {
    x: f.x,
    y: f.y,
    tolerance: f.t,
    contiguous: f.c,
    target: f.m === 'fe' ? 'visible' : 'removed',
  });
}

/** 存起來的筆刷與同色擦掉／補回依序畫到遮罩上（直接改 mask） */
export function applyStrokes(mask: Mask, src: SourceImage, strokes: readonly StoredStroke[]) {
  const { width: w, height: h } = src;
  for (const s of strokes) {
    if (isFillStroke(s)) {
      const r = fillRegion(mask, src, s);
      if (r.count) applyRegion(mask, r.region, s.m === 'fe' ? 'erase' : 'restore');
      continue;
    }
    applyStroke(mask, w, h, {
      mode: s.m === 'r' ? 'restore' : 'erase',
      size: s.s,
      hardness: s.h,
      points: s.p,
    });
  }
}

/* ---------- 輸出 ---------- */

export interface OutputSpec {
  content: OutContent;
  /** 實際的背景（JPG 透明時已換成白色，見 model.ts 的 effectiveBackground） */
  background: OutBackground;
  bgColor: string;
  format: OutFormat;
  trim: boolean;
  trimPad: number;
}

export interface RenderedImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

/** 去色邊也處理去背邊界旁這麼寬（px）的一圈不透明像素（規格 3.2） */
export const DESPILL_EDGE = 2;

/**
 * 去背圖的顏色：用背景色的方式（純色背景、AI＋背景色）開了去色邊時，用基礎遮罩把背景色扣掉（半透明的像素，
 * 以及去背邊界旁 2 px 內顏色朝背景色偏的像素；多個背景色時每個像素用附近的背景最接近的背景色），否則原圖
 */
export function cutoutColors(
  src: SourceImage,
  despill: { base: Mask; keys: KeyColors } | null,
): Uint8ClampedArray<ArrayBuffer> {
  return despill
    ? decontaminate(src.rgba, despill.base, despill.keys, {
        width: src.width,
        height: src.height,
        edge: DESPILL_EDGE,
      })
    : src.rgba;
}

/** 不透明度 > 0 的範圍（整張透明時 null） */
export function alphaBounds(rgba: Uint8ClampedArray, w: number, h: number) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** 裁到內容範圍並在四周留 pad px 的透明邊（超出原圖的部分補透明） */
export function trimRgba(img: RenderedImage, pad: number): RenderedImage {
  const b = alphaBounds(img.rgba, img.width, img.height);
  if (!b) return img;
  const x0 = b.x - pad;
  const y0 = b.y - pad;
  const w = b.width + 2 * pad;
  const h = b.height + 2 * pad;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4;
      out.set(img.rgba.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, rgba: out };
}

const rgbOf = (hex: string): [number, number, number] => {
  const c = parseColor(hex);
  return c ? [c.r, c.g, c.b] : [255, 255, 255];
};

/**
 * 組出輸出的像素：
 * - 去背圖：原圖（或去色邊後的）＋最終遮罩；完全透明的像素 RGB 清成 0；可裁掉透明邊；背景白色／自訂色時合成成不透明。
 * - 遮罩：灰階（白＝留下），原圖尺寸。
 * - 比較圖：同原作的「不只輸出去背圖」：左右排「原圖｜去背後疊在黑底｜遮罩」，寬是原圖的 3 倍、不透明。
 */
export function composeOutput(
  src: SourceImage,
  colors: Uint8ClampedArray,
  mask: Mask,
  spec: OutputSpec,
): RenderedImage {
  const { width: w, height: h } = src;
  if (spec.content === 'mask') return { width: w, height: h, rgba: maskToRgba(mask) };
  if (spec.content === 'compare') {
    const out = new Uint8ClampedArray(w * 3 * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = i * 4;
        const m = mask[i];
        const o = (y * w * 3 + x) * 4;
        for (let c = 0; c < 3; c++) {
          out[o + c] = src.rgba[p + c];
          out[o + w * 4 + c] = Math.floor((src.rgba[p + c] * m) / 255);
          out[o + w * 8 + c] = m;
        }
        out[o + 3] = out[o + w * 4 + 3] = out[o + w * 8 + 3] = 255;
      }
    }
    return { width: w * 3, height: h, rgba: out };
  }
  let img: RenderedImage = {
    width: w,
    height: h,
    rgba: applyMask(colors, mask, { clearTransparent: true }),
  };
  if (spec.trim) img = trimRgba(img, spec.trimPad);
  if (spec.background !== 'transparent') {
    const color = spec.background === 'white' ? ([255, 255, 255] as const) : rgbOf(spec.bgColor);
    img = { ...img, rgba: flattenRgba(img.rgba, color) };
  }
  return img;
}

export const MIME: Record<OutFormat, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpg: 'image/jpeg',
};

/** 編碼：PNG 用本站的編碼器（像素逐值保留）；WebP 無損與 JPG（品質 0.95）由瀏覽器編碼 */
export async function encodeImage(img: RenderedImage, format: OutFormat): Promise<Uint8Array> {
  if (format === 'png') return encodePng(img.rgba, img.width, img.height);
  if (format === 'webp') return canvasWebpEncoder(img.rgba, img.width, img.height, 1);
  /* JPG 沒有透明：還有半透明的像素時先合成到白色上（去背圖在這之前已經合成到選的背景上） */
  let rgba = img.rgba;
  for (let k = 3; k < rgba.length; k += 4) {
    if (rgba[k] < 255) {
      rgba = flattenRgba(rgba, [255, 255, 255]);
      break;
    }
  }
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(img.width, img.height)
      : Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('canvas');
  ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  const blob =
    typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement
      ? await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.95))
      : await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  if (!blob) throw new Error('encode');
  return new Uint8Array(await blob.arrayBuffer());
}

/** 遮罩存成 PNG（灰階畫成 RGBA；讀回時取 R） */
export async function encodeMaskPng(mask: Mask, w: number, h: number): Promise<Uint8Array> {
  return encodePng(maskToRgba(mask), w, h);
}

export function decodeMaskPng(bytes: Uint8Array): { mask: Mask; width: number; height: number } {
  const { width, height, rgba } = decodePng(bytes);
  const mask = new Uint8Array(width * height) as Mask;
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4];
  return { mask, width, height };
}
