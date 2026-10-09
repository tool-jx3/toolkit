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

## 2. 現況盤點（43 個工具）

| 工具 id | 名稱 | 靈感來源 | 原授權 | 群組 |
|---|---|---|---|---|
| text-fx | 文字演出產生器 | くま。/TRPG WEBツール観測所（文字画像APNGメーカー；無塵室開發） | 作者條款（本站程式 MIT） | G1 |
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
| bg-remover | 立繪去背工具 | SkyTNT/anime-segmentation | Apache-2.0 | G3 |
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
| music-frame | 音樂播放畫面產生器 | zznaptime/1007mv | 未授權 | G8 |
| battlemap | 戰鬥地圖產生器 | usagineko7865-debug/battlemap-generator | MIT | G10（原 G8） |
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
| G3 立繪工作台 | 圖片匯入、批次處理、裁切、透明邊偵測、取色 | ccfolia-cropper、portrait-size、icon-maker、variant-manager、height-board、color-palette、emotion-maker、bg-remover |
| G4 OBS 疊加 | CCFOLIA／Discord 畫面模擬、CSS 產生器、預覽 | status-bar、chat-window、message-box、obs-tachie |
| G5 CCFOLIA 資料 | 房間 ZIP、角色 JSON、聊天面板、日誌解析 | character-editor、room-zip、psd-studio、foreground-frame、log-converter、scenario-cards |
| G6 劇本與紀錄 | 富文本與分頁排版、列印／PDF、紀錄資料庫 | scenario-editor、coc-typesetter、session-log、session-report |
| G7 介紹圖與宣傳 | 版型畫布（Konva）、3D（three.js） | pair-maker、character-select、magic-circle、acrylic-goods |
| G8 影像與動圖 | 影片解碼、動圖編碼、程序生成 | video-anim、gif-combiner、music-frame |
| G9 CoC 跑團輔助 | CoC 規則（骰子算式、成功等級、DB／體格、衍生值） | coc-dice、coc-npc、coc-sheet（由 trpg-lab 拆出） |
| G10 地圖與網格 | 格子幾何（方格／六角格、座標、距離）、地圖畫布（Fabric） | map-editor、grid-maker、range-ruler（由 trpg-lab 拆出）、battlemap（從 G8 移來） |

G9 的決定（2026-10-08，使用者裁定）：trpg-lab 拆成 6 個工具（擲骰＋傷害計算合成 coc-dice、方格＋六角格合成 grid-maker、兩個量尺合成 range-ruler）、
實驗室首頁與共用頁首捨棄（舊網址轉址）；anime-rig 維持獨立工具、放 G3；地圖編輯器用 Fabric（從 npm 打包，舊地圖可以搬過來）；
anime-rig 的臉部追蹤用 npm 的 MediaPipe、模型第一次使用時下載；原作的 OBS 連動不移植（說明改寫成綠幕／透明 WebM 的用法）。

## 4. 技術架構

### 4.1 目錄

```
web/                        新框架（Vite 專案，有自己的 package.json）
  src/ui/                   設計 token 與共用元件（見 DESIGN.md）
  src/core/                 共用模組：storage、files、fonts、encode、timeline、typeset、image、worker
  src/ccfolia/              CCFOLIA 與 OBS 相關的資料格式與選擇器（CCFOLIA 改版只改這裡）
  src/tools/<id>/           各工具：頁面、範本、文字（strings.ts）
  src/tools/<id>/index.html 每個工具一頁（多頁輸出）
  src/index.html、src/home/ 首頁（建置到網站根目錄的 index.html；卡片從 registry 產生）
  tests/                    Vitest 單元測試、Playwright 端對端與視覺回歸
  dist/                     建置產物＝整個網站（不提交；CI 推到 gh-pages 分支）
docs/refactor/              本計畫、流程、設計、各工具規格
tools/<id>/                 還沒重寫的舊版工具（照原樣複製進網站）；重寫上線時刪除
.github/workflows/          CI：檢查、建置、部署到 gh-pages

網站（gh-pages 分支、web/dist/）：
index.html                  首頁
tools/<id>/                 對外網址：已上線的工具（新框架）與還沒重寫的舊版工具
next/<id>/                  重寫中的工具（不連到首頁，只供對等驗證）
assets/build/               共用程式與樣式、THIRD_PARTY_NOTICES.md
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

- `web/` 建置成多頁輸出，`web/dist/` 就是整個網站：首頁 `index.html`、上線的工具在 `tools/<id>/`、重寫中的在 `next/<id>/`、
  共用的程式與樣式在 `assets/build/`，還沒重寫的舊版工具從 repo 照原樣複製進去。
- **建置產物不提交進 repo**（2026-10 起）：GitHub Actions 在 main 有新 commit 時檢查、建置，把 `web/dist/` 強制推到
  `gh-pages` 分支（orphan，只留最新一次部署）；GitHub Pages 從 `gh-pages` 的根目錄發布。
- 工具清單與上線狀態集中在 `web/src/registry.ts`，建置設定與首頁卡片都從這裡讀。

## 5. 遷移階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| P0 地基 | `web/` 專案、設計 token、元件庫、core 模組、元件展示頁、測試與建置流程 | 元件展示頁可用；`npm run build`、`npm test` 通過 |
| P1 試點 | battlemap、textbox、apng-wipe、portrait-size（小工具，涵蓋畫布、文字、APNG、批次圖片）；text-fx 移入新框架 | 五個工具對等驗證通過並上線；元件與流程依試點經驗修正 |
| P2～P9 | 依群組 G4 → G3 → G1 → G2 → G5 → G6 → G8 → G7 → G9 逐組重寫 | 每個工具對等驗證通過才上線 |
| P10 收尾 | 首頁移入新框架（只有繁中）、移除 `assets/i18n.js` 與所有字典、`vendor/`、舊測試；ATTRIBUTION 改成「靈感來源」清單 | 全站只剩新框架的程式；所有測試通過 |

P10 進度：✅ 首頁移入新框架（`web/src/index.html`＋`web/src/home/`；舊的 `assets/home.*`、`assets/i18n.home.js` 已刪除）；
⬜ `assets/i18n.js` 與其餘字典、舊測試（等 G9 的舊版 trpg-lab 換掉後一起刪；anime-rig 已換成新版）；⬜ ATTRIBUTION 改成「靈感來源」清單。

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
| bg-remover | ✅ | ✅ | ✅ | ✅ |
| text-fx | —（無塵室開發，直接移植） | ✅ | ✅ | ✅ |
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
| music-frame | ✅ | ✅ | ✅ | ✅ |
| pair-maker | ✅ | ✅ | ✅ | ✅ |
| character-select | ✅ | ✅ | ✅ | ✅ |
| magic-circle | ✅ | ✅ | ✅ | ✅ |
| acrylic-goods | ✅ | ✅ | ✅ | ✅ |
| coc-dice（trpg-lab） | ✅ | ✅ | ✅ | ✅ |
| coc-npc（trpg-lab） | ✅ | ✅ | ✅ | ✅ |
| coc-sheet（trpg-lab） | 🔨 | 🔨 | ⬜ | ⬜ |
| grid-maker（trpg-lab） | ✅ | ✅ | ✅ | ✅ |
| range-ruler（trpg-lab） | ✅ | ✅ | ✅ | ✅ |
| map-editor（trpg-lab） | ✅ | ✅ | 🔍 | ⬜ |
| anime-rig | ✅ | ✅ | ✅ | ✅ |

（每個群組開始時把該組工具逐列展開到這張表。共用層：G4 ✅、G3 ✅、G1 ✅、G2 ✅、G5 ✅、G6 ✅、G8 ✅、G7 ✅（版型畫布、3D）。）

### 6.1 P11 新工具引入與上游跟進（2026-10-09 使用者選定）

上游檢查（2026-10-09）：31 個收錄過的上游裡 24 個沒有新 commit；shiki365 的五個工具只有英、韓文介面與說明（功能新版已有）；
zznaptime/1007mv 已經不公開（music-frame 不受影響）；JIZURA 只連到原站。新工具照 [PROCESS.md](PROCESS.md) 第 6 節引入；
未授權的原作只參考功能與做法，程式、文字、素材自己做。

| 工具 id | 名稱 | 靈感來源 | 原授權 | 群組 | 規格 | 實作 | 對等驗證 | 上線 |
|---|---|---|---|---|---|---|---|---|
| ai-fail | AI 誤判梗圖產生器 | swoonqx/ai-fails-meme-maker | 未授權 | G7 | ⬜ | ⬜ | ⬜ | ⬜ |
| scenario-text | 劇本文字產生器（CCFOLIA シナリオテキスト） | shiki365/scenario-text-maker | MIT | G5 | ⬜ | ⬜ | ⬜ | ⬜ |
| floor-plan | 室內平面圖產生器 | くま。／TRPG室内図メーカー | 未授權 | G10 | ⬜ | ⬜ | ⬜ | ⬜ |
| house-rules | CoC 房規表產生器 | くま。／CoCハウスルール表メーカー | 未授權 | G9 | ⬜ | ⬜ | ⬜ | ⬜ |
| speech-bubble | 動態對話泡泡產生器 | sotsotssi/TextBubbleMaker-preview | 未授權 | G1 | ⬜ | ⬜ | ⬜ | ⬜ |
| rank-chart | 排行榜產生器 | sotsotssi/would-you-rank | MIT | G7 | ⬜ | ⬜ | ⬜ | ⬜ |
| char-chart | 角色分析圖產生器（性格四象限＋CP 表） | sotsotssi/char-quadrant、visual-coupling-map | 未授權 | G7 | ⬜ | ⬜ | ⬜ | ⬜ |
| review-grid | 劇本心得九宮格 | sotsotssi/scenario-review | 未授權 | G6 | ⬜ | ⬜ | ⬜ | ⬜ |
| polaroid | 拍立得相框產生器 | swoonqx/sw-polaroid | 未授權 | G7 | ⬜ | ⬜ | ⬜ | ⬜ |
| crossword | 填字遊戲產生器 | sotsotssi/text2crossword | MIT | G6 | ⬜ | ⬜ | ⬜ | ⬜ |
| scratch-card | 刮刮卡產生器 | sotsotssi/Scratchcard | 未授權 | G6 | ⬜ | ⬜ | ⬜ | ⬜ |
| discord-color | Discord 彩色文字產生器 | rebane2001（gist：discord-colored-text-generator） | 公有領域（Unlicense） | G1 | ⬜ | ⬜ | ⬜ | ⬜ |

上游更新的跟進（已上線的工具加功能，照一般的規格修訂與驗證）：

| 工具 | 內容 | 來源 | 狀態 |
|---|---|---|---|
| text-fx | 自訂範本（存、讀、用檔案分享）、批次匯出、理智檢定（SAN）範本 | くま。／文字画像APNGメーカー v1.05～1.12 | ⬜ |
| pair-maker | 背景改成單色或圖片（可模糊）、段落標題可以改 | baegop157902/PairMaker 2026-10-01 | ⬜ |
| log-converter | 新增匯出 EPUB 電子書 | sotsotssi/CcfoliaLogConverter（未授權） | ⬜ |
| session-log、session-report | 跑團紀錄簿的 SKP 角色；團報產生器用括號包住選取的文字、裝飾面板分頁 | くま。 session-log-tool v1.100、session-report-generator v1.73～1.76 | ⬜ |

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
