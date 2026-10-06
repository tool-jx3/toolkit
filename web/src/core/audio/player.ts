/**
 * 音樂播放（瀏覽器的 Web Audio；music-frame 移植時新增）：解碼後保留 AudioBuffer，播放、暫停、跳轉、目前時間，
 * 播放的聲音經過 AnalyserNode（預覽的頻譜與波形）再到喇叭；另有給錄影用的 MediaStream 出口與喇叭音量（錄影時靜音）。
 *
 * ```ts
 * const player = createAudioPlayer();
 * const pcm = await player.load(file);          // PcmAudio（直接是 AudioBuffer 的聲道，不另外複製）
 * await player.play();                           // 從目前位置播放（播完停在結尾；在結尾按播放從頭）
 * player.seek(30); player.pause(); player.time();
 * player.analyser?.getByteFrequencyData(freq);   // 頻譜（fftSize 2048、平滑 0.75）
 * const off = player.subscribe(() => render());  // 播放／暫停／播完／載入時通知
 * ```
 *
 * AudioContext 在第一次 load() 時才建立（開頁不會先佔用音訊裝置）；瀏覽器要求使用者操作後才能出聲，play() 會先 resume。
 */
import { AudioDecodeError, type PcmAudio, resample } from './pcm';

type AudioCtxCtor = new (options?: AudioContextOptions) => AudioContext;

export interface AudioPlayerOptions {
  /** AnalyserNode 的 FFT 大小（預設 2048） */
  fftSize?: number;
  /** AnalyserNode 的平滑（預設 0.75） */
  smoothingTimeConstant?: number;
}

export interface AudioPlayer {
  /** 已載入的音樂（沒有時 null） */
  readonly buffer: AudioBuffer | null;
  /** 總長（秒；沒有音樂時 0） */
  readonly duration: number;
  readonly playing: boolean;
  /** 預覽的頻譜分析（第一次載入前是 null） */
  readonly analyser: AnalyserNode | null;
  readonly context: AudioContext | null;
  /** 目前時間（秒） */
  time(): number;
  /** 解碼並換成這首（停止目前的播放、回到 0）；失敗丟 AudioDecodeError（訊息可直接顯示） */
  load(data: Blob | ArrayBuffer): Promise<PcmAudio>;
  /** 拿掉音樂 */
  unload(): void;
  /** 從 from（預設目前位置；在結尾時從 0）播放 */
  play(from?: number): Promise<void>;
  pause(): void;
  /** 跳到 t 秒（播放中就從那裡接著播） */
  seek(t: number): void;
  /** 喇叭的音量（0＝靜音；不影響分析與錄影的聲音） */
  setMonitorVolume(v: number): void;
  /** 錄影用的聲音出口（播放的聲音也送到這裡） */
  recordingStream(): MediaStream | null;
  /** 狀態改變（播放、暫停、播完、載入、拿掉）時通知；回傳取消訂閱 */
  subscribe(fn: () => void): () => void;
  /** 關閉 AudioContext */
  dispose(): void;
}

/** AudioBuffer 的聲道（不複製）→ PcmAudio */
export function pcmFromAudioBuffer(buf: AudioBuffer): PcmAudio {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
  return { sampleRate: buf.sampleRate, channels };
}

export function createAudioPlayer({
  fftSize = 2048,
  smoothingTimeConstant = 0.75,
}: AudioPlayerOptions = {}): AudioPlayer {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let monitor: GainNode | null = null;
  let recDest: MediaStreamAudioDestinationNode | null = null;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let playing = false;
  let offset = 0;
  let startAt = 0;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const fn of [...listeners]) fn();
  };

  const ensureContext = (): AudioContext => {
    if (ctx) return ctx;
    const g = globalThis as unknown as {
      AudioContext?: AudioCtxCtor;
      webkitAudioContext?: AudioCtxCtor;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) throw new AudioDecodeError('這個瀏覽器不支援音訊處理。');
    ctx = new Ctor();
    analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothingTimeConstant;
    monitor = ctx.createGain();
    analyser.connect(monitor);
    monitor.connect(ctx.destination);
    try {
      recDest = ctx.createMediaStreamDestination();
    } catch {
      recDest = null;
    }
    return ctx;
  };

  const stopSource = () => {
    const s = source;
    if (!s) return;
    source = null;
    s.onended = null;
    try {
      s.stop();
    } catch {
      /* 已經停了 */
    }
    s.disconnect();
  };

  const time = (): number => {
    if (!buffer || !ctx) return 0;
    return playing ? Math.min(buffer.duration, ctx.currentTime - startAt) : offset;
  };

  const start = (from: number) => {
    if (!ctx || !buffer || !analyser) return;
    stopSource();
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(analyser);
    if (recDest) s.connect(recDest);
    s.onended = () => {
      if (source !== s || !buffer) return;
      source = null;
      playing = false;
      offset = buffer.duration;
      emit();
    };
    startAt = ctx.currentTime - from;
    s.start(0, from);
    source = s;
    playing = true;
  };

  const player: AudioPlayer = {
    get buffer() {
      return buffer;
    },
    get duration() {
      return buffer?.duration ?? 0;
    },
    get playing() {
      return playing;
    },
    get analyser() {
      return analyser;
    },
    get context() {
      return ctx;
    },
    time,
    async load(data) {
      const c = ensureContext();
      const bytes = data instanceof ArrayBuffer ? data.slice(0) : await data.arrayBuffer();
      let decoded: AudioBuffer;
      try {
        decoded = await new Promise<AudioBuffer>((resolve, reject) => {
          /* 舊版 Safari 只有回呼形式 */
          const p = c.decodeAudioData(bytes, resolve, reject);
          if (p && typeof (p as Promise<AudioBuffer>).then === 'function')
            (p as Promise<AudioBuffer>).then(resolve, reject);
        });
      } catch {
        throw new AudioDecodeError();
      }
      if (playing) player.pause();
      stopSource();
      buffer = decoded;
      offset = 0;
      playing = false;
      emit();
      return pcmFromAudioBuffer(decoded);
    },
    unload() {
      stopSource();
      buffer = null;
      playing = false;
      offset = 0;
      emit();
    },
    async play(from) {
      if (!buffer) return;
      const c = ensureContext();
      if (c.state === 'suspended') await c.resume().catch(() => {});
      let t = from ?? offset;
      if (from === undefined && t >= buffer.duration - 0.05) t = 0;
      start(Math.max(0, Math.min(buffer.duration, t)));
      emit();
    },
    pause() {
      if (!buffer) return;
      offset = time();
      stopSource();
      const was = playing;
      playing = false;
      if (was) emit();
    },
    seek(t) {
      if (!buffer) return;
      const c = Math.max(0, Math.min(buffer.duration, t));
      if (playing) start(c);
      else offset = c;
      emit();
    },
    setMonitorVolume(v) {
      if (monitor) monitor.gain.value = Math.max(0, v);
    },
    recordingStream: () => recDest?.stream ?? null,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    dispose() {
      stopSource();
      listeners.clear();
      void ctx?.close?.().catch(() => {});
      ctx = null;
      analyser = null;
      monitor = null;
      recDest = null;
      buffer = null;
      playing = false;
    },
  };
  return player;
}

/**
 * 換取樣率（給編碼器要求的取樣率用）：有 OfflineAudioContext 時用瀏覽器的重新取樣（品質較好），
 * 否則用線性內插（core/audio 的 resample）。聲道數不變。
 */
export async function resampleAudio(pcm: PcmAudio, sampleRate: number): Promise<PcmAudio> {
  if (pcm.sampleRate === sampleRate) return pcm;
  const g = globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext };
  const len = pcm.channels[0]?.length ?? 0;
  if (g.OfflineAudioContext && len > 0) {
    try {
      const nch = Math.max(1, pcm.channels.length);
      const oc = new g.OfflineAudioContext(
        nch,
        Math.ceil((len / pcm.sampleRate) * sampleRate),
        sampleRate,
      );
      const src = oc.createBuffer(nch, len, pcm.sampleRate);
      pcm.channels.forEach((ch, i) => {
        src.getChannelData(i).set(ch);
      });
      const node = oc.createBufferSource();
      node.buffer = src;
      node.connect(oc.destination);
      node.start();
      return pcmFromAudioBuffer(await oc.startRendering());
    } catch {
      /* 改用線性內插 */
    }
  }
  return resample(pcm, sampleRate);
}
