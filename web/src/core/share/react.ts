/**
 * core/share 的 React 部分：網址的 # 會變（使用者在同一頁貼上別的連結、按上一頁）時重新讀分享內容。
 *
 * ```ts
 * const share = useShareHash(readShare);   // readShare(location.hash) → 'none' | 'broken' | 內容
 * ```
 */
import { useEffect, useState } from 'react';

/** 讀網址的 # 並在 hashchange 時重新讀（read 要是穩定的函式，例如模組層的函式） */
export function useShareHash<T>(read: (hash: string) => T): T {
  const [value, setValue] = useState(() => read(location.hash));
  useEffect(() => {
    const on = () => setValue(read(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [read]);
  return value;
}
