/**
 * 互動 HTML（規格 3.2）：一段可以貼進網頁的程式碼（`<div>`＋`<style>`＋`<script>`，樣式以元件自己的 id 為範圍），
 * 以及包了這段的獨立 HTML。遊玩畫面的程式和工具的試玩是同一份（engine.ts 的 mountClueMap，原樣放進 <script>）。
 * buildInteractiveHtml 是純函式（圖片網址由呼叫端給；瀏覽器裡用 images.ts 的 resolveExportSources 把上傳的圖變成 data URL）。
 * 圖片放在一張圖片表裡（同一張只放一份），由程式填進 `<img>`；沒有 KP 備註。
 */
import {
  type InteractiveHtml,
  interactiveFileName,
  widgetId as newWidgetId,
  scriptJson,
  standaloneDocument,
  styleText,
} from '@/core/interactive';
import { mountClueMap } from './engine';
import { clueMapCss, playConfig, progressKey, type SrcOf } from './markup';
import type { ClueMapState } from './model';
import { S } from './strings';

/** 元件的 id（每次產生都不同，同一頁貼好幾張也不會互相影響） */
export const widgetId = (): string => newWidgetId('cm');

/** 遊玩畫面程式的原始碼（函式運算式） */
export const engineSource = (): string => mountClueMap.toString();

export type { InteractiveHtml };

export function buildInteractiveHtml(
  d: ClueMapState,
  srcOf: SrcOf,
  { id = widgetId(), engine = engineSource() }: { id?: string; engine?: string } = {},
): InteractiveHtml {
  const config = playConfig(d, srcOf, { storageKey: progressKey(d) });
  const css = clueMapCss(`#${id}`);
  const script = `(function () {
  var root = document.getElementById(${scriptJson(id)});
  if (!root || root.getAttribute('data-ready') === '1') return;
  root.setAttribute('data-ready', '1');
  var mount = (${engine});
  mount(root, ${scriptJson(config)});
})();`;
  const snippet = `<!-- ${S.html.commentStart} -->
<div id="${id}"></div>
<style>
${styleText(css)}
</style>
<script>
${script}
</script>
<!-- ${S.html.commentEnd} -->`;
  const standalone = standaloneDocument({
    title: d.title.trim() || S.html.docTitle,
    css: 'html,body{margin:0}body{box-sizing:border-box;min-height:100vh;padding:16px;background:#d9d6cf}',
    body: snippet,
  });
  return { snippet, standalone };
}

/** 互動 HTML 的檔名：調查熱點圖.html／調查熱點圖_<標題>.html */
export const htmlFileName = (d: Pick<ClueMapState, 'title'>): string =>
  interactiveFileName(S.fileBase, d.title);
