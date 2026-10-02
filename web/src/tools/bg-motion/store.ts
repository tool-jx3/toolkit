/**
 * 狀態：
 * - useSettings：設定。效果、秒數、畫質、尺寸、循環、匯出格式與 FPS 自動存檔（主控裁定：時長、品質等設定記住）；
 *   濾鏡、淡化順序、自訂檔名只在這次開頁有效（重新整理回到預設）。
 * - useSession：這次開頁的圖片、狀態列、匯出狀態與第一格 PNG（不存檔，圖片不保留）。
 */
import { create } from 'zustand';
import type { QualityLevel } from '@/core/image';
import { createToolStore } from '@/core/storage';
import { EFFECTS, type EffectId } from './effects';
import type { SizeChoice } from './logic';
import { type FilterChoice, S } from './strings';

export const TOOL_ID = 'bg-motion';

export type ExportFormatId = 'webp' | 'apng' | 'gif' | 'zip';
export const FPS_CHOICES = [24, 30, 60] as const;

export interface Settings {
  /** null＝無動態 */
  effect: EffectId | null;
  /** 秒數欄的文字（實際秒數見 parseSeconds） */
  secondsText: string;
  quality: QualityLevel;
  size: SizeChoice;
  loop: boolean;
  format: ExportFormatId;
  fps: number;
  /** APNG 減色 */
  quantize: boolean;
  /* ↓ 不存檔 */
  filter: FilterChoice;
  /** 淡化順序「顏色 → 圖片」（淡入） */
  fadeIn: boolean;
  /** 檔名欄：null＝顯示自動名稱；使用者改過就是那段文字（空白時下載用自動名稱） */
  fileName: string | null;
  tab: 'motion' | 'filter';
}

export const DEFAULT_EFFECT: EffectId = 'shakeY';

export const DEFAULT_SETTINGS: Settings = {
  effect: DEFAULT_EFFECT,
  /* 主控裁定：開頁時直接套用預選效果的預設秒數（2.5 秒） */
  secondsText: String(EFFECTS[DEFAULT_EFFECT].seconds),
  quality: 'standard',
  size: 'original',
  loop: EFFECTS[DEFAULT_EFFECT].loop,
  format: 'webp',
  fps: 24,
  quantize: false,
  filter: 'none',
  fadeIn: false,
  fileName: null,
  tab: 'motion',
};

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, {
  partialize: (d) => ({
    effect: d.effect,
    secondsText: d.secondsText,
    quality: d.quality,
    size: d.size,
    loop: d.loop,
    format: d.format,
    fps: d.fps,
    quantize: d.quantize,
  }),
});

/* 存檔裡的值不合法時（被改壞、舊版本）修正一次 */
{
  const d = useSettings.getState().data;
  const fixed: Partial<Settings> = {};
  if (d.effect !== null && !(d.effect in EFFECTS)) fixed.effect = DEFAULT_EFFECT;
  if (!['minimum', 'light', 'standard', 'high'].includes(d.quality)) fixed.quality = 'standard';
  if (!['original', '16:9', '8:5', '4:3', '3:2', '1:1'].includes(d.size)) fixed.size = 'original';
  if (!['webp', 'apng', 'gif', 'zip'].includes(d.format)) fixed.format = 'webp';
  if (!(FPS_CHOICES as readonly number[]).includes(d.fps)) fixed.fps = 24;
  if (d.format === 'gif' && d.fps > 50) fixed.fps = 30;
  if (typeof d.secondsText !== 'string') fixed.secondsText = DEFAULT_SETTINGS.secondsText;
  if (Object.keys(fixed).length) useSettings.getState().patch(fixed);
  useSettings.temporal.getState().clear();
}

export const patchSettings = (p: Partial<Settings>) => useSettings.getState().patch(p);

export interface LoadedImage {
  id: string;
  name: string;
  /** 檔案大小（位元組） */
  bytes: number;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'progress';

export interface Session {
  images: LoadedImage[];
  /** 檔名的原檔名段（載入時決定；調整順序後不更新） */
  sourceBase: string | null;
  status: { tone: StatusTone; text: string };
  exporting: boolean;
  /** 最近一次匯出時的第一格 PNG（設定改了就作廢） */
  firstFrame: { blob: Blob; fileName: string } | null;
  /** 載入圖片的次數（預覽停在第一格） */
  loadSeq: number;
  /** 選了效果（預覽從頭播放） */
  playSeq: number;
}

export const useSession = create<Session>(() => ({
  images: [],
  sourceBase: null,
  status: { tone: 'info', text: S.status.ready },
  exporting: false,
  firstFrame: null,
  loadSeq: 0,
  playSeq: 0,
}));

export const setStatus = (tone: StatusTone, text: string) =>
  useSession.setState({ status: { tone, text } });
