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

/**
 * Worker 版的編碼器。**取消**（`abort()`）之後，還在等的 `addFrame`、`setStill`、`finish`（等 Worker 啟動、等排隊的格消化、
 * 等封裝）一律以 AbortError（`DOMException('已取消', 'AbortError')`）拒絕，之後再呼叫也立刻拒絕——和主執行緒的編碼器相同。
 * 以前只 terminate Worker，Worker 不會再回覆，等在排隊裡的 `addFrame`／`finish` 永遠不會回來，呼叫端就停在「匯出中」
 * （char-cutin 對等驗證發現，2026-11-27）。沒有取消時行為與輸出不變。
 * `handle` 可以換成假的 Worker（單元測試用）。
 */
export class WorkerEncoder implements Encoder {
  private readonly handle: WorkerHandle<EncodeWorkerApi>;
  private readonly ready: Promise<void>;
  private readonly inFlight = new Set<Promise<void>>();
  private failure: unknown = null;
  private cancelled: DOMException | null = null;
  /** abort() 時拒絕（還在等的呼叫和它賽跑） */
  private readonly stopped: Promise<never>;
  private stop: (e: DOMException) => void = () => {};

  constructor(
    spec: EncoderSpec,
    private readonly maxInFlight: number,
    handle: WorkerHandle<EncodeWorkerApi> = openEncodeWorker(),
  ) {
    this.handle = handle;
    this.ready = this.handle.api.start(spec);
    /* Worker 載不到時 start 會拒絕（core/worker）；錯誤留給之後 await ready 的呼叫，這裡先接住免得變成未處理的拒絕 */
    this.ready.catch(() => {});
    this.stopped = new Promise<never>((_, reject) => {
      this.stop = reject;
    });
    this.stopped.catch(() => {});
  }

  /** 取消之後立刻拒絕；否則和 abort() 賽跑 */
  private until<T>(p: Promise<T>): Promise<T> {
    if (this.cancelled) return Promise.reject(this.cancelled);
    return Promise.race([p, this.stopped]);
  }

  private track(p: Promise<void>) {
    const tracked = p.catch((e) => {
      this.failure ??= e;
    });
    this.inFlight.add(tracked);
    tracked.finally(() => this.inFlight.delete(tracked));
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    await this.until(this.ready);
    if (this.failure) throw this.failure;
    const buf = ownBuffer(rgba);
    this.track(this.handle.api.add(transfer(buf, [buf.buffer]), ticks));
    while (this.inFlight.size >= this.maxInFlight) await this.until(Promise.race(this.inFlight));
    if (this.failure) throw this.failure;
  }

  async setStill(rgba: RgbaPixels): Promise<void> {
    await this.until(this.ready);
    const buf = ownBuffer(rgba);
    this.track(this.handle.api.setStill(transfer(buf, [buf.buffer])));
  }

  async finish(): Promise<EncodedFile> {
    try {
      await this.until(this.ready);
      await this.until(Promise.all(this.inFlight));
      if (this.failure) throw this.failure;
      return await this.until(this.handle.api.finish());
    } finally {
      this.handle.terminate();
    }
  }

  abort(): void {
    if (!this.cancelled) {
      this.cancelled = new DOMException('已取消', 'AbortError');
      this.stop(this.cancelled);
    }
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
  const s = withTestHooks(spec);
  const useWorker = options.worker ?? canUseWorker();
  if (useWorker && canUseWorker())
    return new WorkerEncoder(s, Math.max(1, options.maxInFlight ?? 3));
  return createLocalEncoder(s);
}

/**
 * 測試用的全域注入點：頁面上設了 `window.__gifCropFrames = false` 時，GIF 照 2026-10 以前的預設每格寫整格
 * （不管呼叫端給的 cropFrames）。E2E 與對等驗證用來在同一個頁面匯出「打開前」的 GIF 比對；只認 false。
 */
export const GIF_CROP_FRAMES_HOOK = '__gifCropFrames';

function withTestHooks(spec: EncoderSpec): EncoderSpec {
  if (
    spec.format === 'gif' &&
    (globalThis as Record<string, unknown>)[GIF_CROP_FRAMES_HOOK] === false
  )
    return { format: 'gif', options: { ...spec.options, cropFrames: false } };
  return spec;
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
