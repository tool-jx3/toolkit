/**
 * 整頁轉圖（WP 的 maximum）：每一頁畫成一張 JPEG，組成每頁只有一張圖的新 PDF。最小，但文字不能選、不能搜尋，
 * 連結、書籤、表單也都沒有了。
 *
 * 文字為主的 PDF 用固定的 DPI 畫可能反而變大，所以畫完比原檔大時把 DPI 往下降重畫（`nextRasterDpi`：
 * 目標是原檔的 0.8 倍），最多 4 輪、最低 50 DPI（WP 的做法）。本站另外：整頁都是灰階的頁存成灰階 JPEG（自訂，比較小）；
 * 太大的頁面（海報）降低那一頁的 DPI，一頁最多 2,500 萬像素（自訂）。
 */
import { PDFDocument } from 'pdf-lib';
import { nextRasterDpi, pageRasterDpi } from './dpi';
import { PdfError } from './errors';
import type { JpegCodec } from './jpeg';
import type { RasterParams } from './levels';
import { RASTER_MAX_PAGES } from './limits';
import { isGrayRgba } from './pixels';

export interface RasterOutcome {
  bytes: Uint8Array;
  /** 最後用的 DPI */
  dpi: number;
  /** 有沒有因為比原檔大而降低 DPI */
  reduced: boolean;
  /** 存成灰階的頁數 */
  grayPages: number;
  pages: number;
}

/** 頁面來源（pdf.js 打開的文件） */
export interface PageSource {
  pages: number;
  size(page: number): Promise<{ widthPt: number; heightPt: number }>;
  /** scale：1＝72 DPI */
  render(
    page: number,
    scale: number,
  ): Promise<{ data: Uint8ClampedArray; width: number; height: number }>;
}

export interface RasterHooks {
  onProgress?: (done: number, total: number) => void;
  signal?: { readonly aborted: boolean };
}

async function renderAll(
  src: PageSource,
  dpi: number,
  params: RasterParams,
  codec: JpegCodec,
  hooks: RasterHooks,
  pass: number,
): Promise<{ bytes: Uint8Array; grayPages: number }> {
  const out = await PDFDocument.create({ updateMetadata: false });
  let grayPages = 0;
  for (let n = 1; n <= src.pages; n++) {
    if (hooks.signal?.aborted) throw new PdfError('aborted');
    const { widthPt, heightPt } = await src.size(n);
    const d = pageRasterDpi(widthPt, heightPt, dpi);
    const img = await src.render(n, d / 72);
    const gray = isGrayRgba(img.data);
    if (gray) grayPages++;
    const jpeg = await codec.encode(img, { quality: params.quality, gray });
    const embedded = await out.embedJpg(jpeg);
    const page = out.addPage([widthPt, heightPt]);
    page.drawImage(embedded, { x: 0, y: 0, width: widthPt, height: heightPt });
    hooks.onProgress?.((pass - 1) * src.pages + n, pass * src.pages);
  }
  return {
    bytes: await out.save({ useObjectStreams: false, objectsPerTick: Number.POSITIVE_INFINITY }),
    grayPages,
  };
}

export async function rasterize(
  src: PageSource,
  inputSize: number,
  params: RasterParams,
  codec: JpegCodec,
  hooks: RasterHooks = {},
): Promise<RasterOutcome> {
  if (src.pages > RASTER_MAX_PAGES) throw new PdfError('too-many-pages', String(src.pages));
  let dpi = params.dpi;
  let pass = 1;
  let r = await renderAll(src, dpi, params, codec, hooks, pass);
  let reduced = false;
  while (pass < params.passes && r.bytes.length >= inputSize && dpi > params.minDpi) {
    const next = nextRasterDpi(dpi, r.bytes.length, inputSize, {
      ratio: params.ratio,
      minDpi: params.minDpi,
    });
    if (next >= dpi) break;
    dpi = next;
    reduced = true;
    pass++;
    r = await renderAll(src, dpi, params, codec, hooks, pass);
  }
  return { bytes: r.bytes, dpi, reduced, grayPages: r.grayPages, pages: src.pages };
}
