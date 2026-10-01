/**
 * 濾鏡預設：26 種濾鏡，各是一串 FilterOp（見 filters.ts）。
 *
 * ```ts
 * import { applyFilterToCanvas, FILTER_PRESETS } from '@/core/image';
 * applyFilterToCanvas(ctx, FILTER_PRESETS.dusk, { frame: i });
 * ```
 *
 * - 外觀依 bg-motion 規格 3.8 的描述與附件（bg-motion.examples.json 的「濾鏡」量測值）設計：
 *   參數是本站用最佳化擬合量測值求出的，單元測試逐點比對（tests/unit/g2-filters.test.ts）。
 * - 模糊、馬賽克、錯位、掃描線的大小是輸出像素；暗角、漸層、光團依畫面比例。
 * - 有顆粒（grain）的三種（粗顆粒、驚悚、褪色照片）每格不同：applyFilter* 的 frame 換了就重新產生（決定性亂數，同格可重現）。
 * - 名稱（id）只是代號；介面上的名稱由各工具自己取。
 */
import type { BlendMode, FilterOp, Rgb } from './filters';

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

/** 從一角斜向淡出（from 角 alpha，到對角線方向 reach 的位置變 0） */
const cornerWash = (
  from: readonly [number, number],
  color: Rgb,
  alpha: number,
  reach: number,
  blend: BlendMode = 'screen',
): FilterOp => ({
  op: 'gradient',
  from,
  to: [1 - from[0], 1 - from[1]],
  stops: [
    { at: 0, color, alpha },
    { at: reach, color, alpha: 0 },
  ],
  blend,
});

/** RGB 錯開（紅往右、藍往左、綠往下） */
const split = (x: number, y: number): FilterOp => ({
  op: 'shift',
  r: [x, 0],
  g: [0, y],
  b: [-x, 0],
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
  /* P07 黑線稿、P08 白線稿 */
  'line-dark': [{ op: 'lines', mode: 'dark', threshold: 24, softness: 40 }],
  'line-light': [{ op: 'lines', mode: 'light', threshold: 24, softness: 40 }],
  /* P09 水墨 */
  ink: [
    { op: 'gray' },
    { op: 'brightness', amount: 0.95 },
    { op: 'sharpen', amount: 0.05, radius: 1 },
    { op: 'edges', amount: 0.6 },
    vignette(0.0165, 0.294, 2.14),
  ],
  /* P10 馬賽克：10 × 10 輸出像素 */
  mosaic: [{ op: 'mosaic', size: 10 }],
  /* P11 粗顆粒：對比、暗角、每格不同的彩色雜訊（標準差約 10） */
  grain: [
    { op: 'contrast', amount: 1.091 },
    vignette(0.032, 0.452, 2.34),
    { op: 'grain', amount: 9.8 },
  ],
  /* P12 舊式螢幕：偏綠、RGB 錯開、每 3 px 一條暗掃描線、四周變暗 */
  crt: [
    {
      op: 'matrix',
      m: [0.8307, 0, 0, 9.63, -0.0048, 0.8912, -0.008, 14.93, 0.0011, 0, 0.8493, 10.43],
    },
    split(3, 1),
    { op: 'scanlines', period: 3, dark: 0.17, offset: 1, width: 1 },
    vignette(0.08, 0.5, 1.5),
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
  /* P15 清晨：偏暖提亮、右上一團淡暖光 */
  dawn: [
    scaleOffset([0.9975, 0.9562, 0.8789], [35.79, 28.02, 19.24]),
    {
      op: 'glow',
      center: [0.843, 0.177],
      radius: 0.214,
      color: [255, 224, 192],
      alpha: 0.193,
      blend: 'screen',
    },
  ],
  /* P16 正午：輕微提亮 */
  noon: [scaleOffset([1.0089, 1.0112, 0.9923], [15.18, 15.06, 10.94])],
  /* P17 黃昏：暖橘（亮部收在約 240）、上方暖色漸層、左上斜向橘光、褐色暗角 */
  dusk: [
    {
      op: 'matrix',
      m: [
        0.9144, 0.0526, 0.0135, 29.91, 0.019, 0.8625, 0.0075, 16.1, -0.0322, -0.0527, 0.7315, 20.14,
      ],
    },
    { op: 'fill', color: [240, 246, 254], alpha: 1, blend: 'multiply' },
    topWash([255, 170, 110], 0.1435, 0.3994),
    cornerWash([0, 0], [255, 140, 60], 0.1039, 0.349),
    vignette(0.0453, 0.38, 1.97, [70, 40, 25]),
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
  /* P20 月夜：偏藍、右上冷白光團、斜向冷光、暗角 */
  moonlit: [
    {
      op: 'matrix',
      m: [
        0.477, 0.0377, 0.0094, 11.25, 0.0225, 0.5983, 0.0117, 14.03, 0.0115, 0.0143, 0.8542, 24.62,
      ],
    },
    {
      op: 'glow',
      center: [0.811, 0.145],
      radius: 0.142,
      color: [220, 235, 255],
      alpha: 0.196,
      blend: 'screen',
    },
    cornerWash([1, 0], [170, 200, 255], 0.0796, 0.504),
    vignette(0.071, 0.42, 2.18, [5, 8, 20]),
  ],
  /* P21 驚悚：低彩度偏綠、右上暗紅、重暗角、每格不同的細顆粒 */
  horror: [
    {
      op: 'matrix',
      m: [0.3722, 0.4152, 0.0909, -3.97, 0.215, 0.6111, 0.0771, 13.49, 0.1697, 0.3459, 0.1599, 8.8],
    },
    { op: 'fill', color: [255, 243, 255], alpha: 1, blend: 'multiply' },
    cornerWash([1, 0], [120, 10, 10], 0.0534, 0.0613, 'multiply'),
    vignette(0.0344, 0.353, 2.99),
    { op: 'grain', amount: 3, mono: true },
  ],
  /* P22 起霧：對比降低、往偏藍的淺灰拉、兩團白霧、四周略暗 */
  fog: [
    {
      op: 'matrix',
      m: [
        0.6377, -0.0024, -0.0018, 84.43, 0.0004, 0.6418, -0.0049, 87.83, -0.0092, 0.0053, 0.6343,
        93.67,
      ],
    },
    {
      op: 'glow',
      center: [0.267, 0.733],
      radius: 0.232,
      color: [250, 252, 255],
      alpha: 0.0607,
      blend: 'screen',
    },
    {
      op: 'glow',
      center: [0.795, 0.332],
      radius: 0.218,
      color: [250, 252, 255],
      alpha: 0.0555,
      blend: 'screen',
    },
    vignette(0.1645, 0.446, 2.21, [120, 125, 135]),
  ],
  /* P23 霓虹：RGB 錯開、偏藍紫、左下洋紅、上方青色、暗角 */
  neon: [
    split(3, 1),
    {
      op: 'matrix',
      m: [
        0.8573, 0.0229, 0.0141, 8.589, -0.0001, 0.8265, -0.0056, 12.42, 0, -0.0019, 1.0233, 26.49,
      ],
    },
    cornerWash([0, 1], [255, 40, 200], 0.1833, 0.05),
    topWash([40, 230, 255], 0.0698, 0.3812),
    vignette(0.0767, 0.292, 3.32, [10, 0, 30]),
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
  /* P25 夢幻：提亮偏粉紫、模糊光暈、中央粉白光、淡紫暗角（量測值看不出斜向粉色，省略） */
  dream: [
    {
      op: 'matrix',
      m: [
        0.9408, 0.0128, 0.0038, 27.66, 0.0299, 0.908, 0.0163, 20.89, -0.0394, 0.0454, 0.9784, 30.34,
      ],
    },
    { op: 'blur', radius: 4.74, mix: 0.327 },
    {
      op: 'glow',
      center: [0.496, 0.49],
      radius: 0.448,
      color: [255, 235, 245],
      alpha: 0.0971,
      blend: 'screen',
    },
    vignette(0.028, 0.322, 1.33, [120, 90, 150]),
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
