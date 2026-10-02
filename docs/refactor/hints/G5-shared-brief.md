# G5（CCFOLIA 資料）共用層：需求摘要

由六份 G5 規格（character-editor、room-zip、psd-studio、foreground-frame、log-converter、scenario-cards）整理（2026-10-02）。
共用層實作者照這份清單做：先確認現有模組（DESIGN.md 第 4 節、`web/src/ccfolia/`、`web/src/core/`）能不能擴充，一律向下相容；
CCFOLIA 的外部格式事實集中在 `web/src/ccfolia/`（CCFOLIA 改版時只改那裡）。每一項都要讀相關原作的程式求證
（`tools/<id>/`、`vendor/ccfolia-character-editor/`），並寫單元測試。

哪些工具會用：

| 模組 | 使用者 |
|---|---|
| 角色資料（剪貼簿 JSON） | character-editor、room-zip（棋子）；之後 G6 的 session-log／session-report 讀角色名 |
| 房間 ZIP（寫） | room-zip |
| 房間 ZIP（讀、改名重寫） | psd-studio；之後 G6 的 session-log 讀房間資料推測劇本名 |
| 日誌解析 | log-converter；之後 G6 的 session-log（匯入 CCFOLIA 聊天紀錄） |
| PSD 讀取 | psd-studio；之後 G9 的 anime-rig |
| 盤面格數換算 | foreground-frame、room-zip、psd-studio |

foreground-frame、scenario-cards 幾乎不依賴本層，可以和共用層同時實作。

## 1. `ccfolia/` 角色資料（character-editor 規格 2.1、2.3、3.1；room-zip 規格 3.1.7）

- 型別：CCFOLIA 角色資料的完整欄位（`name`、`memo`、`initiative`、`externalUrl`、`status[]`、`params[]`、`iconUrl`、`faces[]`、
  `x`、`y`、`angle`、`width`、`height`、`active`、`secret`、`invisible`、`hideStatus`、`color`、`commands`、`owner`，房間 ZIP 另有
  `playerName`、`z`、`roomId`、`speaking`、`diceSkin`、`order`）。現有 `CcfoliaCharacterData`／`toCharacterClipboard` 擴充，向下相容。
- 剪貼簿 JSON 的讀取：四種錯誤依序判斷（語法、最外層不是物件、`kind` 不是 `"character"`、`data` 不是物件），回傳錯誤種類（文字由工具自訂）。
- 匯入值的修正（character-editor 2.3）：型別不符用預設值；狀態／參數項目上的其他欄位與欄位順序照原樣保留。
- 輸出：character-editor 3.1 的 9 欄位、固定順序、2 格縮排、LF、結尾無換行；保留匯入項目的額外欄位。
- 常數：預設顏色 `#888888`、棋子大小 4、檔名副檔名 `.ccfolia-character.json`。

## 2. `ccfolia/` 房間 ZIP（room-zip 規格 3.1；psd-studio 規格 2.3、3.4）

- 型別與預設值：`__data.json` 的 `meta`、`entities`（九類）、`resources`；room、scene、marker（マーカーパネル）、item（スクリーンパネル）、
  character、effect（カットイン）、note 的欄位與舊版輸出的預設值（room-zip 3.1.3～3.1.9 的表）。
  注意 `enableCrossfade` 與畫面開關相反、`messageChannels` 預設三個分頁、`faces` 的形狀（room-zip 5. 與第 7 節的裁定）。
- 圖片檔名：內容 SHA-256（64 個小寫十六進位）＋副檔名；MIME → 副檔名：webp、png、`jpeg`（不是 jpg）、gif。
  `core/assets` 已有 SHA-256（只取前 24 位），抽出共用的完整雜湊函式（`core/files` 或 `core/assets`），舊的 id 不變。
- 寫：完全平坦、必有 `.token`（`0.`＋64 個小寫十六進位亂數）、`__data.json`（不縮排）、圖片；resources 與圖片檔一一對應。
  另提供自我檢查（room-zip F281：沒有資料夾、有 `.token` 與 `__data.json`、resources 一一對應、檔名等於內容雜湊、JSON 引用的圖都在），
  回傳問題清單。
- 讀（psd-studio 2.3）：找資料檔（`__data.json`／`data.json`／`room.json`／任何 `.json`、可在子資料夾；資料在頂層、`data` 或 `entities` 底下）、
  列出圖片與引用位置（背景、前景、`room.markers`、`items`、`characters` 的 `iconUrl`；其他類型的引用也要能列出）。
- 改名重寫（psd-studio 3.4）：給「舊 → 新」對照（主檔名、檔名、含路徑名），把 JSON 裡**所有字串值與物件的鍵**完全相等的換掉、
  包含的部分取代；`resources` 的 `type` 不改；JSON 以 2 格縮排寫回原位置、欄位順序不變；`.token` 與其他檔案原封不動。
- 盤面：1 格＝24 px；原點在盤面中央、往右往下為正；左上角座標換算。foreground-frame 3.13 的格數提示規則也放在這裡。
- ZIP 本身用 `core/files` 既有的 fflate 包裝。

## 3. `ccfolia/` 日誌解析（log-converter 規格 2.1～2.4）

- 舊格式（`p`／`div` 內 3 個以上 `span`：分頁、發言者、內容 HTML）與新格式（`article.message`、`data-channel`、`.speaker`、
  `--speaker-color`、`time[datetime]`、`.message-text`、`.roll-result`、頭像 `avatar-image-N` 對應 style 裡的 data URL）的解析；
  格式判斷（2.3）；預設分頁代碼 `main`／`info`／`other`；「全部」分頁標籤（すべて、全て、전체、全部、所有、all）。
- 輸出中立的訊息陣列（分頁代碼、發言者、內容、名字顏色、頭像、時間、系統列、擲骰結果）與多檔合併（2.4 的分頁命名、來源取捨、
  依時間排序規則、代表頭像、名字顏色）。訊息分類（2.5）屬於 log-converter 的規則，可以放在工具內；若做成共用，函式名要表明是 log-converter 的分類。
- 用 `DOMParser`（瀏覽器）解析；單元測試檔開頭用 `// @vitest-environment jsdom` 切換環境（`web/vitest.config.ts` 預設是 node）。

## 4. `core/decode` PSD 讀取（psd-studio 規格 2.2）

- 以 ag-psd（npm，MIT）讀圖層像素、不讀合成圖；圖層樹（陣列由下到上）攤平成「可見性、名稱路徑、位置、尺寸、像素」清單；
  動態載入（`import()`），只有用到的工具才下載。加進 `web/package.json` 後確認建置產生的 `assets/build/THIRD_PARTY_NOTICES.md` 有列出它。

## 5. 共通

- 每個模組登記到 DESIGN.md 第 4 節，並在 `web/src/ccfolia/index.ts` 的檔頭說明補一行。
- 元件展示頁：不需要新頁；若有共用元件，加到 `_gallery` 的適當分頁。
- 寫 `docs/refactor/hints/G5.md`：給六個工具的使用提醒（同 `hints/G2.md` 的格式）。
