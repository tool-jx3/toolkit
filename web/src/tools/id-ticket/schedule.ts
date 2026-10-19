/**
 * 預覽與縮圖的重畫時機（規格 F02：快速打字不卡）。
 * - `afterPaint`：這一格畫面更新（輸入框裡的字出現）之後再做，不算進這次輸入的處理時間；
 *   還沒做就又改了（取消）時只做最新的那一次。
 * - `useIdleValue`：值停下 ms 之後才跟上（縮圖用）。
 */
import { useEffect, useState } from 'react';

/** 下一次畫面更新之後做 fn；回傳取消 */
export function afterPaint(fn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const raf = requestAnimationFrame(() => {
    timer = setTimeout(fn, 0);
  });
  return () => {
    cancelAnimationFrame(raf);
    if (timer !== null) clearTimeout(timer);
  };
}

/** value 停下 ms 之後才變成新的值（第一次就是 value） */
export function useIdleValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, settled, ms]);
  return settled;
}
