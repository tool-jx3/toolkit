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
 *   data-i18n-alt         → alt 屬性
 *   data-i18n-placeholder → placeholder 屬性
 *
 * HTML 內嵌文字以預設語言 zh-TW 撰寫，因此頁面在任何腳本執行前
 * 即為正確呈現，不會有語言閃現。
 */

const I18N_STORAGE_KEY = 'trpg-toolkit-locale';
const I18N_DEFAULT = 'zh-TW';

const LOCALES = {
  'zh-TW': { label: '繁體中文', lang: 'zh-Hant-TW' },
  ko: { label: '한국어', lang: 'ko' },
  ja: { label: '日本語', lang: 'ja' }
};

const MESSAGES = { 'zh-TW': {}, ko: {}, ja: {} };

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

  /* 這個頁面實際載入了字典的語言。各工具只會載入自己的字典，因此原文為
   * 韓文的工具不會列出「日本語」，原文為日文的工具也不會列出「한국어」。
   * 預設語言一律視為可用（所有頁面的內嵌文字都是繁體中文）。 */
  availableLocales() {
    return Object.keys(LOCALES)
      .filter(code => code === I18N_DEFAULT || Object.keys(MESSAGES[code] || {}).length > 0);
  },

  /* 語言偏好全站共用，但各工具的原文語言不同。若目前頁面沒有該語言的字典，
   * 就以預設語言呈現，且不動 localStorage 裡的偏好——回到有該語言的頁面時
   * 仍會恢復成使用者選的語言。 */
  resolveLocale() {
    if (!this.availableLocales().includes(this.locale)) this.locale = I18N_DEFAULT;
    return this.locale;
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
    if (!this.availableLocales().includes(locale) || locale === this.locale) return false;
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
    for (const el of root.querySelectorAll('[data-i18n-alt]')) el.alt = this.t(el.dataset.i18nAlt);
  },

  /* 以該頁可用的語言填滿 <select> 並保持同步。各頁面共用同一套切換邏輯。 */
  mountSwitcher(select) {
    if (!select) return;
    this.resolveLocale();
    select.innerHTML = this.availableLocales()
      .map(code => `<option value="${i18nEscapeHtml(code)}">${i18nEscapeHtml(LOCALES[code].label)}</option>`)
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
function i18nEscapeHtml(s) {
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

document.addEventListener('DOMContentLoaded', () => {
  I18N.resolveLocale();
  I18N.applyStaticDom();
});
