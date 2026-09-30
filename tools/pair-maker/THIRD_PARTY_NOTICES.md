# 第三方函式庫

`pair-maker` 的上游把八套函式庫與字型放在 `vendor/` 底下一併發佈，並在同一個
目錄放了各自的授權條款。收錄版保留的檔案都原樣收錄（與上游一位元組不差），
此處只列出清單方便辨認與稽核。

| 函式庫 | 版本 | 檔案 | 授權 |
|---|---|---|---|
| [Konva](https://konvajs.org/) | 9.3.20 | `vendor/konva.min.js` | MIT — `vendor/Konva-LICENSE.txt` |
| [Cropper.js](https://fengyuanchen.github.io/cropperjs/) | 1.6.2 | `vendor/cropper.min.js`、`vendor/cropper.min.css` | MIT — `vendor/Cropper-LICENSE.txt` |
| [Pickr](https://github.com/Simonwep/pickr) | 1.9.1 | `vendor/pickr.min.js`、`vendor/monolith.min.css` | MIT — `vendor/Pickr-LICENSE.txt` |
| [fflate](https://github.com/101arrowz/fflate) | 檔案未標版本 | `vendor/fflate.min.js` | MIT — `vendor/fflate-LICENSE.txt` |
| [Bootstrap Icons](https://icons.getbootstrap.com/) | 1.13.1 | `vendor/bootstrap-icons.min.css`、`vendor/fonts/` | MIT — `vendor/Bootstrap-Icons-LICENSE.txt` |
| [Pretendard](https://github.com/orioncactus/pretendard) | Variable | `vendor/PretendardVariable.woff2`、`vendor/fonts.css` | SIL OFL 1.1 — `vendor/Pretendard-LICENSE.txt` |
| [pdf-lib](https://pdf-lib.js.org/) | 1.17.1 | `vendor/pdf/pdf-lib.min.js` | MIT — `vendor/pdf/pdf-lib-LICENSE.md` |
| [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) | 1.1.1 | `vendor/pdf/fontkit.umd.min.js` | MIT — `vendor/pdf/fontkit-LICENSE.txt` |

Konva 畫出編輯器的畫布，Cropper.js 負責裁切上傳的圖片，Pickr 是選色器，
fflate 把編輯檔壓成 ZIP，Bootstrap Icons 與 Pretendard 則是介面的圖示與字型。
pdf-lib 與 fontkit 只在文字記錄版型按下「下載 PDF」時才載入，用來產生可以選取文字的 PDF。
（`fontkit.umd.min.js` 內含 iconv-lite 的 CP949 字碼表，檔案裡因此有諺文；那是函式庫的資料，不是介面文字。）

### 上游 v1.1.0 隨附、但本 repo 不收的字型

上游 v1.1.0 為文字記錄版型另外附了約 48 MB 的字型，收錄版都不收：

- `vendor/textlog/NotoSerifCJKKR.ttf`（24 MB，畫布用的明體）與它的 `OFL.txt`——改由
  `editor.html` 從 Google Fonts 載入 Noto Serif KR（400／500／600／700），韓文字型缺的字
  落到 Noto Serif TC。
- `vendor/pdf/serif-{400,500,600,700}.ttf.zlib`、`gothic-{400,700}.ttf.zlib`（約 25 MB，
  PDF 內嵌用，前者由 NotoSerifCJKKR、後者由 Pretendard 衍生並改名為 PairPDFGothic），以及
  說明它們來歷的 `README.txt` 與兩份 OFL（`NotoSerif-OFL.txt`、`Gothic-OFL.txt`）——改成
  按下「下載 PDF」時才從 fonts.gstatic.com 抓 Noto Serif KR／Noto Sans KR（缺字時依序改用
  Noto Serif TC／Noto Sans TC）的完整 TTF，網址表在 `js/SaveBtn.js` 的 `PDF_FONTS`。
  黑體因此由上游的 PairPDFGothic 換成 Noto Sans KR。

這些字型檔本身不隨本 repo 散布，所以也沒有附上它們的 OFL 全文。

`editor.html` 另外從 Google Fonts 與兩個 CDN 載入版型用的網頁字型（含本 repo
補上的五套繁體中文字型），那些字型檔本身不隨本 repo 散布。

---

其餘檔案（`index.html`、`editor.html`、`css/`、`js/`、`templates/`）均為上游
`baegop157902/PairMaker` 的程式碼，未附授權條款，其權利屬原作者所有——詳見
repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
