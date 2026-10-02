/**
 * 打開影片（瀏覽器的 <video>）：等長寬與總長讀到、處理總長未知的 WebM、跳轉並等畫面就緒。
 */

const abortError = () => new DOMException('已取消', 'AbortError');

/** 影片讀不到（無法解碼、沒有影像、逾時） */
export class VideoLoadError extends Error {
  readonly code: 'decode' | 'no-video' | 'timeout';
  constructor(code: 'decode' | 'no-video' | 'timeout', message: string) {
    super(message);
    this.name = 'VideoLoadError';
    this.code = code;
  }
}

export interface VideoInfo {
  /** 影像的寬高（px） */
  width: number;
  height: number;
  /** 總長（秒，一定是有限的數字） */
  duration: number;
}

export interface OpenVideoOptions {
  signal?: AbortSignal;
  /** 等待長寬與總長的上限（毫秒，預設 20000） */
  timeoutMs?: number;
}

export interface VideoHandle extends VideoInfo {
  /** 看不見的影片元素（靜音、不自動播放） */
  video: HTMLVideoElement;
  /** 影片的網址（傳入 Blob 時是這裡建立的物件網址，close 時釋放） */
  url: string;
  /** 釋放（停止下載、釋放物件網址） */
  close(): void;
}

/** 等某個事件（或錯誤、取消、逾時）；回傳觸發的事件名稱 */
function waitFor(
  el: HTMLMediaElement,
  events: readonly string[],
  {
    signal,
    timeoutMs,
    onTimeout,
  }: { signal?: AbortSignal; timeoutMs: number; onTimeout: () => Error },
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => {
      for (const e of events) el.removeEventListener(e, onEvent);
      el.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };
    const onEvent = (e: Event) => {
      cleanup();
      resolve(e.type);
    };
    const onError = () => {
      cleanup();
      reject(
        new VideoLoadError(
          'decode',
          '瀏覽器無法播放這個影片（可能是不支援的格式或編碼），請換成 MP4（H.264）或 WebM。',
        ),
      );
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(onTimeout());
    }, timeoutMs);
    for (const e of events) el.addEventListener(e, onEvent);
    el.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 總長未知（Infinity，例如瀏覽器 MediaRecorder 錄的 WebM）時，先跳到很後面讓瀏覽器掃完整個檔案、算出總長，再跳回 0。
 * 已知時不做任何事。回傳總長。
 */
export async function ensureFiniteDuration(
  video: HTMLVideoElement,
  { signal, timeoutMs = 20000 }: OpenVideoOptions = {},
): Promise<number> {
  if (Number.isFinite(video.duration)) return video.duration;
  const deadline = Date.now() + timeoutMs;
  video.currentTime = 1e101;
  while (!Number.isFinite(video.duration)) {
    const left = deadline - Date.now();
    if (left <= 0) throw new VideoLoadError('timeout', '讀不到影片的長度。');
    await waitFor(video, ['durationchange', 'timeupdate', 'seeked'], {
      signal,
      timeoutMs: left,
      onTimeout: () => new VideoLoadError('timeout', '讀不到影片的長度。'),
    });
  }
  const duration = video.duration;
  await seekVideo(video, 0, { signal, timeoutMs, waitForFrame: false });
  return duration;
}

/**
 * 打開影片：建立看不見的 <video>（靜音），等長寬與總長；總長未知時先算出來。
 *
 * ```ts
 * const v = await openVideo(file);           // { video, width, height, duration, url, close }
 * await seekVideo(v.video, 1.5);
 * ctx.drawImage(v.video, 0, 0);
 * v.close();
 * ```
 *
 * 讀不到（無法解碼、沒有影像、逾時）丟 VideoLoadError（訊息可直接顯示）。
 */
export async function openVideo(
  src: Blob | string,
  { signal, timeoutMs = 20000 }: OpenVideoOptions = {},
): Promise<VideoHandle> {
  const ownUrl = typeof src !== 'string';
  const url = ownUrl ? URL.createObjectURL(src) : src;
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (ownUrl) URL.revokeObjectURL(url);
  };
  try {
    const loaded = waitFor(video, ['loadedmetadata'], {
      signal,
      timeoutMs,
      onTimeout: () => new VideoLoadError('timeout', '讀取影片逾時，請換一個檔案。'),
    });
    video.src = url;
    await loaded;
    if (!video.videoWidth || !video.videoHeight)
      throw new VideoLoadError('no-video', '這個檔案沒有影像（可能只有聲音）。');
    const duration = await ensureFiniteDuration(video, { signal, timeoutMs });
    if (!(duration > 0)) throw new VideoLoadError('no-video', '影片的長度是 0。');
    return { video, url, width: video.videoWidth, height: video.videoHeight, duration, close };
  } catch (e) {
    close();
    throw e;
  }
}

/** 只讀影片資訊（長寬、總長），讀完就釋放 */
export async function probeVideo(
  src: Blob | string,
  options: OpenVideoOptions = {},
): Promise<VideoInfo> {
  const v = await openVideo(src, options);
  const info = { width: v.width, height: v.height, duration: v.duration };
  v.close();
  return info;
}

export interface SeekOptions {
  signal?: AbortSignal;
  /** 等待跳轉完成的上限（毫秒，預設 15000） */
  timeoutMs?: number;
  /**
   * 跳轉完成後再等新的畫面送出（預設 true）。Chromium 的 seeked 觸發時，drawImage 有時還拿到前一兩格的畫面
   * （實測約每 90 格有 0～3 格），等 requestVideoFrameCallback（不支援時兩個 requestAnimationFrame）就穩定了；
   * 最多等 FRAME_WAIT_MS。只要讀影片資訊、不畫畫面時可以關掉。
   */
  waitForFrame?: boolean;
}

/** 等新畫面的上限（毫秒）：分頁在背景時畫面不會更新，等到這麼久就照樣往下 */
export const FRAME_WAIT_MS = 250;

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/** 下一次送出畫面（requestVideoFrameCallback；不支援時兩個 requestAnimationFrame），最多等 maxMs */
function nextPresentedFrame(video: HTMLVideoElement, maxMs: number): Promise<void> {
  const v = video as FrameCallbackVideo;
  return new Promise((resolve) => {
    let done = false;
    let handle = -1;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (handle >= 0) v.cancelVideoFrameCallback?.(handle);
      resolve();
    };
    const timer = setTimeout(finish, maxMs);
    if (typeof v.requestVideoFrameCallback === 'function') {
      handle = v.requestVideoFrameCallback(() => {
        handle = -1;
        finish();
      });
    } else if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    }
  });
}

/**
 * 跳到 time 秒並等畫面就緒（seeked、有目前的畫面，預設再等新的畫面送出）。time 夾在 0～總長。
 * 跳轉中再呼叫一次時，前一次的跳轉被取代（兩個 Promise 都在最後那次跳轉完成時結束）。
 */
export async function seekVideo(
  video: HTMLVideoElement,
  time: number,
  { signal, timeoutMs = 15000, waitForFrame = true }: SeekOptions = {},
): Promise<void> {
  if (signal?.aborted) throw abortError();
  const d = video.duration;
  const t = Math.max(0, Number.isFinite(d) && d > 0 ? Math.min(d, time) : time);
  const done = waitFor(video, ['seeked'], {
    signal,
    timeoutMs,
    onTimeout: () => new VideoLoadError('timeout', '影片跳轉逾時。'),
  });
  /* 先登記，跳轉完成後送出的那一格才不會錯過 */
  const presented = waitForFrame ? nextPresentedFrame(video, FRAME_WAIT_MS) : null;
  video.currentTime = t;
  await done;
  /* 跳轉完成但還沒有畫面（少見）：再等目前的畫面 */
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitFor(video, ['loadeddata', 'canplay'], {
      signal,
      timeoutMs,
      onTimeout: () => new VideoLoadError('timeout', '影片跳轉逾時。'),
    });
  }
  if (presented) await presented;
  if (signal?.aborted) throw abortError();
}
