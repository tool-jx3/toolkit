/**
 * 影片轉動圖工具的介面文字（台灣繁中）。原作以 MIT 授權，部分說明參考原作的意思改寫。
 */
import type { GifDitherChoice, OutputFormat } from './logic';

export const S = {
  usage: [
    '載入影片：拖到載入區、點一下選檔，或按「產生範例影片」試試看。',
    '在播放列找到要的片段，按「以目前位置為起點」「以目前位置為終點」（或按 [ 與 ] 鍵）選出區間。',
    '需要只留畫面的一部分時，開啟「裁切」，再按「調整裁切範圍」在畫面上框出來。',
    '選輸出格式、每秒格數、尺寸比例與播放速度，按「匯出」。完成後可以下載、在新分頁開啟或複製資料網址。',
  ],
  about: '影片只在你的瀏覽器裡處理，不會上傳到任何地方。',

  /* ---- 載入 ---- */
  dropLabel: '把影片檔拖到這裡，或點一下選擇檔案',
  dropButton: '選擇影片',
  dropHint: '瀏覽器能播放的影片都可以（MP4、WebM、MOV…）；只在瀏覽器裡處理，不會上傳。',
  dropBadges: ['無損的 APNG', '檔案小的動態 WebP', '相容性最廣的 GIF'],
  replaceLabel: '換一支影片',
  sampleButton: '產生範例影片',
  sampleHint: '用一段 3 秒的示範影片試試看所有功能。',
  loading: '讀取影片中……',
  videoSection: '影片',
  videoInfo: (w: number, h: number, d: number) => `${w}x${h}（${d.toFixed(1)} 秒）`,
  noVideo: '還沒有載入影片。',

  /* ---- 預覽與範圍 ---- */
  previewLabel: '影片預覽',
  previewEmpty: '載入影片後在這裡預覽',
  rangeTitle: '選取區間',
  startLabel: '起點',
  endLabel: '終點',
  lengthLabel: '區間長度',
  currentLabel: '目前',
  seconds2: (t: number) => `${t.toFixed(2)}s`,
  setStart: '以目前位置為起點',
  setEnd: '以目前位置為終點',
  resetRange: '還原成整段',
  rangeSegment: '選取區間',
  rangeHint: '起點與終點至少相隔 0.2 秒；播放時會在區間裡循環。',

  /* ---- 裁切與尺寸 ---- */
  cropSection: '裁切與尺寸',
  cropToggle: '裁切',
  cropOnHint: '只輸出框起來的範圍。每次開啟都從中央 80% 開始。',
  cropOffHint: '關閉時輸出整個畫面。',
  cropAdjust: '調整裁切範圍',
  cropDialogTitle: '調整裁切範圍',
  cropFrameLabel: (w: number, h: number) => `裁切 ${w}×${h}`,
  cropFrameAria: '裁切範圍',
  cropInfo: (x: number, y: number, w: number, h: number) => `範圍：X ${x}、Y ${y}、${w}×${h} px`,
  scaleLabel: '解析度比例',
  scaleOption: (pct: number, w: number, h: number) =>
    pct === 100 ? `100%（原解析度，${w}×${h}）` : `${pct}%（${w}×${h}）`,
  scaleHint: '寬或高是奇數時會補成偶數。',
  outputSize: (w: number, h: number) => `輸出尺寸 ${w}×${h} px`,

  /* ---- 播放速度 ---- */
  speedLabel: '播放速度',
  speedOption: (v: number) => `${v.toFixed(1)}x`,
  speedHint: '2 倍速時輸出長度減半、0.5 倍速是慢動作；也套用在預覽。',

  /* ---- 匯出 ---- */
  exportTitle: '轉換與匯出',
  formatDescriptions: {
    apng: '無損，全彩＋半透明；CCFOLIA 可以直接使用。',
    webp: '壓縮率高、檔案小；Safari 無法匯出。',
    gif: '相容性最廣；最多 256 色，透明只有全透明或不透明。',
  } satisfies Record<OutputFormat, string>,
  losslessLabel: '無損',
  losslessOn: '照原畫質轉換，不損失顏色（檔案較大）。',
  losslessOff: '依畫質設定壓縮，檔案較小。',
  qualityLabel: '畫質',
  gifColorsLabel: '顏色數上限',
  gifColorOption: (n: number) => (n === 256 ? '256 色（最高品質）' : `${n} 色`),
  gifDitherLabel: '抖色',
  gifDitherOptions: {
    'floyd-steinberg': 'Floyd–Steinberg（漸層較平滑）',
    none: '不用（像素清晰、檔案較小）',
  } satisfies Record<GifDitherChoice, string>,
  gifHint: '每一格各自挑選最適合的顏色。',
  liveFrame: '目前抽出的影格',
  sizeWarningHint: '可以縮小比例、降低每秒格數、縮短區間，或改用 WebP。',
  overBudget: '影片太長或解析度太大，請縮短區間、縮小比例或降低每秒格數。',
  progressExtract: (i: number, n: number) => `抽出影格 ${i}／${n}`,
  progressEncode: (label: string) => `產生 ${label} 檔案`,
  needVideo: '請先載入影片。',

  /* ---- 結果 ---- */
  resultTitle: '轉換結果',
  resultLoop: '無限循環播放的預覽',
  resultAlt: '轉換後的動圖',
  openNewTab: '在新分頁開啟',
  copyDataUrl: '複製資料網址',
  detailFormat: '格式',
  detailSampling: '取樣',
  detailSize: '大小（MB）',
  detailTime: '編碼時間',
  formatLossless: (label: string) => `${label}（無損）`,
  formatLossy: (label: string, q: number) => `${label}（有損・畫質 ${q}%）`,
  formatGif: (colors: number, dither: GifDitherChoice) =>
    `GIF（最多 ${colors} 色・${dither === 'none' ? '不抖色' : 'Floyd–Steinberg 抖色'}）`,
  samplingText: (fps: number, speed: number, frames: number) =>
    `${fps} FPS・${speed.toFixed(1)} 倍速・${frames} 格`,
  mb: (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`,
  timeText: (ms: number) => `${(ms / 1000).toFixed(1)} 秒`,

  /* ---- 逐格檢視 ---- */
  framesSection: '逐格檢視',
  framesBadge: (n: number) => (n ? `${n} 格樣本` : '0 格'),
  framesButton: '產生影格時間軸',
  framesBuilding: '正在產生影格時間軸……',
  framesNote: '在選取區間平均取 12 個時間點，看看區間裡的內容。',
  framesEmpty: '按「產生影格時間軸」就能看到選取區間的 12 張樣本。',
  framesAria: '選取區間的樣本影格',
  framesTime: (t: number) => `${t.toFixed(1)} s`,

  /* ---- 格式比較 ---- */
  guideSection: 'APNG／WebP／GIF 的比較',
  guideHead: ['', 'APNG', '動態 WebP', 'GIF'],
  guideRows: [
    ['畫質', '無損（完全不掉畫質）', '無損或有損可選', '最多 256 色，漸層會出現色階或雜點'],
    ['顏色', '全彩（約 1,670 萬色）', '全彩（約 1,670 萬色）', '每格最多 256 色'],
    ['透明', '支援半透明', '支援半透明', '只有全透明或不透明'],
    ['檔案大小', '最大（畫質優先）', '通常最小', '介於兩者之間，顏色多時偏大'],
    [
      '適合',
      '要保留畫質、CCFOLIA 的動態立繪或特效',
      '網頁、聊天軟體、要求檔案小的地方',
      '舊的軟體或服務、需要最廣的相容性',
    ],
  ] as const,
  guideNote: 'Safari 無法匯出 WebP；CCFOLIA 等服務的上傳大小有限制時，先試 WebP 或縮小比例。',

  /* ---- 通知 ---- */
  toast: {
    notVideo: '不是可用的影片檔',
    notVideoHint: (name: string) => `「${name}」不是影片。`,
    loadFailed: '無法讀取影片',
    loaded: '影片已載入',
    startSet: (t: number) => `起點設在 ${t.toFixed(2)} 秒`,
    endSet: (t: number) => `終點設在 ${t.toFixed(2)} 秒`,
    sampleMaking: '正在產生範例影片……',
    sampleFailed: '無法產生範例影片',
    done: '轉換完成！確認一下就可以下載了。',
    cancelled: '已取消轉換',
    failed: '轉換失敗',
    copied: '資料網址已複製到剪貼簿',
    copyFailed: '無法複製到剪貼簿，請改用下載。',
  },

  /* ---- 快捷鍵 ---- */
  keys: {
    group: '播放與範圍',
    play: '播放／暫停',
    start: '以目前位置為起點',
    end: '以目前位置為終點',
  },
} as const;

export const FORMAT_LABEL: Record<OutputFormat, string> = {
  apng: 'APNG',
  webp: 'WebP',
  gif: 'GIF',
};
