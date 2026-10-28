/**
 * core/pdf：沒有內嵌的中日韓字型（整頁轉圖時檢查；有的話不轉、保留原檔）。
 */
import { type PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { nonEmbeddedCjkFonts } from '@/core/pdf/fonts';
import { resolveSettings } from '@/core/pdf/levels';
import { compressPdf } from '@/core/pdf/pipeline';
import { nodeDeps } from '../helpers/pdfEngine';

/** 一頁、一個 Type0 字型（Ordering：Japan1）；embedded 時附一個字型檔 */
async function cjkPdf(embedded: boolean) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const fd = ctx.obj({
    Type: 'FontDescriptor',
    FontName: 'MS-Mincho',
    Flags: 4,
  }) as PDFDict;
  if (embedded) fd.set(PDFName.of('FontFile2'), ctx.register(ctx.stream(new Uint8Array(16))));
  const cid = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: 'MS-Mincho',
      CIDSystemInfo: {
        Registry: PDFString.of('Adobe'),
        Ordering: PDFString.of('Japan1'),
        Supplement: 2,
      },
      FontDescriptor: ctx.register(fd),
    }),
  );
  const font = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'MS-Mincho',
      Encoding: 'UniJIS-UCS2-H',
      DescendantFonts: [cid],
    }),
  );
  const page = doc.addPage([300, 300]);
  page.node.setFontDictionary(PDFName.of('F1'), font);
  const content = ctx.register(
    ctx.stream(new TextEncoder().encode('BT /F1 24 Tf 20 200 Td <30423044> Tj ET')),
  );
  page.node.set(PDFName.of('Contents'), content);
  return doc.save({ useObjectStreams: false });
}

describe('沒有內嵌的中日韓字型', () => {
  it('找得到沒有內嵌的；內嵌的不算', async () => {
    const a = await PDFDocument.load(await cjkPdf(false));
    expect(nonEmbeddedCjkFonts(a)).toEqual(['MS-Mincho']);
    const b = await PDFDocument.load(await cjkPdf(true));
    expect(nonEmbeddedCjkFonts(b)).toEqual([]);
  });

  it('整頁轉圖：有的話不轉，保留原檔並記下字型名稱', async () => {
    const src = await cjkPdf(false);
    const r = await compressPdf({ bytes: src, settings: resolveSettings('raster') }, nodeDeps());
    expect(r.kept).toBe(true);
    expect(r.missingFonts).toEqual(['MS-Mincho']);
    expect(r.candidates).toEqual([]);
  });
});
