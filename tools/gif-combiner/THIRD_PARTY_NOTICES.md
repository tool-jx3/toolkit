# 第三方函式庫

`gif-combiner` 照上游原樣以 CDN 載入下列三者，本 repo 不散布它們的檔案。
處理方式與 `loading-maker` 的 pako、`collage-letter`／`text-path`／`typewriter`
的 Tailwind 相同。

| 函式庫 | 版本 | 來源 | 授權 | 用途 |
|---|---|---|---|---|
| [gif.js](https://github.com/jnordberg/gif.js) | 0.2.0 | cdnjs | MIT（Johan Nordberg） | 把合成好的每一格編碼成 GIF |
| [gifuct-js](https://github.com/matt-way/gifuct-js) | 2.1.2 | esm.sh | MIT（Copyright (c) 2015 Matt Way） | 解析上傳的 GIF，拆出每一格 |
| [Tailwind CSS](https://tailwindcss.com/) | Play CDN | cdn.tailwindcss.com | MIT | 版面的工具類別 |

gif.js 的編碼工作跑在 Web Worker 裡。它的 worker 檔在別的網域，直接當
`workerScript` 會踩到 CORS，所以 `init()` 先把它抓成文字、包成 Blob URL
再交給 gif.js——這是上游的做法，收錄版沒有改。

---

其餘檔案（`index.html`、`styles.css`、`app.js`）為上游
[sotsotssi/GIF-Combiner](https://github.com/sotsotssi/GIF-Combiner) 的程式碼，
以 MIT 釋出，`LICENSE` 保留於本目錄；繁體中文介面與 i18n 改造見 repo 根目錄的
[ATTRIBUTION.md](../../ATTRIBUTION.md)。
