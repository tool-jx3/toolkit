/** PDF 壓縮器的介面文字 */
import type { PdfErrorKind, PdfLevel, SkipReason, Stage, Strategy } from '@/core/pdf';

const n = (v: number) => v.toLocaleString('en-US');

export const S = {
  /* 等級 */
  sectionLevel: '壓縮等級',
  level: '等級',
  levels: {
    lossless: '無損',
    high: '高畫質',
    balanced: '平衡',
    smallest: '最小',
    raster: '整頁轉圖',
  } satisfies Record<PdfLevel, string>,
  levelHints: {
    lossless:
      '只整理檔案的結構、合併重複的圖片與字型，畫質一點都不變。文字為主、沒有圖片的 PDF 通常縮不了多少。',
    high: '重新壓縮照片：解析度最多留 200 DPI、JPEG 品質 82，看起來幾乎沒差。文字、向量圖不動。',
    balanced:
      '重新壓縮照片：解析度最多留 150 DPI、JPEG 品質 72，螢幕上看得清楚、檔案小很多。文字、向量圖不動。',
    smallest:
      '重新壓縮照片：解析度最多留 120 DPI、JPEG 品質 55，照片看得出壓縮的痕跡。文字、向量圖不動。',
    raster:
      '每一頁畫成一張圖片（120 DPI、JPEG 品質 60），檔案最小。轉成圖片反而比較大時，只整理結構（文字仍可以選）。',
  } satisfies Record<PdfLevel, string>,
  rasterWarning:
    '每一頁都會變成圖片：文字不能選取、不能搜尋，連結、書籤、表單欄位也都會消失。要保留文字請選其他等級。',

  /* 進階設定 */
  sectionAdvanced: '進階設定',
  quality: 'JPEG 品質',
  qualityHint: (v: number | null) =>
    v === null ? '這個等級不動影像。' : `留白＝照等級（${v}）。填了就只用這個品質。`,
  dpi: '解析度上限',
  dpiHint: (v: number | null, raster: boolean) =>
    v === null
      ? '這個等級不動影像。'
      : raster
        ? `每頁畫成圖片的解析度。留白＝照等級（${v} DPI）。`
        : `照片在頁面上的解析度超過這個值才縮小。留白＝照等級（${v} DPI）。`,
  placeholderLevel: (v: number) => `照等級（${v}）`,
  convertFlate: '照片類的 PNG、未壓縮影像也轉成 JPEG',
  convertFlateHint:
    '有透明背景、看起來像圖表或截圖（顏色少）的不轉，保持無損。轉了之後至少要小兩成才換。',
  convertFlateOff: '無損與整頁轉圖不會用到。',
  verify: '壓縮後比對文字、連結、書籤與表單',
  verifyHint: '和原檔不一樣就不用那個結果（會多花一點時間）。整頁轉圖只比頁數。',
  resetAdvanced: '進階設定回到預設',

  /* 選檔 */
  dropLabel: '選擇或拖放 PDF（可以多個）',
  dropButton: '選擇 PDF',
  dropHint: (max: string) => `檔案只在這個瀏覽器裡處理，不會上傳。一個檔案最多 ${max}。`,
  listLabel: '要壓縮的 PDF',
  listEmpty: '還沒有檔案。',
  remove: (name: string) => `移除「${name}」`,
  added: (count: number) => `已加入 ${count} 個 PDF`,
  addedNone: '沒有加入檔案',
  rejected: (name: string, why: string) => `「${name}」：${why}`,
  tooManyFiles: (max: number) => `清單最多 ${max} 個檔案，多的沒有加入。`,
  rejectNotPdf: '不是 PDF',
  rejectEmpty: '是空的檔案',
  rejectTooLarge: (size: string, max: string) => `檔案太大（${size}，上限 ${max}）`,
  rejectRead: '讀不到檔案',

  /* 清單的一列 */
  meta: (size: string, pages: number | null, encrypted: boolean, version: string | null) =>
    [
      size,
      pages ? `${n(pages)} 頁` : '',
      version ? `PDF ${version}` : '',
      encrypted ? '已加密' : '',
    ]
      .filter(Boolean)
      .join(' · '),
  fontsHint:
    '這個 PDF 有沒有內嵌的中日韓字型：預覽（縮圖、前後比對）會缺字，壓縮後的檔案在電腦上開啟不受影響。',
  probing: '讀取中…',
  waiting: '等待壓縮',
  passwordLabel: (name: string) => `「${name}」的開啟密碼`,
  passwordNeeded: '這個 PDF 要密碼才能開啟。',
  passwordSubmit: '確定',
  passwordWrong: '密碼不對。',
  stale: '設定改過了：按「開始壓縮」會用新的設定重新壓縮。',
  statusDone: '完成',
  statusKept: '保留原檔',
  statusError: '錯誤',
  download: '下載',
  downloadOriginal: '下載原檔',
  compare: '前後比對',
  retry: '重試',

  /* 進度 */
  stages: {
    inspect: '讀取檔案',
    structure: '整理結構',
    linearize: '試快速網頁檢視的排法',
    normalize: '攤開物件',
    dedupe: '找重複的圖片與字型',
    images: '重新壓縮影像',
    save: '寫出檔案',
    raster: '畫成圖片',
    check: '檢查結果',
    verify: '比對文字與連結',
  } satisfies Record<Stage, string>,
  stageCount: (stage: string, done: number, total: number, unit: string) =>
    `${stage}（第 ${n(Math.min(done + 1, total))}／${n(total)} ${unit}）`,
  unitImage: '張',
  unitPage: '頁',
  progressLabel: (name: string) => `「${name}」的進度`,

  /* 結果 */
  sizes: (from: string, to: string) => `${from} → ${to}`,
  saved: (pct: number) => (pct < 1 ? '減少不到 1%' : `減少 ${pct}%`),
  pages: (p: number) => `${n(p)} 頁`,
  strategies: {
    original: '保留原檔',
    structural: '整理結構',
    linearize: '重新排列（快速網頁檢視）',
    dedupe: '移除重複的圖片、字型',
    images: '重新壓縮影像',
    raster: '整頁轉成圖片',
  } satisfies Record<Strategy, string>,
  method: (s: string) => `做法：${s}`,
  imagesDone: (replaced: number, downscaled: number, converted: number) => {
    const extra = [
      downscaled ? `${n(downscaled)} 張縮小解析度` : '',
      converted ? `${n(converted)} 張 PNG 轉成 JPEG` : '',
    ].filter(Boolean);
    return `重新壓縮了 ${n(replaced)} 張影像${extra.length ? `（其中 ${extra.join('、')}）` : ''}`;
  },
  dedupeDone: (merged: number) => `移除了 ${n(merged)} 個重複的圖片、字型或檔案`,
  skippedTitle: (count: number) => `沒動的影像 ${n(count)} 張：`,
  skipReasons: {
    filter: '壓縮方式不支援（JPEG 2000、JBIG2 等）',
    bits: '不是 8 位元',
    colorspace: '色彩空間不支援（CMYK 等）',
    'color-key': '有透明遮罩',
    'image-mask': '是遮罩',
    'used-as-mask': '是透明遮罩',
    'color-transform': '特殊的顏色轉換',
    'no-size': '讀不出來',
    'too-large': '太大',
    'not-jpeg': '不是 JPEG（進階設定沒有開啟轉換）',
    'has-mask': '有透明背景（保持無損）',
    small: '太小',
    graphic: '看起來像圖表或截圖（保持無損）',
    decode: '讀不出來',
    'not-smaller': '重新壓縮沒有變小',
  } satisfies Record<SkipReason, string>,
  rasterDpi: (dpi: number) => `每頁畫成 ${dpi} DPI 的圖片`,
  rasterReduced: (dpi: number) => `為了比原檔小，解析度降到 ${dpi} DPI`,
  rasterGray: (count: number) => `${n(count)} 頁是灰階，存成灰階圖片`,
  rasterNotSmaller: '轉成圖片比只整理結構大，所以只整理結構（文字仍可以選）。',
  rasterSkippedFonts: (names: string) =>
    `這個 PDF 有沒有內嵌的中日韓字型（${names}），轉成圖片會缺字，所以只整理結構（文字仍可以選）。`,
  rasterFailed: '轉成圖片時發生錯誤，所以只整理結構（文字仍可以選）。',
  bigMode: '大檔：用了省記憶體的做法（少試幾種做法，結果可能沒那麼小）。',
  imagesFailed:
    '影像沒有處理：這個檔案的內部結構讀不懂（qpdf 修得好、但分析影像時出錯），只整理了結構。',
  verified: '已比對：頁數、文字、連結、書籤、表單欄位都和原檔相同。',
  verifiedRaster: '已比對：頁數和原檔相同。',
  verifySkipped: '沒有比對（這個檔案的文字讀不出來）。',
  rejectedByVerify: (count: number) =>
    `有 ${n(count)} 個壓縮結果和原檔的文字或連結不一樣，沒有用。`,
  noteSigned: '這個 PDF 有數位簽章：改寫之後簽章會失效。',
  noteDecrypted: '輸出的檔案沒有加密（不需要密碼就能開啟）。',
  noteRestricted:
    '這個 PDF 有權限設定（例如禁止列印、複製），為了保留設定只做無損整理，不動影像、不轉成圖。',
  noteRaster: '文字已經變成圖片：不能選取、不能搜尋，連結、書籤、表單也沒有了。',
  discordOk: 'Discord 免費帳號可以直接傳（10 MB 以下）。',
  discordOver: (suggest: boolean) =>
    `還超過 Discord 免費帳號的上限（10 MB）${suggest ? '，可以試「最小」或「整頁轉圖」' : ''}。`,
  keptTitle: '沒有變小，保留原檔',
  keptRestricted: '這個 PDF 有權限設定，只能做無損整理，結果沒有比原檔小。',
  keptVerify: '壓縮後的文字或連結和原檔不一樣，所以保留原檔。',
  keptMissingFonts: (names: string) =>
    `這個 PDF 有沒有內嵌的中日韓字型（${names}），轉成圖片會缺字；只整理結構也沒有變小，所以保留原檔。可以改用「平衡」或「最小」。`,
  keptLossless: '這個檔案的結構已經很精簡了。有照片的話可以試「平衡」或「最小」。',
  keptRaster: '轉成圖片反而比原檔大（文字為主的 PDF 常這樣），只整理結構也沒有變小，所以保留原檔。',
  keptImagesFailed: '這個檔案的內部結構讀不懂，影像沒有處理；只整理結構也沒有變小，所以保留原檔。',
  keptCompact: '這個檔案已經很精簡了（沒有可以再壓的影像或重複的內容）。',
  duration: (ms: number) => `花了 ${(ms / 1000).toFixed(1)} 秒`,

  /* 錯誤 */
  errors: {
    'not-pdf': '這不是 PDF 檔案。',
    empty: '這是空的檔案。',
    'too-large': '檔案太大，這台裝置處理不了。',
    password: '這個 PDF 要密碼才能開啟。',
    'wrong-password': '密碼不對。',
    broken: '這個檔案打不開，可能壞掉了。',
    'too-many-pages': '整頁轉圖最多 500 頁，這個檔案太多頁了。可以改用其他等級。',
    memory: '記憶體不足。可以試比較少頁的檔案，或先關掉其他分頁。',
    unreadable:
      '讀不到這個檔案（手機的相簿、雲端硬碟給的檔案，過一陣子可能就讀不到）。請移除這一列，重新選檔。',
    aborted: '已取消。',
    internal: '處理時發生錯誤。',
  } satisfies Record<PdfErrorKind, string>,
  engineSaid: (detail: string) => `引擎的訊息：${detail}`,
  tooLargeForLevel: (size: string, max: string, level: string, suggest: boolean) =>
    `檔案太大：「${level}」在這台裝置上最多處理 ${max}，這個檔案 ${size}。${suggest ? '可以改用「無損」（上限比較高）。' : ''}`,

  /* 批次 */
  start: (count: number) => (count ? `開始壓縮（${n(count)} 個）` : '開始壓縮'),
  cancel: '取消',
  zip: '全部下載（ZIP）',
  clear: '清空清單',
  clearConfirm: '清空清單？',
  clearConfirmText: '清單裡的檔案與壓縮結果都會拿掉（電腦裡的原檔不受影響）。',
  running: (i: number, total: number) => `正在壓縮第 ${n(i)}／${n(total)} 個…`,
  finished: (done: number, kept: number, failed: number) =>
    [
      `完成 ${n(done)} 個`,
      kept ? `${n(kept)} 個沒有變小（保留原檔）` : '',
      failed ? `${n(failed)} 個失敗` : '',
    ]
      .filter(Boolean)
      .join('，'),
  announceDone: (name: string, from: string, to: string) => `完成：${name}，${from} → ${to}`,
  announceKept: (name: string) => `${name}：沒有變小，保留原檔`,
  cancelled: '已取消，還沒壓完的檔案回到等待。',
  totals: (count: number, from: string, to: string, pct: string) =>
    `${n(count)} 個檔案：${from} → ${to}（${pct}）`,
  zipName: '壓縮後的PDF.zip',
  outputSuffix: '_壓縮',

  /* 瀏覽器不支援 */
  unsupported: (missing: string) =>
    `這個瀏覽器不能用 PDF 壓縮器（缺少 ${missing}）。請改用最新版的 Chrome、Edge、Firefox 或 Safari。`,

  /* 前後比對 */
  compareTitle: (name: string) => `前後比對：${name}`,
  compareBefore: (size: string) => `原檔（${size}）`,
  compareAfter: (size: string) => `壓縮後（${size}）`,
  compareBeforeLabel: '原檔的這一頁',
  compareAfterLabel: '壓縮後的這一頁',
  comparePrev: '上一頁',
  compareNext: '下一頁',
  comparePage: (i: number, total: number) => `第 ${n(i)}／${n(total)} 頁`,
  compareZoom: '大小',
  compareFit: '符合寬度',
  compareDouble: '2 倍',
  compareLoading: '畫頁面中…',
  compareFailed: '這一頁畫不出來。',
  compareClose: '關閉',

  /* 快捷鍵與說明 */
  keys: { group: '壓縮', start: '開始壓縮', paste: '貼上 PDF' },
  diagnostics: 'PDF 壓縮器',
  diagFile: '檔案',
  diagLevel: '等級',
  diagKind: '錯誤種類',
  diagDetail: '引擎的訊息',
  usageIntro:
    '把劇本、手冊、角色卡的 PDF 縮小：傳 Discord（免費帳號 10 MB）、上傳 BOOTH 或雲端之前先壓一下。所有處理都在這個瀏覽器裡，檔案不會上傳。',
  usageSteps: [
    '選擇或拖放 PDF（可以一次很多個），要密碼的檔案在那一列輸入密碼。',
    '選壓縮等級；一般用「平衡」就好。',
    '按「開始壓縮」，完成後下載單檔，或用「全部下載（ZIP）」一次拿走。',
    '想看畫質的差別，按「前後比對」並排看同一頁。',
  ],
  usageLevelsTitle: '等級的差別',
  usageLevels: [
    '無損：只整理結構、合併重複的圖片與字型，內容一點都不變。',
    '高畫質／平衡／最小：重新壓縮照片，解析度依照片在頁面上畫多大來決定（超過 200／150／120 DPI 才縮小）。文字、向量圖、連結、書籤、表單都不動。',
    '整頁轉圖：每一頁變成一張圖片，最小，但文字不能選、不能搜尋。轉成圖片反而比較大時（文字為主的 PDF），改成只整理結構。',
    '每個檔案都會試好幾種做法、留最小的；都沒有比原檔小時就保留原檔，不會給你變大的檔案。',
  ],
  usageNotesTitle: '注意',
  usageNotes: [
    '有數位簽章的 PDF，改寫之後簽章會失效。',
    '要開啟密碼的 PDF 輸入密碼後可以壓縮，輸出的檔案不加密。只有權限設定（禁止列印等）的 PDF 會保留設定、只做無損整理。',
    '一個檔案最多 900 MB（整頁轉圖 600 MB、最多 500 頁）；記憶體 4 GB 以下的裝置會更少（依瀏覽器回報的記憶體）。100 MB 以上的檔案改用省記憶體的做法（少試幾種做法，結果可能沒那麼小），檔案很大時要好幾分鐘。',
    '設定（等級、進階設定）會存在這個瀏覽器；PDF 和密碼都不會存。',
  ],
  usageLibraries: '使用的程式庫（授權見 THIRD_PARTY_NOTICES）：',
};
