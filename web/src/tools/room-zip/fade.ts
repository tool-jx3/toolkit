/**
 * 淡入淡出動態圖（APNG，規格 3.3.2、F095～F102）：影格數、每格延遲、每格像素、開始／結束的連動、檔名。
 * 編碼用 `@/core/encode` 的 ApngEncoder（無損全彩、不合併相同影格；延遲以毫秒計：fps 1000）。
 */

import { parseColor } from '@/core/color';
import { ApngEncoder } from '@/core/encode';

export type FadeEndpoint = 'transparent' | 'image' | 'color';
export const FADE_ENDPOINTS: readonly FadeEndpoint[] = ['transparent', 'image', 'color'];

export const FADE = {
  /** 時間（毫秒） */
  minMs: 500,
  maxMs: 4000,
  stepMs: 500,
  defaultMs: 500,
  fps: 12,
  minFrames: 2,
  maxFrames: 15,
  /** 原圖長邊超過就等比縮小 */
  maxEdge: 1024,
  /** 沒有原圖時的大小 */
  colorSize: 128,
  /** 預覽：每輪結束停的時間（毫秒）與畫布長邊上限 */
  previewPauseMs: 300,
  previewMaxEdge: 720,
} as const;

/** 時間（秒）→ 毫秒：四捨五入到 0.5 秒的倍數並夾在 0.5～4.0 秒 */
export function normalizeFadeMs(seconds: number): number {
  let ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms)) ms = FADE.defaultMs;
  ms = Math.round(ms / FADE.stepMs) * FADE.stepMs;
  return Math.max(FADE.minMs, Math.min(FADE.maxMs, ms));
}

/** 影格數＝四捨五入(秒 × 12)，夾在 2～15 */
export function fadeFrameCount(ms: number): number {
  return Math.max(FADE.minFrames, Math.min(FADE.maxFrames, Math.round((ms / 1000) * FADE.fps)));
}

/** 每格延遲（毫秒）：基本＝總長÷格數無條件捨去，前（總長 − 基本×格數）格各多 1 毫秒 */
export function fadeDelays(ms: number, count: number): number[] {
  const base = Math.floor(ms / count);
  const rest = ms - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}

export const needsImage = (start: FadeEndpoint, end: FadeEndpoint): boolean =>
  start === 'image' || end === 'image';

export interface FadeEndpoints {
  start: FadeEndpoint;
  end: FadeEndpoint;
}

/** 開頁或換原圖時的開始／結束：有原圖＝圖片 → 透明；沒有＝透明 → 顏色 */
export const initialEndpoints = (hasImage: boolean): FadeEndpoints =>
  hasImage ? { start: 'image', end: 'transparent' } : { start: 'transparent', end: 'color' };

/**
 * 改開始或結束（F097）：兩者不能相同；改成與另一邊相同時，有原圖則兩邊互換，沒原圖則另一邊改成「透明」或「顏色」
 * 中不衝突的那個；沒有原圖時「圖片」不能選。
 */
export function setEndpoint(
  cur: FadeEndpoints,
  changed: 'start' | 'end',
  value: FadeEndpoint,
  hasImage: boolean,
): FadeEndpoints {
  if (!hasImage && value === 'image') return normalizeEndpoints(cur, hasImage);
  const other = changed === 'start' ? 'end' : 'start';
  const next: FadeEndpoints = { ...cur, [changed]: value };
  if (next[other] === value) {
    if (hasImage) next[other] = cur[changed];
    else next[other] = value === 'transparent' ? 'color' : 'transparent';
  }
  return normalizeEndpoints(next, hasImage);
}

/** 不合法的組合（相同、沒原圖卻要圖片）回到預設 */
export function normalizeEndpoints(cur: FadeEndpoints, hasImage: boolean): FadeEndpoints {
  if (cur.start === cur.end || (!hasImage && needsImage(cur.start, cur.end)))
    return initialEndpoints(hasImage);
  return cur;
}

/** 算淡入（結束是圖片，或透明 → 顏色）；其餘算淡出 */
export const isFadeIn = (e: FadeEndpoints): boolean =>
  e.end === 'image' || (e.start === 'transparent' && e.end === 'color');

const hexRgb = (c: string): [number, number, number] => {
  const p = parseColor(c);
  return p ? [p.r, p.g, p.b] : [0, 0, 0];
};

/**
 * 一格的像素（3.3.2；p＝0～1 的進度）：
 * - 透明↔圖片：RGB＝原圖，A＝原圖 A × 圖片比例（結束是圖片時 p，開始是圖片時 1−p），四捨五入。
 * - 透明↔顏色：RGB＝顏色，A＝255 × 顏色比例。
 * - 圖片↔顏色：顏色以比例 c 蓋在原圖上：A＝c＋原圖A×(1−c)，RGB＝(顏色×c＋原圖RGB×原圖A×(1−c))÷A（A 為 0 時全 0）。
 */
export function fadeFrame(
  e: FadeEndpoints,
  source: Uint8ClampedArray | Uint8Array | null,
  width: number,
  height: number,
  color: string,
  progress: number,
): Uint8ClampedArray {
  const p = Math.max(0, Math.min(1, progress));
  const rgb = hexRgb(color);
  const out = new Uint8ClampedArray(width * height * 4);
  const { start, end } = e;
  const imageTransparent =
    (start === 'transparent' && end === 'image') || (start === 'image' && end === 'transparent');
  const colorTransparent =
    (start === 'transparent' && end === 'color') || (start === 'color' && end === 'transparent');
  if ((imageTransparent || !colorTransparent) && (!source || source.length !== out.length))
    throw new Error('原圖的大小不符');
  for (let i = 0; i < out.length; i += 4) {
    if (imageTransparent && source) {
      const amount = end === 'image' ? p : 1 - p;
      out[i] = source[i];
      out[i + 1] = source[i + 1];
      out[i + 2] = source[i + 2];
      out[i + 3] = Math.round(source[i + 3] * amount);
    } else if (colorTransparent) {
      const amount = end === 'color' ? p : 1 - p;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = Math.round(255 * amount);
    } else if (source) {
      const c = end === 'color' ? p : 1 - p;
      const sa = source[i + 3] / 255;
      const a = c + sa * (1 - c);
      if (a <= 0) continue;
      out[i] = Math.round((rgb[0] * c + source[i] * sa * (1 - c)) / a);
      out[i + 1] = Math.round((rgb[1] * c + source[i + 1] * sa * (1 - c)) / a);
      out[i + 2] = Math.round((rgb[2] * c + source[i + 2] * sa * (1 - c)) / a);
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

/** 原圖縮到長邊 1024 以內（四捨五入）；沒有原圖時 128×128 */
export function fadeSize(source: { width: number; height: number } | null) {
  if (!source) return { width: FADE.colorSize, height: FADE.colorSize };
  const k = Math.min(1, FADE.maxEdge / Math.max(source.width, source.height));
  return {
    width: Math.max(1, Math.round(source.width * k)),
    height: Math.max(1, Math.round(source.height * k)),
  };
}

export const FADE_IN_SUFFIX = '淡入';
export const FADE_OUT_SUFFIX = '淡出';
export const FADE_NO_SOURCE_NAME = '單色淡變';

/** 檔名：原圖的原始檔名去副檔名（沒有原圖時預設名）＋「_淡入」或「_淡出」＋.png */
export function fadeFileName(sourceName: string | null, e: FadeEndpoints): string {
  const base =
    String(sourceName ? sourceName.replace(/\.[^.]+$/, '') : FADE_NO_SOURCE_NAME)
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim() || FADE_NO_SOURCE_NAME;
  return `${base}_${isFadeIn(e) ? FADE_IN_SUFFIX : FADE_OUT_SUFFIX}.png`;
}

export interface FadeInput extends FadeEndpoints {
  /** 原圖的像素（已縮到 fadeSize）；不需要圖片時可以 null */
  source: Uint8ClampedArray | Uint8Array | null;
  width: number;
  height: number;
  color: string;
  /** 時間（毫秒，已 normalize） */
  ms: number;
  loop: boolean;
}

export interface FadeResult {
  bytes: Uint8Array<ArrayBuffer>;
  frames: number;
  delays: number[];
  plays: number;
}

/**
 * 編碼成 APNG：播放次數＝循環時 0（無限）、否則 1。每格以前一格為底、只存變化的範圍並以「取代」方式畫上，
 * 所以結束是透明時最後一格一定完全透明。
 */
export async function encodeFade(input: FadeInput): Promise<FadeResult> {
  const count = fadeFrameCount(input.ms);
  const delays = fadeDelays(input.ms, count);
  const plays = input.loop ? 0 : 1;
  const enc = new ApngEncoder({
    width: input.width,
    height: input.height,
    fps: 1000,
    plays,
    quantize: false,
    mergeIdentical: false,
  });
  for (let i = 0; i < count; i++) {
    const px = fadeFrame(
      input,
      input.source,
      input.width,
      input.height,
      input.color,
      i / (count - 1),
    );
    await enc.addFrame(px, delays[i]);
  }
  const file = await enc.finish();
  return { bytes: file.bytes, frames: count, delays, plays };
}
