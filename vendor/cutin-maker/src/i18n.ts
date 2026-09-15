import { useSyncExternalStore } from 'react';

/**
 * TRPG Toolkit 合輯共用 i18n 的 React 端接點。
 *
 * 引擎本體（assets/i18n.js）與字典（i18n.cutin.js）在 index.html 以一般 script
 * 載入，於模組執行前就已經掛在 window 上；這裡只是把它包成有型別的介面。
 */
declare global {
  interface Window {
    T: (key: string, ...args: (string | number)[]) => string;
    I18N: {
      locale: string;
      onChange: (listener: (locale: string) => void) => void;
      mountSwitcher: (select: HTMLSelectElement | null) => void;
    };
  }
}

/** 取字典裡的譯文。未登錄的 key 會原樣回傳（引擎的行為）。 */
export const t = (key: string, ...args: (string | number)[]): string =>
  (typeof window !== 'undefined' && window.T ? window.T(key, ...args) : key);

/* 引擎的 onChange 沒有解除訂閱的介面，因此只掛一個監聽器，再由這裡分派給
 * 各元件。元件卸載時從 subscribers 移除，不會殘留。 */
const subscribers = new Set<() => void>();
let bridged = false;

function subscribe(notify: () => void): () => void {
  if (!bridged) {
    bridged = true;
    window.I18N?.onChange(() => {
      for (const fn of subscribers) fn();
    });
  }
  subscribers.add(notify);
  return () => { subscribers.delete(notify); };
}

const snapshot = () => (typeof window !== 'undefined' && window.I18N ? window.I18N.locale : 'zh-TW');

/**
 * 目前語言。語言一變就重繪呼叫它的元件。
 *
 * 大部分字串是在算繪時才用 t() 取值，所以只要最上層的 App 訂閱就會整棵重繪；
 * 另外在有 useMemo 快取譯文的元件（GalleryScreen）也要訂閱，把語言放進相依陣列。
 */
export function useLocale(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
