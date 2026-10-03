# TRPG Toolkit 重構計畫

> 狀態：進行中。本文件是重構的總依據；每完成一個階段就更新「進度表」。
> 相關文件：[PROCESS.md](PROCESS.md)（重寫流程與對等驗證）、[DESIGN.md](DESIGN.md)（設計系統與元件）、
> [specs/](specs/)（各工具的行為規格與對等驗證紀錄）。

## 1. 目標

1. **一套框架、一套元件、一套設計**：所有工具改用同一個 Vite＋React＋TypeScript 專案，共用元件庫與核心模組，
   色系、版面、用詞、操作方式一致。
2. **全部改寫成本專案的程式**：收錄的工具一律參考原作的程式，改寫到 `web/` 框架、用本專案的共用元件（見 PROCESS.md 第 0 節）。
   開放授權原作的授權全文保留在 THIRD_PARTY_NOTICES；未授權原作的素材與範本文字不沿用。
   介面上不放作者標示，每個工具只保留一行「靈感來源」連結。
3. **只保留繁體中文介面**：重寫後拿掉 i18n 引擎與所有字典。字串集中在各工具的文字檔，日後要加語言不必大改。
4. **功能對等**：每個重寫的工具在上線前，必須逐項通過「對等驗證」——原有的每個功能都要做到，並與舊版並排比對。
5. **往後新增工具也走同一套流程**：讀原作程式 → 功能清單 → 用本專案元件改寫 → 對等驗證，不再「整份複製＋繁中化」。

## 2. 現況盤點（41 個工具）

| 工具 id | 名稱 | 靈感來源 | 原授權 | 群組 |
|---|---|---|---|---|
| text-fx | 文字演出產生器 | （本專案原創） | MIT | G1 |
| typewriter | 打字機動畫產生器 | sotsotssi/Typewriter-apng | MIT | G1 |
| cutin | 切入素材產生器 | Taku-Taku-Taku/cutin-maker | MIT | G1 |
| text-path | 文字軌跡產生器 | sotsotssi/text-path-generator | MIT | G1 |
| collage-letter | 匿名拼貼信產生器 | sotsotssi/collage-letter | MIT | G1 |
| textbox | 文字方框產生器 | sotsotssi/TextBoxGen | MIT | G1 |
| scene-transition | 場景轉換素材產生器 | shiki365/scene-transition-maker | MIT | G2 |
| apng-wipe | 輕量轉場 APNG 產生器 | 來源不明 | 未授權 | G2 |
| bg-motion | 動態背景產生器 | くま。/TRPG WEBツール観測所 | 未授權 | G2 |
| loading-maker | 讀取動畫產生器 | sotsotssi/loading-maker | 未授權 | G2 |
| ccfolia-cropper | 立繪裁切器 | kimtaehee2018-maker/ccfolia-cropper | 未授權 | G3 |
| portrait-size | 立繪尺寸統一器 | woolwag3338/character-image-size | MIT | G3 |
| icon-maker | 簡易頭像產生器 | くま。/TRPG WEBツール観測所 | 未授權 | G3 |
| variant-manager | 角色差分管理器 | くま。/TRPG WEBツール観測所 | 未授權 | G3 |
| height-board | 立繪身高比較板 | woolwag3338/character-height-board | MIT | G3 |
| color-palette | 角色配色條產生器 | sotsotssi/CharColorPalette | MIT | G3 |
| emotion-maker | 表情產生器 | sotsotssi/emotion-maker | 未授權（含 39 張素材） | G3 |
| status-bar | 狀態條產生器 | shiki365/status-bar-maker | MIT | G4 |
| chat-window | 聊天視窗產生器 | shiki365/chat-window-maker | MIT | G4 |
| message-box | 訊息框產生器 | shiki365/message-box-maker | MIT | G4 |
| obs-tachie | Discord 通話立繪產生器 | max-enterme/obs-tachie-generator | MIT | G4 |
| character-editor | 角色資料編輯器 | organon-torah/ccfoliaCharacterEditor | 未授權 | G5 |
| room-zip | 房間 ZIP 產生器 | johnko00/ccfolia-room-zip-maker-demo | 未授權 | G5 |
| psd-studio | CCFOLIA & 圖片調色工作室 | fyam-hamu/F_Ccfolia-PSD-Studio | 作者條款 | G5 |
| foreground-frame | 前景框產生器 | shiki365/foreground-frame-maker | MIT | G5 |
| log-converter | CCFOLIA 日誌轉換器 | Eon-00/eon-ccfolia-log-converter | MIT | G5 |
| scenario-cards | 劇本資訊卡片產生器 | くま。/TRPG WEBツール観測所 | 未授權 | G5 |
| scenario-editor | 劇本排版台 | sedn14636361/trpg-scenario-editor | CC0 | G6 |
| coc-typesetter | CoC 劇本排版工具 | 來源不明 | 未授權 | G6 |
| session-log | 跑團紀錄簿 | くま。/TRPG WEBツール観測所 | 未授權 | G6 |
| session-report | 團報產生器 | くま。/TRPG WEBツール観測所 | 未授權 | G6 |
| pair-maker | 角色介紹圖產生器 | baegop157902/PairMaker | 未授權 | G7 |
| character-select | 選角畫面產生器 | sotsotssi/select-your-chara | 未授權 | G7 |
| magic-circle | 魔法陣製作器 | sotsotssi/magic-circle-maker | MIT | G7 |
| acrylic-goods | 壓克力周邊工房 | sotsotssi/acrylic-goods | MIT | G7 |
| video-anim | 影片轉動圖工具 | sotsotssi/video-to-pic | MIT | G8 |
| gif-combiner | GIF 接合器 | sotsotssi/GIF-Combiner | MIT | G8 |
| battlemap | 戰鬥地圖產生器 | usagineko7865-debug/battlemap-generator | MIT | G8 |
| trpg-lab | 違法建築的 TRPG 實驗室（9 個子工具＋地圖編輯器） | ihoukentiku | MIT | G9 |
| anime-rig | Anime2.5DRig | 852wa/Anime2.5DRig | MIT | G9 |
| jizura | JIZURA 字面 | 852wa/JIZURA | MIT | 外部連結（不重寫，維持轉址） |

## 3. 群組（共用引擎＋同一套外框）

「合併」的做法是：同一群組的工具共用一個引擎與同一套介面外框，頁面上方有**群組分頁**可以互相切換；
**每個工具仍保留原本的網址**（`tools/<id>/`），使用者的書籤不會失效。

| 群組 | 共用引擎 | 工具 |
|---|---|---|
| G1 文字演出 | 文字排版（直書、禁則、自動縮小）、逐字動畫時間軸、字型 | text-fx、typewriter、cutin、text-path、collage-letter、textbox |
| G2 轉場與動態 | 時間軸、遮罩與轉場、圖片動態 | scene-transition、apng-wipe、bg-motion、loading-maker |
| G3 立繪工作台 | 圖片匯入、批次處理、裁切、透明邊偵測、取色 | ccfolia-cropper、portrait-size、icon-maker、variant-manager、height-board、color-palette、emotion-maker |
| G4 OBS 疊加 | CCFOLIA／Discord 畫面模擬、CSS 產生器、預覽 | status-bar、chat-window、message-box、obs-tachie |
| G5 CCFOLIA 資料 | 房間 ZIP、角色 JSON、聊天面板、日誌解析 | character-editor、room-zip、psd-studio、foreground-frame、log-converter、scenario-cards |
| G6 劇本與紀錄 | 富文本與分頁排版、列印／PDF、紀錄資料庫 | scenario-editor、coc-typesetter、session-log、session-report |
| G7 介紹圖與宣傳 | 版型畫布（Konva）、3D（three.js） | pair-maker、character-select、magic-circle、acrylic-goods |
| G8 影像與動圖 | 影片解碼、動圖編碼、程序生成 | video-anim、gif-combiner、battlemap |
| G9 綜合 | 依子工具而定 | trpg-lab（拆成獨立工具）、anime-rig |

## 4. 技術架構

### 4.1 目錄

```
web/                        新框架（Vite 專案，有自己的 package.json）
  src/ui/                   設計 token 與共用元件（見 DESIGN.md）
  src/core/                 共用模組：storage、files、fonts、encode、timeline、typeset、image、worker
  src/ccfolia/              CCFOLIA 與 OBS 相關的資料格式與選擇器（CCFOLIA 改版只改這裡）
  src/tools/<id>/           各工具：頁面、範本、文字（strings.ts）
  src/tools/<id>/index.html 每個工具一頁（多頁輸出）
  tests/                    Vitest 單元測試、Playwright 端對端與視覺回歸
docs/refactor/              本計畫、流程、設計、各工具規格
tools/<id>/                 對外網址。舊版工具在重寫上線前留在這裡；上線時換成新框架的建置產物
next/<id>/                  重寫中的工具的建置產物（不連到首頁，只供對等驗證）
```

### 4.2 技術棧

| 用途 | 套件 | 授權 |
|---|---|---|
| 建置 | Vite、TypeScript | MIT、Apache-2.0 |
| 介面 | React 19、Radix UI primitives、lucide-react（圖示） | MIT、MIT、ISC |
| 樣式 | Tailwind CSS v4（主題對應到設計 token 的 CSS 變數） | MIT |
| 狀態 | Zustand（含 persist）、zundo（復原／重做）、Immer | MIT |
| 儲存 | idb-keyval（IndexedDB） | Apache-2.0 |
| 檔案 | fflate（ZIP、deflate） | MIT |
| 編碼 | APNG／PNG／減色：沿用 text-fx 自己寫的編碼器並移入 core；GIF：gifenc；MP4／WebM：Mediabunny（需要時） | MIT、MPL-2.0 |
| 背景執行 | Comlink（Web Worker） | Apache-2.0 |
| 2D 編輯 | Konva、react-konva（G5、G7 等需要時） | MIT |
| 3D | three.js、@react-three/fiber（G7、G9 需要時） | MIT |
| 其他（需要時） | ag-psd、pdf-lib＋@pdf-lib/fontkit、marked＋DOMPurify、zod | MIT 等 |
| 測試 | Vitest、Testing Library、Playwright | MIT、Apache-2.0 |
| 格式與檢查 | Biome | MIT |

原則：**所有程式相依都從 npm 打包**，不從 CDN 載入 JS（CDN 只保留 Google Fonts 的字型）。

### 4.3 建置與部署

- GitHub Pages 維持「從 main 分支根目錄發佈」，與現在相同。
- `web/` 建置成多頁輸出：上線的工具寫到 `tools/<id>/`，重寫中的寫到 `next/<id>/`，共用的程式與樣式寫到
  `assets/build/`。建置產物提交進 repo（和現在的 cutin、character-editor 一樣）。
- 工具清單與上線狀態集中在 `web/src/registry.ts`，建置設定與首頁卡片都從這裡讀。

## 5. 遷移階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| P0 地基 | `web/` 專案、設計 token、元件庫、core 模組、元件展示頁、測試與建置流程 | 元件展示頁可用；`npm run build`、`npm test` 通過 |
| P1 試點 | battlemap、textbox、apng-wipe、portrait-size（小工具，涵蓋畫布、文字、APNG、批次圖片）；text-fx 移入新框架 | 五個工具對等驗證通過並上線；元件與流程依試點經驗修正 |
| P2～P9 | 依群組 G4 → G3 → G1 → G2 → G5 → G6 → G8 → G7 → G9 逐組重寫 | 每個工具對等驗證通過才上線 |
| P10 收尾 | 首頁移入新框架（只有繁中）、移除 `assets/i18n.js` 與所有字典、`vendor/`、舊測試；ATTRIBUTION 改成「靈感來源」清單 | 全站只剩新框架的程式；所有測試通過 |

每個工具上線時：舊版的檔案、字典、vendor 原始碼一併刪除；舊版所在的 `main` commit 記在 ATTRIBUTION，日後要再對照時可以取回。

## 6. 進度表

狀態：⬜ 未開始　📝 規格中　🔨 實作中　🔍 對等驗證中　✅ 已上線

| 工具 | 規格 | 實作 | 對等驗證 | 上線 |
|---|---|---|---|---|
| （P0 地基） | — | ✅ | — | ✅（元件展示頁 `next/_gallery/`） |
| battlemap | ✅ | ✅ | ✅ | ✅ |
| textbox | ✅ | ✅ | ✅ | ✅ |
| apng-wipe | ✅ | ✅ | ✅ | ✅ |
| portrait-size | ✅ | ✅ | ✅ | ✅ |
| text-fx | —（原創，直接移植） | ✅ | ✅ | ✅ |
| status-bar | ✅ | ✅ | ✅ | ✅ |
| message-box | ✅ | ✅ | ✅ | ✅ |
| chat-window | ✅ | ✅ | ✅ | ✅ |
| obs-tachie | ✅ | ✅ | ✅ | ✅ |
| ccfolia-cropper | ✅ | ✅ | ✅ | ✅ |
| icon-maker | ✅ | ✅ | ✅ | ✅ |
| variant-manager | ✅ | ✅ | ✅ | ✅ |
| height-board | ✅ | ✅ | ✅ | ✅ |
| color-palette | ✅ | ✅ | ✅ | ✅ |
| emotion-maker | ✅ | ✅ | ✅ | ✅ |
| typewriter | ✅ | ✅ | ✅ | ✅ |
| text-path | ✅ | ✅ | ✅ | ✅ |
| cutin | ✅ | ✅ | ✅ | ✅ |
| collage-letter | ✅ | ✅ | ✅ | ✅ |
| scene-transition | ✅ | ✅ | ✅ | ✅ |
| bg-motion | ✅ | ✅ | ✅ | ✅ |
| loading-maker | ✅ | ✅ | ✅ | ✅ |
| foreground-frame | ✅ | ✅ | ✅ | ✅ |
| scenario-cards | ✅ | ✅ | ✅ | ✅ |
| character-editor | ✅ | ✅ | ✅ | ✅ |
| log-converter | ✅ | ✅ | ✅ | ✅ |
| room-zip | ✅ | ✅ | ✅ | ✅ |
| psd-studio | ✅ | ✅ | ✅ | ✅ |
| scenario-editor | ✅ | ✅ | ✅ | ✅ |
| session-log | ✅ | ✅ | ✅ | ✅ |
| session-report | ✅ | ✅ | ✅ | ✅ |
| coc-typesetter | ✅ | ✅ | ✅ | ✅ |
| video-anim | ✅ | ✅ | ✅ | ✅ |
| gif-combiner | ✅ | ✅ | ✅ | ✅ |
| pair-maker | ⬜ | ⬜ | ⬜ | ⬜ |
| character-select | ⬜ | ⬜ | ⬜ | ⬜ |
| magic-circle | ⬜ | ⬜ | ⬜ | ⬜ |
| acrylic-goods | ⬜ | ⬜ | ⬜ | ⬜ |
| trpg-lab | ⬜ | ⬜ | ⬜ | ⬜ |
| anime-rig | ⬜ | ⬜ | ⬜ | ⬜ |

（每個群組開始時把該組工具逐列展開到這張表。共用層：G4 ✅、G3 ✅、G1 ✅、G2 ✅、G5 ✅、G6 ✅。）

## 7. 往後新增工具

一律照 [PROCESS.md](PROCESS.md) 的流程：評估（含授權） → 讀原作程式寫功能清單 → 差距分析（缺的元件先補進元件庫） →
用本專案元件改寫 → 對等驗證 → 上線（首頁卡片與工具頁尾只放「靈感來源」連結）。未授權原作的素材與範本文字不沿用。

## 8. 注意事項

- **作者標示**：介面上只留靈感來源連結。參考開放授權原作改寫的工具，依原作授權把著作權聲明與授權全文保留在
  `THIRD_PARTY_NOTICES.md`（建置時從 `web/src/tools/<id>/UPSTREAM_LICENSE` 產生）；npm 套件也照其授權列在同一檔。
- **素材**：開放授權原作的範本、預設集、範例可以沿用（翻成繁中）；未授權原作的圖片、範本文字、範例資料、預設集一律不沿用。
- **還原度**：靠行為規格＋並排比對控制；無法完全一致的地方要在規格的對等紀錄裡寫明理由並經確認。
- **語言**：重寫後只有繁體中文；日、韓文使用者會失去原文介面（已確認）。
- **授權特別注意**：くま。的工具等明文禁止複製工具本體：只參考功能與做法，程式用本專案的元件自己寫，素材與文字不沿用。
