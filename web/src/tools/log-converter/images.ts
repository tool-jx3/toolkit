/**
 * 頭像與插圖的處理（規格 3.7、3.8；F24、F25、F29）：讀檔、下載網址、依品質縮放並重新編碼成 data URL、容量計算。
 * 縮放的數值規則在 settings.ts（qualitySpec、fitWithin），這裡只負責在瀏覽器裡用 canvas 編碼。
 */
import { readAsDataUrl } from '@/core/files';
import {
  fitWithin,
  ILLUSTRATION_MAX_SIDE,
  ILLUSTRATION_QUALITY,
  type ImageMime,
  type QualitySpec,
} from './settings';

let webpCache: boolean | null = null;

/** 瀏覽器能不能把 canvas 編成 WebP（Safari 不行） */
export function supportsWebp(): boolean {
  if (webpCache !== null) return webpCache;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    webpCache = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpCache = false;
  }
  return webpCache;
}

/** 想要的格式在這個瀏覽器實際用哪一種：WebP 不支援時改用 fallback */
export function actualMime(format: ImageMime, webpFallback: ImageMime = 'image/jpeg'): ImageMime {
  if (format === 'image/webp' && !supportsWebp()) return webpFallback;
  return format;
}

function loadElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('無法解碼這張圖片'));
    img.src = src;
  });
}

/** 依長邊上限縮小（不放大）並重新編碼 */
export async function encodeImage(
  src: string,
  maxSide: number,
  mime: ImageMime,
  quality: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadElement(src);
  const size = fitWithin(img.naturalWidth, img.naturalHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援 canvas');
  ctx.drawImage(img, 0, 0, size.width, size.height);
  return { dataUrl: canvas.toDataURL(mime, quality), ...size };
}

/** 使用者上傳／下載的頭像：縮放開啟時依品質縮放重新編碼；關閉時照原檔 */
export async function processAvatar(
  original: string,
  spec: QualitySpec,
  resize: boolean,
): Promise<string> {
  if (!resize) return original;
  const r = await encodeImage(original, spec.maxSide, actualMime(spec.format), spec.quality);
  return r.dataUrl;
}

/** 新格式日誌裡的頭像：縮放開啟且品質不是原圖時，依上限縮放並一律編成 WebP（不支援時 PNG）；失敗用原圖 */
export async function processLogAvatar(
  original: string,
  spec: QualitySpec,
  resize: boolean,
): Promise<string> {
  if (!resize || !Number.isFinite(spec.maxSide)) return original;
  try {
    const r = await encodeImage(
      original,
      spec.maxSide,
      actualMime('image/webp', 'image/png'),
      spec.quality,
    );
    return r.dataUrl;
  } catch {
    return original;
  }
}

/** 上傳的插圖：長邊 800 px 以內，以目前品質預設的格式、品質約 0.9 重新編碼（即使沒縮小） */
export async function processIllustration(original: string, spec: QualitySpec): Promise<string> {
  const r = await encodeImage(
    original,
    ILLUSTRATION_MAX_SIDE,
    actualMime(spec.format),
    ILLUSTRATION_QUALITY,
  );
  return r.dataUrl;
}

export const fileToDataUrl = (file: Blob): Promise<string> => readAsDataUrl(file);

/** 下載網址的圖片轉成 data URL（對方不允許跨網域讀取時會失敗） */
export async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.type && !blob.type.startsWith('image/')) throw new Error('不是圖片');
  return readAsDataUrl(blob);
}

/** data URL 的實際位元組數（不是 data URL 時 0，例如直接引用的網址） */
export function dataUrlBytes(url: string | null | undefined): number {
  if (!url?.startsWith('data:')) return 0;
  const i = url.indexOf(',');
  if (i < 0) return 0;
  const meta = url.slice(5, i);
  const body = url.slice(i + 1);
  if (!/;base64$/i.test(meta)) return decodeURIComponent(body).length;
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - pad);
}

/** 大圖警告用的約略 KB（F70） */
export const dataUrlKb = (url: string | null | undefined): number =>
  Math.round(dataUrlBytes(url) / 1024);

/** data URL 的格式（顯示用） */
export function dataUrlMime(url: string): string | null {
  const m = /^data:([^;,]+)/.exec(url);
  return m ? m[1] : null;
}
