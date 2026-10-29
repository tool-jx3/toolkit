/**
 * core/audio/ambience：程式合成的環境音（ambience-mixer 引入時新增）。
 *
 * - 目錄（`catalog.ts`）：分類、24 種聲音的定義與參數（雨、雷、風、海浪、溪流、水滴、營火、時鐘、心跳、蟲鳴、人聲、雜訊…），
 *   參數的預設值與整理。
 * - 合成（`render.ts`，純函式）：`renderAmbience(id, params, { duration, sampleRate, seed })` → 首尾相接的 PcmAudio
 *   （同樣的輸入每次一樣；Node 也能跑）。零件在 `dsp.ts`（雜訊、濾波器、共振器、隨機曲線、殘響，都以環狀處理）。
 * - 執行者（`client.ts`）：Worker 裡合成（不能用時在主執行緒）。
 * - 循環（`loop.ts`，純函式）：音檔做成循環（交叉淡化）、只播一次、鋪滿匯出的長度、柔和限幅的曲線、音量換算、WAV 大小。
 * - 播放（`mixer.ts`，瀏覽器）：多軌循環混音、起伏、總音量、播放／暫停的淡入淡出。
 * - 匯出（`offline.ts`，瀏覽器）：OfflineAudioContext 混成一段可以無縫循環的音訊（節點與預覽相同）。
 *
 * ```ts
 * const pcm = renderAmbience('rain-light', { intensity: 60 }, { duration: 60, sampleRate: 32000, seed: 1 });
 * mixer.setTrack('rain', { buffer: pcmToAudioBuffer(pcm), gain: volumeGain(70), swell: false, mode: 'loop' });
 * const mix = await renderLoopMix([{ pcm, gain: volumeGain(70), swell: false }], { seconds: 60, sampleRate: 32000, channels: 2, master: 1 });
 * downloadBlob(wavBlob(mix), '環境音.wav');
 * ```
 */
export {
  AMBIENCE_CATEGORIES,
  AMBIENCE_SOUND_IDS,
  AMBIENCE_SOUNDS,
  ambienceSound,
  defaultParams,
  isAmbienceSoundId,
  isDefaultParams,
  sanitizeParams,
  soundsInCategory,
} from './catalog';
export { type AmbienceRenderer, createAmbienceRenderer } from './client';
export {
  crossfadeLoop,
  peakDb,
  placeOnce,
  SOFT_CLIP_INPUT_SCALE,
  SOFT_CLIP_THRESHOLD,
  softClip,
  softClipCurve,
  tileLoop,
  volumeGain,
  wavBytes,
  withFades,
} from './loop';
export {
  createLoopMixer,
  type LoopMixer,
  type LoopTrackSpec,
  PLAY_FADE,
  pcmToAudioBuffer,
  SWELL_MIN,
  SWELL_PERIOD,
  swellLevels,
} from './mixer';
export {
  canRenderOffline,
  type OfflineMixOptions,
  type OfflineMixTrack,
  renderLoopMix,
} from './offline';
export {
  AMBIENCE_MAX_SECONDS,
  AMBIENCE_MIN_SECONDS,
  type AmbienceRenderOptions,
  ambienceKey,
  ambienceSeconds,
  renderAmbience,
} from './render';
export type {
  AmbienceCategoryId,
  AmbienceChoiceParam,
  AmbienceParam,
  AmbienceParams,
  AmbienceRangeParam,
  AmbienceSoundDef,
  RenderContext,
} from './types';
