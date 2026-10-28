# 待做與候選清單

上游更新、新工具候選、可以併進現有工具的功能都記在這裡。

- **做完就從這份清單刪掉**；進度改記在 [PLAN.md](PLAN.md) 的進度表、細節寫在各工具的規格。
- **每次上游檢查或搜尋新工具之後更新這份清單**：新的項目加進對應的段落，已經不成立的（原作不見了、本站已經有了）刪掉，在「檢查紀錄」補一行。
- 授權照 [CLAUDE.md](../../CLAUDE.md) 第 1 條：「未授權」只參考功能，程式、文字、素材自己做；MIT／CC0 可以沿用（附 `UPSTREAM_LICENSE`）。
- 工作量：小（一天內）、中（一批）、大（要分好幾批）。

## 進行中

（沒有）

## 一、已收錄工具的原作更新

| 本站工具 | 原作 | 授權 | 新的東西 | 建議 | 工作量 |
|---|---|---|---|---|---|
| social-post | [s2ndrome/4layout](https://github.com/s2ndrome/4layout) | 未授權 | 首頁動態（朋友的限時動態圈、動態貼文）、私訊畫面（列表＋對話、泡泡色、附圖、已讀）；朋友身分、看過的灰框、多則「我的限時動態」 | 值得跟進（兩個畫面可分開上線） | 中 |
| speech-bubble | [aokmri/dp-cardmaker](https://github.com/aokmri/dp-cardmaker) | 未授權 | 單一泡泡插圖、PDF 匯出 | 可考慮（泡泡插圖比較值得） | 小～中 |
| geo-bloom | [al1scut/tkmizGeo](https://github.com/al1scut/tkmizGeo) | 未授權 | 三角形、摩斯環、線不跨線、把種子刻進圖形並能從圖片解碼 | 可考慮；原作還在快速改，晚點再看 | 小～大 |
| height-board | [woolwag3338/character-height-board](https://github.com/woolwag3338/character-height-board) | MIT | 頭頂線、腳底線可以拖出圖外（蹲姿、半身立繪） | 可考慮 | 小 |
| （共用層） | 同上 | — | 原作提到 iOS 的 IndexedDB 連線被切斷後沒重連、預先存的 Blob 取不回來；本站 `core/storage/idb.ts` 沒有重連 | 有 iPhone 時確認再決定 | 小 |

## 二、新工具候選

| 候選 | 來源 | 授權 | 內容 | 跑團用途 | 工作量 |
|---|---|---|---|---|---|
| CoC 日誌分析 | [Liesegang/coc-ccfolia-tools](https://github.com/Liesegang/coc-ccfolia-tools)、[756y/SkillRoll_Analytics](https://github.com/756y/SkillRoll_Analytics)、[tukasa0001/DiceStats](https://github.com/tukasa0001/DiceStats) | 未授權／未授權／MIT | 從 CCFOLIA 日誌統計成長檢定、骰運 | CoC 7 版團後整理 | 中 |
| PL 自我介紹卡／地雷表 | [sonata9x/trpg-profile-maker](https://github.com/sonata9x/trpg-profile-maker)、[Jara03mofu/trpg-jirai-check](https://github.com/Jara03mofu/trpg-jirai-check)、[Tetoriapot/sosaku-sheet-maker](https://github.com/Tetoriapot/sosaku-sheet-maker)、dearmysn1p3r _25 | 未授權 | 跑過的系統、KP／PL、地雷與 NG | 揪團 | 小～中 |
| 匿名論壇貼文 | [dearmysn1p3r/DearMySn1p3r_05](https://github.com/dearmysn1p3r/DearMySn1p3r_05)、[_09](https://github.com/dearmysn1p3r/DearMySn1p3r_09) | 未授權 | 匿名討論串截圖（作者與留言者自動編號、回覆、反應數） | 現代背景的都市傳說 handout | 中 |
| 電影字幕／片尾名單 | [dearmysn1p3r/DearMySn1p3r_15](https://github.com/dearmysn1p3r/DearMySn1p3r_15)（可併 [_40](https://github.com/dearmysn1p3r/DearMySn1p3r_40)、[_18](https://github.com/dearmysn1p3r/DearMySn1p3r_18) 封面） | 未授權 | 字幕截圖、片尾名單捲動、海報、評分卡、預告 | 團報宣傳、戰役結束的片尾名單 | 中～大 |
| 角色貼圖組 | [dearmysn1p3r/DearMySn1p3r_39](https://github.com/dearmysn1p3r/DearMySn1p3r_39)、[_57](https://github.com/dearmysn1p3r/DearMySn1p3r_57) | 未授權 | 去背、文字、14 種動作、ZIP 匯出 | Discord／CCFOLIA 表情圖 | 中 |

## 三、可以併進現有工具

| 併進 | 來源 | 授權 | 補什麼 | 工作量 |
|---|---|---|---|---|
| log-converter | [Pumpkin-Duck/COC-TRPG-LOG-TOOL](https://github.com/Pumpkin-Duck/COC-TRPG-LOG-TOOL) | 未授權 | 匯入 Discord 日誌（DiscordChatExporter HTML）、KP／HO／PL 資訊區、目錄；作者寫繁中 | 中 |
| speech-bubble | [zZnaptime/Chat2Img](https://github.com/zZnaptime/Chat2Img)、[dearmysn1p3r/DearMySn1p3r_42](https://github.com/dearmysn1p3r/DearMySn1p3r_42) | 未授權 | 靜態聊天截圖：聊天室外框（狀態列、標題列、輸入列）、引用回覆、系統訊息、圖片與貼圖訊息、已讀、長圖分割 | 中 |
| lock-screen | [dearmysn1p3r/DearMySn1p3r_11](https://github.com/dearmysn1p3r/DearMySn1p3r_11) | 未授權 | 來電、視訊、簡訊對話、相簿四種畫面；通知的 App 類型 | 中 |
| polaroid | [dearmysn1p3r/CHEKI_Maker](https://github.com/dearmysn1p3r/CHEKI_Maker) | 未授權 | cheki 尺寸、相框花紋、照片濾鏡與質感、多段文字、動態效果 GIF | 中 |
| acrylic-goods | [Eon-00/diecut-studio](https://github.com/Eon-00/diecut-studio) | 未授權 | 從透明 PNG 自動產生刀模線，輸出 SVG／PDF 送印 | 中 |
| grid-maker 或 map-editor | [CyberDelaai/gridmap-ui](https://github.com/CyberDelaai/gridmap-ui) | MIT | 從地圖圖片偵測格線 | 小～中 |
| character-editor | [756y/ccfolia_character_json_tool](https://github.com/756y/ccfolia_character_json_tool)、[G909G09/Cocofolia-Setter](https://github.com/G909G09/Cocofolia-Setter) | 未授權 | 頭像（iconUrl）、表情差分（faces） | 中 |
| scenario-text | [kanokanochan/scenario-to-ccfolia](https://github.com/kanokanochan/scenario-to-ccfolia)、[kai-maru9/ccfolia-paste](https://github.com/kai-maru9/ccfolia-paste) | 未授權（前者內含 AGPL 的 MuPDF，只參考功能，PDF 用 pdf.js） | PDF／TXT 匯入、整理貼上的文字 | 中 |
| cutin、coc-typesetter | [G909G09/Cocofolia-Setter](https://github.com/G909G09/Cocofolia-Setter) | 未授權 | 配合演出長度的無聲 MP3（cutin）；CoC 6 版 → 7 版數值換算（coc-typesetter） | 小 |
| （簡轉繁） | [756y/TXT-](https://github.com/756y/TXT-) | 未授權 | 簡體轉繁體（scenario-text 或 log-converter） | 小 |
| pair-maker | [dearmysn1p3r/DearMySn1p3r_24](https://github.com/dearmysn1p3r/DearMySn1p3r_24)、[_25](https://github.com/dearmysn1p3r/DearMySn1p3r_25) | 未授權 | PC 設定資料表、自我介紹卡兩個版型 | 小～中 |
| prose-card | [dearmysn1p3r/DearMySn1p3r_12](https://github.com/dearmysn1p3r/DearMySn1p3r_12)、[_47](https://github.com/dearmysn1p3r/DearMySn1p3r_47) | 未授權 | 尺寸、對話行樣式、筆記本橫線與裝飾、作品組；原作 10-24 還在加自訂 HTML／CSS 裝飾層，等穩定再讀 | 小～中 |
| anime-rig | [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio)（Player：https://shinshin86.github.io/mesh-avatar-studio/play/） | MIT（範例角色 Miko 另有條款，不放進本站） | 光照（拖曳光源、跟著動的陰影、最多 8 組預設與快捷鍵）；讀入 .mavatar 檔播放（可用 npm 的 mesh-avatar 執行環境，MIT）。做 .mavatar 本身要原作的本機 Studio＋程式助手＋Python，網頁上做不到；使用者 2026-10-25 決定先不做 | 小～中 |
| scenario-editor | [sedn14636361/trpg-scenario-editor](https://github.com/sedn14636361/trpg-scenario-editor) | CC0 | 原作的 `/` 斜線候選清單（規格 D46；跟進 v3.26 時決定先不做） | 小 |
| music-frame | [dearmysn1p3r/MOMO_MusicCloud](https://github.com/dearmysn1p3r/MOMO_MusicCloud)（取代 _16／_27／_54） | 未授權 | 黑膠、CD、卡帶、串流的樣品圖、播放清單影片；原作 10-17～10-20 大改 | 中 |
| floor-plan | Maptsukuri（maptsukuri.pages.dev，不在 GitHub） | 未授權 | .dd2vtt 匯出、隨機配置 | 中 |
| ui-frame | [knightleft/trpg-overlay](https://github.com/knightleft/trpg-overlay)（原本列為新工具候選「直播版面產生器」） | 未授權 | OBS 直播版面（作者寫繁中）：和 ui-frame 的 TRPG・直播模式重疊，可以補整面版面配置 | 中 |

## 內部改善

- anime-rig 的 see-through 深度換算（規格 §3.7：倍率 0.5～20、太平門檻、換算與不換算的部位）是用合成資料調的；拿到真實的 see-through 輸出
  （PSD＋`_depth.psd`＋`.psd.json`，線上試用或本機 `--save_to_psd`）時看轉頭的觀感再校正（2026-10-27）。
- 共用 ui 區塊（`@/ui` 總入口）收著只有特定工具用的元件（例如 PostEditor、LyricStyleControls），每個工具都會載入；可以照 `@/ui/imagefx` 的做法改成各自的入口，減少每頁的載入量（map-fx 實作時發現，2026-10-25）。
- 共用的 `ImageFrameDialog` 的兩指縮放可以換成 `createPointerGesture`（`@/ui`，color-palette 的配色卡照片用的）：中點縮放、放開一指接著拖。
  換的時候要回歸測試所有用到它的工具（color-palette 併入配色卡時發現，2026-10-28）。
- pdf-compress 打包的 pdf.js 標準字型裡，Helvetica 的後備是 Liberation Sans 1.07（GPL-2.0 with font exception，原樣單獨散布）；可以換成度量相容的 Arimo（Apache-2.0）或 Liberation 2.x（OFL），用同樣的檔名放進對照表（驗證者建議，2026-10-28）。
- map-fx 的 e2e「進階 3D：…復原（F74～F76、F82）」（`map-fx.spec.ts:1108`）在 2026-10-28 的 main（838ddea）連續 3 次失敗：方向鍵連按 3 次後 Ctrl+Z 只復原最後一步（房間 x 是 98、應該是 96）。合併靠共用 store 的 `coalesceMs`（0.4 秒），按鍵間隔一超過就拆成兩步；前一次全部 e2e 時是通過的，像是跟機器速度有關。要查是預覽每次按鍵重畫太慢，還是測試要改成不受時間影響。

## 四、先觀察

- HTML-in-Canvas（`<canvas layoutsubtree>`＋`drawElementImage`，Chrome 的 origin trial，試用期到 2027-03）：可以把真的 HTML／CSS 畫進 canvas，
  之後若正式上線，handout-maker、prose-card、social-post 這類「用 canvas 自己排版」的匯出可以改用它（直書、ruby、CSS 效果），也能對 HTML 介面套 WebGL 效果。
  使用者 2026-10-27 提供的示範 [matchachoco010/demo-html-in-canvas-bot-dashboard](https://github.com/matchachoco010/demo-html-in-canvas-bot-dashboard)
  只是 Discord 語音 bot 的儀表板示範（只有建置後的檔案、沒有授權），本身不收。
- [KumachanSteps/trpg-web-tools](https://github.com/KumachanSteps/trpg-web-tools) 的 `text-apng-maker-ex` 分支：擲骰結果演出（星空、夢、吸血鬼、萬聖節）、戰鬥演出；合進主線後再評估併進 text-fx。
- くま。的 OBS TRPGサポーター v0.1（同一個 repo）：還在開發中；要做的話只做透明覆蓋層。
- [Roman-Serius/GM-Terminal-Kit](https://github.com/Roman-Serius/GM-Terminal-Kit)：GM 用的復古終端機畫面；條款禁止再散布與改作，只能參考功能。
- [Liesegang/machitsumugi](https://github.com/Liesegang/machitsumugi)：架空日本地圖產生器，MIT，2026-10-22 建立。
- [chirorutyoco/split-compress-tool](https://github.com/chirorutyoco/split-compress-tool)：大圖分割壓縮（只看過 README）。

## 不收的（免得重查）

- flipphone-poster（[DearloveDive/flipphone-poster](https://github.com/DearloveDive/flipphone-poster)）：使用者 2026-10-23 沒選。
- dearmysn1p3r 的角色同人小遊戲（Cheonseong_Game、YAMINABEPARTY_Game）、特定社群世界觀的證件 maker（COVE_Card、PLX_Card、SERAPHIX_Card、_08）。
- Mellow Noise 的主頁本體（創作者作品集網站）：使用者 2026-10-26 決定只收同一位作者的 SF 標題產生器。
- see-through 的模型本身（SDXL 擴散模型＋Marigold，要 GPU）：只做 anime-rig 對它輸出的相容。
- [img2threejs/img2threejs](https://github.com/img2threejs/img2threejs)（Apache-2.0）：給 AI 寫程式助手用的技能，看參考圖寫 Three.js 程式碼；
  每個模型都要 AI 生成，沒有瀏覽器端的程式庫，展示的模型是遊戲／電影角色（2026-10-27 評估）。
- Ghostscript 編成 WASM 的 PDF 壓縮（[louisprp/shrinkpdf](https://github.com/louisprp/shrinkpdf)、goraiabhijit/pdf-compressor、krmanik/local-pdf-tools）與 [BentoPDF](https://www.bentopdf.com/)（壓縮用 PyMuPDF）：壓縮效果最好，但 Ghostscript、MuPDF 都是 AGPL-3.0，和本站的 MIT 不相容（2026-10-28 評估）。
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
