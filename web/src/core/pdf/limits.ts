/**
 * PDF 引擎的上限與檔頭的檢查（輕量：主執行緒也 import，不能帶進 pdf-lib 等大套件）。
 */
import { PdfError } from './errors';

/** 檔案大小上限（QC：200 MB） */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/** 檔頭 %PDF- 的位置（PDF 允許前面有一點雜訊：找前 1024 個位元組）；沒有時 -1 */
export function findPdfHeader(bytes: Uint8Array): number {
  const end = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= end; i++) {
    if (
      bytes[i] === 0x25 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x44 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 4] === 0x2d
    ) {
      return i;
    }
  }
  return -1;
}

/** 檔頭的版本（例：1.7） */
export function pdfVersion(bytes: Uint8Array): string | null {
  const at = findPdfHeader(bytes);
  if (at < 0) return null;
  let s = '';
  for (let i = at + 5; i < Math.min(bytes.length, at + 12); i++) {
    const c = bytes[i];
    if ((c >= 48 && c <= 57) || c === 46) s += String.fromCharCode(c);
    else break;
  }
  return s || null;
}

/** 選檔時的檢查（大小、檔頭）；不合格時丟 PdfError */
export function precheck(bytes: Uint8Array): void {
  if (!bytes.length) throw new PdfError('empty');
  if (bytes.length > MAX_FILE_BYTES) throw new PdfError('too-large', String(bytes.length));
  if (findPdfHeader(bytes) < 0) throw new PdfError('not-pdf');
}

/** 整頁轉圖最多幾頁（自訂；太多頁的檔案畫一輪要很久） */
export const RASTER_MAX_PAGES = 500;

/** 清單最多幾個檔案（自訂） */
export const MAX_FILES = 100;
