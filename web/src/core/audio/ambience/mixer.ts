/**
 * 循環混音的播放（瀏覽器的 Web Audio）：好幾軌一直循環的聲音，各自的音量、起伏，總音量，播放／暫停時淡入淡出。
 *
 * ```ts
 * const mixer = createLoopMixer();
 * mixer.setTrack('rain', { buffer: pcmToAudioBuffer(pcm), gain: 0.5, swell: false, mode: 'loop' });
 * await mixer.play();          // 要在使用者的操作（點擊、按鍵）裡呼叫：瀏覽器規定有操作之後才能出聲
 * mixer.setMaster(0.8);
 * await mixer.pause();         // 淡出後暫停（AudioContext 暫停，不佔 CPU）
 * ```
 *
 * - 換掉一軌的聲音（參數改了、重新合成）時，新舊交叉淡化 0.3 秒，接在同一個位置繼續（不會從頭開始）。
 * - 「只播一次」的軌（mode: 'once'）每次按播放從頭播一次。
 * - 起伏：音量以 10 秒為週期在 40%～100% 之間慢慢起伏（匯出時也一樣，`offline.ts`）。
 * - 主輸出經過柔和限幅（`loop.ts` 的 softClipCurve），很多軌開很大聲也不會破音。
 * - AudioContext 在第一次 play() 時才建立；之前設定的軌都記著，建立時一起接上。
 */
import type { PcmAudio } from '../pcm';
import { SOFT_CLIP_INPUT_SCALE, softClipCurve } from './loop';

export interface LoopTrackSpec {
  /** 聲音（null：還在準備，先不出聲） */
  buffer: AudioBuffer | null;
  /** 線性增益 */
  gain: number;
  /** 音量慢慢起伏 */
  swell: boolean;
  /** loop：一直循環；once：每次按播放從頭播一次 */
  mode: 'loop' | 'once';
  /**
   * 循環時只循環前面這麼多秒（選填；不給時整段）：大音檔原地做好接縫的交叉淡化之後，不必再複製一份比較短的
   * （`loop.ts` 的 crossfadeLoopInPlace）。
   */
  loopEnd?: number;
}

export interface LoopMixer {
  readonly playing: boolean;
  readonly context: AudioContext | null;
  /** 新增或更新一軌（buffer 換了就交叉淡化） */
  setTrack(id: string, spec: LoopTrackSpec): void;
  removeTrack(id: string): void;
  /** 目前的軌 id */
  trackIds(): string[];
  /** 總音量（線性增益） */
  setMaster(gain: number): void;
  /** 播放（淡入）；要在使用者的操作裡呼叫 */
  play(): Promise<void>;
  /** 暫停（淡出 fadeSeconds 秒後 AudioContext 暫停） */
  pause(fadeSeconds?: number): Promise<void>;
  /** 主輸出目前的音量（均方根，0～1；測試與音量表用） */
  level(): number;
  /** 播放狀態改變時通知；回傳取消 */
  subscribe(fn: () => void): () => void;
  dispose(): void;
}

/** 起伏的週期（秒）與最小音量；匯出（offline.ts）也用這兩個值，所以匯出的長度要是週期的整數倍 */
export const SWELL_PERIOD = 10;
export const SWELL_MIN = 0.4;
/** 播放／暫停的淡入淡出（秒；moodist 也是 0.25 秒） */
export const PLAY_FADE = 0.25;
/** 換掉聲音時的交叉淡化（秒） */
const SWAP_FADE = 0.3;

type AudioCtxCtor = new (options?: AudioContextOptions) => AudioContext;

/** PcmAudio → AudioBuffer（不需要 AudioContext；直接複製取樣） */
export function pcmToAudioBuffer(pcm: PcmAudio): AudioBuffer {
  const length = Math.max(1, pcm.channels[0]?.length ?? 1);
  const buf = new AudioBuffer({
    length,
    numberOfChannels: Math.max(1, pcm.channels.length),
    sampleRate: pcm.sampleRate,
  });
  pcm.channels.forEach((ch, i) => {
    buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i);
  });
  return buf;
}

/** 起伏的節點：增益的基準＝(1 + min) ÷ 2，正弦的振幅＝(1 − min) ÷ 2 */
export function swellLevels(on: boolean): { base: number; depth: number } {
  return on ? { base: (1 + SWELL_MIN) / 2, depth: (1 - SWELL_MIN) / 2 } : { base: 1, depth: 0 };
}

interface Voice {
  src: AudioBufferSourceNode;
  fade: GainNode;
  /** 這個來源「播放位置 0」對應的 AudioContext 時間 */
  origin: number;
}

interface Track {
  spec: LoopTrackSpec;
  vol: GainNode | null;
  swell: GainNode | null;
  depth: GainNode | null;
  lfo: OscillatorNode | null;
  voice: Voice | null;
}

export function createLoopMixer(): LoopMixer {
  let ctx: AudioContext | null = null;
  let playFade: GainNode | null = null;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let masterGain = 1;
  let playing = false;
  let token = 0;
  const tracks = new Map<string, Track>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const fn of [...listeners]) fn();
  };

  const ensure = (): AudioContext => {
    if (ctx) return ctx;
    const g = globalThis as unknown as {
      AudioContext?: AudioCtxCtor;
      webkitAudioContext?: AudioCtxCtor;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) throw new Error('這個瀏覽器不支援音訊播放。');
    const c = new Ctor();
    ctx = c;
    playFade = c.createGain();
    playFade.gain.value = 0;
    master = c.createGain();
    master.gain.value = masterGain;
    const pre = c.createGain();
    pre.gain.value = SOFT_CLIP_INPUT_SCALE;
    const shaper = c.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = 'none';
    analyser = c.createAnalyser();
    analyser.fftSize = 2048;
    playFade.connect(master);
    master.connect(pre);
    pre.connect(shaper);
    shaper.connect(analyser);
    analyser.connect(c.destination);
    for (const [, t] of tracks) build(t);
    /* 切到別的分頁再回來時，瀏覽器可能把 AudioContext 暫停了（手機常見）：播放中就恢復 */
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return c;
  };

  const onVisible = () => {
    if (document.hidden || !playing || !ctx || ctx.state === 'running') return;
    void ctx.resume().catch(() => {});
  };

  /** 這一軌的節點（還沒有就建立） */
  const build = (t: Track) => {
    if (!ctx || !playFade || t.vol) return;
    const c = ctx;
    t.vol = c.createGain();
    t.vol.gain.value = t.spec.gain;
    t.swell = c.createGain();
    t.depth = c.createGain();
    t.lfo = c.createOscillator();
    t.lfo.frequency.value = 1 / SWELL_PERIOD;
    const s = swellLevels(t.spec.swell);
    t.swell.gain.value = s.base;
    t.depth.gain.value = s.depth;
    t.lfo.connect(t.depth);
    t.depth.connect(t.swell.gain);
    t.vol.connect(t.swell);
    t.swell.connect(playFade);
    t.lfo.start();
    if (t.spec.buffer && t.spec.mode === 'loop') startVoice(t, t.spec.buffer, 0, 0);
  };

  const stopVoice = (v: Voice | null, fade: number) => {
    if (!v || !ctx) return;
    const now = ctx.currentTime;
    v.fade.gain.cancelScheduledValues(now);
    v.fade.gain.setValueAtTime(v.fade.gain.value, now);
    v.fade.gain.linearRampToValueAtTime(0, now + fade);
    try {
      v.src.stop(now + fade + 0.02);
    } catch {
      /* 已經停了 */
    }
    v.src.onended = () => {
      v.src.disconnect();
      v.fade.disconnect();
    };
  };

  /** 開始播放 buffer（從 offset 秒開始，淡入 fade 秒） */
  const startVoice = (t: Track, buffer: AudioBuffer, offset: number, fade: number) => {
    if (!ctx || !t.vol) return;
    const c = ctx;
    const now = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = t.spec.mode === 'loop';
    const period = loopPeriod(t.spec, buffer);
    if (src.loop && period < buffer.duration) {
      src.loopStart = 0;
      src.loopEnd = period;
    }
    const f = c.createGain();
    if (fade > 0) {
      f.gain.setValueAtTime(0, now);
      f.gain.linearRampToValueAtTime(1, now + fade);
    }
    src.connect(f);
    f.connect(t.vol);
    const off = period > 0 ? offset % period : 0;
    src.start(now, off);
    const v: Voice = { src, fade: f, origin: now - off };
    src.onended = () => {
      if (t.voice === v) t.voice = null;
    };
    t.voice = v;
  };

  /** 循環的長度（秒） */
  const loopPeriod = (spec: LoopTrackSpec, buffer: AudioBuffer) =>
    spec.loopEnd && spec.loopEnd > 0 ? Math.min(buffer.duration, spec.loopEnd) : buffer.duration;

  /** 目前的播放位置（秒） */
  const position = (t: Track): number => {
    if (!ctx || !t.voice) return 0;
    return Math.max(0, ctx.currentTime - t.voice.origin);
  };

  const setTrack = (id: string, spec: LoopTrackSpec) => {
    let t = tracks.get(id);
    if (!t) {
      t = { spec, vol: null, swell: null, depth: null, lfo: null, voice: null };
      tracks.set(id, t);
      build(t);
      return;
    }
    const prev = t.spec;
    t.spec = spec;
    if (!ctx || !t.vol || !t.swell || !t.depth) return;
    const now = ctx.currentTime;
    if (prev.gain !== spec.gain) t.vol.gain.setTargetAtTime(spec.gain, now, 0.03);
    if (prev.swell !== spec.swell) {
      const s = swellLevels(spec.swell);
      t.swell.gain.setTargetAtTime(s.base, now, 0.3);
      t.depth.gain.setTargetAtTime(s.depth, now, 0.3);
    }
    if (prev.buffer !== spec.buffer || prev.mode !== spec.mode || prev.loopEnd !== spec.loopEnd) {
      const pos = position(t);
      stopVoice(t.voice, SWAP_FADE);
      t.voice = null;
      if (spec.buffer && spec.mode === 'loop') {
        startVoice(
          t,
          spec.buffer,
          prev.buffer && prev.mode === 'loop' ? pos : 0,
          prev.buffer ? SWAP_FADE : 0.05,
        );
      } else if (spec.buffer && spec.mode === 'once' && playing) {
        startVoice(t, spec.buffer, 0, 0.02);
      }
    }
  };

  const removeTrack = (id: string) => {
    const t = tracks.get(id);
    if (!t) return;
    tracks.delete(id);
    if (!ctx) return;
    stopVoice(t.voice, 0.25);
    const { vol, swell, depth, lfo } = t;
    vol?.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
    window.setTimeout(() => {
      try {
        lfo?.stop();
      } catch {
        /* 已經停了 */
      }
      lfo?.disconnect();
      depth?.disconnect();
      vol?.disconnect();
      swell?.disconnect();
    }, 400);
  };

  const mixer: LoopMixer = {
    get playing() {
      return playing;
    },
    get context() {
      return ctx;
    },
    setTrack,
    removeTrack,
    trackIds: () => [...tracks.keys()],
    setMaster(g) {
      masterGain = Math.max(0, g);
      if (ctx && master) master.gain.setTargetAtTime(masterGain, ctx.currentTime, 0.03);
    },
    async play() {
      const c = ensure();
      const my = ++token;
      if (c.state !== 'running') await c.resume().catch(() => {});
      if (my !== token || !playFade) return;
      /* 只播一次的軌從頭開始 */
      for (const [, t] of tracks) {
        if (t.spec.mode === 'once' && t.spec.buffer) {
          stopVoice(t.voice, 0.05);
          t.voice = null;
          startVoice(t, t.spec.buffer, 0, 0.02);
        }
      }
      const now = c.currentTime;
      playFade.gain.cancelScheduledValues(now);
      playFade.gain.setValueAtTime(playFade.gain.value, now);
      playFade.gain.linearRampToValueAtTime(1, now + PLAY_FADE);
      playing = true;
      emit();
    },
    async pause(fadeSeconds = PLAY_FADE) {
      const was = playing;
      playing = false;
      const my = ++token;
      if (was) emit();
      const c = ctx;
      if (!c || !playFade) return;
      const now = c.currentTime;
      playFade.gain.cancelScheduledValues(now);
      playFade.gain.setValueAtTime(playFade.gain.value, now);
      playFade.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fadeSeconds));
      await new Promise((r) => window.setTimeout(r, Math.max(0.01, fadeSeconds) * 1000 + 60));
      if (my === token && c.state === 'running') await c.suspend().catch(() => {});
    },
    level() {
      if (!analyser) return 0;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let s = 0;
      for (let i = 0; i < data.length; i++) s += data[i] * data[i];
      return Math.sqrt(s / data.length);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    dispose() {
      token++;
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', onVisible);
      playing = false;
      for (const id of [...tracks.keys()]) removeTrack(id);
      listeners.clear();
      void ctx?.close().catch(() => {});
      ctx = null;
      playFade = null;
      master = null;
      analyser = null;
    },
  };
  return mixer;
}
