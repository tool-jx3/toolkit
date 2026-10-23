/**
 * core/interactive：「互動 HTML」輸出的共用零件（scratch-card、clue-map…）。
 *
 * 互動 HTML＝一段可以貼進網頁的 `<div>`＋`<style>`＋`<script>`（樣式以元件自己的 id 為範圍），以及把這段包起來的獨立 HTML 檔。
 * 工具的預覽與輸出用**同一份**互動程式：把一個**自給自足的函式**（不用到函式外面的任何東西）用 `fn.toString()` 原樣放進 `<script>`。
 *
 * ```ts
 * const id = widgetId('cm');                                   // 'cm-k3j9x0ab'：每次產生都不同，同一頁貼好幾份也不會互相影響
 * const script = `(function(){ var mount = (${mountThing.toString()}); mount(document.getElementById(${scriptJson(id)}), ${scriptJson(config)}); })();`;
 * const snippet = `<div id="${id}">…</div>\n<style>\n${styleText(css)}\n</style>\n<script>\n${script}\n</script>`;
 * const standalone = standaloneDocument({ title, css: 'html,body{margin:0}', body: snippet });
 * downloadText(standalone, interactiveFileName('調查熱點圖', title), 'text/html;charset=utf-8');
 * ```
 *
 * 注意：函式經過打包、壓縮之後 `toString()` 仍可用，但函式裡**不可以**引用 import 進來的東西或模組層的常數與函式
 * （壓縮會改名，貼到頁面上就找不到）；型別在編譯時會拿掉，可以放在外面。需要的文字、設定都從參數帶入。
 */
import { safeFileName } from '../files';
import { escapeHtml } from '../html';

/** 互動 HTML 的輸出：可以貼進網頁的程式碼，以及包好的獨立 HTML 檔 */
export interface InteractiveHtml {
  snippet: string;
  standalone: string;
}

/** 放進 `<script>` 的 JSON：`<` 換成跳脫的寫法（字串裡有 `</script>` 也不會提早結束），U+2028／U+2029 也跳脫 */
export const scriptJson = (v: unknown): string =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** 元件的 id：`<前綴>-` ＋ 8 個小寫英數字（每次產生都不同） */
export const widgetId = (prefix: string): string =>
  `${prefix}-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;

/** 放進 `<style>` 的 CSS：`</` 跳脫（不會提早結束標籤） */
export const styleText = (css: string): string => css.replace(/<\//g, '<\\/');

/** 獨立 HTML 檔：最小的網頁外殼（繁中、行動版 viewport），`css` 是外殼自己的樣式（置中、底色），`body` 放程式碼 */
export function standaloneDocument({
  title,
  css,
  body,
}: {
  title: string;
  css: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** 互動 HTML 的檔名：`<名稱>.html`；有標題時 `<名稱>_<標題>.html`（標題經 safeFileName，最長 40 字） */
export function interactiveFileName(base: string, title: string): string {
  const t = safeFileName(title.trim(), { fallback: '', maxLength: 40 });
  return t ? `${base}_${t}.html` : `${base}.html`;
}

/** 把 HTML 開在新視窗（Blob 網址，60 秒後釋放）；被瀏覽器擋住時回傳 false */
export function openHtmlWindow(html: string): boolean {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const win = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!win;
}
