# 第三方函式庫

`room-zip` 的上游把兩套函式庫直接內嵌在單一 HTML 裡。本 repo 收錄時把它們原樣
抽成獨立檔案（內容一字未改，授權標頭也在檔案開頭保留著），方便辨認與稽核。

## JSZip 3.10.1 — `jszip.min.js`

產生 CCFOLIA 匯入用的 ZIP。

> JSZip v3.10.1 — A JavaScript class for generating and reading zip files
> <http://stuartk.com/jszip>
> (c) 2009-2016 Stuart Knightley &lt;stuart [at] stuartk.com&gt;
> Dual licenced under the MIT license or GPLv3.
> 見 <https://raw.github.com/Stuk/jszip/main/LICENSE.markdown>

JSZip 內部使用 pako（MIT），見 <https://github.com/nodeca/pako/blob/main/LICENSE>。

## @upng/upng-js 2.2.2 — `upng.js`

APNG 演出圖片的編碼與量化。

> MIT License
> Copyright (c) 2017 Photopea

完整條款保留於 `upng.js` 的檔頭。

---

其餘檔案（`apng.v1.js`、`core.v1.js`、`app.v1.js`、`styles.css`、`sample.ccproj`）
均為上游 `johnko00/ccfolia-room-zip-maker-demo` 的程式碼，未附授權條款，
其權利屬原作者所有——詳見 repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
