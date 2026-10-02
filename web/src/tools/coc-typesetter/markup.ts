/**
 * 內文 → 紙面用的 DOM（規格 3.4、3.5.2～3.5.4、3.5.6）：
 * 依標記切成區塊（框、描述、檢定、換頁），其餘交給 Markdown（marked，GFM、單一換行就是換行），
 * 清理 HTML（DOMPurify）、標示技能與理智檢定、替章與探索點編號。每個區塊記下它在文字欄的起始行（data-line）。
 * 需要 DOM（瀏覽器或 jsdom）。
 */
import DOMPurify from 'dompurify';
import { Marked, type TokensList } from 'marked';
import type { Meta } from './model';
import { PAPER_TEXT } from './strings';
import {
  boxOpen,
  charCount,
  descLine,
  isBoxClose,
  isDesc,
  isFence,
  isJudge,
  isPageBreak,
  isStructural,
  judgeHead,
  splitDeco,
} from './syntax';

const md = new Marked({ gfm: true, breaks: true });

const esc = (s: string): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

/** Markdown 的行內標記（標籤、標題、概要） */
export const inlineMd = (s: string): string => md.parseInline(s || '') as string;
const blockMd = (s: string): string => md.parse(s) as string;

/** 第一個標籤加上 data-line */
const withLine = (html: string, n: number): string =>
  html.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-line="${n}"`);

/** 一般 Markdown：每個區塊（段落、標題、清單、表格…）各自記起始行 */
function markdownWithLines(text: string, start: number): string {
  const toks = md.lexer(text);
  let ln = start;
  let out = '';
  for (const tok of toks) {
    if (tok.type !== 'space') {
      const one = Object.assign([tok], { links: toks.links }) as TokensList;
      out += withLine(md.parser(one), ln);
    }
    ln += (tok.raw.match(/\n/g) ?? []).length;
  }
  return out;
}

/** 依標記切成區塊的 HTML（lines：這一段的行；base：第一行的行號） */
export function blocksToHtml(lines: readonly string[], base: number): string {
  const out: string[] = [];
  let buf: string[] = [];
  let bufStart = 0;
  let fence = false;
  const flush = () => {
    if (buf.join('').trim()) out.push(markdownWithLines(buf.join('\n'), base + bufStart));
    buf = [];
  };
  const push = (i: number, l: string) => {
    if (!buf.length) bufStart = i;
    buf.push(l);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFence(line)) {
      fence = !fence;
      push(i, line);
      continue;
    }
    if (fence) {
      push(i, line);
      continue;
    }
    if (isPageBreak(line)) {
      flush();
      out.push('<div class="pb"></div>');
      continue;
    }
    const bo = boxOpen(line);
    if (bo) {
      flush();
      const inner: string[] = [];
      let depth = 1;
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (boxOpen(lines[j])) depth++;
        else if (isBoxClose(lines[j]) && --depth === 0) break;
        inner.push(lines[j]);
      }
      const label = bo.label || PAPER_TEXT.boxLabels[bo.kind];
      out.push(
        `<div class="box box-${bo.kind}" data-line="${base + i}"><div class="box-label">${inlineMd(label)}</div><div class="box-body">${blocksToHtml(inner, base + i + 1)}</div></div>`,
      );
      i = j;
      continue;
    }
    if (isDesc(line)) {
      flush();
      const start = i;
      const inner: string[] = [];
      while (i < lines.length && isDesc(lines[i])) {
        inner.push(descLine(lines[i]));
        i++;
      }
      i--;
      out.push(
        `<div class="desc" data-line="${base + start}"><div class="desc-label">${PAPER_TEXT.desc}</div><div class="desc-body">${blockMd(inner.join('\n'))}</div></div>`,
      );
      continue;
    }
    if (isJudge(line)) {
      flush();
      const inner: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim() || isStructural(l)) break;
        inner.push(l);
      }
      const body = inner.length ? `<div class="judge-body">${blockMd(inner.join('\n'))}</div>` : '';
      out.push(
        `<div class="judge" data-line="${base + i}"><div class="judge-head"><span class="judge-mark">▼</span><span class="judge-title">${inlineMd(judgeHead(line))}</span></div>${body}</div>`,
      );
      i = j - 1;
      continue;
    }
    push(i, line);
  }
  flush();
  return out.join('\n');
}

/** 技能與理智檢定加上標示（程式碼裡、已經標示過的不處理） */
export function decorate(root: Element): void {
  const doc = root.ownerDocument;
  const tw = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  while (tw.nextNode()) nodes.push(tw.currentNode as Text);
  for (const t of nodes) {
    if (t.parentElement?.closest('code,pre,.skill,.san')) continue;
    const parts = splitDeco(t.data);
    if (parts.length === 1 && !parts[0].kind) continue;
    const frag = doc.createDocumentFragment();
    for (const p of parts) {
      if (!p.kind) {
        frag.append(p.text);
        continue;
      }
      const sp = doc.createElement('span');
      sp.className = p.kind;
      sp.textContent = p.text;
      frag.append(sp);
    }
    t.replaceWith(frag);
  }
}

/** 清理 HTML、加上技能與理智檢定的標示，回傳裝著結果的 <div> */
export function toElement(html: string, doc: Document = document): HTMLDivElement {
  const root = doc.createElement('div');
  root.innerHTML = DOMPurify.sanitize(html) as unknown as string;
  decorate(root);
  return root;
}

export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
  /** 章的編號（01、02…）；探索點是空字串 */
  num: string;
}

export interface OverviewItem {
  key: string;
  value: string;
}

export interface ParsedDoc {
  title: string;
  subtitle: string;
  author: string;
  overview: OverviewItem[];
  /** 字數（3.10） */
  chars: number;
  /** 內文的區塊（root 的子元素） */
  root: HTMLDivElement;
  headings: Heading[];
}

/**
 * 內文＋封面與概要 → 排版用的資料。章標題改成「編號＋章名」兩個 span（新版的外觀；編號是真的文字）。
 */
export function parseDoc(src: string, meta: Meta, doc: Document = document): ParsedDoc {
  const text = src.replace(/\r\n?/g, '\n');
  const root = toElement(blocksToHtml(text.split('\n'), 0), doc);
  const headings: Heading[] = [];
  let n = 0;
  let ch = 0;
  for (const h of root.querySelectorAll('h2,h3')) {
    h.id = `sec-${++n}`;
    const level = h.tagName === 'H2' ? 2 : 3;
    const item: Heading = { level, text: (h.textContent ?? '').trim(), id: h.id, num: '' };
    if (level === 2) {
      item.num = String(++ch).padStart(2, '0');
      h.setAttribute('data-num', item.num);
      const tx = doc.createElement('span');
      tx.className = 'ch-tx';
      while (h.firstChild) tx.appendChild(h.firstChild);
      const no = doc.createElement('span');
      no.className = 'ch-no';
      no.textContent = item.num;
      h.append(no, tx);
    } else {
      const mk = doc.createElement('span');
      mk.className = 'sc-mk';
      mk.setAttribute('aria-hidden', 'true');
      h.prepend(mk);
    }
    headings.push(item);
  }
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    author: meta.author,
    overview: meta.items.filter((x) => x.key.trim() && x.value.trim()),
    chars: charCount(text),
    root,
    headings,
  };
}

/** 章名（不含編號） */
export const chapterText = (h: Element): string =>
  (h.querySelector('.ch-tx')?.textContent ?? h.textContent ?? '').trim();

/* ---------- 封面、標題區、目錄 ---------- */

/** 概要（3.4.4） */
export function specHtml(overview: readonly OverviewItem[]): string {
  if (!overview.length) return '';
  const items = overview
    .map((x) => {
      const wide = [...x.value].length > 16 || overview.length === 1;
      return `<div class="spec-item${wide ? ' wide' : ''}"><dt>${esc(x.key)}</dt><dd>${inlineMd(x.value)}</dd></div>`;
    })
    .join('');
  return `<dl class="spec">${items}</dl>`;
}

/** 封面頁的內容（3.4.1） */
export function coverInner(d: ParsedDoc, doc: Document = document): HTMLDivElement {
  const html = `<div class="cover-inner"><div class="cv-frame"></div>
<div class="cv-top">${PAPER_TEXT.coverMark}</div>
<div class="cv-main">
<h1 class="cv-title">${inlineMd(d.title || PAPER_TEXT.untitled)}</h1>
${d.subtitle ? `<div class="cv-sub">${inlineMd(d.subtitle)}</div>` : ''}
<div class="cv-orn"><span></span><span></span><span></span></div>
${d.author ? `<div class="cv-author">${inlineMd(d.author)}</div>` : ''}
</div>
${specHtml(d.overview)}
</div>`;
  return toElement(html, doc).firstElementChild as HTMLDivElement;
}

/** 沒有封面時的標題區（3.4.2） */
export function titleBlock(d: ParsedDoc, doc: Document = document): HTMLElement {
  const html = `<div class="titleblock">
<div class="tb-title">${inlineMd(d.title || PAPER_TEXT.untitled)}</div>
${d.subtitle ? `<div class="tb-sub">${inlineMd(d.subtitle)}</div>` : ''}
${d.author ? `<div class="tb-author">${PAPER_TEXT.author}　${inlineMd(d.author)}</div>` : ''}
${specHtml(d.overview)}
</div>`;
  return toElement(html, doc).firstElementChild as HTMLElement;
}

/** 目錄的區塊：標題＋每個章、探索點一列（頁碼之後填） */
export function tocBlocks(d: ParsedDoc, doc: Document = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  const h = doc.createElement('h2');
  h.className = 'toc-title';
  const mark = doc.createElement('span');
  mark.className = 'toc-mark';
  mark.textContent = PAPER_TEXT.tocMark;
  const tx = doc.createElement('span');
  tx.className = 'toc-tx';
  tx.textContent = PAPER_TEXT.toc;
  h.append(mark, tx);
  out.push(h);
  for (const x of d.headings) {
    const a = doc.createElement('a');
    a.className = `toc-item lv${x.level}${x.level === 2 ? ' kwn' : ''}`;
    a.href = `#${x.id}`;
    a.dataset.target = x.id;
    const n = doc.createElement('span');
    n.className = 'n';
    n.textContent = x.num;
    const t = doc.createElement('span');
    t.className = 't';
    t.textContent = x.text;
    const dots = doc.createElement('span');
    dots.className = 'dots';
    const pg = doc.createElement('span');
    pg.className = 'pg';
    pg.textContent = '00';
    a.append(n, t, dots, pg);
    out.push(a);
  }
  return out;
}
