/** 鎖定畫面訊息產生器的介面文字 */
import type { ExportFormat, ExportTarget, GradientDirection, PhoneSide } from './model';
import type { PhotoSlot, PreviewMode, TabId } from './store';

export const S = {
  /* 分頁 */
  tabsLabel: '設定分類',
  tabs: { messages: '訊息', phone: '手機畫面', outer: '外框構圖' } satisfies Record<TabId, string>,

  /* 訊息 */
  sectionMessages: '訊息',
  messageCount: (n: number, max: number) => `${n} / ${max}`,
  messagesHint: '依收到的順序一則一則跳出來，新的疊在最上面。',
  messageTitle: (n: number) => `第 ${n} 則`,
  sender: '寄件人',
  senderPlaceholder: '例如 未知號碼',
  received: '收到時間',
  receivedPlaceholder: '空白＝現在',
  receivedHint: '可以寫「23:41」「昨天」等；空白時顯示「現在」。',
  body: '內容',
  bodyPlaceholder: '訊息的內容',
  bodyClipped: '超過 4 行，通知裡只顯示到第 4 行（後面以「…」省略）。',
  addMessage: '加一則訊息',
  removeMessage: (n: number) => `刪除第 ${n} 則`,
  moveUp: (n: number) => `第 ${n} 則往前（早一點收到）`,
  moveDown: (n: number) => `第 ${n} 則往後（晚一點收到）`,
  messagesFull: (max: number) => `最多 ${max} 則。`,
  linesNote: '內容太長時，通知裡最多顯示 4 行。',

  /* 通知樣式 */
  sectionCard: '通知樣式',
  appName: 'App 名稱',
  appNameHint: '通知左上角圖示旁的名稱。',
  opacity: '卡片不透明度',
  blur: '卡片背景模糊',
  interval: '訊息間隔',
  intervalHint: '每一則跳出來之間隔幾秒（GIF 與預覽的播放都照這個）。',
  seconds: '秒',

  /* 手機畫面：桌布 */
  sectionWallpaper: '桌布',
  wallpaperDropArea: '桌布照片載入區',
  wallpaperDrop: '把桌布照片拖到這裡',
  dropHint: '任何圖片格式；選好之後裁切成手機畫面的比例',
  choosePhoto: '選擇照片',
  changePhoto: '更換照片',
  currentPhoto: '目前的照片：',
  recrop: '重新裁切',
  useDefault: { wallpaper: '用預設桌布', outer: '用預設背景' } satisfies Record<PhotoSlot, string>,
  defaultWallpaperNote: '沒有照片時用預設的夜景桌布。',
  dim: '變暗',
  privacy: '照片只在你的瀏覽器裡處理，不會上傳到任何地方。',

  /* 手機畫面：鎖定畫面 */
  sectionLock: '鎖定畫面',
  time: '時間',
  timeHint: '24 小時制，例如 23:47；也可以只打數字（2347）。',
  timeInvalid: '時間要在 00:00～23:59 之間。',
  timeReverted: (t: string) => `時間要在 00:00～23:59 之間，已改回 ${t}。`,
  date: '日期',
  dateLabel: (label: string) => `畫面上顯示「${label}」。`,
  dateInvalid: '請選一個日期。',
  showStatus: '顯示狀態列',
  statusHint: '畫面最上面的訊號、Wi-Fi 與電量。',

  /* 外框構圖 */
  sectionOuter: '外框背景',
  outerDropArea: '外框照片載入區',
  outerDrop: '把外框照片拖到這裡',
  outerDropHint: '任何圖片格式；選好之後裁切成正方形（1200 × 1200）',
  defaultOuterNote: '沒有照片時用預設的灰藍色漸層。',
  outerDim: '外框變暗',
  sectionGradient: '漸層',
  gradientOn: '顯示漸層',
  gradientColor: '漸層顏色',
  gradientDirection: '方向',
  directions: {
    right: '從右邊',
    left: '從左邊',
    bottom: '從下面',
    top: '從上面',
  } satisfies Record<GradientDirection, string>,
  directionAria: {
    right: '從右邊往左變淡',
    left: '從左邊往右變淡',
    bottom: '從下面往上變淡',
    top: '從上面往下變淡',
  } satisfies Record<GradientDirection, string>,
  gradientLength: '漸層長度',
  sectionPhone: '手機',
  phoneSide: '手機位置',
  sides: { left: '靠左', center: '置中', right: '靠右' } satisfies Record<PhoneSide, string>,
  outerHint: '完整構圖是 1200 × 1200 的正方形：外框背景上放一支手機。',

  /* 裁切 */
  cropTitle: { wallpaper: '裁切桌布', outer: '裁切外框背景' } satisfies Record<PhotoSlot, string>,
  cropNote: {
    wallpaper: '拖曳照片調整位置，用滾輪、滑桿或兩指縮放（手機畫面 9：19.5）。',
    outer: '拖曳照片調整位置，用滾輪、滑桿或兩指縮放（正方形）。',
  } satisfies Record<PhotoSlot, string>,

  /* 載入 */
  windowDrop: '放開即可換成這張桌布',
  windowDropOuter: '放開即可換成這張外框背景',
  windowDropHint: '放開之後先裁切',
  notImage: (name: string) => `「${name}」不是圖片檔`,
  decodeError: (name: string) => `「${name}」無法讀取，檔案可能已損壞`,
  readError: (name: string) => `「${name}」讀取失敗（檔案可能已經移走或沒有權限讀取），請再選一次`,
  lostError: (name: string) => `「${name}」暫存時遺失了，請再選一次`,
  onlyFirst: (names: string) => `一次只能放一張照片，沒有使用「${names}」`,
  photoFailed: '沒有換照片',
  photoNotSaved: '瀏覽器空間不足或無法存檔：照片這次可以用，但重新整理之後就不見了。',
  photoApplied: (name: string) => `已換上照片「${name}」`,
  photoMissing: {
    wallpaper: '上次的桌布照片讀不到了（可能已從這個瀏覽器清除），請重新選擇照片。',
    outer: '上次的外框照片讀不到了（可能已從這個瀏覽器清除），請重新選擇照片。',
  } satisfies Record<PhotoSlot, string>,
  saveFailed: '自動儲存失敗：瀏覽器空間不足或無法存檔，重新整理後可能會遺失修改。',

  /* 預覽 */
  previewMode: '預覽',
  previewModes: { screen: '手機畫面', full: '完整構圖' } satisfies Record<PreviewMode, string>,
  previewLabel: { screen: '手機畫面的預覽', full: '完整構圖的預覽' } satisfies Record<
    PreviewMode,
    string
  >,
  playPreview: '播放訊息跳出來的動畫',
  previewHint: '點預覽或按「播放」看訊息一則一則跳出來；平常顯示全部的訊息。',
  segmentWait: '開始前',
  segmentMessage: (n: number) => `第 ${n} 則`,

  /* 匯出 */
  exportTitle: '匯出',
  formats: { png: 'PNG', gif: 'GIF' } satisfies Record<ExportFormat, string>,
  formatDesc: {
    png: '靜態圖片：全部的訊息都出現的畫面。',
    gif: '動態圖片：訊息一則一則跳出來。',
  } satisfies Record<ExportFormat, string>,
  target: '範圍',
  targets: { screen: '手機畫面', full: '完整構圖' } satisfies Record<ExportTarget, string>,
  targetAria: {
    screen: '手機畫面（只有畫面）',
    full: '完整構圖（外框背景＋手機）',
  } satisfies Record<ExportTarget, string>,
  targetSize: (w: number, h: number) => `${w} × ${h} px`,
  gifWidth: 'GIF 大小',
  gifWidthOption: (w: number, h: number) => `${w} × ${h}`,
  gifHint: '手機畫面的 GIF 越大檔案越大；完整構圖固定 1200 × 1200。',
  loopHint: '原作的 GIF 一律無限循環。',
  exportFrames: (n: number, sec: number) => `${n} 格、約 ${sec.toFixed(1)} 秒`,
  rendering: (i: number, n: number) => `畫第 ${i}／${n} 格`,
  encoding: '編碼中',
  colorsDetail: '色數',
  colorCount: (n: number) => `${n} 色`,
  lossless: (n: number) => `${n} 色（無損）`,
  framesDetail: '影格',

  /* 復原、專案 */
  undo: '復原',
  redo: '重做',
  groupEdit: '編輯',
  groupPlay: '預覽',
  playPause: '播放／暫停訊息動畫',
  projectSaved: '已存成專案檔',
  projectOpened: '已開啟專案檔。',
  projectOpenFailed: '無法開啟專案檔',
  projectReset: '已重設',
  projectBad: '專案檔的內容無法使用。',
  projectMissingImage: '專案檔裡缺少照片（或照片無法讀取），沒有開啟。',
  projectNotSaved: '專案檔的照片存不進這個瀏覽器：這次可以用，但重新整理之後就不見了。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的訊息、照片與設定會被換掉（可以復原）。',
  openConfirmLabel: '開啟',
  resetTitle: '重設？',
  resetDesc: '訊息、照片與設定都回到預設（可以復原）。',

  /* 使用方式 */
  usage: [
    '在「訊息」寫好寄件人與內容（最多 4 則），依收到的順序一則一則跳出來，新的疊在最上面。',
    '在「手機畫面」換桌布照片（選好之後裁切）、改時間與日期；在「外框構圖」換手機外面的背景、漸層與手機的位置。',
    '預覽可以切換「手機畫面」與「完整構圖」；點預覽或按播放看訊息跳出來的動畫。',
    '匯出 PNG（全部的訊息都出現）或 GIF（訊息一則一則跳出來），範圍可以選只有手機畫面或完整構圖。',
    '內容與照片會自動儲存在這個瀏覽器；也可以從「專案」選單存成專案檔，帶到別台電腦。',
  ],
} as const;
