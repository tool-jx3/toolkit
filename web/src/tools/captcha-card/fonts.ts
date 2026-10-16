/**
 * 字型載入的計數：卡片用到的字（思源黑體 400～700）每載好一批就加 1，預覽依它重畫（字寬改變、按鈕寬度跟著變）。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { CaptchaState } from './model';
import { cardText, loadCardFonts } from './render';

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));

let listening = false;
function listen(): void {
  if (listening || typeof document === 'undefined' || !document.fonts) return;
  listening = true;
  document.fonts.addEventListener?.('loadingdone', () =>
    useTick.setState((s) => ({ tick: s.tick + 1 })),
  );
}

/** 字型載入的計數（放進 useMemo 的依賴，載好後重畫）；同時確保這份內容用到的字已在載入 */
export function useFontTick(d: CaptchaState): number {
  listen();
  const text = cardText(d);
  // biome-ignore lint/correctness/useExhaustiveDependencies: text 代表用到的字
  useEffect(() => {
    let alive = true;
    void loadCardFonts(d).then(() => {
      if (alive) useTick.setState((s) => ({ tick: s.tick + 1 }));
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return useTick((s) => s.tick);
}
