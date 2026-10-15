/**
 * 舊格式日誌的訊息內容是 HTML 原文（規格 2.4），輸出前用 DOMPurify 白名單淨化（第 5 節第 8 項、第 7 節裁定）：
 * 只留排版用的行內標籤（br、b、i、u、s、span…），拿掉指令碼、事件屬性與其他元素；
 * style 屬性只留顏色、粗細、斜體、底線、字級與背景色，而且不能有 url()、expression 這類會載入外部資源的寫法。
 */
import DOMPurify from 'dompurify';
import { cleanInlineStyle } from './inlineStyle';

export { cleanInlineStyle };

const ALLOWED_TAGS = [
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'span',
  'small',
  'big',
  'sub',
  'sup',
  'mark',
  'code',
  'font',
  'ruby',
  'rb',
  'rt',
  'rp',
];

const ALLOWED_ATTR = ['style', 'color'];

let purifier: ReturnType<typeof DOMPurify> | null = null;

function getPurifier(): ReturnType<typeof DOMPurify> {
  if (purifier) return purifier;
  const p = DOMPurify(window);
  p.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style') {
      const cleaned = cleanInlineStyle(data.attrValue);
      if (cleaned) data.attrValue = cleaned;
      else data.keepAttr = false;
    }
  });
  purifier = p;
  return p;
}

/** 淨化一段行內 HTML（舊格式的訊息內容） */
export function sanitizeLogHtml(html: string): string {
  if (!html) return '';
  return getPurifier().sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  }) as string;
}
