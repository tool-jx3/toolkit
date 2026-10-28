/**
 * core/pdf：整頁轉圖（WP 的 maximum：120 DPI、品質 60，比原檔大時降 DPI 重畫，最低 50、最多 4 輪）＋
 * 本站的灰階頁、頁數上限；整個流程用 pdf.js 真的畫（Node 的 @napi-rs/canvas）。錯誤的還原。
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfError, revivePdfError } from '@/core/pdf/errors';
import { readJpegHeader } from '@/core/pdf/jpeg';
import { resolveSettings } from '@/core/pdf/levels';
import { RASTER_MAX_PAGES } from '@/core/pdf/limits';
import { filtersOf, isImage, rawStreams } from '@/core/pdf/objects';
import { compressPdf } from '@/core/pdf/pipeline';
import { type PageSource, rasterize } from '@/core/pdf/raster';
import { nodeCodec, nodeDeps } from '../helpers/pdfEngine';
import { singleJpegPdf, textPdf } from '../helpers/pdfFixtures';

/** 假的頁面來源：每頁畫成雜訊（壓不下去）或灰階；記下每次要求的倍率 */
function fakeSource(pages: number, gray = false): PageSource & { scales: number[] } {
  const scales: number[] = [];
  return {
    pages,
    scales,
    async size() {
      return { widthPt: 612, heightPt: 792 };
    },
    async render(_n, scale) {
      scales.push(scale);
      const width = Math.ceil(612 * scale);
      const height = Math.ceil(792 * scale);
      const data = new Uint8ClampedArray(width * height * 4);
      let s = 7;
      for (let i = 0; i < data.length; i += 4) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        const v = s >>> 24;
        data[i] = v;
        data[i + 1] = gray ? v : (v * 7) & 255;
        data[i + 2] = gray ? v : (v * 13) & 255;
        data[i + 3] = 255;
      }
      return { data, width, height };
    },
  };
}

const params = resolveSettings('raster').raster!;

describe('整頁轉圖', () => {
  it('畫完比原檔大：DPI 往下降重畫，最多 4 輪、最低 50', async () => {
    const src = fakeSource(1);
    const r = await rasterize(src, 2000, params, nodeCodec());
    expect(r.reduced).toBe(true);
    expect(r.dpi).toBeLessThan(120);
    expect(r.dpi).toBeGreaterThanOrEqual(50);
    expect(src.scales.length).toBeLessThanOrEqual(4);
    expect(src.scales[0]).toBeCloseTo(120 / 72);
    /* 每一輪的 DPI 一定比上一輪低 */
    for (let i = 1; i < src.scales.length; i++)
      expect(src.scales[i]).toBeLessThan(src.scales[i - 1]);
  }, 60_000);

  it('比原檔小時只畫一輪；每頁一張 JPEG、頁面大小照原本', async () => {
    const src = fakeSource(2);
    const r = await rasterize(src, 50_000_000, params, nodeCodec());
    expect(r.reduced).toBe(false);
    expect(r.dpi).toBe(120);
    expect(src.scales.length).toBe(2);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const imgs = rawStreams(doc.context).filter(([, s]) => isImage(doc.context, s.dict));
    expect(imgs.length).toBe(2);
    expect(filtersOf(doc.context, imgs[0][1].dict)).toEqual(['DCTDecode']);
  }, 60_000);

  it('整頁灰階的頁存成灰階 JPEG（單一成分）', async () => {
    const r = await rasterize(fakeSource(1, true), 50_000_000, params, nodeCodec());
    expect(r.grayPages).toBe(1);
    const doc = await PDFDocument.load(r.bytes);
    const [, img] = rawStreams(doc.context).find(([, s]) => isImage(doc.context, s.dict))!;
    expect(readJpegHeader(img.contents)?.components).toBe(1);
  }, 60_000);

  it('超過 500 頁：丟 too-many-pages', async () => {
    expect(RASTER_MAX_PAGES).toBe(500);
    await expect(rasterize(fakeSource(501), 1, params, nodeCodec())).rejects.toMatchObject({
      kind: 'too-many-pages',
    });
  });

  it('整個流程：照片的 PDF 變小、頁數相同、文字沒有了', async () => {
    const enc = (rgba: Uint8ClampedArray, width: number, height: number, o: { quality: number }) =>
      nodeCodec().encode({ data: rgba, width, height }, { quality: o.quality, gray: false });
    const src = await singleJpegPdf(enc, { width: 1600, height: 1200 });
    const r = await compressPdf({ bytes: src, settings: resolveSettings('raster') }, nodeDeps());
    expect(r.strategy).toBe('raster');
    expect(r.outputBytes).toBeLessThan(src.length);
    expect(r.pages).toBe(1);
    expect(r.raster?.dpi).toBe(120);
    expect(r.verify?.ok).toBe(true);
  }, 60_000);

  it('文字為主的小檔案：轉成圖反而比較大時保留原檔', async () => {
    const text = await textPdf();
    const r = await compressPdf({ bytes: text, settings: resolveSettings('raster') }, nodeDeps());
    if (r.kept) {
      expect(r.strategy).toBe('original');
      expect(r.bytes).toBe(text);
    } else {
      expect(r.outputBytes).toBeLessThan(text.length);
      expect(r.raster?.reduced).toBe(true);
    }
  }, 120_000);
});

describe('錯誤的還原（Worker 傳回來只剩 name 與 message）', () => {
  it('PdfError 的種類與原文還原；記憶體不足的訊息歸到 memory；其他是 internal', () => {
    const e = new PdfError('broken', "a.pdf: can't find startxref");
    const cloned = { name: e.name, message: e.message };
    expect(revivePdfError(cloned)).toMatchObject({
      kind: 'broken',
      detail: "a.pdf: can't find startxref",
    });
    expect(revivePdfError(new Error('RangeError: Array buffer allocation failed')).kind).toBe(
      'memory',
    );
    expect(revivePdfError(new Error('boom')).kind).toBe('internal');
    expect(revivePdfError({ name: 'PdfError', message: '[aborted]' }).kind).toBe('aborted');
  });
});
