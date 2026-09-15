import type { RenderParams } from '../core/types';
import { t } from '../i18n';
import type { EncodeRequest, EncodeResponse } from './encode.worker';

export interface EncodeResult {
  blob: Blob;
  bytes: number;
  format: RenderParams['output']['format'];
}

/**
 * ImageData[] を Worker に渡してエンコードする。
 * バッファは transferable で渡すので、呼び出し側の frames は以降使えなくなる。
 */
export function encodeFrames(
  params: RenderParams,
  frames: ImageData[],
  onProgress?: (done: number, total: number) => void,
): Promise<EncodeResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // module worker 非対応の古い環境。無言で失敗させない
      reject(new Error(t('encoder.unsupported')));
      return;
    }
    const use = params.output.format === 'png' ? frames.slice(0, 1) : frames;
    const buffers = use.map((f) => f.data.buffer as ArrayBuffer);
    const req: EncodeRequest = {
      buffers,
      w: params.canvas.w,
      h: params.canvas.h,
      format: params.output.format,
      fps: params.fps,
      colors: params.output.colors,
      matte: params.output.format === 'gif' ? params.output.matte : null,
    };
    worker.onmessage = (e: MessageEvent<EncodeResponse>) => {
      const msg = e.data;
      if (msg.kind === 'progress') {
        onProgress?.(msg.done, msg.total);
      } else if (msg.kind === 'done') {
        const blob = new Blob([msg.buffer], { type: msg.mime });
        worker.terminate();
        resolve({ blob, bytes: blob.size, format: params.output.format });
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || t('encoder.loadFailed')));
    };
    worker.postMessage(req, buffers);
  });
}
