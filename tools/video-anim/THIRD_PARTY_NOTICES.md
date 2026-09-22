# 第三方函式庫

`video-anim` 照上游原樣以 CDN 載入下列五者，本 repo 不散布它們的檔案——
處理方式與 `loading-maker` 的 pako、`collage-letter`／`text-path`／`typewriter`
的 Tailwind 相同。

| 函式庫 | 版本 | 來源 | 授權 | 用途 |
|---|---|---|---|---|
| [Tailwind CSS](https://tailwindcss.com/) | Play CDN | cdn.tailwindcss.com | MIT | 版面的工具類別 |
| [Font Awesome Free](https://fontawesome.com/) | 6.4.0 | cdnjs | CC BY 4.0（圖示）／MIT（CSS） | 介面圖示 |
| [pako](https://github.com/nodeca/pako) | 2.1.0 | cdnjs | MIT | APNG 的 zlib 壓縮 |
| [upng-js](https://github.com/photopea/UPNG.js) | 2.1.0 | jsDelivr | MIT（Copyright (c) 2017 Photopea） | 編碼 APNG |
| [gifshot](https://github.com/yahoo/gifshot) | 0.3.2 | cdnjs | MIT（Yahoo Inc.） | GIF 編碼的退路 |

Animated WebP 不靠函式庫：那是瀏覽器自己的 `canvas.toBlob('image/webp')`
逐格輸出之後，由這個工具自己組成 WebP 動畫容器的。

---

其餘檔案（`index.html`、`styles.css`、`app.js`）為上游
[sotsotssi/video-to-pic](https://github.com/sotsotssi/video-to-pic) 的程式碼，
以 MIT 釋出，`LICENSE` 保留於本目錄；繁體中文介面與 i18n 改造見 repo 根目錄的
[ATTRIBUTION.md](../../ATTRIBUTION.md)。
