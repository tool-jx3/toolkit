/**
 * NPC 名字產生器的介面文字（全部自寫；用詞照 DESIGN.md 第 5 節）。
 * 地區、年代、性別的名稱在 core/names（coc-npc 的隨機取名也用同一套）與 core/names/corpus（考據語料）；
 * 考據語料的涵義、備註與說明照弄墨 Inknomu 的原文（資料檔）。
 */

export const S = {
  usage: {
    intro:
      '跑團中臨時要幫 NPC 取名時用：選地區、年代與性別，按「產生」就有一批名字，點名字就複製，喜歡的鎖定起來，再產生時會留著。',
    steps: [
      '「地區」選日本、台灣、韓國、英國、美國、俄羅斯、北歐或奇幻；「年代」是故事發生的年代（奇幻是種族），分成兩種資料：依真實人數的名單（日本、台灣、美國），與弄墨 Inknomu 的考據語料（每個姓與名附涵義）。選單下方一行是說明。',
      '按「產生」或 G 鍵換一批。鎖定（鎖頭）的名字不會被換掉，其他的換成新的。',
      '點名字複製那一個；「全部複製」把整批一行一個複製起來。可以設定複製時附上讀音（日本的假名與羅馬拼音，韓國、俄羅斯與維京時代的原文／拼音）；涵義不會複製。',
      '依人數的名單越常見的名字越容易抽到，考據語料每一筆的機會相同；同一批不會重複。語料有標記時可以依階級（日本、英國）或國家（北歐）篩選；「中性」只出現男女都用的名字。',
      '想要重現同一批時，在「種子」填同一個字串（例如畫面上顯示的「這一批的種子」）。',
      '「最近產生的紀錄」留著最近 20 批，可以放回來或複製；「匯出」存成 TXT 或 CSV（Excel 打得開，考據語料另有涵義與備註的欄位）。',
    ],
    notesTitle: '名字的來源',
    notes: [
      '日本：shuheilocale/japanese-personal-name-dataset（MIT）的姓名與讀音，人數是國會圖書館的人名權威檔（NDL Authorities）與 Wikidata 的人物依出生年代數的，偏向作者與名人（「現代」偏 1960～1980 年代出生的人，年輕的名字較少）；男女都用的寫法參考 willnet/gimei（MIT）。',
      '台灣：內政部戶政司「112 年全國姓名統計分析」的姓氏與男女各前 100 個名字（政府資料開放授權條款－第 1 版），所以名字都是兩個字，也沒有分年代。',
      '美國：社會安全局的嬰兒名字（1880～1929 年）與 1990 年人口普查的姓氏（都是公有領域）。1920 年代還很少見的西語裔、亞太裔為主的姓，依 2000 年人口普查的族裔比例降成約十分之一。',
      '考據語料：弄墨 Inknomu《角色姓名產生器》（CC BY 4.0）的 29 個資料包，作者整理自各地的公開統計與文獻；涵義、備註與說明照原文，本站改寫成自己的格式、每一筆平均抽。每一份的說明與出處在「關於這份語料」。',
      '產生的名字只是組合，和真實的人無關；同名同姓純屬巧合。',
    ],
  },

  conditions: {
    title: '條件',
    region: '地區',
    era: '年代',
    gender: '性別',
    count: '數量',
    countUnit: '個',
    middle: '中間名縮寫',
    middleHint: '名和姓之間加一個字母，例如 Harold J. Whitmore。',
    /** 年代選單的兩組 */
    countGroup: '依真實人數',
    corpusGroup: '考據語料（弄墨 Inknomu，附涵義）',
    rank: '階級',
    rankHint: '姓與名都依身分篩選；兩者通用與沒有標的照樣會出現。',
    country: '國家',
    countryHint: '冰島沒有世襲的姓，所以沒有冰島。',
    part: '輸出',
    partHint: '只有名或只有姓時，同一批以那一段不重複。',
  },

  search: {
    title: '查名字',
    description: (region: string) => `在${region}的考據語料（所有年代）裡找姓或名。`,
    label: '姓或名',
    placeholder: '例如：さとう、jose、김',
    hint: '寫法的一部分就可以（日本、韓國、俄羅斯也可以打讀音）；不分大小寫，重音符號、全形英數、片假名與濁音都不用打對。按「搜尋」或 Enter。',
    submit: '搜尋',
    kind: '類別',
    kinds: { all: '不限', family: '姓', given: '名' },
    any: '不限',
    clear: '清空篩選',
    total: (n: number) => `共 ${n} 筆`,
    empty: '查無資料，換個字試試。',
    more: (n: number) => `顯示更多（還有 ${n} 筆）`,
    aria: '搜尋結果',
    loading: '讀取名字資料…',
  },

  about: {
    title: '關於這份語料',
    note: '說明',
    corpusNote: '來源與考據',
    rules: '命名規則',
    sources: '資料來源（原站各地區頁面列的）',
    sourceGroup: (group: string, n: number) => `${group}（${n} 筆）`,
    creditPrefix: '語料：',
    creditSuffix: '，本站改寫格式',
  },

  display: {
    title: '顯示與複製',
    readings: '讀音',
    hiragana: '平假名',
    katakana: '片假名',
    romaji: '羅馬拼音',
    original: '原文／拼音',
    readingsHint:
      '平假名、片假名、羅馬拼音是日本的名字；原文／拼音是韓國的羅馬拼音、俄羅斯的西里爾字母、維京時代的古諾斯語拼法。',
    meaning: '顯示涵義',
    meaningHint: '考據語料的名字在卡片上附姓與名的涵義、備註（複製時不附）。',
    copyReading: '複製時附上讀音',
    copyReadingHint:
      '附上畫面上有顯示的讀音，例如「佐藤 博（さとう ひろし）」「김서준（Gim Seojun）」。',
  },

  seed: {
    title: '種子',
    label: '種子',
    placeholder: '留白＝每次隨機',
    hint: '填了之後，同樣的條件與鎖定的名字每次產生同樣的一批。',
    last: (seed: string) => `這一批的種子：${seed}`,
    use: '填入這個種子',
  },

  list: {
    generate: '產生',
    generating: '讀取名字資料…',
    copyAll: '全部複製',
    aria: '產生的名字',
    empty: '按「產生」來一批名字。',
    summary: (count: number, locked: number) =>
      locked ? `共 ${count} 個，鎖定 ${locked} 個` : `共 ${count} 個`,
    copy: (text: string) => `複製「${text}」`,
    lock: (text: string) => `鎖定「${text}」`,
    unlock: (text: string) => `取消鎖定「${text}」`,
    exhausted: '不重複的名字不夠，這一批比要求的少。',
    loadFailed: '名字資料讀不到，請檢查網路後重新整理頁面。',
    reload: '重新整理',
    export: '匯出',
    exportTxt: 'TXT（純文字）',
    exportTxtHint: '一行一個，和「全部複製」相同',
    exportCsv: 'CSV（試算表）',
    exportCsvHint: '全名、姓、名、性別、地區、年代、讀音、涵義分欄',
    conditions: '條件',
    toConditions: '改條件',
  },

  history: {
    title: '最近產生的紀錄',
    empty: '產生過的名字會留在這裡（最近 20 批）。',
    aria: '最近產生的紀錄',
    restore: '放回',
    restoreLabel: (when: string) => `放回 ${when} 的這一批`,
    copy: '複製',
    copyLabel: (when: string) => `複製 ${when} 的這一批`,
    count: (n: number) => `${n} 個`,
    more: (n: number) => `等 ${n} 個`,
    clear: '清除紀錄',
    clearTitle: '清除最近產生的紀錄？',
    clearDescription: '紀錄裡的名字都會刪掉，目前畫面上的這一批不受影響。',
    clearConfirm: '清除',
  },

  toast: {
    copied: (text: string) => `已複製：${text}`,
    copiedAll: (n: number) => `已複製 ${n} 個名字`,
    copyFailed: '瀏覽器不讓網頁複製',
    copyFailedHint: '請改用滑鼠選取名字後按 Ctrl＋C（Mac 是 ⌘C）。',
  },

  keys: {
    group: '名字',
    generate: '產生一批',
    copyAll: '全部複製',
    edit: '編輯',
    undo: '復原',
    redo: '重做',
  },
};
