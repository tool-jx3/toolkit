/**
 * 排出整本書（規格 3.1、3.4、3.5.5）：封面 → 目錄頁 → 本文（流動分頁），再填頁碼、目錄的頁碼、書眉，標出放不下的頁。
 * 分頁要在沒有縮放的容器裡量（stage），排好的 .book 再搬到要顯示的地方。
 */
import { FLOW_CLASSES, flowPaginate } from '@/core/paged';
import { bookClass } from './bookCss';
import { chapterText, coverInner, type ParsedDoc, titleBlock, tocBlocks } from './markup';
import type { Settings } from './model';
import { PAPER_TEXT } from './strings';
import { plainTitle } from './syntax';

const HEADING = /^H[1-6]$/;

/** 不單獨留在頁尾：標題、目錄的章 */
const keepWithNext = (el: Element) => HEADING.test(el.tagName) || el.classList.contains('kwn');
/** 不切開：標題、分隔線、圖片、目錄的每一列 */
const atomic = (el: Element) =>
  HEADING.test(el.tagName) ||
  el.tagName === 'HR' ||
  el.tagName === 'IMG' ||
  el.classList.contains('toc-item');
/** 盡量不切開 */
const avoidBreak = (el: Element) =>
  el.matches('.desc,.box,.judge,table,pre,blockquote,.titleblock');
/** 標籤類 */
const isChrome = (n: Node) =>
  n.nodeType === 1 && (n as Element).matches('.box-label,.desc-label,.judge-head,thead,caption');

/** 框與描述在下一頁重複標籤（框加「（續）」，只加一次）；框、描述、檢定標成接續 */
function afterSplit(rest: Element, part: Element): void {
  for (const cls of ['box', 'desc'] as const) {
    if (!rest.classList.contains(cls)) continue;
    const sel = `:scope > .${cls}-label`;
    if (rest.querySelector(sel)) continue;
    const label = part.querySelector<HTMLElement>(sel);
    if (!label) continue;
    const copy = label.cloneNode(true) as HTMLElement;
    if (cls === 'box' && !label.dataset.cont) {
      copy.append(PAPER_TEXT.cont);
      copy.dataset.cont = '1';
    }
    rest.prepend(copy);
  }
  if (rest.matches('.judge,.box,.desc')) rest.classList.add(FLOW_CLASSES.cont);
}

export interface BookResult {
  book: HTMLDivElement;
  /** 總頁數（含封面） */
  pages: number;
  /** 放不下的頁數 */
  over: number;
}

export interface BuildOptions {
  /** 量測用的容器（沒有縮放；排版時 .book 放在這裡） */
  stage: HTMLElement;
  /** 換掉溢出的判斷（測試用） */
  fits?: (body: HTMLElement) => boolean;
}

function defaultFits(body: HTMLElement): boolean {
  const last = body.lastElementChild;
  if (!last) return true;
  return last.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 0.5;
}

export function buildBook(d: ParsedDoc, s: Settings, o: BuildOptions): BookResult {
  const doc = o.stage.ownerDocument;
  const fits = o.fits ?? defaultFits;
  const book = doc.createElement('div');
  book.className = bookClass(s.paper, s.theme);
  book.dataset.paper = s.paper;
  book.dataset.theme = s.theme;
  o.stage.replaceChildren(book);
  const pages: HTMLElement[] = [];

  const newPage = (kind: string) => () => {
    const p = doc.createElement('div');
    p.className = kind ? `page ${kind}` : 'page';
    const head = doc.createElement('div');
    head.className = 'page-head';
    const t = doc.createElement('span');
    t.className = 'ph-title';
    const c = doc.createElement('span');
    c.className = 'ph-chap';
    head.append(t, c);
    const body = doc.createElement('div');
    body.className = 'page-body';
    const foot = doc.createElement('div');
    foot.className = 'page-foot';
    p.append(head, body, foot);
    book.appendChild(p);
    pages.push(p);
    return body;
  };
  const dropPage = () => pages.pop()?.remove();
  const rules = { fits, keepWithNext, atomic, avoidBreak, isChrome, afterSplit, dropPage };

  if (s.cover) {
    const p = doc.createElement('div');
    p.className = 'page cover';
    p.appendChild(coverInner(d, doc));
    book.appendChild(p);
    pages.push(p);
  }
  if (s.toc && d.headings.length)
    flowPaginate(tocBlocks(d, doc), { ...rules, newPage: newPage('toc-page') });
  const blocks: Element[] = [...d.root.children];
  if (!s.cover) blocks.unshift(titleBlock(d, doc));
  flowPaginate(blocks, {
    ...rules,
    newPage: newPage(''),
    isBreak: (el) => el.classList.contains('pb'),
    breakBefore: s.chapter ? (el) => el.tagName === 'H2' : undefined,
  });

  /* 頁碼 */
  pages.forEach((p, i) => {
    p.dataset.no = String(i + 1);
    p.classList.add((i + 1) % 2 ? 'odd' : 'even');
    const foot = p.querySelector('.page-foot');
    if (foot) foot.textContent = String(i + 1);
  });
  /* 目錄的頁碼 */
  for (const a of book.querySelectorAll<HTMLElement>('.toc-item')) {
    const target = book.querySelector(`[id="${a.dataset.target ?? ''}"]`);
    const pg = a.querySelector('.pg');
    if (pg) pg.textContent = (target?.closest<HTMLElement>('.page')?.dataset.no ?? '') || '';
  }
  /* 書眉 */
  const title = plainTitle(d.title);
  let chap: { num: string; text: string } | null = null;
  for (const p of pages) {
    if (p.classList.contains('cover')) continue;
    const hs = p.querySelectorAll<HTMLElement>('.page-body h2[id]');
    const head = p.querySelector('.page-head');
    const first = hs[0];
    const cur = p.classList.contains('toc-page')
      ? { num: '', text: PAPER_TEXT.toc }
      : first
        ? { num: first.dataset.num ?? '', text: chapterText(first) }
        : chap;
    if (head) {
      if (s.header && (title || cur)) {
        head.querySelector('.ph-title')?.append(title);
        const c = head.querySelector('.ph-chap');
        if (c && cur) {
          if (cur.num) {
            const b = doc.createElement('b');
            b.textContent = cur.num;
            c.append(b);
          }
          c.append(cur.text);
        }
      } else head.remove();
    }
    if (hs.length) {
      const h = hs[hs.length - 1];
      chap = { num: h.dataset.num ?? '', text: chapterText(h) };
    }
  }
  /* 放不下的頁 */
  let over = 0;
  for (const p of pages) {
    const body = p.querySelector<HTMLElement>('.page-body');
    if (body && !fits(body)) {
      p.classList.add('overflow');
      over++;
    }
  }
  return { book, pages: pages.length, over };
}

/** 列印、列印用 HTML 用的複本：拿掉編輯用的東西（游標外框、行號） */
export function cleanBook(book: HTMLElement): HTMLElement {
  const copy = book.cloneNode(true) as HTMLElement;
  for (const el of copy.querySelectorAll('.is-cursor')) el.classList.remove('is-cursor');
  for (const el of copy.querySelectorAll('[data-line]')) el.removeAttribute('data-line');
  return copy;
}
