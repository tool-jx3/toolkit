/**
 * 立繪裁切器的畫布處理（瀏覽器內）：解碼、量角色、取裁切範圍的像素、畫預覽。
 * 像素一比一搬移（整數位移、不縮放），結果與 logic.ts 的 cropPixels 相同。
 */
import { imageOpaqueBounds, imageOpaqueSpanInRows, loadImage } from '@/core/image';
import { type CropGeometry, type Figure, measureFigure, type RgbaBuffer } from './logic';

type Ctx2D = CanvasRenderingContext2D;

/** 解碼並量角色範圍與頭部、上半身中心（只讀需要的那幾條像素） */
export async function decodeImage(file: Blob): Promise<{ bitmap: ImageBitmap; figure: Figure }> {
  const bitmap = await loadImage(file);
  try {
    const { width, height } = bitmap;
    if (!width || !height) throw new Error('空的圖片');
    const figure = measureFigure(width, height, imageOpaqueBounds(bitmap, 0), (y0, y1) =>
      imageOpaqueSpanInRows(bitmap, y0, y1, 0),
    );
    return { bitmap, figure };
  } catch (e) {
    bitmap.close();
    throw e;
  }
}

function context(canvas: HTMLCanvasElement): Ctx2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
}

/** 裁切範圍的像素（圖片外的部分透明） */
export function cropRgba(
  image: CanvasImageSource,
  g: Pick<CropGeometry, 'x' | 'y' | 'width' | 'height'>,
): RgbaBuffer {
  const c = document.createElement('canvas');
  c.width = g.width;
  c.height = g.height;
  const ctx = context(c);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, -g.x, -g.y);
  const img = ctx.getImageData(0, 0, g.width, g.height);
  return { data: img.data, width: img.width, height: img.height };
}

/** 像素 → 畫布（預覽疊圖用） */
export function rgbaToCanvas(rgba: RgbaBuffer): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rgba.width;
  c.height = rgba.height;
  context(c).putImageData(new ImageData(rgba.data, rgba.width, rgba.height), 0, 0);
  return c;
}

export interface EffectLayer {
  /** 這張效果圖對應的裁切範圍（原圖座標） */
  rect: { x: number; y: number; width: number; height: number };
  canvas: HTMLCanvasElement;
}

/**
 * 畫預覽：整張原圖，再把裁切框裡換成加了效果的結果（所見即所得）。
 * 效果圖還沒算到目前的位置時（拖曳中），先用上一次的結果、只畫在兩個範圍重疊的地方。
 */
export function drawPreview(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource | null,
  frame: { x: number; y: number; width: number; height: number } | null,
  fx: EffectLayer | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!image) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  if (!frame || !fx) return;
  const r = fx.rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.width, frame.height);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.width, r.height);
  ctx.clip();
  /* 先清掉原圖再畫結果：結果裡已經有原本的角色像素，疊上去會讓半透明的邊變濃 */
  ctx.clearRect(r.x, r.y, r.width, r.height);
  ctx.drawImage(fx.canvas, r.x, r.y);
  ctx.restore();
}
