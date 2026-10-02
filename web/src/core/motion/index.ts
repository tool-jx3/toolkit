/**
 * core/motion：圖片動態與結尾消失演出（G2）。
 *
 * - 圖片動態（動態背景）：`coverPlacement`、`drawImageMotion`（蓋滿＋位移縮放旋轉＋固定像素的額外放大）、
 *   `overlayAmount`／`fillOverlay`（轉白、轉黑）、`waveOffset`／`drawWave`（水平細帶水波）、
 *   `fadeLayers`／`drawFade`（顏色或透明淡化）、`sequencePosition`／`drawSwitch`／`crossfadeScales`（多張交叉溶接、硬切、擦除）。
 * - 結尾消失演出（讀取動畫）：`vanishState`、`vanishLayout`（純函式，可測）、`drawVanish`。
 */
export {
  bleedScale,
  type CoverPlacement,
  type Ctx2D,
  coverPlacement,
  crossfadeScales,
  drawFade,
  drawImageMotion,
  drawSwitch,
  drawWave,
  type FadeLayers,
  fadeCurve,
  fadeLayers,
  fillOverlay,
  type ImageMotion,
  overlayAmount,
  type SequencePosition,
  type SizedImage,
  type SwitchMode,
  type SwitchOptions,
  sequencePosition,
  type WaveOptions,
  waveOffset,
} from './image';
export {
  drawVanish,
  VANISH_KINDS,
  type VanishBand,
  type VanishKind,
  type VanishLayout,
  type VanishOptions,
  type VanishParticle,
  type VanishPiece,
  type VanishState,
  vanishLayout,
  vanishState,
} from './vanish';
