/**
 * 門・窗・梯子的 5 種（側面；本站自己畫的圖形）。門與窗有「事件後破損」的樣子。
 */
import type { Kit } from '../kit';
import { box, dot, poly, seg, shape } from '../kit';
import { alpha } from '../palette';
import type { DrawOpts } from './types';

const door = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  box(k, -0.93, -3.45, 1.86, 3.45, alpha(p.ink, 0.25), 0.05);
  if (o.broken) {
    /* 門板脫落斜靠、上半裂開 */
    poly(k, [-0.7, 0, 0.1, 0, 0.55, -3.0, -0.15, -3.1], p.wood, 0.04);
    poly(k, [-0.15, -3.1, 0.15, -2.5, -0.05, -2.2, 0.3, -1.7], null, 0.025, p.ink, false);
    box(k, 0.62, -3.3, 0.18, 0.5, p.woodHi, 0.02);
    for (const [x, y, a] of [
      [0.6, -0.12, 0.6],
      [0.75, -0.2, -0.4],
      [-0.82, -0.1, 0.2],
    ])
      poly(
        k,
        [x, y, x + 0.22 * Math.cos(a), y - 0.22 * Math.sin(a), x + 0.05, y - 0.04],
        p.woodHi,
        0.015,
      );
    return;
  }
  box(k, -0.79, -3.31, 1.58, 3.31, p.wood, 0.035);
  box(k, -0.62, -3.12, 1.24, 1.3, p.woodHi, 0.022);
  box(k, -0.62, -1.62, 1.24, 1.38, p.woodHi, 0.022);
  dot(k, 0.55, -1.72, 0.07, p.brass, 0.02);
};

const blastdoor = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  box(k, -1.02, -3.55, 2.04, 3.55, p.steelHi, 0.05, p.ink, 0.12);
  box(k, -0.86, -3.4, 1.72, 3.4, alpha(p.ink, 0.35), 0);
  const slab = (dx: number, tilt: number) => {
    k.c.save();
    k.c.translate(dx, 0);
    k.c.rotate(tilt);
    box(k, -0.8, -3.32, 1.6, 3.32, p.steel, 0.045, p.ink, 0.16);
    for (const [x, y] of [
      [-0.62, -3.1],
      [0.62, -3.1],
      [-0.62, -0.3],
      [0.62, -0.3],
    ])
      dot(k, x, y, 0.04, p.steelHi, 0.012);
    dot(k, 0, -1.8, 0.32, null, 0.05);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4;
      seg(
        k,
        Math.cos(a) * -0.32,
        -1.8 + Math.sin(a) * -0.32,
        Math.cos(a) * 0.32,
        -1.8 + Math.sin(a) * 0.32,
        0.03,
      );
    }
    /* 底部的警示條紋 */
    k.c.save();
    k.c.beginPath();
    k.c.rect(-0.8, -0.52, 1.6, 0.36);
    k.c.clip();
    for (let i = -1; i < 9; i++)
      poly(
        k,
        [
          -0.8 + i * 0.22,
          -0.16,
          -0.69 + i * 0.22,
          -0.16,
          -0.47 + i * 0.22,
          -0.52,
          -0.58 + i * 0.22,
          -0.52,
        ],
        i % 2 ? p.brass : p.ink,
        0,
      );
    k.c.restore();
    box(k, -0.8, -0.52, 1.6, 0.36, null, 0.025);
    k.c.restore();
  };
  if (o.broken) {
    slab(0.42, 0.06);
    poly(k, [-0.6, -2.4, -0.3, -2.1, -0.5, -1.8, -0.15, -1.5], null, 0.03, p.ink, false);
  } else slab(0, 0);
};

const bars = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  box(k, -1.05, -3.6, 2.1, 0.2, p.steel, 0.035);
  box(k, -1.05, -0.14, 2.1, 0.14, p.steel, 0.035);
  seg(k, -0.95, -1.9, 0.95, -1.9, 0.08, p.steel);
  const xs = [-0.8, -0.48, -0.16, 0.16, 0.48, 0.8];
  xs.forEach((x, i) => {
    if (o.broken && (i === 2 || i === 3)) {
      /* 被扳彎的兩根 */
      const dir = i === 2 ? -1 : 1;
      shape(
        k,
        () => {
          k.c.moveTo(x, -3.4);
          k.c.quadraticCurveTo(x + dir * 0.4, -1.9, x, -0.14);
        },
        null,
        0.07,
        p.ink,
      );
      return;
    }
    seg(k, x, -3.4, x, -0.14, 0.07, p.ink);
  });
  box(k, 0.62, -2.1, 0.34, 0.42, p.brass, 0.025);
  dot(k, 0.79, -1.92, 0.05, p.ink, 0);
};

const windowFrame = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  box(k, -1.25, -2.0, 2.5, 1.86, p.wood, 0.04);
  box(k, -1.1, -1.86, 2.2, 1.58, o.broken ? alpha(p.ink, 0.55) : alpha(p.glass, 0.75), 0.03);
  if (o.broken) {
    /* 碎掉：放射狀的裂痕、留在框上的碎片 */
    const cx = 0.25;
    const cy = -1.05;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      seg(k, cx, cy, cx + Math.cos(a) * 1.1, cy + Math.sin(a) * 0.8, 0.02, p.pale);
    }
    poly(k, [-1.1, -1.86, -0.4, -1.86, -1.1, -1.1], alpha(p.glass, 0.8), 0.02);
    poly(k, [1.1, -0.28, 0.5, -0.28, 1.1, -0.9], alpha(p.glass, 0.8), 0.02);
  } else {
    seg(k, -1.0, -0.5, -0.4, -1.7, 0.02, alpha(p.pale, 0.8));
    seg(k, 0.15, -0.6, 0.5, -1.3, 0.02, alpha(p.pale, 0.8));
  }
  seg(k, 0, -1.86, 0, -0.28, 0.05, p.wood);
  seg(k, -1.1, -1.07, 1.1, -1.07, 0.05, p.wood);
  box(k, -1.38, -0.16, 2.76, 0.16, p.woodHi, 0.03);
};

const hatch = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  const top = o.ceil ?? -4.8;
  seg(k, -0.42, 0, -0.42, top, 0.05);
  seg(k, 0.42, 0, 0.42, top, 0.05);
  for (let y = -0.35; y > top + 0.1; y -= 0.42) seg(k, -0.42, y, 0.42, y, 0.04, p.steel);
  /* 上面的艙口框與打開的蓋子 */
  box(k, -0.62, top, 1.24, 0.14, p.steel, 0.025);
  poly(k, [0.6, top + 0.14, 0.72, top + 0.14, 1.0, top + 1.0, 0.88, top + 1.02], p.steelHi, 0.025);
  box(k, -0.7, -0.08, 1.4, 0.08, p.steel, 0.02);
};

export const OPENING_DRAW: Record<string, (k: Kit, o: DrawOpts) => void> = {
  door,
  blastdoor,
  bars,
  window: windowFrame,
  hatch,
};

/** 有「事件後破損」的樣子的種類 */
export const BREAKABLE = new Set(['door', 'blastdoor', 'bars', 'window']);
