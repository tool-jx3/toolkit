# TRPG Toolkit — 給 Claude 的工作守則

這個 repo 正在把所有工具重構到同一套框架（`web/`）。開始任何工作前先讀：

- `docs/refactor/PLAN.md`：目標、群組、架構、進度表
- `docs/refactor/PROCESS.md`：重寫流程（依原作授權分兩種做法）、規格寫法、對等驗證、上線清單、新工具引入流程
- `docs/refactor/DESIGN.md`：設計 token、共用元件與模組、用詞表

## 不可違反的規則

1. **依原作授權決定能不能參考程式碼**（授權見 PLAN.md 第 2 節「原授權」欄）：
   - **MIT、CC0 等開放授權**：可以直接參考原作的程式碼（`tools/<id>/` 的舊檔、`vendor/`、上游原作），
     改寫成 `web/` 的共用元件與模組，不要整份照搬舊的檔案結構。原作的授權全文放在 `web/src/tools/<id>/UPSTREAM_LICENSE`
     （建置時自動併入 `assets/build/THIRD_PARTY_NOTICES.md`）。
   - **未授權、作者條款限制**：不得複製原作的程式碼、素材、範本文字；照行為規格實作（觀察者寫規格，實作者不開原作程式）。
2. **重寫後的介面與素材以本專案的元件為準**：用 `web/` 的共用元件與設計，不沿用舊版的版面與樣式。
3. **功能對等才上線**：規格裡每個功能編號都要有對等驗證紀錄（PROCESS.md 第 4 節）。
4. **新框架只有繁體中文介面**；用詞照 DESIGN.md 第 5 節。
5. **頁尾只放「靈感來源」連結**，不放原作者的其他標示。
6. 程式相依從 npm 打包，不從 CDN 載入 JS（Google Fonts 字型除外）。

## 指令

- 舊版的靜態檢查：`npm test`（根目錄，`tests/smoke.mjs`）
- 新框架：`cd web && npm ci && npm run dev | build | test | e2e | lint`
- 本機伺服器：`npx http-server -p 8123 -c-1 .`（repo 根目錄）
