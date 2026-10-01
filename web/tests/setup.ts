/* 元件測試共用設定：jest-dom 的比對器；jsdom 缺的 API 補上最小實作。 */
import '@testing-library/jest-dom/vitest';

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
