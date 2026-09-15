# 來源與授權

本 repo 收錄 [sotsotssi](https://github.com/sotsotssi)、
[shiki365](https://github.com/shiki365)、
[Taku_Taku_Taku](https://github.com/Taku-Taku-Taku) 與
[kimtaehee2018-maker](https://github.com/kimtaehee2018-maker) 製作的 11 個網頁工具，
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
| status-bar | [shiki365/status-bar-maker](https://github.com/shiki365/status-bar-maker) | `1670549` | MIT |
| cutin | [Taku-Taku-Taku/cutin-maker](https://github.com/Taku-Taku-Taku/cutin-maker) | `7e9c70d` | MIT |
| ccfolia-cropper | [kimtaehee2018-maker/ccfolia-cropper](https://github.com/kimtaehee2018-maker/ccfolia-cropper) | `f149b4e` | **未授權** |

八個 MIT 工具的原始 `LICENSE` 檔保留於各自目錄中。

shiki365 的三個工具與 `cutin` 原文為日文，收錄時另有以下調整：

- `scene-transition` 的上游同時提供 Python 桌面版與瀏覽器版，本 repo 只收錄
  `docs/` 底下的瀏覽器版（合輯只收純靜態、免安裝的網頁工具）。
- `foreground-frame` 與 `scene-transition` 的 `<style>` 區塊抽出為 `styles.css`
  （理由同 text-path 與 collage-letter）。
- 這四個工具都移除了指向原作者站台的 OG／Twitter meta 與
  `<meta name="description">`——那是原部署的站台識別，其餘工具也都沒有。
  `<title>` 只留工具名，捨去 SEO 後綴。

## cutin：唯一需要建置的工具

`cutin` 的上游是 React + TypeScript + Vite 專案，不像其餘十個工具可以直接
把檔案放進 `tools/` 就能跑。因此原始碼快照收在 `vendor/cutin-maker/`，
建置產物提交在 `tools/cutin/`，重建方式見 [README](README.md#重新建置-cutin)。
`vendor/` 不參與網站發佈。

除了把使用者可見的字串改成 i18n key 之外，另有兩點與上游不同：

- **字型改由 Google Fonts 載入。** 上游用 `@fontsource` 同捆六套日文網頁字型
  自行配送（在連不到 `fonts.googleapis.com` 的環境也能運作，且不會把瀏覽者的
  IP 交給第三方）。本 repo 因為要把建置產物提交進 repo，723 個檔案、16MB 的
  同捆並不合適，故改為參照 CDN；合輯的其他工具（Tailwind、pako、字型）也是
  這樣載入的。Google Fonts 的 CSS 同樣以 `unicode-range` 分割，實際下載的仍
  只有用到的字所在的區塊。
- **範本的預設文案一併在地化。** `成功`／`失敗` 這類預設輸出文字本身就是工具
  的產物，因此繁中介面下改為輸出繁體中文（例：`正気度喪失` → `理智喪失`）。
  選字時已逐字確認六套日文字型的 `unicode-range` 皆有涵蓋，不會出現豆腐字。

改用 CDN 連帶牽動兩處：`scripts/collect-licenses.mjs` 不再從 `node_modules`
蒐集字型授權（`public/licenses/OFL.txt` 與 `fonts.txt` 保留收錄當下的內容，
「關於這個工具」仍會連到 OFL 全文）；上游的 vitest 有一項斷言比對驗證訊息中的
日文字串，改為比對其 i18n key。上游 240 項單元測試全數通過。

## 未授權的三個工具

`sotsotssi/emotion-maker`、`sotsotssi/loading-maker` 與
`kimtaehee2018-maker/ccfolia-cropper` 皆未附任何授權條款，
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

其餘十個工具的翻譯與 i18n 改造為本 repo 新增。

各工具程式碼中的原始（韓文）原始碼註解，已一併譯為繁體中文；shiki365 的三個工具
原本就以英文撰寫註解，僅檔頭標題改為中譯名。兩個例外：

- `tools/typewriter/webp-muxer.js`——這是原封不動保留的二進位格式編碼函式庫，
  其註解維持原文不動，僅將其中 8 個使用者可能看見的錯誤訊息改為穩定的英文
  錯誤代碼並另行翻譯。
- `vendor/cutin-maker/`——註解密度高且多為演算法說明（描邊順序、`unicode-range`
  分割、記憶體上限推導等），逐句轉譯風險大於效益，故維持日文原文；只有使用者
  看得到的字串與本 repo 新增的註解為中文。這些註解不會出現在 `tools/cutin/`
  的建置產物裡。

## 本 repo 新增的部分

`assets/`、`index.html`、`tests/`、各工具的 `i18n.*.js` 字典檔，
以及 emotion-maker 的資產路徑改造，以 MIT 授權釋出，詳見 [LICENSE](LICENSE)。
`tools/emotion-maker/`（含全部圖像素材）、`tools/loading-maker/` 與
`tools/ccfolia-cropper/` 的其餘部分不在此範圍內，見上節。
