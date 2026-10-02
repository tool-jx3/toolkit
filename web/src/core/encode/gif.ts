/**
 * GIF 逐格編碼器（LZW 與檔案結構交給 gifenc，調色盤用本專案的 palette.ts）。
 *
 * - GIF 只有 1 位元透明：alpha < alphaThreshold 視為透明，其餘當作不透明。
 * - 預設整段動畫共用一個全域調色盤（最多 256 色），避免影格之間顏色跳動。
 *   `localPalettes: true` 時改成每格各自減色（第一格的調色盤當全域、之後每格帶自己的區域調色盤）：
 *   顏色會隨時間流動的動畫（彩虹流動、霓虹換色）每格都分得到 256 色，代價是每格多 768 位元組。
 * - `paletteMethod` 選調色盤的選法（預設 'median-cut'；'pca'＝主成分切割，見 palette.ts）。
 * - 連續相同的影格合併並延長顯示時間；延遲以 1/100 秒累計換算，不會越積越多誤差。
 * - 瀏覽器會把短於 2/100 秒的延遲當成 1/10 秒，所以 fps 上限是 50；每格至少 2/100 秒，
 *   補上的時間從後面的格扣回（fps ≤ 50 時每格本來就 ≥ 2/100 秒，結果不變）。
 * - 影格表（每格長度不一）用 `variableDelay: true`：fps 只當計時單位（例如 100＝ticks 以 1/100 秒計），不檢查上限。
 * - `maxColors`（2～256，預設 256）：調色盤的色數上限（video-anim 移植時新增；預設時輸出不變）。
 * - `dither: 'floyd-steinberg'`：減色有損時以 Floyd–Steinberg 誤差擴散對應顏色（由左到右、由上到下，只在變化的範圍內；
 *   完全透明的像素不擴散誤差）。調色盤無損（色數在上限內）時不抖色。預設 'none'＝最近色（輸出不變）。
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
import { buildPalette, ColorStats, type Palette, type PaletteMethod } from './palette';

export const GIF_MAX_FPS = 50;

/**
 * 「不透明度小於等於 v 的像素變透明」換算成 GifEncoder 的 alphaThreshold（小於 threshold 變透明）：v ＋ 1。
 * 例：v＝96 → 97（0～96 透明、97 以上不透明）；v＝0 → 1（只有完全透明的像素透明）。
 */
export const gifAlphaThresholdInclusive = (v: number): number =>
  Math.min(256, Math.max(0, Math.round(v)) + 1);

export interface GifEncoderOptions {
  width: number;
  height: number;
  /** 每秒格數（最多 50） */
  fps: number;
  /** 播放次數，0 = 無限循環（預設） */
  plays?: number;
  /** alpha 小於這個值當作透明（預設 128）；有半透明的邊緣時，未滿一半的變透明、一半以上的變不透明 */
  alphaThreshold?: number;
  /**
   * 影格表模式：每格的長度由 addFrame 的 ticks 決定（fps 只是 ticks 的單位，例如 100 或 1000），
   * 不檢查 fps 上限；短於 2/100 秒的格延長到 2/100 秒，之後的格扣回。
   */
  variableDelay?: boolean;
  /** 每格各自減色（每格自己的區域調色盤）；預設 false＝整段共用一個全域調色盤 */
  localPalettes?: boolean;
  /** 調色盤的選法（預設 'median-cut'） */
  paletteMethod?: PaletteMethod;
  /** 調色盤的色數上限（2～256，預設 256） */
  maxColors?: number;
  /** 抖色：'none'（預設，最近色）或 'floyd-steinberg'（誤差擴散；調色盤無損時不作用） */
  dither?: GifDither;
}

export type GifDither = 'none' | 'floyd-steinberg';

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
  private readonly stats: ColorStats;
  private sawTransparent = false;
  private added = 0;
  private ticks = 0;
  private aborted = false;

  constructor(options: GifEncoderOptions) {
    if (!(options.width > 0 && options.height > 0)) throw new RangeError('寬高必須大於 0');
    if (!(options.fps > 0)) throw new RangeError('fps 必須大於 0');
    if (options.fps > GIF_MAX_FPS && !options.variableDelay)
      throw new RangeError(`GIF 的 fps 最多 ${GIF_MAX_FPS}`);
    if (options.width > 65535 || options.height > 65535)
      throw new RangeError('GIF 的寬高最多 65535');
    this.opt = {
      plays: 0,
      alphaThreshold: 128,
      variableDelay: false,
      localPalettes: false,
      paletteMethod: 'median-cut',
      maxColors: 256,
      dither: 'none',
      ...options,
    };
    this.opt.maxColors = Math.max(2, Math.min(256, Math.round(this.opt.maxColors) || 256));
    this.stats = new ColorStats(this.opt.maxColors);
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
    /* 每格各自減色時，統計留到 finish 時逐格做 */
    if (!this.opt.localPalettes) this.stats.addRect(u32, W, r.x, r.y, r.x + r.w, r.y + r.h);
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
    const {
      width: W,
      height: H,
      fps,
      plays,
      localPalettes,
      paletteMethod,
      maxColors,
      dither,
    } = this.opt;
    const toGifPalette = (p: Palette): GifPalette => {
      const out: GifPalette = [];
      for (let i = 0; i < p.count; i++)
        out.push([p.colors[i * 4], p.colors[i * 4 + 1], p.colors[i * 4 + 2]]);
      return out;
    };
    /* 全域調色盤（每格各自減色時在迴圈裡逐格建立） */
    const shared = localPalettes ? null : buildPalette(this.stats, maxColors, paletteMethod);
    let pal: Palette | null = shared;
    /* 無損時 0 號是完全透明（排序時排在最前面）；減色時 0 號固定保留給透明 */
    let transparent = this.sawTransparent;
    /* 減色資訊：每格各自減色時，全部無損才算無損、色數取最多的一格 */
    let lossless = true;
    let maxCount = 0;

    const gif = GIFEncoder();
    const canvas = new Uint32Array(W * H);
    const index = new Uint8Array(W * H);
    let lastV = -1;
    let lastI = 0;
    let tick = 0;
    /* 已寫入的累計時間（1/100 秒）：每格至少 2，補上的部分從後面扣回 */
    let writtenCs = 0;
    for (let ci = 0; ci < this.changes.length; ci++) {
      const c = this.changes[ci];
      pasteRect(canvas, W, c.r, c.px);
      /* 共用調色盤時只有變化的範圍要重新對應；每格各自減色時整格重來 */
      let r = c.r;
      if (localPalettes) {
        this.stats.clear();
        this.stats.add(canvas, 0, canvas.length);
        pal = buildPalette(this.stats, maxColors, paletteMethod);
        /* 這格有透明像素時 0 號才是透明（無損的調色盤只有用到透明時才有 0 號） */
        transparent = canvas.includes(0);
        lastV = -1;
        r = { x: 0, y: 0, w: W, h: H };
      }
      const p = pal as Palette;
      lossless &&= p.lossless;
      maxCount = Math.max(maxCount, p.count);
      if (dither === 'floyd-steinberg' && !p.lossless) {
        ditherRect(canvas, index, W, r, p);
      } else {
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) {
            const k = y * W + x;
            const v = canvas[k];
            if (v !== lastV) {
              lastV = v;
              lastI = p.indexOf(v);
            }
            index[k] = lastI;
          }
        }
      }
      tick += c.count;
      const endCs = Math.max(writtenCs + 2, Math.round((tick * 100) / fps));
      const delayCs = endCs - writtenCs;
      writtenCs = endCs;
      gif.writeFrame(index, W, H, {
        palette: ci === 0 || localPalettes ? toGifPalette(p) : undefined,
        delay: delayCs * 10,
        repeat: gifRepeat(plays),
        transparent,
        transparentIndex: 0,
        dispose: this.sawTransparent ? 2 : 1,
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
      colors: { lossless, count: maxCount },
    };
  }
}

/**
 * Floyd–Steinberg 抖色：把 r 範圍內的像素對應到調色盤（誤差 7/16 往右、3/16 左下、5/16 正下、1/16 右下）。
 * 完全透明（0）的像素對應到 0 號、不擴散誤差。
 */
export function ditherRect(
  canvas: Uint32Array,
  index: Uint8Array,
  W: number,
  r: Rect,
  p: Palette,
): void {
  const w = r.w;
  /* 目前列與下一列的誤差（RGB，左右各多一格省掉邊界判斷） */
  let cur = new Float32Array((w + 2) * 3);
  let next = new Float32Array((w + 2) * 3);
  const c = p.colors;
  for (let y = r.y; y < r.y + r.h; y++) {
    next.fill(0);
    for (let x = r.x; x < r.x + w; x++) {
      const k = y * W + x;
      const v = canvas[k];
      if (v >>> 24 === 0) {
        index[k] = p.indexOf(0);
        continue;
      }
      const e = (x - r.x + 1) * 3;
      const R = Math.min(255, Math.max(0, Math.round((v & 255) + cur[e])));
      const G = Math.min(255, Math.max(0, Math.round(((v >>> 8) & 255) + cur[e + 1])));
      const B = Math.min(255, Math.max(0, Math.round(((v >>> 16) & 255) + cur[e + 2])));
      const i = p.indexOf(((v & 0xff000000) | (B << 16) | (G << 8) | R) >>> 0);
      index[k] = i;
      const er = R - c[i * 4];
      const eg = G - c[i * 4 + 1];
      const eb = B - c[i * 4 + 2];
      cur[e + 3] += (er * 7) / 16;
      cur[e + 4] += (eg * 7) / 16;
      cur[e + 5] += (eb * 7) / 16;
      next[e - 3] += (er * 3) / 16;
      next[e - 2] += (eg * 3) / 16;
      next[e - 1] += (eb * 3) / 16;
      next[e] += (er * 5) / 16;
      next[e + 1] += (eg * 5) / 16;
      next[e + 2] += (eb * 5) / 16;
      next[e + 3] += er / 16;
      next[e + 4] += eg / 16;
      next[e + 5] += eb / 16;
    }
    const t = cur;
    cur = next;
    next = t;
  }
}
