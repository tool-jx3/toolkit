/**
 * 奇幻隨機產生器的介面文字（只有繁體中文；用詞照 DESIGN.md 第 5 節與「5e 的名詞」）。
 * 產生器的名稱與說明也在這裡（generators.ts 照 id 取）。
 */
export const S = {
  categories: {
    people: '人物',
    adventure: '冒險',
    places: '地點',
    items: '物品',
    treasure: '寶藏',
    custom: '自訂',
  },
  gens: {
    npc: {
      label: 'NPC',
      summary: '名字、個性、種族、身分、外觀特徵、穿著，和這個人想要的東西。',
    },
    quest: {
      label: '委託',
      summary: '委託人是誰、要角色們到哪裡做什麼、那裡盤據著什麼。',
    },
    trap: {
      label: '陷阱',
      summary: '兩個機關與它們的效果，加上觸發的條件。',
    },
    location: {
      label: '地點',
      summary: '狀態＋來源＋地點，例如「鬧鬼的矮人地窖」，當作地城或探索點的點子。',
    },
    'location-name': {
      label: '地名',
      summary: '城鎮、村莊、渡口的名字：中文的意譯組字，或原作的英文組字。',
    },
    monument: {
      label: '地標',
      summary: '旅途中、城鎮裡看到的紀念物與奇景。',
    },
    relic: {
      label: '遺物',
      summary:
        '任何職業都能用一次的魔法小物，用了就施放上面的法術。花十分鐘仔細看就知道是哪個法術；用的動作和那個法術相同。價格是法術捲軸的一半，可以當作參考。',
    },
    scroll: {
      label: '法術捲軸',
      summary: '法術捲軸：環位、稀有度、豁免 DC、法術攻擊加值與參考價格。',
    },
    spellbook: {
      label: '法術書',
      summary: '法師的法術書：依法師等級抽出戲法與各環的法術，每一環至少一個，低環的比較多。',
    },
    weapon: {
      label: '獨特武器',
      summary:
        '附有法術的魔法武器，當作自己設計魔法物品的點子：法術每天可以用一次、下一個黎明恢復（戲法可以不限次數）；加值自己決定。',
    },
    armor: {
      label: '獨特護甲',
      summary:
        '附有法術的魔法護甲，當作自己設計魔法物品的點子：法術每天可以用一次、下一個黎明恢復（戲法可以不限次數）；加值自己決定。',
    },
    treasure: {
      label: '寶藏（Lazy 5e）',
      summary:
        '每一場遊戲發一份：錢幣、寶石、藝術品、兩個消耗品與一個永久物品（SRD 5.1 的物品），另外可以加一個遺物。錢幣的平均價值約 400 GP（1～4 級）、4,000 GP（5～10 級）、30,000 GP（11～16 級）、200,000 GP（17 級以上）；遺物不算在內，可能很強，用不用自己決定。',
    },
    'treasure-2024': {
      label: '寶藏（SRD 5.2）',
      summary:
        '照 2024 年版的寶藏分配：錢幣加上銀條、寶石或藝術品其中一種，再依角色等級抽 0～6 個魔法物品（SRD 5.2 的物品，依稀有度的機率抽）。',
    },
    'treasure-bfrd': {
      label: '寶藏（Black Flag）',
      summary:
        'Black Flag Roleplaying（Tales of the Valiant）的每場寶藏：錢幣、寶石、藝術品，加上普通物品、消耗品與永久物品（BFRD 1.0 的物品）。',
    },
  },
  options: {
    spellSource: '法術來源',
    srd52: 'SRD 5.2（2024 年版）',
    srd51: 'SRD 5.1（2014 年版）',
    rarity: '稀有度（環位）',
    rarityAny: '不限（全部環位）',
    rarityCommon: '普通（戲法、1 環）',
    rarityUncommon: '非普通（2、3 環）',
    rarityRare: '珍稀（4、5 環）',
    rarityVeryRare: '非常珍稀（6～8 環）',
    rarityLegendary: '傳說（9 環）',
    tier: '角色等級',
    tier1: '1～4 級',
    tier2: '5～10 級',
    tier3: '11～16 級',
    tier4: '17 級以上',
    relic: '遺物',
    relicOn: '加一個遺物',
    relicOff: '不要遺物',
    wizardLevel: '法師等級',
    wizardLevelLabel: (level: number, spells: number, cantrips: number) =>
      `${level} 級（法術 ${spells} 個、戲法 ${cantrips} 個）`,
    nameStyle: '寫法',
    nameZh: '中文',
    nameEn: '英文（原作）',
    nameBoth: '中文＋英文',
  },
  /** 結果裡的字（會被複製出去） */
  out: {
    cantrip: '戲法',
    level: (n: number) => `${n} 環`,
    rarity: [
      '普通',
      '普通',
      '非普通',
      '非普通',
      '珍稀',
      '珍稀',
      '非常珍稀',
      '非常珍稀',
      '非常珍稀',
      '傳說',
    ],
    rarityOf: {
      common: '普通',
      uncommon: '非普通',
      rare: '珍稀',
      very_rare: '非常珍稀',
      legendary: '傳說',
    },
    spellAttack: '法術攻擊',
    noName: '（無名氏）',
    spellbook: (level: number) => `法師 ${level} 級的法術書`,
    once: '一次',
    perGem: (value: string) => `每顆 ${value} GP`,
  },
  settings: {
    generator: '產生器',
    options: '條件',
    count: '數量',
    countUnit: '筆',
    seed: '種子',
    seedTitle: '種子（重現同一批）',
    seedHint:
      '填了種子，同一個產生器、條件與數量每次都產生同一批；空白時每次隨機，用過的種子會顯示在下面。',
    seedPlaceholder: '空白＝隨機',
    lastSeed: (seed: string) => `這一批的種子：${seed}`,
    useSeed: '填入這個種子',
    about: '關於規則內容',
  },
  list: {
    generate: '產生',
    copyAll: '全部複製',
    export: '匯出',
    exportTxt: '文字檔（.txt）',
    exportTxtHint: '一筆一段，直接貼到記事本或劇本',
    exportCsv: '試算表（.csv）',
    exportCsvHint: '一筆一列，每一欄一格',
    summary: (n: number, locked: number) => (locked ? `${n} 筆（鎖定 ${locked} 筆）` : `${n} 筆`),
    generating: '產生中…',
    empty: '按「產生」開始。',
    aria: '產生的結果',
    loadFailed: '名字的資料讀不到，請重新整理頁面再試一次。',
    reload: '重新整理',
    toSettings: '改條件',
    conditions: '條件',
  },
  card: {
    copy: '複製',
    copyLabel: (i: number) => `複製第 ${i} 筆`,
    reroll: '重抽',
    rerollLabel: (i: number) => `重抽第 ${i} 筆（鎖定的欄留著）`,
    lock: (i: number) => `鎖定第 ${i} 筆`,
    unlock: (i: number) => `解除鎖定第 ${i} 筆`,
    save: '加到清單',
    saveLabel: (i: number) => `把第 ${i} 筆加到我的清單`,
    more: (i: number) => `第 ${i} 筆的其他動作`,
    moreShort: '更多',
    ccfolia: '複製成 CCFOLIA 棋子',
    ccfoliaHint: '在 CCFOLIA 的房間按 Ctrl＋V（Mac 為 ⌘＋V）貼上，就會新增一個角色，內容放在備註',
    fieldMenu: '這一欄',
    fieldReroll: (label: string) => `重抽「${label}」`,
    fieldLock: (label: string) => `鎖定「${label}」`,
    fieldUnlock: (label: string) => `解除鎖定「${label}」`,
    fieldCopy: (label: string) => `複製「${label}」`,
    fieldTitle: (label: string, locked: boolean) =>
      locked ? `${label}（已鎖定）：點一下可以重抽、解除鎖定` : `${label}：點一下可以重抽、鎖定`,
  },
  saved: {
    title: '我的清單',
    empty: '結果卡的「加到清單」會把那一筆存在這裡（會一起存進專案檔）。',
    copyAll: '全部複製',
    clear: '清空',
    clearTitle: '清空我的清單？',
    clearDescription: '清單裡的每一筆都會刪掉（可以復原）。',
    clearConfirm: '清空',
    remove: (i: number) => `從清單刪掉第 ${i} 筆`,
    copy: (i: number) => `複製清單的第 ${i} 筆`,
    aria: '我的清單',
    count: (n: number) => `${n} 筆`,
  },
  history: {
    title: '最近產生的紀錄',
    empty: '還沒有紀錄。',
    aria: '最近產生的紀錄',
    restore: '放回',
    restoreLabel: (time: string) => `放回 ${time} 的那一批`,
    copy: '複製',
    copyLabel: (time: string) => `複製 ${time} 的那一批`,
    clear: '清除',
    clearTitle: '清除紀錄？',
    clearDescription: '最近產生的紀錄會全部刪掉（不能復原）。',
    clearConfirm: '清除',
    count: (n: number) => `${n} 筆`,
    more: (n: number) => `…共 ${n} 筆`,
  },
  custom: {
    title: '自訂產生器',
    add: '新增產生器',
    newName: (n: number) => `我的產生器 ${n}`,
    name: '名稱',
    text: '表的內容',
    textHint:
      '不縮排的一行是表名，下面縮排的行是那個表的項目；「範本」表是每一筆的樣子。寫法見下面的說明。',
    remove: '刪除這個產生器',
    removeTitle: (name: string) => `刪除「${name}」？`,
    removeDescription: '這個產生器的表會刪掉（可以復原）。',
    removeConfirm: '刪除',
    noTemplate:
      '還沒有「範本」表：至少要有一個「範本」表（或原作的 template），下面寫每一筆的樣子。',
    missing: (name: string, from: string) =>
      from === '範本'
        ? `範本參照的表「${name}」不存在。`
        : `表「${from}」參照的表「${name}」不存在。`,
    empty: (name: string) => `表「${name}」是空的。`,
    cycle: (name: string) => `表「${name}」的每一項都會再參照回自己，停不下來。`,
    ok: (tables: number, templates: number) => `${tables} 個表、${templates} 種範本，可以產生。`,
    syntaxTitle: '寫法',
    syntax: [
      ['{表名}', '從那個表抽一項（項目裡又有 {…} 時繼續抽）'],
      ['項目 ^3', '權重：出現的機會是 3 倍'],
      ['{"甲"|"乙"|丙 ^2}', '多選一；引號裡的字照寫，沒有引號的是表名或一般的字；^N 是權重'],
      ['{{表甲}|{表乙}}', '兩個表各抽一項，再二選一'],
      ['[[100-500]]', '100～500 的整數'],
      ['{表名*3}、{表名*[[1-3]]}', '從表抽好幾次，一項一行'],
      ['{@欄名:內容}', '（範本裡）標出「欄」：結果卡上可以單獨重抽、鎖定'],
      ['\\n', '換行'],
      ['# 開頭的行', '註解（不縮排時）'],
    ] as const,
    sample: `# 範例：酒館裡聽到的傳聞（改成自己的表）
範本
  {@誰:人物}說，{@地點:地點}最近{@怪事:怪事}。
  聽說{@地點:地點}的{@人物:人物}其實{@祕密:祕密} ^2

人物
  磨坊的老闆
  獨眼的船夫 ^2
  鎮長的女兒
  {"新來的"|"退休的"}神官

地點
  北邊的舊礦坑
  墓園後面的小屋
  河上的石橋

怪事
  半夜傳出敲打聲
  有人看見藍色的火
  一連三天都起濃霧

祕密
  欠了盜賊公會 [[100-500]] 枚金幣
  是被通緝的魔法師
  每晚都在等一封信`,
    unknownGen: '這個自訂產生器已經刪掉了。',
  },
  about: {
    title: '關於規則內容與授權',
    lead: '產生器的做法參考 Sly Flourish（Michael E. Shea）的 5e Artisanal Database 裡的隨機產生器（lazy_gm_tools，程式 CC0）。用到的規則名詞與物品、法術名稱來自下面以創用 CC 姓名標示 4.0 釋出的規則參考文件，中文是本站翻譯的，有修改；說明文字沒有收錄。',
    compat:
      '相容 5e（SRD 5.1／5.2）與 Black Flag Roleplaying。本站與 Wizards of the Coast、Kobold Press 沒有關係，也沒有得到它們的認可。',
    own: '本站自己寫的：NPC 的個性、身分、特徵、穿著與目標，委託、陷阱、地標、藝術品的清單，寶石的分法，以及各產生器的中文句型。',
    names:
      'NPC 與委託人的名字取自弄墨 Inknomu《角色姓名產生器》的奇幻語料（人類、精靈、矮人、獸人、半身人；CC BY 4.0）。',
    cc0: '地名的前半與後半照原作 location_names（程式與內容都是 CC0），中文是本站依字義譯的。',
    statementTitle: '署名（照原文）',
    modified: '本站翻譯、有修改：只取名稱、稀有度與環位，翻成繁體中文並改寫成本站的句型。',
    license: '授權條款',
    noticesHint: '授權全文另見網站的第三方授權說明（THIRD_PARTY_NOTICES）。',
  },
  toast: {
    copied: '已複製，可以直接貼到 CCFOLIA 的聊天欄或備忘',
    copiedAll: (n: number) => `已複製 ${n} 筆`,
    copiedField: (label: string) => `已複製「${label}」`,
    copiedCcfolia: '已複製成 CCFOLIA 棋子：在房間畫面按 Ctrl＋V（Mac 為 ⌘＋V）貼上',
    copyFailed: '無法複製',
    copyFailedHint: '瀏覽器不允許寫入剪貼簿：請選取文字後自己複製。',
    saved: '已加到我的清單',
  },
  project: {
    opened: '已開啟專案檔',
    badFile: '這不是奇幻隨機產生器的專案檔。',
  },
  keys: {
    group: '產生',
    edit: '編輯',
    generate: '產生',
    copyAll: '全部複製',
    undo: '復原',
    redo: '重做',
  },
  usage: {
    intro:
      '跑奇幻 TRPG（D&D 5e 等）時臨時要一個 NPC、委託、陷阱、地點或一份寶藏，選產生器、按「產生」就有一批。',
    steps: [
      '在上面選產生器（人物、冒險、地點、物品、寶藏，或自己寫的表），有條件的（角色等級、法術來源等）在設定裡改。',
      '每一筆的結果卡：點畫底線的字可以只重抽那一欄、或鎖定它；「重抽」換掉整張（鎖定的欄留著）；鎖頭鎖住整張，再按「產生」時留著。',
      '「複製」可以直接貼到 CCFOLIA 的聊天欄或備忘；「⋯」裡還有「複製成 CCFOLIA 棋子」與「加到清單」。',
      '要重現同一批，在「種子」填同一個字；最近產生的紀錄可以放回來。',
    ],
    notes: [
      '規則名詞照「繁中（英文原文）」寫；物品與法術的說明文字沒有收錄，請看各規則的 SRD。',
      '設定、目前的結果與「我的清單」自動存在這個瀏覽器；「專案」選單可以存成檔案帶到別台電腦。',
    ],
  },
} as const;
