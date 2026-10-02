/**
 * core/encode：PNG、APNG、GIF、動畫 WebP、連番 PNG（ZIP）與減色。
 *
 * 一般用法是透過 `createEncoder()`（自動放進 Worker）或更上層的 `exportAnimation()`（core/timeline）。
 */
export { ApngEncoder, type ApngEncoderOptions, apngDelay } from './apng';
export {
  type CreateEncoderOptions,
  createEncoder,
  encodePngAsync,
  encodePngColorsAsync,
  openEncodeWorker,
} from './client';
export {
  copyRect,
  diffRect,
  type EncodedFile,
  type EncodeFormat,
  EncodeLimitError,
  type FrameEncoder,
  MAX_PLAYS,
  pasteRect,
  type Rect,
  type RgbaPixels,
  toU32,
} from './frames';
export {
  GIF_MAX_FPS,
  GifEncoder,
  type GifEncoderOptions,
  gifAlphaThresholdInclusive,
  gifRepeat,
} from './gif';
export { createLocalEncoder, type Encoder, type EncoderSpec } from './local';
export {
  buildPalette,
  ColorStats,
  type Palette,
  type PaletteMethod,
  principalAxis,
} from './palette';
export {
  type ApngFrame,
  assembleApng,
  chunk,
  concat,
  crc32,
  type DeflateMode,
  encodePng,
  PNG_SIGNATURE,
  zlib,
} from './png';
export { PngSequenceEncoder, type PngSequenceOptions } from './sequence';
export { encodePngColors, type StillPngResult } from './still';
export {
  assembleAnimatedWebp,
  canvasWebpEncoder,
  frameBitstream,
  parseWebp,
  supportsWebpEncoding,
  WebpEncoder,
  type WebpEncoderOptions,
} from './webp';
