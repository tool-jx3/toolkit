/**
 * 演出風格的登錄表（lyric-fx 規格 3.8）。新增一個風格：在 `styles/<id>/` 寫一個 LyricStyle，在下面的清單加一行。
 */
import type { AnyLyricStyle } from '../types';
import { scatterStyle } from './scatter';

export const LYRIC_STYLES: readonly AnyLyricStyle[] = [scatterStyle];

export const DEFAULT_LYRIC_STYLE = 'scatter';

/** 依 id 找風格（找不到時用第一個） */
export function getLyricStyle(id: string | null | undefined): AnyLyricStyle {
  return LYRIC_STYLES.find((s) => s.id === id) ?? LYRIC_STYLES[0];
}

export { scatterStyle };
