/**
 * core/decode：動畫圖檔（APNG／GIF／動態 WebP）拆成影格與每格時間。
 *
 * ```ts
 * const anim = await decodeAnimatedImage(file, { maxFrames: 500 });
 * // anim.frames[i].rgba：完整畫布（已合成），anim.frames[i].delayMs：這一格多久
 * const bitmaps = await animationBitmaps(anim);
 * ```
 *
 * - APNG、GIF 用純 JavaScript 解碼（Node、Worker 都能用；有單元測試）；動態 WebP 解析結構後每格交給瀏覽器解碼。
 * - 每格時間照檔案；比 minDelayMs（10 ms）短的以 10 ms 計，讀不到（0）的以 defaultDelayMs（100 ms）計。
 * - 最多 maxFrames（500）格，超過時 truncated＝true。
 * - 其他格式（JPEG、AVIF、BMP、靜態 PNG／WebP、SVG…）回傳一格。
 */
import { decodeGif, isGif } from './gif';
import { decodeApng, isPng } from './png';
import { type DecodedAnimation, type DecodeOptions, frameDelay } from './types';
import { decodeWebp, isWebp } from './webp';

export { decodeGif, isGif } from './gif';
export { decodeApng, decodePng, isApng, isPng } from './png';
export type { DecodedAnimation, DecodedFormat, DecodedFrame, DecodeOptions } from './types';
export { frameDelay } from './types';
export {
  decodeWebp,
  isWebp,
  parseWebpInfo,
  type StillDecoder,
  type WebpAnimFrameInfo,
  type WebpInfo,
} from './webp';

async function toBytes(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/** 瀏覽器解碼單張影像（任何瀏覽器看得懂的格式）→ RGBA */
export async function decodeStillImage(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<{ width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> }> {
  const blob =
    input instanceof Blob ? input : new Blob([(await toBytes(input)) as Uint8Array<ArrayBuffer>]);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('無法解碼這張圖片');
  }
  const { width, height } = bitmap;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  } else {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) throw new Error('無法建立畫布');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
}

/**
 * 解碼動畫圖檔：APNG／GIF／動態 WebP 拆成影格；其他格式一格。解碼失敗丟 Error（訊息可直接顯示）。
 */
export async function decodeAnimatedImage(
  input: Blob | ArrayBuffer | Uint8Array,
  options: DecodeOptions = {},
): Promise<DecodedAnimation> {
  const bytes = await toBytes(input);
  try {
    if (isPng(bytes)) return decodeApng(bytes, options);
    if (isGif(bytes)) return decodeGif(bytes, options);
    if (isWebp(bytes)) return await decodeWebp(bytes, decodeStillImage, options);
  } catch (e) {
    throw e instanceof Error && /^(不是|PNG|無法)/.test(e.message)
      ? e
      : new Error('圖片檔損壞，無法解碼');
  }
  const still = await decodeStillImage(bytes);
  return {
    format: 'image',
    width: still.width,
    height: still.height,
    loops: 0,
    truncated: false,
    frames: [{ rgba: still.rgba, delayMs: frameDelay(undefined, options) }],
  };
}

/** 每一格轉成 ImageBitmap（畫到 canvas 用；用完記得 close） */
export async function animationBitmaps(anim: DecodedAnimation): Promise<ImageBitmap[]> {
  return Promise.all(
    anim.frames.map((f) => createImageBitmap(new ImageData(f.rgba, anim.width, anim.height))),
  );
}

/** 每格的開始時間（毫秒）與總長，給「t 毫秒時顯示哪一格」用 */
export function animationTimeline(delays: readonly number[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let t = 0;
  for (const d of delays) {
    starts.push(t);
    t += d;
  }
  return { starts, total: t };
}

/** t 毫秒（循環）時的影格（delays 全部 > 0） */
export function frameAtTime(delays: readonly number[], tMs: number): number {
  const { total } = animationTimeline(delays);
  if (!delays.length || total <= 0) return 0;
  let t = ((tMs % total) + total) % total;
  for (let i = 0; i < delays.length; i++) {
    if (t < delays[i]) return i;
    t -= delays[i];
  }
  return delays.length - 1;
}
