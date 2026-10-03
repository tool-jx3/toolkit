/**
 * 影片轉動圖工具的純計算（不依賴 React、DOM）：選取區間、裁切、輸出尺寸、取樣計畫、檔名。規則見規格第 3 節。
 */
import { safeFileName, splitExtension } from '@/core/files';
import { clipSampleTimes } from '@/core/video/frames';

export type OutputFormat = 'apng' | 'webp' | 'gif';
export type GifDitherChoice = 'floyd-steinberg' | 'none';

export const OUTPUT_FORMATS: readonly OutputFormat[] = ['apng', 'webp', 'gif'];
/** FPS 選項（舊版 60、30、24、15、10；新版多一個 50＝GIF 的上限，規格 5. D4） */
export const FPS_CHOICES = [60, 50, 30, 24, 15, 10] as const;
export const GIF_MAX_FPS = 50;
export const SCALE_CHOICES = [1, 0.75, 0.5, 0.33] as const;
export const SPEED_CHOICES = [0.5, 1, 1.5, 2] as const;
export const GIF_COLOR_CHOICES = [256, 128, 64] as const;
export const QUALITY_RANGE = [10, 100] as const;

/** 選取區間至少這麼長（不足時以這個長度取樣） */
export const MIN_CLIP_SECONDS = 0.1;
/** 起點與終點至少相隔這麼多秒 */
export const TRIM_GAP = 0.2;
/** 逐格檢視的樣本數 */
export const THUMB_COUNT = 12;

/** 裁切範圍（比例，0～1） */
export interface NormCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 開啟裁切時的範圍：中央 80%（四邊各留 10%） */
export const DEFAULT_CROP: NormCrop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Range {
  start: number;
  end: number;
}

/* ---------- 選取區間 ---------- */

/** 以目前位置為起點：最晚到終點 − 0.2 秒、不小於 0 */
export function startAt(current: number, range: Range): number {
  return Math.max(0, Math.min(current, range.end - TRIM_GAP));
}

/** 以目前位置為終點：最早到起點 + 0.2 秒、不超過總長 */
export function endAt(current: number, range: Range, duration: number): number {
  return Math.min(duration, Math.max(current, range.start + TRIM_GAP));
}

/* ---------- 裁切與尺寸 ---------- */

/** 比例範圍換成影片像素（各自四捨五入），夾在影片內、至少 1 px */
export function cropPixels(crop: NormCrop, width: number, height: number): PixelRect {
  const x = Math.min(width - 1, Math.max(0, Math.round(crop.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.round(crop.y * height)));
  const w = Math.max(1, Math.min(width - x, Math.round(crop.w * width)));
  const h = Math.max(1, Math.min(height - y, Math.round(crop.h * height)));
  return { x, y, width: w, height: h };
}

/** 影片像素的範圍換成比例 */
export function normalizeCrop(rect: PixelRect, width: number, height: number): NormCrop {
  return {
    x: rect.x / width,
    y: rect.y / height,
    w: rect.width / width,
    h: rect.height / height,
  };
}

/** 來源範圍：裁切開啟時是裁切的像素範圍，否則整個畫面 */
export function sourceRect(
  video: { width: number; height: number },
  crop: NormCrop | null,
): PixelRect {
  return crop
    ? cropPixels(crop, video.width, video.height)
    : { x: 0, y: 0, width: video.width, height: video.height };
}

/** 奇數加 1 */
export const evenUp = (n: number): number => n + (n % 2);

/** 輸出尺寸：來源 × 比例四捨五入，奇數時加 1 */
export function outputSize(
  source: { width: number; height: number },
  scale: number,
): { width: number; height: number } {
  return {
    width: evenUp(Math.max(1, Math.round(source.width * scale))),
    height: evenUp(Math.max(1, Math.round(source.height * scale))),
  };
}

/* ---------- 取樣計畫 ---------- */

/** 實際取樣的 FPS：GIF 最多 50 */
export const effectiveFps = (format: OutputFormat, fps: number): number =>
  format === 'gif' ? Math.min(GIF_MAX_FPS, fps) : fps;

export interface ExportPlan {
  fps: number;
  /** 每格在影片上相隔的秒數 */
  step: number;
  /** 第 i 格取的影片時間 */
  times: number[];
  /** 輸出的總長（秒）＝影格數 ÷ FPS */
  duration: number;
}

/** 取樣計畫：影格數＝⌊max(0.1, 終點 − 起點) ÷ (速度 ÷ FPS)⌋，每格顯示 1 ÷ FPS 秒 */
export function exportPlan(
  range: Range,
  { format, fps, speed }: { format: OutputFormat; fps: number; speed: number },
): ExportPlan {
  const f = effectiveFps(format, fps);
  const { step, times } = clipSampleTimes({
    start: range.start,
    end: range.end,
    fps: f,
    speed,
    minLength: MIN_CLIP_SECONDS,
  });
  return { fps: f, step, times, duration: times.length / f };
}

/* ---------- 檔名 ---------- */

const VIDEO_EXTS = ['mp4', 'm4v', 'webm', 'mov', 'mkv', 'ogv', 'avi'];

/** 可以當影片載入的檔案：類型是 video/…，或類型空白但副檔名是常見影片格式 */
export function isVideoFile(file: { name: string; type: string }): boolean {
  if (file.type) return file.type.startsWith('video/');
  return VIDEO_EXTS.includes(splitExtension(file.name).ext);
}

/** 輸出檔名的主體：影片檔名去掉副檔名（清理後）；空白時「video」 */
export function fileBaseOf(name: string): string {
  return safeFileName(splitExtension(name).base, { fallback: 'video' });
}

export const FORMAT_EXT: Record<OutputFormat, string> = { apng: 'png', webp: 'webp', gif: 'gif' };
export const FORMAT_MIME: Record<OutputFormat, string> = {
  apng: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** 輸出檔名：<影片檔名主體>.<png|webp|gif> */
export const outputFileName = (base: string, format: OutputFormat): string =>
  `${base}.${FORMAT_EXT[format]}`;

/** WebP 的品質（0～1）：無損＝1，否則畫質 ÷ 100 */
export const webpQuality = (lossless: boolean, quality: number): number =>
  lossless ? 1 : Math.max(QUALITY_RANGE[0], Math.min(QUALITY_RANGE[1], quality)) / 100;
