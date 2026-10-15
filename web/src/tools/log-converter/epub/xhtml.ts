/**
 * EPUB 的內容文件是 XML（XHTML 語法）：所有文字都要跳脫、拿掉 XML 1.0 不允許的字元，
 * 日誌內容（網頁用的 HTML 片段）要轉成格式正確的 XHTML 片段（規格 3.13.2、5. D3）。
 *
 * 純字串處理（Worker 裡沒有 DOMParser）。輸入通常是淨化過的舊格式 HTML（F82）或新格式的跳脫文字＋`<br>`，
 * 但任何輸入都輸出格式正確的 XML：只留白名單標籤、標籤一定成對、文字一律重新跳脫。
 */
import { cleanInlineStyle } from '../inlineStyle';

/**
 * XML 1.0 不允許（或不建議）的字元：C0 控制字元（Tab、LF、CR 除外）、DEL 與 C1 控制字元、
 * 落單的代理字元（壞掉的 emoji 半邊）、U+FFFE、U+FFFF
 */
const INVALID_XML =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: XML 不允許的控制字元必須拿掉
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** 拿掉 XML 不允許的字元；CRLF、CR 換成 LF（XML 解析器本來就會這樣正規化） */
export function stripInvalidXml(text: string): string {
  return String(text).replace(/\r\n?/g, '\n').replace(INVALID_XML, '');
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 元素內容的文字 */
export function xmlText(text: string): string {
  return stripInvalidXml(text).replace(/[&<>]/g, (c) => ESC[c]);
}

/** 屬性值（一律用雙引號包住）；Tab、換行寫成字元參照，屬性正規化時才不會變成空白 */
export function xmlAttr(text: string): string {
  return stripInvalidXml(text)
    .replace(/[&<>"']/g, (c) => ESC[c])
    .replace(/[\t\n]/g, (c) => (c === '\t' ? '&#9;' : '&#10;'));
}

/* ---------- HTML 字元參照 ---------- */

/** 常見的具名參照（XML 只認得 amp、lt、gt、quot、apos，其他的要先解成字元） */
const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  zwnj: '‌',
  zwj: '‍',
  shy: '­',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  copy: '©',
  reg: '®',
  trade: '™',
  sect: '§',
  para: '¶',
  yen: '¥',
  euro: '€',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  hearts: '♥',
  spades: '♠',
  clubs: '♣',
  diams: '♦',
};

/** 解開字元參照：數字參照與常見的具名參照；不合法的數字參照拿掉，認不得的具名參照照原樣留著（之後當文字跳脫） */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (all, body: string) => {
      if (body[0] !== '#') return NAMED[body] ?? all;
      const hex = body[1] === 'x' || body[1] === 'X';
      const digits = body.slice(hex ? 2 : 1);
      if (digits.length > 8) return '';
      const cp = Number.parseInt(digits, hex ? 16 : 10);
      if (!(cp > 0 && cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) return '';
      return String.fromCodePoint(cp);
    },
  );
}

/* ---------- HTML 片段 → XHTML 片段 ---------- */

/** 照原樣保留的行內標籤（HTML5 仍然合法的） */
const KEEP = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'ins',
  'small',
  'sub',
  'sup',
  'mark',
  'code',
  'span',
  'ruby',
  'rt',
  'rp',
]);
/** HTML5 已廢止、換成等義的標籤 */
const RENAME: Readonly<Record<string, string>> = { strike: 's', big: 'span', font: 'span' };
/** 只留內容的標籤 */
const UNWRAP = new Set(['rb']);
/** 連內容一起拿掉的標籤 */
const DROP_CONTENT = new Set([
  'script',
  'style',
  'template',
  'textarea',
  'title',
  'noscript',
  'iframe',
  'object',
  'svg',
  'math',
]);

/** 看起來是顏色的 font color 值（其他的不採用） */
const FONT_COLOR = /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%/]+\))$/i;

interface RawTag {
  closing: boolean;
  name: string;
  attrs: string;
  /** 標籤結束（「>」之後）的位置 */
  end: number;
}

/** 從「<」讀一個標籤；不是標籤（例如「a < b」）時回傳 null。引號裡的「>」不算結束 */
function readTag(s: string, lt: number): RawTag | null {
  let i = lt + 1;
  let closing = false;
  if (s[i] === '/') {
    closing = true;
    i += 1;
  }
  const m = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(s.slice(i, i + 64));
  if (!m) return null;
  const name = m[0].toLowerCase();
  i += m[0].length;
  const attrStart = i;
  while (i < s.length) {
    const c = s[i];
    if (c === '>') return { closing, name, attrs: s.slice(attrStart, i), end: i + 1 };
    if (c === '"' || c === "'") {
      const close = s.indexOf(c, i + 1);
      if (close >= 0) {
        i = close + 1;
        continue;
      }
    }
    i += 1;
  }
  return null;
}

function readAttrs(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of raw.matchAll(re)) {
    const name = m[1].toLowerCase();
    if (!out.has(name)) out.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  }
  return out;
}

/** 輸出的屬性：只留安全的 style（font 的 color 併進 style） */
function attrsOf(name: string, raw: string): string {
  if (!raw.trim()) return '';
  const attrs = readAttrs(raw);
  const decls: string[] = [];
  if (name === 'font') {
    const color = (attrs.get('color') ?? '').trim();
    if (FONT_COLOR.test(color)) decls.push(`color: ${color}`);
  }
  const style = attrs.get('style');
  if (style) decls.push(style);
  const clean = decls.length ? cleanInlineStyle(decls.join(';')) : '';
  return clean ? ` style="${xmlAttr(clean)}"` : '';
}

const textOf = (raw: string): string => xmlText(decodeEntities(raw));

/**
 * 輸出中的一段：一般的內容是字串；ruby 直接的子元素 rt、rp 先記成物件（rt 是整個元素、rp 只有文字），
 * ruby 關上時才排成合法的結構
 */
type Part = string | { kind: 'rt' | 'rp'; html: string };

interface Frame {
  /** 原文的標籤名（找結束標籤用） */
  src: string;
  /** null＝只留內容 */
  tag: string | null;
  attrs: string;
  parts: Part[];
  /** ruby：裡面有沒有 rt */
  hasRt: boolean;
}

/** 一般元素的內容（rt、rp 只會出現在 ruby 裡；萬一有，rt 照用、rp 只留文字） */
const joinParts = (parts: readonly Part[]): string =>
  parts.map((p) => (typeof p === 'string' ? p : p.html)).join('');

/**
 * 有 rt 的 ruby 排成 epubcheck 接受的結構（驗證 3.13.2）：每一組是「底字＋一個以上的 rt」，
 * 一組只有一個 rt、而且前後剛好各有一個 rp 時保留「rp rt rp」，其他的 rp 拿掉（ruby 裡的 rp 本來就不顯示）；
 * 最後一組沒有 rt 的底字移到 ruby 後面。
 */
function rubyHtml(f: Frame): string {
  type Group = { base: string[]; ann: Exclude<Part, string>[] };
  const groups: Group[] = [{ base: [], ann: [] }];
  for (const p of f.parts) {
    const g = groups[groups.length - 1];
    if (typeof p !== 'string') {
      g.ann.push(p);
      continue;
    }
    if (g.ann.some((a) => a.kind === 'rt')) groups.push({ base: [p], ann: [] });
    else {
      g.ann = [];
      g.base.push(p);
    }
  }
  let inner = '';
  let trailing = '';
  for (const g of groups) {
    const rts = g.ann.filter((a) => a.kind === 'rt');
    if (!rts.length) {
      trailing += g.base.join('');
      continue;
    }
    const k = g.ann;
    const wrapped =
      k.length === 3 && k[0].kind === 'rp' && k[1].kind === 'rt' && k[2].kind === 'rp';
    inner += g.base.join('');
    inner += wrapped
      ? `<rp>${k[0].html}</rp>${k[1].html}<rp>${k[2].html}</rp>`
      : rts.map((a) => a.html).join('');
  }
  return `<ruby${f.attrs}>${inner}</ruby>${trailing}`;
}

/**
 * 網頁用的 HTML 片段（一行日誌內容）→ 格式正確的 XHTML 片段：
 * 白名單標籤照用或換成等義的、`br` → `<br/>`、其他標籤拿掉留下文字、script 之類連內容拿掉、
 * 字元參照解開再重新跳脫、沒關上的標籤在結尾關上、多出來的結束標籤略過。
 * ruby（驗證 3.13.2）：rt、rp 只在 ruby 裡（直接的子元素）保留，其他地方只留文字（「漢(かん)」照樣讀得懂）；
 * rp 裡只留文字；沒有 rt 的 ruby 只留內容（裡面的 rp 也只留文字）；有 rt 的 ruby 排成合法的結構（rubyHtml）。
 */
export function htmlToXhtml(html: string): string {
  const s = String(html ?? '');
  const root: Frame = { src: '', tag: null, attrs: '', parts: [], hasRt: false };
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1];
  const emit = (text: string) => {
    if (text) top().parts.push(text);
  };
  const close = () => {
    const f = stack.pop()!;
    const parent = top();
    const inner = joinParts(f.parts);
    if (f.tag === 'rp') parent.parts.push({ kind: 'rp', html: inner });
    else if (f.tag === 'rt') parent.parts.push({ kind: 'rt', html: `<rt${f.attrs}>${inner}</rt>` });
    else if (f.tag === 'ruby')
      parent.parts.push(
        f.hasRt ? rubyHtml(f) : f.parts.map((p) => (typeof p === 'string' ? p : p.html)).join(''),
      );
    else parent.parts.push(f.tag ? `<${f.tag}${f.attrs}>${inner}</${f.tag}>` : inner);
  };
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) {
      emit(textOf(s.slice(i)));
      break;
    }
    if (lt > i) emit(textOf(s.slice(i, lt)));
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      i = end < 0 ? s.length : end + 3;
      continue;
    }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') {
      const end = s.indexOf('>', lt);
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    const tag = readTag(s, lt);
    if (!tag) {
      emit('&lt;');
      i = lt + 1;
      continue;
    }
    i = tag.end;
    const { name } = tag;
    if (DROP_CONTENT.has(name)) {
      if (!tag.closing) {
        const re = new RegExp(`</${name}\\s*>`, 'ig');
        re.lastIndex = i;
        const m = re.exec(s);
        i = m ? m.index + m[0].length : s.length;
      }
      continue;
    }
    const inRp = top().tag === 'rp';
    if (name === 'br') {
      if (!tag.closing && !inRp) emit('<br/>');
      continue;
    }
    let mapped: string | null | undefined = KEEP.has(name)
      ? name
      : (RENAME[name] ?? (UNWRAP.has(name) ? null : undefined));
    if (mapped === undefined) continue;
    if (tag.closing) {
      let k = stack.length - 1;
      while (k > 0 && stack[k].src !== name) k -= 1;
      if (k === 0) continue;
      while (stack.length > k) close();
      continue;
    }
    if (inRp) mapped = null;
    else if (name === 'rt' || name === 'rp') {
      if (top().tag !== 'ruby') mapped = null;
      else if (name === 'rt') top().hasRt = true;
    }
    stack.push({
      src: name,
      tag: mapped,
      attrs: mapped ? attrsOf(name, tag.attrs) : '',
      parts: [],
      hasRt: false,
    });
  }
  while (stack.length > 1) close();
  return joinParts(root.parts);
}

/** 純文字（標記比對、章名）：br 換成換行、去掉標籤與註解、解開字元參照、拿掉 XML 不允許的字元 */
export function htmlToPlainText(html: string): string {
  return stripInvalidXml(
    decodeEntities(
      String(html ?? '')
        .replace(/<br\b[^>]*>/gi, '\n')
        .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
        .replace(/<\/?[a-zA-Z][^>]*>/g, ''),
    ),
  );
}
