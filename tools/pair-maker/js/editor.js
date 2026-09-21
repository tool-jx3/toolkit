import { loadTemplate } from '../templates/registry.js';
(() => {
  "use strict";

  const currentId = new URLSearchParams(location.search).get("id");
  /* i18n 引擎會在 DOMContentLoaded 把 document.title 換成 app.title，而這頁的
   * 標題要等 index.html 抓回來才知道。引擎的監聽器先註冊，所以在這裡再註冊一個
   * 就一定跑在它後面，不管 fetch 比 DOMContentLoaded 早完成還是晚完成都對。 */
  let currentPageTitle = "";
  document.addEventListener("DOMContentLoaded", () => {
    if (currentPageTitle) document.title = currentPageTitle;
  });
  const title = document.querySelector("#editor-title");
  const status = document.querySelector("#editor-status");
  const list = document.querySelector("#related-templates");
  const listStatus = document.querySelector("#list-status");

  function setOptionalText(selector, text) {
    const element = document.querySelector(selector);
    element.textContent = text || "";
    element.hidden = !text;
  }

  async function showTemplate(card) {
    const definition = await loadTemplate(currentId);
    /* 版型的署名有兩種寫法：固定字串，或含 T() 的函式（那種不能在模組最外層
     * 就算好，會凍在載入當下的語言）。兩種都要吃。 */
    const author = typeof definition?.author === 'function' ? definition.author() : definition?.author;
    const settings = definition ? { author, ...definition.size } : {};
    title.textContent = card.title || T("editor.001");
    /* i18n 引擎會在 DOMContentLoaded 把 document.title 換成 app.title，而這裡的
     * 標題要等 index.html 抓回來才知道——兩者會賽跑。同步設一次，若文件還沒
     * 解析完就再補設一次，順序才穩。 */
    currentPageTitle = title.textContent + T("editor.002");
    document.title = currentPageTitle;
    setOptionalText("#editor-tag", card.tag);
    document.querySelector("#editor-tag").classList.toggle("editor-tag--red", !!card.tagRed);
    setOptionalText("#editor-credit", settings.author);
    const width = settings.width > 0 ? settings.width : 1920;
    const height = settings.height > 0 ? settings.height : 1080;
    document.querySelector("#konva-container").style.setProperty("--canvas-ratio", width + " / " + height);
    window.editorTemplate = {
      ...settings, definition, id: currentId, title: card.title, tag: card.tag, width, height
    };
    fitCanvas();
    window.dispatchEvent(new CustomEvent("editor:ready", { detail: window.editorTemplate }));
  }

  async function loadTemplates() {
    try {
      const response = await fetch("index.html");
      if (!response.ok) throw new Error(T("editor.003"));
      const doc = new DOMParser().parseFromString(await response.text(), "text/html");
      const seen = new Set();
      const cards = [...doc.querySelectorAll("#template-gallery .template-card")].flatMap(anchor => {
        const url = new URL(anchor.getAttribute("href"), response.url);
        const id = url.searchParams.get("id");
        const img = anchor.querySelector("img");
        if (!id || !img || seen.has(id) || url.origin !== location.origin) return [];
        seen.add(id);
        /* index.html 是用 fetch 讀進來的原始標記，裡面的文字是繁中內嵌值。
         * 掛在同一個元素上的 data-i18n 才是 key，照 key 翻才會跟著語言走。 */
        const translated = element => {
          if (!element) return "";
          const key = element.dataset.i18n;
          return key ? T(key) : element.textContent.trim();
        };
        return [{
          id, href: url.href,
          image: new URL(img.getAttribute("src"), response.url).href,
          title: translated(anchor.querySelector(".template-title")) || img.alt,
          tag: translated(anchor.querySelector(".template-tag")),
          tagRed: anchor.querySelector(".template-tag")?.classList.contains("template-tag--red") || false
        }];
      });

      const current = cards.find(card => card.id === currentId);
      if (current) {
        await showTemplate(current);
      } else {
        title.textContent = T("editor.004");
        status.textContent = T("editor.005");
        status.hidden = false;
      }

      list.replaceChildren();
      for (const card of cards.filter(card => card.id !== currentId)) {
        const link = document.createElement("a");
        link.className = "related-card";
        link.href = card.href;
        link.setAttribute("aria-label", card.title);
        const image = document.createElement("img");
        image.src = card.image;
        image.alt = card.title;
        image.loading = "lazy";
        image.addEventListener("error", () => {
          const fallback = document.createElement("span");
          fallback.className = "missing-image";
          fallback.textContent = card.title;
          image.replaceWith(fallback);
        }, { once: true });
        link.append(image);
        if (card.tag) {
          const tag = document.createElement("span");
          tag.className = "template-tag";
          tag.classList.toggle("template-tag--red", card.tagRed);
          tag.textContent = card.tag;
          link.append(tag);
        }
        const caption = document.createElement("strong");
        caption.className = "template-title";
        caption.textContent = card.title;
        link.append(caption);
        list.append(link);
      }
      listStatus.textContent = list.children.length ? "" : T("editor.006");
    } catch (error) {
      listStatus.textContent = T("editor.007");
      status.textContent = T("editor.008");
      status.hidden = false;
      console.error(error);
    }
  }

  const canvasArea = document.querySelector(".canvas-area");
  const container = document.querySelector("#konva-container");

  function fitCanvas() {
    const settings = window.editorTemplate || { width: 1920, height: 1080 };
    const style = getComputedStyle(canvasArea);
    const availableWidth = Math.max(0, canvasArea.clientWidth
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availableHeight = Math.max(0, canvasArea.clientHeight
      - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    const scale = Math.min(availableWidth / settings.width, availableHeight / settings.height);
    const width = settings.width * scale;
    const height = settings.height * scale;
    container.style.width = width + "px";
    container.style.height = height + "px";
    container.dispatchEvent(new CustomEvent("editor:resize", {
      detail: { width, height, scale, originalWidth: settings.width, originalHeight: settings.height }
    }));
  }

  const canvasObserver = new ResizeObserver(fitCanvas);
  window.addEventListener('editor:layout',fitCanvas);
  canvasObserver.observe(canvasArea);

  const sidebarToggle = document.querySelector(".sidebar-toggle");
  const sidebar = document.querySelector("#template-sidebar");
  const toolsToggle = document.querySelector(".tools-toggle");

  /* 兩個收合鈕的 aria-label 跟著收合狀態走，所以不掛 data-i18n-aria-label——
   * 那個掛勾在切語言時會一律寫回標記裡那一種狀態的字。改成依現況重算，
   * 開頭與切語言時各跑一次。 */
  function syncToggleLabels() {
    sidebarToggle.setAttribute("aria-label",
      document.body.classList.contains("sidebar-collapsed") ? T("editor.009") : T("editor.010"));
    toolsToggle.setAttribute("aria-label",
      document.body.classList.contains("tools-collapsed") ? T("runtime.001") : T("editor.011"));
  }
  syncToggleLabels();

  sidebarToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle(
      "sidebar-collapsed"
    );
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    syncToggleLabels();
    sidebar.inert = collapsed;
  });

  toolsToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("tools-collapsed");
    toolsToggle.setAttribute("aria-expanded", String(!collapsed));
    syncToggleLabels();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!window.matchMedia("(max-width: 1024px)").matches) return;
    if (document.body.classList.contains("tools-collapsed")) return;

    if (event.target.closest(".editor-tools button")) return;

    document.body.classList.add("tools-collapsed");
    toolsToggle.setAttribute("aria-expanded", "false");
    syncToggleLabels();
  }, { capture: true });

  loadTemplates();

  /* 切語言：工具列、側邊欄的版型清單與標題都要重寫。編輯器本體（分頁名稱、
   * 欄位標籤、畫布上的預設文字）是在建立當下算好的，所以另外用 store 的
   * 'structure' 事件整個重跑一次——那條路徑本來就是給「版型結構變了」用的。 */
  I18N.mountSwitcher(document.getElementById("localeSelect"));
  I18N.onChange(() => {
    loadTemplates();
    syncToggleLabels();
    const store = window.pairEditor?.store;
    if (!store) return;
    const wasDirty = store.dirty;
    store.change(() => {}, "structure");
    if (!wasDirty) store.markSaved();
  });
})();
