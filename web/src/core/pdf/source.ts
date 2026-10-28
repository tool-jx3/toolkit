/**
 * PDF 的來源：記憶體裡的位元組（Uint8Array），或使用者的檔案與大檔的中間結果（Blob）。
 * 大檔流程（`limits.ts` 的 BIG_FILE_BYTES 以上）一律用 Blob：qpdf 用 WORKERFS 直接讀、pdf.js 分段讀，
 * 不把整份放進 JS 的記憶體（Blob 的內容由瀏覽器保管，太多時會暫存到磁碟）。輕量：主執行緒也 import。
 */

export type PdfSource = Uint8Array | Blob;

export const sourceSize = (s: PdfSource): number => (s instanceof Blob ? s.size : s.length);

/** 讀一段（Blob 時才真的讀；位元組時是 subarray） */
export async function readRange(s: PdfSource, start: number, end: number): Promise<Uint8Array> {
  const size = sourceSize(s);
  const a = Math.max(0, Math.min(start, size));
  const b = Math.max(a, Math.min(end, size));
  if (s instanceof Blob) return new Uint8Array(await s.slice(a, b).arrayBuffer());
  return s.subarray(a, b);
}

/** 開頭 n 個位元組 */
export const readHead = (s: PdfSource, n: number): Promise<Uint8Array> => readRange(s, 0, n);

/** 結尾 n 個位元組 */
export const readTail = (s: PdfSource, n: number): Promise<Uint8Array> =>
  readRange(s, sourceSize(s) - n, sourceSize(s));

/** 整份讀成位元組（已經是位元組時原樣回傳） */
export async function toBytes(s: PdfSource): Promise<Uint8Array> {
  return s instanceof Blob ? new Uint8Array(await s.arrayBuffer()) : s;
}
