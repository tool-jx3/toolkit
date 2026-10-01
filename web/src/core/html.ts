/**
 * core/html：產生 HTML 文字（給「可以貼 HTML 的網站」的輸出）時的跳脫。
 * 使用者輸入的字一律跳脫後才放進 HTML，「<」「&」不會弄壞結構。
 */

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 文字內容與屬性值都安全的跳脫（& < > " '） */
export function escapeHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** 屬性值（同 escapeHtml；另外把換行換成 &#10;，屬性裡的換行不會被吃掉） */
export function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '&#10;');
}
