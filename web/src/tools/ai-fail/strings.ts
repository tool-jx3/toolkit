/** AI 誤判梗圖產生器的介面文字 */
import type { AspectId, LabelAlign, LabelPos } from './model';

export type Mode = 'select' | 'draw';

export const S = {
  /* 照片 */
  sectionPhoto: '照片',
  dropAreaLabel: '照片載入區',
  dropLabel: '把照片拖到這裡',
  dropHint: '任何圖片格式；放進新照片會清掉所有的框',
  choosePhoto: '選擇照片',
  changePhoto: '更換照片',
  loadedPrefix: '目前的照片：',
  loadedHint: '把另一張照片拖到這裡也可以更換（會清掉所有的框）',
  notImage: (names: string) => `「${names}」不是圖片檔，請選擇照片。`,
  decodeError: (name: string) => `無法讀取「${name}」，檔案可能已損壞，請換一張照片。`,
  photoNotSaved: '瀏覽器空間不足或無法存檔：照片這次可以用，但重新整理之後就不見了。',
  photoMissing: '上次的照片讀不到了（可能已從這個瀏覽器清除），請重新選擇照片。',
  zoom: '放大',
  zoomUnit: '倍',
  zoomHint: '放大時以畫面中央為準；在照片上沒有框的地方按住拖曳可以移動取景。',
  resetView: '重設位置',
  privacy: '照片只在你的瀏覽器裡處理，不會上傳到任何地方。',
  windowDrop: '放開即可換成這張照片',
  windowDropHint: '會清掉目前所有的框（可以復原）',

  /* 圖片比例 */
  sectionAspect: '圖片比例',
  aspect: '比例',
  aspects: {
    native: '原圖',
    '1:1': '1:1',
    '3:4': '3:4',
    '4:3': '4:3',
  } satisfies Record<AspectId, string>,
  aspectAria: {
    native: '原圖比例',
    '1:1': '1:1（正方形）',
    '3:4': '3:4（直式）',
    '4:3': '4:3（橫式）',
  } satisfies Record<AspectId, string>,
  aspectHint: (w: number, h: number) => `輸出 ${w} × ${h} px。換比例時框會跟著縮放，照片回到置中。`,

  /* 框 */
  mode: '操作',
  modes: { select: '選取／移動', draw: '新增框' } satisfies Record<Mode, string>,
  modeHint: {
    select: '按框選取、拖曳移動，拖四角與四邊的控制點調整大小。',
    draw: '在照片上按住拖曳畫出新的框；畫好之後自動回到選取。',
  } satisfies Record<Mode, string>,
  needPhoto: '先放進一張照片才能畫框。',

  /* 選取的框 */
  sectionSelected: '選取的框',
  label: '標籤文字',
  labelPlaceholder: '例如 dog 0.97',
  labelHint: (n: number, max: number) => `${n}／${max} 字；清空就不畫標籤。`,
  color: '顏色',
  colorHint: '方框與標籤文字同一個顏色。',
  lineWidth: '線寬',
  fontSize: '字級',
  align: '文字對齊',
  aligns: { left: '靠左', center: '置中', right: '靠右' } satisfies Record<LabelAlign, string>,
  labelPos: '標籤位置',
  labelPositions: { top: '框的上方', inside: '框內' } satisfies Record<LabelPos, string>,
  labelPosHint: '框太靠近畫面頂端、上方放不下時，標籤會自動畫在框內。',
  deleteBox: '刪除這個框',

  /* 清單 */
  sectionList: '框的清單',
  listLabel: '框的清單（上層在前）',
  listEmpty: '放進照片後，按「新增框」在照片上拖曳，把要「認錯」的東西框起來。',
  listHint: '拖曳或用上下按鈕調整前後；清單上面的框畫在前面。',
  noLabel: '沒有標籤',
  boxNumber: (n: number) => `#${n}`,
  boxSize: (w: number, h: number) => `${w} × ${h} px`,
  forward: '往前一層',
  backward: '往後一層',
  remove: '刪除',
  rowName: (label: string, n: number) => `${label}（#${n}）`,

  /* 字型 */
  sectionFont: '標籤字型',
  font: '字型',
  fontHint: '所有框的標籤共用這套字型。',
  fontPreview: 'object 物件 0.98',

  /* 預覽與輸出 */
  previewLabel: '梗圖預覽',
  editLayer: '在照片上畫框、選取與調整',
  emptyTitle: '加入照片',
  emptyHint: '點一下、拖放，或貼上（Ctrl+V）',
  exportTitle: '匯出',
  downloadPng: '下載 PNG',
  exportSize: (w: number, h: number) => `${w} × ${h} px`,
  exportNeedPhoto: '放進照片之後才能下載。',
  exportNote: '輸出就是預覽上的樣子（不含選取標示）。',
  fileName: 'ai-fail-meme.png',
  downloadDone: (name: string) => `已下載 ${name}`,
  downloadFailed: '無法產生圖片，請再試一次。',

  /* 頁首 */
  undo: '復原',
  redo: '重做',
  resetTitle: '重設？',
  resetDesc: '照片、所有的框與設定都會清掉，回到剛打開的樣子（可以復原）。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的照片與框會被專案檔的內容取代（可以復原）。',
  openConfirmLabel: '開啟',
  projectOpened: '已開啟專案檔。',
  projectBad: '這個專案檔的內容無法使用。',
  projectMissingPhoto: '專案檔裡少了照片，或照片無法讀取。',
  restoredMissing: '上次的照片讀不到了，請重新選擇照片。',
  saveFailed: '自動儲存失敗（瀏覽器空間不足或被封鎖）',

  /* 快捷鍵 */
  groupEdit: '編輯',
  groupBox: '框',
  shortcutEscape: '取消正在畫的框／回到選取模式／取消選取',
  shortcutDelete: '刪除選取的框',
  shortcutNudge: '移動選取的框 1 px',
  shortcutNudgeBig: '移動選取的框 10 px',
  shortcutForward: '選取的框往前一層',
  shortcutBackward: '選取的框往後一層',

  /* 使用方式 */
  usage: [
    '放進一張照片（選檔、拖放或 Ctrl+V 貼上），照片會鋪滿畫面；用「放大」與拖曳調整取景。',
    '選「新增框」，在照片上按住拖曳，把要「認錯」的東西框起來；新框的標籤是 object。',
    '在「選取的框」改標籤文字、顏色、線寬、字級、對齊與標籤位置；拖四角與四邊的控制點調整大小。',
    '框重疊時，在「框的清單」拖曳或用上下按鈕調整前後（清單上面的畫在前面）。',
    '按「下載 PNG」存成圖片。內容會自動儲存在這個瀏覽器，也可以從「專案」選單存成專案檔。',
  ],
};
