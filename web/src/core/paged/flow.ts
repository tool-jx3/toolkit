/**
 * 流動分頁（CoC 劇本排版工具移植時新增）：把一串區塊依序放進固定大小的頁面，放不下的區塊**在頁尾切開**、其餘接到下一頁。
 * `paginate` 是「項目不切開」；這個是書本那樣的連續排版：段落在字與字之間切開（避頭尾）、清單與表格逐項切開、
 * 框類的區塊盡量整個送到下一頁、頁尾的標題跟著下一段走。
 *
 * 一樣用瀏覽器實際排版的結果量溢出，所以要在**沒有縮放**的容器裡排（例如畫面外的 `position:fixed` 容器），排好再搬去顯示。
 *
 * ```ts
 * const pages: HTMLElement[] = [];
 * flowPaginate([...root.children], {
 *   newPage: () => { const p = makePage(); host.append(p); pages.push(p); return p.querySelector('.body')!; },
 *   dropPage: () => pages.pop()?.remove(),
 *   keepWithNext: (el) => /^H[1-6]$/.test(el.tagName),
 *   avoidBreak: (el) => el.matches('.box,table'),
 *   isChrome: (n) => n instanceof Element && n.matches('.box-label,thead'),
 *   afterSplit: (rest, part) => { … 例如在 rest 的標籤後面加「（續）」 },
 * });
 * ```
 *
 * 切開後加的 class（樣式由工具決定）：
 * - `flow-cont`：接到下一頁的部分（段落、清單項目…；例如清單項目不顯示項目符號）
 * - `flow-last-line`：在頁尾被切開的段落（讓最後一行左右對齊：`text-align-last: justify`）
 * - `flow-joined`：段落裡有換行時，最後一個換行之後的那一行另外分成一段（加 `flow-last-line flow-cont`），前面那段加這個（下邊距 0）
 */

/** 不能放在行首的標點（切開段落時，下一頁不以它們開頭） */
export const KINSOKU_NO_START =
  '、。，．,.・：；:;？！?!－―…‥」』）)】〕］]｝}〉》”’〗〙﹐﹑﹒﹔﹕﹖﹗';
/** 不能放在行尾的標點（切開段落時，這一頁不以它們結尾） */
export const KINSOKU_NO_END = '「『（(【〔［[｛{〈《“‘〖〘';

/** 預設可以切開的元素 */
export const FLOW_SPLITTABLE_TAGS: ReadonlySet<string> = new Set([
  'P',
  'UL',
  'OL',
  'LI',
  'DIV',
  'SECTION',
  'TABLE',
  'TBODY',
  'BLOCKQUOTE',
  'STRONG',
  'EM',
  'A',
  'DEL',
  'DL',
  'DD',
]);

export const FLOW_CLASSES = {
  cont: 'flow-cont',
  lastLine: 'flow-last-line',
  joined: 'flow-joined',
} as const;

export interface FlowOptions {
  /** 建立新的一頁，回傳放內容的容器（量溢出的對象） */
  newPage: () => HTMLElement;
  /** 拿掉最後建立的那一頁 */
  dropPage: () => void;
  /**
   * 這個容器的內容放得下嗎？預設：最後一個子元素的下緣不超過容器的內容下緣 0.5 px。
   * （測試時可以換成依字數判斷）
   */
  fits?: (body: HTMLElement) => boolean;
  /** 換頁記號（不放進頁面；這一頁已有內容時換頁） */
  isBreak?: (el: Element) => boolean;
  /** 放進去之前先換頁（例如每章換頁；這一頁已有內容時才換） */
  breakBefore?: (el: Element) => boolean;
  /** 不單獨留在頁尾（標題）：換頁時和後面的區塊一起搬到下一頁 */
  keepWithNext?: (el: Element) => boolean;
  /** 不切開（標題、分隔線、圖片）。預設：h1～h6、hr、img */
  atomic?: (el: Element) => boolean;
  /** 盡量不切開：這一頁放不下時，先試著整個放到下一頁 */
  avoidBreak?: (el: Element) => boolean;
  /** 可以切開的元素。預設：`FLOW_SPLITTABLE_TAGS` */
  splittable?: (el: Element) => boolean;
  /** 標籤類（框的標籤、表頭）：不切開、也不算內容（只放得下標籤時整個區塊不切） */
  isChrome?: (node: Node) => boolean;
  /** 空的區塊（跳過）。預設：沒有文字、也沒有圖片或分隔線（hr、img 本身不算空） */
  isEmpty?: (el: Element) => boolean;
  /**
   * 切開之後（內建的處理之後）：rest＝留到下一頁的部分、part＝放進這一頁的部分。
   * 例如在 rest 重複標籤、加「（續）」。
   */
  afterSplit?: (rest: Element, part: Element) => void;
  /** 避頭尾的字（預設 `KINSOKU_NO_START`／`KINSOKU_NO_END`） */
  noStart?: string;
  noEnd?: string;
  /** 安全上限（預設 50000 步） */
  maxSteps?: number;
}

export interface FlowResult {
  /** 建立的頁數（拿掉最後空白頁之後） */
  pages: number;
}

type Split = 'all' | 'partial' | 'none';

const HEADING = /^H[1-6]$/;

function defaultFits(body: HTMLElement): boolean {
  const last = body.lastElementChild;
  if (!last) return true;
  const pad = Number.parseFloat(getComputedStyle(body).paddingBottom) || 0;
  return last.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom - pad + 0.5;
}

function defaultEmpty(el: Element): boolean {
  if (el.tagName === 'HR' || el.tagName === 'IMG') return false;
  return !el.textContent?.trim() && !el.querySelector('img,hr');
}

const isBlankNode = (n: Node | null): boolean =>
  !!n && (n.nodeName === 'BR' || (n.nodeType === 3 && !(n as Text).data.trim()));

/**
 * 在頁尾被切開的段落，只讓最後一行左右對齊。
 * text-align-last 對換行（<br>）前的每一行也有效，所以把最後一個 <br> 之後的內容另外分成一段。
 */
function justifyLastLine(dst: Element): void {
  if (dst.tagName !== 'P') return;
  const brs = dst.querySelectorAll(':scope > br');
  if (!brs.length) {
    dst.classList.add(FLOW_CLASSES.lastLine);
    return;
  }
  const lastBr = brs[brs.length - 1];
  const tail = dst.ownerDocument.createElement('p');
  tail.className = `${FLOW_CLASSES.lastLine} ${FLOW_CLASSES.cont}`;
  while (lastBr.nextSibling) tail.appendChild(lastBr.nextSibling);
  lastBr.remove();
  dst.classList.add(FLOW_CLASSES.joined);
  dst.after(tail);
}

/** 內建的切開後處理：去掉切口的空白與換行、接續標記、編號清單的起始號碼、表頭重複 */
function baseAfterSplit(rest: Element, part: Element): void {
  while (isBlankNode(part.lastChild)) part.lastChild?.remove();
  const tag = rest.tagName;
  if (tag === 'P' || tag === 'LI') {
    while (isBlankNode(rest.firstChild)) rest.firstChild?.remove();
    const first = rest.firstChild;
    if (first && first.nodeType === 3)
      (first as Text).data = (first as Text).data.replace(/^\s+/, '');
    rest.classList.add(FLOW_CLASSES.cont);
  }
  if (tag === 'OL') {
    const start = Number(rest.getAttribute('start') || 1);
    let done = part.querySelectorAll(':scope > li').length;
    /* 最後一項被切開時，下一頁的第一項是它的後半（不佔新的號碼） */
    if (rest.firstElementChild?.classList.contains(FLOW_CLASSES.cont)) done--;
    rest.setAttribute('start', String(start + done));
  }
  if (tag === 'TABLE' && !rest.querySelector(':scope > thead')) {
    const th = part.querySelector(':scope > thead');
    if (th) rest.prepend(th.cloneNode(true));
  }
}

/**
 * 依序把區塊放進頁面，放不下的切開接到下一頁。區塊元素會被搬進頁面（切開時原本的元素留著剩下的部分）。
 */
export function flowPaginate(blocks: readonly Element[], o: FlowOptions): FlowResult {
  const fits = o.fits ?? defaultFits;
  const isBreak = o.isBreak ?? (() => false);
  const breakBefore = o.breakBefore ?? (() => false);
  const keepWithNext = o.keepWithNext ?? ((el: Element) => HEADING.test(el.tagName));
  const atomic =
    o.atomic ??
    ((el: Element) => HEADING.test(el.tagName) || el.tagName === 'HR' || el.tagName === 'IMG');
  const avoidBreak = o.avoidBreak ?? (() => false);
  const splittable = o.splittable ?? ((el: Element) => FLOW_SPLITTABLE_TAGS.has(el.tagName));
  const isChrome = o.isChrome ?? (() => false);
  const isEmpty = o.isEmpty ?? defaultEmpty;
  const noStart = o.noStart ?? KINSOKU_NO_START;
  const noEnd = o.noEnd ?? KINSOKU_NO_END;
  const meaningful = (n: Node) => (n.nodeType === 3 ? !!(n as Text).data.trim() : !isChrome(n));
  let pages = 0;
  const newPage = () => {
    pages++;
    return o.newPage();
  };
  const dropPage = () => {
    pages--;
    o.dropPage();
  };

  /** 文字節點：找出放得下的最長前段（避頭尾），其餘留在原節點 */
  const splitText = (t: Text, dst: Element, body: HTMLElement): boolean => {
    const s = t.data;
    const probe = t.ownerDocument.createTextNode('');
    dst.appendChild(probe);
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      probe.data = s.slice(0, mid);
      if (fits(body)) lo = mid;
      else hi = mid - 1;
    }
    let k = lo;
    while (k > 0 && k < s.length && noStart.includes(s[k])) k--;
    while (k > 0 && noEnd.includes(s[k - 1])) k--;
    if (k <= 0 || !s.slice(0, k).trim()) {
      probe.remove();
      return false;
    }
    probe.data = s.slice(0, k);
    t.data = s.slice(k).replace(/^\s+/, '');
    justifyLastLine(dst);
    return true;
  };

  const afterSplit = (rest: Element, part: Element) => {
    baseAfterSplit(rest, part);
    o.afterSplit?.(rest, part);
  };

  /** 把 src 的子節點盡量搬進 dst，放不下的留在 src */
  const fill = (src: Element, dst: Element, body: HTMLElement): Split => {
    let moved = false;
    while (src.firstChild) {
      const n = src.firstChild;
      dst.appendChild(n);
      if (fits(body)) {
        if (meaningful(n)) moved = true;
        continue;
      }
      src.insertBefore(n, src.firstChild);
      if (n.nodeType === 3) {
        if (splitText(n as Text, dst, body)) moved = true;
      } else if (n.nodeType === 1 && splittable(n as Element) && !isChrome(n)) {
        const el = n as Element;
        const part = el.cloneNode(false) as Element;
        part.removeAttribute('id');
        dst.appendChild(part);
        const r = fill(el, part, body);
        if (r === 'none') {
          while (part.lastChild) el.insertBefore(part.lastChild, el.firstChild);
          part.remove();
        } else {
          afterSplit(el, part);
          moved = true;
        }
      }
      return moved ? 'partial' : 'none';
    }
    return 'all';
  };

  const splitInto = (b: Element, body: HTMLElement): Split => {
    const part = b.cloneNode(false) as Element;
    part.removeAttribute('id');
    body.appendChild(part);
    const r = fill(b, part, body);
    if (r === 'none') {
      while (part.lastChild) b.insertBefore(part.lastChild, b.firstChild);
      part.remove();
      return 'none';
    }
    afterSplit(b, part);
    return r;
  };

  /** 把留在上一頁最後的標題搬到下一頁（整頁都是標題時不搬） */
  const carry = (from: HTMLElement, to: HTMLElement): Element[] => {
    const trail: Element[] = [];
    let c = from.lastElementChild;
    while (c && keepWithNext(c)) {
      trail.unshift(c);
      c = c.previousElementSibling;
    }
    if (!c) return [];
    for (const x of trail) to.appendChild(x);
    return trail;
  };
  const hasRealContent = (body: HTMLElement) => [...body.children].some((c) => !keepWithNext(c));

  let body = newPage();
  const q = blocks.slice();
  let guard = 0;
  const maxSteps = o.maxSteps ?? 50000;
  while (q.length && ++guard < maxSteps) {
    const b = q.shift() as Element;
    if (isBreak(b)) {
      if (body.children.length) body = newPage();
      continue;
    }
    if (isEmpty(b)) continue;
    if (body.children.length && breakBefore(b)) body = newPage();
    body.appendChild(b);
    if (fits(body)) continue;
    body.removeChild(b);
    const empty = !body.children.length;

    if (!empty && atomic(b)) {
      const nb = newPage();
      carry(body, nb);
      nb.appendChild(b);
      body = nb;
      continue;
    }
    if (!empty && avoidBreak(b) && hasRealContent(body)) {
      const nb = newPage();
      const moved = carry(body, nb);
      nb.appendChild(b);
      if (fits(nb)) {
        body = nb;
        continue;
      }
      nb.removeChild(b);
      for (const x of moved) body.appendChild(x);
      dropPage();
    }
    const r = atomic(b) ? 'none' : splitInto(b, body);
    if (r === 'none') {
      if (empty) {
        /* 一頁放不下的內容：照樣放（超出版心），換頁 */
        body.appendChild(b);
        body = newPage();
      } else {
        const nb = newPage();
        carry(body, nb);
        body = nb;
        q.unshift(b);
      }
    } else {
      body = newPage();
      q.unshift(b);
    }
  }
  if (!body.children.length) dropPage();
  return { pages };
}
