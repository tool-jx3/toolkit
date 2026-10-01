/**
 * 動畫 WebP 封裝（自己寫 RIFF／VP8X／ANIM／ANMF）。
 *
 * 每一格的影像交給瀏覽器編碼（canvas 的 `toBlob('image/webp')`／OffscreenCanvas 的 `convertToBlob`），
 * 再把單張 WebP 裡的 ALPH＋VP8／VP8L 取出來，放進 ANMF 影格。
 *
 * - 每格只存跟前一格不同的矩形（座標對齊偶數；混合方式「不混合」、處置方式「不處置」）。
 * - 連續相同的影格合併並延長顯示時間（毫秒，累計換算）。
 * - quality 為 1 時 Chromium 會用無損編碼（VP8L）；其他值為有損。
 * - Safari 不支援 WebP 編碼：先用 supportsWebpEncoding() 檢查。
 */
import {
  assertFrameSize,
  copyRect,
  diffRect,
  type EncodedFile,
  type FrameEncoder,
  type Rect,
  type RgbaPixels,
  tickToMs,
  toU32,
} from './frames';
import { concat } from './png';

export interface RiffChunk {
  fourcc: string;
  data: Uint8Array;
}

const ascii = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** 解析 WebP（RIFF）檔的 chunk 清單 */
export function parseWebp(bytes: Uint8Array): RiffChunk[] {
  if (bytes.length < 12 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WEBP') {
    throw new Error('不是 WebP 檔');
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = Math.min(bytes.length, 8 + dv.getUint32(4, true));
  const chunks: RiffChunk[] = [];
  let o = 12;
  while (o + 8 <= end) {
    const fourcc = ascii(bytes, o);
    const size = dv.getUint32(o + 4, true);
    if (o + 8 + size > end) throw new Error('WebP chunk 長度超出檔案');
    chunks.push({ fourcc, data: bytes.subarray(o + 8, o + 8 + size) });
    o += 8 + size + (size & 1);
  }
  return chunks;
}

/** 一個 RIFF chunk（含補齊偶數長度的 0） */
export function riffChunk(fourcc: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const pad = data.length & 1;
  const out = new Uint8Array(8 + data.length + pad);
  for (let i = 0; i < 4; i++) out[i] = fourcc.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function u24(out: Uint8Array, o: number, v: number) {
  out[o] = v & 255;
  out[o + 1] = (v >>> 8) & 255;
  out[o + 2] = (v >>> 16) & 255;
}

/** 從單張 WebP 取出影格要用的位元流 chunk（ALPH＋VP8，或 VP8L），已序列化 */
export function frameBitstream(single: Uint8Array): Uint8Array<ArrayBuffer> {
  const chunks = parseWebp(single).filter(
    (c) => c.fourcc === 'ALPH' || c.fourcc === 'VP8 ' || c.fourcc === 'VP8L',
  );
  if (!chunks.some((c) => c.fourcc === 'VP8 ' || c.fourcc === 'VP8L'))
    throw new Error('WebP 裡沒有影像資料');
  return concat(chunks.map((c) => riffChunk(c.fourcc, c.data)));
}

export interface WebpAnimFrame extends Rect {
  /** 顯示毫秒數 */
  durationMs: number;
  /** frameBitstream() 的結果 */
  bitstream: Uint8Array;
}

export interface AssembleWebpOptions {
  width: number;
  height: number;
  /** 播放次數，0 = 無限循環 */
  loops: number;
  hasAlpha: boolean;
  /** 背景色（RGBA，預設全透明）。多數瀏覽器忽略這個值。 */
  background?: [number, number, number, number];
  frames: readonly WebpAnimFrame[];
}

/** 組成動畫 WebP 檔 */
export function assembleAnimatedWebp(o: AssembleWebpOptions): Uint8Array<ArrayBuffer> {
  if (o.width > 1 << 24 || o.height > 1 << 24) throw new RangeError('WebP 的寬高最多 16777216');
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02 | (o.hasAlpha ? 0x10 : 0); // 動畫＋（有透明時）alpha
  u24(vp8x, 4, o.width - 1);
  u24(vp8x, 7, o.height - 1);

  const anim = new Uint8Array(6);
  const [r, g, b, a] = o.background ?? [0, 0, 0, 0];
  anim[0] = b; // 背景色的順序是 B、G、R、A
  anim[1] = g;
  anim[2] = r;
  anim[3] = a;
  new DataView(anim.buffer).setUint16(4, Math.max(0, Math.min(65535, o.loops)), true);

  const parts: Uint8Array[] = [riffChunk('VP8X', vp8x), riffChunk('ANIM', anim)];
  for (const f of o.frames) {
    if (f.x % 2 || f.y % 2) throw new RangeError('WebP 影格的位置必須是偶數');
    const head = new Uint8Array(16);
    u24(head, 0, f.x / 2);
    u24(head, 3, f.y / 2);
    u24(head, 6, f.w - 1);
    u24(head, 9, f.h - 1);
    u24(head, 12, Math.max(0, Math.min(0xffffff, Math.round(f.durationMs))));
    head[15] = 0x02; // 不混合（範圍內整個覆寫）、不處置
    parts.push(riffChunk('ANMF', concat([head, f.bitstream])));
  }
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  out.set(body, 12);
  return out;
}

/* ---------- 單張影像編碼（交給瀏覽器） ---------- */

export type WebpImageEncoder = (
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  quality: number,
) => Promise<Uint8Array>;

/** 用 canvas 把 RGBA 編成單張 WebP（主執行緒或 Worker 都能用） */
export const canvasWebpEncoder: WebpImageEncoder = async (rgba, width, height, quality) => {
  const image = new ImageData(rgba, width, height);
  let blob: Blob | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('無法建立畫布');
    ctx.putImageData(image, 0, 0);
    blob = await c.convertToBlob({ type: 'image/webp', quality });
  } else {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('無法建立畫布');
    ctx.putImageData(image, 0, 0);
    blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', quality));
  }
  if (blob?.type !== 'image/webp') throw new Error('這個瀏覽器不支援 WebP 編碼');
  return new Uint8Array(await blob.arrayBuffer());
};

let webpSupport: Promise<boolean> | null = null;

/** 這個環境能不能編碼 WebP（Safari 不行）。結果會快取。 */
export function supportsWebpEncoding(): Promise<boolean> {
  if (!webpSupport) {
    webpSupport = canvasWebpEncoder(new Uint8ClampedArray(4 * 4), 2, 2, 1)
      .then((b) => b.length > 0)
      .catch(() => false);
  }
  return webpSupport;
}

/* ---------- 逐格編碼器 ---------- */

export interface WebpEncoderOptions {
  width: number;
  height: number;
  fps: number;
  /** 播放次數，0 = 無限循環（預設） */
  plays?: number;
  /** 0～1；1（預設）為無損 */
  quality?: number;
  /** 換掉單張編碼方式（測試用） */
  encodeImage?: WebpImageEncoder;
}

interface StoredFrame extends Rect {
  bitstream: Uint8Array;
  count: number;
}

export class WebpEncoder implements FrameEncoder {
  private readonly opt: Required<WebpEncoderOptions>;
  private prev: Uint32Array | null = null;
  private readonly frames: StoredFrame[] = [];
  private hasAlpha = false;
  private added = 0;
  private ticks = 0;
  private aborted = false;

  constructor(options: WebpEncoderOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new RangeError('寬高必須大於 0');
    if (!(options.fps > 0)) throw new RangeError('fps 必須大於 0');
    this.opt = { plays: 0, quality: 1, encodeImage: canvasWebpEncoder, ...options };
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    const { width: W, height: H } = this.opt;
    assertFrameSize(rgba, W, H);
    const u32 = toU32(rgba);
    const t = Math.max(1, Math.round(ticks));
    this.added++;
    this.ticks += t;
    const d = this.prev ? diffRect(this.prev, u32, W, H) : { x: 0, y: 0, w: W, h: H };
    this.prev = u32;
    if (!d) {
      this.frames[this.frames.length - 1].count += t;
      return;
    }
    /* 位置對齊偶數（WebP 的規定），範圍往左上擴一格 */
    const x = d.x & ~1;
    const y = d.y & ~1;
    const r = { x, y, w: d.x + d.w - x, h: d.y + d.h - y };
    const px = copyRect(u32, W, r);
    if (!this.hasAlpha) {
      for (let i = 0; i < px.length; i++) {
        if (px[i] >>> 24 !== 255) {
          this.hasAlpha = true;
          break;
        }
      }
    }
    const single = await this.opt.encodeImage(
      new Uint8ClampedArray(px.buffer),
      r.w,
      r.h,
      this.opt.quality,
    );
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    this.frames.push({ ...r, bitstream: frameBitstream(single), count: t });
  }

  abort(): void {
    this.aborted = true;
    this.frames.length = 0;
    this.prev = null;
  }

  async finish(): Promise<EncodedFile> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    if (!this.added) throw new Error('沒有任何影格');
    const { width, height, fps, plays } = this.opt;
    let tick = 0;
    const frames: WebpAnimFrame[] = this.frames.map((f) => {
      const start = tickToMs(tick, fps);
      tick += f.count;
      return {
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        bitstream: f.bitstream,
        durationMs: tickToMs(tick, fps) - start,
      };
    });
    const bytes = assembleAnimatedWebp({
      width,
      height,
      loops: plays,
      hasAlpha: this.hasAlpha,
      frames,
    });
    return {
      bytes,
      mime: 'image/webp',
      ext: 'webp',
      width,
      height,
      frames: this.added,
      storedFrames: frames.length,
      duration: this.ticks / fps,
    };
  }
}
