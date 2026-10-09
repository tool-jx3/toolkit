/** 立繪尺寸統一器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */
export const S = {
  dropLabel: '把 PNG／WebP 立繪拖到這裡',
  dropHint: 'PNG、WebP，可一次多選，也可以分幾次加入',
  dropButton: '選擇圖片',
  listLabel: '已載入的立繪',
  listEmpty: '還沒有載入立繪。',
  remove: (name: string) => `移除「${name}」`,
  processed: '已處理',
  sizeMeta: (w: number, h: number) => `${w} × ${h} px`,

  process: '處理',
  downloadAll: '全部下載',
  clear: '清除',

  sectionProcess: '處理選項',
  trim: '去除透明留白',
  trimHint: '裁掉四周完全透明的部分（只要有一點點不透明就算內容）。',
  align: '統一寬度',
  alignHint: '以最寬的那張為準，左右補透明邊、水平置中；不縮放、不改高度。',
  processHint: '改了處理選項要再按一次「處理」。',
  optionsChanged: '處理選項已變更，請再按一次「處理」；現在下載的仍是上次的結果。',

  sectionOutput: '輸出格式',
  webp: '輸出為 WebP',
  webpHint: '關閉時沿用原格式：PNG 輸出 PNG，WebP 輸出無損 WebP。',
  quality: 'WebP 品質',
  qualityLossless: '無損',
  qualityCustom: '自選品質',
  qualityValue: '品質',
  qualityHint: '100% 也是無損。輸出格式在下載時才套用，改了不必重新處理。',
  qualityDisabledHint: '只在輸出為 WebP 時使用。',
  webpUnsupported: '這個瀏覽器不能輸出 WebP，下載時會改存成 PNG。',

  loaded: (n: number) => `已載入 ${n} 個檔案。`,
  typeError: '只能載入 PNG 或 WebP 圖片。',
  processing: (i: number, n: number) => `處理中：第 ${i}／共 ${n} 張`,
  processDone: (n: number, width: number | null) =>
    width === null ? `處理完成：共 ${n} 張。` : `處理完成：共 ${n} 張，寬度統一為 ${width} px。`,
  readError: (name: string) =>
    `無法讀取「${name}」，檔案可能已損壞。處理已中止，請移除這個檔案後再試一次。`,
  canvasError: '無法建立畫布',
  processError: (detail: string) =>
    `處理時發生錯誤${detail ? `（${detail}）` : ''}，圖片可能太大。請減少張數或縮小圖片後再試一次。`,
  downloading: (i: number, n: number) => `下載中：第 ${i}／共 ${n} 張`,
  downloadingHint: '瀏覽器可能會詢問是否允許這個網站下載多個檔案，請選擇允許。',
  downloaded: (n: number) => `下載完成：共 ${n} 張。`,
  downloadError: '下載時發生錯誤，請再試一次。',

  disclaimer: '本工具與 CCFOLIA 官方無關。所有圖片都在瀏覽器裡處理，不會上傳。',

  usageIntro:
    'CCFOLIA 依圖片的寬度決定棋子大小。同一個角色的差分寬度不一樣時，換立繪棋子就會忽大忽小。這個工具把一批立繪統一成同樣的寬度，換差分時大小就不會跳動。',
  usageSteps: [
    '把同一個角色的差分（PNG 或 WebP）拖進來，或按「選擇圖片」；可以分幾次加入。',
    '確認處理選項（通常兩個都開著），按「處理」。',
    '縮圖會換成處理後的樣子，確認後按「全部下載」，一張一張存檔。',
    '在 CCFOLIA 把差分換成下載的圖片。',
  ],
  usageNotesTitle: '注意事項',
  usageNotes: [
    '去除透明留白：只要有一點點不透明的像素就算內容；整張透明的圖維持原尺寸。',
    '統一寬度只在左右補透明邊，不會縮放，也不會改高度。',
    '每張圖分開下載（不打包），檔名是原檔名換上新的副檔名；瀏覽器詢問是否允許多個下載時請選允許。',
    '圖片與設定都不會儲存，重新整理後回到預設。',
  ],
} as const;
