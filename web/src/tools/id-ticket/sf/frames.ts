/**
 * SF 證件的照片框：照片格的形狀與框線（每一款共用同一個選擇）。範本只決定照片格的範圍（box）、切角大小與線寬，
 * 形狀由這裡算出來：
 * - poly：照片格的外形（照片的裁切、框線、浮水印的洞）；
 * - marks：框上加粗的墨色塊；accent：強調色的三角；inner：內側細線往內縮的距離。
 * 形狀照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/frames.js。
 */
import type { Pt, Rect } from './geom';

export const SF_FRAME_IDS = ['notch', 'brackets', 'octagon', 'shield', 'scope', 'slant'] as const;
export type SfFrameId = (typeof SF_FRAME_IDS)[number];

export const SF_FRAME_LABELS: Record<SfFrameId, string> = {
  notch: '切角',
  brackets: '觀景窗',
  octagon: '八角',
  shield: '盾形',
  scope: '瞄準鏡',
  slant: '斜框',
};

export interface PortraitSpec {
  box: Rect;
  /** 切角大小 */
  cut: number;
  /** 框線寬 */
  line: number;
}

export interface FrameWindow {
  box: Rect;
  line: number;
  poly: Pt[];
  marks: Pt[][];
  accent: Pt[][];
  inner: number;
}

const rect = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

type Shape = Partial<Omit<FrameWindow, 'box'>> & { poly: Pt[] };

const FRAMES: Record<SfFrameId, (b: Rect, c: number, L: number) => Shape> = {
  notch({ x, y, w, h }, c, L) {
    const T = Math.round(L * 1.45);
    const o = L / 2;
    return {
      poly: [
        [x, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + h],
        [x + c, y + h],
        [x, y + h - c],
      ],
      marks: [
        rect(x + w * 0.45, y - o, w * 0.33, T),
        rect(x + w * 0.22, y + h + o - T, w * 0.3, T),
        rect(x + w + o - T, y + h * 0.32, T, h * 0.19),
      ],
    };
  },
  brackets({ x, y, w, h }, _c, L) {
    const T = Math.round(L * 1.45);
    const o = L / 2;
    const a = Math.min(w, h) * 0.2;
    const x0 = x - o;
    const y0 = y - o;
    const x1 = x + w + o;
    const y1 = y + h + o;
    return {
      poly: rect(x, y, w, h),
      line: L * 0.45,
      marks: [
        [
          [x0, y0],
          [x0 + a, y0],
          [x0 + a, y0 + T],
          [x0 + T, y0 + T],
          [x0 + T, y0 + a],
          [x0, y0 + a],
        ],
        [
          [x1, y0],
          [x1, y0 + a],
          [x1 - T, y0 + a],
          [x1 - T, y0 + T],
          [x1 - a, y0 + T],
          [x1 - a, y0],
        ],
        [
          [x1, y1],
          [x1 - a, y1],
          [x1 - a, y1 - T],
          [x1 - T, y1 - T],
          [x1 - T, y1 - a],
          [x1, y1 - a],
        ],
        [
          [x0, y1],
          [x0, y1 - a],
          [x0 + T, y1 - a],
          [x0 + T, y1 - T],
          [x0 + a, y1 - T],
          [x0 + a, y1],
        ],
      ],
    };
  },
  octagon({ x, y, w, h }, c, L) {
    const a = Math.max(c * 0.8, L * 5);
    const o = L / 2;
    const t = Math.max(0, a - 2.2 * L);
    return {
      poly: [
        [x + a, y],
        [x + w - a, y],
        [x + w, y + a],
        [x + w, y + h - a],
        [x + w - a, y + h],
        [x + a, y + h],
        [x, y + h - a],
        [x, y + a],
      ],
      inner: L * 1.6,
      accent: t
        ? [
            [
              [x - o, y - o],
              [x - o + t, y - o],
              [x - o, y - o + t],
            ],
            [
              [x + w + o, y + h + o],
              [x + w + o - t, y + h + o],
              [x + w + o, y + h + o - t],
            ],
          ]
        : [],
    };
  },
  shield({ x, y, w, h }, c, L) {
    const s = c * 0.45;
    const d = h * 0.2;
    const T = Math.round(L * 1.45);
    const o = L / 2;
    return {
      poly: [
        [x + s, y],
        [x + w - s, y],
        [x + w, y + s],
        [x + w, y + h - d],
        [x + w * 0.68, y + h],
        [x + w * 0.32, y + h],
        [x, y + h - d],
        [x, y + s],
      ],
      marks: [rect(x + w * 0.3, y - o, w * 0.4, T)],
    };
  },
  scope({ x, y, w, h }, _c, L) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const o = L / 2;
    const poly: Pt[] = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      poly.push([cx + (Math.cos(a) * w) / 2, cy + (Math.sin(a) * h) / 2]);
    }
    const tw = L * 0.9;
    const tl = L * 3.2;
    return {
      poly,
      marks: [
        rect(cx - tw / 2, y - o, tw, tl),
        rect(cx - tw / 2, y + h + o - tl, tw, tl),
        rect(x - o, cy - tw / 2, tl, tw),
        rect(x + w + o - tl, cy - tw / 2, tl, tw),
      ],
    };
  },
  slant({ x, y, w, h }, _c, L) {
    const s = w * 0.12;
    const g = 2 * L;
    const o = L / 2;
    const T = Math.round(L * 1.45);
    const tw = s - g + o;
    const th = (tw * h) / s;
    return {
      poly: [
        [x + s, y],
        [x + w, y],
        [x + w - s, y + h],
        [x, y + h],
      ],
      marks: [rect(x + w * 0.5, y - o, w * 0.32, T)],
      accent:
        tw > 0
          ? [
              [
                [x - o, y - o],
                [x - o + tw, y - o],
                [x - o, y - o + th],
              ],
              [
                [x + w + o, y + h + o],
                [x + w + o - tw, y + h + o],
                [x + w + o, y + h + o - th],
              ],
            ]
          : [],
    };
  },
};

/** 照片格（範圍＋框的形狀） */
export function frameWindow(p: PortraitSpec, frame: SfFrameId): FrameWindow {
  const sh = (FRAMES[frame] ?? FRAMES.notch)(p.box, p.cut, p.line);
  return {
    box: p.box,
    line: sh.line ?? p.line,
    poly: sh.poly,
    marks: sh.marks ?? [],
    accent: sh.accent ?? [],
    inner: sh.inner ?? 0,
  };
}
