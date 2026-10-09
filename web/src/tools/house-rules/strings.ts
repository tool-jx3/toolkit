/**
 * CoC 房規表產生器的介面文字（全部自寫；用詞照 DESIGN.md 第 5 節）。
 * `OUT` 是會寫進表（PNG、純文字、Markdown）的字；規則與選項的名稱在 rules.ts。
 */

/** 寫進表的字 */
export const OUT = {
  /** 標題空白時的表名（也是檔名的預設） */
  defaultTitle: '房規表',
  /** 未設定的值 */
  unset: '—',
  /** 自己加的規則沒有名稱時 */
  newRule: '新規則',
  meta: { kp: 'KP', system: '規則系統', scenario: '適用劇本', date: '更新日期' },
  cols: { rule: '規則', value: '設定', note: '注記' },
  remarks: '其他備註',
  legend: '○ 採用　× 不採用　※ 有修改（見注記）',
};

export const S = {
  usage: {
    intro:
      '把自己團的房規整理成一張表，貼到 Discord、X 或招募文裡：從常見的規則勾選、調整，匯出成圖片（PNG）、純文字或 Markdown。',
    steps: [
      '先選「版本」：6 版、7 版或兩版並列。「各版通用」的規則不論哪個版本都會列出。',
      '不知道從哪裡開始時，按「預設集」選「照規則書」或「線上團常見」，所有規則會一次填好。',
      '點每條規則的 ○、× 或選項來設定，再點一次已選的選項就變回未設定。「※」表示和規則書不同，選了之後請在注記寫下改了什麼。',
      '每一列左邊的眼睛決定這條規則要不要放進表。變淡的列不會出現在表上，也不會匯出。',
      '每個分類最下面的「新增規則」可以加入自己團的規則；規則名稱可以直接改。',
      '「輸出」（寬畫面在右邊，窄畫面在最下面）可以預覽並匯出。貼到 Discord 建議用純文字或圖片，Discord 不會把 Markdown 的表格顯示成表格。',
    ],
    notesTitle: '小提醒',
    notes: [
      '內容會自動存在這個瀏覽器；換電腦或手機時，用「專案」選單存成專案檔，再到另一台開啟。',
      '手機上把一列往右滑可以切換放不放進表，自己加的規則往左滑可以刪除。',
      '規則名稱與選項是常見的說法，可以改成你們團習慣的叫法。規則的正式內容請以手邊的規則書為準；本工具與 Chaosium Inc. 及各出版社無關。',
    ],
  },

  toolbar: {
    edition: '版本',
    editions: { '6': '6 版', '7': '7 版', both: '兩版並列' },
    preset: '預設集',
    presetMenu: '選擇預設集',
    presets: {
      raw: {
        name: '照規則書',
        note: '每條規則填入規則書的做法，只把常討論的規則放進表。',
      },
      pop: {
        name: '線上團常見',
        note: '填入線上團常見的房規（CCB、理智檢定的大成功／大失敗、技能上限等），和規則書不同的規則也放進表。',
      },
      clear: {
        name: '全部清空',
        note: '清掉每條規則的設定與注記；放不放進表、自己加的規則不變。',
      },
    },
  },

  info: {
    section: '表的資訊',
    title: '表的標題',
    kp: 'KP',
    system: '規則系統',
    scenario: '適用劇本',
    date: '更新日期',
    optional: '空白的欄位不會出現在表上；規則系統空白時寫版本的名稱。',
    remarks: '其他備註',
    remarksPlaceholder: '想放在表最下面的補充說明（可以不填）',
  },

  sheet: {
    cols: { rule: '規則', value: '設定', note: '說明／注記' },
    count: (shown: number, total: number) => `表上 ${shown}／${total} 條`,
    collapse: '收合／展開',
    showAll: (cat: string) => `全部放進表裡：${cat}`,
    hideAll: (cat: string) => `全部從表上拿掉：${cat}`,
    add: '新增規則',
    addAria: (cat: string, sec: string) => `新增規則到「${sec}・${cat}」`,
  },

  row: {
    visible: '放進表裡',
    name: '規則名稱',
    resetName: '改回原本的名稱',
    options: '設定',
    note: '注記',
    notePlaceholder: '說明或注記',
    noteModPlaceholder: '請寫下改了什麼',
    freeText: '設定的內容',
    freePlaceholder: '設定的內容',
    remove: '刪除這條規則',
    newRule: '新規則',
  },

  toc: { aria: '目錄', info: '表的資訊', remarks: '其他備註', output: '輸出' },

  output: {
    title: '輸出',
    formats: { png: '圖片（PNG）', txt: '純文字', md: 'Markdown' },
    formatAria: '輸出格式',
    theme: '配色',
    themes: { dark: '深色', light: '淺色' },
    layout: '版面',
    layouts: { wide: '橫式', narrow: '直式' },
    notes: '包含注記',
    legend: '包含圖例',
    savePng: '下載 PNG',
    copyImage: '複製圖片',
    copyText: '複製',
    download: (ext: string) => `下載 .${ext}`,
    hints: {
      png: '橫式適合電腦看（寬 1920 px），直式適合手機看（寬 1200 px）；高度依內容，沒有注記時不畫注記欄。',
      txt: '貼到 Discord 建議用這個格式。',
      md: '給 GitHub、Notion 等會顯示 Markdown 表格的地方用；Discord 不會顯示成表格。',
    },
    empty: '表上還沒有規則。用每一列左邊的眼睛按鈕把規則放進表裡。',
    previewAria: '表的預覽',
    size: (w: number, h: number) => `${w} × ${h} px`,
    rendering: '產生中…',
    zoom: '放大檢視',
    zoomTitle: '預覽（PNG）',
    textTitle: { txt: '純文字', md: 'Markdown' },
    lines: (n: number) => `共 ${n} 行`,
  },

  toast: {
    preset: (name: string) => `已套用「${name}」`,
    undoHint: (combo: string) => `按「復原」（${combo}）可以回到之前的樣子。`,
    removed: '已刪除規則',
    shown: '已放進表裡',
    hidden: '已從表上拿掉',
    downloaded: '已下載',
    copiedImage: '已複製圖片',
    copyImageFailed: '無法複製圖片',
    copyImageHint: '這個瀏覽器不讓網頁複製圖片，請改用「下載 PNG」。',
    copied: '已複製到剪貼簿',
    copyFailed: '無法複製',
    copyFailedHint: '已全選文字，請按 Ctrl＋C 複製，或改用下載。',
    copyEmpty: '表上還沒有規則',
    saved: '已存成專案檔',
    saveFailed: '無法存成專案檔',
  },

  project: {
    resetLabel: '全部重來…',
    resetTitle: '全部重來？',
    resetDescription:
      '表的資訊、每條規則的設定與自己加的規則都會回到開頁的樣子（可以用「復原」回來）。',
    resetConfirm: '全部重來',
    openOriginal: '開啟原作的房規表檔（.hrt.json）…',
    openedOriginal: (name: string) => `已開啟「${name}」`,
    openOriginalFailed: (name: string) =>
      `「${name}」不是房規表檔（原作「CoCハウスルール表メーカー」存的 .hrt.json），沒有開啟。`,
    openedHint: '可以用「復原」回到開啟前。',
  },

  undo: '復原',
  redo: '重做',
  keys: { edit: '編輯', file: '檔案', save: '存成專案檔' },
};
