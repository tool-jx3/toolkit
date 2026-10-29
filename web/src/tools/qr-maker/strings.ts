/**
 * 介面文字（台灣繁體中文；用詞照 docs/refactor/DESIGN.md 第 5 節）。
 */
import type {
  QrCornerDotType,
  QrCornerSquareType,
  QrDataMode,
  QrDecodeFailure,
  QrDotType,
  QrEcl,
  QrModeChoice,
} from '@/core/qr';
import type { ExportFormat, TabId } from './store';

const DOT_LABELS: Record<QrDotType, string> = {
  square: '方塊',
  dots: '圓點',
  rounded: '圓角',
  'extra-rounded': '大圓角',
  classy: '葉形',
  'classy-rounded': '圓葉形',
};

export const S = {
  /* 分頁 */
  tabsLabel: '設定分類',
  tabs: { content: '內容', style: '樣式', image: '圖片', export: '匯出' } satisfies Record<
    TabId,
    string
  >,

  /* 內容 */
  sectionData: '內容',
  data: '網址或文字',
  dataPlaceholder: '例如 https://… 或任何文字',
  dataInfo: (mode: string, bytes: number, version: number, size: number) =>
    `${mode}・${bytes} 位元組・第 ${version} 版（${size} × ${size} 格）`,
  dataHint: '中文、表情符號都可以（以 UTF-8 編碼）。內容越長，格子越密。',
  sectionSize: '大小',
  width: '寬',
  height: '高',
  margin: '邊距',
  marginHint: '圖片四周留白的寬度；QR code 在剩下的範圍裡置中。',
  shape: '整體形狀',
  shapes: { square: '方形', circle: '圓形' },
  shapeHint: '圓形：QR code 縮小一些，外圍補上裝飾的點（不影響掃描），通常搭配圓形的背景。',
  sectionQr: 'QR code 設定',
  ecl: '錯誤更正等級',
  eclOption: (e: QrEcl) => e,
  eclDesc: {
    L: 'L：約 7% 的格子壞掉還讀得出來，格子最少。',
    M: 'M：約 15%。',
    Q: 'Q：約 25%（預設）。',
    H: 'H：約 30%，最耐髒污；中間放圖時建議用 H。',
  } satisfies Record<QrEcl, string>,
  version: '版本',
  versionAuto: '自動（放得下的最小版本）',
  versionOption: (v: number) => `第 ${v} 版`,
  versionDesc: (size: number) => `${size} × ${size} 格`,
  versionHint: '版本越大格子越多、放得越多；通常用自動就好。',
  mode: '模式',
  modes: {
    auto: '自動（依內容）',
    numeric: '數字',
    alphanumeric: '英數字',
    byte: '位元組（UTF-8）',
    kanji: '漢字（Shift_JIS）',
  } satisfies Record<QrModeChoice, string>,
  modeDesc: {
    auto: '全是數字用數字模式，只有大寫英文、數字與 $ % * + - . / : 空白時用英數字模式，其他用位元組模式。',
    numeric: '只能有 0～9，最省格子。',
    alphanumeric: '只能有 0～9、大寫 A～Z、空白與 $ % * + - . / :。',
    byte: '任何文字（UTF-8）。',
    kanji:
      '只能有 Shift_JIS 裡的全形字（日文的漢字、假名、全形符號）；繁體中文有些字（例如「妳」「嗎」）不能用，英文、數字也要全形。',
  } satisfies Record<QrModeChoice, string>,
  modeName: {
    numeric: '數字模式',
    alphanumeric: '英數字模式',
    byte: '位元組模式',
    kanji: '漢字模式',
  } satisfies Record<QrDataMode, string>,

  /* 編碼與版面的錯誤（預覽區） */
  errEmpty: '請在「內容」輸入網址或文字。',
  errMode: (mode: QrDataMode, ch: string) =>
    `「${ch}」不能用${S.modeName[mode]}；請把模式改成自動或位元組。`,
  errTooLong: (ecl: QrEcl) =>
    `內容太長，第 40 版也放不下（錯誤更正等級 ${ecl}）；請縮短內容或降低錯誤更正等級。`,
  errVersion: (v: number, min: number) =>
    `第 ${v} 版放不下這段內容，至少要第 ${min} 版（或改成自動）。`,
  errTooSmall: (count: number) =>
    `尺寸太小，放不下 ${count} × ${count} 格；請加大寬高、減少邊距或縮短內容。`,

  /* 樣式 */
  sectionLooks: '外觀預設',
  looksHint: '只換點、角、背景與整體形狀；內容、大小與中間的圖不變。可以復原。',
  sectionDots: '點',
  dotType: '點的樣式',
  dotTypes: DOT_LABELS,
  roundSize: '點的大小取整數',
  roundSizeHint: '每格的大小取整數 px，邊緣比較銳利，四周可能多出一點空白；關掉時剛好填滿。',
  color: '顏色',
  paintModes: { solid: '單色', gradient: '漸層' },
  paintInheritSquare: '跟著點',
  paintInheritDot: '跟著外框',
  gradient: '漸層',
  sectionCornerSquare: '角的外框',
  cornerSquareType: '外框的樣式',
  cornerSquareTypes: {
    none: '跟著點',
    square: '方框',
    dot: '圓框',
    'extra-rounded': '圓角框',
    dots: '圓點',
    rounded: '圓角',
    classy: '葉形',
    'classy-rounded': '圓葉形',
  } satisfies Record<'none' | QrCornerSquareType, string>,
  cornerSquareHint: '三個角的大方框（掃描時用來定位）。「跟著點」用點的樣式一格一格畫。',
  sectionCornerDot: '角的中心',
  cornerDotType: '中心的樣式',
  cornerDotTypes: {
    none: '跟著點',
    square: '方塊',
    dot: '圓',
    dots: '圓點',
    rounded: '圓角',
    'extra-rounded': '大圓角',
    classy: '葉形',
    'classy-rounded': '圓葉形',
  } satisfies Record<'none' | QrCornerDotType, string>,
  cornerGradientHint: '漸層的方向在三個角各自轉向（左上、右上轉 90°、左下轉 −90°）。',
  sectionBackground: '背景',
  backgroundModes: { solid: '單色', gradient: '漸層', transparent: '透明' },
  backgroundRound: '圓角',
  backgroundRoundHint: '有圓角時背景是置中的正方形（邊長＝寬高較短的一邊），100% 是圓形。',
  transparentHint: '透明的背景：匯出 JPEG 時鋪白色。',

  /* 圖片 */
  sectionImage: '中間的圖',
  imageDropArea: '中間的圖載入區',
  imageDrop: '拖放或選擇一張圖（Logo、角色頭像…）',
  imageDropHint: 'PNG、JPEG、WebP、SVG 都可以。圖片只存在這個瀏覽器。',
  imageInfo: (name: string, w: number, h: number) => `${name || '（沒有檔名）'}・${w} × ${h} px`,
  imageRemove: '拿掉圖',
  imageMissing: '找不到這張圖（可能已從這個瀏覽器清除），請重新選一張。',
  imageFailed: (name: string) => `讀不了這張圖：${name}`,
  imageNotSaved: '這張圖存不進瀏覽器（空間不足或被封鎖），重新整理之後就不見了。',
  imageSize: '大小',
  imageSizeHint: '拿掉的格子最多是錯誤更正能修復的比例 × 這個係數（同原作）；超過 50% 不建議。',
  imageMargin: '圖的邊距',
  imageMarginHint: '圖四周留白（px）。',
  hideDots: '拿掉圖後面的點',
  hideDotsHint: '關掉時圖直接蓋在點上，被蓋住的格子要靠錯誤更正修回來。',
  imageTip: '中間放圖時建議把錯誤更正等級調成 H，並看下面的掃描檢查。',

  /* 匯出 */
  exportTitle: '匯出',
  formats: { png: 'PNG', jpeg: 'JPEG', webp: 'WebP', svg: 'SVG' } satisfies Record<
    ExportFormat,
    string
  >,
  formatDesc: {
    png: '點陣圖，可以有透明背景。',
    jpeg: '點陣圖，沒有透明（透明的地方鋪白色）。',
    webp: '點陣圖，可以有透明背景；檔案通常比 PNG 小。',
    svg: '向量圖，放大不會糊；中間的圖嵌在檔案裡。',
  } satisfies Record<ExportFormat, string>,
  webpUnsupported: '這個瀏覽器無法匯出 WebP（Safari 不支援），請改用 Chrome、Edge 或 Firefox。',
  fileName: '檔名',
  fileNameHint: '不含副檔名；空白時用「qr」。',
  copyImage: '複製圖片',
  copied: '已複製圖片（PNG）',
  copyFailed: '無法複製圖片，請改用匯出後下載',
  exportFailed: '匯出失敗',
  notReady: '目前的設定畫不出 QR code，請先看預覽區的說明。',
  downloaded: (name: string) => `已下載 ${name}`,

  /* 預覽與檢查 */
  previewLabel: 'QR code 預覽',
  checkTitle: '掃描檢查',
  checkLabel: '掃描檢查的結果',
  checking: '檢查中…',
  checkOk: (version: number, ecl: QrEcl) =>
    `讀得出來：讀回來的內容和輸入的相同（第 ${version} 版・等級 ${ecl}）。`,
  checkFail: '讀不出來：照每一格的顏色讀不回原來的內容。',
  checkRisky: '每一格讀得回來，但掃描程式可能找不到這個 QR code（見下面）。',
  checkOkWarn: (version: number, ecl: QrEcl) =>
    `讀得出來（第 ${version} 版・等級 ${ecl}），但有要注意的地方（見下面）。`,
  cornerNames: ['左上', '右上', '左下'],
  checkFinder: (which: string) =>
    `${which}的定位方框太淡或形狀不對：掃描程式要先找到三個角的方框，找不到就掃不到；請把角的顏色換深一點。`,
  checkFailReason: {
    size: '格數不對。',
    format: '格式資訊（三個角旁邊的格子）讀不出來，通常是顏色太淡或對比太低。',
    correction: '壞掉的格子太多，錯誤更正修不回來。',
    data: '資料讀出來是壞的。',
  } satisfies Record<QrDecodeFailure, string>,
  checkFailTips:
    '可以把錯誤更正等級調高、把中間的圖縮小或打開「拿掉圖後面的點」、把點的顏色換深一點。',
  checkMismatch: (got: string) => `讀出來的內容和輸入的不同：「${got}」`,
  checkCorrected: (n: number, pct: number) =>
    `有 ${n} 個碼字是靠錯誤更正修回來的（最多的一塊用掉 ${pct}% 的容錯）。`,
  checkCorrectedHint:
    '印出來有髒污、反光或折痕時可能就讀不出來了；可以把錯誤更正等級調高或把圖縮小。',
  checkInverted:
    '顏色是反過來的（淺色的點、深色的底）：反過來讀得出來，但很多手機和掃描程式不支援。',
  checkContrastLow: (r: string) =>
    `點和背景的對比太低（最差約 ${r}:1）：很多掃描程式會讀不出來，請把點換深一點或背景換淺一點。`,
  checkContrastFair: (r: string) =>
    `點和背景的對比偏低（最差約 ${r}:1）：光線不好或印出來時可能不好掃。`,
  checkTransparent: '背景透明：貼在深色或有花紋的底上時可能掃不到。',
  checkSmallCell: (px: string) =>
    `每一格只有 ${px} px：縮小顯示或列印時可能糊掉，可以加大寬高或用 SVG。`,
  checkQuiet: (n: string) =>
    `四周留白約 ${n} 格：貼在白底上沒關係，貼在有顏色或花紋的底上時建議把邊距加大到 2～4 格。`,
  checkNote: '檢查的是每一格的顏色讀不讀得回原來的內容，不是用相機掃；實際使用前請再用手機掃一次。',

  /* 專案 */
  projectOpened: '已開啟專案檔',
  projectSaved: '已存成專案檔',
  projectOpenFailed: '無法開啟專案檔',
  projectReset: '已全部重來',
  projectBad: '專案檔的內容不對。',
  projectMissingImage: '專案檔裡少了中間的圖。',
  projectNotSaved: '中間的圖存不進這個瀏覽器，重新整理之後就不見了。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的內容與樣式會被取代（可以復原）。',
  openConfirmLabel: '選擇專案檔',
  resetTitle: '全部重來？',
  resetDesc: '內容、樣式與中間的圖都回到預設（可以復原）。',
  saveFailed: '自動儲存失敗（瀏覽器的空間不足或被封鎖），請存成專案檔。',

  /* 頁首、快捷鍵 */
  undo: '復原',
  redo: '重做',
  groupEdit: '編輯',
  groupFile: '檔案',
  shortcutDownload: '用目前的格式下載',
  windowDrop: '放開即可放進中間',
  windowDropHint: '圖片會放在 QR code 的中間。',

  usage: [
    '在「內容」輸入網址或文字（例如劇本的販售頁、handout 的線索、角色卡的連結）；中文也可以。',
    '在「樣式」挑一組外觀預設，或自己調點、三個角與背景的樣式和顏色（單色或漸層）。',
    '想在中間放 Logo 或角色頭像，到「圖片」選一張圖；放圖時錯誤更正等級建議用 H。',
    '預覽下面的「掃描檢查」會照每一格的顏色讀一次，讀不出來或對比太低時會提醒。',
    '在「匯出」選 PNG、JPEG、WebP 或 SVG（向量）下載，或複製圖片直接貼到 Discord、CCFOLIA。',
    '設定與圖片自動存在這個瀏覽器；「專案」選單可以存成專案檔（有圖時是 ZIP）帶到別台電腦。',
  ],
} as const;
