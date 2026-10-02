/**
 * 輸出：列印（F231、3.10）、下載 PDF（F233、3.11）、匯出閱覽 HTML（F232、3.9）。
 * 列印與 PDF 用同一份頁面：範圍內的頁＋附錄頁（照 A4 分頁）。
 */
import { downloadBytes, downloadText } from '@/core/files';
import { googleFontCssUrl } from '@/core/fonts';
import { PAPER_SIZES, paperFileName, printPages, settleContent } from '@/core/paged';
import type { FontCache, PdfFontSource } from '@/core/paged/pdf';
import { idbGet, idbSet, toolDb } from '@/core/storage';
import { exportHtml } from './exportHtml';
import { appendixPagesHtml } from './layout';
import { allBlocks } from './model/blocks';
import { escapeHtml } from './model/text';
import type { Block, Doc } from './model/types';
import { type RenderCtx, staticPageHtml } from './render/html';
import { fontCss, PAPER_CSS, safeFontName } from './render/paperCss';
import { TOOL_ID } from './store';

export interface OutputRange {
  /** 0 起算，含兩端 */
  from: number;
  to: number;
}

/** 範圍：夾在 1～N、顛倒時對調（F230）。a、b 是 1 起算的頁碼 */
export function clampRange(a: number, b: number, total: number): OutputRange {
  const n = Math.max(1, total);
  let x = Math.max(1, Math.min(n, Math.round(+a || 1)));
  let y = Math.max(1, Math.min(n, Math.round(+b || n)));
  if (x > y) [x, y] = [y, x];
  return { from: x - 1, to: y - 1 };
}

/** 列印、PDF 用的樣式 */
export const outputCss = (doc: Doc): string => `${PAPER_CSS}\n${fontCss(doc)}`;

export const paperFontLink = (): string =>
  `<link rel="stylesheet" href="${escapeHtml(googleFontCssUrl('Noto Serif TC', [400, 600, 700]))}">`;

/** 看不到、沒有縮放的量測用容器（用完要移除） */
export function offscreenHost(className = 'pv-print'): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    left: '-12000px',
    top: '0',
    width: '210mm',
    visibility: 'hidden',
    pointerEvents: 'none',
    contain: 'layout style',
  });
  document.body.appendChild(el);
  return el;
}

/** 範圍內的頁面＋附錄頁的 HTML */
export function outputPagesHtml(
  doc: Doc,
  pages: readonly (readonly string[])[],
  range: OutputRange,
): string[] {
  const total = pages.length;
  const pageNo = new Map<string, number>();
  pages.forEach((ids, i) => {
    for (const id of ids) pageNo.set(id, i + 1);
  });
  const ctx: RenderCtx = { doc, edit: false, pageOf: (id) => pageNo.get(id) ?? null, total };
  const byId = new Map<string, Block>(allBlocks(doc).map((b) => [b.id, b]));
  const out: string[] = [];
  for (let i = range.from; i <= range.to; i++)
    out.push(staticPageHtml(i, pages[i] ?? [], ctx, byId));
  const host = offscreenHost();
  try {
    out.push(...appendixPagesHtml(doc, ctx, host));
  } finally {
    host.remove();
  }
  return out;
}

/** 列印（瀏覽器的列印對話框可以另存 PDF） */
export async function printRange(
  doc: Doc,
  pages: readonly (readonly string[])[],
  range: OutputRange,
  dryRun = false,
): Promise<HTMLIFrameElement> {
  return printPages({
    title: doc.title || '劇本',
    css: outputCss(doc),
    pages: outputPagesHtml(doc, pages, range),
    size: PAPER_SIZES.A4,
    head: paperFontLink(),
    bodyClass: 'pv-print',
    dryRun,
  });
}

/* ---------- PDF ---------- */

/** PDF 用的字型檔記在瀏覽器（IndexedDB） */
export function pdfFontCache(): FontCache {
  const store = toolDb(TOOL_ID);
  return {
    get: (k) => idbGet<Uint8Array>(`pdf-font:${k}`, store),
    set: (k, v) => idbSet(`pdf-font:${k}`, v, store),
  };
}

/** 原稿嵌入的字型 */
export function docFontSources(
  doc: Doc,
  dataUrlBytes: (url: string) => Uint8Array,
): PdfFontSource[] {
  return (doc.fonts ?? []).flatMap((f) => {
    const family = safeFontName(f.name);
    const load = async () => dataUrlBytes(f.data);
    return [400, 700].map((weight) => ({ family, weight, load }));
  });
}

export interface PdfProgress {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** 測試用：換掉字型來源 */
  fonts?: PdfFontSource[];
}

export async function pdfRange(
  doc: Doc,
  pages: readonly (readonly string[])[],
  range: OutputRange,
  p: PdfProgress = {},
): Promise<Uint8Array> {
  const { dataUrlBytes, notoFontSources, pagesToPdf } = await import('@/core/paged/pdf');
  const html = outputPagesHtml(doc, pages, range);
  const host = offscreenHost();
  try {
    host.innerHTML = html.join('');
    await settleContent(host);
    const els = [...host.children].filter((el): el is HTMLElement => el.classList.contains('pg'));
    const css = outputCss(doc);
    return await pagesToPdf({
      pages: els,
      size: PAPER_SIZES.A4,
      rasterLayers: '.pg-bg,.pg-img',
      css,
      rootClass: 'pv-print',
      fonts: p.fonts ?? [
        ...docFontSources(doc, dataUrlBytes),
        ...notoFontSources(pdfFontCache(), p.signal),
      ],
      fallback: { serif: ['Noto Serif TC'], sans: ['Noto Sans TC'] },
      title: doc.title,
      signal: p.signal,
      onProgress: p.onProgress,
    });
  } finally {
    host.remove();
  }
}

export async function downloadPdf(
  doc: Doc,
  pages: readonly (readonly string[])[],
  range: OutputRange,
  p: PdfProgress = {},
): Promise<string> {
  const bytes = await pdfRange(doc, pages, range, p);
  const name = paperFileName(doc.title, 'pdf');
  downloadBytes(bytes, name, 'application/pdf');
  return name;
}

/** 匯出閱覽 HTML（F232） */
export function downloadExportHtml(
  doc: Doc,
  pages: readonly (readonly string[])[],
  range: OutputRange,
): string {
  const name = paperFileName(doc.title, 'html');
  downloadText(
    exportHtml({ doc, pages, from: range.from, to: range.to }),
    name,
    'text/html;charset=utf-8',
  );
  return name;
}
