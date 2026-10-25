/**
 * 段落文字的規則：注音（｜本文字《注音》）、註解與文字顏色的位置（以字數區間記錄、文字改動時跟著平移），規格 3.4.2～3.4.3。
 * 這裡的函式不依賴 DOM，單元測試直接用。
 */
import type { Block, Comment, Mark } from './types';

/** 新的 id（7 個 base36 字元） */
export const uid = (): string => Math.random().toString(36).slice(2, 9).padEnd(7, '0');

/** 注音：｜本文字《注音》（｜可以是半形 |；本文字與注音都不含換行與｜《》） */
export const RUBY_RE = /[｜|]([^｜|《》\n]+)《([^《》\n]+)》/g;
/** 不帶全域旗標的版本：只用來判斷有沒有注音（帶 g 的 test 會殘留 lastIndex，規格第 5 節） */
const RUBY_HAS = /[｜|][^｜|《》\n]+《[^《》\n]+》/;

export function hasRuby(text: unknown): boolean {
  return RUBY_HAS.test(String(text ?? ''));
}

/** 去掉注音記號，只留本文字（目錄、頁面一覽、alt 用） */
export function rubyPlain(text: unknown): string {
  return String(text ?? '').replace(RUBY_RE, (_m, base: string) => base);
}

export function escapeHtml(text: unknown): string {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** 文字轉成 HTML（跳脫）並把注音換成 <ruby> */
export function rubyHtml(text: unknown): string {
  return escapeHtml(text).replace(
    RUBY_RE,
    (_m, base: string, rt: string) => `<ruby>${base}<rp>（</rp><rt>${rt}</rt><rp>）</rp></ruby>`,
  );
}

/* ---------- 註解與顏色 ---------- */

export function blockComments(b: Pick<Block, 'cm'>): Comment[] {
  return Array.isArray(b.cm) ? b.cm.filter((c) => c && c.b > c.a) : [];
}

/** 有作用的裝飾：顏色、粗體、文字大小（pt），或原作 v3.17～v3.20 的倍率（還沒換成 pt 的） */
const markOn = (c: Partial<Mark> | null | undefined): c is Mark =>
  !!c &&
  (c.b ?? 0) > (c.a ?? 0) &&
  !!(c.col || c.bold || +(c.pt ?? 0) > 0 || (+(c.sz ?? 0) > 0 && +(c.sz ?? 0) !== 1));

export function blockMarks(b: Pick<Block, 'mk'>): Mark[] {
  return Array.isArray(b.mk) ? b.mk.filter(markOn) : [];
}

const sameMark = (p: Mark, c: Mark): boolean =>
  p.col === c.col &&
  p.bold === c.bold &&
  (p.pt ?? 0) === (c.pt ?? 0) &&
  (p.sz ?? 1) === (c.sz ?? 1);

/**
 * 把同樣裝飾的重疊或相鄰段合併，依位置排序。顏色與大小是分開的裝飾（範圍可以重疊，2026-10，上游 v3.17.0）：
 * 只有顏色、粗體、大小都相同的才合併。
 */
export function tidyMarks(list: readonly Partial<Mark>[]): Mark[] {
  const a = list
    .filter(markOn)
    .map((c) => {
      const o: Mark = { a: c.a, b: c.b, col: c.col || '', bold: !!c.bold };
      if (+(c.pt ?? 0) > 0) o.pt = +(c.pt ?? 0);
      if (+(c.sz ?? 0) > 0 && +(c.sz ?? 0) !== 1) o.sz = +(c.sz ?? 0);
      return o;
    })
    .sort((x, y) => x.a - y.a || x.b - y.b);
  const out: Mark[] = [];
  for (const c of a) {
    const p = out[out.length - 1];
    if (p && sameMark(p, c) && c.a <= p.b) {
      p.b = Math.max(p.b, c.b);
      continue;
    }
    out.push({ ...c });
  }
  return out;
}

/**
 * 文字從 oldT 改成 newT 時，平移註解與顏色的位置：依「相同的開頭」「相同的結尾」找出改動範圍，
 * 範圍前不動、範圍後平移，起點落在範圍裡的移到範圍開頭、終點移到插入文字的結尾，長度變 0 的刪除。
 */
export function shiftRanges<T extends { a: number; b: number }>(
  list: readonly T[],
  oldT: string,
  newT: string,
): T[] {
  if (oldT === newT) return list.map((x) => ({ ...x }));
  const n = Math.min(oldT.length, newT.length);
  let p = 0;
  while (p < n && oldT.charCodeAt(p) === newT.charCodeAt(p)) p++;
  let q = 0;
  while (q < n - p && oldT.charCodeAt(oldT.length - 1 - q) === newT.charCodeAt(newT.length - 1 - q))
    q++;
  const delA = p;
  const delZ = oldT.length - q;
  const insZ = newT.length - q;
  const d = insZ - delZ;
  const mv = (x: number, end: boolean) => (x <= delA ? x : x >= delZ ? x + d : end ? insZ : delA);
  return list.map((c) => ({ ...c, a: mv(c.a, false), b: mv(c.b, true) })).filter((c) => c.b > c.a);
}

/** 替換段落文字的唯一入口：註解與顏色的位置在這裡跟著平移（規格第 5 節） */
export function setBlockText(b: Block, text: unknown): void {
  const old = String(b.text ?? '');
  const nw = String(text ?? '');
  if (old === nw) return;
  const cs = blockComments(b);
  const ms = blockMarks(b);
  if (cs.length) b.cm = shiftRanges(cs, old, nw);
  if (ms.length) b.mk = tidyMarks(shiftRanges(ms, old, nw));
  b.text = nw;
}

/**
 * 拿掉 [a, z) 範圍上的裝飾（只切掉重疊的部分）。prop 給了時只拿掉那一種（'col'＝顏色、'pt'＝大小），
 * 重疊部分的其他裝飾留著（上色時大小不會不見，反之亦然；2026-10，上游 v3.17.0）。
 */
export function clearMarkRange(b: Block, a: number, z: number, prop?: 'col' | 'pt'): void {
  const out: Mark[] = [];
  for (const c of blockMarks(b)) {
    if (c.b <= a || c.a >= z) {
      out.push(c);
      continue;
    }
    if (c.a < a) out.push({ ...c, b: a });
    if (c.b > z) out.push({ ...c, a: z });
    if (prop) {
      const mid: Mark = { ...c, a: Math.max(a, c.a), b: Math.min(z, c.b) };
      if (prop === 'col') mid.col = '';
      else {
        delete mid.pt;
        delete mid.sz;
      }
      out.push(mid);
    }
  }
  b.mk = tidyMarks(out);
}

/** 給 [a, z) 上色（color 空字串＝拿掉顏色；大小留著） */
export function setMarkColor(b: Block, a: number, z: number, color: string): void {
  clearMarkRange(b, a, z, 'col');
  if (color) b.mk = tidyMarks([...blockMarks(b), { a, b: z, col: color, bold: false }]);
}

/** 把 [a, z) 的文字大小設成 pt（null＝拿掉，回到段落的大小；顏色留著） */
export function setMarkPt(b: Block, a: number, z: number, pt: number | null): void {
  clearMarkRange(b, a, z, 'pt');
  if (pt != null && pt > 0)
    b.mk = tidyMarks([...blockMarks(b), { a, b: z, col: '', bold: false, pt }]);
  if (!b.mk?.length) delete b.mk;
}

/** 加一則註解（依起點排序） */
export function addComment(b: Block, a: number, z: number, t: string): void {
  b.cm = [...blockComments(b), { a, b: z, t }].sort((x, y) => x.a - y.a);
}

/**
 * 把段落文字的 [a, z) 畫成 HTML：注音、文字顏色、註解（點狀底線＋最後一段加上標編號）。
 * 註解與顏色可能重疊：在所有分界切開後逐段包起來。
 */
export function rubyRange(
  b: Pick<Block, 'id' | 'text' | 'cm' | 'mk'>,
  from: number,
  to: number,
): string {
  const t = String(b.text ?? '');
  const a = Math.max(0, Math.min(t.length, from));
  const z = Math.max(a, Math.min(t.length, to));
  const cs = blockComments(b)
    .slice()
    .sort((x, y) => x.a - y.a);
  const ms = blockMarks(b);
  if (!cs.length && !ms.length) return rubyHtml(t.slice(a, z));
  const cut = new Set<number>([a, z]);
  for (const c of cs) {
    cut.add(c.a);
    cut.add(c.b);
  }
  for (const c of ms) {
    cut.add(c.a);
    cut.add(c.b);
  }
  const pts = [...cut].filter((x) => x >= a && x <= z).sort((x, y) => x - y);
  let out = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const s0 = pts[i];
    const e0 = pts[i + 1];
    if (e0 <= s0) continue;
    let h = rubyHtml(t.slice(s0, e0));
    /* 顏色與大小是分開的裝飾，可能重疊：這一段上所有的裝飾合在一起 */
    const on = ms.filter((c) => c.a <= s0 && c.b >= e0);
    if (on.length) {
      const col = safeColor(on.find((c) => c.col)?.col);
      const pt = +(on.find((c) => +(c.pt ?? 0) > 0)?.pt ?? 0);
      const st =
        (col ? `color:${col};` : '') +
        (on.some((c) => c.bold) ? 'font-weight:700;' : '') +
        (pt > 0 ? `font-size:${pt}pt;` : '');
      if (st) h = `<span style="${st}">${h}</span>`;
    }
    const ci = cs.findIndex((c) => c.a <= s0 && c.b >= e0);
    if (ci >= 0) {
      const tail = cs[ci].b <= e0;
      h = `<span class="cmt" data-cmt="${escapeHtml(b.id)}:${ci}">${h}${tail ? `<sup class="cmt-n">${ci + 1}</sup>` : ''}</span>`;
    }
    out += h;
  }
  return out;
}

export function rubyHtmlWithComments(b: Pick<Block, 'id' | 'text' | 'cm' | 'mk'>): string {
  return rubyRange(b, 0, String(b.text ?? '').length);
}

/** 只放行 CSS 顏色會用到的字元，避免顏色值跳脫 style 屬性 */
export function safeColor(c: unknown): string {
  const s = String(c ?? '').trim();
  return /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|[a-zA-Z]+)$/.test(s) ? s : '';
}
