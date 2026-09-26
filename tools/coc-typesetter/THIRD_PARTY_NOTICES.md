# 第三方函式庫與字型

`coc-typesetter` 照上游以 CDN 載入下列函式庫與字型，本 repo 不散布它們的檔案。

| 名稱 | 版本 | 來源 | 授權 | 用在哪裡 |
|---|---|---|---|---|
| [marked](https://github.com/markedjs/marked) | 12.0.2 | jsDelivr | MIT（Christopher Jeffrey 等） | 把內文的 Markdown 轉成 HTML |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.1.6 | jsDelivr | MPL-2.0 或 Apache-2.0 擇一（Cure53） | 清理轉出來的 HTML，擋掉內文裡的腳本 |
| 網頁字型 | — | Google Fonts | SIL OFL 1.1 | 紙面與介面：Noto Serif TC、Noto Sans TC、Inter |

上游的紙面字型是 Shippori Mincho 與 Zen Kaku Gothic New（日文字型）。收錄版只有繁體中文，
改用同樣由 Google Fonts 提供的 Noto Serif TC（明體）與 Noto Sans TC（黑體）；英數字仍用 Inter。

---

本工具取自 <https://scenario-tool-jade.vercel.app/coc-typesetter.html>（2026-09-26 取得）。
頁面上沒有作者署名，也沒有附任何授權條款，權利屬原作者所有，此處僅供試用；繁中化與改動見
repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
