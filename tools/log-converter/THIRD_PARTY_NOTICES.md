# 第三方函式庫

`log-converter` 照上游原樣以 CDN 載入下列兩者，本 repo 不散布它們的檔案——處理方式
與 `color-palette`、`collage-letter` 等工具相同。

| 函式庫 | 版本 | 來源 | 授權 | 用途 |
|---|---|---|---|---|
| [Tailwind CSS](https://tailwindcss.com/)（Play CDN） | 3.x | cdn.tailwindcss.com | MIT | 介面版面的工具類別 |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | cdnjs | MIT 或 GPLv3 雙授權（Stuart Knightley） | 分割檔案時打包成 ZIP 下載 |

介面字型 Noto Sans KR 與合輯追加的 Noto Sans TC 由 Google Fonts 載入（SIL Open Font
License 1.1）。轉換出來的 HTML 預設引用 Google Fonts 的 Noto Sans KR／Noto Serif KR，
這是上游的設計，收錄版照舊。

---

其餘檔案（`index.html`、`styles.css`、`app.js`）為上游
[Eon-00/eon-ccfolia-log-converter](https://github.com/Eon-00/eon-ccfolia-log-converter)
（commit `bb32ed7`）的程式碼，以 MIT 釋出，`LICENSE` 保留於本目錄（上游檔名為
`MIT License`）；繁體中文介面與 i18n 改造見 repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
收錄版拿掉了已無法使用的「用 Room ID 載入」（呼叫 CCFOLIA 的 Firestore API）。
