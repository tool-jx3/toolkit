# 第三方函式庫

`acrylic-goods` 照上游原樣以 CDN 載入下列六者，本 repo 不散布它們的檔案——
處理方式與 `loading-maker` 的 pako 相同。工具本身另有一個「開源授權」對話框
（右上角的 `i`）把同一份清單顯示給使用者看，那是上游就有的。

| 函式庫 | 版本 | 來源 | 授權 | 用途 |
|---|---|---|---|---|
| [three.js](https://threejs.org/) | r128 | cdnjs | MIT（three.js authors） | 3D 場景與算繪 |
| three.js OrbitControls | 0.128.0 | jsDelivr | MIT（three.js authors） | 滑鼠轉動鏡頭 |
| three.js GLTFExporter | 0.128.0 | jsDelivr | MIT（three.js authors） | 匯出 .glb |
| [cannon.js](https://github.com/schteppe/cannon.js) | 0.6.2 | cdnjs | MIT（Copyright © 2012 Stefan Hedman） | 搖搖樂裡零件的物理 |
| [gif.js](https://github.com/jnordberg/gif.js) | 0.2.0 | cdnjs | MIT（Johan Nordberg） | 匯出 GIF |
| [pako](https://github.com/nodeca/pako) | 2.1.0 | cdnjs | MIT（Vitaly Puzrin、Andrey Tupitsin） | APNG 的 zlib 壓縮 |
| [upng-js](https://github.com/photopea/UPNG.js) | 2.1.0 | jsDelivr | MIT（Copyright © 2017 Photopea） | 編碼 APNG |

WebM 影片是瀏覽器自己的 `MediaRecorder` 錄的，不靠函式庫（上游把那顆按鈕
藏起來了，收錄版照舊）。

---

其餘檔案（`index.html`、`styles.css`、`app.js`）為上游
[sotsotssi/acrylic-goods](https://github.com/sotsotssi/acrylic-goods) 的程式碼，
以 MIT 釋出，`LICENSE` 保留於本目錄；繁體中文介面與 i18n 改造見 repo 根目錄的
[ATTRIBUTION.md](../../ATTRIBUTION.md)。
