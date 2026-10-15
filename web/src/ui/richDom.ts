/**
 * 完整格式的格式化文字 ↔ 編輯區的 DOM（RichTextEditor 用；`readRichDom`／`writeRichDom` 給了 `{ full: true }` 時也走這裡）。
 *
 * 寫出的結構：每一段一個 `<div>`（段落的對齊寫在 style 的 text-align、「從新的一頁開始」是 `data-page-break` 屬性），
 * 每個片段一個 `<span>`：粗體、顏色、斜體、刪除線、螢光筆（底色）、字級（相對整段字級的 em，另記 `data-size`）、
 * 字型（font-family，另記 `data-font`）。空段落放 `<br>`。
 *
 * 讀回時以 data 屬性為準；瀏覽器自己產生的元素（例如刪掉跨段的文字時補的 span、`<b>`、`<i>`）照 style 與標籤解讀。
 */
import type { RichAlign, RichDoc, RichLine, RichRun, RichStyle } from '@/core/richtext';

export interface RichDomOptions {
  /** 完整格式（斜體、刪除線、螢光筆、字級、字型、段落對齊與分頁） */
  full?: boolean;
  /** 整段的字級（px）：片段的字級寫成相對它的 em（預設 16） */
  baseSize?: number;
  /** 編輯區實際的字級（px）：瀏覽器把字級寫成 px 時換算回去（預設 16） */
  displaySize?: number;
  /** 片段字型的 CSS font-family（預設加上引號） */
  fontCss?: (family: string) => string;
  /** 整段的字型名稱（讀回時，和它一樣的字型當成「跟著整段」） */
  baseFont?: string;
  /** 分頁標記的文字（`data-page-break` 的值，CSS 用 attr() 顯示；預設「分頁」） */
  pageBreakLabel?: string;
}

const BLOCKS = new Set(['DIV', 'P', 'LI']);

/** CSS 顏色 → 小寫 #rrggbb；透明或看不懂時 null */
export function cssColorHex(color: string | null | undefined): string | null {
  const c = (color ?? '').trim();
  if (!c || c === 'transparent' || c === 'inherit' || c === 'initial') return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c))
    return `#${c
      .slice(1)
      .split('')
      .map((x) => x + x)
      .join('')}`.toLowerCase();
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i.exec(c);
  if (!m) return null;
  if (m[4] !== undefined) {
    const a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (a === 0) return null;
  }
  return `#${m
    .slice(1, 4)
    .map((n) =>
      Math.min(255, Math.round(Number(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const firstFamily = (css: string): string =>
  (css.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');

function alignOf(el: HTMLElement): RichAlign | undefined {
  const raw = (el.style?.textAlign || el.getAttribute?.('align') || '').toLowerCase();
  if (raw === 'left' || raw === 'start') return 'left';
  if (raw === 'right' || raw === 'end') return 'right';
  if (raw === 'center') return 'center';
  if (raw === 'justify') return 'justify';
  return undefined;
}

type Piece =
  | { kind: 'text'; text: string; style: RichStyle }
  | { kind: 'block'; align?: RichAlign; pageBreak?: boolean };

/** 完整格式：DOM → RichDoc（根元素自己的樣式不算；顏色沒有指定的字是空字串＝預設字色） */
export function readRichDomFull(root: Node, o: RichDomOptions = {}): RichDoc {
  const base = o.baseSize ?? 16;
  const display = o.displaySize ?? 16;
  const baseFont = (o.baseFont ?? '').toLowerCase();
  const walk = (node: Node, style: RichStyle, isRoot: boolean): Piece[] => {
    if (node.nodeType === 3)
      return [{ kind: 'text', text: (node.nodeValue ?? '').replace(/\u00a0/g, ' '), style }];
    if (node.nodeType !== 1 && node.nodeType !== 11) return [];
    if (node.nodeName === 'BR') return [{ kind: 'text', text: '\n', style }];
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') return [];
    const el = node as HTMLElement;
    const next: RichStyle = { ...style };
    if (!isRoot && node.nodeType === 1) {
      const s = el.style;
      const weight = s?.fontWeight;
      next.bold = weight
        ? weight === 'bold' || weight === 'bolder' || Number(weight) >= 600
        : style.bold || el.nodeName === 'B' || el.nodeName === 'STRONG';
      const color = cssColorHex(s?.color || el.getAttribute?.('color'));
      if (color) next.color = color;
      if (s?.fontStyle === 'italic' || s?.fontStyle === 'oblique') next.italic = true;
      else if (s?.fontStyle === 'normal') delete next.italic;
      else if (el.nodeName === 'I' || el.nodeName === 'EM') next.italic = true;
      const deco = `${s?.textDecorationLine ?? ''} ${s?.textDecoration ?? ''}`;
      if (deco.includes('line-through') || ['S', 'STRIKE', 'DEL'].includes(el.nodeName))
        next.strike = true;
      const hl = cssColorHex(s?.backgroundColor);
      if (hl) next.highlight = hl;
      const ds = Number(el.dataset?.size);
      if (Number.isFinite(ds) && ds > 0) next.size = ds;
      else if (s?.fontSize) {
        const m = /^([\d.]+)(em|px|rem|%)$/.exec(s.fontSize.trim());
        if (m) {
          const v = Number(m[1]);
          const px =
            m[2] === 'em'
              ? v * base
              : m[2] === '%'
                ? (v / 100) * base
                : m[2] === 'rem'
                  ? v * base
                  : (v * base) / display;
          const size = Math.round(px);
          if (size > 0) {
            if (size === base) delete next.size;
            else next.size = size;
          }
        }
      }
      const df = el.dataset?.font;
      if (df !== undefined) {
        if (df) next.font = df;
        else delete next.font;
      } else if (s?.fontFamily) {
        const fam = firstFamily(s.fontFamily);
        if (fam && fam.toLowerCase() !== baseFont) next.font = fam;
        else delete next.font;
      }
    }
    const kids = [...node.childNodes];
    const block = !isRoot && node.nodeType === 1 && BLOCKS.has(node.nodeName);
    const head: Piece[] = block
      ? [
          {
            kind: 'block',
            align: alignOf(el),
            pageBreak: el.hasAttribute?.('data-page-break') || undefined,
          },
        ]
      : [];
    if (kids.length === 1 && kids[0].nodeName === 'BR' && node.nodeType === 1) return head;
    const out: Piece[] = [...head];
    let prevBlock = false;
    let seen = false;
    for (const child of kids) {
      const childBlock = BLOCKS.has(child.nodeName);
      if (seen && (childBlock || prevBlock)) out.push({ kind: 'text', text: '\n', style: next });
      out.push(...walk(child, next, false));
      prevBlock = childBlock;
      seen = true;
    }
    return out;
  };
  const lines: RichLine[] = [{ runs: [] }];
  for (const p of walk(root, { bold: false, color: '' }, true)) {
    if (p.kind === 'block') {
      const line = lines[lines.length - 1];
      if (p.align) line.align = p.align;
      if (p.pageBreak) line.pageBreak = true;
      continue;
    }
    p.text.split('\n').forEach((t, i) => {
      if (i) lines.push({ runs: [] });
      if (!t) return;
      const runs = lines[lines.length - 1].runs;
      const last = runs.at(-1);
      const run: RichRun = { text: t, ...p.style };
      if (last && sameStyleLoose(last, run)) last.text += t;
      else runs.push(cleanRun(run));
    });
  }
  return { lines };
}

function sameStyleLoose(a: RichStyle, b: RichStyle): boolean {
  return (
    a.bold === b.bold &&
    a.color === b.color &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    (a.highlight || '') === (b.highlight || '') &&
    (a.size || 0) === (b.size || 0) &&
    (a.font || '') === (b.font || '')
  );
}

function cleanRun(r: RichRun): RichRun {
  const out: RichRun = { text: r.text, bold: !!r.bold, color: r.color ?? '' };
  if (r.italic) out.italic = true;
  if (r.strike) out.strike = true;
  if (r.highlight) out.highlight = r.highlight;
  if (r.size) out.size = r.size;
  if (r.font) out.font = r.font;
  return out;
}

const defaultFontCss = (family: string) => `"${family.replace(/["\\]/g, '')}"`;

/** 完整格式：RichDoc → 編輯區的 DOM */
export function writeRichDomFull(root: HTMLElement, doc: RichDoc, o: RichDomOptions = {}): void {
  const d = root.ownerDocument;
  const base = o.baseSize ?? 16;
  const fontCss = o.fontCss ?? defaultFontCss;
  root.replaceChildren();
  for (const line of doc.lines) {
    const div = d.createElement('div');
    if (line.align) div.style.textAlign = line.align;
    if (line.pageBreak) div.setAttribute('data-page-break', o.pageBreakLabel ?? '分頁');
    for (const r of line.runs) {
      const span = d.createElement('span');
      span.textContent = r.text;
      if (r.bold) span.style.fontWeight = '700';
      if (r.color) span.style.color = r.color;
      if (r.italic) span.style.fontStyle = 'italic';
      if (r.strike) span.style.textDecorationLine = 'line-through';
      if (r.highlight) span.style.backgroundColor = r.highlight;
      if (r.size) {
        span.style.fontSize = `${Math.round((r.size / base) * 10000) / 10000}em`;
        span.dataset.size = String(r.size);
      }
      if (r.font) {
        span.style.fontFamily = fontCss(r.font);
        span.dataset.font = r.font;
      }
      div.append(span);
    }
    if (!div.childNodes.length) div.append(d.createElement('br'));
    root.append(div);
  }
}

/** 編輯區的結構是不是 writeRichDomFull 寫出的樣子（每段一個 div、div 裡沒有區塊元素） */
export function isCanonicalRichDom(root: HTMLElement): boolean {
  for (const child of root.childNodes) {
    if (child.nodeName !== 'DIV') return false;
    if ((child as HTMLElement).querySelector('div,p,li')) return false;
  }
  return root.childNodes.length > 0;
}
