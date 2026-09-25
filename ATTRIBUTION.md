# 來源與授權

本 repo 收錄 [sotsotssi](https://github.com/sotsotssi)、
[shiki365](https://github.com/shiki365)、
[Taku_Taku_Taku](https://github.com/Taku-Taku-Taku) 與
[kimtaehee2018-maker](https://github.com/kimtaehee2018-maker) 與
[巡涯学派](https://github.com/organon-torah) 與
[Wool&Wag](https://github.com/woolwag3338) 與
[johnko00](https://github.com/johnko00) 與
[baegop157902](https://github.com/baegop157902) 與
[違法建築](https://github.com/ihoukentiku) 製作的 23 個網頁工具，
並為其加上繁體中文介面。所有工具的原始著作權屬各自的原作者所有。

收錄方式為快照式：自下列 commit 取得程式碼，不與上游自動同步。

| 工具 | 原始 repo | 來源 commit | 授權 |
|---|---|---|---|
| magic-circle | [sotsotssi/magic-circle-maker](https://github.com/sotsotssi/magic-circle-maker) | `de40a68` | MIT |
| typewriter | [sotsotssi/Typewriter-apng](https://github.com/sotsotssi/Typewriter-apng) | `cf3ff36` | MIT |
| text-path | [sotsotssi/text-path-generator](https://github.com/sotsotssi/text-path-generator) | `b86cd28` | MIT |
| collage-letter | [sotsotssi/collage-letter](https://github.com/sotsotssi/collage-letter) | `ea08333` | MIT |
| emotion-maker | [sotsotssi/emotion-maker](https://github.com/sotsotssi/emotion-maker) | `b455379` | **未授權** |
| loading-maker | [sotsotssi/loading-maker](https://github.com/sotsotssi/loading-maker) | `615664b` | **未授權** |
| foreground-frame | [shiki365/foreground-frame-maker](https://github.com/shiki365/foreground-frame-maker) | `586b273` | MIT |
| scene-transition | [shiki365/scene-transition-maker](https://github.com/shiki365/scene-transition-maker) | `0162787` | MIT |
| status-bar | [shiki365/status-bar-maker](https://github.com/shiki365/status-bar-maker) | `dab4fb9` | MIT |
| cutin | [Taku-Taku-Taku/cutin-maker](https://github.com/Taku-Taku-Taku/cutin-maker) | `7e9c70d` | MIT |
| ccfolia-cropper | [kimtaehee2018-maker/ccfolia-cropper](https://github.com/kimtaehee2018-maker/ccfolia-cropper) | `f149b4e` | **未授權** |
| character-select | [sotsotssi/select-your-chara](https://github.com/sotsotssi/select-your-chara) | `883f48b` | **未授權** |
| character-editor | [organon-torah/ccfoliaCharacterEditor](https://github.com/organon-torah/ccfoliaCharacterEditor) | `e1111d4` | **未授權** |
| chat-window | [shiki365/chat-window-maker](https://github.com/shiki365/chat-window-maker) | `d3bdf3c` | MIT |
| portrait-size | [woolwag3338/character-image-size](https://github.com/woolwag3338/character-image-size) | `fc05c98` | MIT |
| height-board | [woolwag3338/character-height-board](https://github.com/woolwag3338/character-height-board) | `90f8442` | MIT |
| room-zip | [johnko00/ccfolia-room-zip-maker-demo](https://github.com/johnko00/ccfolia-room-zip-maker-demo) | `a9a522c` | **未授權** |
| pair-maker | [baegop157902/PairMaker](https://github.com/baegop157902/PairMaker) | `aad63b1` | **未授權** |
| color-palette | [sotsotssi/CharColorPalette](https://github.com/sotsotssi/CharColorPalette) | `75840e6` | MIT |
| acrylic-goods | [sotsotssi/acrylic-goods](https://github.com/sotsotssi/acrylic-goods) | `8b1b1e2` | MIT |
| video-anim | [sotsotssi/video-to-pic](https://github.com/sotsotssi/video-to-pic) | `9fe67a6` | MIT |
| gif-combiner | [sotsotssi/GIF-Combiner](https://github.com/sotsotssi/GIF-Combiner) | `3aa7de8` | MIT |
| trpg-lab | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io) | `d39f79e` | MIT（程式碼；作者保留權利的素材不收，見下） |

十六個 MIT 工具的原始 `LICENSE` 檔保留於各自目錄中。

shiki365 的四個工具、`cutin`、`portrait-size`、`height-board` 與 `room-zip` 原文為日文，
收錄時另有以下調整：

- `scene-transition` 的上游同時提供 Python 桌面版與瀏覽器版，本 repo 只收錄
  `docs/` 底下的瀏覽器版（合輯只收純靜態、免安裝的網頁工具）。
- `foreground-frame`、`scene-transition` 與 `chat-window` 的 `<style>` 區塊抽出為
  `styles.css`（理由同 text-path 與 collage-letter）。
- 這七個工具都移除了指向原作者站台的 OG／Twitter meta 與
  `<meta name="description">`——那是原部署的站台識別，其餘工具也都沒有。
  `<title>` 只留工具名，捨去 SEO 後綴。
- shiki365 的四個工具頁尾都有回作者工具站的連結（`chat-window` 另有一條許願用的
  Marshmallow），以及後來加上的「支持開發（BOOTH）」，都原樣保留並翻譯；但頁首那條
  同樣指向工具站的連結不收——那個位置放的是合輯的首頁連結。
- 上游後來替四個工具加了 `favicon.svg`，收錄版不收：合輯裡的工具頁沿用瀏覽器預設的
  分頁圖示，不各自掛作者的站台圖示。
- `chat-window` 上游有兩句說明把「映す件数」「並び順」寫成在「メッセージ」分頁，
  實際上兩者都在「窓・見出し」分頁；收錄版的繁中與日文都照實際位置寫。
- `status-bar` 與 `chat-window` 的上游都附了自家站台的 `ogp.png`（各約 0.5 MB），
  收錄版沒有用到那張圖（`og:image` 指的是絕對網址），因此不收。

## portrait-size 與 height-board：移除了原站的存取分析

Wool&Wag 的兩個工具（`character-image-size`、`character-height-board`）上游頁面
都掛了 Google Analytics，說明區與頁尾也各有一句告知使用者這件事。收錄版把 `gtag`
的載入一併移除，因此那兩句話也拿掉了——留著就是在說一件本站不存在的事。
`<style>` 與內嵌 `<script>` 照慣例抽成 `styles.css` 與 `app.js`。

三個處理立繪的工具各管一件事，互不重疊：`ccfolia-cropper` 按 CCFOLIA 的版面比例
裁切、對齊頭部或角色中央；`portrait-size` 把同一角色的差分裁掉透明邊之後統一寬度
——CCFOLIA 是用圖片寬度決定棋子大小的，寬度不一致，切換立繪時棋子就會忽大忽小；
`height-board` 則是依身高統一縮尺，把不同角色並排比較高矮。

## 三個工具共用的 pcfonts.v1.js

`status-bar`、`chat-window` 與 `foreground-frame` 的字型欄都可以改填「以名稱指定」，
使用觀看者電腦上已安裝的字型；Chrome／Edge 還能用 Local Font Access API
（`queryLocalFonts()`）開出一份附樣張的清單來挑。那個對話框是 `pcfonts.v1.js`，
上游在三個 repo 底下各放一份完全相同的檔案，收錄版照做，`tests/smoke.mjs` 會檢查
三份沒有漂開。對話框是延遲建立的單例，切換語言時整個丟掉重建。

這個功能在 OBS 端有個前提：OBS 是用它自己那台電腦的字型算繪的，所以那台也要裝同一套
字型。上游把這件事寫在說明與產出的 CSS 開頭，收錄版一併翻譯保留。

## chat-window：預覽刻意保留的日文

`chat-window` 的預覽（`mock.v1.js`）是把 CCFOLIA 的聊天畫面照著重畫一遍，
好讓使用者在調整 CSS 時看到的就是 OBS 上會出現的樣子。因此那個檔案裡的日文
（`ルームチャット`、`メイン`、`メッセージを入力` 等九處，以及四個 `aria-label`）
**原樣保留**——CCFOLIA 只有日文介面，翻掉的話預覽就不是實際畫面了。

同理，範例訊息裡的骰子結果（`成功`、`失敗`、`決定的成功/スペシャル`、
`致命的失敗`、`Secret dice 🎲`）是 BCDice 與 CCFOLIA 的實際輸出，也不翻；
但角色名與聊天內容是作者自己編的示範資料，照常翻成繁體中文。
`tests/smoke.mjs` 把這批該留的日文釘成一份清單，三個方向互相箝制。

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
  帶著上游站台的 token）。理由同 `portrait-size` 與 `height-board` 的 GA。
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

## sotsotssi 的四個角色美術周邊工具

`color-palette`、`acrylic-goods`、`video-anim`、`gif-combiner` 是一批同時收錄的
MIT 小工具，路數與合輯其餘工具相同（角色美術周邊），也都是純靜態頁面：

| 目錄 | 上游名稱 | 做什麼 |
|---|---|---|
| `color-palette` | `CharColorPalette`（캐릭터 컬파 막대 메이커） | 角色配色條。可從立繪取色：手動滴管逐點選，或自動抓主色（演算法把彩度與明度當權重，無彩色與過暗過亮都扣分） |
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

這四個工具的外部相依（Tailwind Play CDN、three.js、cannon.js、gif.js、gifuct-js、
gifshot、pako、upng-js、Font Awesome）全部照上游原樣以 CDN 載入，本 repo 不散布
它們的檔案；各工具目錄下的 `THIRD_PARTY_NOTICES.md` 列出版本、來源與授權。
合輯本來就是這個做法（`loading-maker` 的 pako，`collage-letter`／`text-path`／
`typewriter` 的 Tailwind），README 也已寫明「部分工具會從 CDN 載入函式庫與字型」。

`acrylic-goods` 另外自帶一個「開源授權」對話框，把同一份清單顯示給使用者看，
那是上游就有的，收錄版只把兩句說明譯成繁中。

### 刻意保留的一處署名

`acrylic-goods` 會在 3D 畫面右下角燒一行浮水印進輸出的圖片。那是原作者在自己
工具的成品上署名，照樣保留；工具名跟著介面語言走，`@bb_uu_t` 不動，因此它是
字典裡的 `watermark`（繁中「壓克力周邊工房 @bb_uu_t」／韓文原文）。切語言時
`updateBackground()` 會重畫這張貼圖。

### 切語言時要重跑的幾處

四個工具的固定文字都走 `data-i18n`，但各有一些是程式寫進去的，切語言時得自己
重寫；每個工具的 `I18N.onChange` 就是在做這件事：

- `gif-combiner`：產生鈕的字（合成途中會被進度覆寫，所以只在閒置時重寫）與整份
  檔案清單。
- `color-palette`：左側面板與畫布由 `render()` 重畫；取色對話框那條狀態文字
  即使對話框關著也要換掉，不然下次打開是上一個語言的字。
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

上游註解維持日文（`map_editor.js` 一檔就有上千行），理由與 `height-board`、`room-zip`
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

## 需要建置的兩個工具

`cutin` 與 `character-editor` 的上游都是 React + TypeScript + Vite 專案，
不像其餘十一個工具可以直接把檔案放進 `tools/` 就能跑。因此原始碼快照收在
`vendor/` 底下，建置產物提交在各自的 `tools/` 目錄，重建方式見
[README](README.md#重新建置-cutin-與-character-editor)。`vendor/` 不參與網站發佈。

`character-editor` 另有一點必須留意：`src/lib/editScreenText.ts` 的日文字面常數
幾乎全是**解析用的錨點**，用來切分使用者從 CCFOLIA 編輯畫面複製貼上的文字
（`ステータス`、`イニシアティブ`、`駒サイズ`、`ラベル` 等）。那些不是畫面上的
文字，翻譯了會與輸入對不起來、解析直接壞掉，因此原樣保留；該檔只翻了使用者
會看到的那一則錯誤訊息。`tests/smoke.mjs` 會檢查建置產物裡殘存的每一段日文
都屬於這批錨點（或作者署名），多出任何一段就會被擋下。

除了把使用者可見的字串改成 i18n key 之外，另有兩點與上游不同：

- **字型改由 Google Fonts 載入。** 上游用 `@fontsource` 同捆六套日文網頁字型
  自行配送（在連不到 `fonts.googleapis.com` 的環境也能運作，且不會把瀏覽者的
  IP 交給第三方）。本 repo 因為要把建置產物提交進 repo，723 個檔案、16MB 的
  同捆並不合適，故改為參照 CDN；合輯的其他工具（Tailwind、pako、字型）也是
  這樣載入的。Google Fonts 的 CSS 同樣以 `unicode-range` 分割，實際下載的仍
  只有用到的字所在的區塊。
- **範本的預設文案一併在地化。** `成功`／`失敗` 這類預設輸出文字本身就是工具
  的產物，因此繁中介面下改為輸出繁體中文（例：`正気度喪失` → `理智喪失`）。
  選字時已逐字確認六套日文字型的 `unicode-range` 皆有涵蓋，不會出現豆腐字。

改用 CDN 連帶牽動兩處：`scripts/collect-licenses.mjs` 不再從 `node_modules`
蒐集字型授權（`public/licenses/OFL.txt` 與 `fonts.txt` 保留收錄當下的內容，
「關於這個工具」仍會連到 OFL 全文）；上游的 vitest 有一項斷言比對驗證訊息中的
日文字串，改為比對其 i18n key。上游 240 項單元測試全數通過。

## 繁體中文字型

上游工具的字型清單都是為原文語言挑的：sotsotssi 與 kimtaehee2018-maker 的工具用
韓文字型，shiki365 與 Taku_Taku_Taku 的用日文字型。這些字型大多含漢字，因此中文
「看得到」，但字形走的是韓文或日文的慣例（骨、每、直、真等字尤其明顯），而且
像「擲」「骰」這種只有中文在用的字，韓文字型多半直接缺字。

因此在有字型清單的工具裡，各補上同一組五套繁體中文字型。原有的選項一個都沒動，
預設值也維持原樣——範本是照原本那些字型的味道設計的，換掉會整個變樣。

| 字型 | 設計者 | 授權 | 用途 |
|---|---|---|---|
| [Noto Sans TC](https://fonts.google.com/specimen/Noto+Sans+TC) | Google | SIL OFL 1.1 | 黑體 |
| [Noto Serif TC](https://fonts.google.com/specimen/Noto+Serif+TC) | Google | SIL OFL 1.1 | 明體 |
| [LXGW WenKai TC 霞鶩文楷](https://fonts.google.com/specimen/LXGW+WenKai+TC) | LXGW | SIL OFL 1.1 | 楷體 |
| [Chocolate Classical Sans 巧克力黑體](https://fonts.google.com/specimen/Chocolate+Classical+Sans) | Moonlit Owen | SIL OFL 1.1 | 古典黑體 |
| [Cactus Classical Serif 仙人掌明體](https://fonts.google.com/specimen/Cactus+Classical+Serif) | Henry Chan、Tian Haidong、Moonlit Owen | SIL OFL 1.1 | 古典明體 |

五套都是從 Google Fonts 以 `unicode-range` 分割載入，本 repo 不散布字型檔本身，
因此沒有隨附 OFL 全文——與 `cutin` 的其他六套日文字型同樣的處理方式。
收錄的工具：`cutin`、`status-bar`、`typewriter`、`collage-letter`、`pair-maker`，
以及 `trpg-lab` 地圖編輯器的文字字型清單。

`foreground-frame`、`loading-maker`、`text-path` 沒有網頁字型的載入機制（前兩者
的字型清單指的是觀看者電腦上已安裝的字型，後者是寫死的單一字型），因此改為：

- `foreground-frame` 的字型表補上正黑體／明體／標楷體三組台灣系統字型堆疊；
- `loading-maker` 的字型建議清單補上同樣三組；
- `text-path` 的 `@import` 與繪製用的字型堆疊補上 Noto Sans TC，並排在
  Noto Sans KR 前面。Noto Sans TC 沒有諺文，韓文仍會落到 Noto Sans KR，
  所以兩種語言都不會缺字。

各工具宣告的字重都逐一對 `fonts.googleapis.com/css2` 驗證過——Google Fonts 對
不存在的字重會讓整個請求失敗，畫面上只會表現成「字型沒套用」，很難追。
`tests/smoke.mjs` 把這張驗證過的字重表與各處的宣告對起來，寫錯會被擋下。

## 未授權的七個工具

`sotsotssi/emotion-maker`、`sotsotssi/loading-maker`、
`kimtaehee2018-maker/ccfolia-cropper`、`sotsotssi/select-your-chara`、
`organon-torah/ccfoliaCharacterEditor`、`johnko00/ccfolia-room-zip-maker-demo`
與 `baegop157902/PairMaker` 皆未附任何授權條款，GitHub 亦未標示授權。
依著作權法預設，其權利保留予原作者（`emotion-maker` 包含 `images/` 下全部
39 張手繪素材），此處僅供試用。原作者如有異議，將立即移除。

`character-select` 與 `room-zip` 的上游都是收錄前一兩天才建立、只有一次提交，
往後很可能還會變動；此處的快照分別固定在 `883f48b` 與 `a9a522c`，不與上游同步。

`loading-maker` 以 CDN 載入 pako 0.2.9（MIT，Copyright (C) 2014-2016 by
Vitaly Puzrin）作為 APNG 壓縮／解壓縮之用，其出處與授權見
[tools/loading-maker/THIRD_PARTY_NOTICES.md](tools/loading-maker/THIRD_PARTY_NOTICES.md)。

## 繁體中文翻譯

magic-circle 的繁體中文翻譯移植自
[tool-jx3/magic-circle-maker](https://github.com/tool-jx3/magic-circle-maker/tree/zhtw)
分支 `zhtw`，commit `772d6c4`。該分支在抽取字串時移除了如尼文的韓文讀音
（`RUNE_READINGS.ko` 為空物件），本 repo 已自上游 `de40a68` 還原這 69 組讀音。

其餘二十二個工具的翻譯與 i18n 改造為本 repo 新增。

各工具程式碼中的原始（韓文）原始碼註解，已一併譯為繁體中文；shiki365 的三個工具
原本就以英文撰寫註解，僅檔頭標題改為中譯名。兩個例外：

- `tools/typewriter/webp-muxer.js`——這是原封不動保留的二進位格式編碼函式庫，
  其註解維持原文不動，僅將其中 8 個使用者可能看見的錯誤訊息改為穩定的英文
  錯誤代碼並另行翻譯。
- `vendor/cutin-maker/`——註解密度高且多為演算法說明（描邊順序、`unicode-range`
  分割、記憶體上限推導等），逐句轉譯風險大於效益，故維持日文原文；只有使用者
  看得到的字串與本 repo 新增的註解為中文。這些註解不會出現在 `tools/cutin/`
  的建置產物裡。
- `tools/height-board/`——同樣的理由。392 行註解多為 Canvas 縮放、記憶體上限、
  `.hboard` 的檔案佈局、拖曳門檻、為什麼某個按鈕要 `type="button"` 之類的取捨說明，
  維持日文原文。與 `cutin` 不同的是這些註解會隨著檔案發佈，因此 `tests/smoke.mjs`
  把「只有註解可以是日文」變成可檢查的規則：把註解整段抹成空白（保留行結構）之後
  再掃一次，程式碼與標記裡只要出現假名就會被擋下。`styles.css` 裡的
  `HG丸ｺﾞｼｯｸM-PRO` 是 Windows 的字型名稱，屬於要原樣寫給瀏覽器看的識別字，
  另外列為例外並檢查它還在。
- `tools/room-zip/`——同樣的理由，而且量更大：app.v1.js 一萬多行裡有 156 行
  註解是日文。同樣用 `stripComments` 的規則把關，另外列出一份「刻意留著的資料」
  清單（素材標籤的值、`{検索ワード}`、KPDEF 的聊天面板預設內容、CSV 標題列的
  辨識字、CCFOLIA 的三個預設頻道名），清單以外的日文一律擋下。

## 本 repo 新增的部分

`assets/`、`index.html`、`tests/`、各工具的 `i18n.*.js` 字典檔，
以及 emotion-maker 的資產路徑改造，以 MIT 授權釋出，詳見 [LICENSE](LICENSE)。
`tools/emotion-maker/`（含全部圖像素材）、`tools/loading-maker/`、
`tools/ccfolia-cropper/`、`tools/character-select/`、`tools/character-editor/`、
`tools/room-zip/` 與 `tools/pair-maker/` 的其餘部分不在此範圍內，見上節。
