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

export const WORKER_FAILED_MESSAGE = '背景處理無法執行，請重新整理頁面再試一次。';

/** Worker 的檔案載不到、執行時出錯（沒接住的例外）或回傳的訊息無法解讀時，呼叫拿到的錯誤 */
export class WorkerFailedError extends Error {
  constructor(message = WORKER_FAILED_MESSAGE) {
    super(message);
    this.name = 'WorkerFailedError';
  }
}

/**
 * 包裝一個 Worker。Comlink 本身不管 Worker 的 error／messageerror 事件（呼叫會一直等下去），
 * 這裡夾一層通道記下還沒回覆的呼叫：Worker 出錯時讓它們都以 WorkerFailedError 拒絕、結束 Worker，
 * 之後的呼叫也立刻拒絕。呼叫端自己接的 error 事件照常收到（先接的先收到）。
 */
export function wrapWorker<T>(worker: Worker): WorkerHandle<T> {
  /** 送出去、還沒收到回覆的呼叫（Comlink 的訊息 id） */
  const pending = new Set<string>();
  /** Comlink 掛在通道上的 message 監聽器（出錯時直接交給它「拋出例外」的回覆） */
  const listeners = new Set<EventListenerOrEventListenerObject>();
  let failure: WorkerFailedError | null = null;

  /* Comlink 的回覆格式：{ id, type: 'HANDLER', name: 'throw', value: { isError: false, value } } 會拋出 value */
  const reject = (id: string) => {
    const ev = {
      data: { id, type: 'HANDLER', name: 'throw', value: { isError: false, value: failure } },
    } as MessageEvent;
    for (const l of [...listeners]) {
      if (typeof l === 'function') l(ev);
      else l.handleEvent(ev);
    }
  };
  const idOf = (msg: unknown) =>
    msg && typeof msg === 'object' && typeof (msg as { id?: unknown }).id === 'string'
      ? (msg as { id: string }).id
      : null;

  const endpoint: Comlink.Endpoint = {
    postMessage(message: unknown, transfer?: Transferable[]) {
      const id = idOf(message);
      if (failure) {
        if (id) queueMicrotask(() => reject(id));
        return;
      }
      if (id) pending.add(id);
      worker.postMessage(message, transfer ?? []);
    },
    addEventListener(type, listener, options) {
      if (type === 'message') listeners.add(listener);
      worker.addEventListener(type, listener, options);
    },
    removeEventListener(type, listener, options) {
      if (type === 'message') listeners.delete(listener);
      worker.removeEventListener(type, listener, options);
    },
  };
  worker.addEventListener('message', (ev) => {
    const id = idOf(ev.data);
    if (id) pending.delete(id);
  });
  const fail = () => {
    if (failure) return;
    failure = new WorkerFailedError();
    worker.terminate();
    const ids = [...pending];
    pending.clear();
    for (const id of ids) reject(id);
  };
  worker.addEventListener('error', fail);
  worker.addEventListener('messageerror', fail);

  const api = Comlink.wrap<T>(endpoint);
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
