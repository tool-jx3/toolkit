/**
 * 輸出（規格 3.11、3.12）：列印（只印紙面）與列印用 HTML。
 */
import { downloadText } from '@/core/files';
import { PAPER_SIZES, printPages } from '@/core/paged';
import { cleanBook } from './book';
import { BOOK_CSS, bookClass, paperFontLinks } from './bookCss';
import type { PaperId, ThemeId } from './model';
import { PAPER_TEXT } from './strings';
import { plainTitle } from './syntax';

const escText = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);

/** 文件標題：拿掉 * _ `，空白時「劇本」 */
export const docTitle = (title: string): string => plainTitle(title) || PAPER_TEXT.fallbackTitle;

/** 列印用 HTML 的檔名（3.12） */
export const printHtmlFileName = (title: string): string =>
  `${docTitle(title).replace(/[\\/:*?"<>|\s]+/g, '_')}_列印用.html`;

const pageRule = (paper: PaperId) => {
  const s = PAPER_SIZES[paper];
  return `@page{size:${s.w}mm ${s.h}mm;margin:0}`;
};

export interface PrintHtmlInput {
  title: string;
  paper: PaperId;
  /** 排好的 .book（會複製一份、拿掉編輯用的東西） */
  book: HTMLElement;
}

/** 列印用 HTML 的全文（3.12） */
export function printHtml({ title, paper, book }: PrintHtmlInput): string {
  const clean = cleanBook(book);
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escText(docTitle(title))}</title>
${paperFontLinks()}
<style>${pageRule(paper)}</style>
<style>${BOOK_CSS}</style>
<style>html,body{margin:0}body{background:#e9e7e2;padding:24px 0}@media print{body{background:none;padding:0}}</style>
</head>
<body>
${clean.outerHTML}
</body>
</html>
`;
}

export function downloadPrintHtml(input: PrintHtmlInput): string {
  const name = printHtmlFileName(input.title);
  downloadText(printHtml(input), name, 'text/html;charset=utf-8');
  return name;
}

export interface PrintInput {
  title: string;
  paper: PaperId;
  theme: ThemeId;
  book: HTMLElement;
  /** 測試用：不真的呼叫 print() */
  dryRun?: boolean;
}

/** 列印（3.11）：只放紙面的列印文件 */
export function printBook({ title, paper, theme, book, dryRun }: PrintInput) {
  const clean = cleanBook(book);
  const pages = [...clean.querySelectorAll<HTMLElement>(':scope > .page')].map((p) => p.outerHTML);
  return printPages({
    title: docTitle(title),
    css: BOOK_CSS,
    pages,
    size: PAPER_SIZES[paper],
    head: paperFontLinks(),
    bodyClass: bookClass(paper, theme),
    dryRun,
  });
}
