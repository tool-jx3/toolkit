/**
 * 濾鏡預設：26 種濾鏡，各是一串 FilterOp（見 filters.ts）。
 *
 * ```ts
 * import { applyFilterToCanvas, FILTER_PRESETS } from '@/core/image';
 * applyFilterToCanvas(ctx, FILTER_PRESETS.dusk, { frame: i });
 * ```
 *
 * - 外觀依 bg-motion 規格 3.8 的描述與附件（bg-motion.examples.json 的「濾鏡」量測值）設計，單元測試逐點比對
 *   （tests/unit/g2-filters.test.ts）。舊式螢幕、時段（清晨、黃昏、月夜）、氛圍（驚悚、起霧、霓虹、夢幻）、馬賽克與線稿
 *   照原作（tools/bg-motion/js/main.js 的 applyImageFilterToCanvas）的做法改寫：逐像素調色後依序疊上畫布的填色、
 *   線性與放射狀漸層（canvasLinear、canvasVignette、canvasGlow，px 座標、像素中心）、畫布式模糊副本；其餘是擬合量測值的參數。
 * - 模糊、馬賽克、錯位、掃描線的大小是輸出像素；暗角、漸層、光團依畫面比例。
 * - 有顆粒（grain）的三種（粗顆粒、驚悚、褪色照片）每格不同：applyFilter* 的 frame 換了就重新產生（決定性亂數，同格可重現）。
 * - 名稱（id）只是代號；介面上的名稱由各工具自己取。
 */
import type { FilterOp, Rgb } from './filters';

export type FilterPresetId =
  | 'mono'
  | 'sepia'
  | 'posterize'
  | 'contrast'
  | 'soft'
  | 'sharpen'
  | 'line-dark'
  | 'line-light'
  | 'ink'
  | 'mosaic'
  | 'grain'
  | 'crt'
  | 'vignette'
  | 'rgb-split'
  | 'dawn'
  | 'noon'
  | 'dusk'
  | 'night'
  | 'midnight'
  | 'moonlit'
  | 'horror'
  | 'fog'
  | 'neon'
  | 'underwater'
  | 'dream'
  | 'faded';

/** 規格的濾鏡順序（P01～P26） */
export const FILTER_PRESET_IDS: readonly FilterPresetId[] = [
  'mono',
  'sepia',
  'posterize',
  'contrast',
  'soft',
  'sharpen',
  'line-dark',
  'line-light',
  'ink',
  'mosaic',
  'grain',
  'crt',
  'vignette',
  'rgb-split',
  'dawn',
  'noon',
  'dusk',
  'night',
  'midnight',
  'moonlit',
  'horror',
  'fog',
  'neon',
  'underwater',
  'dream',
  'faded',
];

const vignette = (amount: number, inner: number, power: number, color?: Rgb): FilterOp => ({
  op: 'vignette',
  amount,
  inner,
  outer: 1,
  power,
  color,
});

/** 各通道 × k、再加 offset（不混色的矩陣） */
const scaleOffset = (k: Rgb, offset: Rgb): FilterOp => ({
  op: 'matrix',
  m: [k[0], 0, 0, offset[0], 0, k[1], 0, offset[1], 0, 0, k[2], offset[2]],
});

/** 由上往下淡出的漸層（頂端 alpha、到 bottom（畫面高的比例）變 0） */
const topWash = (color: Rgb, alpha: number, bottom: number): FilterOp => ({
  op: 'gradient',
  from: [0.5, 0],
  to: [0.5, bottom],
  stops: [
    { at: 0, color, alpha },
    { at: 1, color, alpha: 0 },
  ],
  blend: 'screen',
});

/** RGB 錯開（紅往右、藍往左、綠往下） */
const split = (x: number, y: number): FilterOp => ({
  op: 'shift',
  r: [x, 0],
  g: [0, y],
  b: [-x, 0],
});

/* ---------- 原作的畫布疊層（照 applyImageFilterToCanvas 的各個步驟） ---------- */

/** r' = k·r + l·亮度 + offset（各色；亮度＝Rec.601）的 3×4 矩陣 */
const withLuma = (k: Rgb, l: Rgb, offset: Rgb): number[] => [
  k[0] + l[0] * 0.299,
  l[0] * 0.587,
  l[0] * 0.114,
  offset[0],
  l[1] * 0.299,
  k[1] + l[1] * 0.587,
  l[1] * 0.114,
  offset[1],
  l[2] * 0.299,
  l[2] * 0.587,
  k[2] + l[2] * 0.114,
  offset[2],
];

/** 整片填色（globalAlpha） */
const canvasFill = (color: Rgb, alpha: number): FilterOp => ({ op: 'fill', color, alpha });

/** 線性漸層（vertical：上→下；diagonal：左上角→右下角）：兩個色標、整體再乘 globalAlpha */
const canvasLinear = (
  dir: 'vertical' | 'diagonal',
  from: Rgb,
  fromAlpha: number,
  to: Rgb,
  toAlpha: number,
  globalAlpha: number,
): FilterOp => ({
  op: 'gradient',
  space: 'pixel',
  from: [0, 0],
  to: dir === 'vertical' ? [0, 1] : [1, 1],
  stops: [
    { at: 0, color: from, alpha: fromAlpha * globalAlpha },
    { at: 1, color: to, alpha: toAlpha * globalAlpha },
  ],
});

/** 暗角：中心起、長邊 × 0.74 的圓；內圈（× 0.18）以內透明，0.68 處 2%，邊緣 strength */
const canvasVignette = (strength: number, color: Rgb): FilterOp => ({
  op: 'radial',
  center: [0.5, 0.5],
  r0: 0.74 * 0.18,
  r1: 0.74,
  stops: [
    { at: 0, color, alpha: 0 },
    { at: 0.68, color, alpha: 0.02 },
    { at: 1, color, alpha: strength },
  ],
});

/** 光團：中心（畫面比例）、半徑（長邊的比例），中心的顏色往外淡成透明白、整體 globalAlpha */
const canvasGlow = (
  cx: number,
  cy: number,
  radius: number,
  color: Rgb,
  alpha: number,
): FilterOp => ({
  op: 'radial',
  center: [cx, cy],
  r0: 0,
  r1: radius,
  stops: [
    { at: 0, color, alpha },
    { at: 1, color: [255, 255, 255], alpha: 0 },
  ],
});

/** 模糊副本：blur(σ) brightness(b) 以 globalAlpha 疊回 */
const canvasBlur = (sigma: number, alpha: number, brightness: number): FilterOp => ({
  op: 'blur',
  radius: sigma,
  mix: alpha,
  brightness,
  canvas: true,
});

/** 每 gap px 一條 1 px 的暗線（第 0 列起） */
const canvasScanlines = (alpha: number, gap: number): FilterOp => ({
  op: 'scanlines',
  period: gap,
  dark: alpha,
  offset: 0,
  width: 1,
});

/** 原作的顆粒：每個像素 (亂數 − 0.5) × amount（三色同值） */
const canvasGrain = (amount: number): FilterOp => ({
  op: 'grain',
  amount: amount / Math.sqrt(12),
  mono: true,
  shape: 'uniform',
});

export const FILTER_PRESETS: Readonly<Record<FilterPresetId, readonly FilterOp[]>> = {
  /* P01 黑白：Rec.601 亮度 */
  mono: [{ op: 'gray' }],
  /* P02 暖褐 */
  sepia: [{ op: 'sepia' }],
  /* P03 色階簡化：每通道 5 階 */
  posterize: [{ op: 'posterize', levels: 5 }],
  /* P04 加強對比：以 128 為中心 × 1.18 */
  contrast: [{ op: 'contrast', amount: 1.18 }],
  /* P05 柔光：略提亮偏冷、中央偏上淡暖光、約 30% 的模糊 */
  soft: [
    { op: 'brightness', amount: [1.054, 1.055, 1.077] },
    {
      op: 'glow',
      center: [0.534, 0.474],
      radius: 0.679,
      color: [27, 26, 27],
      alpha: 1,
      blend: 'screen',
    },
    { op: 'blur', radius: 4.44, mix: 0.309 },
  ],
  /* P06 銳化 */
  sharpen: [
    { op: 'contrast', amount: 1.06 },
    { op: 'sharpen', amount: 0.5, radius: 1 },
  ],
  /* P07 黑線稿、P08 白線稿：|自己 − 右| ＋ |自己 − 下| 超過門檻的部分 × 3.2（1 px 細線） */
  'line-dark': [
    { op: 'lines', mode: 'dark', threshold: 24, softness: 255 / 3.2, kernel: 'forward' },
  ],
  'line-light': [
    { op: 'lines', mode: 'light', threshold: 22, softness: 255 / 3.2, kernel: 'forward' },
  ],
  /* P09 水墨 */
  ink: [
    { op: 'gray' },
    { op: 'brightness', amount: 0.95 },
    { op: 'sharpen', amount: 0.05, radius: 1 },
    { op: 'edges', amount: 0.6 },
    vignette(0.0165, 0.294, 2.14),
  ],
  /* P10 馬賽克：約 10 × 10 輸出像素一格，每格取格子中心的取樣（方塊清楚、對比不降） */
  mosaic: [{ op: 'mosaic', size: 10, sample: 'center' }],
  /* P11 粗顆粒：對比、暗角、每格不同的彩色雜訊（標準差約 10） */
  grain: [
    { op: 'contrast', amount: 1.091 },
    vignette(0.032, 0.452, 2.34),
    { op: 'grain', amount: 9.8 },
  ],
  /* P12 舊式螢幕：偏綠的調色、RGB 錯開（紅右 3、藍左 3、綠下 1）、第 0、3、6… 列的暗掃描線、淡綠黑薄層、暗角 */
  crt: [
    scaleOffset([0.9, 0.98, 0.92], [10, 14, 12]),
    split(3, 1),
    canvasScanlines(0.16, 3),
    canvasFill([0x0d, 0x12, 0x08], 0.05),
    canvasVignette(0.22, [0, 0, 0]),
  ],
  /* P13 四角壓暗 */
  vignette: [{ op: 'saturate', amount: 1.077 }, vignette(0.0397, 0.405, 2.24)],
  /* P14 RGB 錯位 */
  'rgb-split': [
    split(4, 2),
    scaleOffset(
      [1.0439, 1.0143, 1.0402],
      [128 - 128 * 1.0439, 128 - 128 * 1.0143, 128 - 128 * 1.0402],
    ),
    vignette(0.0273, 0.231, 1.05),
  ],
  /* P15 清晨：偏暖提亮、淡淡一層暖白、右上一團淡暖光 */
  dawn: [
    scaleOffset([1.08, 1.04, 0.95], [18, 10, 4]),
    canvasFill([0xff, 0xf3, 0xcf], 0.08),
    canvasGlow(0.78, 0.22, 0.3, [255, 242, 204], 0.14),
  ],
  /* P16 正午：輕微提亮 */
  noon: [scaleOffset([1.0089, 1.0112, 0.9923], [15.18, 15.06, 10.94])],
  /* P17 黃昏：暖橘（亮部更暖、暗部的藍略補回）、上方暖色往下淡成暗藍的漸層、左上斜向橘光、褐色暗角 */
  dusk: [
    {
      op: 'matrix',
      m: [1.02, 0, 0, 10, 0, 0.97, 0, 2, 0, 0, 0.84, 0],
      highlight: [34, 12, -12],
      shadow: [0, 0, 8],
    },
    canvasLinear('vertical', [255, 196, 122], 0.95, [44, 44, 96], 0, 0.22),
    canvasLinear('diagonal', [255, 154, 82], 0.65, [0, 0, 0], 0, 0.14),
    canvasVignette(0.18, [50, 18, 0]),
  ],
  /* P18 夜：大幅壓暗偏藍、上方藍色漸層、暗角 */
  night: [
    {
      op: 'matrix',
      m: [
        0.3679, 0.0235, 0.0054, 2.743, 0.0037, 0.4825, -0.007, 6.912, -0.0038, 0.0293, 0.6472,
        23.37,
      ],
    },
    topWash([90, 130, 220], 0.0229, 0.2619),
    vignette(0.0463, 0.531, 3.26, [0, 0, 10]),
  ],
  /* P19 深夜：更暗更藍、暗角更重 */
  midnight: [
    {
      op: 'matrix',
      m: [
        0.1722, -0.0016, 0.0039, 2.324, -0.0001, 0.2414, -0.0015, 4.294, 0.0017, 0.0116, 0.4446,
        20.39,
      ],
    },
    topWash([60, 90, 200], 0.0202, 0.401),
    vignette(0.0518, 0.519, 3.33, [0, 0, 8]),
  ],
  /* P20 月夜：偏藍的夜色（很亮的地方再加一點藍）、右上冷白光團、左上斜向冷光、暗角 */
  moonlit: [
    {
      op: 'matrix',
      m: withLuma([0.48, 0.58, 0.88], [0.06, 0.08, 0], [8, 10, 22]),
      highlight: [0, 0, 10],
      highlightAbove: 0.55,
    },
    canvasGlow(0.76, 0.18, 0.32, [196, 224, 255], 0.18),
    canvasLinear('diagonal', [128, 160, 224], 0.55, [8, 14, 28], 0, 0.14),
    canvasVignette(0.24, [4, 9, 20]),
  ],
  /* P21 驚悚：低彩度偏綠（亮部偏紅、暗部偏藍）、暗綠薄層、左上斜向暗紅、重暗角、每格不同的細顆粒 */
  horror: [
    {
      op: 'matrix',
      m: withLuma([0.18, 0.2, 0.1], [0.72, 0.84, 0.72], [0, 6, 0]),
      highlight: [22, 0, 0],
      shadow: [0, 0, 10],
    },
    canvasFill([0x18, 0x20, 0x14], 0.1),
    canvasLinear('diagonal', [98, 12, 12], 0.45, [0, 0, 0], 0, 0.12),
    canvasVignette(0.36, [6, 2, 2]),
    canvasGrain(10),
  ],
  /* P22 起霧：對比降低並往偏藍的淺灰拉、淡白薄層、兩團白霧、淺藍灰的暗角 */
  fog: [
    scaleOffset([0.78, 0.78, 0.78], [150 - 128 * 0.78, 154 - 128 * 0.78, 160 - 128 * 0.78]),
    canvasFill([0xe8, 0xed, 0xf3], 0.1),
    canvasGlow(0.24, 0.66, 0.42, [255, 255, 255], 0.14),
    canvasGlow(0.72, 0.34, 0.38, [255, 255, 255], 0.12),
    canvasVignette(0.12, [180, 190, 200]),
  ],
  /* P23 霓虹：偏藍紫（亮部偏紅）、左上斜向洋紅、上方青色、RGB 錯開（同舊式螢幕）、暗角 */
  neon: [
    { op: 'matrix', m: [0.88, 0, 0, 8, 0, 0.86, 0, 10, 0, 0, 1.08, 22], highlight: [18, 0, 0] },
    canvasLinear('diagonal', [255, 0, 140], 0.24, [0, 0, 0], 0, 0.2),
    canvasLinear('vertical', [0, 224, 255], 0.26, [0, 0, 0], 0, 0.18),
    split(3, 1),
    canvasVignette(0.18, [5, 5, 12]),
  ],
  /* P24 水下：藍綠、上方淡青漸層、輕微模糊、暗角 */
  underwater: [
    {
      op: 'matrix',
      m: [
        0.5116, -0.0129, 0.004, 6.219, 0.0003, 0.8015, -0.0014, 21.42, 0.0036, 0.003, 0.9657, 26.27,
      ],
    },
    { op: 'fill', color: [255, 255, 243], alpha: 1, blend: 'multiply' },
    { op: 'blur', radius: 1.74, mix: 0.152 },
    topWash([150, 240, 255], 0.0187, 0.3646),
    vignette(0.0223, 0.486, 2.86, [0, 15, 25]),
  ],
  /* P25 夢幻：提亮偏粉紫、約 6 px 的模糊光暈（略提亮）、中央偏上粉白光、左上斜向淡粉、淡紫暗角 */
  dream: [
    scaleOffset([1.03, 1.01, 1.06], [12, 8, 14]),
    canvasBlur(6, 0.34, 1.06),
    canvasGlow(0.48, 0.38, 0.48, [255, 236, 252], 0.16),
    canvasLinear('diagonal', [255, 221, 244], 0.22, [196, 218, 255], 0, 0.16),
    canvasVignette(0.12, [120, 110, 160]),
  ],
  /* P26 褪色照片：暖褐略褪色、褐色暗角、每格不同的顆粒 */
  faded: [
    {
      op: 'matrix',
      m: [
        0.3351, 0.6373, 0.1682, 26.55, 0.2871, 0.5613, 0.1332, 25.4, 0.1964, 0.4117, 0.0867, 17.69,
      ],
    },
    vignette(0.0409, 0.398, 1.77, [70, 45, 25]),
    { op: 'grain', amount: 4.3, mono: true },
  ],
};
