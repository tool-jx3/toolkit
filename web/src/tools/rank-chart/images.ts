/**
 * 照片：讀檔與檢查（25 MB、6,400 萬像素）、長邊縮小（角色 1500、排名者 1800）後放進資產庫（IndexedDB）、
 * 角色照片依裁切做成 512 × 512 的正方形（也放進資產庫）。
 */
import { canvasToBlob, loadImage, makeCanvas } from '@/core/image';
import {
  type Crop,
  cropRect,
  fitLongSide,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_PIXELS,
  type PhotoRef,
  THUMB_SIZE,
} from './model';
import { assets, putImage } from './store';
import { S } from './strings';

export class PhotoError extends Error {}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;
export const PHOTO_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp';

export const isImageFile = (f: File): boolean =>
  /^image\/(png|jpe?g|webp|gif|avif|bmp|x-ms-bmp)$/i.test(f.type) || IMAGE_EXT.test(f.name);

export interface StoredPhoto {
  ref: PhotoRef;
  bitmap: ImageBitmap;
  /** 有存進 IndexedDB（false：這次可以用，重新整理後就沒了） */
  persisted: boolean;
}

/** 長邊超過 max 時縮小（WebP；瀏覽器不能存 WebP 時是 PNG），不然直接用原檔 */
async function shrink(file: Blob, bmp: ImageBitmap, max: number): Promise<Blob> {
  if (Math.max(bmp.width, bmp.height) <= max) return file;
  const size = fitLongSide(bmp.width, bmp.height, max);
  const c = makeCanvas(size.width, size.height);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, size.width, size.height);
  return canvasToBlob(c, 'image/webp', 0.95);
}

/** 讀一張照片放進資產庫（不合格時丟 PhotoError，訊息可以直接顯示） */
export async function storePhoto(file: File, maxSide: number): Promise<StoredPhoto> {
  if (!isImageFile(file)) throw new PhotoError(S.notImage(file.name));
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoError(S.tooBig(file.name));
  let src: ImageBitmap;
  try {
    src = await loadImage(file);
  } catch {
    throw new PhotoError(S.decodeError(file.name));
  }
  if (!src.width || !src.height) throw new PhotoError(S.decodeError(file.name));
  if (src.width * src.height > PHOTO_MAX_PIXELS) {
    src.close?.();
    throw new PhotoError(S.tooManyPixels(file.name));
  }
  const blob = await shrink(file, src, maxSide);
  const added = await assets.add(blob);
  const bitmap = blob === file ? src : await assets.bitmap(added.id);
  if (blob !== file) src.close?.();
  if (!bitmap) throw new PhotoError(S.decodeError(file.name));
  putImage(added.id, bitmap);
  return {
    ref: { id: added.id, width: bitmap.width, height: bitmap.height },
    bitmap,
    persisted: added.persisted,
  };
}

/** 依裁切畫成 512 × 512 的正方形（高品質縮放） */
export function drawThumb(
  img: CanvasImageSource,
  size: { width: number; height: number },
  crop: Crop,
) {
  const c = makeCanvas(THUMB_SIZE, THUMB_SIZE);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('canvas');
  const r = cropRect(size, crop);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return c;
}

/** 做裁切圖並放進資產庫，回傳資產 id */
export async function storeThumb(
  img: CanvasImageSource,
  size: { width: number; height: number },
  crop: Crop,
): Promise<{ id: string; persisted: boolean }> {
  const canvas = drawThumb(img, size, crop);
  const blob = await canvasToBlob(canvas, 'image/png');
  const added = await assets.add(blob);
  const bmp = await createImageBitmap(canvas);
  putImage(added.id, bmp);
  return { id: added.id, persisted: added.persisted };
}

/** 原圖（裁切時用；資產庫有快取） */
export async function sourceBitmap(ref: PhotoRef | null): Promise<ImageBitmap | null> {
  if (!ref) return null;
  return (await assets.bitmap(ref.id).catch(() => undefined)) ?? null;
}
