# TRPG Toolkit 合併設計

日期：2026-08-28
目標 repo：`tool-jx3/toolkit`
部署：https://tool-jx3.github.io/toolkit/

## 背景

sotsotssi 製作了一系列單機、無後端的網頁小工具，品質良好但介面全為韓文，且散落在五個獨立 repo。本專案將其合併為單一 repo，加上繁體中文介面，並以 GitHub Pages 部署。

其中 `magic-circle-maker` 已有現成的繁中 i18n 成果（`tool-jx3/magic-circle-maker` 的 `zhtw` 分支），本專案沿用其 i18n 模式，並直接移植該分支的翻譯內容。

## 來源清單

| 工具 | 原始 repo | 來源 commit | 授權 | 韓文字串量 |
|---|---|---|---|---|
| magic-circle | sotsotssi/magic-circle-maker | `de40a68` | MIT | ~500（已譯） |
| typewriter | sotsotssi/Typewriter-apng | `cf3ff36` | MIT | ~245 |
| text-path | sotsotssi/text-path-generator | `b86cd28` | MIT | ~59 |
| collage-letter | sotsotssi/collage-letter | `ea08333` | MIT | ~61 |
| emotion-maker | sotsotssi/emotion-maker | `b455379` | **無授權** | ~165 |

繁中翻譯移植來源：`tool-jx3/magic-circle-maker` 分支 `zhtw`，commit `772d6c4`。

該分支在抽取字串時移除了如尼文的韓文讀音（`RUNE_READINGS.ko` 為空物件，且 `RUNE_SETS` 元組的第四個韓文欄位被刪除），導致韓文介面只顯示拉丁名。本專案將韓文視為完整語言，故需自上游 `de40a68` 還原這 69 組韓文讀音。

### 授權狀態

四個工具為 MIT，各自目錄保留原始 `LICENSE` 檔。

`emotion-maker` 的 repo 沒有 `LICENSE` 檔，GitHub 也未標示任何授權，其主體包含作者手繪的 39 張 PNG 素材。依預設即為保留所有權利。專案擁有者已知悉並決定收錄，條件為在首頁與 `ATTRIBUTION.md` 明確標示其未授權狀態與原作者出處。

## 目錄結構

```
toolkit/
├── index.html                  首頁：工具卡片列表 + 語言切換
├── .nojekyll
├── assets/
│   ├── i18n.js                 共用 i18n 引擎（唯一一份）
│   ├── i18n.home.js            首頁字典
│   └── home.css
├── tools/
│   ├── magic-circle/
│   │   ├── index.html app.js styles.css preview.png LICENSE
│   │   └── i18n.magic-circle.js
│   ├── typewriter/
│   │   ├── index.html script.js webp-muxer.js style.css LICENSE
│   │   └── i18n.typewriter.js
│   ├── text-path/
│   │   ├── index.html app.js styles.css LICENSE
│   │   └── i18n.text-path.js
│   ├── collage-letter/
│   │   ├── index.html app.js styles.css LICENSE
│   │   └── i18n.collage-letter.js
│   └── emotion-maker/
│       ├── index.html app.js style.css
│       ├── i18n.emotion-maker.js
│       └── images/             （ASCII 檔名）
├── tests/smoke.mjs
├── ATTRIBUTION.md
├── LICENSE                     本 repo 聚合層（MIT）
├── README.md
└── package.json
```

網址對應：`/` → 首頁，`/tools/<name>/` → 各工具。

`text-path` 與 `collage-letter` 原為單一 HTML 檔（內嵌 `<style>` 與約 560 行的 `<script>`）。收錄時將內嵌區塊抽出為 `styles.css` 與 `app.js`，理由有二：其一，韓文洩漏檢查需逐檔掃描，JS 混在 HTML 中會使白名單規則變得脆弱；其二，與其餘三個工具的檔案結構一致。抽出過程不更動任何一行程式邏輯。

## i18n 架構

### 引擎（`assets/i18n.js`）

對外 API 與參考實作完全相同，以確保移植 `zhtw` 分支翻譯時無需改寫呼叫端：

- `window.I18N`、`window.T`
- 標記屬性：`data-i18n`（textContent）、`data-i18n-node`（僅第一個非空文字節點）、`data-i18n-html`（innerHTML）、`data-i18n-title`、`data-i18n-aria-label`、`data-i18n-placeholder`
- `I18N.t(key, ...args)`：支援 `{0}` 位置參數，缺 key 時退到 fallback 語言，再缺則回傳 key 本身
- `I18N.setLocale(locale)`、`I18N.onChange(listener)`、`I18N.applyStaticDom(root)`
- `I18N.register(dictionaries)`、`I18N.mountSwitcher(selectElement)`

參考實作中的 `I18N.runeReading(name)` 為 magic-circle 專屬，不納入共用引擎。如尼文讀音改用一般 key（`rune.Fehu` 等 69 組），由 magic-circle 的字典提供，呼叫端改為 `T('rune.' + name)`。

與參考實作的三點差異：

1. **localStorage key 統一為 `trpg-toolkit-locale`**。首頁與五個工具共用同一個偏好，切換一次全站一致。
2. **預設與 fallback 皆為 `zh-TW`**，不做瀏覽器語言偵測。首次進入固定為繁中；字典缺 key 時退回繁中而非韓文。
3. **引擎與字典分離**。引擎只提供機制，不含任何字典內容。

### 字典註冊

新增 `I18N.register(messages)`，將 `{ 'zh-TW': {...}, ko: {...} }` 併入引擎的訊息表。

載入順序由 `defer` 保證：

```html
<script defer src="../../assets/i18n.js"></script>
<script defer src="./i18n.magic-circle.js"></script>
<script defer src="./app.js"></script>
```

字典檔尾呼叫 `I18N.register(MESSAGES)`；引擎在 `DOMContentLoaded` 時執行 `applyStaticDom()`。因 `defer` 腳本依序執行且早於 `DOMContentLoaded`，工具本體（如 `magic-circle` 的 `app.js` 在 top-level 即呼叫 `T()`）可安全使用 `T`。

### 內嵌文字語言

HTML 內嵌文字一律為**繁體中文**，韓文只存在於字典中。

此處與參考實作相反（參考版內嵌韓文、由 JS 換為繁中）。理由：預設語言為繁中，若內嵌韓文則繁中使用者每次載入都會看見韓文閃現。內嵌繁中後，預設語言的呈現完全不依賴 JS 執行時機。

韓文字典仍需完整，供切換回韓文使用。

### 語言切換器

首頁與各工具頁一致：`<select>` 列出 `繁體中文` / `한국어`，變更時呼叫 `I18N.setLocale()`。工具頁另需將動態產生的字串（透過 `T()`）在 `I18N.onChange` 時重繪。

## 首頁

單頁卡片列表，每張卡片包含：工具名稱、一句話說明、預覽圖或代表圖示、連結至 `/tools/<name>/`。

另含：

- 語言切換器（與工具頁共用偏好）
- 原作者 sotsotssi 出處連結
- 授權標示區：四個工具標示 MIT；`emotion-maker` 明確標示「未授權，僅供試用，權利屬原作者」

首頁本身亦透過 `assets/i18n.home.js` 支援雙語。

## emotion-maker 資產改名

原始碼中韓文字串同時擔任三種角色：圖檔路徑、內部資料 ID、匯出 JSON 的欄位值。改名時僅改變路徑，保留 ID 以維持與原版工具的 JSON 互通性。

分類對應：

| 韓文 | slug |
|---|---|
| 피부 | `skin` |
| 얼굴 틀 | `face` |
| 눈 | `eyes` |
| 눈썹 | `brows` |
| 입 | `mouth` |
| 꾸밈 | `deco` |

各部件依語意羅馬化為小寫 ASCII slug，路徑格式為 `<分類 slug>/<部件 slug>`（如 `보통 눈` → `eyes/normal`、`하트 눈` → `eyes/heart`）。完整的 39 項對照表定義於 `MANIFEST` 中，不另立對照檔。

`MANIFEST` 由字串陣列改為物件陣列：

```js
"눈": [ { id: "보통 눈", file: "eyes/normal" }, ... ]
```

`id` 維持原韓文，因此：

- `PRESETS` 中的部件引用不需更動
- `localStorage`（`emotion_face_maker_v1`）格式不變
- 從原版工具匯出的 `.json` 可直接匯入，反之亦然

`srcOf()` / `baseSrc()` 改為查 `file` 欄位，不再需要 `encodeURI`。

顯示名稱透過 i18n key（如 `part.eyes.normal`）取得，與 `id` 完全脫鉤。

`PRESETS` 的 `tag` 欄位（`기쁨`、`행복` 等 20 種情緒名稱）為顯示文字而非 ID，改為 i18n key（如 `preset.joy`），需完整翻譯。

## 測試（`tests/smoke.mjs`）

Node 內建模組，無外部依賴，以 `npm test` 執行。純靜態解析，不啟動瀏覽器。

檢查項目：

1. **key 存在性**：每個 HTML 中 `data-i18n*` 屬性引用的 key，都存在於對應工具的字典。
2. **字典對稱性**：每個字典的 `zh-TW` 與 `ko` key 集合完全一致。
3. **韓文洩漏**：HTML 與 JS 檔案中不得出現未經字典包裝的韓文字元（Unicode `AC00–D7A3`）。白名單僅限兩處：字典檔的 `ko` 區塊，以及 `emotion-maker` 中作為資料 ID 的韓文（`MANIFEST` 的 `id` 欄位、`PRESETS` 的部件引用值，以及 `CATS`／`SINGLE`／`DECO`／`DRAW_SINGLE` 等結構常數）。`PRESETS` 的 `tag` 不在白名單內。
4. **資產完整性**：`emotion-maker` 的 `MANIFEST` 中每個 `file` 對應的 PNG 確實存在。
5. **連結完整性**：首頁指向的五個 `tools/*/index.html` 皆存在。

第 3 項為本專案主要品質關卡 —— 翻譯工作最常見的缺陷是漏翻，靜態掃描可完整涵蓋。

## 歸屬與授權

- 各工具目錄保留原始 `LICENSE`（`emotion-maker` 無此檔）
- 根目錄 `LICENSE` 為本 repo 聚合層與 i18n 程式碼的 MIT 授權
- `ATTRIBUTION.md` 逐項記錄：工具名、原始 repo URL、來源 commit SHA、授權狀態、原作者
- `README.md` 說明專案用途、工具清單、本機執行方式、i18n 擴充方式（新增語言 = 在各字典加一份對照，不動 HTML 與工具程式碼）

## 部署

GitHub Pages，來源為 `main` 分支根目錄。純靜態、無建置步驟，因此不需要 GitHub Actions workflow。

加入 `.nojekyll` 以跳過 Jekyll 處理。

外部依賴（各工具原有）維持 CDN 載入，不做本地化：`cdn.tailwindcss.com`、`cdn.jsdelivr.net`（pako、upng-js）、`cdnjs.cloudflare.com`（gif.js）。

需人工執行的兩個步驟：

1. 在 GitHub 網頁建立空的 `tool-jx3/toolkit`（不初始化 README）
2. 建立後於 Settings → Pages 設定來源為 `main` / root

## 實作順序

1. 骨架：repo 結構、`assets/i18n.js` 引擎、`.nojekyll`、`package.json`
2. `magic-circle`：移植 `zhtw` 分支，拆分引擎與字典，內嵌文字改繁中
3. `text-path`、`collage-letter`：單檔小型工具
4. `typewriter`：中型
5. `emotion-maker`：資產改名 + manifest 改造 + i18n
6. 首頁與 `i18n.home.js`
7. `tests/smoke.mjs`、`README.md`、`ATTRIBUTION.md`
8. 推送並設定 Pages

## 非目標

- 不改變任何工具的功能行為
- 不整合為單一 SPA（各工具的全域 CSS 與腳本會互相衝突，重寫成本遠超效益）
- 不支援英文介面
- 不建立與上游 repo 的自動同步機制（採快照式收錄，來源 commit 記於 `ATTRIBUTION.md`）
