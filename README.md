# TRPG Toolkit

[sotsotssi](https://github.com/sotsotssi) 製作的五個網頁小工具合輯，附繁體中文介面。

**https://tool-jx3.github.io/toolkit/**

| 工具 | 說明 |
|---|---|
| [魔法陣製作器](tools/magic-circle/) | 繪製魔法陣與簽名動態，支援對稱、貝茲曲線、時間軸與 GIF／APNG 匯出 |
| [打字機動畫產生器](tools/typewriter/) | 輸入文字，產生逐字打出效果的 APNG／GIF／WebP 動畫圖 |
| [文字軌跡產生器](tools/text-path/) | 讓文字沿著自訂路徑排列，輸出為圖片 |
| [匿名拼貼信產生器](tools/collage-letter/) | 以剪報拼貼風格的字母組成信件圖片 |
| [表情產生器](tools/emotion-maker/) | 組合眼睛、眉毛、嘴巴與裝飾，製作表情差分與合本圖 |

以下工具全部在瀏覽器本機執行，不會上傳你建立的任何內容；但部分工具會從 CDN 載入函式庫與字型。

## 本機執行

無建置步驟。直接以瀏覽器開啟 `index.html` 即可，或啟動本機伺服器：

```
npm run serve
```

然後開啟 http://localhost:8080/

（`emotion-maker` 的合本圖片產生功能受 canvas 安全限制影響，需以伺服器方式開啟。）

## 測試

```
npm test
```

靜態檢查，無外部相依。檢查項目包含：字典 key 完整性、兩語言 key 集合對稱、
`{n}` 佔位符一致、標記引用的 key 皆存在、**無殘留未翻譯的韓文**、
emotion-maker 的圖片資產完整、首頁連結有效、
**HTML 內嵌文字與 zh-TW 字典逐字相符**（含元素內文與 `title`／`aria-label`／`placeholder` 屬性兩類比對）。

## 語言

介面預設為繁體中文，可由右上角切換為韓文。選擇記錄於 `localStorage`
（key：`trpg-toolkit-locale`），首頁與各工具共用。

### 新增語言

1. 在 `assets/i18n.js` 的 `LOCALES` 加入一筆，指定顯示名稱與 `lang` 屬性
2. 在每個 `i18n.*.js` 字典中加入同名的語言區塊
3. 執行 `npm test` 確認沒有漏 key

不需更動任何 HTML 或工具程式碼。

## 授權

根目錄 [LICENSE](LICENSE)（MIT）僅涵蓋本 repo 新增的部分：`assets/`、
`index.html`、`tests/`、各 `i18n.*.js` 字典，以及 emotion-maker 的資產路徑改造。
各工具的原始授權與來源見 [ATTRIBUTION.md](ATTRIBUTION.md)。

**注意**：`emotion-maker` 的原始 repo 未附任何授權條款，其權利（含全部圖像素材）
屬原作者所有，不在根目錄 LICENSE 涵蓋範圍內，此處僅供試用。
