# 實作者工作說明

主控派工時會給：工具 id、工具名、群組、靈感來源（名稱與網址）、e2e 用的 port。其餘一律照本文件。

## 1. 工作目錄與起點
- 你在一個獨立的 git worktree 裡（目前的工作目錄就是 repo 根目錄）。**一律用相對路徑在這個 worktree 內工作，不要 cd 到 /home/user/toolkit**（主工作區，別人在用）。
- 開工前先對齊到最新：`git fetch -q origin claude/loading-maker-integration-kvbpde && git merge --ff-only FETCH_HEAD`，確認 `docs/refactor/specs/<id>.md` 存在。然後 `cd web && npm ci`。
- 暫存檔放 worktree 根目錄的 `.impl-tmp/`（不提交）。

## 2. 參考原作的程式改寫

- **要讀原作的程式**：`tools/<id>/` 的舊檔、`vendor/`、上游原作；已上線、舊檔已刪的工具用 ATTRIBUTION「本站重寫的工具」表的 commit 取回（`git show <commit>:tools/<id>/...`）。規格不清楚的地方直接看原作程式求證。
- **改寫成本專案的元件**：功能、演算法、數值照原作，但用 `web/` 的共用元件與模組、設計 token、用詞與檔案結構重新寫；不整段貼上、不逐行轉寫舊的檔案，也不沿用舊的版面與樣式。缺的共用元件照第 4 節做成共用的。
- **素材與文字依原作授權**（PLAN.md 第 2 節「原授權」欄，主控派工時也會寫明）：
  - MIT、CC0 等開放授權：範本、預設集、範例可以沿用（翻成繁中）；把原作的授權全文（含著作權聲明）原樣放到 `web/src/tools/<id>/UPSTREAM_LICENSE`（建置時自動併入 THIRD_PARTY_NOTICES）。
  - 未授權、作者條款限制：圖片素材、範本文字、範例資料不沿用，自己做（繁中）。
- 規格還沒有功能清單時，先讀原作程式寫 `docs/refactor/specs/<id>.md` 第 1 節（每個控制項、輸出、快捷鍵一個編號），對等驗證以此為準。

## 3. 先讀
1. `CLAUDE.md`、`docs/refactor/PROCESS.md`（第 3 節實作守則）、`docs/refactor/DESIGN.md`（第 4 節：每個元件與模組的 API；第 5 節：用詞表）、`web/README.md`
2. `docs/refactor/specs/<id>.md` 全文（含附件 JSON）——**第 7 節「主控裁定」優先於前面的「需主控確認」**
3. `docs/refactor/hints/<群組>.md`：共用層作者給這個群組各工具的使用提醒
4. 參考已完成的工具：`web/src/tools/` 底下同群組或已上線的工具、元件展示頁 `web/src/tools/_gallery/`

## 4. 要做的事
1. `web/src/registry.ts` 的 `TOOLS` 陣列最後加一筆：id、group、`status: 'next'`、inspiration（原創工具不填）；name／summary 用你自己寫的繁中。
2. 建 `web/src/tools/<id>/`：`index.html`（照 `_gallery/index.html`，**不要**加 robots meta）、`main.tsx`、`App.tsx`、`strings.ts`（所有介面文字）、純邏輯模組（不依賴 React，方便單元測試）。範本、範例文字、預設集、圖片素材全部**自己做**（繁中）。
   - **規格第 1 節每一個功能編號都要做到**（標「不移植」或「由共用外框提供」的除外）；第 2～5 節的數值、規則、檔名都照做；第 7 節的裁定照做。
   - 用 `ToolShell` 外框（回首頁、群組分頁、頁尾靈感來源由它提供）；說明文字自己寫。
   - 缺的共用元件或模組：別的工具也會用到就做成共用的（放 `web/src/ui`／`web/src/core`／`web/src/ccfolia`，登記到 `docs/refactor/DESIGN.md` 第 4 節）；只有這個工具用的放工具目錄。**修改既有共用元件一律向下相容**（同時有其他實作者在別的 worktree 改框架）。
3. 測試：
   - 單元測試 `web/tests/unit/<id>-*.test.ts`：規格裡的數字規則、輸出格式、附件 JSON 的逐字或逐值範例。
   - e2e `web/tests/e2e/<id>.spec.ts`：URL 用 `` `/${outputDir(getTool('<id>') ?? { id: '<id>', status: 'next' })}/` ``（從 `../../src/registry` import）；開頁無 console error、主要操作與規格的關鍵行為、輸出（下載的檔案要解析驗證）、390 寬沒有橫向捲動、1280／390 視覺基準圖 `web/tests/__screenshots__/<id>-1280.png`、`<id>-390.png`。
   - **跑 e2e 一律用主控給的 port**：`E2E_PORT=<port> npm run e2e`；自己開伺服器也用那個 port。
4. `npm run lint`、`npm run typecheck`、`npm test`、`E2E_PORT=<port> npm run e2e` 全部通過。
5. 提交：**只 `git add web docs/refactor/DESIGN.md`**（由你寫了功能清單時，加上 `docs/refactor/specs/<id>.md`）（不要提交 `next/`、`assets/build/`、`tools/`、`.impl-tmp/`），在目前 worktree 的分支 commit，英文標題＋說明，結尾加：
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_01332NS3NmLC5jAqKc7jB5X7
   ```
   **不要 push，不要切到其他分支。** 不要改首頁 `index.html`、`tools/`、根目錄 `tests/`、`README.md`、`ATTRIBUTION.md`、`docs/refactor/PLAN.md`、`docs/refactor/specs/`（上面說的功能清單除外）。

## 5. 最後回報（繁中、精簡）
worktree 路徑、分支、commit SHA；新增／修改的檔案；新增或擴充的共用元件（是否向下相容）；每個功能編號的實作狀況（可以用範圍概括，例外逐條列）；規格不清楚而你自己決定的地方；測試數字。
