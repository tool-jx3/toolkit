/**
 * 文字欄的 ↑↓ 跨段移動（2026-10 第三批，上游 v3.18.0；規格 F309）：
 * 游標在段落最上面一行按 ↑、最下面一行按 ↓ 時移到上一個、下一個欄位，橫的位置盡量不變。
 * textarea 量不到游標的位置，用一個同樣樣式的看不到的 div 量（每次量完就拿掉）。
 */

/** 量游標位置要抄的樣式 */
const PROPS = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'wordBreak',
  'overflowWrap',
  'lineBreak',
] as const;

type Field = HTMLTextAreaElement | HTMLInputElement;

export interface CaretBox {
  /** 畫面座標 */
  x: number;
  y: number;
}

/** 量好幾個位置用（建一次、量完拿掉） */
function measurer(el: Field): { at: (pos: number) => CaretBox; done: () => void } {
  const cs = getComputedStyle(el);
  const div = document.createElement('div');
  const st = div.style as unknown as Record<string, string>;
  for (const p of PROPS) st[p] = (cs as unknown as Record<string, string>)[p];
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.top = '0';
  div.style.left = '-9999px';
  div.style.height = 'auto';
  div.style.overflow = 'hidden';
  div.style.whiteSpace = el.tagName === 'INPUT' ? 'pre' : 'pre-wrap';
  if (el.tagName !== 'INPUT') div.style.overflowWrap = cs.overflowWrap || 'break-word';
  const head = document.createTextNode('');
  const span = document.createElement('span');
  div.append(head, span);
  document.body.appendChild(div);
  const r = el.getBoundingClientRect();
  const bl = Number.parseFloat(cs.borderLeftWidth) || 0;
  const bt = Number.parseFloat(cs.borderTopWidth) || 0;
  const v = el.value;
  return {
    at: (pos: number) => {
      head.data = v.slice(0, pos);
      span.textContent = v.slice(pos) || '.';
      return {
        x: r.left + bl + span.offsetLeft - el.scrollLeft,
        y: r.top + bt + span.offsetTop - el.scrollTop,
      };
    },
    done: () => div.remove(),
  };
}

export function lineHeightOf(el: Element): number {
  const cs = getComputedStyle(el);
  const lh = Number.parseFloat(cs.lineHeight);
  return lh > 0 ? lh : (Number.parseFloat(cs.fontSize) || 13) * 1.6;
}

/** 游標的位置（畫面座標） */
export function caretBox(el: Field, pos: number): CaretBox {
  const m = measurer(el);
  try {
    return m.at(pos);
  } finally {
    m.done();
  }
}

/** 游標在最上面（up）／最下面的一行嗎（有選取範圍時 false；空的欄位兩邊都是） */
export function atEdge(el: Field, up: boolean): boolean {
  const a = el.selectionStart ?? 0;
  if (a !== (el.selectionEnd ?? 0)) return false;
  if (el.tagName === 'INPUT' || !el.value) return true;
  const m = measurer(el);
  try {
    const c = m.at(a);
    const e = m.at(up ? 0 : el.value.length);
    const lh = lineHeightOf(el);
    return up ? c.y - e.y < lh * 0.5 : e.y - c.y < lh * 0.5;
  } finally {
    m.done();
  }
}

/**
 * 移進欄位：游標放在最後一行（up）／第一行，最靠近橫的位置 x 的地方（x 是 null 時放在結尾／開頭）。
 */
export function placeAtX(el: Field, x: number | null, up: boolean): void {
  const v = el.value;
  let pos = up ? v.length : 0;
  if (x != null && v) {
    const m = measurer(el);
    try {
      const lh = lineHeightOf(el);
      const lineY = m.at(up ? v.length : 0).y;
      let best = pos;
      let bestD = Number.POSITIVE_INFINITY;
      const step = up ? -1 : 1;
      /* 同一行裡逐字量（一行最多看 400 字） */
      for (let p = pos, n = 0; p >= 0 && p <= v.length && n < 400; p += step, n++) {
        const c = m.at(p);
        if (Math.abs(c.y - lineY) > lh * 0.5) break;
        const dd = Math.abs(c.x - x);
        if (dd < bestD) {
          bestD = dd;
          best = p;
        }
      }
      pos = best;
    } finally {
      m.done();
    }
  }
  el.focus({ preventScroll: true });
  el.setSelectionRange(pos, pos);
  el.scrollIntoView({ block: 'nearest' });
}

/** 文字欄裡依序可以走到的欄位（標題語欄、文字欄、表格名稱欄、不能打字的段落） */
export function navItems(from: Element): HTMLElement[] {
  const pane =
    from.closest('[data-testid="se-popup-source"]') ?? from.closest('[data-testid="se-source"]');
  if (!pane) return [];
  return [...pane.querySelectorAll<HTMLElement>('[data-nav]')].filter((x) => x.offsetParent);
}

/**
 * 從 from 往上（d＝-1）／下一個欄位走：文字欄、標題語欄放進游標（橫的位置 x），
 * 不能打字的段落（圖片、表格…）改成選取它。走不到時 false。
 */
export function navMove(
  from: HTMLElement,
  d: -1 | 1,
  x: number | null,
  pick: (id: string) => void,
): boolean {
  const items = navItems(from);
  const i = items.indexOf(from);
  const to = i < 0 ? null : items[i + d];
  if (!to) return false;
  if (to instanceof HTMLTextAreaElement || to instanceof HTMLInputElement) {
    placeAtX(to, x, d < 0);
    return true;
  }
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body) a.blur();
  const id = to.dataset.navid;
  if (id) pick(id);
  to.scrollIntoView({ block: 'nearest' });
  return true;
}
