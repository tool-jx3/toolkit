# TRPG Toolkit

[sotsotssi](https://github.com/sotsotssi)、[shiki365](https://github.com/shiki365)、
[Taku_Taku_Taku](https://github.com/Taku-Taku-Taku) 與
[kimtaehee2018-maker](https://github.com/kimtaehee2018-maker) 與
[巡涯学派](https://github.com/organon-torah) 與
[Wool&Wag](https://github.com/woolwag3338) 與
[johnko00](https://github.com/johnko00) 與
[baegop157902](https://github.com/baegop157902) 製作的 22 個網頁小工具合輯，附繁體中文介面。

**https://tool-jx3.github.io/toolkit/**

| 工具 | 說明 |
|---|---|
| [魔法陣製作器](tools/magic-circle/) | 繪製魔法陣與簽名動態，支援對稱、貝茲曲線、時間軸與 GIF／APNG 匯出 |
| [打字機動畫產生器](tools/typewriter/) | 輸入文字，產生逐字打出效果的 APNG／GIF／WebP 動畫圖 |
| [文字軌跡產生器](tools/text-path/) | 讓文字沿著自訂路徑排列，輸出為圖片 |
| [匿名拼貼信產生器](tools/collage-letter/) | 以剪報拼貼風格的字母組成信件圖片 |
| [表情產生器](tools/emotion-maker/) | 組合眼睛、眉毛、嘴巴與裝飾，製作表情差分與合本圖 |
| [讀取動畫產生器](tools/loading-maker/) | 把角色動畫、讀取條與上下文字合成一張畫布，輸出為 APNG／WebP／GIF |
| [前景框產生器](tools/foreground-frame/) | 設計 CCFOLIA 前景用的外框，加上裝飾與天氣、時間帶差分，一次匯出 |
| [場景轉換素材產生器](tools/scene-transition/) | 製作暗轉、抹除、光圈等場景轉換動畫，輸出為透明背景的 APNG |
| [狀態條產生器](tools/status-bar/) | 產生自訂 CSS，把 CCFOLIA 角色的 HP、MP、SAN 以喜歡的樣式顯示在 OBS 上 |
| [切入素材產生器](tools/cutin/) | 把文字做成集中線、描邊字與彩虹漸層的循環動畫，輸出為 APNG／GIF／PNG |
| [立繪裁切器](tools/ccfolia-cropper/) | 依 CCFOLIA 的版面比例自動對齊頭部或角色中央，批次裁切立繪 |
| [選角畫面產生器](tools/character-select/) | 做出格鬥遊戲那樣的選角畫面，1P～4P 游標依序挑角色，輸出成動畫或可互動的 HTML |
| [角色資料編輯器](tools/character-editor/) | 在 CCFOLIA 外編輯角色的 JSON：狀態、參數、聊天面板都能改，也能直接讀編輯畫面貼上的文字 |
| [聊天視窗產生器](tools/chat-window/) | 做出自訂 CSS，把 CCFOLIA 的骰子結果與秘匿聊天以喜歡的樣式顯示在 OBS 上，可在預覽中一邊送訊息一邊調整 |
| [立繪尺寸統一器](tools/portrait-size/) | 把同一角色的差分立繪裁掉透明邊並統一寬度，切換立繪時棋子圖就不會忽大忽小；也能單張拿來裁邊與轉 WebP |
| [立繪身高比較板](tools/height-board/) | 填上身高就自動統一縮尺，把立繪並排比較高矮；可調頭頂與腳底線、匯出高解析 PNG、存成 .hboard 檔 |
| [房間 ZIP 產生器](tools/room-zip/) | 放入素材、排好場景、共用部件與棋子，直接產生 CCFOLIA 房間匯入用的 ZIP；工作進度可存成 .ccproj 檔 |
| [角色介紹圖產生器](tools/pair-maker/) | 挑一種版型，填上名字、標語與立繪，做出雙人或多人的角色介紹圖、橫幅與置頂推文圖；可存到存檔槽或匯出成編輯檔 |
| [角色配色條產生器](tools/color-palette/) | 把角色的配色排成一條色塊圖，可直接從立繪取色（手動滴管或自動抓主色），輸出 PNG |
| [壓克力周邊工房](tools/acrylic-goods/) | 用立繪做出 3D 壓克力立牌、搖搖樂與立體透視，可轉動、打光，匯出 APNG／GIF／WebM 或 .glb 模型 |
| [影片轉動圖工具](tools/video-anim/) | 把影片選定的區間轉成無損 APNG、Animated WebP 或 256 色 GIF，可裁切範圍、調影格率與逐格檢視 |
| [GIF 接合器](tools/gif-combiner/) | 把多張 GIF 的影格對齊時間軸排進同一張畫面，拖曳排版後合成一張 GIF |

以下工具全部在瀏覽器本機執行，不會上傳你建立的任何內容；但部分工具會從 CDN 載入函式庫與字型。

## 本機執行

發佈出去的檔案全部是靜態的，沒有建置步驟。直接以瀏覽器開啟 `index.html` 即可，
或啟動本機伺服器：

```
npm run serve
```

然後開啟 http://localhost:8080/

（`emotion-maker` 的合本圖片產生功能受 canvas 安全限制影響，需以伺服器方式開啟。）

### 重新建置 cutin 與 character-editor

二十二個工具裡有兩個的上游是 React + TypeScript 專案，沒辦法直接放進 `tools/`
裡執行。原始碼收在 `vendor/` 底下，建置產物（已提交進 repo）輸出到各自的
`tools/` 目錄。改動原始碼後要重新建置：

```
cd vendor/cutin-maker              # 或 vendor/ccfolia-character-editor
npm install                        # character-editor 請用 npm ci
npm run build
```

`npm run build` 會先跑 `tsc --noEmit`，再由 Vite 把產物寫進對應的 `tools/`
目錄（`emptyOutDir: false`，不會動到同目錄下的 `i18n.*.js` 與 `LICENSE`）。
`vendor/` 不參與網站發佈。

`character-editor` 請用 `npm ci`：`npm install` 在解析 vitest 的 peer
相依時會踩到 npm 10.9 的一個錯誤（`Cannot read properties of null`），
上游的 lockfile 則可以正常安裝。

## 測試

```
npm test
```

靜態檢查，無外部相依。檢查項目包含：字典 key 完整性、兩語言 key 集合對稱、
`{n}` 佔位符一致、標記引用的 key 皆存在、**無殘留未翻譯的原文**
（韓文查諺文，日文查平假名與片假名）、
emotion-maker 的圖片資產完整、首頁連結有效、
**HTML 內嵌文字與 zh-TW 字典逐字相符**（含元素內文與 `title`／`aria-label`／`placeholder` 屬性兩類比對）。

`cutin` 沒有內嵌文字可比對（畫面全部由 React 算繪），因此改為檢查已提交的建置產物：
`tools/cutin/assets/*.js` 裡不得殘留任何假名，且原始碼引用的每個 key 都必須出現在
bundle 裡——改了 `vendor/cutin-maker/` 卻忘記重新建置時，這項檢查會抓到。

`cutin` 與 `character-editor` 的上游各有一套 vitest 單元測試（420 項與 30 項），
一併收錄在 `vendor/` 底下，以 `cd vendor/<工具> && npm test` 執行。
`character-editor` 那套是用畫面上的日文標籤找元素的，收錄版把 `ja` 字典注入
`window.T`，因此測試一行都沒改就能通過——順帶還會驗證 `ja` 的譯文與上游原文
是否一字不差。
那套測試需要 `npm install`，不在根目錄的 `npm test` 範圍內（根目錄的檢查刻意保持
無外部相依）；因此兩者之間容易漂移的地方，改由根目錄的靜態檢查看著——例如版面
測試的字幅比表有沒有跟上字型清單。

## 語言

介面預設為繁體中文，可由右上角切換回該工具的原文：sotsotssi 的十一個工具、
`ccfolia-cropper` 與 `pair-maker` 為韓文，shiki365 的四個工具、`cutin`、
`character-editor`、`portrait-size` 與 `height-board` 為日文；`room-zip`
原文為日文，另外附了一份韓文。

`status-bar`、`chat-window` 與 `foreground-frame` 的字型欄可以改填「以名稱指定」，
使用觀看者電腦上已安裝的字型。Chrome／Edge 還能用「從清單選」開出一份附樣張的清單
（Local Font Access API，第一次會詢問權限）；其餘瀏覽器隱藏該按鈕，直接輸入名稱同樣可用。
那個對話框是三個工具共用的 `pcfonts.v1.js`，三份必須完全相同，詳見
[ATTRIBUTION](ATTRIBUTION.md#三個工具共用的-pcfontsv1js)。
選擇記錄於 `localStorage`（key：`trpg-toolkit-locale`），首頁與各工具共用。

語言選單只會列出「該頁確實載入字典」的語言，因此韓文工具不會出現日文選項，
反之亦然。停在沒有該語言字典的頁面時會以繁體中文呈現，但不會覆寫使用者的選擇——
回到有該語言的頁面時仍會恢復。

### 字型

有字型清單的工具，除了原本的韓文／日文字型之外，都另外收了同一組五套繁體中文
字型（思源黑體、思源宋體、霞鶩文楷、巧克力黑體、仙人掌明體，皆為 SIL OFL 1.1，
自 Google Fonts 載入）。原有選項與預設值都沒有改動，需要中文字形時自行挑選即可。
沒有網頁字型載入機制的三個工具，則補上台灣的系統字型堆疊。詳見
[ATTRIBUTION.md](ATTRIBUTION.md#繁體中文字型)。

### 新增語言

1. 在 `assets/i18n.js` 的 `LOCALES` 加入一筆，指定顯示名稱與 `lang` 屬性
2. 在需要該語言的 `i18n.*.js` 字典中加入同名的語言區塊
3. 執行 `npm test` 確認沒有漏 key

不需更動任何 HTML 或工具程式碼。

## 授權

根目錄 [LICENSE](LICENSE)（MIT）僅涵蓋本 repo 新增的部分：`assets/`、
`index.html`、`tests/`、各 `i18n.*.js` 字典，以及 emotion-maker 的資產路徑改造。
各工具的原始授權與來源見 [ATTRIBUTION.md](ATTRIBUTION.md)。

**注意**：`emotion-maker`、`loading-maker`、`ccfolia-cropper`、`character-select`、
`character-editor`、`room-zip` 與 `pair-maker` 的原始 repo 皆未附任何授權條款，
其權利（`emotion-maker` 含全部圖像素材）屬原作者所有，
不在根目錄 LICENSE 涵蓋範圍內，此處僅供試用。
