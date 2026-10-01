/**
 * core/timeline：緩動曲線、時間軸、決定性亂數、逐格渲染介面與匯出流程。
 */

export {
  CURVE_NAMES,
  CURVES,
  type CurveName,
  getCurve,
  type IrregularCurveOptions,
  irregularCurve,
  NON_MONOTONIC_CURVES,
  smootherstep,
  smoothstep,
  stepsCurve,
} from './curves';
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
  type BatchExportItem,
  type CropRect,
  createFrameCanvas,
  DEFAULT_MAX_FRAMES,
  drawFrame,
  EXPORT_FORMATS,
  type ExportAnimationOptions,
  type ExportFormatInfo,
  type ExportResult,
  exportAnimation,
  exportAnimationBatch,
  exportSize,
  type SequenceInfoMeta,
} from './export';
export {
  type FrameSpec,
  frameIndexAt,
  frameRenderTimes,
  frameStartTimes,
  frameTable,
  frameTableDuration,
  frameTableTicks,
  gifDelaysCs,
  uniformFrames,
} from './frames';
export {
  canAddKeyframe,
  canRemoveKeyframe,
  evaluateKeyframes,
  insertKeyframe,
  type Keyframe,
  type KeyframeRules,
  keyframesDuration,
  keyframesSummary,
  normalizeKeyframes,
  removeKeyframe,
} from './keyframes';
export {
  type FbmOptions,
  fbm2,
  type LoopNoiseOptions,
  loopNoise,
  loopNoise2,
  valueNoise2,
} from './noise';
export { createRandom, hash, hashSigned, hashUnit, type Random, seedOf, timeSlot } from './random';
export {
  actionFrameCount,
  type ExportEstimate,
  estimateExport,
  type SampledFrame,
  type SampledFramesOptions,
  type SequenceSourceOptions,
  sampledFrames,
  sampleProgress,
  sequenceSource,
  splitDurationMs,
  type TransitionFrame,
  type TransitionFramesOptions,
  transitionFrames,
} from './sampling';
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
