/**
 * PSD 的解析與自動綁定（Worker；規格 F05、F10）：檔頭檢查 → 指紋 → 圖層結構檢查 → 展開圖像 → 去除雜訊 → 綁定。
 * 綁定的結果（部件的像素）轉移給主執行緒；清過的圖層樹留在 Worker，「儲存輕量 PSD」時寫回 PSD。
 * see-through 的深度 PSD／`.psd.json`（規格 1.15）：和彩色 PSD 一起讀入，或之後再加入（用留著的圖層樹對應）。
 */
import { loadAgPsd } from '@/core/decode';
import { exposeApi, transfer } from '@/core/worker';
import { genericParts } from './genericParts';
import {
  buildRig,
  cleanPsdLayers,
  imageLayersOf,
  type PsdRoot,
  type Rig,
  validatePsd,
} from './rigger';
import { DEPTH_STEP, LOAD_STEPS } from './rigText';
import { fingerprint, validateHeader } from './runtime';
import { type DepthMeasure, type LayerRect, measureDepth, validateDepthHeader } from './seeThrough';

let lastPsd: PsdRoot | null = null;
/** 讀入時（去雜點、裁切之前）每個圖像圖層的範圍：深度 PSD 的位置檢查用 */
let lastRects: LayerRect[] = [];

export interface DepthInput {
  /** 深度 PSD（`<名稱>_depth.psd`） */
  depth?: ArrayBuffer | null;
  /** `.psd.json`（已經 JSON.parse 過） */
  json?: unknown;
}

export interface DepthResult {
  measure: DepthMeasure | null;
  /** 深度 PSD 讀不了的原因（訊息可以直接顯示） */
  error: string | null;
}

export interface LoadResult {
  /** 模型指紋（設定依這個分模型存） */
  id: string;
  rig: Rig;
  /** 去掉雜點的圖層數／圖像圖層數 */
  noise: { noisy: number; layers: number };
  /** 一起給了深度檔時 */
  depth: DepthResult | null;
}

const READ_OPTIONS = {
  useImageData: true,
  skipThumbnail: true,
  skipCompositeImageData: true,
} as const;

const rectOf = (l: {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}): LayerRect => ({
  left: l.left ?? 0,
  top: l.top ?? 0,
  right: l.right ?? 0,
  bottom: l.bottom ?? 0,
});

async function readDepth(
  psd: PsdRoot,
  rects: LayerRect[],
  input: DepthInput,
  onProgress: ((message: string) => void) | null,
): Promise<DepthResult> {
  let depth: PsdRoot | null = null;
  try {
    if (input.depth) {
      onProgress?.(DEPTH_STEP);
      validateDepthHeader(input.depth);
      const { readPsd } = await loadAgPsd();
      depth = validatePsd(readPsd(new Uint8Array(input.depth), READ_OPTIONS) as PsdRoot);
    }
  } catch (e) {
    /* 深度 PSD 讀不了時，一起給的 .psd.json 照樣用 */
    const measure = input.json != null ? measureDepth(psd, rects, null, input.json) : null;
    return { measure, error: e instanceof Error ? e.message : String(e) };
  }
  return { measure: measureDepth(psd, rects, depth, input.json ?? null), error: null };
}

const api = {
  async load(
    buffer: ArrayBuffer,
    onProgress: (message: string) => void,
    extra?: DepthInput,
  ): Promise<LoadResult> {
    validateHeader(buffer);
    onProgress(LOAD_STEPS.checking);
    const id = fingerprint(buffer);
    const { readPsd } = await loadAgPsd();
    const bytes = new Uint8Array(buffer);
    validatePsd(readPsd(bytes, { ...READ_OPTIONS, skipLayerImageData: true }) as PsdRoot);
    onProgress(LOAD_STEPS.decoding);
    /* 合成圖也讀進來：之後存「輕量 PSD」時一起寫回 */
    const psd = readPsd(bytes, { ...READ_OPTIONS, skipCompositeImageData: false }) as PsdRoot;
    const rects = imageLayersOf(psd).map(rectOf);
    onProgress(LOAD_STEPS.denoising);
    const noise = cleanPsdLayers(psd);
    onProgress(LOAD_STEPS.building);
    const rig = buildRig(psd, { generic: genericParts() });
    const depth =
      extra && (extra.depth || extra.json != null)
        ? await readDepth(psd, rects, extra, onProgress)
        : null;
    lastPsd = psd;
    lastRects = rects;
    const buffers = rig.layers.map((l) => l.img.data.buffer as ArrayBuffer);
    return transfer({ id, rig, noise, depth }, buffers);
  },

  /** 目前的模型加入深度 PSD／`.psd.json`（規格 F103） */
  async depth(input: DepthInput): Promise<DepthResult> {
    if (!lastPsd) throw new Error('還沒有讀入 PSD。');
    return readDepth(lastPsd, lastRects, input, null);
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
