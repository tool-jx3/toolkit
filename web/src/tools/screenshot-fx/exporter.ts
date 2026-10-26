/**
 * 匯出（規格 3.9、F45～F51、F62、F64～F66）：PNG、APNG、影片（MP4／透明 WebM）、逐步公開／圖層／連番 PNG 的 ZIP。
 * 流程都在共用的圖片演出引擎（core/imagefx 的 createFxExporter）；這裡綁上截圖演出的框（KIT）、檔名與文字。
 */
import { createFxExporter, sizeBadge as fxSizeBadge } from '@/core/imagefx';
import type { Frame, FxState } from './model';
import { KIT } from './render';
import { S } from './strings';

export {
  type ApngJob,
  detectVideoMode,
  ensureCreditFont,
  formatSize,
  setForceRealtime,
  type VideoMode,
  videoBitrate,
} from '@/core/imagefx';

export const exporter = createFxExporter<Frame, FxState>(KIT, 'screenshot-fx', S);

export const {
  finalPng,
  exportPng,
  exportApng,
  exportVideo,
  exportSteps,
  exportLayers,
  exportSequence,
} = exporter;

/** 試算大小的徽章 */
export const sizeBadge = (bytes: number) => fxSizeBadge(bytes, S);
