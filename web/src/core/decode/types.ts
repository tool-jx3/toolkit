/** 動畫圖檔解碼的共用型別 */

export interface DecodedFrame {
  /** 完整畫布（寬 × 高 × 4，未預乘的 RGBA），已依處置與混合方式合成 */
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** 這一格顯示多久（毫秒） */
  delayMs: number;
}

export type DecodedFormat = 'apng' | 'png' | 'gif' | 'webp' | 'image';

export interface DecodedAnimation {
  format: DecodedFormat;
  width: number;
  height: number;
  /** 檔案裡的播放次數（0＝無限；GIF 沒有 NETSCAPE 區塊時為 1） */
  loops: number;
  frames: DecodedFrame[];
  /** 超過 maxFrames 被截斷 */
  truncated: boolean;
}

export interface DecodeOptions {
  /** 最多幾格（預設 500） */
  maxFrames?: number;
  /** 比這短的延遲改成這個值（預設 10 ms） */
  minDelayMs?: number;
  /** 讀不到（0 或沒有）時的延遲（預設 100 ms） */
  defaultDelayMs?: number;
}

/** 依選項整理一格的延遲 */
export function frameDelay(ms: number | undefined, o: DecodeOptions = {}): number {
  const { minDelayMs = 10, defaultDelayMs = 100 } = o;
  if (!(ms !== undefined && ms > 0)) return defaultDelayMs;
  return Math.max(minDelayMs, ms);
}
