/**
 * 聊天視窗產生器的介面文字（台灣繁體中文，用詞照 docs/refactor/DESIGN.md 第 5 節）。
 */

export const S = {
  intro:
    '做一段給 OBS 瀏覽器來源用的自訂 CSS，把 CCFOLIA 的「聊天另開視窗」變成直播畫面上的聊天／擲骰視窗。全部在瀏覽器裡完成，不會上傳任何東西。',

  tabs: {
    basic: '基本',
    window: '視窗',
    message: '訊息',
    text: '文字',
    motion: '動態',
    obs: 'OBS',
  },
  tabsLabel: '設定分類',

  obsBadge: 'OBS 31+',
  obsBadgeHint: '需要 OBS 31 以上；較舊的 OBS 會忽略這個效果。',

  /* ---------- 範本 ---------- */
  template: {
    section: '範本',
    label: '範本',
    apply: '套用',
    keepNote: '套用會換掉所有外觀設定；來源大小、房間網址、檔名與預覽設定不會變（可以復原）。',
    applied: (name: string) => `已套用範本「${name}」。`,
  },

  templates: {
    night: {
      name: '夜色聊天窗',
      description:
        '半透明的深色視窗，每則一個淡淡的方框，顯示頭像與角色色的名稱。適合大多數跑團直播。',
    },
    dice: {
      name: '擲骰紀錄',
      description:
        '只列出擲骰訊息，結果另起一行加外框、依成敗上色並發光；視窗隨內容伸縮，貼在畫面下方。',
    },
    spotlight: {
      name: '單則放大',
      description:
        '一次只放大顯示最新一則，頭像也放大；太長的訊息會在等待後慢慢往上捲。搭配「單則用」尺寸剛好。',
    },
    secret: {
      name: '秘匿分頁用',
      description:
        '標題顯示目前分頁的名稱（附鎖頭）與參加者頭像，紫色調和主分頁區分。用在第二個瀏覽器來源，並在 OBS 互動裡切到秘匿分頁。',
    },
    clear: {
      name: '無背景紀錄',
      description:
        '沒有背景與方框，文字加描邊直接疊在畫面上，名稱接在內文前面；每則停留 20 秒後淡出。',
    },
    bubble: {
      name: '對話泡泡',
      description: '圓形頭像配白色對話泡泡，名稱用角色色的膠囊標籤，像通訊軟體的聊天畫面。',
    },
    parchment: {
      name: '冒險手記',
      description: '舊紙張質感、明體字與四角括號，標題兩側有延伸線，訊息之間有分隔線。',
    },
    terminal: {
      name: '終端機',
      description:
        '綠色點陣字配掃描線，標題顯示目前分頁名稱，名稱接在內文前面。適合科幻、賽博劇本。',
    },
    flash: {
      name: '擲骰快報',
      description: '只在有人擲骰時跳出最新一筆，成敗用色塊大大標出，8 秒後自動消失。',
    },
  },

  /* ---------- 要顯示的訊息 ---------- */
  messages: {
    section: '要顯示的訊息',
    description:
      '畫面上只留最新的幾則；更舊的不顯示也不佔位置。系統訊息是用「:HP-2」這類指令改數值時，CCFOLIA 代為發出的通知。',
    count: '則數',
    countUnit: '則',
    diceOnly: '只列出擲骰訊息',
    diceOnlyHint: '只從有擲骰結果的訊息裡取最新幾則；聊天、系統訊息、別人的秘密擲骰都不顯示。',
    hideSystem: '隱藏系統訊息',
    order: '排列順序',
    orderBottom: '最新在下',
    orderTop: '最新在上',
    orderHint: '放不下時會切掉比較舊的那一側。',
    gap: '訊息間距',
  },

  /* ---------- 來源大小 ---------- */
  source: {
    section: '來源大小',
    description:
      '要在 OBS 瀏覽器來源填的寬度與高度。預覽會照這個大小顯示，也會寫進 CSS 的開頭說明；視窗的位置都是相對來源邊緣，換大小不必重做 CSS。',
    width: '寬度',
    height: '高度',
    presets: '常用尺寸',
    presetLabels: ['480 × 400', '420 × 720（直長）', '640 × 240（橫長）', '560 × 180（單則用）'],
    stepUp: (axis: string) => `${axis}：增加`,
    stepDown: (axis: string) => `${axis}：減少`,
  },

  /* ---------- 視窗 ---------- */
  window: {
    section: '視窗',
    sizeMode: '視窗大小',
    fill: '填滿來源',
    fit: '隨內容伸縮',
    fitHint: '隨內容伸縮時，視窗從靠齊的那一邊往另一邊長，最高到填滿來源為止。',
    scrollFillNote: '「長訊息慢慢捲動」生效時，視窗一律填滿來源。',
    anchor: '靠齊',
    bottom: '靠下',
    top: '靠上',
    margin: '外側留白',
    padding: '內側留白',
    bg: '背景',
    texture: '質感',
    textures: { none: '無', paper: '紙張', grain: '顆粒', scanlines: '掃描線' },
    border: '外框粗細',
    borderColor: '外框顏色',
    radius: '圓角',
    shadow: '陰影',
    brackets: '四角括號',
    bracketColor: '括號顏色',
  },

  /* ---------- 標題 ---------- */
  title: {
    section: '標題',
    mode: '標題內容',
    modes: {
      none: '不顯示',
      text: '自訂文字',
      tab: '分頁名稱',
      'text-tab': '文字＋分頁名稱',
    },
    text: '標題文字',
    tabNote:
      '會直接顯示 OBS 裡開著的分頁名稱（主分頁是「メイン」）。可以用預覽上方的「預覽分頁」切換看看秘匿分頁的樣子。',
    style: '樣式',
    styles: {
      plain: '純文字',
      band: '底色帶',
      underline: '下底線',
      tab: '頁籤',
      lines: '延伸線',
    },
    font: '字型',
    size: '大小',
    color: '文字顏色',
    lineColor: '線條／頁籤顏色',
    bandColor: '色帶顏色',
    align: '對齊',
    aligns: { left: '靠左', center: '置中', right: '靠右' },
    alignHint: '也決定參加者頭像列的位置；延伸線樣式一律置中。',
    gap: '下方間距',
    lock: '秘匿分頁的鎖頭',
  },

  /* ---------- 參加者 ---------- */
  participants: {
    section: '參加者頭像（秘匿分頁）',
    description:
      '設定了參加者的秘匿分頁，CCFOLIA 會在標頭多一列參加者的頭像（是各帳號的大頭貼，不是角色圖）；主分頁沒有這一列。',
    show: '顯示參加者頭像',
    prefix: '前綴文字',
    prefixPlaceholder: '例如：參加者',
    prefixHint: '顯示在頭像左邊，使用標題的字型與文字顏色；空白就不顯示。',
    prefixSize: '前綴文字大小',
    size: '頭像大小',
    gap: '頭像間隔',
    gapHint: '負值會互相重疊（左邊的蓋在右邊上面）。',
    ring: '頭像外圈',
    ringColor: '外圈顏色',
  },

  /* ---------- 方框 ---------- */
  box: {
    section: '方框',
    shape: '方框形狀',
    shapes: { card: '每則一框', bubble: '對話泡泡', none: '無框' },
    bg: '方框背景',
    border: '方框外框',
    borderColor: '外框顏色',
    radius: '方框圓角',
    shadow: '方框陰影',
    padX: '內側留白（左右）',
    padY: '內側留白（上下）',
    accent: '左側線條',
    accents: { none: '無', character: '角色色', custom: '指定色', outcome: '依成敗' },
    accentWidth: '線條粗細',
    accentColor: '線條顏色',
    accentColorOutcome: '線條顏色（非擲骰訊息）',
    accentNote:
      '角色色＝該角色在 CCFOLIA 裡的名字顏色。依成敗：成功、失敗、其他擲骰分別用「文字」分頁擲骰結果的三個顏色，不是擲骰的訊息用上面的線條顏色。',
    outcomeGlow: '成敗時外框發光',
    outcomeGlowHint: '成功、失敗的訊息，方框外框換成結果色並發光（外框粗細 0 時只有光）。',
    divider: '訊息分隔線',
    dividerColor: '分隔線顏色',
  },

  /* ---------- 頭像 ---------- */
  avatar: {
    section: '角色頭像',
    show: '顯示角色頭像',
    size: '頭像大小',
    shape: '形狀',
    shapes: { square: '方形', rounded: '圓角方形', circle: '圓形' },
    border: '頭像外框',
    borderColor: '外框顏色',
    gap: '頭像與文字間距',
    align: '垂直對齊',
    aligns: { top: '上緣', center: '置中' },
    alignHint: '長訊息慢慢捲動時一律上緣對齊。',
  },

  /* ---------- 名稱 ---------- */
  name: {
    section: '名稱',
    show: '顯示名稱',
    style: '名稱樣式',
    styles: { plain: '純文字', underline: '底線', pill: '膠囊', prefix: '「名稱：」' },
    styleHint: '「名稱：」會把名稱接在內文最前面；底線一律是角色色。',
    font: '字型',
    size: '大小',
    colorMode: '名稱顏色',
    colorModes: { character: '角色色', custom: '指定色' },
    color: '指定色',
    gap: '名稱與內文間距',
    time: '顯示發言時間',
    timeColor: '時間顏色',
  },

  /* ---------- 內文 ---------- */
  body: {
    section: '內文',
    font: '字型',
    size: '大小',
    color: '文字顏色',
    colorHint: '也是視窗裡其他沒有指定顏色的文字的顏色。',
    lineHeight: '行高',
    letterSpacing: '字距',
    effect: '文字效果',
    effects: { soft: '柔和陰影', stroke: '描邊', glow: '發光', none: '無' },
    effectHint: '同時套用到名稱與擲骰結果（膠囊名稱與色塊結果除外）。',
    effectColor: '效果顏色',
    effectWidth: '描邊粗細',
    clamp: '長訊息截斷',
    clampUnit: '行',
    clampOff: '不截斷',
    clampHint: '超過行數的部分以「…」截斷（內文與接在後面的擲骰結果合計）。',
    localFontNote:
      '有字型選了電腦字型：跑 OBS 的電腦也要安裝同一套字型，否則會退回一般黑體；字型沒有中文字時只有中文字退回。',
  },

  /* ---------- 擲骰結果 ---------- */
  result: {
    section: '擲骰結果',
    font: '字型',
    size: '大小',
    style: '樣式',
    styles: { plain: '純文字', outline: '外框', solid: '色塊' },
    break: '結果另起一行',
    success: '成功',
    failure: '失敗',
    other: '其他',
    colors: '結果顏色',
    glow: '成功與失敗發光',
    flash: '出現瞬間閃一下',
    note: '顏色依 CCFOLIA 的分類：「成功」含特殊成功、決定的成功；「失敗」含大失敗、致命的失敗；沒有成敗判定的擲骰（例如 2D6、傷害骰）算「其他」。別人的秘密擲骰沒有結果，不會上色。這個分類靠 CCFOLIA 自動產生的 class，CCFOLIA 改版時可能失效。',
  },

  /* ---------- 動態 ---------- */
  motion: {
    section: '動態',
    enter: '進場',
    enters: {
      none: '無',
      fade: '淡入',
      up: '由下往上',
      down: '由上往下',
      left: '由右往左',
      right: '由左往右',
      pop: '放大彈出',
      blur: '由模糊變清楚',
    },
    enterDuration: '進場時間',
    scroll: '長訊息慢慢捲動',
    scrollHint: '只顯示一則時，比視窗高的訊息會在等待後慢慢往上捲到最後。',
    scrollWarn: '則數不是 1，不會捲動（開關打開的當下會自動改成 1 則、填滿來源）。',
    scrollDelay: '開始前等待',
    scrollDuration: '捲完所需時間',
    scrollAdjusted: (parts: string[]) => `已開啟長訊息捲動，並把${parts.join('、')}。`,
    scrollAdjustCount: '則數改成 1',
    scrollAdjustFill: '視窗改成填滿來源',
    fade: '過一段時間後消失',
    fadeStay: '消失前停留',
    fadeDuration: '消失速度',
    notes: [
      '消失適合「只在擲骰當下顯示」的視窗；消失的位置會由其他訊息遞補上來。',
      'OBS 重新載入來源時，已經消失的訊息會再播一次進場，照時間再消失一次。',
      '預覽每次改設定都會從頭重播；訊息全部消失後，用預覽下方的測試訊息再確認。',
      '捲動速度不會隨長度調整（越長捲得越快）；有捲動時，消失從捲完才開始計時。',
    ],
  },

  /* ---------- OBS ---------- */
  obs: {
    section: 'OBS 與房間',
    room: '房間網址',
    roomPlaceholder: 'https://ccfolia.com/rooms/…（或只貼房間 ID）',
    roomHint: '貼上 CCFOLIA 房間的網址或房間 ID，下面會產生要填進 OBS 的聊天頁網址（/chat 結尾）。',
    url: '瀏覽器來源網址',
    urlPlaceholder: '填好房間網址後會出現在這裡',
    hoverTabs: '只在滑鼠移上時顯示分頁',
    hoverTabsHint:
      '在 OBS 的來源上按右鍵選「互動」，把滑鼠移到畫面上就會出現 CCFOLIA 的分頁列，用來切換要顯示的分頁；直播畫面上不會出現。',
    guide: '在 OBS 裡設定',
    guideUrlLabel: '房間網址＋/chat 的聊天頁',
    twoSources:
      '要同時顯示「擲骰用」與「秘匿分頁用」：再新增一個瀏覽器來源，填同一個聊天頁網址、貼上各自的 CSS；只有秘匿用的那個要在「互動」裡切到秘匿分頁。',
    rememberTab:
      'CCFOLIA 不會記住選的分頁：重新開啟 OBS 後要再選一次。瀏覽器來源屬性的「看不見時關閉」「場景切到使用中時重新整理」有勾的話，切換場景也會回到主分頁。',
    messageBox: '台詞想用房間下方的附立繪訊息框呈現時，可以搭配',
    messageBoxLink: '訊息框產生器',
    messageBoxTail:
      '：那邊的擲骰只顯示最後「＞ 成功」一段，建議台詞用訊息框、完整的擲骰結果用這個聊天視窗（兩個瀏覽器來源，登入狀態共用）。',
    troubleshoot:
      '畫面一片空白：多半是瀏覽器來源還沒登入 CCFOLIA（照上面的登入步驟），或網址不是 /chat 結尾。秘匿分頁只有參加者的帳號看得到。',
  },

  /* ---------- 預覽 ---------- */
  preview: {
    label: '聊天視窗預覽',
    tab: '預覽分頁',
    tabs: { main: '主分頁', secret: '秘匿分頁' },
    sizeNote: '粉紅虛線是瀏覽器來源的範圍',
    hoverNote: '；滑鼠移到預覽上就會出現分頁列',
  },

  /* ---------- 測試訊息 ---------- */
  test: {
    section: '測試訊息',
    description:
      '在目前的預覽分頁最後加一則範例訊息，看看新訊息進來時的樣子。只影響預覽，不會寫進 CSS，也不會存檔。',
    kinds: {
      chat: '聊天',
      success: '擲骰成功',
      failure: '擲骰失敗',
      other: '擲骰無成敗',
      secret: '別人的秘密擲骰',
      long: '長文',
      system: '系統訊息',
    },
    custom: '自訂測試訊息',
    composerKinds: { chat: '聊天', success: '成功', failure: '失敗', other: '無成敗' },
    resultExample: 'CC<=50 | (1D100<=50) ＞ 23 ＞ 成功',
    placeholder: '內文；擲骰時在「|」後面寫結果',
    reset: '回到初始訊息',
    resetDone: (tab: string) => `${tab}的訊息已回到初始的範例訊息。`,
    sent: (tab: string, kind: string) => `已在${tab}送出一則「${kind}」測試訊息。`,
    hiddenDiceOnly: '目前只列出擲骰訊息，所以這則不會顯示。',
    hiddenSystem: '目前隱藏系統訊息，所以這則不會顯示。',
    longHint: '長文比視窗高時只看得到一部分；「動態」分頁的「長訊息慢慢捲動」可以讓它慢慢捲完。',
  },

  /* ---------- 輸出 ---------- */
  output: {
    section: '輸出',
    fileName: '檔案名稱',
    fileNameHint: '下載 CSS 與專案檔共用的檔名；Windows 不能用的字元會換成「_」。',
    urlLabel: '瀏覽器來源網址',
    missingUrl:
      '還沒有填房間網址。OBS 要開房間網址＋/chat 的聊天頁；直接用房間網址會拍到整個房間畫面。',
    gotoRoom: '前往房間網址',
    copied: (w: number, h: number, room: boolean) =>
      `已複製 CSS。請把瀏覽器來源設成寬 ${w} × 高 ${h}，再把內容貼進「自訂 CSS」欄（先清空原有的內容）。${room ? '' : '網址必須是 /chat 結尾的聊天頁。'}`,
    copyFailed: '無法自動複製。已展開「查看 CSS」並選取全文，請按 Ctrl＋C（Mac：⌘＋C）手動複製。',
    saved: (name: string) => `已儲存「${name}」。`,
    urlCopied: '已複製網址，請設成 OBS 瀏覽器來源的「網址」。',
    urlCopyFailed: '無法自動複製網址，請選取欄位裡的網址後按 Ctrl＋C 複製。',
  },

  /* ---------- 專案、狀態列 ---------- */
  project: {
    saved: (name: string) => `已存成專案檔「${name}」。`,
    opened: (name: string) => `已開啟專案檔「${name}」。`,
    openFailed: (msg: string) => `無法開啟專案檔：${msg}`,
    resetLabel: '全部重來…',
    resetTitle: '全部重來？',
    resetDescription:
      '目前的設定會全部清除，回到開頁時的樣子（第 1 個範本、來源 480 × 460、房間空白），也無法復原。',
    resetDone: '已全部重來。',
  },
  ready: '準備完成。改設定會即時反映在右邊的預覽；做好後按「複製 CSS」。',
  undo: '復原（Ctrl＋Z）',
  redo: '重做（Ctrl＋Y）',
  shortcutsGroup: '編輯',

  /* ---------- 說明 ---------- */
  usage: {
    steps: [
      '在「基本」挑一個範本按「套用」，再依需要調整則數、來源大小。',
      '在「視窗」「訊息」「文字」「動態」調整外觀；右邊的預覽會即時更新，可以用下方的測試訊息看新訊息進來的樣子。',
      '在「OBS」貼上 CCFOLIA 的房間網址，複製產生的聊天頁網址（/chat 結尾）。',
      '按「複製 CSS」，照「OBS」分頁的說明新增瀏覽器來源、填網址與寬高，把 CSS 貼進「自訂 CSS」欄。',
    ],
    notes: [
      '設定會自動存在這個瀏覽器裡；要做好幾份（例如擲骰用、秘匿用）時，可以用「專案」存成不同的專案檔。',
      '預覽是依 CCFOLIA 的頁面結構模擬的；實際效果以 OBS 裡看到的為準。',
    ],
    disclaimer: '本工具與 CCFOLIA 官方無關；CCFOLIA 改版時可能需要重新產生 CSS。',
  },
} as const;
