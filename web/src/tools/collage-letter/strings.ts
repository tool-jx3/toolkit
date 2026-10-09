/** 匿名拼貼信產生器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */
export const S = {
  /* ---- 內容 ---- */
  sectionContent: '信件內容',
  content: '內容',
  contentHint: '換行就是分行；超出圖片寬度的字會自動換到下一行。',
  contentPlaceholder: '例：今晚 12 點，舊鐘樓見。',
  /** 開頁時自動填入的範例信（F01） */
  sampleLetter: '致調查員們：\n你們要找的日記\n藏在舊鐘樓下。\n今晚 12 點，\n獨自前來。\n—— X',
  /** 內容是空字串時改用的文字（F04） */
  emptyText: '請輸入信件內容',

  /* ---- 產生 ---- */
  generate: '產生',
  loadingFonts: '正在載入字型…',
  generated: '已產生新的拼貼信',
  generateHint: '改了設定要按「產生」才會套用；每按一次都會重新隨機排版。',
  needGenerate: '請先按「產生」',
  generateFailed: '產生失敗',

  /* ---- 大小與排版 ---- */
  sectionLayout: '大小與排版',
  sizeMin: '最小字級',
  sizeMax: '最大字級',
  sizeHint:
    '每張紙片的字級在這個範圍內隨機（8～200 px）。最小大於最大時自動對調；空白時用 45～70。',
  width: '圖片寬度',
  widthHint: '100～4,000 px；空白時用 800。',
  autoWidth: '以最長一行決定寬度',
  autoWidthHint: '不自動換行，只照手動換行分行；圖片寬度＝最長一行＋左右留白。',
  align: '對齊方式',
  alignLeft: '靠左',
  alignCenter: '置中',
  alignRight: '靠右',
  unitPx: 'px',
  stepUp: (label: string) => `${label}：增加`,
  stepDown: (label: string) => `${label}：減少`,

  /* ---- 配色 ---- */
  sectionPalettes: '配色',
  palettesLabel: '配色清單',
  palettesHint: '勾選的配色才會被隨機選到；全部不勾時用第一組。',
  paletteBg: '紙片底色',
  paletteFg: '字色',
  addPalette: '新增配色',
  customPalette: '自訂',
  paletteAdded: '已新增配色',
  palettes: {
    ink: '墨黑',
    newsprint: '報紙白',
    ash: '灰燼',
    lead: '鉛灰',
    vermilion: '朱紅',
    lemon: '檸檬黃',
    magenta: '桃紅',
    teal: '湖水青',
  },

  /* ---- 字型 ---- */
  sectionFonts: '字型',
  fontsLabel: '字型清單',
  fontsHint:
    '每個字從勾選的字型裡隨機挑一套；全部不勾時用系統字型。韓文、日文、英文字型沒有中文字形，中文字會改用思源黑體。',
  fontPreview: '拼貼信',
  addFont: '加入字型',
  fontAdded: '已加入字型',
  fontAddedHint: '下次按「產生」時就會用到。',
  fontDuplicate: '這套字型已經在清單裡',
  fontLabels: {
    notoSansTc: '思源黑體（特粗）',
    notoSerifTc: '思源宋體（特粗）',
  },

  /* ---- Roll20 ---- */
  sectionRoll20: 'Roll20 格式',
  roll20Basic: '改用 Roll20 的基本字型',
  roll20BasicHint:
    '看的人電腦上不一定有拼貼用的字型。勾選時每個字從 Batang、Dotum、Gungsuh 隨機挑（每次複製都重新挑）。',
  roll20Min: 'Roll20 最小字級',
  roll20Max: 'Roll20 最大字級',
  roll20SizeHint:
    '紙片字級依比例換算到這個範圍；空白時用 16～24。最小大於最大時不對調（大字反而變小）。',

  /* ---- 預覽 ---- */
  previewLabel: '拼貼信預覽',
  wrapHint: '內容超出圖片寬度時會換到下一行。',
  autoWidthNote: '圖片寬度依最長的一行決定。',
  infoSize: '圖片大小',
  infoPieces: '紙片',
  sizeValue: (w: number, h: number) => `${w} × ${h} px`,
  piecesValue: (n: number) => `${n} 張`,
  clipped:
    '圖片太大（邊長上限 16,000 px、總共 4,000 萬像素），超出的部分沒有畫出來。請縮短內容或縮小字級。',

  /* ---- 匯出與複製 ---- */
  exportLabel: '匯出與複製',
  downloadPng: '下載 PNG',
  downloadPngTip: '背景透明的 PNG，可以疊在任何畫面上。',
  downloadJpg: '下載 JPG',
  downloadJpgTip: '疊在米色紙張底上的 JPG（沒有透明）。',
  copyImage: '複製圖片',
  copyImageTip: '把透明背景的 PNG 放進剪貼簿，可以直接貼到聊天軟體。',
  copyHtml: '複製 HTML',
  copyHtmlTip: '給可以貼 HTML 的網站（例如部落格、論壇的 HTML 模式）。對齊方式取目前的設定。',
  copyRoll20: '複製 Roll20 格式',
  copyRoll20Tip:
    '貼到 Roll20 的聊天欄，每個字會變成帶底色的小方塊（Roll20 不支援旋轉與不規則裁切）。',
  imageCopied: '已把圖片複製到剪貼簿',
  imageCopyFailed: '無法把圖片放進剪貼簿',
  imageCopyFailedHint: '這個瀏覽器不支援或沒有權限，請改用「下載 PNG」。',
  htmlCopied: '已複製 HTML',
  roll20Copied: '已複製 Roll20 格式文字',
  copyFailed: '複製文字沒有成功',
  copyFailedHint: '瀏覽器不允許寫入剪貼簿，請再試一次。',
  exportFailed: '匯出失敗',

  /* ---- 使用方式 ---- */
  usageSteps: [
    '在「信件內容」輸入要拼貼的文字，按「產生」。',
    '不滿意就再按一次「產生」：每次都是新的隨機排版。改了字級、寬度、配色、字型也要按「產生」才會套用。',
    '「下載 PNG」是透明背景，「下載 JPG」是米色紙張底；「複製圖片」可以直接貼到 Discord 等聊天軟體。',
    '「複製 HTML」給可以貼 HTML 的網站用；「複製 Roll20 格式」貼到 Roll20 的聊天欄。',
  ],
  usageNotes: [
    '韓文、日文、英文字型沒有中文字形，中文字會改用思源黑體；要讓中文也有字型變化，請多勾幾套繁中字型。',
    '可以用「加入字型」從 Google 字型、電腦字型或自己的字型檔加入字型。',
    '設定不會儲存：重新整理後回到預設，自訂的配色與字型也會清空。',
  ],
} as const;
