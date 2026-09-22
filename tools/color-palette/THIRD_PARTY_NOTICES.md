# 第三方函式庫

`color-palette` 照上游原樣從 `cdn.tailwindcss.com` 載入 [Tailwind CSS](https://tailwindcss.com/)
的 Play CDN（MIT），本 repo 不散布它的檔案——處理方式與 `collage-letter`、
`text-path`、`typewriter` 相同。除此之外沒有任何外部相依：取色、量化與配色條
的算繪都是這個工具自己用 canvas 做的。

---

其餘檔案（`index.html`、`styles.css`、`app.js`）為上游
[sotsotssi/CharColorPalette](https://github.com/sotsotssi/CharColorPalette) 的
程式碼，以 MIT 釋出，`LICENSE` 保留於本目錄；繁體中文介面與 i18n 改造見
repo 根目錄的 [ATTRIBUTION.md](../../ATTRIBUTION.md)。
