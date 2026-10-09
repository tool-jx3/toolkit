/** 拍立得相框產生器的介面文字 */
import type { AspectId, CaptionFont, ToolId } from './model';

export type TabId = 'edit' | 'decorate';

export const S = {
  /* 分頁 */
  tabsLabel: '設定分類',
  tabs: { edit: '編輯', decorate: '裝飾' } satisfies Record<TabId, string>,

  /* 相框 */
  sectionFrame: '相框',
  aspect: '尺寸',
  aspects: {
    square: '正方形',
    landscape: '橫式 4:3',
    portrait: '直式 3:4',
  } satisfies Record<AspectId, string>,
  aspectAria: {
    square: '正方形（照片 1:1）',
    landscape: '橫式（照片寬 4：高 3）',
    portrait: '直式（照片寬 3：高 4）',
  } satisfies Record<AspectId, string>,
  aspectHint: (w: number, h: number) =>
    `輸出 ${w} × ${h} px。換尺寸會清掉所有筆畫（照片、文字、貼紙保留）。`,
  aspectConfirmTitle: '換尺寸會清掉所有筆畫',
  aspectConfirmDesc: '三個圖層上畫的線都會清掉；照片、文字、貼紙會保留（可以復原）。',
  aspectConfirmLabel: '換尺寸',
  cardBg: '相框顏色',

  /* 照片 */
  sectionPhoto: '照片',
  dropAreaLabel: '照片載入區',
  dropLabel: '把照片拖到這裡',
  dropHint: '任何圖片格式',
  choosePhoto: '選擇照片',
  changePhoto: '更換照片',
  loadedPrefix: '目前的照片：',
  loadedHint: '把另一張照片拖到這裡也可以更換（筆畫、貼紙、文字都保留）',
  zoom: '放大',
  zoomUnit: '倍',
  resetView: '重設位置',
  panHint: '選「移動」工具後，在相框上拖曳照片調整取景、滾動滑鼠滾輪放大縮小。',
  privacy: '照片只在你的瀏覽器裡處理，不會上傳到任何地方。',
  windowDrop: '放開即可換成這張照片',
  windowDropHint: '筆畫、貼紙、文字都會保留',
  photoMissing: '上次的照片讀不到了（可能已從這個瀏覽器清除），請重新選擇照片。',
  photoNotSaved: '瀏覽器空間不足或無法存檔：照片這次可以用，但重新整理之後就不見了。',
  photoLoaded: (name: string) => `已換上照片「${name}」`,
  photoFailed: '沒有換照片',
  notImage: (name: string) => `「${name}」不是圖片檔`,
  decodeError: (name: string) => `「${name}」無法讀取，檔案可能已損壞`,
  readError: (name: string) => `「${name}」讀取失敗（檔案可能已經移走或沒有權限讀取），請再選一次`,
  lostError: (name: string) => `「${name}」暫存時遺失了，請再加一次`,
  onlyFirst: (names: string) => `一次只能放一張照片，沒有使用「${names}」`,

  /* 文字 */
  sectionCaption: '文字',
  caption: '文字內容',
  captionPlaceholder: '例如 第一次見面紀念',
  captionHint: (n: number, max: number) => `${n}／${max} 字；寫在照片下方的白邊，太長時自動縮小。`,
  font: '字型',
  fonts: { bold: '粗體', cursive: '手寫' } satisfies Record<CaptionFont, string>,
  fontAria: {
    bold: '粗體（Poppins，中文思源黑體）',
    cursive: '手寫（Caveat，中文霞鶩文楷）',
  } satisfies Record<CaptionFont, string>,
  captionColor: '文字顏色',
  captionSize: '字級',

  /* 裝飾：鎖住 */
  needPhoto: '先放進照片才能裝飾（筆、橡皮擦、貼紙）。',

  /* 工具 */
  tool: '工具',
  tools: { pen: '筆', eraser: '橡皮擦', move: '移動' } satisfies Record<ToolId, string>,
  toolHint: {
    pen: '在相框上拖曳畫線（畫在目前的圖層）。',
    eraser: '只擦掉目前圖層上的線，不會擦到照片、文字與貼紙。',
    move: '拖曳照片調整取景、滾輪放大；點貼紙選取，拖四角縮放、拖上方的圓鈕旋轉。',
  } satisfies Record<ToolId, string>,

  /* 筆 */
  sectionPen: '筆',
  penColor: '筆的顏色',
  penColorAria: (hex: string) => `筆的顏色 ${hex.toUpperCase()}`,
  customColor: '自訂顏色',
  brushSize: '粗細',
  brushPreset: (n: number) => `粗細 ${n}`,
  brushHint: '筆和橡皮擦共用；用觸控筆時會依筆壓變粗變細。',

  /* 圖層 */
  sectionLayers: '筆畫圖層',
  layersLabel: '筆畫圖層（上層在前）',
  layersHint: '三個圖層都在貼紙上面；點一下選擇要畫的圖層，上面的圖層蓋在下面的上面。',
  layerName: (n: number) => `圖層 ${n}`,
  layerMeta: (n: number) => (n ? `${n} 筆` : '空白'),
  layerActive: '畫在這層',
  layerUp: '往上一層',
  layerDown: '往下一層',
  clearLayer: '清除這個圖層',
  clearAll: '全部清除',
  clearLayerTitle: (n: number) => `清除圖層 ${n}？`,
  clearLayerDesc: '這個圖層上的線都會清掉（可以復原）。',
  clearAllTitle: '清除所有圖層？',
  clearAllDesc: '三個圖層上的線都會清掉，貼紙不受影響（可以復原）。',
  clearLabel: '清除',

  /* 貼紙 */
  sectionStickers: '貼紙',
  stickerCount: (n: number, max: number) => `${n} / ${max}`,
  stickerDropLabel: '把貼紙圖片拖到這裡',
  stickerButton: '＋ 加入貼紙圖片',
  stickerHint: '會自動加上白邊；透明背景的 PNG 會照形狀加邊。',
  stickerFull: (max: number) => `已經有 ${max} 張貼紙（上限），刪掉一張才能再加。`,
  stickersLabel: '貼紙清單（上層在前）',
  stickersEmpty: '還沒有貼紙。貼紙會蓋在照片與文字上、筆畫的下面。',
  stickerName: (letter: string, name: string) => `貼紙 ${letter} · ${name || '（沒有名稱）'}`,
  stickerUp: '往上一層',
  stickerDown: '往下一層',
  stickerDelete: '刪除',
  stickerAria: (letter: string, name: string) => `貼紙 ${letter}：${name || '（沒有名稱）'}`,
  stickersAdded: (n: number) => `已加入 ${n} 張貼紙`,
  stickersNone: '沒有加入貼紙',
  stickerOver: (names: string, max: number) => `超過 ${max} 張的上限，沒有加入「${names}」`,
  stickerNotSaved: '瀏覽器空間不足或無法存檔：貼紙這次可以用，但重新整理之後就不見了。',
  stickerMissing: (n: number) => `有 ${n} 張貼紙的圖片讀不到了，請刪掉後重新加入。`,
  stickerNeedPhoto: '先放進照片才能加貼紙。',
  stickerOverlay: '放開即可加入貼紙',
  stickerOverlayHint: (n: number, max: number) => `目前 ${n} / ${max} 張；超過上限的不會加入`,
  stickerOverlayFull: (max: number) => `貼紙已經有 ${max} 張（上限）`,
  stickerOverlayFullHint: '放開也不會加入，照片也不會被換掉；刪掉一張才能再加。',
  stickerOverlayLocked: '先放進照片才能加貼紙',
  stickerOverlayLockedHint: '要換照片請放在貼紙區以外的地方。',

  /* 預覽與輸出 */
  previewLabel: '拍立得預覽',
  moveLayer: '移動照片、選取與調整貼紙',
  drawLayer: (tool: string) => `用${tool}在相框上畫`,
  emptyTitle: '加入照片',
  emptyHint: '點一下、拖放，或貼上（Ctrl+V）',
  exportTitle: '匯出',
  downloadPng: '下載 PNG',
  exportSize: (w: number, h: number) => `${w} × ${h} px`,
  exportNote: '輸出就是預覽上的樣子（不含貼紙的選取框），大小是相框的 3 倍。',
  fileName: 'polaroid.png',
  downloadDone: (name: string) => `已下載 ${name}`,
  downloadFailed: '無法產生圖片，請再試一次。',

  /* 頁首 */
  undo: '復原',
  redo: '重做',
  resetTitle: '重設？',
  resetDesc: '照片、文字、筆畫、貼紙與設定都會清掉，回到剛打開的樣子（可以復原）。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的照片、文字、筆畫與貼紙會被專案檔的內容取代（可以復原）。',
  openConfirmLabel: '開啟',
  projectOpened: '已開啟專案檔。',
  projectNotSaved:
    '瀏覽器空間不足或無法存檔：專案檔裡的照片與貼紙這次可以用，但重新整理之後就不見了。',
  projectSaved: '已存成專案檔',
  projectOpenFailed: '無法開啟專案檔',
  projectReset: '已重設',
  projectBad: '這個專案檔的內容無法使用。',
  projectMissingImage: '專案檔裡少了照片或貼紙的圖片，或圖片無法讀取。',
  saveFailed: '自動儲存失敗（瀏覽器空間不足或被封鎖）',

  /* 快捷鍵 */
  groupEdit: '編輯',
  groupTool: '工具',
  shortcutPen: '筆',
  shortcutEraser: '橡皮擦',
  shortcutMove: '移動',

  /* 使用方式 */
  usage: [
    '在「編輯」放進一張照片（選檔、拖放或 Ctrl+V 貼上），選相框尺寸；用「放大」與「移動」工具拖曳調整取景。',
    '在「文字」寫一行字（寫在照片下方的白邊），選粗體或手寫、顏色與字級；相框顏色也可以換。',
    '切到「裝飾」：在預覽下方選「筆」或「橡皮擦」直接在相框上畫，顏色、粗細與圖層在設定欄；橡皮擦只擦目前的圖層。',
    '「貼紙」最多 5 張，會自動加上白邊；用「移動」工具點貼紙，拖曳移動、拖四角縮放、拖上方的圓鈕旋轉。',
    '按「下載 PNG」存成圖片（相框的 3 倍大小）。內容會自動儲存在這個瀏覽器，也可以從「專案」選單存成專案檔。',
  ],
};
