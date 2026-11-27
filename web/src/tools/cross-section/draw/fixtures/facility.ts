/**
 * 設施・研究的 16 種設備（側面；本站自己畫的圖形）。
 * 座標：底部的中間是 (0, 0)，往上是負的；單位是格。
 */
import type { Kit } from '../kit';
import { box, dot, poly, seg, shape } from '../kit';
import { alpha } from '../palette';
import type { DrawOpts } from './types';

const tank = (k: Kit) => {
  const { p } = k;
  box(k, -0.86, -0.5, 1.72, 0.5, p.steel, 0.04, p.ink, 0.05);
  seg(k, -0.7, -0.26, 0.7, -0.26, 0.02, alpha(p.ink, 0.5));
  box(k, -0.66, -3.56, 1.32, 3.06, alpha(p.glass, 0.45), 0.04, p.ink, 0.12);
  box(k, -0.58, -3.3, 1.16, 2.74, alpha(p.cold, 0.22), 0, null, 0.08);
  /* 漂著的影子 */
  const fig = p.id === 'color' ? '#2b4c53' : p.steel;
  dot(k, 0, -2.86, 0.17, fig, 0.02, alpha(p.ink, 0.5));
  box(k, -0.19, -2.66, 0.38, 1.08, fig, 0.02, alpha(p.ink, 0.5), 0.16);
  seg(k, -0.08, -1.6, -0.12, -1.0, 0.07, fig);
  seg(k, 0.08, -1.6, 0.13, -1.05, 0.07, fig);
  seg(k, 0, -3.03, 0, -3.56, 0.025, alpha(p.ink, 0.6));
  for (const [x, y, r] of [
    [0.36, -1.15, 0.05],
    [0.44, -1.8, 0.04],
    [-0.4, -2.2, 0.035],
    [0.3, -2.9, 0.03],
  ])
    dot(k, x, y, r, alpha(p.pale, 0.7), 0.015);
  box(k, -0.8, -4.1, 1.6, 0.54, p.steel, 0.04, p.ink, 0.06);
  box(k, -0.5, -3.98, 1.0, 0.16, p.steelHi, 0.02);
  dot(k, 0.78, -0.95, 0.12, p.pale, 0.025);
  seg(k, 0.78, -0.95, 0.84, -1.02, 0.02);
};

const consoleDesk = (k: Kit) => {
  const { p } = k;
  box(k, -1.5, -1.1, 3, 1.1, p.steel, 0.04);
  for (const x of [-0.5, 0.5]) seg(k, x, -1.1, x, -0.06, 0.02, alpha(p.ink, 0.6));
  for (const x of [-1.15, -0.15, 0.85]) box(k, x, -0.82, 0.3, 0.12, p.steelHi, 0.015);
  poly(k, [-1.56, -1.1, 1.56, -1.1, 1.34, -1.42, -1.34, -1.42], p.steelHi, 0.035);
  for (let i = 0; i < 9; i++) dot(k, -1.1 + i * 0.27, -1.26, 0.035, i % 3 ? p.pale : p.sign, 0.01);
  for (const x of [-1.38, -0.42, 0.54]) {
    box(k, x, -2.32, 0.84, 0.72, p.body, 0.035, p.ink, 0.04);
    box(k, x + 0.08, -2.24, 0.68, 0.54, alpha(p.cold, 0.85), 0.015);
    shape(
      k,
      () => {
        k.c.moveTo(x + 0.12, -1.98);
        k.c.lineTo(x + 0.26, -1.98);
        k.c.lineTo(x + 0.33, -2.12);
        k.c.lineTo(x + 0.42, -1.86);
        k.c.lineTo(x + 0.5, -2.02);
        k.c.lineTo(x + 0.7, -2.02);
      },
      null,
      0.022,
      alpha(p.ink, 0.75),
    );
    seg(k, x + 0.42, -1.6, x + 0.42, -1.42, 0.05, p.ink);
  }
};

const surgery = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  const top = o.ceil ?? -4.5;
  /* 天花板吊下來的無影燈 */
  seg(k, 0.15, top, 0.15, -3.95, 0.05);
  seg(k, 0.15, -3.95, -0.1, -3.78, 0.04);
  shape(
    k,
    () => {
      k.c.moveTo(-0.75, -3.42);
      k.c.quadraticCurveTo(-0.1, -4.0, 0.55, -3.42);
      k.c.closePath();
    },
    p.steelHi,
    0.035,
  );
  for (const x of [-0.42, -0.1, 0.22]) dot(k, x, -3.44, 0.07, p.pale, 0.015);
  /* 台 */
  box(k, -0.55, -0.12, 1.1, 0.12, p.steel, 0.03);
  box(k, -0.16, -1.08, 0.32, 0.96, p.steelHi, 0.03);
  box(k, -1.45, -1.34, 2.9, 0.26, p.pale, 0.035, p.ink, 0.06);
  box(k, -1.38, -1.5, 0.55, 0.16, p.sub, 0.02, p.ink, 0.06);
  box(k, -0.7, -1.44, 1.9, 0.1, alpha(p.glass, 0.6), 0.015);
  /* 點滴架 */
  seg(k, 1.42, -0.05, 1.42, -2.45, 0.035);
  seg(k, 1.22, -0.05, 1.62, -0.05, 0.04);
  box(k, 1.28, -2.45, 0.28, 0.4, alpha(p.glass, 0.7), 0.02, p.ink, 0.05);
  seg(k, 1.42, -2.05, 1.1, -1.4, 0.015, alpha(p.ink, 0.7));
};

const bench = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  const kitchen = o.variant === 'kitchen';
  box(k, -1.62, -1.02, 3.24, 1.02, kitchen ? p.woodHi : p.sub, 0.04);
  for (const x of [-0.54, 0.54]) seg(k, x, -0.98, x, -0.04, 0.02, alpha(p.ink, 0.6));
  for (const x of [-1.08, 0, 1.08]) seg(k, x - 0.18, -0.72, x + 0.18, -0.72, 0.035);
  box(k, -1.7, -1.14, 3.4, 0.12, p.pale, 0.035);
  if (kitchen) {
    /* 水槽、鍋、水壺 */
    box(k, -1.35, -1.17, 0.85, 0.05, p.steelHi, 0.015);
    seg(k, -0.92, -1.14, -0.92, -1.58, 0.035);
    seg(k, -0.92, -1.58, -0.7, -1.58, 0.035);
    box(k, 0.0, -1.62, 0.7, 0.48, p.steel, 0.03, p.ink, 0.04);
    seg(k, -0.08, -1.5, 0.78, -1.5, 0.02);
    box(k, 0.04, -1.7, 0.62, 0.08, p.steelHi, 0.02, p.ink, 0.03);
    shape(
      k,
      () => {
        k.c.moveTo(0.95, -1.14);
        k.c.quadraticCurveTo(0.92, -1.62, 1.2, -1.62);
        k.c.quadraticCurveTo(1.48, -1.62, 1.45, -1.14);
        k.c.closePath();
      },
      p.brass,
      0.03,
    );
    seg(k, 1.45, -1.4, 1.6, -1.55, 0.03);
    for (const x of [-1.5, -1.2]) seg(k, x, -2.3, x, -1.85, 0.02, alpha(p.ink, 0.7));
    seg(k, -1.62, -2.3, -1.06, -2.3, 0.03);
    return;
  }
  /* 燒瓶、燒杯、試管架、顯微鏡 */
  poly(
    k,
    [-1.4, -1.14, -1.0, -1.14, -1.13, -1.5, -1.13, -1.82, -1.27, -1.82, -1.27, -1.5],
    alpha(p.glass, 0.7),
    0.025,
  );
  box(k, -0.85, -1.52, 0.32, 0.38, alpha(p.glass, 0.6), 0.022);
  box(k, -0.42, -1.44, 0.26, 0.3, alpha(p.sign, 0.5), 0.022);
  box(k, -0.05, -1.3, 0.7, 0.16, p.wood, 0.022);
  for (let i = 0; i < 4; i++)
    box(k, 0.02 + i * 0.16, -1.62, 0.08, 0.36, alpha(p.glass, 0.7), 0.012);
  box(k, 0.85, -1.22, 0.62, 0.08, p.steel, 0.02);
  poly(
    k,
    [0.95, -1.22, 1.05, -1.22, 1.05, -1.8, 1.35, -2.02, 1.42, -1.92, 1.15, -1.72, 1.15, -1.22],
    p.steel,
    0.025,
  );
  box(k, 1.28, -2.18, 0.12, 0.26, p.steelHi, 0.015);
};

const bed = (k: Kit) => {
  const { p } = k;
  box(k, -1.56, -1.75, 0.13, 1.6, p.steel, 0.03, p.ink, 0.04);
  box(k, 1.43, -1.25, 0.13, 1.1, p.steel, 0.03, p.ink, 0.04);
  seg(k, -1.45, -0.6, 1.45, -0.6, 0.06, p.steel);
  for (const x of [-1.35, 1.35]) {
    seg(k, x, -0.6, x, -0.16, 0.04);
    dot(k, x, -0.1, 0.09, p.pale, 0.025);
  }
  box(k, -1.42, -0.92, 2.86, 0.32, p.pale, 0.03, p.ink, 0.05);
  box(k, -0.3, -0.98, 1.74, 0.36, alpha(p.cloth, 0.75), 0.025, p.ink, 0.05);
  shape(k, () => k.c.ellipse(-0.95, -1.04, 0.38, 0.14, 0, 0, Math.PI * 2), p.pale, 0.025);
};

const SPINES = [0.9, 0.72, 0.84, 0.66, 0.95, 0.78, 0.6, 0.88, 0.7];

const shelf = (k: Kit) => {
  const { p } = k;
  box(k, -1.35, -3.85, 2.7, 3.85, p.wood, 0.045);
  box(k, -1.2, -3.7, 2.4, 3.55, alpha(p.ink, 0.12), 0);
  const rows = [-0.15, -1.05, -1.95, -2.85];
  const tones = [p.cloth, p.woodHi, p.pale, p.steel, p.brass];
  rows.forEach((y, r) => {
    seg(k, -1.22, y, 1.22, y, 0.05, p.ink);
    let x = -1.16;
    for (let i = 0; i < 8 && x < 1.0; i++) {
      const h = 0.75 * SPINES[(i + r * 2) % SPINES.length];
      const w = 0.17 + ((i + r) % 3) * 0.05;
      if ((i + r) % 5 === 4) {
        /* 斜靠著的一本 */
        poly(k, [x, y, x + w, y, x + w + 0.18, y - h, x + 0.18, y - h], tones[(i + r) % 5], 0.02);
        x += w + 0.22;
      } else {
        box(k, x, y - h, w, h, tones[(i + r) % 5], 0.02);
        x += w + 0.02;
      }
    }
  });
};

const desk = (k: Kit) => {
  const { p } = k;
  box(k, -1.52, -1.32, 2.12, 0.12, p.wood, 0.035);
  box(k, -1.44, -1.2, 0.72, 1.2, p.woodHi, 0.035);
  for (const y of [-0.82, -0.42]) seg(k, -1.44, y, -0.72, y, 0.02);
  for (const y of [-1.0, -0.6, -0.2]) seg(k, -1.16, y, -1.0, y, 0.03);
  seg(k, 0.5, -1.2, 0.5, 0, 0.06, p.wood);
  /* 檯燈與文件 */
  seg(k, -0.25, -1.32, -0.25, -1.75, 0.03);
  seg(k, -0.25, -1.75, 0.05, -1.92, 0.03);
  poly(k, [-0.08, -1.82, 0.22, -2.05, 0.32, -1.86, 0.08, -1.7], p.sign, 0.025);
  box(k, 0.1, -1.38, 0.4, 0.06, p.pale, 0.015);
  box(k, 0.16, -1.44, 0.34, 0.06, p.pale, 0.015);
  /* 椅子 */
  box(k, 0.85, -0.76, 0.62, 0.1, p.cloth, 0.03);
  box(k, 1.38, -1.62, 0.1, 0.92, p.cloth, 0.03, p.ink, 0.03);
  seg(k, 0.92, -0.66, 0.88, 0, 0.035);
  seg(k, 1.4, -0.66, 1.46, 0, 0.035);
};

const counter = (k: Kit) => {
  const { p } = k;
  box(k, -1.7, -1.34, 3.4, 1.34, p.wood, 0.04);
  for (const x of [-1.55, -0.45, 0.65]) box(k, x, -1.18, 0.9, 1.0, p.woodHi, 0.022);
  box(k, -1.78, -1.46, 3.56, 0.12, p.pale, 0.035);
  box(k, -0.4, -1.24, 0.8, 0.22, p.brass, 0.022);
  /* 檯燈、呼叫鈴、帳本 */
  seg(k, 1.05, -1.46, 1.05, -1.86, 0.03);
  shape(
    k,
    () => {
      k.c.moveTo(0.78, -1.86);
      k.c.quadraticCurveTo(1.05, -2.22, 1.32, -1.86);
      k.c.closePath();
    },
    p.sign,
    0.025,
  );
  shape(
    k,
    () => {
      k.c.moveTo(-1.25, -1.46);
      k.c.arc(-1.1, -1.46, 0.15, Math.PI, 0);
    },
    p.brass,
    0.025,
  );
  box(k, -0.35, -1.53, 0.6, 0.07, p.cloth, 0.02);
};

const locker = (k: Kit) => {
  const { p } = k;
  box(k, -1.25, -3.1, 1.36, 3.1, p.steel, 0.04);
  seg(k, -0.57, -3.1, -0.57, 0, 0.025);
  for (const x of [-1.05, -0.37])
    for (let i = 0; i < 3; i++) seg(k, x, -2.8 + i * 0.1, x + 0.3, -2.8 + i * 0.1, 0.018);
  for (const x of [-0.7, -0.44]) seg(k, x, -1.8, x, -1.5, 0.04, p.steelHi);
  box(k, 0.2, -1.55, 1.06, 1.55, p.body, 0.04, p.ink, 0.05);
  box(k, 0.3, -1.45, 0.86, 1.32, p.steel, 0.025);
  dot(k, 0.73, -0.86, 0.2, p.steelHi, 0.03);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    seg(
      k,
      0.73 + Math.cos(a) * 0.12,
      -0.86 + Math.sin(a) * 0.12,
      0.73 + Math.cos(a) * 0.19,
      -0.86 + Math.sin(a) * 0.19,
      0.015,
    );
  }
  seg(k, 1.06, -1.1, 1.06, -0.6, 0.05, p.brass);
};

const boiler = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  const top = o.ceil ?? -3.5;
  /* 右邊的配電盤 */
  box(k, 0.78, -2.7, 0.98, 1.7, p.sub, 0.035);
  for (let i = 0; i < 3; i++) {
    box(k, 0.9 + i * 0.27, -2.5, 0.18, 0.34, p.pale, 0.015);
    seg(k, 0.99 + i * 0.27, -2.45, 0.99 + i * 0.27, -2.3, 0.04, i === 1 ? p.emergency : p.ink);
  }
  box(k, 0.92, -1.9, 0.7, 0.6, p.steelHi, 0.02);
  seg(k, 1.27, -2.7, 1.27, top, 0.03, alpha(p.ink, 0.7));
  if (o.variant === 'electric') {
    /* 變電設備：散熱片、礙子、高壓線 */
    box(k, -1.6, -2.2, 2.2, 2.2, p.steel, 0.04, p.ink, 0.04);
    for (let i = 0; i < 7; i++)
      seg(k, -1.45 + i * 0.3, -2.0, -1.45 + i * 0.3, -0.25, 0.03, alpha(p.ink, 0.6));
    for (const x of [-1.15, -0.5, 0.15]) {
      for (let j = 0; j < 3; j++)
        shape(
          k,
          () => k.c.ellipse(x, -2.32 - j * 0.16, 0.16, 0.06, 0, 0, Math.PI * 2),
          p.pale,
          0.02,
        );
      seg(k, x, -2.7, x, top, 0.025);
    }
    box(k, -1.3, -1.25, 0.5, 0.3, p.brass, 0.02);
    return;
  }
  /* 鍋爐：圓筒、火門、壓力錶、煙道 */
  seg(k, -1.35, -0.4, -1.25, 0, 0.05);
  seg(k, 0.25, -0.4, 0.35, 0, 0.05);
  box(k, -1.62, -2.95, 2.1, 2.62, p.steel, 0.045, p.ink, 0.45);
  for (const y of [-2.4, -0.9]) seg(k, -1.5, y, 0.36, y, 0.025, alpha(p.ink, 0.6));
  box(k, -1.0, -1.45, 0.75, 0.45, p.body, 0.03, p.ink, 0.05);
  box(k, -0.92, -1.36, 0.59, 0.24, alpha(p.fire, 0.9), 0.015);
  dot(k, 0.05, -2.05, 0.2, p.pale, 0.03);
  seg(k, 0.05, -2.05, 0.15, -2.16, 0.025, p.emergency);
  box(k, -0.78, top, 0.36, -2.95 - top, p.steel, 0.035);
  box(k, -0.86, -3.05, 0.52, 0.14, p.steelHi, 0.025);
};

const pipes = (k: Kit) => {
  const { p } = k;
  for (const x of [-1.7, 0, 1.7]) seg(k, x, -1.15, x, -0.3, 0.03);
  box(k, -2.2, -1.0, 4.4, 0.24, p.steel, 0.035);
  box(k, -2.2, -0.52, 4.4, 0.18, p.steelHi, 0.03);
  for (const x of [-1.2, 0.5]) box(k, x, -1.06, 0.12, 0.36, p.body, 0.02);
  dot(k, 1.25, -0.43, 0.24, null, 0.04, p.emergency);
  seg(k, 1.01, -0.43, 1.49, -0.43, 0.025, p.emergency);
  seg(k, 1.25, -0.67, 1.25, -0.19, 0.025, p.emergency);
  seg(k, -0.6, -0.76, -0.6, -0.52, 0.06, p.steel);
};

const crates = (k: Kit) => {
  const { p } = k;
  const crate = (x: number, y: number, w: number, h: number) => {
    box(k, x, y, w, h, p.woodHi, 0.035);
    box(k, x + 0.06, y + 0.06, w - 0.12, h - 0.12, null, 0.02, alpha(p.ink, 0.6));
    seg(k, x + 0.08, y + h - 0.08, x + w - 0.08, y + 0.08, 0.03);
  };
  crate(-1.42, -1.1, 1.22, 1.1);
  crate(-1.22, -2.05, 0.95, 0.95);
  box(k, 0.2, -1.52, 0.98, 1.52, p.steel, 0.035, p.ink, 0.08);
  for (const y of [-1.2, -0.7, -0.25]) seg(k, 0.2, y, 1.18, y, 0.03, alpha(p.ink, 0.75));
  box(k, 0.5, -1.62, 0.36, 0.1, p.steelHi, 0.02);
  crate(1.22, -0.55, 0.2, 0.55);
};

const altar = (k: Kit) => {
  const { p } = k;
  box(k, -1.8, -0.34, 3.6, 0.34, p.sub, 0.035);
  box(k, -1.48, -0.66, 2.96, 0.32, p.sub, 0.035);
  box(k, -1.0, -1.78, 2.0, 1.12, p.pale, 0.04);
  poly(
    k,
    [-1.05, -1.78, 1.05, -1.78, 0.7, -1.02, 0.35, -1.3, 0, -0.95, -0.35, -1.3, -0.7, -1.02],
    p.cloth,
    0.03,
  );
  /* 燭台與蠟燭 */
  for (const x of [-0.75, 0.75]) {
    box(k, x - 0.06, -2.22, 0.12, 0.44, p.pale, 0.02);
    shape(
      k,
      () => {
        k.c.moveTo(x, -2.45);
        k.c.quadraticCurveTo(x + 0.08, -2.3, x, -2.24);
        k.c.quadraticCurveTo(x - 0.08, -2.3, x, -2.45);
      },
      p.fire,
      0.012,
    );
  }
  box(k, -0.3, -1.9, 0.6, 0.12, p.wood, 0.02);
  /* 背後的符紋 */
  dot(k, 0, -2.7, 0.55, null, 0.035, alpha(p.brass, 0.9));
  dot(k, 0, -2.7, 0.4, null, 0.02, alpha(p.brass, 0.9));
  const star: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    star.push(Math.cos(a) * 0.4, -2.7 + Math.sin(a) * 0.4);
  }
  poly(k, star, null, 0.022, alpha(p.brass, 0.9));
};

const lamp = (k: Kit) => {
  const { p } = k;
  seg(k, 0, -1.05, 0, -0.46, 0.03);
  box(k, -0.14, -1.05, 0.28, 0.06, p.steel, 0.02);
  poly(k, [-0.78, -0.12, 0.78, -0.12, 0.3, -0.48, -0.3, -0.48], p.body, 0.035);
  shape(k, () => k.c.ellipse(0, -0.08, 0.2, 0.09, 0, 0, Math.PI * 2), p.warm, 0.02);
};

const camera = (k: Kit) => {
  const { p } = k;
  box(k, -0.6, -0.9, 0.32, 0.08, p.steel, 0.02);
  seg(k, -0.44, -0.82, -0.44, -0.6, 0.04);
  poly(k, [-0.62, -0.68, 0.38, -0.42, 0.3, -0.12, -0.7, -0.38], p.pale, 0.03);
  poly(k, [0.38, -0.42, 0.6, -0.36, 0.54, -0.12, 0.3, -0.12], p.steel, 0.025);
  dot(k, 0.5, -0.24, 0.06, p.glass, 0.015);
  dot(k, -0.45, -0.46, 0.035, p.emergency, 0);
};

const exitSign = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  for (const x of [-0.45, 0.45]) seg(k, x, -0.85, x, -0.6, 0.02);
  box(k, -0.74, -0.62, 1.48, 0.56, p.sign, 0.03, p.ink, 0.04);
  const fg = o.env === 'blackout' ? '#ffffff' : p.pale;
  /* 跑向門的人與箭頭 */
  dot(k, -0.36, -0.5, 0.05, fg, 0);
  poly(
    k,
    [-0.44, -0.12, -0.36, -0.28, -0.4, -0.42, -0.3, -0.4, -0.22, -0.28, -0.16, -0.22],
    null,
    0.03,
    fg,
    false,
  );
  poly(k, [-0.46, -0.36, -0.3, -0.38], null, 0.03, fg, false);
  box(k, -0.1, -0.5, 0.26, 0.36, null, 0.025, fg);
  poly(k, [0.26, -0.33, 0.58, -0.33], null, 0.04, fg, false);
  poly(k, [0.48, -0.42, 0.6, -0.33, 0.48, -0.24], null, 0.04, fg, false);
};

export const FACILITY_DRAW: Record<string, (k: Kit, o: DrawOpts) => void> = {
  tank,
  console: consoleDesk,
  surgery,
  bench,
  bed,
  shelf,
  desk,
  counter,
  locker,
  boiler,
  pipes,
  crates,
  altar,
  lamp,
  camera,
  exit: exitSign,
};
