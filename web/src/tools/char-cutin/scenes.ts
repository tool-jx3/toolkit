/**
 * 六種型的畫面（規格 3.1、3.3）：給一個時間點，回傳那一格要畫的圖層（純資料，不碰畫布）。
 * 座標一律以 1280 × 720 計（匯出別的尺寸時由 `paint.ts` 整體縮放）；文字的實際字級（放不下時縮小）由 paint 量字後決定。
 *
 * 圖層：group（位移、旋轉、縮放、透明度、裁切）、shape（多邊形、矩形、圓弧；填色、描邊）、figure（立繪：眼睛放在哪、
 * 臉的基準長度畫成多長、白色剪影的不透明度、邊緣淡出）、text、tag（小標題的底牌）、streaks（流動的速度線）、
 * stamp（重擊字）。
 */
import { createRandom } from '@/core/timeline';
import type { CutKind, ImpactLayout } from './model';
import { BEAT, dash, flashAlpha, overshoot, quake, rush, span, whiteout } from './motion';

export const W = 1280;
export const H = 720;

export type XY = readonly [number, number];

/** 線性漸層（stops：位置 0～1、顏色） */
export interface Ramp {
  from: XY;
  to: XY;
  stops: readonly (readonly [number, string])[];
}
export type Paint = string | Ramp;

export interface Pen {
  paint: Paint;
  width: number;
  round?: boolean;
}

export type Outline =
  | { poly: readonly XY[]; open?: boolean }
  | { box: readonly [number, number, number, number] }
  | { arc: { c: XY; r: number; from: number; to: number; closed?: boolean } };

/** name、quote、impact 用這個型的字型；tag（小標題）、badge（VS 字）用固定的粗黑體 */
export type TextRole = 'name' | 'quote' | 'tag' | 'badge';

/** 放不下時縮小：寬度超過 width 而且字級還大於 min 時每次減 step；peers 一起量（取最寬的） */
export interface Fit {
  width: number;
  min: number;
  step: number;
  peers?: readonly string[];
}

/** 邊緣淡出（位置 0～1 是整個畫面的寬／高，值是不透明度） */
export interface Fade {
  x: readonly (readonly [number, number])[];
  y: readonly (readonly [number, number])[];
}

export type Layer =
  | {
      type: 'group';
      at?: XY;
      turn?: number;
      zoom?: number;
      alpha?: number;
      clip?: Outline;
      children: Layer[];
    }
  | { type: 'shape'; outline: Outline; fill?: Paint; pen?: Pen; alpha?: number }
  | {
      type: 'figure';
      who: 'hero' | 'rival';
      /** 眼睛放在畫面的哪裡 */
      eye: XY;
      /** 臉的基準長度畫成幾 px（再乘上演員的大小與這個型的立繪放大） */
      reach: number;
      /** 白色剪影疊上去的不透明度 */
      white: number;
      alpha?: number;
      fade?: Fade;
    }
  | {
      type: 'text';
      role: TextRole;
      text: string;
      at: XY;
      size: number;
      weight?: number;
      fit?: Fit;
      align?: 'left' | 'right' | 'center';
      baseline?: 'alphabetic' | 'middle';
      fill: Paint;
      /** 依序描邊（先畫的在下面） */
      pens?: readonly Pen[];
    }
  | {
      type: 'tag';
      text: string;
      /** 底牌的左上角 */
      at: XY;
      size: number;
      /** 底牌的高、左右多留的寬、斜邊的水平差 */
      plate: { height: number; pad: number; slant: number };
      fill: Paint;
      ink: Paint;
    }
  | { type: 'streaks'; box: readonly [number, number, number, number]; t: number; tints: string[] }
  | {
      type: 'stamp';
      chars: readonly string[];
      /** 每個字之間的距離（字級的比例，chars.length − 1 個） */
      gaps: readonly number[];
      /** 起始字級與寬度上限（放不下時每次縮 6 px，最小 20） */
      size: number;
      width: number;
      at: XY;
      zoom: number;
      alpha: number;
      splash: boolean;
    };

export interface SceneInput {
  t: number;
  /** 主色（演員有代表色時是那個色） */
  main: string;
  base: string;
  /** VS 右側的色 */
  right: string;
  /** 背景色上看得清楚的文字色 */
  ink: string;
  name: string;
  tag: string;
  quote: string;
  rivalName: string;
  impactText: readonly string[];
  impact: ImpactLayout;
}

/* ---------- 小工具 ---------- */

const CLEAR = 'rgba(255,255,255,0)';

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 兩色混合（k＝0 是 a、1 是 b） */
export function blend(a: string, b: string, k: number): string {
  const from = hexRgb(a);
  const to = hexRgb(b);
  let out = '#';
  for (let ch = 0; ch < 3; ch++) {
    const v = Math.round(from[ch] * (1 - k) + to[ch] * k);
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}

/** 同一個色、透明度 a */
const faded = (hex: string, a: number): string => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

const shape = (outline: Outline, fill?: Paint, pen?: Pen, alpha?: number): Layer => ({
  type: 'shape',
  outline,
  fill,
  pen,
  alpha,
});
const poly = (...pts: XY[]): Outline => ({ poly: pts });
const shift = (pts: readonly XY[], dx: number, dy = 0): XY[] =>
  pts.map(([x, y]) => [x + dx, y + dy]);

const flash = (t: number, at: number): Layer[] => {
  const a = flashAlpha(t, at);
  return a > 0 ? [shape({ box: [0, 0, W, H] }, '#ffffff', undefined, a)] : [];
};

const TAG_WEIGHT = 900;

/* ---------- 斬入 ---------- */

/** 斬入：主色的大塊從左邊斬進來、立繪的窗從右邊滑進來，文字斜著放在左下；退場時整組往右飛走 */
function strike(s: SceneInput): Layer[] {
  const { t } = s;
  const enter = dash(span(t, 0, BEAT.land));
  const leave = rush(span(t, BEAT.leave, BEAT.gone));
  const [qx, qy] = quake(t, BEAT.land);
  const drift = (t - BEAT.land) * 14;
  const slab = (1 - enter) * -W * 1.2;
  const pane = (1 - dash(span(t, 0.03, BEAT.land + 0.04))) * W * 1.1;
  const words = dash(span(t, 0.08, BEAT.land + 0.12));
  const window: XY[] = [
    [W * 0.4, H * 0.1],
    [W * 1.05, H * 0.03],
    [W * 1.05, H * 0.9],
    [W * 0.33, H * 0.97],
  ];
  const frame = shift(window, pane);
  const text: Layer[] = [];
  if (s.tag)
    text.push({
      type: 'tag',
      text: s.tag,
      at: [-10, -150],
      size: 34,
      plate: { height: 42, pad: 28, slant: 10 },
      fill: '#ffffff',
      ink: s.base,
    });
  text.push({
    type: 'text',
    role: 'name',
    text: s.name,
    at: [0, 30],
    size: 150,
    fit: { width: W * 0.36, min: 40, step: 4 },
    fill: '#ffffff',
    pens: [{ paint: s.base, width: 16 }],
  });
  if (s.quote)
    text.push({
      type: 'text',
      role: 'quote',
      text: s.quote,
      at: [6, 90],
      size: 34,
      fill: '#ffffff',
      pens: [{ paint: s.base, width: 8 }],
    });
  return [
    {
      type: 'group',
      at: [qx + W * 1.3 * leave, qy],
      children: [
        shape(
          poly(
            [slab + W * 0.02, H * 0.12],
            [slab + W * 1.02, H * 0.04],
            [slab + W * 0.98, H * 0.86],
            [slab - W * 0.02, H * 0.94],
          ),
          s.main,
        ),
        shape(
          poly(
            [slab - W * 0.02, H * 0.95],
            [slab + W * 0.98, H * 0.87],
            [slab + W * 0.985, H * 0.895],
            [slab - W * 0.015, H * 0.975],
          ),
          '#ffffff',
        ),
        shape({ poly: frame }, s.base),
        {
          type: 'group',
          clip: { poly: frame },
          children: [
            {
              type: 'figure',
              who: 'hero',
              eye: [pane - drift + 0.68 * W, 0.33 * H],
              reach: H * 2.6 * 0.62,
              white: whiteout(t, BEAT.land, BEAT.land + 0.18, true),
            },
          ],
        },
        shape({ poly: frame }, undefined, { paint: '#ffffff', width: 6 }),
        {
          type: 'group',
          at: [0.06 * W + 0.4 * drift - 0.3 * W * (1 - words), 0.62 * H],
          turn: -0.07,
          children: text,
        },
      ],
    },
    ...flash(t, BEAT.land),
  ];
}

/* ---------- 橫掠 ---------- */

/** 橫掠：半透明的大立繪從右往左慢慢滑過（邊緣淡出），下方一道光線拉開、名字跟著淡入 */
function glide(s: SceneInput): Layer[] {
  const { t } = s;
  const show = span(t, 0, 0.22) * (1 - span(t, BEAT.leave, BEAT.gone + 0.1));
  const settle = dash(span(t, 0, 0.3));
  const x = W * (0.86 - 0.32 * (t / BEAT.gone)) + (1 - settle) * W * 0.12;
  const open = dash(span(t, 0.1, 0.45));
  const y = H * 0.78;
  const soft = 'rgba(0,0,0,0.35)';
  const out: Layer[] = [
    {
      type: 'figure',
      who: 'hero',
      eye: [x, H * 0.3],
      reach: H * 1.25,
      white: 0,
      alpha: show * 0.82,
      fade: {
        x: [
          [0, 0],
          [0.35, 1],
          [0.9, 1],
          [1, 0],
        ],
        y: [
          [0, 1],
          [0.75, 1],
          [1, 0],
        ],
      },
    },
  ];
  const words: Layer[] = [];
  if (s.tag)
    words.push({
      type: 'text',
      role: 'tag',
      text: s.tag,
      at: [W * 0.07, y - 86],
      size: 26,
      weight: TAG_WEIGHT,
      fill: s.main,
    });
  words.push({
    type: 'text',
    role: 'name',
    text: s.name,
    at: [W * 0.07 - (1 - open) * 40, y - 18],
    size: 72,
    fill: '#ffffff',
    pens: [{ paint: soft, width: 6 }],
  });
  if (s.quote)
    words.push({
      type: 'text',
      role: 'quote',
      text: s.quote,
      at: [W * 0.07, y + 48],
      size: 30,
      fill: '#ffffff',
      pens: [{ paint: soft, width: 5 }],
    });
  out.push({
    type: 'group',
    alpha: show,
    children: [
      shape(
        { box: [W * 0.04, y, W * 0.92 * open, 3] },
        {
          from: [0, 0],
          to: [W, 0],
          stops: [
            [0, CLEAR],
            [0.15, s.main],
            [0.6, '#ffffff'],
            [1, CLEAR],
          ],
        },
      ),
      { type: 'group', alpha: open, children: words },
    ],
  });
  return out;
}

/* ---------- 眼部特寫 ---------- */

/** 眼部特寫：畫面中間打開一條橫帶，裡面是放大到眼睛的特寫；名字在左、台詞在帶子右下 */
function gaze(s: SceneInput): Layer[] {
  const { t } = s;
  const open = dash(span(t, 0, BEAT.land + 0.04));
  const close = rush(span(t, BEAT.leave, BEAT.gone));
  const band = H * 0.24 * open * (1 - close);
  if (band <= 0.5) return [];
  const cy = H * 0.46;
  const [qx, qy] = quake(t, BEAT.land);
  const slide = (1 - open) * W * 0.3;
  const top = cy - band / 2;
  const zoomIn = 1.06 + 0.06 * (t - BEAT.land);
  const words = dash(span(t, 0.12, 0.4));
  const text: Layer[] = [];
  if (s.tag)
    text.push({
      type: 'text',
      role: 'tag',
      text: s.tag,
      at: [W * 0.05, top + 30],
      size: 24,
      weight: TAG_WEIGHT,
      baseline: 'middle',
      fill: s.main,
    });
  text.push({
    type: 'text',
    role: 'name',
    text: s.name,
    at: [W * 0.05 - (1 - words) * 60, cy + 12],
    size: 86,
    fit: { width: W * 0.34, min: 30, step: 4 },
    baseline: 'middle',
    fill: s.ink,
  });
  if (s.quote)
    text.push({
      type: 'text',
      role: 'quote',
      text: s.quote,
      at: [W * 0.96, cy + band / 2 + 48],
      size: 32,
      align: 'right',
      baseline: 'middle',
      fill: '#ffffff',
      pens: [{ paint: 'rgba(0,0,0,0.5)', width: 6 }],
    });
  return [
    {
      type: 'group',
      at: [qx, qy],
      children: [
        shape({ box: [-20, top - 14, W + 40, band + 28] }, s.base),
        shape({ box: [-20, top - 14, W + 40, 5] }, s.main),
        shape({ box: [-20, cy + band / 2 + 9, W + 40, 5] }, s.main),
        {
          type: 'group',
          clip: { box: [0, top, W, band] },
          children: [
            {
              type: 'figure',
              who: 'hero',
              eye: [W * 0.58 + slide - (t - BEAT.land) * 20, cy + 6],
              reach: ((W * 1.55) / 0.82) * zoomIn,
              white: whiteout(t, BEAT.land, BEAT.land + 0.16, true),
            },
            shape(
              { box: [0, top, W * 0.45, band] },
              {
                from: [0, 0],
                to: [W * 0.45, 0],
                stops: [
                  [0, s.base],
                  [1, faded(s.base, 0)],
                ],
              },
            ),
          ],
        },
        { type: 'group', alpha: words * (1 - close), children: text },
      ],
    },
    ...flash(t, BEAT.land),
  ];
}

/* ---------- 升起 ---------- */

const springUp = overshoot(1.9);

/** 升起：左下的半圓張開，立繪從下面彈上來輕輕浮動；名牌從右邊滑進來 */
function lift(s: SceneInput): Layer[] {
  const { t } = s;
  const out = rush(span(t, BEAT.leave, BEAT.gone));
  const grow = dash(span(t, 0, 0.24));
  const pop = springUp(span(t, 0.03, 0.36));
  const sway = 4 * Math.sin(3.2 * Math.max(0, t - 0.36));
  const cx = 0.31 * W;
  const r = H * 0.6 * grow;
  const layers: Layer[] = [];
  if (r > 1) {
    const c: XY = [cx, H * 1.02];
    layers.push({
      type: 'group',
      at: [0, out * H * 0.9],
      children: [
        shape({ arc: { c, r, from: Math.PI, to: 0, closed: true } }, s.main, undefined, 0.92),
        shape({ arc: { c, r: r + 14, from: Math.PI, to: 0 } }, undefined, {
          paint: '#ffffff',
          width: 5,
        }),
        shape({ arc: { c, r: r + 30, from: Math.PI * 1.05, to: Math.PI * 1.95 } }, undefined, {
          paint: s.main,
          width: 2,
        }),
      ],
    });
  }
  layers.push({
    type: 'figure',
    who: 'hero',
    eye: [cx, H * 0.36 + (1 - pop) * H * 0.95 + out * H + sway],
    reach: H * 1.55,
    white: 0,
  });
  const slide = dash(span(t, 0.2, 0.44));
  const px =
    W * 0.56 + (1 - slide) * W * 0.5 + rush(span(t, BEAT.leave - 0.05, BEAT.gone)) * W * 0.5;
  const py = H * 0.6;
  const pw = W * 0.4;
  const ph = H * 0.25;
  /* 名牌是往右上斜 24 px 的平行四邊形（右邊多伸出 60 px）；左邊一條 16 px 寬的主色斜條 */
  const slant = (x0: number, x1: number): XY[] =>
    shift(
      [
        [x0 + 24, 0],
        [x1 + 24, 0],
        [x1, ph],
        [x0, ph],
      ],
      px,
      py,
    );
  const plate: Layer[] = [
    shape({ poly: slant(0, pw + 36) }, s.base, undefined, 0.94),
    shape({ poly: slant(0, 16) }, s.main),
    shape({ box: [px + 30, py + ph + 10, 0.7 * pw * slide, 4] }, s.main),
  ];
  if (s.tag)
    plate.push({
      type: 'text',
      role: 'tag',
      text: s.tag,
      at: [px + 52, py + 40],
      size: 24,
      weight: TAG_WEIGHT,
      fill: s.main,
    });
  plate.push({
    type: 'text',
    role: 'name',
    text: s.name,
    at: [px + 50, py + ph * 0.68],
    size: 74,
    fit: { width: pw - 60, min: 28, step: 4 },
    fill: s.ink,
  });
  if (s.quote)
    plate.push({
      type: 'text',
      role: 'quote',
      text: s.quote,
      at: [px + 52, py + ph - 16],
      size: 26,
      fill: s.ink,
    });
  layers.push(...plate);
  return layers;
}

/* ---------- 重擊 ---------- */

/** 速度線的資料（固定的種子：每次都一樣） */
export interface Streak {
  y: number;
  h: number;
  x: number;
  len: number;
  speed: number;
  tint: number;
}

export const STREAKS: readonly Streak[] = (() => {
  const r = createRandom('char-cutin:streaks');
  const out: Streak[] = [];
  while (out.length < 46) {
    const thick = r.next() < 0.2;
    out.push({
      y: r.next(),
      h: (2 + r.int(0, 8)) * (thick ? 3 : 1),
      x: r.range(0, 1600),
      len: r.range(260, 960),
      speed: r.range(1400, 2600),
      tint: r.int(0, 3),
    });
  }
  return out;
})();

/** 墨點（重擊字右上） */
export const SPLASH: readonly { x: number; y: number; r: number }[] = (() => {
  const r = createRandom('char-cutin:splash');
  const dots: { x: number; y: number; r: number }[] = [];
  for (let n = 0; n < 70; n++) {
    const dir = r.range(0, Math.PI * 2);
    const dist = r.range(8, 128);
    dots.push({
      x: 1.4 * dist * Math.cos(dir),
      y: 0.8 * dist * Math.sin(dir) - r.range(0, 40),
      r: r.range(1.5, 7.5),
    });
  }
  return dots;
})();

/** 帶子上下的白邊（微微起伏的線） */
function ragged(halfW: number, edge: number, wobble: number): XY[] {
  const pts: XY[] = [];
  for (let x = -halfW; x <= halfW; x += 60) pts.push([x, edge + Math.sin(x * 0.07 + wobble) * 2.5]);
  return pts;
}

/** 重擊：斜放的主色帶從右邊衝進來、速度線流動，重擊字從大縮小砸下去並噴墨，臉的特寫壓在帶子上（頭可以超出帶子） */
function impact(s: SceneInput): Layer[] {
  const { t } = s;
  const tilt = -0.2;
  const enter = dash(span(t, 0, 0.14));
  const out = rush(span(t, BEAT.leave, BEAT.gone));
  const [qx, qy] = quake(t, 0.22);
  const bw = W * 1.5;
  const bh = H * 0.74;
  const inBand: Layer[] = [
    shape({ box: [-bw / 2, -bh / 2, bw, bh] }, s.main),
    {
      type: 'streaks',
      box: [-bw / 2, -bh / 2, bw, bh],
      t,
      tints: [
        blend(s.main, '#000000', 0.45),
        blend(s.main, '#ffffff', 0.45),
        blend(s.main, '#000000', 0.7),
        '#ffffff',
      ],
    },
  ];
  if (s.impactText.length && t >= 0.18) {
    const hit = dash(span(t, 0.18, 0.3));
    const size = s.impact.size / 100;
    inBand.push({
      type: 'stamp',
      chars: s.impactText,
      gaps: s.impactText.slice(1).map((_, i) => (s.impact.track + (s.impact.gaps[i] ?? 0)) / 100),
      size: Math.round(H * 0.66 * size),
      width: W * 0.95 * size,
      at: [-W * 0.13 + (W * s.impact.x) / 100, H * 0.02 + (H * s.impact.y) / 100],
      zoom: 1 + (1 - hit) * 1.3,
      alpha: Math.min(1, hit * 1.6),
      splash: hit > 0.3,
    });
  }
  const edges: Layer[] = [];
  for (const [gap, width] of [
    [0, 12],
    [22, 4],
  ] as const)
    for (const side of [-1, 1])
      edges.push(
        shape({ poly: ragged(bw / 2, side * (bh / 2 + gap), gap), open: true }, undefined, {
          paint: '#ffffff',
          width,
        }),
      );
  const words = dash(span(t, 0.24, 0.42));
  const text: Layer[] = [];
  if (s.tag)
    text.push({
      type: 'text',
      role: 'tag',
      text: s.tag,
      at: [-W * 0.4, bh / 2 - 104],
      size: 26,
      weight: TAG_WEIGHT,
      fill: '#ffffff',
      pens: [{ paint: '#111111', width: 6 }],
    });
  text.push({
    type: 'text',
    role: 'name',
    text: s.name,
    at: [-W * 0.4 - (1 - words) * 60, bh / 2 - 40],
    size: 60,
    fit: { width: W * 0.3, min: 24, step: 4 },
    fill: '#ffffff',
    pens: [{ paint: '#111111', width: 10 }],
  });
  return [
    {
      type: 'group',
      at: [W / 2 + qx + (1 - enter) * W * 1.2 - out * W * 1.4, H * 0.5 + qy],
      turn: tilt,
      children: [
        { type: 'group', clip: { box: [-bw / 2, -bh / 2, bw, bh] }, children: inBand },
        ...edges,
        {
          type: 'group',
          clip: { box: [-bw / 2, -bh / 2 - 1.5 * H, bw, bh + 1.5 * H] },
          children: [
            {
              type: 'group',
              turn: -tilt,
              children: [
                {
                  type: 'figure',
                  who: 'hero',
                  eye: [W * 0.24, -H * 0.08],
                  reach: ((W * 1.15) / 0.82) * (1 + Math.max(0, t - 0.14) * 0.04),
                  white: whiteout(t, 0.12, 0.3, false),
                },
              ],
            },
          ],
        },
        { type: 'group', alpha: words, children: text },
      ],
    },
    ...flash(t, 0.2),
  ];
}

/* ---------- VS ---------- */

/** VS：左右兩塊從兩邊衝進來、斜的分界線閃過，中間砸下 VS 字；右邊是對手（或左邊的人反過來的黑色剪影） */
function versus(s: SceneInput): Layer[] {
  const { t } = s;
  const enter = dash(span(t, 0, 0.18));
  const out = rush(span(t, BEAT.leave, BEAT.gone));
  const [qx, qy] = quake(t, 0.24);
  const y0 = H * 0.2;
  const bh = H * 0.58;
  const cx = W * 0.5;
  /** 分界線的上端、下端在中央左右各 110 px */
  const lean = 110;
  const away = (1 - enter) * W * 0.75 + out * W * 0.8;
  const dl = -away;
  const dr = away;
  const halfL = (d: number): XY[] => [
    [d, y0],
    [cx + lean + d, y0],
    [cx - lean + d, y0 + bh],
    [d, y0 + bh],
  ];
  const halfR = (d: number): XY[] => [
    [W + d, y0],
    [cx + lean + d, y0],
    [cx - lean + d, y0 + bh],
    [W + d, y0 + bh],
  ];
  /* 立繪的裁切：分界線往上延長，頭可以超出帶子 */
  const above = H * 0.6;
  const topX = cx + lean + (2 * lean * above) / bh;
  const clipL = (d: number): XY[] => [
    [d - 20, y0 - above],
    [topX + d, y0 - above],
    [cx - lean + d, y0 + bh],
    [d - 20, y0 + bh],
  ];
  const clipR = (d: number): XY[] => [
    [W + d + 20, y0 - above],
    [topX + d, y0 - above],
    [cx - lean + d, y0 + bh],
    [W + d + 20, y0 + bh],
  ];
  const panel = (pts: XY[], color: string, edgeX: number): Layer[] => [
    shape(
      { poly: pts },
      {
        from: [edgeX, 0],
        to: [cx, 0],
        stops: [
          [0, blend(color, '#000000', 0.35)],
          [1, color],
        ],
      },
    ),
    shape({ poly: pts }, undefined, { paint: '#ffffff', width: 5 }),
  ];
  const white = whiteout(t, 0.12, 0.3, false);
  /* 兩塊底下各一塊背景色（上下各多 12 px、寬 0.62W） */
  const under = (x: number): Layer => shape({ box: [x, y0 - 12, 0.62 * W, bh + 24] }, s.base);
  const layers: Layer[] = [
    under(dl),
    under(0.38 * W + dr),
    ...panel(halfL(dl), s.main, 0),
    ...panel(halfR(dr), s.right, W),
    {
      type: 'group',
      clip: { poly: clipL(dl) },
      children: [
        {
          type: 'figure',
          who: 'hero',
          eye: [W * 0.24 + dl, y0 + bh * 0.26],
          reach: H * 1.5,
          white,
        },
      ],
    },
    {
      type: 'group',
      clip: { poly: clipR(dr) },
      children: [
        {
          type: 'figure',
          who: 'rival',
          eye: [W * 0.76 + dr, y0 + bh * 0.26],
          reach: H * 1.5,
          white,
        },
      ],
    },
  ];
  /* 斜的一閃 */
  const sweep = dash(span(t, 0.16, 0.3));
  if (sweep > 0) {
    const glow = 1 - span(t, 0.18, 0.42);
    const over = (lean * 2 * 40) / bh;
    const a: XY = [cx + lean + over, y0 - 40];
    const b: XY = [cx - lean - over, y0 + bh + 40];
    layers.push(
      shape(
        { poly: [a, [a[0] + (b[0] - a[0]) * sweep, a[1] + (b[1] - a[1]) * sweep]], open: true },
        undefined,
        { paint: '#ffffff', width: 4 + 10 * glow, round: true },
        0.35 + 0.65 * glow,
      ),
    );
  }
  const words = dash(span(t, 0.22, 0.4));
  const names: Layer[] = [];
  const fit: Fit = { width: W * 0.3, min: 24, step: 4, peers: [s.name, s.rivalName] };
  names.push({
    type: 'text',
    role: 'name',
    text: s.name,
    at: [W * 0.05 + dl, y0 + bh - 22],
    size: 60,
    fit,
    fill: '#ffffff',
    pens: [{ paint: s.base, width: 10 }],
  });
  if (s.rivalName)
    names.push({
      type: 'text',
      role: 'name',
      text: s.rivalName,
      at: [W * 0.95 + dr, y0 + bh - 22],
      size: 60,
      fit,
      align: 'right',
      fill: '#ffffff',
      pens: [{ paint: s.base, width: 10 }],
    });
  if (s.tag)
    names.push({
      type: 'text',
      role: 'tag',
      text: s.tag,
      at: [W * 0.05 + dl, y0 - 26],
      size: 26,
      weight: TAG_WEIGHT,
      fill: '#ffffff',
      pens: [{ paint: s.base, width: 6 }],
    });
  layers.push({ type: 'group', alpha: words, children: names });
  if (t >= 0.2) {
    const hit = dash(span(t, 0.2, 0.32));
    const fz = Math.round(0.5 * bh);
    layers.push({
      type: 'group',
      at: [cx, y0 + bh * 0.52],
      zoom: 1 + (1 - hit) * 1.6,
      turn: -0.06,
      alpha: (1 - out) * Math.min(1, hit * 2),
      children: [
        {
          type: 'text',
          role: 'badge',
          text: 'VS',
          at: [0, 0],
          size: fz,
          weight: 900,
          align: 'center',
          baseline: 'middle',
          fill: {
            from: [0, -fz * 0.45],
            to: [0, fz * 0.45],
            stops: [
              [0, '#ffffff'],
              [0.5, blend(s.main, '#ffffff', 0.55)],
              [1, blend(s.right, '#ffffff', 0.3)],
            ],
          },
          pens: [
            { paint: '#ffffff', width: fz * 0.22 },
            { paint: s.base, width: fz * 0.13 },
          ],
        },
      ],
    });
  }
  return [{ type: 'group', at: [qx, qy], children: layers }, ...flash(t, 0.24)];
}

/* ---------- 入口 ---------- */

const BUILDERS: Record<CutKind, (s: SceneInput) => Layer[]> = {
  strike,
  glide,
  gaze,
  lift,
  impact,
  versus,
};

/** 這個型在 t 秒的圖層（空白的時間回傳空陣列） */
export function compose(kind: CutKind, s: SceneInput): Layer[] {
  if (s.t >= BEAT.blank) return [];
  return BUILDERS[kind](s);
}
