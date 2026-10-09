/** 文字軌跡產生器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */
import type { FillKind, Shape } from './logic';

export const S = {
  /** 開頁的範例文字（約 30 字，開頁按「產生」就能看到圓形的效果） */
  sampleText: '深夜的圖書館裡，書頁自己翻動，燭火繞著桌子轉了一圈又一圈。',

  sectionText: '文字',
  text: '要排列的文字',
  textHint: '空白與換行會被拿掉，剩下的字依序沿著軌跡排列。改了文字要再按「產生」。',
  textPlaceholder: '在這裡輸入文字',
  charCount: (n: number) => `${n} 字（不含空白）`,

  sectionLayout: '排列',
  cols: '欄數',
  colsHint: '結果最多幾格寬；列數依繪製區的長寬比自動決定。改了要再按「產生」。',
  colsValue: (n: number) => `${n} 欄`,
  spacing: '間距倍數',
  spacingHint:
    '按「依字數縮放」時字與字的距離（以格子為單位）。已經有結果時，拖動會立刻縮放軌跡並重新產生。',
  /** 由密到疏五級（索引＝logic.spacingLevel 的值） */
  spacingLevels: ['很密', '偏密', '適中', '偏疏', '很疏'],
  spacingValue: (label: string, v: number) => `${label}（${v.toFixed(1)}）`,
  fill: '填空字元',
  fillHint: '空格子要放的字元。已經有結果時，換了會立刻重新產生。',
  fillLabels: {
    ideographic: '全形空白',
    space: '半形空白',
    middot: '韓文中點 ㆍ',
  } as Record<FillKind, string>,
  lineHead: '行首空白替換',
  lineHeadHint:
    '把每一行開頭的第一個填空字元換成看不見的點字空白（U+2800），貼到社群平台時行首的空白就不會被吃掉。',

  shape: '形狀',
  shapeLabels: {
    circle: '圓',
    spiral: '螺旋',
    heart: '愛心',
    free: '自由繪製',
  } as Record<Shape, string>,
  pad: '繪製區',
  padHint: '請在這裡畫線（按住滑鼠拖曳，或用手指滑動）',
  padNote: '紅點是起點，字會從這裡開始沿著線排列。在繪製區畫線會自動切到「自由繪製」。',

  generate: '產生',
  fit: '依字數縮放',
  fitTip: '依字數與間距倍數把軌跡等比放大或縮小',
  reverse: '起訖對調',
  reverseTip: '把軌跡的起點與終點對調',
  clear: '清除',
  clearTip: '清掉軌跡與結果，改成自由繪製',

  output: '結果',
  outputCount: (n: number) => `${n} 字`,
  outputHint: '等寬顯示、不折行，太寬時可以左右捲動。按「複製」後直接貼到聊天室或社群平台。',
  outputPlaceholder: '按「產生」後，結果會出現在這裡。',
  copy: '複製',

  messages: {
    /** 按「產生」或自動重產時沒有文字（用詞照規格 7.1 的 F29 裁定） */
    noText: '請輸入要排列的文字。',
    noPath: '還沒有軌跡：請選一個形狀，或在繪製區畫一條線',
    reverseNoPath: '還沒有軌跡，沒有起點與終點可以對調',
    fewChars: '至少要有 2 個字才能依字數縮放',
    fitNoPath: '還沒有軌跡可以縮放',
    fitted: '已依字數縮放軌跡',
    copied: '已複製到剪貼簿',
    copyFailed: '無法寫入剪貼簿',
    copyFailedHint: '結果已全選，請按 Ctrl＋C（Mac 為 ⌘＋C）手動複製。',
    copyEmpty: '還沒有結果可以複製，請先按「產生」',
  },

  usageIntro:
    '把一段文字沿著圓、螺旋、愛心或自己畫的線排成文字圖案，輸出成可以直接貼到聊天室或社群平台的純文字。',
  usageSteps: [
    '輸入文字（空白與換行會被拿掉）。',
    '選一個形狀，或在繪製區用滑鼠、手指畫一條線；紅點是起點。',
    '按「產生」，結果會出現在下方，字也會疊在繪製區上方便對照。',
    '字擠在一起或太散時，調整間距倍數後按「依字數縮放」；想讓字倒過來走就按「起訖對調」。',
    '按「複製」，貼到要用的地方。',
  ],
  usageNotesTitle: '注意事項',
  usageNotes: [
    '改文字、欄數、形狀或畫線後都要再按「產生」；間距倍數、填空字元、行首空白替換在已經有結果時會自動重新產生。',
    '結果用等寬排列；貼到的地方若不是等寬字型或會吃掉空白，形狀可能會走樣，可以試試別的填空字元或開啟行首空白替換。',
    '繪製區固定以 634 × 300 計算，不同螢幕寬度會得到一樣的結果。',
    '設定不會儲存，重新整理後回到預設。',
  ],
} as const;
