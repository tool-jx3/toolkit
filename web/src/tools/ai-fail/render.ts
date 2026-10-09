/**
 * 畫梗圖（預覽與下載同一段程式，規格第 3 節）：清成透明 → 照片（鋪滿、目前的位置與倍率）→
 * 每個框依畫的順序先畫方框、再畫自己的標籤。選取標示與畫到一半的框不在這裡畫（疊在預覽上的操作層）。
 */
import { ensureFont, type FontValue, fontCss } from '@/core/fonts';
import { canvasToBlob, makeCanvas } from '@/core/image';
import {
  canvasSize,
  labelPlacement,
  type MemeBox,
  type MemeState,
  photoRect,
  type Size,
} from './model';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawBox(ctx: Ctx2D, b: MemeBox, font: FontValue): void {
  ctx.save();
  ctx.strokeStyle = b.color;
  ctx.lineWidth = b.lineWidth;
  ctx.lineJoin = 'miter';
  ctx.setLineDash([]);
  ctx.strokeRect(b.x, b.y, b.width, b.height);
  if (b.label) {
    const p = labelPlacement(b);
    ctx.fillStyle = b.color;
    ctx.font = fontCss(font, b.fontSize);
    ctx.textAlign = p.align;
    ctx.textBaseline = p.baseline;
    ctx.fillText(b.label, p.x, p.y);
  }
  ctx.restore();
}

/** 畫整張梗圖；photo 是解碼後的照片（還沒讀到時只畫框） */
export function drawMeme(
  ctx: Ctx2D,
  d: MemeState,
  photo: CanvasImageSource | null,
  size: Size = canvasSize(d.aspect, d.photo),
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  if (photo && d.photo) {
    const r = photoRect(size, d.photo, d.view);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, r.x, r.y, r.width, r.height);
    ctx.restore();
  }
  for (const b of d.boxes) drawBox(ctx, b, d.font);
}

/** 所有標籤的文字（載入字型時只下載用到的字） */
export const labelText = (d: MemeState): string =>
  d.boxes
    .map((b) => b.label)
    .join('')
    .trim();

/** 載入標籤字型（只下載用到的字）；回傳字型是否可用 */
export function ensureLabelFont(d: MemeState): Promise<boolean> {
  const text = labelText(d);
  if (!text) return Promise.resolve(true);
  return ensureFont(d.font.family, d.font.weight, text);
}

/** 下載用的 PNG（等字型載好再畫） */
export async function renderPng(d: MemeState, photo: CanvasImageSource): Promise<Blob> {
  await ensureLabelFont(d);
  const size = canvasSize(d.aspect, d.photo);
  const canvas = makeCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) throw new Error('canvas');
  drawMeme(ctx, d, photo, size);
  return canvasToBlob(canvas);
}
