/**
 * 攝影機（臉部追蹤）與麥克風（音量）。參考原作 Anime2.5DRig（MIT）的 devices.js 改寫：
 * 準備中也能關掉，晚到的權限立刻釋放；取樣用 Worker 的計時器（視窗被蓋住時主執行緒的計時器會被放慢到 1 Hz）。
 */
import type { Landmark } from './faceFeatures';
import { PREVIEW_POINTS } from './faceFeatures';
import type { FaceDetector } from './faceLandmarker';
import { S } from './strings';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/* ---------- Worker 計時器 ---------- */

export interface Ticker {
  stop(): void;
}

/** 每 ms 毫秒呼叫一次 fn（Worker 的計時器；不能開 Worker 時退回 setTimeout） */
export function createTicker(ms: number, fn: () => void): Ticker {
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const loop = () => {
    if (stopped) return;
    fn();
    timer = setTimeout(loop, ms);
  };
  try {
    const src =
      'let t=null;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data);};';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => {
      if (!stopped) fn();
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      if (!stopped) loop();
    };
    worker.postMessage(ms);
  } catch {
    worker = null;
  }
  if (!worker) timer = setTimeout(loop, ms);
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (worker) {
        worker.postMessage(0);
        worker.terminate();
        worker = null;
      }
    },
  };
}

/* ---------- 攝影機 ---------- */

export type DeviceStatus = 'loading' | 'on' | 'off' | 'error';

function cameraError(err: unknown): string {
  const n = (err as { name?: string } | null)?.name;
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return S.devErrors.camPermission;
  if (n === 'NotReadableError' || n === 'TrackStartError') return S.devErrors.camBusy;
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return S.devErrors.camNotFound;
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) return S.devErrors.insecure;
  return err instanceof Error ? err.message : String(err);
}

export interface CameraOptions {
  /** 建立臉部偵測器（第一次開時才載入 tasks-vision 與模型） */
  createDetector: () => Promise<FaceDetector>;
  onState: (s: DeviceStatus, message?: string) => void;
  /** 每一格的特徵點（沒有臉時 null）與影片 */
  onResults: (lm: Landmark[] | null, video: HTMLVideoElement) => void;
  /** 小畫面（不顯示時回傳 null） */
  preview: () => HTMLCanvasElement | null;
}

export interface Camera {
  start(): Promise<boolean>;
  stop(quiet?: boolean): void;
  readonly active: boolean;
}

interface CamSession {
  video: HTMLVideoElement;
  stream: MediaStream;
  detector: FaceDetector | null;
  ticker: Ticker | null;
  lastTime: number;
  lastStamp: number;
}

export function createCamera(o: CameraOptions): Camera {
  let gen = 0;
  let session: CamSession | null = null;
  let lastPreview = 0;

  function drawPreview(video: HTMLVideoElement, lm: Landmark[] | null) {
    const c = o.preview();
    if (!c?.isConnected) return;
    const now = performance.now();
    if (now - lastPreview < 60) return;
    lastPreview = now;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    try {
      ctx.drawImage(video, 0, 0, w, h);
    } catch {
      /* 還沒有畫面 */
    }
    if (lm) {
      ctx.fillStyle = '#ff6f91';
      for (const i of PREVIEW_POINTS) {
        const p = lm[i];
        if (p) ctx.fillRect(p.x * w - 1.5, p.y * h - 1.5, 3, 3);
      }
    }
    ctx.restore();
    if (!lm) {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, h - 22, w, 22);
      ctx.fillStyle = '#ffb3c4';
      ctx.font = '12px sans-serif';
      ctx.fillText(S.noFace, 8, h - 7);
    }
  }

  function loop(s: CamSession, token: number) {
    let nextAt = 0;
    const step = () => {
      if (token !== gen || !s.detector) return;
      const v = s.video;
      const t0 = performance.now();
      /* 只處理新的影格；留下至少一半處理時間的空檔（慢的電腦） */
      if (t0 < nextAt || v.readyState < 2 || v.currentTime === s.lastTime) return;
      try {
        s.lastTime = v.currentTime;
        const stamp = Math.max(s.lastStamp + 1, Math.round(t0));
        s.lastStamp = stamp;
        const lm = s.detector.detect(v, stamp);
        drawPreview(v, lm);
        o.onResults(lm, v);
      } catch {
        if (token === gen) {
          stop();
          o.onState('error', S.devErrors.trackingStopped);
        }
      } finally {
        const t1 = performance.now();
        nextAt = t1 + Math.max(8, (t1 - t0) * 0.5);
      }
    };
    s.ticker = createTicker(16, step);
  }

  async function start(): Promise<boolean> {
    const token = ++gen;
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(S.devErrors.insecure);
      o.onState('loading');
      const detector = await o.createDetector();
      if (token !== gen) {
        detector.close();
        return false;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        });
      } catch (e1) {
        const n = (e1 as { name?: string }).name;
        if (n === 'OverconstrainedError' || n === 'ConstraintNotSatisfiedError')
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        else throw e1;
      }
      if (token !== gen) {
        for (const t of stream.getTracks()) t.stop();
        detector.close();
        return false;
      }
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      const s: CamSession = { video, stream, detector, ticker: null, lastTime: -1, lastStamp: 0 };
      session = s;
      await video.play();
      if (token !== gen) return false;
      for (const t of stream.getTracks()) {
        t.addEventListener('ended', () => {
          if (token === gen) {
            stop();
            o.onState('error', S.devErrors.camDisconnected);
          }
        });
      }
      o.onState('on');
      loop(s, token);
      return true;
    } catch (err) {
      if (stream) for (const t of stream.getTracks()) t.stop();
      if (token !== gen) return false;
      stop(true);
      throw new Error(cameraError(err));
    }
  }

  function stop(quiet = false) {
    gen++;
    const s = session;
    session = null;
    if (s) {
      s.ticker?.stop();
      for (const t of s.stream.getTracks()) t.stop();
      try {
        s.video.pause();
      } catch {
        /* 已經停了 */
      }
      s.video.srcObject = null;
      try {
        s.detector?.close();
      } catch {
        /* 已經關了 */
      }
    }
    const c = o.preview();
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    if (!quiet) o.onState('off');
  }

  return {
    start,
    stop,
    get active() {
      return !!session;
    },
  };
}

/* ---------- 麥克風 ---------- */

export interface Mic {
  start(): Promise<boolean>;
  stop(quiet?: boolean): void;
  /** 取一次音量（語音頻帶的能量 → 0～1，靈敏度、噪音閘門、平滑；規格 F63） */
  sample(gain: number, gate: number): number;
  readonly active: boolean;
  /** 最後一次的原始音量（0～1） */
  readonly raw: number;
  readonly level: number;
}

/** 語音頻帶（約 190 Hz～3.7 kHz，FFT 512 的第 2～39 格）的能量 → 0～1 */
export function speechLevel(bins: ArrayLike<number>): number {
  let s = 0;
  for (let i = 2; i < 40; i++) s += bins[i];
  s /= 38 * 255;
  return clamp(s * 3.2, 0, 1);
}

/** 靈敏度與噪音閘門 */
export function gateLevel(raw: number, gain: number, gate: number): number {
  const g = clamp(gate || 0, 0, 0.9);
  return clamp((raw * (gain || 1) - g) / (1 - g), 0, 1);
}

export function createMic(onState: (s: DeviceStatus, message?: string) => void): Mic {
  let gen = 0;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let buf: Uint8Array<ArrayBuffer> | null = null;
  let level = 0;
  let raw = 0;

  async function start(): Promise<boolean> {
    const token = ++gen;
    let st: MediaStream | null = null;
    let ac: AudioContext | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(S.devErrors.insecure);
      onState('loading');
      st = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
      if (token !== gen) {
        for (const t of st.getTracks()) t.stop();
        return false;
      }
      ac = new AudioContext();
      stream = st;
      ctx = ac;
      await ac.resume();
      if (token !== gen) {
        for (const t of st.getTracks()) t.stop();
        if (ac.state !== 'closed') await ac.close();
        return false;
      }
      const src = ac.createMediaStreamSource(st);
      analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      buf = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
      for (const t of st.getTracks()) {
        t.addEventListener('ended', () => {
          if (token === gen) {
            stop(true);
            onState('error', S.devErrors.micDisconnected);
          }
        });
      }
      onState('on');
      return true;
    } catch (err) {
      if (st) for (const t of st.getTracks()) t.stop();
      if (ac && ac.state !== 'closed') ac.close().catch(() => {});
      if (token !== gen) return false;
      stop(true);
      const name = (err as { name?: string } | null)?.name;
      throw new Error(
        name === 'NotAllowedError'
          ? S.devErrors.micPermission
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  }

  function stop(quiet = false) {
    gen++;
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
    analyser = null;
    buf = null;
    level = 0;
    raw = 0;
    if (!quiet) onState('off');
  }

  function sample(gain: number, gate: number): number {
    if (!analyser || !buf) return 0;
    analyser.getByteFrequencyData(buf);
    raw = speechLevel(buf);
    const v = gateLevel(raw, gain, gate);
    level += (v - level) * 0.45;
    return level;
  }

  return {
    start,
    stop,
    sample,
    get active() {
      return !!analyser;
    },
    get raw() {
      return raw;
    },
    get level() {
      return level;
    },
  };
}
