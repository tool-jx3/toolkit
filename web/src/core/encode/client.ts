/**
 * 建立編碼器：預設在 Web Worker 裡編碼（不卡畫面），環境不支援時改在主執行緒。
 */
import { canUseWorker, ownBuffer, transfer, type WorkerHandle, wrapWorker } from '../worker';
import type { EncodeWorkerApi } from './encode.worker';
import type { EncodedFile, RgbaPixels } from './frames';
import { createLocalEncoder, type Encoder, type EncoderSpec } from './local';
import type { PaletteMethod } from './palette';
import { encodePngColors, type StillPngResult } from './still';

export interface CreateEncoderOptions {
  /** 在 Worker 裡編碼（預設：環境支援就用） */
  worker?: boolean;
  /** 最多幾格同時在 Worker 裡排隊（預設 3）。越多越快，但占用越多記憶體。 */
  maxInFlight?: number;
}

/** 開一個編碼 Worker（Vite 會把 encode.worker.ts 打包成獨立檔案） */
export function openEncodeWorker(): WorkerHandle<EncodeWorkerApi> {
  const worker = new Worker(new URL('./encode.worker.ts', import.meta.url), {
    type: 'module',
    name: '編碼',
  });
  return wrapWorker<EncodeWorkerApi>(worker);
}

class WorkerEncoder implements Encoder {
  private readonly handle: WorkerHandle<EncodeWorkerApi>;
  private readonly ready: Promise<void>;
  private readonly inFlight = new Set<Promise<void>>();
  private failure: unknown = null;

  constructor(
    spec: EncoderSpec,
    private readonly maxInFlight: number,
  ) {
    this.handle = openEncodeWorker();
    this.ready = this.handle.api.start(spec);
  }

  private track(p: Promise<void>) {
    const tracked = p.catch((e) => {
      this.failure ??= e;
    });
    this.inFlight.add(tracked);
    tracked.finally(() => this.inFlight.delete(tracked));
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    await this.ready;
    if (this.failure) throw this.failure;
    const buf = ownBuffer(rgba);
    this.track(this.handle.api.add(transfer(buf, [buf.buffer]), ticks));
    while (this.inFlight.size >= this.maxInFlight) await Promise.race(this.inFlight);
    if (this.failure) throw this.failure;
  }

  async setStill(rgba: RgbaPixels): Promise<void> {
    await this.ready;
    const buf = ownBuffer(rgba);
    this.track(this.handle.api.setStill(transfer(buf, [buf.buffer])));
  }

  async finish(): Promise<EncodedFile> {
    await this.ready;
    await Promise.all(this.inFlight);
    if (this.failure) {
      this.handle.terminate();
      throw this.failure;
    }
    try {
      return await this.handle.api.finish();
    } finally {
      this.handle.terminate();
    }
  }

  abort(): void {
    this.handle.terminate();
  }
}

/**
 * 建立逐格編碼器。
 *
 * ```ts
 * const enc = createEncoder({ format: 'apng', options: { width, height, fps: 30 } });
 * for (...) await enc.addFrame(ctx.getImageData(0, 0, width, height).data);
 * const file = await enc.finish(); // { bytes, mime, ext, ... }
 * ```
 */
export function createEncoder(spec: EncoderSpec, options: CreateEncoderOptions = {}): Encoder {
  const useWorker = options.worker ?? canUseWorker();
  if (useWorker && canUseWorker())
    return new WorkerEncoder(spec, Math.max(1, options.maxInFlight ?? 3));
  return createLocalEncoder(spec);
}

/**
 * 在 Worker 裡編一張 PNG（大圖時不卡畫面）；不支援 Worker 時改在主執行緒。
 * maxColors：0（預設）＝全彩 RGBA；2～256＝減色成調色盤 PNG（色數在上限內時無損）。
 */
export async function encodePngAsync(
  rgba: RgbaPixels,
  width: number,
  height: number,
  maxColors = 0,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!canUseWorker()) return (await encodePngColors(rgba, width, height, maxColors)).bytes;
  const handle = openEncodeWorker();
  try {
    const buf = ownBuffer(rgba);
    return (await handle.api.encodePng(
      transfer(buf, [buf.buffer]),
      width,
      height,
      maxColors,
    )) as Uint8Array<ArrayBuffer>;
  } finally {
    handle.terminate();
  }
}

/**
 * 單張 PNG（可減色），回傳檔案與減色資訊；在 Worker 裡執行（不支援時改在主執行緒）。
 * paletteMethod：減色時調色盤的選法（預設 'median-cut'）。
 */
export async function encodePngColorsAsync(
  rgba: RgbaPixels,
  width: number,
  height: number,
  maxColors = 0,
  paletteMethod: PaletteMethod = 'median-cut',
): Promise<StillPngResult> {
  if (!canUseWorker())
    return encodePngColors(rgba, width, height, maxColors, 'auto', paletteMethod);
  const handle = openEncodeWorker();
  try {
    const buf = ownBuffer(rgba);
    return (await handle.api.encodePngColors(
      transfer(buf, [buf.buffer]),
      width,
      height,
      maxColors,
      paletteMethod,
    )) as StillPngResult;
  } finally {
    handle.terminate();
  }
}
