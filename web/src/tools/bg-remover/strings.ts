/**
 * 立繪去背工具的介面文字（台灣繁體中文；用詞照 DESIGN.md 第 5 節）。
 */
import type { OnnxBackendChoice } from '@/core/onnx/types';
import type { BrushTool, Mode, OutBackground, OutContent, OutFormat, ViewMode } from './model';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const S = {
  usageIntro:
    '把立繪、角色圖的背景去掉，存成透明背景的 PNG／WebP。可以用 AI 模型（動漫角色專用）或依背景色去掉純色背景，再用筆刷修邊。全部在瀏覽器裡處理，圖片不會上傳。',
  usageSteps: [
    '把圖片拖進來（可以一次放好幾張），或按「放入範例圖」試試看。',
    '選去背方式：「AI 去背」第一次要先下載模型（約 176 MB，只要一次）；白底、單色底用「純色背景」比較快。',
    '需要的話調整邊緣（收縮、羽化），再用筆刷把漏掉的地方擦掉、或把被去掉的地方補回來。',
    '在「匯出」選格式與背景，匯出這張或全部（全部可以打包成 ZIP）。',
  ],
  usageNotesTitle: '小提醒',
  usageNotes: [
    'AI 去背在可以用顯示卡（WebGPU）的瀏覽器上一張約幾秒；只能用 CPU 時一張約十幾秒到一分鐘，處理中可以取消。',
    'AI 模型是 SkyTNT 的 anime-segmentation（Apache-2.0），從 Hugging Face 下載，存在這個瀏覽器裡，之後離線也能用；不需要時可以刪除。',
    '純色背景：角色身上和背景同色的地方（白衣服、眼白）預設會留著；有漏掉的用筆刷補回。',
    '快捷鍵：E 擦掉、R 補回、V 移動畫面、[ ] 筆刷大小、1／2／3 切換預覽、A／D 上一張／下一張、Ctrl＋Z 復原（按 ? 看全部）。',
  ],
  disclaimer: '圖片只在你的瀏覽器裡處理，不會上傳到任何地方。',

  /* 去背方式 */
  sectionMethod: '去背方式',
  modeLabel: '方式',
  modes: { ai: 'AI 去背', color: '純色背景' } satisfies Record<Mode, string>,
  modeHints: {
    ai: '用 AI 模型找出角色（動漫角色專用），背景再複雜也可以。',
    color: '依背景色與容許度去掉白底、單色底，不需要下載模型。',
  } satisfies Record<Mode, string>,

  /* AI */
  sectionAi: 'AI 模型',
  backend: '運算方式',
  backends: {
    auto: '自動',
    webgpu: 'GPU（WebGPU）',
    wasm: 'CPU',
  } satisfies Record<OnnxBackendChoice, string>,
  backendHint:
    '自動：瀏覽器可以用顯示卡（WebGPU）時用顯示卡，比較快；不行時用 CPU（單執行緒，一張約十幾秒到一分鐘）。',
  backendInUse: (name: string) => `目前使用：${name}`,
  backendFallback: '顯示卡無法使用，已改用 CPU。',
  inferSize: '推論尺寸',
  inferSizeValue: '1024 × 1024（模型固定）',
  inferSizeHint:
    '圖片先等比縮放、補成正方形再交給模型，結果再縮回原尺寸。官方模型檔的輸入尺寸固定是 1024，不能改。',
  runAi: 'AI 去背這張',
  runAiAll: (n: number) => `全部 AI 去背（${n} 張）`,
  rerunAi: '重新 AI 去背',
  aiRunning: (i: number, n: number) => (n > 1 ? `AI 去背中（第 ${i}／${n} 張）…` : 'AI 去背中…'),
  aiLoadingModel: '正在載入模型…',
  aiElapsed: (s: number) => `已經 ${s} 秒`,
  aiDone: (n: number) => (n > 1 ? `已完成 ${n} 張的 AI 去背。` : '已完成 AI 去背。'),
  aiCancelled: '已取消 AI 去背。',
  cancel: '取消',
  aiFailed: (msg: string) => `AI 去背失敗：${msg}`,
  needsModel: '先下載模型才能 AI 去背。',
  wrongModel: '模型檔的輸入輸出和預期的不同（要有 img 與 mask）。',

  /* 純色 */
  sectionKey: '背景色',
  keySource: '背景色',
  keyAuto: '自動偵測',
  keyManual: '指定顏色',
  keyAutoHint: '每張圖各自從四邊找最多的顏色。',
  keyColor: '顏色',
  detected: (hex: string, ratio: number) => `偵測到：${hex}（四邊有 ${pct(ratio)} 是這個顏色）`,
  lowRatio: '四邊的顏色不太一致，可能不是純色背景：可以改用 AI 去背，或改成指定顏色、調高容許度。',
  pickFromImage: '從圖上取色',
  picking: '點一下預覽裡的背景（Esc 取消）',
  picked: (hex: string) => `背景色改成 ${hex}。`,
  tolerance: '容許度',
  toleranceHint: '和背景色差多少以內算背景（0～100，黑白相差 100）。背景有雜訊或淡淡的漸層時調高。',
  softness: '柔邊',
  softnessHint: '容許度之外再多這個範圍漸漸變不透明，邊緣比較平滑。',
  connected: '只去掉和圖邊相連的背景',
  connectedHint: '角色身上和背景同色的地方（白衣服、眼白）會留著。關掉時整張圖同色的都去掉。',
  despill: '去色邊',
  despillHint: '把半透明邊緣混到的背景色扣掉，換到深色背景時不會有一圈白邊。',

  /* 邊緣 */
  sectionEdge: '邊緣調整',
  grow: '收縮／擴張',
  growHint: '負數往內收（去掉殘留的背景邊），正數往外擴。',
  feather: '羽化',
  featherHint: '把邊緣變柔和。',

  /* 筆刷 */
  sectionBrush: '筆刷修邊',
  tool: '工具',
  tools: { move: '移動畫面', erase: '擦掉', restore: '補回' } satisfies Record<BrushTool, string>,
  toolHint: '在預覽上塗：擦掉＝變透明，補回＝回到原圖。每一筆都可以復原。',
  brushSize: '筆刷大小',
  brushHardness: '硬度',
  brushHardnessHint: '越低邊緣越柔。',
  clearStrokes: '清除這張的筆刷',
  strokeCount: (n: number) => (n ? `這張有 ${n} 筆` : '這張還沒有筆刷'),

  /* 預覽 */
  viewLabel: '預覽',
  views: { result: '結果', original: '原圖', mask: '遮罩' } satisfies Record<ViewMode, string>,
  stageLabel: '去背預覽',
  emptyStage: '把立繪拖進來，或按「放入範例圖」。',
  needsAiStage: '這張還沒 AI 去背：按「AI 去背這張」。',
  needsModelStage: '先在「AI 模型」下載模型，或改用「純色背景」。',
  loadingStage: '讀取中…',
  processingStage: '處理中…',
  prev: '上一張',
  next: '下一張',
  counter: (i: number, n: number) => `${i}／${n}`,
  counterLabel: (i: number, n: number) => `第 ${i} 張，共 ${n} 張`,
  resetView: '重設檢視',

  /* 載入 */
  dropLabel: '把立繪拖到這裡',
  dropButton: '選擇圖片',
  dropHint: 'PNG、JPG、WebP，可多選。',
  demo: '放入範例圖',
  demoNames: ['範例_白底.png', '範例_綠底.png'],
  listLabel: '已載入的圖片',
  listEmpty: '還沒有圖片。',
  remove: (name: string) => `移除 ${name}`,
  statusDone: '已去背',
  sizeMeta: (w: number, h: number) => `${w}×${h}`,
  loaded: (n: number) => `已加入 ${n} 張圖片。`,
  adding: (i: number, n: number) => `讀取圖片中（第 ${i}／${n} 張）…`,
  readFailed: (names: string[]) => `無法讀取：${names.join('、')}`,
  typeError: '只能放入圖片（PNG、JPG、WebP、GIF、BMP、AVIF）。',
  skipped: (n: number) => `略過 ${n} 個不是圖片的檔案。`,
  tooLarge: (name: string) => `${name} 太大了（超過 6,000 萬像素），請先縮小再放進來。`,
  storageWarn: '瀏覽器的儲存空間不足，這次加入的圖片重新整理後就不見了（照常可以去背、匯出）。',
  removed: (name: string) => `已移除 ${name}（可以復原）。`,

  /* 匯出 */
  exportTitle: '匯出',
  scope: '範圍',
  scopes: (n: number) => ({ current: '這張', all: `全部（${n} 張）` }),
  content: '內容',
  contents: { cutout: '去背圖', mask: '遮罩', compare: '比較圖' } satisfies Record<
    OutContent,
    string
  >,
  contentHints: {
    cutout: '透明背景的角色圖（也可以鋪上背景色）。',
    mask: '黑白遮罩，白色＝留下的部分，和原圖一樣大。',
    compare: '原圖、去背後疊在黑底、遮罩三張左右並排（同原作「不只輸出去背圖」）。',
  } satisfies Record<OutContent, string>,
  background: '背景',
  backgrounds: { transparent: '透明', white: '白色', color: '自訂色' } satisfies Record<
    OutBackground,
    string
  >,
  backgroundJpg: 'JPG 沒有透明：選「透明」時用白色。',
  bgColor: '背景顏色',
  trim: '裁掉透明邊',
  trimHint: '只留下角色的範圍。',
  trimPad: '四周留白',
  formats: { png: 'PNG', webp: 'WebP', jpg: 'JPG' } satisfies Record<OutFormat, string>,
  formatHints: {
    png: '無損，保留透明。',
    webp: '無損，保留透明，檔案通常比 PNG 小。',
    jpg: '有損（品質 95），沒有透明。',
  } satisfies Record<OutFormat, string>,
  webpUnsupported: '這個瀏覽器無法匯出 WebP（Safari 不支援），請改用 PNG。',
  sizeWarningHint: '可以改用 WebP，或開啟「裁掉透明邊」。',
  fileNameHint: '檔名：原檔名加上「_去背」「_遮罩」或「_比較」。',
  exportProgress: (i: number, n: number) => `第 ${i}／${n} 張`,
  exportNeedsAi: (names: string[]) => `這些圖還沒 AI 去背：${names.join('、')}`,
  exportEmpty: '還沒有圖片。',
  exportCancelling: '正在取消…',
  exportCancelled: '已取消匯出。',
  zipName: '去背',

  /* 快捷鍵 */
  keys: {
    tools: '筆刷',
    view: '預覽',
    images: '圖片',
    edit: '編輯',
    erase: '擦掉',
    restore: '補回',
    move: '移動畫面',
    smaller: '筆刷變小',
    bigger: '筆刷變大',
    result: '看結果',
    original: '看原圖',
    mask: '看遮罩',
    prev: '上一張',
    next: '下一張',
    paste: '貼上圖片',
    export: '匯出',
    undo: '復原',
    redo: '重做',
    cancel: '取消取色',
  },
  undo: '復原',
  redo: '重做',

  /* 專案檔 */
  project: {
    newer: '這個專案檔是比較新的版本做的，請重新整理頁面再試一次。',
    invalid: '這不是立繪去背工具的專案檔。',
    missing: (n: number) => `專案檔裡有 ${n} 張圖找不到，已從清單拿掉。`,
    resetTitle: '全部重來？',
    resetText: '清單裡的圖片、筆刷與設定都會清掉（下載好的 AI 模型會留著）。',
  },
};
