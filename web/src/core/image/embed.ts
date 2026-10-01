/**
 * 把圖片嵌進 CSS（data URI）：檔案／網址轉 data URI（大小上限、縮到指定寬度）、量原始尺寸（含逾時）、
 * 修掉透明邊、數值範圍裁切的修正規則。Discord 通話立繪等「圖片寫進 OBS 自訂 CSS」的工具用。
 */
import { readAsDataUrl } from '../files';
import {
  canvasToBlob,
  cropImage,
  type DrawableImage,
  detectImageType,
  imageSize,
  loadImage,
  opaqueBounds,
  type PixelBuffer,
  type Rect,
  resizeImage,
  type Size,
} from './index';

export type ImageInputErrorKind =
  | 'too-large'
  | 'decode'
  | 'cors'
  | 'http'
  | 'not-image'
  | 'timeout'
  | 'aborted';

/** 圖片讀取失敗（kind 說明原因；message 是可以直接顯示的繁中訊息） */
export class ImageInputError extends Error {
  readonly kind: ImageInputErrorKind;
  readonly status?: number;
  constructor(kind: ImageInputErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ImageInputError';
    this.kind = kind;
    this.status = status;
  }
}

export interface EmbeddedImage {
  /** data:image/…;base64,… */
  dataUri: string;
  width: number;
  height: number;
  /** 圖檔本身的位元組數（data URI 會再大約 1.33 倍） */
  bytes: number;
  mime: string;
  /** 有沒有縮小（縮小時一律存成 PNG） */
  resized: boolean;
}

export interface EmbedOptions {
  /** 檔案大小上限（位元組）；超過時丟 too-large。0 或不給＝不限 */
  maxBytes?: number;
  /** 比這寬的圖等比縮小到這個寬度並改存 PNG（高度四捨五入、至少 1px）；0 或不給＝原尺寸 */
  maxWidth?: number;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  apng: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/** B／KB（一位小數）／MB（兩位小數） */
export function formatEmbedBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** data URI 解碼後的位元組數（base64 時扣掉補位） */
export function dataUriBytes(uri: string): number {
  const i = uri.indexOf(',');
  if (i < 0) return 0;
  const head = uri.slice(0, i);
  const body = uri.slice(i + 1);
  if (/;base64$/i.test(head)) {
    const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
    return Math.floor((body.length * 3) / 4) - pad;
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(body)).length;
  } catch {
    return body.length;
  }
}

/** data URI → Blob */
export function dataUriToBlob(uri: string): Blob {
  const i = uri.indexOf(',');
  const head = uri.slice(5, i);
  const body = uri.slice(i + 1);
  const mime = head.split(';')[0] || 'application/octet-stream';
  if (/;base64$/i.test(head)) {
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(body)], { type: mime });
}

/**
 * 圖片檔 → data URI。沒有縮小時保留原檔的位元組與格式（JPEG 還是 JPEG、動畫 GIF 保留動畫）；
 * 需要縮小（maxWidth）時改存 PNG。檔案超過 maxBytes 或讀不出來時丟 ImageInputError。
 */
export async function fileToDataUri(
  blob: Blob,
  { maxBytes = 0, maxWidth = 0 }: EmbedOptions = {},
): Promise<EmbeddedImage> {
  if (maxBytes > 0 && blob.size > maxBytes)
    throw new ImageInputError(
      'too-large',
      `圖片太大（${formatEmbedBytes(blob.size)}），上限是 ${formatEmbedBytes(maxBytes)}。`,
    );
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const kind = detectImageType(head);
  let bitmap: ImageBitmap;
  try {
    bitmap = await loadImage(blob);
  } catch {
    throw new ImageInputError('decode', '讀不出這張圖片，請換一個檔案（PNG、JPEG、WebP、GIF）。');
  }
  try {
    const { width, height } = imageSize(bitmap);
    if (maxWidth > 0 && width > maxWidth) {
      const h = Math.max(1, Math.round((height * maxWidth) / width));
      const canvas = resizeImage(bitmap, maxWidth, h);
      const png = await canvasToBlob(canvas, 'image/png');
      return {
        dataUri: await readAsDataUrl(png),
        width: maxWidth,
        height: h,
        bytes: png.size,
        mime: 'image/png',
        resized: true,
      };
    }
    /* 依檔頭判斷實際格式，避免 data URI 的 MIME 錯誤（例如沒有副檔名的檔案） */
    const mime = (kind && MIME[kind]) || (blob.type.startsWith('image/') ? blob.type : 'image/png');
    const typed = blob.type === mime ? blob : new Blob([blob], { type: mime });
    return {
      dataUri: await readAsDataUrl(typed),
      width,
      height,
      bytes: blob.size,
      mime,
      resized: false,
    };
  } finally {
    bitmap.close?.();
  }
}

export interface UrlEmbedOptions extends EmbedOptions {
  /** 逾時（預設 15000 毫秒） */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * 圖片網址 → data URI（需要對方主機允許跨網域讀取）。失敗時丟 ImageInputError：
 * cors（被擋或網路錯誤）、http（狀態碼不是 2xx）、not-image（拿到的不是圖片）、timeout、aborted。
 */
export async function urlToDataUri(
  url: string,
  { timeoutMs = 15000, signal, ...embed }: UrlEmbedOptions = {},
): Promise<EmbeddedImage> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
  } catch {
    if (timedOut)
      throw new ImageInputError('timeout', '取得圖片逾時，請稍後再試，或下載圖片後改用上傳。');
    if (signal?.aborted) throw new ImageInputError('aborted', '已取消。');
    throw new ImageInputError(
      'cors',
      '無法從這個網址取得圖片（對方主機不允許跨網域讀取，或網路有問題）。請下載圖片後改用上傳。',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (!res.ok)
    throw new ImageInputError(
      'http',
      `取得圖片失敗（HTTP ${res.status}）。請確認網址，或下載圖片後改用上傳。`,
      res.status,
    );
  const blob = await res.blob();
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  if (!blob.type.startsWith('image/') && !detectImageType(head) && !/svg/i.test(blob.type))
    throw new ImageInputError(
      'not-image',
      '這個網址拿到的不是圖片。請確認網址，或下載圖片後改用上傳。',
    );
  return fileToDataUri(blob, embed);
}

/**
 * 量圖片的原始尺寸（用 <img>，不需要跨網域權限）。讀不到或超過 timeoutMs（預設 8000）時回傳 null。
 */
export function measureImageUrl(src: string, { timeoutMs = 8000 } = {}): Promise<Size | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || !src) return resolve(null);
    const img = new Image();
    let done = false;
    const finish = (v: Size | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onload = () =>
      finish(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => finish(null);
    img.src = src;
  });
}

/**
 * 修掉透明留白的範圍：所有「不透明度 > 0」像素的外接矩形。
 * 整張不透明（沒有留白）或整張全透明時回傳 null（沒有可修的留白）。
 */
export function transparentTrimRect(pixels: PixelBuffer): Rect | null {
  const b = opaqueBounds(pixels, 0);
  if (!b) return null;
  if (b.x === 0 && b.y === 0 && b.width === pixels.width && b.height === pixels.height) return null;
  return b;
}

/**
 * 使用者輸入的裁切範圍 → 實際範圍：小數四捨五入；負的寬高視為反方向拖曳；超出圖片的部分夾掉；
 * 夾完寬或高不到 1px 時回傳 null（範圍在圖片外）。
 * normalizeCropRect({ x: 0, y: 0, width: 5000, height: 10 }, { width: 300, height: 600 }) → 寬夾成 300
 */
export function normalizeCropRect(raw: Rect, bounds: Size): Rect | null {
  const vals = [raw.x, raw.y, raw.width, raw.height].map((v) => Math.round(Number(v)));
  if (vals.some((v) => !Number.isFinite(v))) return null;
  let [x, y, w, h] = vals;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(bounds.width, x + w);
  const y1 = Math.min(bounds.height, y + h);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** 範圍是不是整張圖 */
export const isWholeImage = (r: Rect, bounds: Size): boolean =>
  r.x === 0 && r.y === 0 && r.width === bounds.width && r.height === bounds.height;

/** 裁切並存成 PNG 的 data URI（保留透明；尺寸不再縮放） */
export async function cropToDataUri(img: DrawableImage, rect: Rect): Promise<EmbeddedImage> {
  const canvas = cropImage(img, rect);
  const png = await canvasToBlob(canvas, 'image/png');
  return {
    dataUri: await readAsDataUrl(png),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    bytes: png.size,
    mime: 'image/png',
    resized: false,
  };
}
