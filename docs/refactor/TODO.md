# 待做與候選清單

上游更新、新工具候選、可以併進現有工具的功能都記在這裡。

- **做完就從這份清單刪掉**；進度改記在 [PLAN.md](PLAN.md) 的進度表、細節寫在各工具的規格。
- **每次上游檢查或搜尋新工具之後更新這份清單**：新的項目加進對應的段落，已經不成立的（原作不見了、本站已經有了）刪掉，在「檢查紀錄」補一行。
- 授權照 [CLAUDE.md](../../CLAUDE.md) 第 1 條：「未授權」只參考功能，程式、文字、素材自己做；MIT／CC0 可以沿用（附 `UPSTREAM_LICENSE`）。
- 工作量：小（一天內）、中（一批）、大（要分好幾批）。

## 進行中

- 新工具「VTT 棋子產生器」（token-maker，參考 arcana-hanna/token-workshop、CyberDelaai/eidolon-ui，MIT）
- 新工具「NPC 名字產生器」（npc-names：日本名、台灣名、1920 年代英文名；之後 coc-npc 的隨機取名也用它）
- floor-plan 跟進原作室内図メーカー v1.15
- geo-bloom 跟進原作 tkmizGeo 到 `edb6828`

## 一、已收錄工具的原作更新

| 本站工具 | 原作 | 授權 | 新的東西 | 建議 | 工作量 |
|---|---|---|---|---|---|
| floor-plan | [kumachansteps/trpg-web-tools](https://github.com/kumachansteps/trpg-web-tools)（TRPG室内図メーカー v1.15，`ff87286`，10-27） | 未授權 | 健身房範本、8 件家具（深蹲架、滑輪訓練機、划船機、瑜珈墊、澡堂洗身區、小便斗、蹲式馬桶、長型洗手台）、雙開拉門；本站停在 v1.14 | 值得跟進（現代背景的劇本用得上） | 小 |
| speech-bubble | [aokmri/dp-cardmaker](https://github.com/aokmri/dp-cardmaker) | 未授權 | 單一泡泡插圖、PDF 匯出 | 可考慮（泡泡插圖比較值得） | 小～中 |
| geo-bloom | [al1scut/tkmizGeo](https://github.com/al1scut/tkmizGeo) | 未授權 | 三角形、摩斯環、線不跨線、把種子刻進圖形並能從圖片解碼 | 可考慮；原作 10-18（`edb6828`）之後沒再改，可以排 | 小～大 |
| （共用層） | 同上 | — | 原作提到 iOS 的 IndexedDB 連線被切斷後沒重連、預先存的 Blob 取不回來；本站 `core/storage/idb.ts` 沒有重連 | 有 iPhone 時確認再決定 | 小 |

## 二、新工具候選

| 候選 | 來源 | 授權 | 內容 | 跑團用途 | 工作量 |
|---|---|---|---|---|---|
| CoC 日誌分析 | [Liesegang/coc-ccfolia-tools](https://github.com/Liesegang/coc-ccfolia-tools)、[756y/SkillRoll_Analytics](https://github.com/756y/SkillRoll_Analytics)、[tukasa0001/DiceStats](https://github.com/tukasa0001/DiceStats)、[cp-20/dice-spec-v2](https://github.com/cp-20/dice-spec-v2) | 未授權／未授權／MIT／MIT | 從 CCFOLIA 日誌統計成長檢定、骰運。dice-spec-v2 的 `src/features/log-analysis/ccfolia/` 有 CoC 6／7 版、新舊 HTML、JSON 的解析器，附樣本與測試，可以當範本；成長擲骰可以和 coc-sheet 的「幕間成長」（見第三節）共用規則 | CoC 7 版團後整理 | 中 |
| PL 自我介紹卡／地雷表 | [sonata9x/trpg-profile-maker](https://github.com/sonata9x/trpg-profile-maker)、[Jara03mofu/trpg-jirai-check](https://github.com/Jara03mofu/trpg-jirai-check)、[Tetoriapot/sosaku-sheet-maker](https://github.com/Tetoriapot/sosaku-sheet-maker)、dearmysn1p3r _25 | 未授權 | 跑過的系統、KP／PL、地雷與 NG；五級量表（大歓迎、好き、普通、要相談、NG）可以參考 [OEC309/trpg-consensus](https://github.com/OEC309/trpg-consensus) 的題目結構（它有後端，只參考） | 揪團 | 小～中 |
| 分級表（Tier 表） | [Tetoriapot/character-attribute-maker](https://github.com/Tetoriapot/character-attribute-maker) 的 `tier-atelier/`（10-27～28） | 未授權 | 分級可以增刪、改名、配色、鎖定、收合；圖片和文字項目拖曳、未分類區、多選一起移動；PNG／JPEG／WebP；JSON 備份與多個專案。rank-chart 規格 D1 寫過「分級表另外當新工具評估」 | 劇本、角色的 tier 表 | 中 |
| CoC 追逐面板 | [ichieh42/coc-chase-panel](https://github.com/ichieh42/coc-chase-panel)（簡中，10-28） | 未授權 | CoC 7 版的追逐：角色與載具卡庫（MOV 自動算）、速度檢定、地點軌、行動點、險境與障礙、衝突、載具事故、躲藏、中途加入、日誌、JSON 匯入匯出。規則速查要自己寫，不能抄規則書原文 | 追逐規則複雜，KP 常常略過不跑；放 G9 | 中 |
| VTT 棋子產生器（圓形外框、角色出框） | [arcana-hanna/token-workshop](https://github.com/arcana-hanna/token-workshop)、[CyberDelaai/eidolon-ui](https://github.com/CyberDelaai/eidolon-ui)（參考：[Sectr99/TokenForge](https://github.com/Sectr99/TokenForge) 自動偵測外框開口） | MIT／MIT／MIT（TokenForge 的外框圖檔來源不明，不沿用） | 程式畫的環形外框（齒輪、扇貝、繩、鍊、荊棘、符文、圓、六角、電路…）與預設外觀、材質與光照；用筆刷、魔術棒或自動偵測讓頭、角突出框外；同一張圖做編號 1～N 的敵人組打包 ZIP；Roll20 280、Foundry 400 等尺寸；設定嵌進 PNG 以後再開。eidolon 的範例吉祥物圖不拿 | 戰鬥地圖團（D&D、劍世界）的棋子；放 G3，或當 icon-maker 的一個模式 | 中 |
| NPC 名字產生器 | [willnet/gimei](https://github.com/willnet/gimei)（日本人名約 1.3 萬，附假名與羅馬拼音）、[faker-js/faker](https://github.com/faker-js/faker)（zh_TW、ja、en 的人名與地址，只取需要的資料檔）、美國社會安全局依年代的嬰兒名（公有領域，可以出 1920 年代的英文名）；引擎可參考 [script-wizards/perhaps](https://github.com/script-wizards/perhaps)（Markdown 隨機表，Apache-2.0） | MIT／MIT／公有領域／Apache-2.0 | 依國別、年代、性別取名；之後可以擴成隨機表（遭遇、事件、NPC 個性） | KP 臨時幫 NPC 取名（日系劇本、1920 年代）；併進 coc-npc 或做 G9 小工具 | 小～中 |
| 卡牌列印與小冊子拼版 | [mephitrpg/rpg-cards](https://github.com/mephitrpg/rpg-cards)、[lukaszlasek/imposition-imp](https://github.com/lukaszlasek/imposition-imp) | MIT／MIT | rpg-cards：二十多種卡片尺寸、雙面對齊或只印正面、每頁張數、出血、裁切線（內容元素偏 D&D，版型自己做；圖示若用 game-icons.net 是 CC BY 3.0，要標出處）。imposition-imp：騎馬釘或多台拼版、雙面偏移校正、爬移補償，用的是本站已有的 pdf-lib | 實體團的道具卡、線索卡，自印劇本小冊子；放 G6，拼版也可以當 pdf-compress 的模式 | 中 |
| 直播小道具 | [TK2F/kasaneru](https://github.com/TK2F/kasaneru) | MIT | OBS 疊加層：倒數與正數計時器、時鐘、BGM 清單、輪盤、塗鴉、跑馬燈、擲骰；控制面板（OBS dock）和疊加層用 BroadcastChannel 溝通 | 「休息中」倒數、抽選輪盤、跑馬燈；本站 G4 都是 CSS 產生器，沒有這種互動疊加層 | 中 |
| 開鎖小遊戲（可考慮） | [pierretusseau/lockpick-minigame](https://github.com/pierretusseau/lockpick-minigame) | MIT | GM 設難度與時限，用連結或 QR 碼發給玩家，玩家輸入擲骰結果後轉環形卡榫開鎖 | 解謎道具（和 crossword、scratch-card 同類），可改成 CoC 鎖匠的成功等級 | 中 |
| 環境音混音（可考慮） | [remvze/moodist](https://github.com/remvze/moodist) | 程式 MIT；音效有 CC0 也有 Pixabay 授權 | 84 種環境音疊加、預設組合、網址分享；只收 CC0 的音效，匯出可以循環的 BGM 給 CCFOLIA | 場景環境音；放 G8 | 中 |
| 劇本時間表／年表（低） | [visjs/vis-timeline](https://github.com/visjs/vis-timeline)（或自己用 canvas 畫） | Apache-2.0 或 MIT 二選一 | 可以縮放的互動時間軸 | 事件經過、NPC 行動表；放 G6 | 中 |
| 匿名論壇貼文 | [dearmysn1p3r/DearMySn1p3r_05](https://github.com/dearmysn1p3r/DearMySn1p3r_05)、[_09](https://github.com/dearmysn1p3r/DearMySn1p3r_09) | 未授權 | 匿名討論串截圖（作者與留言者自動編號、回覆、反應數） | 現代背景的都市傳說 handout | 中 |
| 電影字幕／片尾名單 | [dearmysn1p3r/DearMySn1p3r_15](https://github.com/dearmysn1p3r/DearMySn1p3r_15)（可併 [_40](https://github.com/dearmysn1p3r/DearMySn1p3r_40)、[_18](https://github.com/dearmysn1p3r/DearMySn1p3r_18) 封面） | 未授權 | 字幕截圖、片尾名單捲動、海報、評分卡、預告 | 團報宣傳、戰役結束的片尾名單 | 中～大 |
| 角色貼圖組 | [dearmysn1p3r/DearMySn1p3r_39](https://github.com/dearmysn1p3r/DearMySn1p3r_39)、[_57](https://github.com/dearmysn1p3r/DearMySn1p3r_57) | 未授權 | 去背、文字、14 種動作、ZIP 匯出 | Discord／CCFOLIA 表情圖 | 中 |

## 三、可以併進現有工具

| 併進 | 來源 | 授權 | 補什麼 | 工作量 |
|---|---|---|---|---|
| log-converter | [Pumpkin-Duck/COC-TRPG-LOG-TOOL](https://github.com/Pumpkin-Duck/COC-TRPG-LOG-TOOL) | 未授權 | 匯入 Discord 日誌（DiscordChatExporter HTML）、KP／HO／PL 資訊區、目錄；作者寫繁中。另外兩個小功能：同一分頁多次匯出時自動合併重疊的部分（[yurisianne/ileelog-backup-trial](https://github.com/yurisianne/ileelog-backup-trial)）、列出疑似打錯的檢查清單（[Hoo21/ccfolia-log-converter](https://github.com/Hoo21/ccfolia-log-converter)），都未授權 | 中 |
| speech-bubble | [zZnaptime/Chat2Img](https://github.com/zZnaptime/Chat2Img)、[dearmysn1p3r/DearMySn1p3r_42](https://github.com/dearmysn1p3r/DearMySn1p3r_42)、[CyberDelaai/commlink-ui](https://github.com/CyberDelaai/commlink-ui) | 未授權／未授權／MIT（commlink 的結構與範本可以沿用，附 UPSTREAM_LICENSE） | 靜態聊天截圖：聊天室外框（狀態列、標題列、輸入列）、引用回覆、系統訊息、圖片與貼圖訊息、已讀、長圖分割。Chat2Img v3.2（10-26）加了「遊戲」「劇本」台詞框主題（NEXT▼、AUTO／SKIP／LOG）、文字模糊遮住、上傳字型、貼圖；commlink 有說話者與頭像、左右邊、泡泡內圖片、時間、聯絡人連動、版本快照、掃描線與故障效果 | 中 |
| coc-dice | [cp-20/dice-spec-v2](https://github.com/cp-20/dice-spec-v2) | MIT | 機率：CoC 7 版單次檢定各成功等級的機率（含獎勵骰／懲罰骰）、對抗檢定的勝率、任意骰子算式的分布圖（它的帳號、分享、付款用 Firebase＋Stripe，不收） | 小～中 |
| coc-dice | [3d-dice/dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) | MIT | 3D 擲骰（three.js＋cannon-es，本站都已打包）；可以指定結果（`1d100@1`），能匯出「01 大成功」「100 大失敗」的透明 WebM／APNG 演出素材。最後 commit 是 2022-10，要自己維護 | 中 |
| coc-sheet | [QTR-Games/Eldritch-Ledger](https://github.com/QTR-Games/Eldritch-Ledger) | CC0（`src/vendor/gronksoft-core` 保留所有權利，不能用） | 幕間成長精靈：替勾選的技能一次擲骰、加上成長值（本站只有成長勾選框）；可以和「CoC 日誌分析」共用規則 | 小 |
| id-ticket | [CyberDelaai/sinforge-ui](https://github.com/CyberDelaai/sinforge-ui) | MIT | SF／賽博朋克證件：活動證、公民 ID（含機讀區）、12 格執照卡、操作員 ID、掛繩通行證（掛繩孔透明）；照片網點或抖色單色化、浮水印；自組底版。作者標示「早期開發中」；隨機姓名會連外部服務，不收 | 中（自組底版：大） |
| char-chart | [utiyoso/cross-chart-maker](https://github.com/utiyoso/cross-chart-maker)（10-27） | 未授權 | 四象限的外觀：依氣氛產生漸層背景加顆粒、標題與軸名的字型和描邊、自動配對比色、臉部圖示、對話框；功能和本站重疊，優先度低 | 小～中 |
| anime-rig | [shinshin86/still2rig-psd](https://github.com/shinshin86/still2rig-psd) | MIT | 用 see-through 組成「相容 Anime2.5DRig」的 PSD，多了表情圖層（`eyes_angry`、`eyes_sad`、`eyes_half`、`eye_smile`、`mouth_laugh`、`mouth_frown`、`tears`、`sweat` 等）；本站只認 `mouth_open`／`mouth_close`／`eye_close`，可以補表情切換。要先拿一份樣本 PSD 試讀 | 小～中 |
| battlemap | [ondras/rot.js](https://github.com/ondras/rot.js) | BSD-3-Clause | 洞窟、迷宮等生成法與地圖尺寸選項（本站固定 22×16 格、只有地城） | 小～中 |
| handout-maker、lock-screen | 本站已有的 qrcode-generator（id-ticket 用）；造型參考 [kozakdenys/qr-code-styling](https://github.com/kozakdenys/qr-code-styling)（MIT） | MIT | 真的掃得出來的 QR 碼（點的形狀、中間放圖示） | 小 |
| review-grid | [futakad/trpg-fullcourse](https://github.com/futakad/trpg-fullcourse) | 作者條款（只取點子） | 「TRPG 人生全餐」版型：把跑過的 8 個劇本排成一份菜單（1200×1600） | 小 |
| session-calendar | [CyberDelaai/chronos-ui](https://github.com/CyberDelaai/chronos-ui) | MIT | 點日期輪流蓋上 5 種顏色的標記並畫進 PNG（其他功能本站大多已有；優先度低） | 小 |
| lock-screen | [dearmysn1p3r/DearMySn1p3r_11](https://github.com/dearmysn1p3r/DearMySn1p3r_11) | 未授權 | 來電、視訊、簡訊對話、相簿四種畫面；通知的 App 類型 | 中 |
| polaroid | [dearmysn1p3r/CHEKI_Maker](https://github.com/dearmysn1p3r/CHEKI_Maker) | 未授權 | cheki 尺寸、相框花紋、照片濾鏡與質感、多段文字、動態效果 GIF | 中 |
| acrylic-goods | [Eon-00/diecut-studio](https://github.com/Eon-00/diecut-studio) | 未授權 | 從透明 PNG 自動產生刀模線，輸出 SVG／PDF 送印 | 中 |
| grid-maker 或 map-editor | [CyberDelaai/gridmap-ui](https://github.com/CyberDelaai/gridmap-ui) | MIT | 從地圖圖片偵測格線 | 小～中 |
| character-editor | [756y/ccfolia_character_json_tool](https://github.com/756y/ccfolia_character_json_tool)、[G909G09/Cocofolia-Setter](https://github.com/G909G09/Cocofolia-Setter) | 未授權 | 頭像（iconUrl）、表情差分（faces） | 中 |
| scenario-text | [kanokanochan/scenario-to-ccfolia](https://github.com/kanokanochan/scenario-to-ccfolia)、[kai-maru9/ccfolia-paste](https://github.com/kai-maru9/ccfolia-paste) | 未授權（前者內含 AGPL 的 MuPDF，只參考功能，PDF 用 pdf.js） | PDF／TXT 匯入、整理貼上的文字；掃描檔（選不到文字的 PDF）之後可以接 [naptha/tesseract.js](https://github.com/naptha/tesseract.js)（Apache-2.0，語言模型第一次用時下載） | 中 |
| cutin、coc-typesetter | [G909G09/Cocofolia-Setter](https://github.com/G909G09/Cocofolia-Setter) | 未授權 | 配合演出長度的無聲 MP3（cutin）；CoC 6 版 → 7 版數值換算（coc-typesetter） | 小 |
| （簡轉繁） | [756y/TXT-](https://github.com/756y/TXT-) | 未授權 | 簡體轉繁體（scenario-text 或 log-converter） | 小 |
| pair-maker | [dearmysn1p3r/DearMySn1p3r_24](https://github.com/dearmysn1p3r/DearMySn1p3r_24)、[_25](https://github.com/dearmysn1p3r/DearMySn1p3r_25) | 未授權 | PC 設定資料表、自我介紹卡兩個版型 | 小～中 |
| prose-card | [dearmysn1p3r/DearMySn1p3r_12](https://github.com/dearmysn1p3r/DearMySn1p3r_12)、[_47](https://github.com/dearmysn1p3r/DearMySn1p3r_47) | 未授權 | 尺寸、對話行樣式、筆記本橫線與裝飾、作品組；原作 10-24 加了自訂 HTML／CSS 裝飾層，之後只有 10-25 的小修，可以讀了 | 小～中 |
| anime-rig | [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio)（Player：https://shinshin86.github.io/mesh-avatar-studio/play/） | MIT（範例角色 Miko 另有條款，不放進本站） | 光照（拖曳光源、跟著動的陰影、最多 8 組預設與快捷鍵）；讀入 .mavatar 檔播放（可用 npm 的 mesh-avatar 執行環境，MIT）。做 .mavatar 本身要原作的本機 Studio＋程式助手＋Python，網頁上做不到；使用者 2026-10-25 決定先不做（10-24 之後原作加了可開關的配件圖層、Rust 原生版與 macOS 桌面版、`npm run create`，決定不變） | 小～中 |
| scenario-editor | [sedn14636361/trpg-scenario-editor](https://github.com/sedn14636361/trpg-scenario-editor) | CC0 | 原作的 `/` 斜線候選清單（規格 D46；跟進 v3.26 時決定先不做） | 小 |
| music-frame | [dearmysn1p3r/MOMO_MusicCloud](https://github.com/dearmysn1p3r/MOMO_MusicCloud)（取代 _16／_27／_54） | 未授權 | 黑膠、CD、卡帶、串流的樣品圖、播放清單影片；原作 10-17～10-20 大改，10-25 只有一個小修，已經穩定 | 中 |
| floor-plan | Maptsukuri（maptsukuri.pages.dev，不在 GitHub） | 未授權 | .dd2vtt 匯出、隨機配置 | 中 |
| ui-frame | [knightleft/trpg-overlay](https://github.com/knightleft/trpg-overlay)（原本列為新工具候選「直播版面產生器」） | 未授權 | OBS 直播版面（作者寫繁中）：和 ui-frame 的 TRPG・直播模式重疊，可以補整面版面配置 | 中 |

## 內部改善

- anime-rig 的 see-through 深度換算（規格 §3.7：倍率 0.5～20、太平門檻、換算與不換算的部位）是用合成資料調的；拿到真實的 see-through 輸出
  （PSD＋`_depth.psd`＋`.psd.json`，線上試用或本機 `--save_to_psd`）時看轉頭的觀感再校正（2026-10-27）。
- 共用 ui 區塊（`@/ui` 總入口）收著只有特定工具用的元件（例如 PostEditor、LyricStyleControls），每個工具都會載入；可以照 `@/ui/imagefx` 的做法改成各自的入口，減少每頁的載入量（map-fx 實作時發現，2026-10-25）。
- 共用的 `ImageFrameDialog` 的兩指縮放可以換成 `createPointerGesture`（`@/ui`，color-palette 的配色卡照片用的）：中點縮放、放開一指接著拖。
  換的時候要回歸測試所有用到它的工具（color-palette 併入配色卡時發現，2026-10-28）。
- pdf-compress 打包的 pdf.js 標準字型裡，Helvetica 的後備是 Liberation Sans 1.07（GPL-2.0 with font exception，原樣單獨散布）；可以換成度量相容的 Arimo（Apache-2.0）或 Liberation 2.x（OFL），用同樣的檔名放進對照表（驗證者建議，2026-10-28）。
- 共用 ExportPanel 換格式時把整組設定（含倍率）交回給工具：PNG 以外的格式不傳倍率的工具，切回 PNG 時倍率會變成 100%（social-post 已在工具裡修正，2026-10-28 驗證時發現）。查一遍用到 ExportPanel 的工具。
- ToolShell 的「說明」對話框關閉後焦點沒有回到「說明」鈕（落在 body；height-board 驗證時發現，2026-10-28）。
- relation-chart 的 e2e「畫布：拖曳、碰撞推擠…」（Esc 後 focus-active 沒消）偶發失敗：main 35 次失敗 1 次；和 hover 重新設定有關，待查。
- pdf-compress 的大檔結果打包 ZIP 時整份放在記憶體（`fflate` 的 zipSync）；大檔無損又沒變小時可能很吃記憶體，可以改成串流寫 ZIP。WORKERFS 讀取緩衝依賴 qpdf-wasm 0.3.0 壓縮後的內部名稱（找不到時退回不緩衝，有測試），升級 qpdf-wasm 時要再看。
- map-fx 的 e2e「進階 3D：…復原（F74～F76、F82）」（`map-fx.spec.ts:1108`）在 2026-10-28 的 main（838ddea）連續 3 次失敗：方向鍵連按 3 次後 Ctrl+Z 只復原最後一步（房間 x 是 98、應該是 96）。合併靠共用 store 的 `coalesceMs`（0.4 秒），按鍵間隔一超過就拆成兩步；前一次全部 e2e 時是通過的，像是跟機器速度有關。要查是預覽每次按鍵重畫太慢，還是測試要改成不受時間影響。

## 四、先觀察

- HTML-in-Canvas（`<canvas layoutsubtree>`＋`drawElementImage`，Chrome 的 origin trial，試用期到 2027-03）：可以把真的 HTML／CSS 畫進 canvas，
  之後若正式上線，handout-maker、prose-card、social-post 這類「用 canvas 自己排版」的匯出可以改用它（直書、ruby、CSS 效果），也能對 HTML 介面套 WebGL 效果。
  使用者 2026-10-27 提供的示範 [matchachoco010/demo-html-in-canvas-bot-dashboard](https://github.com/matchachoco010/demo-html-in-canvas-bot-dashboard)
  只是 Discord 語音 bot 的儀表板示範（只有建置後的檔案、沒有授權），本身不收。
- [KumachanSteps/trpg-web-tools](https://github.com/KumachanSteps/trpg-web-tools) 的 `text-apng-maker-ex` 分支：擲骰結果演出（星空、夢、吸血鬼、萬聖節）、戰鬥演出；合進主線後再評估併進 text-fx（10-28 看：停在 10-20 的 `0b1e82f`，還沒進 main）。
- くま。的 OBS TRPGサポーター v0.1（同一個 repo）：還在開發中；要做的話只做透明覆蓋層。
- くま。的「TRPG背景サジェスト v0.10」（同一個 repo 的分支 `claude/project-thread-d2do1c`，10-26）：替自己電腦裡的背景圖資料夾加標籤（檔名、顏色、可選的 CLIP 模型），再依劇本文字逐場推薦背景；進 main 再評估（標籤詞庫是日文）。
- [Roman-Serius/GM-Terminal-Kit](https://github.com/Roman-Serius/GM-Terminal-Kit)：GM 用的復古終端機畫面；條款禁止再散布與改作，只能參考功能。
- [Liesegang/machitsumugi](https://github.com/Liesegang/machitsumugi)：架空日本地圖產生器，MIT，2026-10-22 建立。同類的架空世界地圖：[mewo2/terrain](https://github.com/mewo2/terrain)（MIT，演算法很短；對 CoC 用處低）。
- [chirorutyoco/split-compress-tool](https://github.com/chirorutyoco/split-compress-tool)：大圖分割壓縮（只看過 README）。

## 不收的（免得重查）

- flipphone-poster（[DearloveDive/flipphone-poster](https://github.com/DearloveDive/flipphone-poster)）：使用者 2026-10-23 沒選。
- dearmysn1p3r 的角色同人小遊戲（Cheonseong_Game、YAMINABEPARTY_Game）、特定社群世界觀的證件 maker（COVE_Card、PLX_Card、SERAPHIX_Card、_08）。
- Mellow Noise 的主頁本體（創作者作品集網站）：使用者 2026-10-26 決定只收同一位作者的 SF 標題產生器。
- see-through 的模型本身（SDXL 擴散模型＋Marigold，要 GPU）：只做 anime-rig 對它輸出的相容。
- [img2threejs/img2threejs](https://github.com/img2threejs/img2threejs)（Apache-2.0）：給 AI 寫程式助手用的技能，看參考圖寫 Three.js 程式碼；
  每個模型都要 AI 生成，沒有瀏覽器端的程式庫，展示的模型是遊戲／電影角色（2026-10-27 評估）。
- Ghostscript 編成 WASM 的 PDF 壓縮（[louisprp/shrinkpdf](https://github.com/louisprp/shrinkpdf)、goraiabhijit/pdf-compressor、krmanik/local-pdf-tools）與 [BentoPDF](https://www.bentopdf.com/)（壓縮用 PyMuPDF）：壓縮效果最好，但 Ghostscript、MuPDF 都是 AGPL-3.0，和本站的 MIT 不相容（2026-10-28 評估）。
- 2026-10-28 掃描排除的：
  - 要連外部服務：CyberDelaai/atlas-ui（ESRI 圖磚、Overpass）。
  - 資料或計算不適合：くま。的三大探索技能點數分配、職業選項（資料整理自規則書）；scenario-library、マイ本棚、BOOTH 爬蟲（資料管線）。
  - 要後端或帳號：spectrum527/TRPG-webtools、OEC309/trpg-consensus、minarin0179/trpg-gakkyukai、sonata9x/logcontainer、momo102938/MUNgs_doran、
    dan0030/lope、Poncirus917/FishDice、MarinMP2009/TRPG_Scenario_Review、MrSyrett/dungeon_crawlers_companion、doyoon-c-dev/TRPG_Printable_PDF_Maker。
  - GPL／AGPL／非商業授權：evillollive/Dungeon-Mapper、ursusmeles/wilderness-almanac、AkiHruka17/trpg-log-workbench、baiguai/coctools、nofevid/trpg-table。
  - 太大，原站直接用就好：Azgaar/Fantasy-Map-Generator。
  - 其他：2zH/trpg-dice（未授權；3D 骰子改看 dice-box-threejs）、3d-dice/dice-box（BabylonJS，比本站的 three 重）、
    chirorutyoco/Pasting-tokens（瀏覽器擴充）、ECgear/FitImage（命令列）。
  - 和本站重複：Tetoriapot 的 koyomi、style-atlas 等；dearmysn1p3r 的 ARCH 系列（_04、_37、_55）。
  - 系統專用：LANCER、HârnMaster、D&D 5e 地城追蹤、UH TRPG。
- 需要後端或登入的（Supabase／Firebase）、瀏覽器擴充、bot、AI GM、D&D 專用 DM 工具；其餘排除清單見檢查紀錄裡的報告。

## 檢查紀錄

- 2026-10-09：上游檢查（31 個上游）。
- 2026-10-18：上游檢查（60 多個上游）＋各作者的新工具。
- 2026-10-24：上游檢查（59 個 GitHub 上游，8 個有新 commit）＋已收錄作者的新工具＋GitHub 上新作者的跑團工具。
  不在 GitHub 的原作（KIIN、TEXTSCENE、PaiTei4234、gagyedo、Maptsukuri、scenario-tool-jade）這次連不到，沒有檢查。
  music-frame 的原作 repo 搬到 [zZnaptime/MVmaker](https://github.com/zZnaptime/MVmaker)，連結已修正。
- 2026-10-25：完成並移出清單——room-zip 讀入房間 ZIP 再編輯、scenario-editor 跟進原作 v3.26（三批）。
- 2026-10-25：使用者提供兩個候選——KIIN 的マップ・見取り図 演出スタジオ（新工具候選）、shinshin86/mesh-avatar-studio（併進 anime-rig）。
- 2026-10-26：完成並移出清單——地圖演出產生器（map-fx，2D 地圖演出＋進階 3D；和截圖演出產生器共用 core/imagefx）。
- 2026-10-26：使用者提供 Mellow Noise（韓文的創作者主頁，後台用 Naru DB）。主頁本體不收；要收的是作者的
  SF 標題產生器（使用者另外提供原檔），併進 text-fx。
- 2026-10-26：完成並移出清單——text-fx 的第四個模式「SF 標題」（8 個 HUD 範本由本站重新設計）。
- 2026-10-27：使用者提供 shitagaki-lab/see-through（單張插圖拆成 23 層 PSD 的研究專案）。模型要 Python＋8～16 GB GPU，不能放進本站；
  anime-rig 已接受它的 PSD，這次補左右分割的名稱與深度 PSD。
- 2026-10-27：完成並移出清單——anime-rig 相容 see-through 的輸出（左右分割的名稱、深度 PSD）。
- 2026-10-27：開始團期行事曆與線索道具產生器。開始前檢查原作：trpgforkk 最後更新 2026-08-08、taku_calendar 2026-10-20，沒有新東西；
  卓準備カレンダー v0.11 → v0.13（10-24，紙本手帳風的新設計、精簡說明文字，功能沒變）。
- 2026-10-27：使用者提供 img2threejs，評估後不收（見「不收的」）。
- 2026-10-27：使用者提供 KIIN 的ノベワク STUDIO，做成新工具「UI 框素材產生器」（兩種模式都做）。
- 2026-10-27：完成並移出清單——線索道具產生器（handout-maker）、團期行事曆（session-calendar，台灣假日共用模組 core/holidays、送到跑團紀錄簿）、
  UI 框素材產生器（ui-frame）。
- 2026-10-27：使用者提供 saturn97v/Color-shelf（當天建立），併進 color-palette，並一起做待做清單裡的 Colorpalettecard_Maker（最後更新 2026-09-14）。
- 2026-10-27：使用者提供 HTML-in-Canvas 的示範頁，評估後不收，技術本身列入「先觀察」。
- 2026-10-28：完成並移出清單——color-palette 的色票櫃與配色卡（共用的角色清單、k-means 取色、繁中色名）。
- 2026-10-28：使用者問開源的 PDF 壓縮工具。可以收的是 MIT 的 qcompress、wise-pdf（列入新工具候選）；Ghostscript／MuPDF 系列是 AGPL，不收。
- 2026-10-28：完成並移出清單——PDF 壓縮器（pdf-compress，參考 qcompress＋wise-pdf；共用模組 core/pdf）。
- 2026-10-28：檢查 height-board、social-post 的原作：character-height-board 10-16～10-24 三次更新（index.html 約 +3300 行）；4layout 10-17～10-26 共 11 個 commit。兩個都開始跟進。
- 2026-10-28：完成並移出清單——PDF 壓縮器的大檔省記憶體模式（上限 200 MB → 900 MB，整頁轉圖 600 MB，依實測）、social-post 跟進原作到 beb5ef1、全站播放列的「回到開頭」。
- 2026-10-28：完成並移出清單——height-board 跟進原作到 2407161（共用層：GuidedTour、兩指縮放、長按排序、設定欄寬度拖曳、通知修正）。
- 2026-10-28：上游檢查。共 66 個 GitHub 上游，加上 KumachanSteps/coc-tools；repo 都還在，沒有改名。10-24 之後只有 kumachansteps 的室内図メーカー v1.15 是使用者看得到的新東西（列入第一節）。
  已收錄作者的新作：
  - CyberDelaai 的 MIT 工具組（commlink、eidolon、sinforge、chronos）；
  - Tetoriapot 的 TIER ATELIER；
  - utiyoso 的十字圖表；
  - shinshin86/still2rig-psd；
  - Chat2Img v3.2。

  GitHub 上的新作者與開源專案，列入第二、三節：
  - 新工具：追逐面板、VTT 棋子、NPC 名字、卡牌列印與拼版、直播小道具、開鎖小遊戲、環境音、年表；
  - 併進現有工具：coc-dice 的機率與 3D 骰、coc-sheet 的幕間成長、battlemap 的 rot.js 等。

  不在 GitHub 的原作（KIIN 三個、TEXTSCENE、PaiTei4234、gagyedo、Maptsukuri、scenario-tool-jade、Mellow Noise）和所有 *.github.io 還是連不到。
  追蹤的新作者：cp-20、arcana-hanna、QTR-Games、ichieh42、TK2F、Sectr99、pierretusseau、script-wizards、mephitrpg。
