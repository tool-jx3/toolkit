/**
 * 切入素材產生器的介面文字（台灣繁體中文；用詞照 DESIGN.md 第 5 節）。
 */
import type { TargetId } from '@/ccfolia';
import type { LoopFxKind } from '@/core/fxlayers';
import type { PaletteId, StyleId } from './looks';
import type {
  BackgroundKind,
  CutinFormat,
  MotionKind,
  SizePreset,
  TemplateCategory,
} from './model';

export const S = {
  /* ---- 範本一覽 ---- */
  galleryTitle: '先選一個範本',
  galleryLead:
    '把擲骰結果、勝負或一句喊話做成無縫循環的透明動畫：選好用途和範本，換掉文字就能匯出。',
  continueEditing: '繼續編輯',
  continueHint: (name: string) => `回到上次的「${name}」`,
  categories: {
    coc: '克蘇魯（CoC）常用',
    general: '通用',
    style: '外觀風格',
  } satisfies Record<TemplateCategory, string>,
  templateListLabel: (cat: string) => `${cat}範本`,

  /* ---- 用途 ---- */
  targetLabel: '用途',
  targets: {
    'ccfolia-cutin': 'CCFOLIA 切入演出',
    'discord-sticker': 'Discord 伺服器貼圖',
    'discord-attachment': 'Discord 訊息附件',
  } satisfies Record<TargetId, string>,
  targetNotes: {
    'ccfolia-cutin': '切入沒有指定音效的話，會一直重播到有人把它關掉。',
    'discord-sticker': '尺寸固定 320 × 320；只收 APNG（不收 GIF），檔案不能超過 512 KB。',
    'discord-attachment':
      '聊天室裡的 APNG 只會顯示第一格，所以這裡用 GIF；容量比較寬。Discord 是暗色介面，最好合成一個底色。',
  } satisfies Record<TargetId, string>,
  targetSummary: (formats: string, limit: string, size: string) =>
    `可用格式：${formats}・容量上限 ${limit}・預設尺寸 ${size}`,
  targetFixed: '尺寸固定，不能改。',
  targetSteps: {
    'ccfolia-cutin': (word: string) => [
      '在 CCFOLIA 房間的選單打開「切入」，新增一個切入並上傳這個檔案。',
      `切入的名稱填「${word}」：有人送出以這個詞結尾的訊息時就會播放。`,
      '沒有指定音效時會一直重播，直到有人把它關掉；想自動結束就加一個音效。',
    ],
    'discord-sticker': () => [
      '到 Discord 伺服器設定的「貼圖」頁面上傳這個檔案。',
      '貼圖必須是 320 × 320、不超過 512 KB 的 APNG。',
    ],
    'discord-attachment': () => [
      '把下載的 GIF 直接拖進 Discord 的聊天欄送出。',
      '聊天室裡的 APNG 不會動，所以附件請用 GIF。',
    ],
  } satisfies Record<TargetId, (word: string) => string[]>,
  /** 切入名稱的範例詞（第一行空白時） */
  cutinWordFallback: '大成功',

  /* ---- 編輯畫面頂端 ---- */
  templateNow: '範本',
  custom: '自訂',
  modified: '已修改',
  restoreLook: '恢復範本外觀',
  restoreLookHint: '字型、樣式、配色、背景、特效、動態回到範本的樣子，文字和尺寸保留。',
  backToGallery: '回到範本一覽',

  /* ---- 文字 ---- */
  textLabel: '文字',
  textPlaceholder: '輸入要做成切入的文字（換行就分行）',
  charCount: (n: number, max: number) => `${n}／${max} 字`,
  charCountHint: '字數超過建議時，實際顯示時每個字會太小。',
  advancedToggle: '顯示進階設定',

  /* ---- 分頁 ---- */
  tabsLabel: '設定分類',
  tabs: { look: '外觀', motion: '動態', export: '匯出' },

  /* ---- 外觀 ---- */
  fontLabel: '字型',
  styleLabel: '文字樣式',
  paletteLabel: '配色',
  styles: {
    double: '雙層外框',
    single: '單層外框',
    extrude: '立體擠出',
    neon: '霓虹發光',
    hard: '硬陰影',
    sticker: '貼紙',
    glitch: '色差故障',
    stripes: '斜紋填色',
    knockout: '挖空',
  } satisfies Record<StyleId, string>,
  palettes: {
    'rainbow-gold': '彩虹金框',
    'rainbow-ink': '彩虹墨框',
    gold: '黃金',
    candy: '棉花糖',
    sunset: '熱血夕陽',
    ice: '冰晶',
    blood: '血月',
    mono: '黑白',
  } satisfies Record<PaletteId, string>,
  warnDarkStyle: '這個樣式適合暗色背景；背景透明時，放在亮色的盤面上效果不明顯。',
  warnKnockout: '挖空會把字挖成透明，背景透明時什麼都看不到；請把背景改成單色或彩虹。',
  textColorLabel: '文字顏色',
  textColorHint: '所有填色換成這個單色（彩虹、漸層、金屬都會被蓋掉）；重新選配色就會還原。',
  outlineColorLabel: '外框顏色',
  outlineColorHint: '所有外框換成同一個顏色；立體擠出的厚度、霓虹的光暈、硬陰影不受影響。',
  backgroundLabel: '背景',
  backgrounds: {
    transparent: '透明',
    solid: '單色',
    rainbow: '彩虹',
    palette: '配色的填色',
  } satisfies Record<BackgroundKind, string>,
  backgroundColorLabel: '背景色',
  backgroundTransparentHint: '切入素材是疊在地圖上的，所以預設是透明；APNG 的半透明邊緣會保留。',
  backgroundPaletteHint: '挖空時自動用配色的填色當底；可以改成單色或彩虹。',
  textScaleLabel: '文字縮放',
  textScaleHint: '乘在自動字級上；大於 1 時文字可能超出畫布被裁掉。',
  leadingLabel: '行距',
  trackingLabel: '字距',
  layoutSection: '排版微調',

  /* ---- 動態 ---- */
  fxLabel: '裝飾特效',
  fxNone: '無',
  fxNames: {
    speedLines: '放射速度線',
    stars: '閃亮星星',
    confetti: '彩色碎紙',
    rings: '擴散圓環',
  } satisfies Record<LoopFxKind, string>,
  motionLabel: '文字動態',
  motions: {
    none: '無',
    pulse: '脈動縮放',
    bounce: '上下彈跳',
    jitter: '隨機抖動',
    rotate: '整體旋轉',
    wave: '逐字波浪',
  } satisfies Record<MotionKind, string>,
  motionAmountLabel: '動態強度',
  rotateTurns: (n: number) => `每循環 ${n} 圈`,
  fxTuneTitle: (name: string) => `「${name}」的細調`,
  fxParamLabels: {
    count: '數量',
    minLength: '最短（短邊的倍數）',
    maxLength: '最長（短邊的倍數）',
    width: '粗細（短邊的倍數）',
    gap: '離文字的距離（文字半徑的倍數）',
    groups: '群組數',
    stretch: '伸縮',
    color: '顏色',
    jitter: '角度偏轉',
    size: '大小（短邊的倍數）',
    twinkle: '閃爍速度（每循環幾次）',
    speed: '速度（每循環幾趟）',
  } as Record<string, string>,
  lineColorRainbow: '彩虹',
  lineColorSolid: '單色',
  seedLabel: '隨機種子',
  seedHint:
    '同一個數字會得到同一張圖：放射線、星星、碎紙的排列、抖動的路徑、色差的位移都由它決定。',

  /* ---- 匯出設定 ---- */
  formatLabel: '格式',
  formats: { apng: 'APNG', gif: 'GIF', png: 'PNG 靜態圖' } satisfies Record<CutinFormat, string>,
  formatUnsupported: '此用途不能用',
  sizeLabel: '尺寸',
  sizePresets: {
    square: '方形',
    large: '大方形',
    wide: '寬螢幕',
    light: '輕量',
  } satisfies Record<SizePreset['id'], string>,
  fixedSizeNote: (w: number, h: number) =>
    `這個用途的尺寸固定是 ${w} × ${h}；尺寸不對會被 Discord 退回。`,
  summary: (w: number, h: number, frames: number, fps: number, sec: string, limit: string) =>
    `${w} × ${h}・${frames} 格・${fps} fps・一個循環 ${sec} 秒・上限 ${limit}`,
  widthLabel: '寬',
  heightLabel: '高',
  framesLabel: '影格數',
  fpsLabel: 'fps',
  contentScaleLabel: '內容縮放',
  contentScaleHint: '以畫布中心把文字與特效一起縮小（背景仍鋪滿）；圓形特效被畫布切掉時用。',
  colorsLabel: '色數',
  colorsLossless: '無損',
  colorsHint: '只影響 APNG 與 PNG；GIF 一律 256 色。色數越少檔案越小。',
  gifMatteLabel: 'GIF 底色',
  gifMatteNone: '不合成',
  gifMatteDiscord: 'Discord 暗色',
  gifMatteHint: '有底色時，半透明與透明的地方都先合成到這個顏色上（整張不再透明）。',
  exportSettings: '匯出設定',

  /* ---- 預覽 ---- */
  previewLabel: '切入預覽',
  play: '播放',
  blankHint: '文字會出現在這裡',

  /* ---- 匯出 ---- */
  exportGroup: '匯出',
  exportButton: (f: string) => `匯出 ${f}`,
  progressDraw: (done: number, total: number) => `繪製 ${done}／${total}`,
  progressEncode: (total: number) => `編碼中（${total} 格）`,
  reopenResult: '上次的匯出結果',
  share: '複製分享連結',
  shareCopied:
    '已複製分享連結。設定都在網址 # 後面，不會經過伺服器；之後再改設定不會自動更新網址。',
  shareCopyFailed: '網址已更新，但沒能複製到剪貼簿；請直接複製網址列。',
  exportFailed: (msg: string) => `匯出失敗：${msg}`,
  noMoreShrink: '已無可再降的項目。',
  shrunk: (desc: string) => `已降低：${desc}`,
  checklistLabel: '檢查結果',
  checklistEmpty: '沒有問題，可以匯出。',

  /* ---- 結果對話框 ---- */
  resultTitle: '匯出完成',
  resultPreviewAlt: '匯出結果預覽',
  resultFormat: '格式',
  resultSize: '大小／用途上限',
  resultOver: '超過上限',
  download: '下載',
  autoShrink: '自動縮小檔案',
  autoShrinkHint:
    '每按一次就降一級並重新匯出：依序降低色數、影格數、放射速度線的數量、尺寸，畫面上的設定會跟著改。',
  continueEdit: '繼續編輯',
  stepsTitle: (target: string) => `${target}的使用步驟`,
  fileNameLabel: '檔名',

  /* ---- 錯誤畫面 ---- */
  crashTitle: '畫面出了問題',
  crashLead: '繪製或編碼時發生了無法處理的錯誤。可能的原因：',
  crashCauses: [
    '連結裡的設定損壞或被改過。',
    '瀏覽器太舊，缺少需要的功能（請改用最新版的 Chrome、Edge 或 Firefox）。',
  ],
  crashMessage: '錯誤訊息',
  crashRestart: '從頭來過',

  /* ---- 頁首 ---- */
  undo: '復原',
  redo: '重做',
  resetMenu: '全部重來',
  resetTitle: '全部重來？',
  resetDescription: '所有設定回到預設並回到範本一覽（進階設定開關不受影響）。',
  resetConfirm: '重來',
} as const;

/** 使用方式（頁首「說明」） */
export const USAGE_LINES = [
  '先選用途（CCFOLIA 切入、Discord 貼圖或訊息附件）和一個範本。',
  '在「文字」欄換成自己的文字，預覽會立刻更新；需要的話在「外觀」「動態」分頁調整。',
  '按下方的 APNG、GIF 或 PNG 按鈕匯出；檢查清單會提醒格式、尺寸、字數、容量的問題（有問題也照樣可以匯出）。',
  '檔案超過用途的上限時，在結果對話框按「自動縮小檔案」，一次降一級直到符合。',
  '「複製分享連結」把全部設定放進網址，傳給別人打開就是同一個樣子。',
] as const;
