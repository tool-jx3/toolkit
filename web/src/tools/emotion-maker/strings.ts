/**
 * 表情產生器的介面文字（台灣繁體中文；用詞照 DESIGN.md 第 5 節）。
 */
import type { Category } from './logic';

export const CATEGORY_LABELS: Record<Category, string> = {
  eyes: '眼睛',
  brows: '眉毛',
  mouth: '嘴巴',
  deco: '裝飾',
};

export const S = {
  /* 部件 */
  partsTitle: '部件',
  partsHint: '眼睛、眉毛、嘴巴各選一種（再點一次取消），裝飾可以疊很多個。',
  addImage: '加圖片',
  addImageLabel: (category: string) => `在「${category}」加入自訂圖片`,
  partsEmpty: '這一類沒有選項。',

  /* 編輯區 */
  editorTitle: '編輯區',
  editingBadge: '編輯中',
  previewLabel: (summary: string) => `表情預覽：${summary}`,
  label: '標籤',
  labelHint: '清單裡的標題，也是合輯圖格子下方的文字；可以換行。',
  labelPlaceholder: '例：今天也要加油！',
  showText: '合輯圖格子下顯示文字',
  save: '儲存表情',
  update: '完成修改',
  cancelEdit: '取消編輯',
  random: '隨機',
  reset: '重設',
  resetLabel: '重設編輯區',
  layersTitle: '裝飾圖層',
  layersHint: '上面的圖層在前面，會蓋住下面的。',
  layersEmpty: '目前沒有裝飾。',
  layersLabel: '裝飾圖層（上面＝前面）',
  layerUp: '往前一層',
  layerDown: '往後一層',
  layerName: (order: number, name: string) => `${order}. ${name}`,
  layerRemove: (name: string) => `移除裝飾「${name}」`,

  /* 清單 */
  listTitle: '表情清單',
  listEmpty: '還沒有表情。先在「部件」選好眼睛、眉毛、嘴巴或裝飾，再按「儲存表情」。',
  untitled: '無標籤',
  checkedLabel: (checked: number, total: number) => `合輯圖已選 ${checked}／共 ${total}`,
  clearAll: '全部清空',
  presets: '加入預設表情',
  openSheet: '合輯圖',
  exportList: '匯出清單',
  importList: '匯入清單',

  /* 摘要 */
  emptyExpression: '空白表情',
  decoCount: (count: number) => `裝飾×${count}`,
  noText: '不顯示文字',
  summarySep: ' · ',
  copySuffix: '（複製）',
  defaultPartName: '部件',
  thisExpression: '此表情',

  /* 通知 */
  saved: '已儲存',
  updated: '已修改',
  needPart: '請至少選一個部件',
  duplicated: '已複製',
  notImage: '選的檔案不是圖片',
  addedParts: (category: string, count: number) => `已在「${category}」新增 ${count} 張`,
  skippedFiles: (count: number) => `略過 ${count} 個不是圖片的檔案。`,
  partsNotSaved: (count: number) => `瀏覽器空間不足，${count} 張圖片無法儲存，重新整理後會消失。`,
  partsUnavailable: '這個瀏覽器無法儲存圖片，重新整理後自訂部件的圖片會消失。',
  partRemoved: (name: string) => `已刪除自訂部件「${name}」`,
  listNotSaved: '瀏覽器空間不足，表情清單無法自動儲存。',
  partsMissing: (count: number) => `有 ${count} 個自訂部件的圖片找不到，圖不會畫出來。`,
  noneChecked: '沒有勾選的表情',
  deletedChecked: (count: number) => `已刪除 ${count} 個`,
  cleared: '已清空表情清單',
  presetsAdded: (count: number) => `已加入 ${count} 個預設表情`,
  needChecked: '請勾選要放進合輯圖的表情',
  exportEmpty: '清單是空的，沒有可以匯出的表情',
  exported: (count: number) => `已匯出 ${count} 個表情`,
  imported: (count: number) => `已匯入 ${count} 個`,
  importFailed: '匯入失敗',
  importEmpty: '這個檔案裡沒有表情',
  importBadData: '檔案內容不是表情清單。',
  builtinFailed: (names: string) => `有內建部件畫不出來：${names}`,
  sheetFailed: '合輯圖產生失敗',
  sheetTooLarge: (w: number, h: number) =>
    `合輯圖太大（${w} × ${h} px），瀏覽器畫不出來；請減少欄數、格子大小或勾選的數量。`,

  /* 確認 */
  confirmDelete: (label: string) => `刪除「${label}」？`,
  confirmDeleteChecked: (count: number) => `刪除勾選的 ${count} 個表情？`,
  confirmClear: (count: number) => `清空全部 ${count} 個表情？`,
  confirmClearDescription: '自訂部件會留著。這個動作無法復原。',
  confirmPresets: (count: number) => `加入 ${count} 個預設表情？`,
  confirmPresetsDescription: (current: number) => `會加在目前清單（${current} 個）的最後面。`,
  confirmPresetsOk: '加入',
  confirmRemovePart: (name: string) => `刪除自訂部件「${name}」？`,
  confirmRemovePartDescription: '用到這個部件的表情會拿掉它，其他部件保留。',
  deleteLabel: '刪除',
  clearLabel: '清空',
  importTitle: (count: number) => `匯入 ${count} 個表情`,
  importDescription: (current: number) => `目前清單已有 ${current} 個表情，要怎麼處理？`,
  importAppend: '接在後面',
  importReplace: '取代目前的清單',

  /* 合輯圖 */
  sheetTitle: '合輯圖',
  sheetDescription: '依清單順序排列勾選的表情，由左到右、由上到下。',
  columns: '欄數',
  columnsHint: '0＝自動（張數的平方根，無條件進位）；不會多於張數。',
  cellSize: '格子大小',
  gap: '間距',
  gapHint: '格與格之間，以及外圍。',
  background: '背景',
  bgTransparent: '透明',
  bgWhite: '白色',
  bgCustom: '自訂顏色',
  customColor: '背景顏色',
  sheetShowText: '格子下顯示文字',
  fontSize: '文字大小',
  textColor: '文字顏色',
  stepUp: (label: string) => `${label}：增加`,
  stepDown: (label: string) => `${label}：減少`,
  sheetInfo: (count: number, cols: number, rows: number, w: number, h: number) =>
    `表情 ${count} 個 · ${cols}×${rows} · 輸出 ${w}×${h} px`,
  sheetPreviewLabel: '合輯圖預覽',
  sheetRendering: '產生中…',
  download: '下載 PNG',
  close: '關閉',

  /* 說明 */
  usageIntro:
    '用組合部件的方式做 Q 版表情：在固定的頭部上選眼睛、眉毛、嘴巴，再疊上汗滴、怒筋、臉紅等漫畫符號，存進清單後排成一張合輯圖。',
  usageSteps: [
    '在「部件」點選眼睛、眉毛、嘴巴（各一種，再點一次取消）與裝飾（可以複選，新點的在最前面）。',
    '「裝飾圖層」可以調整前後順序；「隨機」會各抽一種眼睛、眉毛、嘴巴和一個裝飾。',
    '填好標籤後按「儲存表情」，表情會加在清單最後面；清單裡的鉛筆可以回到編輯區修改。',
    '勾選要放進合輯圖的表情，按「合輯圖」調整欄數、格子大小、背景與文字，再下載 PNG。',
  ],
  usageNotesTitle: '小提醒',
  usageNotes: [
    '各類標題旁的「加圖片」可以放自己的部件：建議用和頭部同樣是正方形、背景透明、對準臉部位置的圖。',
    '表情清單和自訂部件會自動儲存在這個瀏覽器；換電腦時用「匯出清單」（ZIP，含自訂部件的圖片）再「匯入清單」。',
    '所有處理都在瀏覽器裡完成，圖片不會上傳。',
  ],
} as const;
