/**
 * 立繪圖片的取得（規格 F14～F17、3.3）：上傳 → data URI；網址依「自動／直接用網址／轉成嵌入」處理。
 * 結果是要放進預設集的圖片（data URI 或網址）與要顯示的訊息。
 */
import { classifyImageUrl } from '@/ccfolia';
import {
  dataUriBytes,
  type EmbeddedImage,
  fileToDataUri,
  formatEmbedBytes,
  urlToDataUri,
} from '@/core/image';
import { type UrlMode, urlOutcome } from './logic';
import { MAX_UPLOAD_BYTES } from './model';
import { S } from './strings';

export interface ImageResult {
  src: string;
  /** 已知的尺寸（嵌入時） */
  size?: { width: number; height: number };
  tone: 'success' | 'warning';
  message: string;
}

/** 上傳的檔案 → data URI（超過 8 MB、讀不出來時丟出可直接顯示的錯誤） */
export async function imageFromFile(file: Blob, maxWidth: number): Promise<ImageResult> {
  const e = await fileToDataUri(file, { maxBytes: MAX_UPLOAD_BYTES, maxWidth });
  return {
    src: e.dataUri,
    size: { width: e.width, height: e.height },
    tone: 'success',
    message: S.image.uploaded(describe(e)),
  };
}

function describe(e: EmbeddedImage): string {
  return `：${e.width}×${e.height}px、${formatEmbedBytes(e.bytes)}${e.resized ? S.image.resizedNote(e.width) : ''}`;
}

export class UrlInputError extends Error {}

/** 網址 → 圖片。空白或格式不正確時丟 UrlInputError（裁定：不是 http(s) 或 data URI 一律不採用） */
export async function imageFromUrl(
  text: string,
  mode: UrlMode,
  maxWidth: number,
): Promise<ImageResult> {
  const url = text.trim();
  if (!url) throw new UrlInputError(S.image.urlEmpty);
  const { kind, valid } = classifyImageUrl(url);
  if (!valid) throw new UrlInputError(S.image.urlBad);
  if (kind === 'data') {
    if (dataUriBytes(url) <= 0) throw new UrlInputError(S.image.urlBad);
    return { src: url, tone: 'success', message: S.image.set(S.image.how.data) };
  }
  let fetched: { ok: true; image: EmbeddedImage } | { ok: false; reason: string } | null = null;
  const first = urlOutcome(kind, mode, null);
  const needsFetch = mode === 'embed' || (mode === 'auto' && kind !== 'direct');
  if (needsFetch) {
    try {
      fetched = { ok: true, image: await urlToDataUri(url, { maxWidth }) };
    } catch (e) {
      fetched = { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }
  const out = needsFetch ? urlOutcome(kind, mode, fetched) : first;
  const src = fetched?.ok ? fetched.image.dataUri : url;
  const size = fetched?.ok
    ? { width: fetched.image.width, height: fetched.image.height }
    : undefined;
  const head = S.image.set(S.image.how[out.how]);
  if (!out.warn) return { src, size, tone: 'success', message: head };
  const warn =
    out.warn === 'expiring' || out.warn === 'other'
      ? S.image.warn[out.warn]
      : S.image.warn[out.warn]('reason' in out ? out.reason : '');
  return { src, size, tone: 'warning', message: `${head}${warn}` };
}
