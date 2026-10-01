/**
 * 編碼 Worker：一個 Worker 負責一次匯出。
 * 收到的影格依序處理（內部排隊），主執行緒可以不等前一格編完就送下一格。
 */
import { exposeApi, transfer } from '../worker';
import type { EncodedFile } from './frames';
import { createLocalEncoder, type Encoder, type EncoderSpec } from './local';
import { encodePng } from './png';

let encoder: Encoder | null = null;
let queue: Promise<void> = Promise.resolve();

function current(): Encoder {
  if (!encoder) throw new Error('編碼器尚未啟動');
  return encoder;
}

const api = {
  start(spec: EncoderSpec): void {
    encoder = createLocalEncoder(spec);
    queue = Promise.resolve();
  },
  add(rgba: Uint8ClampedArray, ticks: number): Promise<void> {
    const enc = current();
    queue = queue.then(() => enc.addFrame(rgba, ticks));
    return queue;
  },
  setStill(rgba: Uint8ClampedArray): Promise<void> {
    const enc = current();
    queue = queue.then(() => enc.setStill(rgba));
    return queue;
  },
  async finish(): Promise<EncodedFile> {
    await queue;
    const result = await current().finish();
    encoder = null;
    return transfer(result, [result.bytes.buffer]);
  },
  abort(): void {
    encoder?.abort();
    encoder = null;
  },
  async encodePng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
    const bytes = await encodePng(rgba, width, height);
    return transfer(bytes, [bytes.buffer]);
  },
};

export type EncodeWorkerApi = typeof api;

exposeApi(api);
