/**
 * 從影片抽影格：把目前的畫面（可裁切、縮放）畫到畫布；「抽影格器」用一個看不見的影片元素依序跳轉、畫出、做縮圖。
 */
import { fitWithin, seekTimeFor } from './frames';
import { type OpenVideoOptions, openVideo, seekVideo, type VideoHandle } from './open';

/** 影片上的範圍（影片像素） */
export interface VideoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DrawVideoFrameOptions {
  /** 只畫影片的這個範圍（影片像素；不給＝整個畫面） */
  crop?: VideoCrop | null;
  /** 畫到畫布上的大小（預設＝畫布大小） */
  width?: number;
  height?: number;
  /**
   * 縮放畫質（預設 'high'）。Chromium 的預設是 'low'（雙線性），縮小很多時細線會有鋸齒與摩爾紋。
   */
  quality?: ImageSmoothingQuality;
}

/** 把影片目前的畫面畫到 (0, 0)，範圍拉伸到 width × height */
export function drawVideoFrame(
  ctx: Ctx2D,
  video: HTMLVideoElement,
  { crop, width, height, quality = 'high' }: DrawVideoFrameOptions = {},
): void {
  const W = width ?? ctx.canvas.width;
  const H = height ?? ctx.canvas.height;
  const sx = crop?.x ?? 0;
  const sy = crop?.y ?? 0;
  const sw = crop?.width ?? video.videoWidth;
  const sh = crop?.height ?? video.videoHeight;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = quality;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
}

export interface VideoThumbnail {
  /** 取樣時間（秒，未加跳轉的誤差修正） */
  time: number;
  canvas: HTMLCanvasElement;
}

export interface VideoGrabber {
  /** 打開完成（失敗時丟 VideoLoadError） */
  readonly ready: Promise<VideoHandle>;
  /**
   * 跳到 time（自動加 FRAME_SEEK_EPSILON 避開交界）後呼叫 draw(video)。
   * 所有操作依序執行（不會兩個同時跳轉）。
   */
  frameAt<T>(
    time: number,
    draw: (video: HTMLVideoElement) => T,
    options?: { signal?: AbortSignal },
  ): Promise<T>;
  /** 依序取幾個時間點的縮圖（等比放進 maxWidth × maxHeight） */
  thumbnails(
    times: readonly number[],
    options: {
      maxWidth: number;
      maxHeight: number;
      signal?: AbortSignal;
      onThumb?: (t: VideoThumbnail, i: number) => void;
    },
  ): Promise<VideoThumbnail[]>;
  close(): void;
}

/**
 * 抽影格器：用一個看不見的影片元素（與預覽的影片元素分開，不影響預覽的播放位置）。
 *
 * ```ts
 * const g = createVideoGrabber(url);
 * await g.frameAt(1.5, (v) => drawVideoFrame(ctx, v, { crop }));
 * const thumbs = await g.thumbnails([0, 1, 2], { maxWidth: 160, maxHeight: 160 });
 * g.close();
 * ```
 */
export function createVideoGrabber(
  src: Blob | string,
  options: OpenVideoOptions = {},
): VideoGrabber {
  const ready = openVideo(src, options);
  /* 失敗時也要讓 queue 繼續（之後的呼叫各自丟錯） */
  ready.catch(() => {});
  let queue: Promise<unknown> = ready.catch(() => {});
  let closed = false;
  const run = <T>(op: (h: VideoHandle) => Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      if (closed) throw new DOMException('已關閉', 'AbortError');
      return op(await ready);
    });
    queue = next.catch(() => {});
    return next;
  };
  return {
    ready,
    frameAt(time, draw, { signal } = {}) {
      return run(async (h) => {
        await seekVideo(h.video, seekTimeFor(time, h.duration), { signal });
        return draw(h.video);
      });
    },
    thumbnails(times, { maxWidth, maxHeight, signal, onThumb }) {
      return run(async (h) => {
        const size = fitWithin(h.width, h.height, maxWidth, maxHeight);
        const out: VideoThumbnail[] = [];
        for (let i = 0; i < times.length; i++) {
          await seekVideo(h.video, seekTimeFor(times[i], h.duration), { signal });
          const canvas = document.createElement('canvas');
          canvas.width = size.width;
          canvas.height = size.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('無法建立畫布');
          drawVideoFrame(ctx, h.video);
          const thumb = { time: times[i], canvas };
          out.push(thumb);
          onThumb?.(thumb, i);
        }
        return out;
      });
    },
    close() {
      closed = true;
      ready.then((h) => h.close()).catch(() => {});
    },
  };
}
