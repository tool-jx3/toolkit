/**
 * SF 證件的晶片（規格 F88）：ISO 接觸式（以前唯一的一種）、EMV 付款晶片、處理器封裝、感應線圈、資料插孔、六角節點。
 * 每一種回傳畫在方形 box 裡的幾何（依序畫）：多邊形、圓、線；`fill` 填強調色或墨色、`stroke` 描墨色的邊（線一定描）。
 * 幾何照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/chips.js 改寫。
 */
import type { Pt, Rect } from './geom';

export const SF_CHIP_TYPES = ['contact', 'emv', 'die', 'coil', 'jack', 'hex'] as const;
export type SfChipType = (typeof SF_CHIP_TYPES)[number];

export const isSfChipType = (v: unknown): v is SfChipType =>
  (SF_CHIP_TYPES as readonly string[]).includes(v as string);

export interface ChipShape {
  poly?: Pt[];
  circle?: readonly [number, number, number];
  line?: Pt[];
  fill?: 'accent' | 'ink';
  stroke?: boolean;
}

type P = (u: number, v: number) => Pt;
const at =
  (b: Rect): P =>
  (u, v) => [b.x + u * b.w, b.y + v * b.h];

/** 切角的矩形（cuts＝左上、右上、右下、左下；0 的角不多放點） */
function cutRect(p: P, u0: number, v0: number, u1: number, v1: number, cuts: number[]): Pt[] {
  const [a, c, d, e] = cuts;
  const pts: Pt[] = [p(u0 + a, v0), p(u1 - c, v0)];
  if (c) pts.push(p(u1, v0 + c));
  pts.push(p(u1, v1 - d));
  if (d) pts.push(p(u1 - d, v1));
  pts.push(p(u0 + e, v1));
  if (e) pts.push(p(u0, v1 - e));
  if (a) pts.push(p(u0, v0 + a));
  return pts;
}

const rect = (p: P, u0: number, v0: number, u1: number, v1: number): Pt[] => [
  p(u0, v0),
  p(u1, v0),
  p(u1, v1),
  p(u0, v1),
];

/** 正六角形（尖的在上），半徑 r（box 寬的比例） */
const hexagon = (p: P, r: number): Pt[] =>
  [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return p(0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a));
  });

export function chipShapes(type: SfChipType, b: Rect): ChipShape[] {
  const p = at(b);
  switch (type) {
    case 'emv': {
      const c = 0.12;
      const a = 0.32;
      return [
        { poly: cutRect(p, 0, 0, 1, 1, [c, c, c, c]), fill: 'accent', stroke: true },
        { line: [p(a, 0), p(a, 1)] },
        { line: [p(1 - a, 0), p(1 - a, 1)] },
        { line: [p(0, 0.36), p(a, 0.36)] },
        { line: [p(0, 0.64), p(a, 0.64)] },
        { line: [p(1, 0.36), p(1 - a, 0.36)] },
        { line: [p(1, 0.64), p(1 - a, 0.64)] },
        { line: [p(a, 0.4), p(0.5, 0.4), p(0.5, 0.6), p(1 - a, 0.6)] },
      ];
    }
    case 'die': {
      const out: ChipShape[] = [];
      const e = 0.17;
      const pw = 0.03;
      for (const t of [0.26, 0.38, 0.5, 0.62, 0.74]) {
        out.push({ poly: rect(p, t - pw, 0.02, t + pw, e), fill: 'ink' });
        out.push({ poly: rect(p, t - pw, 1 - e, t + pw, 0.98), fill: 'ink' });
        out.push({ poly: rect(p, 0.02, t - pw, e, t + pw), fill: 'ink' });
        out.push({ poly: rect(p, 1 - e, t - pw, 0.98, t + pw), fill: 'ink' });
      }
      out.push({
        poly: cutRect(p, e, e, 1 - e, 1 - e, [0.08, 0, 0, 0]),
        fill: 'accent',
        stroke: true,
      });
      out.push({ poly: rect(p, 0.34, 0.34, 0.66, 0.66), stroke: true });
      const [cx, cy] = p(0.27, 0.27);
      out.push({ circle: [cx, cy, b.w * 0.028], fill: 'ink' });
      return out;
    }
    case 'coil': {
      const c = 0.1;
      /* 每一圈和板子平行：45° 的切角往內縮 i 時短 i(√2 − 1) */
      const loop = (i: number) => {
        const k = Math.max(0, c - i * 0.414);
        return cutRect(p, i, i, 1 - i, 1 - i, [k, k, k, k]);
      };
      return [
        { poly: cutRect(p, 0, 0, 1, 1, [c, c, c, c]), fill: 'accent', stroke: true },
        { poly: loop(0.1), stroke: true },
        { poly: loop(0.17), stroke: true },
        { poly: loop(0.24), stroke: true },
        { line: [p(0.24, 0.5), p(0.4, 0.5)] },
        { line: [p(0.6, 0.5), p(0.76, 0.5)] },
        { poly: rect(p, 0.4, 0.4, 0.6, 0.6), fill: 'ink' },
      ];
    }
    case 'jack': {
      const [cx, cy] = p(0.5, 0.5);
      const r = b.w;
      const out: ChipShape[] = [
        { circle: [cx, cy, r * 0.49], fill: 'accent', stroke: true },
        { circle: [cx, cy, r * 0.33], stroke: true },
        { circle: [cx, cy, r * 0.2], fill: 'ink' },
        { circle: [cx, cy, r * 0.07], fill: 'accent' },
        { poly: rect(p, 0.45, 0.02, 0.55, 0.14), fill: 'ink' },
      ];
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i + Math.PI / 8;
        const [x, y] = p(0.5 + 0.41 * Math.cos(a), 0.5 + 0.41 * Math.sin(a));
        out.push({ circle: [x, y, r * 0.032], fill: 'ink' });
      }
      return out;
    }
    case 'hex': {
      const inner = hexagon(p, 0.2);
      const outer = hexagon(p, 0.38);
      const out: ChipShape[] = [{ poly: hexagon(p, 0.5), fill: 'accent', stroke: true }];
      inner.forEach((q, i) => {
        out.push({ line: [q, outer[i]] });
      });
      for (const q of outer) out.push({ circle: [q[0], q[1], b.w * 0.035], fill: 'ink' });
      out.push({ poly: inner, fill: 'ink' });
      return out;
    }
    default: {
      /* ISO 接觸式：中間的晶片窗、四周 8 塊接點 */
      const c = 0.0875;
      const s = 0.325;
      const t = 0.1875;
      return [
        { poly: cutRect(p, 0, 0, 1, 1, [c, 0, c, 0]), fill: 'accent', stroke: true },
        { line: [p(0, 1 / 3), p(s, 1 / 3)] },
        { line: [p(0, 2 / 3), p(s, 2 / 3)] },
        { line: [p(1, 1 / 3), p(1 - s, 1 / 3)] },
        { line: [p(1, 2 / 3), p(1 - s, 2 / 3)] },
        { line: [p(0.5, 0), p(0.5, t)] },
        { line: [p(0.5, 1), p(0.5, 1 - t)] },
        { poly: rect(p, s, t, 1 - s, 1 - t), stroke: true },
      ];
    }
  }
}
