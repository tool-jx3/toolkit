/**
 * core/transition：遮罩式轉場引擎（到達先後圖＋256 項查表）。
 *
 * ```ts
 * import { buildArrivalMap, drawTransition } from '@/core/transition';
 * const map = buildArrivalMap('wave', 480, 270, { direction: 'right', count: 3, strength: 40, wave: 'sine' });
 * drawTransition(ctx, map, { progress: smoothstep(t), mode: 'cover', softness: 20, color: '#000000' });
 * ```
 *
 * 規則與 scene-transition 規格 3.3～3.6 相同（附件 scene-transition.effects.json 有單元測試）。
 * 旋轉合攏（rotate）的線跟著動作旋轉：每一格用 `angle` 重建（isDynamicShape）。
 */
export {
  type ArrivalMap,
  type ArrivalParams,
  buildArrivalMap,
  type CellOrder,
  type ClockKind,
  DIRECTIONS,
  type Direction8,
  type FigureKind,
  type GridCell,
  isDynamicShape,
  SHAPE_COUNT_RANGE,
  shapeParams,
  TRANSITION_SHAPES,
  type TransitionShape,
  type WaveForm,
} from './arrival';
export {
  alternatingColorIndex,
  applyTransitionLut,
  coverAmount,
  drawTransition,
  glowStrength,
  type RgbInput,
  renderTransition,
  type TransitionLook,
  type TransitionLut,
  type TransitionMode,
  transitionLut,
} from './render';
