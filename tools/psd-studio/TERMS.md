# 使用條款（上游作者的明文條款）

上游 [fyam-hamu/F_Ccfolia-PSD-Studio](https://github.com/fyam-hamu/F_Ccfolia-PSD-Studio)
沒有附 `LICENSE` 檔。作者（[@Hamurabi_F](https://x.com/Hamurabi_F)）在工具頁面的說明視窗
「주의사항 및 문의 안내」分頁裡寫了下面這段條款，TRPG Toolkit 依這段條款收錄。

- 出處：`index.html`，commit [`718bb40`](https://github.com/fyam-hamu/F_Ccfolia-PSD-Studio/commit/718bb40)（「Update index.html」）
- 條款在合輯版頁面上照樣看得到：按右下角的「?」開啟說明視窗，第一個分頁的第三段。

## 原文（韓文，照抄）

> 코드 자체의 무단 재판매 및 유료 배포는 금지합니다.
> 단, 개인 목적의 코드 수정, 기능 개선 및 이를 바탕으로 한 재배포는 자유롭게 가능합니다.

## 繁體中文翻譯

> 禁止擅自轉售程式碼本身，或收費散布。
> 不過，為個人目的修改程式碼、改良功能，以及以此為基礎再散布，都可以自由進行。

翻譯僅供參考，以韓文原文為準。

## 合輯版如何遵守

- **本合輯免費提供、不收費**：TRPG Toolkit 是公開在 GitHub Pages 的靜態網站，
  這個工具與合輯裡的其他工具一樣免費使用，沒有任何收費或販售。
- 收錄版屬於條款允許的「修改、改良後再散布」，沒有轉售程式碼本身。
- 作者署名（說明視窗裡的 @Hamurabi_F 連結）與這段條款保留在頁面上，並翻譯成繁體中文。

## 合輯版的改動

以上游 commit `718bb40` 的 `index.html` 為基礎：

1. **拆檔**：內嵌的 `<style>` 抽成 `styles.css`、內嵌的 `<script>` 抽成 `app.js`，內容照上游。
2. **雙語介面**：介面文字改走 `i18n.psd-studio.js` 字典，繁體中文（預設）與韓文可切換；
   韓文的值照抄上游原文。原始碼裡的韓文註解譯成繁體中文（英文註解照舊）。
   為了切換語言時能重畫，模式標籤、統計列、壓縮狀態等幾處程式寫進畫面的文字抽成小函式，
   處理邏輯不變。
3. **拿掉 Firebase 按讚鈕**：上游在說明視窗的「GGUNDY」分頁放了一個按讚鈕，
   用寫死設定（apiKey 等）的 Firebase Realtime Database 計數。合輯版連同 Firebase SDK 的載入、
   設定值與 `ggundy_liked` 這個 localStorage 旗標一起拿掉。
4. **不收 `important.png`**：那是 GGUNDY 分頁裡作者的狗狗照片（9 MB，說明文字「멋진 개.」），
   純裝飾、與功能無關。按讚鈕拿掉之後這個分頁就只剩這張照片，所以整個分頁都不收。
5. **拿掉 KakaoTalk 聯絡連結**：合輯版改過程式，問題回報若送到原作者會找錯對象。
   原本的「문의」段落換成合輯版的回報說明，指向 TRPG Toolkit 的 repo 與上游原始碼。
   說明視窗裡其他提到「回報錯誤」的原文照樣保留。
6. **外部函式庫鎖定版本**：仍照上游以 CDN 載入，但每個都鎖定明確版本
   （上游沒鎖版本的 ag-psd 鎖在收錄當下 npm 上的最新版 31.0.2），見 `THIRD_PARTY_NOTICES.md`。
7. **頁首合輯列與字型**：頁首上方加了回首頁連結與語言選單；介面是繁體中文時，
   在 Noto Sans KR 前面補上 Noto Sans TC，避免中文用韓文漢字字形顯示。

沒有改動的部分：調色、APNG 壓縮、PSD 解析、產生的房間 ZIP（`data.json`／`__data.json` 的結構、
以 SHA-256 重新命名圖片檔的規則、輸出檔名 `<原檔名>_recolor.zip`）、
自動儲存（IndexedDB `ColorStudioAutoSaveDB`、localStorage `color_studio_session_backup`、
`color_studio_custom_presets`）的 key 與格式，都照上游。
