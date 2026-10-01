/* 元件測試共用設定：jest-dom 的比對器；jsdom 缺的 API 補上最小實作。 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/* 沒開 vitest globals，Testing Library 不會自動清除畫面 */
afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});

if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  w.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  w.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  /* jsdom 沒有 canvas：回傳 null，元件會自己降級 */
  window.HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement['getContext'];
  let urlSeq = 0;
  URL.createObjectURL ??= () => `blob:test/${++urlSeq}`;
  URL.revokeObjectURL ??= () => {};
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
