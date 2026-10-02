/**
 * 自動分頁：把一串項目（段落）依序放進固定大小的頁面，放不進版心的整個送到下一頁（項目不切開）。
 * 用瀏覽器實際排版的結果量溢出，所以字型、分欄（column）、浮動、跨欄都照真實的樣子。
 *
 * ```ts
 * const pages = paginate({
 *   host: stage,
 *   sections: [blocksBeforeBreak, blocksAfterBreak],
 *   createPage: (i) => makePageElement(i),          // { root, body }：root 放進 host，項目放進 body
 *   renderItem: (b, { pageIndex, before }) => el,   // before＝這頁已經放的項目
 * });
 * ```
 */

export interface PageFrame {
  /** 整頁的元素（加進 host） */
  root: HTMLElement;
  /** 放項目的容器（量溢出的對象，padding 是版心外的留白） */
  body: HTMLElement;
}

export interface RenderContext<T> {
  pageIndex: number;
  /** 這一頁已經放了哪些項目（依序） */
  before: readonly T[];
}

export interface PaginateOptions<T> {
  host: HTMLElement;
  /** 每一段從新的一頁開始（換頁） */
  sections: readonly (readonly T[])[];
  /** 建立一頁；body 裡可以先放東西（例如繞排用的浮動框），項目接在它們後面 */
  createPage: (pageIndex: number) => PageFrame;
  renderItem: (item: T, ctx: RenderContext<T>) => HTMLElement;
  /** 不在流程裡、量溢出時跳過的元素（例如絕對定位的圖片） */
  isOutOfFlow?: (el: Element) => boolean;
  /** 一次加幾個項目再檢查溢出（預設 40）；越小越省、但量的次數越多 */
  chunk?: number;
}

/**
 * 容器內第一個超出版心（右邊或下邊，誤差 1 px）的子元素索引（從 from 開始找）；都沒超出時 -1。
 */
export function firstOverflow(
  body: HTMLElement,
  isOutOfFlow?: (el: Element) => boolean,
  from = 0,
): number {
  const cs = getComputedStyle(body);
  const cr = body.getBoundingClientRect();
  /* 頁面可能被 transform 縮放：用實際量到的倍率換算 padding（getComputedStyle 的值是原尺寸） */
  const scale = body.offsetWidth ? cr.width / body.offsetWidth : 1;
  const right = cr.right - Number.parseFloat(cs.paddingRight) * scale + 1;
  const bottom = cr.bottom - Number.parseFloat(cs.paddingBottom) * scale + 1;
  const kids = body.children;
  for (let i = from; i < kids.length; i++) {
    if (isOutOfFlow?.(kids[i])) continue;
    const r = kids[i].getBoundingClientRect();
    if (r.right > right || r.bottom > bottom) return i;
  }
  return -1;
}

/** 分頁；回傳每一頁放了哪些項目（頁面元素留在 host 裡） */
export function paginate<T>(opts: PaginateOptions<T>): T[][] {
  const { host, sections, createPage, renderItem, isOutOfFlow } = opts;
  const chunk = Math.max(1, opts.chunk ?? 40);
  const pages: T[][] = [];
  let pi = 0;
  for (let si = 0; si < sections.length; si++) {
    let rest = sections[si].slice();
    do {
      const frame = createPage(pi);
      host.appendChild(frame.root);
      const base = frame.body.children.length;
      const placed: T[] = [];
      let appended = 0;
      /* 一次加一批，最後一個已經溢出就不再加（之前的項目位置不受之後的項目影響） */
      while (appended < rest.length) {
        const end = Math.min(rest.length, appended + chunk);
        for (let k = appended; k < end; k++) {
          frame.body.appendChild(renderItem(rest[k], { pageIndex: pi, before: rest.slice(0, k) }));
        }
        appended = end;
        if (firstOverflow(frame.body, isOutOfFlow, base) >= 0) break;
      }
      const k = firstOverflow(frame.body, isOutOfFlow, base);
      /* 一個都放不下時硬放一個（否則會一直換頁） */
      const count = k < 0 ? appended : Math.max(1, k - base);
      for (let i = frame.body.children.length - 1; i >= base + count; i--)
        frame.body.children[i].remove();
      for (let i = 0; i < count; i++) placed.push(rest[i]);
      pages.push(placed);
      rest = rest.slice(count);
      pi++;
    } while (rest.length);
  }
  return pages;
}

/** 等頁面裡的圖片與字型載入（分頁、列印、PDF 之前） */
export async function settleContent(root: ParentNode, doc: Document = document): Promise<void> {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(
    imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
  );
  try {
    await doc.fonts?.ready;
  } catch {
    /* 沒有 FontFaceSet 的環境 */
  }
}
