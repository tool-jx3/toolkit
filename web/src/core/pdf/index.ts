/**
 * PDF 壓縮引擎（pdf-compress 引入時新增；之後劇本文字產生器的 PDF 匯入等也可以用）。
 *
 * 主執行緒只拿到用戶端（`createPdfClient`）；qpdf（結構）、mozjpeg（影像）、pdf.js（文字比對、畫頁面）、
 * pdf-lib（物件）都在 Worker 裡（`pdf.worker.ts`），只有用到這個模組的工具頁才會下載。
 *
 * ```ts
 * const pdf = createPdfClient();
 * const { info, thumb } = await pdf.probe(bytes, { fileName: 'a.pdf', thumbWidth: 160 });
 * const report = await pdf.compress(bytes, { settings: resolveSettings('balanced'), fileName: 'a.pdf' }, (p) => …);
 * report.bytes;        // 結果（沒有變小時是原檔）
 * pdf.cancel();        // 結束 Worker：進行中的呼叫以 PdfError('aborted') 結束；之後的呼叫會開新的 Worker
 * ```
 *
 * 純函式（等級、DPI 換算、影像判斷、內容掃描、比對）可以直接 import 各檔（Node 的單元測試也用）。
 */
import { canUseWorker, proxy, transfer, type WorkerHandle, wrapWorker } from '../worker';
import { PdfError, revivePdfError } from './errors';
import type { ResolvedSettings } from './levels';
import type { PdfWorkerApi, ProbeResult, RenderedBitmap } from './pdf.worker';
import type { CompressReport, Progress } from './pipeline';
import type { PdfSource } from './source';

export type { DedupeStats } from './dedupe';
export * from './errors';
export type { SkipReason } from './images';
export * from './levels';
export * from './limits';
export type {
  CandidateSummary,
  CompressReport,
  InspectResult,
  Progress,
  Stage,
  Strategy,
} from './pipeline';
export type { ImagePassStats } from './recompress';
export * from './source';
export type { VerifyItem, VerifyResult } from './verify';
export type { ProbeResult, RenderedBitmap };

export interface PdfClient {
  /** 檢視（加密、頁數、版本）＋第一頁的縮圖（thumbWidth px 寬）。Blob（使用者的 File）照原樣傳，Worker 裡直接讀 */
  probe(
    bytes: PdfSource,
    options?: { password?: string | null; fileName?: string; thumbWidth?: number },
  ): Promise<ProbeResult>;
  /**
   * 壓縮（位元組會轉移到 Worker，之後不要再用；要留著原檔請傳複本。Blob 照原樣傳：大檔流程用）。
   * big：大檔流程（`isBigFile`）。結果的 bytes 是 Uint8Array 或 Blob（大檔流程、沒有變小的 Blob 原檔）。
   */
  compress(
    bytes: PdfSource,
    request: {
      settings: ResolvedSettings;
      password?: string | null;
      fileName?: string;
      big?: boolean;
    },
    onProgress?: (p: Progress) => void,
  ): Promise<CompressReport>;
  /** 預覽：打開、畫一頁（寬 width px）、關掉 */
  open(id: string, bytes: PdfSource, password?: string | null): Promise<{ pages: number }>;
  render(id: string, page: number, width: number): Promise<RenderedBitmap>;
  close(id: string): Promise<void>;
  /** 用到的程式庫 */
  info(): Promise<{ libraries: readonly string[]; pdfjs: string }>;
  /** 結束 Worker（取消進行中的工作）；下次呼叫時再開新的 */
  cancel(): void;
  /** 結束、不再使用 */
  terminate(): void;
}

export function createPdfClient({ name = 'PDF 處理' }: { name?: string } = {}): PdfClient {
  let handle: WorkerHandle<PdfWorkerApi> | null = null;
  const pending = new Set<(e: unknown) => void>();
  let dead = false;

  const get = () => {
    if (dead) throw new PdfError('aborted');
    if (!canUseWorker()) throw new PdfError('internal', 'Worker unavailable');
    handle ??= wrapWorker<PdfWorkerApi>(
      new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module', name }),
    );
    return handle.api;
  };

  /** 呼叫 Worker；結束 Worker 時還在等的呼叫立刻以 aborted 結束 */
  const call = <T>(fn: (api: ReturnType<typeof get>) => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const fail = (e: unknown) => {
        pending.delete(fail);
        reject(revivePdfError(e));
      };
      pending.add(fail);
      let api: ReturnType<typeof get>;
      try {
        api = get();
      } catch (e) {
        fail(e);
        return;
      }
      fn(api).then(
        (v) => {
          if (!pending.has(fail)) return;
          pending.delete(fail);
          resolve(v);
        },
        (e) => {
          if (pending.has(fail)) fail(e);
        },
      );
    });

  const stop = () => {
    handle?.terminate();
    handle = null;
    for (const fail of [...pending]) fail(new PdfError('aborted'));
  };

  const own = (bytes: Uint8Array) =>
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  /** 位元組轉移過去；Blob 照原樣（結構化複製只複製參照） */
  const pass = (s: PdfSource): PdfSource => (s instanceof Blob ? s : transferBytes(own(s)));

  return {
    probe: (bytes, options = {}) => call((api) => api.probe(pass(bytes), options)),
    compress: (bytes, request, onProgress) =>
      call((api) => api.compress(pass(bytes), request, onProgress ? proxy(onProgress) : undefined)),
    open: (id, bytes, password) => call((api) => api.open(id, pass(bytes), password)),
    render: (id, page, width) => call((api) => api.render(id, page, width)),
    close: (id) => (handle ? call((api) => api.close(id)) : Promise.resolve()),
    info: () => call((api) => api.info()),
    cancel: stop,
    terminate() {
      stop();
      dead = true;
    },
  };
}

/** 以 transfer 傳過去（Comlink 的標記） */
function transferBytes(b: Uint8Array): Uint8Array {
  return transfer(b, [b.buffer as ArrayBuffer]);
}
