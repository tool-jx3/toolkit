/**
 * 編輯區的 DOM ↔ 格式樹，以及在選取範圍上套用格式與效果。
 *
 * 編輯區的結構和原作相同：文字、`<br>`、`<span class="ansi-<代碼>">`、
 * `<span class="ansi-rgb" data-hex="#RRGGBB" data-fg="1">`（data-fg 只有前景色有）。
 * 套用格式的做法也照原作：取選取範圍的純文字（瀏覽器的 Selection.toString()，換行會變成 \n），
 * 刪掉選取的內容，在原處放一個新的格式、裡面是那段純文字——所以選取範圍裡原本的格式會消失，
 * 外層的格式保留（新的格式包在外層裡面）。同樣的操作得到同樣的結構，輸出才會和原作逐字相同。
 */
import { type AnsiNode, isValidCode } from './ansi';
import {
  type EffectColors,
  type EffectId,
  effectColors,
  normalizeHex,
  splitGraphemes,
} from './palette';

/** 要套用的格式：代碼（樣式、經典色）或 RGB 色 */
export type Format = { type: 'code'; code: number } | { type: 'rgb'; hex: string; fg: boolean };

export const RGB_CLASS = 'ansi-rgb';

/* ---------- 建立節點 ---------- */

function formatSpan(doc: Document, f: Format): HTMLSpanElement {
  const span = doc.createElement('span');
  if (f.type === 'code') {
    span.className = `ansi-${f.code}`;
    return span;
  }
  span.className = RGB_CLASS;
  span.dataset.hex = f.hex;
  if (f.fg) span.dataset.fg = '1';
  if (f.fg) span.style.color = f.hex;
  else span.style.backgroundColor = f.hex;
  return span;
}

/** 純文字 → 文字與 `<br>`（和瀏覽器設定 innerText 相同：\n、\r\n、\r 都是一個換行，空的段落不留文字節點） */
export function textToDom(doc: Document, value: string): Node[] {
  const out: Node[] = [];
  value.split(/\r\n|\r|\n/).forEach((part, i) => {
    if (i) out.push(doc.createElement('br'));
    if (part) out.push(doc.createTextNode(part));
  });
  return out;
}

/** 格式樹 → DOM 節點 */
export function renderNodes(doc: Document, nodes: readonly AnsiNode[]): Node[] {
  return nodes.map((n) => {
    if (n.type === 'text') return doc.createTextNode(n.text);
    if (n.type === 'br') return doc.createElement('br');
    const span = formatSpan(
      doc,
      n.type === 'code' ? { type: 'code', code: n.code } : { type: 'rgb', hex: n.hex, fg: n.fg },
    );
    span.append(...renderNodes(doc, n.children));
    return span;
  });
}

/** 把格式樹寫進編輯區（整個換掉） */
export function writeEditor(root: HTMLElement, nodes: readonly AnsiNode[]): void {
  root.replaceChildren(...renderNodes(root.ownerDocument, nodes));
}

/** 格式樹寫成 HTML 會是什麼樣子（判斷編輯區裡有沒有混進別的標記） */
export function canonicalHtml(doc: Document, nodes: readonly AnsiNode[]): string {
  const box = doc.createElement('div');
  box.append(...renderNodes(doc, nodes));
  return box.innerHTML;
}

/* ---------- 讀回 ---------- */

const BLOCKS = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'PRE',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TR',
  'TABLE',
  'SECTION',
  'ARTICLE',
]);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT']);

/** 元素是不是本工具的格式（不是的話只取裡面的內容） */
export function formatOf(el: Element): Format | null {
  if (el.nodeName !== 'SPAN') return null;
  const data = (el as HTMLElement).dataset;
  if (data.hex !== undefined) {
    const hex = normalizeHex(data.hex);
    return hex && el.classList.contains(RGB_CLASS) ? { type: 'rgb', hex, fg: !!data.fg } : null;
  }
  for (const c of el.classList) {
    const m = /^ansi-(\d+)$/.exec(c);
    if (m && isValidCode(Number(m[1]))) return { type: 'code', code: Number(m[1]) };
  }
  return null;
}

function pushText(out: AnsiNode[], value: string): void {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.text += value;
  else out.push({ type: 'text', text: value });
}

function pushAll(out: AnsiNode[], nodes: AnsiNode[]): void {
  for (const n of nodes) {
    if (n.type === 'text') pushText(out, n.text);
    else out.push(n);
  }
}

/**
 * DOM → 格式樹：文字、`<br>`、本工具的格式照原樣；其他元素（瀏覽器打字時加的 `<font>`、`<b>`，貼上的 HTML…）
 * 只取裡面的內容，區塊元素（div、p…）與前後的內容之間補換行。相鄰的文字合併。
 */
export function readNodes(root: Node): AnsiNode[] {
  const out: AnsiNode[] = [];
  let seen = false;
  let prevBlock = false;
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 3) {
      const value = child.nodeValue ?? '';
      if (value && seen && prevBlock) out.push({ type: 'br' });
      if (value) {
        pushText(out, value);
        seen = true;
        prevBlock = false;
      }
      continue;
    }
    if (child.nodeType !== 1 || SKIP.has(child.nodeName)) continue;
    const el = child as Element;
    const block = BLOCKS.has(el.nodeName);
    if (seen && (block || prevBlock)) out.push({ type: 'br' });
    /* 只有一個 <br> 的區塊是空行：換行由前後的分隔補上 */
    const emptyLine = block && el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR';
    const f = formatOf(el);
    if (el.nodeName === 'BR') out.push({ type: 'br' });
    else if (f?.type === 'code') out.push({ type: 'code', code: f.code, children: readNodes(el) });
    else if (f?.type === 'rgb')
      out.push({ type: 'rgb', hex: f.hex, fg: f.fg, children: readNodes(el) });
    else if (!emptyLine) pushAll(out, readNodes(el));
    seen = true;
    prevBlock = block;
  }
  return out;
}

/** 選取範圍的內容（含包住它的格式）：複製到剪貼簿用 */
export function selectedNodes(root: Node, range: Range): AnsiNode[] {
  let nodes = readNodes(range.cloneContents());
  for (let n: Node | null = range.commonAncestorContainer; n && n !== root; n = n.parentNode) {
    const f = n.nodeType === 1 ? formatOf(n as Element) : null;
    if (f?.type === 'code') nodes = [{ type: 'code', code: f.code, children: nodes }];
    else if (f?.type === 'rgb') nodes = [{ type: 'rgb', hex: f.hex, fg: f.fg, children: nodes }];
  }
  return nodes;
}

/** 剪貼簿的 HTML → 格式樹（從本工具複製的文字保留格式，其他只留文字） */
export function nodesFromHtml(html: string): AnsiNode[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return readNodes(parsed.body);
}

const hasFormat = (nodes: readonly AnsiNode[]): boolean =>
  nodes.some((n) => n.type === 'code' || n.type === 'rgb');

/**
 * 貼上的內容：HTML 裡有本工具的格式（從編輯區複製的）時用 HTML，否則用純文字
 * （其他網頁的 HTML 原始碼裡的空白、換行不代表畫面上的換行，瀏覽器給的純文字比較準）。
 */
export function nodesFromClipboard(html: string, plain: string): AnsiNode[] {
  if (html) {
    const nodes = nodesFromHtml(html);
    if (hasFormat(nodes)) return nodes;
  }
  return nodesFromText(plain);
}

/** 純文字 → 格式樹 */
export function nodesFromText(value: string): AnsiNode[] {
  const out: AnsiNode[] = [];
  value.split(/\r\n|\r|\n/).forEach((part, i) => {
    if (i) out.push({ type: 'br' });
    if (part) out.push({ type: 'text', text: part });
  });
  return out;
}

/* ---------- 位置（文字的字數＋每個換行算一個字） ---------- */

function countChars(node: Node): number {
  if (node.nodeType === 3) return node.nodeValue?.length ?? 0;
  if (node.nodeName === 'BR') return 1;
  let n = 0;
  for (const c of Array.from(node.childNodes)) n += countChars(c);
  return n;
}

/** DOM 位置 → 從編輯區開頭算起的字數 */
export function offsetOf(root: Node, node: Node, offset: number): number {
  const r = (root.ownerDocument ?? (root as Document)).createRange();
  r.setStart(root, 0);
  try {
    r.setEnd(node, offset);
  } catch {
    return countChars(root);
  }
  return countChars(r.cloneContents());
}

/** 字數 → DOM 位置（落在兩段文字的交界時，停在前一段的最後） */
export function pointAt(root: Node, offset: number): { node: Node; offset: number } {
  let left = Math.max(0, offset);
  const visit = (node: Node): { node: Node; offset: number } | null => {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) {
        const len = c.nodeValue?.length ?? 0;
        if (left <= len) return { node: c, offset: left };
        left -= len;
      } else if (c.nodeName === 'BR') {
        if (left === 0) return { node, offset: Array.prototype.indexOf.call(node.childNodes, c) };
        left -= 1;
      } else if (c.nodeType === 1) {
        const hit = visit(c);
        if (hit) return hit;
      }
    }
    return null;
  };
  return visit(root) ?? { node: root, offset: root.childNodes.length };
}

export interface TextRange {
  start: number;
  end: number;
}

export function rangeOffsets(root: Node, range: Range): TextRange {
  const a = offsetOf(root, range.startContainer, range.startOffset);
  const b = offsetOf(root, range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function rangeAt(root: Node, r: TextRange): Range {
  const doc = root.ownerDocument ?? (root as Document);
  const a = pointAt(root, r.start);
  const b = pointAt(root, r.end);
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** 範圍是不是整個在編輯區裡 */
export const rangeInside = (root: Node, r: Range): boolean =>
  root.contains(r.startContainer) && root.contains(r.endContainer);

/* ---------- 套用 ---------- */

function select(sel: Selection, range: Range): void {
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * 把目前的選取範圍（已在編輯區裡）換成一個新的格式，裡面是選取的純文字；之後選取新的格式的內容
 * （再按別的格式就包在它裡面）。沒有選取文字時放進一個空的格式（輸出時略過）。
 */
export function wrapSelection(sel: Selection, f: Format): void {
  const value = sel.toString();
  const range = sel.getRangeAt(0);
  const doc = range.startContainer.ownerDocument ?? document;
  const span = formatSpan(doc, f);
  span.append(...textToDom(doc, value));
  range.deleteContents();
  range.insertNode(span);
  range.selectNodeContents(span);
  select(sel, range);
}

/**
 * 效果：選取的文字一個字一個 RGB 色（前景或背景），之後選取這些字。
 * 沒有選取文字時只刪掉選取的內容（例如只選到最後一個換行）。
 */
export function applyEffect(
  sel: Selection,
  effect: EffectId,
  colors: EffectColors,
  fg: boolean,
): void {
  const value = sel.toString();
  const range = sel.getRangeAt(0);
  const doc = range.startContainer.ownerDocument ?? document;
  range.deleteContents();
  const chars = splitGraphemes(value);
  const hexes = effectColors(effect, chars.length, colors);
  const spans = chars.map((ch, i) => {
    const span = formatSpan(doc, { type: 'rgb', hex: hexes[i], fg });
    span.append(...textToDom(doc, ch));
    return span;
  });
  for (const span of [...spans].reverse()) range.insertNode(span);
  if (!spans.length) return;
  range.setStartBefore(spans[0]);
  range.setEndAfter(spans[spans.length - 1]);
  select(sel, range);
}

/** 把一段格式樹放進目前的選取範圍（貼上），游標移到貼上的內容後面 */
export function insertNodes(sel: Selection, nodes: readonly AnsiNode[]): void {
  const range = sel.getRangeAt(0);
  const doc = range.startContainer.ownerDocument ?? document;
  range.deleteContents();
  const dom = renderNodes(doc, nodes);
  const frag = doc.createDocumentFragment();
  frag.append(...dom);
  range.insertNode(frag);
  const last = dom[dom.length - 1];
  if (last?.parentNode) {
    range.setStartAfter(last);
    range.collapse(true);
  }
  select(sel, range);
}
