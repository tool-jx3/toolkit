/**
 * 列印書頁：把頁面放進一個看不見的 iframe（獨立的列印文件）再呼叫瀏覽器的列印，
 * 所以工具畫面上的其他東西不會被印出來，使用者可以在列印對話框選「另存為 PDF」。
 */
import type { PaperSize } from './units';

export interface PrintOptions {
  /** 文件標題（另存 PDF 時的預設檔名） */
  title: string;
  /** 頁面用的樣式 */
  css: string;
  /** 每一頁的 HTML（依序；頁與頁之間換頁） */
  pages: readonly string[];
  size: PaperSize;
  /** 額外放進 <head> 的東西（例如 Google Fonts 的 <link>） */
  head?: string;
  /** <body> 的 class */
  bodyClass?: string;
  lang?: string;
  /** 測試用：不真的呼叫 print() */
  dryRun?: boolean;
}

const MARK = 'data-paged-print';

const escapeText = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

/** 列印文件的完整 HTML（也可以拿去做別的用途，例如測試） */
export function printDocumentHtml(o: PrintOptions): string {
  const pageCss = `@page{size:${o.size.w}mm ${o.size.h}mm;margin:0}
html,body{margin:0;padding:0;background:#fff}
.paged-print-page{break-after:page;page-break-after:always}
.paged-print-page:last-child{break-after:auto;page-break-after:auto}
@media screen{body{background:#666}.paged-print-page{margin:0 auto 8mm;width:${o.size.w}mm}}`;
  return `<!DOCTYPE html><html lang="${o.lang ?? 'zh-Hant-TW'}"><head><meta charset="utf-8"><title>${escapeText(o.title)}</title>${o.head ?? ''}<style>${o.css}\n${pageCss}</style></head><body class="${o.bodyClass ?? ''}">${o.pages.map((p) => `<div class="paged-print-page">${p}</div>`).join('')}</body></html>`;
}

/** 移除上一次的列印文件 */
export function clearPrintFrames(doc: Document = document): void {
  for (const el of doc.querySelectorAll(`iframe[${MARK}]`)) el.remove();
}

/**
 * 列印：建立看不見的 iframe、等圖片與字型載入完再列印。回傳 iframe（留在頁面上直到下一次列印，
 * 部分瀏覽器在列印對話框關閉前移除 iframe 會取消列印）。
 */
export async function printPages(o: PrintOptions): Promise<HTMLIFrameElement> {
  clearPrintFrames();
  const frame = document.createElement('iframe');
  frame.setAttribute(MARK, '');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.title = o.title;
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: `${o.size.w}mm`,
    height: `${o.size.h}mm`,
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true });
  });
  frame.srcdoc = printDocumentHtml(o);
  document.body.appendChild(frame);
  await loaded;
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (doc) {
    await Promise.all(
      [...doc.images].map((img) =>
        img.complete ? undefined : img.decode().catch(() => undefined),
      ),
    );
    try {
      await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
    } catch {
      /* 沒有 FontFaceSet */
    }
  }
  if (win && !o.dryRun) {
    win.focus();
    win.print();
  }
  return frame;
}
