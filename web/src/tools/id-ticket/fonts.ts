/**
 * 字型載入：畫一次收集用到的字型與字（render 的 fontUsesOf），載好之後計數加 1，預覽依它重畫（字寬改變、縮放與「…」跟著變）。
 * 匯出前用 `ensureAll` 等全部載好。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { ensureFont } from '@/core/fonts';
import type { FontUse } from './kit';

const useTick = create<{ tick: number }>(() => ({ tick: 0 }));
const bump = () => useTick.setState((s) => ({ tick: s.tick + 1 }));

let listening = false;
function listen(): void {
  if (listening || typeof document === 'undefined' || !document.fonts) return;
  listening = true;
  document.fonts.addEventListener?.('loadingdone', bump);
}

/** 字型載入的計數（放進 useMemo 的依賴，載好後重畫） */
export function useFontTick(): number {
  listen();
  return useTick((s) => s.tick);
}

export async function ensureAll(list: readonly FontUse[]): Promise<void> {
  await Promise.all(list.map((x) => ensureFont(x.family, x.weight, x.text).catch(() => false)));
}

/** 確保這組字型＋文字載好（載好後計數加 1） */
export function useEnsureFonts(list: readonly FontUse[]): void {
  const key = list.map((x) => `${x.family}|${x.weight}|${x.text}`).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已包含 list 的內容
  useEffect(() => {
    let alive = true;
    void ensureAll(list).then(() => {
      if (alive) bump();
    });
    return () => {
      alive = false;
    };
  }, [key]);
}
