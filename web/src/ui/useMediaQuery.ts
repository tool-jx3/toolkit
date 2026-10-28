/**
 * 媒體查詢是否成立（視窗大小、方向、指標種類改變時跟著更新）。
 * height-board 跟進原作 2026-10 更新時新增：手機、平板直向、桌面三種面板版面，以及依輸入裝置（滑鼠／觸控）換說明文字。
 *
 * ```tsx
 * const phone = useMediaQuery('(max-width: 767px)');
 * const touch = useMediaQuery(COARSE_POINTER);
 * ```
 * 沒有 matchMedia 的環境（測試、伺服器端）回傳 fallback（預設 false）。
 */
import { useSyncExternalStore } from 'react';

/** 主要的指標是手指（觸控螢幕）：說明文字改成「點」「兩指」等 */
export const COARSE_POINTER = '(pointer: coarse)';

const list = (query: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;

export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = list(query);
      if (!m) return () => {};
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => list(query)?.matches ?? fallback,
    () => fallback,
  );
}
