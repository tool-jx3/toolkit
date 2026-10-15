/**
 * 行內樣式的白名單（第 5 節第 8 項）：style 屬性只留顏色、背景色、粗細、斜體、字級與底線，
 * 而且不能有 url()、expression 這類會載入外部資源的寫法。
 * 網頁的淨化（sanitize.ts，DOMPurify）與 EPUB 的 XHTML 轉換（epub/xhtml.ts，在 Worker 裡跑）共用，
 * 所以這個檔不能引用 DOM。
 */

const STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'font-size',
  'text-decoration',
  'text-decoration-line',
]);

/** style 屬性只留安全的幾個屬性 */
export function cleanInlineStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => {
      const i = decl.indexOf(':');
      if (i < 0) return '';
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim();
      if (!STYLE_PROPS.has(prop) || !value) return '';
      if (/url\s*\(|expression|javascript:|[\\<>{}@]/i.test(value)) return '';
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}
