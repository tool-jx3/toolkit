/**
 * PDF 引擎的上限與檔頭的檢查（輕量：主執行緒也 import，不能帶進 pdf-lib 等大套件）。
 */
import { PdfError } from './errors';
import type { PdfLevel } from './levels';
import { type PdfSource, readHead, readTail, sourceSize } from './source';

const MB = 1024 * 1024;

/**
 * 大檔流程的門檻：這個大小以上走大檔流程（`pipeline.ts` 檔頭：使用者的 File 直接讀、少試候選、中間結果存成 Blob）。
 * 以下的檔案照原本的流程，結果和以前逐位元組相同。數值依規格「大檔實測」。
 */
export const BIG_FILE_BYTES = 100 * MB;

/** 走不走大檔流程 */
export const isBigFile = (size: number, threshold = BIG_FILE_BYTES): boolean => size >= threshold;

/**
 * 各等級能處理的最大檔案（記憶體 8 GB 以上的桌面；依規格 §8 的實測留餘量）。QC 是一律 200 MB（D22）。
 * 實測（15 GB 的機器、Chromium）：照片 955 MiB 的無損、平衡、整頁轉圖都成功，高峰 2.6／2.5／3.1 GB；
 * 向量 573 MiB 的無損 2.1 GB。整頁轉圖畫頁面的記憶體多，上限低一點。
 */
export const LEVEL_MAX_BYTES: Readonly<Record<PdfLevel, number>> = {
  lossless: 900 * MB,
  high: 900 * MB,
  balanced: 900 * MB,
  smallest: 900 * MB,
  raster: 600 * MB,
};

/** 引擎的上限（所有等級裡最大的；加入檔案時用這個擋） */
export const MAX_FILE_BYTES = Math.max(...Object.values(LEVEL_MAX_BYTES));

/**
 * 記憶體小的裝置：`navigator.deviceMemory`（GB，Chrome 與 Android 有，最大回報 8）乘上這個比例當上限。
 * 實測（規格 §8）大檔流程的高峰約「頁面本身 0.4 GB ＋ 檔案大小的 2～3 倍」；讓分頁用不到裝置記憶體的 4 成：
 * 4 GB 的裝置約 245 MB、2 GB 約 120 MB、1 GB 約 60 MB。
 */
export const DEVICE_MEMORY_RATIO = 0.06;

/**
 * 這個等級、這台裝置的上限：等級的上限，和「裝置記憶體 × DEVICE_MEMORY_RATIO」取小的
 * （不知道裝置記憶體、或回報 8 GB 以上時只看等級）。
 */
export function maxFileBytes(level: PdfLevel, deviceMemoryGB?: number | null): number {
  const byLevel = LEVEL_MAX_BYTES[level] ?? MAX_FILE_BYTES;
  if (!deviceMemoryGB || !(deviceMemoryGB > 0) || deviceMemoryGB >= 8) return byLevel;
  return Math.min(byLevel, Math.round(deviceMemoryGB * 1024 * MB * DEVICE_MEMORY_RATIO));
}

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

/** looksEncrypted 掃描的範圍：開頭與結尾各多少位元組（交叉參照表與 trailer 通常在結尾，線性化的檔案在開頭） */
const ENCRYPT_SCAN_HEAD = 4 * 1024 * 1024;
const ENCRYPT_SCAN_TAIL = 1024 * 1024;
const ENCRYPT_REF = /\/Encrypt\s+\d+\s+\d+\s+R/;

/**
 * 看起來有加密（trailer 或交叉參照串流有 `/Encrypt n g R`）。QC 的後備：qpdf 讀不出檢視的結果時，
 * 寧可多問一次密碼，也不要把要密碼的檔案當成壞檔。
 */
export function looksEncrypted(bytes: Uint8Array): boolean {
  const latin1 = new TextDecoder('latin1');
  const head = latin1.decode(bytes.subarray(0, Math.min(bytes.length, ENCRYPT_SCAN_HEAD)));
  if (ENCRYPT_REF.test(head)) return true;
  if (bytes.length <= ENCRYPT_SCAN_HEAD) return false;
  const from = Math.max(ENCRYPT_SCAN_HEAD - 64, bytes.length - ENCRYPT_SCAN_TAIL);
  return ENCRYPT_REF.test(latin1.decode(bytes.subarray(from)));
}

/** looksEncrypted 的 Blob 版（只讀開頭與結尾） */
export async function looksEncryptedSource(s: PdfSource): Promise<boolean> {
  if (!(s instanceof Blob)) return looksEncrypted(s);
  const latin1 = new TextDecoder('latin1');
  if (ENCRYPT_REF.test(latin1.decode(await readHead(s, ENCRYPT_SCAN_HEAD)))) return true;
  if (s.size <= ENCRYPT_SCAN_HEAD) return false;
  const n = Math.min(ENCRYPT_SCAN_TAIL, s.size - ENCRYPT_SCAN_HEAD + 64);
  return ENCRYPT_REF.test(latin1.decode(await readTail(s, n)));
}

/** 檢查：大小、檔頭（head 是開頭至少 1029 個位元組）；不合格時丟 PdfError */
export function precheckHead(head: Uint8Array, size: number): void {
  if (!size) throw new PdfError('empty');
  if (size > MAX_FILE_BYTES) throw new PdfError('too-large', String(size));
  if (findPdfHeader(head) < 0) throw new PdfError('not-pdf');
}

/** 選檔時的檢查（大小、檔頭）；不合格時丟 PdfError */
export function precheck(bytes: Uint8Array): void {
  precheckHead(bytes, bytes.length);
}

/** precheck 的 Blob 版 */
export async function precheckSource(s: PdfSource): Promise<void> {
  precheckHead(await readHead(s, 1100), sourceSize(s));
}

/** 整頁轉圖最多幾頁（自訂；太多頁的檔案畫一輪要很久） */
export const RASTER_MAX_PAGES = 500;

/** 清單最多幾個檔案（自訂） */
export const MAX_FILES = 100;

/**
 * 這個瀏覽器缺少的、PDF 引擎要用的功能（空陣列＝都有）：Worker（所有處理）、WebAssembly（qpdf、mozjpeg）、
 * OffscreenCanvas 與 createImageBitmap（Worker 裡畫頁面）。WP 的示範頁也是一開頁就檢查。
 */
export function missingPdfFeatures(g: object = globalThis): string[] {
  const has = (k: string) => typeof (g as Record<string, unknown>)[k] !== 'undefined';
  const missing: string[] = [];
  if (!has('Worker')) missing.push('Web Worker');
  if (!has('WebAssembly')) missing.push('WebAssembly');
  if (!has('OffscreenCanvas')) missing.push('OffscreenCanvas');
  if (!has('createImageBitmap')) missing.push('createImageBitmap');
  return missing;
}
