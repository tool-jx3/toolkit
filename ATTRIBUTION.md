# 靈感來源與授權

本站的工具都以 [sotsotssi](https://github.com/sotsotssi)、
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
[zznaptime](https://github.com/zznaptime) 與
[swoonqx](https://github.com/swoonqx) 與
[rebane2001](https://github.com/rebane2001) 製作的網頁工具、[SkyTNT](https://github.com/SkyTNT) 等人的開源專案，以及兩個作者不明的工具為靈感來源，
由本站以自己的框架（`web/`）重寫，
只有繁體中文介面；介面上不放原作者的其他標示，只在頁尾放「靈感來源」連結。所有原作的著作權屬各自的作者所有。

- **參考開放授權（MIT、CC0、Unlicense、Apache-2.0）原作的程式改寫**的工具，原作的著作權聲明與授權全文放在
  `web/src/tools/<id>/UPSTREAM_LICENSE`，建置時連同 npm 套件的授權整理在網站的
  [assets/build/THIRD_PARTY_NOTICES.md](https://tool-jx3.github.io/toolkit/assets/build/THIRD_PARTY_NOTICES.md)。
- **未授權或作者條款限制的原作**只參考功能與做法：程式、圖片素材、範本文字、說明與範例資料都由本站自己做。
- 2026-09～10 以前，合輯收錄過原作的副本（快照式，加上繁中介面）；依 [docs/refactor/](docs/refactor/PLAN.md) 的流程逐一改寫、
  做過新舊版對等驗證後刪除。副本最後所在的 `main` commit 記在下表；JIZURA 字面改為直接連到原作者網站的官方繁中版。

## 本站重寫的工具（靈感來源）

下列工具都已依 [docs/refactor/PROCESS.md](docs/refactor/PROCESS.md) 的流程改寫到本站的 `web/` 框架，
上線前逐項做新舊版對等驗證（紀錄在各規格 [docs/refactor/specs/](docs/refactor/specs/) 的第 6 節）。改寫時參考原作的程式，
用本站的共用元件重新寫；MIT、CC0、Unlicense、Apache-2.0 等開放授權原作的著作權聲明與授權全文放在各工具的
`web/src/tools/<id>/UPSTREAM_LICENSE`，建置時整理在網站的 `assets/build/THIRD_PARTY_NOTICES.md`（「參考原作程式改寫的工具」一節）；
未授權或作者條款限制的原作只參考功能與做法，素材、範本文字與範例資料都由本站自己做。表中較早的工具是在這個做法之前以無塵室方式
（觀察者只寫行為規格，實作者只看規格）重寫的；之後參考了開放授權原作程式修正的工具，原作的授權全文同樣列在通知檔裡。
新版只有繁體中文介面，頁尾只保留靈感來源連結。以前收錄的副本都已移除，需要對照時可以從表中的 `main` commit 取回
（例如 `git show cb0c619:tools/battlemap/app.js`、`git show 6b497bd:tools/trpg-lab/coc7_Investigator_sheet.js`）。

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
| `coc-sheet` | CoC 7 版調查員角色卡 | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io)（MIT；舊版 trpg-lab 的調查員角色卡） | `6b497bd` |
| `map-editor` | 地圖編輯器 | [ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io)（MIT；舊版 trpg-lab 的地圖一覽與地圖編輯器合併） | `6b497bd` |
| `ai-fail` | AI 誤判梗圖產生器 | [swoonqx/ai-fails-meme-maker](https://github.com/swoonqx/ai-fails-meme-maker)（未授權） | —（新收錄，沒有舊版） |
| `discord-color` | Discord 彩色文字產生器 | [rebane2001／Discord Colored Text Generator](https://gist.github.com/rebane2001/07f2d8e80df053c70a1576d27eabe97c)（公有領域，Unlicense） | —（新收錄，沒有舊版） |
| `scenario-text` | 劇本文字產生器 | [shiki365/scenario-text-maker](https://github.com/shiki365/scenario-text-maker)（MIT） | —（新收錄，沒有舊版） |
| `house-rules` | CoC 房規表產生器 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`house-rule-table`，未授權） | —（新收錄，沒有舊版） |
| `speech-bubble` | 動態對話泡泡產生器 | [sotsotssi/TextBubbleMaker-preview](https://github.com/sotsotssi/TextBubbleMaker-preview)（未授權） | —（新收錄，沒有舊版） |
| `floor-plan` | 室內平面圖產生器 | [くま。／TRPG WEBツール観測所](https://kumachansteps.github.io/trpg-web-tools/)（`indoor-map-maker`，未授權） | —（新收錄，沒有舊版） |
| `rank-chart` | 排行榜產生器 | [sotsotssi/would-you-rank](https://github.com/sotsotssi/would-you-rank)（MIT） | —（新收錄，沒有舊版） |
| `anime-rig` | 2.5D 動態立繪 | [852wa/Anime2.5DRig](https://github.com/852wa/Anime2.5DRig)（MIT） | `6957b28` |

`music-frame` 是照 [docs/refactor/PROCESS.md](docs/refactor/PROCESS.md) 第 6 節「新工具引入流程」直接在新框架做的工具，沒有收錄過原作的副本（原作 commit `0c24db2`）。原作未附授權條款，預設封面、預設文字與說明都由本站自做，只照原作的功能、版面與數值。

`bg-remover` 同樣照新工具引入流程直接在新框架做：AI 去背照 SkyTNT/anime-segmentation（Apache-2.0，授權全文在通知檔）的 `get_mask()` 前後處理。模型 `isnetis.onnx`（Apache-2.0，約 176 MB）**不在本 repo**：使用者第一次用 AI 去背時，瀏覽器從 Hugging Face 的 [skytnt/anime-seg](https://huggingface.co/skytnt/anime-seg) 固定 revision `493cb608` 下載，驗證 SHA-256 後存在瀏覽器裡。推論用 onnxruntime-web（MIT）。

`ai-fail` 照新工具引入流程直接在新框架做（2026-10-09 使用者選定）：原作（commit `8ce1f07`）沒有授權條款，只照原作的功能、版面與數值，程式、介面文字、說明與範例都由本站自做；預設標籤「object」是 AI 物件辨識介面的通用詞。

`discord-color` 照新工具引入流程直接在新框架做：原作（gist commit `f8daa79`）是公有領域（Unlicense，全文在通知檔），ANSI 輸出的算法照原作，介面與說明翻成繁中；原作在三種格式下會吃掉字或換行，新版修正（見規格第 7 節）。

`scenario-text` 照新工具引入流程直接在新框架做：原作（commit `a71e9ac`）是 MIT（授權全文在通知檔），台本的解析與房間 ZIP 的組裝照原作，範例文字與預設說話者翻成繁中；名字結尾的冒號、繁中的引號照規格第 5 節的裁定處理。

`house-rules` 照新工具引入流程直接在新框架做：原作沒有授權條款（網站的利用規約只禁止轉載站內的圖片與圖示），只照原作的功能、規則條目與數值（預設集的值和原作逐條相同），規則名稱、說明、選項文字、PNG 的版面與配色都由本站自寫；可以開啟原作匯出的 `.hrt.json`。

`speech-bubble` 照新工具引入流程直接在新框架做：原作（commit `b81c5b7`）只有範本預覽頁、沒有授權條款，製作工具本體在作者的 Postype（付費、不公開）。範本一覽照預覽頁的行為做；編輯與匯出的功能依預覽動畫逐格量到的數值、由本站自己設計；28 組範本的文字、配色與造型都由本站自做，不沿用原作的預覽圖與文字。

`floor-plan` 照新工具引入流程直接在新框架做：原作沒有授權條款（網站的利用規約只禁止轉載站內的圖片與圖示），只照原作的功能、牆壁與匯出的算法和數值，程式、介面文字、說明、範本、家具圖形與配色都由本站自做；可以開啟原作存的 `.trpgmap.json`（帖換算成坪）。

`rank-chart` 照新工具引入流程直接在新框架做：原作（commit `f323b87`）是 MIT（授權全文在通知檔），盲選排行的玩法、版面數值與預設文字照原作（翻成繁中），圖上不放原作名稱與作者帳號；可以開啟原作存的設定檔（JSON）。

`anime-rig` 參考 852wa/Anime2.5DRig（MIT，原作 commit `7ddbd99`，授權全文在通知檔）的程式改寫：自動綁定、物理與繪製的演算法和數值照原作，舊版與新版拿同一個 PSD 綁定的結果相同（單元測試並排比對過）。原作的範例 PSD（圖畫權利屬於各自的作者）不收，測試用的 PSD 由程式自己畫；原作需要本機 Python 中繼伺服器的 OBS 連動不移植，改成綠幕背景與透明影片的說明。臉部追蹤用 npm 的 @mediapipe/tasks-vision（Apache-2.0）；特徵點模型 `face_landmarker.task`（Apache-2.0，約 3.8 MB）**不在本 repo**：使用者第一次開攝影機追蹤時，瀏覽器從 Google 的 MediaPipe 官方模型網址下載，驗證 SHA-256 後存在瀏覽器裡。

`coc-dice`、`coc-npc`、`coc-sheet`、`map-editor`、`grid-maker`、`range-ruler` 由違法建築的 TRPG 實驗室拆開改寫，見下面「trpg-lab」一節。

新版用到的 npm 套件與授權，建置時自動整理在網站的 [assets/build/THIRD_PARTY_NOTICES.md](https://tool-jx3.github.io/toolkit/assets/build/THIRD_PARTY_NOTICES.md)（建置產物，不在 repo 裡）。

## trpg-lab：違法建築的 TRPG 實驗室（已拆成六個工具）

上游 `ihoukentiku/ihoukentiku.github.io`（違法建築のTRPGラボ，MIT）是一整個網站，首頁列出九個工具。合輯 2026-09 起以
`d39f79e` 的副本收錄成一個多頁的工具（加上繁中介面），2026-10 拆開改寫成新框架的六個工具後刪除副本（最後在 `main` commit `6b497bd`）：

| 舊版的頁面 | 上游名稱 | 新版 |
|---|---|---|
| `coc7_dice.html`、`damage_sum.html` | CoC7 ダイスツール、BCDice ダメージ計算 | `coc-dice`（兩個分頁） |
| `coc_npc_token.html` | CoC NPC作成/管理ツール | `coc-npc` |
| `coc7_Investigator_sheet.html` | CoC7 探索者シート | `coc-sheet` |
| `trpg_map_maker/map_list.html`、`map_editor.html` | TRPGマップエディタ | `map-editor`（一覽與編輯器合成一個工具） |
| `grid_maker.html`、`hex_maker.html` | グリッド作成、ヘクス作成 | `grid-maker` |
| `grid_ruler.html`、`hex_ruler.html` | グリッド定規作成、ヘクス定規作成 | `range-ruler` |

舊網址都留著轉址頁（`tools/trpg-lab/`）：各頁轉到對應的新工具（地圖編輯器的 `?id=` 照樣帶過去），實驗室首頁轉到合輯首頁的
「CoC 跑團輔助」，授權頁轉到網站的通知檔。舊版存在這個瀏覽器裡的資料（同一個網域）由新版第一次開啟時讀進來（擲骰紀錄、NPC、角色卡、地圖）。
上游 repo 裡另有一個 `grid_paint.html`，站上沒有任何連結指向它（功能已由地圖編輯器取代），不收。

### 作者保留權利的素材不收

程式碼是 MIT（repo 的 `LICENSE` 與站上的授權頁都這麼寫），但授權頁另外聲明：網站
管理者自製的素材（間取り図 SVG、AI 生成的貼圖、各工具的設計等）權利歸作者，商業
使用與再散布請先聯絡。以前的收錄版與改寫後的新版因此都只用程式碼與可再散布的第三方圖示，下列檔案不收：

- 地圖編輯器內建的 14 張地面／牆壁貼圖（`trpg_map_maker/patterns/`，AI 生成）。
  使用者自己上傳的貼圖照常可用。
- 15 個格局圖（間取り図）用的 SVG：授權頁點名的 `fp-*` 四個，以及授權頁沒有列出
  來源、同屬「floorplan」分類的床、桌椅、廁所、廚房、窗戶、直梯十一個——它們是作者
  自己畫的（檔案裡的註解寫著「fp-door と同サイズの枠」這類製作筆記）。
- 擲骰工具的音效 `dice_sound.wav`：出自ニコニ・コモンズ，素材本身不得再散布。
- 網站 Logo、OGP 圖片、`favicon.ico`，以及 Google Search Console 的驗證檔。

新版地圖編輯器的 56 個裝飾圖章（game-icons.net 的 16 個，CC BY 3.0；openstreetmap/map-icons 的 40 個
`jp-*`）的出處與授權寫在 `web/src/tools/map-editor/UPSTREAM_LICENSE`，建置時併入通知檔。

「各工具的設計」這句跟 MIT 有點打架：設計就寫在以 MIT 釋出的 HTML／CSS 裡。本站的判斷是
程式碼照 MIT 參考，作者點名的素材檔一律不用；新版的介面與版面也是本站自己的設計。若作者另有意見，以作者為準。

因為少了音效與內建貼圖，新版的擲骰工具沒有音效、地圖編輯器只有使用者自己上傳的圖樣；舊地圖裡用到內建貼圖的地方，
搬過來時換成上游本來就為每款貼圖準備的備用色。上游的存取分析（gtag）與隱私權政策頁也不收。

## jizura：JIZURA 字面（連到原站）

上游 `852wa/JIZURA`（hakoniwa）是單檔 HTML 的歌詞動態影片產生器：貼上歌詞、點按拍點，
就自動替每一行排出版面、登場／退場動畫、裝飾與鏡頭，匯出 MP4、綠幕、黑幕或 PNG 序列。

2026-09-25 起合輯曾收錄 `1b48bea` 的副本：照上游產生英文版的方式，建置時以翻譯表把日文字串
換成繁中，產生繁中與日文兩個頁面。同一天，上游整合了社群貢獻的繁體中文版（貢獻者
[Zaious](https://github.com/Zaious)，上游 PR #6），之後也持續跟著新功能更新，另有簡體中文、韓文等版本。

既然原作者已經提供官方繁中版，合輯自 2026-09-30 起不再收錄副本，`vendor/jizura/` 與建置產物一併移除。
`tools/jizura/` 改成一個轉址頁：依合輯以前的語言設定（`trpg-toolkit-locale`）跳到原站的對應版本——
繁中（預設）到 `https://852wa.github.io/JIZURA/zh-hant/`，日文到原站首頁，韓文到 `ko/`；
沒有 JavaScript 時由 `<meta http-equiv="refresh">` 導到繁中版。以前收錄版的日文頁網址
`tools/jizura/ja/` 也留著，會導到原站的日文版。新首頁直接連到原站（標「其他網站」）。

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

## 本 repo 的授權

本 repo 的程式、文件與測試以 MIT 授權釋出，見根目錄 [LICENSE](LICENSE)；參考開放授權原作改寫的部分保留原作的著作權與授權（見上）。
