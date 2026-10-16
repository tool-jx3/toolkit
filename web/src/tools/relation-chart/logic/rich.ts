/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色資訊（第四批的世界觀也用）的 HTML：白名單淨化（原作的 sanitizeRichHtml）、轉成純文字的行（角色卡）、
 * 圖片參照（`rcimg:<資產 id>`）的換進換出。
 * 這是匯出檔（互動網頁）的安全邊界：存進資料前過一次、匯出前再過一次。設計要點照原作：
 * ① 白名單；② 解析交給 DOMParser（惰性文件）；③ 淨化兩次結果必須一致，不一致再收斂一次、還是不穩就退成純文字；
 * ④ 看不懂就退成跳脫過的純文字；⑤ id／name／class 一律剝掉；⑥ 相對路徑與 data:image/svg+xml 不收。
 */

const LIMITS = { maxInput: 200000, maxNodes: 4000, maxDepth: 64, maxSpan: 100 };

/** 允許的標籤 → 這個標籤額外允許的屬性 */
const TAGS: Record<string, readonly string[]> = {
  p: [],
  br: [],
  hr: [],
  div: [],
  span: [],
  blockquote: [],
  pre: [],
  code: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  u: [],
  s: [],
  del: [],
  ins: [],
  mark: [],
  sub: [],
  sup: [],
  small: [],
  ul: [],
  ol: ['start'],
  li: ['value'],
  table: [],
  caption: [],
  colgroup: ['span'],
  col: ['span'],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  figure: [],
  figcaption: [],
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
};
/* 別加 id／name／class（理由見⑤） */
const ATTR_GLOBAL = ['style', 'dir', 'lang', 'title'];
/** 整棵子樹丟掉（內容本身就是危險品或雜訊） */
const DROP_SUBTREE = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'head',
  'form',
  'input',
  'button',
  'select',
  'option',
  'optgroup',
  'textarea',
  'label',
  'fieldset',
  'legend',
  'template',
  'noscript',
  'svg',
  'math',
  'frame',
  'frameset',
  'applet',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'map',
  'area',
  'marquee',
  'dialog',
  'slot',
  'portal',
  'xmp',
  'plaintext',
  'listing',
]);
const STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'text-align',
  'text-decoration-line',
  'text-decoration-color',
  'text-decoration-style',
  'vertical-align',
  'line-height',
]);
const LEN_RANGE: Record<string, Record<string, [number, number]>> = {
  'font-size': { px: [4, 96], pt: [3, 72], em: [0.3, 6], rem: [0.3, 6], '%': [20, 600] },
  'line-height': { px: [4, 200], em: [0.5, 4], rem: [0.5, 4], '%': [50, 400] },
};
const FONT_KEYWORDS = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'smaller',
  'larger',
  'normal',
  'inherit',
]);

const escText = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parse = (html: string): Document =>
  new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');

/** 脫殼：保留內容、去掉這一層（不認得的標籤，例如 <font>、<center>） */
function unwrap(el: Element): void {
  const p = el.parentNode;
  if (!p) return;
  while (el.firstChild) p.insertBefore(el.firstChild, el);
  p.removeChild(el);
}

function safeInt(v: string, min: number, max: number): string | null {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? String(Math.max(min, Math.min(max, n))) : null;
}

/** 網址：先剝控制字元再比對（`java&#9;script:` 在字串上看起來無辜、導覽時會執行） */
function safeUrl(raw: string, kind: 'img' | 'link'): string | null {
  const s = [...String(raw ?? '')]
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c > 0x1f && c !== 0x7f;
    })
    .join('')
    .trim();
  if (!s) return null;
  if (kind === 'img') {
    const packed = s.replace(/\s+/g, '');
    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(packed))
      return packed;
    /* 圖片庫的參照（資產 id）只在 img.src 收 */
    if (/^rcimg:[0-9a-z-]{3,80}$/.test(s)) return s;
    return /^https?:\/\/[^\s]+$/i.test(s) ? s : null;
  }
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(s) ? s : null;
}

/** 長度值夾範圍（字級 9999px 不是攻擊，但會把頁面撐爛） */
function safeLen(prop: string, value: string): string | null {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  if (FONT_KEYWORDS.has(v)) return v;
  const m = /^(-?[\d.]+)(px|pt|em|rem|%)$/.exec(v);
  if (!m) return null;
  const range = LEN_RANGE[prop]?.[m[2]];
  if (!range) return null;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return `${Math.max(range[0], Math.min(range[1], n))}${m[2]}`;
}

/** style：交給瀏覽器的 CSS 解析器讀，只挑白名單裡的 longhand 再組回去（url() 一律不收） */
function safeStyle(value: string, doc: Document): string {
  const probe = doc.createElement('div');
  try {
    probe.setAttribute('style', String(value || ''));
  } catch {
    return '';
  }
  const st = probe.style;
  const keep: string[] = [];
  for (let i = 0; i < st.length; i++) {
    const prop = st[i];
    if (!STYLE_PROPS.has(prop)) continue;
    let v = st.getPropertyValue(prop);
    if (!v) continue;
    if (/url\(|image-set\(|element\(|expression|javascript:|@import|\\/i.test(v)) continue;
    if (LEN_RANGE[prop]) {
      const l = safeLen(prop, v);
      if (!l) continue;
      v = l;
    }
    keep.push(`${prop}:${v}`);
  }
  return keep.join(';');
}

function cleanAttrs(el: Element, tag: string, doc: Document): boolean {
  const allow = TAGS[tag];
  for (const a of [...el.attributes]) {
    const name = (a.name || '').toLowerCase();
    /* 帶命名空間的屬性一律丟 */
    if (a.namespaceURI || !(ATTR_GLOBAL.includes(name) || allow.includes(name))) {
      el.removeAttributeNode(a);
      continue;
    }
    const val = a.value;
    let out: string | null;
    if (name === 'style') out = safeStyle(val, doc);
    else if (name === 'href') out = safeUrl(val, 'link');
    else if (name === 'src') out = safeUrl(val, 'img');
    else if (name === 'colspan' || name === 'rowspan' || name === 'span')
      out = safeInt(val, 1, LIMITS.maxSpan);
    else if (name === 'width' || name === 'height') out = safeInt(val, 1, 4096);
    else if (name === 'start' || name === 'value') out = safeInt(val, -9999, 9999);
    else if (name === 'dir') out = /^(ltr|rtl|auto)$/i.test(val) ? val.toLowerCase() : null;
    else if (name === 'lang') out = /^[A-Za-z0-9-]{1,35}$/.test(val) ? val : null;
    else if (name === 'scope')
      out = /^(row|col|rowgroup|colgroup)$/i.test(val) ? val.toLowerCase() : null;
    else out = String(val);
    if (out === null || out === '') el.removeAttributeNode(a);
    else if (out !== val) el.setAttribute(name, out);
  }
  if (tag === 'img' && !el.getAttribute('src')) return false;
  if (tag === 'a') {
    if (!el.getAttribute('href')) {
      el.removeAttribute('target');
      el.removeAttribute('rel');
    } else {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  }
  return true;
}

function sanitizePass(html: string): string {
  const doc = parse(html);
  const body = doc.body;
  if (!body) return '';
  let nodes = 0;
  const walk = (parent: Node, depth: number) => {
    for (const n of [...parent.childNodes]) {
      if (++nodes > LIMITS.maxNodes) {
        n.parentNode?.removeChild(n);
        continue;
      }
      if (n.nodeType === 3) continue;
      if (n.nodeType !== 1) {
        n.parentNode?.removeChild(n);
        continue;
      }
      const el = n as Element;
      const tag = el.localName;
      if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || DROP_SUBTREE.has(tag)) {
        el.parentNode?.removeChild(el);
        continue;
      }
      if (!Object.hasOwn(TAGS, tag) || depth >= LIMITS.maxDepth) {
        walk(el, depth + 1);
        unwrap(el);
        continue;
      }
      if (!cleanAttrs(el, tag, doc)) {
        el.parentNode?.removeChild(el);
        continue;
      }
      walk(el, depth + 1);
    }
  };
  walk(body, 0);
  return body.innerHTML;
}

/** 整段退成純文字（跳脫過） */
function toText(html: string): string {
  try {
    return escText(parse(html).body?.textContent ?? '');
  } catch {
    return '';
  }
}

/** 唯一入口：回傳可以放進 innerHTML 的字串；看不懂就回傳跳脫過的純文字 */
export function sanitizeRichHtml(input: unknown): string {
  const raw = typeof input === 'string' ? input : '';
  if (!raw) return '';
  if (raw.length > LIMITS.maxInput) return toText(raw.slice(0, LIMITS.maxInput));
  let once: string;
  let twice: string;
  try {
    once = sanitizePass(raw);
    twice = sanitizePass(once);
  } catch {
    return toText(raw);
  }
  if (once === twice) return once;
  let third: string;
  try {
    third = sanitizePass(twice);
  } catch {
    return toText(raw);
  }
  return third === twice ? twice : toText(raw);
}

/** 只有空白（沒有字、沒有圖、沒有表格與分隔線）＝沒有內容 */
export function richIsEmpty(html: string): boolean {
  if (!html.trim()) return true;
  if (/<(img|hr|table)\b/i.test(html)) return false;
  return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '').length;
}

/**
 * 轉成純文字的「行」（角色卡）：段落、清單項、標題、<br> 各自一行；表格一列一行、儲存格之間用「｜」
 * （原作的 richToLines 儲存格黏在一起）；連續空行最多一行。
 */
export function richToLines(html: string): string[] {
  try {
    const doc = parse(html);
    for (const tr of [...doc.body.querySelectorAll('tr')]) {
      const cells = [...tr.children]
        .filter((c) => c.localName === 'td' || c.localName === 'th')
        .map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
      tr.replaceWith(doc.createTextNode(`${cells.join('｜')}\n`));
    }
    for (const br of [...doc.body.querySelectorAll('br')]) br.replaceWith('\n');
    for (const el of doc.body.querySelectorAll(
      'p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, caption',
    ))
      el.append('\n');
    return (doc.body.textContent ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter((x, i, a) => x || (i && a[i - 1]));
  } catch {
    return [];
  }
}

/* ---------- 圖片參照（rcimg:<資產 id>） ---------- */

/** 顯示（編輯器）或匯出（互動網頁）前：參照換成網址；沒有的原樣留著 */
export function richUnpack(
  html: string,
  url: (assetId: string) => string | null | undefined,
): string {
  if (!html?.includes('rcimg:')) return html;
  return html.replace(/src="rcimg:([0-9a-z-]{3,80})"/g, (m, id: string) => {
    const u = url(id);
    return u ? `src="${u}"` : m;
  });
}
