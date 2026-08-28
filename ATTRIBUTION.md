# 來源與授權

本 repo 收錄 [sotsotssi](https://github.com/sotsotssi) 製作的五個網頁工具，
並為其加上繁體中文介面。所有工具的原始著作權屬原作者所有。

收錄方式為快照式：自下列 commit 取得程式碼，不與上游自動同步。

| 工具 | 原始 repo | 來源 commit | 授權 |
|---|---|---|---|
| magic-circle | [sotsotssi/magic-circle-maker](https://github.com/sotsotssi/magic-circle-maker) | `de40a68` | MIT |
| typewriter | [sotsotssi/Typewriter-apng](https://github.com/sotsotssi/Typewriter-apng) | `cf3ff36` | MIT |
| text-path | [sotsotssi/text-path-generator](https://github.com/sotsotssi/text-path-generator) | `b86cd28` | MIT |
| collage-letter | [sotsotssi/collage-letter](https://github.com/sotsotssi/collage-letter) | `ea08333` | MIT |
| emotion-maker | [sotsotssi/emotion-maker](https://github.com/sotsotssi/emotion-maker) | `b455379` | **未授權** |

四個 MIT 工具的原始 `LICENSE` 檔保留於各自目錄中。

## emotion-maker 的授權狀態

`sotsotssi/emotion-maker` 未附任何授權條款，GitHub 亦未標示授權。依著作權法預設，
其權利（包含 `images/` 下全部 39 張手繪素材）保留予原作者，此處僅供試用。
原作者如有異議，將立即移除。

## 繁體中文翻譯

magic-circle 的繁體中文翻譯移植自
[tool-jx3/magic-circle-maker](https://github.com/tool-jx3/magic-circle-maker/tree/zhtw)
分支 `zhtw`，commit `772d6c4`。該分支在抽取字串時移除了如尼文的韓文讀音
（`RUNE_READINGS.ko` 為空物件），本 repo 已自上游 `de40a68` 還原這 69 組讀音。

其餘四個工具的翻譯與 i18n 改造為本 repo 新增。

各工具程式碼中的原始（韓文）原始碼註解，已一併譯為繁體中文；唯一例外是
`tools/typewriter/webp-muxer.js`——這是原封不動保留的二進位格式編碼函式庫，
其註解維持原文不動，僅將其中 8 個使用者可能看見的錯誤訊息改為穩定的英文
錯誤代碼並另行翻譯。

## 本 repo 新增的部分

`assets/`、`index.html`、`tests/`、各工具的 `i18n.*.js` 字典檔，
以及 emotion-maker 的資產路徑改造，以 MIT 授權釋出，詳見 [LICENSE](LICENSE)。
`tools/emotion-maker/` 的其餘部分（含全部圖像素材）不在此範圍內，見上節。
