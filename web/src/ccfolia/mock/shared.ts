/**
 * 模擬頁的共用工具：建立元素、假的雜湊 class、場景介面、量測來源內容尺寸。
 *
 * 模擬頁依 dom.ts 的外部事實自己寫（不是 CCFOLIA／Streamkit 的程式），在預覽 iframe 裡產生同樣的元素、
 * class 與屬性，讓工具產生的 CSS 在預覽與真的 CCFOLIA／Streamkit 上都生效。
 * 雜湊 class 故意用假的值（與真的不同），確保產生的 CSS 不會依賴它們。
 */

/** 預覽 iframe 裡的一個模擬場景 */
export interface MockScene {
  /**
   * 在 doc 裡建立模擬頁。head 裡已經有工具的自訂 CSS（<style id="tk-user-css">）；
   * 場景把頁面原本的樣式加在它**之後**（CCFOLIA 的樣式在 OBS 自訂 CSS 之後才插入）。回傳卸載函式。
   */
  mount(doc: Document): () => void;
  /** 量測來源內容的尺寸（不給時預覽元件量 #root） */
  measure?(doc: Document): { width: number; height: number };
}

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

/** 建立元素：h(doc, 'div', { class: 'a', 'aria-label': 'x' }, [子元素…]) */
export function h(
  doc: Document,
  tag: string,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElement {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  }
  return el;
}

/** SVG 元素（圖示用） */
export function svg(
  doc: Document,
  viewBox: string,
  paths: string[],
  attrs: Attrs = {},
): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const el = doc.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('focusable', 'false');
  el.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries(attrs))
    if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const d of paths) {
    const p = doc.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    el.append(p);
  }
  return el;
}

/** 假的 emotion 雜湊 class（css- 開頭；同一個 key 永遠得到同一個值） */
export function fakeHash(key: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h1 ^= key.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `css-tk${h1.toString(36)}`;
}

/** 在 head 加一段樣式（模擬頁原本的樣式），回傳 style 元素 */
export function addStyle(doc: Document, css: string, name: string): HTMLStyleElement {
  const style = doc.createElement('style');
  style.dataset.mock = name;
  style.textContent = css;
  doc.head.append(style);
  return style;
}

/** 清空 body（保留 head 的工具樣式）並設定語系 */
export function resetBody(doc: Document, lang = 'ja'): void {
  doc.documentElement.lang = lang;
  doc.body.replaceChildren();
  doc.body.removeAttribute('class');
  doc.body.removeAttribute('style');
}

/**
 * 量測來源內容的尺寸：元素（預設 #root）的右下角座標加上它的右／下外距，各自無條件進位。
 * （狀態條這類「縮成剛好包住內容」的 CSS 用這個算瀏覽器來源要多大）
 */
export function measureRootExtent(
  doc: Document,
  selector = '#root',
): { width: number; height: number } {
  const el = (doc.querySelector(selector) as HTMLElement | null) ?? doc.body;
  const view = doc.defaultView;
  if (!el || !view) return { width: 0, height: 0 };
  const r = el.getBoundingClientRect();
  const cs = view.getComputedStyle(el);
  const mr = Number.parseFloat(cs.marginRight) || 0;
  const mb = Number.parseFloat(cs.marginBottom) || 0;
  return {
    width: Math.max(0, Math.ceil(r.right + view.scrollX + mr)),
    height: Math.max(0, Math.ceil(r.bottom + view.scrollY + mb)),
  };
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};
