import { render } from './render';
import type { RenderParams } from './types';

/** 書き出し用の一時キャンバス（プレビューとは別に持つ） */
function exportCanvas(w: number, h: number): CanvasRenderingContext2D {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv.getContext('2d', { willReadFrequently: true })!;
}

/** params -> ImageData[]。t = i/N で完全ループする */
export function renderFrames(params: RenderParams, onProgress?: (done: number, total: number) => void): ImageData[] {
  const { w, h } = params.canvas;
  const ctx = exportCanvas(w, h);
  const n = Math.max(1, Math.round(params.frameCount));
  const frames: ImageData[] = [];
  for (let i = 0; i < n; i++) {
    render(ctx, params, i / n);
    frames.push(ctx.getImageData(0, 0, w, h));
    onProgress?.(i + 1, n);
  }
  return frames;
}

/** 静止PNG用の1枚 */
export function renderStill(params: RenderParams, t = 0): ImageData {
  const { w, h } = params.canvas;
  const ctx = exportCanvas(w, h);
  render(ctx, params, t);
  return ctx.getImageData(0, 0, w, h);
}
