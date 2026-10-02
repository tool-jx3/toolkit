/**
 * 介面文字（台灣繁體中文；用詞照 DESIGN.md 第 5 節）。效果的名稱與說明在 effects.ts，字型名稱在 fonts.ts。
 */
import type { Direction8, TransitionShape } from '@/core/transition';
import type { CellOrderId, CurveId, Fps, Mode, SizeId, TextPos } from './settings';

const kb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;

export const S = {
  /* ---------- 效果 ---------- */
  effectSection: '效果',
  effect: '選擇效果',
  keepNote: '切換效果時，輸出尺寸、每秒格數、格式與自己輸入的字幕都會保留。',

  /* ---------- 外觀 ---------- */
  lookSection: '外觀',
  color: '顏色',
  glow: '邊緣發光',
  glowHint: '推進中的邊界帶著另一種顏色的光。',
  glowColor: '發光顏色',
  strobe: '雙色閃換',
  strobeOff: '不使用',
  strobeTimes: (n: number) => `${n} 次`,
  strobeHint: '動作的前 75% 在「顏色」與「第二顏色」之間輪流切換。',
  color2: '第二顏色',
  size: '輸出尺寸',
  sizes: {
    '1280x720': '1280 × 720',
    '1920x1080': '1920 × 1080',
    '960x540': '960 × 540',
    '640x360': '640 × 360（輕量）',
  } satisfies Record<SizeId, string>,
  softness: '邊緣柔和度',
  softnessHint: '數字越大，邊界的漸層越寬越柔和；1 是硬邊。',

  /* ---------- 形狀 ---------- */
  shapeSection: '形狀設定',
  optionLabel: {
    figure: '圖形',
    clock: '轉法',
    wave: '邊緣形狀',
    grid: '格子形狀',
    ink: '擴散方式',
  } as Partial<Record<TransitionShape, string>>,
  optionNames: {
    figure: { star: '星形', heart: '心形', diamond: '菱形', square: '方形', hexagon: '六角形' },
    clock: { clockwise: '順時針', symmetric: '左右對稱' },
    wave: { sine: '圓滑波', saw: '鋸齒', square: '方波' },
    grid: { square: '方形', circle: '圓形', diamond: '菱形' },
    ink: { direction: '沿方向', center: '從中心' },
  } as Partial<Record<TransitionShape, Record<string, string>>>,
  order: '出現順序',
  orders: {
    direction: '沿方向',
    center: '從中心',
    random: '隨機',
    alternate: '交錯分組',
  } satisfies Record<CellOrderId, string>,
  orderHints: {
    direction: undefined,
    center: undefined,
    random: undefined,
    alternate: '格子分兩組（棋盤格）、六角格分三組，一組長滿再換下一組。',
  } as Record<CellOrderId, string | undefined>,
  direction: '方向',
  directions: {
    right: '從左到右',
    left: '從右到左',
    down: '從上到下',
    up: '從下到上',
    'down-right': '從左上到右下',
    'down-left': '從右上到左下',
    'up-right': '從左下到右上',
    'up-left': '從右下到左上',
  } satisfies Record<Direction8, string>,
  axis: '軸向',
  axes: { vertical: '上下', horizontal: '左右' },
  countLabel: {
    blinds: '帶數',
    wave: '波數',
    drip: '液滴數',
    grid: '橫向格數',
    spiral: '圈數',
    tear: '水平帶數',
    rain: '直欄數',
    interlace: '掃描線數',
    hex: '橫向格數',
    rings: '環數',
  } as Partial<Record<TransitionShape, string>>,
  strengthLabel: {
    wave: '起伏高度',
    ink: '不規則程度',
    drip: '液滴長度',
    rotate: '轉動角度',
  } as Partial<Record<TransitionShape, string>>,
  degrees: (v: number) => `${Math.round(v * 3.6 * 10) / 10}°`,
  blockSize: '方塊大小',
  blockHint: '以輸出尺寸的 px 計。',
  ellipse: '圓的比例',
  ellipses: { circle: '正圓', ellipse: '橢圓（配合畫面長寬）' },
  center: '中心',
  centerX: '中心（左右位置）',
  centerY: '中心（上下位置）',
  bandWidth: '帶寬',
  bandHint: '「掃過」的帶有多寬（數字越大越寬）。',
  seed: '花紋',
  seedNo: (n: number) => `#${n}`,
  reseed: '換花紋',
  seedHint: '同一個編號每次產生一樣的花紋。',

  /* ---------- 時間 ---------- */
  timeSection: '時間',
  duration: '動作時間',
  durationHint: '一段動作的長度（決定影格數）。',
  hold: '停留時間',
  holdRoundTrip: '中途停留時間',
  holdHint: '整段動作播完後，最後一格多停留的時間（換場的空檔）。',
  holdRoundTripHint: '完全蓋上之後停住的時間，接著再揭開。',
  curve: '速度曲線',
  curves: {
    smoothstep: '慢進慢出',
    linear: '等速',
    quadIn: '加速',
    quadOut: '減速',
    bounceOut: '彈跳',
    flicker: '明滅後蓋上',
    lightning: '雷閃',
    heartbeat: '心跳',
  } satisfies Record<CurveId, string>,
  curveNotes: {
    smoothstep: undefined,
    linear: undefined,
    quadIn: undefined,
    quadOut: undefined,
    bounceOut: '到底後彈回幾次',
    flicker: '忽明忽暗後蓋滿',
    lightning: '閃幾下就消失',
    heartbeat: '撲通、撲通跳兩下',
  } as Record<CurveId, string | undefined>,
  fps: '每秒格數',
  fpsLabel: (f: Fps) => (f === 12 ? '12（輕量）' : String(f)),
  loop: '循環播放',
  loopHint: '開：檔案無限循環。關：播放一次，結束時停在最後一格。',

  /* ---------- 字幕 ---------- */
  captionSection: '字幕',
  caption: '字幕文字',
  captionPlaceholder: '例：——　隔天早上　——（留空就不顯示字幕）',
  captionHint: '換行就是分行；不會自動換行或縮小。',
  textColor: '文字顏色',
  fontSize: '字級',
  fontSizeHint: '以輸出尺寸的 px 計。',
  font: '字型',
  fontHint:
    '選到 Google 字型時才從 Google 下載那套字型（只下載字幕用到的字），不會上傳字幕內容或任何圖片。電腦字型可以直接輸入名稱，或從清單挑。',
  fontName: '字型名稱',
  fontNamePlaceholder: '例：Noto Sans TC',
  fontNameHint: '空白時用黑體。',
  pickFont: '從清單選',
  pickFontTitle: '從電腦的字型中挑選',
  textPos: '字幕位置',
  textPositions: { center: '正中央', bottom: '下方', top: '上方' } satisfies Record<
    TextPos,
    string
  >,
  outline: '外框',
  outlineHint: '自動加上黑或白的外框，畫面透出來時也看得清楚。',

  /* ---------- 進階 ---------- */
  advancedSection: '進階',
  mode: '轉場方式',
  modes: {
    cover: '蓋上',
    reveal: '揭開',
    sweep: '掃過',
    roundtrip: '蓋上再揭開',
  } satisfies Record<Mode, string>,
  modeNotes: {
    cover: '把畫面遮住',
    reveal: '把畫面露出來',
    sweep: '一條帶掃過去',
    roundtrip: '遮住、停一下、再露出來',
  } satisfies Record<Mode, string>,
  reach: '推進比例',
  reachHint: '100% 走完整段；調低時只走到一部分就停住，例如寬銀幕的上下黑邊、只讓四周變暗的暗角。',
  reverseOrder: '反向順序',
  reverseOrderHint: '先後顛倒：本來最後被蓋上的地方最先。',
  reversePlay: '倒著播放',
  reversePlayHint: '整段從最後一格播到第一格，用來做成對的素材。',

  /* ---------- 預覽與狀態 ---------- */
  previewLabel: '轉場預覽',
  undo: '復原',
  redo: '重做',
  status: {
    summary: (size: string, frames: number, seconds: number, loop: boolean) =>
      `輸出 ${size}・${frames} 格・${seconds.toFixed(2)} 秒・${loop ? '無限循環' : '只播一次（預覽會反覆播放）'}`,
    fontLoading: '載入字型中…',
    fontMissing: '（字型沒有載入，已改用後備字型；請檢查網路連線）',
    exporting: '正在匯出…',
    exportingFrame: (done: number, total: number) => `正在匯出… 第 ${done}／${total} 格`,
    saved: (name: string, size: string, frames: number, bytes: number) =>
      `已匯出 ${name}（${size}・${frames} 格・${kb(bytes)}）`,
    tooBigWebp: (block: boolean) =>
      `檔案超過 5 MB，CCFOLIA 無法上傳。可以把輸出尺寸改小、每秒格數改低、動作時間改短${block ? '、方塊改大' : ''}。`,
    tooBigApng: (webp: boolean, block: boolean) =>
      `檔案超過 5 MB，上傳到 CCFOLIA 會變成不會動的圖。${
        webp
          ? '改用 WebP 格式會小很多。'
          : `可以把輸出尺寸改小、每秒格數改低、動作時間改短${block ? '、方塊改大' : ''}。`
      }`,
    error: (msg: string) => `錯誤：${msg}`,
  },

  /* ---------- 匯出 ---------- */
  formats: {
    webp: 'WebP（建議）',
    apng: 'APNG（.png）',
  },
  formatNotes: {
    webp: '檔案比 APNG 小很多，CCFOLIA 可以直接播放。',
    apng: 'APNG 超過 5 MB 時，CCFOLIA 會把它變成不會動的圖；適合無法使用 WebP 的場合。',
  },
  noWebp: '這個瀏覽器無法匯出 WebP（例如 Safari），只能存成 APNG；Chrome、Edge 可以匯出 WebP。',
  exportedFps: '由「時間」的每秒格數決定',
  /** 結果卡的 5 MB 提醒後面接的減量建議 */
  sizeHint: {
    webp: (block: boolean) =>
      `可以把輸出尺寸改小、每秒格數改低、動作時間改短${block ? '、方塊改大' : ''}。`,
    apng: (webp: boolean, block: boolean) =>
      `APNG 在 CCFOLIA 會變成不會動的圖；${
        webp
          ? '改用 WebP 會小很多。'
          : `可以把輸出尺寸改小、每秒格數改低、動作時間改短${block ? '、方塊改大' : ''}。`
      }`,
  },

  /* ---------- 使用方式（規格 4.8） ---------- */
  usage: [
    '先挑一個效果，再調整顏色與時間，最後按「匯出」下載。',
    'CCFOLIA 能上傳的圖片最大 5 MB；APNG 超過上限時會被變成靜止圖。WebP 通常只有 APNG 的幾分之一到百分之一，CCFOLIA 也能播放，所以建議用 WebP。',
    '檔案預設只播一次並停在最後一格：「蓋上」類最後是一片顏色，「揭開」類最後是透明；預覽則會一直重複，方便檢查。',
    '兩張一組最自然：先放「蓋上」的素材把畫面遮住、換掉場景，再放「揭開」的素材。同一個效果勾「倒著播放」再匯出一次，就是成對的另一張。',
    '預覽背景可以換成自己的圖片，看看疊在場景上的樣子；圖片只在這台電腦上，不會上傳或匯出。',
    '素材是拉滿整個畫面使用的。單色的效果用 640 × 360 也不會失真，檔案小很多。',
    '「邊緣柔和度」調邊界的軟硬；「停留時間」留出換場的空檔（蓋上再揭開時是完全蓋住的時間）；「推進比例」做只走一部分的效果；「邊緣發光」讓邊界帶光；隨機花紋的效果可以按「換花紋」。',
    '全部在瀏覽器裡完成，不需要伺服器，圖片不會離開你的電腦。',
  ],
} as const;
