# 第三方函式庫與素材

## 以 CDN 載入的函式庫

`trpg-lab` 照上游原樣以 CDN 載入下列函式庫，本 repo 不散布它們的檔案。
處理方式與 `gif-combiner`、`acrylic-goods` 等工具相同。

| 函式庫 | 版本 | 來源 | 授權 | 用在哪裡 |
|---|---|---|---|---|
| [Fabric.js](https://fabricjs.com/) | 5.2.4 | cdnjs | MIT（Fabric.js contributors） | 調查員角色卡上傳頭像時的裁切／調整視窗 |
| [Fabric.js](https://fabricjs.com/) | 5.3.1 | cdnjs | MIT（Fabric.js contributors） | 地圖編輯器的畫布 |
| [Pickr](https://github.com/Simonwep/pickr) | 1.9.1 | jsDelivr | MIT（Simon Reinisch） | 網格／六角格產生器、兩個量尺產生器、地圖編輯器的取色器（連同 `nano` 主題 CSS） |
| [polygon-clipping](https://github.com/mfogel/polygon-clipping) | 0.15.7 | jsDelivr | MIT（Mike Fogel） | 地圖編輯器的圖形布林運算（聯集、交集、差集、互斥） |
| [Font Awesome Free](https://fontawesome.com/) | 6.5.1 | cdnjs | 圖示 CC BY 4.0、字型 SIL OFL 1.1、程式碼 MIT（Fonticons, Inc.） | 頁首的 X 圖示、GitHub 圖示與各頁的圖示 |
| [Material Symbols](https://fonts.google.com/icons)（Outlined） | — | Google Fonts | Apache 2.0（Google） | 各頁的圖示 |
| 網頁字型 | — | Google Fonts | SIL OFL 1.1 等開放授權 | Noto Sans JP、Orbitron、Share Tech Mono，以及地圖編輯器文字工具的三十多套字型（清單見 `third-party-licenses.html`） |

上游地圖編輯器載入 Pickr 時沒寫版本（`@simonwep/pickr/dist/pickr.min.js`），
其餘頁面都用 1.9.1；收錄版把它也釘在 1.9.1，免得哪天 jsDelivr 的最新版改了介面。

地圖編輯器的文字字型清單另外加了五套繁體中文網頁字型（Noto Sans TC、Noto Serif TC、
LXGW WenKai TC、Chocolate Classical Sans、Cactus Classical Serif），同樣由 Google Fonts
提供、SIL OFL 1.1 授權，做法與本 repo 其他工具加繁中字型時相同。

## 隨檔案散布的素材

`trpg_map_maker/decors/svg/` 裡的 56 個 SVG 是地圖編輯器的裝飾圖章：

- 16 個取自 [game-icons.net](https://game-icons.net/)，作者 Delapouite 與 Lorc，
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。上游刪掉了原檔的黑底背景 path，
  並把主體的 `fill="#fff"` 改成 `fill="#505050"`。檔名與原圖示名稱的對照表在
  `third-party-licenses.html`（頁面上也看得到）。
- 40 個 `jp-*.svg` 取自 [openstreetmap/map-icons](https://github.com/openstreetmap/map-icons)
  的 `japan/` 目錄，相當於公有領域（PD-style）。上游刪掉了白色背景矩形，並把 stroke／fill
  統一成黑色。

## 上游有、但收錄版不收的素材

原作者在上游的授權頁寫明：網站管理者自製的素材（間取り図 SVG、AI 生成的貼圖、各工具的設計等）
權利歸作者，商業使用與再散布請先聯絡。收錄版只收 MIT 授權的程式碼與上面兩批可再散布的圖示，
下列檔案都不收：

- `trpg_map_maker/patterns/`：地圖編輯器內建的 14 張地面／牆壁貼圖（AI 生成）。
- `trpg_map_maker/decors/svg/` 裡 15 個格局圖（間取り図）用 SVG：`fp-door`、`fp-door-large`、
  `fp-door-open`、`fp-door-double-open`、`bed_single`、`bed_double`、`bed_queen`、`chair`、
  `toilet`、`table_4`、`table_chair_6`、`kitchen`、`window_single`、`window_double`、
  `stairs_straight`。
- `dice_sound.wav`：擲骰工具的音效，出自ニコニ・コモンズ，素材本身不得再散布。
- 網站 Logo（`ihoukentiku_full.svg`）、OGP 圖片與 `favicon.ico`。

地圖編輯器仍可使用使用者自己上傳的貼圖；存檔裡若引用了上游內建貼圖，讀進來時會退回單色。

---

其餘檔案為上游
[ihoukentiku/ihoukentiku.github.io](https://github.com/ihoukentiku/ihoukentiku.github.io)
的程式碼，以 MIT 釋出，`LICENSE` 保留於本目錄；繁體中文介面與 i18n 改造見 repo 根目錄的
[ATTRIBUTION.md](../../ATTRIBUTION.md)。
