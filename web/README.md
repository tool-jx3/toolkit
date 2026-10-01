# web/：TRPG Toolkit 新框架

所有工具重寫後都放在這個 Vite＋React＋TypeScript 專案裡，共用同一套元件、核心模組與設計 token。
整體計畫見 [`docs/refactor/PLAN.md`](../docs/refactor/PLAN.md)，元件與模組的用法見
[`docs/refactor/DESIGN.md`](../docs/refactor/DESIGN.md) 第 4 節，實作流程見 [`docs/refactor/PROCESS.md`](../docs/refactor/PROCESS.md)。

## 需求

- Node.js 22.12 以上（Vite 8、Vitest 5、jsdom 30 的要求）
- 端對端測試用系統預裝的 Chromium（`/opt/pw-browsers`）；`@playwright/test` 鎖在 1.56.1 與之相容，**不要**執行 `playwright install`。

## 指令

```sh
cd web
npm ci              # 安裝相依（只裝在 web/，根目錄的 package.json 維持沒有相依）
npm run dev         # 開發伺服器：http://localhost:5173/ 列出所有工具，元件展示頁在 /tools/_gallery/
npm run build       # 建置並輸出到 repo 根目錄（見下方）
npm test            # Vitest：核心模組單元測試＋元件測試
npm run e2e         # 先 build，再用 Playwright 測建置產物（http-server 開 repo 根目錄，port 8123）
npm run e2e:update  # 同上，並重產視覺回歸基準圖（tests/__screenshots__/）
npm run lint        # Biome（格式＋檢查）；npm run format 自動修正
npm run typecheck   # tsc（瀏覽器端與 Node 端兩份設定）
```

本機看建置結果：在 repo 根目錄執行 `npx http-server -p 8123 -c-1 .`，開 `http://127.0.0.1:8123/next/_gallery/`。

## 建置輸出

工具清單在 `src/registry.ts`，建置設定（`vite.config.ts`）依每個工具的 `status` 決定輸出位置：

| status | 輸出到（repo 根目錄） | 說明 |
|---|---|---|
| `next` | `next/<id>/index.html` | 重寫中，只供對等驗證，不連到首頁 |
| `live` | `tools/<id>/index.html` | 已上線，取代舊版（只覆寫建置產物，不刪資料夾裡其他檔案） |
| （共用） | `assets/build/` | 所有工具共用的 JS、CSS、Worker，以及自動產生的 `THIRD_PARTY_NOTICES.md` |

流程：Vite 先建到 `web/dist/`（每次清空），**建置成功後**由 `build/plugins.ts` 的 `publishToRepo` 清空 repo 的 `assets/build/` 與 `next/`，
再把產物複製過去。除了這兩個資料夾和 `live` 工具的 `index.html`，不會動到 repo 裡的其他檔案；建置失敗時也不會清空。
頁面用相對路徑（`base: './'`）引用 `../../assets/build/…`，放在 GitHub Pages 的子路徑下也能運作。建置產物要提交進 repo。

`THIRD_PARTY_NOTICES.md` 由實際打包進去的模組產生（含 Worker），列出套件、版本、授權與授權全文。

## 目錄

```
web/
  build/plugins.ts        建置外掛：共用 <head>（字型、主題初始化）、第三方授權清單、搬到 repo 根目錄
  src/registry.ts         工具清單（建置與頁首、群組分頁、頁尾共用）
  src/ui/                 設計 token（tokens.css）、樣式入口（styles.css）、共用元件
  src/core/               storage、files、fonts、encode、timeline、image、color、gradient、worker
  src/ccfolia/            CCFOLIA／OBS 的外部格式（目前是空殼與型別）
  src/tools/<id>/         各工具：index.html、main.tsx、App.tsx、strings.ts
  src/tools/_gallery/     元件展示頁（每個元件的各種狀態＋可匯出的示範動畫），實作者的參考
  src/index.html          只在 dev 使用的工具清單頁
  tests/unit/             核心模組單元測試（Node 環境）
  tests/components/       元件測試（jsdom，檔頭寫 @vitest-environment jsdom）
  tests/e2e/              Playwright（測建置產物）
  tests/__screenshots__/  視覺回歸基準圖
  tests/helpers/          測試用的 PNG／APNG／GIF 解析器與影格產生器
```

## 新增一個工具

1. `src/registry.ts` 加一筆：`{ id, name, summary, group, status: 'next', inspiration: { name, url } }`（原創工具不填 inspiration）。
2. 建 `src/tools/<id>/`：複製 `_gallery/index.html`（改 `<title>`）與 `main.tsx`，寫 `App.tsx` 與 `strings.ts`。
3. 用 `ToolShell` 當外框，設定面板用 `Tabs`／`Section`／`Field`＋控制項，預覽用 `Stage`（動畫加 `Transport`、`ExportPanel`）。
4. 設定要自動存檔就用 `createToolStore('<id>', 預設值)`；規格寫「不保留狀態」就加 `{ persist: false }`。
5. 在 `tests/e2e/` 加該工具的 Playwright 測試；`npm run build` 後產物在 `next/<id>/`。

缺少的元件先做成共用元件（`src/ui/` 或 `src/core/`），放進元件展示頁並登記在 DESIGN.md 第 4 節。

## 注意事項

- **無塵室**：實作者不得開啟舊版工具（`tools/<id>/` 舊檔、`vendor/`、上游原作）的程式碼，只看規格與本框架（見 PROCESS.md）。
- 所有程式相依都從 npm 打包，不從 CDN 載入 JS；只有 Google Fonts 的字型走 CDN。
- 介面只有台灣繁體中文，用詞照 DESIGN.md 第 5 節；文字放在各工具的 `strings.ts`。
- 測試環境沒有設定系統語系時，Chromium 會把中文下載檔名換成「download」，所以 `playwright.config.ts` 讓瀏覽器以 `LANG=C.UTF-8` 啟動。
- e2e 會把 Google Fonts 的請求換成空樣式（離線可跑、截圖穩定），所以截圖裡的中文是系統備用字型。
- 視覺回歸基準圖與執行環境（字型、Chromium 版本）有關；換環境後先用 `npm run e2e:update` 重產再比對。
