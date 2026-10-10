/**
 * 字型載入的計數：網頁字型每載好一批就加 1，卡片的斷行與預覽依它重新排版（字寬改變、換行位置跟著變）。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { ensureFont } from '@/core/fonts';

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));
const bump = () => useTick.setState((s) => ({ tick: s.tick + 1 }));

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

/** 確保這組字型＋文字載好（載好後計數加 1） */
export function useEnsureFonts(list: readonly { family: string; weight: number; text: string }[]) {
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
