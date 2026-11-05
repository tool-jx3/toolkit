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
  /** 開場：雪花（顆粒、藍灰、兩道慢慢往下的光）、上下捲動、頻道與收訊格、閃光 */
  intro: {
    snowRate: 23,
    snowOffsetRate: 29,
    snowCell: 520,
    snowTint: [14, 20, 36, 0.45],
    snowBand: { speed: 0.8, spread: 1.3, lead: 0.15, height: 0.24, alpha: 0.13 },
    rollJitterRate: 31,
    rollJitter: 0.035,
    rollBand: 0.08,
    rollBandAlpha: 0.92,
    channel: {
      size: 0.052,
      pad: 0.08,
      right: 0.09,
      shadow: 0.06,
      shadowColor: 'rgba(0,0,0,0.55)',
      glow: 'rgba(110,255,150,0.7)',
      glowBlur: 0.4,
      color: '#86FFA6',
      dim: 'rgba(134,255,166,0.22)',
      bars: 8,
      barWidth: 0.15,
      barGap: 0.07,
      barHeight: 0.12,
      barTop: 1.3,
    },
    flash: '235,242,255',
  },
  /** 收尾：映像管關機 */
  off: {
    base: '#030406',
    glow: '205,225,255',
    light: '235,242,255',
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

/** easeInOut（三次） */
const easeInOut = (q: number) => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);

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
        const tmp = this.canvas('tmp', W, H);
        const tc = ctx2d(tmp);
        tc.clearRect(0, 0, W, H);
        tc.drawImage(sig, 0, 0);
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
    if (intro && intro.roll > 0) this.roll(sig, x, W, H, t, intro);

    /* 字幕、左上文字與時間碼（在訊號層裡） */
    drawCaption(x, W, H, p.caption, p.captionFull, {
      style: p.captionStyle,
      osdOn: p.osd !== null || p.timecode !== null,
      stampOn: !!p.stamp,
    });
    if (intro && intro.snow > 0) drawSnow(x, W, H, t, intro.snow);
    drawOsd(x, W, H, p.osd, p.timecode, p.font, !!p.osdMotion && blinkOff(t));
    if (intro) drawBigChannel(x, W, H, intro, p.font);
    if (p.stamp && !intro) drawStamp(x, W, H, p.stamp, p.font);

    /* 追蹤條：從畫了文字之後的複本取帶子（暫停時沒有） */
    const tk = FX.tracking;
    const tb = ((t * tk.speed) % tk.cycle) - tk.lead;
    if (fx.tracking && !paused && tb > tk.from && tb < tk.to) {
      const rawH = H * (tk.height + wear * tk.heightWear);
      const by = Math.max(0, Math.min(H - 2, Math.round(tb * H)));
      const bh = Math.max(1, Math.min(H - by, Math.round(rawH)));
      const tmp2 = this.canvas('tb', W, H);
      const t2 = ctx2d(tmp2);
      t2.clearRect(0, 0, W, H);
      t2.drawImage(sig, 0, 0);
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
      const g = x.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${tk.glow + wear * tk.glowWear})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, by, W, bh);
    }

    /* 暫停的雜訊帶 */
    if (paused) drawPauseBand(x, W, H, t);

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
      for (let yy = off; yy < H; yy += nz.size * sc)
        for (let xx = off; xx < W; xx += nz.size * sc)
          x.drawImage(nt, xx, yy, nz.size * sc, nz.size * sc);
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
      const hg = x.createLinearGradient(0, hy, 0, hy + H * hm.height);
      hg.addColorStop(0, 'rgba(255,255,255,0)');
      hg.addColorStop(0.5, `rgba(255,255,255,${hm.glow})`);
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = hg;
      x.fillRect(0, hy, W, H * hm.height);
    }

    /* 開場：收到訊號的那一下變亮 */
    if (intro && intro.flash > 0) {
      x.save();
      x.globalCompositeOperation = 'screen';
      x.fillStyle = `rgba(${FX.intro.flash},${intro.flash.toFixed(3)})`;
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
    if (corners) roundCorners(ctx, W, H);

    /* 收尾：映像管關機（整張重畫，圓角再裁一次） */
    if (p.off !== undefined && p.off !== null) {
      this.powerOff(dst, p.off);
      if (corners) roundCorners(ctx, W, H);
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

  /** 開場：訊號層往下捲 roll 個畫面高、左右抖，接縫是一條黑帶 */
  private roll(sig: AnyCanvas, x: Ctx, W: number, H: number, t: number, intro: IntroFrame): void {
    const it = FX.intro;
    const tmp = this.canvas('roll', W, H);
    const tc = ctx2d(tmp);
    tc.clearRect(0, 0, W, H);
    tc.drawImage(sig, 0, 0);
    const dy = (((intro.roll % 1) + 1) % 1) * H;
    const jx =
      intro.rollJitter * (rnd(Math.floor(t * it.rollJitterRate)) - 0.5) * W * it.rollJitter;
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    x.drawImage(tmp, jx, dy - H);
    x.drawImage(tmp, jx, dy);
    const bh = H * it.rollBand;
    const g = x.createLinearGradient(0, dy - bh / 2, 0, dy + bh / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, `rgba(0,0,0,${it.rollBandAlpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, dy - bh / 2, W, bh);
  }

  /**
   * 收尾：映像管關機（p＝0～1）：畫面變亮、上下壓扁（～0.42）→ 一條發光的橫線縮短（～0.7）→ 中間一個亮點淡掉。
   * 整張重畫（底是 #030406）。
   */
  private powerOff(dst: AnyCanvas, p: number): void {
    const W = dst.width;
    const H = dst.height;
    const ctx = ctx2d(dst);
    const o = FX.off;
    const tmp = this.canvas('off', W, H);
    const tc = ctx2d(tmp);
    tc.clearRect(0, 0, W, H);
    tc.drawImage(dst, 0, 0);
    const cx = W / 2;
    const cy = H / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = o.base;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    if (p < 0.42) {
      const q = p / 0.42;
      const e = easeInOut(q);
      const w = W * (1 + 0.04 * q);
      const h = Math.max(2, H * (1 - 0.988 * e));
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, cx - w / 2, cy - h / 2, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${o.light},${(0.08 + 0.78 * q * q).toFixed(3)})`;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      glow(ctx, cx, cy, w * 0.56, h * 0.5 + H * 0.06 * q, o.glow, 0.35 * q);
    } else if (p < 0.7) {
      const q = (p - 0.42) / 0.28;
      const e = easeInOut(q);
      const lw = Math.max(H * 0.03, W * (1.04 - e));
      const lh = Math.max(2, H * (0.012 - 0.006 * e));
      glow(ctx, cx, cy, lw * 0.62 + H * 0.03, H * 0.07, o.glow, 0.5);
      ctx.fillStyle = o.line;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - lw / 2, cy - lh / 2, lw, lh, lh / 2);
      else ctx.rect(cx - lw / 2, cy - lh / 2, lw, lh);
      ctx.fill();
    } else {
      const q = Math.min(1, (p - 0.7) / 0.3);
      const fade = (1 - q) ** 1.3;
      const rr = H * (0.11 - 0.05 * q);
      glow(ctx, cx, cy, rr, rr, o.glow, 0.6 * fade);
      ctx.globalAlpha = fade;
      ctx.fillStyle = o.dot;
      ctx.beginPath();
      ctx.arc(cx, cy, H * 0.015 * (1 - 0.5 * q), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 效果的開關（預設：閃爍以外都開＝原本的） */
const DEFAULT_EFFECTS: Readonly<Effects> = Object.freeze(defaultEffects());
/** 暗角（原本 0.72） */
const DEFAULT_VIGNETTE = 0.72;

/** 圓角：只留圓角矩形裡面（半徑 0.075 × 短邊） */
function roundCorners(ctx: Ctx, W: number, H: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#fff';
  const radius = Math.min(W, H) * FX.corner;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, W, H, radius);
  else ctx.rect(0, 0, W, H);
  ctx.fill();
  ctx.restore();
}

/** 橢圓的光暈（中心 alpha → 0.35 處 alpha × 0.4 → 外緣 0） */
function glow(
  ctx: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rgb: string,
  alpha: number,
): void {
  if (alpha <= 0 || rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`);
  g.addColorStop(0.35, `rgba(${rgb},${(alpha * 0.4).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 「●」這時候是不是暗的（每 1/1.6 秒亮、暗輪流；t＝0 時亮） */
export const blinkOff = (t: number): boolean => Math.floor(t * FX.blink) % 2 === 1;

/** 暫停的雜訊帶：畫面下方一條上下抖動的雜訊（顆粒依畫面放大，同雜訊） */
function drawPauseBand(x: Ctx, W: number, H: number, t: number): void {
  const pz = FX.pause;
  const N = FX.noise.size;
  const m = Math.max(1, Math.round(W / FX.noise.cell));
  const ph = Math.round(H * pz.height);
  const py = Math.round(H * (pz.at + (rnd(Math.floor(t * pz.rate)) - 0.5) * pz.jitter));
  const nt = noiseTiles()[Math.floor(t * pz.tileRate) % FX.noise.tiles];
  x.save();
  x.beginPath();
  x.rect(0, py, W, ph);
  x.clip();
  x.globalAlpha = pz.alpha;
  const oy = py - (Math.floor(t * pz.scroll) % N) * m;
  for (let xx = 0; xx < W; xx += N * m) x.drawImage(nt, xx, oy, N * m, N * 2 * m);
  x.restore();
}

/** 開場：滿畫面的雪花（細顆粒＋藍灰＋兩道慢慢往下的光），a＝濃度 */
function drawSnow(x: Ctx, W: number, H: number, t: number, a0: number): void {
  const it = FX.intro;
  const N = FX.noise.size;
  const a = Math.min(1, a0);
  x.save();
  x.globalAlpha = a;
  const nt = noiseTiles()[Math.floor(t * it.snowRate) % FX.noise.tiles];
  const sc = Math.max(1, Math.round(W / it.snowCell));
  const off = -Math.floor(rnd(Math.floor(t * it.snowOffsetRate)) * N);
  for (let yy = off; yy < H; yy += N * sc)
    for (let xx = off; xx < W; xx += N * sc) x.drawImage(nt, xx, yy, N * sc, N * sc);
  x.globalAlpha = 1;
  const [r, g, b, ta] = it.snowTint;
  x.fillStyle = `rgba(${r},${g},${b},${(ta * a).toFixed(3)})`;
  x.fillRect(0, 0, W, H);
  const sb = it.snowBand;
  for (let i = 0; i < 2; i++) {
    const by = ((t * sb.speed + i * 0.5) % 1) * H * sb.spread - H * sb.lead;
    const bh = H * sb.height;
    const gr = x.createLinearGradient(0, by, 0, by + bh);
    gr.addColorStop(0, 'rgba(200,215,255,0)');
    gr.addColorStop(0.5, `rgba(200,215,255,${(sb.alpha * a).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(200,215,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, by, W, bh);
  }
  x.restore();
}

/** 開場：右上的大頻道字（綠色、發光）與 8 格收訊格 */
function drawBigChannel(x: Ctx, W: number, H: number, intro: IntroFrame, font: OsdFont): void {
  const c = FX.intro.channel;
  const size = Math.round(H * c.size * OSD_FONT_SPEC[font].scale);
  const pad = Math.round(H * c.pad);
  const rx = W - Math.round(W * c.right);
  x.save();
  x.globalAlpha = intro.channelAlpha;
  x.font = osdFontCss(font, size);
  x.textAlign = 'right';
  x.textBaseline = 'top';
  x.fillStyle = c.shadowColor;
  x.fillText(intro.channel, rx + size * c.shadow, pad + size * c.shadow);
  x.shadowColor = c.glow;
  x.shadowBlur = size * c.glowBlur;
  x.fillStyle = c.color;
  x.fillText(intro.channel, rx, pad);
  x.shadowBlur = 0;
  const bw = size * c.barWidth;
  const bg = size * c.barGap;
  const bh = size * c.barHeight;
  const lit = Math.round(intro.tune * c.bars);
  const by = pad + size * c.barTop;
  for (let i = 0; i < c.bars; i++) {
    x.fillStyle = i < lit ? c.color : c.dim;
    x.fillRect(rx - (c.bars - i) * (bw + bg) + bg, by, bw, bh);
  }
  x.restore();
  x.textAlign = 'left';
}

/** 日期戳記：左下或右下，時間在上、日期在下（最後一行的基線在 H − 0.075H），先畫影子再畫字 */
function drawStamp(
  x: Ctx,
  W: number,
  H: number,
  stamp: NonNullable<FrameParams['stamp']>,
  font: OsdFont,
): void {
  if (!stamp.lines.length) return;
  const c = FX.stamp;
  const size = Math.round(H * c.size * OSD_FONT_SPEC[font].scale);
  const pad = Math.round(H * c.pad);
  const right = stamp.side === 'right';
  const px = right ? W - pad : pad;
  x.font = osdFontCss(font, size);
  x.textBaseline = 'alphabetic';
  x.textAlign = right ? 'right' : 'left';
  let y = H - pad - (stamp.lines.length - 1) * size * c.lineHeight;
  for (const ln of stamp.lines) {
    x.fillStyle = FX.osd.shadowColor;
    x.fillText(ln, px + size * FX.osd.shadow, y + size * FX.osd.shadow);
    x.fillStyle = c.color[stamp.color];
    x.fillText(ln, px, y);
    y += size * c.lineHeight;
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
    lines.forEach((ln, i) => {
      const w = x.measureText(ln).width;
      x.fillRect(
        W / 2 - w / 2 - padX,
        y + i * lh - size * look.boxTop,
        w + padX * 2,
        size * look.boxHeight,
      );
    });
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
    x.fillStyle = o.shadowColor;
    x.fillText(txt, px + size * o.shadow, pad + size * o.shadow);
    x.fillStyle = color;
    x.fillText(txt, px, pad);
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
