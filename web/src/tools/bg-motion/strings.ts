/** 動態背景產生器的介面文字（名稱、說明、狀態訊息都是本站自己寫的） */
import type { AspectId, FilterPresetId, QualityLevel } from '@/core/image';
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
