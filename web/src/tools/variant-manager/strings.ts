/** 角色差分管理器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */

/** 差分名建議（F19；新版自選，涵蓋喜怒哀樂與常見狀態） */
export const SUGGESTIONS: readonly string[] = [
  '普通',
  '微笑',
  '大笑',
  '開心',
  '生氣',
  '暴怒',
  '難過',
  '哭泣',
  '驚訝',
  '害羞',
  '疑問',
  '困惑',
  '傻眼',
  '得意',
  '認真',
  '閉眼',
  '眨眼',
  '睡著',
  '冷汗',
  '害怕',
  '受傷',
  '戰鬥',
  '瘋狂',
];

export const S = {
  /* 載入 */
  sectionLoad: '載入圖片',
  dropLabel: '把差分圖拖到這裡，或點一下選擇檔案',
  dropButton: '選擇圖片',
  dropHint: 'PNG、JPEG、WebP，可以多選，也可以分幾次加入',
  fileCount: (n: number) => `共 ${n} 個檔案`,

  /* 命名 */
  sectionNaming: '命名',
  mainName: '主名稱',
  mainPlaceholder: '例：lin_xiaoyu',
  mainHint:
    '所有檔名的開頭；空白時用 character。主名稱是空的時候，載入圖片會自動用第一張的檔名帶入。',
  numbered: '加上編號',
  numberedHint: '主名稱後面接兩位數的序號（01、02…），跟著清單順序走。',

  /* 清單 */
  sectionList: '差分清單',
  listLabel: '差分清單',
  listEmpty: '還沒有圖片。先在上面載入同一個角色的差分圖。',
  listHint: '點一列選取；按住一列拖到別列可以調整順序；↑／↓ 切換選取的那張。',
  variantLabel: (n: number) => `第 ${n} 張的差分名`,
  variantPlaceholder: '差分名（例：微笑）',
  outputLabel: '輸出檔名',
  remove: (name: string) => `移除「${name}」`,

  /* 大圖 */
  previewLabel: '選取中的差分',
  stageLabel: '大圖預覽',
  variantTag: '差分名',
  variantEmpty: '（未輸入）',
  noImage: '沒有圖片',
  noFileName: '-',
  previewEmpty: '載入圖片後，選取中的那張會在這裡放大顯示。',
  previewBroken: '這張圖片無法顯示（檔案可能已損壞）；匯出時仍會原封放進 ZIP。',

  /* 建議 */
  suggestionsTitle: '差分名建議',
  suggestionsHint: '點一下就填進選取中那張的差分名。',

  /* 聊天面板 */
  paletteTitle: '聊天面板文字',
  palettePlaceholder: '@普通\n@微笑\n@生氣',
  paletteHint:
    '貼進 CCFOLIA 角色的聊天面板，發言時點一下就能切換成同名的差分；差分名空白的圖片不會列出。',
  paletteLines: (n: number) => `共 ${n} 行`,
  copy: '複製聊天面板文字',

  /* 匯出 */
  exportZip: '匯出 ZIP',
  zipName: (name: string) => `ZIP 檔名：${name}`,
  reset: '重設',

  /* 狀態列 */
  status: {
    initial: '先載入同一個角色的差分圖（PNG、JPEG、WebP），再替每一張填上差分名。',
    added: (added: number, total: number) => `已加入 ${added} 張，清單共 ${total} 張。`,
    addedNone: (total: number) => `加入 0 張：這些檔案都已經在清單裡（清單共 ${total} 張）。`,
    noImages: '沒有可用的圖片：只能載入圖片檔（PNG、JPEG、WebP 等）。',
    needImage: '請先載入並選取一張圖片。',
    reordered: '已調整順序。',
    numberedOn: '編號：開（檔名加上 01、02…）。',
    numberedOff: '編號：關。',
    removed: (name: string) => `已移除「${name}」。`,
    zipping: '正在打包 ZIP…',
    zipStarted: (name: string, n: number) => `已開始下載 ${name}（${n} 張圖片＋聊天面板文字）。`,
    zipFailed: (detail: string) => `ZIP 匯出失敗${detail ? `：${detail}` : ''}。請再試一次。`,
    copied: (n: number) => `已複製聊天面板文字（${n} 行）。`,
    copyMaybeFailed: '無法自動複製，文字已全選；若沒有成功，請按 Ctrl＋C（Mac 為 ⌘＋C）手動複製。',
    reset: '已重設，清單與所有輸入都已清空。',
  },
  zipToast: 'ZIP 已開始下載',

  /* 重設確認 */
  resetTitle: '重設？',
  resetDescription: '會清空圖片清單、主名稱與所有差分名，編號回到開啟。這個動作無法復原。',
  resetConfirm: '重設',

  /* 快捷鍵 */
  keyGroupFiles: '檔案',
  keyGroupEdit: '命名與選取',
  keyOpen: '選擇圖片',
  keyExport: '匯出 ZIP',
  keyCopy: '複製聊天面板文字（Ctrl＋Shift＋C 會開啟瀏覽器的開發者工具，所以改用 L）',
  keyNumbered: '切換編號',
  keySelect: '選取上一張／下一張（不在文字欄裡時）',
  keyReset: '重設（會先確認；說明或快捷鍵視窗開著時是關閉視窗）',

  disclaimer: '本工具與 CCFOLIA 官方無關。圖片只在瀏覽器裡處理，不會上傳，也不會保存。',

  /* 使用方式 */
  usageIntro:
    '把同一個角色的表情差分整理成一致的檔名、打包成 ZIP，並產生 CCFOLIA 聊天面板用的「@差分名」清單。',
  usageSteps: [
    '把差分圖拖進「載入圖片」，或點一下選擇檔案；可以分幾次加入，已經在清單裡的檔案會略過。',
    '填主名稱（檔名的開頭）。主名稱是空的時候，會用第一張的檔名自動帶入，並去掉結尾的表情詞（例如「_smile」「-微笑」）。',
    '在每一列填差分名，或選取一張後點「差分名建議」。按住一列拖曳可以調整順序，↑／↓ 可以切換選取的那張，右邊會放大顯示。',
    '需要時關掉「加上編號」，確認輸出檔名後按「匯出 ZIP」。圖片會以新檔名原封打包（不重新壓縮），並附上聊天面板文字檔。',
    '在 CCFOLIA 替角色登錄差分圖時，差分名要和這裡填的一樣；再把聊天面板文字貼進角色的聊天面板，之後點一下就能切換表情。',
  ],
  usageNotesTitle: '注意事項',
  usageNotes: [
    '檔名＝主名稱＋兩位數編號＋「_差分名」＋原本的副檔名（轉成小寫，沒有副檔名時用 png）。',
    '空白會換成「_」，\\ / : * ? " < > | 會被刪掉；聊天面板文字也用清理後的差分名。',
    'ZIP 裡檔名重複時會自動在後面加上 _2、_3…，不會互相覆蓋。',
    '圖片與設定都不會保存，重新整理後回到初始狀態。',
  ],
} as const;
