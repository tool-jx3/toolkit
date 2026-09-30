# 第三方元件

本 repo 不包含下列函式庫的檔案本身，而是照上游自 CDN 載入指定版本。

## UPNG.js 2.1.0

- 用途：上游早期的 APNG 輸出（v0.80 起已停用，目前介面上沒有用到它的按鈕）
- 著作權：Copyright (c) 2017 Photopea
- 授權：MIT
- 原始專案：https://github.com/photopea/UPNG.js
- CDN 檔案：https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js

## JSZip 3.10.1

- 用途：把各影格打包成 ZIP（`exportPngZip()`；目前介面上沒有呼叫它的按鈕）
- 著作權：Copyright (c) 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger, António Afonso
- 授權：MIT 或 GPLv3 擇一（本 repo 依 MIT 使用）
- 原始專案：https://github.com/Stuk/jszip
- CDN 檔案：https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js

兩者上游都照常載入；收錄版不改變行為，因此一併保留。
