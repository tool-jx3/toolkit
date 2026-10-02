/**
 * 編碼器共用的型別與影格工具（差分矩形、複製範圍）。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 一格 RGBA 影像（width×height×4，未預乘），例如 `ctx.getImageData().data` */
export type RgbaPixels = Uint8Array | Uint8ClampedArray;

export type EncodeFormat = 'apng' | 'gif' | 'webp' | 'png-sequence';

/** 播放次數的上限（WebP 與 GIF 的循環欄位是 16 位元；APNG 的 acTL 更大，三種格式一致取 65535） */
export const MAX_PLAYS = 65535;

/** 所有逐格編碼器的共同介面（主執行緒版與 Worker 版相同） */
export interface FrameEncoder {
  /**
   * 加入一格。`ticks` 是這格要顯示幾個「1/fps 秒」（預設 1）。
   * 和前一格完全相同的影格會自動合併（延長前一格的顯示時間）。
   * 加入之後編碼器擁有這塊記憶體，呼叫端不要再改它。
   */
  addFrame(rgba: RgbaPixels, ticks?: number): Promise<void>;
  /** 完成並輸出檔案 */
  finish(): Promise<EncodedFile>;
  /** 放棄（釋放記憶體；Worker 版會結束 Worker） */
  abort(): void;
}

export interface EncodedFile {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  /** 建議的副檔名（不含點） */
  ext: string;
  width: number;
  height: number;
  /** 加入的影格數（合併前） */
  frames: number;
  /** 實際存進檔案的影格數（合併相同影格之後） */
  storedFrames: number;
  /** 動畫總長（秒） */
  duration: number;
  /** 減色資訊 */
  colors?: { lossless: boolean; count: number };
}

/** 把 RGBA 位元組當成 Uint32 像素看（0xAABBGGRR）。位移沒有對齊 4 時會複製一份。 */
export function toU32(rgba: RgbaPixels): Uint32Array {
  if (rgba.byteOffset % 4 === 0)
    return new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.length >> 2);
  const copy = new Uint8Array(rgba);
  return new Uint32Array(copy.buffer);
}

/** 兩格之間有變化的矩形（沒有變化回傳 null） */
export function diffRect(a: Uint32Array, b: Uint32Array, w: number, h: number): Rect | null {
  let y0 = -1;
  let y1 = -1;
  let x0 = w;
  let x1 = -1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let first = -1;
    for (let x = 0; x < w; x++) {
      if (a[o + x] !== b[o + x]) {
        first = x;
        break;
      }
    }
    if (first < 0) continue;
    let last = first;
    for (let x = w - 1; x > first; x--) {
      if (a[o + x] !== b[o + x]) {
        last = x;
        break;
      }
    }
    if (y0 < 0) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  if (y0 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** 從整張影像複製一塊矩形（Uint32 像素） */
export function copyRect(u32: Uint32Array, stride: number, r: Rect): Uint32Array<ArrayBuffer> {
  const out = new Uint32Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) {
    const s = (r.y + y) * stride + r.x;
    out.set(u32.subarray(s, s + r.w), y * r.w);
  }
  return out;
}

/** 把一塊矩形貼回整張影像 */
export function pasteRect(dst: Uint32Array, stride: number, r: Rect, src: Uint32Array): void {
  for (let y = 0; y < r.h; y++) {
    dst.set(src.subarray(y * r.w, y * r.w + r.w), (r.y + y) * stride + r.x);
  }
}

/** 第 i 格（從 0 起算，每格 1/fps 秒）開始的毫秒數，四捨五入到整數；用累計值計算可避免誤差越積越多 */
export function tickToMs(tick: number, fps: number): number {
  return Math.round((tick * 1000) / fps);
}

/** 檢查影格大小 */
export function assertFrameSize(rgba: RgbaPixels, width: number, height: number): void {
  if (rgba.length !== width * height * 4) {
    throw new RangeError(
      `影格大小不符：預期 ${width}×${height}×4＝${width * height * 4} 位元組，收到 ${rgba.length}`,
    );
  }
}

export const yieldToEventLoop = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
