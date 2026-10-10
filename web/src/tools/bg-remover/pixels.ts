/**
 * 像素處理的入口：環境支援就在 Worker 裡做（畫面不卡），不支援或 Worker 開不起來時改在主執行緒做，
 * 結果相同（同一份 pixelApi.ts／pipeline.ts）。
 */
import { canUseWorker, type WorkerHandle, wrapWorker } from '@/core/worker';
import { createPixelApi, type PixelApi } from './pixelApi';

export {
  type FillPreview,
  type InspectResult,
  NeedsAiError,
  type PreviewImage,
  type PreviewJob,
  type RenderJob,
  type RenderResult,
  THUMB_SIZE,
} from './pixelApi';

type Promisified<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => infer R
    ? (...a: A) => Promise<Awaited<R>>
    : never;
};

/** 主執行緒用的入口：Worker 可用時轉給 Worker，否則（或 Worker 壞了）在主執行緒做 */
export function createPixelClient(): Promisified<PixelApi> & {
  /** 目前在哪裡處理（給「複製錯誤資訊」）：Worker，或 Worker 不能用、壞了之後的主執行緒 */
  backend(): 'worker' | 'main';
  dispose(): void;
} {
  let local: PixelApi | null = null;
  const getLocal = () => (local ??= createPixelApi());
  let handle: WorkerHandle<PixelApi> | null = null;
  let broken = !canUseWorker();
  const open = (): WorkerHandle<PixelApi> | null => {
    if (broken) return null;
    if (handle) return handle;
    try {
      const w = new Worker(new URL('./pixels.worker.ts', import.meta.url), {
        type: 'module',
        name: '去背處理',
      });
      w.addEventListener('error', () => {
        broken = true;
      });
      handle = wrapWorker<PixelApi>(w);
      return handle;
    } catch {
      broken = true;
      return null;
    }
  };
  const call =
    <K extends keyof PixelApi>(name: K) =>
    async (...args: Parameters<PixelApi[K]>) => {
      const h = open();
      if (h) {
        try {
          // biome-ignore lint/suspicious/noExplicitAny: Comlink 的遠端函式型別與本地相同
          return await (h.api[name] as any)(...args);
        } catch (e) {
          if (!broken) throw e;
        }
      }
      // biome-ignore lint/suspicious/noExplicitAny: 同上
      return (getLocal()[name] as any)(...args);
    };
  return {
    backend: () => (broken ? 'main' : 'worker'),
    inspect: call('inspect'),
    thumb: call('thumb'),
    load: call('load'),
    colorBase: call('colorBase'),
    comboBase: call('comboBase'),
    aiInput: call('aiInput'),
    aiMask: call('aiMask'),
    aiBase: call('aiBase'),
    refine: call('refine'),
    despill: call('despill'),
    finalMask: call('finalMask'),
    fillPreview: call('fillPreview'),
    preview: call('preview'),
    render: call('render'),
    cancelRender: call('cancelRender'),
    forget: call('forget'),
    dispose() {
      handle?.terminate();
      handle = null;
    },
  };
}
