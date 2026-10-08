/** 網格產生器的介面文字 */
import type { CoordFormat, CoordOrigin, GridLineStyle, HexRowMode } from '@/core/grid';
import type { CoordPos, Shape } from './settings';

export const S = {
  shape: '形狀',
  shapeHint: '方格與六角格的設定分開保存，切換時會回到各自上次的設定。',
  shapes: { square: '方格', hex: '六角格' } satisfies Record<Shape, string>,

  sectionSize: '格數與大小',
  orientation: '方向',
  orientations: { flat: '橫向（平頂）', pointy: '直向（尖頂）' },
  cols: '欄數（橫）',
  rows: '列數（縱）',
  hexRowsHint: '六角格的列數以半格計：每加 1，會輪流在偶數欄或奇數欄多出一格。',
  cellSize: '格子大小',
  hexSize: '大小',
  hexSizeHint: '橫向時是一格的高，直向時是一格的寬。用於 CCFOLIA 時建議設成 24 的倍數。',
  shift: '錯開第 1 欄',
  shiftHint: '第 1 欄往下（直向時往右）錯開半格。',
  outer: '繪製外圈六角格',
  outerHint: '在四周多畫一圈只露出一部分的六角格，邊緣看起來比較整齊。',
  fit: '用於 CCFOLIA（網格化）',
  fitHint:
    '把六角格橫向（直向時縱向）拉長，讓它剛好對齊正方形網格；在 CCFOLIA 這類只支援正方形網格的工具使用時開啟。',

  sectionLine: '線條',
  lineColor: '線條顏色',
  lineWidth: '線寬',
  lineStyle: '線型',
  lineStyles: { solid: '實線', dashed: '虛線', dotted: '點線' } satisfies Record<
    GridLineStyle,
    string
  >,
  lineStyleHintSquare:
    '縮小比例低於 100% 或設了圓角時，改成一格一格畫，虛線、點線的樣子會跟著改變。',
  lineStyleHintHex: '縮小比例低於 100% 時，每一格畫完整的 6 條邊，虛線、點線的樣子會跟著改變。',
  glow: '發光',
  glowHint: '線條加上同色的光暈（範圍隨線寬變大），深色背景上特別醒目；匯出的圖片也有。',

  sectionCell: '格子樣式',
  scale: '縮小比例',
  scaleHint: '每一格所佔的範圍不變，只把畫出來的格子縮小；低於 100% 時格子之間會出現間隙。',
  cornerRadius: '圓角',
  cornerRadiusHint: '0 是直角，數值越大越圓。',

  sectionCoords: '座標',
  showCoords: '顯示座標',
  coordColor: '文字顏色',
  coordFormat: '格式',
  coordFormats: {
    hyphen: '1-1',
    comma: '1,1',
    zero: '0101',
    letter: 'A1',
    serial: '流水號',
  } satisfies Record<CoordFormat, string>,
  coordFormatHint:
    '1-1、1,1：欄與列；0101：欄、列各補零到 2 位；A1：欄用英文字母；流水號：從起點依序編號。',
  coordOrigin: '起點',
  coordOrigins: {
    tl: '左上',
    bl: '左下',
    tr: '右上',
    br: '右下',
  } satisfies Record<CoordOrigin, string>,
  rowMode: '列的算法',
  rowModes: { compress: '壓縮', half: '以半列計' } satisfies Record<HexRowMode, string>,
  rowModeHint:
    '壓縮：錯開的格子算同一列，列號連續（0-0、0-1、1-0…）。以半列計：照錯開的位置編號，同一欄的列號每次加 2（0-0、0-2、1-1…）。',
  rowModeSerialHint: '流水號一律用「壓縮」。',
  coordStart: '起始編號',
  coordStarts: { 0: '從 0', 1: '從 1' },
  coordPos: '位置',
  coordPositions: { top: '上', middle: '中', bottom: '下' } satisfies Record<CoordPos, string>,
  coordOffset: '邊緣偏移',
  coordOffsetHint:
    '位置選「上」或「下」時，文字與格子邊緣的距離：正值往中心靠近，負值移到格子外側。',
  coordFontSize: '文字大小',

  exportPng: '匯出 PNG',
  exporting: '正在匯出 PNG…',
  exported: (name: string) => `已匯出 ${name}`,
  exportFailed: (message: string) => `匯出失敗：${message}`,
  stageLabel: '網格預覽',
  sizeInfo: (w: number, h: number) => `${w} × ${h} px`,
  fileInfo: (name: string) => `檔名：${name}`,
  ccfoliaInfo: (cols: number, rows: number) => `CCFOLIA 的大小：${cols} × ${rows}`,
  ccfoliaInfoHint: '把面板或前景的寬高設成這組數字。',
  tooLarge: (w: number, h: number) =>
    `畫布 ${w} × ${h} px 太大，瀏覽器畫不出來。請減少格數或縮小格子（單邊最多 32767 px、總面積最多 16384 × 16384 px）。`,
  transparentNote: '背景是透明的；預覽區的底色只供檢查，不會匯出。',

  undo: '復原',
  redo: '重做',
  keysGroup: '編輯',
  exportGroup: '匯出',
  resetLabel: '全部重設',
  resetTitle: '全部重設？',
  resetDescription: '方格與六角格的設定都會回到預設值。之後還可以按「復原」取回。',
  projectName: '網格',

  usageIntro: '產生透明背景的方格或六角格 PNG，可以疊在地圖上，或直接放進 CCFOLIA 當前景、面板。',
  usageSteps: [
    '在最上方選「方格」或「六角格」，兩種形狀的設定各自保存。',
    '設定格數與大小、線條的顏色、線寬、線型與發光。',
    '需要座標時開啟「座標」，選格式、起點與位置。',
    '六角格要放進 CCFOLIA 時開啟「用於 CCFOLIA（網格化）」，檔名與預覽下方會顯示要設定的大小。',
    '按「匯出 PNG」（或 D 鍵）下載。',
  ],
  usageNotes: [
    '設定會自動保存在這個瀏覽器；可以用「專案」選單存成專案檔，或全部重設。',
    'Ctrl＋Z 復原、Ctrl＋Shift＋Z 重做。',
    '方格的檔名是 grid_欄數x列數_大小px.png；六角格網格化時是 hex_欄x列.png，其他情況是 hex.png。',
  ],
} as const;
