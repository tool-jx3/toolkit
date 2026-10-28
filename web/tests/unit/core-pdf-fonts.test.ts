/**
 * core/pdf：沒有內嵌的中日韓字型（整頁轉圖時有的話不轉成圖；每個等級都記下，畫面提示預覽會缺字）。
 */
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { nonEmbeddedCjkFonts } from '@/core/pdf/fonts';
import { resolveSettings } from '@/core/pdf/levels';
import { compressPdf, type EngineDeps } from '@/core/pdf/pipeline';
import { nodeDeps } from '../helpers/pdfEngine';
import { cjkPdf } from '../helpers/pdfFixtures';

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
