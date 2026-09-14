# 來源與授權

本 repo 收錄 [sotsotssi](https://github.com/sotsotssi) 與
[shiki365](https://github.com/shiki365) 製作的八個網頁工具，
並為其加上繁體中文介面。所有工具的原始著作權屬各自的原作者所有。

收錄方式為快照式：自下列 commit 取得程式碼，不與上游自動同步。

| 工具 | 原始 repo | 來源 commit | 授權 |
|---|---|---|---|
| magic-circle | [sotsotssi/magic-circle-maker](https://github.com/sotsotssi/magic-circle-maker) | `de40a68` | MIT |
| typewriter | [sotsotssi/Typewriter-apng](https://github.com/sotsotssi/Typewriter-apng) | `cf3ff36` | MIT |
| text-path | [sotsotssi/text-path-generator](https://github.com/sotsotssi/text-path-generator) | `b86cd28` | MIT |
| collage-letter | [sotsotssi/collage-letter](https://github.com/sotsotssi/collage-letter) | `ea08333` | MIT |
| emotion-maker | [sotsotssi/emotion-maker](https://github.com/sotsotssi/emotion-maker) | `b455379` | **未授權** |
| loading-maker | [sotsotssi/loading-maker](https://github.com/sotsotssi/loading-maker) | `615664b` | **未授權** |
| foreground-frame | [shiki365/foreground-frame-maker](https://github.com/shiki365/foreground-frame-maker) | `5175934` | MIT |
| scene-transition | [shiki365/scene-transition-maker](https://github.com/shiki365/scene-transition-maker) | `a6621e2` | MIT |

六個 MIT 工具的原始 `LICENSE` 檔保留於各自目錄中。

shiki365 的兩個工具原文為日文，收錄時另有兩點調整：

- `scene-transition` 的上游同時提供 Python 桌面版與瀏覽器版，本 repo 只收錄
  `docs/` 底下的瀏覽器版（合輯只收純靜態、免安裝的網頁工具）。
- 兩者的 `<style>` 區塊抽出為 `styles.css`（理由同 text-path 與 collage-letter），
  並移除指向原作者站台的 OG／Twitter meta 與 `<meta name="description">`——
  那是原部署的站台識別，其餘工具也都沒有。`<title>` 只留工具名，捨去 SEO 後綴。

## 未授權的兩個工具

`sotsotssi/emotion-maker` 與 `sotsotssi/loading-maker` 皆未附任何授權條款，
GitHub 亦未標示授權。依著作權法預設，其權利保留予原作者（`emotion-maker`
包含 `images/` 下全部 39 張手繪素材），此處僅供試用。原作者如有異議，將立即移除。

`loading-maker` 以 CDN 載入 pako 0.2.9（MIT，Copyright (C) 2014-2016 by
Vitaly Puzrin）作為 APNG 壓縮／解壓縮之用，其出處與授權見
[tools/loading-maker/THIRD_PARTY_NOTICES.md](tools/loading-maker/THIRD_PARTY_NOTICES.md)。

## 繁體中文翻譯

magic-circle 的繁體中文翻譯移植自
[tool-jx3/magic-circle-maker](https://github.com/tool-jx3/magic-circle-maker/tree/zhtw)
分支 `zhtw`，commit `772d6c4`。該分支在抽取字串時移除了如尼文的韓文讀音
（`RUNE_READINGS.ko` 為空物件），本 repo 已自上游 `de40a68` 還原這 69 組讀音。

其餘七個工具的翻譯與 i18n 改造為本 repo 新增。

各工具程式碼中的原始（韓文）原始碼註解，已一併譯為繁體中文；shiki365 的兩個工具
原本就以英文撰寫註解，僅檔頭標題改為中譯名。唯一例外是
`tools/typewriter/webp-muxer.js`——這是原封不動保留的二進位格式編碼函式庫，
其註解維持原文不動，僅將其中 8 個使用者可能看見的錯誤訊息改為穩定的英文
錯誤代碼並另行翻譯。

## 本 repo 新增的部分

`assets/`、`index.html`、`tests/`、各工具的 `i18n.*.js` 字典檔，
以及 emotion-maker 的資產路徑改造，以 MIT 授權釋出，詳見 [LICENSE](LICENSE)。
`tools/emotion-maker/` 的其餘部分（含全部圖像素材）與 `tools/loading-maker/`
的其餘部分不在此範圍內，見上節。
