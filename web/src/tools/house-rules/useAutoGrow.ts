/**
 * 多行文字欄跟著內容長高（注記、備註）：內容或欄寬改變時把高度設成剛好放得下。
 */
import { useCallback, useLayoutEffect, useRef } from 'react';

export function useAutoGrow<T extends HTMLTextAreaElement>(value: string) {
  const ref = useRef<T | null>(null);
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 內容改變時重新量
  useLayoutEffect(resize, [resize, value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [resize]);
  return ref;
}
