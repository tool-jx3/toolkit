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
| speech-bubble | [aokmri/dp-cardmaker](https://github.com/aokmri/dp-cardmaker) | 未授權 | 單一泡泡插圖、PDF 匯出 | 可考慮（泡泡插圖比較值得） | 小～中 |
| （共用層） | 同上 | — | 原作提到 iOS 的 IndexedDB 連線被切斷後沒重連、預先存的 Blob 取不回來；本站 `core/storage/idb.ts` 沒有重連 | 有 iPhone 時確認再決定 | 小 |
| chat-window | [shiki365/chat-window-maker](https://github.com/shiki365/chat-window-maker)（v1.12，`964cffc`，2026-10-30；本站看到 v1.11 `61dd431`） | MIT | 新選項「訊息消失後視窗也消失」（要先開「過一段時間後消失」）：視窗的背景、外框、標題跟著最新一則訊息一起淡出，有新訊息再出現；純 CSS（`:has()` 看最新一則的奇偶、換 keyframe 名稱重播），OBS 31 以上才有效、舊版維持原樣；OBS 互動中（滑鼠在上面）時視窗維持顯示。原作的兩個秘匿範本預設開 | 值得跟進（秘匿分頁「送出才顯示」的直播用；本站的 `secret` 範本可以跟著預設開） | 小 |
| token-maker | [arcana-hanna/token-workshop](https://github.com/arcana-hanna/token-workshop)（`ce4c62b`，2026-11-01；2026-11-05 已跟進 `rle8` 相容、TW 的 WebP、軟選取、一鍵修邊、去光暈、去掉小縫隙、去雜點與填洞、套索、檢視遮罩、鍵盤操作、桌面尺寸預覽、漸層的色彩平衡，規格 F78～F89） | MIT | 還沒做的（規格 D33、D35～D38）：會分辨髮絲的筆刷與筆刷柔軟度；只匯出外框／只匯出出框／四個圖層的 ZIP；自己匯出的 WebP 也嵌設定（要另外的開關）；「配合外框調整圖片的顏色」；能量質感改成程式畫的閃電（數量、長度）、新外框 Ridge、7 組新的外觀預設（會改變既有的外框與預設，要重新和原作比對） | 筆刷與圖層匯出值得做；閃電、Ridge、新預設另外評估 | 中 |
| obs-tachie | [max-enterme/obs-tachie-generator](https://github.com/max-enterme/obs-tachie-generator)（`c485811`，2026-11-02） | MIT | 口パク（預設集可加一張張嘴的立繪，說話時用 `@keyframes` 步進交替，每週期 1～4 次）；「席」的輪替（一個瀏覽器來源當一個席，登記多位候選〔使用者 × 預設集〕，只顯示通話中的人、多人時取清單最上面的、沒人時不顯示）；切圖框可以拖邊角；使用說明頁 | 值得跟進（口パク小、席中） | 小～中 |
| music-frame | [zZnaptime/MVmaker](https://github.com/zZnaptime/MVmaker)（`0e3bf0a`，2026-11-04；本站看到 `b274729`，10-15） | 未授權 | 「背景模式」：多張照片輪播、慢速放大平移、曲目資訊靠左／中／右、文字底板（漸層、玻璃、無）、放專輯封面或封面＋唱片；封面模式的框架裝飾（線條、賽博、賽車、OS 視窗、舞台）；HUD 角落文字、跟著拍子動的封面與靈敏度；GIF 輸出（寬 480／720／960、10／15／20 fps） | 只參考功能；背景模式與 GIF 輸出最值得 | 中～大 |
| speech-bubble | [zZnaptime/Chat2Img](https://github.com/zZnaptime/Chat2Img)（`945b953`，2026-11-04） | 未授權 | 字寬（50～150%，只在畫的時候橫向伸縮） | 小項，併進字型設定 | 小 |

## 二、新工具候選

| 候選 | 來源 | 授權 | 內容 | 跑團用途 | 工作量 |
|---|---|---|---|---|---|
| CoC 日誌分析 | [Liesegang/coc-ccfolia-tools](https://github.com/Liesegang/coc-ccfolia-tools)、[756y/SkillRoll_Analytics](https://github.com/756y/SkillRoll_Analytics)、[tukasa0001/DiceStats](https://github.com/tukasa0001/DiceStats)、[cp-20/dice-spec-v2](https://github.com/cp-20/dice-spec-v2) | 未授權／未授權／MIT／MIT | 從 CCFOLIA 日誌統計成長檢定、骰運。dice-spec-v2 的 `src/features/log-analysis/ccfolia/` 有 CoC 6／7 版、新舊 HTML、JSON 的解析器，附樣本與測試，可以當範本；成長擲骰可以和 coc-sheet 的「幕間成長」（見第三節）共用規則。2026-11-05 補：[yudukiak/emokloreDiceCheck](https://github.com/yudukiak/emokloreDiceCheck)（`a6f1ccc`，**MIT**，約 8 kB）讀 CCFOLIA 日誌裡エモクロア的 `DM<=` 指令、依結尾分七檔（ファンブル～カタストロフ）每人畫圖——可以做成「依系統切換成功等級」，做了萬用擲骰（BCDice）就用它的結果等級 | CoC 7 版團後整理；CoC 以外的系統（エモクロア等） | 中 |
| 分級表（Tier 表） | [Tetoriapot/character-attribute-maker](https://github.com/Tetoriapot/character-attribute-maker) 的 `tier-atelier/`（10-27～29，`0baa52d`；線上版 tetoriapot.github.io/character-attribute-maker/tier-atelier/） | 未授權（README 寫「現時點ではライセンスを設定していません」） | 分級可以增刪、複製、改名、配色、鎖定、收合、排序；文字與圖片項目（名稱、說明、標籤），拖曳／選目的地／前後鈕三種擺法，未分類區，多選與範圍選取一起移動，搜尋與標籤篩選，100 步復原；背景、文字、卡片設計與範本；PNG／JPEG／WebP、列印；圖片含在內的 JSON 備份與多個專案。10-28～29 加了分級標籤寬度（自動／手動）、整批隱藏圖片名稱、未分類 100 筆以上的虛擬捲動、標題可以不填、多選拖到刪除區一次刪除。rank-chart 規格 D1 寫過「分級表另外當新工具評估」 | 劇本、角色的 tier 表 | 中 |
| CoC 追逐面板 | [ichieh42/coc-chase-panel](https://github.com/ichieh42/coc-chase-panel)（簡中，10-28） | 未授權 | CoC 7 版的追逐：角色與載具卡庫（MOV 自動算）、速度檢定、地點軌、行動點、險境與障礙、衝突、載具事故、躲藏、中途加入、日誌、JSON 匯入匯出。規則速查要自己寫，不能抄規則書原文；Dancraft3746/COC7e-Investigator（第四節）也有追逐引擎與速度行動的計算，可以一起參考；[J-Guenther/coc7-chase-tracker](https://github.com/J-Guenther/coc7-chase-tracker)（`8208cac`，10-31，英文、未授權）：9 種地形、環境、速度檢定、逃脫與落後、險境與障礙的難度、依 DEX 的行動順序、突發險境、規則速查，也可以對照 | 追逐規則複雜，KP 常常略過不跑；放 G9 | 中 |
| Live2D 模型加動作 | [shinshin86/live2d-add-motion-sample-web-ui](https://github.com/shinshin86/live2d-add-motion-sample-web-ui)（`d89d5ee`，2026-10-22） | MIT（Live2D Cubism Core 是 Live2D 的專有授權；範例模型桃瀨日和不可再散布） | 不用 Cubism Editor、只改 `.motion3.json` 就替模型加動作：快樂、眨單眼、點頭、思考、驚訝、害羞、搖頭 7 種配方（照模型現有的參數，產生器＋驗證器），網頁上播放、單發／循環、對嘴（模擬、音檔、麥克風）、表情、臉部與上半身追蹤、錄製、OBS 串流頁。原作要 Python＋程式助手產生動作、本機伺服器播放，沒有線上版。本站要做就改寫成瀏覽器工具（讀模型 ZIP → 選動作 → 預覽 → 匯出 ZIP）；**前提是決定 Cubism Core 怎麼處理**：原作從 Live2D 的 CDN 載入（本站規則 6 不從 CDN 載 JS），放進 repo 要像 relation-chart 開授權例外，事業規模大時要 Live2D 的出版授權 | 用 Live2D 立繪跑團、直播的 PL／KP；和 anime-rig（PSD 的 2.5D 動態立繪）互補 | 大 |
| 卡牌列印與小冊子拼版 | [mephitrpg/rpg-cards](https://github.com/mephitrpg/rpg-cards)、[lukaszlasek/imposition-imp](https://github.com/lukaszlasek/imposition-imp) | MIT／MIT | rpg-cards：二十多種卡片尺寸、雙面對齊或只印正面、每頁張數、出血、裁切線（內容元素偏 D&D，版型自己做；圖示若用 game-icons.net 是 CC BY 3.0，要標出處）。imposition-imp：騎馬釘或多台拼版、雙面偏移校正、爬移補償，用的是本站已有的 pdf-lib | 實體團的道具卡、線索卡，自印劇本小冊子；放 G6，拼版也可以當 pdf-compress 的模式 | 中 |
| 直播小道具 | [TK2F/kasaneru](https://github.com/TK2F/kasaneru) | MIT | OBS 疊加層：倒數與正數計時器、時鐘、BGM 清單、輪盤、塗鴉、跑馬燈、擲骰；控制面板（OBS dock）和疊加層用 BroadcastChannel 溝通 | 「休息中」倒數、抽選輪盤、跑馬燈；本站 G4 都是 CSS 產生器，沒有這種互動疊加層 | 中 |
| 開鎖小遊戲（可考慮） | [pierretusseau/lockpick-minigame](https://github.com/pierretusseau/lockpick-minigame) | MIT | GM 設難度與時限，用連結或 QR 碼發給玩家，玩家輸入擲骰結果後轉環形卡榫開鎖 | 解謎道具（和 crossword、scratch-card 同類），可改成 CoC 鎖匠的成功等級 | 中 |
| 匿名論壇貼文 | [dearmysn1p3r/DearMySn1p3r_05](https://github.com/dearmysn1p3r/DearMySn1p3r_05)、[_09](https://github.com/dearmysn1p3r/DearMySn1p3r_09) | 未授權 | 匿名討論串截圖（作者與留言者自動編號、回覆、反應數） | 現代背景的都市傳說 handout | 中 |
| 電影字幕／片尾名單 | [dearmysn1p3r/DearMySn1p3r_15](https://github.com/dearmysn1p3r/DearMySn1p3r_15)（可併 [_40](https://github.com/dearmysn1p3r/DearMySn1p3r_40)、[_18](https://github.com/dearmysn1p3r/DearMySn1p3r_18) 封面） | 未授權 | 字幕截圖、片尾名單捲動、海報、評分卡、預告 | 團報宣傳、戰役結束的片尾名單 | 中～大 |
| 角色貼圖組 | [dearmysn1p3r/DearMySn1p3r_39](https://github.com/dearmysn1p3r/DearMySn1p3r_39) | 未授權 | 去背、文字、14 種動作、ZIP 匯出 | Discord／CCFOLIA 表情圖 | 中 |
| 圖片晃動動圖（Jiggle Jiggle Studio） | [dearmysn1p3r/DearMySn1p3r_57](https://github.com/dearmysn1p3r/DearMySn1p3r_57)（`17e41b8`，2026-11-04 大改） | 未授權 | 心跳、彈跳、搖晃、波浪、打字、轉一圈等動作與強度；裝飾、文字、色調（亮度、對比、色溫、色相、膠片雜訊）；背景（單色、漸層、彩虹、格紋、點點、條紋、可流動）；1:1／4:5／3:4／9:16／16:9；GIF（fps、長度、抖色）或 PNG；「我的組合」。本站的 emotion-maker、video-anim 要先比對重不重疊 | Discord 表情、角色的動態頭像 | 中 |
| 隨機表按鈕（CCFOLIA 的 `/roll-table`） | [Tetoriapot/scenebutton-maker](https://github.com/Tetoriapot/scenebutton-maker)（`e23bb3b`，v0.2.0，2026-10-30 建 repo） | 未授權（repo 只有建置後的 `site/`，沒有原始碼與 LICENSE；只參考功能） | CCFOLIA 的螢幕面板可以設「點了送出聊天文字」，放 `/roll-table` 指令就變成點一下抽表的按鈕。原作：隨機表編輯（表名、1D6／2D6 等骰式、出目可寫範圍 `1-3`、缺漏與重複的檢查）、試擲與機率分布、貼上指令或 TXT 讀入；按鈕圖（字型、邊框、背景、圖示、底圖、圓角）→ PNG 或 ZIP；多個面板的盤面配置（格線吸附、對齊、等間隔）；輸出只有面板的房間 ZIP，或把面板加進既有的房間 ZIP。本站已有零件：scenario-editor 的 roll-table 輸出、room-zip 的螢幕面板與房間 ZIP 讀寫（要先確認新建面板能不能寫點擊動作）；CCFOLIA 的官方說明在這個環境連不到。做隨機表編輯器時，語法可以參考 [script-wizards/perhaps](https://github.com/script-wizards/perhaps)（`d0423d0`，Apache-2.0，clean-room 的純文字隨機表規格與約 600 行零相依的引擎：`[表名]` 參照、`^2` 權重、`{a|b}`、`{2-8}`、骰式、不重複抽、對單一節點重抽；沿用要附授權全文與 NOTICE）。2026-11-05 補：[imozonokan/coconfort-roll-table-tool](https://github.com/imozonokan/coconfort-roll-table-tool)（`82a8d6e`，2026-06-12，未授權）一行一項的文字 → `/roll-table`（`1D項數`）與 `choice[A,B,C]` 互轉。隨機表的引擎：本站已經有 fantasy-gen 的 `web/src/tools/fantasy-gen/engine.ts`（照 mshea/lazy_gm_tools 的 `generator.js` 改寫，CC0：`{表名}`、`^N` 權重、`{a|b}`、`[[a-b]]`、`{表*N}`、欄、種子、檢查），做這個工具時搬到 `@/core`（fantasy-gen 規格 D8） | 遭遇表、傳聞表、瘋狂表、探索點的「調查」按鈕：KP 在房間放一排點了就抽的按鈕 | 中 |
| 音樂盒房間（CCFOLIA 的點擊動作） | [KumachanSteps/trpg-web-tools](https://github.com/KumachanSteps/trpg-web-tools) 的 `tools/ccfolia-jukebox-maker/`（v0.18，`1605a25`，2026-11-04） | 未授權（README 寫公開不代表可以轉載、再散布、二次利用；只參考功能） | 用標記面板的「點擊動作」送 `/scene 場景名`，讓玩家自己換 BGM：播放器＋1～12 張唱片（場景名、曲名、標籤色、BGM），每個場景把唱片移到播放器、架上留空；「停止中」場景；封套樣式；場景連線圖與重名／缺場景的警告；瀏覽器內試玩；讀寫房間 ZIP（`clickAction: { type: 'message', text: '/scene …' }`，作者 11-04 在 CCFOLIA 實測讀入；本站 `web/src/ccfolia/room.ts` 目前把 `clickAction` 當 unknown 原樣保留，room-zip 不能編輯） | 沒有 KP 的線上團、直播的點歌；可以併進 room-zip，或和「隨機表按鈕」合成一個「CCFOLIA 點擊動作面板」工具 | 中 |
| 視覺小說風的日誌回放 | [rururu222/ccfolia-novel](https://github.com/rururu222/ccfolia-novel)（`23c8583`，2026-11-03 建、11-04；單檔 `index.html`、韓文；畫面寫「original @2486_zip／edited @dabiCM__」，是轉手改作的） | 未授權（只參考功能） | 讀 CCFOLIA 的 HTML 日誌（另可加一份 JSON 補高解析度頭像與顏色），做成視覺小說風的回放：背景圖（依段落切換）、BGM、標題畫面、4:3／16:9／自訂尺寸、2 或 4 分割的立繪位置、每個角色的立繪位置大小與陰影、對話窗樣式、旁白、日誌編輯、自動播放，匯出成單一 HTML 的播放器。本站沒有（session-log 是文字紀錄、log-converter 只轉格式）；「不收的」裡的 Maple127667/trpg-replay 當時只有解析器 | 團後紀念、把戰報做成可以分享的回放 | 大 |
| 塔羅卡（優先度低） | [dearmysn1p3r/TarotAtelier_Maker](https://github.com/dearmysn1p3r/TarotAtelier_Maker)（`5c30db1`，2026-11-03，韓文） | 未授權 | 大阿爾克那 22 張的角色塔羅卡：圖與裁切、牌名／編號／關鍵字／解釋、正位逆位、字型、邊框與配色，PNG 與翻牌的 GIF | 占卜、塔羅主題劇本的道具 | 小～中 |
| 大圖分割（CCFOLIA 的圖片上限） | [chirorutyoco/split-compress-tool](https://github.com/chirorutyoco/split-compress-tool)（`90e322d`，10-29；原本在第四節） | 未授權（repo 只有 README，程式是 Releases 的 exe；只參考功能） | 把大圖切成 CCFOLIA 上傳得了的塊（README：每塊 1280×720 以內、未滿 1 MB），原解析度、拼回去無縫；PNG／JPG／WebP 與 APNG、動態 WebP；超過 1 MB 自動多切；切之前可以縮放；顯示每塊在盤面上要放的位置。本站沒有（ccfolia-cropper 是頭像裁切，map-fx、battlemap 只輸出整張）；上限要對照 CCFOLIA 官方（這個環境連不到） | 大地圖、全景背景放進 CCFOLIA | 小～中 |
| 萬用擲骰（BCDice，CoC 以外的系統） | [bcdice/bcdice-js](https://github.com/bcdice/bcdice-js)（npm `bcdice` 4.10.0，`868ddc5`，2026-08-05）、[bcdice/BCDice](https://github.com/bcdice/BCDice)（`8034de7`，2026-11-04） | BSD-3-Clause（程式；`UPSTREAM_LICENSE` 要重印版權聲明）。各系統的表與說明文的原權利人是出版社，出版社同意的條款沒讀到：只原樣顯示、不改寫、不另外收進本站的資料 | CCFOLIA 用的就是這套骰子指令：約 348 個系統（インセイン、シノビガミ、エモクロア、DX3、SW2.5、アリアンロッド、CoC 6／7 版、Cyberpunk RED、Blades、Fate…）。選系統 → 貼指令 → 看結果、成功等級、隨機表、D66；依系統動態載入、顯示系統的說明（多半是日文）。也可以當日誌分析的共用解析層。**先量大小**：npm 套件解壓 48 MB（全部系統），要實測只載一個系統＋Opal runtime 的 bundle | 台灣玩家在 CCFOLIA 打的指令離線先試、看各系統的表；CoC 以外的系統都用得上 | 中 |
| 探索回合與隨機遭遇追蹤 | [Sectr99/DungeonTracker](https://github.com/Sectr99/DungeonTracker)（`4851b98`，2026-10-26，純 HTML＋JS；原本在「不收的」的系統專用） | MIT（Copyright 2025 Sectr99）；規則照 SRD 5.1。頁尾寫「All non-SRD content reserved」：內建的遭遇表（怪物與設定文字）是作者的，不沿用 | 每按一次推進一個 10 分鐘探索回合、依門檻擲遭遇檢定 → 遭遇表、小時軌、關頁後照樣燒的火把計時、XP 分配、復原、上傳自訂遭遇表（CSV／JSON）。本站版做成通用的「時間經過＋隨機事件」（遭遇表自己做或讓使用者上傳），CoC 的探索與求生劇本也能用；可以併進先攻與戰鬥追蹤（combat-tracker，2026-11），或做成同一組的 GM 工具 | D&D 在台灣中～低；通用版較高 | 小～中 |
| 謀殺之謎（マダミス）GM 進行台 | [kaitoarcana/murder-mystery-gm-Tool](https://github.com/kaitoarcana/murder-mystery-gm-Tool)（`7fb4c78`，2026-08-23；`index.html` 約 466 kB＋`timer-window.html`） | 未授權（沒有 LICENSE），只參考功能 | 分段的階段計時器（另開視窗給玩家看）、各階段的 BGM、依判定結果切換場景與 BGM、GM 筆記（富文字、表格）、檢查表、得分表、遊戲記錄匯出。原作的 BGM 從 Google Drive 抓（要 API 金鑰），本站改成讀本機的檔案 | 台灣的謀殺之謎人氣高、缺 GM 進行的工具；和 scenario-timeline、ambience-mixer 互補 | 中～大 |
| 謀殺之謎的配役（希望順位） | 點子：[azumay-ybk/Madamisu_haiyaku](https://github.com/azumay-ybk/Madamisu_haiyaku)（`3fa61bc`，2025-12-02，只有一行 README、沒有程式） | 本站自己做 | 每位玩家把角色依希望排序，GM 得到配對結果：總名次最小（匈牙利法）或公平隨機、可以鎖定某人某角、可以標「不想要」 | 謀殺之謎與多角色劇本的分配；和 pair-maker、pl-profile 同系列；角色名自己輸入，沒有規則內容的問題 | 小 |
| 特技表工具（シノビガミ／インセイン） | [f-space/shinobigami-tools](https://github.com/f-space/shinobigami-tools)（`22fdee6`，2021-10，PureScript）、[choration-del/shinobigami-skill-selector](https://github.com/choration-del/shinobigami-skill-selector)（`51c33df`，2026-09-23）、[wqGGoxuL9pETugg/insane-ccfolia-converter](https://github.com/wqGGoxuL9pETugg/insane-ccfolia-converter)（`e149b1b`，2026-11-02；原本在「不收的」的系統專用） | f-space 是 MIT 但 README 請求「不要公開幾乎相同用途的競爭複製品」→ 只參考演算法、做出不同的版面與功能；其餘兩個未授權。冒險企画局的二次創作規定**不明**（見下面「其他系統的內容授權」） | 6 分野 × 11 項的特技表：シノビガミ缺特技時用相鄰特技代用的最短路徑；インセイン的習得、恐怖心、好奇心、5 條間隙、目標值與折返的 −2 補正；輸出 CCFOLIA 的棋子（チャパレ）。**只做計算與版面，特技名稱讓使用者輸入或匯入**（insane 轉換器也「不內建效果文與各種表」，值得照做） | 台灣的シノビガミ、インセイン玩家（中） | 中 |
| 招團貼產生器（點子） | 參考：[masquevil/trpg-saikou](https://github.com/masquevil/trpg-saikou)（GPL-3.0，只參考功能） | 本站自己做 | KP／社團／店家可帶的劇本清單、籌備中的劇本，排成一張圖發招募貼（系統、人數、時數、地雷、時段） | 台灣在 Facebook／Discord 招團；和 pl-profile、scenario-cards 同類 | 小～中 |

## 三、可以併進現有工具

| 併進 | 來源 | 授權 | 補什麼 | 工作量 |
|---|---|---|---|---|
| combat-tracker、5e-calc | 本站（2026-11 引入時沒做的；combat-tracker 規格 D5、D9，5e-calc 規格 D3、D6；功能參考 M-ybeme/Initiative-Tracker〔MIT，第四節〕） | SRD 5.2.1、A5E SRD 是 CC BY 4.0；OGL 1.0a 的 Kobold Press 書不收 | 怪物資料庫（只收 SRD 5.2.1 的怪物：搜尋帶入 HP、AC、先攻，5e 速查計算的遭遇也能選怪物）；反應與傳奇動作的計數、戰鬥紀錄（每次 HP 變化，可匯出）、常用參戰者的範本、專注檢定直接擲、0 HP 自動加昏迷；A5E 的狀態（困惑、厄運、緩慢、疲勞與心神不寧的等級） | 中～大 |
| fantasy-gen | [Level Up Advanced 5e 的 A5ESRD](https://a5esrd.com/)（EN Publishing；lazy_gm_tools 也收了它的法術） | CC BY 4.0（要放 A5ESRD 的署名文） | 法術來源加「Level Up A5E」：遺物、法術捲軸、法術書、獨特武器與護甲可以選 A5E 的法術（約 370 個，名稱與環位要另外翻譯；fantasy-gen 規格 D2，主控 2026-11-06 記下） | 中 |
| npc-names | 本站（主控 2026-10-29：D16 的副作用先接受） | — | 拉丁字母的地區（英國、美國、俄羅斯、北歐、奇幻、韓國）同一批可能有重複的姓或名（不重複只以全名判斷）；之後可以選擇像原站一樣把姓與名各自洗牌配對，同一批裡名與姓都不重複（要和鎖定、種子一起設計） | 小 |
| npc-names | [弄墨 Inknomu《角色姓名產生器》](https://inknomu.com/namegen/) | 資料 CC BY 4.0；程式未授權 | 組合模式的收藏匣與合成（姓＋名拖曳組名、長度上限）、語音朗讀（瀏覽器內建的 speechSynthesis）；2026-10 導入語料時沒有做（規格 D12）。原站的資料包更新時用 `web/scripts/inknomu-names.mjs` 重跑（SHA-256 不同會停下來） | 小～中 |
| log-converter | [Pumpkin-Duck/COC-TRPG-LOG-TOOL](https://github.com/Pumpkin-Duck/COC-TRPG-LOG-TOOL)（11-03 加了 4 個暗色主題、從 Discord HTML 自動偵測角色名字色、一鍵單色） | 未授權 | 匯入 Discord 日誌（DiscordChatExporter HTML）、KP／HO／PL 資訊區、目錄；作者寫繁中。另外兩個小功能：同一分頁多次匯出時自動合併重疊的部分（[yurisianne/ileelog-backup-trial](https://github.com/yurisianne/ileelog-backup-trial)）、列出疑似打錯的檢查清單（[Hoo21/ccfolia-log-converter](https://github.com/Hoo21/ccfolia-log-converter)），都未授權 | 中 |
| speech-bubble | [zZnaptime/Chat2Img](https://github.com/zZnaptime/Chat2Img)、[dearmysn1p3r/DearMySn1p3r_42](https://github.com/dearmysn1p3r/DearMySn1p3r_42)、[CyberDelaai/commlink-ui](https://github.com/CyberDelaai/commlink-ui) | 未授權／未授權／MIT（commlink 的結構與範本可以沿用，附 UPSTREAM_LICENSE） | 靜態聊天截圖：聊天室外框（狀態列、標題列、輸入列）、引用回覆、系統訊息、圖片與貼圖訊息、已讀、長圖分割。Chat2Img v3.2（10-26）加了「遊戲」「劇本」台詞框主題（NEXT▼、AUTO／SKIP／LOG）、文字模糊遮住、上傳字型、貼圖；commlink 有說話者與頭像、左右邊、泡泡內圖片、時間、聯絡人連動、版本快照、掃描線與故障效果 | 中 |
| coc-dice | [cp-20/dice-spec-v2](https://github.com/cp-20/dice-spec-v2) | MIT | 機率：CoC 7 版單次檢定各成功等級的機率（含獎勵骰／懲罰骰）、對抗檢定的勝率、任意骰子算式的分布圖（它的帳號、分享、付款用 Firebase＋Stripe，不收） | 小～中 |
| coc-dice | [3d-dice/dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) | MIT | 3D 擲骰（three.js＋cannon-es，本站都已打包）；可以指定結果（`1d100@1`），能匯出「01 大成功」「100 大失敗」的透明 WebM／APNG 演出素材。最後 commit 是 2022-10，要自己維護 | 中 |
| coc-sheet | 本站（原本參考的 QTR-Games/Eldritch-Ledger〔CC0〕2026-11 已經 404，組織沒有公開的 repo） | — | 幕間成長精靈：替勾選的技能一次擲骰、加上成長值（本站只有成長勾選框），照 CoC 7 版的成長規則自己做；可以和「CoC 日誌分析」共用規則（COC7e-Investigator 也有團後成長，未授權、只參考） | 小 |
| char-chart | [utiyoso/cross-chart-maker](https://github.com/utiyoso/cross-chart-maker)（10-27～11-01，`42e6e93`） | 未授權 | 四象限的外觀：依氣氛產生漸層背景加顆粒、標題與軸名的字型和描邊、自動配對比色、臉部圖示、對話框；10-29 文字預設改成白框黑字／黑框白字；11-01 加了臉部圖示的「指定色去背」（從外圍填滿、保留眼白）與「我的範本」（最多 10 組）；功能和本站重疊，優先度低 | 小～中 |
| anime-rig | [shinshin86/still2rig-psd](https://github.com/shinshin86/still2rig-psd) | MIT | 用 see-through 組成「相容 Anime2.5DRig」的 PSD，多了表情圖層（`eyes_angry`、`eyes_sad`、`eyes_half`、`eye_smile`、`mouth_laugh`、`mouth_frown`、`tears`、`sweat` 等）；本站只認 `mouth_open`／`mouth_close`／`eye_close`，可以補表情切換。要先拿一份樣本 PSD 試讀 | 小～中 |
| handout-maker、lock-screen | 共用的 `core/qr`（qr-maker 的造型 QR 與讀得出來的檢查） | 本站 | 真的掃得出來的造型 QR 碼（點的形狀、中間放圖示），直接用 qr-maker 的設定 | 小 |
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
| anime-rig | [shinshin86/mesh-avatar-studio](https://github.com/shinshin86/mesh-avatar-studio)（Player：https://shinshin86.github.io/mesh-avatar-studio/play/） | MIT（範例角色 Miko 另有條款，不放進本站） | 光照（拖曳光源、跟著動的陰影、最多 8 組預設與快捷鍵）；讀入 .mavatar 檔播放（可用 npm 的 mesh-avatar 執行環境，MIT）。做 .mavatar 本身要原作的本機 Studio＋程式助手＋Python，網頁上做不到；使用者 2026-10-25 決定先不做（10-24 之後原作加了可開關的配件圖層、Rust 原生版與 macOS 桌面版、`npm run create`，決定不變；11-04〔`99f977c`、runtime 0.7.1〕布料物理、手臂、站姿重心、攝影機身體追蹤進了 main〔標實驗性〕，另有虹膜移動量、表情的嘴張開程度、播放器用麥克風偵測說話） | 小～中 |
| anime-rig | [sayaka-aiart/StandRig](https://github.com/sayaka-aiart/StandRig)（`6938a2d`，0.2.0，2026-10-31；之後加了角度曲面、三軸關鍵形與大模型的效能，還沒到 0.3.0） | Apache-2.0（另有 NOTICE；依賴 ag-psd、pako 等 MIT） | 讀入 StandRig 的 `.srig`（內含圖片的模型 JSON）播放：變形器（warp、shared warp、glue）、混合形狀、物理、表情與「あいうえお・無音」的口形、`.exp3.json` 表情、動作 JSON；接本站的攝影機追蹤、麥克風嘴型、透明匯出（等於 Windows 版 StandRig Connect 的網頁版）。不當新工具：做模型要在本機跑 Node 服務、由支援 MCP 的 AI 助手編網格與變形器，只讀 PSD 不會動，靜態網頁做不到。使用者 2026-10-30 決定先不做：`.srig` 只有用過 StandRig＋AI 的人才有，格式還在 0.x（0.3.0 才定 `runtimeCompatibility`）；原作的播放與求值約 4,000～6,000 行 | 中～大 |
| npc-names | 內政部《全國姓名統計分析》PDF 的「各出生年代常見名字」與名字字數統計（ris.gov.tw 在這個環境連不到） | 政府資料開放授權條款第 1 版 | 台灣的名字依年代分、加單名（規格 D1）；另外日本 2000 年後出生的名字（需要授權清楚的資料，D2）、英國 1920 年代的名字（D5） | 小～中 |
| scenario-editor | [sedn14636361/trpg-scenario-editor](https://github.com/sedn14636361/trpg-scenario-editor) | CC0 | 原作的 `/` 斜線候選清單（規格 D46；跟進 v3.26 時決定先不做） | 小 |
| music-frame | [dearmysn1p3r/MOMO_MusicCloud](https://github.com/dearmysn1p3r/MOMO_MusicCloud)（取代 _16／_27／_54） | 未授權 | 黑膠、CD、卡帶、串流的樣品圖、播放清單影片；原作 10-17～10-20 大改，10-25 只有一個小修，已經穩定 | 中 |
| floor-plan | Maptsukuri（maptsukuri.pages.dev，不在 GitHub） | 未授權 | .dd2vtt 匯出、隨機配置 | 中 |
| ui-frame | [knightleft/trpg-overlay](https://github.com/knightleft/trpg-overlay)（原本列為新工具候選「直播版面產生器」） | 未授權 | OBS 直播版面（作者寫繁中）：和 ui-frame 的 TRPG・直播模式重疊，可以補整面版面配置 | 中 |
| floor-plan | KIIN「マップ制作スタジオ」v2.0（使用者 2026-11-05 上傳；第一批〔夜的光源、內裝預設、圓形配置、細角度與倍率、整張地圖的變形、地板、船的素材、下繪圖、揭露用的圖、自由線〕與第二批〔曲線的房間 15 種與形狀的切換、沿著曲線的牆與門窗、家具照外形、甲板的欄杆與段差線、甲板上的打通兩間房、送給地圖演出產生器的曲線範圍、客輪範本〕2026-11-05 做完，規格 1.27、1.28、D84～D105） | 視同未授權（BOOTH 的商品） | **沒做的**：曲線牆上的家具沿著切線轉向（KIIN「曲線の壁に沿う家具の向き」；本工具貼曲線時仍是 0／90／180／270°，要改自動擺放的碰撞，D101）；放在曲線上的門的開門範圍與門前一格照直的位置檢查（近似，D100）；石牆、隔音牆、有裂痕的牆、崩塌的牆、岩壁沿著曲線的花紋（曲線上畫成實心的粗線，D99）（以上主控 2026-11-05 同意留下） | 小 |
| floor-plan | 本站（2026-10-29 改 L 形範本時沒改的，規格 D81） | — | 辦公大樓 8F、劇場 B1 的轉角走廊照同樣的做法改成 L 形（要重驗格局與線索位置、更新匯出 PNG 的基準） | 小 |
| ambience-mixer | 本站（2026-10-29，規格 D1、D23） | — | 另找逐檔標明 CC0 的真實錄音內建（使用者 2026-10-29 選了「收逐檔標 CC0 的錄音」，這個環境連不到 Freesound 等來源，等開網路）；在 CCFOLIA 試聽一次 MP3 的循環接縫（預設是 MP3，聽得出接縫就改回 WAV，D23） | 小～中 |
| coc-sheet（建卡精靈） | [noechou/coc-investigator-generator](https://github.com/noechou/coc-investigator-generator)（`b72a4ed`，2026-10-30；簡中） | MIT（規則程式可以沿用，附 UPSTREAM_LICENSE） | 7 版建卡流程：8 項屬性擲骰 → 年齡修正（`src/domain/rules.ts` 的 `AGE_RULES`：各年齡段的屬性扣減、教育增強檢定次數、外貌扣減、15～19 歲幸運擲兩次取高）→ 職業點數的公式（EDU×4、EDU×2＋APP／DEX／STR／POW 取高等 7 種）與興趣點 → 技能分配與檢查清單；規則有約 770 行測試可以對照。本站 coc-sheet 只有職業 EDU×4／興趣 INT×2 的總數。不收：AI 人設（要 API 金鑰）、職業與技能清單（`catalogs.ts`，含規則書內容，要自己整理）、開團面板（和 CCFOLIA 重複） | 中 |
| family-tree | [Sectr99/Lineage](https://github.com/Sectr99/Lineage)（`47ffdbb`，2026-10-30 新建） | MIT（只取點子：它用 React Flow＋ELK，和本站不同） | 遺傳特質：替人物加特質（是否遺傳；受影響／帶因／未受影響／不明），父母受影響或帶因時子女自動標「帶因」（只標有沒有風險、不算機率，手填的不覆蓋）。其他功能本站已有（relation-chart、多個圖板）；優先度低 | 小 |
| session-calendar | [knightleft/tw-calendar](https://github.com/knightleft/tw-calendar)（`ee16ee6`，v0.63，2026-10-29；繁中、台灣假日；底本同樣是 utiyoso/taku_calendar） | 未授權（只參考功能） | 「直播曆」的週曆：三種樣式（7 欄格子、一天一列、一天一張直卡）、4:3／16:9／9:16、休息日、強調日（光暈＋徽章）、每天的貼圖、社群連結貼紙、圓形頭像、配色（輪替、從圖取色、命名儲存）、標題描邊。本站只有月曆與年曆。不收：v0.63 的 Google 帳號同步 | 中 |
| session-log、log-converter | [FreecellRaid/Freecell-log-studio](https://github.com/FreecellRaid/Freecell-log-studio)（v1.4.4，`7e1a3a5`，2026-11-04；10-29 建，簡中） | MIT（Vue 3，和本站不同，只取做法；沿用規則文字要附 UPSTREAM_LICENSE） | 日誌整理的流程：多來源匯入、依日期自動分場景（可以拆、合、拖曳重排）、身分管理（依角色名或帳號聚合、批次改名、指定 PL／NPC／KP／骰子／觀眾）、自訂染色規則（優先順序、多條件）、搜尋與篩選、**自訂匯出範本（佔位符語法）與即時預覽**、TEXT／HTML／DOCX 匯出、專案快照 | 中 |
| tile-map | [deukrezia/trials](https://github.com/deukrezia/trials)（`dd4f118`，2026-11-05；主控 2026-11-05 裁定這一批不做，規格 D6、D19） | 未授權（程式） | ①讀原作的地圖檔 `.vttmap.json`（圖片是 data URL；Kenney 的圖塊對應得到 `ks:`／`kt:`，原作自己的預設圖塊對應不到、要略過並提醒）；②單一圖塊組的檔案（原作的 `.brushpack.json` 匯出與「Open brush pack…」讀入，F55；目前用圖庫備份代替） | 小～中 |
| log-converter | [sealdice/story-painter](https://github.com/sealdice/story-painter)（v2.5.5，`71bb5c1`，2026-10-31；Vue 3＋CodeMirror 6） | **MIT**（Copyright fy；沿用要附 `UPSTREAM_LICENSE`） | 簡中圈的日誌**讀入格式**：海豹（SealDice）、QQ 匯出（含 `[CQ:image]`）、Dice Kokona、SinaNya、FVTT 匯出、已染色的文字（`src/logManager/importers/`）；**輸出**：論壇（BBS）格式、DOCX；染色編輯（角色配色、隱藏角色、括號判斷場外發言、隨機柔和色板）。不收遠端日誌 API 與 QQ 圖片的刷新（外部服務）。只加「讀入海豹／QQ 日誌」比整套搬進來合理（台灣：低～中，會收到簡中玩家的日誌） | 小～中 |
| log-converter | [gyoppoko-works/cocofolia-json-log-tool](https://github.com/gyoppoko-works/cocofolia-json-log-tool)（`ce5aa1a`，2026-09-08，單檔） | 未授權（只參考功能） | 讀 CCFOLIA 的 **JSON 日誌**（`data.messages[]` 的 `name`、`color`、`text`、`channelName`、`createdAt`）。CCFOLIA 似乎新增了「ログ出力＋」，本站目前只讀 HTML；**要先拿真實的 CCFOLIA 輸出確認格式**（第二節「CoC 日誌分析」那列的 dice-spec-v2 也有 JSON 的解析器與樣本） | 小～中 |
| log-converter | [SKANA314/ccfolia_log_to_movie](https://github.com/SKANA314/ccfolia_log_to_movie)（`a061421`，2026-09-08） | 未授權 | 日誌轉成 VOICEVOX／COEIROINK／ゆっくりムービーメーカー4 的台本（txt、csv）：改角色名、指定聲音的樣式、拿掉某些角色（PL 閒聊）。台灣用的語音合成不同，優先度低 | 小 |
| character-editor | CoC 以外系統的 CCFOLIA 角色範本（參考：上面「特技表工具」的 insane-ccfolia-converter、[Gurei-471/MagicaLogiaCcfoliaExport](https://github.com/Gurei-471/MagicaLogiaCcfoliaExport)〔MIT，jQuery〕、tororo4096/dnd_ccfolia〔未授權〕等） | 轉換器多為未授權；規則內容的授權見「其他系統的內容授權」 | インセイン、シノビガミ、エモクロア、ダブルクロス、D&D 5e 等的「系統範本」：欄位 → 算能力值 → 產生 `status`／`params`／`commands`（チャパレ）／`memo`。欄位、公式、チャパレ的範本自己寫；**不抓外部的角色卡網站**（キャラクター保管所、ゆとシート：外部 API）；不內建規則書的效果文與各種表（D&D 用 SRD 5.1／5.2 的英文自己翻） | 中 |

## 內部改善

- anime-rig 的 see-through 深度換算（規格 §3.7：倍率 0.5～20、太平門檻、換算與不換算的部位）是用合成資料調的；拿到真實的 see-through 輸出
  （PSD＋`_depth.psd`＋`.psd.json`，線上試用或本機 `--save_to_psd`）時看轉頭的觀感再校正（2026-10-27）。
- 共用 ui 區塊（2026-10-30 把只有少數工具用的 36 個元件改成各自的入口之後是 651 kB，DESIGN.md 4.0「分開的入口」）還收著 `ExportPanel`（31 個工具用）連帶的編碼器：它從 `core/timeline/export` 拿 `EXPORT_FORMATS`，那個檔案 import 了 GIF、APNG、PNG 調色盤等編碼器。把格式的說明拆成不含編碼器的檔案（或把 ExportPanel 也改成分開的入口），沒有匯出面板的 53 頁（含首頁）每頁可以再少約 73～78 kB（gzip 27～29 kB）。試做過只把 ExportPanel 改成分開的入口：用到它的 31 頁每頁多 0.5～0.9 kB（gzip 約 +2.7 kB，多 7 個檔），所以這次沒做。另外留在總入口的 15 個小元件也搬出去的話，每頁再少 13～16 kB（gzip 3～5 kB）。
- 共用的 `ImageFrameDialog` 的兩指縮放可以換成 `createPointerGesture`（`@/ui`，color-palette 的配色卡照片用的）：中點縮放、放開一指接著拖。
  換的時候要回歸測試所有用到它的工具（color-palette 併入配色卡時發現，2026-10-28）。
- pdf-compress 打包的 pdf.js 標準字型裡，Helvetica 的後備是 Liberation Sans 1.07（GPL-2.0 with font exception，原樣單獨散布）；可以換成度量相容的 Arimo（Apache-2.0）或 Liberation 2.x（OFL），用同樣的檔名放進對照表（驗證者建議，2026-10-28）。
- 共用 ExportPanel 換格式時把整組設定（含倍率）交回給工具：PNG 以外的格式不傳倍率的工具，切回 PNG 時倍率會變成 100%（social-post 已在工具裡修正，2026-10-28 驗證時發現）。查一遍用到 ExportPanel 的工具。
- ToolShell 的「說明」對話框關閉後焦點沒有回到「說明」鈕（落在 body；height-board 驗證時發現，2026-10-28）。
- 2026-10-31 全部 e2e（負載高）各失敗一次、單獨重跑 3／3 通過的兩個：`text-fx.spec.ts:961`（SF 標題匯出 APNG 的決定性：兩次匯出的位元組不同；ui 拆入口的驗證時也在負載下失敗過，像是兩次匯出之間有字型或資源載入完成），`floor-plan.spec.ts:1789`（分享連結與房間編號：`waitForTimeout(450)` 之後的點擊卡到 90 秒逾時）。要查兩次匯出之間有什麼狀態會變、把固定等待換成等狀態。
- relation-chart 的 e2e「畫布：拖曳、碰撞推擠…」（Esc 後 focus-active 沒消）偶發失敗：main 35 次失敗 1 次；和 hover 重新設定有關，待查。
- relation-chart 的單元測試 `relation-chart-b3.test.ts`「改名＝改這件變體…一步復原」在全部 vitest（484 個檔同時跑）時失敗一次（復原後第 2 個分頁不見了：復原退得比改名多一步），單獨重跑 3／3 通過、CI 通過（2026-11-05）；像是復原的合併看時間，負載下兩個動作被合成一步，待查。
- 2026-11-05 新容器（Playwright 1.56.1 預期 chromium 1194，這裡只有 1243，用 symlink 跑）的全部 e2e：下面 6 個在改版前的 `d2b20de` 也同樣失敗，和程式無關、待查（CI 不跑 e2e）：`acrylic-goods.spec.ts:880`（沉浸模式的 `[data-immersive]` 沒出現）與 `:294` 搖搖樂（serial）、`char-chart.spec.ts:957`（畫布像素還是白的）、`geo-bloom.spec.ts:163`（「只有正方形與雙正方形」那組的雜湊和原作不同，可能是新版 V8 的數學函式）、`music-frame.spec.ts:875`（沒有 MP4 的選項：這個 chromium 沒有 H.264 編碼器）、`room-zip.spec.ts:726`（素材頁的「加工」等不到，90 秒逾時）。`room-zip.spec.ts:293` 在負載下失敗一次，單獨重跑 3／3 通過。
- 離開頁面時寫 IndexedDB 可能丟（tile-map 實作時發現，2026-11-05）：`pagehide`／`visibilitychange` 時才寫的資料，idb-keyval 不呼叫 `transaction.commit()`，頁面拿掉時交易會被放棄；tile-map 在自己的 `persist.ts` 改成交易一開就 `commit()`。world-map、floor-plan、relation-chart 等也在 pagehide 時寫，要逐一查；可以在 `core/storage` 加一個會 commit 的寫入方式給大家用。
- pdf-compress 的大檔結果打包 ZIP 時整份放在記憶體（`fflate` 的 zipSync）；大檔無損又沒變小時可能很吃記憶體，可以改成串流寫 ZIP。WORKERFS 讀取緩衝依賴 qpdf-wasm 0.3.0 壓縮後的內部名稱（找不到時退回不緩衝，有測試），升級 qpdf-wasm 時要再看。
- map-fx 的 e2e「進階 3D：…復原（F74～F76、F82）」（`map-fx.spec.ts:1108`）在 2026-10-28 的 main（838ddea）連續 3 次失敗：方向鍵連按 3 次後 Ctrl+Z 只復原最後一步（房間 x 是 98、應該是 96）。合併靠共用 store 的 `coalesceMs`（0.4 秒），按鍵間隔一超過就拆成兩步；前一次全部 e2e 時是通過的，像是跟機器速度有關。要查是預覽每次按鍵重畫太慢，還是測試要改成不受時間影響。
- 分享連結對話框（`ShareLinkDialog`）關閉後焦點落在 body：2026-10-29 加了選填的 `returnFocus`（ambience-mixer 用），scratch-card、clue-map 還沒傳（ambience-mixer 驗證時發現）。
- CSV 匯出的公式注入防護：`core/csv` 2026-10-29 加了選填的 `guard`／`guardFormula`（scenario-timeline 用），session-log、npc-names 等其他匯出 CSV 的工具還沒用。
- PL 檢視時專案選單的一致性：scenario-timeline 的 PL 檢視停用「開啟、重設、載入範例」，family-tree 的 PL 檢視可以開啟與重設；之後統一（scenario-timeline 驗證時發現）。
- family-tree：Ctrl＋滾輪（含觸控板捏合）改成依位移量連續縮放（scenario-timeline 的做法）；SVG 嵌字改用共用的 `googleFontSubsetCss`（`@/core/fonts`，2026-10-29 新增）。

## 四、先觀察

- HTML-in-Canvas（`<canvas layoutsubtree>`＋`drawElementImage`，Chrome 的 origin trial）：可以把真的 HTML／CSS 畫進 canvas，
  之後若正式上線，handout-maker、prose-card、social-post 這類「用 canvas 自己排版」的匯出可以改用它（直書、ruby、CSS 效果），也能對 HTML 介面套 WebGL 效果。
  使用者 2026-10-27 提供的示範 [matchachoco010/demo-html-in-canvas-bot-dashboard](https://github.com/matchachoco010/demo-html-in-canvas-bot-dashboard)
  只是 Discord 語音 bot 的儀表板示範（只有建置後的檔案、沒有授權），本身不收。
  2026-10-30：據 Chrome 的更新文章（搜尋摘要，developer.chrome.com 在這個環境連不到，沒讀到原文）Chrome 155 起 `layoutsubtree` 改成 `content="drawable"`、子元素各自加 `drawable`，`drawElementImage` 不再回傳變換矩陣，WebGL／WebGPU 的方法改名，試用期延長（新的期限沒查到）；API 還在變，維持觀察。
- [KumachanSteps/trpg-web-tools](https://github.com/KumachanSteps/trpg-web-tools) 的 `text-apng-maker-ex` 分支：擲骰結果演出（星空、夢、吸血鬼、萬聖節）、戰鬥演出；合進主線後再評估併進 text-fx（11-05 看：仍停在 10-20 的 `0b1e82f`，沒合併）。
- くま。的 OBS TRPGサポーター v0.1（同一個 repo）：還在開發中；要做的話只做透明覆蓋層。（10-30 看：分支仍是 10-21 的 `c129788`，沒動）
- くま。的「TRPG背景サジェスト v0.10」（同一個 repo 的分支 `claude/project-thread-d2do1c`，10-26）：替自己電腦裡的背景圖資料夾加標籤（檔名、顏色、可選的 CLIP 模型），再依劇本文字逐場推薦背景；進 main 再評估（標籤詞庫是日文）。（10-30 看：`41dbe3f` 沒動）
- [Roman-Serius/GM-Terminal-Kit](https://github.com/Roman-Serius/GM-Terminal-Kit)：GM 用的復古終端機畫面；條款禁止再散布與改作，只能參考功能。
- [Liesegang/machitsumugi](https://github.com/Liesegang/machitsumugi)：架空日本地圖產生器，MIT，2026-10-22 建立。同類的架空世界地圖：[mewo2/terrain](https://github.com/mewo2/terrain)（MIT，演算法很短；對 CoC 用處低）。
- [Dancraft3746/COC7e-Investigator](https://github.com/Dancraft3746/COC7e-Investigator)（`6f3ab34`，10-30 一天 20 個 commit，繁中）：CoC 7 版的調查員終端（HP／SAN 的狀態、法術、典籍研讀、遭遇神話生物的 SAN 檢定、追逐引擎、Discord 骰指令、團後成長）。README 有 MIT 徽章但 repo 沒有 LICENSE（算未授權）；規則書內容寫在資料檔裡，不能抄。變動很快，穩定後再看（追逐的部分可以和第二節的追逐面板一起參考）。
- [magineco/charashare-general](https://github.com/magineco/charashare-general)（`b976f90`，11-02，MIT；11-02 修掉「範本的數值設定可以執行任意程式碼」的洞，加了固定列數的表格、CCFOLIA 棋子的參照 URL，還在每天改）：任意系統的角色卡範本編輯器（文字／數值／計算欄、跨欄參照、表格、圖片、可收合的分類），填卡、JSON 讀寫，**輸出成 CCFOLIA 棋子**（狀態、參數、備忘、聊天面板）。Google 登入與分享要作者的 OAuth 代理，另外嵌了 Analytics 與 AdSense（都要拿掉）。本站以 CoC 為主，有人要別的系統的角色卡時再評估。
- [Azgaar/Armoria](https://github.com/Azgaar/Armoria)（老專案，10-25 有 commit）：紋章產生器（純前端，程式 MIT，部分圖案是 CC BY-NC）。使用者想要時比照 Fantasy Map Generator，只在首頁的「其他網站」放連結（`azgaar.github.io/Armoria/`），不重寫。
- [usagineko7865-debug/mai-sound-studio](https://github.com/usagineko7865-debug/mai-sound-studio)（`28a1162`，11-03，未授權；battlemap 原作的作者）：音效板（音檔放在按鈕上、分頁、拖曳排序、單發／循環、起點裁切、音量到 500% 加限幅、MP3 響度正規化、備份）。目前只有驗證頁 `test/mix-test.html`，沒有 README 與授權說明；出了正式版再評估（本站的 ambience-mixer 是持續的環境音，沒有一鍵效果音）。
- Maptsukuri（floor-plan 參考了分享連結與房間編號）的作者標示：本站寫「GMW」；電ファミニコゲーマー的報導寫 pictSQUARE 在 10-19 免費公開「マップツクリ」、做好的地圖用在配布的劇本不必標出處（只看到搜尋摘要；maptsukuri.pages.dev 在這個環境連不到）。有網路時確認是不是同一個、作者名稱與利用條款，再改 ATTRIBUTION、README 與 floor-plan 規格。
- 2026-11-05（CoC 以外的系統）：
  - [M-ybeme/Initiative-Tracker](https://github.com/M-ybeme/Initiative-Tracker)（「The DM's Toolbox」v2.3.37，`1c4b9ac`，2026-10-17，**MIT**）：瀏覽器裡的 D&D 5e（SRD 5.2）GM 工具組——先攻、戰鬥地圖（迷霧、光環）、角色卡與升級、遭遇建構、437 個 SRD 5.2 法術（`data/srd/spells-data.js`，CC BY 4.0）、隨機店鋪／酒館／戰利品／NPC。只有 3 個 commit、約 11.8 萬行（大量 AI 產生），live-share 要後端、怪物圖鑑執行時從 Open5e API 取。先攻的細節（臨時 HP 先扣、0 HP 跳過、鎖定順序、玩家視圖）2026-11 已參考進 combat-tracker（沒用它的程式）；還沒做的列在第三節 combat-tracker；SRD 5.2 的法術資料等要做法術速查時再看。
  - [cr-lolo/VeilCast-VTT](https://github.com/cr-lolo/VeilCast-VTT)（`84a3ae6`，2026-08-21，**MIT**，單檔 287 KB）：給實體桌面用的 VTT——雙視窗、依桌面 DPI 校準格線、`.uvtt`／`.dd2vtt` 匯入牆門光源、射線可見度的迷霧、測量、先攻。特效來自 JB2A（CC BY-NC-SA）不可用、狀態圖示 game-icons.net（CC BY 3.0）。「迷霧＋射線可見度」與「實體桌面的比例校準」之後可以併進 map-editor／tile-map 的 GM／玩家雙視窗（另開視窗同步的共用模組 `@/core/mirror` 2026-11 已有）。
  - [andyaiken/dojo](https://github.com/andyaiken/dojo)（v15.34，2024-06 後停更，**MIT**）：React 的 D&D 5e GM 工具（怪物設計器〔SRD 5.1 怪物 637 KB〕、遭遇難度、戰術地圖、雙螢幕戰鬥管理、語言與名字產生器）。很大又停更，只取點子。[Valloric/statblock5e](https://github.com/Valloric/statblock5e)（Apache-2.0，2019）：怪物數值卡的版面（字型不是免費授權、範例文字是 WotC 的）。
  - 單人跑團的神諭表（本站沒有）：Ironsworn／Starforged 的資料 [rsek/datasworn](https://github.com/rsek/datasworn)（程式 MIT；文字資料 CC BY 4.0 與 CC BY-NC 4.0 混合，逐檔看 `source`）；現成的網頁多是 GPL 或沒有授權。台灣單人跑團少；要做就用自己寫的通用 Yes／No 神諭＋隨機事件表。
  - ダブルクロス的「骰池＋暴擊值」成功率：[nanasozai/DXprobability-calculator-app](https://github.com/nanasozai/DXprobability-calculator-app)（MIT，Python tkinter）只有公式可取，之後可以併進 coc-dice 的機率（通用的骰池）。

## 其他系統的內容授權（2026-11-05 整理）

CoC 以外的系統的工具常常內嵌規則書的資料（技能、特技表、法術、怪物、各種表）。做之前先看這裡；出版社的網站在這個環境連不到，**標「二手」的是搜尋摘要，採用前要有網路的人讀原文**。

| 系統 | 權利人 | 規定 | 重點 | 本站的做法 |
|---|---|---|---|---|
| D&D 5e（SRD 5.1 與 5.2） | Wizards of the Coast | CC BY 4.0（<https://dnd.wizards.com/resources/systems-reference-document>、<https://www.dndbeyond.com/srd>） | 已讀（lazy_gm_tools 的 `licensing.html`、Initiative-Tracker 的 README）。要放官方的署名文（英文原文）、說明有翻譯修改；只能用 SRD 裡的內容——DMG 的遭遇難度門檻、多數怪物與法術、子職業、Forgotten Realms 的專有名詞不在 SRD。**2026-11 已收**（combat-tracker、5e-calc）：SRD 5.2.1（狀態、死亡豁免、遭遇的 XP 預算〔Gameplay Toolbox 有這張表〕、CR → XP、點數購買、背景）、SRD 5.1（種族的加值），放在 `web/src/core/srd5/`（各資料夾的 `LICENSE.txt` 有原文的署名與本站的變更），頁面內的「關於規則內容」放署名；2014 DMG 的遭遇門檻與倍率沒收 | 可以收（翻成繁中、頁面內放署名文）；不碰 SRD 以外的 |
| Level Up A5e、Black Flag | EN Publishing、Kobold Press | A5ESRD、BFRD 1.0 都是 CC BY 4.0；Kobold 的 Tome of Beasts 等是 OGL 1.0a | 已讀（lazy_gm_tools）；OGL 1.0a 要附整份授權與開放內容的標示 | 只用 CC BY 的 |
| Pathfinder 2e Remaster／Starfinder 2e | Paizo | ORC License（<https://paizo.com/orclicense>） | 二手：要放 ORC Notice、標示開放內容；Paizo 的世界觀與圖不在內 | 要做時讀原文 |
| Blades in the Dark／Forged in the Dark | One Seven Design | SRD 是 CC BY 3.0（<https://bladesinthedark.com/node/33>） | 二手：只有 SRD；Duskwall 的設定、美術不在內；要放官方的署名文 | 要做時讀原文 |
| Ironsworn、Starforged | Shawn Tomkin | Ironsworn CC BY 4.0；Starforged 全文 CC BY-NC-SA 4.0、Reference Guide（神諭表）CC BY 4.0（<https://www.ironswornrpg.com/licensing>） | 二手；Datasworn 的 JSON 逐檔標 CC BY 或 CC BY-NC | 只用 CC BY 的檔 |
| Fate | Evil Hat | CC BY 3.0（<https://fate-srd.com>） | 記憶、未查證 | 要做時讀原文 |
| SW2.5、ダブルクロス、アリアンロッド、クトゥルフ神話TRPG（日文版）等 | TRPGライツ事務局（アークライト、KADOKAWA、グループSNE、新紀元社、F.E.A.R.、冒険支援） | 2021-10 公告（報導：ITmedia、KAI-YOU、4Gamer、電ファミ；官方 X @trpgrights；F.E.A.R. 的二次利用頁 <https://www.fear.co.jp/announce/nijiriyou_2_info.htm>） | 二手：對象含軟體；無償公開不必付費；不能寫「公式」「公認」、不能用 logo 與插圖；**能不能在工具裡收錄規則書的資料沒有找到明文** | 不明：只做計算與版面，資料由使用者輸入；不用 logo、插圖 |
| インセイン、シノビガミ、ネクロニカ等 | 冒険企画局 | 沒找到獨立的規定（是不是適用事務局的規定不明） | 不明 | 同上：不內建特技表與各種表的文字 |
| エモクロア | ダイスタス・チーム | 規定的網址不明 | 不明 | 同上 |
| BCDice 裡各系統的表與說明 | 各出版社（程式是 BSD-3-Clause） | — | 出版社同意的條款沒讀到 | 原樣顯示、不改寫、不另外收進本站的資料 |

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
  - 其他：2zH/trpg-dice（未授權；3D 骰子改看 dice-box-threejs）、3d-dice/dice-box（BabylonJS，比本站的 three 重）、
    chirorutyoco/Pasting-tokens（瀏覽器擴充）、ECgear/FitImage（命令列）。
  - 和本站重複：Tetoriapot 的 koyomi、style-atlas 等；dearmysn1p3r 的 ARCH 系列（_04、_37、_55）。
  - 系統專用（2026-11-05 重看）：LANCER（aritsune/lancer-athena、oliverGreo/Lancer-NPC-Helper 沒有授權；flippelt/lancer-briefings 是 MIT 但要 COMP/CON 匯出的資料）、HârnMaster（多是 Foundry 模組，mitchy9000/Harnmaster_live 沒有授權又要後端），仍不收；D&D 5e 地城追蹤（Sectr99/DungeonTracker）改列第二節「探索回合與隨機遭遇追蹤」；UH TRPG 找不到原本的 repo。
- 2026-10-30 掃描排除的：
  - 要後端、帳號或 AI：4855502irodori-rgb/takuawase（Supabase）、yukituguakane/trpg-character-app、origami0217/TRPG-Charactar-maker 與 Tetoriapot/character-order-room（AI 繪圖提示詞）、guinyd/coc-modules-archive、756y/Character_Collection_Room、s2ndrome 的 promm 等、dan0030/IF、AI GM／AI 劇本（autokeeper、tavern-trpg-assistant、llm-trpg-engine、trpg-ai-scenario-generator 等）。
  - 瀏覽器擴充、桌面程式：okamichi/trpg-voice-bridge、chirorutyoco/Pasting-characters、migawari558/TRPG_Canvas（Electron）、yaaayaaa/lipsync-studio、sevenc-nanashi/tachimi、KasparOrange/battlemap（Flutter）。
  - Foundry 模組、別的 VTT：magisterphamtom 的 coc7-* 與 ImproperSubset、JshGao 的 Foundry 模組；Xelltis/udonarium_axe（2026-11-05 重看：MIT，但是 VTT 本體、P2P 要自己架發 SkyWay token 的後端）。系統專用（2026-11-05 重看）：Sectr99/DungeonTracker 改列第二節；QTR-Games/Dragon-Codex 已經 404；片道勇者（elektlight/onewayhiroic：Firebase）、ダブルクロス（DX3pf.web 是線上平台、沒有授權；機率計算見第四節）、Cyberpunk 2020（whudsontosh/night-city-dossier 等 6 個都沒有 LICENSE，規則是 R. Talsorian 的）仍不收；最終物語、《奇點之後》（保留所有權利）找不到 repo。
  - GPL 或只是內容：MrShark/coc-generator（GPL-3.0）、LukaszDygon/call-of-cthulhu-solo（遊戲書）、tanis90/kwiat-paproci-zh（劇本翻譯）。
  - 和本站重複或用處低：lb9203/tabletop-token-maker（token-maker）、756y/CCFOLIA_Chat_Styler（log-converter）、sedn14636361/idea-board（通用白板）、mephitrpg 的桌遊棋盤；Maple127667/trpg-replay（日誌 → 視覺小說的回放，只有 Python 解析器；瀏覽器版見第二節的 rururu222/ccfolia-novel）。
- 2026-11-05 掃描排除的：
  - 要後端、帳號或 AI：Arbeit2025/trpgposter（Flask）、dan0030/danb、A-1ro/Arkhive、aemeath-projects/bookshelf、AI GM 與骰娘 bot（tkalk1225/trpg-game、xiangshu2026/rp-kp、leon5354/Coc_AI_Runner 等）；pierretusseau/lockpick-minigame 新加的排行榜（Cloudflare Worker）那部分。
  - 桌面程式、手機 App、擴充：utiyoso/scenario-manager 與 uchiyoso_kanri（BOOTH 販售的 Windows 程式，repo 只有宣傳頁）、arcana-hanna/dreamy-loop-editor（Electron＋yt-dlp）、asp0902/CCFOLIA_bookmarklet、wzizary/trpg-obr（Owlbear 擴充）、Foundry 的 CoC 角色卡。
  - CCFOLIA 轉換器（2026-11-05 重看）：インセイン（wqGGoxuL9pETugg/insane-ccfolia-converter）改列第二節「特技表工具」的參考；D&D 5e（tororo4096/dnd_ccfolia：沒有授權，法術表等是日文版規則書的翻譯、不是 SRD）與ゆとシートⅡ（SiawaseUnagi/ytsheet2-ccfolia-tool：沒有授權、靠ゆとシート的 JSON）仍不收，做法併進第三節 character-editor 的「系統範本」。
  - 授權不合或沒有授權的重複工具：guaner-334/civ-atlas（AGPL-3.0）、boto-coder/dice 與 1337exp/pkt-dice（3D 骰，未授權；coc-dice 已列 dice-box-threejs）、dan0030/pairinfo（和 pair-maker、relation-chart 重複）、dearmysn1p3r/CdPlayer_Maker（music-frame 已涵蓋）。
  - 和 log-converter 重複的日誌工具：misosiru714/log-theater、guri-dice/log-tools、shockdazou/ccfolia-log-editor、SIRUBEDON/CCfoliaLogConverterWithImages。
  - 資料庫或內容：Tetoriapot/machikado-menu-catalog（虛構店鋪菜單，無授權，資料不能沿用；「依時代與類型抽店鋪」的點子之後可以自己做）、smoke-archive、scenario-shikomi-note（只有 README）；garagaradom/ccfolia-streaming-css（MIT，幾行隱藏 CCFOLIA 介面的 CSS，chat-window 的直播說明可以參考）。
- 2026-11-05 晚（CoC 以外的系統）掃描排除的：
  - GPL／AGPL／非自由授權（只能參考功能）：Durtur/Dungeoneer、Athanasioust/Sanctum、farirpgs/fari-app（AGPL-3.0）；timblegoorn/Combat-Companion、andyaiken/forgesteel、adventurerscodex/adventurerscodex、derikb/character-sheet-app、jgalilea/solo-compass、masquevil/trpg-saikou（GPL-3.0；招團貼的點子在第二節）；HarmlessKey/Shieldmaiden（Functional Source License）；AozoraKotori/CPG-SW2.5（CC BY-SA 4.0）；hktrpg/TG.line.Discord.Roll.Bot（GPL-3.0、bot）。
  - 規則內容不能用：Traneptora/grimoire（MIT，但內容是 WotC 非 SRD 的法術全文）；jeffdyuyi/DND2024characterbuilder-2.0 與 5etools-cn（資料 CC BY-NC-SA、含非 SRD 內容）；rickluo94/dnd_5r_translation（Foundry 模組、2024 PHB 的翻譯）；tororo4096/dnd_ccfolia（日文版規則書的翻譯）。
  - 要後端、登入、外部角色卡網站或是桌面程式：Valforte/Initiative-Tracker（PF2e，Firebase）、codedealer/dndtrackr（Firebase）、TJCowx/5e-dm-tools（Tauri＋sqlite）、BigJk/snd（熱感應印表機）、dungeon-revealer（Node 伺服器）、yproxy-wq/MDMS_CueBook 與 lucky-muscle/murder-mystery-app（謀殺之謎，Firebase）、Logta/React_PalletMaster（Firebase）、SW2.5 的 Rast-Rabbit/sw2.5-consumable-counter（靠ゆとシート的 JSON）、Gurei-471/MagicaLogiaCcfoliaExport（靠キャラクター保管所；做法列第三節）、yudukiak/GobslaYutoCC（Chrome 擴充）、台灣的 skald.tw（要登入）。
  - 沒有授權的個人小工具、和本站重複或內容專用：ofmgdev/DM-Secrets、GilgameshofUT/ironvibes、SW2.5 的 HP／MP 與增減益小工具（elektlight、pppp-pear-qqqq、Yohi0619）、siiii-nemui/nica_cs_tool、denkiuo604/kotoribako-chatpalette（只對一個劇本）、herprolog/LHTRPGOutput、qwq-net/murder-memo（作者不要轉載）與 murder-board、new1u2sbf-ai/amatado（讀作者販售的 zip）、SekiT/tl-note（scenario-timeline 已涵蓋）、y-8-m/trpg-copy-helper、tikuwa-CoC/coc6-character-sheet、Nuts-ABCd/floria_canvas（專為一個作品）、LBTStudio/LIMBUS_BUILD_TERMINAL、RLHcompanion、NSSQ_CharacterSheet_tool；韓文圈只找到和 log-converter 重複的日誌備份與 AI 翻譯工具；AI GM／LLM 的戰役引擎（diceframe、AI-TRPG-D-D、dnd-agent 等）。
- [uemegu/AnimeVRM.Motions](https://github.com/uemegu/AnimeVRM.Motions)（https://uemegu.github.io/AnimeVRM.Motions/，2026-10-28 建立）：VRM 用的 80 個姿勢動作（Mixamo 格式的 FBX）配布站，用作者的 AnimeVRM engine 與角色「アオイ」預覽、在瀏覽器裡調呼吸的強度再下載。repo 與 engine 都沒有授權條款，動作檔也沒寫使用條件；`aoi.vrm` 的 VRM 授權是不可再散布、只限個人非營利。核心是動作素材，本站不能放，也不重做（2026-10-29 使用者決定只記下來）。之後若要做「讀自己的 VRM、擺姿勢、匯出透明 PNG 立繪」的工具，姿勢要另找授權清楚的來源或自己做。
- 需要後端或登入的（Supabase／Firebase）、瀏覽器擴充、bot、AI GM；其餘排除清單見檢查紀錄裡的報告。CoC 以外的系統（D&D 5e、日本的系統等）的工具 2026-11-05 起不再整類排除（使用者：收錄不限 CoC），逐項看程式與規則內容的授權。

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
- 2026-10-29：完成並移出清單——floor-plan 跟進原作 v1.15、geo-bloom 跟進原作到 `edb6828`、新工具「NPC 名字產生器」（npc-names，本站原創；coc-npc 加隨機取名）。
- 2026-10-29：使用者提供 uemegu/AnimeVRM.Motions，評估後不收（見「不收的」）。
- 2026-10-29：完成並移出清單——新工具「VTT 棋子產生器」（token-maker，參考 arcana-hanna/token-workshop、CyberDelaai/eidolon-ui、Sectr99/TokenForge，MIT）。
- 2026-10-29：使用者要求把 Azgaar/Fantasy-Map-Generator（MIT）加進首頁的「其他網站」：只連到原站（`azgaar.github.io/Fantasy-Map-Generator/`，英文介面），不重寫；從「不收的」移除。
- 2026-10-29：使用者提供 shinshin86/live2d-add-motion-sample-web-ui，評估後記進第二節（Live2D 模型加動作；要先決定 Cubism Core 的授權）。
- 2026-10-29：使用者要求 npc-names 導入弄墨 Inknomu《角色姓名產生器》（inknomu.com/namegen）的姓名資料包：8 個地區 29 個包都標 CC BY 4.0，全部導入（`/data/packs/<id>.json`，2026-10-29 取得）；原站的程式與中文參考譯名表沒有標授權，不沿用。一併做了原站的「輸出」（全名／只有名／只有姓）與組合模式的搜尋（查名字）；收藏匣與合成、語音朗讀沒有做（規格 D12）。實作完成、待對等驗證（PLAN.md 上游跟進表）。
- 2026-10-29：完成並移出清單——npc-names 導入弄墨 Inknomu 的語料、姓名（全名／只有名／只有姓）與查名字（對等驗證見規格 6.2、裁定 7.2）。
- 2026-10-29：使用者問日本／台灣／美國（依真實人數的名單）為什麼不顯示涵義，選了「人數名單抽出的姓或名，考據語料裡有同一個就附上那一筆的涵義並標出處」：
  npc-names 規格 F57（日本要讀音也相同、依年代的包順序、只顯示涵義不顯示備註；查得到的比例見規格 3.7），實作完成、待對等驗證（PLAN.md 上游跟進表）。
- 2026-10-29：完成並移出清單——npc-names 的人數名單也附涵義（F57；對等驗證見規格 6.3、裁定 7.3）。
- 2026-10-29：使用者要求做待做清單的三個新工具（環境音混音、劇本時間表／年表、PL 自我介紹卡／地雷表）與 QR Code 產生器（參考 kozakdenys/qr-code-styling）；另外上傳 KIIN 的「マップ制作スタジオ v1.0」，選擇併進室內平面圖產生器（自動化、L 形房間、圖面風格與座標、VTT 匯出與串接）。
- 2026-10-29：完成並移出清單——新工具 QR Code 產生器（qr-maker）、PL 自介卡與地雷表（pl-profile）、劇本時間表（scenario-timeline，第一批）、環境音混音器（ambience-mixer）；floor-plan 參考 KIIN マップ制作スタジオ的功能（規格 6.8、7.22）。沒做的記在第三節與內部改善。
- 2026-10-30：完成並移出清單——劇本時間表（scenario-timeline）第二批（規格 F90～F109：多選、搜尋與篩選、架空曆的月日、事件之間的關聯線、讀入 vis-timeline 的資料；驗證紀錄 6.2、裁定 7.2）；floor-plan 的 L 形範本與「在地圖演出產生器開啟」帶房間的範圍（floor-plan 6.9、7.23；map-fx F85、F86）；環境音混音器的 MP3 匯出（lamejs）與兩種新聲音（ambience-mixer 6.2、7.2）。沒做的記在第三節；逐檔標 CC0 的真實錄音等網路開放。
- 2026-10-30：評估 sayaka-aiart/StandRig（Apache-2.0）：主要功能要本機 Node 服務＋MCP 的 AI 助手，不當新工具；「讀入 .srig 播放」記進第三節的 anime-rig 候選，使用者決定先不做。

- 2026-10-30：上游檢查（GitHub 來源 139 個，全部還在，沒有改名、改寫歷史或改授權；10-28 之後 15 個有新 commit）：shiki365/chat-window-maker v1.12 列入第一節，TIER ATELIER 的新功能更新第二節，其餘是 CI、文件、相依套件、外部服務或韓國部落格用的輸出 CSS，不列。「先觀察」的條件都還沒成立；HTML-in-Canvas 的 API 在 Chrome 155 改名（搜尋摘要）；Maptsukuri 的作者標示待確認（第四節）。不在 GitHub 的原作與 docs.ccfolia.com 這次 WebFetch 都連不到。
- 2026-10-30：新 repo 搜尋（已收錄與追蹤的作者約 75 個、GitHub 網頁搜尋約 35 個查詢、clone 讀過約 40 個；GitHub 的 API 在這個環境不能用，改用 git clone 與 WebFetch，搜尋頁連續查會 429）。新增：第二節的隨機表按鈕（Tetoriapot/scenebutton-maker）、大圖分割（split-compress-tool 從第四節移上來）；第三節的 coc-sheet 建卡精靈（noechou，MIT）、family-tree 的遺傳特質（Sectr99/Lineage，MIT）、session-calendar 的週曆（knightleft/tw-calendar）；第四節的 COC7e-Investigator、charashare-general、Armoria。追蹤的新作者：noechou、magineco、Dancraft3746。
- 2026-11-05：完成並移出清單——證件與票券產生器補收 CyberDelaai/sinforge-ui（MIT）剩下的功能：看起來像的碼、另外 5 種晶片、日期格式、光暈／顆粒／掃描線、數位證件、名字產生器（離線語料）、複製到剪貼簿、預設集、既有證件的浮水印與裝飾圖、自組底版（規格 1.18、F87～F100、D41～D49）；原作的 8 國語言不做（只有繁中）。
- 2026-10-31：完成並移出清單——證件與票券產生器加 CyberDelaai/sinforge-ui（MIT）的 SF 證件、照片效果與可以匯出的掛繩（規格 6.2、7.3；沒做的留在第三節）；劇本時間表補完（規格 F110～F115：年表與文字年表列出關聯線、架空曆寫到時刻；驗證紀錄 6.3、裁定 7.3）；戰鬥地圖產生器參考 ondras/rot.js（BSD-3-Clause）的格局（挖掘式、均勻房間、格狀房間、天然洞窟、三種迷宮）與地圖尺寸（10～60 格、每格 50／70／100 px；6.2、7.2）；共用 `@/ui` 只有少數工具用的 36 個元件改成各自的入口（每頁少 190～271 kB，DESIGN.md 4.0）。
- 2026-11-05：上游檢查（GitHub 來源 148 個，clone 145 個；QTR-Games/Eldritch-Ledger 已 404，第三節那列改成本站自己做；其餘還在、沒有改名或改授權；10-30 之後約 30 個有新 commit）：token-workshop 的 PNG 遮罩改成 `rle8`（本站要補讀）、obs-tachie 的口パク與席、VHS_Maker、MVmaker、Chat2Img 列入第一節；KumachanSteps 的音樂盒房間列入第二節；DearMySn1p3r_57 其實是圖片晃動動圖，從「角色貼圖組」拆出；mesh-avatar-studio、StandRig、cross-chart-maker、charashare-general、Pumpkin-Duck 的紀錄更新。utiyoso 的三個工具 11-01 加了利用規約（taku_calendar 禁止改作後散布程式；本站只參考功能，不受影響）。「先觀察」的條件都還沒成立；不在 GitHub 的原作照舊連不到，Maptsukuri 的作者照舊待確認。
- 2026-11-05：新 repo 搜尋（已收錄與追蹤的作者約 70 個、GitHub 網頁搜尋約 30 個查詢、clone 讀過約 25 個）。新增：第二節的視覺小說風日誌回放（rururu222/ccfolia-novel）、塔羅卡（低優先）；隨機表按鈕補 script-wizards/perhaps（Apache-2.0）、追逐面板補 J-Guenther/coc7-chase-tracker；第三節的 Freecell-log-studio（MIT）；第四節的 mai-sound-studio。追蹤的新作者：rururu222、FreecellRaid、J-Guenther、script-wizards。
- 2026-11-05 晚：使用者「工具收錄沒有只限制於 CoC 系統，其他系統也可以，再搜尋一次」→ 重看以前因系統專用排除的（clone 讀過約 15 個）＋日本系統（約 25 個查詢、clone 約 45 個）＋歐美系統與中文、韓文圈（clone 約 30 個）。第二節新增萬用擲骰（BCDice）、先攻與戰鬥追蹤（lazy_gm_tools，CC0）、探索回合與隨機遭遇、謀殺之謎的 GM 進行台與配役、特技表工具、招團貼；第三節 log-converter 的海豹／QQ 與 CCFOLIA JSON 日誌、character-editor 的系統範本；新增「其他系統的內容授權」；「不收的」重寫系統專用的幾列。
- 2026-11-06：使用者「mshea/lazy_gm_tools 加入這個」（選 GM 戰鬥工具、隨機產生器、5e 角色小工具；名詞寫繁中＋英文原文；SRD 的資料庫不做）。完成並移出清單——新工具「先攻與戰鬥追蹤」（combat-tracker，系統通用）、「5e 速查計算」（5e-calc）、「奇幻隨機產生器」（fantasy-gen）；首頁的 G9 改名「跑團輔助」。沒做的在第三節。
- 2026-11-05：使用者上傳 KIIN「ワールドマップ制作スタジオ v1.0」「加入這個」、「マップ制作スタジオ v2.0」「這個也加入」，要求 token-maker 與 vhs-frame 跟進、sinforge-ui 補收剩下的功能。完成並移出清單——新工具「世界地圖產生器」（world-map，參考 KIIN，視同未授權；旅程概算和原作逐項相同）；VTT 棋子產生器跟進 token-workshop `ce4c62b`；錄影帶畫面產生器跟進 VHS_Maker `e5d589e`（新功能預設關）；室內平面圖跟進 KIIN v2.0 第一批（第二批的曲線房間、甲板留在第三節）。
- 2026-11-05：使用者要求「https://github.com/deukrezia/trials 這個也加入」（原本在「不收的」）。完成並移出清單——新工具「圖塊地圖編輯器」（tile-map，程式未授權只參考功能；作者的預設圖塊不用，收 Kenney 的兩個 CC0 圖塊包；地圖演出產生器收它送的圖）；沒做的（讀原作的 `.vttmap.json`、單一圖塊組的檔案）在第三節。
- 2026-11-05：完成並移出清單——室內平面圖跟進 KIIN「マップ制作スタジオ」v2.0 第二批（曲線的房間、甲板與疊放、客輪範本、送給地圖演出產生器的曲線範圍；規格 6.11、7.25）；沒做的（曲線牆上家具的細角度、曲線上的門的開門範圍、曲線上的牆花紋）留在第三節。
- 2026-11-05：floor-plan 跟進 KIIN「マップ制作スタジオ」v2.0 第二批（規格 1.28、F289～F302、D97～D105；map-fx F89、D29）：曲線的房間 15 種與形狀的切換、沿著曲線的牆與放在曲線上的門窗、家具照外形、甲板疊放的欄杆與段差線、甲板上的打通兩間房、送給地圖演出產生器的曲線範圍、客輪範本「夜航蒸汽客輪」。第三節那一列改成只列沒做的（家具沿著曲線轉向等）；D102 依主控裁定改成只對設了「甲板的外圍」的房間（舊的地圖輸出不變）。
- 2026-11-06：mshea/lazy_gm_tools（`89290732`）的 `5e_artisanal_database/tools/` 讀過：combat_tracker、encounter_calculator、quick_monster_stats、point_buy_calculator 收成 combat-tracker、5e-calc（分支 `wip/lazygm-combat`）；dice_roller、token_maker、annotator 本站已有（coc-dice 的自訂擲骰、token-maker；annotator 是在地圖圖片上點一下加文字標籤〔大小、顏色、字型、拖曳、PNG 與專案檔〕，map-editor 的文字已涵蓋），沒有要補的功能。
