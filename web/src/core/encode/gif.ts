/**
 * GIF 逐格編碼器（LZW 與檔案結構交給 gifenc，調色盤用本專案的 palette.ts）。
 *
 * - GIF 只有 1 位元透明：alpha < alphaThreshold 視為透明，其餘當作不透明。
 * - 整段動畫共用一個全域調色盤（最多 256 色），避免影格之間顏色跳動。
 * - 連續相同的影格合併並延長顯示時間；延遲以 1/100 秒累計換算，不會越積越多誤差。
 * - 瀏覽器會把短於 2/100 秒的延遲當成 1/10 秒，所以 fps 上限是 50。
 */
import { GIFEncoder, type GifPalette } from 'gifenc';
import {
  assertFrameSize,
  copyRect,
  diffRect,
  type EncodedFile,
  type FrameEncoder,
  pasteRect,
  type Rect,
  type RgbaPixels,
  toU32,
  yieldToEventLoop,
} from './frames';
import { buildPalette, ColorStats } from './palette';

export const GIF_MAX_FPS = 50;

export interface GifEncoderOptions {
  width: number;
  height: number;
  /** 每秒格數（最多 50） */
  fps: number;
  /** 播放次數，0 = 無限循環（預設） */
  plays?: number;
  /** alpha 小於這個值當作透明（預設 128） */
  alphaThreshold?: number;
}

interface Change {
  r: Rect;
  px: Uint32Array;
  count: number;
}

/** 播放次數 → GIF 的 NETSCAPE 重播次數（gifenc：-1 = 播一次、0 = 無限、n = 額外 n 次） */
export function gifRepeat(plays: number): number {
  if (plays <= 0) return 0;
  return plays === 1 ? -1 : plays - 1;
}

export class GifEncoder implements FrameEncoder {
  private readonly opt: Required<GifEncoderOptions>;
  private prev: Uint32Array | null = null;
  private readonly changes: Change[] = [];
  private readonly stats = new ColorStats(256);
  private sawTransparent = false;
  private added = 0;
  private ticks = 0;
  private aborted = false;

  constructor(options: GifEncoderOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new RangeError('寬高必須大於 0');
    if (!(options.fps > 0)) throw new RangeError('fps 必須大於 0');
    if (options.fps > GIF_MAX_FPS) throw new RangeError(`GIF 的 fps 最多 ${GIF_MAX_FPS}`);
    if (options.width > 65535 || options.height > 65535)
      throw new RangeError('GIF 的寬高最多 65535');
    this.opt = { plays: 0, alphaThreshold: 128, ...options };
  }

  async addFrame(rgba: RgbaPixels, ticks = 1): Promise<void> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    const { width: W, height: H, alphaThreshold } = this.opt;
    assertFrameSize(rgba, W, H);
    /* 先轉成 1 位元透明（複製一份，不改呼叫端的資料） */
    const src = toU32(rgba);
    const u32 = new Uint32Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (v >>> 24 < alphaThreshold) {
        u32[i] = 0;
        this.sawTransparent = true;
      } else u32[i] = (v | 0xff000000) >>> 0;
    }
    const t = Math.max(1, Math.round(ticks));
    this.added++;
    this.ticks += t;
    const r = this.prev ? diffRect(this.prev, u32, W, H) : { x: 0, y: 0, w: W, h: H };
    this.prev = u32;
    if (!r) {
      this.changes[this.changes.length - 1].count += t;
      return;
    }
    this.stats.addRect(u32, W, r.x, r.y, r.x + r.w, r.y + r.h);
    this.changes.push({ r, px: copyRect(u32, W, r), count: t });
  }

  abort(): void {
    this.aborted = true;
    this.changes.length = 0;
    this.prev = null;
  }

  async finish(): Promise<EncodedFile> {
    if (this.aborted) throw new DOMException('已取消', 'AbortError');
    if (!this.added) throw new Error('沒有任何影格');
    const { width: W, height: H, fps, plays } = this.opt;
    const pal = buildPalette(this.stats, 256);
    const palette: GifPalette = [];
    for (let i = 0; i < pal.count; i++) {
      palette.push([pal.colors[i * 4], pal.colors[i * 4 + 1], pal.colors[i * 4 + 2]]);
    }
    /* 無損時 0 號是完全透明（排序時排在最前面）；減色時 0 號固定保留給透明 */
    const transparent = this.sawTransparent;

    const gif = GIFEncoder();
    const canvas = new Uint32Array(W * H);
    const index = new Uint8Array(W * H);
    let lastV = -1;
    let lastI = 0;
    let tick = 0;
    for (let ci = 0; ci < this.changes.length; ci++) {
      const c = this.changes[ci];
      pasteRect(canvas, W, c.r, c.px);
      for (let y = c.r.y; y < c.r.y + c.r.h; y++) {
        for (let x = c.r.x; x < c.r.x + c.r.w; x++) {
          const k = y * W + x;
          const v = canvas[k];
          if (v !== lastV) {
            lastV = v;
            lastI = pal.indexOf(v);
          }
          index[k] = lastI;
        }
      }
      const startCs = Math.round((tick * 100) / fps);
      tick += c.count;
      const endCs = Math.round((tick * 100) / fps);
      gif.writeFrame(index, W, H, {
        palette: ci === 0 ? palette : undefined,
        delay: Math.max(2, endCs - startCs) * 10,
        repeat: gifRepeat(plays),
        transparent,
        transparentIndex: 0,
        dispose: transparent ? 2 : 1,
      });
      if (ci % 8 === 7) await yieldToEventLoop();
    }
    gif.finish();
    const view = gif.bytesView();
    const bytes = new Uint8Array(view.length);
    bytes.set(view);
    return {
      bytes,
      mime: 'image/gif',
      ext: 'gif',
      width: W,
      height: H,
      frames: this.added,
      storedFrames: this.changes.length,
      duration: this.ticks / fps,
      colors: { lossless: pal.lossless, count: pal.count },
    };
  }
}
