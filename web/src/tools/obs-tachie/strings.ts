/**
 * Discord 通話立繪產生器的介面文字（含輸出 CSS 裡的說明註解）。用詞照 DESIGN.md 第 5 節。
 */

export const S = {
  toolName: 'Discord 通話立繪產生器',

  steps: [
    { label: '使用者', description: '登錄 Discord ID 與名字' },
    { label: '立繪與效果', description: '圖片、位置、說話效果' },
    { label: '組合與輸出', description: '選人與外觀，複製 CSS' },
  ],
  stepsLabel: '步驟',

  /* ---------- 頁首 ---------- */
  undo: '復原（Ctrl＋Z）',
  redo: '重做（Ctrl＋Shift＋Z）',
  undoShort: '復原',
  redoShort: '重做',
  editGroup: '編輯',
  projectFileName: '通話立繪',

  /* ---------- 使用方式 ---------- */
  usage: [
    '用 Discord 語音通話跑團、以 OBS 直播時，把 Streamkit 語音小工具的小頭像換成常駐的立繪：說話時立繪會彈跳、發光或閃爍。',
    '① 登錄「誰」：Discord 使用者 ID 與畫面上要顯示的名字。',
    '② 製作「外觀」預設集：立繪圖片、位置與大小、說話效果、名字標籤。',
    '③ 選一組「人 × 外觀」，複製 CSS，貼到 OBS 瀏覽器來源的「自訂 CSS」。一組＝一個瀏覽器來源。',
    '所有資料只存在這個瀏覽器裡（圖片存在 IndexedDB）；換電腦時用「專案」選單存成專案檔帶過去。',
  ],

  /* ---------- ① 使用者 ---------- */
  users: {
    addTitle: '新增使用者',
    idLabel: 'Discord 使用者 ID',
    idPlaceholder: '例：123456789012345678',
    idHint: '貼上時多餘的空白、符號會自動去掉，只留數字。',
    memoLabel: '備忘名稱（選填）',
    memoPlaceholder: '例：阿明',
    nameLabel: '畫面上的名字（選填）',
    namePlaceholder: '例：艾琳・霍克',
    add: '新增',
    idError: '請輸入 Discord 使用者 ID（數字）。',
    added: (label: string) => `已新增「${label}」。`,
    replaced: (label: string) => `這個 ID 已經登錄過，已更新為「${label}」並移到最後。`,
    listTitle: '使用者',
    listLabel: '已登錄的使用者',
    empty: '還沒有使用者。先在上面填 Discord 使用者 ID 新增一位。',
    noMemo: '無名稱',
    idMeta: (id: string) => `ID ${id}`,
    displayName: '畫面上的名字',
    displayNameFor: (label: string) => `畫面上的名字（${label}）`,
    notSet: '未設定',
    removeTitle: (label: string) => `刪除使用者「${label}」？`,
    guideTitle: '這一步在做什麼',
    guide: [
      '這一步只決定「是誰」：立繪要跟著哪一個 Discord 帳號說話而動。外觀在第 2 步做。',
      'Discord 使用者 ID 的取得方式：Discord 的「使用者設定」→「進階」→ 開啟「開發者模式」；之後在使用者上按右鍵，選單最下面會出現「複製使用者 ID」（英文介面是 Copy User ID）。ID 是 17～20 位的數字。',
      '這個人要先設定自己的 Discord 頭像：沒有自訂頭像（用 Discord 預設頭像）的人，Streamkit 的頭像網址裡沒有 ID，工具認不出他，說話偵測與「不在頻道時隱藏」都會失效。',
      '「畫面上的名字」可以是任何文字（例如角色名），與 Discord 的帳號名稱無關；要不要顯示在立繪上，在第 2 步的「名字標籤」切換。空白時用備忘名稱。',
    ],
  },

  /** 清單標題附數量：使用者（3） */
  listTitle: (title: string, n: number) => `${title}（${n}）`,

  /* ---------- 刪除確認（使用者、預設集） ---------- */
  removeCombos: (list: string[]) =>
    `會一起刪除 ${list.length} 組已儲存的組合：${list.join('、')}。`,
  removeNoCombos: '沒有用到它的已儲存組合。',
  removeConfirm: '刪除',

  /* ---------- ② 預設集 ---------- */
  presets: {
    listTitle: '預設集',
    listLabel: '外觀預設集',
    add: '新增預設集',
    empty: '還沒有預設集。按「新增預設集」開始做第一套外觀。',
    unnamed: '未命名',
    noImage: '?',
    noImageLabel: '沒有圖片',
    editEmpty: '從上面的清單選一個預設集來編輯，或按「新增預設集」。',
    removeTitle: (label: string) => `刪除預設集「${label}」？`,
    nameLabel: '預設集名稱',
    namePlaceholder: '例：平常、戰鬥用',
    nameHint: '備忘用，只顯示在這個工具裡（下載的檔名也會用到）。',
    editing: (label: string) => `正在編輯：${label}`,
  },

  /* ---------- 立繪圖片 ---------- */
  image: {
    title: '立繪圖片',
    current: '目前的立繪',
    notSet: '未設定',
    loading: '讀取中…',
    missing: '這張圖片沒有存進這個瀏覽器（可能是容量不足），請重新設定。',
    modeLabel: '圖片來源',
    modeUpload: '上傳',
    modeUrl: '網址',
    maxWidthLabel: '嵌入時的最大寬度',
    maxWidthHint:
      '0＝原尺寸。比這寬的圖會等比縮小到這個寬度並改存成 PNG（較窄的圖不變）。只在「上傳」與「轉成嵌入」時有效；直接貼 data URI 或「直接用網址」時沒有作用。',
    dropLabel: '把立繪圖片拖到這裡',
    dropHint: 'PNG、JPEG、WebP、GIF，8 MB 以內',
    urlLabel: '圖片網址',
    urlPlaceholder: 'https://… 或 data:image/…',
    urlInvalid: '這不是 http(s) 開頭的網址，也不是 data URI。',
    urlModeLabel: '網址的處理方式',
    urlModes: {
      auto: '自動',
      direct: '直接用網址',
      embed: '轉成嵌入',
    },
    urlModeHint: {
      auto: '可以直接顯示的主機（Discord、imgur）保留網址，其他的下載後嵌進 CSS。',
      direct: 'CSS 裡直接寫網址。只有 Discord、imgur 等主機的圖片能在 Streamkit 上顯示。',
      embed: '一律下載後嵌進 CSS（data URI），之後不必連到原本的網址。',
    },
    apply: '套用網址',
    urlEmpty: '請先貼上圖片網址。',
    urlBad: '網址格式不正確：請貼 http:// 或 https:// 開頭的圖片網址，或 data URI。',
    processing: '處理中…',
    readFailed: '讀不出這張圖片，請換一個檔案（PNG、JPEG、WebP、GIF）。',
    uploaded: (desc: string) => `已設定（上傳的圖片已嵌入${desc}）。`,
    resizedNote: (w: number) => `，已縮小到寬 ${w}px 並存成 PNG`,
    set: (how: string) => `已設定（${how}）。`,
    how: {
      data: '已嵌入',
      direct: '直接用網址',
      embedded: '已轉成嵌入',
      expiringEmbedded: '連結會過期，已改嵌入',
      otherEmbedded: '不是可直接顯示的主機，已改嵌入',
    },
    warn: {
      expiring:
        '這是 Discord 的附件連結，約 24 小時後就會失效。建議下載圖片後改用上傳，或改用「轉成嵌入」。',
      other:
        '這個主機的圖片在 Streamkit 上可能會被擋（只有 Discord、imgur 等主機確定能顯示）。建議下載圖片後改用上傳。',
      embedFailed: (reason: string) => `轉成嵌入失敗，已改為直接用網址。${reason}`,
      expiringFailed: (reason: string) =>
        `這個 Discord 附件連結約 24 小時後會失效，而且轉成嵌入失敗。${reason}`,
      otherFailed: (reason: string) =>
        `這個主機的圖片在 Streamkit 上可能會被擋，而且轉成嵌入失敗。${reason}`,
    },
    saveFailed:
      '圖片太大，存不進這個瀏覽器：重新整理後這張圖片會不見（目前產生的 CSS 不受影響）。請用「專案」選單存成專案檔，或縮小圖片後重新上傳。',
  },

  /* ---------- 裁切 ---------- */
  crop: {
    title: '裁切',
    size: '目前尺寸',
    sizeLoading: '取得中…',
    sizeUnknown: '不明',
    bytes: '嵌入大小',
    notEmbedded: '直接參照網址（沒有嵌入）',
    offsetNote:
      '圖片四周有透明留白時，立繪的位置會偏移留白的量（位置以整張圖計算）。可以先修掉留白。',
    cannot:
      '這張圖是直接參照外部網址，讀不到像素，所以無法裁切。要裁切請下載圖片後改用上傳，或用「轉成嵌入」。',
    trim: '修掉透明留白',
    range: '指定範圍裁切',
    rangeTitle: '指定範圍裁切',
    noMargin: '沒有可修的留白（整張都不透明，或整張都是透明的）。',
    trimConfirmTitle: '修掉透明留白？',
    apply: '套用',
    cancel: '取消',
    applied: '已套用裁切。',
    failed: (reason: string) => `裁切失敗：${reason}`,
    warning: '套用後無法復原；要重來請重新匯入圖片。',
  },

  /* ---------- 位置與尺寸 ---------- */
  position: {
    title: '位置與尺寸',
    anchor: '基準位置',
    anchorNow: (label: string) => `目前的基準：${label}`,
    anchorHint:
      '選右、上、中央時，就算改了 OBS 畫布（瀏覽器來源）的解析度，立繪與那一邊（或中央）的距離也不變。',
    x: {
      left: '距左緣',
      right: '距右緣',
      center: '相對水平中央的偏移（正值往右）',
    },
    y: {
      bottom: '距下緣',
      top: '距上緣',
      center: '相對垂直中央的偏移（正值往上）',
    },
    marginNeed: (n: number) => `說話效果需要 ${n}px 的邊距`,
    marginWarn: (n: number) => `效果會被切掉，建議至少 ${n}px`,
    width: '寬度',
    widthPlaceholder: '原尺寸',
    widthHint: '空白或 0 以下＝圖片原尺寸。高度依比例自動計算。',
  },

  /* ---------- 說話效果 ---------- */
  effects: {
    title: '說話效果',
    description: '這個人說話時播放；全部關掉時說話也不會動。',
    toggles: '要播放的效果',
    bounce: '彈跳',
    glow: '外框光暈',
    blink: '閃爍',
    bounceHeight: '彈跳高度',
    bounceHint: '0＝不彈跳。',
    bounceOff: '彈跳沒有開，這個設定不會用到。',
    period: '週期',
    periodHint: '三種效果共用的一次來回時間（最短 50 毫秒）。',
    glowColor: '外框光暈的顏色',
    glowWidth: '外框寬度',
    glowOff: '外框光暈沒有開，這兩個設定不會用到。',
  },

  /* ---------- 名字標籤 ---------- */
  label: {
    title: '名字標籤',
    show: '顯示名字',
    showHint: '顯示第 1 步登錄的「畫面上的名字」（空白時用備忘名稱），不是 Discord 的帳號名稱。',
    x: '水平位置（正值往右）',
    y: {
      bottom: '垂直位置（正值往上，從立繪下緣算起）',
      top: '垂直位置（正值往上，從立繪上緣算起）',
      center: '垂直位置（正值往上，從立繪的垂直中央算起）',
    },
    size: '文字大小',
    color: '文字顏色',
    font: '字型',
    fontHint: '電腦字型只有跑 OBS 的電腦也有安裝時才會生效。',
    align: '對齊',
    alignOptions: { left: '靠左', center: '置中', right: '靠右' },
    alignWithin: (w: number) => `在寬度 ${w}px 內對齊`,
    alignActual: '（用的是圖片實際寬度，換圖要重新輸出）',
    alignOff: '沒有指定寬度、也還量不到圖片的寬度，無法對齊（名字會靠在基準位置那一側）。',
    toggles: '樣式',
    bold: '粗體',
    stroke: '描邊',
    bar: '字幕條',
    strokeWidth: '描邊寬度',
    strokeColor: '描邊顏色',
    strokeHint: '0＝不畫描邊。',
    strokeOff: '描邊沒有開，這兩個設定不會用到。',
    barWidth: '字幕條寬度',
    barWidthOptions: { fit: '配合文字', fill: '鋪滿立繪寬度' },
    barFillNoBase: '沒有基準寬度（沒有指定寬度、也量不到圖片寬度），實際會縮成文字的寬度。',
    barColor: '字幕條顏色',
    barOpacity: '不透明度',
    barRadius: '圓角',
    barPadX: '左右留白',
    barPadY: '上下留白',
    note: '一個瀏覽器來源只能畫一張立繪與一個名字；說話效果（彈跳、光暈、閃爍）與變暗不會套用在名字上。',
  },

  /* ---------- 其他 ---------- */
  other: {
    title: '其他',
    dim: '安靜時變暗',
    dimHint: '沒在說話（包括不在頻道）時立繪亮度降到一半；名字不變暗。',
    hide: '不在頻道時隱藏',
    hideHint: '只在這個人在語音頻道裡時顯示立繪與名字；關閉＝一直顯示。',
    reset: '選項恢復預設',
    resetHint: '位置、尺寸、效果、名字標籤、變暗、隱藏全部回到預設；保留名稱與圖片。',
    resetDone: '已恢復預設（名稱與圖片保留）。',
    compat:
      '說話偵測、安靜時變暗、不在頻道時隱藏都需要 OBS 31 以上（用到 CSS 的 :has()）。較舊的 OBS 立繪照常常駐顯示，只是說話時不會動。',
  },

  /* ---------- 預覽 ---------- */
  preview: {
    frameLabel: '立繪預覽',
    inChannel: '在頻道裡',
    status: {
      quiet: '通話中・安靜',
      speaking: '通話中・說話中',
      awayShown: '不在頻道（常駐顯示）',
      awayHidden: '不在頻道（此設定下不顯示）',
    },
    toggleHint: '點一下切換說話中／安靜',
    toggleAria: (status: string) => `預覽：${status}。按 Enter 或空白鍵切換說話中／安靜。`,
    toggleAwayAria: (status: string) => `預覽：${status}。不在頻道時無法切換說話。`,
    placeholderText: '立繪',
    provisionalName: '名字',
    provisionalNote: '還沒有使用者（或名字是空的），預覽暫時用「名字」顯示。',
    emptyNameWarn: '名字顯示開著，但這個人的名字是空的：輸出也不會有名字。',
    notes: [
      '棋盤格代表透明；以 1920 × 1080 的瀏覽器來源為基準等比縮小，所有長度都依同一個比例。',
      '在頻道裡時，點預覽畫面（或聚焦後按 Enter／空白鍵）可以切換說話中與安靜。',
      '寬度是原尺寸時，以圖片的實際尺寸顯示；還量不到尺寸時暫時用寬 384px 顯示。',
    ],
    noPreset: '新增預設集後，這裡會顯示預覽。',
    noCombo: '先在第 1 步登錄使用者、第 2 步新增預設集，這裡就會顯示選中那一組的預覽。',
    overview: '流程',
    overviewSteps: [
      '登錄要顯示立繪的人（Discord 使用者 ID）。',
      '做一套或多套外觀（立繪、位置、說話效果、名字）。',
      '選「人 × 外觀」，複製 CSS 貼到 OBS。一組＝一個瀏覽器來源。',
    ],
    counts: (u: number, p: number, c: number) =>
      `目前：使用者 ${u} 人、預設集 ${p} 個、已儲存組合 ${c} 組。`,
  },

  /* ---------- ③ 組合與輸出 ---------- */
  output: {
    comboTitle: '目前的組合',
    user: '使用者',
    preset: '預設集',
    needBoth: '先在第 1 步登錄使用者、第 2 步新增預設集，才能組合。',
    save: '儲存組合',
    saved: '已儲存',
    savedTitle: '已儲存的組合',
    savedLabel: '已儲存的組合',
    savedEmpty: '還沒有儲存任何組合。選好使用者與預設集後按「儲存組合」。',
    comboName: (user: string, preset: string) => `${user} × ${preset}`,
    guide: [
      '建議先用自己的 Discord ID 在 OBS 裡確認說話時立繪會動，開團前再把使用者換成玩家。',
      '輸出的 CSS 會立即跟著這裡的選擇與第 2 步的設定更新。',
    ],
    cssTitle: '輸出 CSS',
    cssNote:
      '一組「人 × 外觀」＝一個瀏覽器來源。立繪常駐在同一個位置，不在頻道時也一樣（除非開了「不在頻道時隱藏」）。',
    cssDisabled: '先選好使用者與預設集。',
    imagesLoading: '圖片讀取中…',
    copied: '已複製',
    copyFailed: '無法自動複製。已展開「查看 CSS」並選取全文，請按 Ctrl＋C（Mac：⌘＋C）手動複製。',
    savedFile: (name: string) => `已儲存「${name}」。`,
    alignWarn:
      '名字的對齊沒有寫進輸出：沒有指定寬度、也量不到圖片的寬度。在第 2 步指定寬度就會寫進去。',
    noImageWarn: '這組預設集還沒有立繪圖片，輸出只會有名字。',
    streamkitTitle: '先準備 Streamkit 的網址',
    streamkitSteps: [
      '開 Discord StreamKit Overlay 網站，選「Install for OBS」→ 語音小工具（Voice Widget），選伺服器與語音頻道，複製網站產生的網址。',
      '跑 OBS 的電腦要開著 Discord 桌面程式，並在 Streamkit 網站授權。',
      '不要勾「只顯示說話中的人」（網址裡的 limit_speaking=true）：沒說話的人會從頁面消失，「不在頻道時隱藏」就會變成「沒說話就隱藏」。',
    ],
    obsUrlLabel: 'Streamkit 網站產生的語音小工具網址（每一組都用同一個網址）',
    obsSize: '與 OBS 畫布相同（例如 1920 × 1080），位置才會和預覽一致',
    obsFeatures: ['說話偵測', '安靜時變暗', '不在頻道時隱藏'],
    disclaimer: '本工具與 Discord 官方無關；Streamkit 改版時可能需要重新產生 CSS。',
  },

  /* ---------- 輸出 CSS 的說明註解 ---------- */
  css: {
    noUser: '還沒有選擇使用者：請先在「Discord 通話立繪產生器」登錄使用者。',
    title: (who: string, preset: string) => `Discord 通話立繪：${who} × ${preset}`,
    exampleUrl: 'https://streamkit.discord.com/overlay/voice/{伺服器ID}/{頻道ID}',
    urlNote: 'Streamkit 網站產生的語音小工具網址',
    sizeNote: '建議與 OBS 畫布相同',
    oneSource: '一個瀏覽器來源只畫一個人的立繪與名字；要顯示其他人，請再新增一個瀏覽器來源。',
    hideStreamkit:
      'Streamkit 原本的頭像、名字與底框全部不顯示，只拿來判斷這個人在不在頻道、有沒有在說話。',
    layer: (who: string) =>
      `立繪：${who}。整頁只用一個頁面層畫立繪，固定在指定位置（常駐顯示，與頻道裡的人數、順序無關）。`,
    drawSize: (w: number, h: number) =>
      `繪製尺寸 ${w} × ${h}px（依圖片實際尺寸算出；換了圖片要重新產生 CSS）。`,
    drawFallback: '量不到圖片的實際尺寸，以圖片本身的大小繪製（有指定寬度時依比例縮放）。',
    noImage: '這組預設集還沒有立繪圖片。',
    effects: (list: string, period: number) => `說話時：${list}，週期 ${period}ms。`,
    bounce: (j: number) => `彈跳 ${j}px`,
    glow: (w: number) => `外框光暈（寬 ${w}px）`,
    blink: '閃爍',
    dim: '安靜時（包括不在頻道）立繪亮度降到一半。',
    hide: '不在語音頻道時隱藏立繪。',
    hideWithName: '不在語音頻道時隱藏立繪與名字。',
    name: (text: string) => `名字：${text}（Discord 的帳號名稱已隱藏）。`,
    nameBase: (w: number) => `名字的基準寬度 ${w}px。`,
    nameBaseActual: (w: number) =>
      `名字的基準寬度 ${w}px（圖片的實際寬度；換了圖片要重新產生 CSS）。`,
  },
} as const;
