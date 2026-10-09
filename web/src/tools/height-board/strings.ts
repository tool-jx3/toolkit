/** 立繪身高比較板的介面文字（台灣繁體中文） */
export const S = {
  /* 工具列 */
  addImages: '選擇圖片…',
  addImagesHint: '可以一次選多張；也可以把圖片檔直接拖進視窗',
  undo: '復原',
  redo: '重做',
  zoomOut: '縮小',
  zoomIn: '放大',
  zoomLabel: (pct: number) => `目前倍率 ${pct}%，按一下回到 100%`,
  fitWidth: '符合寬度',
  arrangeEvenly: '等間隔排列',
  sortDesc: '按身高排列（高→矮）',
  sortAsc: '按身高排列（矮→高）',
  exportPng: '匯出 PNG',
  busy: '處理中…',
  toolbarLabel: '盤面操作',

  /* 盤面 */
  boardLabel: '身高比較盤面',
  emptyTitle: '把立繪圖片拖到這裡',
  emptyAlt: '或按上方的「選擇圖片」',
  emptyHint: '建議用去背（透明背景）的 PNG 或 WebP',
  emptyPrivacy: '圖片只在這台電腦的瀏覽器裡處理，不會上傳到任何地方。',
  dropLabel: '放開即可加入',
  dropHint: '放在盤面上時，新角色會擺在放開的位置',
  tooltip: (name: string, height: string) => `${name}　${height} cm`,
  headTag: '頭頂',
  footTag: '腳底',

  /* 狀態列 */
  adding: (i: number, n: number) => `加入中：第 ${i}／共 ${n} 張`,
  readFailed: (names: readonly string[]) => `無法讀取這些圖片，沒有加入：${names.join('、')}`,
  saveUnavailable:
    '這個瀏覽器不允許儲存資料，自動儲存無法使用（重新整理後內容會消失）。需要保留時請用「專案 → 存成專案檔」。',
  saveQuota:
    '瀏覽器的儲存空間不足，自動儲存無法使用（重新整理後內容會消失）。需要保留時請用「專案 → 存成專案檔」。',
  restoredMissing: (n: number) => `有 ${n} 位角色的圖片沒有儲存在瀏覽器裡，已略過。`,
  autosaveOn: '角色會自動儲存在這個瀏覽器',
  autosaveAt: (t: string) => `已自動儲存（${t}）`,
  autosaveOff: '自動儲存無法使用',

  /* 加入對話框 */
  singleTitle: '加入角色',
  singleDescription: '填好身高後按「加入」或 Enter。',
  batchTitle: (n: number) => `加入 ${n} 張圖片`,
  batchDescription:
    '只有填了身高的會加入。名稱欄按 Enter 跳到身高欄，身高欄按 Enter 跳到下一張的身高欄。',
  nameLabel: '名稱',
  heightLabel: '身高',
  heightHint: '1～1000 cm，可以到小數點後一位。',
  heightPlaceholder: '身高（cm）',
  rowName: (i: number) => `第 ${i} 張的名稱`,
  rowHeight: (i: number) => `第 ${i} 張的身高`,
  skip: '略過',
  cancel: '取消',
  confirmAdd: '加入',
  preview: '圖片預覽',

  /* 選取的角色 */
  selectedTitle: '選取的角色',
  helpTitle: '操作說明',
  name: '名稱',
  height: '身高',
  headLine: '頭頂線',
  headLineHint: '頭頂的位置。頭上有呆毛、帽子時往下移，讓身高只算到頭頂。',
  footLine: '腳底線',
  footLineHint: '腳底的位置。腳下有影子、底座時往上移。',
  lineHintBoard: '也可以在盤面上直接上下拖動紅線。',
  resetLines: '兩條線歸位',
  duplicate: '複製',
  replaceImage: '更換圖片…',
  replaceFailed: '無法讀取這張圖片，沒有更換。',
  deleteOne: '刪除',
  order: '前後順序',
  toBack: '置底',
  backward: '下移一層',
  forward: '上移一層',
  toFront: '置頂',
  copySuffix: '（複本）',
  hiddenNote: '這位角色目前隱藏中，不會畫在盤面上，也不會匯出。',
  help: [
    '點盤面上的角色或清單的一列就能選取；點盤面空白處或按 Esc 取消選取。',
    '按住角色左右拖曳改變位置；選取後也可以用 ← → 移動（每次 1 px，按住 Shift 10 px）。',
    '選取的角色會出現兩條紅線：上下拖動「頭頂」「腳底」線，或用下方的滑桿，讓身高只算兩線之間。',
    '滾輪以游標為中心縮放；Shift＋滾輪左右捲動。',
    '按住盤面空白處拖曳、按住滑鼠中鍵拖曳，或按住空白鍵拖曳，都可以平移盤面。',
    '清單可以拖曳調整前後順序（上面的在前面）；眼睛按鈕切換顯示／隱藏。',
  ],

  /* 清單 */
  listTitle: '角色清單',
  listLocked: '篩選中，不能調整順序',
  listCount: (n: number) => `${n} 位`,
  listFiltered: (shown: number, total: number) => `${shown}／${total}`,
  listLabel: '角色清單（上面的在前面）',
  search: '依名稱篩選',
  searchLabel: '依名稱篩選角色',
  clearSearch: '清除篩選文字',
  visibleOnly: '只列顯示中的角色',
  compact: '緊密列距',
  listEmpty: '還沒有角色。按「選擇圖片」或把圖片拖進視窗來加入。',
  listNoMatch: '沒有符合的角色。',
  listHeight: '身高',

  /* 專案與其他操作 */
  noCharacters: '還沒有角色',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDescription:
    '目前盤面上的角色會換成專案檔的內容，這個動作無法復原。需要保留目前的內容時，請先「存成專案檔」。',
  openConfirmLabel: '選擇專案檔',
  projectOpened: '已開啟專案檔',
  projectNewer: '這個專案檔是較新版本的工具存的，目前無法開啟。',
  projectInvalid: '專案檔的內容無法使用。',
  projectMissingImage: '專案檔裡缺少角色的圖片，無法開啟。',
  projectBadImage: '專案檔裡有無法讀取的圖片，無法開啟。',
  deleteAll: '全部刪除…',
  deleteAllTitle: '刪除全部角色？',
  deleteAllDescription: '盤面上的角色會全部刪除（可以用「復原」回來）。',
  deleteAllConfirm: '全部刪除',
  deletedAll: '已刪除全部角色',

  /* 匯出 */
  exportAllHidden: '所有角色都被隱藏了，沒有東西可以匯出。',
  exportFailed: '無法產生圖片',
  exported: '已匯出 PNG',

  /* 快捷鍵 */
  keysEdit: '編輯',
  keysCharacter: '角色',
  keyNudge: '選取的角色往左／右移動 1 px',
  keyNudge10: '選取的角色往左／右移動 10 px',
  keyDeselect: '取消選取',

  /* 使用說明 */
  usageIntro:
    '把多位角色的立繪依身高換成同一個比例尺並排在附公分刻度的盤面上，一眼看出誰高誰矮，最後可以匯出含刻度的 PNG。',
  usageSteps: [
    '按「選擇圖片」或把圖片檔拖進視窗；一次多張時會列成表格，填好每張的身高（cm）再加入。',
    '每張圖會先自動去掉四周的透明留白；身高是「頭頂線」到「腳底線」的距離，兩條線預設在圖的最上緣與最下緣。',
    '頭上有呆毛或帽子、腳下有影子時，選取角色後拖動盤面上的紅線（或用滑桿）調整，圖會依新的比例重新縮放。',
    '左右拖曳角色排位置，或用「等間隔排列」「按身高排列」一次排好；清單可以拖曳調整前後重疊。',
    '按「匯出 PNG」下載整張比較圖：只含顯示中的角色與刻度，用原圖的解析度繪製。',
  ],
  usageNotesTitle: '儲存與隱私',
  usageNotes: [
    '所有處理都在這台電腦的瀏覽器裡完成，圖片不會上傳。',
    '角色（含圖片）會自動儲存在這個瀏覽器，重新整理後還在；換電腦或清除瀏覽器資料前，請用「專案 → 存成專案檔」帶走。',
    '盤面倍率、選取、清單篩選與復原紀錄不會儲存。',
  ],
} as const;
