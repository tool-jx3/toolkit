/**
 * 字型載入的計數：網頁字型（Google Fonts）每載好一批就加 1，畫面與縮圖依它重排（自動字級依實際字寬計算）。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { loadFonts } from './scene';

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));

let listening = false;
function listen(): void {
  if (listening || typeof document === 'undefined' || !document.fonts) return;
  listening = true;
  document.fonts.addEventListener?.('loadingdone', () =>
    useTick.setState((s) => ({ tick: s.tick + 1 })),
  );
}

/** 字型載入的計數（放進 useMemo 的依賴，載好後重排） */
export function useFontTick(): number {
  listen();
  return useTick((s) => s.tick);
}

/** 確保這組文字＋字型載好（載好後計數加 1） */
export function useEnsureFonts(list: readonly { font: string; text: string }[]): void {
  const key = list.map((x) => `${x.font}\n${x.text}`).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已包含 list 的內容
  useEffect(() => {
    let alive = true;
    void Promise.all(list.map((x) => loadFonts(x))).then(() => {
      if (alive) useTick.setState((s) => ({ tick: s.tick + 1 }));
    });
    return () => {
      alive = false;
    };
  }, [key]);
}
