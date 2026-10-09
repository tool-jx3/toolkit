/**
 * 效果差分（規格 3.5）：從立繪做出剪影、懷舊、黑白、模糊、半透明的 PNG。
 * 剪影、懷舊、黑白、半透明是像素運算（純函式，Node 也能測）；模糊照原作用 canvas 的 filter（四周加透明邊）。
 */
import { canvasToBlob, loadImage, makeCanvas } from '@/core/image';

export const EFFECTS = ['silhouette', 'sepia', 'mono', 'blur', 'ghost'] as const;
export type Effect = (typeof EFFECTS)[number];

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** 像素運算（直接改 rgba）。模糊不在這裡（要 canvas）。 */
export function applyPixelEffect(rgba: Uint8ClampedArray, fx: Exclude<Effect, 'blur'>): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    switch (fx) {
      case 'silhouette':
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        break;
      case 'sepia':
        /* CSS sepia(1) 的矩陣 */
        rgba[i] = clamp(0.393 * r + 0.769 * g + 0.189 * b);
        rgba[i + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b);
        rgba[i + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b);
        break;
      case 'mono': {
        /* CSS grayscale(1) 的矩陣 */
        const l = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b);
        rgba[i] = l;
        rgba[i + 1] = l;
        rgba[i + 2] = l;
        break;
      }
      case 'ghost':
        rgba[i + 3] = Math.round(rgba[i + 3] * 0.5);
        break;
    }
  }
}

/** 縮成 48 × 48 的像素裡有沒有透明度 < 250 的（剪影要背景透明） */
export function hasTransparentPixel(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true;
  return false;
}

/** 模糊：四周加的透明邊與模糊半徑（短邊的 1/20、1/80） */
export function blurGeometry(width: number, height: number): { pad: number; radius: number } {
  const small = Math.min(width, height);
  return { pad: Math.max(8, Math.round(small / 20)), radius: Math.max(2, Math.round(small / 80)) };
}

export class EffectError extends Error {
  constructor(public readonly reason: 'opaque' | 'unsupported' | 'encode') {
    super(reason);
  }
}

/** 瀏覽器支不支援 canvas 的 filter */
export function canvasFilterSupported(): boolean {
  try {
    const ctx = makeCanvas(1, 1).getContext('2d') as CanvasRenderingContext2D | null;
    return !!ctx && 'filter' in ctx;
  } catch {
    return false;
  }
}

/** 立繪（會動的圖取第一格）做成效果差分的 PNG。剪影時背景不透明丟 EffectError('opaque')。 */
export async function renderEffect(source: Blob, fx: Effect): Promise<Blob> {
  const bmp = await loadImage(source);
  const w = bmp.width;
  const h = bmp.height;
  if (fx === 'silhouette') {
    const probe = makeCanvas(48, 48);
    const pctx = probe.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    pctx.drawImage(bmp, 0, 0, 48, 48);
    if (!hasTransparentPixel(pctx.getImageData(0, 0, 48, 48).data)) {
      throw new EffectError('opaque');
    }
  }
  if (fx === 'blur') {
    const { pad, radius } = blurGeometry(w, h);
    const c = makeCanvas(w + pad * 2, h + pad * 2);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    if (!('filter' in ctx)) throw new EffectError('unsupported');
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(bmp, pad, pad);
    return toPng(c);
  }
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  applyPixelEffect(img.data, fx);
  ctx.putImageData(img, 0, 0);
  return toPng(c);
}

async function toPng(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  try {
    return await canvasToBlob(c, 'image/png');
  } catch {
    throw new EffectError('encode');
  }
}
