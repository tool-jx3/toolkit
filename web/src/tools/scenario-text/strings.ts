/**
 * 劇本文字產生器的介面文字（繁中；用詞照 DESIGN.md 第 5 節）。
 * 範例文字與預設的說話者照原作（MIT）翻成繁中。
 */
import type { BundleText } from './output';

export const S = {
  /* ---------- 頁首 ---------- */
  undo: '復原',
  redo: '重做',
  keyGroupEdit: '編輯',
  keyGroupList: '清單',
  keyUndo: '復原',
  keyRedo: '重做',
  keyRowMove: '在清單列上：選上一則／下一則',
  keyRowPick: '在清單列上：選取這一則',
  resetLabel: '重來…',
  resetTitle: '全部清掉重來？',
  resetDescription: '說話者、文字、已確定的劇本文字全部清掉重來（圖片庫會留著；可以復原）。',
  resetConfirm: '重來',
  opened: (name: string) => `已開啟專案檔「${name}」（可以復原）。`,
  openedLegacy: (name: string, n: number) =>
    `已開啟原作的專案檔「${name}」${n ? `，圖片 ${n} 張放進了圖片庫` : ''}（可以復原）。`,
  saved: (name: string) => `已存成專案檔「${name}」。`,
  openFailed: (msg: string) => `無法開啟專案檔：${msg}`,
  notProject: '這不是劇本文字產生器的專案檔。',
  openLegacy: '開啟原作的專案檔（.json）…',
  autosaveFailed: '無法自動儲存到瀏覽器，請用「存成專案檔」存下來。',
  resetDone: '已經清掉重來（圖片庫留著）。',

  /* ---------- 左欄分頁 ---------- */
  inputTabs: '輸入',
  tabText: '文字',
  tabSpeakers: (n: number) => `說話者（${n}）`,
  tabImages: (n: number) => `圖片庫（${n}）`,

  /* ---------- 做法與文字 ---------- */
  modeTitle: '做法',
  modes: {
    script: {
      label: '台本',
      hint: '一句台詞一則。「艾莉絲「你好」」這樣的台本，標題是說話者的名稱。',
    },
    heading: {
      label: '依小標分段',
      hint: '「■圖書館」這樣的小標各一則，標題是小標、本文是下面的文字。給探索地點的描寫或 HO。',
    },
  },
  textTitle: { script: '台本', heading: '本文（依小標分段）' },
  textPlaceholder: {
    script: '艾莉絲「你好。」\n鮑伯「嗨。」\n門的另一頭傳來越來越近的腳步聲。',
    heading: '■圖書館\n舊報紙排滿了書架。\n\n■書房\n桌上有一把鑰匙。',
  },
  fillSample: '填入範例',
  replaceSampleTitle: '用範例取代目前的文字？',
  replaceSampleConfirm: '取代',
  unknownSpeakers: '有還沒登錄的說話者（送出時沒有立繪、照台本的寫法當名稱）：',
  addSpeakerFor: (name: string) => `把「${name}」加為說話者`,
  unknownFaces: '有還沒登錄的差分（送出時用基本立繪）：',
  addFaceFor: (name: string) => `把「${name}」加為差分`,

  /* ---------- 讀取方式 ---------- */
  readTitle: '讀取方式',
  unitLabel: '一則的分法',
  units: {
    line: '一行一則（引號還沒關上時接著讀下一行）',
    block: '空行分隔的一段一則',
  },
  styleLabel: '說話者的寫法',
  styles: {
    auto: '自動（名「台詞」／登錄的名：台詞）',
    quote: '只認 名「台詞」',
    colon: '只認 名：台詞',
  },
  keepQuotes: '保留台詞的引號',
  narrationLabel: '旁白',
  narrations: { include: '放進劇本文字', skip: '不放（只有台詞）' },
  narratorLabel: { script: '旁白的名稱', heading: '小標之前的文字的名稱' },
  narratorPlaceholder: '空白＝送出時聊天欄裡的名稱',
  headingHelp:
    '小標是「■」「□」「◆」「●」「★」等記號開頭的行、只有【圖書館】的行、「## 圖書館」這種 # 開頭的行。小標是登錄的說話者名稱時帶他的立繪；和圖片庫的圖同名時帶那張圖。',
  nameHelp:
    '名稱空白時，CCFOLIA 會用聊天欄目前的名稱（例如平常 GM 用的名字）送出。填登錄的說話者名稱的話，也會帶他的立繪。',
  quoteHelp: '台詞的引號可以用「」『』"…" “…”；「艾莉絲：「你好」」也算台詞。',

  /* ---------- 圖片庫 ---------- */
  shelfTitle: '圖片庫',
  shelfHelp:
    '先把立繪、HO 的圖放進來，說話者的立繪、每一則的圖都從這裡選。和小標、說話者同名的圖會自動用上（寫「■鑰匙」就用名為「鑰匙」的圖）。每張圖可以記下出處／作者（打包圖片時寫進清單）。圖片只存在這個瀏覽器裡。',
  dropLabel: '把圖片拖到這裡（可以多張）',
  dropButton: '選擇圖片',
  dropHint: 'PNG、JPEG、GIF、WebP，每張 5 MB 以內',
  addUrl: '用網址加入…',
  makeFromImages: '每張圖做一則',
  makeFromImagesHint:
    '圖片庫裡清單還沒用到的圖，每張在清單最後加一則（標題是圖的名稱，本文要自己填）。',
  shelfEmpty: '還沒有圖片。',
  imageNameOf: (name: string) => `圖片「${name}」的名稱`,
  imageCredit: '出處／作者（選填）',
  imageCreditOf: (name: string) => `圖片「${name}」的出處／作者`,
  imageUrlInfo: '網址',
  imageMissing: '找不到內容',
  imageTooBig: '（超過 5 MB）',
  deleteImage: (name: string) => `刪除圖片「${name}」`,
  noName: '（沒有名稱）',
  urlSuffix: '（網址）',
  /* 加入的結果（F18） */
  added: (n: number) => `已把 ${n} 張圖片放進圖片庫。`,
  addedNotSaved: '但這個瀏覽器存不了圖片，關掉前請用「存成專案檔」存下來。',
  same: (n: number) => `${n} 張和圖片庫裡的圖片相同，沿用原本那張。`,
  badFormat: (n: number) => `${n} 個檔案的格式不能用（可以用 PNG、JPEG、GIF、WebP）。`,
  tooBig: (n: number) => `${n} 張超過 5 MB，CCFOLIA 可能讀不進去，請先縮小再用。`,
  /* 網址（F19） */
  urlDialogTitle: '用網址加入圖片',
  urlLabel: '圖片的網址（https:// 開頭）',
  urlAdd: '加入',
  urlCancel: '取消',
  urlBad: '網址請用 https:// 開頭（不能有空白）。',
  urlAdded: '已把網址的圖片放進圖片庫。',
  urlExists: '這個網址已經在圖片庫裡了。',
  urlImageName: '網址的圖片',
  fallbackImageName: '圖片',
  /* 刪除（F21） */
  deleteUsedTitle: (name: string) => `「${name}」有地方用到，確定刪除？`,
  deleteUsedNames: (names: string) => `說話者、差分：${names}`,
  deleteUsedCount: (n: number) => `個別選了這張圖的劇本文字 ${n} 則`,
  deleteUsedAfter: '刪除後這些地方會變成「沒有圖」。',
  deleteTitle: (name: string) => `從圖片庫刪除「${name}」？`,
  deleteConfirm: '刪除',
  deleted: '已刪除。',
  deletedUsed: '已刪除；用到的地方變成「沒有圖」。',
  /* 每張圖做一則（F22） */
  makeNone: '圖片庫沒有圖片。',
  makeAllUsed: '圖片庫的圖片都已經用在清單裡了。',
  made: (n: number, skipped: number) =>
    `已依圖片加了 ${n} 則劇本文字${skipped ? `（清單已經用到的 ${skipped} 張略過）` : ''}。本文是空的，請一則一則填。`,
  dropOutside: '圖片請拖到圖片庫，或說話者的圖。',
  noIndexedDb: '這個瀏覽器存不了圖片；要用圖片的話，請用「存成專案檔」存下來。',

  /* ---------- 說話者 ---------- */
  speakersTitle: '說話者',
  speakersHelp:
    '登錄人物與立繪（不需要立繪的話不登錄也可以）。名稱是 CCFOLIA 送出時顯示的名稱（劇本文字的標題）。立繪從圖片庫選，或按「加入圖片」（也可以把圖片拖到左邊的框）。表情的圖登錄成差分，或把圖片名稱改成「艾莉絲_笑臉」再按「從圖片庫建立差分」。台本寫「艾莉絲（笑臉）「…」」或「艾莉絲@笑臉「…」」就會換成那個差分。',
  speakerName: '名稱（標題）',
  speakerNameOf: (n: number) => `第 ${n} 位說話者的名稱`,
  speakerAliases: '台本裡的其他寫法（用「、」分隔）',
  speakerAliasesOf: (name: string) => `${name}在台本裡的其他寫法`,
  aliasesPlaceholder: '例：小艾、艾莉',
  portraitOf: (name: string) => `${name}的立繪`,
  speakerFallback: '說話者',
  noImage: '沒有圖',
  addImage: '加入圖片',
  addImageFor: (label: string) => `${label}：從檔案加入圖片`,
  dropOnThumb: '可以把圖片拖到這裡',
  deleteSpeaker: (n: number) => `刪除第 ${n} 位說話者`,
  deleteSpeakerTitle: (name: string) => `刪除「${name}」？`,
  deleteSpeakerBody: '圖片庫的圖片會留著。',
  facesTitle: '差分',
  faceLabelOf: (name: string) => `${name}的差分名稱`,
  facePlaceholder: '差分名稱（例：笑臉）',
  faceImageOf: (label: string) => `差分「${label}」的圖`,
  deleteFace: (label: string) => `刪除差分「${label}」`,
  addFace: '新增差分',
  facesFromNames: '從圖片庫建立差分',
  facesFromNamesHint: (name: string) => `把名稱像「${name}_笑臉」的圖片做成差分`,
  effectsLabel: '效果差分',
  effectsHint:
    '從立繪做出剪影、懷舊等差分（放進圖片庫）。請只用在畫師允許加工的立繪；會動的圖只用第一格。',
  effectsDisabled: '立繪是圖片庫裡的檔案才能用（網址的圖瀏覽器不能加工）。',
  effectOf: (label: string, name: string) => `從${name}的立繪做「${label}」差分`,
  effects: {
    silhouette: '剪影',
    sepia: '懷舊',
    mono: '黑白',
    blur: '模糊',
    ghost: '半透明',
  },
  addSpeaker: '新增說話者',
  faceInTitle: '差分名稱加進標題（例：艾莉絲（笑臉））',
  faceInTitleHint:
    '關閉時選了差分標題還是「艾莉絲」（只換立繪）；開啟時 CCFOLIA 也顯示「艾莉絲（笑臉）」。手動輸入的標題不受影響。',
  warnBig: (name: string, size: string) =>
    `「${name}」有 ${size}，超過 5 MB 時 CCFOLIA 可能讀不進去。`,
  warnMissing: (name: string) => `找不到「${name}」的內容，請在圖片庫重新加入。`,
  /* 從圖片庫建立差分（3.4） */
  facesNeedName: '請先填說話者的名稱。',
  facesMade: (n: number, names: string) => `已建立 ${n} 個差分：${names}。`,
  facesPortrait: '也設定了立繪。',
  facesNothing: '沒有可以新建的差分（都已經建好了）。',
  facesNotFound: (name: string) =>
    `找不到以「${name}」開頭的圖片。請把圖片名稱改成「${name}_笑臉」這種形式。`,
  /* 效果差分（3.5） */
  fxNoPortrait: '請先設定這位說話者的立繪。',
  fxUrl: '網址的圖瀏覽器不能加工，請改用檔案的圖片。',
  fxExists: (label: string) => `已經有「${label}」差分了。`,
  fxOpaque: '這張圖的背景不是透明的，剪影會變成黑色方塊。請用背景透明的 PNG 立繪。',
  fxUnsupported: '這個瀏覽器不能用這個效果。',
  fxFailed: (msg: string) => `無法做出效果差分：${msg}`,
  fxMade: (label: string, name: string) =>
    `已做出「${label}」差分（圖片放進了圖片庫）。台本寫「${name}（${label}）「…」」就會用上。`,
  fxBig: '但圖片超過 5 MB，CCFOLIA 可能讀不進去。',

  /* ---------- 清單 ---------- */
  listTitle: (n: number) => `劇本文字（${n} 則）`,
  listSummary: (a: number, b: number) => `有圖 ${a} 則・沒有圖 ${b} 則`,
  editedNote: '清單已經手動修改：改文字或讀取方式時清單不會跟著變。',
  rebuild: '從文字重建',
  rebuildTitle: '丟掉手動修改，從文字重新做清單？',
  rebuildConfirm: '重建',
  rebuilt: '已從文字重建清單。',
  tableLabel: '劇本文字清單',
  colLine: '行',
  colImage: '圖',
  colTitle: '標題（名稱）',
  colText: '本文',
  emptyList: '在文字欄貼上文字，這裡會一則一則列出來。',
  emptyTitle: '（聊天欄的名稱）',
  badgeFace: (face: string) => `差分 ${face}`,
  badgeNoImage: '沒有圖',
  badgeOwnImage: '個別的圖',
  badgeUnknown: '未登錄',
  badgeFaceMissing: '沒有這個差分',
  badgeNarration: { script: '旁白', heading: '小標之前' },
  confirmBatch: '確定，換下一段文字',
  confirmHint:
    '大量製作時，在這裡「確定」會把目前的清單收到下面，文字欄清空，可以接著輸入下一段台本或描寫；匯出時全部放進同一個 ZIP。',
  confirmed: (n: number) => `已確定（${n} 則），可以輸入下一段文字。`,

  /* ---------- 預覽 ---------- */
  viewLabel: 'CCFOLIA 的視窗寬度',
  views: {
    pc: '電腦（立繪寬 240px）',
    mid: '小畫面・寬度未滿 900px（180px）',
    phone: '手機・寬度未滿 600px（120px）',
  },
  previewHint: '在清單選一則，這裡會顯示送出時的樣子',
  previewStage: '訊息框的預覽',
  previewEmptyName: '（送出時聊天欄的名稱）',
  infoSize: (w: number, h: number, iw: number, ih: number) =>
    `立繪會以寬 ${w}px × 高 ${h}px 顯示（原圖 ${iw}×${ih}）。`,
  infoWide: '橫長的圖寬度固定，所以會顯示得比較小。',
  infoTall: '太長的直式圖會依畫面高度被切掉上面。',
  infoLoading: '讀取圖片中…',
  infoError: '讀不到圖片（網址的圖可能已經失效）。',
  infoNone: '這則沒有圖。',
  logCaption: '聊天欄（日誌）裡是約 40px 的方形頭像（直式取上方、橫式取中央）：',
  logEmptyName: '（聊天欄的名稱）',

  /* ---------- 修改 ---------- */
  editorTitle: '修改選取的一則（把圖片拖到這裡，就設成這一則的圖）',
  edTitle: '標題（名稱）',
  edTitlePlaceholder: '空白＝聊天欄的名稱',
  edTitleReset: '回到說話者的名稱',
  edSpeaker: '說話者',
  edNoSpeaker: '（沒有立繪）',
  edFace: '差分',
  edFaceBase: '基本',
  edFaceMissing: (face: string) => `${face}（未登錄）`,
  edImage: '圖片（只有這一則）',
  edImageAuto: '自動（說話者、差分、同名的圖）',
  edImageNone: '沒有圖',
  edText: '本文',
  edUp: '上移',
  edDown: '下移',
  edAdd: '在下面加一則',
  edDelete: '刪除這一則',
  newEntryText: '（新的劇本文字）',

  /* ---------- 已確定 ---------- */
  batchesTitle: (n: number) => `已確定的劇本文字（${n} 則）`,
  batchMode: { script: '台本', heading: '小標' },
  batchCount: (n: number) => `${n} 則`,
  batchUp: (n: number) => `第 ${n} 批上移`,
  batchDown: (n: number) => `第 ${n} 批下移`,
  batchRestore: '放回修改',
  batchRestoreOf: (n: number) => `第 ${n} 批放回修改`,
  batchDelete: (n: number) => `刪除第 ${n} 批`,
  batchDeleteTitle: (n: number, count: number) => `刪除已確定的第 ${n} 批（${count} 則）？`,
  batchEntries: (n: number) => `第 ${n} 批的劇本文字`,
  restored: '已放回。修改後請再按一次確定。',
  restoredMoved: '已放回；原本的文字已經移到已確定的最後。',
  titleSep: '：',

  /* ---------- 匯出 ---------- */
  exportTitle: '匯出',
  exportSummaryAll: (done: number, now: number, total: number) =>
    `已確定 ${done} 則＋目前的清單 ${now} 則＝共 ${total} 則，匯出成一個 ZIP。`,
  exportSummaryNow: (now: number) => `目前的清單 ${now} 則匯出成 ZIP。`,
  exportSummaryNone: '還沒有可以匯出的劇本文字。',
  exportZip: '匯出房間 ZIP',
  exporting: '匯出中…',
  exportEmptyText: (where: string) =>
    `有本文空白的劇本文字（${where}）。CCFOLIA 會改送聊天欄裡的文字，請填入本文或刪除。`,
  whereBatch: (n: number) => `已確定的第 ${n} 批`,
  whereNow: '目前的清單',
  exportMissing: (name: string) =>
    `找不到圖片「${name}」的內容，請在圖片庫重新加入，或換掉用到它的地方的圖。`,
  exportDone: (n: number, files: number) =>
    `已匯出（劇本文字 ${n} 則、圖片 ${files} 張）。請在 CCFOLIA 的房間設定讀入。`,
  exportBig: (n: number) => `有 ${n} 張圖片超過 5 MB，CCFOLIA 可能讀不進去。`,
  exportFailed: (msg: string) => `無法匯出：${msg}`,
  exportCheckFailed: '匯出的 ZIP 沒有通過自我檢查，沒有下載。',
  bundle: '把用到的圖片打包成 ZIP',
  bundling: '打包中…',
  bundleAll: '放入圖片庫的所有圖片',
  bundleHelp:
    '匯出的房間 ZIP 裡，圖片的檔名是一長串英數（內容的識別碼）。這裡用圖片庫的名稱打包，並在「圖片清單.txt」寫下用在哪些劇本文字、出處，以及房間 ZIP 裡的檔名。網址的圖瀏覽器拿不到內容，只寫網址。',
  bundleNone: '沒有可以打包的圖片。',
  bundled: (n: number, name: string, size: string) => `已把 ${n} 張圖片打包成 ${name}（${size}）。`,
  bundledUrls: (n: number) => `網址的圖片 ${n} 張只在清單寫了網址。`,
  bundledLost: (n: number) => `有 ${n} 張圖片找不到內容。`,
  bundleFailed: (msg: string) => `無法打包圖片：${msg}`,

  /* ---------- 說明 ---------- */
  importTitle: '在 CCFOLIA 讀入',
  importSteps: [
    '以 GM（房主、副房主）身分進入房間；訪客登入不能讀入。',
    '左上的房間名稱 →「ルーム設定」→「ルームデータ」→「ルームデータのインポート」的「インポート」，選匯出的 ZIP（把 ZIP 拖到盤面上也可以）。',
    '會出現「外部ツールで作成および編集されたデータです。…」的確認：這個工具做的資料一定會出現這個確認，是這個工具的就按 OK。',
    '上方選單的「[GM] シナリオテキスト一覧」會依順序列出劇本文字；打開按「送信」，就會以標題的名稱送出，訊息框也會顯示立繪。',
  ],
  importNotes: [
    '讀入只會「追加」劇本文字，房間裡原本的劇本文字、角色、盤面都不會變。用不到的請在劇本文字一覽刪除。',
    '只有從劇本文字一覽「送信」才會有立繪；自己在聊天欄打字送出是一般發言（名稱欄的角色）。',
    '圖片庫的圖片只存在這個瀏覽器裡（清除網站資料就會不見），重要的請用「存成專案檔」另外存一份。',
    '讀入時圖片會上傳到 CCFOLIA。使用別人的立繪請在畫師允許的範圍內。',
    '請在自己建立的房間使用；購買的劇本（CCFOLIA GAMES 等）的房間資料禁止修改。',
    '這是非官方工具，CCFOLIA 改版後可能讀不進去。',
    '想在 OBS 顯示訊息框，可以搭配本站的「訊息框產生器」。',
  ],
  usageIntro:
    '把台本或描寫的文字貼進來，切成一則一則的 CCFOLIA「劇本文字」（シナリオテキスト），匯出成房間 ZIP。台詞可以帶說話者的立繪（含差分），描寫與 HO 可以各自附圖；從 CCFOLIA 的劇本文字一覽送出時，訊息框會顯示這些圖。全部在瀏覽器裡處理，文字與圖片不會上傳。',
  usageSteps: [
    '「文字」分頁選做法（台本／依小標分段），貼上文字；右邊會列出一則一則的劇本文字。',
    '「說話者」分頁登錄人物與立繪、差分；「圖片庫」放入要用的圖片。',
    '在清單選一則可以看送出時的樣子，也可以直接修改標題、說話者、圖片、本文。',
    '一次做很多段時，按「確定，換下一段文字」再貼下一段。',
    '按「匯出房間 ZIP」，在 CCFOLIA 的房間設定讀入。',
  ],
} as const;

/** 範例文字（原作的範例翻成繁中） */
export const SAMPLES = {
  script: `艾莉絲「欸，這棟宅子真的沒有人住嗎？」
鮑伯「應該是吧。聽說十年前就空著了。」
門的另一頭隱約傳來腳步聲。
艾莉絲（不安）「……剛剛那個，你聽到了嗎？」
鮑伯：真希望是我聽錯了。`,
  heading: `■圖書館
舊報紙塞滿了整排書架。
《圖書館使用》檢定成功的話，會找到十年前那場火災的報導。

■書房
桌上放著一個上了鎖的小盒子。

■艾莉絲
（艾莉絲寄來的信）明天晚上，我在宅子的後門等你。`,
} as const;

/** 打包圖片的清單文字（規格 3.7） */
export const BUNDLE_TEXT: BundleText = {
  title: '劇本文字產生器 圖片清單',
  created: (date) => `建立時間：${date}`,
  count: (n, all) => `圖片 ${n} 張（${all ? '圖片庫的所有圖片' : '劇本文字用到的圖片'}）`,
  folderNote: '圖片檔在 images 資料夾裡。',
  hashNote: '「房間 ZIP 裡的檔名」是這張圖片在匯出的房間 ZIP 裡的檔名。',
  size: (size, type) => `    大小：${size}（${type}）`,
  tooBig: ' ※ 超過 5 MB',
  hash: (name) => `    房間 ZIP 裡的檔名：${name}`,
  credit: (credit) => `    出處／作者：${credit}`,
  noCredit: '（未填）',
  usedIn: (where) => `    用在：${where}`,
  unused: '（沒有用到）',
  more: (n) => `、還有 ${n} 種`,
  list: (parts) => parts.join('、'),
  url: (url) => `    網址：${url}`,
  urlImage: '（網址的圖片，ZIP 裡沒有內容）',
  missing: '（找不到內容，ZIP 裡沒有）',
  fallbackName: '圖片',
  dup: (n) => `（${n}）`,
  listFile: '圖片清單.txt',
};
