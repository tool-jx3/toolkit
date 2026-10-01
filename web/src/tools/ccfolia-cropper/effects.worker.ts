/**
 * 效果 Worker：剪影效果（距離場＋模糊）在大圖上要幾百毫秒，放在 Worker 裡算，拖曳裁切框時畫面不卡。
 * 呼叫依序排隊處理；結果的像素以 transfer 傳回。
 */
import { exposeApi, transfer } from '@/core/worker';
import type { RgbaBuffer } from './logic';
import { applyEffects, type EffectParams, encodeOutput } from './process';

const api = {
  apply(rgba: RgbaBuffer, p: EffectParams): RgbaBuffer {
    const out = applyEffects(rgba, p);
    return transfer(out, [out.data.buffer]);
  },
  async encode(rgba: RgbaBuffer, p: EffectParams | null): Promise<Uint8Array<ArrayBuffer>> {
    const bytes = await encodeOutput(rgba, p);
    return transfer(bytes, [bytes.buffer]);
  },
};

export type EffectsWorkerApi = typeof api;

exposeApi(api);
