# 設計系統與共用元件

所有工具共用同一套外觀與操作方式。本文件隨元件庫的演進更新；新增共用元件時一併登記在第 4 節。

## 1. 設計原則

- **工具優先**：左側設定、右側大預覽（手機寬度改上下排列）；最常用的操作放在第一屏。
- **一致**：同一種控制項在每個工具長得一樣、行為一樣（例如色彩欄一定可以輸入色碼與調透明度）。
- **即時**：改設定立刻反映在預覽；耗時的匯出有進度與取消。
- **在地**：只有台灣繁體中文介面；用詞照第 5 節；字型預設用繁中字型。
- **無障礙**：鍵盤可操作、焦點清楚、對比足夠、圖示按鈕有文字標籤（Radix 元件為基礎）。

## 2. 設計 token（CSS 變數，定義在 `web/src/ui/tokens.css`）

| 類別 | token | 說明 |
|---|---|---|
| 色彩（深色為預設，另有淺色） | `--bg`、`--surface`、`--surface-2`、`--border`、`--text`、`--text-muted`、`--accent`、`--accent-contrast`、`--danger`、`--warning`、`--success` | 主色（accent）沿用首頁的強調色系，對比至少 4.5:1 |
| 字型 | `--font-ui`（Noto Sans TC 與系統字型堆疊）、`--font-mono` | |
| 字級 | `--text-xs`～`--text-xl` | 介面字級 12～20 px |
| 間距 | `--space-1`～`--space-8`（4 px 為單位） | |
| 圓角 | `--radius-sm`、`--radius`、`--radius-lg` | |
| 陰影 | `--shadow-1`、`--shadow-2` | |
| 動態 | `--ease-out`、`--duration-fast`、`--duration` | 尊重 `prefers-reduced-motion` |

Tailwind v4 的主題直接對應這些變數；元件只用 token，不寫死顏色。

## 3. 版面

- **ToolShell**：頁首（← TRPG Toolkit、工具名、群組分頁、快捷鍵與說明按鈕）＋主體（設定面板＋預覽區）＋頁尾（靈感來源）。
- 設定面板：分頁（Tabs）→ 區塊（Section，可收合）→ 欄位列（Field：標籤、控制項、說明）。
- 預覽區：預覽舞台（Stage）＋播放列（Transport，動畫工具才有）＋匯出區（ExportPanel）。
- 斷點：≥ 1024 px 左右排列；< 1024 px 上下排列，預覽在上；390 px 寬不得出現橫向捲動。

## 4. 共用元件與模組

### 4.1 元件（`web/src/ui/`）

| 元件 | 用途 |
|---|---|
| ToolShell、ToolHeader、GroupTabs、InspirationFooter | 工具外框、群組分頁、靈感來源頁尾 |
| Tabs、Section、Field、FieldRow | 設定面板的結構 |
| Button、IconButton、Toggle、Segmented、Select、TextInput、TextArea、NumberInput、Slider（含數字欄） | 基本控制項 |
| ColorField（色碼、透明度、吸管）、GradientField | 顏色 |
| FontPicker（Google Fonts／電腦字型／上傳字型三合一，含字重） | 字型 |
| ImageDrop（拖放、貼上、選檔，多檔）、CropDialog | 圖片輸入 |
| Stage（棋盤格／深／淺／自訂背景、縮放、符合畫面） | 預覽 |
| Transport（播放、暫停、重播、拖曳、階段分色、循環） | 動畫播放 |
| ExportPanel（格式、FPS、循環、尺寸、減色、進度、取消、結果卡、5 MB 提醒） | 匯出 |
| TemplateGallery | 範本庫 |
| ProjectMenu（存成檔案、開啟、自動存檔提示、重設） | 專案 |
| Dialog、ConfirmDialog、Toast、ShortcutHelp、UsageSection | 對話框與說明 |

### 4.2 模組（`web/src/core/`、`web/src/ccfolia/`）

| 模組 | 內容 |
|---|---|
| core/storage | 設定自動存檔（Zustand persist）、IndexedDB 專案與檔案、復原／重做 |
| core/files | 下載、讀檔、ZIP（fflate）、檔名規則 |
| core/fonts | 字型目錄（繁中五套為基本＋各工具需要的字型）、按需載入、電腦字型、上傳字型（IndexedDB） |
| core/encode | PNG、APNG（差分矩形、相同影格合併、預設圖）、減色、GIF（gifenc）、WebP（動畫封裝）、影片（需要時） |
| core/timeline | 緩動曲線、時間軸、決定性亂數、逐格渲染介面（render(t) → canvas） |
| core/typeset | 橫書／直書、禁則、自動縮小、外框與光暈分層繪製 |
| core/image | 影像載入、透明邊偵測、縮放、取色、裁切 |
| core/worker | 把重的編碼丟到 Web Worker |
| ccfolia/* | 房間 ZIP、角色 JSON、聊天面板、日誌解析、OBS 選擇器（CCFOLIA 改版時集中修這裡） |

## 5. 用詞表（台灣繁體中文）

| 用這個 | 不用 |
|---|---|
| 匯出 | 導出、輸出（按鈕上） |
| 預覽 | 預覧 |
| 立繪 | 立ち絵、立绘 |
| 差分 | 表情差分（可並用） |
| 自訂 CSS | 自定義 CSS |
| 瀏覽器來源 | ブラウザソース |
| 範本 | 模板、テンプレート |
| 字型 | 字體（字型名稱除外） |
| 檔案、資料夾、儲存、複製、貼上、重設 | 文件、文件夾、保存、拷貝、粘貼、重置 |
| CCFOLIA | ココフォリア |
| KP／GM、PL、PC、HO | （照寫） |

標點用全形；英文與數字前後加半形空白。
