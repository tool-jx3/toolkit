/**
 * 依規格建立主執行緒（或 Worker 內）的編碼器。
 */
import { ApngEncoder, type ApngEncoderOptions } from './apng';
import type { FrameEncoder, RgbaPixels } from './frames';
import { GifEncoder, type GifEncoderOptions } from './gif';
import { PngSequenceEncoder, type PngSequenceOptions } from './sequence';
import { WebpEncoder, type WebpEncoderOptions } from './webp';

/** 可以傳進 Worker 的編碼器規格（只有純資料） */
export type EncoderSpec =
  | { format: 'apng'; options: ApngEncoderOptions }
  | { format: 'gif'; options: GifEncoderOptions }
  | { format: 'webp'; options: Omit<WebpEncoderOptions, 'encodeImage'> }
  | { format: 'png-sequence'; options: PngSequenceOptions };

/** 編碼器（有些格式另外支援預設圖） */
export interface Encoder extends FrameEncoder {
  /** 設定預設圖（只有 APNG 有作用；其他格式忽略） */
  setStill(rgba: RgbaPixels): Promise<void>;
}

export function createLocalEncoder(spec: EncoderSpec): Encoder {
  let inner: FrameEncoder;
  let still: ((rgba: RgbaPixels) => void) | null = null;
  switch (spec.format) {
    case 'apng': {
      const e = new ApngEncoder(spec.options);
      still = (rgba) => e.setStill(rgba);
      inner = e;
      break;
    }
    case 'gif':
      inner = new GifEncoder(spec.options);
      break;
    case 'webp':
      inner = new WebpEncoder(spec.options);
      break;
    case 'png-sequence':
      inner = new PngSequenceEncoder(spec.options);
      break;
    default:
      throw new Error('不支援的格式');
  }
  return {
    addFrame: (rgba, ticks) => inner.addFrame(rgba, ticks),
    finish: () => inner.finish(),
    abort: () => inner.abort(),
    setStill: async (rgba) => {
      still?.(rgba);
    },
  };
}
