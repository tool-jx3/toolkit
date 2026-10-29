/**
 * 環境音合成的 Worker：合成一個聲音要幾百毫秒到一兩秒，放在背景做，畫面不會卡住。
 * 回傳的取樣以轉移（transfer）交回主執行緒，不複製。
 */
import { exposeApi, transfer } from '@/core/worker';
import type { PcmAudio } from '../pcm';
import { type AmbienceRenderOptions, renderAmbience } from './render';

const api = {
  render(id: string, params: Record<string, number>, o: AmbienceRenderOptions): PcmAudio {
    const pcm = renderAmbience(id, params, o);
    return transfer(
      pcm,
      pcm.channels.map((c) => c.buffer as ArrayBuffer),
    );
  },
};

export type AmbienceWorkerApi = typeof api;

exposeApi(api);
