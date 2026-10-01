/** gifenc 沒有附型別，這裡只宣告本專案用到的部分。 */
declare module 'gifenc' {
  export type GifPalette = number[][];
  export interface WriteFrameOptions {
    palette?: GifPalette;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    /** 毫秒（內部四捨五入到 1/100 秒） */
    delay?: number;
    /** -1 = 播一次、0 = 無限、n = 額外重播 n 次 */
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
  }
  export interface GifEncoderStream {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
    writeHeader(): void;
  }
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): GifEncoderStream;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: Record<string, unknown>,
  ): GifPalette;
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: string,
  ): Uint8Array;
}
