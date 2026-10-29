/**
 * 匯出：用 OfflineAudioContext 把好幾軌首尾相接的聲音混成一段可以無縫循環的音訊（瀏覽器）。
 * 混音的節點和預覽（mixer.ts）相同：每軌的音量、起伏（10 秒週期）、總音量、柔和限幅。
 *
 * 每一軌都要已經是長度剛好 seconds 秒（或它的因數）的循環（合成的聲音本來就是；使用者的音檔先用 `loop.ts`
 * 的 tileLoop／placeOnce 整理）；這裡多算前面 warm 秒、丟掉，取剛好一個週期，所以結尾接回開頭是連續的。
 */
import type { PcmAudio } from '../pcm';
import { SOFT_CLIP_INPUT_SCALE, softClipCurve } from './loop';
import { pcmToAudioBuffer, SWELL_PERIOD, swellLevels } from './mixer';

export interface OfflineMixTrack {
  /** 首尾相接、長度是 seconds 秒（或它的因數）的聲音 */
  pcm: PcmAudio;
  /** 線性增益 */
  gain: number;
  swell: boolean;
}

export interface OfflineMixOptions {
  /** 秒數（起伏的週期 10 秒，有起伏的軌時要是 10 的倍數才會首尾相接） */
  seconds: number;
  sampleRate: number;
  /** 1＝單聲道（左右平均）、2＝立體聲 */
  channels: 1 | 2;
  /** 總音量（線性增益） */
  master: number;
  /** 前面多算幾秒再丟掉（預設 2） */
  warm?: number;
}

export function canRenderOffline(): boolean {
  return typeof OfflineAudioContext !== 'undefined' && typeof AudioBuffer !== 'undefined';
}

export async function renderLoopMix(
  tracks: readonly OfflineMixTrack[],
  o: OfflineMixOptions,
): Promise<PcmAudio> {
  const warm = o.warm ?? 2;
  const rate = Math.round(o.sampleRate);
  const len = Math.round(o.seconds * rate);
  const warmLen = Math.round(warm * rate);
  const oc = new OfflineAudioContext(o.channels, len + warmLen, rate);
  const master = oc.createGain();
  master.gain.value = Math.max(0, o.master);
  const pre = oc.createGain();
  pre.gain.value = SOFT_CLIP_INPUT_SCALE;
  const shaper = oc.createWaveShaper();
  shaper.curve = softClipCurve();
  shaper.oversample = 'none';
  master.connect(pre);
  pre.connect(shaper);
  shaper.connect(oc.destination);
  for (const t of tracks) {
    if (!(t.gain > 0) || !t.pcm.channels.length) continue;
    const src = oc.createBufferSource();
    src.buffer = pcmToAudioBuffer(t.pcm);
    src.loop = true;
    const vol = oc.createGain();
    vol.gain.value = t.gain;
    src.connect(vol);
    let out: AudioNode = vol;
    if (t.swell) {
      const s = swellLevels(true);
      const swell = oc.createGain();
      swell.gain.value = s.base;
      const depth = oc.createGain();
      depth.gain.value = s.depth;
      const lfo = oc.createOscillator();
      lfo.frequency.value = 1 / SWELL_PERIOD;
      lfo.connect(depth);
      depth.connect(swell.gain);
      vol.connect(swell);
      out = swell;
      lfo.start(0);
    }
    out.connect(master);
    src.start(0);
  }
  const rendered = await oc.startRendering();
  const channels: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    channels.push(rendered.getChannelData(c).slice(warmLen, warmLen + len));
  }
  return { sampleRate: rate, channels };
}
