/** 立繪裁切器的介面文字（只有台灣繁體中文；用詞照 DESIGN.md 第 5 節） */
import type { Anchor, Aspect, EffectStyle } from './logic';

export const S = {
  /* 載入 */
  dropLabel: '把 PNG／WebP 立繪拖到這裡',
  dropButton: '選擇圖片',
  dropHint: 'PNG、WebP，可一次多選；也可以直接貼上（Ctrl＋V）。每次載入都會換掉目前的清單。',
  reading: (i: number, n: number) => `讀取中：第 ${i}／共 ${n} 張`,
  loaded: (n: number) => `已載入 ${n} 張。`,
  loadedWithErrors: (n: number, names: readonly string[]) =>
    `已載入 ${n} 張；無法讀取${names.map((x) => `「${x}」`).join('、')}（檔案可能已損壞），已略過。`,
  readFailed: (names: readonly string[]) =>
    `無法讀取${names.map((x) => `「${x}」`).join('、')}，檔案可能已損壞。目前的清單沒有變動。`,
  typeError: '只能載入 PNG 或 WebP 圖片，目前的清單沒有變動。',
  pasted: (name: string) => `已貼上圖片（${name}）。`,

  /* 清單瀏覽 */
  prev: '上一張',
  next: '下一張',
  counter: (i: number, n: number) => `${i}／${n}`,
  counterLabel: (i: number, n: number) => (n ? `第 ${i} 張，共 ${n} 張` : '沒有圖片'),

  /* 預覽 */
  stageLabel: '裁切預覽',
  frameLabel: '可以左右拖曳',
  frameAria: '裁切框（← → 左右移動）',
  resetView: '縮放歸位',
  empty: '載入立繪後，在這裡調整裁切框',
  outputInfo: (w: number, h: number) => `輸出 ${w} × ${h} px`,

  /* 下載 */
  download: '下載這張',
  downloadAll: '全部下載',
  downloadAllBusy: '處理中…',
  resetOffset: '回到基準位置',
  downloaded: (name: string) => `已下載「${name}」。`,
  downloading: (i: number, n: number) => `下載中：第 ${i}／共 ${n} 張`,
  downloadingHint: '瀏覽器可能會詢問是否允許這個網站下載多個檔案，請選擇允許。',
  downloadedAll: (n: number) => `下載完成：共 ${n} 張。`,
  downloadError: '下載時發生錯誤，圖片可能太大，請再試一次。',

  /* 裁切框 */
  sectionFrame: '裁切框',
  aspect: '比例',
  aspectLabels: { '3:4': '3:4 直式', '1:1': '1:1 正方' } satisfies Record<Aspect, string>,
  aspectHint: '所有圖片共用。切換時，目前這張回到基準位置。',
  range: '裁切範圍',
  rangeHint:
    '框的高度是「角色高度」的百分比（不是整張圖的高度）；所有圖片共用。快捷鍵 [ ／ ] 每次 5%。',
  anchor: '裁切基準',
  anchorLabels: {
    head: '頭部',
    upper: '上半身',
    figure: '角色範圍中心',
    image: '整張圖中心',
    manual: '手動',
  } satisfies Record<Anchor, string>,
  anchorDescriptions: {
    head: '以角色最上方約 35%（頭部）的左右寬度找中心，框的上緣貼齊頭頂。',
    upper: '以角色最上方約 55%（含肩膀、手臂）的左右寬度找中心，框的上緣貼齊頭頂。',
    figure: '框的中心對準角色（不透明部分）範圍的中心。',
    image: '框的中心對準整張圖（含透明處）的中心。',
    manual: '位置與「頭部」相同，但換成這個基準時保留你拖過的位置。',
  } satisfies Record<Anchor, string>,
  anchorHint: '每張圖各自記住自己的基準與位置。',
  applyAll: '全部套用同一基準',
  applyAllHint:
    '勾選時，改裁切基準會套用到所有圖片（勾選的當下也先統一成選單上的基準）；不勾時只改目前這張。',

  /* 效果 */
  sectionEffect: '描邊與光暈',
  effectOn: '套用效果',
  effectOnHint:
    '預覽上看到的就是下載的結果。效果畫在角色後面、只畫在裁切範圍內，不會改變角色本身。',
  effectStyle: '樣式',
  effectStyleLabels: {
    stroke: '實線描邊',
    'glow-soft': '柔和光暈',
    'glow-strong': '強烈光暈',
    shadow: '陰影',
  } satisfies Record<EffectStyle, string>,
  effectStyleHints: {
    stroke: '沿著角色輪廓向外畫一圈實線。',
    'glow-soft': '細一點的實線，外面一圈淡淡的光。',
    'glow-strong': '實線加上一圈濃的光暈。',
    shadow: '整個剪影的影子，往右下偏移。',
  } satisfies Record<EffectStyle, string>,
  effectColor: '顏色',
  effectWidth: '粗細',
  effectBlur: '模糊',
  effectOffset: '位移',
  effectOffsetHint: '影子往右、往下各偏移這麼多。',
  effectOpacity: '不透明度',

  /* 快捷鍵 */
  keysImages: '圖片',
  keysFrame: '裁切框',
  keysView: '預覽',
  keysDownload: '下載',
  keyRangeDown: '裁切範圍 −5%',
  keyRangeUp: '裁切範圍 ＋5%',
  keyPaste: '貼上圖片',

  disclaimer: '本工具與 CCFOLIA 官方無關。所有圖片都在瀏覽器裡處理，不會上傳。',

  usageIntro:
    '把去背的全身立繪裁成固定比例的上半身頭像，給 CCFOLIA 的棋子、聊天頭像這類只露出上半身的地方用。工具會自動找出角色的範圍與頭部的位置、放好裁切框，你只要左右微調。',
  usageSteps: [
    '把去背的 PNG 或 WebP 立繪拖進來、按「選擇圖片」，或直接貼上（Ctrl＋V）；可以一次多張，每次載入都會換掉目前的清單。',
    '選比例（3:4 或 1:1）與裁切範圍。裁切範圍是「角色高度」的百分比，透明留白多的圖也不會因此變小。',
    '需要時換裁切基準，或在預覽上左右拖曳裁切框；按「回到基準位置」（C）還原。用上一張／下一張（A／D）切換時，每張各自記住自己的位置。',
    '想要外框線、光暈或陰影就開啟「套用效果」，預覽上看到的就是下載的結果。',
    '按「下載這張」（Ctrl＋S），或「全部下載」把清單裡的每一張依序存下來。',
  ],
  usageNotesTitle: '注意事項',
  usageNotes: [
    '角色範圍以不完全透明的像素判斷；背景不透明的圖整張都算角色，整張透明的圖以整張圖計算。',
    '頭部、上半身、手動三種基準的框上緣貼齊頭頂，所以頭頂上方不會有效果線。',
    '輸出一比一複製原圖的像素、不縮放；框比圖寬時，右側超出的部分是透明的。',
    '在預覽上直接滾動滑鼠滾輪可以縮放（20%～500%），在框外拖曳可以平移；按「縮放歸位」（R）回到 100%。',
    '比例、裁切範圍、裁切基準與效果設定會記在這個瀏覽器；圖片不會儲存，重新整理後要重新載入。',
    '焦點在文字欄、選單、滑桿、勾選框等控制項上時，快捷鍵不會作用。',
  ],
} as const;
