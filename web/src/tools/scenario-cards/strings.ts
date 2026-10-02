/**
 * 劇本資訊卡片產生器的介面文字（本站自寫，用詞照 DESIGN.md 第 5 節）。
 * 類型名稱、記號、標題欄前後綴是複製文字的一部分，放在 logic.ts 的 TYPE_INFO。
 */
import type { CardType } from './logic';

export const S = {
  /* ---- 左欄：劇本內文 ---- */
  sourceTitle: '劇本內文',
  openTxt: '開啟 TXT 檔',
  clearText: '清除內文',
  sourceLabel: '劇本內文',
  sourcePlaceholder:
    '把劇本全文貼在這裡，或按「開啟 TXT 檔」讀入。\n選取一段文字，就能做成一張資訊卡片：第一行當標題，其餘當內文。',

  searchLabel: '搜尋內文',
  searchPlaceholder: '搜尋內文（Enter 下一個、Shift＋Enter 上一個）',
  searchButton: '搜尋',
  searchPrev: '上一個符合處',
  searchNext: '下一個符合處',
  searchCount: '搜尋結果的位置',

  selectionType: '選取建卡的類型',
  createFromSelection: '用選取的內容建立卡片',
  selectionHint: '在內文選取一段後，按 C 也能建立卡片（第一行當標題）。',

  /* ---- 右欄：資訊卡片 ---- */
  cardsTitle: '資訊卡片',
  cardCount: (all: number, shown: number) =>
    all === shown ? `共 ${all} 張` : `共 ${all} 張，顯示 ${shown} 張`,
  newType: '新增卡片的類型',
  addCard: '新增卡片',

  projectTitle: '專案（存在這個瀏覽器）',
  projectName: '專案名稱',
  projectNamePlaceholder: '例：霧港的燈塔',
  savedList: '已存的專案',
  savedPlaceholder: '選擇已存的專案…',
  savedEmpty: '還沒有存在瀏覽器裡的專案',
  saveToBrowser: '存到瀏覽器',
  loadByName: '讀取',
  deleteSaved: '刪除',
  deleteSavedLabel: '刪除選取的已存專案',

  filterLabel: '依類型篩選',
  filterAll: '全部',
  listLabel: '資訊卡片清單',
  listEmpty: '還沒有卡片。在左邊選取一段內文建立，或按上面的「新增卡片」。',
  listFilteredEmpty: '這個類型還沒有卡片。',
  scrollUp: '往上捲動卡片清單',
  scrollDown: '往下捲動卡片清單',

  /* ---- 卡片 ---- */
  dragHandle: (title: string) => `調整「${title}」的順序（拖曳，或按 ↑／↓）`,
  dragHint: '拖曳調整順序；聚焦時按 ↑／↓ 移動一格',
  copy: '複製',
  copyTitle: '複製成貼進 CCFOLIA 聊天欄的文字',
  typeGroup: '卡片類型',
  duplicate: '建立副本',
  remove: '刪除',
  titleLabel: (header: string) => `${header}的標題`,
  extraLabel: '成功後揭露的標題',
  extraPlaceholder: '成功後揭露的標題',
  bodyLabel: '內文',
  bodyPlaceholder: '內文（複製時接在標題下方，中間空一行）',
  untitled: '（未命名）',
  titlePlaceholders: {
    scene: '場景名稱',
    location: '地點名稱',
    document: '資料名稱',
    npc: 'NPC 名稱或資訊標題',
    skill: '技能名稱',
    memo: '備忘標題',
    item: '道具名稱',
    rule: '規則名稱',
    ho1: '秘匿的標題',
    ho2: '秘匿的標題',
    ho3: '秘匿的標題',
    ho4: '秘匿的標題',
  } satisfies Record<CardType, string>,

  /* ---- 頁首 ---- */
  undo: '復原',
  redo: '重做',
  undoAction: '復原',

  /* ---- 專案選單（頁首） ---- */
  resetLabel: '清空全部…',
  resetTitle: '清空內文與所有卡片？',
  resetDescription:
    '內文、所有卡片與專案名稱都會清空（可以用「復原」回來）。存在瀏覽器裡的專案不受影響。',
  resetConfirm: '清空',

  /* ---- 刪除已存的專案 ---- */
  deleteSavedTitle: (name: string) => `從瀏覽器刪除「${name}」？`,
  deleteSavedDescription:
    '只刪除存在這個瀏覽器裡的這份專案，目前畫面上的內容不受影響。刪除後無法復原。',
  deleteSavedConfirm: '刪除',

  /* ---- 快捷鍵 ---- */
  keyGroupType: '類型',
  keyGroupEdit: '編輯',
  keyGroupSearch: '搜尋',
  keyType: (marker: string, label: string) => `選類型：${marker} ${label}`,
  keyTypeNext: '下一個類型',
  keyTypePrev: '上一個類型',
  keyFromSelection: '用選取的內容建立卡片（焦點在內文區、有選取時）',
  keySearchNext: '下一個符合處（在搜尋欄）',
  keySearchPrev: '上一個符合處（在搜尋欄）',
  keyUndo: '復原',
  keyRedo: '重做',

  /* ---- 狀態訊息 ---- */
  status: {
    txtLoaded: (name: string) => `已讀入「${name}」。`,
    txtLoadedBig5: (name: string) => `已讀入「${name}」（以 Big5 編碼解讀）。`,
    txtLoadedLossy: (name: string) =>
      `已讀入「${name}」，但有些字無法辨識（檔案可能不是 UTF-8 或 Big5 編碼）。`,
    txtFailed: (name: string) => `無法讀取「${name}」。`,
    textCleared: '已清除內文。',
    needQuery: '請先輸入要搜尋的文字。',
    notFound: (q: string) => `找不到「${q}」。`,
    needSelection: '請先在內文選取一段文字。',
    emptySelection: '選取的內容只有空白，沒有建立卡片。',
    cardCreated: (type: string) => `已新增卡片：${type}。`,
    cardCreatedUnfiltered: (type: string) =>
      `已新增卡片：${type}；篩選已切回「全部」，新卡片才看得到。`,
    typeSelected: (target: 'new' | 'selection', type: string) =>
      `${target === 'new' ? '新增卡片的類型' : '選取建卡的類型'}：${type}`,
    typeChanged: (type: string) => `已換成 ${type}。`,
    copied: '已複製卡片文字，可以貼到 CCFOLIA 的聊天欄。',
    copyFailed: '無法複製到剪貼簿，請改用手動選取後複製。',
    duplicated: '已建立副本（加在清單最後）。',
    deleted: (title: string) => `已刪除「${title}」。`,
    reordered: '已調整卡片順序。',
    needName: '請先輸入專案名稱。',
    saved: (name: string) => `已存到瀏覽器：${name}`,
    saveFailed: '存不進瀏覽器（空間可能不足，或瀏覽器不允許儲存）。',
    needLoadName: '請輸入要讀取的專案名稱。',
    projectNotFound: (name: string) => `瀏覽器裡沒有「${name}」這個專案。`,
    loaded: (name: string) => `已讀取專案：${name}`,
    loadFailed: (name: string) => `「${name}」的資料已損壞，無法讀取。`,
    savedDeleted: (name: string) => `已從瀏覽器刪除「${name}」。`,
    exported: (file: string) => `已匯出專案檔：${file}`,
    imported: (file: string) => `已讀入專案檔：${file}`,
    importFailed: (message: string) => `無法讀入專案檔：${message}`,
    notProject: '檔案裡沒有劇本資訊卡片的資料。',
    reset: '已清空內文與所有卡片。',
    autosaveFailed: '自動存檔失敗（瀏覽器空間可能不足），請匯出專案檔備份。',
  },

  /* ---- 說明 ---- */
  usageIntro:
    '帶團前整理劇本用：把劇本全文放在左邊，選取需要的段落做成「資訊卡片」，再一鍵複製成貼進 CCFOLIA 聊天欄的固定格式文字。全部在瀏覽器裡完成，不會上傳到任何伺服器。',
  usageSteps: [
    '按「開啟 TXT 檔」讀入劇本（UTF-8 或 Big5），或直接貼上。讀入時會統一換行、把連續的空行縮成一行、去掉頭尾空白。',
    '選卡片類型，在內文選取一段後按「用選取的內容建立卡片」（或按 C）：第一行當標題、其餘當內文；技能成功類型的第一行會放進「成功後揭露的標題」。',
    '在右邊修改標題與內文，按「複製」就能貼到 CCFOLIA。拖曳卡片左上的把手可以調整順序，上方的按鈕可以依類型篩選。',
    '專案名稱填好後按「存到瀏覽器」，下次從「已存的專案」選回來；也可以從頁首「專案」選單匯出成專案檔備份或帶到別台電腦。',
  ],
  usageNotesTitle: '小提示',
  usageNotes: [
    'Alt（Mac 是 Option）＋1～9、0、-、= 依序切換 12 種類型；Alt＋↑／↓ 換上一個／下一個類型。焦點在右邊的卡片區時改的是「新增卡片的類型」，其他地方改的是「選取建卡的類型」。',
    '標題空白時，複製文字會用類型名稱當標題。',
    '所有內容自動存在這個瀏覽器裡；刪除卡片、清除內文、讀取專案之後都可以用頁首的「復原」（Ctrl＋Z）回來。',
  ],
  disclaimer:
    '本工具是非官方的輔助工具，與 CCFOLIA 及各規則書、劇本的權利人無關；規則書、劇本與其他服務的授權與使用條件，請自行確認。',
} as const;
