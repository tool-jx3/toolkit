/**
 * 寫進 CSS 的使用者輸入：字串、註解、識別字、字型名稱。目標是「不論輸入什麼，CSS 都不會壞、註解不會提早結束」。
 */

/* biome-ignore lint/suspicious/noControlCharactersInRegex: 要找出控制字元 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
/* biome-ignore lint/suspicious/noControlCharactersInRegex: 要找出換行以外的控制字元 */
const CONTROL_KEEP_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

/**
 * CSS 字串（含引號），可直接放在 `content:`、`font-family:` 等地方。
 * 反斜線、雙引號跳脫；換行變成 `\A `（顯示時是換行，需搭配 white-space）；其他控制字元以十六進位跳脫。
 *
 * cssString('他說"嗨"\\') → '"他說\\"嗨\\"\\\\"'
 */
export function cssString(value: string): string {
  let out = '';
  for (const ch of String(value ?? '')) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (code === 0) out += '\uFFFD';
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029)
      out += `\\${code.toString(16).toUpperCase()} `;
    else out += ch;
  }
  return `"${out}"`;
}

/** CSS 的 url("…")：引號、反斜線、換行都跳脫 */
export function cssUrl(url: string): string {
  return `url(${cssString(String(url ?? '').replace(/[\r\n]+/g, ''))})`;
}

/**
 * 換成單行文字：換行、Tab 與其他控制字元換成空白，去掉前後空白（不合併中間的空白）。
 * 名字標籤、標題等「永遠單行」的使用者輸入用。
 */
export function singleLine(text: string): string {
  return String(text ?? '')
    .replace(/\r\n/g, ' ')
    .replace(CONTROL, ' ')
    .trim();
}

/**
 * 放進 `/* … *\/` 註解裡的文字：把「*\/」拆開（變成「* /」），避免使用者輸入提早結束註解；
 * 控制字元（換行除外）換成空白。
 */
export function cssCommentText(text: string): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_KEEP_NEWLINE, ' ')
    .replace(/\*\//g, '* /');
}

/**
 * 整段註解。多行時每行前面加「 * 」：
 * cssComment(['狀態條', '網址：…']) →
 * ```
 * /*
 *  * 狀態條
 *  * 網址：…
 *  *\/
 * ```
 */
export function cssComment(text: string | readonly string[]): string {
  const lines = (typeof text === 'string' ? [text] : [...text])
    .flatMap((l) => cssCommentText(l).split('\n'))
    .map((l) => l.replace(/\s+$/, ''));
  if (lines.length === 1) return `/* ${lines[0]} */`;
  return ['/*', ...lines.map((l) => (l ? ` * ${l}` : ' *')), ' */'].join('\n');
}

/**
 * CSS 識別字的跳脫（與瀏覽器的 CSS.escape 相同的規則），給動畫名稱、class、自訂屬性名稱用。
 */
export function cssIdent(value: string): string {
  const s = String(value ?? '');
  let out = '';
  const first = s.codePointAt(0);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0) {
      out += '\uFFFD';
    } else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && first === 0x2d)
    ) {
      out += `\\${code.toString(16)} `;
    } else if (i === 0 && s.length === 1 && code === 0x2d) {
      out += `\\${s.charAt(i)}`;
    } else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      out += s.charAt(i);
    } else {
      out += `\\${s.charAt(i)}`;
    }
  }
  return out;
}

/** 通用字族（不加引號） */
export const GENERIC_FONT_FAMILIES: readonly string[] = [
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
];

/**
 * 清理使用者輸入的字型名稱：換行與控制字元換成空白；去掉 `; { } ( ) " ' \ < >` 等會弄壞 CSS 的字元；
 * 合併空白、去掉前後空白。空字串表示沒有名稱（只用後備字型）。
 */
export function cleanFontName(name: string): string {
  return String(name ?? '')
    .replace(CONTROL, ' ')
    .replace(/[;{}()"'\\<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 一個字型名稱 → CSS 的寫法：通用字族不加引號，其他加雙引號（以數字開頭的名稱不加引號會讓整條設定失效） */
export function quoteFontFamily(name: string): string {
  const n = cleanFontName(name);
  if (!n) return '';
  return GENERIC_FONT_FAMILIES.includes(n.toLowerCase()) ? n.toLowerCase() : `"${n}"`;
}

/**
 * 逗號分隔的多個字型名稱（使用者輸入）→ CSS font-family 值；全部無效時回傳空字串。
 * fontFamilyList('Noto Sans TC, 123 Font, serif') → '"Noto Sans TC", "123 Font", serif'
 */
export function fontFamilyList(input: string): string {
  return String(input ?? '')
    .split(',')
    .map(quoteFontFamily)
    .filter(Boolean)
    .join(', ');
}
