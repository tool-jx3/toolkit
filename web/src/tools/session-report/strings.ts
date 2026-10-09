/**
 * 團報產生器的介面文字（全部自寫；用詞照 DESIGN.md 第 5 節）。
 * 寫進團報的文字（範本的裝飾、範例值、作者行的字樣）在 templates.ts、report.ts、model.ts。
 */
import type { SlotBase } from './model';

export const S = {
  disclaimer:
    '本工具為玩家自製的非官方工具。各 TRPG 系統、劇本與外部服務的規則與授權，請以各自的公告與條款為準。',

  usage: {
    intro:
      '跑完團後，把系統、劇本、主持人與參加者填一填，選一種版面，就能得到一篇可以直接貼到 X 的團報。',
    steps: [
      '在「範本與文字樣式」選喜歡的團報版面；文字樣式會把系統、身分、HO、結果、日期裡的英數字換成粗體、斜體等花式字。',
      '填系統、劇本、作者、結果，以及主持人與參加者；沒填的欄位會先放範例值，方便看版面。',
      '預覽可以直接修改；之後再改左邊的輸入，手動改過的地方會保留。「重新產生」會捨棄手動修改。',
      '需要分隔線或符號時，先在預覽點好位置，再按「文字裝飾」裡的按鈕插入；想用括號包住一段字，先在預覽選好那段字，再按「括號」裡的按鈕。',
      '完成後按「複製」，或按「貼到 X」直接開啟發文畫面。',
    ],
    notesTitle: '小提醒',
    notes: [
      '在跑團紀錄簿按「送到團報產生器」，開啟本頁時會詢問要不要讀入那一團。',
      '輸入與預覽會自動存在這個瀏覽器裡；「清除輸入」會全部回到預設。',
      '字數是簡易計算，網址、表情符號等可能和 X 實際的計算不同。',
    ],
  },

  header: {
    resetAll: '清除輸入',
    resetTitle: '清除所有輸入？',
    resetDescription: '範本、文字樣式、劇本、主持人、參加者與預覽都會回到預設，無法復原。',
    resetConfirm: '清除',
  },

  sections: {
    template: '範本與文字樣式',
    scenario: '劇本',
    gms: '主持人',
    players: '參加者',
    misc: '日期、標籤與備註',
    deco: '文字裝飾',
  },

  template: {
    label: '團報範本',
    hint: '17 種版面，資料一樣、裝飾與排列不同。',
  },
  fontStyle: {
    label: '文字樣式',
    hint: '只轉換系統、身分、PC／PL 標題、標記、HO、結果、日期裡的英數字。',
  },

  system: {
    label: '系統',
    custom: '自行輸入',
    customLabel: '系統名稱',
    customPlaceholder: '輸入系統名稱',
  },
  author: {
    label: '作者',
    placeholder: '例：王小明',
    hint: '會寫成「作者：〇〇老師」，放在劇本下一行。',
  },
  scenario: { label: '劇本名稱', placeholder: '例：霧港燈塔的最後一盞燈' },
  result: { label: '結果', placeholder: '例：END 2　全員生還' },

  honorific: {
    label: '敬稱',
    hint: '加在主持人與 PL 的名字後面（PC 不加）。',
    none: '不加',
    sama: '〇〇樣',
    san: '〇〇桑',
  },
  gm: {
    listLabel: '主持人清單',
    role: (n: number) => `主持人 ${n} 的身分`,
    name: (n: number) => `主持人 ${n} 的名字`,
    namePlaceholder: '例：阿德',
    remove: (n: number) => `刪除主持人 ${n}`,
    add: '新增主持人',
    empty: '沒有主持人時，團報會寫一位範例主持人。',
    hint: 'KPC 團想寫成「KPC 名字／KP 名字」，直接填在名字欄即可。',
  },

  nameOrder: {
    label: '名字的輸入順序',
    pcpl: 'PC → PL',
    plpc: 'PL → PC',
    hint: '第一位的標記不是 PC/PL、PL/PC 時，也決定團報裡名字的先後。',
  },
  player: {
    listLabel: '參加者清單',
    slot: (n: number) => `參加者 ${n} 的標記`,
    slotFixed: (n: number, slot: string) => `參加者 ${n} 的標記：${slot}`,
    ho: (n: number) => `參加者 ${n} 的 HO 補充`,
    hoPlaceholder: 'HO 補充（通常不用填）',
    pc: (n: number) => `參加者 ${n} 的 PC 名字`,
    pcPlaceholder: 'PC 名字',
    pl: (n: number) => `參加者 ${n} 的 PL 名字`,
    plPlaceholder: 'PL 名字',
    remove: (n: number) => `刪除參加者 ${n}`,
    add: '新增參加者',
    empty: '沒有參加者時，團報會寫一位範例參加者。',
    hint: '只有第一位的標記可以選，之後的人自動編號。',
  },
  slotOptions: {
    PC: { label: 'PC', description: '每個人都寫「PC」' },
    PC1: { label: 'PC1', description: '依序寫 PC1、PC2…' },
    HO1: { label: 'HO1', description: '依序寫 HO1、HO2…' },
    'PC/PL': { label: 'PC/PL', description: '不寫標記，標題寫 PC/PL（PC 在前）' },
    'PL/PC': { label: 'PL/PC', description: '不寫標記，標題寫 PL/PC（PL 在前）' },
    自由: { label: '自由', description: '不寫標記，名字順序照輸入順序' },
  } satisfies Record<SlotBase, { label: string; description: string }>,

  date: { label: '日期', hint: '空白時寫今天的日期。' },
  hashtags: { label: '主題標籤', placeholder: '例：#團報 #CoC' },
  memo: {
    label: '備註',
    placeholder: '跑團紀錄簿送來的備註會放在這裡，不會寫進團報。',
  },

  deco: {
    hint: '先在預覽點好位置（或選好文字），再按一下。',
    tabsLabel: '文字裝飾的類型',
    groups: { lines: '分隔線', brackets: '括號', symbols: '單一符號', accents: '點綴' },
    modeHints: {
      lines: '分隔線會自成一行插入，不會黏在前後的字上。',
      brackets: '在預覽選好一段文字再按，就在前後加上括號；沒有選取時插入一對括號，游標放在中間。',
      symbols: '插入在游標位置（會取代選取的文字）。',
      accents: '插入在游標位置（會取代選取的文字）。',
    },
    wrapTitle: (open: string, close: string) => `用 ${open.trim()}…${close.trim()} 包住選取的文字`,
  },

  preview: {
    title: '團報預覽',
    label: '團報內容',
    placeholder: '團報會出現在這裡，也可以直接修改。',
    styleBar: '文字樣式快速切換',
    copy: '複製',
    post: '貼到 X',
    undo: '復原',
    redo: '重做',
    regenerate: '重新產生',
    regenerateTitle: '捨棄手動修改，依目前的輸入重新產生',
    clear: '清除預覽',
    dirty: '已手動修改：改輸入時會保留你改的部分。',
    hint: '字數是簡易計算：網址、表情符號等可能和 X 實際的計算不同。',
    copied: '已複製團報',
    postEmpty: '沒有可以發文的團報',
  },

  pending: {
    title: '讀入跑團紀錄簿送來的這一團？',
    description:
      '會把劇本、日期、系統、主持人、參加者、主題標籤與備註填進表單（取代目前填的內容）；填入後仍可修改。',
    load: '讀入',
    discard: '捨棄',
    later: '稍後再說',
    loaded: '已讀入跑團紀錄簿送來的資料',
    brokenTitle: '跑團紀錄簿送來的資料無法讀取',
    brokenDescription: '資料可能已經損壞。要從瀏覽器刪除嗎？',
    brokenConfirm: '刪除',
    brokenCancel: '保留',
  },

  keys: {
    groupOutput: '輸出',
    groupPreview: '預覽',
    groupSwitch: '切換',
    copy: '複製預覽',
    post: '貼到 X',
    undo: '復原預覽的修改',
    redo: '重做',
    focus: '把游標移到預覽最後',
    templatePrev: '上一個範本',
    templateNext: '下一個範本',
    stylePrev: '上一個文字樣式',
    styleNext: '下一個文字樣式',
    regenerate: '捨棄手動修改，重新產生預覽',
  },
} as const;
