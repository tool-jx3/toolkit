/**
 * core/pdf：沒有內嵌的中日韓字型（整頁轉圖時有的話不轉成圖；每個等級都記下，畫面提示預覽會缺字）。
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { nonEmbeddedCjkFonts } from '@/core/pdf/fonts';
import { resolveSettings } from '@/core/pdf/levels';
import {
  hasSignatureJson,
  mayHaveImagesJson,
  nonEmbeddedCjkFontsJson,
  OBJECTS_JSON_ARGS,
  parseObjectsJson,
} from '@/core/pdf/objectsJson';
import { compressPdf, type EngineDeps } from '@/core/pdf/pipeline';
import { nodeCodec, nodeDeps, nodeQpdf } from '../helpers/pdfEngine';
import {
  cjkPdf,
  grayFlatePdf,
  grayScanRgba,
  type JpegEncoder,
  singleJpegPdf,
  textPdf,
} from '../helpers/pdfFixtures';

describe('沒有內嵌的中日韓字型', () => {
  it('找得到沒有內嵌的；內嵌的不算', async () => {
    const a = await PDFDocument.load(await cjkPdf(false));
    expect(nonEmbeddedCjkFonts(a)).toEqual(['MS-Mincho']);
    const b = await PDFDocument.load(await cjkPdf(true));
    expect(nonEmbeddedCjkFonts(b)).toEqual([]);
  });

  it('整頁轉圖：有的話不轉成圖（只試整理結構），記下字型名稱', async () => {
    const src = await cjkPdf(false);
    const deps = nodeDeps();
    let called = false;
    const spy: EngineDeps = {
      ...deps,
      rasterize: async () => {
        called = true;
        throw new Error('should not run');
      },
    };
    const r = await compressPdf({ bytes: src, settings: resolveSettings('raster') }, spy);
    expect(called).toBe(false);
    expect(r.missingFonts).toEqual(['MS-Mincho']);
    expect(r.candidates.some((c) => c.name === 'raster')).toBe(false);
    expect(r.candidates.some((c) => c.name === 'structural')).toBe(true);
    expect(r.lossy).toBe(false);
  });

  it('其他等級也記下（預覽會缺字的提示）', async () => {
    const r = await compressPdf(
      { bytes: await cjkPdf(false), settings: resolveSettings('balanced') },
      nodeDeps(),
    );
    expect(r.missingFonts).toEqual(['MS-Mincho']);
  });
});

describe('qpdf 的 JSON 版（大檔流程：不攤開整份）', () => {
  const objects = async (bytes: Uint8Array) => {
    const r = await nodeQpdf()(bytes, OBJECTS_JSON_ARGS);
    return parseObjectsJson(r.stdout)!;
  };

  it('沒有內嵌的中日韓字型：和 pdf-lib 版結果相同', async () => {
    for (const embedded of [false, true]) {
      const bytes = await cjkPdf(embedded);
      expect(nonEmbeddedCjkFontsJson(await objects(bytes))).toEqual(
        nonEmbeddedCjkFonts(await PDFDocument.load(bytes)),
      );
    }
    expect(nonEmbeddedCjkFontsJson(await objects(await cjkPdf(false)))).toEqual(['MS-Mincho']);
  });

  it('數位簽章：/FT /Sig 有 /V、或 /Type /Sig 有 /ByteRange', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([100, 100]);
    expect(hasSignatureJson(await objects(await doc.save()))).toBe(false);
    const ctx = doc.context;
    ctx.register(ctx.obj({ Type: 'Sig', ByteRange: [0, 10, 20, 30] }));
    expect(hasSignatureJson(await objects(await doc.save()))).toBe(true);
  });

  it('有沒有可以壓的影像：JPEG 都算；Flate 的要轉換開著、8 位元、夠大', async () => {
    const enc: JpegEncoder = (rgba, width, height, o) =>
      nodeCodec().encode({ data: rgba, width, height }, { quality: o.quality, gray: !!o.gray });
    expect(mayHaveImagesJson(await objects(await textPdf()), true)).toBe(false);
    expect(mayHaveImagesJson(await objects(await singleJpegPdf(enc)), false)).toBe(true);
    const flat = await grayFlatePdf(grayScanRgba(400, 300), 400, 300);
    expect(mayHaveImagesJson(await objects(flat), true)).toBe(true);
    expect(mayHaveImagesJson(await objects(flat), false)).toBe(false);
    const tiny = await grayFlatePdf(grayScanRgba(100, 100), 100, 100);
    expect(mayHaveImagesJson(await objects(tiny), true)).toBe(false);
  });

  it('大檔的平衡：沒有影像的檔案不攤開讀進 pdf-lib，只做結構', async () => {
    const r = await compressPdf(
      {
        bytes: new Blob([(await textPdf()) as BlobPart]),
        settings: resolveSettings('balanced'),
        big: true,
      },
      nodeDeps(),
    );
    expect(r.images).toBeNull();
    expect(r.dedupe).toBeNull();
    expect(r.candidates.map((c) => c.name)).toEqual(['structural']);
  });

  it('讀不出來的 JSON：null', () => {
    expect(parseObjectsJson('qpdf: not json')).toBeNull();
  });

  it('大檔的整頁轉圖：有沒有內嵌的中日韓字型時不轉成圖', async () => {
    const r = await compressPdf(
      {
        bytes: new Blob([(await cjkPdf(false)) as BlobPart]),
        settings: resolveSettings('raster'),
        big: true,
      },
      nodeDeps(),
    );
    expect(r.missingFonts).toEqual(['MS-Mincho']);
    expect(r.candidates.map((c) => c.name)).toEqual(['structural']);
  });
});
