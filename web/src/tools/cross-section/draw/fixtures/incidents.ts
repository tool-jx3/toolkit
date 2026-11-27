/**
 * 事件・異變的 9 種（側面；本站自己畫的圖形）：血跡、粉筆人形、翻倒的家具、封鎖木板、碎玻璃、漏電、符咒、火災與瓦礫。
 */
import type { Kit } from '../kit';
import { box, dot, poly, seg, shape } from '../kit';
import { alpha } from '../palette';
import type { DrawOpts } from './types';

/** 不規則的一塊（中心、半徑、起伏；同樣的參數形狀一樣） */
function blob(
  k: Kit,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  bumps: readonly number[],
  fill: string,
) {
  shape(
    k,
    () => {
      const n = bumps.length;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const f = bumps[i % n];
        const x = cx + Math.cos(a) * rx * f;
        const y = cy + Math.sin(a) * ry * f;
        if (i === 0) k.c.moveTo(x, y);
        else k.c.lineTo(x, y);
      }
      k.c.closePath();
    },
    fill,
    0,
  );
}

const bloodwall = (k: Kit) => {
  const { p } = k;
  const c = alpha(p.blood, 0.88);
  blob(k, -0.1, -1.75, 0.75, 0.55, [1, 0.7, 1.15, 0.8, 1.25, 0.75, 1.05, 0.65, 1.2, 0.85], c);
  blob(k, 0.55, -2.25, 0.3, 0.22, [1, 0.8, 1.2, 0.9, 1.1, 0.7], c);
  for (const [x, len, w] of [
    [-0.45, 1.05, 0.08],
    [-0.12, 1.45, 0.1],
    [0.25, 0.85, 0.07],
    [0.48, 1.2, 0.06],
  ]) {
    seg(k, x, -1.5, x, -1.5 + len, w, c);
    dot(k, x, -1.5 + len, w * 0.8, c, 0);
  }
  for (const [x, y, r] of [
    [0.95, -2.5, 0.07],
    [-0.95, -2.2, 0.06],
    [1.1, -1.9, 0.05],
    [-1.05, -1.5, 0.04],
    [0.8, -2.0, 0.04],
  ])
    dot(k, x, y, r, c, 0);
};

const bloodpool = (k: Kit) => {
  const { p } = k;
  const c = alpha(p.blood, 0.9);
  shape(
    k,
    () => {
      k.c.moveTo(-1.25, -0.02);
      k.c.bezierCurveTo(-1.1, -0.42, -0.2, -0.36, 0.1, -0.26);
      k.c.bezierCurveTo(0.6, -0.38, 1.25, -0.3, 1.2, -0.02);
      k.c.closePath();
    },
    c,
    0,
  );
  shape(k, () => k.c.ellipse(-0.3, -0.16, 0.45, 0.06, 0, 0, Math.PI * 2), alpha(p.pale, 0.25), 0);
  for (const [x, r] of [
    [-0.95, 0.07],
    [1.15, 0.05],
    [0.7, 0.04],
  ])
    dot(k, x, -0.5 - r, r, c, 0);
};

const chalk = (k: Kit) => {
  const { p } = k;
  const line = p.dark ? p.ink : '#f8f6ee';
  const under = alpha(p.ink, 0.6);
  /* 倒在地上的人形輪廓（稍微從上面看） */
  const outline = [
    -1.3, -0.3, -1.2, -0.55, -0.95, -0.62, -0.78, -0.5, -0.5, -0.58, -0.1, -0.52, 0.25, -0.62, 0.45,
    -0.82, 0.6, -0.72, 0.42, -0.5, 0.85, -0.46, 1.4, -0.58, 1.48, -0.42, 0.95, -0.28, 1.35, -0.2,
    1.3, -0.06, 0.7, -0.12, 0.1, -0.12, -0.55, -0.16, -0.95, -0.12, -1.25, -0.16,
  ];
  poly(k, outline, null, 0.09, under);
  poly(k, outline, null, 0.04, line);
  /* 證物的號碼牌 */
  poly(k, [-0.4, -0.02, -0.12, -0.02, -0.26, -0.5], p.brass, 0.025);
  seg(k, -0.26, -0.38, -0.26, -0.12, 0.03, p.ink);
  shape(k, () => k.c.ellipse(1.0, -0.06, 0.5, 0.05, 0, 0, Math.PI * 2), alpha(p.blood, 0.5), 0);
};

const upset = (k: Kit) => {
  const { p } = k;
  /* 倒下的椅子 */
  box(k, -1.35, -0.18, 1.0, 0.12, p.wood, 0.03);
  poly(k, [-1.35, -0.18, -1.32, -1.05, -1.2, -1.05, -1.23, -0.18], p.wood, 0.03);
  seg(k, -0.45, -0.18, -0.05, -0.75, 0.05, p.wood);
  seg(k, -0.8, -0.18, -0.5, -0.85, 0.05, p.wood);
  /* 翻倒的小桌 */
  box(k, 0.15, -1.6, 0.14, 1.55, p.woodHi, 0.03);
  seg(k, 0.29, -1.4, 1.0, -1.25, 0.05, p.woodHi);
  seg(k, 0.29, -0.3, 1.05, -0.45, 0.05, p.woodHi);
  /* 散亂的紙 */
  for (const [x, y, a] of [
    [0.55, -0.05, 0.1],
    [1.05, -0.06, -0.15],
    [-0.15, -0.04, 0.25],
    [1.35, -0.3, 0.6],
  ]) {
    k.c.save();
    k.c.translate(x, y);
    k.c.rotate(a);
    box(k, -0.18, -0.06, 0.36, 0.06, p.pale, 0.015);
    k.c.restore();
  }
};

const boards = (k: Kit) => {
  const { p } = k;
  box(k, -1.15, -2.9, 0.16, 2.9, p.wood, 0.03);
  box(k, 0.99, -2.9, 0.16, 2.9, p.wood, 0.03);
  const plank = (y: number, tilt: number) => {
    k.c.save();
    k.c.translate(0, y);
    k.c.rotate(tilt);
    box(k, -1.3, -0.14, 2.6, 0.28, p.woodHi, 0.03);
    seg(k, -1.2, 0.02, 1.2, 0.0, 0.012, alpha(p.ink, 0.5));
    dot(k, -1.07, 0, 0.035, p.ink, 0);
    dot(k, 1.07, 0, 0.035, p.ink, 0);
    k.c.restore();
  };
  plank(-2.45, 0.12);
  plank(-1.6, -0.3);
  plank(-1.55, 0.3);
  plank(-0.7, -0.08);
};

const glass = (k: Kit) => {
  const { p } = k;
  const g = alpha(p.glass, 0.85);
  for (const s of [
    [-1.1, 0, -0.85, -0.32, -0.7, 0],
    [-0.55, 0, -0.42, -0.2, -0.2, 0],
    [-0.1, 0, 0.12, -0.5, 0.3, 0],
    [0.45, 0, 0.6, -0.16, 0.8, 0],
    [0.9, 0, 1.0, -0.26, 1.12, 0],
  ])
    poly(k, s, g, 0.02);
  for (const [x, y] of [
    [-0.3, -0.62],
    [0.75, -0.55],
  ]) {
    seg(k, x - 0.1, y, x + 0.1, y, 0.02, p.pale);
    seg(k, x, y - 0.1, x, y + 0.1, 0.02, p.pale);
  }
};

const spark = (k: Kit) => {
  const { p } = k;
  /* 掉下來的燈與電線 */
  box(k, -0.5, -2.2, 0.5, 0.08, p.steel, 0.02);
  shape(
    k,
    () => {
      k.c.moveTo(-0.25, -2.12);
      k.c.bezierCurveTo(-0.6, -1.6, 0.3, -1.4, 0.05, -0.95);
    },
    null,
    0.035,
  );
  poly(k, [-0.25, -0.95, 0.35, -0.95, 0.15, -0.72, -0.05, -0.72], p.body, 0.03);
  const bolt = (pts: number[]) => {
    poly(k, pts, null, 0.1, alpha(p.spark, 0.35), false);
    poly(k, pts, null, 0.035, p.spark, false);
  };
  bolt([0.05, -0.7, -0.25, -0.45, 0.0, -0.35, -0.35, 0]);
  bolt([0.2, -0.75, 0.55, -0.5, 0.35, -0.4, 0.75, -0.15]);
  for (const [x, y] of [
    [-0.6, -0.55],
    [0.7, -0.75],
    [0.45, -0.1],
    [-0.55, -0.12],
  ])
    dot(k, x, y, 0.045, p.warm, 0);
};

const talisman = (k: Kit) => {
  const { p } = k;
  const paper = p.id === 'color' ? '#efe3b8' : p.pale;
  const red = p.id === 'terminal' ? p.emergency : p.dark ? '#e0705e' : '#b3261e';
  seg(k, -1.0, -2.3, 1.0, -2.15, 0.03, p.ink);
  [-0.6, 0, 0.6].forEach((x, i) => {
    k.c.save();
    k.c.translate(x, -2.22);
    k.c.rotate((i - 1) * 0.08);
    box(k, -0.2, 0, 0.4, 1.9, paper, 0.025);
    seg(k, 0, 0.18, 0, 1.7, 0.03, red);
    for (let j = 0; j < 4; j++) seg(k, -0.11, 0.35 + j * 0.34, 0.11, 0.45 + j * 0.34, 0.025, red);
    dot(k, 0, 1.55, 0.1, null, 0.025, red);
    k.c.restore();
  });
};

const rubble = (k: Kit) => {
  const { p } = k;
  /* 煙 */
  const smoke = p.id === 'color' ? '#363c40' : alpha(p.ink, 0.35);
  for (const [x, y, rx, ry] of [
    [-0.2, -1.85, 0.75, 0.38],
    [0.45, -2.15, 0.6, 0.32],
    [0.9, -1.8, 0.45, 0.28],
  ])
    shape(k, () => k.c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), smoke, 0);
  /* 火 */
  poly(
    k,
    [
      -1.0, -0.4, -0.95, -1.2, -0.7, -0.9, -0.55, -1.55, -0.3, -1.0, -0.05, -1.4, 0.1, -0.8, 0.35,
      -0.4,
    ],
    p.fire,
    0.02,
  );
  poly(k, [-0.75, -0.42, -0.62, -0.95, -0.45, -0.7, -0.3, -1.05, -0.12, -0.42], p.warm, 0);
  /* 瓦礫與斜倒的梁 */
  poly(k, [-1.5, 0, -1.3, -0.55, -0.7, -0.5, -0.45, 0], p.steelHi, 0.035);
  poly(k, [-0.45, 0, -0.2, -0.48, 0.55, -0.6, 0.8, 0], p.steel, 0.035);
  poly(k, [0.55, 0, 0.75, -0.85, 1.4, -0.6, 1.55, 0], p.steelHi, 0.035);
  poly(k, [-1.45, -0.1, 0.3, -1.05, 0.5, -0.75, -1.25, 0.02], p.body, 0.035);
  for (const [x1, y1, x2, y2] of [
    [0.95, -0.75, 1.3, -1.3],
    [1.2, -0.6, 1.5, -1.05],
  ])
    seg(k, x1, y1, x2, y2, 0.035);
};

export const INCIDENT_DRAW: Record<string, (k: Kit, o: DrawOpts) => void> = {
  bloodwall,
  bloodpool,
  chalk,
  upset,
  boards,
  glass,
  spark,
  talisman,
  rubble,
};
