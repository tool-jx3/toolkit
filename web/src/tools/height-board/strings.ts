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
  emptyTitleTouch: '選擇立繪圖片，比比看身高',
  emptyAdd: '加入角色',
  emptyHint: '建議用去背（透明背景）的 PNG 或 WebP',
  emptyPrivacy: '圖片只在這台電腦的瀏覽器裡處理，不會上傳到任何地方。',
  dropLabel: '放開即可加入',
  dropHint:
    '放在盤面上時，新角色會擺在放開的位置；專案檔（.zip、原作的 .hboard）會直接開啟那個盤面',
  tooltip: (name: string, height: string) => `${name}　${height} cm`,
  headTag: '頭頂',
  footTag: '腳底',

  /* 不能加入的檔案（原作 2026-10 更新：以前靜默略過） */
  rejected: (names: readonly string[]) =>
    names.length === 1
      ? `「${names[0]}」不是圖片，沒有加入`
      : `${names.length} 個檔案不是圖片，沒有加入`,
  rejectedHint: '請用 PNG、WebP 等圖片；存好的專案檔（.zip、原作的 .hboard）可以直接拖進來開啟。',

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
  saveNow: '存成專案檔',
  closeNotice: '關閉這則提示',

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
  batchCount: (n: number) => (n ? `會加入 ${n} 位` : '還沒有填身高'),
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
  lineHintBoard: '盤面上的紅線可以直接拖動，也能拖到圖外。',
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
  deleted: (name: string) => `已刪除「${name}」`,
  /** 通知上的按鈕（和工具列的「復原」不同名，螢幕閱讀器分得出來） */
  undoDelete: '取消刪除',
  undoAlt: '用工具列的「復原」或 Ctrl＋Z 也可以復原',
  undoStale: '之後還有別的變更，請用工具列的「復原」一步一步退回。',
  hiddenNote: '這位角色目前隱藏中，不會畫在盤面上，也不會匯出。',
  help: [
    '點盤面上的角色或清單的一列就能選取；點盤面空白處或按 Esc 取消選取。',
    '按住角色左右拖曳改變位置；選取後也可以用 ← → 移動（每次 1 px，按住 Shift 10 px）。',
    '選取的角色會出現兩條紅線：上下拖動「頭頂」「腳底」線（可以拖到圖外），或用下方的滑桿，讓身高只算兩線之間。',
    '滾輪以游標為中心縮放；Shift＋滾輪左右捲動。',
    '按住盤面空白處拖曳、按住滑鼠中鍵拖曳，或按住空白鍵拖曳，都可以平移盤面。',
    '清單可以拖曳調整前後順序（上面的在前面）；眼睛按鈕切換顯示／隱藏。',
  ],
  /** 觸控螢幕的操作說明（原作 2026-10 更新：說明依輸入裝置） */
  helpTouch: [
    '點盤面上的角色或清單的一列就能選取；點盤面空白處取消選取。',
    '一指左右拖曳角色排位置。',
    '兩指張開或捏合縮放；兩指一起滑動移動盤面（空白處一指也可以）。',
    '選取的角色會出現兩條紅線：上下拖「頭頂」「腳底」線（可以拖到圖外），或用下方的滑桿。',
    '清單的列按住約半秒再上下拖，可以調整前後順序（上面的在前面）；眼睛按鈕切換顯示／隱藏。',
  ],

  /* 面板的版面（原作 2026-10 更新） */
  panelTabs: '清單與設定',
  detailTab: '角色設定',
  listTabLocked: '角色清單（不能排序）',
  panelCollapse: '收合面板',
  panelExpand: '展開面板',
  collapsedTitle: (title: string, name: string) => `${title}：${name}`,

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
  openDroppedConfirmLabel: '開啟',
  projectOpened: '已開啟專案檔',
  projectOpenFailed: '無法開啟專案檔',
  hboardBroken: '這個 .hboard 檔案已損壞，無法開啟。',
  hboardVersion: (v: string) => `這個 .hboard 是較新版本的原作存的（版本 ${v}），目前無法開啟。`,
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
  exportTooBig: '圖片太大，無法產生。隱藏一些角色之後可能就能匯出。',
  exported: '已匯出 PNG',
  exportedNote: 'PNG 不能再開回盤面；要換電腦或留備份，請從「專案」存成專案檔。',

  /* 重畫變慢（原作 2026-10 更新） */
  slowTitle: (n: number) => `顯示中的角色有 ${n} 位，盤面重畫變慢了`,
  slowHint: '用清單的眼睛按鈕隱藏暫時不看的角色就會變快（不用刪除）。',

  /* 操作導覽（原作 2026-10 更新；練習用的範例盤面） */
  tourOpen: '看操作導覽',
  tourBusy: '加入或開啟檔案中，完成後再開導覽。',
  tourFailed: '無法開始操作導覽',
  tourNext: '下一步',
  tourBack: '上一步',
  tourSkip: '略過',
  tourDone: '開始使用',
  tour1Title: '加入角色',
  tour1:
    '按這裡選擇立繪圖片，也可以直接把圖片拖到盤面上。一次選好幾張時，會列成表格讓你一起填身高。',
  tour1Touch: '按這裡從相簿或檔案選擇立繪，選好之後再填名稱和身高。',
  tour2Title: '名稱與身高',
  tour2: '選取的角色可以在這裡改名稱和身高；改了身高，圖的大小也會跟著變。',
  tour3Title: '在盤面上排位置',
  tour3: '左右拖曳角色排位置；滾輪縮放、拖曳空白處移動盤面。重疊時，清單裡越上面的角色畫在越前面。',
  tour3Touch: '一指左右拖曳角色排位置；兩指縮放、移動盤面。重疊時，清單裡越上面的角色畫在越前面。',
  tour4Title: '對齊頭頂和腳底',
  tour4: '把紅線拖到頭頂和腳底（這位範例不算耳朵和尾巴）。蹲著或只有半身的立繪，可以把線拖到圖外。',
  tour5Title: '一次排整齊',
  tour5: '「等間隔排列」保持目前的左右順序、把間隔排整齊；「按身高排列」依身高重新排。',
  tour6Title: '匯出與儲存',
  tour6:
    '盤面會自動儲存在這個瀏覽器。「匯出 PNG」存成圖片；要換電腦或留備份，從「專案」存成專案檔。',

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
  /** 說明的各節（原作 2026-10 更新的說明選單：立繪的準備、很多角色、手機與平板、儲存的方式） */
  usageSections: [
    {
      title: '立繪的準備',
      items: [
        '建議用去背（透明背景）的 PNG 或 WebP：工具會去掉四周的透明留白，讓剩下的範圍等於身高；留白不用先裁掉。',
        '沒有去背的圖（JPEG 等），或有發光、模糊陰影、半透明光暈的立繪，範圍會比人物大，請手動調整頭頂線與腳底線。',
        '不想把帽子、耳朵算進身高時，把頭頂線拖到頭頂；身高是「地面到頭頂線」。',
        '蹲著、屈膝的立繪把頭頂線拖到圖的上方，胸像或半身立繪把腳底線拖到圖的下方，就能用站直時的身高比較。',
      ],
    },
    {
      title: '角色很多時',
      items: [
        '同時顯示的角色大約 50 位以內比較順（依裝置而不同）；影響速度的只有顯示中的角色，加入多少都沒關係。',
        '用清單的眼睛按鈕只顯示需要比較的角色；重畫變慢時工具會提示一次。',
      ],
    },
    {
      title: '手機與平板',
      items: [
        '一指拖曳角色與紅線；兩指縮放、移動盤面。一指拖著角色時放上第二指，角色會回到原位。',
        '清單的列按住約半秒再上下拖，可以調整前後順序；直接滑動是捲動清單。',
        '手機上清單與設定分成兩個分頁，面板可以收合讓盤面變大（會記住）。比較多位角色時，寬螢幕還是比較好用。',
      ],
    },
    {
      title: '三種儲存方式',
      items: [
        '自動儲存：盤面隨時存在這個瀏覽器，下次打開還在；只有一個盤面，做別的盤面會蓋掉。',
        '專案檔（「專案 → 存成專案檔」，.zip，含圖片）：換電腦、留備份、保留好幾個盤面時用；拖進視窗也能開啟，原作存的 .hboard 也能開。',
        '匯出 PNG：完成後張貼、分享用；PNG 不能再開回盤面。',
        '自動儲存在這些情況會消失：清除瀏覽器的 Cookie 與網站資料、關閉無痕視窗、Safari 七天沒有打開這個頁面。要留下來的盤面請存成專案檔。',
      ],
    },
  ],
  usageNotesTitle: '儲存與隱私',
  usageNotes: [
    '所有處理都在這台電腦的瀏覽器裡完成，圖片不會上傳。',
    '角色（含圖片）會自動儲存在這個瀏覽器，重新整理後還在；換電腦或清除瀏覽器資料前，請用「專案 → 存成專案檔」帶走。',
    '盤面倍率、選取、清單篩選與復原紀錄不會儲存。',
    '介面與刻度的字型從 Google Fonts 載入（只下載字型，不會送出圖片）。',
  ],
} as const;
