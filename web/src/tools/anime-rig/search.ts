/**
 * 設定欄的搜尋（規格 F86）：區塊裡的項目用 SearchCtx 判斷要不要顯示。
 * q：搜尋字（小寫、去掉頭尾空白）；all：區塊的標題符合（整個區塊都顯示）。
 */
import { createContext } from 'react';

export const SearchCtx = createContext<{ q: string; all: boolean }>({ q: '', all: true });

export const hit = (q: string, ...texts: string[]): boolean =>
  texts.some((t) => t.toLowerCase().includes(q));
