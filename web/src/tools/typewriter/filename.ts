/**
 * 檔名（規格 3.12）：時間戳＝按下匯出當下的毫秒數（Unix 時間）。
 * 片尾分段的摘要＝該段第一行的前 10 個字，以共用的檔名清理規則處理（保留中日韓文字，主控裁定）。
 */
import { safeFileName } from '@/core/files';
import type { Mode } from './settings';

const PREFIX: Record<Mode, string> = {
  typing: 'typing',
  glitch: 'glitch',
  credits: 'credit',
  karaoke: 'karaoke',
};

/** 動畫檔的主檔名（不含副檔名） */
export const animationBaseName = (mode: Mode, ts: number): string => `${PREFIX[mode]}_${ts}`;

/** 片尾分段的摘要：第一行的前 10 個字（碼位），去掉不能用在檔名的字元，空白換成底線 */
export function segmentSummary(text: string): string {
  const first = text.replace(/\r\n?/g, '\n').split('\n')[0] ?? '';
  const head = Array.from(first.trim()).slice(0, 10).join('');
  return safeFileName(head, { underscore: true, fallback: '' });
}

/** 片尾分段的主檔名：<段號>_<摘要>_<時間戳>（摘要是空的時候省略） */
export function segmentBaseName(number: number, text: string, ts: number): string {
  const summary = segmentSummary(text);
  return summary ? `${number}_${summary}_${ts}` : `${number}_${ts}`;
}

export const soundFileName = (ts: number): string => `sound_${ts}.wav`;
export const silenceFileName = (ts: number): string => `silent_${ts}.wav`;
