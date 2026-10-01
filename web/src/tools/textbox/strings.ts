/** 文字方框產生器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */
export const S = {
  sectionContent: '內容',
  sectionLayout: '排版',

  mode: '模式',
  modeBox: '方框',
  modeTable: '表格',

  title: '標題',
  titleHint: '選填。有標題時會用一條橫線和內文隔開。',
  titlePlaceholder: '例如：線索——舊港倉庫',
  body: '內文',
  bodyHint: '換行會保留；超過寬度會自動換行。',
  bodyPlaceholder: '在這裡輸入要框起來的文字。',
  table: '表格資料',
  tableHint: '一行一列，欄與欄用半形「|」分隔；整行只有 - = _ ─ 的列會變成橫線。',
  tablePlaceholder: '角色 | 職業\n調查員甲 | 記者\n---\n調查員乙 | 醫生',

  calibration: '寬度校準',
  calibrationHint:
    '決定每種字元的估計寬度。貼到 CCFOLIA 用「CCFOLIA 校準」；等寬字型用「等寬 1:2」。',
  calibrationCcfolia: 'CCFOLIA 校準',
  calibrationMono: '等寬 1:2',
  calibrationCustom: '自訂比例',
  customWide: '寬字寬度',
  customBorder: '框線寬度',
  customHint: '以半形字的寬度＝1。空白、0 或不是有效的數字時，寬字以 2、框線以 1 計算。',

  line: '框線',
  lineSingle: '單線 ┌─┐',
  lineDouble: '雙線 ╔═╗',
  pad: '補白方式',
  padHint: '把每一行補到同樣寬度時用的空白。',
  padFull: '全形空白為主',
  padHalf: '只用半形空白',
  sides: '側邊框線',
  sidesHint: '開：四邊都有框線。關：只有上下與分隔處的橫線。',

  boxWidth: '方框寬度上限',
  boxWidthHint: '以框線字元的個數計（微調 10～100）。方框會隨內容縮放，但不超過這個寬度。',
  tableWidth: '表格寬度上限',
  tableWidthHint:
    '以框線字元的個數計，不含左右外框（微調 10～150）。超過時從最寬的欄開始縮窄，格內換行。',
  header: '首列當表頭',
  headerHint: '在第一列下面自動加一條橫線。',
  unitChars: '格',
  stepUp: (label: string) => `${label}：增加`,
  stepDown: (label: string) => `${label}：減少`,

  output: '輸出',
  outputHint:
    '預覽用接近 CCFOLIA 聊天欄的字型（Roboto 14 px）。畫面太窄時只是顯示折行，複製的內容不受影響。',
  copy: '複製',
  copied: '已複製到剪貼簿',
  copyFailed: '無法寫入剪貼簿',
  copyFailedHint: '輸出已全選，請按 Ctrl＋C（Mac 為 ⌘＋C）手動複製。',
  lines: (n: number) => `共 ${n} 行`,

  usageIntro:
    '把文字排成用框線圍起來的方框或表格。貼到 CCFOLIA 等線上跑團的聊天欄送出後，在聊天欄的字型下仍然左右對齊。',
  usageSteps: [
    '選「方框」或「表格」，輸入內容；輸出會隨著輸入立刻更新。',
    '依要貼上的地方選寬度校準：CCFOLIA 的聊天欄用「CCFOLIA 校準」，等寬字型的地方用「等寬 1:2」。',
    '調整框線、補白方式、側邊框線與寬度上限，滿意後按「複製」，貼到聊天欄送出。',
  ],
  usageNotes: [
    '對齊靠的是估計的字寬；不同字型、瀏覽器或縮放比例下可能差一點點。差太多時可以改用「自訂比例」微調寬字與框線的寬度。',
    '表格：一行一列，欄與欄用半形「|」分隔；整行只有 - = _ ─ 的列會變成橫線。',
    '寬度上限可以直接打超出微調範圍的數字；空白、0 或不是有效的數字時，方框以 24、表格以 30 計算。',
    '輸入與設定都不會保存，重新整理後回到預設。',
  ],
  usageNotesTitle: '注意事項',
} as const;
