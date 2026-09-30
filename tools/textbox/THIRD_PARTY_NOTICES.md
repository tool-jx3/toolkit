# 第三方函式庫

`textbox` 照上游原樣從 `cdn.tailwindcss.com` 載入 [Tailwind CSS](https://tailwindcss.com/)
的 Play CDN（MIT），本 repo 不散布它的檔案——處理方式與 `color-palette`、`collage-letter`、
`text-path`、`typewriter` 相同。

| 函式庫 | 版本 | 來源 | 授權 | 用途 |
|---|---|---|---|---|
| [Tailwind CSS](https://tailwindcss.com/) | Play CDN | cdn.tailwindcss.com | MIT | 版面的工具類別 |

字型（Noto Sans KR、Roboto，以及合輯追加的 Noto Sans TC）由 `styles.css` 從 Google Fonts
載入，授權為 SIL Open Font License 1.1（Noto）與 Apache License 2.0（Roboto）。
除此之外沒有任何外部相依：換行、字寬補正與框線的組合都是這個工具自己的程式。

---

其餘檔案（`index.html`、`styles.css`、`app.js`）為上游
[sotsotssi/TextBoxGen](https://github.com/sotsotssi/TextBoxGen) 的程式碼，
以 MIT 釋出，`LICENSE` 保留於本目錄；上游的 `script.js` 改名為 `app.js` 以對齊其餘工具。
繁體中文介面與 i18n 改造見 repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
