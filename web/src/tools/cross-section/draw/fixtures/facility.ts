/**
 * 設施・研究的 16 種設備（側面；本站自己設計的圖形：線稿＋淡的填色，和室內平面圖產生器的家具同一種畫法）。
 * 座標：底部的中間是 (0, 0)，往上是負的；單位是格。光的位置寫在 model/catalog.ts（每件自己的光源：
 * 培養槽是底座的燈、監控台是雷達幕、書桌是鵝頸燈…）。
 */
import { S } from '../../strings';
import type { Kit } from '../kit';
import { box, dot, oval, poly, seg, shape } from '../kit';
import { alpha } from '../palette';
import { drawText, SANS } from '../text';
import { candle, drop, flame } from './bits';
import type { DrawOpts } from './types';

const LW = 0.045;
const DL = 0.025;

/* ---------- 培養槽：圓頂的玻璃艙、底座的燈、浮著的組織塊、旁邊的幫浦 ---------- */
const tank = (k: Kit) => {
  const { c, p } = k;
  const capsule = () => {
    c.moveTo(-0.7, -0.62);
    c.lineTo(-0.7, -3.05);
    c.arc(0, -3.05, 0.7, Math.PI, 0);
    c.lineTo(0.7, -0.62);
    c.closePath();
  };
  shape(k, capsule, alpha(p.pane, 0.45), LW);
  /* 液面以下 */
  c.save();
  c.beginPath();
  capsule();
  c.clip();
  box(k, -0.72, -3.2, 1.44, 2.6, alpha(p.frost, 0.5), 0);
  shape(
    k,
    () => {
      c.moveTo(-0.72, -3.2);
      for (let x = -0.72; x <= 0.72; x += 0.12) c.lineTo(x, -3.2 + Math.sin(x * 9) * 0.03);
    },
    null,
    DL,
  );
  /* 組織塊與垂下來的觸鬚 */
  shape(
    k,
    () => {
      c.moveTo(-0.32, -2.5);
      c.bezierCurveTo(-0.42, -2.95, 0.05, -3.0, 0.16, -2.82);
      c.bezierCurveTo(0.42, -2.82, 0.4, -2.35, 0.2, -2.25);
      c.bezierCurveTo(0.05, -2.12, -0.3, -2.2, -0.32, -2.5);
    },
    alpha(p.shade, 0.85),
    DL,
  );
  for (const [x0, x1, bend] of [
    [-0.12, -0.3, -0.2],
    [0.05, 0.12, 0.18],
    [0.2, 0.36, -0.1],
  ])
    shape(
      k,
      () => {
        c.moveTo(x0, -2.2);
        c.quadraticCurveTo(x0 + bend, -1.75, x1, -1.3);
      },
      null,
      0.03,
      alpha(p.ink, 0.7),
    );
  for (const [x, y, r] of [
    [-0.45, -1.1, 0.05],
    [-0.38, -1.6, 0.035],
    [0.48, -1.9, 0.045],
    [0.42, -2.6, 0.03],
  ])
    dot(k, x, y, r, null, 0.015, alpha(p.ink, 0.6));
  c.restore();
  box(k, -0.74, -2.08, 1.48, 0.12, p.ironLit, DL);
  box(k, -0.12, -3.95, 0.24, 0.22, p.iron, DL);
  /* 底座與三個燈 */
  poly(k, [-0.9, 0, 0.9, 0, 0.76, -0.62, -0.76, -0.62], p.tint, LW);
  for (const x of [-0.42, 0, 0.42]) oval(k, x, -0.32, 0.1, 0.07, p.frost, 0.02);
  /* 幫浦與管子 */
  box(k, 0.94, -0.56, 0.3, 0.56, p.ironLit, DL, p.ink, 0.04);
  dot(k, 1.09, -0.36, 0.07, p.fill, 0.015);
  shape(
    k,
    () => {
      c.moveTo(1.06, -0.56);
      c.quadraticCurveTo(1.1, -1.3, 0.7, -1.45);
    },
    null,
    0.05,
  );
};

/* ---------- 監控台：磁帶機的機櫃＋雷達幕的操作桌 ---------- */
const consoleDesk = (k: Kit) => {
  const { p } = k;
  box(k, -1.6, -2.8, 1.3, 2.8, p.tint, LW, p.ink, 0.05);
  box(k, -1.5, -2.66, 1.1, 0.78, p.fill, DL);
  for (const x of [-1.22, -0.68]) {
    dot(k, x, -2.27, 0.27, p.ironLit, DL);
    dot(k, x, -2.27, 0.07, p.ink, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + 0.4;
      seg(k, x, -2.27, x + Math.cos(a) * 0.22, -2.27 + Math.sin(a) * 0.22, 0.018);
    }
  }
  const lamps = [p.signal, p.gilt, p.signal, p.alarm, p.gilt];
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < 5; i++)
      dot(k, -1.42 + i * 0.19, -1.6 + r * 0.2, 0.045, lamps[(i + r * 2) % 5], 0.012);
  for (let y = -0.62; y < -0.15; y += 0.12) seg(k, -1.45, y, -0.45, y, 0.018, alpha(p.ink, 0.6));
  /* 操作桌 */
  box(k, -0.3, -1.0, 1.9, 1.0, p.fill, LW);
  poly(k, [-0.3, -1.0, 1.6, -1.0, 1.42, -1.42, -0.12, -1.42], p.tint, LW);
  for (let i = 0; i < 6; i++) dot(k, 0.02 + i * 0.26, -1.22, 0.05, p.fill, 0.015);
  for (const x of [0.05, 0.45, 0.85, 1.25]) box(k, x, -0.72, 0.22, 0.1, p.shade, 0.015);
  /* 雷達幕 */
  box(k, 0.2, -2.42, 1.1, 1.0, p.ironLit, LW, p.ink, 0.12);
  dot(k, 0.75, -1.92, 0.39, p.screen, DL);
  dot(k, 0.75, -1.92, 0.22, null, 0.015, alpha(p.frost, 0.7));
  seg(k, 0.75, -1.92, 1.02, -2.18, 0.022, p.frost);
  dot(k, 0.58, -2.05, 0.035, p.frost, 0);
  dot(k, 0.92, -1.75, 0.03, p.frost, 0);
};

/* ---------- 手術台：鋪床單的推床、三盞燈的橫桿、器械推車 ---------- */
const surgery = (k: Kit, o: DrawOpts) => {
  const { c, p } = k;
  const top = o.ceil ?? -4.5;
  seg(k, -0.1, top, -0.1, -3.3, 0.06);
  box(k, -0.92, -3.34, 1.64, 0.09, p.iron, DL);
  for (const x of [-0.74, -0.1, 0.54]) {
    shape(k, () => c.ellipse(x, -3.24, 0.22, 0.2, 0, Math.PI, 0, true), p.ironLit, DL);
    oval(k, x, -3.03, 0.14, 0.04, p.frost, 0.015);
  }
  /* 推床：腳、橫桿、輪子 */
  for (const x of [-1.1, 0.9]) {
    seg(k, x, -1.3, x, -0.16, 0.05);
    dot(k, x, -0.08, 0.08, p.fill, 0.02);
  }
  seg(k, -1.1, -0.56, 0.9, -0.56, 0.035);
  box(k, -1.32, -1.46, 2.44, 0.16, p.ironLit, DL);
  /* 床單蓋著的人形 */
  shape(
    k,
    () => {
      c.moveTo(-1.36, -1.46);
      c.quadraticCurveTo(-1.2, -1.92, -0.85, -1.74);
      c.quadraticCurveTo(-0.2, -1.66, 0.4, -1.7);
      c.quadraticCurveTo(0.8, -1.64, 1.16, -1.46);
      c.lineTo(1.16, -1.06);
      for (let x = 1.16; x >= -1.36; x -= 0.32)
        c.quadraticCurveTo(x - 0.08, -0.94, x - 0.16, -1.04);
      c.lineTo(-1.36, -1.46);
    },
    p.fill,
    LW,
  );
  /* 器械推車 */
  for (const x of [1.24, 1.74]) {
    seg(k, x, -1.24, x, -0.12, 0.03);
    dot(k, x, -0.06, 0.05, p.fill, 0.015);
  }
  box(k, 1.18, -1.3, 0.62, 0.07, p.tint, DL);
  box(k, 1.18, -0.48, 0.62, 0.06, p.tint, DL);
  shape(k, () => c.ellipse(1.36, -1.3, 0.13, 0.08, 0, Math.PI, 0), p.ironLit, 0.015);
  seg(k, 1.55, -1.34, 1.76, -1.4, 0.02);
  seg(k, 1.5, -1.36, 1.72, -1.46, 0.02);
};

/* ---------- 實驗台：開放的鐵桌、蒸餾裝置、試管架；廚房：爐台與烤箱、砧板、掛著的廚具 ---------- */
const kitchen = (k: Kit) => {
  const { c, p } = k;
  box(k, -1.7, -1.3, 1.65, 1.3, p.ironLit, LW);
  box(k, -1.55, -1.02, 1.35, 0.76, p.tint, DL);
  box(k, -1.38, -0.86, 1.0, 0.4, alpha(p.ink, 0.25), 0.015);
  seg(k, -1.45, -1.12, -0.3, -1.12, 0.04);
  box(k, -1.6, -1.72, 0.66, 0.42, p.iron, DL);
  seg(k, -1.72, -1.62, -1.6, -1.62, 0.04);
  seg(k, -0.94, -1.62, -0.82, -1.62, 0.04);
  /* 水壺 */
  shape(
    k,
    () => {
      c.moveTo(-0.72, -1.3);
      c.quadraticCurveTo(-0.76, -1.66, -0.45, -1.68);
      c.quadraticCurveTo(-0.14, -1.66, -0.18, -1.3);
      c.closePath();
    },
    p.fill,
    DL,
  );
  seg(k, -0.2, -1.42, -0.04, -1.6, 0.035);
  shape(k, () => c.arc(-0.45, -1.68, 0.16, Math.PI, 0), null, 0.025);
  box(k, 0, -1.25, 1.7, 1.25, p.timberLit, LW);
  seg(k, 0.85, -1.2, 0.85, -0.06, DL);
  for (const x of [0.72, 0.98]) dot(k, x, -0.68, 0.035, p.ink, 0);
  box(k, 0.2, -1.33, 0.86, 0.08, p.timber, DL);
  seg(k, 1.2, -1.31, 1.6, -1.31, 0.03);
  /* 掛著的廚具 */
  seg(k, 0.1, -2.45, 1.62, -2.45, 0.04);
  seg(k, 0.4, -2.45, 0.4, -1.95, 0.025);
  dot(k, 0.4, -1.9, 0.08, null, DL);
  seg(k, 0.86, -2.45, 0.86, -2.05, 0.025);
  box(k, 0.76, -2.05, 0.2, 0.18, p.tint, 0.02);
  seg(k, 1.32, -2.45, 1.32, -2.1, 0.025);
  oval(k, 1.32, -1.98, 0.08, 0.13, null, 0.02);
};

const bench = (k: Kit, o: DrawOpts) => {
  if (o.variant === 'kitchen') {
    kitchen(k);
    return;
  }
  const { c, p } = k;
  /* 鐵桌與下層的瓶子 */
  box(k, -1.7, -1.3, 3.4, 0.1, p.ironLit, LW);
  for (const x of [-1.56, 1.56]) seg(k, x, -1.2, x, 0, 0.06);
  box(k, -1.6, -0.4, 3.2, 0.06, p.tint, DL);
  for (const [x, h, fill] of [
    [-1.2, 0.5, p.pane],
    [-0.84, 0.36, p.shade],
    [0.62, 0.44, p.pane],
    [1.0, 0.3, p.timberLit],
  ] as const) {
    box(k, x - 0.13, -0.4 - h, 0.26, h, alpha(fill, 0.9), 0.02);
    box(k, x - 0.05, -0.48 - h, 0.1, 0.08, p.fill, 0.015);
  }
  /* 蒸餾：鐵架、燒瓶、酒精燈、冷凝管、燒杯 */
  box(k, -1.42, -1.38, 0.5, 0.08, p.iron, 0.015);
  seg(k, -1.3, -1.38, -1.3, -2.55, 0.035);
  seg(k, -1.3, -2.05, -0.8, -2.05, 0.03);
  box(k, -0.96, -1.62, 0.26, 0.24, p.fill, 0.02);
  flame(k, -0.83, -1.62, 0.06, 0.18);
  shape(k, () => c.arc(-0.8, -1.9, 0.24, 0, Math.PI * 2), alpha(p.pane, 0.6), DL);
  shape(k, () => c.arc(-0.8, -1.9, 0.2, 0.15, Math.PI - 0.15), alpha(p.signal, 0.55), 0);
  seg(k, -0.8, -2.12, -0.8, -2.36, 0.07, alpha(p.pane, 0.9));
  poly(
    k,
    [-0.78, -2.3, -0.4, -2.3, 0.42, -1.74, 0.3, -1.66, -0.45, -2.18, -0.78, -2.2],
    alpha(p.pane, 0.6),
    0.02,
  );
  for (let i = 0; i < 5; i++) {
    const t = 0.15 + i * 0.16;
    oval(k, -0.4 + 0.8 * t, -2.24 + 0.55 * t, 0.06, 0.09, null, 0.015);
  }
  box(k, 0.24, -1.68, 0.38, 0.38, alpha(p.pane, 0.55), 0.02);
  box(k, 0.26, -1.48, 0.34, 0.16, alpha(p.signal, 0.45), 0);
  /* 試管架 */
  box(k, 0.95, -1.62, 0.62, 0.08, p.timber, 0.015);
  for (let i = 0; i < 4; i++)
    box(k, 1.0 + i * 0.15, -1.86, 0.07, 0.56, alpha(p.pane, 0.8), 0.012, p.ink, 0.035);
};

/* ---------- 床：拱形的鐵床頭、垂下來的毯子、床下的皮箱 ---------- */
const bed = (k: Kit) => {
  const { c, p } = k;
  for (const x of [1.0, 1.55]) seg(k, x, 0, x, -1.6, 0.07);
  shape(
    k,
    () => {
      c.moveTo(1.0, -1.58);
      c.quadraticCurveTo(1.27, -2.3, 1.55, -1.58);
    },
    null,
    0.06,
  );
  for (const x of [1.14, 1.27, 1.41]) seg(k, x, -1.0, x, -1.8, 0.025);
  seg(k, -1.55, 0, -1.55, -1.05, 0.07);
  dot(k, -1.55, -1.1, 0.07, p.gilt, 0.02);
  seg(k, -1.55, -0.56, 1.55, -0.56, 0.06);
  box(k, -1.5, -0.96, 2.5, 0.4, p.fill, LW, p.ink, 0.1);
  oval(k, 0.7, -1.06, 0.3, 0.13, p.tint, DL);
  shape(
    k,
    () => {
      c.moveTo(-1.52, -1.0);
      c.lineTo(0.42, -1.0);
      c.quadraticCurveTo(0.5, -0.7, 0.44, -0.4);
      for (let x = 0.44; x > -1.52; x -= 0.33) c.quadraticCurveTo(x - 0.1, -0.28, x - 0.2, -0.38);
      c.closePath();
    },
    p.fabric,
    LW,
  );
  seg(k, -1.4, -0.78, 0.3, -0.78, 0.02, alpha(p.fill, 0.7));
  box(k, -0.6, -0.4, 0.92, 0.4, p.timber, DL, p.ink, 0.05);
  for (const x of [-0.36, 0.08]) seg(k, x, -0.4, x, 0, 0.03, alpha(p.ink, 0.6));
  shape(k, () => c.arc(-0.14, -0.4, 0.09, Math.PI, 0), null, 0.025);
};

/* ---------- 書架：開放的鐵架，書、檔案箱、疊起來的紙、工具箱 ---------- */
const shelf = (k: Kit) => {
  const { c, p } = k;
  for (const x of [-1.4, 1.3]) {
    box(k, x, -4.0, 0.1, 4.0, p.ironLit, DL);
    for (let y = -3.85; y < -0.1; y += 0.3) dot(k, x + 0.05, y, 0.018, p.ink, 0);
  }
  for (const y of [-0.28, -1.22, -2.16, -3.1, -3.98]) box(k, -1.4, y, 2.8, 0.07, p.iron, DL);
  const books: [number, number, number, string][] = [
    [-1.22, 0.16, 0.74, p.fabric],
    [-1.04, 0.2, 0.68, p.timber],
    [-0.82, 0.13, 0.78, p.shade],
    [-0.67, 0.18, 0.64, p.signal],
  ];
  for (const [x, w, h, fill] of books) box(k, x, -3.1 - h, w, h, fill, 0.02);
  poly(k, [-0.47, -3.1, -0.3, -3.1, -0.06, -3.76, -0.22, -3.8], p.timberLit, 0.02);
  poly(k, [-0.28, -3.1, -0.1, -3.1, 0.2, -3.7, 0.04, -3.76], p.fabric, 0.02);
  box(k, 0.6, -3.42, 0.55, 0.32, p.tint, 0.02);
  for (const x of [-1.25, -0.5, 0.25]) {
    box(k, x, -2.86, 0.68, 0.7, p.timberLit, DL);
    box(k, x + 0.18, -2.72, 0.32, 0.16, p.fill, 0.015);
    oval(k, x + 0.34, -2.36, 0.1, 0.04, alpha(p.ink, 0.5), 0);
  }
  for (let i = 0; i < 6; i++)
    box(k, -1.2 + (i % 2) * 0.05, -1.32 - i * 0.07, 1.0, 0.07, p.fill, 0.015);
  shape(k, () => c.roundRect(0.4, -2.0, 0.42, 0.68, 0.1), alpha(p.pane, 0.7), DL);
  box(k, 0.46, -2.08, 0.3, 0.1, p.timber, 0.015);
  box(k, -0.9, -0.88, 1.3, 0.6, p.alarm, DL, p.ink, 0.04);
  shape(k, () => c.roundRect(-0.45, -1.06, 0.4, 0.2, 0.08), null, 0.03);
  seg(k, -0.9, -0.66, 0.4, -0.66, 0.02);
};

/* ---------- 書桌：細腳的寫字桌、打字機、鵝頸燈、左邊的椅子、紙簍 ---------- */
const desk = (k: Kit) => {
  const { c, p } = k;
  box(k, -0.9, -1.32, 2.3, 0.1, p.timber, LW);
  box(k, -0.78, -1.22, 2.06, 0.22, p.timberLit, DL);
  dot(k, 0.25, -1.11, 0.03, p.ink, 0);
  poly(k, [-0.84, -1.0, -0.78, 0, -0.71, 0, -0.74, -1.0], p.timber, 0.02);
  poly(k, [1.24, -1.0, 1.3, 0, 1.37, 0, 1.34, -1.0], p.timber, 0.02);
  box(k, -0.06, -2.04, 0.42, 0.42, p.fill, 0.02);
  for (let y = -1.94; y < -1.7; y += 0.07) seg(k, 0.02, y, 0.28, y, 0.012, alpha(p.ink, 0.5));
  poly(k, [-0.32, -1.32, 0.58, -1.32, 0.46, -1.62, -0.2, -1.62], p.iron, DL);
  oval(k, 0.13, -1.66, 0.4, 0.06, p.ironLit, 0.02);
  for (let i = 0; i < 6; i++) dot(k, -0.18 + i * 0.13, -1.42, 0.03, p.fill, 0.01);
  oval(k, 1.12, -1.36, 0.19, 0.05, p.iron, 0.02);
  shape(
    k,
    () => {
      c.moveTo(1.12, -1.36);
      c.bezierCurveTo(1.2, -1.75, 1.18, -2.05, 0.92, -2.0);
    },
    null,
    0.035,
  );
  poly(k, [0.98, -2.12, 0.74, -2.02, 0.68, -1.86, 0.9, -1.92], p.signal, 0.02);
  seg(k, -1.62, 0, -1.62, -1.78, 0.06);
  for (const y of [-1.7, -1.45, -1.2]) seg(k, -1.62, y, -1.48, y, 0.03);
  box(k, -1.64, -0.86, 0.6, 0.08, p.timber, 0.02);
  seg(k, -1.1, -0.8, -1.1, 0, 0.05);
  poly(k, [0.46, 0, 0.84, 0, 0.9, -0.48, 0.4, -0.48], p.tint, DL);
  dot(k, 0.6, -0.54, 0.09, p.fill, 0.015);
  dot(k, 0.76, -0.52, 0.07, p.fill, 0.015);
};

/* ---------- 櫃台：直條紋的檯面、玻璃隔板與傳話孔、鈴、帳本、桌燈、鑰匙板 ---------- */
const counter = (k: Kit) => {
  const { c, p } = k;
  box(k, -1.6, -1.15, 3.2, 1.15, p.timberLit, LW);
  for (let x = -1.35; x < 1.6; x += 0.25) seg(k, x, -1.1, x, -0.06, 0.018, alpha(p.ink, 0.45));
  box(k, -1.75, -1.28, 3.5, 0.13, p.timber, LW);
  box(k, -0.38, -2.3, 1.56, 1.02, alpha(p.pane, 0.5), DL);
  shape(k, () => c.ellipse(0.4, -1.28, 0.26, 0.2, 0, Math.PI, 0), p.tint, 0.02);
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    dot(k, 0.4 + Math.cos(a) * 0.12, -1.86 + Math.sin(a) * 0.12, 0.025, p.fill, 0.01);
  }
  dot(k, 0.4, -1.86, 0.025, p.fill, 0.01);
  box(k, -1.1, -1.32, 0.3, 0.04, p.iron, 0.012);
  shape(k, () => c.arc(-0.95, -1.32, 0.13, Math.PI, 0), p.gilt, 0.02);
  dot(k, -0.95, -1.48, 0.03, p.iron, 0.01);
  poly(k, [1.25, -1.28, 1.48, -1.38, 1.72, -1.28, 1.48, -1.32], p.fill, 0.02);
  box(k, -1.6, -1.34, 0.3, 0.06, p.iron, 0.015);
  seg(k, -1.45, -1.34, -1.45, -1.9, 0.03);
  poly(k, [-1.74, -1.9, -1.16, -1.9, -1.3, -2.26, -1.6, -2.26], p.gilt, DL);
  box(k, 1.22, -2.76, 0.56, 0.6, p.timber, DL);
  for (const [x, y] of [
    [1.36, -2.62],
    [1.64, -2.62],
    [1.36, -2.36],
    [1.64, -2.36],
  ]) {
    dot(k, x, y, 0.025, p.ink, 0);
    seg(k, x, y, x, y + 0.14, 0.018);
    dot(k, x, y + 0.18, 0.04, p.gilt, 0.01);
  }
};

/* ---------- 置物櫃：三格窄櫃（有通風孔、號碼牌），最右一格半開，裡面掛著外套 ---------- */
const locker = (k: Kit) => {
  const { c, p } = k;
  const w = 0.76;
  const x0 = -1.35;
  box(k, x0, -3.4, w * 3, 3.4, p.tint, LW);
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * w;
    if (i === 2) {
      box(k, x + 0.05, -3.32, w - 0.1, 3.2, alpha(p.ink, 0.45), DL);
      seg(k, x + 0.12, -2.95, x + w - 0.12, -2.95, 0.03);
      shape(
        k,
        () => {
          c.moveTo(x + 0.38, -2.95);
          c.lineTo(x + 0.18, -2.72);
          c.lineTo(x + 0.14, -1.6);
          c.lineTo(x + 0.62, -1.6);
          c.lineTo(x + 0.58, -2.72);
          c.closePath();
        },
        p.fabric,
        0.02,
      );
      poly(k, [x + w, -3.32, x + w + 0.38, -3.44, x + w + 0.38, 0.04, x + w, -0.12], p.ironLit, DL);
      continue;
    }
    box(k, x + 0.05, -3.32, w - 0.1, 3.2, p.ironLit, DL);
    for (const y of [-3.12, -3.02, -2.92]) seg(k, x + 0.18, y, x + w - 0.18, y, 0.02);
    box(k, x + 0.25, -2.66, 0.26, 0.14, p.fill, 0.015);
    box(k, x + w - 0.2, -1.86, 0.06, 0.3, p.iron, 0.012);
  }
  box(k, x0, -0.12, w * 3, 0.12, p.shade, DL);
};

/* ---------- 鍋爐：橫放的圓筒、下面的火門、右邊的煙道與壓力錶、煤堆；變電：散熱片＋三支礙子 ---------- */
const transformer = (k: Kit, top: number) => {
  const { p } = k;
  for (const x of [-0.5, 0.1, 0.7]) {
    seg(k, x, top, x, -2.85, 0.03);
    for (let i = 0; i < 3; i++) oval(k, x, -2.32 - i * 0.2, 0.12 - i * 0.015, 0.06, p.fill, 0.02);
  }
  box(k, -0.9, -2.22, 2.0, 2.22, p.ironLit, LW, p.ink, 0.06);
  for (let i = 0; i < 5; i++) {
    box(k, -1.28 + i * 0.075, -1.9, 0.04, 1.5, p.iron, 0.01);
    box(k, 1.14 + i * 0.075, -1.9, 0.04, 1.5, p.iron, 0.01);
  }
  poly(k, [0.1, -1.6, 0.4, -1.08, -0.2, -1.08], p.gilt, 0.02);
  poly(k, [0.14, -1.48, 0.02, -1.28, 0.12, -1.28, 0.04, -1.14], null, 0.02, p.ink, false);
  dot(k, -0.58, -0.55, 0.08, p.frost, 0.02);
  box(k, -1.0, -0.08, 2.2, 0.08, p.shade, 0.015);
};

const boiler = (k: Kit, o: DrawOpts) => {
  const { c, p } = k;
  const top = o.ceil ?? -3.6;
  if (o.variant === 'electric') {
    transformer(k, top);
    return;
  }
  shape(
    k,
    () => {
      c.moveTo(-1.9, 0);
      c.quadraticCurveTo(-1.35, -0.62, -0.85, 0);
      c.closePath();
    },
    p.shade,
    DL,
  );
  seg(k, -1.55, -0.12, -1.12, -1.15, 0.035, p.timber);
  poly(k, [-1.62, -0.02, -1.42, -0.02, -1.48, -0.26, -1.62, -0.24], p.iron, 0.015);
  for (const x of [-0.35, 1.05])
    poly(k, [x - 0.3, 0, x + 0.3, 0, x + 0.2, -1.0, x - 0.2, -1.0], p.iron, DL);
  box(k, -0.78, -2.45, 2.5, 1.5, p.ironLit, LW, p.ink, 0.6);
  for (const x of [-0.05, 0.95]) {
    seg(k, x, -2.42, x, -0.98, 0.02);
    for (let y = -2.3; y < -1.0; y += 0.25) dot(k, x + 0.06, y, 0.02, p.ink, 0);
  }
  box(k, 0.28, -2.66, 0.16, 0.22, p.iron, 0.015);
  box(k, 0.22, -2.72, 0.28, 0.07, p.iron, 0.015);
  box(k, -0.62, -0.86, 0.72, 0.62, p.iron, DL);
  box(k, -0.5, -0.7, 0.48, 0.32, p.flame, 0.02);
  for (let x = -0.44; x < -0.06; x += 0.09) seg(k, x, -0.7, x, -0.38, 0.02);
  box(k, 1.28, top, 0.3, -2.0 - top, p.iron, DL);
  dot(k, 1.43, -2.92, 0.18, p.fill, DL);
  seg(k, 1.43, -2.92, 1.52, -3.02, 0.02, p.alarm);
};

/* ---------- 天花板的管線：三條粗細不同的管、法蘭、吊桿、往下彎的彎頭、滴水 ---------- */
const pipes = (k: Kit) => {
  const { c, p } = k;
  for (const x of [-1.4, 0.4, 1.9]) {
    seg(k, x, -1.4, x, -0.3, 0.03);
    shape(k, () => c.arc(x, -0.55, 0.22, 0.2, Math.PI - 0.2), null, 0.025);
  }
  box(k, -2.3, -1.1, 4.6, 0.2, p.tint, DL);
  shape(
    k,
    () => {
      c.moveTo(2.3, -0.73);
      c.lineTo(-1.9, -0.73);
      c.quadraticCurveTo(-2.3, -0.73, -2.3, -0.33);
      c.lineTo(-2.3, 0);
      c.lineTo(-1.94, 0);
      c.lineTo(-1.94, -0.3);
      c.quadraticCurveTo(-1.94, -0.37, -1.86, -0.37);
      c.lineTo(2.3, -0.37);
    },
    p.ironLit,
    LW,
  );
  for (const x of [-0.5, 1.2]) box(k, x - 0.05, -0.8, 0.1, 0.5, p.iron, 0.02);
  box(k, -2.36, -0.4, 0.48, 0.08, p.iron, 0.02);
  box(k, -2.1, -0.28, 3.8, 0.12, alpha(p.gilt, 0.8), 0.02);
  drop(k, 1.26, -0.24, 0.045, alpha(p.pane, 0.9));
  drop(k, 1.26, -0.04, 0.035, alpha(p.pane, 0.9));
};

/* ---------- 貨物：棧板上的紙箱、旁邊的麻袋 ---------- */
const crates = (k: Kit) => {
  const { c, p } = k;
  box(k, -1.42, -0.24, 2.44, 0.08, p.timber, DL);
  for (const x of [-1.38, -0.26, 0.86]) box(k, x, -0.16, 0.12, 0.12, p.timber, 0.015);
  box(k, -1.42, -0.04, 2.44, 0.04, p.timber, 0.015);
  const carton = (x: number, y: number, w: number, h: number) => {
    box(k, x, y - h, w, h, p.timberLit, DL);
    box(k, x + w / 2 - 0.06, y - h, 0.12, h, alpha(p.gilt, 0.55), 0);
    seg(k, x, y - h + 0.12, x + w, y - h + 0.12, 0.015, alpha(p.ink, 0.5));
  };
  carton(-1.38, -0.24, 1.1, 0.82);
  carton(-0.22, -0.24, 1.16, 0.72);
  carton(-0.95, -1.06, 1.02, 0.7);
  for (const x of [0.12, 0.3])
    poly(k, [x, -0.5, x + 0.06, -0.62, x + 0.12, -0.5], null, 0.02, p.ink, false);
  shape(
    k,
    () => {
      c.moveTo(1.06, 0);
      c.quadraticCurveTo(0.98, -0.7, 1.18, -0.92);
      c.lineTo(1.3, -1.06);
      c.lineTo(1.4, -0.92);
      c.quadraticCurveTo(1.56, -0.7, 1.5, 0);
      c.closePath();
    },
    p.tint,
    DL,
  );
  seg(k, 1.16, -0.9, 1.44, -0.9, 0.03);
};

/* ---------- 祭壇：石板架在兩塊石頭上、小神像、碗、牆上的眼睛旗、石板下面的一叢蠟燭 ---------- */
const altar = (k: Kit) => {
  const { c, p } = k;
  seg(k, -0.72, -2.96, 0.72, -2.96, 0.04);
  poly(k, [-0.56, -2.96, 0.56, -2.96, 0.56, -1.76, 0, -1.98, -0.56, -1.76], p.shade, DL);
  shape(
    k,
    () => {
      c.moveTo(-0.3, -2.42);
      c.quadraticCurveTo(0, -2.66, 0.3, -2.42);
      c.quadraticCurveTo(0, -2.18, -0.3, -2.42);
    },
    p.fill,
    0.02,
  );
  dot(k, 0, -2.42, 0.07, p.gilt, 0);
  for (const x of [-1.2, 0.6]) box(k, x, -1.0, 0.6, 1.0, p.tint, LW);
  poly(k, [-1.56, -1.0, 1.52, -1.0, 1.46, -1.3, -1.5, -1.27], p.faint, LW);
  dot(k, -0.1, -1.92, 0.14, p.shade, DL);
  poly(k, [-0.36, -1.3, 0.16, -1.3, 0.06, -1.78, -0.26, -1.78], p.shade, DL);
  shape(k, () => c.ellipse(0.85, -1.3, 0.22, 0.14, 0, Math.PI, 0), p.ironLit, 0.02);
  for (const [x, len] of [
    [-0.32, 0.36],
    [0.3, 0.22],
    [1.1, 0.3],
  ]) {
    seg(k, x, -1.0, x, -1.0 + len, 0.04, alpha(p.blood, 0.85));
    dot(k, x, -1.0 + len, 0.035, alpha(p.blood, 0.85), 0);
  }
  for (const [x, h] of [
    [-0.42, 0.42],
    [-0.2, 0.6],
    [0.03, 0.34],
    [0.26, 0.52],
    [0.46, 0.3],
    [1.38, 0.5],
    [1.62, 0.32],
  ])
    candle(k, x, h);
};

/* ---------- 吊燈：鐵籠罩著的燈泡，掛在扭轉的電線上 ---------- */
const lamp = (k: Kit) => {
  const { c, p } = k;
  box(k, -0.18, -1.5, 0.36, 0.08, p.iron, 0.02);
  shape(
    k,
    () => {
      c.moveTo(0, -1.42);
      let side = 1;
      for (let y = -1.36; y < -0.66; y += 0.06) {
        c.lineTo(0.025 * side, y);
        side = -side;
      }
      c.lineTo(0, -0.64);
    },
    null,
    0.02,
  );
  box(k, -0.08, -0.66, 0.16, 0.14, p.iron, 0.015);
  oval(k, 0, -0.32, 0.16, 0.19, alpha(p.amber, 0.9), 0.02);
  oval(k, 0, -0.33, 0.26, 0.28, null, 0.02);
  oval(k, 0, -0.33, 0.11, 0.28, null, 0.015);
  seg(k, -0.26, -0.33, 0.26, -0.33, 0.015);
  box(k, -0.06, -0.06, 0.12, 0.06, p.iron, 0.012);
};

/* ---------- 監視器：天花板的半球形（黑色的罩子、鏡頭、紅燈），電線管接到旁邊 ---------- */
const camera = (k: Kit) => {
  const { c, p } = k;
  seg(k, 0.25, -0.75, 0.6, -0.75, 0.06, p.iron);
  box(k, -0.38, -0.8, 0.76, 0.1, p.tint, 0.02);
  shape(k, () => c.ellipse(0, -0.7, 0.34, 0.42, 0, 0, Math.PI), alpha(p.ink, 0.7), DL);
  shape(k, () => c.ellipse(0, -0.7, 0.26, 0.32, 0, 0.3, 1.2), null, 0.02, alpha(p.fill, 0.6));
  dot(k, 0.1, -0.46, 0.06, p.screen, 0.015, p.fill);
  dot(k, -0.18, -0.6, 0.03, p.alarm, 0);
};

/* ---------- 緊急出口：貼著天花板的燈箱，綠底白字「出口」 ---------- */
const exitSign = (k: Kit) => {
  const { p } = k;
  box(k, -0.86, -0.8, 1.72, 0.64, p.signal, DL, p.ink, 0.06);
  box(k, -0.76, -0.72, 1.52, 0.48, null, 0.02, p.fill);
  drawText(k.c, S.exitText, -0.08, -0.47, {
    size: 0.32,
    weight: 800,
    family: SANS,
    align: 'center',
    baseline: 'middle',
    color: p.fill,
  });
  dot(k, 0.6, -0.47, 0.05, p.amber, 0.012);
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
