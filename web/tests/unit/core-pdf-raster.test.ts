/**
 * core/pdf：整頁轉圖（WP 的 maximum：120 DPI、品質 60，比目標大時降 DPI 重畫，最低 50、最多 4 輪）＋
 * 本站的提早放棄（抽樣、每一輪之後）、灰階頁、頁數上限；整頁轉圖的等級也試只整理結構（M3）；
 * 整個流程用 pdf.js 真的畫（Node 的 @napi-rs/canvas）。錯誤的還原。
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PdfError, revivePdfError } from '@/core/pdf/errors';
import { readJpegHeader } from '@/core/pdf/jpeg';
import { resolveSettings } from '@/core/pdf/levels';
import { RASTER_MAX_PAGES } from '@/core/pdf/limits';
import { filtersOf, isImage, rawStreams } from '@/core/pdf/objects';
import { compressPdf, type EngineDeps } from '@/core/pdf/pipeline';
import {
  type PageSource,
  RASTER_GIVE_UP_MARGIN,
  RASTER_SAMPLE_PAGES,
  rasterize,
  samplePages,
} from '@/core/pdf/raster';
import { nodeCodec, nodeDeps } from '../helpers/pdfEngine';
import { blankPdf, singleJpegPdf, textPdf } from '../helpers/pdfFixtures';

/** 假的頁面來源：每頁畫成雜訊（壓不下去）或灰階；記下每次要求的倍率。flatBelow：倍率小於它時畫成白紙 */
function fakeSource(
  pages: number,
  { gray = false, flatBelow = 0 }: { gray?: boolean; flatBelow?: number } = {},
): PageSource & { scales: number[] } {
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
        const v = scale < flatBelow ? 255 : s >>> 24;
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
const MIN_SCALE = params.minDpi / 72;
const BIG = 500_000_000;

describe('整頁轉圖', () => {
  it('抽樣的頁碼：平均分散、不重複；頁數少時全部', () => {
    expect(RASTER_SAMPLE_PAGES).toBe(8);
    expect(samplePages(3)).toEqual([1, 2, 3]);
    const s = samplePages(500);
    expect(s).toHaveLength(8);
    expect(new Set(s).size).toBe(8);
    expect(s[0]).toBeGreaterThan(1);
    expect(s[7]).toBeLessThanOrEqual(500);
    expect(s[7]).toBeGreaterThan(450);
  });

  it('比目標小時只畫一輪（先用最低 DPI 抽樣）；每頁一張 JPEG、頁面大小照原本', async () => {
    const src = fakeSource(2);
    const r = await rasterize(src, BIG, params, nodeCodec());
    expect(r.reduced).toBe(false);
    expect(r.gaveUp).toBe(false);
    expect(r.dpi).toBe(120);
    expect(r.passes).toBe(1);
    /* 抽樣 2 頁（最低 DPI）＋第一輪 2 頁 */
    expect(src.scales).toHaveLength(4);
    expect(src.scales[0]).toBeCloseTo(MIN_SCALE);
    expect(src.scales[2]).toBeCloseTo(120 / 72);
    expect(r.estimate).toBeGreaterThan(0);
    const doc = await PDFDocument.load(r.bytes!);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const imgs = rawStreams(doc.context).filter(([, s]) => isImage(doc.context, s.dict));
    expect(imgs.length).toBe(2);
    expect(filtersOf(doc.context, imgs[0][1].dict)).toEqual(['DCTDecode']);
  }, 60_000);

  it('畫完比目標大：DPI 往下降重畫（以目標的 0.8 倍為準），每一輪都比上一輪低、最低 50', async () => {
    /* 先量：120 DPI 一輪多大、抽樣估計的最低 DPI 多大 */
    const probe = await rasterize(fakeSource(1), BIG, params, nodeCodec());
    const at120 = probe.bytes!.length;
    const target = Math.round((at120 + probe.estimate) / 2);
    expect(probe.estimate * RASTER_GIVE_UP_MARGIN).toBeLessThan(target);
    const src = fakeSource(1);
    const r = await rasterize(src, target, params, nodeCodec());
    expect(r.reduced).toBe(true);
    expect(r.gaveUp).toBe(false);
    expect(r.dpi).toBeLessThan(120);
    expect(r.dpi).toBeGreaterThanOrEqual(50);
    expect(r.passes).toBeLessThanOrEqual(4);
    const passes = src.scales.slice(1);
    expect(passes[0]).toBeCloseTo(120 / 72);
    for (let i = 1; i < passes.length; i++) expect(passes[i]).toBeLessThan(passes[i - 1]);
  }, 60_000);

  it('提早放棄（抽樣）：最低 DPI 的估計值超過目標的 1.25 倍就不畫，沒有結果', async () => {
    const probe = await rasterize(fakeSource(1), BIG, params, nodeCodec());
    const src = fakeSource(20);
    const r = await rasterize(src, probe.estimate / 2, params, nodeCodec());
    expect(r.gaveUp).toBe(true);
    expect(r.bytes).toBeNull();
    expect(r.passes).toBe(0);
    /* 只畫了抽樣的 8 頁（最低 DPI） */
    expect(src.scales).toHaveLength(8);
    expect(src.scales.every((x) => Math.abs(x - MIN_SCALE) < 1e-9)).toBe(true);
  }, 60_000);

  it('提早放棄（每一輪之後）：這一輪 ×（50 ÷ DPI）² 還不比目標小，就不再降', async () => {
    /* 抽樣（最低 DPI）畫成白紙，估計值很小；120 DPI 是雜訊，很大 */
    const probe = await rasterize(fakeSource(1, { flatBelow: 1 }), BIG, params, nodeCodec());
    const at120 = probe.bytes!.length;
    const target = Math.floor(at120 * (50 / 120) ** 2 * 0.9);
    const src = fakeSource(1, { flatBelow: 1 });
    const r = await rasterize(src, target, params, nodeCodec());
    expect(r.gaveUp).toBe(true);
    expect(r.passes).toBe(1);
    expect(r.reduced).toBe(false);
    expect(r.bytes).not.toBeNull();
  }, 60_000);

  it('整頁灰階的頁存成灰階 JPEG（單一成分）', async () => {
    const r = await rasterize(fakeSource(1, { gray: true }), BIG, params, nodeCodec());
    expect(r.grayPages).toBe(1);
    const doc = await PDFDocument.load(r.bytes!);
    const [, img] = rawStreams(doc.context).find(([, s]) => isImage(doc.context, s.dict))!;
    expect(readJpegHeader(img.contents)?.components).toBe(1);
  }, 60_000);

  it('超過 500 頁：丟 too-many-pages（不畫）', async () => {
    expect(RASTER_MAX_PAGES).toBe(500);
    const src = fakeSource(501);
    await expect(rasterize(src, 1, params, nodeCodec())).rejects.toMatchObject({
      kind: 'too-many-pages',
    });
    expect(src.scales).toHaveLength(0);
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
});

describe('整頁轉圖的等級也試只整理結構（M3）與頁數上限（M1）', () => {
  it('照片的檔案：轉圖比原檔小就停在 120 DPI（不為了比整理結構小而降），再一起取最小', async () => {
    const enc = (rgba: Uint8ClampedArray, width: number, height: number, o: { quality: number }) =>
      nodeCodec().encode({ data: rgba, width, height }, { quality: o.quality, gray: false });
    const src = await singleJpegPdf(enc, { width: 1600, height: 1200 });
    const deps = nodeDeps();
    /* 假裝只整理結構的結果非常小：轉圖仍以原檔為目標，不降 DPI */
    const qpdf = deps.qpdf;
    const tiny: EngineDeps = {
      ...deps,
      qpdf: async (bytes, args, opts) => {
        const r = await qpdf(bytes, args, opts);
        if (args.includes('--linearize') && r.out && bytes === src) {
          return { ...r, out: r.out.subarray(0, 64) };
        }
        return r;
      },
    };
    const r = await compressPdf({ bytes: src, settings: resolveSettings('raster') }, tiny);
    expect(r.raster).toMatchObject({ dpi: 120, reduced: false, gaveUp: false });
  }, 60_000);

  it('文字為主的檔案：轉成圖片比只整理結構大 → 用整理結構的結果（文字仍在）；降 DPI 的目標只看原檔', async () => {
    const text = await textPdf();
    const deps = nodeDeps();
    const targets: number[] = [];
    const spy: EngineDeps = {
      ...deps,
      rasterize: (bytes, o) => {
        targets.push(o.target);
        return deps.rasterize!(bytes, o);
      },
    };
    const r = await compressPdf({ bytes: text, settings: resolveSettings('raster') }, spy);
    const structural = r.candidates.find((c) => c.name === 'structural')!;
    expect(structural.bytes).toBeLessThan(text.length);
    /* WP：目標是原檔，不是只整理結構的結果 */
    expect(targets).toEqual([text.length]);
    expect(r.kept).toBe(false);
    expect(r.strategy).not.toBe('raster');
    expect(r.lossy).toBe(false);
    /* 轉圖有沒有結果都不影響：轉完再和整理結構一起取最小 */
    const raster = r.candidates.find((c) => c.name === 'raster');
    if (raster?.bytes) expect(raster.bytes).toBeGreaterThan(r.outputBytes);
    /* 選的不是圖片，所以連文字一起比對 */
    expect(r.verify?.ok).toBe(true);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getPageCount()).toBe(3);
  }, 120_000);

  it('超過 500 頁：那一列錯誤（too-many-pages），不轉、也不只整理結構', async () => {
    const many = await blankPdf(501);
    const deps = nodeDeps();
    let called = false;
    const spy: EngineDeps = {
      ...deps,
      rasterize: async () => {
        called = true;
        throw new Error('should not run');
      },
    };
    await expect(
      compressPdf({ bytes: many, settings: resolveSettings('raster') }, spy),
    ).rejects.toMatchObject({ kind: 'too-many-pages' });
    expect(called).toBe(false);
    /* 其他等級照常 */
    const r = await compressPdf({ bytes: many, settings: resolveSettings('lossless') }, deps);
    expect(r.pages).toBe(501);
  }, 60_000);

  it('rasterize 自己丟的 too-many-pages 也不會被當成「候選失敗」吞掉', async () => {
    const deps = nodeDeps();
    const spy: EngineDeps = {
      ...deps,
      rasterize: async () => {
        throw new PdfError('too-many-pages', '600');
      },
    };
    await expect(
      compressPdf({ bytes: await textPdf(), settings: resolveSettings('raster') }, spy),
    ).rejects.toMatchObject({ kind: 'too-many-pages' });
  }, 60_000);
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
