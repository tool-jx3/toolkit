/**
 * 短文圖片產生器的介面文字（繁中；用詞照 DESIGN.md 第 5 節）與範例文字（本站自己寫的跑團後日談）。
 */
import type { RichAlign, RichDoc } from '@/core/richtext';
import type { BgKind, Layout, PhotoFit } from './model';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const S = {
  toolId: 'prose-card',
  undo: '復原',
  redo: '重做',
  groupEdit: '編輯',
  groupText: '本文',
  pageBreakKey: '分頁（從游標處換到下一頁）',
  boldKey: '粗體',
  italicKey: '斜體',
  strikeKey: '刪除線',

  layoutLabel: '版面',
  layouts: {
    cover: '封面',
    page: '內文頁',
    photo: '照片＋文字',
  } satisfies Record<Layout, string>,
  layoutTips: {
    cover: '上方大片留白，標題與本文放在下面，像一本書的第一頁。',
    page: '頁首下面是標題，其餘整頁都是本文，適合比較長的文字。',
    photo: '上方一張照片，下面是標題與本文；照片的高度、位置可以調整。',
  } satisfies Record<Layout, string>,
  continuedTip: '文字放不下時，自動接到同樣風格的下一頁。',

  tabsLabel: '設定分類',
  tabs: { text: '文字', bg: '背景', page: '版面' },

  /* ---- 文字 ---- */
  secTitles: '標題與頁首頁尾',
  title: '標題',
  titlePh: '例：霧港燈塔',
  kicker: '小標',
  kickerHint: '標題上方的一行小字。',
  kickerPh: '例：後日談',
  font: '整份的字型',
  fontHint: '標題、本文、頁首、頁尾都用這個字型；本文裡選取的字可以另外換。',
  header: '頁首文字',
  headerPh: '例：SESSION 03',
  footerLeft: '頁尾左邊',
  footerLeftPh: '例：作者名或一句話',
  footerRight: '頁尾右邊',
  footerRightPh: '例：01',
  footerRightAuto: '自動頁碼',
  autoNumber: '頁尾右邊自動放頁碼',
  pageStart: '起始頁碼',
  pageStartHint: '第一頁的頁碼，之後每頁加 1（兩位數，例：03、04）。',

  secBody: '本文',
  body: '本文',
  bodyHint: (pages: number) =>
    pages > 1
      ? `目前 ${pages} 頁。放不下的字自動接到下一頁；Ctrl＋Enter 可以在游標處分頁。`
      : '先選取文字再套用格式；放不下的字會自動接到下一頁。',
  bodyPh: '在這裡寫下台詞、後日談或心得…',
  align: '整體對齊',
  aligns: {
    left: '靠左',
    center: '置中',
    right: '靠右',
    justify: '左右對齊',
  } satisfies Record<RichAlign, string>,
  lineHeight: '行距',
  bodySize: '本文字級',
  bodySizeHint: '「照片＋文字」版面的本文小 4 px。',

  secFonts: '我的字型',
  fontsHint: 'TTF、OTF、WOFF、WOFF2，存在這個瀏覽器（本站的工具共用），下次打開還在。',
  addFont: '加入字型檔…',
  noFonts: '還沒有加入字型。',
  fontRemove: (name: string) => `刪除字型「${name}」`,
  fontRemoveTitle: (name: string) => `刪除字型「${name}」？`,
  fontRemoveDesc: '會從這個瀏覽器刪掉（本站其他工具也用不到了）；用到這個字型的地方改回預設字型。',
  fontRemoveConfirm: '刪除',
  fontAdded: (name: string) => `已加入字型「${name}」。`,
  fontFailed: '無法讀取這個字型檔。',
  fontTooBig: (mb: number) => `字型檔請在 ${mb} MB 以下。`,
  fontRemoved: (name: string) => `已刪除字型「${name}」。`,
  myFont: (name: string) => `我的字型・${name}`,

  /* ---- 背景 ---- */
  secBg: '背景',
  bgKind: '背景',
  bgKinds: { solid: '單色', gradient: '漸層', image: '圖片' } satisfies Record<BgKind, string>,
  bgColor: '背景顏色',
  gradFrom: '起始顏色',
  gradTo: '結束顏色',
  gradAngle: '漸層角度',
  bgImage: '背景圖片',
  bgImageDrop: '把背景圖片拖到這裡',
  bgImageHint: 'PNG、JPEG、WebP…，40 MB 以下。',
  bgAdjust: '調整位置與縮放…',
  bgRemove: '拿掉背景圖片',
  bgNoImage: '還沒有背景圖片，先畫成背景顏色。',
  blur: '模糊',
  saturation: '飽和度',
  dim: '變暗',
  secTextColor: '文字顏色與紙張',
  textColor: '預設字色',
  textColorHint: '本文裡另外設定顏色的字不受影響。',
  texture: '紙張紋理',
  textureHint: '整頁蓋一層很淡的紙張顆粒。',

  /* ---- 版面 ---- */
  secPage: '頁面裝飾',
  icon: '圖示符號',
  iconHint: '頁首與封面上方的小符號（最多 8 字）；空白時用「✦」。',
  secPhoto: '照片',
  photo: '照片',
  photoDrop: '把照片拖到這裡',
  photoHint: 'PNG、JPEG、WebP…，40 MB 以下。',
  photoHeight: '照片高度',
  photoFit: '照片怎麼放',
  fits: { cover: '蓋滿', contain: '完整顯示' } satisfies Record<PhotoFit, string>,
  photoAdjust: '調整位置與縮放…',
  photoReset: '回到置中',
  photoRemove: '拿掉照片',
  photoNone: '還沒有照片，頁面上先畫成空的框。',
  photoTip: '要放照片時，在上面選「照片＋文字」版面。',
  photoDialog: '照片的位置與縮放',
  bgDialog: '背景圖片的位置與縮放',
  frameNote: '拖曳移動、滾輪或兩指縮放；按「套用」才會換上。',

  current: '目前：',
  chooseImage: '選擇圖片',
  changeImage: '換一張',
  imageDropAll: '放開即可換上照片或背景圖片',
  imageDropAllHint: '「照片＋文字」版面時換照片，其他版面換背景圖片。',
  imageTooBig: (name: string) => `「${name}」超過 40 MB。`,
  imageUnreadable: (name: string) => `無法讀取「${name}」。`,
  imageNotImage: (name: string) => `「${name}」不是圖片。`,
  imageLoaded: { photo: '已換上照片。', bg: '已換上背景圖片。' },
  imageNotSaved: '圖片存不進這個瀏覽器（容量不足或被封鎖），重新整理之後就不見了。',
  imageMissing: {
    photo: '照片讀不到了（可能已從這個瀏覽器清除），請重新選擇。',
    bg: '背景圖片讀不到了（可能已從這個瀏覽器清除），請重新選擇。',
  },

  /* ---- 預覽與下載 ---- */
  previewAria: '頁面預覽',
  pageAria: (i: number, n: number) => `第 ${i} 頁（共 ${n} 頁）`,
  pageCaption: (i: number, n: number) => `${pad2(i)} / ${pad2(n)}`,
  pageCount: (n: number) => `${n} 頁`,
  sizeNote: (scale: number) => `每頁 ${1200 * scale} × ${1600 * scale} px`,
  downloadPage: '下載這一頁',
  capped: (max: number) => `本文超過 ${max} 頁，放不下的字不會輸出。`,
  firstEmpty: '照片太高，第一頁放不下本文：本文從第 2 頁開始。',
  exportTitle: '下載',
  formatPng: 'PNG',
  formatPngDesc: '每頁一張 PNG；兩頁以上可以全部下載或打包成 ZIP。',
  exportFailed: '圖片做不出來，請稍後再試。',
  share: '分享…',
  shareHint: '手機的分享選單：可以直接存到相簿或傳給別人。',
  shareRetry: '圖片準備好了，請再按一次「分享…」。',
  shareFailed: '這個瀏覽器無法分享圖片，請改用下載。',
  sharing: '準備中…',
  fileBase: '短文圖片',

  /* ---- 手機 ---- */
  mobileBar: '切換畫面',
  mobileEdit: '編輯',
  mobilePreview: '預覽',
  mobileSave: '儲存',

  /* ---- 專案與儲存 ---- */
  saveFailed: '自動儲存失敗（瀏覽器的空間不夠或被封鎖），重新整理前請先存成專案檔。',
  projectOpened: '已開啟專案檔',
  projectSaved: '已存成專案檔',
  projectOpenFailed: '無法開啟專案檔',
  projectReset: '已重設',
  projectBad: '專案檔的內容無法使用。',
  projectMissingImage: '專案檔缺少用到的圖片。',
  projectNotSaved: '專案檔的圖片存不進這個瀏覽器，重新整理之後就不見了。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的內容會被取代（可以復原）。',
  openConfirmLabel: '開啟',
  resetTitle: '全部重來？',
  resetDesc: '文字、格式與圖片都會回到預設的範例（可以復原）。',

  /* ---- 說明 ---- */
  usage: [
    '選一個版面（封面、內文頁、照片＋文字），在「文字」分頁寫標題、小標、頁首與頁尾。',
    '本文可以直接打字或貼上（只取純文字）。先選取文字再按工具列：粗體、斜體、刪除線、文字顏色、螢光筆、字型與字級；沒有選取時，格式套用到接下來打的字。',
    '段落的對齊可以和整體不同；Ctrl＋Enter 或工具列的「分頁」從游標處換到下一頁，在段落開頭按 Backspace 拿掉分頁。',
    '文字放不下時自動接到下一頁，預覽一次看全部的頁；每頁都可以單獨下載，也可以全部下載、打包成 ZIP 或用手機分享。',
    '「背景」分頁換成單色、漸層或圖片（模糊、飽和度、變暗）；「版面」分頁放照片、調整照片的高度與位置。',
    '內容會自動存在這個瀏覽器（含圖片）；Ctrl＋Z 復原、Ctrl＋Shift＋Z 重做（打字中也可以）。',
  ],
} as const;

/** 標題空白時第一頁顯示的標題 */
export const UNTITLED = '無題';
/** 圖示符號空白時用的符號 */
export const DEFAULT_ICON = '✦';

/* ---------- 範例（本站自己寫的跑團後日談） ---------- */

const run = (text: string, more: Partial<RichDoc['lines'][number]['runs'][number]> = {}) => ({
  text,
  bold: false,
  color: '',
  ...more,
});

export const SAMPLE = {
  title: '霧港燈塔',
  kicker: '後日談・第三夜之後',
  header: 'SESSION 03',
  footerLeft: '給那晚還醒著的調查員',
  body: {
    lines: [
      { runs: [run('燈塔的光，終於在第三夜熄滅了。')] },
      { runs: [] },
      { runs: [run('我們沒有找到船長，')] },
      { runs: [run('只找到他寫在日誌最後一頁的那句話——')] },
      { runs: [run('「別回頭看海。」', { bold: true, color: '#c0392b' })] },
      { runs: [] },
      { runs: [run('回程的車上，阿澄小聲地問：')] },
      { runs: [run('「下次，還要一起出團嗎？」', { italic: true })] },
      { runs: [] },
      { runs: [run('當然要。', { highlight: '#f8e287' })] },
      { runs: [run('只是這一次，換我來擲那顆骰子。')] },
    ],
  } satisfies RichDoc,
};
