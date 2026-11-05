/**
 * 畫錄影帶的畫面（預覽與匯出同一段程式；規格 3.2～3.5、3.11）：
 * - 照片層（compose）：照片依位置（可以左右反轉）畫上、調色（色調、亮度、飽和度）、浮起暗部，拆成紅綠藍三張色版；
 *   照片、位置、比例、合成寬度、調色改變時才重做。
 * - 一格（frame）：訊號層（色差、撕裂、掉訊或無訊號 →〔開場的上下捲動〕→ 字幕 →〔開場的雪花〕→ 左上文字與時間碼 →〔開場的頻道〕
 *   →〔日期戳記〕→ 追蹤條 →〔暫停的雜訊帶〕→ 雜訊 → 掃描線 → 亮帶 →〔開場的閃光〕→〔閃爍〕）
 *   → 映像管的弧面 → 暗角、玻璃反光 → 圓角 →〔收尾的關機〕。
 * 效果的算式與數值照原作（FX）；同樣的 t、磨損度、照片與位置，畫出來的像素與原作相同（雜訊用固定種子，D3）。
 * 〔〕裡的是 2026-11-05 跟進原作加的，沒用到時畫布的指令和加入之前完全相同（tests/unit/vhs-frame-golden.test.ts）。
 * 中間用的畫布依大小留著重複用（每個 VhsRenderer 一組；預覽與匯出各用各的）。
 */
import { makeCanvas } from '@/core/image';
import { canvasFilterSupported } from '@/core/scene';
import { createRandom } from '@/core/timeline';
import { captionFont, NO_SIGNAL, OSD_FONT_SPEC, osdFontCss } from './fonts';
import {
  type Aspect,
  type CaptionStyle,
  coverScale,
  defaultCaptionStyle,
  defaultEffects,
  type Effects,
  heightFor,
  type IntroFrame,
  type OsdFont,
  osdPaused,
  type PhotoView,
  SCREEN_W,
  type Size,
  type StampColor,
  type StampSide,
  screenSize,
  type Tone,
  viewRect,
} from './model';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

/* ---------- 效果的數值（照原作） ---------- */

export const FX = {
  /** 照片的調色：CSS 濾鏡（飽和度、對比、亮度）＋以「相加」疊上的暗部浮起 */
  grade: {
    filter: 'saturate(0.78) contrast(0.9) brightness(1.06)',
    saturate: 0.78,
    contrast: 0.9,
    brightness: 1.06,
    lift: 'rgba(34,48,66,0.30)',
  },
  /** 色差：紅藍左右錯開 (base ＋ perWear × 磨損) × k ＋ 抖動；綠色往下 */
  chroma: {
    base: 1.2,
    perWear: 6.5,
    wobble: 0.5,
    wobbleSpeed: 2.7,
    jitterRate: 20,
    jitter: 2,
    greenRate: 13,
    greenSeed: 7,
    green: 1.2,
  },
  /** 橫向撕裂 */
  tear: { perWear: 5.5, rate: 6, seedStep: 17, seedLine: 91, height: 0.045, shift: 0.13 },
  /** 磁帶掉訊 */
  dropout: {
    perWear: 7,
    rate: 9,
    seedStep: 31,
    seedLine: 53,
    skip: 0.55,
    width: 0.07,
    minWidth: 6,
    light: 'rgba(255,255,255,0.55)',
    dark: 'rgba(0,0,0,0.6)',
  },
  /** 追蹤條 */
  tracking: {
    speed: 0.075,
    cycle: 1.45,
    lead: 0.22,
    from: -0.12,
    to: 1.02,
    height: 0.035,
    heightWear: 0.05,
    rate: 4,
    shift: 0.05,
    shiftBase: 0.4,
    glow: 0.1,
    glowWear: 0.14,
  },
  /** 雜訊 */
  noise: { tiles: 6, size: 168, rate: 14, offsetRate: 17, alpha: 0.07, alphaWear: 0.19, cell: 420 },
  /** 掃描線 */
  scan: { lines: 190, alpha: 0.3, alphaWear: 0.1 },
  /** 亮帶 */
  hum: { speed: 0.11, cycle: 1.6, lead: 0.3, height: 0.3, glow: 0.045 },
  /** 映像管的弧面 */
  barrel: { amount: 0.028, strips: 75, minStrip: 6 },
  /** 暗角與玻璃反光 */
  vignette: { inner: 0.3, outer: 0.8, color: 'rgba(0,0,0,0.72)' },
  glass: { toX: 0.75, toY: 0.9 },
  /** 圓角（短邊的比例） */
  corner: 0.075,
  /** 無訊號 */
  blue: '#1A21A8',
  /** 字幕 */
  caption: {
    size: 0.062,
    bottom: 0.1,
    lineHeight: 1.28,
    stroke: 0.2,
    minStroke: 3,
    strokeColor: 'rgba(0,0,0,0.88)',
    fill: '#F2EFE4',
    /** 新版：最寬的一行超過畫面寬的這個比例就縮小（F15） */
    maxWidth: 0.9,
  },
  /** 左上文字與時間碼 */
  osd: {
    size: 0.042,
    pad: 0.055,
    shadow: 0.09,
    shadowColor: 'rgba(0,0,0,0.75)',
    fill: '#EDEDE6',
    /** 新版：「●」的紅色（F21） */
    dot: '#E8402F',
  },
  noSignal: { size: 0.058, lift: 0.02, color: 'rgba(255,255,255,0.92)' },

  /* ---- 2026-11-05 跟進原作（數值照原作 e5d589e） ---- */
  /** 字幕的樣子：黃字、黑底（黑 62%，左右各留 0.45 字級，高 1.32 字級） */
  captionLook: {
    yellow: '#FFE45C',
    box: 'rgba(0,0,0,0.62)',
    boxPadX: 0.45,
    boxTop: 0.98,
    boxHeight: 1.32,
    /** 字幕在上方時第一行的基線：round(H × 0.15)（有左上文字或右上時）或 round(H × 0.08) ＋ 字級 */
    topWithOsd: 0.15,
    top: 0.08,
    /** 日期戳記開著時，下方的字幕往上移 0.075H */
    stampLift: 0.075,
  },
  /** 日期戳記：字級 0.046H、離邊 0.075H、行距 1.2 字級 */
  stamp: {
    size: 0.046,
    pad: 0.075,
    lineHeight: 1.2,
    color: { orange: '#FFB23E', white: '#F2EFE4' } satisfies Record<StampColor, string>,
  },
  /** 「●」閃爍：每 1/1.6 秒換一次（亮、暗輪流） */
  blink: 1.6,
  /** 暫停的雜訊帶：高 0.045H、在 0.80H 上下抖 0.6%，雜訊 85% */
  pause: { height: 0.045, at: 0.8, jitter: 0.012, rate: 10, tileRate: 20, scroll: 30, alpha: 0.85 },
  /** 閃爍：每 1/24 秒換一次，黑 rnd × 9% ×（0.5 ＋ 磨損） */
  flicker: { rate: 24, seed: 3, alpha: 0.09, base: 0.5 },
  /** 開場的雪花：顆粒（每 1/23 秒換一張、起點每 1/29 秒換）、藍灰的一層、兩道往下的光（相位 0 與 0.5） */
  snow: {
    tileRate: 23,
    offsetRate: 29,
    cell: 520,
    haze: { rgb: '14,20,36', alpha: 0.45 },
    light: {
      rgb: '200,215,255',
      alpha: 0.13,
      speed: 0.8,
      phases: [0, 0.5],
      travel: 1.3,
      start: 0.15,
      size: 0.24,
    },
  },
  /** 開場的上下捲動：左右抖動（每 1/31 秒換、最多 3.5% 寬）、接縫的暗帶（高 8%、中間黑 92%） */
  roll: { swayRate: 31, sway: 0.035, seam: 0.08, seamPeak: 0.92 },
  /** 開場右上的頻道與收訊格（字級、位置、顏色；收訊格的大小以字級計） */
  tuner: {
    em: 0.052,
    top: 0.08,
    inset: 0.09,
    drop: 0.06,
    dropColor: 'rgba(0,0,0,0.55)',
    glowColor: 'rgba(110,255,150,0.7)',
    glowBlur: 0.4,
    on: '#86FFA6',
    off: 'rgba(134,255,166,0.22)',
    cells: 8,
    cellWidth: 0.15,
    cellGap: 0.07,
    cellHeight: 0.12,
    below: 1.3,
  },
  /** 開場收到訊號時的閃光（濾色） */
  flash: '235,242,255',
  /** 收尾（關機）的顏色：底、光暈、變亮的那一層、橫線、亮點 */
  shutdown: {
    base: '#030406',
    halo: '205,225,255',
    glare: '235,242,255',
    line: '#F2F7FF',
    dot: '#F7FAFF',
  },
} as const;

/** 色調（CSS 濾鏡的順序與數值、暗部浮起的顏色、夜視的綠色〔相乘〕；vhs＝原本的） */
type GradeOp = readonly [
  'saturate' | 'contrast' | 'brightness' | 'sepia' | 'grayscale' | 'hue-rotate',
  number,
];
export const TONE_SPEC: Record<Tone, { ops: readonly GradeOp[]; lift: string; tint?: string }> = {
  vhs: {
    ops: [
      ['saturate', FX.grade.saturate],
      ['contrast', FX.grade.contrast],
      ['brightness', FX.grade.brightness],
    ],
    lift: FX.grade.lift,
  },
  warm: {
    ops: [
      ['sepia', 0.32],
      ['saturate', 0.95],
      ['contrast', 0.9],
      ['brightness', 1.06],
    ],
    lift: 'rgba(66,42,22,0.30)',
  },
  cool: {
    ops: [
      ['saturate', 0.7],
      ['contrast', 0.92],
      ['brightness', 1.04],
      ['hue-rotate', -8],
    ],
    lift: 'rgba(18,52,86,0.36)',
  },
  faded: {
    ops: [
      ['saturate', 0.45],
      ['contrast', 0.8],
      ['brightness', 1.12],
    ],
    lift: 'rgba(52,50,56,0.32)',
  },
  mono: {
    ops: [
      ['grayscale', 1],
      ['contrast', 0.95],
      ['brightness', 1.05],
    ],
    lift: 'rgba(40,40,40,0.28)',
  },
  night: {
    ops: [
      ['grayscale', 1],
      ['contrast', 1.2],
      ['brightness', 1.15],
    ],
    lift: 'rgba(8,40,16,0.30)',
    tint: '#6DFF8E',
  },
};

/** 照片層的調色與反轉（預設＝原本的） */
export interface ComposeLook {
  tone: Tone;
  /** 亮度、飽和度（%，100＝不調整） */
  brightness: number;
  saturation: number;
  flip: boolean;
}
export const DEFAULT_LOOK: Readonly<ComposeLook> = Object.freeze({
  tone: 'vhs',
  brightness: 100,
  saturation: 100,
  flip: false,
});

/** 調色的步驟：色調，再加上亮度、飽和度（不是 100% 時；照原作的順序） */
export function gradeOps(look: Pick<ComposeLook, 'tone' | 'brightness' | 'saturation'>): GradeOp[] {
  const ops: GradeOp[] = [...TONE_SPEC[look.tone].ops];
  if (look.brightness !== 100) ops.push(['brightness', look.brightness / 100]);
  if (look.saturation !== 100) ops.push(['saturate', look.saturation / 100]);
  return ops;
}

/** 調色的 CSS 濾鏡（vhs、不調整時＝原本的 saturate(0.78) contrast(0.9) brightness(1.06)） */
export const gradeFilter = (ops: readonly GradeOp[]): string =>
  ops.map(([k, v]) => (k === 'hue-rotate' ? `${k}(${v}deg)` : `${k}(${v})`)).join(' ');

/** 由整數決定的 0～1 的數（同一個 n 永遠相同；原作的做法） */
export function rnd(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------- 雜訊顆粒（固定種子，D3） ---------- */

/** 雜訊顆粒的亂數種子（mulberry32；對等驗證時把同一個產生器換進原作） */
export const NOISE_SEED = 0x76687321;

let tiles: AnyCanvas[] | null = null;

/** 6 張 168 × 168 的灰色顆粒（2 × 2 px 一顆，亮度 0～254） */
export function noiseTiles(): AnyCanvas[] {
  if (tiles) return tiles;
  const rand = createRandom(NOISE_SEED);
  const N = FX.noise.size;
  const out: AnyCanvas[] = [];
  for (let n = 0; n < FX.noise.tiles; n++) {
    const c = makeCanvas(N, N);
    const x = ctx2d(c);
    const img = x.createImageData(N, N);
    const d = img.data;
    for (let y = 0; y < N; y += 2) {
      for (let px = 0; px < N; px += 2) {
        const v = (rand.next() * 255) | 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const o = ((y + dy) * N + (px + dx)) * 4;
            d[o] = v;
            d[o + 1] = v;
            d[o + 2] = v;
            d[o + 3] = 255;
          }
      }
    }
    x.putImageData(img, 0, 0);
    out.push(c);
  }
  tiles = out;
  return out;
}

/* ---------- 調色（畫布不支援濾鏡時，D13） ---------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * CSS 的 saturate(s) contrast(c) brightness(b)（濾鏡效果規格的矩陣與轉換，sRGB 數值、每一步夾在 0～1），就地改 RGBA（不預乘）的 RGB。
 */
export function gradePixels(
  px: Uint8ClampedArray | Uint8Array,
  s: number = FX.grade.saturate,
  c: number = FX.grade.contrast,
  b: number = FX.grade.brightness,
): void {
  const m = [
    0.213 + 0.787 * s,
    0.715 - 0.715 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 + 0.285 * s,
    0.072 - 0.072 * s,
    0.213 - 0.213 * s,
    0.715 - 0.715 * s,
    0.072 + 0.928 * s,
  ];
  const step = (v: number) => clamp01(clamp01((clamp01(v) - 0.5) * c + 0.5) * b);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const bl = px[i + 2] / 255;
    px[i] = Math.round(step(m[0] * r + m[1] * g + m[2] * bl) * 255);
    px[i + 1] = Math.round(step(m[3] * r + m[4] * g + m[5] * bl) * 255);
    px[i + 2] = Math.round(step(m[6] * r + m[7] * g + m[8] * bl) * 255);
  }
}

/** 3 × 3 的色彩矩陣（濾鏡效果規格的 feColorMatrix） */
function opMatrix(kind: GradeOp[0], a: number): number[] | null {
  if (kind === 'saturate')
    return [
      0.213 + 0.787 * a,
      0.715 - 0.715 * a,
      0.072 - 0.072 * a,
      0.213 - 0.213 * a,
      0.715 + 0.285 * a,
      0.072 - 0.072 * a,
      0.213 - 0.213 * a,
      0.715 - 0.715 * a,
      0.072 + 0.928 * a,
    ];
  if (kind === 'grayscale' || kind === 'sepia') {
    const k = 1 - Math.min(1, a);
    return kind === 'grayscale'
      ? [
          0.2126 + 0.7874 * k,
          0.7152 - 0.7152 * k,
          0.0722 - 0.0722 * k,
          0.2126 - 0.2126 * k,
          0.7152 + 0.2848 * k,
          0.0722 - 0.0722 * k,
          0.2126 - 0.2126 * k,
          0.7152 - 0.7152 * k,
          0.0722 + 0.9278 * k,
        ]
      : [
          0.393 + 0.607 * k,
          0.769 - 0.769 * k,
          0.189 - 0.189 * k,
          0.349 - 0.349 * k,
          0.686 + 0.314 * k,
          0.168 - 0.168 * k,
          0.272 - 0.272 * k,
          0.534 - 0.534 * k,
          0.131 + 0.869 * k,
        ];
  }
  if (kind === 'hue-rotate') {
    const r = (a * Math.PI) / 180;
    const c = Math.cos(r);
    const n = Math.sin(r);
    return [
      0.213 + c * 0.787 - n * 0.213,
      0.715 - c * 0.715 - n * 0.715,
      0.072 - c * 0.072 + n * 0.928,
      0.213 - c * 0.213 + n * 0.143,
      0.715 + c * 0.285 + n * 0.14,
      0.072 - c * 0.072 - n * 0.283,
      0.213 - c * 0.213 - n * 0.787,
      0.715 - c * 0.715 + n * 0.715,
      0.072 + c * 0.928 + n * 0.072,
    ];
  }
  return null;
}

/**
 * 調色的備用算法（任何一組步驟；畫布不支援濾鏡時，D13）：每一步照濾鏡效果規格算、夾在 0～1，就地改 RGBA（不預乘）的 RGB。
 * 原本的三步（gradeOps 的 vhs）用 gradePixels，算法與結果和加入之前相同。
 */
export function gradePixelsOps(px: Uint8ClampedArray | Uint8Array, ops: readonly GradeOp[]): void {
  const steps = ops.map(([k, a]) => ({ k, a, m: opMatrix(k, a) }));
  const v = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) {
    v[0] = px[i] / 255;
    v[1] = px[i + 1] / 255;
    v[2] = px[i + 2] / 255;
    for (const st of steps) {
      if (st.m) {
        const m = st.m;
        const r = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
        const g = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
        const b = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
        v[0] = clamp01(r);
        v[1] = clamp01(g);
        v[2] = clamp01(b);
      } else if (st.k === 'contrast')
        for (let c = 0; c < 3; c++) v[c] = clamp01((v[c] - 0.5) * st.a + 0.5);
      else for (let c = 0; c < 3; c++) v[c] = clamp01(v[c] * st.a);
    }
    px[i] = Math.round(v[0] * 255);
    px[i + 1] = Math.round(v[1] * 255);
    px[i + 2] = Math.round(v[2] * 255);
  }
}

/* ---------- 共用的小畫法 ---------- */

const TAU = Math.PI * 2;
/** 0～1 之間循環（負數也是） */
const wrap01 = (v: number) => ((v % 1) + 1) % 1;
/** 三次的慢進慢出 */
const smoothInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);

/** 圓角矩形的路徑（瀏覽器沒有 roundRect 時用直角） */
function roundedPath(g: Ctx, left: number, top: number, w: number, h: number, r: number): void {
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(left, top, w, h, r);
  else g.rect(left, top, w, h);
}

/** 一條上下淡出的橫帶：從 top 往下 height，中間最濃（rgb 的不透明度 peak） */
function softBand(
  g: Ctx,
  width: number,
  top: number,
  height: number,
  rgb: string,
  peak: number | string,
): void {
  const grad = g.createLinearGradient(0, top, 0, top + height);
  grad.addColorStop(0, `rgba(${rgb},0)`);
  grad.addColorStop(0.5, `rgba(${rgb},${peak})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, top, width, height);
}

/** 把一張顆粒從 (start, start) 起每 step 一張鋪滿 W × H */
function tileAcross(
  g: Ctx,
  tile: AnyCanvas,
  W: number,
  H: number,
  start: number,
  step: number,
): void {
  for (let row = start; row < H; row += step)
    for (let col = start; col < W; col += step) g.drawImage(tile, col, row, step, step);
}

/** 光暈的大小與濃度：以中心為準的橢圓（rx × ry） */
interface Halo {
  rx: number;
  ry: number;
  strength: number;
}
/** 光暈的漸層：中心 1 → 35% 處 0.4 → 外緣 0（乘上濃度） */
const HALO_FALLOFF: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.35, 0.4],
  [1, 0],
];

/** 畫一團光暈（畫布沒有變換時用；以單位圓的放射漸層、拉成橢圓） */
function paintHalo(g: Ctx, cx: number, cy: number, halo: Halo, rgb: string): void {
  if (!(halo.strength > 0 && halo.rx > 0 && halo.ry > 0)) return;
  g.save();
  g.setTransform(halo.rx, 0, 0, halo.ry, cx, cy);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [stop, k] of HALO_FALLOFF)
    grad.addColorStop(stop, `rgba(${rgb},${(halo.strength * k).toFixed(3)})`);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, 1, 0, TAU);
  g.fill();
  g.restore();
}

/**
 * 關機的一格要畫什麼（W × H 的畫面中心為準）：
 * screen＝壓扁的畫面（寬、高、蓋上去的亮度）、beam＝發光的橫線（寬、高）、spot＝亮點（半徑、不透明度），halo 一定有。
 */
interface ShutdownLook {
  screen?: { w: number; h: number; glare: number };
  beam?: { w: number; h: number };
  spot?: { r: number; alpha: number };
  halo: Halo;
}

/**
 * 關機的三段（數值照原作）：from、span 是段落在 p（0～1）上的起點與長度，look 由段內的進度 u（0～1）算出要畫的東西。
 * 壓扁：畫面變亮、寬度略增、高度縮成一條；橫線：一條發光的線從整個寬縮到很短；亮點：中間的點變小、淡掉。
 */
const SHUTDOWN_PHASES: readonly {
  from: number;
  span: number;
  look: (u: number, W: number, H: number) => ShutdownLook;
}[] = [
  {
    from: 0,
    span: 0.42,
    look: (u, W, H) => {
      const w = W * (1 + 0.04 * u);
      const h = Math.max(2, H * (1 - 0.988 * smoothInOut(u)));
      return {
        screen: { w, h, glare: 0.08 + 0.78 * u * u },
        halo: { rx: w * 0.56, ry: h * 0.5 + H * 0.06 * u, strength: 0.35 * u },
      };
    },
  },
  {
    from: 0.42,
    span: 0.28,
    look: (u, W, H) => {
      const shrink = smoothInOut(u);
      const w = Math.max(H * 0.03, W * (1.04 - shrink));
      return {
        beam: { w, h: Math.max(2, H * (0.012 - 0.006 * shrink)) },
        halo: { rx: w * 0.62 + H * 0.03, ry: H * 0.07, strength: 0.5 },
      };
    },
  },
  {
    from: 0.7,
    span: 0.3,
    look: (u, _W, H) => {
      const fade = (1 - u) ** 1.3;
      const r = H * (0.11 - 0.05 * u);
      return {
        spot: { r: H * 0.015 * (1 - 0.5 * u), alpha: fade },
        halo: { rx: r, ry: r, strength: 0.6 * fade },
      };
    },
  },
];

/** 關機進行到 p 時的那一段與段內的進度 */
export function shutdownLook(p: number, W: number, H: number): ShutdownLook {
  let phase = SHUTDOWN_PHASES[0];
  for (const ph of SHUTDOWN_PHASES) if (p >= ph.from) phase = ph;
  return phase.look(Math.min(1, (p - phase.from) / phase.span), W, H);
}

/* ---------- 一格的輸入 ---------- */

/** 照片層：紅綠藍三張色版 */
export interface Master {
  r: AnyCanvas;
  g: AnyCanvas;
  b: AnyCanvas;
  width: number;
  height: number;
}

export interface FrameParams {
  /** 畫面的時間（秒） */
  t: number;
  /** 磨損（0～1） */
  wear: number;
  /** 照片層；null＝無訊號 */
  master: Master | null;
  /** 這一格要畫的字幕（逐字打出時是打到的部分） */
  caption: readonly string[];
  /** 完整的字幕（決定字級；F15） */
  captionFull: readonly string[];
  /** 左上文字（null＝不顯示） */
  osd: string | null;
  /** 時間碼或頻道（null＝不顯示） */
  timecode: string | null;
  font: OsdFont;

  /* ---- 2026-11-05（不給＝原本的畫法） ---- */
  /** 字幕的樣子、字型、大小、位置 */
  captionStyle?: CaptionStyle;
  /** 左上文字的動態（「●」閃爍、PAUSE 的雜訊帶） */
  osdMotion?: boolean;
  /** 日期戳記（上下兩行；null＝不顯示） */
  stamp?: { lines: readonly string[]; color: StampColor; side: StampSide } | null;
  /** 效果的開關 */
  effects?: Effects;
  /** 弧面（中間伸長的比例，原本 0.028）、暗角（0～1，原本 0.72）、圓角 */
  curve?: number;
  vignette?: number;
  corners?: boolean;
  /** 開場的一格 */
  intro?: IntroFrame | null;
  /** 收尾：關機進行到哪裡（0～1） */
  off?: number | null;
}

/* ---------- 畫圖 ---------- */

export class VhsRenderer {
  private readonly pool = new Map<string, AnyCanvas>();

  /** 依名稱與大小留著的中間畫布 */
  private canvas(key: string, w: number, h: number): AnyCanvas {
    const id = `${key}${w}x${h}`;
    let c = this.pool.get(id);
    if (!c) {
      c = makeCanvas(w, h);
      this.pool.set(id, c);
    }
    return c;
  }

  /** 整張複製到名叫 key 的暫存畫布（撕裂、追蹤條、開場的捲動、收尾都從複本取） */
  private snapshot(key: string, src: AnyCanvas): AnyCanvas {
    const copy = this.canvas(key, src.width, src.height);
    const g = ctx2d(copy);
    g.clearRect(0, 0, src.width, src.height);
    g.drawImage(src, 0, 0);
    return copy;
  }

  /**
   * 照片層（規格 3.2）：寬 res、高依比例；照片依位置畫上（高品質縮放；可以左右反轉）＋調色 →〔夜視：相乘綠色〕
   * → 相加疊上暗部浮起 → 拆成三張色版。look 不給（或是預設）時和加入色調之前的畫法相同。
   */
  compose(
    photo: CanvasImageSource,
    img: Size,
    view: PhotoView,
    aspect: Aspect,
    res: number,
    look: Readonly<ComposeLook> = DEFAULT_LOOK,
  ): Master {
    const W = res;
    const H = heightFor(res, aspect);
    const f = res / SCREEN_W;
    const box = screenSize(aspect);
    const r = viewRect(img, box, view);
    /* 與原作相同的算式：縮放＝蓋滿 × 倍率 × f */
    const s = coverScale(img, box) * view.zoom * f;
    const ops = gradeOps(look);
    const plain = look.tone === 'vhs' && look.brightness === 100 && look.saturation === 100;
    const tone = TONE_SPEC[look.tone];
    /* 照片畫到畫布上（反轉時以照片的範圍左右鏡射） */
    const put = (x: Ctx) => {
      if (!look.flip) {
        x.drawImage(photo, r.x * f, r.y * f, img.width * s, img.height * s);
        return;
      }
      x.save();
      x.translate(r.x * f + img.width * s, r.y * f);
      x.scale(-1, 1);
      x.drawImage(photo, 0, 0, img.width * s, img.height * s);
      x.restore();
    };
    const base = this.canvas(`base${res}`, W, H);
    const b = ctx2d(base);
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
    b.fillStyle = '#000';
    b.fillRect(0, 0, W, H);
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    if (canvasFilterSupported()) {
      b.filter = plain ? FX.grade.filter : gradeFilter(ops);
      put(b);
      b.filter = 'none';
    } else {
      const tmp = this.canvas(`grade${res}`, W, H);
      const t = ctx2d(tmp);
      t.clearRect(0, 0, W, H);
      t.imageSmoothingEnabled = true;
      t.imageSmoothingQuality = 'high';
      put(t);
      const data = t.getImageData(0, 0, W, H);
      if (plain) gradePixels(data.data);
      else gradePixelsOps(data.data, ops);
      t.putImageData(data, 0, 0);
      b.drawImage(tmp, 0, 0);
    }
    b.imageSmoothingQuality = 'low';
    if (tone.tint) {
      b.globalCompositeOperation = 'multiply';
      b.fillStyle = tone.tint;
      b.fillRect(0, 0, W, H);
    }
    b.globalCompositeOperation = 'lighter';
    b.fillStyle = tone.lift;
    b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';
    const tint = { r: '#ff0000', g: '#00ff00', b: '#0000ff' } as const;
    const out = {} as Record<'r' | 'g' | 'b', AnyCanvas>;
    /* 色版每次新開（預覽把合成好的照片層快取起來，不同位置、寬度各留一份） */
    for (const k of ['r', 'g', 'b'] as const) {
      const c = makeCanvas(W, H);
      const x = ctx2d(c);
      x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, W, H);
      x.drawImage(base, 0, 0);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = tint[k];
      x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
      out[k] = c;
    }
    return { ...out, width: W, height: H };
  }

  /** 一格（規格 3.3）：畫到 dst（整張換掉；四角透明） */
  frame(dst: AnyCanvas, p: FrameParams): void {
    const W = dst.width;
    const H = dst.height;
    const ctx = ctx2d(dst);
    const sig = this.canvas('sig', W, H);
    /*
     * 每一格先重設訊號層（設定寬度＝清空畫布與狀態）：Chromium 的畫布被整張畫到另一張之後（撕裂、追蹤條的複本），
     * 之後畫在它上面的結果會差 1～3 階（原作也是這樣，同一個 t 先畫過別的格就略有不同）。重設之後每一格只由自己的設定決定，
     * 暫停的預覽與匯出的 PNG 逐像素相同（對等驗證 .impl-tmp/statecheck2.ts）。
     */
    sig.width = W;
    const x = ctx2d(sig);
    const { wear, t } = p;
    const k = W / SCREEN_W;
    const fx = p.effects ?? DEFAULT_EFFECTS;
    const intro = p.intro ?? null;
    const paused = !!p.osdMotion && osdPaused(p.osd);

    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);

    if (!p.master) drawNoSignal(x, W, H, p.font);
    else {
      /* 色差（關掉時三張色版照樣疊回，只是不錯開） */
      const c = FX.chroma;
      const sh = fx.chroma ? (c.base + wear * c.perWear) * k : 0;
      const j = fx.chroma
        ? Math.sin(t * c.wobbleSpeed) * c.wobble +
          rnd(Math.floor(t * c.jitterRate)) * wear * c.jitter
        : 0;
      const gy = fx.chroma
        ? rnd(Math.floor(t * c.greenRate) + c.greenSeed) * wear * c.green * k
        : 0;
      x.globalCompositeOperation = 'lighter';
      x.drawImage(p.master.r, -(sh + j), 0, W, H);
      x.drawImage(p.master.g, 0, gy, W, H);
      x.drawImage(p.master.b, sh + j, 0, W, H);
      x.globalCompositeOperation = 'source-over';

      /* 橫向撕裂：從畫撕裂之前的複本取帶子 */
      const tr = FX.tear;
      const bands = fx.tear ? Math.floor(wear * tr.perWear) : 0;
      if (bands > 0) {
        const tmp = this.snapshot('tmp', sig);
        for (let i = 0; i < bands; i++) {
          const seed = Math.floor(t * tr.rate) * tr.seedStep + i * tr.seedLine;
          const by = Math.floor(rnd(seed) * (H - 4));
          const bh = Math.min(H - by, 2 + rnd(seed + 1) * H * tr.height);
          if (bh < 1) continue;
          const dx = (rnd(seed + 2) - 0.5) * W * tr.shift * wear;
          x.drawImage(tmp, 0, by, W, bh, dx, by, W, bh);
        }
      }

      /* 磁帶掉訊 */
      const dr = FX.dropout;
      const drops = fx.dropout ? Math.floor(wear * dr.perWear) : 0;
      for (let i = 0; i < drops; i++) {
        const seed = Math.floor(t * dr.rate) * dr.seedStep + i * dr.seedLine;
        if (rnd(seed + 5) > dr.skip) continue;
        x.fillStyle = rnd(seed + 6) > 0.5 ? dr.light : dr.dark;
        x.fillRect(
          rnd(seed) * W,
          rnd(seed + 1) * H,
          dr.minWidth + rnd(seed + 2) * W * dr.width,
          Math.max(1, k * 2),
        );
      }
    }

    /* 開場：畫面上下捲動（頻道還沒對準） */
    if (intro && intro.roll > 0) this.rollSignal(sig, x, t, intro);

    /* 字幕、左上文字與時間碼（在訊號層裡） */
    drawCaption(x, W, H, p.caption, p.captionFull, {
      style: p.captionStyle,
      osdOn: p.osd !== null || p.timecode !== null,
      stampOn: !!p.stamp,
    });
    if (intro && intro.snow > 0) paintSnow(x, W, H, t, intro.snow);
    drawOsd(x, W, H, p.osd, p.timecode, p.font, !!p.osdMotion && blinkOff(t));
    if (intro) paintTuner(x, W, H, intro, p.font);
    if (p.stamp && !intro) drawStamp(x, W, H, p.stamp, p.font);

    /* 追蹤條：從畫了文字之後的複本取帶子（暫停時沒有） */
    const tk = FX.tracking;
    const tb = ((t * tk.speed) % tk.cycle) - tk.lead;
    if (fx.tracking && !paused && tb > tk.from && tb < tk.to) {
      const rawH = H * (tk.height + wear * tk.heightWear);
      const by = Math.max(0, Math.min(H - 2, Math.round(tb * H)));
      const bh = Math.max(1, Math.min(H - by, Math.round(rawH)));
      const tmp2 = this.snapshot('tb', sig);
      x.drawImage(
        tmp2,
        0,
        by,
        W,
        bh,
        (rnd(Math.floor(t * tk.rate)) - 0.5) * W * tk.shift * (tk.shiftBase + wear),
        by,
        W,
        bh,
      );
      softBand(x, W, by, bh, '255,255,255', tk.glow + wear * tk.glowWear);
    }

    /* 暫停的雜訊帶 */
    if (paused) paintPauseBand(x, W, H, t);

    /* 雜訊 */
    const nz = FX.noise;
    if (fx.noise) {
      const tilesNow = noiseTiles();
      const nt = tilesNow[Math.floor(t * nz.rate) % nz.tiles];
      x.save();
      x.globalCompositeOperation = 'overlay';
      x.globalAlpha = nz.alpha + wear * nz.alphaWear;
      const off = -Math.floor(rnd(Math.floor(t * nz.offsetRate)) * nz.size);
      const sc = Math.max(1, Math.round(W / nz.cell));
      tileAcross(x, nt, W, H, off, nz.size * sc);
      x.restore();
    }

    /* 掃描線 */
    if (fx.scan) {
      const per = Math.max(2, Math.round(H / FX.scan.lines));
      x.save();
      x.globalAlpha = FX.scan.alpha + wear * FX.scan.alphaWear;
      const pattern = x.createPattern(this.scanTile(per), 'repeat');
      if (pattern) {
        x.fillStyle = pattern;
        x.fillRect(0, 0, W, H);
      }
      x.restore();
    }

    /* 亮帶 */
    if (fx.hum) {
      const hm = FX.hum;
      const hy = (((t * hm.speed) % hm.cycle) - hm.lead) * H;
      softBand(x, W, hy, H * hm.height, '255,255,255', hm.glow);
    }

    /* 開場：收到訊號的那一下變亮 */
    if (intro && intro.flash > 0) {
      x.save();
      x.globalCompositeOperation = 'screen';
      x.fillStyle = `rgba(${FX.flash},${intro.flash.toFixed(3)})`;
      x.fillRect(0, 0, W, H);
      x.restore();
    }

    /* 閃爍 */
    if (fx.flicker) {
      const fl = FX.flicker;
      x.fillStyle = `rgba(0,0,0,${(rnd(Math.floor(t * fl.rate) + fl.seed) * fl.alpha * (fl.base + wear)).toFixed(3)})`;
      x.fillRect(0, 0, W, H);
    }

    /* 映像管的弧面 */
    this.barrel(sig, dst, p.curve ?? FX.barrel.amount);

    /* 暗角與玻璃反光 */
    const vig = p.vignette ?? DEFAULT_VIGNETTE;
    if (vig > 0) {
      const vg = ctx.createRadialGradient(
        W / 2,
        H / 2,
        H * FX.vignette.inner,
        W / 2,
        H / 2,
        H * FX.vignette.outer,
      );
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, vig === DEFAULT_VIGNETTE ? FX.vignette.color : `rgba(0,0,0,${vig})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    const gl = ctx.createLinearGradient(0, 0, W * FX.glass.toX, H * FX.glass.toY);
    gl.addColorStop(0, 'rgba(255,255,255,0.055)');
    gl.addColorStop(0.35, 'rgba(255,255,255,0.012)');
    gl.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    /* 圓角：只留圓角矩形裡面 */
    const corners = p.corners ?? true;
    if (corners) trimCorners(ctx, W, H);

    /* 收尾：映像管關機（整張重畫，圓角再裁一次） */
    if (p.off !== undefined && p.off !== null) {
      this.shutDown(dst, p.off);
      if (corners) trimCorners(ctx, W, H);
    }
  }

  /** 掃描線的一組：寬 1、高 per，上面 round(per ÷ 2) px 黑色 */
  private scanTile(per: number): AnyCanvas {
    const id = `scan${per}`;
    let c = this.pool.get(id);
    if (!c) {
      c = makeCanvas(1, per);
      const x = ctx2d(c);
      x.fillStyle = '#000';
      x.fillRect(0, 0, 1, Math.max(1, Math.round(per * 0.5)));
      this.pool.set(id, c);
    }
    return c;
  }

  /**
   * 弧面（規格 3.3 第 8 步）：先橫向、再縱向，以帶子伸長；中間伸長 amount、邊緣 0。
   * amount 很小（< 0.0005，2026-11-05 可以調到 0）時直接畫上。
   */
  private barrel(src: AnyCanvas, dst: AnyCanvas, amount: number): void {
    const W = dst.width;
    const H = dst.height;
    const ctx = ctx2d(dst);
    if (amount < 0.0005) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(src, 0, 0);
      return;
    }
    const mid = this.canvas('bar', W, H);
    const m = ctx2d(mid);
    const S = Math.max(FX.barrel.minStrip, Math.round(H / FX.barrel.strips));
    m.clearRect(0, 0, W, H);
    for (let y = 0; y < H; y += S) {
      const v = ((y + S / 2) / H) * 2 - 1;
      const w = W * (1 + amount * (1 - v * v));
      m.drawImage(src, 0, y, W, S + 1, (W - w) / 2, y, w, S + 1);
    }
    ctx.clearRect(0, 0, W, H);
    for (let x = 0; x < W; x += S) {
      const u = ((x + S / 2) / W) * 2 - 1;
      const h = H * (1 + amount * (1 - u * u));
      ctx.drawImage(mid, x, 0, S + 1, H, x, (H - h) / 2, S + 1, h);
    }
  }

  /**
   * 開場的上下捲動：訊號層的複本往下錯開（捲出去的部分從上面接回來）、整條左右晃，接縫上一條暗帶。
   * 捲動量以畫面高為單位，只取小數部分。
   */
  private rollSignal(sig: AnyCanvas, g: Ctx, t: number, intro: IntroFrame): void {
    const { width: W, height: H } = sig;
    const r = FX.roll;
    const copy = this.snapshot('roll', sig);
    const down = wrap01(intro.roll) * H;
    const sway = intro.rollJitter * (rnd(Math.floor(t * r.swayRate)) - 0.5) * W * r.sway;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    for (const top of [down - H, down]) g.drawImage(copy, sway, top);
    const seam = H * r.seam;
    softBand(g, W, down - seam / 2, seam, '0,0,0', r.seamPeak);
  }

  /** 收尾的關機（p＝0～1，三段見 SHUTDOWN_PHASES）：在 #030406 的底上以畫面中心重畫整張 */
  private shutDown(dst: AnyCanvas, p: number): void {
    const { width: W, height: H } = dst;
    const g = ctx2d(dst);
    const c = FX.shutdown;
    const look = shutdownLook(p, W, H);
    /* 壓扁的那一段要用這一格原本的畫面：塗底之前先複製 */
    const before = look.screen ? this.snapshot('off', dst) : null;
    const mid = { x: W / 2, y: H / 2 };
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = c.base;
    g.fillRect(0, 0, W, H);
    if (look.screen && before) {
      const { w, h, glare } = look.screen;
      const left = mid.x - w / 2;
      const top = mid.y - h / 2;
      g.drawImage(before, left, top, w, h);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(${c.glare},${glare.toFixed(3)})`;
      g.fillRect(left, top, w, h);
    }
    g.globalCompositeOperation = 'lighter';
    paintHalo(g, mid.x, mid.y, look.halo, c.halo);
    if (look.beam) {
      const { w, h } = look.beam;
      g.fillStyle = c.line;
      roundedPath(g, mid.x - w / 2, mid.y - h / 2, w, h, h / 2);
      g.fill();
    }
    if (look.spot) {
      g.globalAlpha = look.spot.alpha;
      g.fillStyle = c.dot;
      g.beginPath();
      g.arc(mid.x, mid.y, look.spot.r, 0, TAU);
      g.fill();
    }
    g.restore();
  }
}

/** 效果的開關（預設：閃爍以外都開＝原本的） */
const DEFAULT_EFFECTS: Readonly<Effects> = Object.freeze(defaultEffects());
/** 暗角（原本 0.72） */
const DEFAULT_VIGNETTE = 0.72;

/** 圓角：以 destination-in 只留圓角矩形（半徑 0.075 × 短邊）裡面 */
function trimCorners(g: Ctx, W: number, H: number): void {
  g.save();
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = '#fff';
  roundedPath(g, 0, 0, W, H, Math.min(W, H) * FX.corner);
  g.fill();
  g.restore();
}

/** 帶影子的字：先在 (px, py) 往右下 off 的地方畫影子，再畫字（對齊、字型由呼叫端設定） */
function castText(
  g: Ctx,
  text: string,
  px: number,
  py: number,
  off: number,
  color: string,
  shade: string = FX.osd.shadowColor,
): void {
  g.fillStyle = shade;
  g.fillText(text, px + off, py + off);
  g.fillStyle = color;
  g.fillText(text, px, py);
}

/** 「●」這時候是不是暗的（每 1/1.6 秒亮、暗輪流；t＝0 時亮） */
export const blinkOff = (t: number): boolean => Math.floor(t * FX.blink) % 2 === 1;

/** 暫停的雜訊帶：畫面下方一條上下抖動的帶子裡，雜訊顆粒（拉高兩倍、往上捲）以 85% 蓋上；顆粒依畫面放大，同雜訊 */
function paintPauseBand(g: Ctx, W: number, H: number, t: number): void {
  const pz = FX.pause;
  const zoom = Math.max(1, Math.round(W / FX.noise.cell));
  const cell = FX.noise.size * zoom;
  const top = Math.round(H * (pz.at + (rnd(Math.floor(t * pz.rate)) - 0.5) * pz.jitter));
  const lift = (Math.floor(t * pz.scroll) % FX.noise.size) * zoom;
  const tile = noiseTiles()[Math.floor(t * pz.tileRate) % FX.noise.tiles];
  g.save();
  g.beginPath();
  g.rect(0, top, W, Math.round(H * pz.height));
  g.clip();
  g.globalAlpha = pz.alpha;
  for (let col = 0; col < W; col += cell) g.drawImage(tile, col, top - lift, cell, cell * 2);
  g.restore();
}

/** 開場的雪花：濃度 a 的顆粒鋪滿 → 一層藍灰 → 兩道慢慢往下的淡光 */
function paintSnow(g: Ctx, W: number, H: number, t: number, amount: number): void {
  const sn = FX.snow;
  const a = Math.min(1, amount);
  const tile = noiseTiles()[Math.floor(t * sn.tileRate) % FX.noise.tiles];
  const step = FX.noise.size * Math.max(1, Math.round(W / sn.cell));
  const start = -Math.floor(rnd(Math.floor(t * sn.offsetRate)) * FX.noise.size);
  /* 顆粒照濃度蓋上；藍灰與淡光以不透明度 1 畫（同一組 save／restore 裡：Chromium 對畫布狀態的先後很敏感，換順序會差幾階） */
  g.save();
  g.globalAlpha = a;
  tileAcross(g, tile, W, H, start, step);
  g.globalAlpha = 1;
  g.fillStyle = `rgba(${sn.haze.rgb},${(sn.haze.alpha * a).toFixed(3)})`;
  g.fillRect(0, 0, W, H);
  const lt = sn.light;
  for (const phase of lt.phases) {
    const top = ((t * lt.speed + phase) % 1) * H * lt.travel - H * lt.start;
    softBand(g, W, top, H * lt.size, lt.rgb, (lt.alpha * a).toFixed(3));
  }
  g.restore();
}

/** 開場右上的頻道：影子 → 發光的字，下面一排收訊格（左邊的先亮）；整組照頻道字的不透明度 */
function paintTuner(g: Ctx, W: number, H: number, intro: IntroFrame, font: OsdFont): void {
  const tu = FX.tuner;
  const em = Math.round(H * tu.em * OSD_FONT_SPEC[font].scale);
  const right = W - Math.round(W * tu.inset);
  const top = Math.round(H * tu.top);
  g.save();
  g.globalAlpha = intro.channelAlpha;
  g.font = osdFontCss(font, em);
  g.textAlign = 'right';
  g.textBaseline = 'top';
  g.fillStyle = tu.dropColor;
  g.fillText(intro.channel, right + em * tu.drop, top + em * tu.drop);
  g.shadowColor = tu.glowColor;
  g.shadowBlur = em * tu.glowBlur;
  g.fillStyle = tu.on;
  g.fillText(intro.channel, right, top);
  g.shadowBlur = 0;
  const cw = em * tu.cellWidth;
  const gap = em * tu.cellGap;
  const lit = Math.round(intro.tune * tu.cells);
  for (let i = 0; i < tu.cells; i++) {
    g.fillStyle = i < lit ? tu.on : tu.off;
    g.fillRect(
      right - (tu.cells - i) * (cw + gap) + gap,
      top + em * tu.below,
      cw,
      em * tu.cellHeight,
    );
  }
  g.restore();
  g.textAlign = 'left';
}

/** 日期戳記：右下（或左下）靠邊，最後一行的基線在 H − 0.075H，往上一行一行排（最多兩行），帶影子 */
function drawStamp(
  x: Ctx,
  W: number,
  H: number,
  stamp: NonNullable<FrameParams['stamp']>,
  font: OsdFont,
): void {
  const n = stamp.lines.length;
  if (!n) return;
  const c = FX.stamp;
  const size = Math.round(H * c.size * OSD_FONT_SPEC[font].scale);
  const inset = Math.round(H * c.pad);
  const toRight = stamp.side === 'right';
  const step = size * c.lineHeight;
  x.font = osdFontCss(font, size);
  x.textBaseline = 'alphabetic';
  x.textAlign = toRight ? 'right' : 'left';
  let baseline = H - inset - (n - 1) * step;
  for (const ln of stamp.lines) {
    castText(
      x,
      ln,
      toRight ? W - inset : inset,
      baseline,
      size * FX.osd.shadow,
      c.color[stamp.color],
    );
    baseline += step;
  }
  x.textAlign = 'left';
}

/* ---------- 文字 ---------- */

/** 無訊號：藍底＋「NO SIGNAL」（D5：原作的第二行不畫） */
function drawNoSignal(x: Ctx, W: number, H: number, font: OsdFont): void {
  x.fillStyle = FX.blue;
  x.fillRect(0, 0, W, H);
  x.fillStyle = FX.noSignal.color;
  x.font = osdFontCss(font, Math.round(H * FX.noSignal.size * OSD_FONT_SPEC[font].scale));
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(NO_SIGNAL, W / 2, H / 2 - H * FX.noSignal.lift);
  x.textAlign = 'left';
}

const DEFAULT_CAPTION_STYLE: Readonly<CaptionStyle> = Object.freeze(defaultCaptionStyle());

/**
 * 字幕的字級（F15：最寬的一行超過畫面寬 90% 時等比例縮小；不取整）。
 * 2026-11-05：先乘上字幕的大小（%）再四捨五入；字型可以是明體。
 */
export function captionSize(
  x: Ctx,
  W: number,
  H: number,
  full: readonly string[],
  style: Readonly<CaptionStyle> = DEFAULT_CAPTION_STYLE,
): number {
  const base = Math.round(H * FX.caption.size * (style.size / 100));
  if (!full.length) return base;
  const max = W * FX.caption.maxWidth;
  let size = base;
  /* 字寬不一定和字級成正比（字型的微調）：縮了再量，最多 4 次 */
  for (let i = 0; i < 4; i++) {
    x.font = captionFont(size, style.font);
    const widest = Math.max(...full.map((s) => x.measureText(s).width));
    if (widest <= max) break;
    size = (size * max) / widest;
  }
  return size;
}

/**
 * 字幕（規格 3.4）：下方時最後一行的基線在 H − round(0.10H)（日期戳記開著時再往上 0.075H）；
 * 上方時第一行的基線在 round(0.15H 或 0.08H) ＋ 字級。白字黑邊、黃字黑邊，或黑底白字（不描邊）。
 */
function drawCaption(
  x: Ctx,
  W: number,
  H: number,
  lines: readonly string[],
  full: readonly string[],
  opts: { style?: Readonly<CaptionStyle>; osdOn: boolean; stampOn: boolean },
): void {
  if (!lines.length) return;
  const c = FX.caption;
  const look = FX.captionLook;
  const style = opts.style ?? DEFAULT_CAPTION_STYLE;
  const size = captionSize(x, W, H, full.length ? full : lines, style);
  x.font = captionFont(size, style.font);
  x.textAlign = 'center';
  x.textBaseline = 'alphabetic';
  x.lineJoin = 'round';
  const lh = size * c.lineHeight;
  let y: number;
  if (style.position === 'top')
    y = Math.round(H * (opts.osdOn ? look.topWithOsd : look.top)) + size;
  else {
    y = H - Math.round(H * c.bottom) - (lines.length - 1) * lh;
    if (opts.stampOn) y -= H * look.stampLift;
  }
  if (style.look === 'box') {
    const padX = size * look.boxPadX;
    x.fillStyle = look.box;
    /* 先把每一行的底都畫好，再畫字（下一行的底不會蓋到上一行的字）；行數最多 2 */
    let baseline = y;
    for (const ln of lines) {
      const textW = x.measureText(ln).width;
      x.fillRect(
        W / 2 - textW / 2 - padX,
        baseline - size * look.boxTop,
        textW + padX * 2,
        size * look.boxHeight,
      );
      baseline += lh;
    }
  }
  for (const ln of lines) {
    if (style.look !== 'box') {
      x.lineWidth = Math.max(c.minStroke, size * c.stroke);
      x.strokeStyle = c.strokeColor;
      x.strokeText(ln, W / 2, y);
    }
    x.fillStyle = style.look === 'yellow' ? look.yellow : c.fill;
    x.fillText(ln, W / 2, y);
    y += lh;
  }
  x.textAlign = 'left';
}

/** 左上文字的一段一段（「●」另外一段，畫成紅色；F21） */
export function osdRuns(text: string): { text: string; dot: boolean }[] {
  const out: { text: string; dot: boolean }[] = [];
  for (const part of text.split(/(●+)/)) {
    if (part) out.push({ text: part, dot: part.startsWith('●') });
  }
  return out;
}

/** 左上文字與時間碼（規格 3.5）：先畫影子再畫字；左上靠左、時間碼靠右；hideDot 時「●」不畫（閃爍的暗的那一下，位置照留） */
function drawOsd(
  x: Ctx,
  W: number,
  H: number,
  label: string | null,
  timecode: string | null,
  font: OsdFont,
  hideDot = false,
): void {
  if (!label && !timecode) return;
  const o = FX.osd;
  const size = Math.round(H * o.size * OSD_FONT_SPEC[font].scale);
  x.font = osdFontCss(font, size);
  x.textBaseline = 'top';
  const pad = Math.round(H * o.pad);
  const put = (txt: string, px: number, align: CanvasTextAlign, color: string = o.fill) => {
    x.textAlign = align;
    castText(x, txt, px, pad, size * o.shadow, color);
  };
  if (label) {
    const runs = osdRuns(label);
    if (runs.length === 1 && !runs[0].dot) put(label, pad, 'left');
    else {
      let px = pad;
      for (const r of runs) {
        if (!(hideDot && r.dot)) put(r.text, px, 'left', r.dot ? o.dot : o.fill);
        px += x.measureText(r.text).width;
      }
    }
  }
  if (timecode) put(timecode, W - pad, 'right');
  x.textAlign = 'left';
}
