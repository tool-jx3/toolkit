/** 填字遊戲產生器的介面文字 */
import type { FontRole, SheetLayout, SourceMode } from './model';

export type Version = 'question' | 'answer';

export const S = {
  undo: '復原',
  redo: '重做',

  usage: {
    intro:
      '把一組答案與提示（或一段劇本、跑團日誌）排成填字遊戲，當作劇本的謎題講義；題目版與解答版都能下載成圖片、網頁檔或直接列印。',
    steps: [
      '「自己列答案」：一行一個「答案：提示」，例如「地下室：日記警告不能打開的地方」。答案一格一個字，中文、英文都可以。',
      '「從文字擷取」：貼上文字或讀進 TXT、HTML（CCFOLIA 的日誌）、JSON、Markdown 檔，從句子裡挑出單字當答案、整句當提示（答案在提示裡蓋成 ○）。',
      '按「產生填字遊戲」排出盤面；每按一次都會重新隨機排列。',
      '在「外觀」改標題、空格的顏色與字型；預覽上方切換左右／上下排列、顯示答案。',
      '在「匯出」下載題目或解答的 PNG、HTML，或列印。',
    ],
    notesTitle: '注意事項',
    notes: [
      '答案要和盤面上已經有的字交叉才排得進去：答案之間共同的字越多，盤面越完整。',
      '中文的詞比較短、共同的字也少，從文字擷取通常只排得進幾個詞；想要完整的盤面，建議用「自己列答案」，挑有共同字的答案。',
      '英文答案區分大小寫（Key 與 key 是不同的答案），盤面上一律顯示大寫。',
      '設定、文字與盤面會自動存在這個瀏覽器；文字超過 30 萬字時不自動儲存，請存成專案檔。',
    ],
  },

  source: {
    title: '答案來源',
    modeLabel: '答案來源',
    modes: { list: '自己列答案', text: '從文字擷取' } satisfies Record<SourceMode, string>,
    listLabel: '答案與提示',
    listHint:
      '一行一個「答案：提示」（冒號也可以用半形的「:」、Tab 或「｜」）。答案至少兩個字，裡面的空白會拿掉。',
    listPlaceholder: '地下室：日記警告「絕對不能打開」的地方。\n暗門：藏在書架後面的入口。',
    listCount: (n: number) => `${n.toLocaleString('zh-TW')} 個答案`,
    listIssues: {
      tooShort: (lines: number[]) =>
        `第 ${lines.slice(0, 5).join('、')}${lines.length > 5 ? ' …' : ''} 行的答案不到兩個字，不會排進去。`,
      duplicates: (list: string[]) =>
        `重複的答案只用第一個：${list.slice(0, 5).join('、')}${list.length > 5 ? ' …' : ''}。`,
      noHint: (n: number) => `${n} 個答案沒有寫提示。`,
    },
    textLabel: '文字',
    textPlaceholder: '把劇本、跑團日誌或任何文章貼在這裡……',
    textCount: (n: number) => `${n.toLocaleString('zh-TW')} 字`,
    textTooLong: '文字超過 30 萬字，不會自動儲存（專案檔照樣會存）。',
    hanNote:
      '中文的詞比較短、共同的字也少，通常只排得進幾個詞；排好之後可以按「改成答案清單」，自己改提示、補上有共同字的答案。',
    dropLabel: '把文字檔拖到這裡',
    dropButton: '讀取檔案',
    dropHint: 'TXT、HTML（CCFOLIA 的日誌）、JSON、Markdown',
    fileLoaded: (name: string) => `已讀取「${name}」`,
    fileLoadedBig5: (name: string) => `已讀取「${name}」（Big5 編碼）`,
    fileLoadedLossy: (name: string) => `已讀取「${name}」，但有些字無法辨識（不是 UTF-8 編碼）`,
    fileFailed: (name: string) => `無法讀取「${name}」`,
    fileRejected: (names: string) => `不是文字檔：${names}`,
    currentFile: (name: string) => `目前的文字來自「${name}」`,
    clearText: '清除文字',
    textCleared: '已清除文字',
    wordCount: '單字數',
    wordCountHint: '最多排進幾個單字（實際的數量看單字之間有沒有共同的字）。',
    freqWeight: '出現次數的比重',
    freqWeightHint: '越高越常挑出現很多次的單字；越低越隨機。',
    lenWeight: '句子長度的比重',
    lenWeightHint: '越高越常挑出現在長句子裡的單字。',
    generate: '產生填字遊戲',
    generating: '產生中…',
    generateHint: '每按一次都會重新隨機排列。',
    needText: '先輸入文字。',
    needList: '先列出答案。',
  },

  status: {
    textResult: (placed: number, found: number) =>
      `從文字找到 ${found.toLocaleString('zh-TW')} 個單字，排進 ${placed} 個。`,
    listResult: (placed: number, total: number) => `排進 ${placed}／${total} 個答案。`,
    unplaced: (list: string[]) =>
      `排不進去（和其他答案沒有可以交叉的字）：${list.slice(0, 8).join('、')}${list.length > 8 ? ` 等 ${list.length} 個` : ''}`,
    noWords: '找不到可以當答案的單字（至少兩個字的詞）。',
    noEntries: '沒有可以用的答案（答案至少兩個字）。',
    stale: '答案來源或設定改過了，按「產生填字遊戲」更新盤面。',
    toList: '改成答案清單',
    toListTitle: '把盤面上的答案與提示放進「自己列答案」，之後可以自己改提示、加減答案',
    toListDone: (n: number) => `已把 ${n} 個答案放進答案清單（可以復原）`,
  },

  design: {
    title: '外觀',
    sheetTitle: '標題',
    sheetTitlePlaceholder: '填字遊戲',
    emptyColor: '空格的顏色',
    emptyTransparent: '空格透明',
    emptyTransparentHint: '透明時沒有字的格子不上色，有字的格子各自加上框線。',
    fontsTitle: '字型',
    fonts: { title: '標題', grid: '盤面', clues: '提示' } satisfies Record<FontRole, string>,
    fontPreview: { title: '填字遊戲', grid: '答案 ABC 123', clues: '提示：○○的入口' },
  },

  preview: {
    label: '填字遊戲預覽',
    showAnswers: '顯示答案',
    layout: '版面',
    layouts: { row: '左右', col: '上下' } satisfies Record<SheetLayout, string>,
    layoutTitles: {
      row: '盤面在左、提示在右',
      col: '盤面在上、提示在下',
    } satisfies Record<SheetLayout, string>,
    empty: '還沒有填字遊戲。列出答案（或貼上文字）後按「產生填字遊戲」。',
    size: (w: number, h: number) =>
      `${w.toLocaleString('zh-TW')} × ${h.toLocaleString('zh-TW')} px`,
    rendering: '繪製中…',
  },

  sheet: {
    answerBadge: '（解答）',
    across: '橫向提示',
    down: '直向提示',
  },

  export: {
    title: '匯出',
    versions: { question: '題目', answer: '解答' } satisfies Record<Version, string>,
    png: '下載 PNG',
    html: '下載 HTML',
    print: '列印',
    pngTitle: (v: string) => `下載${v}的圖片（2 倍）`,
    htmlTitle: (v: string) => `下載${v}的網頁檔`,
    printTitle: (v: string) => `列印${v}（可以在列印視窗選「另存為 PDF」）`,
    hint: 'PNG 是預覽的 2 倍大小；HTML 是可以用瀏覽器開啟的單一檔案；列印會把整張圖放進一頁 A4。',
    needPuzzle: '先產生填字遊戲。',
    downloaded: (name: string) => `已下載「${name}」`,
    failed: '匯出失敗',
    printFailed: '無法開啟列印',
    fileSuffix: { question: '題目', answer: '解答' } satisfies Record<Version, string>,
  },

  project: {
    resetTitle: '全部重來？',
    resetDescription: '答案、文字、外觀與盤面都會回到開頁的範例（可以復原）。',
    opened: '已開啟專案檔',
    autosaveStatus: '自動儲存失敗',
    fileName: (title: string) => `${title}_填字遊戲.json`,
  },

  keys: {
    edit: '編輯',
    file: '檔案',
    generate: '產生填字遊戲',
    save: '存成專案檔',
    answers: '顯示／隱藏答案',
  },

  toast: {
    saved: '已存成專案檔',
    saveFailed: '無法存成專案檔',
    autosaveFailed: '自動儲存失敗（瀏覽器的空間可能已滿），請存成專案檔。',
  },
} as const;
