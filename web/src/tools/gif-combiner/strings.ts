/** GIF 接合器的介面文字（台灣繁體中文） */
export const S = {
  usage: [
    '加入幾張 GIF（也可以拖進來或貼上）。每張會照自己原本的速度不停循環。',
    '在預覽上拖曳動圖移動、拉右下角的圓點改大小；靠近畫布邊緣或其他動圖的邊時會自動貼齊。',
    '或設定橫向、縱向格數，按「排列」一次排成格線。',
    '設定影格率與總播放時間後匯出。總播放時間會自動改成最長那張動圖的長度，可以再改。',
  ],
  about: '所有處理都在這台電腦的瀏覽器裡進行，檔案不會上傳。',

  files: {
    title: '動圖',
    drop: '把 GIF 拖到這裡',
    pick: '選擇 GIF',
    hint: 'GIF、APNG、WebP 動圖或一般圖片，可以一次選多個。',
    listLabel: '已加入的動圖',
    empty: '還沒有加入動圖。',
    up: '上移',
    down: '下移',
    remove: (name: string) => `刪除「${name}」`,
    reorderHint:
      '清單越下面的動圖疊在越上層；上下移會把疊放順序改成清單順序。格線排列也照這個順序。',
    loading: (n: number) => `讀取中…（還有 ${n} 個檔案）`,
    failed: (name: string) => `處理這個檔案時出錯了：${name}`,
    truncated: (name: string, n: number) => `「${name}」超過 ${n} 格，只用了前 ${n} 格。`,
    notSaved: '動圖沒辦法儲存在這個瀏覽器（重新整理後會消失）；需要保留時請存成專案檔。',
    settingsNotSaved:
      '排版與設定沒辦法儲存在這個瀏覽器（重新整理後會消失）；需要保留時請存成專案檔。',
    restoredMissing: (n: number) => `有 ${n} 張動圖沒有儲存在瀏覽器裡，已從畫布拿掉。`,
    untitled: '未命名',
  },

  canvas: {
    title: '畫布',
    width: '寬',
    height: '高',
    background: '背景色',
    transparent: '透明背景',
    transparentHint:
      'GIF 只有全透明或不透明：不透明度未滿一半的地方變透明。APNG、WebP 保留半透明。',
  },

  grid: {
    title: '格線排列',
    cols: '橫向格數',
    rows: '縱向格數',
    arrange: '排列',
    arrangeHint: '依目前的畫布尺寸切成格子，每張等比縮放、置中放進一格（排列時不會把比例壓扁）。',
    square: '正方格',
    squareHint: (w: number, h: number) => `畫布改成 ${w} × ${h} px（每格 250 px）再排列。`,
    tight: '去掉留白',
    tightHint: '以第一張動圖的大小為一格，畫布剛好排滿；每張都拉成第一張的大小（不維持比例）。',
    needItems: '「排列」與「去掉留白」要先加入動圖。',
  },

  output: {
    scale: '輸出倍率',
    scaleHint: (w: number, h: number) => `輸出 ${w} × ${h} px。倍率調小可以縮小檔案。`,
    duration: '總播放時間',
    durationHint: (n: number, step: number) =>
      `每 ${step} ms 取一格，共 ${n} 格。加入或刪除動圖時會自動改成最長那張的長度。`,
    fpsHint: '每格間隔＝1000 ÷ 影格率（取整數毫秒）。GIF 最多 50。',
    loopHint: '各張動圖在合成裡一律不停循環；這裡設定的是輸出檔案播幾次。',
    empty: '還沒有加入動圖，請先加入至少一張。',
    tooHeavy:
      '處理量太大（寬 × 高 × 影格數超過 2.2 億），請調小輸出倍率、降低影格率或縮短總播放時間。',
  },

  preview: {
    stage: '排版區',
    editor: '排版區的動圖',
    size: (w: number, h: number) => `${w} × ${h} px`,
    remove: (name: string) => `刪除「${name}」`,
    emptyTitle: '把 GIF 拖進來開始',
    emptyHint: '加入後可以拖曳排版、拉右下角改大小。',
  },

  keys: {
    edit: '編輯',
    layout: '排版',
    undo: '復原',
    redo: '重做',
    open: '加入動圖',
    play: '播放／暫停',
    nudge: '移動選取的動圖 1 px',
    nudge10: '移動選取的動圖 10 px',
    remove: '刪除選取的動圖',
    deselect: '取消選取',
  },

  project: {
    invalid: '這不是 GIF 接合器的專案檔。',
    newer: '這個專案檔是較新的版本，請更新頁面後再開啟。',
    missing: '專案檔裡少了動圖檔，無法開啟。',
    broken: (name: string) => `專案檔裡的動圖無法解碼：${name}`,
    notSaved: '專案檔裡的動圖沒辦法儲存在這個瀏覽器（重新整理後會消失，要再開一次專案檔）。',
    resetTitle: '全部重設？',
    resetDescription: '會清掉所有動圖，數值回到預設。這個動作無法復原。',
  },
} as const;
