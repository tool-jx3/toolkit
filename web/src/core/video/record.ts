/**
 * 把畫布上的動畫錄成影片（MediaRecorder）：依實際時間錄指定的秒數，結果是瀏覽器能播放的 WebM（或 MP4）。
 * 用來產生範例影片、測試用影片。錄出來的 WebM 通常沒有寫總長，讀的時候用 openVideo（會先算出總長）。
 */

const CANDIDATE_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
] as const;

/** 這個瀏覽器能不能把畫布錄成影片 */
export function canRecordCanvas(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/** 有聲音、優先 MP4 時的候選（music-frame：先試 H.264＋AAC 的 MP4，再試 WebM） */
const MP4_FIRST_AUDIO = [
  'video/mp4;codecs=avc1.640032,mp4a.40.2',
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.4d0028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;
const MP4_FIRST_SILENT = [
  'video/mp4;codecs=avc1.640032',
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1.4d0028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm',
] as const;

/**
 * 錄影用的影片類型（支援的第一個）；都不支援時回傳空字串（交給瀏覽器決定）。
 * 選填（music-frame 移植時新增，不給時與以前相同：先 WebM 再 MP4）：`preferMp4`（先試 H.264 的 MP4）、
 * `audio`（有聲音時的候選，含 AAC／Opus）。
 */
export function pickRecordingType(options: { audio?: boolean; preferMp4?: boolean } = {}): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const list: readonly string[] = options.preferMp4
    ? options.audio
      ? MP4_FIRST_AUDIO
      : MP4_FIRST_SILENT
    : CANDIDATE_TYPES;
  return (
    list.find((t) => {
      try {
        return MediaRecorder.isTypeSupported(t);
      } catch {
        return false;
      }
    }) ?? ''
  );
}

/** 即時錄影（MediaRecorder）的一種格式 */
export interface RecordingFormat {
  /** MediaRecorder 的類型 */
  mimeType: string;
  /** 副檔名（webm、mp4） */
  extension: 'webm' | 'mp4';
  /** 能不能保留透明背景（Chromium 的 WebM） */
  alpha: boolean;
  /** 選單上的名稱 */
  label: string;
}

/** 即時錄影的候選格式（順序即優先順序；anime-rig 移植時新增） */
export const RECORDING_FORMATS: readonly RecordingFormat[] = [
  {
    mimeType: 'video/webm;codecs=vp9',
    extension: 'webm',
    alpha: true,
    label: 'WebM（VP9，支援透明）',
  },
  {
    mimeType: 'video/webm;codecs=vp8',
    extension: 'webm',
    alpha: true,
    label: 'WebM（VP8，支援透明）',
  },
  { mimeType: 'video/webm', extension: 'webm', alpha: true, label: 'WebM' },
  {
    mimeType: 'video/mp4;codecs=avc1',
    extension: 'mp4',
    alpha: false,
    label: 'MP4（H.264，不支援透明）',
  },
  { mimeType: 'video/mp4', extension: 'mp4', alpha: false, label: 'MP4（不支援透明）' },
];

/** 這個瀏覽器的 MediaRecorder 支援的錄影格式（不支援錄影時是空陣列） */
export function recordingFormats(): RecordingFormat[] {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function')
    return [];
  return RECORDING_FORMATS.filter((f) => {
    try {
      return MediaRecorder.isTypeSupported(f.mimeType);
    } catch {
      return false;
    }
  });
}

export interface CanvasRecording {
  /** 實際的影片類型（例如 video/webm;codecs=vp9,opus） */
  readonly mimeType: string;
  /** 停止並取得影片 */
  stop(): Promise<Blob>;
  /** 停止並丟掉 */
  cancel(): void;
}

export interface CanvasRecordingOptions {
  /** 擷取的每秒格數 */
  fps: number;
  /** 一起錄進去的聲音（例如 AudioPlayer 的 recordingStream()） */
  audio?: MediaStream | null;
  mimeType?: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
}

/**
 * 即時錄下一個已經在畫面上（或由工具自己逐格畫）的畫布：開始後畫布上的變化與 audio 的聲音依實際時間錄進去，
 * stop() 拿到影片。用在瀏覽器不能逐格編碼（沒有 WebCodecs）時的退路；錄出來的 WebM 通常沒有寫總長。
 * 開始失敗時丟錯（訊息可直接顯示）。（music-frame 移植時新增）
 */
export function startCanvasRecording(
  canvas: HTMLCanvasElement,
  { fps, audio, mimeType, videoBitsPerSecond, audioBitsPerSecond }: CanvasRecordingOptions,
): CanvasRecording {
  if (!canRecordCanvas()) throw new Error('這個瀏覽器不支援錄製影片。');
  const stream = canvas.captureStream(fps);
  for (const t of audio?.getAudioTracks() ?? []) stream.addTrack(t);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      ...(videoBitsPerSecond ? { videoBitsPerSecond } : {}),
      ...(audioBitsPerSecond ? { audioBitsPerSecond } : {}),
    });
  } catch (e) {
    for (const t of stream.getVideoTracks()) t.stop();
    throw e instanceof Error ? e : new Error(String(e));
  }
  const chunks: Blob[] = [];
  let done: ((b: Blob) => void) | null = null;
  let failed: ((e: Error) => void) | null = null;
  const finished = new Promise<Blob>((resolve, reject) => {
    done = resolve;
    failed = reject;
  });
  /* 沒有人等的時候不要變成未處理的錯誤 */
  finished.catch(() => {});
  const stopTracks = () => {
    /* 只停畫布的軌：聲音的軌屬於呼叫端（之後還要播放） */
    for (const t of stream.getVideoTracks()) t.stop();
  };
  let cancelled = false;
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    stopTracks();
    if (cancelled) failed?.(new DOMException('已取消', 'AbortError'));
    else
      done?.(
        new Blob(chunks, { type: (recorder.mimeType || mimeType || 'video/webm').split(';')[0] }),
      );
  };
  recorder.onerror = () => {
    stopTracks();
    failed?.(new Error('錄製影片失敗。'));
  };
  recorder.start(1000);
  const halt = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  return {
    get mimeType() {
      return recorder.mimeType || mimeType || '';
    },
    stop() {
      halt();
      return finished;
    },
    cancel() {
      cancelled = true;
      halt();
    },
  };
}

export interface RecordCanvasOptions {
  width: number;
  height: number;
  /** 長度（秒） */
  seconds: number;
  /** 每秒幾格（預設 30） */
  fps?: number;
  /** 畫第 frame 格（t＝秒，依實際經過的時間） */
  draw: (ctx: CanvasRenderingContext2D, t: number, frame: number) => void;
  /** 影片類型（預設 pickRecordingType()） */
  mimeType?: string;
  /** 位元率（預設 4 Mbps） */
  bitsPerSecond?: number;
  signal?: AbortSignal;
}

/**
 * 錄影：每 1/fps 秒畫一格（依實際經過的時間），錄滿 seconds 秒後停止，回傳影片 Blob。
 * 分頁在背景時計時器會被瀏覽器放慢，錄到的格數會變少，但長度仍依實際時間。
 */
export function recordCanvas({
  width,
  height,
  seconds,
  fps = 30,
  draw,
  mimeType = pickRecordingType(),
  bitsPerSecond = 4_000_000,
  signal,
}: RecordCanvasOptions): Promise<Blob> {
  if (!canRecordCanvas()) return Promise.reject(new Error('這個瀏覽器不支援錄製影片。'));
  return new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(width));
    canvas.height = Math.max(2, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('無法建立畫布'));
      return;
    }
    const stream = canvas.captureStream(fps);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: bitsPerSecond,
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const chunks: Blob[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let aborted = false;
    const stopTracks = () => {
      for (const track of stream.getTracks()) track.stop();
    };
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stopTracks();
      if (aborted) reject(new DOMException('已取消', 'AbortError'));
      else resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
    };
    recorder.onerror = () => {
      if (timer) clearTimeout(timer);
      stopTracks();
      reject(new Error('錄製影片失敗。'));
    };
    const onAbort = () => {
      aborted = true;
      if (timer) clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const frameMs = 1000 / fps;
    draw(ctx, 0, 0);
    recorder.start();
    const t0 = performance.now();
    let frame = 0;
    const tick = () => {
      const elapsed = (performance.now() - t0) / 1000;
      if (elapsed >= seconds) {
        draw(ctx, seconds, Math.round(seconds * fps));
        /* 最後一格留一格的時間再停，確保錄進去 */
        timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          if (recorder.state !== 'inactive') recorder.stop();
        }, frameMs);
        return;
      }
      frame = Math.max(frame + 1, Math.floor(elapsed * fps));
      draw(ctx, elapsed, frame);
      timer = setTimeout(tick, Math.max(0, t0 + (frame + 1) * frameMs - performance.now()));
    };
    timer = setTimeout(tick, frameMs);
  });
}
