/**
 * EPUB Worker（規格 F112、5. D8）：產生章節 XHTML 與壓縮都在這裡做，大日誌匯出時畫面不會凍住。
 * 進度用 Comlink 的 proxy 回呼傳回主執行緒；結果的位元組以 transfer 傳回。
 */
import { exposeApi, transfer } from '@/core/worker';
import { buildEpub, type EpubInput } from './book';

const api = {
  async build(input: EpubInput, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
    let last = -1;
    const bytes = await buildEpub(input, {
      onProgress: onProgress
        ? (p) => {
            /* 每 1% 才回報一次，免得訊息太多 */
            const pct = Math.floor(p * 100);
            if (pct === last) return;
            last = pct;
            void onProgress(p);
          }
        : undefined,
    });
    return transfer(bytes, [bytes.buffer]);
  },
};

export type EpubWorkerApi = typeof api;

exposeApi(api);
