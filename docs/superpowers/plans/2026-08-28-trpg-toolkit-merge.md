# TRPG Toolkit 合併實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 sotsotssi 的五個韓文網頁工具合併為單一 repo，加上繁體中文介面，並以 GitHub Pages 部署於 https://tool-jx3.github.io/toolkit/

**Architecture:** 靜態網站，無建置步驟。根目錄為工具列表首頁，各工具置於 `tools/<name>/`。共用一份 vanilla JS i18n 引擎（`assets/i18n.js`），各工具僅提供自己的字典檔。HTML 內嵌文字為繁中（預設語言），韓文存於字典。品質關卡為 `tests/smoke.mjs` 的靜態掃描，特別是韓文洩漏檢查。

**Tech Stack:** Vanilla JavaScript（ES2020+）、Node.js 內建模組（`node:fs`、`node:vm`）、無 npm 相依套件。各工具原有的 CDN 依賴維持不變。

**Spec:** `docs/superpowers/specs/2026-08-28-trpg-toolkit-merge-design.md`

## Global Constraints

- 目標 repo：`tool-jx3/toolkit`；部署 `main` 分支根目錄
- 語言僅兩種：`zh-TW`（預設與 fallback）、`ko`
- localStorage key 統一為 `trpg-toolkit-locale`
- HTML 內嵌文字一律繁中；韓文只出現在字典檔的 `ko` 區塊，以及 emotion-maker 的資料 ID
- 不得新增任何 npm 執行期相依；`package.json` 不得有 `dependencies` 或 `devDependencies`
- 不得更動任何工具的功能行為（唯一例外：還原 magic-circle 的 69 組韓文如尼文讀音）
- 所有工具需能以 `file://` 直接開啟（相對路徑，不使用 ES module import）
- 每個工具目錄保留原始 `LICENSE`（emotion-maker 無此檔）
- 來源 commit：magic-circle `de40a68`／zhtw `772d6c4`、typewriter `cf3ff36`、text-path `b86cd28`、collage-letter `ea08333`、emotion-maker `b455379`

## 關於字典內容

各工具的字典有數十到數百條字串，本計畫不逐條列出，改以三者共同保證完整：

1. 每個 task 的字典步驟都附一行掃描指令，列出該工具全部含韓文的字串
2. Task 2 建立的命名慣例（`app.title`、`lang.aria`、`btn.*`、`msg.*` 等）決定 key 怎麼取
3. `npm test` 的「無殘留韓文」檢查會逐行指出還沒處理的位置，直到全部清空才會通過

換言之，字典的完整性由測試強制，不由計畫的篇幅保證。執行者的工作是反覆
「跑測試 → 看失敗行號 → 補字典」，直到 `all checks passed`。

## 來源檔案位置

五個上游 repo 已複製於暫存區，實作時自該處取檔：

```
<scratchpad>/src/Typewriter-apng/
<scratchpad>/src/magic-circle-maker/     上游（含韓文如尼文讀音）
<scratchpad>/src/text-path-generator/
<scratchpad>/src/collage-letter/
<scratchpad>/src/emotion-maker/
<scratchpad>/src/ref-zhtw/               繁中翻譯來源
```

若暫存區已清除，以 `git clone --depth 1 https://github.com/sotsotssi/<repo>.git` 重新取得；
zhtw 來源為 `git clone --depth 1 -b zhtw https://github.com/tool-jx3/magic-circle-maker.git ref-zhtw`。

---

## File Structure

| 檔案 | 職責 |
|---|---|
| `assets/i18n.js` | i18n 引擎。字典註冊、查詢、DOM 套用、語言切換器掛載。不含任何字典內容。 |
| `assets/home.css` | 首頁樣式。 |
| `assets/home.js` | 首頁腳本（僅掛載語言切換器）。 |
| `assets/i18n.home.js` | 首頁字典。 |
| `index.html` | 首頁：工具卡片列表、語言切換、授權標示。 |
| `tools/<name>/index.html` | 工具標記，內嵌文字為繁中，帶 `data-i18n*` 掛勾。 |
| `tools/<name>/i18n.<name>.js` | 該工具的雙語字典，檔尾呼叫 `I18N.register()`。 |
| `tools/<name>/app.js`（typewriter 為 `script.js`） | 工具邏輯。韓文字面值改為 `T()` 呼叫。 |
| `tests/harness.mjs` | 測試共用工具：check、section、沙箱載入器。 |
| `tests/smoke.mjs` | 靜態檢查總入口，逐工具執行各類檢查。 |
| `ATTRIBUTION.md` | 各工具來源 repo、commit、授權、作者。 |
| `README.md` | 專案說明、工具清單、本機執行、i18n 擴充方式。 |

---

## Task 1: i18n 引擎與測試骨架

**Files:**
- Create: `assets/i18n.js`
- Create: `tests/harness.mjs`
- Create: `tests/smoke.mjs`
- Create: `package.json`
- Create: `.nojekyll`

**Interfaces:**
- Consumes: 無（第一個 task）
- Produces:
  - `window.I18N`，方法：`register(dictionaries)`、`t(key, ...args)`、`setLocale(locale, {silent})`、`onChange(listener)`、`applyStaticDom(root)`、`mountSwitcher(selectElement)`；屬性：`locale`（字串）、`locales`（物件）、`messages`（物件）
  - `window.T`：`I18N.t` 的 bound 版本
  - `tests/harness.mjs` 匯出：`check(label, condition, detail)`、`section(name)`、`loadI18N(dictPaths)`、`summary()`、`read(rel)`、`exists(rel)`、`root`

- [ ] **Step 1: 建立 `tests/harness.mjs`**

各工具測試共用的工具函式。先建立它，Task 1 的測試才有東西可用。

```js
/* 共用測試工具。無外部相依。 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = rel => readFileSync(join(root, rel), 'utf8');
export const exists = rel => existsSync(join(root, rel));

let failures = 0;

export function section(name) {
  console.log(`\n${name}`);
}

export function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`);
  }
}

export function summary() {
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  return failures;
}

/* 在沙箱中載入引擎與零到多個字典檔，回傳該沙箱的 I18N。
 * 每次呼叫都是全新的沙箱，因此各工具的字典互不污染。 */
export function loadI18N(dictPaths = []) {
  const noop = () => {};
  const context = {
    window: {},
    navigator: { languages: ['zh-TW'], language: 'zh-TW' },
    localStorage: { getItem: () => null, setItem: noop },
    document: {
      documentElement: { lang: '' },
      title: '',
      querySelectorAll: () => [],
      createTextNode: () => ({}),
      addEventListener: noop
    },
    Node: { TEXT_NODE: 3 },
    console
  };
  vm.createContext(context);
  vm.runInContext(read('assets/i18n.js'), context, { filename: 'assets/i18n.js' });
  for (const path of dictPaths) {
    vm.runInContext(read(path), context, { filename: path });
  }
  return context.window.I18N;
}
```

註：字典檔以 `I18N.register(...)` 開頭，在沙箱中 `I18N` 需為全域可見。引擎最後的
`window.I18N = I18N` 不會讓 `I18N` 成為沙箱全域變數，因此引擎另需一行
`globalThis.I18N = I18N;`（見 Step 4）。

- [ ] **Step 2: 寫下失敗的測試 `tests/smoke.mjs`**

只先寫引擎自身的檢查；工具檢查在後續 task 逐一加入。

```js
/* 靜態 smoke 檢查。以 `npm test` 執行。 */
import { check, section, summary, loadI18N } from './harness.mjs';

/* ---- 引擎行為 ---- */
section('i18n engine');
const I18N = loadI18N();

check('預設語言為 zh-TW', I18N.locale === 'zh-TW', `got: ${I18N.locale}`);
check('註冊了 zh-TW 與 ko 兩種語言',
  Object.keys(I18N.locales).join(',') === 'zh-TW,ko',
  `got: ${Object.keys(I18N.locales).join(',')}`);
check('每種語言都有顯示名稱與 lang 屬性',
  Object.values(I18N.locales).every(m => m.label && m.lang));
check('初始字典為空', Object.keys(I18N.messages['zh-TW']).length === 0);

I18N.register({ 'zh-TW': { greet: '你好 {0}', only: '僅繁中' }, ko: { greet: '안녕 {0}' } });
check('register() 併入 zh-TW', I18N.t('greet') === '你好 {0}');
check('t() 代入位置參數', I18N.t('greet', '世界') === '你好 世界');
check('未知 key 回傳 key 本身', I18N.t('no.such.key') === 'no.such.key');

check('setLocale() 切換成功', I18N.setLocale('ko') === true);
check('切換後查得 ko 值', I18N.t('greet', '세계') === '안녕 세계');
check('ko 缺 key 時退回 zh-TW', I18N.t('only') === '僅繁中');
check('切換至相同語言回傳 false', I18N.setLocale('ko') === false);
check('切換至未知語言回傳 false', I18N.setLocale('en') === false);

let notified = null;
I18N.onChange(locale => { notified = locale; });
I18N.setLocale('zh-TW');
check('onChange 監聽器收到通知', notified === 'zh-TW', `got: ${notified}`);

I18N.register({ 'zh-TW': { second: '第二份' } });
check('register() 可多次呼叫且不覆蓋既有內容',
  I18N.t('second') === '第二份' && I18N.t('greet') === '你好 {0}');

process.exit(summary() ? 1 : 0);
```

- [ ] **Step 3: 執行測試，確認失敗**

Run: `node tests/smoke.mjs`
Expected: FAIL，錯誤為 `ENOENT ... assets/i18n.js`（引擎尚未建立）

- [ ] **Step 4: 建立 `assets/i18n.js`**

```js
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
      .map(([code, meta]) => `<option value="${code}">${meta.label}</option>`)
      .join('');
    select.value = this.locale;
    select.addEventListener('change', () => {
      if (!this.setLocale(select.value)) select.value = this.locale;
    });
    this.onChange(() => { select.value = this.locale; });
  }
};

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
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `node tests/smoke.mjs`
Expected: 全數 `ok`，結尾 `all checks passed`，離開碼 0

- [ ] **Step 6: 建立 `package.json` 與 `.nojekyll`**

`package.json`：

```json
{
  "name": "trpg-toolkit",
  "version": "1.0.0",
  "private": true,
  "description": "sotsotssi 製作的網頁小工具合輯，附繁體中文介面",
  "scripts": {
    "test": "node tests/smoke.mjs",
    "serve": "npx --yes http-server -p 8080 -c-1 ."
  },
  "license": "MIT"
}
```

`.nojekyll` 為空檔案：`printf '' > .nojekyll`

註：`serve` 使用 `npx --yes`，僅為本機預覽便利，不寫入 `dependencies`，不構成執行期相依。

- [ ] **Step 7: 執行測試確認未受影響，並提交**

Run: `npm test`
Expected: `all checks passed`

```bash
git add assets/i18n.js tests/harness.mjs tests/smoke.mjs package.json .nojekyll
git commit -m "Add shared i18n engine and test harness"
```

---

## Task 2: magic-circle 工具

移植 zhtw 分支的翻譯成果，拆分為引擎與字典，內嵌文字改繁中，並還原韓文如尼文讀音。

**Files:**
- Create: `tools/magic-circle/index.html`（源自 `ref-zhtw/index.html`）
- Create: `tools/magic-circle/app.js`（源自 `ref-zhtw/app.js`）
- Create: `tools/magic-circle/styles.css`（源自 `ref-zhtw/styles.css`）
- Create: `tools/magic-circle/i18n.magic-circle.js`（源自 `ref-zhtw/i18n.js`）
- Create: `tools/magic-circle/LICENSE`、`tools/magic-circle/preview.png`
- Modify: `tests/smoke.mjs`

**Interfaces:**
- Consumes: `I18N.register`、`I18N.mountSwitcher`、`window.T`（Task 1）
- Produces:
  - `checkTool({ dir, dict, scripts, minHooks, allowHangul, licence })` — 後續 Task 3–6 共用的工具檢查函式。`allowHangul(line, lineNo, file)` 預設一律不允許韓文；`licence` 預設 true，emotion-maker 傳 false。回傳該工具沙箱的 I18N 物件。
  - 字典 key 命名慣例，後續工具沿用：`app.title`（每個工具字典必備）、`lang.aria`、`btn.*`、`msg.*`

- [ ] **Step 1: 複製檔案**

```bash
mkdir -p tools/magic-circle
cp <scratchpad>/src/ref-zhtw/index.html tools/magic-circle/
cp <scratchpad>/src/ref-zhtw/app.js tools/magic-circle/
cp <scratchpad>/src/ref-zhtw/styles.css tools/magic-circle/
cp <scratchpad>/src/ref-zhtw/LICENSE tools/magic-circle/
cp <scratchpad>/src/ref-zhtw/preview.png tools/magic-circle/
```

- [ ] **Step 2: 拆分字典為 `i18n.magic-circle.js`**

自 `ref-zhtw/i18n.js` 取出 `MESSAGES`（第 27–1101 行）與 `RUNE_READINGS`（第 1105–1121 行），
捨棄引擎部分（`LOCALES`、`detectLocale`、`I18N` 物件、`replaceFirstTextNode`）——那些已由
`assets/i18n.js` 提供。

```js
/* magic-circle 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'app.title': 'Magic Circle Maker — 魔法陣與簽名動態製作器',
    /* ...此處放入 ref-zhtw/i18n.js 中 'zh-TW' 區塊（第 565–1100 行）的全部項目... */

    /* 如尼文讀音：由 ref-zhtw 的 RUNE_READINGS['zh-TW'] 加上 rune. 前綴 */
    'rune.Fehu': '費胡',
    'rune.Uruz': '烏魯茲'
    /* ...其餘 67 組... */
  },
  ko: {
    'app.title': 'Magic circle Maker — 마법진·사인 모션 제작기',
    /* ...此處放入 ref-zhtw/i18n.js 中 ko 區塊（第 28–563 行）的全部項目... */

    /* 如尼文讀音：自上游還原（見下方說明） */
    'rune.Fehu': '페후',
    'rune.Uruz': '우루즈'
    /* ...其餘 67 組... */
  }
});
```

**還原韓文讀音的取值方式**：`ref-zhtw` 的 `RUNE_READINGS.ko` 是空物件，韓文讀音在抽字串時被刪除。
上游 `<scratchpad>/src/magic-circle-maker/app.js` 的 `RUNE_SETS` 中，每個元組為
`[字符, 音, 拉丁名, 韓文讀音]`，例如 `['ᚠ', 'f', 'Fehu', '페후']`。以第三欄為 key、
第四欄為值，逐一建立 `rune.<拉丁名>` 項目。可用下列指令一次取出全部 69 組：

```bash
node -e "const s=require('fs').readFileSync('<scratchpad>/src/magic-circle-maker/app.js','utf8');for(const m of s.matchAll(/\['[^']*', '[^']*', '([^']*)', '([^']*)'\]/g))console.log(\`    'rune.\${m[1]}': '\${m[2]}',\`)"
```

- [ ] **Step 3: 改寫 `app.js` 的如尼文讀音呼叫**

`ref-zhtw/app.js` 有兩處使用 `I18N.runeReading()`，該方法為 magic-circle 專屬，不納入共用引擎。

第 2160 行改為：

```js
    return `${glyph} ${sound} ${name} ${T('rune.' + name)}`.toLowerCase().includes(query);
```

第 2163 行改為：

```js
    const reading = T('rune.' + name);
```

`.toLocaleLowerCase('ko-KR')` 改為 `.toLowerCase()`：搜尋字串已含繁中，寫死韓文 locale
不再適當，且此處僅需比對拉丁字母大小寫。

- [ ] **Step 4: 改寫語言切換器掛載**

`ref-zhtw/app.js` 第 4166–4179 行手動填充 `#localeSelect`。改為使用引擎的共用方法：

```js
  I18N.mountSwitcher($('#localeSelect'));
  I18N.onChange(() => {
    toast(T('msg.localeChanged'), 'success');
    /* 保留原有的動態字串重繪呼叫 */
  });
```

原本寫在 select `change` 處理器中的 `toast(...)` 移入 `onChange` 回呼，因為 `mountSwitcher`
已接手 select 的事件處理。

- [ ] **Step 5: 更新 `index.html` 的腳本載入與內嵌文字**

`<head>` 中的 `<script defer src="./i18n.js"></script>` 改為兩行：

```html
  <script defer src="../../assets/i18n.js"></script>
  <script defer src="./i18n.magic-circle.js"></script>
```

`<html lang="ko">` 改為 `<html lang="zh-Hant-TW">`。

所有帶 `data-i18n*` 屬性的元素，其內嵌韓文文字改為字典中對應 key 的繁中值。例如：

```html
<!-- 改前 -->
<span data-i18n="brand.tagline">마법진 · 사인 모션 제작기</span>
<!-- 改後 -->
<span data-i18n="brand.tagline">魔法陣 · 簽名動態製作器</span>
```

`title` 與 `aria-label` 屬性同理，以 `data-i18n-title` / `data-i18n-aria-label` 所指 key
的繁中值取代。`<title>` 標籤內容改為 `app.title` 的繁中值。

- [ ] **Step 6: 在 `tests/smoke.mjs` 加入共用的工具檢查函式**

先將檔案頂端的 import 改為：

```js
import { check, section, summary, loadI18N, read, exists } from './harness.mjs';
```

於 `process.exit` 之前插入下列函式。它是 Task 3–6 共用的檢查邏輯：

```js
/* ---- 各工具共用檢查 ---- */
const HANGUL = /[\uAC00-\uD7A3]/;

/* dir: 'tools/magic-circle'；dict: 字典檔名；
 * scripts: 需掃描的 JS 檔名陣列；minHooks: 標記中 i18n 掛勾的最低數量；
 * allowHangul(line, lineNo, file): 回傳 true 表示該行允許出現韓文。 */
function checkTool({ dir, dict, scripts, minHooks, allowHangul = () => false, licence = true }) {
  section(dir);
  const tool = loadI18N([`${dir}/${dict}`]);
  const zh = new Set(Object.keys(tool.messages['zh-TW']));
  const ko = new Set(Object.keys(tool.messages.ko));

  check('字典非空', zh.size > 0, `zh-TW keys: ${zh.size}`);
  check('定義了 app.title', zh.has('app.title'));

  const missingKo = [...zh].filter(k => !ko.has(k));
  const extraKo = [...ko].filter(k => !zh.has(k));
  check('ko 涵蓋所有 zh-TW key', missingKo.length === 0, `missing: ${missingKo.join(', ')}`);
  check('ko 無多餘 key', extraKo.length === 0, `unknown: ${extraKo.join(', ')}`);

  const ph = v => [...new Set(String(v).match(/\{\d+\}/g) || [])].sort().join(',');
  const badPh = [...zh].filter(k => ph(tool.messages['zh-TW'][k]) !== ph(tool.messages.ko[k] ?? ''));
  check('兩語言的 {n} 佔位符一致', badPh.length === 0, `mismatched: ${badPh.join(', ')}`);

  const html = read(`${dir}/index.html`);
  const htmlKeys = [...html.matchAll(/data-i18n(?:-html|-node|-title|-aria-label|-placeholder)?="([^"]+)"/g)].map(m => m[1]);
  const unknownHtml = [...new Set(htmlKeys)].filter(k => !zh.has(k));
  check('標記僅引用已知 key', unknownHtml.length === 0, `unknown: ${unknownHtml.join(', ')}`);
  check(`標記帶有至少 ${minHooks} 個 i18n 掛勾`, htmlKeys.length >= minHooks, `found ${htmlKeys.length}`);

  check('index.html 載入共用引擎', html.includes('assets/i18n.js'));
  check('index.html 載入自身字典', html.includes(dict));
  check('html lang 為 zh-Hant-TW', /<html[^>]*lang="zh-Hant-TW"/.test(html));

  const leakedIn = (src, file) => src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([n, line]) => HANGUL.test(line) && !allowHangul(line, n, file));
  const report = rows => rows.slice(0, 5)
    .map(([n, l]) => `L${n}: ${l.trim().slice(0, 80)}`).join('\n       ');

  for (const file of scripts) {
    const src = read(`${dir}/${file}`);
    const keys = [...src.matchAll(/\bT\((['"`])([a-zA-Z][\w.]*)\1/g)].map(m => m[2]);
    const unknown = [...new Set(keys)].filter(k => !zh.has(k));
    check(`${file} 僅引用已知 key`, unknown.length === 0, `unknown: ${unknown.join(', ')}`);

    const leaked = leakedIn(src, file);
    check(`${file} 無殘留韓文`, leaked.length === 0, report(leaked));
  }

  const htmlLeaked = leakedIn(html, 'index.html');
  check('index.html 無殘留韓文', htmlLeaked.length === 0, report(htmlLeaked));

  /* emotion-maker 無原始 LICENSE，該工具傳入 licence: false。 */
  if (licence) check('保留原始 LICENSE', exists(`${dir}/LICENSE`));
  return tool;
}
```

- [ ] **Step 7: 加入 magic-circle 的檢查呼叫**

```js
const mc = checkTool({
  dir: 'tools/magic-circle',
  dict: 'i18n.magic-circle.js',
  scripts: ['app.js'],
  minHooks: 150
});

/* 如尼文讀音以 T('rune.' + name) 動態組成，靜態掃描看不到，需另外檢查。 */
section('tools/magic-circle runes');
const runeNames = [...read('tools/magic-circle/app.js')
  .matchAll(/\['[^']*', '[^']*', '([^']*)'\]/g)].map(m => m[1]);
check('解析出 69 組如尼文', runeNames.length === 69, `found ${runeNames.length}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = runeNames.filter(n => !mc.messages[locale][`rune.${n}`]);
  check(`${locale} 每組如尼文都有讀音`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
```

- [ ] **Step 8: 執行測試，逐項修正至通過**

Run: `npm test`
Expected: 初次執行預期在「無殘留韓文」與「ko 每組如尼文都有讀音」失敗。依失敗訊息
指出的行號，將該行韓文改為繁中並補上字典項目，直到 `all checks passed`。

- [ ] **Step 9: 以瀏覽器人工驗證**

Run: `npm run serve`，開啟 http://localhost:8080/tools/magic-circle/

確認：頁面初始為繁中且無韓文閃現；切換至韓文後全站文字改變；重新整理後維持韓文；
文字工具的如尼文面板在兩種語言下都顯示讀音；繪圖、動畫、匯出功能正常。

- [ ] **Step 10: 提交**

```bash
git add tools/magic-circle tests/smoke.mjs
git commit -m "Add magic-circle tool with zh-TW and ko interface"
```

---

## Task 3: text-path 工具

**Files:**
- Create: `tools/text-path/index.html`、`app.js`、`styles.css`、`i18n.text-path.js`、`LICENSE`
- Modify: `tests/smoke.mjs`

**Interfaces:**
- Consumes: `checkTool()`（Task 2）、`I18N`、`T`（Task 1）
- Produces: 無後續 task 依賴的介面

- [ ] **Step 1: 複製並拆分單檔結構**

來源 `<scratchpad>/src/text-path-generator/index.html`（727 行）：
第 8–45 行為 `<style>`、第 162–725 行為 `<script>`。

```bash
mkdir -p tools/text-path
cp <scratchpad>/src/text-path-generator/index.html tools/text-path/
cp <scratchpad>/src/text-path-generator/LICENSE tools/text-path/
```

將 `<style>` 內容（不含標籤本身）搬入 `tools/text-path/styles.css`，
`<script>` 內容搬入 `tools/text-path/app.js`。`index.html` 中對應區塊改為：

```html
    <link rel="stylesheet" href="./styles.css">
```

```html
    <script defer src="./app.js"></script>
```

此步驟不更動任何一行程式邏輯，僅搬移位置。

- [ ] **Step 2: 加入 i18n 載入與語言切換器**

`<head>` 中，於 `app.js` 之前加入：

```html
    <script defer src="../../assets/i18n.js"></script>
    <script defer src="./i18n.text-path.js"></script>
```

`<html lang="ko">` 改為 `<html lang="zh-Hant-TW">`。

於頁面標頭區加入切換器：

```html
    <select id="localeSelect" class="locale-select" data-i18n-aria-label="lang.aria" aria-label="顯示語言"></select>
```

於 `app.js` 的初始化程式末端加入：

```js
I18N.mountSwitcher(document.getElementById('localeSelect'));
```

若 `app.js` 有以 `T()` 產生的動態字串，另加：

```js
I18N.onChange(() => { /* 重繪動態字串 */ });
```

- [ ] **Step 3: 寫下失敗的測試**

在 `tests/smoke.mjs` 中 magic-circle 的檢查之後加入：

```js
checkTool({
  dir: 'tools/text-path',
  dict: 'i18n.text-path.js',
  scripts: ['app.js'],
  minHooks: 30
});
```

- [ ] **Step 4: 執行測試，確認失敗**

Run: `npm test`
Expected: FAIL，`ENOENT ... tools/text-path/i18n.text-path.js`（字典尚未建立）

- [ ] **Step 5: 建立字典並標記 HTML**

掃出全部韓文字串（約 59 條）：

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('tools/text-path/index.html','utf8')+fs.readFileSync('tools/text-path/app.js','utf8');console.log([...new Set(s.match(/[^\n]*[\uAC00-\uD7A3][^\n]*/g)||[])].join('\n'))"
```

依 Task 2 建立的命名慣例分配 key，建立 `tools/text-path/i18n.text-path.js`：

```js
/* text-path 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'app.title': '文字軌跡產生器',
    'lang.aria': '顯示語言'
    /* ...其餘項目... */
  },
  ko: {
    'app.title': '텍스트 궤적 생성기',
    'lang.aria': '표시 언어'
    /* ...其餘項目... */
  }
});
```

HTML 中的靜態韓文改為繁中並加上 `data-i18n*` 屬性；`app.js` 中的韓文字面值改為 `T('key')`。

- [ ] **Step 6: 執行測試，逐項修正至通過**

Run: `npm test`
Expected: `all checks passed`

- [ ] **Step 7: 以瀏覽器人工驗證**

Run: `npm run serve`，開啟 http://localhost:8080/tools/text-path/

確認：初始為繁中、切換韓文正常、重新整理保持選擇、軌跡產生與圖片匯出功能正常。

- [ ] **Step 8: 提交**

```bash
git add tools/text-path tests/smoke.mjs
git commit -m "Add text-path tool with zh-TW and ko interface"
```

---

## Task 4: collage-letter 工具

**Files:**
- Create: `tools/collage-letter/index.html`、`app.js`、`styles.css`、`i18n.collage-letter.js`、`LICENSE`
- Modify: `tests/smoke.mjs`

**Interfaces:**
- Consumes: `checkTool()`（Task 2）、`I18N`、`T`（Task 1）
- Produces: 無後續 task 依賴的介面

- [ ] **Step 1: 複製並拆分單檔結構**

來源 `<scratchpad>/src/collage-letter/index.html`（796 行）：
第 8–95 行為 `<style>`、第 234–794 行為 `<script>`。

```bash
mkdir -p tools/collage-letter
cp <scratchpad>/src/collage-letter/index.html tools/collage-letter/
cp <scratchpad>/src/collage-letter/LICENSE tools/collage-letter/
```

將 `<style>` 內容搬入 `tools/collage-letter/styles.css`，
`<script>` 內容搬入 `tools/collage-letter/app.js`。`index.html` 中對應區塊改為：

```html
    <link rel="stylesheet" href="./styles.css">
```

```html
    <script defer src="./app.js"></script>
```

此步驟不更動任何一行程式邏輯，僅搬移位置。

另：來源的作者連結為 `http://x.com/bb_uu_t`，改為 `https://x.com/bb_uu_t`，
以免在 HTTPS 部署下被視為混合內容。（其餘四個工具已是 `https://`。）

- [ ] **Step 2: 加入 i18n 載入與語言切換器**

`<head>` 中，於 `app.js` 之前加入：

```html
    <script defer src="../../assets/i18n.js"></script>
    <script defer src="./i18n.collage-letter.js"></script>
```

`<html lang="ko">` 改為 `<html lang="zh-Hant-TW">`。

於頁面標頭區加入切換器：

```html
    <select id="localeSelect" class="locale-select" data-i18n-aria-label="lang.aria" aria-label="顯示語言"></select>
```

於 `app.js` 的初始化程式末端加入：

```js
I18N.mountSwitcher(document.getElementById('localeSelect'));
```

若 `app.js` 有以 `T()` 產生的動態字串，另加：

```js
I18N.onChange(() => { /* 重繪動態字串 */ });
```

- [ ] **Step 3: 寫下失敗的測試**

在 `tests/smoke.mjs` 中 text-path 的檢查之後加入：

```js
checkTool({
  dir: 'tools/collage-letter',
  dict: 'i18n.collage-letter.js',
  scripts: ['app.js'],
  minHooks: 30
});
```

- [ ] **Step 4: 執行測試，確認失敗**

Run: `npm test`
Expected: FAIL，`ENOENT ... tools/collage-letter/i18n.collage-letter.js`

- [ ] **Step 5: 建立字典並標記 HTML**

掃出全部韓文字串（約 61 條）：

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('tools/collage-letter/index.html','utf8')+fs.readFileSync('tools/collage-letter/app.js','utf8');console.log([...new Set(s.match(/[^\n]*[\uAC00-\uD7A3][^\n]*/g)||[])].join('\n'))"
```

建立 `tools/collage-letter/i18n.collage-letter.js`：

```js
/* collage-letter 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'app.title': '匿名拼貼信產生器',
    'lang.aria': '顯示語言'
    /* ...其餘項目... */
  },
  ko: {
    'app.title': '익명 콜라주 편지 생성기',
    'lang.aria': '표시 언어'
    /* ...其餘項目... */
  }
});
```

HTML 中的靜態韓文改為繁中並加上 `data-i18n*` 屬性；`app.js` 中的韓文字面值改為 `T('key')`。

- [ ] **Step 6: 執行測試，逐項修正至通過**

Run: `npm test`
Expected: `all checks passed`

- [ ] **Step 7: 以瀏覽器人工驗證**

Run: `npm run serve`，開啟 http://localhost:8080/tools/collage-letter/

確認：初始為繁中、切換韓文正常、重新整理保持選擇、拼貼信產生與圖片匯出功能正常。

- [ ] **Step 8: 提交**

```bash
git add tools/collage-letter tests/smoke.mjs
git commit -m "Add collage-letter tool with zh-TW and ko interface"
```

---

## Task 5: typewriter 工具

**Files:**
- Create: `tools/typewriter/index.html`、`script.js`、`webp-muxer.js`、`style.css`、`i18n.typewriter.js`、`LICENSE`
- Modify: `tests/smoke.mjs`

**Interfaces:**
- Consumes: `checkTool()`（Task 2）、`I18N`、`T`（Task 1）
- Produces: 無後續 task 依賴的介面

- [ ] **Step 1: 複製檔案**

```bash
mkdir -p tools/typewriter
cp <scratchpad>/src/Typewriter-apng/index.html tools/typewriter/
cp <scratchpad>/src/Typewriter-apng/script.js tools/typewriter/
cp <scratchpad>/src/Typewriter-apng/webp-muxer.js tools/typewriter/
cp <scratchpad>/src/Typewriter-apng/style.css tools/typewriter/
cp <scratchpad>/src/Typewriter-apng/LICENSE tools/typewriter/
```

本工具已是多檔結構，無需拆分。`webp-muxer.js` 為二進位編碼工具，
應不含使用者可見文字，仍納入韓文掃描以資確認。

- [ ] **Step 2: 加入 i18n 載入與語言切換器**

原始 `index.html` 的 `<script src="script.js"></script>` 位於第 615 行（`</body>` 之前）。
將其移至 `<head>`，與 i18n 檔共用同一條 defer 佇列，確保字典先於 `script.js` 註冊完成。

`<head>` 中，於第 14 行 `webp-muxer.js` 之後加入三行：

```html
    <script defer src="../../assets/i18n.js"></script>
    <script defer src="./i18n.typewriter.js"></script>
    <script defer src="./script.js"></script>
```

並刪除 `</body>` 前原本的 `<script src="script.js"></script>`。

註：`script.js` 若原本依賴「DOM 已就緒」的執行時機（例如在 top-level 直接
`document.getElementById(...)`），改為 defer 後語意不變——defer 腳本同樣在 DOM
解析完成後才執行。若其中有 `DOMContentLoaded` 監聽器，亦仍會正常觸發。

`<html lang="ko">` 改為 `<html lang="zh-Hant-TW">`。

於頁面標頭區加入切換器：

```html
    <select id="localeSelect" class="locale-select" data-i18n-aria-label="lang.aria" aria-label="顯示語言"></select>
```

於 `script.js` 的初始化程式末端加入：

```js
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => { /* 重繪以 T() 產生的動態字串 */ });
```

- [ ] **Step 3: 寫下失敗的測試**

在 `tests/smoke.mjs` 中 collage-letter 的檢查之後加入：

```js
checkTool({
  dir: 'tools/typewriter',
  dict: 'i18n.typewriter.js',
  scripts: ['script.js', 'webp-muxer.js'],
  minHooks: 80
});
```

- [ ] **Step 4: 執行測試，確認失敗**

Run: `npm test`
Expected: FAIL，`ENOENT ... tools/typewriter/i18n.typewriter.js`

- [ ] **Step 5: 建立字典並標記 HTML**

掃出全部韓文字串（約 245 條）：

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('tools/typewriter/index.html','utf8')+fs.readFileSync('tools/typewriter/script.js','utf8');console.log([...new Set(s.match(/[^\n]*[\uAC00-\uD7A3][^\n]*/g)||[])].join('\n'))"
```

建立 `tools/typewriter/i18n.typewriter.js`：

```js
/* typewriter 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'app.title': '打字機動畫圖片產生器',
    'lang.aria': '顯示語言'
    /* ...其餘項目... */
  },
  ko: {
    'app.title': '텍스트 애니메이션 이미지 생성기',
    'lang.aria': '표시 언어'
    /* ...其餘項目... */
  }
});
```

HTML 中的靜態韓文改為繁中並加上 `data-i18n*` 屬性；`script.js` 中的韓文字面值改為 `T('key')`。

本工具的字串量在五者中次高，且含匯出進度與錯誤訊息等動態字串。含 `{0}` 位置參數者，
兩語言的佔位符必須一致，否則測試會攔下。例如：

```js
'msg.exporting': '正在匯出第 {0} / {1} 格',   // zh-TW
'msg.exporting': '{0} / {1} 프레임 내보내는 중',  // ko
```

- [ ] **Step 6: 執行測試，逐項修正至通過**

Run: `npm test`
Expected: `all checks passed`

- [ ] **Step 7: 以瀏覽器人工驗證**

Run: `npm run serve`，開啟 http://localhost:8080/tools/typewriter/

確認：初始為繁中、切換韓文正常、重新整理保持選擇。逐一測試 APNG、GIF、WebP
三種格式匯出，確認匯出過程的進度訊息在兩種語言下都正確顯示、數字代入正確。

- [ ] **Step 8: 提交**

```bash
git add tools/typewriter tests/smoke.mjs
git commit -m "Add typewriter tool with zh-TW and ko interface"
```

---

## Task 6: emotion-maker 工具

含資產改名與 manifest 改造，為五個工具中改動最深者。

**Files:**
- Create: `tools/emotion-maker/index.html`、`app.js`、`style.css`、`i18n.emotion-maker.js`
- Create: `tools/emotion-maker/images/`（39 個 ASCII 檔名的 PNG）
- Modify: `tests/smoke.mjs`

**Interfaces:**
- Consumes: `checkTool()`（Task 2）、`I18N`、`T`（Task 1）
- Produces: 無後續 task 依賴的介面

- [ ] **Step 1: 建立檔名對照並複製資產**

分類 slug：`피부`→`skin`、`얼굴 틀`→`face`、`눈`→`eyes`、`눈썹`→`brows`、
`입`→`mouth`、`꾸밈`→`deco`。

完整 39 項對照（左為原檔路徑相對於 `images/`，右為新路徑）：

```
피부.png                → skin.png
얼굴 틀.png             → face.png

눈/감은 눈.png          → eyes/closed.png
눈/반눈.png             → eyes/half.png
눈/번뜩.png             → eyes/glint.png
눈/보통 눈.png          → eyes/normal.png
눈/웃는 눈.png          → eyes/smiling.png
눈/윙크.png             → eyes/wink.png
눈/점눈.png             → eyes/dot.png
눈/찡긋 감은 눈.png     → eyes/squint.png
눈/초롱.png             → eyes/sparkle.png
눈/하트 눈.png          → eyes/heart.png

눈썹/일반 눈썹.png      → brows/normal.png
눈썹/일자 눈썹.png      → brows/straight.png
눈썹/처진 눈썹.png      → brows/drooping.png
눈썹/힘준 눈썹.png      → brows/tense.png

입/3자 입.png           → mouth/cat3.png
입/고양이 입.png        → mouth/cat.png
입/메롱.png             → mouth/tongue.png
입/미소.png             → mouth/smile.png
입/불만 입.png          → mouth/displeased.png
입/브이 입.png          → mouth/v.png
입/웃으며 벌린 입.png   → mouth/laugh.png
입/작게 벌린 입.png     → mouth/small-open.png
입/직선 입.png          → mouth/line.png
입/크게 벌린 입.png     → mouth/wide-open.png

꾸밈/검정.png           → deco/black.png
꾸밈/눈물.png           → deco/tears.png
꾸밈/땀 많이.png        → deco/sweat-many.png
꾸밈/땀 하나.png        → deco/sweat-one.png
꾸밈/미간 주름.png      → deco/frown.png
꾸밈/보라.png           → deco/purple.png
꾸밈/빠직.png           → deco/anger-mark.png
꾸밈/빨강.png           → deco/red.png
꾸밈/음영.png           → deco/shade.png
꾸밈/절망.png           → deco/despair.png
꾸밈/코 그림자.png      → deco/nose-shadow.png
꾸밈/파랑.png           → deco/blue.png
꾸밈/홍조.png           → deco/blush.png
```

依此對照複製檔案：

```bash
mkdir -p tools/emotion-maker/images/{eyes,brows,mouth,deco}
cp <scratchpad>/src/emotion-maker/index.html tools/emotion-maker/
cp <scratchpad>/src/emotion-maker/app.js tools/emotion-maker/
cp <scratchpad>/src/emotion-maker/style.css tools/emotion-maker/
# 39 個 PNG 逐一依上表複製
```

複製完成後確認數量：`find tools/emotion-maker/images -name '*.png' | wc -l` 應為 39。

- [ ] **Step 2: 改造 `app.js` 的 MANIFEST 與路徑函式**

`MANIFEST` 由字串陣列改為物件陣列。`id` 保留原韓文，以維持匯出 JSON
與 localStorage 和原版工具相容：

```js
const MANIFEST = {
  base: [{ id: "피부", file: "skin" }, { id: "얼굴 틀", file: "face" }],
  "눈": [
    { id: "감은 눈", file: "eyes/closed" }, { id: "반눈", file: "eyes/half" },
    { id: "번뜩", file: "eyes/glint" }, { id: "보통 눈", file: "eyes/normal" },
    { id: "웃는 눈", file: "eyes/smiling" }, { id: "윙크", file: "eyes/wink" },
    { id: "점눈", file: "eyes/dot" }, { id: "찡긋 감은 눈", file: "eyes/squint" },
    { id: "초롱", file: "eyes/sparkle" }, { id: "하트 눈", file: "eyes/heart" }
  ],
  "눈썹": [
    { id: "일반 눈썹", file: "brows/normal" }, { id: "일자 눈썹", file: "brows/straight" },
    { id: "처진 눈썹", file: "brows/drooping" }, { id: "힘준 눈썹", file: "brows/tense" }
  ],
  "입": [
    { id: "3자 입", file: "mouth/cat3" }, { id: "고양이 입", file: "mouth/cat" },
    { id: "메롱", file: "mouth/tongue" }, { id: "미소", file: "mouth/smile" },
    { id: "불만 입", file: "mouth/displeased" }, { id: "브이 입", file: "mouth/v" },
    { id: "웃으며 벌린 입", file: "mouth/laugh" }, { id: "작게 벌린 입", file: "mouth/small-open" },
    { id: "직선 입", file: "mouth/line" }, { id: "크게 벌린 입", file: "mouth/wide-open" }
  ],
  "꾸밈": [
    { id: "검정", file: "deco/black" }, { id: "눈물", file: "deco/tears" },
    { id: "땀 많이", file: "deco/sweat-many" }, { id: "땀 하나", file: "deco/sweat-one" },
    { id: "미간 주름", file: "deco/frown" }, { id: "보라", file: "deco/purple" },
    { id: "빠직", file: "deco/anger-mark" }, { id: "빨강", file: "deco/red" },
    { id: "음영", file: "deco/shade" }, { id: "절망", file: "deco/despair" },
    { id: "코 그림자", file: "deco/nose-shadow" }, { id: "파랑", file: "deco/blue" },
    { id: "홍조", file: "deco/blush" }
  ]
};

/* id → 檔名路徑。內建部件才有；自訂部件走 dataURL。 */
const FILE_OF = {};
for (const [cat, items] of Object.entries(MANIFEST)) {
  FILE_OF[cat] = Object.fromEntries(items.map(i => [i.id, i.file]));
}
```

`names(cat)` 需改為回傳 id 陣列（原本 `MANIFEST[cat]` 已是字串陣列）：

```js
function names(cat){ return MANIFEST[cat].map(i => i.id).concat(Object.keys(customParts[cat]||{})); }
```

路徑函式改為查表，不再需要 `encodeURI`：

```js
function baseSrc(id){ return "images/" + FILE_OF.base[id] + ".png"; }
function srcOf(cat,name){ return isCustom(cat,name) ? customParts[cat][name] : "images/" + FILE_OF[cat][name] + ".png"; }
```

`CATS`、`SINGLE`、`DECO`、`DRAW_SINGLE` 與 `PRESETS` 的部件引用值皆維持韓文不動。

- [ ] **Step 3: 將 PRESETS 的 tag 改為 i18n key**

`PRESETS` 的 `tag` 為顯示文字而非資料 ID，20 種情緒名稱需翻譯。將 `tag` 值改為 key：

```js
const PRESETS = [
  { tag:"preset.joy",        "눈":"보통 눈",       "눈썹":"일반 눈썹", "입":"웃으며 벌린 입", "꾸밈":[] },
  { tag:"preset.happy",      "눈":"웃는 눈",       "눈썹":"일반 눈썹", "입":"미소",          "꾸밈":["홍조"] },
  { tag:"preset.love",       "눈":"하트 눈",       "눈썹":"처진 눈썹", "입":"미소",          "꾸밈":["홍조"] },
  { tag:"preset.flutter",    "눈":"초롱",          "눈썹":"일반 눈썹", "입":"작게 벌린 입",   "꾸밈":["홍조"] },
  { tag:"preset.excited",    "눈":"초롱",          "눈썹":"힘준 눈썹", "입":"웃으며 벌린 입", "꾸밈":[] },
  { tag:"preset.playful",    "눈":"윙크",          "눈썹":"일반 눈썹", "입":"메롱",          "꾸밈":[] },
  { tag:"preset.confident",  "눈":"번뜩",          "눈썹":"힘준 눈썹", "입":"브이 입",       "꾸밈":[] },
  { tag:"preset.disgust",    "눈":"반눈",          "눈썹":"일자 눈썹", "입":"불만 입",       "꾸밈":["보라"] },
  { tag:"preset.sad",        "눈":"반눈",          "눈썹":"일자 눈썹", "입":"불만 입",       "꾸밈":["눈물"] },
  { tag:"preset.gloomy",     "눈":"반눈",          "눈썹":"처진 눈썹", "입":"직선 입",       "꾸밈":["절망","파랑"] },
  { tag:"preset.despair",    "눈":"반눈",          "눈썹":"처진 눈썹", "입":"직선 입",       "꾸밈":["절망","검정"] },
  { tag:"preset.wail",       "눈":"보통 눈",       "눈썹":"힘준 눈썹", "입":"크게 벌린 입",   "꾸밈":["눈물"] },
  { tag:"preset.anger",      "눈":"반눈",          "눈썹":"힘준 눈썹", "입":"불만 입",       "꾸밈":["빠직","빨강"] },
  { tag:"preset.rage",       "눈":"보통 눈",       "눈썹":"힘준 눈썹", "입":"크게 벌린 입",   "꾸밈":["빠직","빨강"] },
  { tag:"preset.annoyed",    "눈":"반눈",          "눈썹":"힘준 눈썹", "입":"불만 입",       "꾸밈":["미간 주름"] },
  { tag:"preset.surprise",   "눈":"초롱",          "눈썹":"일반 눈썹", "입":"작게 벌린 입",   "꾸밈":["땀 하나"] },
  { tag:"preset.shock",      "눈":"보통 눈",       "눈썹":"힘준 눈썹", "입":"크게 벌린 입",   "꾸밈":["음영","땀 많이"] },
  { tag:"preset.flustered",  "눈":"점눈",          "눈썹":"처진 눈썹", "입":"작게 벌린 입",   "꾸밈":["땀 많이"] },
  { tag:"preset.shy",        "눈":"찡긋 감은 눈",  "눈썹":"처진 눈썹", "입":"3자 입",        "꾸밈":["홍조"] },
  { tag:"preset.deadpan",    "눈":"보통 눈",       "눈썹":"일자 눈썹", "입":"직선 입",       "꾸밈":["코 그림자"] }
];
```

顯示 tag 之處改用下列函式。使用者自建表情的 `tag` 是自由輸入文字，不是 key，
以「查字典查不到就原樣顯示」區分：

```js
/* 內建 preset 的 tag 是 i18n key；使用者自訂的 tag 是自由文字。
 * T() 對未知 key 回傳 key 本身，故自訂文字原樣顯示。 */
function tagLabel(tag){ return T(tag); }
```

- [ ] **Step 4: 部件顯示名稱接上 i18n**

部件在調色盤中的顯示名稱由 id 改為查字典。key 以 `file` 路徑推導，
格式 `part.<分類>.<部件>`（斜線改為點）：

```js
/* id 為韓文資料鍵；顯示名稱一律查字典。自訂部件用使用者給的名字。 */
function partLabel(cat, name){
  if (isCustom(cat, name)) return name;
  return T('part.' + FILE_OF[cat][name].replace('/', '.'));
}
```

例如 `보통 눈` 的 `file` 為 `eyes/normal`，對應 key `part.eyes.normal`。
根層兩項為 `part.skin`、`part.face`。

原本直接把 id 當標籤顯示之處（調色盤按鈕文字、tooltip 等）改呼叫 `partLabel(cat, name)`。

- [ ] **Step 5: 加入 i18n 載入與語言切換器**

原始 `index.html` 的 `<script src="app.js"></script>` 位於 `</body>` 前。
移至 `<head>` 並改為 defer，與 i18n 檔共用同一條佇列：

```html
<script defer src="../../assets/i18n.js"></script>
<script defer src="./i18n.emotion-maker.js"></script>
<script defer src="./app.js"></script>
```

並刪除 `</body>` 前原本的 `<script src="app.js"></script>`。

`<html lang="ko">` 改為 `<html lang="zh-Hant-TW">`。

於 `<header>` 加入切換器：

```html
<select id="localeSelect" class="locale-select" data-i18n-aria-label="lang.aria" aria-label="顯示語言"></select>
```

於 `app.js` 初始化程式末端加入：

```js
I18N.mountSwitcher(document.getElementById('localeSelect'));
I18N.onChange(() => { /* 重繪調色盤與表情清單，使部件名稱與 preset tag 更新 */ });
```

- [ ] **Step 6: 寫下失敗的測試**

在 `tests/smoke.mjs` 中 typewriter 的檢查之後加入。本工具需要韓文白名單：

```js
/* emotion-maker 的韓文為資料 ID，非顯示文字：MANIFEST 的 id、
 * PRESETS 的部件引用、以及結構常數。tag 已改為 i18n key，不在白名單內。 */
const EM_ID_LINE = /\bid:\s*"[^"]*"|"눈"|"눈썹"|"입"|"꾸밈"|\bCATS\b|\bSINGLE\b|\bDECO\b|\bDRAW_SINGLE\b|\bcustomParts\b|\bnewDraft\b/;

const em = checkTool({
  dir: 'tools/emotion-maker',
  dict: 'i18n.emotion-maker.js',
  scripts: ['app.js'],
  minHooks: 40,
  licence: false,
  allowHangul: (line, n, file) => file === 'app.js' && EM_ID_LINE.test(line)
});

/* emotion-maker 無原始 LICENSE，checkTool 的該項檢查會失敗；
 * 以 ATTRIBUTION.md 標示取代（見 Task 8）。此處單獨確認其確實沒有。 */
section('tools/emotion-maker licence');
check('emotion-maker 無原始 LICENSE（未授權，於 ATTRIBUTION.md 標示）',
  !exists('tools/emotion-maker/LICENSE'));

/* 資產完整性：MANIFEST 每個 file 對應的 PNG 必須存在。 */
section('tools/emotion-maker assets');
const emApp = read('tools/emotion-maker/app.js');
const files = [...emApp.matchAll(/file:\s*"([^"]+)"/g)].map(m => m[1]);
check('MANIFEST 解析出 39 個部件', files.length === 39, `found ${files.length}`);
const missingPng = files.filter(f => !exists(`tools/emotion-maker/images/${f}.png`));
check('每個部件的 PNG 都存在', missingPng.length === 0, `missing: ${missingPng.join(', ')}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = files.filter(f => !em.messages[locale][`part.${f.replace('/', '.')}`]);
  check(`${locale} 每個部件都有顯示名稱`, missing.length === 0, `missing: ${missing.join(', ')}`);
}

/* 20 種內建 preset 的 tag 都要有譯文。 */
section('tools/emotion-maker presets');
const tags = [...emApp.matchAll(/tag:\s*"(preset\.[a-z]+)"/g)].map(m => m[1]);
check('解析出 20 組 preset', tags.length === 20, `found ${tags.length}`);
for (const locale of ['zh-TW', 'ko']) {
  const missing = tags.filter(t => !em.messages[locale][t]);
  check(`${locale} 每組 preset 都有名稱`, missing.length === 0, `missing: ${missing.join(', ')}`);
}
```

`licence: false` 使 `checkTool` 跳過「保留原始 LICENSE」檢查（該參數已於 Task 2 定義）。

- [ ] **Step 7: 執行測試，確認失敗**

Run: `npm test`
Expected: FAIL，`ENOENT ... tools/emotion-maker/i18n.emotion-maker.js`

- [ ] **Step 8: 建立字典**

掃出全部韓文顯示字串（約 165 條）：

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('tools/emotion-maker/index.html','utf8')+fs.readFileSync('tools/emotion-maker/app.js','utf8');console.log([...new Set(s.match(/[^\n]*[\uAC00-\uD7A3][^\n]*/g)||[])].join('\n'))"
```

建立 `tools/emotion-maker/i18n.emotion-maker.js`。除一般介面字串外，
另需 39 組 `part.*` 與 20 組 `preset.*`：

```js
/* emotion-maker 字典。載入前需先載入 ../../assets/i18n.js。 */
I18N.register({
  'zh-TW': {
    'app.title': '表情產生器',
    'lang.aria': '顯示語言',

    'part.skin': '膚色', 'part.face': '臉型',
    'part.eyes.normal': '普通眼', 'part.eyes.heart': '愛心眼',
    /* ...其餘 35 組 part.* ... */

    'preset.joy': '喜悅', 'preset.happy': '幸福',
    /* ...其餘 18 組 preset.* ... */

    /* ...其餘介面字串... */
  },
  ko: {
    'app.title': '표정 메이커',
    'lang.aria': '표시 언어',

    'part.skin': '피부', 'part.face': '얼굴 틀',
    'part.eyes.normal': '보통 눈', 'part.eyes.heart': '하트 눈',
    /* ...其餘 35 組 part.* ... */

    'preset.joy': '기쁨', 'preset.happy': '행복',
    /* ...其餘 18 組 preset.* ... */

    /* ...其餘介面字串... */
  }
});
```

`part.*` 與 `preset.*` 的 ko 值即為原始碼中的原韓文，可直接取用（`part.*` 取自
`MANIFEST` 的 `id`，`preset.*` 取自改造前 `PRESETS` 的 `tag`）。

HTML 中的靜態韓文改為繁中並加上 `data-i18n*` 屬性；`app.js` 中的韓文**顯示**字串
改為 `T('key')`（資料 ID 不動）。

- [ ] **Step 9: 執行測試，逐項修正至通過**

Run: `npm test`
Expected: `all checks passed`

- [ ] **Step 10: 驗證 JSON 與原版互通**

Run: `npm run serve`，開啟 http://localhost:8080/tools/emotion-maker/

以原版工具（`<scratchpad>/src/emotion-maker/index.html`，用 `file://` 開啟）
建立三、四組表情並「JSON 匯出」，再於本專案版本「JSON 匯入」，確認表情正確重現。
反向亦測一次（本版匯出 → 原版匯入）。此為 `id` 保留韓文的目的所在。

另確認：39 個部件圖片全部載入無 404（開發者工具 Network 面板檢查）；
20 組內建 preset 在兩種語言下名稱正確；自訂 tag 的表情不受翻譯影響；
自訂部件上傳功能正常；合本圖片產生功能正常。

- [ ] **Step 11: 提交**

```bash
git add tools/emotion-maker tests/smoke.mjs
git commit -m "Add emotion-maker tool with ASCII asset paths and zh-TW/ko interface"
```

---

## Task 7: 首頁

**Files:**
- Create: `index.html`、`assets/home.css`、`assets/home.js`、`assets/i18n.home.js`
- Modify: `tests/smoke.mjs`

**Interfaces:**
- Consumes: `I18N`（Task 1）、五個工具目錄（Task 2–6）
- Produces: 常數 `TOOLS`（工具目錄名陣列），Task 8 的文件檢查會用到

- [ ] **Step 1: 寫下失敗的測試**

在 `tests/smoke.mjs` 中，於各工具檢查之後加入：

```js
/* ---- 首頁 ---- */
section('index.html');
const home = loadI18N(['assets/i18n.home.js']);
const homeZh = new Set(Object.keys(home.messages['zh-TW']));
const homeKo = new Set(Object.keys(home.messages.ko));
check('首頁字典定義了 app.title', homeZh.has('app.title'));
check('首頁 ko 涵蓋所有 zh-TW key',
  [...homeZh].every(k => homeKo.has(k)),
  `missing: ${[...homeZh].filter(k => !homeKo.has(k)).join(', ')}`);

const homeHtml = read('index.html');
const homeKeys = [...homeHtml.matchAll(/data-i18n(?:-html|-node|-title|-aria-label|-placeholder)?="([^"]+)"/g)].map(m => m[1]);
check('首頁標記僅引用已知 key',
  [...new Set(homeKeys)].every(k => homeZh.has(k)),
  `unknown: ${[...new Set(homeKeys)].filter(k => !homeZh.has(k)).join(', ')}`);
check('首頁無殘留韓文', !/[\uAC00-\uD7A3]/.test(homeHtml));
check('首頁 html lang 為 zh-Hant-TW', /<html[^>]*lang="zh-Hant-TW"/.test(homeHtml));

/* 五個工具連結都要指得到。 */
const TOOLS = ['magic-circle', 'typewriter', 'text-path', 'collage-letter', 'emotion-maker'];
for (const name of TOOLS) {
  check(`連結 tools/${name}/ 有效`,
    homeHtml.includes(`tools/${name}/`) && exists(`tools/${name}/index.html`));
}

check('首頁標示 emotion-maker 的未授權狀態',
  homeZh.has('license.unlicensed') && homeHtml.includes('license.unlicensed'));
check('首頁標示原作者出處', homeHtml.includes('github.com/sotsotssi'));
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npm test`
Expected: FAIL，`ENOENT ... assets/i18n.home.js`

- [ ] **Step 3: 建立首頁字典 `assets/i18n.home.js`**

```js
/* 首頁字典。載入前需先載入 ./i18n.js。 */
I18N.register({
  'zh-TW': {
    'app.title': 'TRPG Toolkit — 網頁小工具合輯',
    'lang.aria': '顯示語言',
    'home.heading': 'TRPG Toolkit',
    'home.tagline': 'sotsotssi 製作的網頁小工具合輯，附繁體中文介面',
    'home.intro': '以下工具全部在瀏覽器本機執行，不上傳任何資料。',
    'tool.magic-circle.name': '魔法陣製作器',
    'tool.magic-circle.desc': '繪製魔法陣與簽名動態，支援對稱、貝茲曲線、時間軸與 GIF／APNG 匯出。',
    'tool.typewriter.name': '打字機動畫產生器',
    'tool.typewriter.desc': '輸入文字，產生逐字打出效果的 APNG／GIF／WebP 動畫圖。',
    'tool.text-path.name': '文字軌跡產生器',
    'tool.text-path.desc': '讓文字沿著自訂路徑排列，輸出為圖片。',
    'tool.collage-letter.name': '匿名拼貼信產生器',
    'tool.collage-letter.desc': '以剪報拼貼風格的字母組成信件圖片。',
    'tool.emotion-maker.name': '表情產生器',
    'tool.emotion-maker.desc': '組合眼睛、眉毛、嘴巴與裝飾，製作表情差分與合本圖。',
    'home.credits.heading': '來源與授權',
    'home.credits.body': '本站工具皆由 sotsotssi 製作，此處為加上繁體中文介面的合併版本。',
    'license.mit': 'MIT 授權',
    'license.unlicensed': '未授權：原作者未釋出授權條款，此工具（含全部圖像素材）之權利屬原作者所有，僅供試用。'
  },
  ko: {
    'app.title': 'TRPG Toolkit — 웹 도구 모음',
    'lang.aria': '표시 언어',
    'home.heading': 'TRPG Toolkit',
    'home.tagline': 'sotsotssi 님이 만든 웹 도구 모음, 번체 중국어 UI 추가판',
    'home.intro': '아래 도구는 모두 브라우저에서 로컬로 실행되며 데이터를 전송하지 않습니다.',
    'tool.magic-circle.name': '마법진 제작기',
    'tool.magic-circle.desc': '대칭·베지어·타임라인을 지원하는 마법진과 사인 모션 편집기. GIF·APNG 내보내기.',
    'tool.typewriter.name': '텍스트 애니메이션 생성기',
    'tool.typewriter.desc': '문장을 입력하면 타자기로 입력한 듯한 APNG·GIF·WebP 이미지를 만들어 줍니다.',
    'tool.text-path.name': '텍스트 궤적 생성기',
    'tool.text-path.desc': '글자를 원하는 경로를 따라 배치해 이미지로 저장합니다.',
    'tool.collage-letter.name': '익명 콜라주 편지 생성기',
    'tool.collage-letter.desc': '잡지 오려붙이기 느낌의 글자로 편지 이미지를 만듭니다.',
    'tool.emotion-maker.name': '표정 메이커',
    'tool.emotion-maker.desc': '눈·눈썹·입·꾸밈을 조합해 표정 차분과 합본 이미지를 만듭니다.',
    'home.credits.heading': '출처 및 라이선스',
    'home.credits.body': '이 사이트의 도구는 모두 sotsotssi 님의 작품이며, 번체 중국어 UI를 추가해 합친 버전입니다.',
    'license.mit': 'MIT 라이선스',
    'license.unlicensed': '라이선스 없음: 원작자가 라이선스를 명시하지 않았습니다. 이 도구(모든 이미지 소재 포함)의 권리는 원작자에게 있으며 시험용으로만 제공됩니다.'
  }
});
```

- [ ] **Step 4: 建立 `index.html`**

內嵌文字為繁中，與字典的 `zh-TW` 值一致。

```html
<!doctype html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TRPG Toolkit — 網頁小工具合輯</title>
  <link rel="stylesheet" href="./assets/home.css">
  <script defer src="./assets/i18n.js"></script>
  <script defer src="./assets/i18n.home.js"></script>
  <script defer src="./assets/home.js"></script>
</head>
<body>
  <header class="site-header">
    <div>
      <h1 data-i18n="home.heading">TRPG Toolkit</h1>
      <p class="tagline" data-i18n="home.tagline">sotsotssi 製作的網頁小工具合輯，附繁體中文介面</p>
    </div>
    <select id="localeSelect" class="locale-select" data-i18n-aria-label="lang.aria" aria-label="顯示語言"></select>
  </header>

  <main>
    <p class="intro" data-i18n="home.intro">以下工具全部在瀏覽器本機執行，不上傳任何資料。</p>

    <ul class="tool-grid">
      <li class="tool-card">
        <a href="./tools/magic-circle/">
          <h2 data-i18n="tool.magic-circle.name">魔法陣製作器</h2>
          <p data-i18n="tool.magic-circle.desc">繪製魔法陣與簽名動態，支援對稱、貝茲曲線、時間軸與 GIF／APNG 匯出。</p>
        </a>
        <span class="badge mit" data-i18n="license.mit">MIT 授權</span>
      </li>

      <li class="tool-card">
        <a href="./tools/typewriter/">
          <h2 data-i18n="tool.typewriter.name">打字機動畫產生器</h2>
          <p data-i18n="tool.typewriter.desc">輸入文字，產生逐字打出效果的 APNG／GIF／WebP 動畫圖。</p>
        </a>
        <span class="badge mit" data-i18n="license.mit">MIT 授權</span>
      </li>

      <li class="tool-card">
        <a href="./tools/text-path/">
          <h2 data-i18n="tool.text-path.name">文字軌跡產生器</h2>
          <p data-i18n="tool.text-path.desc">讓文字沿著自訂路徑排列，輸出為圖片。</p>
        </a>
        <span class="badge mit" data-i18n="license.mit">MIT 授權</span>
      </li>

      <li class="tool-card">
        <a href="./tools/collage-letter/">
          <h2 data-i18n="tool.collage-letter.name">匿名拼貼信產生器</h2>
          <p data-i18n="tool.collage-letter.desc">以剪報拼貼風格的字母組成信件圖片。</p>
        </a>
        <span class="badge mit" data-i18n="license.mit">MIT 授權</span>
      </li>

      <li class="tool-card">
        <a href="./tools/emotion-maker/">
          <h2 data-i18n="tool.emotion-maker.name">表情產生器</h2>
          <p data-i18n="tool.emotion-maker.desc">組合眼睛、眉毛、嘴巴與裝飾，製作表情差分與合本圖。</p>
        </a>
        <span class="badge warn" data-i18n="license.unlicensed">未授權：原作者未釋出授權條款，此工具（含全部圖像素材）之權利屬原作者所有，僅供試用。</span>
      </li>
    </ul>

    <section class="credits">
      <h2 data-i18n="home.credits.heading">來源與授權</h2>
      <p data-i18n="home.credits.body">本站工具皆由 sotsotssi 製作，此處為加上繁體中文介面的合併版本。</p>
      <p><a href="https://github.com/sotsotssi" target="_blank" rel="noopener">github.com/sotsotssi</a></p>
    </section>
  </main>
</body>
</html>
```

- [ ] **Step 5: 建立 `assets/home.js`**

```js
/* 首頁腳本。 */
I18N.mountSwitcher(document.getElementById('localeSelect'));
```

- [ ] **Step 6: 建立 `assets/home.css`**

```css
/* 首頁樣式。卡片式格線，響應式，跟隨系統主題。 */

:root {
  --bg: #fbfaf8;
  --fg: #1c1b19;
  --muted: #6b6862;
  --card: #ffffff;
  --border: #e2ded7;
  --accent: #7b5ea7;
  --warn-bg: #fdf3e3;
  --warn-fg: #8a5a12;
  --warn-border: #e8c98a;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17161a;
    --fg: #ece9e4;
    --muted: #9d988f;
    --card: #201f24;
    --border: #35333a;
    --accent: #b79ce0;
    --warn-bg: #33260f;
    --warn-fg: #f0c579;
    --warn-border: #6b5320;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, "Noto Sans TC", "Noto Sans KR", sans-serif;
  line-height: 1.6;
}

.site-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  max-width: 72rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 1rem;
}

.site-header h1 { margin: 0; font-size: 1.75rem; letter-spacing: .02em; }
.tagline { margin: .25rem 0 0; color: var(--muted); }

.locale-select {
  background: var(--card);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: .375rem;
  padding: .375rem .5rem;
  font: inherit;
}

main { max-width: 72rem; margin: 0 auto; padding: 0 1.25rem 3rem; }
.intro { color: var(--muted); margin-top: 0; }

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
}

.tool-card {
  display: flex;
  flex-direction: column;
  gap: .75rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: .625rem;
  padding: 1.25rem;
}

.tool-card a {
  color: inherit;
  text-decoration: none;
  flex: 1;
}

.tool-card:hover { border-color: var(--accent); }
.tool-card h2 { margin: 0 0 .5rem; font-size: 1.125rem; }
.tool-card:hover h2 { color: var(--accent); }
.tool-card p { margin: 0; color: var(--muted); font-size: .9375rem; }

.badge {
  align-self: flex-start;
  font-size: .75rem;
  line-height: 1.45;
  padding: .25rem .5rem;
  border-radius: .3125rem;
  border: 1px solid var(--border);
  color: var(--muted);
}

.badge.warn {
  align-self: stretch;
  background: var(--warn-bg);
  color: var(--warn-fg);
  border-color: var(--warn-border);
}

.credits {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
}

.credits h2 { font-size: 1rem; margin: 0 0 .5rem; color: var(--fg); }
.credits p { margin: .25rem 0; }
.credits a { color: var(--accent); }

@media (max-width: 480px) {
  .site-header { padding-top: 1.25rem; }
  .site-header h1 { font-size: 1.375rem; }
}
```

- [ ] **Step 7: 執行測試，逐項修正至通過**

Run: `npm test`
Expected: `all checks passed`

- [ ] **Step 8: 以瀏覽器人工驗證**

Run: `npm run serve`，開啟 http://localhost:8080/

確認：五張卡片皆可點入對應工具；在首頁切換為韓文後點入任一工具，該工具亦為韓文
（驗證共用 localStorage key）；由工具返回首頁仍為韓文；視窗縮至手機寬度時版面正常；
淺色與深色系統主題下皆可讀。

- [ ] **Step 9: 提交**

```bash
git add index.html assets/home.css assets/home.js assets/i18n.home.js tests/smoke.mjs
git commit -m "Add landing page listing the five bundled tools"
```

---

## Task 8: 文件與部署

**Files:**
- Create: `README.md`、`ATTRIBUTION.md`、`LICENSE`
- Modify: `tests/smoke.mjs`

**Interfaces:**
- Consumes: 全部前置 task；`TOOLS` 常數（Task 7）
- Produces: 可部署的完整 repo

- [ ] **Step 1: 寫下失敗的測試**

在 `tests/smoke.mjs` 的 `process.exit` 之前加入：

```js
/* ---- 文件 ---- */
section('docs');
check('ATTRIBUTION.md 存在', exists('ATTRIBUTION.md'));
check('README.md 存在', exists('README.md'));
check('根目錄 LICENSE 存在', exists('LICENSE'));
check('.nojekyll 存在', exists('.nojekyll'));

const attribution = read('ATTRIBUTION.md');
for (const name of TOOLS) {
  check(`ATTRIBUTION.md 記載 ${name}`, attribution.includes(name));
}
for (const sha of ['de40a68', 'cf3ff36', 'b86cd28', 'ea08333', 'b455379', '772d6c4']) {
  check(`ATTRIBUTION.md 記載來源 commit ${sha}`, attribution.includes(sha));
}
check('ATTRIBUTION.md 標明 emotion-maker 未授權',
  /emotion-maker[\s\S]{0,600}(未授權|無授權)/.test(attribution));

const pkg = JSON.parse(read('package.json'));
check('package.json 無執行期相依',
  !pkg.dependencies && !pkg.devDependencies);
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npm test`
Expected: FAIL，`ATTRIBUTION.md 存在`、`README.md 存在`、`根目錄 LICENSE 存在` 等項失敗

- [ ] **Step 3: 建立 `ATTRIBUTION.md`**

````markdown
# 來源與授權

本 repo 收錄 [sotsotssi](https://github.com/sotsotssi) 製作的五個網頁工具，
並為其加上繁體中文介面。所有工具的原始著作權屬原作者所有。

收錄方式為快照式：自下列 commit 取得程式碼，不與上游自動同步。

| 工具 | 原始 repo | 來源 commit | 授權 |
|---|---|---|---|
| magic-circle | [sotsotssi/magic-circle-maker](https://github.com/sotsotssi/magic-circle-maker) | `de40a68` | MIT |
| typewriter | [sotsotssi/Typewriter-apng](https://github.com/sotsotssi/Typewriter-apng) | `cf3ff36` | MIT |
| text-path | [sotsotssi/text-path-generator](https://github.com/sotsotssi/text-path-generator) | `b86cd28` | MIT |
| collage-letter | [sotsotssi/collage-letter](https://github.com/sotsotssi/collage-letter) | `ea08333` | MIT |
| emotion-maker | [sotsotssi/emotion-maker](https://github.com/sotsotssi/emotion-maker) | `b455379` | **未授權** |

四個 MIT 工具的原始 `LICENSE` 檔保留於各自目錄中。

## emotion-maker 的授權狀態

`sotsotssi/emotion-maker` 未附任何授權條款，GitHub 亦未標示授權。依著作權法預設，
其權利（包含 `images/` 下全部 39 張手繪素材）保留予原作者，此處僅供試用。
原作者如有異議，將立即移除。

## 繁體中文翻譯

magic-circle 的繁體中文翻譯移植自
[tool-jx3/magic-circle-maker](https://github.com/tool-jx3/magic-circle-maker/tree/zhtw)
分支 `zhtw`，commit `772d6c4`。該分支在抽取字串時移除了如尼文的韓文讀音
（`RUNE_READINGS.ko` 為空物件），本 repo 已自上游 `de40a68` 還原這 69 組讀音。

其餘四個工具的翻譯與 i18n 改造為本 repo 新增。

## 本 repo 新增的部分

`assets/`、`index.html`、`tests/`、各工具的 `i18n.*.js` 字典檔，
以及 emotion-maker 的資產路徑改造，以 MIT 授權釋出，詳見 [LICENSE](LICENSE)。
````

- [ ] **Step 4: 建立 `README.md`**

````markdown
# TRPG Toolkit

[sotsotssi](https://github.com/sotsotssi) 製作的五個網頁小工具合輯，附繁體中文介面。

**https://tool-jx3.github.io/toolkit/**

| 工具 | 說明 |
|---|---|
| [魔法陣製作器](tools/magic-circle/) | 繪製魔法陣與簽名動態，支援對稱、貝茲曲線、時間軸與 GIF／APNG 匯出 |
| [打字機動畫產生器](tools/typewriter/) | 輸入文字，產生逐字打出效果的 APNG／GIF／WebP 動畫圖 |
| [文字軌跡產生器](tools/text-path/) | 讓文字沿著自訂路徑排列，輸出為圖片 |
| [匿名拼貼信產生器](tools/collage-letter/) | 以剪報拼貼風格的字母組成信件圖片 |
| [表情產生器](tools/emotion-maker/) | 組合眼睛、眉毛、嘴巴與裝飾，製作表情差分與合本圖 |

所有工具都在瀏覽器本機執行，不上傳任何資料，也沒有後端。

## 本機執行

無建置步驟。直接以瀏覽器開啟 `index.html` 即可，或啟動本機伺服器：

```
npm run serve
```

然後開啟 http://localhost:8080/

（`emotion-maker` 的合本圖片產生功能受 canvas 安全限制影響，需以伺服器方式開啟。）

## 測試

```
npm test
```

靜態檢查，無外部相依。檢查項目包含：字典 key 完整性、兩語言 key 集合對稱、
`{n}` 佔位符一致、標記引用的 key 皆存在、**無殘留未翻譯的韓文**、
emotion-maker 的圖片資產完整、首頁連結有效。

## 語言

介面預設為繁體中文，可由右上角切換為韓文。選擇記錄於 `localStorage`
（key：`trpg-toolkit-locale`），首頁與各工具共用。

### 新增語言

1. 在 `assets/i18n.js` 的 `LOCALES` 加入一筆，指定顯示名稱與 `lang` 屬性
2. 在每個 `i18n.*.js` 字典中加入同名的語言區塊
3. 執行 `npm test` 確認沒有漏 key

不需更動任何 HTML 或工具程式碼。

## 授權

本 repo 新增的部分（`assets/`、`index.html`、`tests/`、各 `i18n.*.js`）為 MIT。
各工具的原始授權與來源見 [ATTRIBUTION.md](ATTRIBUTION.md)。

**注意**：`emotion-maker` 的原始 repo 未附任何授權條款，其權利（含全部圖像素材）
屬原作者所有，此處僅供試用。
````

- [ ] **Step 5: 建立根目錄 `LICENSE`**

自 `tools/magic-circle/LICENSE` 複製標準 MIT 全文，僅將著作權行替換為：

```
Copyright (c) 2026 tool-jx3
```

- [ ] **Step 6: 執行測試，確認通過**

Run: `npm test`
Expected: `all checks passed`

- [ ] **Step 7: 提交**

```bash
git add README.md ATTRIBUTION.md LICENSE tests/smoke.mjs
git commit -m "Add README, attribution and repo license"
```

- [ ] **Step 8: 推送至 GitHub**

前置條件（需人工於 GitHub 網頁完成）：建立空的 `tool-jx3/toolkit`，
**不要**初始化 README、.gitignore 或 LICENSE。

```bash
git remote add origin git@github.com:tool-jx3/toolkit.git
git push -u origin main
```

- [ ] **Step 9: 啟用 GitHub Pages**

需人工於網頁完成：Settings → Pages → Source 選 `Deploy from a branch`，
Branch 選 `main`、資料夾選 `/ (root)`，儲存。

- [ ] **Step 10: 驗證線上部署**

等待 Pages 建置完成後，開啟 https://tool-jx3.github.io/toolkit/

確認：首頁載入正常；五個工具皆可進入且無 404；`emotion-maker` 的 39 張圖片全部載入；
語言切換在跨頁面間保持一致；瀏覽器主控台無錯誤。

CDN 依賴（Tailwind、pako、UPNG、gif.js）在 HTTPS 下應正常載入。
若主控台出現混合內容警告，檢查是否有殘留的 `http://` 連結
（已知一處在 collage-letter，已於 Task 4 Step 1 處理）。
