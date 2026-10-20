/** 動態背景產生器的介面文字（名稱、說明、狀態訊息都是本站自己寫的） */
import type { AspectId, FilterPresetId, QualityLevel } from '@/core/image';
import type { TransKind } from './deck';
import type { EffectId } from './effects';

export type FilterChoice = FilterPresetId | 'none';

export const S = {
  usage: [
    '載入背景圖：拖放或點選載入區（可一次選多張，轉場效果會依序切換），也可以先用「範例圖」試試。',
    '在「動態」分頁選一個效果；需要調色時到「濾鏡」分頁再選一個（兩者可以同時使用）。',
    '調整秒數、畫質、尺寸與循環，在預覽確認動起來的樣子。',
    '選格式與 FPS 後按匯出，下載動畫檔；需要靜止畫面時另外下載第一格 PNG。',
  ],
  about: '全部在瀏覽器裡處理，圖片不會上傳。上傳到 CCFOLIA 等服務時，建議讓檔案在 5 MB 以內。',

  /* 圖片 */
  sectionImage: '背景圖片',
  dropLabel: '把圖片拖到這裡，或點一下選擇檔案',
  dropButton: '選擇圖片',
  dropHint: 'PNG、JPG、WebP，可一次選多張（每次載入都會取代原本的圖片）。',
  sample: '範例圖',
  sampleHint: '載入一張本站畫的 2048 × 1536 夜景範例。',
  clear: '清除',
  cancelExport: '取消',
  clearHint: '清掉圖片與濾鏡；效果與輸出設定不變。',
  emptyInfo: '還沒有載入圖片。',
  singleInfo: (name: string, w: number, h: number, kb: string) => ({
    name,
    lines: [`${w} × ${h} px`, `約 ${kb} KB`],
  }),
  multiInfo: (n: number, w: number, h: number, kb: string) =>
    `共 ${n} 張・第一張 ${w} × ${h} px・合計約 ${kb} KB`,
  moreImages: (n: number) => `…還有 ${n} 張`,
  sampleName: 'sample_night.jpg',

  /* 效果分頁 */
  tabsLabel: '效果分類',
  tabMotion: '動態',
  tabFilter: '濾鏡',
  motionGridLabel: '動態效果',
  motionHint: '再按一次已選的效果就取消（無動態）。轉場效果會用到第 2 張以後的圖片。',
  filterGridLabel: '濾鏡',
  filterNote:
    '濾鏡只是調整整體的顏色與氣氛，不會真的換掉天空或改成白天、夜晚；建議先在預覽確認效果。',
  loopBadge: '循環',

  /* 輸出設定 */
  sectionOutput: '輸出設定',
  fileName: '檔名',
  fileNameHint: '選效果、濾鏡或循環時會自動改寫；改過之後下載就用這個名稱（空白時用自動名稱）。',
  seconds: '秒數',
  secondsHint: '0.5～12 秒；空白時當成 3 秒。選效果時會換成該效果的預設秒數。',
  secondsUp: '秒數：增加',
  secondsDown: '秒數：減少',
  quality: '畫質',
  qualityHint: '決定輸出尺寸的上限與 WebP 的壓縮品質。',
  size: '圖片尺寸',
  sizeHint: '圖片會蓋滿整個畫面、置中裁切。',
  loop: '循環播放',
  loopHint: '關掉時只播一次（預覽也播完就停在最後）。',
  outputSize: (w: number, h: number) => `輸出 ${w} × ${h} px`,

  /* 預覽 */
  previewLabel: '動態背景預覽',
  previewEmpty: '載入圖片後在這裡預覽',
  orderTransition: '轉場順序',
  orderTransitionHint: '拖曳縮圖到另一張上面就能調整切換順序。',
  orderTransitionAria: '轉場的圖片順序',
  orderFade: '淡化順序',
  orderFadeHint: '「圖片 → 顏色」是淡出；把兩張對調成「顏色 → 圖片」就是淡入。',
  orderFadeAria: '淡化的順序',
  fadeImage: '圖片',
  fadeColors: { fadeBlack: '黑色', fadeWhite: '白色', fadeClear: '透明' } as Record<string, string>,

  /* 匯出 */
  exportTitle: '匯出',
  fpsNote: '24 FPS 適合大多數情況；30 FPS 比較流暢、檔案較大；60 FPS 最流暢但檔案很大。',
  sizeNote:
    '請讓檔案在 5 MB 以內：太大時降低畫質、縮小尺寸、縮短秒數，或改用 24 FPS。播放速度以實際使用的環境為準。',
  sizeWarningHint: '可以降低畫質、縮小尺寸、縮短秒數或改用 24 FPS。',
  firstFrame: '下載第一格 PNG',
  firstFrameHint: '和動畫同一個尺寸的靜止畫面（第一格）。',
  stillPng: '下載濾鏡靜態圖 PNG',
  stillHint: '沒有選動態時，可以直接下載套好濾鏡的靜態圖。',
  exportFirst: '請先匯出動畫，才能下載第一格 PNG。',

  /* 名稱 */
  noMotion: '無動態',
  loopWords: { on: '循環', off: '單次' },
  qualities: {
    minimum: '最小',
    light: '輕量',
    standard: '標準',
    high: '高畫質',
  } satisfies Record<QualityLevel, string>,
  originalSize: '原始尺寸',
  aspectLabel: (id: AspectId, w: number, h: number) => `${id}（${w} × ${h}）`,

  /* 狀態訊息 */
  status: {
    ready: '請先載入背景圖片（或按「範例圖」）。',
    needImage: '請先載入圖片。',
    selectImage: '選到的檔案都不是圖片，請選擇 PNG、JPG 或 WebP 等圖片檔。',
    decodeFailed: (name: string) =>
      `無法讀取「${name}」，這次沒有載入任何圖片（原本的圖片保留），請換一個檔案。`,
    loaded: (auto: string) => `已載入圖片。${auto}`,
    loadedMany: (n: number, auto: string) => `已載入 ${n} 張圖片，轉場效果會依序切換。${auto}`,
    autoStandard: '畫質設為「標準」、原始尺寸。',
    autoLight: '檔案超過 1 MB，畫質自動改為「輕量」。',
    autoLightPreset: (size: string) => `檔案超過 3 MB，畫質自動改為「輕量」、尺寸改為 ${size}。`,
    autoMinimum: (size: string) => `檔案超過 6 MB，畫質自動改為「最小」、尺寸改為 ${size}。`,
    sampleReady: '範例圖已就緒，選一個效果試試看。',
    sampleFailed: '範例圖產生失敗，請改用自己的圖片。',
    effect: (name: string, loop: string, extra: string) => `已選擇「${name}」（${loop}）。${extra}`,
    noMotion: '已取消動態（無動態）：預覽停在靜止畫面，匯出時每一格都相同。',
    noMotionPreview: '目前沒有選擇動態效果。',
    switchMany: (n: number, verb: string) => `會依目前順序${verb}切換 ${n} 張圖片。`,
    switchSingle: (filter: string) => `只有一張圖：會從原圖過渡到套用「${filter}」的圖。`,
    switchNeed: '轉場需要 2 張以上的圖片（或 1 張圖片＋濾鏡）。',
    fadeHint: '把預覽下方的「圖片」與顏色對調就變成淡入。',
    filter: (name: string, extra: string) => `已選擇濾鏡「${name}」。${extra}`,
    order: (n: number, verb: string) => `已調整順序，會依新順序${verb}切換 ${n} 張圖片。`,
    fadeIn: '已改成淡入（顏色 → 圖片）。',
    fadeOut: '已改成淡出（圖片 → 顏色）。',
    reset: '已清除圖片與濾鏡；效果與輸出設定維持不變。',
    exporting: (format: string, i: number, n: number) =>
      `正在產生 ${format}：第 ${i}／${n} 格（建議 5 MB 以內）`,
    cancelling: '正在取消匯出…',
    cancelled: '已取消匯出。',
    failed: (msg: string) => `匯出失敗：${msg}`,
    done: (o: {
      file: string;
      size: string;
      effect: string;
      loop: string;
      seconds: string;
      fps: number;
      quality: string;
      width: number;
      height: number;
    }) =>
      `已完成：${o.file}（${o.size}）・${o.effect}・${o.loop}・${o.seconds} 秒・${o.fps} FPS・${o.quality}・${o.width} × ${o.height}。實際播放速度以使用的環境為準。`,
    tooLarge: '超過 5 MB，上傳到 CCFOLIA 等服務時可能會被拒絕。',
    stillReady: '可以下載套好濾鏡的靜態圖。',
  },

  /* 通知 */
  toast: {
    start: (fps: number, format: string) => `開始產生 ${fps} FPS 的 ${format}`,
    ready: (format: string) => `${format} 已完成，可以下載了`,
    tooLarge: (format: string) => `${format} 已完成，但超過 5 MB`,
    tooLargeHint: '上傳到 CCFOLIA 等服務時可能會被拒絕。',
    cancelling: '正在取消…',
    cancelled: '已取消匯出',
    downloaded: '已開始下載',
    exportFirst: '請先匯出',
    sampleFailed: '範例圖產生失敗',
  },

  /* 快捷鍵 */
  keys: {
    group: '動態背景',
    open: '開啟圖片',
    play: '播放／停止預覽',
    export24: '以 24 FPS 匯出',
    export30: '以 30 FPS 匯出',
    export60: '以 60 FPS 匯出',
    theme: '切換深色／淺色',
  },
};

/* ---------- 效果與濾鏡的名稱 ---------- */

export interface ChoiceText {
  label: string;
  description: string;
  group: string;
}

const G_SHAKE = '搖晃與漂移';
const G_CAMERA = '鏡頭移動';
const G_FADE = '淡化';
const G_SWITCH = '多張轉場';

export const EFFECT_TEXT: Record<EffectId, ChoiceText> = {
  shakeY: { label: '上下震盪', description: '像地鳴一樣上下抖動', group: G_SHAKE },
  shakeX: { label: '左右震盪', description: '被撞擊般左右猛晃', group: G_SHAKE },
  shakeAll: { label: '劇烈搖晃', description: '四面亂晃還帶點傾斜', group: G_SHAKE },
  drift: { label: '暈眩漂移', description: '慢慢飄移、頭暈目眩', group: G_SHAKE },
  breathe: { label: '呼吸脹縮', description: '緩緩放大再縮回', group: G_SHAKE },
  pan: { label: '來回橫移', description: '平順地左右來回', group: G_SHAKE },
  wave: { label: '水波扭曲', description: '畫面像水面一樣扭動', group: G_SHAKE },
  spinFall: { label: '墜入黑暗', description: '邊轉邊縮小下沉，最後全黑', group: G_CAMERA },
  spinWhite: { label: '捲入白光', description: '邊轉邊放大，最後全白', group: G_CAMERA },
  spinBlack: { label: '捲入黑暗', description: '邊轉邊放大，最後全黑', group: G_CAMERA },
  rise: { label: '往上滑出', description: '往上移出畫面後轉黑', group: G_CAMERA },
  sink: { label: '往下滑出', description: '往下移出畫面後轉黑', group: G_CAMERA },
  pushIn: { label: '鏡頭推近', description: '慢慢放大到 1.3 倍', group: G_CAMERA },
  pushInWhite: { label: '推近轉白', description: '放大後白光蓋過', group: G_CAMERA },
  pushInBlack: { label: '推近轉黑', description: '放大後暗下來', group: G_CAMERA },
  pullOut: { label: '鏡頭拉遠', description: '從放大慢慢退回原大', group: G_CAMERA },
  pullOutWhite: { label: '拉遠轉白', description: '退回原大時白光蓋過', group: G_CAMERA },
  pullOutBlack: { label: '拉遠轉黑', description: '退回原大時暗下來', group: G_CAMERA },
  fadeBlack: { label: '淡化到黑', description: '圖片漸漸隱入黑色', group: G_FADE },
  fadeWhite: { label: '淡化到白', description: '圖片漸漸隱入白色', group: G_FADE },
  fadeClear: { label: '淡化到透明', description: '整張圖漸漸變透明', group: G_FADE },
  crossfade: { label: '交叉溶接', description: '多張圖依序疊化切換', group: G_SWITCH },
  cut: { label: '硬切換', description: '多張圖依序一刀切換', group: G_SWITCH },
  wipe: { label: '左右擦除', description: '下一張從左往右蓋過去', group: G_SWITCH },
};

/** 轉場的動詞（狀態訊息用） */
export const SWITCH_VERB: Record<'crossfade' | 'cut' | 'wipe', string> = {
  crossfade: '疊化',
  cut: '硬切',
  wipe: '擦除',
};

const F_BASIC = '基本處理';
const F_TIME = '時段';
const F_MOOD = '氛圍';

export const FILTER_TEXT: Record<FilterChoice, ChoiceText> = {
  none: { label: '無', description: '保持原圖的顏色', group: F_BASIC },
  mono: { label: '黑白', description: '只留明暗的單色照片', group: F_BASIC },
  sepia: { label: '懷舊褐', description: '泛黃老照片般的暖褐色', group: F_BASIC },
  posterize: { label: '色階分離', description: '顏色只剩幾階，像海報印刷', group: F_BASIC },
  contrast: { label: '高對比', description: '亮的更亮、暗的更暗', group: F_BASIC },
  soft: { label: '柔光', description: '微微發亮、輪廓變柔和', group: F_BASIC },
  sharpen: { label: '銳利', description: '讓邊緣更清楚', group: F_BASIC },
  'line-dark': { label: '黑線描', description: '白底上只留下黑色輪廓', group: F_BASIC },
  'line-light': { label: '白線描', description: '黑底上浮出白色輪廓', group: F_BASIC },
  ink: { label: '墨色', description: '灰階加上暗線，像水墨畫', group: F_BASIC },
  mosaic: { label: '馬賽克', description: '切成小方塊的低解析度風', group: F_BASIC },
  grain: { label: '顆粒感', description: '每一格都在跳動的彩色雜訊', group: F_BASIC },
  crt: { label: '映像管', description: '掃描線與色偏的老電視', group: F_BASIC },
  vignette: { label: '暗角', description: '四周變暗，視線集中到中央', group: F_BASIC },
  'rgb-split': { label: '色版錯位', description: '紅藍分離的故障感', group: F_BASIC },
  dawn: { label: '清晨', description: '暖色晨光從右上灑進來', group: F_TIME },
  noon: { label: '白晝', description: '明亮自然的日光', group: F_TIME },
  dusk: { label: '黃昏', description: '橘色夕照與褐色暗角', group: F_TIME },
  night: { label: '入夜', description: '壓暗並帶藍的夜色', group: F_TIME },
  midnight: { label: '深夜', description: '更暗更藍、四周漆黑', group: F_TIME },
  moonlit: { label: '月光', description: '冷白月光從右上照下', group: F_TIME },
  horror: { label: '驚悚', description: '病態的綠灰色與暗紅', group: F_MOOD },
  fog: { label: '濃霧', description: '對比變低、白霧瀰漫', group: F_MOOD },
  neon: { label: '霓虹', description: '洋紅與青色的賽博夜景', group: F_MOOD },
  underwater: { label: '水底', description: '藍綠色調、微微模糊', group: F_MOOD },
  dream: { label: '夢境', description: '粉紫光暈的朦朧感', group: F_MOOD },
  faded: { label: '褪色照片', description: '泛黃褪色加上顆粒', group: F_MOOD },
};

/* ---------- 圖片切換模式（2026-10，規格 F110～F156） ---------- */

const T_BASIC = '基本';
const T_SLIDE = '滑入';
const T_COVER = '蓋過';
const T_WIPE = '擦除';
const T_OTHER = '其他';

/** 切換效果的名稱與說明；順序＝對話框與「隨機」的順序（規格 3.11.6） */
export const TRANS_TEXT: Record<TransKind, ChoiceText> = {
  cut: { label: '不切換', description: '直接換成下一張', group: T_BASIC },
  fade: { label: '交叉溶接', description: '兩張直接混色，淡入淡出', group: T_BASIC },
  dipblack: { label: '經過黑色', description: '先暗下去，再從黑色亮起來', group: T_BASIC },
  dipwhite: { label: '經過白色', description: '先閃成白色，再慢慢顯現', group: T_BASIC },
  slideR: { label: '滑入（從右）', description: '兩張一起往左移', group: T_SLIDE },
  slideL: { label: '滑入（從左）', description: '兩張一起往右移', group: T_SLIDE },
  slideB: { label: '滑入（從下）', description: '兩張一起往上移', group: T_SLIDE },
  slideT: { label: '滑入（從上）', description: '兩張一起往下移', group: T_SLIDE },
  coverR: { label: '蓋過（從右）', description: '新圖從右邊蓋上來', group: T_COVER },
  coverL: { label: '蓋過（從左）', description: '新圖從左邊蓋上來', group: T_COVER },
  coverB: { label: '蓋過（從下）', description: '新圖從下面蓋上來', group: T_COVER },
  coverT: { label: '蓋過（從上）', description: '新圖從上面蓋下來', group: T_COVER },
  wipeR: { label: '擦除（從右）', description: '從右邊擦開，露出新圖', group: T_WIPE },
  wipeL: { label: '擦除（從左）', description: '從左邊擦開，露出新圖', group: T_WIPE },
  wipeB: { label: '擦除（從下）', description: '從下面擦開，露出新圖', group: T_WIPE },
  wipeT: { label: '擦除（從上）', description: '從上面擦開，露出新圖', group: T_WIPE },
  zoomIn: { label: '放大', description: '舊圖放大淡出，新圖由小放大', group: T_OTHER },
  zoomOut: { label: '縮小', description: '舊圖縮小淡出，新圖由大縮回', group: T_OTHER },
  circle: { label: '圓形展開', description: '新圖從中心長成一個圓', group: T_OTHER },
  circleClose: { label: '圓形收合', description: '舊圖縮成中心的圓後消失', group: T_OTHER },
  blindsV: { label: '百葉窗（直）', description: '8 條直條依序拉開', group: T_OTHER },
  blindsH: { label: '百葉窗（橫）', description: '8 條橫條依序拉開', group: T_OTHER },
  blur: { label: '模糊', description: '舊圖模糊淡出，新圖由模糊變清楚', group: T_OTHER },
  pixelate: { label: '馬賽克', description: '打成方塊，再還原成新圖', group: T_OTHER },
  flip: { label: '翻牌', description: '像翻卡片一樣翻到下一張', group: T_OTHER },
  random: { label: '隨機', description: '每次切換從其他效果裡抽一個', group: T_OTHER },
};

export const DECK = {
  /* 模式 */
  modeLabel: '模式',
  modeMotion: '動態效果',
  modeDeck: '圖片切換',
  modeHint: '「圖片切換」把好幾張圖接成一個動畫，每張可以個別設定秒數與切換效果。',

  usage: [
    '切到「圖片切換」模式，加入圖片（拖放、貼上，或按「加入圖片」）；也可以先用「範例圖」試試。',
    '每一列設定這張圖顯示幾秒，以及「切到下一張」的效果和秒數；「一次設定」可以把同一組設定套用到所有圖片。',
    '需要時加上「第一張出現」「最後一張消失」，只有一張圖也能用；勾選「最後一張切回第一張」讓動畫接成一圈。',
    '在預覽確認節奏，選格式後匯出；停住的時間只存一格，超過容量上限時會自動降低畫質、FPS、尺寸重新匯出。',
  ],

  /* 圖片清單 */
  sectionImages: '圖片清單',
  dropLabel: '把圖片拖到這裡，或點一下選擇檔案',
  dropButton: '加入圖片',
  dropHint: '可一次選多張，會接在清單最後面；也可以直接貼上。',
  dropOverlay: '放開即可加入圖片',
  dropOverlayHint: '圖片會接在清單最後面。',
  sample: '範例圖',
  sampleHint: '加入 4 張本站畫的範例圖。',
  sampleNames: ['sample_day.png', 'sample_dusk.png', 'sample_night.png', 'sample_dawn.png'],
  count: (n: number) => `共 ${n} 張`,
  listLabel: '圖片清單',
  empty: '還沒有圖片。拖放、貼上，或按上面的「加入圖片」。',
  previewEmpty: '加入圖片後在這裡預覽',
  holdLabel: '顯示',
  holdAria: (i: number) => `第 ${i} 張：顯示秒數`,
  durAria: (i: number) => `第 ${i} 張：切換秒數`,
  secondsUnit: '秒',
  moveUp: '上移',
  moveDown: '下移',
  duplicate: '複製',
  remove: '移除',
  rowAction: (act: string, i: number, name: string) => `${act}第 ${i} 張：${name}`,
  toNext: '▼ 切到下一張',
  toFirst: '▼ 切回第一張',
  connInactive: {
    noLoop: '沒有勾選「最後一張切回第一張」，這一段不會用到。',
    outro: '有設定「最後一張消失」，這一段不會用到。',
    single: '只有一張圖，沒有下一張可以切。',
  },
  imageMissing: '這張圖片讀不到（已從這個瀏覽器清除），請移除後重新加入。',
  missingNotice: (n: number) =>
    `有 ${n} 張圖片讀不到：預覽以空白畫面代替，匯出前請移除並重新加入。`,
  loadingImages: (n: number) => `正在讀取 ${n} 張圖片…`,

  /* 一次設定、頭尾 */
  bulkTitle: '一次設定',
  bulkHint: '這裡的值也是之後加入的新圖片的預設。',
  bulkHold: '顯示',
  bulkEffect: '切換效果',
  bulkDur: '切換',
  bulkApply: '全部套用',
  bulkApplied: '已套用到所有圖片',
  randomAssign: '隨機分配',
  randomAssigned: '每張都設成「隨機」，並重新抽籤',
  reroll: '重新抽籤',
  rerolled: '已重新抽籤',
  introTitle: '第一張出現',
  introHint: '最前面加一段：從空白畫面切到第一張。',
  outroTitle: '最後一張消失',
  outroHint: '最後面加一段：從最後一張切到空白畫面。',
  edgeNone: '無',
  edgeAria: (title: string) => `${title}：切換秒數`,
  randomPicked: (name: string) => `抽到：${name}`,

  /* 效果對話框 */
  pickTitle: '選擇切換效果',
  pickDescription: '滑過或用鍵盤聚焦就會動起來；點一下選用。',
  pickAria: '切換效果',
  pickButton: (target: string, name: string) => `${target}的切換效果：${name}`,
  pickTargets: {
    bulk: '一次設定',
    intro: '第一張出現',
    outro: '最後一張消失',
  },
  pickSlide: (i: number) => `第 ${i} 張`,

  /* 整體設定 */
  sectionGlobal: '整體設定',
  size: '輸出尺寸',
  sizeHint: '寬 × 高（px，16～4096）。',
  width: '寬',
  height: '高',
  preset: '預設尺寸',
  presetPlaceholder: '選一個尺寸…',
  fitFirst: '照第一張',
  fitFirstHint: '設成第一張圖的尺寸，長邊超過 800 px 時等比縮小。',
  fit: '放法',
  fits: { contain: '完整放入', cover: '填滿', stretch: '拉伸' },
  fitHint: '完整放入會留邊（背景色）；填滿會裁掉超出的部分；拉伸不保持比例。',
  background: '背景',
  transparent: '透明',
  transparentHint: '開啟後背景全透明，匯出的動畫帶透明度（GIF 只有全透明或不透明）。',
  loopBack: '最後一張切回第一張',
  loopBackHint: '勾選時最後一張也用自己的效果切到第一張；有設「最後一張消失」時不會用到。',
  loopBackIgnored: '目前有設「最後一張消失」，這個選項不會用到。',
  easing: '緩急曲線',
  easings: { inout: '慢進慢出', out: '快進慢出', linear: '等速' },
  easingHint: '決定每一段切換裡進度隨時間的變化；停住的時間不受影響。',

  /* 預覽 */
  previewLabel: '圖片切換預覽',
  stats: (seconds: number, frames: number, w: number, h: number) =>
    `全體 ${seconds.toFixed(1)} 秒・匯出 ${frames} 格・${w} × ${h} px`,
  manyFrames: '影格很多，檔案會變大',

  /* 匯出 */
  exportTitle: '匯出',
  qualityLabel: '畫質',
  qualityHint: '只影響 WebP（100 為無損）。',
  capLabel: '容量上限',
  capToggle: '超過就自動調整',
  capUnit: 'MB',
  capHint: '超過上限時依序降低畫質（WebP）、FPS、尺寸，自動重新匯出（最多 8 次）。',
  holdNote: '停住的時間只存一格，所以停得再久也不會讓檔案變大；FPS 只影響切換的影格數。',
  needImages: '請先加入圖片。',
  missingExport: (n: number) => `有 ${n} 張圖片讀不到，請先移除並重新加入。`,
  attemptLabel: (n: number) => `第 ${n} 次匯出（已調整）`,
  adjustQuality: (a: number, b: number) => `畫質 ${a} → ${b}`,
  adjustFps: (a: number, b: number) => `${a} → ${b} fps`,
  adjustSize: (a: string, b: string) => `尺寸 ${a} → ${b}`,
  detailPlays: '播放',
  playsInfinite: '無限循環',
  playsTimes: (n: number) => `${n} 次`,
  detailQuality: '畫質',
  detailFps: 'FPS',
  detailAdjust: '容量調整',
  adjusted: (n: number, list: string) => `匯出 ${n} 次：${list}`,
  notAdjusted: '不需要調整',
  stillOver: '調到最後仍超過上限，請減少圖片張數或縮短秒數。',
  detailNote: '提醒',

  /* 專案檔、儲存 */
  saveFailed: '自動儲存失敗（瀏覽器容量不足或被封鎖），這次的內容重新整理後可能會消失。',
  imageNotSaved: '圖片存不進這個瀏覽器（容量不足或無痕模式），可以繼續使用，但重新整理後會消失。',
  openConfirmTitle: '開啟專案檔？',
  openConfirmDesc: '目前的圖片切換內容會被取代（開啟後可以復原）。',
  openConfirmLabel: '開啟',
  projectOpened: '已開啟專案檔',
  projectSaved: '已儲存專案檔',
  projectReset: '已重設',
  projectOpenFailed: '無法開啟專案檔',
  projectBad: '專案檔的內容無法使用。',
  projectMissingImage: '專案檔裡有圖片讀不到，無法開啟。',
  projectNotSaved: '專案檔的圖片存不進這個瀏覽器，重新整理後會消失。',
  resetTitle: '重設圖片切換？',
  resetDesc: '會清空圖片清單並回到預設值（可以復原）。',

  /* 通知 */
  added: (n: number) => `已加入 ${n} 張圖片`,
  addFailed: (names: string) => `無法讀取：${names}`,
  notImages: (names: string) => `不是圖片，已略過：${names}`,
  firstHint: '輸出尺寸已設成第一張圖的大小。',
  undo: '復原',
  redo: '重做',
  groupEdit: '編輯',
  /** 快捷鍵一覽：圖片切換模式最高 30 FPS，Ctrl＋Shift＋A 實際匯出的是 30 FPS（F138） */
  keyExportMax: (fps: number) => `以 ${fps} FPS 匯出（圖片切換最高 ${fps} FPS）`,
} as const;
