/**
 * 文字樣式（9 種加工手法，規格 3.5）與配色（8 組，規格 3.6）。
 * 加工由下而上一層層疊：陰影類 → 外框類 → 填色；比例以字級為 1。配色的色碼是本工具自己定的。
 */

import { METAL_COLORS, type Paint, rainbowHue, type TextFxLayer } from '@/core/textfx';
import { createRandom } from '@/core/timeline';

export type StyleId =
  | 'double'
  | 'single'
  | 'extrude'
  | 'neon'
  | 'hard'
  | 'sticker'
  | 'glitch'
  | 'stripes'
  | 'knockout';

export const STYLE_IDS: readonly StyleId[] = [
  'double',
  'single',
  'extrude',
  'neon',
  'hard',
  'sticker',
  'glitch',
  'stripes',
  'knockout',
];

export type PaletteId =
  | 'rainbow-gold'
  | 'rainbow-ink'
  | 'gold'
  | 'candy'
  | 'sunset'
  | 'ice'
  | 'blood'
  | 'mono';

export interface Palette {
  id: PaletteId;
  /** 文字的填色 */
  fill: Paint;
  /** 第一外框色（外層、立體擠出的厚度、貼紙的細框） */
  outline1: Paint;
  /** 第二外框色（雙層外框的內層）；null＝沿用第一外框色 */
  outline2: Paint | null;
  /** 強調色（硬陰影） */
  accent: string;
}

const solid = (color: string): Paint => ({ kind: 'solid', color });
const grad = (top: string, bottom: string): Paint => ({
  kind: 'gradient',
  stops: [
    { offset: 0, color: top },
    { offset: 1, color: bottom },
  ],
});

/** 8 組配色：彩虹 2、金屬金 1、雙色漸層 4（粉彩、暖色、冷色、暗紅恐怖）、黑白 1 */
export const PALETTES: readonly Palette[] = [
  {
    id: 'rainbow-gold',
    fill: { kind: 'rainbow' },
    outline1: { kind: 'metal', tone: 'gold' },
    outline2: solid('#ffffff'),
    accent: '#5b2bd6',
  },
  {
    id: 'rainbow-ink',
    fill: { kind: 'rainbow' },
    outline1: solid('#17131f'),
    outline2: solid('#ffffff'),
    accent: '#ff3d7f',
  },
  {
    id: 'gold',
    fill: { kind: 'metal', tone: 'gold' },
    outline1: solid('#3a2105'),
    outline2: solid('#fff2c2'),
    accent: '#b3261e',
  },
  {
    id: 'candy',
    fill: grad('#fffbe3', '#ffaed6'),
    outline1: solid('#7a4cc4'),
    outline2: solid('#ffffff'),
    accent: '#7fd6ff',
  },
  {
    id: 'sunset',
    fill: grad('#fff36e', '#ff5b1f'),
    outline1: solid('#3b0d12'),
    outline2: solid('#ffffff'),
    accent: '#d1123f',
  },
  {
    id: 'ice',
    fill: grad('#ffffff', '#4fc3ff'),
    outline1: solid('#0b2758'),
    outline2: solid('#c9f4ff'),
    accent: '#14d2b8',
  },
  {
    id: 'blood',
    fill: grad('#ff5a4f', '#5c0008'),
    outline1: solid('#0b0203'),
    outline2: solid('#ffb3a8'),
    accent: '#3a0006',
  },
  {
    id: 'mono',
    fill: solid('#ffffff'),
    outline1: solid('#000000'),
    outline2: null,
    accent: '#7a7a7a',
  },
];

export const PALETTE_IDS: readonly PaletteId[] = PALETTES.map((p) => p.id);

export const paletteOf = (id: string): Palette => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

/** 有填色層（文字顏色 F16 可以覆寫）的手法：斜紋（固定顏色）、挖空沒有 */
export const hasFillLayer = (style: StyleId): boolean =>
  style !== 'stripes' && style !== 'knockout';

/** 有外框層（外框顏色 F17 可以覆寫）的手法：挖空沒有 */
export const hasOutlineLayer = (style: StyleId): boolean => style !== 'knockout';

/** 斜紋的固定顏色（不隨配色改變） */
export const STRIPE_COLORS = ['#ffffff', '#e8283c'] as const;
/** 色差的兩份副本（偏紅、偏青） */
export const ABERRATION_COLORS = ['#ff2b4e', '#1fe3ff'] as const;
/** 霓虹光暈三層的模糊 σ（字級的倍數，由大到小；最大 0.22，其餘為 2/3、1/3） */
export const NEON_GLOW_SIGMA = [0.22, 0.22 * (2 / 3), 0.22 / 3] as const;
/** 霓虹光暈每層的不透明度 */
export const NEON_GLOW_ALPHA = 0.5;

/** 填色的代表色（光暈這類只能用單色的地方）；彩虹取文字中央、跟著流動 */
export function paintKeyColor(paint: Paint, t = 0): string {
  switch (paint.kind) {
    case 'solid':
      return paint.color;
    case 'gradient':
      return paint.stops[paint.stops.length - 1]?.color ?? '#ffffff';
    case 'metal':
      return (paint.colors ?? METAL_COLORS[paint.tone ?? 'gold'])[1];
    case 'rainbow':
      return `hsl(${rainbowHue(0.5, t).toFixed(1)} 100% 60%)`;
    case 'stripes':
      return paint.colors[1];
  }
}

/** 顏色選擇器顯示的值：單色時是那個顏色，否則白色（F16、F17） */
export const pickerColor = (paint: Paint): string =>
  paint.kind === 'solid' && /^#[0-9a-f]{6}$/i.test(paint.color)
    ? paint.color.toLowerCase()
    : '#ffffff';

export interface StyleInput {
  style: StyleId;
  palette: Palette;
  /** 文字顏色的覆寫（null＝照配色） */
  textColor: string | null;
  /** 外框顏色的覆寫 */
  outlineColor: string | null;
  /** 字級（px） */
  size: number;
  /** 外框厚度倍率（字型 × 用途自動調整） */
  outlineScale: number;
  /** 種子（色差的小位移） */
  seed: number;
  /** 循環進度（彩虹光暈的顏色） */
  t?: number;
}

/** 立體擠出的方向：往右下約 60°（偏向下方） */
const EXTRUDE_ANGLE = Math.PI / 3;

/** 加工的各層（由下而上） */
export function styleLayers(o: StyleInput): TextFxLayer[] {
  const S = o.size;
  const k = o.outlineScale;
  const p = o.palette;
  const fill: Paint = o.textColor ? solid(o.textColor) : p.fill;
  const o1: Paint = o.outlineColor ? solid(o.outlineColor) : p.outline1;
  const o2: Paint = o.outlineColor ? solid(o.outlineColor) : (p.outline2 ?? p.outline1);
  const w = (f: number) => S * f * k;
  switch (o.style) {
    case 'double':
      return [
        { kind: 'outline', paint: o1, width: w(0.1) },
        { kind: 'outline', paint: o2, width: w(0.04) },
        { kind: 'fill', paint: fill },
      ];
    case 'single':
      return [
        { kind: 'outline', paint: o1, width: w(0.09) },
        { kind: 'fill', paint: fill },
      ];
    case 'extrude':
      return [
        {
          kind: 'extrude',
          /* 厚度用配色的第一外框色（不受外框顏色覆寫影響） */
          paint: p.outline1,
          dx: S * 0.09 * Math.cos(EXTRUDE_ANGLE),
          dy: S * 0.09 * Math.sin(EXTRUDE_ANGLE),
        },
        { kind: 'outline', paint: o1, width: w(0.05) },
        { kind: 'fill', paint: fill },
      ];
    case 'neon': {
      /*
       * 光暈＝配色的填色（不受覆寫影響；彩虹、漸層時光暈跟著分色）；細外框也是配色的填色；字是白色。
       * 三層由大到小、各 50% 不透明度以加亮疊上，模糊 σ＝0.22、0.147、0.073 字級（blur 傳 2σ）。
       */
      const glow = {
        color: paintKeyColor(p.fill, o.t ?? 0),
        paint: p.fill,
        alpha: NEON_GLOW_ALPHA,
      };
      return [
        ...NEON_GLOW_SIGMA.map(
          (sigma): TextFxLayer => ({ kind: 'glow', ...glow, blur: S * sigma * 2 }),
        ),
        { kind: 'outline', paint: o.outlineColor ? o1 : p.fill, width: w(0.025) },
        { kind: 'fill', paint: o.textColor ? fill : solid('#ffffff') },
      ];
    }
    case 'hard':
      return [
        { kind: 'shadow', color: p.accent, dx: S * 0.07, dy: S * 0.07, spread: w(0.07) },
        { kind: 'outline', paint: o1, width: w(0.07) },
        { kind: 'fill', paint: fill },
      ];
    case 'sticker':
      return [
        {
          kind: 'shadow',
          color: 'rgba(0, 0, 0, 0.45)',
          blur: S * 0.05,
          dx: S * 0.02,
          dy: S * 0.04,
          spread: w(0.14),
        },
        { kind: 'outline', paint: o.outlineColor ? o1 : solid('#ffffff'), width: w(0.14) },
        { kind: 'outline', paint: o1, width: w(0.05) },
        { kind: 'fill', paint: fill },
      ];
    case 'glitch': {
      const r = createRandom((o.seed * 31 + 7) | 0);
      const j = () => r.signed() * S * 0.012;
      return [
        { kind: 'outline', paint: o1, width: w(0.06) },
        /* 副本就是字形本身（不往外擴）：只在填色的左右露出一點，外框照樣看得到 */
        {
          kind: 'aberration',
          colors: ABERRATION_COLORS,
          dx: S * 0.03,
          jitter: [
            { x: j(), y: j() },
            { x: j(), y: j() },
          ],
        },
        { kind: 'fill', paint: fill },
      ];
    }
    case 'stripes':
      return [
        { kind: 'outline', paint: o1, width: w(0.1) },
        { kind: 'outline', paint: o2, width: w(0.04) },
        { kind: 'fill', paint: { kind: 'stripes', colors: STRIPE_COLORS, width: S * 0.16 } },
      ];
    case 'knockout':
      return [{ kind: 'knockout' }];
  }
}

/** 所有外框層的厚度總和（字級的倍數；自動字級用） */
export function outlineSumPerSize(style: StyleId, outlineScale: number): number {
  return styleLayers({
    style,
    palette: PALETTES[0],
    textColor: null,
    outlineColor: null,
    size: 1,
    outlineScale,
    seed: 1,
  }).reduce((sum, l) => sum + (l.kind === 'outline' ? l.width : 0), 0);
}
