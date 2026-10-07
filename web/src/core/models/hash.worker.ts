/**
 * 檢查下載好的模型檔（SHA-256）的 Worker（`core/models` 的 downloadModel 在主執行緒上用）：
 * Chromium 的 `crypto.subtle.digest` 對大檔案是在呼叫當下同步算完的（176 MB 約 1.3 秒），放在主執行緒會凍住畫面。
 * 位元組以 transfer 傳過來、算完再傳回去（不複製）。
 */
import { sha256Hex } from '../files/hash';
import { exposeApi, transfer } from '../worker';

const api = {
  /** 確認 Worker 載得到（之後才把位元組轉移過來，載不到時位元組還在主執行緒） */
  ping(): true {
    return true;
  },
  async sha256(
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<{ hex: string; bytes: Uint8Array<ArrayBuffer> }> {
    const hex = await sha256Hex(bytes);
    return transfer({ hex, bytes }, [bytes.buffer]);
  },
};

export type ModelHashWorkerApi = typeof api;

exposeApi(api);
