/**
 * 匯出 PNG：每格 8～512 px，每邊最多 8192 px、總共最多 3,600 萬像素。
 *
 * iPhone、iPad 的 Safari 畫布最多 16,777,216 像素（4096²）：超過這個大小的圖不畫成一張畫布，
 * 改成一段一段（橫條）畫、讀出像素、自己編成一張 PNG（濾波＋壓縮串流），所以手機也能匯出到上限。
 * 一張畫布畫得下的照常用瀏覽器內建的 PNG 編碼（比較快）。
 */

import { Zlib } from 'fflate';
import { chunk, concat, filterRows, ihdr, PNG_SIGNATURE } from '@/core/encode/png';
import { canvasToBlob } from '@/core/image';
import type { TileMap } from '../model/types';
import { type DefLookup, drawGrid, drawLayers, type ImageLookup } from '../render/draw';

export const PNG_PX_MIN = 8;
export const PNG_PX_MAX = 512;
export const PNG_MAX_SIDE = 8192;
export const PNG_MAX_PIXELS = 36_000_000;
/** 一張畫布最多幾像素（iOS Safari 的上限） */
export const CANVAS_MAX_PIXELS = 16_777_216;
/** 匯出的格線顏色 */
export const EXPORT_GRID_COLOR = 'rgba(172, 181, 191, 0.5)';

export interface PngOptions {
  px: number;
  grid: boolean;
  transparent: boolean;
}

export function pngSize(
  map: Pick<TileMap, 'width' | 'height'>,
  px: number,
): { width: number; height: number } {
  return { width: map.width * px, height: map.height * px };
}

/** 這個大小能不能匯出 */
export function pngFits(width: number, height: number): boolean {
  return width <= PNG_MAX_SIDE && height <= PNG_MAX_SIDE && width * height <= PNG_MAX_PIXELS;
}

/** 要不要分段畫（超過一張畫布的上限） */
export const needsBands = (width: number, height: number): boolean =>
  width * height > CANVAS_MAX_PIXELS;

export interface Lookups {
  defs: DefLookup;
  images: ImageLookup;
}

/** 地圖的 rows 列（從第 y0 列起）畫在 ctx 上（左上角是第 y0 列） */
export function paintRows(
  ctx: CanvasRenderingContext2D,
  map: TileMap,
  y0: number,
  rows: number,
  o: PngOptions,
  look: Lookups,
): void {
  const at = { ox: 0, oy: -y0 * o.px, scale: o.px };
  const width = map.width * o.px;
  if (!o.transparent) {
    ctx.fillStyle = map.background;
    ctx.fillRect(0, 0, width, rows * o.px);
  }
  const region = { x0: 0, y0, x1: map.width, y1: Math.min(map.height, y0 + rows) };
  drawLayers(ctx, map, region, at, { defs: look.defs, images: look.images });
  if (o.grid) drawGrid(ctx, map.width, map.height, at, EXPORT_GRID_COLOR, region);
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 整張畫成一張畫布（不超過一張畫布的上限時） */
export function renderMap(map: TileMap, o: PngOptions, look: Lookups): HTMLCanvasElement {
  const { width, height } = pngSize(map, o.px);
  const c = canvas(width, height);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  paintRows(ctx, map, 0, map.height, o, look);
  return c;
}

/**
 * 分段編碼：每段 rowsPer 列（px），讀出像素、濾波（每段多帶上一段的最後一列，濾波才接得上），送進壓縮串流。
 * bandAt(y0, h) 回傳那一段的 RGBA。
 */
export async function encodePngBands(
  width: number,
  height: number,
  bandHeight: number,
  bandAt: (y0: number, h: number) => Promise<Uint8ClampedArray> | Uint8ClampedArray,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (ratio: number) => void } = {},
): Promise<Uint8Array> {
  const stride = width * 4;
  const parts: Uint8Array[] = [];
  const zlib = new Zlib({ level: 6 });
  zlib.ondata = (data) => {
    parts.push(data);
  };
  let prev: Uint8ClampedArray | null = null;
  for (let y0 = 0; y0 < height; y0 += bandHeight) {
    signal?.throwIfAborted();
    const h = Math.min(bandHeight, height - y0);
    const rgba = await bandAt(y0, h);
    let filtered: Uint8Array;
    if (prev) {
      /* 上一段的最後一列放在最前面當參考，濾波後丟掉那一列 */
      const buf = new Uint8Array((h + 1) * stride);
      buf.set(prev.subarray(prev.length - stride), 0);
      buf.set(rgba, stride);
      filtered = filterRows(buf, width, h + 1, 4, true).subarray(stride + 1);
    } else filtered = filterRows(rgba, width, h, 4, true);
    zlib.push(filtered, y0 + h >= height);
    prev = rgba;
    onProgress?.((y0 + h) / height);
    await new Promise((r) => setTimeout(r, 0));
  }
  const idat = concat(parts);
  return concat([
    PNG_SIGNATURE,
    ihdr(width, height, 6),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** 匯出 PNG（超過一張畫布的上限時分段） */
export async function exportPng(
  map: TileMap,
  o: PngOptions,
  look: Lookups,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (ratio: number) => void } = {},
): Promise<Blob> {
  const { width, height } = pngSize(map, o.px);
  if (!pngFits(width, height)) throw new RangeError('size');
  if (!needsBands(width, height)) {
    const c = renderMap(map, o, look);
    onProgress?.(0.5);
    const blob = await canvasToBlob(c, 'image/png');
    c.width = 1;
    c.height = 1;
    return blob;
  }
  /* 每段的列數：整數格、而且一段不超過畫布的上限 */
  const rowsPer = Math.max(1, Math.floor(CANVAS_MAX_PIXELS / (width * o.px)));
  const bandH = rowsPer * o.px;
  const c = canvas(width, bandH);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  const bytes = await encodePngBands(
    width,
    height,
    bandH,
    (y0, h) => {
      ctx.clearRect(0, 0, width, bandH);
      paintRows(ctx, map, y0 / o.px, h / o.px, o, look);
      return ctx.getImageData(0, 0, width, h).data;
    },
    { signal, onProgress },
  );
  c.width = 1;
  c.height = 1;
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' });
}
