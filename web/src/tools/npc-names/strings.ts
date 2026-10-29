/**
 * NPC 名字產生器的介面文字（全部自寫；用詞照 DESIGN.md 第 5 節）。
 * 地區、年代、性別的名稱在 core/names（coc-npc 的隨機取名也用同一套）。
 */

export const S = {
  usage: {
    intro:
      '跑團中臨時要幫 NPC 取名時用：選地區、年代與性別，按「產生」就有一批名字，點名字就複製，喜歡的鎖定起來，再產生時會留著。',
    steps: [
      '「地區」選日本、台灣或美國；「年代」是故事發生的年代，括號裡是用了哪些年出生的人的名字。',
      '按「產生」或 G 鍵換一批。鎖定（鎖頭）的名字不會被換掉，其他的換成新的。',
      '點名字複製那一個；「全部複製」把整批一行一個複製起來。日本的名字可以設定複製時附上讀音。',
      '名字依實際的人數抽：越常見的名字越容易抽到，同一批不會重複。',
      '想要重現同一批時，在「種子」填同一個字串（例如畫面上顯示的「這一批的種子」）。',
      '「最近產生的紀錄」留著最近 20 批，可以放回來或複製；「匯出」存成 TXT 或 CSV（Excel 打得開）。',
    ],
    notesTitle: '名字的來源',
    notes: [
      '日本：shuheilocale/japanese-personal-name-dataset（MIT）的姓名與讀音，人數是國立國會圖書館典拠與 Wikidata 的人物依出生年代數的，偏向作者與名人；男女都用的寫法參考 willnet/gimei（MIT）。',
      '台灣：內政部戶政司「112 年全國姓名統計分析」的姓氏與男女各前 100 個名字（政府資料開放授權條款－第 1 版），所以名字都是兩個字，也沒有分年代。',
      '美國：社會安全局的嬰兒名字（1880～1929 年）與 1990 年人口普查的姓氏（都是公有領域）。姓氏是 1990 年的分布，會出現 1920 年代還很少見的姓。',
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
  },

  display: {
    title: '顯示與複製',
    readings: '讀音',
    hiragana: '平假名',
    katakana: '片假名',
    romaji: '羅馬拼音',
    copyReading: '複製時附上讀音',
    copyReadingHint: '附上畫面上有顯示的讀音，例如「佐藤 博（さとう ひろし）」。',
    jpOnly: '只有日本的名字有讀音。',
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
    gender: { male: '男', female: '女' },
    exhausted: '不重複的名字不夠，這一批比要求的少。',
    loadFailed: '名字資料讀不到，請檢查網路後再按一次「產生」。',
    export: '匯出',
    exportTxt: 'TXT（純文字）',
    exportTxtHint: '一行一個，和「全部複製」相同',
    exportCsv: 'CSV（試算表）',
    exportCsvHint: '全名、姓、名、性別、地區、年代、讀音分欄',
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
