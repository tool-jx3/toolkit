/**
 * 互動 HTML（規格 3.7）：一段可以貼進網頁的程式碼（`<div>`＋`<style>`＋`<script>`，樣式以元件自己的 id 為範圍），
 * 以及包了這段的獨立 HTML。刮刮卡的程式和工具的預覽是同一份（engine.ts 的 mountScratch，原樣放進 <script>）。
 * buildInteractiveHtml 是純函式（圖片網址由呼叫端給；瀏覽器裡用 images.ts 的 resolveExportSources 把上傳的圖變成 data URL）。
 * 結果的圖放在一張圖片表裡（同一張只放一份），開頁時由程式填進 `<img data-scx-img>`；裁切範圍照樣寫在 HTML 裡（顯示時才裁）。
 */
import { escapeHtml } from '@/core/html';
import {
  type InteractiveHtml,
  interactiveFileName,
  widgetId as newWidgetId,
  scriptJson,
  standaloneDocument,
  styleText,
} from '@/core/interactive';
import type { Card } from './card';
import { mountScratch } from './engine';
import {
  CARD_BORDER,
  CARD_FONT,
  cardCss,
  cardHtml,
  engineConfig,
  type ImageSource,
} from './markup';
import type { ImageRef } from './model';
import { S } from './strings';

/** 元件的 id（每次產生都不同，同一頁貼好幾張也不會互相影響） */
export const widgetId = (): string => newWidgetId('scx');

/** 刮刮卡程式的原始碼（函式運算式） */
export const engineSource = (): string => mountScratch.toString();

export type { InteractiveHtml };

export function buildInteractiveHtml(
  card: Card,
  src: (image: ImageRef, trim: boolean) => ImageSource,
  { id = widgetId(), engine = engineSource() }: { id?: string; engine?: string } = {},
): InteractiveHtml {
  const scope = `#${id}`;
  const outerW = card.width + CARD_BORDER * 2;
  const css = [
    `${scope}{box-sizing:border-box;width:100%;max-width:100%;margin:0 auto;font-family:${CARD_FONT}}`,
    `${scope} .scx-fit{width:100%;max-width:${outerW}px;margin:0 auto}`,
    cardCss(scope, `${id}-pop`),
    `${scope} .scx-actions{margin:15px 0 0;text-align:center}`,
    `${scope} .scx-reset{display:inline-block;margin:0;padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font:inherit;font-size:14px;line-height:1.4;color:#4b5563;box-shadow:0 1px 2px rgba(0,0,0,.05)}`,
    `${scope} .scx-reset:hover{background:#f9fafb}`,
    `${scope} .scx-reset:focus-visible{outline:2px solid #2563eb;outline-offset:2px}`,
  ].join('\n');
  const config = engineConfig(card, { popClass: null, confetti: true, fit: true });
  const table: string[] = [];
  const cardMarkup = cardHtml(card, { src, pop: false, table });
  const script = `(function () {
  var root = document.getElementById(${scriptJson(id)});
  if (!root || root.getAttribute('data-ready') === '1') return;
  root.setAttribute('data-ready', '1');
  var images = ${scriptJson(table)};
  Array.prototype.forEach.call(root.querySelectorAll('img[data-scx-img]'), function (el) {
    el.src = images[Number(el.getAttribute('data-scx-img'))] || '';
  });
  var mount = (${engine});
  var handle = mount(root.querySelector('[data-scx="card"]'), ${scriptJson(config)}, {});
  var reset = root.querySelector('.scx-reset');
  if (reset) reset.addEventListener('click', function () { handle.recover(); });
})();`;
  const snippet = `<!-- ${S.html.commentStart} -->
<div id="${id}" class="scx">
<div class="scx-fit">${cardMarkup}</div>
<div class="scx-actions"><button type="button" class="scx-reset">${escapeHtml(S.recover)}</button></div>
</div>
<style>
${styleText(css)}
</style>
<script>
${script}
</script>
<!-- ${S.html.commentEnd} -->`;
  const title = card.title?.text.trim() || S.html.docTitle;
  const standalone = standaloneDocument({
    title,
    css: 'html,body{margin:0}body{display:flex;align-items:center;justify-content:center;min-height:100vh;box-sizing:border-box;padding:16px;background:#f3f4f6}body>.scx{width:100%}',
    body: snippet,
  });
  return { snippet, standalone };
}

/** 互動 HTML 的檔名：刮刮卡.html／刮刮卡_<標題>.html */
export function htmlFileName(card: Card): string {
  return interactiveFileName('刮刮卡', card.title?.text ?? '');
}
