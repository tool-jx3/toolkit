# 第三方函式庫與素材

## 隨檔案散布的函式庫

### ag-psd 31.0.2（`lib/ag-psd.min.js`）

讀取 PSD 用的函式庫，上游原樣同捆；與 npm 上 [ag-psd](https://github.com/Agamnentzar/ag-psd)
31.0.2 的 `dist/bundle.js` 逐位元組相同。以 MIT 授權釋出：

```
The MIT License (MIT)

Copyright (c) 2016 Agamnentzar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.



Any image or brush files included in this repository are not covered by this
license and belong to their copyright holders.
```

### 內建的閉眼、閉嘴差分（`lib/genericparts.js`）

PSD 裡沒有閉眼或閉嘴圖層時自動補上的通用差分，以 RGBA 原始資料寫在程式碼裡，是上游
程式碼的一部分（MIT，見本目錄的 `LICENSE`）。

## 以 CDN 載入的函式庫

| 函式庫 | 版本 | 來源 | 授權 | 用在哪裡 |
|---|---|---|---|---|
| [MediaPipe Face Mesh](https://github.com/google-ai-edge/mediapipe)（`@mediapipe/face_mesh`） | 0.4.1633559619 | jsDelivr | Apache License 2.0（Google LLC） | 攝影機臉部追蹤 |

上游把 MediaPipe 支援 WebAssembly SIMD 的那一組檔案（約 11 MB）同捆在 `lib/vendor/face_mesh/`，
讓臉部追蹤離線也能用，只有不支援 SIMD 的舊瀏覽器才從 jsDelivr 抓同一版。收錄版不隨附這批檔案，
一律走上游原本的 CDN 備援路徑（同一個鎖定版本），做法與合輯其他工具以 CDN 載入函式庫相同；
因此第一次開啟攝影機追蹤時需要連網。攝影機畫面只在瀏覽器裡處理，不會送出去。

## 上游有、但收錄版不收的檔案

- `sample.psd`、`sample2.psd`：範例模型。上游 README 寫明「サンプルPSD の絵の権利は各作者に
  帰属します」（範例 PSD 的圖畫權利屬於各自的作者），不在 MIT 的範圍內。
- `eye_close.psd`、`mouth_close.psd`：閉眼、閉嘴差分的原圖。上游會先讀這兩個檔，讀不到才用
  `genericparts.js` 內建的差分；收錄版直接用內建的。
- `obs_server.py`、`start_obs.bat`：OBS 連動用的本機中繼伺服器，需要在自己的電腦上以 Python 執行，
  不是網頁工具的一部分。要用 OBS 連動請到上游下載整套。
- `tests/`、`package.json`、`IMPROVEMENTS.md`、`README.md`：上游的開發測試與說明文件。說明文件改寫成
  收錄版的 `guide.ja.md`（日文）與 `guide.zh-TW.md`（繁中），在工具的「使用說明」視窗裡顯示。

---

其餘檔案為上游 [852wa/Anime2.5DRig](https://github.com/852wa/Anime2.5DRig) 的程式碼，
以 MIT 釋出，`LICENSE` 保留於本目錄；繁體中文介面與 i18n 改造見 repo 根目錄的
[ATTRIBUTION.md](../../ATTRIBUTION.md)。
