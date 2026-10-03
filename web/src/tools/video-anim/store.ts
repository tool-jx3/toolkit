/**
 * 狀態：
 * - useSettings：轉換選項（格式、FPS、比例、速度、無損、畫質、GIF 色數與抖色），自動存檔（規格 5. D19）。
 * - useSession：這次開頁的影片、選取區間、裁切、匯出狀態、結果與樣本影格（不存檔）。
 */
import { create } from 'zustand';
import { createToolStore } from '@/core/storage';
import type { VideoThumbnail } from '@/core/video';
import {
  DEFAULT_CROP,
  FPS_CHOICES,
  GIF_COLOR_CHOICES,
  type GifDitherChoice,
  type NormCrop,
  OUTPUT_FORMATS,
  type OutputFormat,
  QUALITY_RANGE,
  SCALE_CHOICES,
  SPEED_CHOICES,
} from './logic';

export const TOOL_ID = 'video-anim';

export interface Settings {
  format: OutputFormat;
  fps: number;
  scale: number;
  speed: number;
  /** WebP 無損 */
  lossless: boolean;
  /** WebP 有損時的畫質（10～100） */
  quality: number;
  gifColors: number;
  gifDither: GifDitherChoice;
}

export const DEFAULT_SETTINGS: Settings = {
  format: 'apng',
  fps: 30,
  scale: 1,
  speed: 1,
  lossless: true,
  quality: 95,
  gifColors: 256,
  gifDither: 'floyd-steinberg',
};

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS);

/* 存檔裡的值不合法時（被改壞、舊版本）修正一次 */
{
  const d = useSettings.getState().data;
  const fixed: Partial<Settings> = {};
  if (!OUTPUT_FORMATS.includes(d.format)) fixed.format = DEFAULT_SETTINGS.format;
  if (!(FPS_CHOICES as readonly number[]).includes(d.fps)) fixed.fps = DEFAULT_SETTINGS.fps;
  if (!(SCALE_CHOICES as readonly number[]).includes(d.scale)) fixed.scale = 1;
  if (!(SPEED_CHOICES as readonly number[]).includes(d.speed)) fixed.speed = 1;
  if (!(GIF_COLOR_CHOICES as readonly number[]).includes(d.gifColors)) fixed.gifColors = 256;
  if (d.gifDither !== 'none' && d.gifDither !== 'floyd-steinberg')
    fixed.gifDither = DEFAULT_SETTINGS.gifDither;
  if (
    typeof d.quality !== 'number' ||
    !(d.quality >= QUALITY_RANGE[0] && d.quality <= QUALITY_RANGE[1])
  )
    fixed.quality = DEFAULT_SETTINGS.quality;
  if (typeof d.lossless !== 'boolean') fixed.lossless = true;
  if (Object.keys(fixed).length) useSettings.getState().patch(fixed);
  useSettings.temporal.getState().clear();
}

export const patchSettings = (p: Partial<Settings>) => useSettings.getState().patch(p);

export interface LoadedVideo {
  /** 載入的次數（換影片時改變） */
  id: number;
  name: string;
  /** 輸出檔名的主體 */
  base: string;
  /** 物件網址（預覽與抽影格共用；換影片時釋放） */
  url: string;
  width: number;
  height: number;
  duration: number;
}

export interface ExportResultInfo {
  blob: Blob;
  url: string;
  fileName: string;
}

export interface Session {
  video: LoadedVideo | null;
  /** 讀取影片中（含產生範例影片） */
  loading: boolean;
  sampling: boolean;
  start: number;
  end: number;
  cropOn: boolean;
  crop: NormCrop;
  exporting: boolean;
  /** 最近一次的轉換結果（下一次轉換或換影片時取代） */
  result: ExportResultInfo | null;
  thumbs: VideoThumbnail[] | null;
  thumbsBusy: boolean;
}

export const useSession = create<Session>(() => ({
  video: null,
  loading: false,
  sampling: false,
  start: 0,
  end: 0,
  cropOn: false,
  crop: DEFAULT_CROP,
  exporting: false,
  result: null,
  thumbs: null,
  thumbsBusy: false,
}));
