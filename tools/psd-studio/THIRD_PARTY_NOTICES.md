# 第三方函式庫

`psd-studio` 照上游原樣以 CDN 載入下列五者，本 repo 不散布它們的檔案——
處理方式與 `video-anim`、`gif-combiner` 相同。上游有兩個網址沒鎖版本
（ag-psd 完全沒寫版本；apng-js 只寫了套件版本、沒寫檔案路徑），
合輯版全部改成明確的版本與檔案路徑。授權依 npm registry 上該版本的 `package.json`。

| 函式庫 | 版本 | 授權 | CDN 網址 | 用途 |
|---|---|---|---|---|
| [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | (MIT OR GPL-3.0-or-later)，本站採 MIT（Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso） | https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js | 讀取與產生房間 ZIP |
| [pako](https://github.com/nodeca/pako) | 2.1.0 | (MIT AND Zlib)（Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn） | https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js | UPNG 用的 zlib 壓縮；改寫 APNG 循環次數時計算 CRC32 |
| [upng-js](https://github.com/photopea/UPNG.js) | 2.1.0 | MIT（Copyright (c) 2017 Photopea） | https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js | 編碼 APNG／PNG、減色壓縮 |
| [apng-js](https://github.com/davidmz/apng-js) | 1.1.1 | MIT（Copyright (c) 2016 David Mzareulyan） | https://unpkg.com/apng-js@1.1.1/lib/index.js | 解析 APNG 的每一格 |
| [ag-psd](https://github.com/Agamnentzar/ag-psd) | 31.0.2 | MIT（Copyright (c) 2016 Agamnentzar） | https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js | 讀取 PSD 圖層 |

- 上游的 apng-js 網址是 `https://unpkg.com/apng-js@1.1.1`，unpkg 會轉址到套件的 `main`
  （`lib/index.js`）；合輯版直接寫出這個檔案路徑，內容相同。
- 上游的 ag-psd 網址是 `https://cdn.jsdelivr.net/npm/ag-psd/dist/bundle.js`（永遠拿最新版）；
  合輯版鎖在收錄當下（2026-09-30）npm 上的最新版 31.0.2。`dist/bundle.js` 會把
  `agPsd` 掛在 `window` 上，`app.js` 照上游以 `window.agPsd.readPsd()` 使用。

Google Fonts（JetBrains Mono、Inter、Noto Sans KR，以及合輯版追加的 Noto Sans TC）
同樣照上游以 `fonts.googleapis.com` 載入，皆為 SIL Open Font License 1.1。

---

其餘檔案（`index.html`、`styles.css`、`app.js`）改寫自上游
[fyam-hamu/F_Ccfolia-PSD-Studio](https://github.com/fyam-hamu/F_Ccfolia-PSD-Studio)
（commit `718bb40`）。上游沒有 `LICENSE` 檔，收錄依據是作者寫在頁面上的條款，
原文、翻譯與合輯版的改動見同目錄的 [TERMS.md](TERMS.md)；繁體中文介面與 i18n 改造見
repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
