/**
 * 去背的處理流程（純函式；主執行緒與 Worker 共用，預覽與匯出走同一條路，結果相同）：
 *
 *   原圖 → 基礎遮罩（AI：模型的遮罩；純色：色鍵）→ 收縮／擴張 → 羽化 → 筆刷 → 套到原圖（純色可去色邊）→ 輸出
 *
 * 遮罩一律是 0～255（AI 的浮點數遮罩以 floor(m × 255) 量化，同原作的 `(mask * 255).astype(np.uint8)`）。
 */

import { parseColor } from '@/core/color';
import { decodePng } from '@/core/decode/png';
import { encodePng } from '@/core/encode/png';
import { canvasWebpEncoder } from '@/core/encode/webp';
import type { Rgb } from '@/core/image';
import {
  applyMask,
  applyStroke,
  colorKeyMask,
  decontaminate,
  estimateBackground,
  featherMask,
  flattenRgba,
  growMask,
  type Mask,
  maskToRgba,
  quantizeMask,
} from '@/core/image';
import { fromModelOutput, type Letterbox, MODEL_SIZE, toModelInput } from './animeSeg';
import type { OutBackground, OutContent, OutFormat, StoredStroke } from './model';

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
  /** null＝自動偵測（從四邊找最多的顏色） */
  color: Rgb | null;
  tolerance: number;
  softness: number;
  connected: boolean;
}

export interface ColorBase {
  mask: Mask;
  /** 實際用的背景色 */
  bg: [number, number, number];
  /** 自動偵測時四邊是這個顏色的比例 */
  ratio: number;
}

export function colorBase(src: SourceImage, p: KeyParams): ColorBase {
  const est = p.color ? null : estimateBackground(src.rgba, src.width, src.height);
  const bg: [number, number, number] = p.color ? [p.color[0], p.color[1], p.color[2]] : est!.color;
  const mask = colorKeyMask(src.rgba, src.width, src.height, {
    color: bg,
    tolerance: p.tolerance,
    softness: p.softness,
    connected: p.connected,
  }) as Mask;
  return { mask, bg, ratio: est?.ratio ?? 1 };
}

/** AI 的前處理（給推論 Worker 的張量） */
export function aiInput(src: SourceImage): { tensor: Float32Array; box: Letterbox } {
  return toModelInput(src.rgba, src.width, src.height, MODEL_SIZE);
}

/** AI 的後處理：模型輸出 → 原圖尺寸的 0～255 遮罩 */
export function aiMask(pred: Float32Array, box: Letterbox): Mask {
  return quantizeMask(fromModelOutput(pred, box));
}

/* ---------- 邊緣調整與筆刷 ---------- */

export function refineMask(base: Mask, w: number, h: number, grow: number, feather: number): Mask {
  let m = grow ? growMask(base, w, h, grow) : base;
  if (feather > 0) m = featherMask(m, w, h, feather);
  return m === base ? (new Uint8Array(base) as Mask) : m;
}

/** 存起來的筆刷依序畫到遮罩上（直接改 mask） */
export function applyStrokes(mask: Mask, w: number, h: number, strokes: readonly StoredStroke[]) {
  for (const s of strokes) {
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
 * 去背圖的顏色：純色模式開了去色邊時用基礎遮罩把背景色扣掉（半透明的像素，以及去背邊界旁 2 px 內
 * 顏色朝背景色偏的像素），否則原圖
 */
export function cutoutColors(
  src: SourceImage,
  despill: { base: Mask; bg: Rgb } | null,
): Uint8ClampedArray<ArrayBuffer> {
  return despill
    ? decontaminate(src.rgba, despill.base, despill.bg, {
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
