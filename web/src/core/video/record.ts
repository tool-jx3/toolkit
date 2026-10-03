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

/** 錄影用的影片類型（支援的第一個）；都不支援時回傳空字串（交給瀏覽器決定） */
export function pickRecordingType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
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
