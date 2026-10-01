/**
 * Web Worker 包裝（Comlink）。
 *
 * Worker 端：`exposeApi(api)`；主執行緒：`wrapWorker<Api>(new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' }))`。
 * `new URL(..., import.meta.url)` 這個寫法要直接寫在呼叫端，Vite 才會把 Worker 一起打包。
 */
import * as Comlink from 'comlink';

export type { Remote } from 'comlink';
export { proxy, transfer } from 'comlink';

export interface WorkerHandle<T> {
  /** 呼叫 Worker 裡的函式（一律回傳 Promise） */
  api: Comlink.Remote<T>;
  /** 結束 Worker（取消進行中的工作） */
  terminate(): void;
}

export function wrapWorker<T>(worker: Worker): WorkerHandle<T> {
  const api = Comlink.wrap<T>(worker);
  let done = false;
  return {
    api,
    terminate() {
      if (done) return;
      done = true;
      api[Comlink.releaseProxy]();
      worker.terminate();
    },
  };
}

/** 在 Worker 檔案裡呼叫，把 api 物件公開給主執行緒 */
export function exposeApi(api: object): void {
  Comlink.expose(api);
}

/** 這個環境能不能開 Worker（測試環境、極舊瀏覽器不行） */
export function canUseWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof window !== 'undefined';
}

/**
 * 把 TypedArray 轉成可以轉移（transfer）的獨立緩衝區：
 * 本身就獨占整個 ArrayBuffer 時直接用，否則複製一份（避免把別人的資料一起轉走）。
 */
export function ownBuffer<T extends Uint8Array | Uint8ClampedArray>(
  arr: T,
): Uint8ClampedArray<ArrayBuffer> {
  if (
    arr.byteOffset === 0 &&
    arr.byteLength === arr.buffer.byteLength &&
    arr.buffer instanceof ArrayBuffer
  ) {
    return new Uint8ClampedArray(arr.buffer);
  }
  return new Uint8ClampedArray(arr);
}
