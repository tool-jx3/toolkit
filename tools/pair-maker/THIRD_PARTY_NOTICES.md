# 第三方函式庫

`pair-maker` 的上游把六套函式庫與字型放在 `vendor/` 底下一併發佈，並在同一個
目錄放了各自的授權條款。收錄版原樣保留（`vendor/` 內容與上游一位元組不差），
此處只列出清單方便辨認與稽核。

| 函式庫 | 版本 | 檔案 | 授權 |
|---|---|---|---|
| [Konva](https://konvajs.org/) | 9.3.20 | `vendor/konva.min.js` | MIT — `vendor/Konva-LICENSE.txt` |
| [Cropper.js](https://fengyuanchen.github.io/cropperjs/) | 1.6.2 | `vendor/cropper.min.js`、`vendor/cropper.min.css` | MIT — `vendor/Cropper-LICENSE.txt` |
| [Pickr](https://github.com/Simonwep/pickr) | 1.9.1 | `vendor/pickr.min.js`、`vendor/monolith.min.css` | MIT — `vendor/Pickr-LICENSE.txt` |
| [fflate](https://github.com/101arrowz/fflate) | 檔案未標版本 | `vendor/fflate.min.js` | MIT — `vendor/fflate-LICENSE.txt` |
| [Bootstrap Icons](https://icons.getbootstrap.com/) | 1.13.1 | `vendor/bootstrap-icons.min.css`、`vendor/fonts/` | MIT — `vendor/Bootstrap-Icons-LICENSE.txt` |
| [Pretendard](https://github.com/orioncactus/pretendard) | Variable | `vendor/PretendardVariable.woff2`、`vendor/fonts.css` | SIL OFL 1.1 — `vendor/Pretendard-LICENSE.txt` |

Konva 畫出編輯器的畫布，Cropper.js 負責裁切上傳的圖片，Pickr 是選色器，
fflate 把編輯檔壓成 ZIP，Bootstrap Icons 與 Pretendard 則是介面的圖示與字型。

`editor.html` 另外從 Google Fonts 與兩個 CDN 載入版型用的網頁字型（含本 repo
補上的五套繁體中文字型），那些字型檔本身不隨本 repo 散布。

---

其餘檔案（`index.html`、`editor.html`、`css/`、`js/`、`templates/`）均為上游
`baegop157902/PairMaker` 的程式碼，未附授權條款，其權利屬原作者所有——詳見
repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
