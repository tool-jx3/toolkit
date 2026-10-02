/**
 * 編碼 Worker：一個 Worker 負責一次匯出。
 * 收到的影格依序處理（內部排隊），主執行緒可以不等前一格編完就送下一格。
 */
import { exposeApi, transfer } from '../worker';
import type { EncodedFile } from './frames';
import { createLocalEncoder, type Encoder, type EncoderSpec } from './local';
import type { PaletteMethod } from './palette';
import { encodePngColors, type StillPngResult } from './still';

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
  /** 單張 PNG；maxColors > 0 時減色成調色盤 PNG */
  async encodePng(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    maxColors = 0,
  ): Promise<Uint8Array> {
    const { bytes } = await encodePngColors(rgba, width, height, maxColors);
    return transfer(bytes, [bytes.buffer]);
  },
  /** 同上，另外回傳減色資訊；paletteMethod 選調色盤的選法 */
  async encodePngColors(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    maxColors: number,
    paletteMethod: PaletteMethod = 'median-cut',
  ): Promise<StillPngResult> {
    const result = await encodePngColors(rgba, width, height, maxColors, 'auto', paletteMethod);
    return transfer(result, [result.bytes.buffer]);
  },
};

export type EncodeWorkerApi = typeof api;

exposeApi(api);
