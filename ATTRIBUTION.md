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
[usagineko7865-debug](https://github.com/usagineko7865-debug) 與
[zznaptime](https://github.com/zznaptime) 製作的網頁工具與
[SkyTNT](https://github.com/SkyTNT) 的開源專案，以及一個作者不明的工具，並為其加上繁體中文介面。所有收錄工具的原始著作權屬各自的原作者所有。

另有一部分工具已依 [docs/refactor/](docs/refactor/PLAN.md) 的流程**由本站重寫**：用本站自己的框架與元件重新實作，介面上不放作者標示，只保留「靈感來源」連結，見下方「[本站重寫的工具（靈感來源）](#本站重寫的工具靈感來源)」。

收錄方式為快照式：自下列 commit 取得程式碼，不與上游自動同步。

| 工具 | 原始 repo | 來源 commit | 授權 |
|---|---|---|---|
| trpg-lab | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io) | `d39f79e` | MIT（程式碼；作者保留權利的素材不收，見下） |
| jizura | [852wa/JIZURA](https://github.com/852wa/JIZURA) | —（連到原站；2026-09-25～30 曾收錄 `1b48bea` 的副本） | MIT |
| anime-rig | [852wa/Anime2.5DRig](https://github.com/852wa/Anime2.5DRig) | `7ddbd99` | MIT（程式碼；範例 PSD 不收，見下） |

收錄副本的 MIT 工具，原始 `LICENSE` 檔都保留於各自目錄中（`jizura` 不再收錄副本，見下）。

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

**已改寫成新版的頁面（2026-10）**：擲骰（`coc7_dice.html`）與傷害計算（`damage_sum.html`）→ `coc-dice`、
NPC（`coc_npc_token.html`）→ `coc-npc`、網格（`grid_maker.html`／`hex_maker.html`）→ `grid-maker`、
量尺（`grid_ruler.html`／`hex_ruler.html`）→ `range-ruler`。這些頁面的舊版程式、樣式與字典已刪除，舊網址只剩轉到新版的轉址頁；
舊版在 `main` commit `6957b28`。調查員角色卡與地圖編輯器還是舊版（正在改寫）。

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

上游註解維持日文（`map_editor.js` 一檔就有上千行，逐句轉譯的風險大於效益），
規則是：`tests/smoke.mjs` 把註解抹掉之後再掃，程式碼與標記裡不准有假名。

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
| `text-fx` | 文字演出產生器 | [くま。／文字画像APNGメーカー](https://kumachansteps.github.io/trpg-web-tools/tools/text-apng-maker/)（無塵室開發，沒有使用原作的程式碼，見下節） | `cb0c619` |
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
| `foreground-frame` | 前景框產生器 | [shiki365/foreground-frame-maker](https://github.com/shiki365/foreground-frame-maker) | `83fd605` |
| `room-zip` | 房間 ZIP 產生器 | [johnko00/ccfolia-room-zip-maker-demo](https://github.com/johnko00/ccfolia-room-zip-maker-demo) | `83fd605` |
| `log-converter` | CCFOLIA 日誌轉換器 | [Eon-00/eon-ccfolia-log-converter](https://github.com/Eon-00/eon-ccfolia-log-converter) | `83fd605` |
| `scenario-cards` | 劇本資訊卡片產生器 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`scenario-snippet-builder`） | `83fd605` |
| `psd-studio` | CCFOLIA & 圖片調色工作室 | [fyam-hamu/F_Ccfolia-PSD-Studio](https://github.com/fyam-hamu/F_Ccfolia-PSD-Studio) | `83fd605` |
| `session-log` | 跑團紀錄簿 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`session-log-tool`） | `83fd605` |
| `session-report` | 團報產生器 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`session-report-generator`） | `83fd605` |
| `coc-typesetter` | CoC 劇本排版工具 | [scenario-tool-jade.vercel.app](https://scenario-tool-jade.vercel.app/coc-typesetter.html)（作者不明） | `83fd605` |
| `scenario-editor` | 劇本排版台 | [sedn14636361/trpg-scenario-editor](https://github.com/sedn14636361/trpg-scenario-editor)（CC0） | `83fd605` |
| `gif-combiner` | GIF 接合器 | [sotsotssi/GIF-Combiner](https://github.com/sotsotssi/GIF-Combiner) | `83fd605` |
| `video-anim` | 影片轉動圖工具 | [sotsotssi/video-to-pic](https://github.com/sotsotssi/video-to-pic) | `83fd605` |
| `magic-circle` | 魔法陣製作器 | [sotsotssi/magic-circle-maker](https://github.com/sotsotssi/magic-circle-maker) | `83fd605` |
| `pair-maker` | 角色介紹圖產生器 | [baegop157902/PairMaker](https://github.com/baegop157902/PairMaker) | `83fd605` |
| `character-select` | 選角畫面產生器 | [sotsotssi/select-your-chara](https://github.com/sotsotssi/select-your-chara) | `83fd605` |
| `acrylic-goods` | 壓克力周邊工房 | [sotsotssi/acrylic-goods](https://github.com/sotsotssi/acrylic-goods) | `83fd605` |
| `music-frame` | 音樂播放畫面產生器 | [zznaptime/1007mv](https://github.com/zznaptime/1007mv)（未授權） | —（新收錄，沒有舊版） |
| `bg-remover` | 立繪去背工具 | [SkyTNT/anime-segmentation](https://github.com/SkyTNT/anime-segmentation)（Apache-2.0） | —（新收錄，沒有舊版） |
| `coc-dice` | CoC 擲骰工具 | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io)（MIT；舊版 trpg-lab 的擲骰頁與 BCDice 傷害加總頁合併） | `6957b28` |
| `coc-npc` | CoC NPC 產生器 | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io)（MIT；舊版 trpg-lab 的 NPC 頁） | `6957b28` |
| `grid-maker` | 網格產生器 | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io)（MIT；舊版 trpg-lab 的方格與六角格產生器合併） | `6957b28` |
| `range-ruler` | 距離量尺產生器 | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io)（MIT；舊版 trpg-lab 的方格與六角格量尺合併） | `6957b28` |

`music-frame` 是照 [docs/refactor/PROCESS.md](docs/refactor/PROCESS.md) 第 6 節「新工具引入流程」直接在新框架做的工具，沒有收錄過原作的副本（原作 commit `0c24db2`）。原作未附授權條款，預設封面、預設文字與說明都由本站自做，只照原作的功能、版面與數值。

`bg-remover` 同樣照新工具引入流程直接在新框架做：AI 去背照 SkyTNT/anime-segmentation（Apache-2.0，授權全文在通知檔）的 `get_mask()` 前後處理。模型 `isnetis.onnx`（Apache-2.0，約 176 MB）**不在本 repo**：使用者第一次用 AI 去背時，瀏覽器從 Hugging Face 的 [skytnt/anime-seg](https://huggingface.co/skytnt/anime-seg) 固定 revision `493cb608` 下載，驗證 SHA-256 後存在瀏覽器裡。推論用 onnxruntime-web（MIT）。

新版用到的 npm 套件與授權，建置時自動整理在網站的 [assets/build/THIRD_PARTY_NOTICES.md](https://tool-jx3.github.io/toolkit/assets/build/THIRD_PARTY_NOTICES.md)（建置產物，不在 repo 裡）。

## text-fx：文字演出產生器（無塵室開發）

`text-fx` 不是收錄的工具，程式是本 repo 自己寫的（MIT，見根目錄 [LICENSE](LICENSE)；原本是獨立的單頁程式，已移植到新框架 `web/`，
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

2026-10-06 起，介面頁尾與上表把くま。的「文字画像APNGメーカー」列為**靈感來源**（與其他くま。的工具一致），首頁徽章改為「本站重寫」。網站整體的利用規約（`terms.html`）只限制站內的圖片與圖示，但這個工具自己的利用規約（工具目錄下的 `terms.html`，「禁止」與第 7 條）明文禁止無斷複製、再散布工具本體或主要部分、公開複製的工具，所以程式維持上述的無塵室版本，不讀原作程式移植。

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
因此沒有隨附 OFL 全文。
收錄的工具：`trpg-lab` 地圖編輯器的文字字型清單。

各工具宣告的字重都逐一對 `fonts.googleapis.com/css2` 驗證過——Google Fonts 對
不存在的字重會讓整個請求失敗，畫面上只會表現成「字型沒套用」，很難追。
`tests/smoke.mjs` 把這張驗證過的字重表與各處的宣告對起來，寫錯會被擋下。

## 繁體中文翻譯

仍收錄副本的工具，翻譯與 i18n 改造為本 repo 新增（`jizura` 連到原作者的官方繁中版，不在此列）。

## 本 repo 新增的部分

新框架 `web/`（含其建置產物 `assets/build/`、`next/` 與重寫上線的 `tools/<id>/index.html`）、`docs/`、`assets/`、`index.html`、`tests/`、各工具的 `i18n.*.js` 字典檔、`tools/jizura/` 的轉址頁、`anime-rig` 的
`guide.zh-TW.md`，
以 MIT 授權釋出，詳見 [LICENSE](LICENSE)。
