/**
 * 整頁轉圖（WP 的 maximum）：每一頁畫成一張 JPEG，組成每頁只有一張圖的新 PDF。最小，但文字不能選、不能搜尋，
 * 連結、書籤、表單也都沒有了。
 *
 * 文字為主的 PDF 用固定的 DPI 畫可能反而變大，所以畫完比目標（原檔的大小，由呼叫端給）大時把 DPI 往下降重畫
 * （`nextRasterDpi`：以目標的 0.8 倍為準），最多 4 輪、最低 50 DPI（WP 的做法）。不為了比「只整理結構」的結果小而降 DPI：
 * 轉圖結束後由 pipeline 和其他候選一起取最小。本站另外：
 * - 提早放棄：先用最低 DPI 抽樣畫幾頁（平均分散在整份文件），估計整份用最低 DPI 畫的大小；估計值超過目標的
 *   RASTER_GIVE_UP_MARGIN 倍就不畫（最低 DPI 也追不上）。每畫完一輪也估一次：JPEG 的大小約和像素數（DPI²）成正比，
 *   這一輪的大小 ×（最低 DPI ÷ 這一輪的 DPI）² 還不比目標小，就不再降（實際上解析度低時每個像素要的位元組更多，
 *   這個估計偏樂觀，所以估計追不上時實際也追不上）。
 * - 整頁都是灰階的頁存成灰階 JPEG（比較小）；太大的頁面（海報）降低那一頁的 DPI，一頁最多 2,500 萬像素。
 */
import { PDFDocument } from 'pdf-lib';
import { nextRasterDpi, pageRasterDpi } from './dpi';
import { PdfError } from './errors';
import type { JpegCodec } from './jpeg';
import type { RasterParams } from './levels';
import { RASTER_MAX_PAGES } from './limits';
import { isGrayRgba } from './pixels';

export interface RasterOutcome {
  /** 結果（抽樣估計就追不上目標時 null：沒有畫） */
  bytes: Uint8Array | null;
  /** 最後用的 DPI */
  dpi: number;
  /** 有沒有因為比目標大而降低 DPI */
  reduced: boolean;
  /** 估計最低 DPI 也追不上目標，提早停了 */
  gaveUp: boolean;
  /** 存成灰階的頁數 */
  grayPages: number;
  pages: number;
  /** 抽樣估計的「整份用最低 DPI 畫」的大小（位元組） */
  estimate: number;
  /** 畫了幾輪（抽樣不算） */
  passes: number;
}

/** 抽樣估計時畫幾頁（平均分散；頁數比這個少時全部畫；自訂） */
export const RASTER_SAMPLE_PAGES = 8;
/** 抽樣估計的大小超過目標的幾倍就不畫（抽樣有誤差，留一點餘地；自訂） */
export const RASTER_GIVE_UP_MARGIN = 1.25;

/** 抽樣的頁碼（1 起，平均分散、不重複） */
export function samplePages(pages: number, count = RASTER_SAMPLE_PAGES): number[] {
  if (pages <= count) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = new Set<number>();
  for (let i = 0; i < count; i++) out.add(1 + Math.floor(((i + 0.5) * pages) / count));
  return [...out];
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

/** 用最低 DPI 抽樣畫幾頁，估計整份的大小（JPEG 的位元組） */
export async function estimateAtMinDpi(
  src: PageSource,
  params: RasterParams,
  codec: JpegCodec,
  hooks: RasterHooks = {},
): Promise<number> {
  const list = samplePages(src.pages);
  if (!list.length) return 0;
  let bytes = 0;
  for (const n of list) {
    if (hooks.signal?.aborted) throw new PdfError('aborted');
    const { widthPt, heightPt } = await src.size(n);
    const d = pageRasterDpi(widthPt, heightPt, params.minDpi);
    const img = await src.render(n, d / 72);
    const jpeg = await codec.encode(img, { quality: params.quality, gray: isGrayRgba(img.data) });
    bytes += jpeg.length;
  }
  return (bytes / list.length) * src.pages;
}

/**
 * 整頁轉圖。target：要比這個小（原檔的大小）；畫出來不比它小時降 DPI 重畫。
 */
export async function rasterize(
  src: PageSource,
  target: number,
  params: RasterParams,
  codec: JpegCodec,
  hooks: RasterHooks = {},
): Promise<RasterOutcome> {
  if (src.pages > RASTER_MAX_PAGES) throw new PdfError('too-many-pages', String(src.pages));
  const estimate = await estimateAtMinDpi(src, params, codec, hooks);
  if (estimate >= target * RASTER_GIVE_UP_MARGIN) {
    return {
      bytes: null,
      dpi: params.minDpi,
      reduced: false,
      gaveUp: true,
      grayPages: 0,
      pages: src.pages,
      estimate,
      passes: 0,
    };
  }
  let dpi = params.dpi;
  let pass = 1;
  let r = await renderAll(src, dpi, params, codec, hooks, pass);
  let reduced = false;
  let gaveUp = false;
  while (pass < params.passes && r.bytes.length >= target && dpi > params.minDpi) {
    /* 這一輪的大小換算成最低 DPI（∝ DPI²）還不比目標小：再降也追不上 */
    if (r.bytes.length * (params.minDpi / dpi) ** 2 >= target) {
      gaveUp = true;
      break;
    }
    const next = nextRasterDpi(dpi, r.bytes.length, target, {
      ratio: params.ratio,
      minDpi: params.minDpi,
    });
    if (next >= dpi) break;
    dpi = next;
    reduced = true;
    pass++;
    r = await renderAll(src, dpi, params, codec, hooks, pass);
  }
  return {
    bytes: r.bytes,
    dpi,
    reduced,
    gaveUp,
    grayPages: r.grayPages,
    pages: src.pages,
    estimate,
    passes: pass,
  };
}
