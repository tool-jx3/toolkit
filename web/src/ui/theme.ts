/**
 * 深／淺色主題。深色為預設；選擇記在 localStorage（所有工具共用）。
 * 頁面載入時的初始化在 build/plugins.ts 的 THEME_INIT（避免閃爍）。
 */
import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'trpg-toolkit:theme';

const listeners = new Set<() => void>();

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* 無法存就只套用這次 */
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
      document.documentElement.dataset.theme = e.newValue;
      cb();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** 目前主題與切換函式 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'dark' as Theme);
  return [theme, setTheme];
}
