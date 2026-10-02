/**
 * 圖片檔的讀入（F150、F165、F213）。
 */
import { pickFiles, readAsDataUrl } from '@/core/files';
import { IMAGE_MAX_SIDE } from './model/image';

export interface ReadImage {
  /** data URL */
  data: string;
  /** 長寬比（高 ÷ 寬）；讀不出尺寸時 0 */
  ar: number;
}

/** 縮小後的尺寸：長邊超過 max 時等比縮到 max（四捨五入） */
export function fitSide(w: number, h: number, max = IMAGE_MAX_SIDE): { w: number; h: number } {
  if (Math.max(w, h) <= max) return { w, h };
  const r = max / Math.max(w, h);
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

/** 存成 PNG 的格式（其他存成 JPEG） */
export const keepsPng = (type: string): boolean => /png|gif|webp|svg/i.test(type);

function decode(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

/**
 * 讀圖片檔：長邊超過 1600 px 時縮小；PNG、GIF、WebP、SVG 存成 PNG，其他存成 JPEG（品質 0.85）；
 * 無法轉換的格式照原檔、長寬比未知。
 * （以 <img> 畫進畫布，縮小的畫質與舊版相同。）
 */
export async function readImageFile(file: File): Promise<ReadImage> {
  const raw = await readAsDataUrl(file);
  const im = await decode(raw);
  if (!im?.naturalWidth) return { data: raw, ar: 0 };
  const ar = im.naturalHeight / im.naturalWidth;
  const { w, h } = fitSide(im.naturalWidth, im.naturalHeight);
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return { data: raw, ar };
    ctx.drawImage(im, 0, 0, w, h);
    return { data: c.toDataURL(keepsPng(file.type) ? 'image/png' : 'image/jpeg', 0.85), ar };
  } catch {
    return { data: raw, ar };
  }
}

/** 選一張圖片（取消時 null） */
export async function pickImage(): Promise<ReadImage | null> {
  const [file] = await pickFiles({ accept: 'image/*' });
  if (!file) return null;
  return readImageFile(file);
}

/** 背景圖：不縮小（大小交給呼叫端確認） */
export async function pickRawImage(): Promise<File | null> {
  const [file] = await pickFiles({ accept: 'image/*' });
  return file ?? null;
}

export const BG_WARN_BYTES = 2.5 * 1024 * 1024;
