/** 錄影帶畫面產生器的介面文字 */
import type { Aspect, ExportFormat, OsdFont, TimecodeMode } from './model';
import type { PreviewMode } from './store';

export const S = {
  /* 照片 */
  sectionPhoto: '照片',
  dropArea: '照片載入區',
  drop: '把照片拖到這裡',
  dropHint: '任何圖片格式；換照片時位置回到置中',
  choosePhoto: '選擇照片',
  changePhoto: '更換照片',
  currentPhoto: '目前的照片：',
  noPhotoNote: '沒有照片時是藍色的「NO SIGNAL」畫面，也可以照樣匯出。',
  resetView: '重設位置',
  removePhoto: '拿掉照片',
  zoom: '縮放',
  zoomHint: '100%＝照片剛好蓋滿畫面；縮小到最小時整張照片都放得進去（多出來的是黑底）。',
  privacy: '照片只在你的瀏覽器裡處理，不會上傳到任何地方。',

  /* 文字 */
  sectionText: '文字',
  caption: '字幕',
  captionPlaceholder: '例：……你也看到了嗎？',
  captionHint: '最多兩行（按 Enter 換行）；GIF 裡會一個字一個字打出來。',
  captionExtra: '只會用到前兩行，第 3 行以後不會出現在畫面上。',
  captionCount: (n: number, max: number) => `${n} / ${max}`,
  osd: '左上文字',
  osdPlaceholder: '空白＝不顯示',
  osdHint: '「●」會畫成紅色。',
  osdPresets: '常用文字',
  osdPreset: (t: string) => `換成「${t}」`,
  osdFont: '左上與時間碼的字型',
  osdFonts: { mono: '等寬', pixel: '像素' } satisfies Record<OsdFont, string>,
  osdFontAria: {
    mono: '等寬字型（Noto Sans Mono）',
    pixel: '像素字型（VT323）',
  } satisfies Record<OsdFont, string>,
  timecode: '時間碼',
  timecodeModes: { tape: '播放時間', clock: '日期時間', off: '不顯示' } satisfies Record<
    TimecodeMode,
    string
  >,
  timecodeStart: '起點',
  tapeStartHint: '「時:分:秒」，例如 0:00:14；畫面上的時間從這裡開始走。',
  tapeStartInvalid: '請寫成「時:分:秒」（例如 1:23:45），最多 99:59:59。',
  clockStartHint: '監視器的日期時間，例如 2026-10-31 03:14:15。',
  clockStartInvalid: '請寫成「年-月-日 時:分:秒」，而且日期要真的存在。',
  startReverted: (v: string) => `起點寫得不對，已改回 ${v}。`,

  /* 畫面 */
  sectionScreen: '畫面',
  wear: '磨損度',
  wearWords: ['幾乎全新', '有點舊了', '看得出年代', '磨損嚴重', '快看不清楚'],
  wearMin: '全新',
  wearMax: '磨爛了',
  aspect: '畫面比例',
  aspects: { '4:3': '4:3', '16:9': '16:9' } satisfies Record<Aspect, string>,
  aspectAria: {
    '4:3': '4:3（1280 × 960，錄影帶與舊電視）',
    '16:9': '16:9（1280 × 720）',
  } satisfies Record<Aspect, string>,

  /* 載入 */
  windowDrop: '放開換上這張照片',
  windowDropHint: '只用第一張圖片',
  notImage: (name: string) => `「${name}」不是圖片檔`,
  decodeError: (name: string) => `「${name}」無法讀取，檔案可能已損壞`,
  readError: (name: string) => `「${name}」讀取失敗（檔案可能已經移走或沒有權限讀取），請再選一次`,
  onlyFirst: (names: string) => `一次只能放一張照片，沒有使用「${names}」`,
  photoFailed: '沒有換照片',
  photoApplied: (name: string) => `已換上照片「${name}」`,
  photoNotSaved: '瀏覽器空間不足或無法存檔：照片這次可以用，但重新整理之後就不見了。',
  photoMissing: '上次的照片讀不到了（可能已從這個瀏覽器清除），請重新選擇照片。',
  saveFailed: '自動儲存失敗：瀏覽器空間不足或無法存檔，重新整理後可能會遺失修改。',

  /* 預覽 */
  previewMode: '預覽',
  previewModes: { tape: '錄影帶', gif: 'GIF 動畫' } satisfies Record<PreviewMode, string>,
  previewModeAria: {
    tape: '錄影帶（PNG 存目前這一格）',
    gif: 'GIF 動畫（字幕逐字打出）',
  } satisfies Record<PreviewMode, string>,
  screenLabel:
    '預覽畫面：拖曳移動照片，滾輪或兩指縮放；聚焦時方向鍵移動（Shift 移動得多）、＋／－ 縮放',
  hintPhoto: '在預覽上拖曳移動照片，滾輪或兩指縮放；點一下預覽後可以用方向鍵移動、＋／－ 縮放。',
  hintNoPhoto: '把照片拖到視窗裡任何地方、貼上（Ctrl＋V），或在左邊選擇照片。',
  hintTape: '「錄影帶」一直在播；PNG 存的是目前這一格，暫停就能挑一格。',
  hintGif: '「GIF 動畫」是匯出 GIF、APNG、WebP 的 24 格（2.16 秒）。',
  segmentTape: '錄影帶',

  /* 匯出 */
  exportTitle: '匯出',
  formats: { png: 'PNG', gif: 'GIF', apng: 'APNG', webp: 'WebP' } satisfies Record<
    ExportFormat,
    string
  >,
  formatDesc: {
    png: '靜態圖片：預覽「錄影帶」目前的那一格，四角透明。',
    gif: '動態圖片：字幕逐字打出的 24 格（2.16 秒），64 色、四角黑色。',
    apng: '動態圖片：同 GIF 的 24 格，全彩、四角透明；CCFOLIA 可以直接用。',
    webp: '動態圖片：同 GIF 的 24 格，檔案較小；Safari 無法匯出。',
  } satisfies Record<ExportFormat, string>,
  webpUnsupported: '這個瀏覽器無法匯出 WebP（Safari 不支援），請改用 Chrome、Edge 或 Firefox。',
  pngSize: (w: number, h: number) => `${w} × ${h} px`,
  pngFrame: (t: string) => `存「錄影帶」${t} 這一格。`,
  pngFramePlaying: '播放中：存按下匯出那一刻的畫面（先暫停可以挑一格）。',
  animSize: '動畫大小',
  animSizes: ['小', '中', '大'],
  animSizeOption: (label: string, w: number, h: number, original: boolean) =>
    `${label} ${w} × ${h}${original ? '（原作）' : ''}`,
  animFrames: '24 格、每格 0.09 秒（共 2.16 秒）。',
  loopHint: '原作的 GIF 一律無限循環。',
  rendering: (i: number, n: number) => `畫第 ${i}／${n} 格`,
  encoding: '編碼中',
  colorsDetail: '色數',
  colorCount: (n: number) => `${n} 色`,
  lossless: (n: number) => `${n} 色（無損）`,
  frameDetail: '畫面',
  frameAt: (t: string) => `錄影帶 ${t}`,
  seconds: (t: number) => `${t.toFixed(2)} 秒`,

  /* 復原、專案 */
  undo: '復原',
  redo: '重做',
  groupEdit: '編輯',
  groupPlay: '預覽',
  playPause: '播放／暫停預覽',
  projectSaved: '已存成專案檔',
  projectOpened: '已開啟專案檔。',
  projectOpenFailed: '無法開啟專案檔',
  projectReset: '已重設',
  projectBad: '專案檔的內容無法使用。',
  projectMissingImage: '專案檔裡缺少照片（或照片無法讀取），沒有開啟。',
  projectNotSaved: '專案檔的照片存不進這個瀏覽器：這次可以用，但重新整理之後就不見了。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的照片、文字與設定會被換掉（可以復原）。',
  openConfirmLabel: '開啟',
  resetTitle: '重設？',
  resetDesc: '照片、文字與設定都回到預設（可以復原）。',

  /* 使用方式 */
  usage: [
    '放一張照片（選檔、拖到視窗裡、或直接貼上），在預覽上拖曳移動、滾輪或兩指縮放，調整要拍到的範圍。',
    '寫下字幕（最多兩行）與左上角的文字；時間碼可以是播放時間，或監視器的日期時間。',
    '「磨損度」決定畫面壞得多嚴重：越高色差、撕裂、掉訊與雜訊越多。',
    '預覽「錄影帶」一直在播，PNG 存的是目前這一格（暫停就能挑一格）；「GIF 動畫」是匯出 GIF、APNG、WebP 的 24 格，字幕一個字一個字打出來。',
    '照片與設定會自動儲存在這個瀏覽器；也可以從「專案」選單存成專案檔，帶到別台電腦。',
  ],
} as const;
