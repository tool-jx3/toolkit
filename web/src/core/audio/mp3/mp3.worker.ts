/**
 * MP3 編碼的 Worker：lamejs 編一分鐘的立體聲要好幾秒，放在背景做，畫面不會卡住；取消時直接結束 Worker。
 * lamejs 在 `encode.ts` 裡動態載入（Worker 開起來、第一次編碼時才下載）。
 */
import { exposeApi, transfer } from '@/core/worker';
import type { PcmAudio } from '../pcm';
import { encodeMp3Loop, type Mp3EncodeOptions } from './encode';

const api = {
  async encode(
    pcm: PcmAudio,
    o: Mp3EncodeOptions,
    onProgress?: (fraction: number) => void,
  ): Promise<Uint8Array> {
    let last = -1;
    const bytes = await encodeMp3Loop(pcm, o, {
      /* 每 2% 回報一次就夠了（每一次都是一則訊息） */
      onProgress: onProgress
        ? (f) => {
            if (f - last >= 0.02 || f >= 1) {
              last = f;
              void onProgress(f);
            }
          }
        : undefined,
    });
    return transfer(bytes, [bytes.buffer as ArrayBuffer]);
  },
};

export type Mp3WorkerApi = typeof api;

exposeApi(api);
