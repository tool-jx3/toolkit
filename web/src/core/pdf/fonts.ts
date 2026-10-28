/**
 * 沒有內嵌的中日韓字型（整頁轉圖前檢查）。
 *
 * 舊的 Word、一太郎匯出的 PDF 常用「MS-Mincho」「PMingLiU」等不內嵌的 CID 字型（Type0，CIDSystemInfo 的 Ordering 是
 * Japan1、GB1、CNS1、Korea1）。pdf.js 在 Worker 裡沒有電腦的字型可以用，這些字畫不出來；整頁轉圖會把空白的頁面當成結果，
 * 所以先找出來，有的話不轉（WP 的原作沒有處理，D14）。拉丁字母的非內嵌字型 pdf.js 用標準字型代替，不算。
 */
import { PDFDict, type PDFDocument, PDFRawStream } from 'pdf-lib';
import { arrayOf, dictOf, N, nameOf } from './objects';

const CJK_ORDERINGS = new Set(['Japan1', 'GB1', 'CNS1', 'Korea1']);

const textOf = (v: unknown): string | null => {
  const s = v as { decodeText?: () => string; asString?: () => string } | undefined;
  try {
    return s?.decodeText?.() ?? s?.asString?.() ?? null;
  } catch {
    return null;
  }
};

/** 沒有內嵌的中日韓字型的名稱（不重複） */
export function nonEmbeddedCjkFonts(doc: PDFDocument): string[] {
  const ctx = doc.context;
  const names = new Set<string>();
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const font = obj instanceof PDFDict ? obj : null;
    if (!font || nameOf(ctx, font.get(N('Type'))) !== 'Font') continue;
    if (nameOf(ctx, font.get(N('Subtype'))) !== 'Type0') continue;
    const desc = arrayOf(ctx, font.get(N('DescendantFonts')));
    const cid = desc?.size() ? dictOf(ctx, desc.get(0)) : null;
    if (!cid) continue;
    const info = dictOf(ctx, cid.get(N('CIDSystemInfo')));
    const ordering = info ? textOf(ctx.lookup(info.get(N('Ordering')))) : null;
    if (!ordering || !CJK_ORDERINGS.has(ordering)) continue;
    const fd = dictOf(ctx, cid.get(N('FontDescriptor')));
    const embedded =
      !!fd &&
      ['FontFile', 'FontFile2', 'FontFile3'].some(
        (k) => ctx.lookup(fd.get(N(k))) instanceof PDFRawStream,
      );
    if (!embedded) names.add(nameOf(ctx, font.get(N('BaseFont'))) ?? ordering);
  }
  return [...names];
}
