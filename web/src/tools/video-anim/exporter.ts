/**
 * 轉換：依取樣計畫逐格跳轉（看不見的影片元素）、裁切縮放後交給共用的 exportAnimation 編碼（Worker）。
 * 每格顯示 1 ÷ FPS 秒（影格表：APNG 用 1/FPS 的分數、WebP 累計毫秒、GIF 累計 1/100 秒）。
 */
import { type AnimationSource, type ExportResult, exportAnimation } from '@/core/timeline';
import { drawVideoFrame } from '@/core/video';
import { getGrabber } from './actions';
import {
  exportPlan,
  type NormCrop,
  type OutputFormat,
  outputSize,
  sourceRect,
  webpQuality,
} from './logic';
import type { LoadedVideo, Settings } from './store';
import { FORMAT_LABEL, S } from './strings';

export interface VideoExportInput {
  video: LoadedVideo;
  range: { start: number; end: number };
  crop: NormCrop | null;
  settings: Settings;
  format: OutputFormat;
  fps: number;
  signal: AbortSignal;
  onProgress: (ratio: number, label: string) => void;
  /** 每抽出一格時呼叫（畫目前的影格） */
  onFrame?: (canvas: CanvasImageSource & { width: number; height: number }) => void;
}

/** 影格數上限（共用 exportAnimation 的預設） */
export const MAX_FRAMES = 1800;
/** 處理量上限：寬 × 高 × 影格數 */
export const PIXEL_BUDGET = 1_000_000_000;

export async function exportVideo({
  video,
  range,
  crop,
  settings,
  format,
  fps,
  signal,
  onProgress,
  onFrame,
}: VideoExportInput): Promise<ExportResult> {
  const grabber = getGrabber();
  if (!grabber) throw new Error(S.needVideo);
  await grabber.ready;
  const plan = exportPlan(range, { format, fps, speed: settings.speed });
  const src = sourceRect(video, crop);
  const out = outputSize(src, settings.scale);
  const n = plan.times.length;
  if (!n) throw new Error(S.needVideo);
  const label = FORMAT_LABEL[format];
  const frameMs = 1000 / plan.fps;

  const source: AnimationSource = {
    width: out.width,
    height: out.height,
    duration: plan.duration,
    /* 影格表：第 i 格 render 時拿到的 t 是 i（再查取樣時間） */
    frames: plan.times.map((_, i) => ({ ms: frameMs, t: i })),
    render: async (ctx, i) => {
      await grabber.frameAt(
        plan.times[i],
        (v) =>
          drawVideoFrame(ctx, v, {
            crop: src,
            width: out.width,
            height: out.height,
            /* 比例 100%（不縮放）時照原樣；縮小時用高畫質（規格 5. D23） */
            quality: 'high',
          }),
        { signal },
      );
      onFrame?.(ctx.canvas as HTMLCanvasElement);
    },
  };

  return exportAnimation(source, {
    format,
    fps: plan.fps,
    plays: 0,
    frameTimeBase: plan.fps,
    webpQuality: webpQuality(settings.lossless, settings.quality),
    gifLocalPalettes: true,
    gifMaxColors: settings.gifColors,
    gifDither: settings.gifDither,
    fileName: video.base,
    maxFrames: MAX_FRAMES,
    signal,
    onProgress: (ratio, l) => {
      const m = /(\d+)／(\d+)/.exec(l);
      onProgress(
        ratio,
        m && l.startsWith('產生影格')
          ? S.progressExtract(Number(m[1]), Number(m[2]))
          : ratio >= 0.9 && ratio < 1
            ? S.progressEncode(label)
            : l,
      );
    },
  });
}
