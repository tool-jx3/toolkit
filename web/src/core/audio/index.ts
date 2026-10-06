/**
 * core/audio：解碼使用者上傳的音效、依時間點離線混音（可疊加或不疊音、淡出）、產生靜音、編碼 PCM 16-bit WAV（`pcm.ts`）；
 * 聲音分析：離線頻譜、整首的波形峰值、對數頻帶、低頻能量、檔頭判斷（`analysis.ts`）；
 * 音樂播放：Web Audio 的播放、暫停、跳轉、AnalyserNode、錄影用的聲音出口（`player.ts`）。
 *
 * 音訊一律以 PcmAudio（每個聲道一條 Float32Array，−1～1）表示；除了解碼與播放，其餘都是純函式（Node 也能跑）。
 *
 * ```ts
 * const clip = await decodeAudio(file);
 * const times = steps.map((_, k) => k / fps);
 * const mixed = mixAtTimes(clip, skipOverlapping(times, pcmDuration(clip)), { duration: 2.5, fade: { start: 2.3, end: 2.5 } });
 * downloadBlob(wavBlob(mixed), 'sound.wav');
 *
 * const analyser = createOfflineAnalyser(song, { fps: 30 });   // 離線逐格：analyser.at(t) → analyser.frequency
 * const peaks = waveformPeaks(song, 220);
 * ```
 */
export {
  AUDIO_FILE_INFO,
  type AudioFileType,
  bandAverage,
  blackmanWindow,
  createOfflineAnalyser,
  detectAudioType,
  fftInPlace,
  logFrequencyBands,
  type OfflineAnalyser,
  type OfflineAnalyserOptions,
  waveformPeaks,
} from './analysis';
export {
  AudioDecodeError,
  applyFadeOut,
  canDecodeAudio,
  createSilence,
  decodeAudio,
  encodeWav,
  type MixOptions,
  mixAtTimes,
  type PcmAudio,
  parseWav,
  pcmDuration,
  pcmLength,
  resample,
  skipOverlapping,
  wavBlob,
} from './pcm';
export {
  type AudioPlayer,
  type AudioPlayerOptions,
  createAudioPlayer,
  pcmFromAudioBuffer,
  resampleAudio,
} from './player';
