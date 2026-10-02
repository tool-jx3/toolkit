/**
 * 匯出的規則（規格 3.7、5. D9）：格式、影格表、輸出尺寸、上限。純函式（單元測試在 Node 跑）。
 */
import { type FrameSpec, frameCount } from '@/core/timeline';
import type { McProject } from './model';

export type ExportFormatId = 'png' | 'webp-still' | 'gif' | 'apng' | 'webp';
export const EXPORT_FORMAT_IDS: readonly ExportFormatId[] = [
  'png',
  'webp-still',
  'gif',
  'apng',
  'webp',
];

/** 影格數上限（與舊版相同） */
export const MAX_FRAMES = 900;
/** 處理量上限：寬 × 高 × 影格數 */
export const PIXEL_BUDGET = 220_000_000;
export const SCALE_OPTIONS = [0.25, 0.5, 1, 1.5, 2] as const;

const ANIMATED: readonly ExportFormatId[] = ['gif', 'apng', 'webp'];
export const isAnimated = (f: string): boolean => ANIMATED.includes(f as ExportFormatId);

/** 影格表：⌈長度 × FPS⌉ 格（排除浮點誤差），第 i 格畫 i ÷ FPS 秒、顯示 1000 ÷ FPS 毫秒 */
export function exportFrames(duration: number, fps: number): FrameSpec[] {
  const n = frameCount(duration, fps);
  return Array.from({ length: n }, (_, i) => ({ ms: 1000 / fps, t: i / fps }));
}

/** 輸出尺寸：四捨五入（至少 1） */
export function exportSizeOf(
  p: Pick<McProject, 'document'>,
  scale: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(p.document.width * scale)),
    height: Math.max(1, Math.round(p.document.height * scale)),
  };
}

/** 靜態圖的檔名：<主體>-<播放頭兩位小數>s（副檔名另加） */
export const stillBaseName = (base: string, time: number): string => `${base}-${time.toFixed(2)}s`;
