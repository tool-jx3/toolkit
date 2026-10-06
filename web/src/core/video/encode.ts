/**
 * 把逐格畫好的畫面編成影片（不經過即時錄影，每一格都一定進檔案）：
 *
 * - MP4：瀏覽器的 WebCodecs H.264 編碼（每格都是關鍵影格），自己封裝成單一軌的 MP4（ftyp＋moov＋mdat）。
 *   寬高必須是偶數；依尺寸與 FPS 選 H.264 的等級，依序試 Baseline、Main、High。
 * - AVI：每格存成 JPEG（MJPEG），RIFF AVI＋idx1 索引。所有瀏覽器都能做。
 *
 * ```ts
 * if (await canEncodeMp4({ width: 960, height: 540, fps: 30 })) {
 *   const blob = await encodeMp4({ width: 960, height: 540, fps: 30, frameCount: 90, renderFrame: (i) => draw(i), signal, onProgress });
 * }
 * const avi = await encodeAvi({ width: 960, height: 540, fps: 30, frameCount: 90, renderFrame: draw });
 * ```
 *
 * 透明的地方：MP4 丟掉透明度（畫面要自己先鋪底色）；JPEG 沒有透明度（同樣先鋪底色）。
 * 容器的組法是純函式（`mp4Header`、`aviParts`），可以在 Node 測試。（character-select 移植時新增）
 */

import { movieLayout } from './mp4';

/** 檔案大小上限（1 GiB） */
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

export type VideoEncodeErrorCode =
  | 'unsupported'
  | 'too-large'
  | 'bad-options'
  | 'odd-size'
  | 'frame-size'
  | 'encoder';

/** 影片編碼的錯誤（訊息可以直接顯示） */
export class VideoEncodeError extends Error {
  readonly code: VideoEncodeErrorCode;
  constructor(code: VideoEncodeErrorCode, message: string) {
    super(message);
    this.name = 'VideoEncodeError';
    this.code = code;
  }
}

const MESSAGES: Record<VideoEncodeErrorCode, string> = {
  unsupported:
    '這個瀏覽器或這個畫面尺寸不支援 MP4（H.264）編碼，請改用 Chrome、Edge，或改存成 AVI。',
  'too-large': '影片超過 1 GB，請縮小尺寸、降低 FPS 或縮短長度。',
  'bad-options': '影片的尺寸、FPS 或影格數不正確。',
  'odd-size': 'MP4 的寬與高都必須是偶數。',
  'frame-size': '畫出來的影格尺寸與影片設定不符。',
  encoder: 'MP4 編碼失敗，請改存成 AVI。',
};

const fail = (code: VideoEncodeErrorCode, detail?: string) =>
  new VideoEncodeError(code, detail ? `${MESSAGES[code]}（${detail}）` : MESSAGES[code]);
/** （core/video 內部共用）依代碼產生錯誤，detail 加在訊息後面的括號裡 */
export const videoEncodeError = fail;

const abortError = () => new DOMException('已取消', 'AbortError');
const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

/** （core/video 內部共用） */
export { abortError, nextTask };

export type VideoFrameCanvas = CanvasImageSource & { width: number; height: number };

export interface VideoEncodeOptions {
  width: number;
  height: number;
  /** 每秒格數（整數 1～120） */
  fps: number;
  frameCount: number;
  /** 畫第 i 格，回傳畫好的畫布（尺寸必須是 width × height） */
  renderFrame: (index: number) => VideoFrameCanvas | Promise<VideoFrameCanvas>;
  signal?: AbortSignal;
  /** 已完成幾格 */
  onProgress?: (done: number, total: number) => void;
  /** 檔案大小上限（預設 1 GiB） */
  maxBytes?: number;
}

/** （core/video 內部共用）檢查尺寸、FPS、影格數；even＝寬高必須是偶數 */
export function validate(o: VideoEncodeOptions, even: boolean) {
  const { width, height, fps, frameCount } = o;
  if (
    ![width, height, fps, frameCount].every(Number.isInteger) ||
    width < 1 ||
    height < 1 ||
    width > 32767 ||
    height > 32767 ||
    fps < 1 ||
    fps > 120 ||
    frameCount < 1 ||
    frameCount > 1_000_000 ||
    typeof o.renderFrame !== 'function'
  )
    throw fail('bad-options');
  if (even && (width % 2 || height % 2)) throw fail('odd-size');
  if (o.signal?.aborted) throw abortError();
}

/** （core/video 內部共用）畫第 i 格並檢查尺寸 */
export async function frameOf(o: VideoEncodeOptions, i: number): Promise<VideoFrameCanvas> {
  if (o.signal?.aborted) throw abortError();
  const c = await o.renderFrame(i);
  if (o.signal?.aborted) throw abortError();
  if (!c || c.width !== o.width || c.height !== o.height) throw fail('frame-size');
  return c;
}

/* ---------- 位元組小工具 ---------- */

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

function ints(values: readonly number[], bytes: 2 | 4, little: boolean): Uint8Array {
  const out = new Uint8Array(values.length * bytes);
  const v = new DataView(out.buffer);
  values.forEach((x, i) => {
    if (bytes === 2) v.setUint16(i * 2, x, little);
    else v.setUint32(i * 4, x >>> 0, little);
  });
  return out;
}
const le32 = (...v: number[]) => ints(v, 4, true);
const le16 = (...v: number[]) => ints(v, 2, true);

/* ---------- MP4 ---------- */

/**
 * MP4 的檔頭：ftyp＋moov（時間單位＝fps、每個樣本 1 個單位、全部是同步樣本、單一區塊）＋mdat 的標頭。
 * 檔案＝[head, ...每格的資料]（依序接在後面）。（組法在 `mp4.ts` 的 movieLayout；輸出與改版前逐位元組相同）
 */
export function mp4Header(
  sizes: readonly number[],
  description: Uint8Array,
  width: number,
  height: number,
  fps: number,
): Uint8Array {
  return movieLayout({ codec: 'avc1', config: description, width, height, fps, sizes }).head;
}

/** H.264 的等級：level_idc、最多幾個巨集區塊、每秒最多幾個、位元率上限（bps） */
const H264_LEVELS: readonly (readonly [number, number, number, number])[] = [
  [30, 1620, 40500, 10_000_000],
  [31, 3600, 108000, 14_000_000],
  [32, 5120, 216000, 20_000_000],
  [40, 8192, 245760, 20_000_000],
  [41, 8192, 245760, 50_000_000],
  [42, 8704, 522240, 50_000_000],
  [50, 22080, 589824, 135_000_000],
  [51, 36864, 983040, 240_000_000],
  [52, 36864, 2073600, 240_000_000],
];

/** 位元率：min(5,000 萬, max(200 萬, 寬 × 高 × FPS × 0.6)) */
export const mp4Bitrate = (width: number, height: number, fps: number) =>
  Math.round(Math.min(50_000_000, Math.max(2_000_000, width * height * fps * 0.6)));

export type H264Profile = 'baseline' | 'main' | 'high';
const PROFILE_IDC: Record<H264Profile, string> = { baseline: '4200', main: '4d00', high: '6400' };

/**
 * 候選的編碼設定（依等級由低到高，每個等級依序試 Baseline、Main、High）。
 * 選填（music-frame 移植時新增，不給時與以前相同）：`bitrate`（預設 mp4Bitrate）、`profiles`（每個等級試的順序）。
 */
export function mp4ConfigCandidates({
  width,
  height,
  fps,
  bitrate: wantBitrate,
  profiles = ['baseline', 'main', 'high'],
}: {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  profiles?: readonly H264Profile[];
}): VideoEncoderConfig[] {
  if (
    ![width, height, fps].every(Number.isInteger) ||
    width < 2 ||
    height < 2 ||
    width % 2 ||
    height % 2 ||
    fps < 1 ||
    fps > 120
  )
    return [];
  const blocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const bitrate = Math.round(wantBitrate ?? mp4Bitrate(width, height, fps));
  const out: VideoEncoderConfig[] = [];
  for (const [level, maxBlocks, maxRate, maxBitrate] of H264_LEVELS) {
    if (blocks > maxBlocks || blocks * fps > maxRate || bitrate > maxBitrate) continue;
    for (const profile of profiles)
      out.push({
        codec: `avc1.${PROFILE_IDC[profile]}${level.toString(16).padStart(2, '0')}`,
        width,
        height,
        framerate: fps,
        bitrate,
        bitrateMode: 'variable',
        latencyMode: 'quality',
        hardwareAcceleration: 'no-preference',
        avc: { format: 'avc' },
      });
  }
  return out;
}

/** 這個瀏覽器能用的 MP4 編碼設定（不支援時 null） */
export async function findMp4Config(size: {
  width: number;
  height: number;
  fps: number;
}): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function') return null;
  for (const config of mp4ConfigCandidates(size)) {
    try {
      const r = await VideoEncoder.isConfigSupported(config);
      if (r.supported) return config;
    } catch {
      /* 不支援的組合會丟錯，試下一個 */
    }
  }
  return null;
}

/** 能不能編 MP4（不給尺寸時用 640 × 360、30 FPS 試） */
export async function canEncodeMp4(
  size: { width: number; height: number; fps: number } = { width: 640, height: 360, fps: 30 },
): Promise<boolean> {
  return !!(await findMp4Config({
    width: size.width + (size.width % 2),
    height: size.height + (size.height % 2),
    fps: size.fps,
  }));
}

const copyBytes = (d: AllowSharedBufferSource): Uint8Array =>
  ArrayBuffer.isView(d)
    ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice()
    : new Uint8Array(d as ArrayBuffer).slice();

/** MP4（H.264，每格都是關鍵影格） */
export async function encodeMp4(o: VideoEncodeOptions): Promise<Blob> {
  validate(o, true);
  const { width, height, fps, frameCount, signal } = o;
  const maxBytes = o.maxBytes ?? VIDEO_MAX_BYTES;
  const config = await findMp4Config({ width, height, fps });
  if (signal?.aborted) throw abortError();
  if (!config) throw fail('unsupported');
  const samples: (Blob | undefined)[] = new Array(frameCount);
  const sizes: number[] = new Array(frameCount).fill(0);
  let description: Uint8Array | null = null;
  let failure: Error | null = null;
  let encoded = 0;
  let media = 0;
  let encoder: VideoEncoder | null = null;
  try {
    encoder = new VideoEncoder({
      output(chunk, meta) {
        if (failure) return;
        try {
          const index = Math.round((chunk.timestamp * fps) / 1_000_000);
          if (index < 0 || index >= frameCount || samples[index] || chunk.type !== 'key')
            throw fail('encoder', '影格順序不正確');
          const desc = meta?.decoderConfig?.description;
          if (desc) {
            const next = copyBytes(desc);
            if (next.length < 7 || next[0] !== 1) throw fail('encoder', '讀不到編碼器的設定');
            if (
              description &&
              (description.length !== next.length || description.some((b, k) => b !== next[k]))
            )
              throw fail('encoder', '編碼器的設定中途改變');
            description = next;
          }
          if (!chunk.byteLength) throw fail('encoder', '空的影格');
          media += chunk.byteLength;
          if (media + frameCount * 8 + 4096 > maxBytes) throw fail('too-large');
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          samples[index] = new Blob([bytes]);
          sizes[index] = bytes.byteLength;
          encoded++;
        } catch (e) {
          failure = e instanceof Error ? e : new Error(String(e));
        }
      },
      error(e) {
        failure = fail('encoder', e.message);
      },
    });
    encoder.configure(config);
    for (let i = 0; i < frameCount; i++) {
      if (failure) throw failure;
      const canvas = await frameOf(o, i);
      const timestamp = Math.round((i * 1_000_000) / fps);
      const duration = Math.round(((i + 1) * 1_000_000) / fps) - timestamp;
      const frame = new VideoFrame(canvas, { timestamp, duration, alpha: 'discard' });
      try {
        encoder.encode(frame, { keyFrame: true });
      } finally {
        frame.close();
      }
      if ((i + 1) % 8 === 0 || i + 1 === frameCount) {
        await flush(encoder, signal, () => failure);
        if (encoded !== i + 1) throw fail('encoder', `掉了影格 ${encoded}／${i + 1}`);
        o.onProgress?.(encoded, frameCount);
        await nextTask();
      }
    }
    if (signal?.aborted) throw abortError();
    if (encoded !== frameCount || !description) throw fail('encoder', '影格不完整');
    const head = mp4Header(sizes, description, width, height, fps);
    if (head.byteLength + media > maxBytes) throw fail('too-large');
    return new Blob([head as Uint8Array<ArrayBuffer>, ...(samples as Blob[])], {
      type: 'video/mp4',
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotSupportedError' || e.name === 'SecurityError'))
      throw fail('unsupported');
    throw e;
  } finally {
    if (encoder && encoder.state !== 'closed') encoder.close();
  }
}

/** （core/video 內部共用）等編碼器把送進去的影格全部吐出來（中途可以取消；60 秒沒有回應就放棄） */
export async function flush(
  encoder: { flush(): Promise<void> },
  signal: AbortSignal | undefined,
  error: () => Error | null,
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const deadline = Date.now() + 60_000;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setInterval(() => {
        if (signal?.aborted) reject(abortError());
        else if (error()) reject(error());
        else if (Date.now() > deadline) reject(fail('encoder', '編碼器沒有回應'));
      }, 50);
      encoder.flush().then(resolve, reject);
    });
  } finally {
    clearInterval(timer);
  }
  if (signal?.aborted) throw abortError();
  const e = error();
  if (e) throw e;
}

/* ---------- AVI（MJPEG） ---------- */

function riff(type: string, data: Uint8Array): Uint8Array {
  return concat([ascii(type), le32(data.byteLength), data, new Uint8Array(data.byteLength % 2)]);
}
const riffList = (type: string, ...parts: Uint8Array[]) =>
  riff('LIST', concat([ascii(type), ...parts]));

/**
 * AVI 的各段：head（RIFF 標頭、hdrl、movi 的 LIST 標頭）、每格的 chunk 標頭（`00dc`＋大小；資料後面奇數時補 1 個 0）、
 * 結尾的 idx1。檔案＝[head, 每格（標頭、資料、補位）…, index]。
 */
export function aviParts(
  sizes: readonly number[],
  width: number,
  height: number,
  fps: number,
): {
  head: Uint8Array;
  chunkHeader: (i: number) => Uint8Array;
  padding: (i: number) => Uint8Array;
  index: Uint8Array;
  fileSize: number;
} {
  const n = sizes.length;
  const largest = sizes.reduce((m, s) => Math.max(m, s), 0);
  const avih = riff(
    'avih',
    le32(
      Math.round(1_000_000 / fps),
      Math.min(0xffffffff, (largest + 9) * fps),
      0,
      0x10,
      n,
      0,
      1,
      largest,
      width,
      height,
      0,
      0,
      0,
      0,
    ),
  );
  const strh = riff(
    'strh',
    concat([
      ascii('vidsMJPG'),
      le32(0),
      le16(0, 0),
      le32(0, 1, fps, 0, n, largest, 0xffffffff, 0),
      le16(0, 0, width, height),
    ]),
  );
  const strf = riff(
    'strf',
    concat([
      le32(40, width, height),
      le16(1, 24),
      ascii('MJPG'),
      le32(width * height * 3, 0, 0, 0, 0),
    ]),
  );
  const hdrl = riffList('hdrl', avih, riffList('strl', strh, strf));
  let movie = 0;
  const index = new Uint8Array(n * 16);
  const view = new DataView(index.buffer);
  for (let i = 0; i < n; i++) {
    index.set(ascii('00dc'), i * 16);
    view.setUint32(i * 16 + 4, 0x10, true);
    /* 位移：從 movi 的 FOURCC 算起到這一格的 chunk 標頭 */
    view.setUint32(i * 16 + 8, movie + 4, true);
    view.setUint32(i * 16 + 12, sizes[i], true);
    movie += 8 + sizes[i] + (sizes[i] % 2);
  }
  const fileSize = 12 + hdrl.byteLength + 12 + movie + 8 + index.byteLength;
  const head = concat([
    ascii('RIFF'),
    le32(fileSize - 8),
    ascii('AVI '),
    hdrl,
    ascii('LIST'),
    le32(movie + 4),
    ascii('movi'),
  ]);
  return {
    head,
    chunkHeader: (i) => concat([ascii('00dc'), le32(sizes[i])]),
    padding: (i) => new Uint8Array(sizes[i] % 2),
    index: concat([ascii('idx1'), le32(index.byteLength), index]),
    fileSize,
  };
}

/** base64 → 位元組 */
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 一格 JPEG。<canvas> 用同步的 toDataURL（toBlob 的編碼排在瀏覽器的閒置時間，背景或無頭模式下每次可能等上一秒）；
 * OffscreenCanvas 用 convertToBlob。
 */
async function jpegOf(canvas: VideoFrameCanvas, quality: number): Promise<Blob> {
  let blob: Blob | null = null;
  if (typeof (canvas as HTMLCanvasElement).toDataURL === 'function') {
    const url = (canvas as HTMLCanvasElement).toDataURL('image/jpeg', quality);
    if (url.startsWith('data:image/jpeg;base64,'))
      blob = new Blob([fromBase64(url.slice(url.indexOf(',') + 1))], { type: 'image/jpeg' });
  } else if (typeof (canvas as OffscreenCanvas).convertToBlob === 'function')
    blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality });
  if (!blob?.size || blob.type !== 'image/jpeg')
    throw new VideoEncodeError('encoder', '無法產生 AVI 的 JPEG 影格。');
  return blob;
}

/** AVI（MJPEG，每格 JPEG；quality 預設 0.95） */
export async function encodeAvi(o: VideoEncodeOptions & { quality?: number }): Promise<Blob> {
  validate(o, false);
  const { width, height, fps, frameCount, signal } = o;
  const maxBytes = o.maxBytes ?? VIDEO_MAX_BYTES;
  const quality = o.quality ?? 0.95;
  const frames: Blob[] = [];
  let total = 0;
  for (let i = 0; i < frameCount; i++) {
    const jpeg = await jpegOf(await frameOf(o, i), quality);
    if (signal?.aborted) throw abortError();
    total += 8 + jpeg.size + (jpeg.size % 2);
    if (total + frameCount * 16 + 512 > maxBytes) throw fail('too-large');
    frames.push(jpeg);
    o.onProgress?.(i + 1, frameCount);
    if ((i + 1) % 8 === 0) await nextTask();
  }
  if (signal?.aborted) throw abortError();
  const parts = aviParts(
    frames.map((f) => f.size),
    width,
    height,
    fps,
  );
  if (parts.fileSize > maxBytes) throw fail('too-large');
  const body: BlobPart[] = [parts.head as Uint8Array<ArrayBuffer>];
  frames.forEach((f, i) => {
    body.push(parts.chunkHeader(i) as Uint8Array<ArrayBuffer>, f);
    const pad = parts.padding(i);
    if (pad.byteLength) body.push(pad as Uint8Array<ArrayBuffer>);
  });
  body.push(parts.index as Uint8Array<ArrayBuffer>);
  return new Blob(body, { type: 'video/x-msvideo' });
}
