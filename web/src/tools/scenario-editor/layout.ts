/**
 * 紙面的自動分頁（3.2.7）：用共用的 core/paged 依瀏覽器實際排版的結果分頁。
 * 編輯畫面、列印、PDF、頁面一覽都用同一份分頁結果（每頁放了哪些段落）。
 */
import { paginate } from '@/core/paged';
import { allBlocks, gapPull, isFreeImg, subLists } from './model/blocks';
import type { Block, Doc } from './model/types';
import {
  appendixItems,
  blockHtml,
  footHtml,
  freeImagesOn,
  freeShapeHtml,
  inFlow,
  pageOpenHtml,
  pageSettingAt,
  type RenderCtx,
  tocHtml,
} from './render/html';
import type { Layout } from './store';

/** 原稿依換頁切成幾段（換頁本身不放進頁面；自由配置的圖片與只給儲存格用的彈出視窗不在流程裡） */
export function sectionsOf(doc: Pick<Doc, 'blocks'>): {
  sections: Block[][];
  breaks: (Block | null)[];
} {
  const sections: Block[][] = [[]];
  const breaks: (Block | null)[] = [];
  for (const b of doc.blocks) {
    if (b.type === 'break') {
      breaks.push(b);
      sections.push([]);
      continue;
    }
    if (inFlow(b)) sections[sections.length - 1].push(b);
  }
  breaks.push(null);
  return { sections, breaks };
}

function htmlToElement(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return (t.content.firstElementChild as HTMLElement | null) ?? document.createElement('div');
}

export interface LayoutOptions {
  /** 編輯畫面（頁首的小列、彈出視窗按鈕可以按） */
  edit: boolean;
  /** 上一次的分頁（目錄的頁碼先用它，排完再補正） */
  prev?: Layout | null;
}

export interface LayoutResult extends Layout {
  /** 每頁的元素（編輯畫面是含頁首小列的外框，否則是 .pg） */
  pageEls: HTMLElement[];
}

const isOutOfFlow = (el: Element) =>
  el.classList.contains('imgshape') || el.classList.contains('free');

/** 頁首的小列（F182；列印與匯出不含） */
function pageHeadHtml(i: number, cols: 1 | 2): string {
  return `<div class="pghead" data-page="${i}"><span class="pghead-n">P.${i + 1}</span><label class="pghead-ck"><input type="checkbox" data-pgsel="${i}" aria-label="選取第 ${i + 1} 頁"><span>選取</span></label><span class="pghead-c">${cols === 2 ? '雙欄' : '單欄'}</span><span class="pghead-sp"></span><button type="button" class="pghead-b" data-pgcols="${i}">切換分欄</button></div>`;
}

/**
 * 分頁：把原稿排進 host（應該是沒有縮放、看不到的容器）。回傳每頁的段落與頁面元素（留在 host 裡）。
 */
export function layoutDoc(doc: Doc, host: HTMLElement, o: LayoutOptions): LayoutResult {
  host.replaceChildren();
  const pageOf = new Map<string, number>(Object.entries(o.prev?.pageOf ?? {}));
  const ctx: RenderCtx = {
    doc,
    edit: o.edit,
    pageOf: (id) => {
      const p = pageOf.get(id);
      return p == null ? null : p + 1;
    },
    total: o.prev?.pages.length ?? 1,
  };
  const { sections, breaks } = sectionsOf(doc);
  const pageEls: HTMLElement[] = [];
  const bodies: HTMLElement[] = [];
  const pages = paginate<Block>({
    host,
    sections,
    createPage: (i) => {
      const st = pageSettingAt(doc, i);
      const { open, close } = pageOpenHtml(i, ctx);
      const pg = htmlToElement(open + close);
      pg.querySelector('.pg-foot')?.remove();
      pg.dataset.page = String(i);
      const body = pg.querySelector('.pg-body') as HTMLElement;
      body.insertAdjacentHTML(
        'afterbegin',
        freeImagesOn(doc, i)
          .map((b) => freeShapeHtml(b, doc, st.cols))
          .join(''),
      );
      let root: HTMLElement = pg;
      if (o.edit) {
        root = document.createElement('div');
        root.className = 'pgwrap';
        root.dataset.page = String(i);
        root.insertAdjacentHTML('afterbegin', pageHeadHtml(i, st.cols));
        root.appendChild(pg);
      }
      pageEls.push(root);
      bodies.push(body);
      return { root, body };
    },
    renderItem: (b, { pageIndex, before }) => {
      const st = pageSettingAt(doc, pageIndex);
      const prev = before.length ? before[before.length - 1].type : null;
      const top = b.type !== 'colbr' && !before.some((x) => x.type !== 'colbr');
      return htmlToElement(blockHtml(b, ctx, { cols: st.cols, pull: gapPull(prev, b.type), top }));
    },
    isOutOfFlow,
  });
  const total = pages.length;
  /* 頁碼：本文的段落、儲存格裡的段落（＝表格的頁）、換頁（＝結束的那一頁） */
  pageOf.clear();
  const pageIds = pages.map((p) => p.map((b) => b.id));
  pageIds.forEach((ids, i) => {
    for (const id of ids) pageOf.set(id, i);
  });
  let pi = 0;
  sections.forEach((sec, si) => {
    const n = Math.max(1, countPagesOfSection(sec, pages, pi));
    pi += n;
    const br = breaks[si];
    if (br) pageOf.set(br.id, pi - 1);
  });
  for (const b of doc.blocks) {
    const p = pageOf.get(b.id);
    if (p == null) continue;
    if (b.type === 'table')
      for (const l of subLists(b)) for (const x of walk(l)) pageOf.set(x.id, p);
  }
  for (const b of doc.blocks)
    if (isFreeImg(b)) {
      const p = Math.max(1, +(b.pg ?? 1) || 1) - 1;
      if (p < total) pageOf.set(b.id, p);
    }
  ctx.total = total;
  /* 自由配置的圖片、頁尾、目錄的頁碼 */
  bodies.forEach((body, i) => {
    const st = pageSettingAt(doc, i);
    for (const b of freeImagesOn(doc, i))
      body.appendChild(htmlToElement(blockHtml(b, ctx, { cols: st.cols, pull: 0, top: false })));
    const foot = footHtml(i, total, doc);
    if (foot) body.parentElement?.insertAdjacentHTML('beforeend', foot);
  });
  for (const el of host.querySelectorAll<HTMLElement>('.bp-toc')) {
    const b = doc.blocks.find((x) => x.id === el.dataset.id);
    const inner = el.querySelector('.t-toc');
    if (b && inner) inner.innerHTML = tocHtml(b, ctx);
  }
  /* 放不下的 NPC 卡（F166） */
  const over: string[] = [];
  bodies.forEach((body) => {
    const cs = getComputedStyle(body);
    const r = body.getBoundingClientRect();
    const bottom = r.bottom - Number.parseFloat(cs.paddingBottom) + 1;
    const right = r.right - Number.parseFloat(cs.paddingRight) + 1;
    for (const el of body.querySelectorAll<HTMLElement>(':scope > .bp-npc')) {
      const er = el.getBoundingClientRect();
      if (er.bottom > bottom || er.right > right) {
        over.push(el.dataset.id ?? '');
        if (o.edit) {
          el.classList.add('npc-over');
          el.insertAdjacentHTML('beforeend', '<span class="npc-over-lb">頁面放不下</span>');
        }
      }
    }
  });
  return { pages: pageIds, pageOf: Object.fromEntries(pageOf), over, pageEls };
}

function* walk(list: readonly Block[]): Generator<Block> {
  for (const b of list) {
    yield b;
    for (const l of subLists(b)) yield* walk(l);
  }
}

/** 這一段（換頁之間）用了幾頁：從 start 頁開始，數到這段的段落放完為止 */
function countPagesOfSection(
  sec: readonly Block[],
  pages: readonly Block[][],
  start: number,
): number {
  if (!sec.length) return 1;
  const last = sec[sec.length - 1];
  for (let i = start; i < pages.length; i++) if (pages[i].includes(last)) return i - start + 1;
  return 1;
}

/** 頁面一覽、標題清單用：每頁的標題（F201） */
export function pageTitleOf(doc: Doc, ids: readonly string[]): string {
  const byId = new Map(allBlocks(doc).map((b) => [b.id, b]));
  const list = ids.map((id) => byId.get(id)).filter((b): b is Block => !!b);
  const head = list.find(
    (b) =>
      ['cover', 'title', 'h1', 'h2', 'h3', 'scene'].includes(b.type) && String(b.text ?? '').trim(),
  );
  const firstLine = (s: unknown) =>
    String(s ?? '')
      .split('\n')
      .find((l) => l.trim())
      ?.trim() ?? '';
  if (head) return plain(firstLine(head.text));
  const text = list.find(
    (b) =>
      ['desc', 'dialog', 'note', 'proc', 'subtitle', 'colophon', 'vr', 'hr'].includes(b.type) &&
      String(b.text ?? '').trim(),
  );
  if (text) return plain(firstLine(text.text));
  const toc = list.find((b) => b.type === 'toc');
  if (toc) return '目錄';
  const npc = list.find((b) => b.type === 'npc' && String(b.npc?.name ?? '').trim());
  if (npc) return `NPC 卡：${String(npc.npc?.name).trim()}`;
  const img = list.find((b) => b.type === 'image' && String(b.cap ?? '').trim());
  if (img) return `圖片：${plain(firstLine(img.cap))}`;
  return '（沒有文字）';
}

const plain = (s: string) => s.replace(/[｜|]([^《》\n]+)《[^《》\n]+》/g, '$1').slice(0, 60);

/* ---------- 列印、PDF 用的靜態頁面 ---------- */

export interface StaticPages {
  /** .pg 的 HTML（範圍內的頁＋附錄頁） */
  html: string[];
}

/**
 * 附錄頁：把有內容的彈出視窗依原稿順序排進 A4 頁（3.6.6；新版附錄也照 A4 分頁）。
 * host 是看不到、沒有縮放的容器（排完會清空）。
 */
export function appendixPagesHtml(doc: Doc, ctx: RenderCtx, host: HTMLElement): string[] {
  const items = appendixItems(ctx, allBlocks(doc));
  if (!items.length) return [];
  host.replaceChildren();
  const last = Math.max(0, doc.pages.length - 1);
  const pages = paginate({
    host,
    sections: [items],
    createPage: () => {
      const { open, close } = pageOpenHtml(last, { ...ctx, total: 0 });
      const pg = htmlToElement(open + close);
      pg.classList.add('pg-appx-page');
      pg.querySelector('.pg-foot')?.remove();
      return { root: pg, body: pg.querySelector('.pg-body') as HTMLElement };
    },
    renderItem: (it, { before }) => {
      const prev = before.length ? before[before.length - 1].type : null;
      const top = !before.length;
      return htmlToElement(it.html({ cols: 1, pull: gapPull(prev, it.type), top }));
    },
  });
  const out = [...host.children].map((el) => (el as HTMLElement).outerHTML);
  host.replaceChildren();
  return pages.length ? out : [];
}
