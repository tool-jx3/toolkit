/**
 * core/timeline：緩動曲線、時間軸、決定性亂數、逐格渲染介面與匯出流程。
 */
export {
  EASE,
  EASING_CHOICES,
  type EasingFn,
  type EasingName,
  getEasing,
  reverseEasing,
} from './easing';
export {
  type AnimationExportFormat,
  createFrameCanvas,
  DEFAULT_MAX_FRAMES,
  drawFrame,
  EXPORT_FORMATS,
  type ExportAnimationOptions,
  type ExportFormatInfo,
  type ExportResult,
  exportAnimation,
  exportSize,
} from './export';
export { createRandom, hash, hashSigned, hashUnit, type Random, seedOf, timeSlot } from './random';
export type { AnimationSource, Ctx2D } from './source';
export {
  buildSegments,
  clamp,
  clamp01,
  formatSeconds,
  frameCount,
  frameTime,
  lerp,
  progress,
  remap,
  segmentAt,
  segmentsDuration,
  type TimelineSegment,
} from './timeline';
