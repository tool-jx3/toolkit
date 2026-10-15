/**
 * 介面文字（台灣繁體中文；用詞照 docs/refactor/DESIGN.md 第 5 節）。
 */
import type { ClickOrder, Ending, PopIcon, Speed } from './model';
import type { ExportFormat, TabId } from './store';

export const S = {
  /* 分頁 */
  tabsLabel: '設定分類',
  tabs: { card: '卡片', anim: '動畫' } satisfies Record<TabId, string>,

  /* 題目 */
  sectionText: '題目',
  prompt: '題目文字',
  keyword: '關鍵字',
  keywordHint: (max: number) => `色帶上的大字，最多 ${max} 字。`,
  note: '補充說明',
  verify: '按鈕文字',
  verifyHint: '底部操作列右邊的按鈕。',
  textHint: '放不下時以「…」省略。',

  /* 代表圖 */
  sectionAvatar: '代表圖',
  avatarHint: '色帶右邊的小圖，例如要找的角色。',
  avatarDropArea: '代表圖載入區',
  avatarDrop: '拖放或選擇一張圖片',
  avatarDropHint: '也可以直接拖到預覽的代表圖上。',
  currentImage: '目前：',
  sampleName: '範例圖',
  chooseImage: '選擇圖片',
  changeImage: '換一張',
  adjust: '調整範圍',
  avatarZoom: '縮放',
  avatarReset: '回到初始',
  avatarRemove: '拿掉代表圖',

  /* 外觀 */
  sectionLook: '外觀',
  theme: '主題色',
  themeSwatch: (hex: string) => `主題色 ${hex}`,
  customColor: '自訂',
  themeHint: '色帶、勾選標示與按鈕的顏色；太亮的顏色會自動換成深色字。',
  cols: '格數',
  colsOption: (n: number) => `${n} × ${n}`,
  colsHint: '換成 3 × 3 時，後面 7 格的圖片先收起來，換回 4 × 4 時照原位置出現。',
  showFoot: '底部操作列',
  showFootHint: '左邊三個圖示、右邊的按鈕；動畫最後會去按這個按鈕。',

  /* 動畫 */
  sectionEnding: '結尾',
  ending: '結尾',
  endings: {
    pass: '通過',
    fail: '失敗',
    error: '錯誤文字',
    popup: '跳出視窗',
  } satisfies Record<Ending, string>,
  endingDesc: {
    pass: '跳出「我不是機器人」的小視窗，轉圈後打上綠色的勾。',
    fail: '跳出「我不是機器人」的小視窗，轉圈後打上紅叉、整張卡片搖晃。',
    error: '圖片格下方出現紅色的錯誤文字、卡片搖晃，之後勾選全部取消。',
    popup: '畫面變暗，跳出一個視窗；游標去按視窗的按鈕。',
  } satisfies Record<Ending, string>,
  checkLabel: '勾選框文字',
  errorText: '錯誤文字',
  popIcon: '圖示',
  popIcons: { error: '錯誤', warn: '警告', info: '資訊', ok: '成功' } satisfies Record<
    PopIcon,
    string
  >,
  popTitle: '標題',
  popMessage: '內容',
  popMessageHint: (max: number) => `最多 ${max} 字、5 行。`,
  popButton: '按鈕文字',

  sectionPlay: '播放',
  cursor: '滑鼠游標',
  cursorHint: '關掉時勾選標示一格一格直接出現。',
  order: '點選順序',
  orders: { seq: '依序', random: '隨機' } satisfies Record<ClickOrder, string>,
  reshuffle: '換一個順序',
  orderHint: '依序＝由左上到右下；隨機的順序每次匯出都一樣，按「換一個順序」換掉。',
  speed: '速度',
  speeds: { slow: '慢', normal: '一般', fast: '快' } satisfies Record<Speed, string>,

  sectionMini: '動畫預覽',
  miniLabel: '動畫預覽',
  miniEmpty: '格子裡放了圖片之後，這裡會播放動畫。',
  miniPlay: '播放',
  miniPause: '暫停',
  enlarge: '放大預覽',
  bigTitle: '動畫預覽',
  bigDesc: (frames: number, seconds: number) => `${frames} 格、約 ${seconds.toFixed(1)} 秒`,
  bigExport: '匯出 GIF',
  close: '關閉',

  /* 預覽與格子的操作 */
  previewLabel: '卡片預覽',
  previewHint:
    '點格子勾選／取消；點空格子放圖片。滑過格子可以換圖、調整範圍、拿掉。圖片可以直接拖到預覽上（放在哪一格就從那一格開始放），或按 Ctrl＋V 貼上。',
  gridTools: '格子的操作',
  count: (sel: number, filled: number, total: number) =>
    `已勾選 ${sel} 格・圖片 ${filled}／${total} 格`,
  fill: '放入圖片',
  arrange: '排列模式',
  arrangeDone: '排列完成',
  arrangeOn: '拖曳圖片到別的格子換位置；也可以用方向鍵移動選取的格子。按 Esc 結束。',
  selectAll: '全選',
  shuffle: '打亂',
  clear: '清空',
  clearTitle: '清空所有格子的圖片？',
  clearDesc: '可以按「復原」拿回來。',
  clearConfirm: '清空',
  needImages: '請先在格子裡放入圖片。',
  cellLabel: (i: number, state: 'empty' | 'on' | 'off') =>
    state === 'empty'
      ? `第 ${i} 格：空的，按一下放入圖片`
      : `第 ${i} 格：${state === 'on' ? '已勾選' : '沒有勾選'}`,
  cellArrangeLabel: (i: number, empty: boolean) =>
    `第 ${i} 格${empty ? '（空的）' : ''}：拖曳或用方向鍵移動`,
  cellReplace: (i: number) => `第 ${i} 格：換一張圖片`,
  cellAdjust: (i: number) => `第 ${i} 格：調整範圍`,
  cellRemove: (i: number) => `第 ${i} 格：拿掉圖片`,
  avatarRegion: '代表圖：按一下放入或調整範圍',
  keywordRegion: '關鍵字：按一下修改',

  /* 圖片的載入 */
  windowDrop: '放開即可放入格子',
  windowDropAvatar: '放開換成代表圖',
  windowDropHint: '放在預覽的哪一格就從那一格開始放。',
  placed: (n: number) => `已放入 ${n} 張圖片`,
  avatarPlaced: '已換上代表圖',
  noEmpty: '沒有空的格子',
  dropped: (n: number) => `${n} 張沒有位置，沒有放入。`,
  notImage: (names: string) => `「${names}」不是圖片。`,
  readError: (names: string) => `無法讀取「${names}」。`,
  onlyFirst: (names: string) => `代表圖只用第一張，「${names}」沒有用到。`,
  notSaved: '有圖片存不進這個瀏覽器，重新整理之後就不見了（可以存成專案檔保留）。',
  loadFailed: '沒有放入圖片',
  imagesMissing:
    '有些圖片已經從這個瀏覽器清除，讀不到（格子會顯示成空的）。可以重新放入，或開啟有這些圖片的專案檔。',
  frameTitle: { avatar: '調整代表圖的範圍', cell: (i: number) => `調整第 ${i} 格的範圍` },
  frameNote: '拖曳移動、滾輪或滑桿縮放；圖片一定蓋滿格子。',

  /* 匯出 */
  exportTitle: '匯出',
  formats: { gif: 'GIF', apng: 'APNG', webp: 'WebP', png: 'PNG' } satisfies Record<
    ExportFormat,
    string
  >,
  formatDesc: {
    gif: '點選的動畫，大部分的地方都能播放（256 色）。',
    apng: '點選的動畫，全彩；Discord、瀏覽器能播放。',
    webp: '點選的動畫，全彩、檔案比較小。',
    png: '靜態的卡片（含勾選標示）。',
  } satisfies Record<ExportFormat, string>,
  noAnimation: '格子裡還沒有圖片，無法匯出動畫。',
  scale: '大小',
  scaleOption: (k: number, w: number, h: number) => `${k}×（${w} × ${h}）`,
  exportInfo: (frames: number, seconds: number) => `${frames} 格、約 ${seconds.toFixed(1)} 秒`,
  loopHint: '關掉無限循環時可以指定播放幾次。',
  colorsDetail: '色數',
  lossless: (n: number) => `${n} 色（無損）`,
  colorCount: (n: number) => `${n} 色`,

  /* 專案與儲存 */
  undo: '復原',
  redo: '重做',
  groupEdit: '編輯',
  groupGrid: '格子',
  exitArrange: '結束排列模式',
  saveFailed: '自動儲存失敗（瀏覽器的空間不足或被封鎖），重新整理之後可能會回到之前的內容。',
  projectSaved: '已存成專案檔',
  projectOpened: '已開啟專案檔',
  projectOpenFailed: '無法開啟專案檔',
  projectReset: '已重設',
  projectBad: '專案檔的內容無法使用。',
  projectMissingImage: '專案檔裡缺少圖片（或圖片無法讀取），沒有開啟。',
  projectNotSaved: '專案檔的圖片存不進這個瀏覽器，重新整理之後就不見了。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的內容會被換掉（可以按「復原」拿回來）。',
  openConfirmLabel: '開啟',
  resetTitle: '全部重設？',
  resetDesc: '卡片、格子的圖片與動畫設定都回到預設的範例（可以按「復原」拿回來）。',

  usage: [
    '在「卡片」分頁寫題目與關鍵字、放代表圖、挑主題色與格數。',
    '按預覽下方的「放入圖片」一次放好幾張（依序放進空格子），或把圖片拖到預覽上。',
    '點格子勾選要「答對」的圖片；「排列模式」可以拖曳圖片換位置。',
    '在「動畫」分頁選結尾、游標、點選順序與速度，旁邊的動畫預覽會即時播放。',
    '在匯出區選 GIF（點選的動畫）或 PNG（靜態的卡片），按「匯出」後下載。',
  ],
} as const;
