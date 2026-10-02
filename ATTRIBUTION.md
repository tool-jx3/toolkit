# 來源與授權

本 repo 收錄 [sotsotssi](https://github.com/sotsotssi)、
[shiki365](https://github.com/shiki365)、
[Taku_Taku_Taku](https://github.com/Taku-Taku-Taku) 與
[kimtaehee2018-maker](https://github.com/kimtaehee2018-maker) 與
[巡涯学派](https://github.com/organon-torah) 與
[Wool&Wag](https://github.com/woolwag3338) 與
[johnko00](https://github.com/johnko00) 與
[baegop157902](https://github.com/baegop157902) 與
[違法建築](https://github.com/ihoukentiku) 與
[hakoniwa](https://github.com/852wa) 與
[max-enterme](https://github.com/max-enterme) 與
[sedn14636361](https://github.com/sedn14636361) 與
[くま。](https://github.com/kumachansteps) 與
[Eon-00](https://github.com/Eon-00) 與
[fyam-hamu](https://github.com/fyam-hamu) 與
[usagineko7865-debug](https://github.com/usagineko7865-debug) 製作的網頁工具，以及一個作者不明的工具，並為其加上繁體中文介面。所有收錄工具的原始著作權屬各自的原作者所有。

另有一部分工具已依 [docs/refactor/](docs/refactor/PLAN.md) 的流程**由本站重寫**：用本站自己的框架與元件重新實作，介面上不放作者標示，只保留「靈感來源」連結，見下方「[本站重寫的工具（靈感來源）](#本站重寫的工具靈感來源)」。

收錄方式為快照式：自下列 commit 取得程式碼，不與上游自動同步。

| 工具 | 原始 repo | 來源 commit | 授權 |
|---|---|---|---|
| magic-circle | [sotsotssi/magic-circle-maker](https://github.com/sotsotssi/magic-circle-maker) | `de40a68` | MIT |
| foreground-frame | [shiki365/foreground-frame-maker](https://github.com/shiki365/foreground-frame-maker) | `586b273` | MIT |
| character-select | [sotsotssi/select-your-chara](https://github.com/sotsotssi/select-your-chara) | `883f48b` | **未授權** |
| room-zip | [johnko00/ccfolia-room-zip-maker-demo](https://github.com/johnko00/ccfolia-room-zip-maker-demo) | `a9a522c` | **未授權** |
| pair-maker | [baegop157902/PairMaker](https://github.com/baegop157902/PairMaker) | `9c29866`（2026-09-30 自 `aad63b1` 跟進 v1.1.0） | **未授權** |
| acrylic-goods | [sotsotssi/acrylic-goods](https://github.com/sotsotssi/acrylic-goods) | `8b1b1e2` | MIT |
| video-anim | [sotsotssi/video-to-pic](https://github.com/sotsotssi/video-to-pic) | `9fe67a6` | MIT |
| gif-combiner | [sotsotssi/GIF-Combiner](https://github.com/sotsotssi/GIF-Combiner) | `3aa7de8` | MIT |
| trpg-lab | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io) | `d39f79e` | MIT（程式碼；作者保留權利的素材不收，見下） |
| jizura | [852wa/JIZURA](https://github.com/852wa/JIZURA) | —（連到原站；2026-09-25～30 曾收錄 `1b48bea` 的副本） | MIT |
| anime-rig | [852wa/Anime2.5DRig](https://github.com/852wa/Anime2.5DRig) | `7ddbd99` | MIT（程式碼；範例 PSD 不收，見下） |
| coc-typesetter | [scenario-tool-jade.vercel.app](https://scenario-tool-jade.vercel.app/coc-typesetter.html)（作者不明，沒有公開的 repo） | 2026-09-26 取得 | **未授權** |
| scenario-editor | [sedn14636361/trpg-scenario-editor](https://github.com/sedn14636361/trpg-scenario-editor) | `a6387e0` | CC0 1.0 |
| session-log | [kumachansteps/trpg-web-tools](https://github.com/kumachansteps/trpg-web-tools) `tools/session-log-tool/` | `42c45f3` | **未授權** |
| session-report | [kumachansteps/trpg-web-tools](https://github.com/kumachansteps/trpg-web-tools) `tools/session-report-generator/` | `42c45f3` | **未授權** |
| scenario-cards | [kumachansteps/trpg-web-tools](https://github.com/kumachansteps/trpg-web-tools) `tools/scenario-snippet-builder/` | `42c45f3` | **未授權** |
| log-converter | [Eon-00/eon-ccfolia-log-converter](https://github.com/Eon-00/eon-ccfolia-log-converter) | `bb32ed7` | MIT |
| psd-studio | [fyam-hamu/F_Ccfolia-PSD-Studio](https://github.com/fyam-hamu/F_Ccfolia-PSD-Studio) | `718bb40` | 作者條款（見下） |

收錄副本的 MIT 工具與 CC0 的 `scenario-editor`，原始 `LICENSE` 檔都保留於各自目錄中（`jizura` 不再收錄副本，見下）。

shiki365 的 `foreground-frame` 與 `room-zip` 原文為日文，
收錄時另有以下調整：

- `foreground-frame` 的 `<style>` 區塊抽出為 `styles.css`。
- 這些工具都移除了指向原作者站台的 OG／Twitter meta 與
  `<meta name="description">`——那是原部署的站台識別，其餘工具也都沒有。
  `<title>` 只留工具名，捨去 SEO 後綴。
- shiki365 的工具頁尾都有回作者工具站的連結，以及後來加上的「支持開發（BOOTH）」，都原樣保留並翻譯；但頁首那條
  同樣指向工具站的連結不收——那個位置放的是合輯的首頁連結。
- 上游後來替這些工具加了 `favicon.svg`，收錄版不收：合輯裡的工具頁沿用瀏覽器預設的
  分頁圖示，不各自掛作者的站台圖示。

## foreground-frame 的 pcfonts.v1.js

`foreground-frame` 的字型欄可以改填「以名稱指定」，
使用觀看者電腦上已安裝的字型；Chrome／Edge 還能用 Local Font Access API
（`queryLocalFonts()`）開出一份附樣張的清單來挑。那個對話框是 `pcfonts.v1.js`，
上游在每個 repo 底下各放一份，收錄版照做。上游 `message-box-maker` 那份的檔頭多列了自己的名字，其他幾份還沒跟上；
內容其餘一字不差，收錄版都用那個新的檔頭。（`status-bar`、`chat-window`、`message-box`、`scene-transition`
已由本站重寫，新版的電腦字型挑選改用本站的共用元件，所以現在只剩 `foreground-frame` 這一份。）對話框是延遲建立的單例，切換語言時整個丟掉重建。

這個功能在 OBS 端有個前提：OBS 是用它自己那台電腦的字型算繪的，所以那台也要裝同一套
字型。上游把這件事寫在說明與產出的 CSS 開頭，收錄版一併翻譯保留。

## room-zip：拆掉上游的 Web DEMO 外層

上游 `johnko00/ccfolia-room-zip-maker-demo` 只有一次提交、兩個檔案：868 KB 的單一
`index.html` 與 48 KB 的 `sample.ccproj`。名字裡的 DEMO 不是功能閹割版：

- `index.html` 開頭的 `window.__CCFOLIA_BUILD__ = { variant: "demo", … }` 只影響
  儲存空間的命名空間。`variant === "demo"` 全檔用在兩處（`scopedStorageKey()` 與
  `favDb()`），作用是把 localStorage 的鍵前綴與 IndexedDB 的資料庫名換掉，
  **沒有任何功能被鎖住**。
- 檔尾 L11578–11839 是一段獨立的 IIFE，開頭寫著
  `/* Web公開用デモ。通常ビルドには同封しない。 */`，並以
  `if (BUILD.variant !== "demo") return` 自我關閉。它只加東西：頂端的 DEMO 橫幅、
  開場卡、逐步導覽與「最初に戻す」。
- 但那段的最後一行是無條件執行的 `loadSample()`：每次開啟頁面都會抓
  `sample.ccproj` 呼叫 `loadProject()`，而 `loadProject()` 會整包覆寫
  `state.project` / `settings` / `room` / `images` / `scenes`。也就是說做到一半
  重新整理，全部會被範例房間蓋掉——這才是 DEMO 版不能當工具用的原因。

所以收錄版就是作者自己說的「通常ビルド」：刪掉那段 IIFE，連同 `variant: "demo"`
的設定一起拿掉（`storagePrefix` 與 `samplePath` 上游其實沒用到，`scopedStorageKey()`
是寫死字串的）。除此之外沒有動任何功能。

`sample.ccproj` 照抄保留，但改成製作首頁上的一顆「🎁 載入範例房間」——要看範例才
載入，而且手上已經有東西時會先問一次。範例檔裡的專案名是
「ココフォリアZIPメーカー DEMO」，載入後會改成字典裡的「範例房間」：這份收錄版
已經不是 DEMO 了，留著那個名字只會誤導。範例的素材與場景名維持日文原文不動。

依慣例，`<style>` 與五個 `<script>` 區塊抽成獨立檔案：`styles.css`、
`jszip.min.js`、`upng.js`（兩套第三方函式庫原樣保留，見
[tools/room-zip/THIRD_PARTY_NOTICES.md](tools/room-zip/THIRD_PARTY_NOTICES.md)）、
`apng.v1.js`、`core.v1.js`、`app.v1.js`。檔尾兩塊寫在 `</html>` 之後的
`<style id="v492-room-fixes*">` 也併進 `styles.css`，順序照舊（後面的要壓在前面上）。

### 刻意留著日文的部分

`i18n.room-zip.js` 有 1,400 個 key，但有幾類字串刻意不進字典——它們是資料，不是
介面文字：

- **素材標籤（`ROLES`）的七個值**「前景 / 立ち絵 / パネル / 枠 / 駒アイコン /
  演出 / その他」與舊檔用的「背景」。這些值會寫進 localStorage 的存檔、`.ccproj`
  以及匯出的房間，程式本身也拿它們互相比對；翻掉就等於換了一套檔案格式。
  收錄版加了一個 `roleName()`，只在要顯示給人看的時候才翻。
- **`KPDEF` 的聊天面板預設內容**（`main` / `scene` / `memo`）。那是混著 BCDice
  指令的面板範本（`:ラウンド+1`、`choice 表 裏`、`sCCB<= 【探索者の心理学】`
  之類），使用者拿到之後本來就會自己改；同一份東西裡指令與說明文字交錯，
  逐句拆開翻譯的風險大於效益。同一個物件裡的 `skillLabel` / `dodgeLabel`
  是輸入欄標籤，改成存 key、顯示時才翻。
- **外部搜尋網址與其中的 `{検索ワード}`**。那是 URL 裡的佔位記號，使用者可以在
  工具設定裡自己編輯網址；記號翻掉就接不起來。工具設定裡解說這個記號的那句話，
  也照樣顯示 `検索ワード`，不然講的就不是同一個東西了。網站名稱只有
  「Google 画像」與「ココフォリア素材」有翻，`いらすとや`、`写真AC`、`ぱくたそ`
  是站名本身，維持原文。

`tests/smoke.mjs` 把這幾類列成清單逐一檢查，避免哪天被順手「翻乾淨」。

### 切換語言時才看得出來的三個坑

這個工具幾乎整個畫面都是 `render()` 重畫出來的，所以語言切換只要重畫一次就好。
但有六個常數是在 IIFE 最外層就算好的，裡面含 `T()`，於是整份凍在第一次載入的
語言：`MENU_GROUPS`（左側選單）、`KEY_GROUPS`（快速鍵一覽）、`FSIZES`（盤面尺寸
預設）、`IMAGE_MAKER_FONT_PRESETS`（字型分類）、`EXSITES`（搜尋網站）與 `KPDEF`。
收錄版把前五個改成函式、`KPDEF` 的兩個標籤改成存 key。`EXSITES` 只影響第一次
的預設值——它會寫進工具設定並由使用者自行編輯，之後就不再跟著語言走，這與
專案名稱一樣，屬於使用者資料。

另外兩件事同理：專案的預設名稱（「我的房間」）會隨建立時的語言存下來，之後切換
語言不會改；判斷「使用者還沒自己取過名字」時，三種語言的預設名都要算進去，
見 `isUntouchedProjectName()`。

## pair-maker：不收作品集樣張，卡片圖改由工具自己算繪

上游 `baegop157902/PairMaker` 是一個 Konva 畫布編輯器。五種版型（簡易雙人整理、
baegop 雙人整理 1、圖樣橫幅、多人資料框、置頂推文產生器）各自是一支 ES module，
`index.html` 是版型選單，`editor.html?id=<版型>` 才是編輯畫面——這是合輯裡第一個
有兩頁的工具。

`images/` 底下 33 張圖，工具本身只用到 4 張（`2p-pair1` 的日夜底圖與 `main-tweet`
的兩張主題底圖，共 512 KB）。其餘 29 張、約 36.5 MB 是首頁卡片用的作品集樣張，
內容是已經完成的介紹圖，也就是別人的角色插圖；那些不是上游作者的創作，收錄版不
散布。`favicon/` 與指向原站的 OG／Twitter meta 同樣不收（後者的處理與其餘工具一致）。

卡片圖改成由工具自己算繪：逐一開啟五個版型的空白編輯畫面，把畫布匯出成 PNG
（共 244 KB，收在 `previews/`）。畫面上看到的就是這個工具的實際輸出，不含任何
第三方素材。首頁的版型清單原本是 jQuery ＋ justifiedGallery 排成等高的瀑布流；
卡片圖既然換成尺寸整齊的預覽圖，改用 CSS grid 就夠了，兩個函式庫一併不載入
（上游的手機版本來就不走 justifiedGallery）。

另外移除兩項與本站無關的東西：

- 兩頁頁尾的 Cloudflare Web Analytics beacon（`static.cloudflareinsights.com`，
  帶著上游站台的 token）。合輯不替原站收集存取資料。
- 「버그&문의」對話框裡嵌的 Google 表單 iframe。那張表單收到的會是這份收錄版的
  問題，送達的卻是原作者的信箱。改成一段說明：只有這個版本才會發生的問題請開在
  本 repo 的 issues，工具本身的意見請找原作者。原作者的署名「배고픔」三種語言都
  照原樣顯示——那是名字，不是介面文字；`tests/smoke.mjs` 把它列為唯一放行的諺文。

`vendor/` 底下六套函式庫與 Pretendard 原樣保留（與上游一位元組不差），出處與授權
見 [tools/pair-maker/THIRD_PARTY_NOTICES.md](tools/pair-maker/THIRD_PARTY_NOTICES.md)。
字型清單依慣例補上五套繁體中文字型（見下節）——上游的清單只有韓／英／日字型，
中文會掉回系統預設。

### 兩頁共用一份字典，側邊欄的版型名稱要照 key 翻

`editor.html` 的側邊欄要列出「其他版型」，上游的做法是 `fetch("index.html")` 把
首頁抓回來，再從標記裡讀卡片的圖、標題與標籤。收錄版首頁的內嵌文字是繁體中文，
照著讀就等於把繁中硬寫進編輯器；因此改讀同一個元素上的 `data-i18n`，拿 key 去翻
（`translated()`）。切語言時整份清單重建，重建前先 `list.replaceChildren()`，
否則每切一次就多長一份。

編輯器本體（分頁名稱、欄位標籤、畫布上的預設文字）是版型在建立當下算好的，不會
自己跟著語言走；切語言時改用 store 的 `'structure'` 事件整個重跑一次——那條路徑
本來就是給「版型結構變了」用的。重跑前後會把 `dirty` 還原，免得只是換個語言就被
當成有未儲存的變更。

還有三個只在瀏覽器裡才看得出來的坑：

- 編輯頁的 `<title>` 要等 `index.html` 抓回來才知道是哪個版型，而 i18n 引擎會在
  DOMContentLoaded 把 `document.title` 換成 `app.title`——兩者會賽跑，`fetch` 早
  一步完成時標題就被蓋掉。收錄版把標題記在模組變數裡，另外註冊一個
  DOMContentLoaded 監聽器（註冊得比引擎晚，就一定跑在它後面）補設一次。
- 兩個收合鈕的 `aria-label` 跟著收合狀態走，因此不掛 `data-i18n-aria-label`——
  那個掛勾會在切語言時一律寫回標記裡那一種狀態的字。改成依現況重算
  （`syncToggleLabels()`），開頭與切語言時各跑一次。
- 首頁五張卡片圖的 `alt` 也要跟著語言走，所以共用引擎補了一個 `data-i18n-alt`
  掛勾，與既有的 `-title`／`-aria-label`／`-placeholder` 同一套寫法。
- 平板與手機上，上游把整塊左側邊欄 `display:none`——語言切換器就在那塊裡面，
  藏起來就沒得切了。收錄版在 1024px 以下把那塊縮成右上角的語言選單，其餘子元素
  照樣不顯示（回首頁的連結讓位給標題，退回 `index.html` 就看得到）。

### 版型模組的常數會凍在載入當下的語言

ES module 只求值一次，所以版型模組最外層寫成值的常數——署名（`author`）、欄位
分組（`groups`）、分頁（`tabs`）、字型標籤（`fontLabels`）——會把第一次載入時的
語言凍進去，切語言時 `'structure'` 事件重跑的是函式，不會重新求值它們。收錄版
一律改成函式：消費端（`state.js`、`FormScript.js`、`registry.js`）本來就同時吃
陣列與函式，所以除了署名與字型標籤要在取用處多一個 `typeof` 判斷之外，沒有動到
別的地方。`tests/smoke.mjs` 會擋下新冒出來的同類常數。

同理，只建立一次、之後只切 `hidden` 的控制項（貼紙的出處欄與圖層鈕、手機的鍵盤
列、多人資料框畫布上的那組按鈕）不會經過任何重畫的路徑，標籤集中成一個函式並
掛在 `I18N.onChange` 上重套。

有一類字刻意不跟著語言走：版型 `initialState()` 給的預設內容（「名字」「在這裡
寫說明。」「#關鍵字」之類畫在圖上的字）。那是使用者的作品內容，不是介面文字——
一載入就寫進存檔並自動存進 IndexedDB，切個語言就覆寫使用者可能已經改過的字，
比留著原語言糟得多。這與 `room-zip` 的專案預設名稱是同一個判斷。

### v1.1.0：四種文字記錄版型與 PDF 匯出（2026-09-30 跟進 `9c29866`）

上游 v1.1.0 加了四種「文字記錄（글로그）」版型（基本型、橫向裝飾、直向裝飾、配對型），
長文會自動分頁，還能匯出可選取文字的 PDF。版型從五種變成九種，四支新模組照上面的
原則改寫（最外層常數寫成函式、畫布上只建立一次的控制項掛在 `I18N.onChange`）。
新版型的卡片圖同樣由工具自己算繪（`previews/textLog-*.png`）；上游的四張樣張
（`images/textLog-*.png`）裡有別人的 Q 版角色貼紙與照片背景，不收，
`images/2p-pair2-preview.png` 沒有任何程式用到，也不收。

上游為這組版型附了約 48 MB 的字型，收錄版**都不收**：

- 畫布用的明體 `vendor/textlog/NotoSerifCJKKR.ttf`（24 MB）改由 Google Fonts 載入
  Noto Serif KR，字型堆疊後面接 Noto Serif TC——韓文版的 Noto Serif 沒有收的漢字
  （例如「它」「值」「填」）才不會變成豆腐字。Google Fonts 以 `unicode-range` 分片載入，
  所以分頁前先等文件用到的字所在的分片載入完，載入後再主動重畫一次
  （實測 `loadingdone` 事件不一定每次都會發出）。
- PDF 用的 `vendor/pdf/*.ttf.zlib`（約 25 MB）改成按下「PDF 下載」時才從
  fonts.gstatic.com 抓完整的 TTF（網址表在 `js/SaveBtn.js` 的 `PDF_FONTS`）。
  Google Fonts 的舊版 CSS API 若只要一個子集，給的是切過的字型：`subset=korean` 的
  Noto Serif KR 一個漢字也沒有，`subset=chinese-traditional` 的 Noto Serif TC 只有
  6,317 個漢字；同時列出兩個以上的子集，給的才是沒切過的完整字型（Noto Serif KR
  的字集與上游附的一模一樣，Noto Serif TC 涵蓋 Big5 常用與次常用字）。
  明體依序找 Noto Serif KR → Noto Serif TC → 黑體，黑體依序找 Noto Sans KR →
  Noto Sans TC → 明體，每個字用第一套收有它的字型，只有真的用到的字型才嵌入。
  上游的黑體 PDF 字型（由 Pretendard 衍生，沒有漢字）換成 Noto Sans KR。
  整套嵌入（`subset: false`，避開 fontkit 的 CJK 子集化錯誤）、逐字對齊與
  「背景圖 → 文字 → 貼紙」三層的做法都與上游相同。代價是匯出 PDF 時要連得到
  fonts.gstatic.com；上游只要網站載入過一次就能離線匯出。
- `pdf-lib` 1.17.1 與 `@pdf-lib/fontkit` 1.1.1（MIT）照收，與上游一位元組不差。

另外修了上游一個文字重疊的錯誤：Konva 在字距不為 0 時是逐字繪製的，上游卻用整段
字串量出的寬度推進下一段文字，遇到會擠壓相鄰標點的字型時，粗體等格式交界處的下一段
會疊上來，PDF 也跟著錯位。收錄版改用逐字量出的寬度推進；韓文預設內容的畫面與上游
逐像素相同。

## sotsotssi 的角色美術周邊工具

`acrylic-goods`、`video-anim`、`gif-combiner` 是一批同時收錄的
MIT 小工具，路數與合輯其餘工具相同（角色美術周邊），也都是純靜態頁面（同批的 `color-palette`
已由本站重寫，見下方「本站重寫的工具」）：

| 目錄 | 上游名稱 | 做什麼 |
|---|---|---|
| `acrylic-goods` | `acrylic-goods`（사이버 아크릴 굿즈 공방） | 3D 壓克力立牌／搖搖樂／立體透視。搖搖樂裡的零件走 cannon.js 物理，手機上可用陀螺儀傾倒 |
| `video-anim` | `video-to-pic`（동영상→이미지 변환기） | 影片選段轉無損 APNG／Animated WebP／256 色 GIF |
| `gif-combiner` | `GIF-Combiner`（GIF 이어붙이기 툴） | 多張 GIF 對齊時間軸後合成一張 |

`acrylic-goods` 同作者另有一個 `acrylic-stand`，功能是 `acrylic-goods` 的子集
（只有立牌），因此只收後者。

依慣例，寫在 `index.html` 裡的 `<style>` 與 `<script>` 區塊抽成 `styles.css` 與
`app.js`；`acrylic-goods` 上游本來就分開，只是把 `style.css`／`script.js` 改名對齊
其餘工具。`video-anim` 的 `tailwind.config` 留在 `<head>` 內嵌——那是給 Play CDN
讀的設定，不是程式。指向原作者 X 帳號的 `@bb_uu_t` 連結照 sotsotssi 其餘工具的
做法保留，標題改用 `data-i18n-node` 只換文字、留著連結。

### 函式庫照上游走 CDN，沒有改成同捆

這幾個工具的外部相依（Tailwind Play CDN、three.js、cannon.js、gif.js、gifuct-js、
gifshot、pako、upng-js、Font Awesome）全部照上游原樣以 CDN 載入，本 repo 不散布
它們的檔案；各工具目錄下的 `THIRD_PARTY_NOTICES.md` 列出版本、來源與授權。
合輯本來就是這個做法，README 也已寫明「部分工具會從 CDN 載入函式庫與字型」。

`acrylic-goods` 另外自帶一個「開源授權」對話框，把同一份清單顯示給使用者看，
那是上游就有的，收錄版只把兩句說明譯成繁中。

### 刻意保留的一處署名

`acrylic-goods` 會在 3D 畫面右下角燒一行浮水印進輸出的圖片。那是原作者在自己
工具的成品上署名，照樣保留；工具名跟著介面語言走，`@bb_uu_t` 不動，因此它是
字典裡的 `watermark`（繁中「壓克力周邊工房 @bb_uu_t」／韓文原文）。切語言時
`updateBackground()` 會重畫這張貼圖。

### 切語言時要重跑的幾處

這幾個工具的固定文字都走 `data-i18n`，但各有一些是程式寫進去的，切語言時得自己
重寫；每個工具的 `I18N.onChange` 就是在做這件事：

- `gif-combiner`：產生鈕的字（合成途中會被進度覆寫，所以只在閒置時重寫）與整份
  檔案清單。
- `video-anim`：裁切狀態、無損模式說明、影片資訊，以及結果卡上那四行——結果卡
  的數字另外記在 `state.lastResult` 裡，才有辦法用新語言重排。
- `acrylic-goods`：兩份動態清單（搖搖樂零件、立體透視圖層）與畫布上的浮水印。
  3D 場景本身不含文字，不用重建。

已經彈出去的 toast 不重寫——那是過去事件的訊息，回頭改寫它的語言只會讓人困惑。

## trpg-lab：違法建築的 TRPG 實驗室

上游 `ihoukentiku/ihoukentiku.github.io` 是一整個網站（違法建築のTRPGラボ），首頁
（hub）列出九個工具，收錄版照原樣收成一個多頁的工具，首頁卡片只佔一張：

| 頁面 | 上游名稱 | 做什麼 |
|---|---|---|
| `index.html` | トップページ | 工具卡片、更新資訊、使用說明 |
| `coc7_dice.html` | CoC7 ダイスツール | 新克蘇魯神話 TRPG 的技能檢定、自訂擲骰與擲骰紀錄 |
| `coc7_Investigator_sheet.html` | CoC7 探索者シート | 可列印、存在瀏覽器裡的調查員角色卡 |
| `coc_npc_token.html` | CoC NPC作成/管理ツール | CoC 7／6 版 NPC 的清單管理、擲屬性與 CCFOLIA 輸出 |
| `trpg_map_maker/` | TRPGマップエディタ | 地圖清單（`map_list.html`）與編輯器（`map_editor.html`） |
| `grid_maker.html`／`hex_maker.html` | グリッド作成／ヘクス作成 | 方格與六角格的網格圖片 |
| `grid_ruler.html`／`hex_ruler.html` | グリッド定規作成／ヘクス定規作成 | 依距離分色的量尺圖片 |
| `damage_sum.html` | BCDice ダメージ計算 | 從 BCDice 的傷害擲骰紀錄算出扣掉護甲後的總傷害 |
| `third-party-licenses.html` | サードパーティライセンス | 函式庫、字型與裝飾圖章的授權說明 |

上游 repo 裡另有一個 `grid_paint.html`，站上沒有任何連結指向它（功能已由地圖編輯器
取代），不收。

### 作者保留權利的素材不收

程式碼是 MIT（repo 的 `LICENSE` 與站上的授權頁都這麼寫），但授權頁另外聲明：網站
管理者自製的素材（間取り図 SVG、AI 生成的貼圖、各工具的設計等）權利歸作者，商業
使用與再散布請先聯絡。收錄版因此只收程式碼與可再散布的第三方圖示，下列檔案不收：

- 地圖編輯器內建的 14 張地面／牆壁貼圖（`trpg_map_maker/patterns/`，AI 生成）。
  `PATTERNS` 清成空陣列；使用者自己上傳的貼圖照常可用，存檔裡引用了內建貼圖的，
  讀進來時由上游本來就有的 `normalizePatternState()` 退回單色。
- 15 個格局圖（間取り図）用的 SVG：授權頁點名的 `fp-*` 四個，以及授權頁沒有列出
  來源、同屬「floorplan」分類的床、桌椅、廁所、廚房、窗戶、直梯十一個——它們是作者
  自己畫的（檔案裡的註解寫著「fp-door と同サイズの枠」這類製作筆記）。裝飾圖章的
  登錄表一併拿掉這些項目。
- 擲骰工具的音效 `dice_sound.wav`：出自ニコニ・コモンズ，素材本身不得再散布。音效的
  開關與說明一併拿掉。
- 網站 Logo、OGP 圖片、`favicon.ico`，以及 Google Search Console 的驗證檔。

留下的 56 個裝飾圖章（game-icons.net 的 16 個、openstreetmap/map-icons 的 40 個
`jp-*`）的出處見 `tools/trpg-lab/THIRD_PARTY_NOTICES.md`。

「各工具的設計」這句跟 MIT 有點打架：設計就寫在以 MIT 釋出的 HTML／CSS 裡。收錄版
的判斷是程式碼照 MIT 收，作者點名的素材檔一律不收；若作者另有意見，以作者為準。

因為少了音效與內建貼圖，首頁卡片的說明（擲骰工具的「効果音に対応」、地圖編輯器的
「テクスチャパターン」）兩種語言都改成不再宣稱這兩項，第三方授權頁也拿掉了貼圖、
音源與存取分析三段。

### 存取分析、路徑與頁首

- 上游每頁都載入 `analytics.js`（只在 `ihoukentiku.github.io` 上啟用 gtag），收錄版
  拿掉；只在說明分析的隱私權政策頁也不收，頁尾與說明視窗裡指向它的連結一併拿掉。
- 上游的站台就是 repo 根目錄，`common.js` 的連結一律寫 `/`。收錄版改成相對於
  `common.js` 所在的目錄，`trpg_map_maker/` 底下的頁面也找得到同一組連結；地圖編輯器
  指向網格產生器的兩個連結同樣改成相對路徑。
- 各工具頁的版面是「整個視窗減掉頁首高度」，另加一條合輯列會撐出捲軸，所以
  「← TRPG Toolkit」與語言選單放進 lab 自己的頁首。窄螢幕上站名改成兩行、按鈕縮小，
  360px 寬也放得下。`damage_sum.html` 是上游的舊式單頁，沒有共用頁首，自己帶一組。
- `<style>` 與內嵌 `<script>` 依慣例抽成同名的 `.css`／`.js`；OG／Twitter meta 與
  `<meta name="description">` 拿掉，`<title>` 只留工具名。
- 地圖編輯器載入 Pickr 時沒寫版本，其餘頁面都用 1.9.1，收錄版把它也釘在 1.9.1。
- 函式庫照上游以 CDN 載入，版本與授權見 `THIRD_PARTY_NOTICES.md`。
- 頁首的 X 連結與首頁的意見表單照舊指向原作者；表單是日文的，繁中說明裡註明了這點。

### 字典與註解

每頁一份字典（`i18n.<頁面>.js`），頁首、頁尾、說明視窗底下的授權連結與數字欄的
加減按鈕這些共用字串放在 `i18n.trpg-lab.js`。共用頁首是 `common.js` 用 innerHTML
組出來的，文字先用 `T()` 填好、同時掛上 `data-i18n`，切換語言時交給共用引擎重套，
不必整個重建（重建會把語言選單換掉）。

上游註解維持日文（`map_editor.js` 一檔就有上千行），理由與 `room-zip`
相同，規則也相同：`tests/smoke.mjs` 把註解抹掉之後再掃，程式碼與標記裡不准有假名。

介面是繁中時，各頁字型改用 Noto Sans TC（`common.css` 依 `<html lang>` 切換，每頁的
Google Fonts 連結一併載入）；Noto Sans JP 雖然有漢字，字形是日文的寫法。日文介面維持
上游的字型。

### 各頁的取捨

- **存檔相容**：角色卡把整個 `<main>` 的 innerHTML 存進 localStorage，預設標籤本身
  就是存檔內容，而且多半可以直接改寫。收錄版讓標籤帶著 `data-i18n` 一起存，讀檔後
  依目前語言重套；使用者改寫過的標籤會拿掉掛勾，之後不再被翻譯蓋掉。上游格式的舊存檔
  沒有掛勾，照存檔時的文字顯示。NPC 工具的存檔鍵與欄位名稱都沒動，舊存檔裡的日文名稱
  照舊顯示；新建 NPC 的預設名稱跟著當下語言。
- **給 CCFOLIA 的輸出**：NPC 工具複製出去的 JSON 與聊天面板，結構與指令語法不動，
  可讀的標籤（體格、移動力、理智檢定、技能名稱）跟著複製當下的語言；參數名稱與聊天
  面板裡 `{體格}` 這類參照用的是同一個 key，不會對不上。HP、MP、SAN、DB、MOV 與
  STR～EDU 維持原樣。BCDice 傷害計算解析的是 BCDice 的實際輸出（全形 `＞`），照舊。
- **擲骰紀錄**：已經寫進紀錄的結果保留當時的語言，新的紀錄用新語言。
- **量尺與網格**：Pickr 取色器的「確定」、距離標籤與編輯視窗的座標列都在切換語言時
  就地重寫，不重建取色器，已選的顏色不會跑掉。日文的「列」是直的、「行」是橫的，
  台灣正好相反，所以「列数（横）／行数（縦）」譯成「欄數（橫）／列數（縱）」。
- **照內容修正的上游小錯**（只改繁中，日文照上游）：六角格頁的說明提到的勾選項名稱
  與畫面上的不一致、座標格式寫「4 種」但列了 5 種、「ここフォリア」的錯字；角色卡右下
  那欄標題與左欄重複寫成「装備と所持品」，繁中依內容譯成「現金與資產」。
- **地圖編輯器**：
  - 內建貼圖拿掉之後，地面與牆壁的貼圖分類只剩「全部」與「自訂」，沒有貼圖的分類不顯示，
    還沒上傳過貼圖時會出現一行提示。舊地圖裡用到內建貼圖的地方，讀檔前先由
    `replaceRemovedPatterns()` 換成上游本來就為每款貼圖準備的備用色
    （`REMOVED_PATTERN_COLORS`，只有 id 與色碼），不去抓不存在的圖檔。
  - 裝飾圖章的「格局圖」分類整個拿掉，空分類一律不顯示；存檔裡選著已移除圖章的，讀進來時清空。
  - 說明裡講到地面貼圖（「草・水・石畳など」）與格局圖家具的句子，兩種語言都改成描述
    收錄版實際有的東西。
  - 文字工具的字型選單最上面加了「繁體中文」一組五套字型，預設字型維持上游的 Noto Sans JP。
    `<optgroup>` 的 label 共用引擎管不到，改掛 `data-label-key` 由程式在切換語言時套。
  - 新增圖層的預設名稱跟著當下語言；已經存在的圖層名稱是使用者的資料，不改。
  - 上游程式把匯出面板裡通往網格／量尺產生器的連結改寫成站台根目錄（`/hex_maker.html`），
    在這個 repo 裡會失效，改成 `../`。
- **兩處上游的小毛病順手修了**：NPC 工具在 1.6 秒內連按兩次「複製」會讓按鈕卡在
  「コピー完了 ✓」（補了 `clearTimeout`）；五個頁面的說明視窗把圖示字型寫成
  `'Material Symbols'`，對不上實際載入的 `Material Symbols Outlined`，圖示會顯示成
  英文單字。

## jizura：JIZURA 字面（連到原站）

上游 `852wa/JIZURA`（hakoniwa）是單檔 HTML 的歌詞動態影片產生器：貼上歌詞、點按拍點，
就自動替每一行排出版面、登場／退場動畫、裝飾與鏡頭，匯出 MP4、綠幕、黑幕或 PNG 序列。

2026-09-25 起合輯曾收錄 `1b48bea` 的副本：照上游產生英文版的方式，建置時以翻譯表把日文字串
換成繁中，產生繁中與日文兩個頁面。同一天，上游整合了社群貢獻的繁體中文版（貢獻者
[Zaious](https://github.com/Zaious)，上游 PR #6），之後也持續跟著新功能更新，另有簡體中文、韓文等版本。

既然原作者已經提供官方繁中版，合輯自 2026-09-30 起不再收錄副本，`vendor/jizura/` 與建置產物一併移除。
`tools/jizura/` 改成一個轉址頁：依合輯共用的語言設定（`trpg-toolkit-locale`）跳到原站的對應版本——
繁中（預設）到 `https://852wa.github.io/JIZURA/zh-hant/`，日文到原站首頁，韓文到 `ko/`；
沒有 JavaScript 時由 `<meta http-equiv="refresh">` 導到繁中版。以前收錄版的日文頁網址
`tools/jizura/ja/` 也留著，會導到原站的日文版。首頁卡片的徽章改成「連到原作者網站的官方繁中版」。

## anime-rig：Anime2.5DRig

上游 `852wa/Anime2.5DRig`（hakoniwa）把分好部件的 PSD 自動綁定成 2.5D 虛擬形象：眨眼、嘴型、
頭髮物理、攝影機臉部追蹤與麥克風嘴型，可匯出透明 PNG 與影片。

### 收了什麼

`index.html`、`lib/` 的程式與樣式、`LICENSE`。下列檔案不收，細節見
`tools/anime-rig/THIRD_PARTY_NOTICES.md`：

- 範例模型 `sample.psd`、`sample2.psd`：上游 README 寫明範例 PSD 的圖畫權利屬於各自的作者。
  頁首與拖放區的「讀取範例 A／B」按鈕一併拿掉；OBS 專用畫面（`?obs=1`）沒有指定模型時，
  上游會載入 `sample.psd`，收錄版改成不載入。
- 閉眼、閉嘴差分的原圖 `eye_close.psd`、`mouth_close.psd`：上游讀不到這兩個檔時本來就會
  改用 `lib/genericparts.js` 內建的差分，收錄版直接用內建的，不去抓不存在的檔案。
- MediaPipe Face Mesh 的同捆檔（`lib/vendor/face_mesh/`，約 11 MB）：改走上游原本就有的
  jsDelivr 備援路徑（同一個鎖定版本），第一次開啟攝影機追蹤時需要連網。
- OBS 連動用的本機中繼伺服器（`obs_server.py`、`start_obs.bat`）、`tests/`、`package.json`、
  `IMPROVEMENTS.md`。

### OBS 連動

上游的 OBS 連動要在自己的電腦上用 Python 跑 `obs_server.py`，由它在編輯畫面與 OBS 的瀏覽器
來源之間轉送 PSD、設定與追蹤數值；網頁版做不到。收錄版的「OBS 連動」區塊改成說明這件事並
連到上游，同步開關與 OBS 用網址只在偵測到中繼伺服器時才顯示（程式照上游保留，把收錄版
放進上游的整套裡仍然能用）。只用網頁版的話，可以用綠幕背景加 OBS 的視窗擷取，或匯出透明
WebM。

### 使用說明

上游的「使い方」視窗直接顯示 `README.md`。收錄版改成依介面語言讀 `guide.zh-TW.md` 或
`guide.ja.md`：日文版以 README 為底，拿掉範例 PSD、本機伺服器與開發測試等收錄版用不到的
段落，並改寫 MediaPipe 與 OBS 的說明；繁中版由日文版翻譯。圖層命名規約表裡的別名
（`前髪`、`白目`、`bangs` 等）是工具實際比對的字，兩種語言都照原樣列出——工具不認得中文
的圖層名稱。

### i18n 的幾處改造

- 上游 `app.js` 用一個叫 `T` 的區域變數存各參數的目標值，會遮蔽合輯 i18n 的全域 `T()`，
  改名為 `TGT`。
- PSD 在 Web Worker 裡解析（`lib/psd-worker.js`），worker 載入不了合輯的 i18n 引擎（它用到
  `window` 與 `document`）。主執行緒把目前語言的字典隨 PSD 一起傳過去，worker 提供一個同樣
  介面的 `T()`，`rigger.js`、`runtime.js` 在兩邊都用同一組 key。
- 自動綁定的警告原本是日文字串，`app.js` 再用正規表示式挑出要顯示在診斷清單裡的幾則；
  改成帶 key 與參數的物件，顯示時才翻譯，切換語言時診斷清單跟著重畫。
- `rigger.js` 裡比對 PSD 圖層名稱的日文別名表（`前髪 まえがみ`、`閉じ目` 等）與
  `のコピー`、`レイヤー 1` 這類 Photoshop 自動命名的處理是解析用的資料，不是介面文字，
  原樣保留；`tests/smoke.mjs` 只放行這幾行。

## coc-typesetter：CoC 劇本排版工具

上游是部署在 Vercel 上的單一頁面「CoCシナリオ組版ツール」：把克蘇魯神話 TRPG 的劇本貼進去，
排成書本般的紙面，印成 PDF 後可以在 BOOTH 等處發佈。頁面上沒有作者署名、沒有授權條款，
也找不到原始碼的 repo（這個環境連不到該網站，檔案是使用者另存後提供的，取得日期 2026-09-26）。
權利屬原作者所有，此處僅供試用，見下方「未授權的工具」。

### 只有繁體中文

和其他工具「繁中＋原文」的雙語不同，這個工具收錄成只有繁體中文，不留日文介面，也沒有語言選單：

- 介面、寫法說明、提示與確認訊息全部改寫成繁中。
- 劇本的標記語法跟著改成中文：換頁是 `===換頁===`（原本是 `===改ページ===`），貼在內文開頭的
  封面資訊用「標題／副標題／作者」（原本是「タイトル／サブタイトル／作者」），理智檢定除了
  `SANc（0/1d3）` 之外也認得「SAN 檢定」「SC」「理智檢定」的寫法。日文的寫法不再支援。
- 預設的框名、封面概要欄位與「/」選單都換成台灣跑團社群的說法：KP 資訊、公開資訊、資料卡、
  規則版本、建議人數、遊玩時間、建議技能、撕卡率等。「/」選單的篩選關鍵字收了中文同義詞、
  英文與拼音；注音輸入法會把 `/` 打成「ㄥ」，說明裡提醒改用英數模式或格式按鈕。
- 版面字型從日文的 Shippori Mincho／Zen Kaku Gothic New 換成 Noto Serif TC／Noto Sans TC。
- 分頁時的避頭尾標點拿掉假名，補上中文直角括號等標點；`*著重號*` 從日文的芝麻點（字的上方）
  改成台灣的圓點（字的下方）。
- 匯出的「列印用 HTML」標成 `zh-Hant-TW`，檔名後綴是「_列印用」。

### 範例劇本另寫

上游附了一篇日文範例劇本。收錄版不用它，另寫了一篇長度相近的原創繁中範例《不存在的四樓》
（台中老公寓的電梯停在不存在的樓層），同樣用到所有格式：注意框、KP 資訊、資料卡、描述、檢定、
理智檢定、NPC 資料表、怪物資料與換頁。這篇範例是本 repo 的新作，與根目錄的 LICENSE 一起以 MIT 釋出。

### 其他改動

- 拿掉 OG meta 與 `<meta name="description">`，頁首加上「← TRPG Toolkit」。
- 上游的單檔 HTML 拆成 `index.html`、`styles.css` 與 `app.js`；紙面的樣式（`#book-css`）留在
  `index.html` 裡，因為「儲存列印用 HTML」會把那一段原樣複製進匯出的檔案。
- 上游會把舊版（`coc-typesetter:v1`）的存檔搬進新版；收錄版的網址底下不會有那種舊存檔，搬移的
  程式拿掉了。存檔的 key 維持 `coc-typesetter:v2`。
- marked 與 DOMPurify 照上游以 CDN 載入，版本與授權見 `tools/coc-typesetter/THIRD_PARTY_NOTICES.md`。

## scenario-editor：劇本排版台（CC0）

上游 `sedn14636361/trpg-scenario-editor`（シナリオ組版台 v3.3.0）以 CC0 1.0 釋出，作者放棄了
著作權，不必署名也能自由改寫；合輯仍照慣例標出出處。它和 `coc-typesetter` 同樣是「寫劇本、
排成書頁」的工具，但走的是另一條路：左邊逐段選書式寫稿、右邊即時排成 A4 紙面，另有表格、
流程圖、NPC 卡、目錄、彈出視窗與作品管理（IndexedDB、過去的版本、垃圾桶），不需要學標記語法。

- 單一 HTML（約 11,000 行）照慣例拆成 `index.html`、`styles.css`、`app.js`；NPC 卡各系統的
  資料表（CoC、Emoklore、DX3rd 的能力值、技能、症候群等）另外搬到 `npc-data.js`。
  註解全部譯成繁體中文。
- 右上角的完整說明、狀態列、對話框都走字典；匯出的閱覽 HTML 與列印時產生的文字
  （巻末的附錄、目錄、按鈕）用匯出當下的語言。紙面的 CSS（`DOC_CSS`）仍是畫面與
  匯出共用的同一份，NPC 卡「超出頁面」的提示改成 CSS 變數，由程式依語言設定。
- 首次開啟時放進去的範例原稿依建立當下的語言給繁中或日文；存檔的 key 與 JSON 格式不變，
  上游存的原稿可以直接讀進繁中版。
- 刻意保留的日文：輸出到 CCFOLIA 棋子的指令與參數名（`正気度ロール`、`アイデア`、`コンボ`、
  `シンドローム` 等，本工具讀回棋子時也靠同一組字串）、讀入角色卡時的表頭別名、貼上原稿時推測
  段落種類的關鍵字，以及 `npc-data.js` 的系統資料。所以繁中介面的 NPC 卡上，能力值與技能名仍是
  日文。`tests/smoke.mjs` 把 `app.js` 的這批字串釘成清單。
- 原稿的標記語法（`｜漢字《ルビ》`、行首記號、`/kajou` `/list` 等斜線指令）與快捷鍵都照上游。
- 這個工具刻意不連網，因此沒有加 Google Fonts，只在紙面的明體後面補上新細明體與
  Noto Serif TC、介面字型補上微軟正黑體、蘋方與 Noto Sans TC（接在日文字型後面，日文顯示不變）。

## くま（TRPG WEBツール観測所）的工具

`session-log`、`session-report`、`scenario-cards` 取自くま。（[@KumachanSteps](https://x.com/KumachanSteps)）的工具站
「TRPG WEBツール観測所」（[kumachansteps/trpg-web-tools](https://github.com/kumachansteps/trpg-web-tools)）。
站上上線與開發中的工具有十幾個，收錄的是不依賴日文角色卡服務、日文聊天面板或作者後端、
台灣玩家也用得上的六個（其中 `icon-maker`、`variant-manager`、`bg-motion` 已由本站重寫，見下方「本站重寫的工具」）。repo 沒有授權條款（見「未授權」一節），站上的利用規約另外明文要求
「画像・アイコン素材の無断転載、再配布、二次利用はお控えください」，因此：

- **上游的圖片一律不收**：站台圖示（部分由るた様繪製）、favicon 都不收。
- 拿掉每頁都掛的 Google Analytics，以及頁首回原站入口的連結（換成合輯列）。
- 頁尾「問題回報請私訊 @KumachanSteps」那句拿掉：合輯版改過程式，回報會送錯對象
  （理由同 `pair-maker` 的回報表單）。作者署名、X 與原站連結保留。
- 上游自己的語言切換（日文／英文）改接合輯的引擎。合輯沒有英文，英文不收。
- `session-log` 與 `session-report` 是一組：紀錄簿的每一團可以直接送到團報產生器，
  連結改指合輯內的 `../session-report/`。紀錄簿要解析使用者匯入的日文試算表、團報與
  CCFOLIA 紀錄，系統名與生還結果也以上游的日文值存檔（兩種語言匯出的 JSON 才能互讀），
  所以 `log_tool.js` 刻意留著一批日文字串，`tests/smoke.mjs` 把清單釘死；另外加認對應的
  繁中寫法（「忍神」「撕卡」「守密人」等），繁中版的範本與匯出文字也能匯回。
- 團報範本依產生當下的語言給繁中或日文用語（通過→通關、ロスト→撕卡、様→樣、作：〇〇様→
  作者：〇〇老師）。
- `scenario-cards` 的上游版面用 CSS 把頁尾藏起來，收錄版讓它顯示，否則整頁看不到作者署名。

## log-converter、psd-studio

**log-converter（CCFOLIA 日誌轉換器）**：上游 `Eon-00/eon-ccfolia-log-converter`（MIT）把 CCFOLIA
匯出的日誌 HTML 轉成小說、時間軸或 CCFOLIA 風格的網頁。上游的「用 Room ID 載入」會直接呼叫
CCFOLIA 的 Firestore，上游 README 也說已經被擋、不能用，收錄版把這個入口與相關程式整段拿掉，
其餘功能不變。產出 HTML 裡的固定字樣（「系統」、閒聊訊息的摺疊標題、插圖的 alt、預設標題、
`<html lang>`）依轉換當下的語言；使用者的日誌內容原樣不動。解析規則另外加認別名：自動選閒聊分頁時
除了韓文的「잡담」，也認「閒聊」「雜談」與日文介面 CCFOLIA 的「雑談」；「全部分頁」檔案的標籤也認
「全部」「所有」。另外修了時間軸的名字欄寬：上游只把諺文算成全形，中文或日文的長名字會蓋到頭像與
台詞；純韓文日誌的產出不變。作者的品牌名「연연」（配色預設與頁尾）照原樣保留。


**psd-studio（CCFOLIA & 圖片調色工作室）**：上游 `fyam-hamu/F_Ccfolia-PSD-Studio` 沒有 LICENSE 檔，
但頁面上有作者的條款：「코드 자체의 무단 재판매 및 유료 배포는 금지합니다. 단, 개인 목적의 코드 수정,
기능 개선 및 이를 바탕으로 한 재배포는 자유롭게 가능합니다.」（禁止轉售與收費散布；修改、改良後可以
自由再散布）。合輯依這條免費收錄，條款原文、翻譯與改動清單收在
[tools/psd-studio/TERMS.md](tools/psd-studio/TERMS.md)，頁面上也照樣顯示。
收錄時拿掉 Firebase Realtime DB 的「按讚」鈕（連同寫死的 apiKey）與只放了作者愛犬照片的分頁
（`important.png`，9 MB）；KakaoTalk 聯絡連結改成指向本 repo 的 issues 與上游 GitHub
（理由同 `pair-maker` 的回報表單）。五個 CDN 函式庫原本有一個沒鎖版本，收錄版全部鎖定，
見 `THIRD_PARTY_NOTICES.md`。同樣操作下匯出的房間 ZIP、PSD 圖層 ZIP 與 APNG 都與上游逐位元組相同。

## 本站重寫的工具（靈感來源）

下列工具已依 [docs/refactor/PROCESS.md](docs/refactor/PROCESS.md) 的流程改寫到本站的 `web/` 框架，
上線前逐項做新舊版對等驗證（紀錄在各規格 [docs/refactor/specs/](docs/refactor/specs/) 的第 6 節）。改寫時參考原作的程式，
用本站的共用元件重新寫；MIT、CC0 等開放授權原作的著作權聲明與授權全文保留在 `assets/build/THIRD_PARTY_NOTICES.md`
（「參考原作程式改寫的工具」一節），未授權原作的素材與範本文字不沿用。表中大部分工具是在這個做法之前以無塵室方式
（觀察者只寫行為規格，實作者只看規格）重寫的；之後參考了開放授權原作程式修正的工具，原作的授權全文同樣列在通知檔裡。新版只有繁體中文介面，本站的程式以 MIT 授權釋出（見 [LICENSE](LICENSE)），
頁尾只保留靈感來源連結。舊版的收錄副本已移除，需要對照時可以從表中的 `main` commit 取回（例如 `git show cb0c619:tools/battlemap/app.js`）。

| 工具 | 名稱 | 靈感來源 | 舊版所在的 commit |
|---|---|---|---|
| `battlemap` | 戰鬥地圖產生器 | [usagineko7865-debug/battlemap-generator](https://github.com/usagineko7865-debug/battlemap-generator) | `cb0c619` |
| `apng-wipe` | 輕量轉場 APNG 產生器 | 出處不明的轉場 APNG 小工具（使用者提供的單檔 HTML，沒有可連結的網址） | `cb0c619` |
| `text-fx` | 文字演出產生器 | （本站原創，見下節；移植到新框架，與舊版逐格相同） | `cb0c619` |
| `textbox` | 文字方框產生器 | [sotsotssi/TextBoxGen](https://github.com/sotsotssi/TextBoxGen) | `cb0c619` |
| `portrait-size` | 立繪尺寸統一器 | [woolwag3338/character-image-size](https://github.com/woolwag3338/character-image-size) | `cb0c619` |
| `text-path` | 文字軌跡產生器 | [sotsotssi/text-path-generator](https://github.com/sotsotssi/text-path-generator) | `b8a22a1` |
| `collage-letter` | 匿名拼貼信產生器 | [sotsotssi/collage-letter](https://github.com/sotsotssi/collage-letter) | `b8a22a1` |
| `status-bar` | 狀態條產生器 | [shiki365/status-bar-maker](https://github.com/shiki365/status-bar-maker) | `b8a22a1` |
| `message-box` | 訊息框產生器 | [shiki365/message-box-maker](https://github.com/shiki365/message-box-maker) | `b8a22a1` |
| `chat-window` | 聊天視窗產生器 | [shiki365/chat-window-maker](https://github.com/shiki365/chat-window-maker) | `b8a22a1` |
| `obs-tachie` | Discord 通話立繪產生器 | [max-enterme/obs-tachie-generator](https://github.com/max-enterme/obs-tachie-generator) | `b8a22a1` |
| `ccfolia-cropper` | 立繪裁切器 | [kimtaehee2018-maker/ccfolia-cropper](https://github.com/kimtaehee2018-maker/ccfolia-cropper) | `b8a22a1` |
| `icon-maker` | 簡易頭像產生器 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`kantan-icon-maker`） | `b8a22a1` |
| `variant-manager` | 角色差分管理器 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`chara-sabun-kanri-tool`） | `b8a22a1` |
| `color-palette` | 角色配色條產生器 | [sotsotssi/CharColorPalette](https://github.com/sotsotssi/CharColorPalette) | `b8a22a1` |
| `typewriter` | 打字機動畫產生器 | [sotsotssi/Typewriter-apng](https://github.com/sotsotssi/Typewriter-apng) | `b8a22a1` |
| `height-board` | 立繪身高比較板 | [woolwag3338/character-height-board](https://github.com/woolwag3338/character-height-board) | `b8a22a1` |
| `emotion-maker` | 表情產生器 | [sotsotssi/emotion-maker](https://github.com/sotsotssi/emotion-maker) | `b8a22a1` |
| `cutin` | 切入素材產生器 | [Taku-Taku-Taku/cutin-maker](https://github.com/Taku-Taku-Taku/cutin-maker) | `b8a22a1` |
| `scene-transition` | 場景轉換素材產生器 | [shiki365/scene-transition-maker](https://github.com/shiki365/scene-transition-maker) | `83fd605` |
| `loading-maker` | 讀取動畫產生器 | [sotsotssi/loading-maker](https://github.com/sotsotssi/loading-maker) | `83fd605` |
| `bg-motion` | 動態背景產生器 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`haikei-motion-maker`） | `83fd605` |
| `character-editor` | 角色資料編輯器 | [organon-torah/ccfoliaCharacterEditor](https://github.com/organon-torah/ccfoliaCharacterEditor) | `83fd605` |

新版用到的 npm 套件與授權，建置時自動整理在 [assets/build/THIRD_PARTY_NOTICES.md](assets/build/THIRD_PARTY_NOTICES.md)。

## text-fx：文字演出產生器（本 repo 原創）

`text-fx` 不是收錄的工具，而是本 repo 自己寫的原創工具（MIT，見根目錄 [LICENSE](LICENSE)；原本是獨立的單頁程式，已移植到新框架 `web/`，
與舊版逐格相同，見 [docs/refactor/specs/text-fx.md](docs/refactor/specs/text-fx.md)），
把文字做成透明背景的 APNG 動畫：標語大字、長文旁白、地點與時間字幕三種模式，二十多種登場與
退場效果、停留效果、九種裝飾、直書與禁則、256 色減色、相同影格合併與只存變化範圍。

它的功能與手感對齊くま。的「文字画像APNGメーカー」（TRPG WEBツール観測所）。那個工具的條款禁止
複製、再散布其工具本體或主要部分，所以合輯不收錄它，改用**無塵室**方式獨立開發：

1. 一位觀察者在本機實際操作原作、逐格量測各種效果的時間、緩急、幅度與版面，寫成只描述「看得到
   的結果」的行為文件，不含任何程式碼、變數名稱、資料結構、內部常數、範本或介面文字。
2. 行為文件經過審查後，交給另一位**沒有看過原作程式碼**的實作者，從零設計架構並撰寫全部程式、
   介面、範本與範例文字。
3. 完成後比對兩邊程式碼（只剩 IndexedDB、Canvas 之類的通用寫法相同），並用相同設定逐格並排比較
   動畫效果。

另外，第一次嘗試時實作者讀了原作程式碼，寫出來的版本有照搬的痕跡（相同的資料結構與內部常數），
那一版沒有提交就整個作廢，才改用上述流程重做。

## 未授權的工具

`sotsotssi/select-your-chara`、
`johnko00/ccfolia-room-zip-maker-demo`
與 `baegop157902/PairMaker` 皆未附任何授權條款，GitHub 亦未標示授權。
`coc-typesetter` 取自 <https://scenario-tool-jade.vercel.app/coc-typesetter.html>，
頁面上沒有作者署名與授權條款，也找不到原始碼的 repo。
くま。的 `kumachansteps/trpg-web-tools` 也沒有授權條款（收錄其中三個工具，見上方專節；
站上的利用規約另外禁止轉載圖片素材，因此一張圖都沒收）。
依著作權法預設，其權利保留予原作者，此處僅供試用。原作者如有異議，將立即移除。

`character-select` 與 `room-zip` 的上游都是收錄前一兩天才建立、只有一次提交，
往後很可能還會變動；此處的快照分別固定在 `883f48b` 與 `a9a522c`，不與上游同步。

## 繁體中文翻譯

magic-circle 的繁體中文翻譯移植自
[tool-jx3/magic-circle-maker](https://github.com/tool-jx3/magic-circle-maker/tree/zhtw)
分支 `zhtw`，commit `772d6c4`。該分支在抽取字串時移除了如尼文的韓文讀音
（`RUNE_READINGS.ko` 為空物件），本 repo 已自上游 `de40a68` 還原這 69 組讀音。

其餘三十八個工具的翻譯與 i18n 改造為本 repo 新增（`coc-typesetter` 是改寫成只有繁中，見上；
`jizura` 連到原作者的官方繁中版，不在此列）。

各工具程式碼中的原始（韓文）原始碼註解，已一併譯為繁體中文；shiki365 的工具
原本就以英文撰寫註解，僅檔頭標題改為中譯名。一個例外：

- `tools/room-zip/`——註解密度高且多為演算法與資料格式的說明，逐句轉譯風險大於效益：app.v1.js 一萬多行裡有 156 行
  註解是日文，維持原文。這些註解會隨著檔案發佈，因此 `tests/smoke.mjs`
  把「只有註解可以是日文」變成可檢查的規則（`stripComments`）：把註解整段抹成空白
  （保留行結構）之後再掃一次，程式碼與標記裡只要出現假名就會被擋下；另外列出一份「刻意留著的資料」
  清單（素材標籤的值、`{検索ワード}`、KPDEF 的聊天面板預設內容、CSV 標題列的
  辨識字、CCFOLIA 的三個預設頻道名），清單以外的日文一律擋下。

## 本 repo 新增的部分

新框架 `web/`（含其建置產物 `assets/build/`、`next/` 與重寫上線的 `tools/<id>/index.html`）、`docs/`、`assets/`、`index.html`、`tests/`、各工具的 `i18n.*.js` 字典檔、`tools/jizura/` 的轉址頁、`anime-rig` 的
`guide.zh-TW.md`、`coc-typesetter` 的範例劇本（`app.js` 的 `SAMPLE_META` 與 `SAMPLE_TEXT`），
以 MIT 授權釋出，詳見 [LICENSE](LICENSE)。
`tools/character-select/`、
`tools/room-zip/`、`tools/pair-maker/` 與 `tools/coc-typesetter/` 的其餘部分不在此範圍內，見上節。
