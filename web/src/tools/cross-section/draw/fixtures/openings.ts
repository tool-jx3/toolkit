/**
 * 門・窗・梯子的 5 種（側面；本站自己設計的圖形）。門與窗有「事件後破損」的樣子。
 */
import type { Kit } from '../kit';
import { box, dot, oval, poly, seg, shape } from '../kit';
import { alpha } from '../palette';
import type { DrawOpts } from './types';

const LW = 0.045;
const DL = 0.025;

/* ---------- 門：平板門、上面的氣窗、門牌、踢腳板、圓把手；破損：門板只剩一邊的鉸鏈吊著 ---------- */
const door = (k: Kit, o: DrawOpts) => {
  const { c, p } = k;
  box(k, -1.0, -3.6, 2.0, 3.6, p.shade, LW);
  if (o.broken) {
    box(k, -0.82, -3.45, 1.64, 3.45, alpha(p.ink, 0.55), DL);
    for (const [x0, y0, x1, y1] of [
      [-0.8, -3.42, -0.3, -3.0],
      [-0.3, -3.42, 0.1, -3.05],
      [0.3, -3.42, 0.8, -3.1],
    ])
      seg(k, x0, y0, x1, y1, 0.02, p.pane);
    c.save();
    c.translate(-0.82, -2.88);
    c.rotate(0.22);
    box(k, 0, 0, 1.64, 2.88, p.timberLit, LW);
    box(k, 0, 2.5, 1.64, 0.3, p.ironLit, DL);
    seg(k, 0.6, 0.4, 0.9, 1.2, 0.025);
    seg(k, 0.9, 1.2, 0.75, 1.6, 0.025);
    c.restore();
    for (const [x, y] of [
      [0.75, -0.08],
      [0.92, -0.14],
    ])
      poly(k, [x, y, x + 0.18, y - 0.04, x + 0.06, y - 0.12], p.timberLit, 0.015);
    return;
  }
  box(k, -0.82, -3.45, 1.64, 0.5, alpha(p.pane, 0.7), DL);
  for (const x of [-0.27, 0.27]) seg(k, x, -3.45, x, -2.95, 0.02);
  box(k, -0.82, -2.88, 1.64, 2.88, p.timberLit, LW);
  box(k, -0.82, -0.36, 1.64, 0.3, p.ironLit, DL);
  box(k, -0.2, -2.38, 0.4, 0.22, p.gilt, 0.02);
  seg(k, -0.12, -2.27, 0.12, -2.27, 0.02);
  oval(k, 0.6, -1.4, 0.06, 0.14, p.tint, 0.015);
  dot(k, 0.6, -1.4, 0.08, p.gilt, 0.02);
};

/* ---------- 防爆門：工字鋼的門柱、上面的捲門箱與旋轉燈、橫條的鐵捲門、門柱上的密碼鎖 ---------- */
const blastdoor = (k: Kit, o: DrawOpts) => {
  const { c, p } = k;
  shape(k, () => c.ellipse(0, -3.36, 0.2, 0.22, 0, Math.PI, 0), p.amber, DL);
  box(k, -0.26, -3.38, 0.52, 0.06, p.iron, 0.015);
  box(k, -1.2, -3.32, 2.4, 0.42, p.iron, LW);
  for (const x of [-1.0, -0.4, 0.4, 1.0]) dot(k, x, -3.11, 0.035, p.ironLit, 0.01);
  for (const x of [-1.2, 0.9]) {
    box(k, x, -2.9, 0.3, 2.9, p.iron, LW);
    seg(k, x + 0.15, -2.85, x + 0.15, -0.05, 0.02, alpha(p.ink, 0.6));
  }
  box(k, 0.94, -1.78, 0.22, 0.34, p.tint, 0.02);
  for (let i = 0; i < 6; i++)
    dot(k, 0.99 + (i % 2) * 0.12, -1.7 + Math.floor(i / 2) * 0.1, 0.02, p.ink, 0);
  if (o.broken) {
    box(k, -0.9, -2.9, 1.8, 2.9, alpha(p.ink, 0.55), DL);
    for (let y = -2.9; y < -1.3; y += 0.22) box(k, -0.9, y, 1.8, 0.2, p.ironLit, 0.015);
    shape(
      k,
      () => {
        c.moveTo(-0.9, -1.3);
        c.lineTo(0.9, -1.3);
        c.lineTo(0.9, -0.9);
        c.quadraticCurveTo(0.3, -0.5, 0.55, 0.0);
        c.lineTo(0.1, 0.0);
        c.quadraticCurveTo(-0.2, -0.6, -0.9, -0.7);
        c.closePath();
      },
      p.ironLit,
      DL,
    );
    return;
  }
  for (let y = -2.9; y < -0.18; y += 0.22) box(k, -0.9, y, 1.8, 0.22, p.ironLit, 0.015);
  box(k, -0.9, -0.18, 1.8, 0.18, p.shade, DL);
};

/* ---------- 牢房的門：整片鐵門（鉚釘）、有鐵條的小窗、送飯口、掛鎖；破損：門往外打開 ---------- */
const bars = (k: Kit, o: DrawOpts) => {
  const { c, p } = k;
  box(k, -1.1, -3.6, 2.2, 3.6, p.shade, LW);
  if (o.broken) {
    box(k, -0.9, -3.45, 1.8, 3.45, alpha(p.ink, 0.55), DL);
    poly(k, [-0.9, -3.45, -0.38, -3.62, -0.38, 0.12, -0.9, 0], p.iron, LW);
    box(k, -0.8, -3.0, 0.32, 0.4, alpha(p.ink, 0.6), 0.015);
    poly(k, [-0.78, -1.5, -0.52, -1.56, -0.56, -1.2, -0.8, -1.16], p.ironLit, 0.015);
    return;
  }
  box(k, -0.9, -3.45, 1.8, 3.45, p.iron, LW);
  for (let y = -3.3; y < -0.1; y += 0.4) {
    dot(k, -0.8, y, 0.025, p.ironLit, 0.01);
    dot(k, 0.8, y, 0.025, p.ironLit, 0.01);
  }
  box(k, -0.4, -3.1, 0.8, 0.5, alpha(p.ink, 0.6), DL);
  for (const x of [-0.2, 0, 0.2]) seg(k, x, -3.1, x, -2.6, 0.035, p.ironLit);
  box(k, -0.35, -1.56, 0.7, 0.22, p.ironLit, DL);
  seg(k, -0.12, -1.45, 0.12, -1.45, 0.03);
  box(k, 0.6, -1.86, 0.22, 0.08, p.ironLit, 0.015);
  shape(k, () => c.arc(0.71, -1.72, 0.07, Math.PI, 0), null, 0.025);
  box(k, 0.62, -1.72, 0.18, 0.16, p.gilt, 0.015);
};

/* ---------- 窗：拱形的窗、十字窗格、兩邊綁起來的窗簾、窗台上的盆栽；破損：玻璃破洞、窗簾撕裂 ---------- */
const windowFrame = (k: Kit, o: DrawOpts) => {
  const { c, p } = k;
  const arch = (inset: number) => () => {
    c.moveTo(-0.9 + inset, -0.2);
    c.lineTo(-0.9 + inset, -1.5);
    c.arc(0, -1.5, 0.9 - inset, Math.PI, 0);
    c.lineTo(0.9 - inset, -0.2);
    c.closePath();
  };
  seg(k, -1.2, -2.36, 1.2, -2.36, 0.035);
  shape(k, arch(0), p.timberLit, LW);
  shape(k, arch(0.12), o.broken ? alpha(p.ink, 0.55) : alpha(p.pane, 0.8), DL);
  if (o.broken) {
    shape(
      k,
      () => {
        c.moveTo(-0.78, -0.32);
        c.lineTo(-0.5, -0.9);
        c.lineTo(-0.72, -1.3);
        c.lineTo(-0.3, -1.7);
        c.lineTo(-0.78, -1.5);
        c.closePath();
        c.moveTo(0.78, -0.32);
        c.lineTo(0.3, -0.62);
        c.lineTo(0.55, -1.1);
        c.lineTo(0.78, -1.0);
        c.closePath();
      },
      alpha(p.pane, 0.8),
      0.015,
    );
  } else {
    seg(k, 0, -0.32, 0, -2.28, 0.03);
    seg(k, -0.78, -1.2, 0.78, -1.2, 0.03);
  }
  const curtain = (s: number, torn: boolean) =>
    shape(
      k,
      () => {
        c.moveTo(s * 1.2, -2.35);
        c.lineTo(s * 0.74, -2.35);
        c.quadraticCurveTo(s * 0.86, -1.5, s * 0.95, -1.12);
        if (torn) {
          c.lineTo(s * 1.0, -0.9);
          c.lineTo(s * 1.08, -1.05);
          c.lineTo(s * 1.15, -0.85);
          c.lineTo(s * 1.2, -1.0);
        } else {
          c.quadraticCurveTo(s * 0.8, -0.6, s * 0.78, -0.24);
          c.lineTo(s * 1.16, -0.24);
        }
        c.closePath();
      },
      p.fabric,
      DL,
    );
  curtain(-1, false);
  curtain(1, o.broken);
  for (const s of [-1, 1]) seg(k, s * 0.88, -1.15, s * 1.06, -1.12, 0.04, p.gilt);
  box(k, -1.15, -0.2, 2.3, 0.14, p.timber, DL);
  poly(k, [0.32, -0.2, 0.6, -0.2, 0.64, -0.46, 0.28, -0.46], p.timber, 0.02);
  for (const [x, y, a] of [
    [0.38, -0.62, -0.5],
    [0.46, -0.7, 0],
    [0.56, -0.6, 0.5],
  ])
    shape(k, () => c.ellipse(x, y, 0.06, 0.16, a, 0, Math.PI * 2), p.signal, 0.015);
};

/* ---------- 梯子：牆上的 U 字踏桿（沒有側邊的扶手）、護籠的圈、天花板往下打開的蓋子 ---------- */
const hatch = (k: Kit, o: DrawOpts) => {
  const { p } = k;
  const top = o.ceil ?? -4.8;
  for (let y = -0.4; y > top + 0.35; y -= 0.42)
    poly(k, [-0.35, y + 0.08, -0.35, y, 0.35, y, 0.35, y + 0.08], null, 0.045, p.iron, false);
  for (let y = top + 0.6; y < -2.0; y += 0.7) oval(k, 0, y, 0.62, 0.09, null, 0.03, p.iron);
  for (const x of [-0.6, 0.6]) seg(k, x, top + 0.5, x, -2.1, 0.025, p.iron);
  box(k, -0.62, top, 1.24, 0.12, p.iron, DL);
  poly(k, [0.62, top + 0.12, 0.62, top + 0.22, 0.26, top + 1.18, 0.18, top + 1.12], p.ironLit, DL);
  box(k, -0.6, -0.06, 1.2, 0.06, p.iron, 0.015);
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
