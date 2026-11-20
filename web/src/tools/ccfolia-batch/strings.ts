/**
 * CCFOLIA 角色批次產生器的介面文字（繁中；用詞照 DESIGN.md 第 5 節）。
 * `OUT` 是會寫進輸出（聊天面板、新棋子）的字，改了會影響使用者在指令裡的 {名稱} 參照。
 */
import type { MemoHint, ReadChip, SourceState, Who } from './memo';
import type { LabelKind, RollStyle } from './model';
import type { TableHint } from './table';
import type { ColumnKind } from './words';

/** 寫進輸出的字 */
export const OUT = {
  /** 傷害的指令名稱（照本站 coc-sheet：「名稱（傷害）」；有附註時「名稱（傷害：附註）」） */
  damageLabel: (label: string, note: string) =>
    note ? `${label}（傷害：${note}）` : `${label}（傷害）`,
  /** 有 SAN 時聊天面板第一行的名稱（同 coc-npc） */
  sanCheck: '理智檢定',
  /** 「加一個棋子」的預設名稱 */
  newPiece: '新的棋子',
  /** 素材 ZIP 的資料夾 */
  folders: { portrait: '立繪', face: '差分', other: '其他' },
  /** 素材 ZIP 裡沒有名稱時 */
  noName: '沒有名稱',
  faceFallback: '差分',
  imageFallback: '圖片',
} as const;

const who = (w: Who): string => w.name || `第 ${w.line} 行開始的 NPC`;
const list = (xs: readonly (string | number)[]): string => xs.join('、');

export const ROLL_OPTIONS: readonly { value: RollStyle; label: string }[] = [
  { value: 'auto', label: '自動（6 版 CCB<=、7 版 CC<=）' },
  { value: 'ccb', label: 'CCB<=（克蘇魯的呼喚 6 版）' },
  { value: 'cc', label: 'CC<=（克蘇魯的呼喚 7 版）' },
  { value: 'd100', label: '1d100<=（其他系統）' },
  { value: 'none', label: '不寫成判定（技能變成參數）' },
];

export const LABEL_KIND_OPTIONS: readonly { value: LabelKind; label: string }[] = [
  { value: 'skill', label: '技能（寫成判定）' },
  { value: 'status', label: '狀態' },
  { value: 'param', label: '參數' },
  { value: 'ignore', label: '不用' },
];

export const COLUMN_KIND_OPTIONS: readonly { value: ColumnKind; label: string }[] = [
  { value: 'name', label: '名稱' },
  { value: 'memo', label: '備註' },
  { value: 'initiative', label: '先攻值' },
  { value: 'status', label: '狀態' },
  { value: 'param', label: '參數' },
  { value: 'commands', label: '聊天面板' },
  { value: 'image', label: '立繪（圖片名稱）' },
  { value: 'face', label: '差分（圖片名稱）' },
  { value: 'externalUrl', label: '參照網址' },
  { value: 'color', label: '顏色' },
  { value: 'size', label: '棋子大小' },
  { value: 'active', label: '放到盤面' },
  { value: 'secret', label: '狀態不公開' },
  { value: 'invisible', label: '發言時不顯示立繪' },
  { value: 'hideStatus', label: '不列入盤面的角色清單' },
  { value: 'ignore', label: '不用' },
];

/** 一行讀到的東西（「這個棋子的原文與讀到的內容」） */
export function chipText(c: ReadChip): string {
  switch (c.t) {
    case 'name':
      return `名字：${c.name}${c.count > 1 ? ` ×${c.count}` : ''}`;
    case 'tag':
      return `${c.tag}：${c.value}`;
    case 'url':
      return '參照網址';
    case 'memo':
      return '備註';
    case 'command':
      return `聊天面板：${c.command}`;
    case 'damage':
      return `${c.label}的傷害 ${c.damage}`;
    case 'weapon':
      return `武器：${c.name}`;
    case 'ignored':
      return `（不用）${c.label}`;
    case 'initiative':
      return `先攻值 ${c.value}`;
    case 'status':
      return `${c.label} ${c.value}${c.max !== c.value ? `/${c.max}` : ''}`;
    case 'param':
      return `${c.label} ${c.value}`;
    case 'skill':
      return `${c.label} ${c.value}${c.damage ? `（傷害 ${c.damage}）` : ''}`;
    case 'miss':
      return `讀不出：${c.text}`;
  }
}

/** 沒有讀到東西的行的標記 */
export const SOURCE_STATE: Readonly<Record<SourceState, string>> = {
  name: '名字',
  section: '小標',
  skip: '不用',
  read: '',
  partial: '',
  unread: '',
};

export function memoHintText(h: MemoHint): string {
  switch (h.code) {
    case 'no-name':
      return `第 ${h.line} 行開始的 NPC 沒有名字。請在第一行寫名字。`;
    case 'unread':
      return `${who(h.who)}：第 ${list(h.lines)} 行有讀不出的數字。寫成「標籤 數字」（例：偵查 60）就讀得到。`;
    case 'joined':
      return `${who(h.who)}：能力值出現了 ${h.count} 次。好幾個 NPC 連在一起時，請在 NPC 之間空一行。`;
    case 'nothing':
      return `${who(h.who)}：讀不到任何數值。`;
    case 'too-many':
      return `第 ${h.line} 行的「${h.name}」最多做 ${h.max} 個。`;
  }
}

export function tableHintText(h: TableHint): string {
  if (h.code === 'no-name-column') {
    return '找不到名稱的欄，第 1 欄當成名稱（第 1 列當成標題）。';
  }
  const at = `第 ${h.line} 列「${h.header}」的「${h.cell}」`;
  switch (h.code) {
    case 'not-number':
      return `${at}不是數字。`;
    case 'not-color':
      return `${at}不是顏色（#888888 這樣的色碼）。`;
    case 'not-flag':
      return `${at}看不出是「是」還是「否」（可以寫 ○／×）。`;
    case 'not-status':
      return `${at}請寫成「10」或「10/12」（先當成 0）。`;
  }
}

/** 範例（照原作的範例翻成繁中） */
export const SAMPLES = {
  memo: [
    '艾莉絲',
    'HP 12  MP 10  SAN 55/99',
    'STR 50  DEX 60  DB +0',
    '閃避 30 / 鬥毆 50 1d3 / 圖書館使用 65',
    '角色備註：大學生，好奇心旺盛',
    '',
    '鮑伯',
    'HP 14  MP 8  SAN 40/99',
    'DEX 45',
    '鬥毆 50 1d3+1d4 / 攝影 60',
    '角色備註：報社記者',
    '',
    '黑影 ×3',
    'HP 20  DEX 80  護甲 2',
    '爪擊 70 1d6+1d4 / 閃避 40',
  ].join('\n'),
  table: [
    ['名稱', 'HP', 'MP', 'SAN', 'DEX', '閃避', '先攻值', '聊天面板', '備註'],
    [
      '艾莉絲',
      '12/12',
      '10',
      '55/99',
      '60',
      '30',
      '12',
      '"CCB<={閃避} 閃避\n1d3 鬥毆"',
      '大學生，好奇心旺盛',
    ],
    ['鮑伯', '14', '8', '40/99', '45', '22', '9', 'CCB<=50 鬥毆', '報社記者'],
    ['黑影', '20', '', '', '80', '40', '16', 'CCB<=70 爪擊', ''],
  ]
    .map((r) => r.join('\t'))
    .join('\n'),
};

export const S = {
  /* ---- 頁首 ---- */
  undo: '復原',
  redo: '重做',
  keyUndo: '復原',
  keyRedo: '重做',
  keyGroupEdit: '編輯',
  keyGroupList: '棋子清單',
  keyRowMove: '選上一個／下一個棋子（清單有焦點時）',
  keyRowPick: '選這個棋子',
  autosaveFailed: '無法自動儲存',

  /* ---- 分頁 ---- */
  inputTabs: '輸入與設定',
  tabInput: '輸入',
  tabImages: (n: number) => `圖片庫（${n}）`,
  tabSettings: '全體設定',

  /* ---- 輸入 ---- */
  inputTitle: 'NPC 資料',
  fillSample: '填入範例',
  sampleTitle: '用範例取代目前的輸入？',
  sampleEditedTitle: '手動修改的內容也會丟掉，從範例重做？',
  sampleConfirm: '填入範例',
  modeLabel: '輸入的方式',
  modes: {
    memo: { label: '速記・從劇本貼上', hint: '幾行速記，或把劇本的 NPC 資料直接貼上。' },
    table: { label: '貼上試算表', hint: '從試算表複製表格貼上，一列一個棋子。' },
  },
  modeSwitchTitle: '丟掉手動修改，從輸入重做清單？',
  modeSwitchConfirm: '切換',
  locked:
    '清單正在手動修改，輸入欄暫時不能改。按「確定，換下一位 NPC」會留下修改、清空輸入欄；要放棄修改請按「從輸入重做」。',
  memoAria: 'NPC 資料（速記・從劇本貼上）',
  tableAria: 'NPC 資料（貼上試算表）',
  memoPlaceholder:
    '黑影 ×3\nHP 20  DEX 80  護甲 2\n爪擊 70 1d6+1d4 / 閃避 40\n角色備註：在巷子裡出沒\n\n（空一行，接著寫下一個 NPC）',
  tablePlaceholder:
    '名稱\tHP\tMP\tDEX\t聊天面板\n艾莉絲\t12/12\t10\t60\tCCB<=60 閃避\n鮑伯\t14\t8\t45\tCCB<=50 鬥毆',
  tableTabHint:
    '在表格欄按 Tab 會輸入 Tab（換到下一格）；要離開欄位請按 Shift＋Tab，或先按 Esc 再按 Tab。',
  roll: '技能的判定',
  suffix: '×N 的名稱',
  suffixOptions: { alpha: 'A、B、C…', number: '1、2、3…' },
  secretRoll: '判定寫成秘密骰（sCCB<=，結果只有 KP 看得到）',
  proseToMemo: '說明的文字也放進備註（其他玩家看得到，小心劇透）',
  abilityChecks: '能力值（STR～EDU）也寫成判定（6 版 ×5）',
  helpTitle: '寫法說明',
  memoHelp: {
    lead: '一個 NPC 一段，段與段之間空一行。第一行是名字，寫「黑影 ×3」就做黑影 A～C 三個（共用「黑影」的立繪）。第二行起寫「標籤 數值」就好。',
    rules: [
      '「HP 20」「SAN 55/99」：HP、MP、SAN 與「目前值/最大值」的寫法是狀態。',
      '「STR 50」「DEX 80」「護甲 2」「DB +1d4」：能力值這類是參數（DEX 也當先攻值）。',
      '「閃避 40」「爪擊 70 1d6+1d4」：其他的是技能，寫進聊天面板（「CCB<=70 爪擊」與傷害的一行）。',
      '「角色備註：…」寫進備註；「CCB<=50 幸運」這種指令的行照原樣放進聊天面板；也可以寫「立繪：圖片名稱」。',
    ],
    paste:
      '劇本的 NPC 資料直接貼上也讀得懂：「STR12」「〈閃避〉60％」「成功率70」「STR／DEX 60／50」「50%(25/10)」這類寫法的差異，與從 PDF 複製時被拆開的字（「D EX」「7 5」、斷到下一行的數字）都能讀；也認得「技能：」「武器：」「法術：」這類小標。日文、繁中、簡中的劇本都可以。',
    fix: [
      '讀得不對時，在清單選那個棋子，下面會逐行列出原文讀成了什麼，讀不出的數字標成橘色。',
      '幾個 NPC 併成一個時，在 NPC 之間空一行；名字不對時，第一行只寫名字；數字讀不出時，寫成「偵查 60」這樣，標籤後面直接接數字。',
      '想當狀態的讀成了技能（例：警戒值）時，在下面「讀到的標籤」改讀法；改過的讀法這個瀏覽器會記住，下一個 NPC、下一份劇本也照用。',
    ],
  },
  tableHelp:
    '從 Google 試算表或 Excel 連同標題列一起複製、貼上（第 1 列是標題，第 2 列起一列一個棋子；CSV 也可以，格裡的換行也讀得到）。名稱、備註、先攻值、聊天面板、立繪這些標題照用途讀；其他的欄：「10/12」的寫法或 HP、MP、SAN 是狀態（只寫「10」時最大值也是 10），其餘是參數。讀錯了可以在下面逐欄改；標題寫成「狀態:氣力」「參數:HP」「差分:笑」也可以直接指定。',
  columnsTitle: '每一欄的用途',
  columnAria: (header: string) => `「${header}」欄的用途`,
  labelsTitle: (n: number) => `讀到的標籤（${n} 種）與讀法`,
  labelsHelp:
    '讀錯了就改。標「？」的是不在常用技能、能力值清單裡的名稱，請確認讀法。改過的讀法這個瀏覽器會記住，之後的 NPC、別份劇本也照用。',
  labelAria: (label: string) => `「${label}」的讀法`,
  labelWritten: (written: string, label: string) => `${written}（${label}）`,
  labelUnknown: '不在常用技能、能力值清單裡的名稱，請確認讀法',
  moreHints: (n: number) => `還有 ${n} 則。`,
  lostImages: (items: readonly string[], more: number) =>
    `圖片庫裡沒有同名的圖：${list(items)}${more ? `，還有 ${more} 個` : ''}`,
  lostPortrait: (name: string, image: string) => `${name}的立繪「${image}」`,
  lostFace: (name: string, face: string, image: string) => `${name}的差分「${face}」的「${image}」`,
  dupNames: (names: readonly string[]) =>
    `有同名的棋子（照樣做得出來，但在 CCFOLIA 不容易分辨）：${list(names)}`,

  /* ---- 角色卡網站 ---- */
  pasteTitle: '從角色卡網站貼上',
  pasteSummary: (n: number) => `貼上的棋子 ${n} 個`,
  pasteHelp:
    '角色卡網站「輸出成 CCFOLIA 角色（ココフォリア出力）」複製的內容貼在這裡，會加在清單最後。直接貼進 CCFOLIA 時沒有的立繪與差分，可以在這裡加上再匯出；可以連續貼好幾個。',
  pasteAria: '角色卡網站複製的角色資料',
  pastePlaceholder: '{"kind":"character","data":{"name":"…"}}',
  pasteAdd: '加入',
  pasteClear: '清掉貼上的棋子',
  pasteClearTitle: (n: number) => `把貼上的 ${n} 個棋子從清單刪除？`,
  pasteClearConfirm: '刪除',
  pasteCleared: '已刪除貼上的棋子。',
  pasteNone: '找不到角色資料。請把角色卡網站「輸出成 CCFOLIA 角色」複製的內容原樣貼上。',
  pasteEmpty: '請先在上面貼上複製的內容。',
  pasteAdded: (n: number) => `已加入 ${n} 個。`,
  pasteIcon:
    '立繪沒有帶進來（CCFOLIA 的棋子不收別的網站的圖片）。把圖片放進圖片庫，和棋子同名就會自動當立繪。',
  pasteNoIcon: '立繪：把圖片放進圖片庫，和棋子同名就會自動當立繪。',

  /* ---- 圖片庫 ---- */
  shelfTitle: '圖片庫',
  shelfHelp:
    '放立繪與差分的圖。圖片名稱和棋子名稱相同就是立繪，「名稱_笑」就是差分「笑」（分隔可以用 _、-、@、空白、括號；本站「角色差分管理器」編號的「名稱01_笑」也可以）。名稱可以在下面改；圖片存在這個瀏覽器裡。',
  dropLabel: '把圖片拖到這裡',
  dropButton: '選擇圖片',
  dropHint: 'PNG、JPEG、GIF、WebP，可以多選；每張 5 MB 以內',
  shelfEmpty: '還沒有圖片。',
  imageNameOf: (name: string) => `圖片「${name}」的名稱`,
  deleteImage: (name: string) => `刪除圖片「${name}」`,
  deleteTitle: (name: string) => `從圖片庫刪除「${name}」？`,
  deleteUsedTitle: (name: string) => `「${name}」有指定給這些棋子：`,
  deleteUsedAfter: '刪除後這些地方會變成「沒有圖」（可以復原）。',
  deleteConfirm: '刪除',
  deleted: '已刪除。',
  deletedUsed: '已刪除；指定了這張圖的地方變成「沒有圖」。',
  imageMissing: '找不到內容',
  imageTooBig: '（超過 5 MB）',
  imageUnused: '還沒用到',
  portraitOfName: (name: string) => `${name}的立繪`,
  faceOfName: (name: string, face: string) => `${name}的差分「${face}」`,
  added: (n: number) => `已把 ${n} 張圖片放進圖片庫。`,
  addedNotSaved: '但這個瀏覽器存不了圖片，關閉前請存成專案檔。',
  same: (n: number) => `${n} 張和圖片庫裡的圖相同，用原本的。`,
  badFormat: (n: number) => `${n} 個檔案的格式不能用（可以用 PNG、JPEG、GIF、WebP）。`,
  tooBig: (n: number) => `${n} 張超過 5 MB，CCFOLIA 可能讀不進去，請縮小後再用。`,
  noIndexedDb: '這個瀏覽器存不了圖片：要用圖片時，請存成專案檔保留。',
  fallbackImageName: '圖片',
  dropOutside: '圖片請拖到「圖片庫」的拖放區，或棋子的修改欄。',

  /* ---- 全體設定 ---- */
  settingsTitle: '全體設定',
  board: '盤面',
  boardOptions: { list: '只放進角色清單', board: '放到盤面（橫向排開）' },
  boardHint: '「只放進角色清單」時，讀入後的棋子在角色清單裡，要用時再放到盤面。',
  size: '棋子大小',
  sizeUnit: '格',
  npcTitle: '給 NPC 的設定',
  secret: '狀態不公開',
  hideStatus: '不列入盤面的角色清單',
  npcHint:
    '不想讓 PL 看到敵人的 HP 時用。每個棋子要不同時在修改欄改（表格也可以用「放到盤面」「棋子大小」「狀態不公開」欄）。',
  commonCommands: '共用的聊天面板',
  commonHint: '接在每個棋子的聊天面板最後。寫 {閃避} 時 CCFOLIA 會換成那個棋子的同名參數的值。',
  commonPlaceholder: 'CCB<={閃避} 閃避\n1d100 骰子',
  faceCommands: '聊天面板最後加上差分的「@差分名」',
  faceCommandsHint:
    '在 CCFOLIA 發言時加上「@差分名」就會換成那個差分（同本站「角色差分管理器」的聊天面板）。',

  /* ---- 清單 ---- */
  listTitle: (n: number) => `棋子清單（${n}）`,
  confirm: '確定，換下一位 NPC',
  confirmHint:
    '從劇本一個一個貼時，確認讀對了再按「確定，換下一位 NPC」：目前的棋子留在清單裡、輸入欄清空，可以貼下一個（按錯了可以復原）。',
  summaryKept: (kept: number, live: number) => `已確定 ${kept} 個＋輸入中 ${live} 個／`,
  summaryImages: (withImage: number, without: number) =>
    `有立繪 ${withImage} 個、沒有 ${without} 個`,
  edited:
    '清單正在手動修改，輸入欄暫時不能改。要接著輸入請按「確定，換下一位 NPC」（修改會留下）；要放棄修改請按「從輸入重做」。',
  rebuild: '從輸入重做',
  rebuildTitle: '丟掉手動修改，從輸入重做清單？',
  rebuildKeptTitle: '丟掉最後一次確定之後的手動修改，從輸入重做清單？（已確定的棋子不變）',
  rebuildConfirm: '重做',
  rebuilt: '已從輸入重做清單。',
  emptyMemo: '在上面寫 NPC，這裡會一個一個列出來。',
  emptyTable: '在上面貼上表格，這裡會一個一個列出來。',
  tableLabel: '棋子清單',
  colLine: '行',
  colImage: '立繪',
  colName: '名稱',
  colStatus: '狀態',
  colPalette: '聊天面板',
  paletteLines: (n: number) => `${n} 行`,
  noNameRow: '（沒有名稱）',
  badgeNoName: '沒有名稱',
  badgeFaces: (n: number) => `差分 ${n}`,
  badgeBoard: '盤面',
  markKept: '已確定',
  markPasted: '貼上的',
  markHand: '手動加的',
  addPiece: '加一個棋子',
  confirmed: (added: number, total: number) =>
    added > 0
      ? `已確定（加了 ${added} 個，共 ${total} 個）。輸入欄已清空，可以接著輸入下一位 NPC。`
      : `已確定（共 ${total} 個）。輸入欄已清空，可以接著輸入下一位 NPC。`,

  /* ---- 預覽 ---- */
  previewTitle: 'CCFOLIA 上大概的樣子',
  previewEmpty: '在清單選一個棋子，這裡會顯示樣子。',
  previewAria: (name: string) => `「${name}」在 CCFOLIA 上大概的樣子`,
  previewInitiative: '先攻值',
  noImage: '沒有圖',
  notOnBoard: '不放到盤面（可以從角色清單放上去）',
  notListed: '不列入盤面的角色清單',
  secretNote: '其他人看不到狀態',
  invisibleNote: '發言時不顯示立繪',
  pieceSize: (n: number) => `棋子大小 ${n}`,
  pieceAlt: (name: string) => `${name}的棋子`,
  detailParams: '參數',
  detailFaces: '差分',
  detailPalette: '聊天面板（含共用的）',
  sourceTitle: '這個棋子的原文與讀到的內容',
  sourceAria: '原文的每一行讀成了什麼',

  /* ---- 修改 ---- */
  editorTitle: '修改選取的棋子（把圖片拖到這裡就是這個棋子的立繪）',
  edName: '名稱',
  edInitiative: '先攻值',
  edSize: '棋子大小（空白＝照全體設定）',
  edBoard: '盤面',
  edBoardOptions: (global: boolean) => ({
    inherit: `照全體設定（${global ? '放到盤面' : '只放進角色清單'}）`,
    on: '放到盤面',
    off: '只放進角色清單',
  }),
  edColor: '名稱的顏色',
  edUrl: '參照網址',
  edUrlPlaceholder: '角色卡的網址等',
  edPortrait: '立繪',
  edPortraitAuto: '自動（和棋子同名的圖）',
  edPortraitNone: '沒有圖',
  edPortraitUsing: (name: string) => `使用圖片庫的「${name}」`,
  edPortraitHint: (name: string) => `圖片庫放一張名稱是「${name}」的圖，就會自動當立繪`,
  edPortraitBig: (name: string, size: string) =>
    `「${name}」${size}；超過 5 MB 的圖 CCFOLIA 可能讀不進去`,
  edPortraitMissing: (name: string) => `找不到「${name}」的內容，請在圖片庫重新放進去`,
  pieceNameFallback: '棋子的名稱',
  addImage: '加圖片',
  addImageFor: (label: string) => `${label}：從檔案加圖片`,
  edFaces: '差分',
  edAutoFaces: (name: string) => `圖片庫裡「${name}_笑」這種名稱的圖自動當差分`,
  edFaceAuto: (face: string, image: string) => `${face}（自動：圖片庫的「${image}」）`,
  edFaceLabel: '差分名稱',
  edFaceLabelPlaceholder: '差分名稱（例：笑）',
  edFaceImage: (face: string) => `差分「${face}」的圖片`,
  edFaceRemove: (face: string) => `刪除差分「${face}」`,
  edFaceNoImage: '沒有圖的差分不會匯出',
  edAddFace: '加差分',
  edStatus: '狀態',
  edParams: '參數',
  edLabel: '標籤',
  edValue: '值',
  edCurrent: '目前值',
  edMax: '最大值',
  edStatusPlaceholder: '標籤（HP）',
  edParamPlaceholder: '標籤（DEX）',
  edRowUp: (title: string, n: number) => `${title}第 ${n} 列往上移`,
  edRowRemove: (title: string, n: number) => `刪除${title}第 ${n} 列`,
  edRowCell: (title: string, n: number, cell: string) => `${title}第 ${n} 列：${cell}`,
  edAddStatus: '加狀態',
  edAddParam: '加參數',
  edCommands: '聊天面板（一行一個）',
  edMemo: '備註',
  edSecret: '狀態不公開',
  edInvisible: '發言時不顯示立繪',
  edHideStatus: '不列入盤面的角色清單',
  edUp: '往上移',
  edDown: '往下移',
  edCopy: '複製一個',
  edDelete: '刪除這個棋子',
  edClipboard: '複製 CCFOLIA 角色資料',
  edClipboardHint:
    '在 CCFOLIA 的房間按 Ctrl＋V 貼上就會新增這個棋子（剪貼簿帶不了圖片，立繪與差分要用房間 ZIP）。',
  copied: '已複製到剪貼簿',
  copiedHint: '在 CCFOLIA 的房間畫面按 Ctrl＋V 貼上。沒有立繪與差分。',
  copyFailed: '無法寫入剪貼簿',

  /* ---- 匯出 ---- */
  exportTitle: '匯出',
  exportRoom: '匯出房間 ZIP',
  exportAssets: '匯出素材 ZIP',
  exportSummary: (n: number, board: number) =>
    `把 ${n} 個棋子匯出成一個 ZIP（放到盤面 ${board} 個、只放進角色清單 ${n - board} 個）。`,
  exportNone: '還沒有可以匯出的棋子。',
  exportTooMany: (n: number, max: number) =>
    `一個 ZIP 最多 ${max} 個棋子（目前 ${n} 個）。請分成幾次匯出。`,
  exporting: '正在做 ZIP…',
  exportDone: (n: number, faces: number, images: number) =>
    `已匯出（棋子 ${n} 個、差分 ${faces} 個、圖片 ${images} 張）。請在 CCFOLIA 的房間設定讀入。`,
  exportBig: (n: number) => `有 ${n} 張圖超過 5 MB，CCFOLIA 可能讀不進去。`,
  exportNoName: (n: number) => `有 ${n} 個棋子沒有名稱。`,
  exportMissing: (name: string) =>
    `找不到圖片「${name}」的內容。請在圖片庫重新放進去，或換掉用到它的地方的圖。`,
  exportCheckFailed: 'ZIP 的自我檢查沒有通過，沒有下載。請把這個情形回報給維護者。',
  exportFailed: (msg: string) => `做不出 ZIP：${msg}`,
  assetsHelp:
    '用房間資料讀入的圖片不會出現在 CCFOLIA 的「自分の画像の一覧」裡。之後要重選立繪、在別的房間用時，請一起匯出素材，解開後把圖片拖到 CCFOLIA 選圖片的畫面（以棋子的名稱命名：「立繪/艾莉絲.png」「差分/艾莉絲_笑.png」）。',
  assetsNone: '沒有可以匯出的圖片。',
  assetsDone: (n: number) =>
    `已匯出素材（圖片 ${n} 張，依棋子的名稱放在「立繪」「差分」「其他」資料夾）。解開後拖到 CCFOLIA 選圖片的畫面，就會進「自分の画像の一覧」。`,
  assetsFailed: (msg: string) => `做不出素材 ZIP：${msg}`,
  importTitle: '在 CCFOLIA 讀入的方法',
  importSteps: [
    '以 GM（房主、副房主）的身分進房間；訪客登入不能讀入。',
    '左上的房間名稱 →「ルーム設定」→「ルームデータ」→「ルームデータのインポート」的「インポート」，選匯出的 ZIP（也可以把 ZIP 拖到盤面上）。',
    '會出現「外部ツールで作成および編集されたデータです。信頼できるデータのみ取り込むようにしてください。」的確認：確定是這裡做的就按 OK（這個工具做的資料一定會出現這個確認）。',
    '棋子依清單的順序排進讀入的人的「キャラクター一覧」；設成「放到盤面」的棋子在盤面上橫向排開。',
  ],
  importNotesTitle: '請注意',
  importNotes: [
    '讀入只會新增棋子，原本的棋子、盤面、劇本文字都不變；同一個 ZIP 讀兩次也不會多一份（同一批棋子被覆寫）。不要的棋子從角色清單刪除。',
    '棋子的擁有者是讀入的人。要給 PL 用時，請 PL 自己重做，或複製棋子給 PL。',
    '立繪與差分要用圖片檔：CCFOLIA 的棋子不收別的網站的圖片網址。',
    '一個 ZIP 最多 500 個棋子；圖片每張 5 MB 以內。',
    '圖片庫的圖只存在這個瀏覽器（清除網站資料就會不見）；重要的請存成專案檔。',
    '讀入時圖片會上傳到 CCFOLIA（和房間資料的圖片在同一個共用的地方）。用別人畫的立繪，請在畫師允許的範圍內使用。',
    '請在自己建立的房間使用：購買的劇本（CCFOLIA GAMES 等）的房間資料禁止改寫；這個工具也不會讀入、改寫房間資料。',
    '非官方工具；CCFOLIA 改版後可能讀不進去（原作 2026-10-30 以 CCFOLIA 1.37.6 確認過）。',
    '劇本文字也要一次做好時，可以用本站的「劇本文字產生器」。',
  ],

  /* ---- 專案檔 ---- */
  resetLabel: '重來…',
  resetTitle: '清掉目前的輸入與清單，重來？',
  resetDescription: '圖片庫與改過的標籤讀法會留著（可以復原）。',
  resetConfirm: '重來',
  resetDone: '已重來。',
  saved: (name: string) => `已存成專案檔「${name}」（含圖片庫的圖片）`,
  opened: (name: string) => `已開啟專案檔「${name}」`,
  openedLegacy: (name: string, n: number) =>
    `已開啟原作的專案檔「${name}」${n ? `，${n} 張圖片放進圖片庫` : ''}`,
  openFailed: (msg: string) => `無法開啟專案檔：${msg}`,
  notProject: '這不是這個工具（或原作）的專案檔。',
  projectNotSaved:
    '瀏覽器的空間不足（或無法使用），專案檔的圖片只在這次開啟時有效；重新整理後要再開一次專案檔。',

  /* ---- 說明 ---- */
  usageIntro:
    '把劇本的 NPC 寫成幾行速記（或直接貼上劇本的 NPC 資料、試算表、角色卡網站的 CCFOLIA 輸出），一次做出一批 CCFOLIA 的棋子：狀態、參數、聊天面板、立繪與表情差分都帶進去，匯出成房間 ZIP，在 CCFOLIA 讀入就會出現。「×3」可以一次做好幾個同樣的敵人。全部在瀏覽器裡處理，輸入的內容與圖片不會上傳到任何地方。',
  usageSteps: [
    '在「輸入」分頁寫 NPC（或貼上劇本的資料、試算表）。',
    '在「圖片庫」放立繪與差分：圖片名稱和棋子同名就是立繪，「名稱_笑」是差分。',
    '在右邊的清單確認讀到的內容，需要時修改；從劇本一個一個貼時，每個確認好就按「確定，換下一位 NPC」。',
    '「匯出房間 ZIP」，在 CCFOLIA 的房間設定讀入。',
  ],
  unofficial:
    '本工具是玩家自製的非官方工具，和 CCFOLIA 沒有關係；《克蘇魯的呼喚》（Call of Cthulhu）是 Chaosium Inc. 的註冊商標。',
} as const;
