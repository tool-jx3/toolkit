/**
 * PSD 的解析與自動綁定（Worker；規格 F05、F10）：檔頭檢查 → 指紋 → 圖層結構檢查 → 展開圖像 → 去除雜訊 → 綁定。
 * 綁定的結果（部件的像素）轉移給主執行緒；清過的圖層樹留在 Worker，「儲存輕量 PSD」時寫回 PSD。
 */
import { loadAgPsd } from '@/core/decode';
import { exposeApi, transfer } from '@/core/worker';
import { genericParts } from './genericParts';
import { buildRig, cleanPsdLayers, type PsdRoot, type Rig, validatePsd } from './rigger';
import { LOAD_STEPS } from './rigText';
import { fingerprint, validateHeader } from './runtime';

let lastPsd: PsdRoot | null = null;

export interface LoadResult {
  /** 模型指紋（設定依這個分模型存） */
  id: string;
  rig: Rig;
  /** 去掉雜點的圖層數／圖像圖層數 */
  noise: { noisy: number; layers: number };
}

const READ_OPTIONS = {
  useImageData: true,
  skipThumbnail: true,
  skipCompositeImageData: true,
} as const;

const api = {
  async load(buffer: ArrayBuffer, onProgress: (message: string) => void): Promise<LoadResult> {
    validateHeader(buffer);
    onProgress(LOAD_STEPS.checking);
    const id = fingerprint(buffer);
    const { readPsd } = await loadAgPsd();
    const bytes = new Uint8Array(buffer);
    validatePsd(readPsd(bytes, { ...READ_OPTIONS, skipLayerImageData: true }) as PsdRoot);
    onProgress(LOAD_STEPS.decoding);
    /* 合成圖也讀進來：之後存「輕量 PSD」時一起寫回 */
    const psd = readPsd(bytes, { ...READ_OPTIONS, skipCompositeImageData: false }) as PsdRoot;
    onProgress(LOAD_STEPS.denoising);
    const noise = cleanPsdLayers(psd);
    onProgress(LOAD_STEPS.building);
    const rig = buildRig(psd, { generic: genericParts() });
    lastPsd = psd;
    const buffers = rig.layers.map((l) => l.img.data.buffer as ArrayBuffer);
    return transfer({ id, rig, noise }, buffers);
  },

  /** 清過雜點、裁過的 PSD（規格 F80） */
  async writeClean(): Promise<ArrayBuffer> {
    if (!lastPsd) throw new Error('還沒有讀入 PSD。');
    const { writePsd } = await loadAgPsd();
    const out = writePsd(lastPsd as never, { generateThumbnail: false });
    return transfer(out, [out]);
  },
};

export type PsdWorkerApi = typeof api;

exposeApi(api);
