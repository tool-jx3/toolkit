/* TRPG Toolkit — 共用 i18n 引擎。
 * Vanilla JavaScript，無建置步驟，無相依套件。
 *
 * 頁面先載入本檔，再載入各工具的字典檔：
 *
 *   <script defer src="../../assets/i18n.js"></script>
 *   <script defer src="./i18n.magic-circle.js"></script>
 *   <script defer src="./app.js"></script>
 *
 * 字典檔尾端呼叫 I18N.register({ 'zh-TW': {...}, ko: {...} })。
 * defer 保證上述順序，且三者皆早於 DOMContentLoaded 執行完畢，
 * 因此 app.js 可在 top-level 直接呼叫 T()。
 *
 * applyStaticDom() 套用的標記掛勾：
 *   data-i18n             → textContent
 *   data-i18n-node        → 僅第一個非空文字節點
 *                           （用於 <label>文字 <input></label> 這類標記）
 *   data-i18n-html        → innerHTML（僅限開發者撰寫的標記）
 *   data-i18n-title       → title 屬性
 *   data-i18n-aria-label  → aria-label 屬性
 *   data-i18n-placeholder → placeholder 屬性
 *
 * HTML 內嵌文字以預設語言 zh-TW 撰寫，因此頁面在任何腳本執行前
 * 即為正確呈現，不會有語言閃現。
 */

const I18N_STORAGE_KEY = 'trpg-toolkit-locale';
const I18N_DEFAULT = 'zh-TW';

const LOCALES = {
  'zh-TW': { label: '繁體中文', lang: 'zh-Hant-TW' },
  ko: { label: '한국어', lang: 'ko' }
};

const MESSAGES = { 'zh-TW': {}, ko: {} };

/* 只採用使用者明示的選擇；不偵測瀏覽器語言。 */
function storedLocale() {
  try {
    const saved = localStorage.getItem(I18N_STORAGE_KEY);
    if (saved && LOCALES[saved]) return saved;
  } catch { /* 隱私模式：改用預設值 */ }
  return I18N_DEFAULT;
}

const I18N = {
  locale: storedLocale(),
  locales: LOCALES,
  messages: MESSAGES,
  listeners: new Set(),

  register(dictionaries) {
    for (const [locale, entries] of Object.entries(dictionaries)) {
      if (!MESSAGES[locale]) MESSAGES[locale] = {};
      Object.assign(MESSAGES[locale], entries);
    }
  },

  t(key, ...args) {
    const table = MESSAGES[this.locale] || MESSAGES[I18N_DEFAULT];
    let value = table[key];
    if (value === undefined) value = MESSAGES[I18N_DEFAULT][key];
    if (value === undefined) return key;
    return args.length
      ? value.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined ? m : args[i]))
      : value;
  },

  onChange(listener) { this.listeners.add(listener); },

  setLocale(locale, { silent = false } = {}) {
    if (!MESSAGES[locale] || locale === this.locale) return false;
    this.locale = locale;
    try { localStorage.setItem(I18N_STORAGE_KEY, locale); } catch { /* 儲存空間不可用 */ }
    this.applyStaticDom();
    if (!silent) for (const listener of this.listeners) listener(locale);
    return true;
  },

  applyStaticDom(root = document) {
    document.documentElement.lang = LOCALES[this.locale]?.lang || this.locale;
    const title = this.t('app.title');
    if (title !== 'app.title') document.title = title;

    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = this.t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = this.t(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll('[data-i18n-node]')) replaceFirstTextNode(el, this.t(el.dataset.i18nNode));
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = this.t(el.dataset.i18nTitle);
    for (const el of root.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', this.t(el.dataset.i18nAriaLabel));
    for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = this.t(el.dataset.i18nPlaceholder);
  },

  /* 以可用語言填滿 <select> 並保持同步。六個頁面共用同一套切換邏輯。 */
  mountSwitcher(select) {
    if (!select) return;
    select.innerHTML = Object.entries(LOCALES)
      .map(([code, meta]) => `<option value="${escapeHtml(code)}">${escapeHtml(meta.label)}</option>`)
      .join('');
    select.value = this.locale;
    select.addEventListener('change', () => {
      if (!this.setLocale(select.value)) select.value = this.locale;
    });
    this.onChange(() => { select.value = this.locale; });
  }
};

/* 逃逸 HTML 特殊字元。LOCALES 目前是寫死的常數，本來就安全；
 * 但 README.md 的「新增語言」段落邀請他人直接編輯 LOCALES，一旦寫入的
 * 顯示名稱含 `<`、`&` 等字元，mountSwitcher() 的字串插值就會被當成標記
 * 解析，故在此逃逸以防患未然。 */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* 僅置換第一個非空文字節點，使 <label>名稱 <input></label> 這類
 * 標記的子元素得以保留。 */
function replaceFirstTextNode(el, text) {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
      const [, lead = '', , trail = ''] = node.nodeValue.match(/^(\s*)(.*?)(\s*)$/s) || [];
      node.nodeValue = `${lead}${text}${trail}`;
      return;
    }
  }
  el.prepend(document.createTextNode(`${text} `));
}

/* window 供瀏覽器使用；globalThis 使字典檔在測試沙箱中也看得到 I18N。 */
window.I18N = I18N;
window.T = I18N.t.bind(I18N);
globalThis.I18N = I18N;
globalThis.T = window.T;

document.addEventListener('DOMContentLoaded', () => I18N.applyStaticDom());
