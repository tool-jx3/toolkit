/**
 * 字型（D3）：畫之前只下載用到的字；網頁字型每載好一批計數就加 1，量字與基線的快取清掉、版面重排（字寬改變、換行跟著變）。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { ensureFont } from '@/core/fonts';
import { clearFontMetrics } from './render/paint';

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));
const bump = () => {
  clearFontMetrics();
  useTick.setState((s) => ({ tick: s.tick + 1 }));
};

let listening = false;
function listen(): void {
  if (listening || typeof document === 'undefined' || !document.fonts) return;
  listening = true;
  document.fonts.addEventListener?.('loadingdone', bump);
}

/** 字型載入的計數（放進 useMemo 的依賴，載好後重排） */
export function useFontTick(): number {
  listen();
  return useTick((s) => s.tick);
}

export type FontLoad = { family: string; weight: number; text: string };

/** 確保這組字型＋文字載好（載好後計數加 1） */
export function useEnsureFonts(list: readonly FontLoad[]) {
  const key = list.map((x) => `${x.family}|${x.weight}|${x.text}`).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已包含 list 的內容
  useEffect(() => {
    let alive = true;
    void Promise.all(
      list.map((x) => ensureFont(x.family, x.weight, x.text).catch(() => false)),
    ).then(() => {
      if (alive) bump();
    });
    return () => {
      alive = false;
    };
  }, [key]);
}

/** 匯出前：等這組字型載好 */
export async function loadFonts(list: readonly FontLoad[]): Promise<void> {
  await Promise.all(list.map((x) => ensureFont(x.family, x.weight, x.text).catch(() => false)));
  clearFontMetrics();
}
