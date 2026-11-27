/**
 * 列車專用的 6 種設備（第二批；側面、本站自己設計的圖形：線稿＋淡的填色，和其他 30 種同一種畫法）。
 * 座標：底部的中間是 (0, 0)，往上是負的；單位是格。光的位置寫在 model/catalog.ts。
 *
 * - 運轉台：蒸氣＝鍋爐後端的圓頂火室門（光源）、一個大壓力錶、水位玻璃管、橫的加減汽桿、換向輪、折疊的座椅、靠著的煤鏟；
 *   電氣＝平的控制台（一排按鈕、主控桿）、牆上直條的速度表（光源）、高背的駕駛座、牆上的無線電話筒。
 * - 餐桌：餐車＝兩人的木桌（兩支腳）、曲木椅一對、兩支的燭台（光源）、花瓶、盤子；客車＝面對面的兩張長椅、
 *   靠牆的折疊小桌與報紙、牆上的閱讀燈（光源）、掛鉤上的帽子。
 * - 臥鋪：實木的床頭板、上下兩層、上層的布簾與簾軌、掛在上層的短梯、上面的行李架、下層床頭的壁燈（光源）。
 * - 沙發：一端高起的貴妃椅（釘扣）、左邊的小圓桌與檯燈（光源）和茶杯、右邊的盆栽椰子。
 * - 行李：兩層的木製行李架、皮箱、帽盒、靠著的長傘。
 * - 貨櫃：高的木箱（橫板、Z 形的斜撐）、往上的箭頭與「易碎」、交叉的鐵鍊與掛鎖、綁著的貨籤。
 */
import { S } from '../../strings';
import type { Kit } from '../kit';
import { box, dot, oval, poly, seg, shape } from '../kit';
import { alpha } from '../palette';
import { drawText, SANS } from '../text';
import { candle, flame } from './bits';
import type { DrawOpts } from './types';

const LW = 0.045;
const DL = 0.025;

/* ---------- 運轉台 ---------- */
const steamCab = (k: Kit) => {
  const { c, p } = k;
  box(k, -1.5, -3.0, 1.15, 3.0, p.iron, LW, p.ink, 0.06);
  /* 圓頂的火室門 */
  shape(
    k,
    () => {
      c.moveTo(-1.32, -0.35);
      c.lineTo(-1.32, -0.95);
      c.arc(-0.95, -0.95, 0.37, Math.PI, 0);
      c.lineTo(-0.58, -0.35);
      c.closePath();
    },
    alpha(p.flame, 0.8),
    DL,
  );
  flame(k, -0.95, -0.42, 0.28, 0.5);
  seg(k, -0.62, -0.75, -0.42, -0.75, 0.05);
  /* 壓力錶、水位玻璃管 */
  dot(k, -1.05, -2.35, 0.3, p.fill, DL);
  dot(k, -1.05, -2.35, 0.22, null, 0.012, alpha(p.ink, 0.6));
  seg(k, -1.05, -2.35, -0.88, -2.5, 0.025, p.alarm);
  box(k, -0.62, -2.7, 0.14, 1.0, alpha(p.pane, 0.8), DL, p.ink, 0.05);
  box(k, -0.6, -2.1, 0.1, 0.38, p.screen, 0);
  /* 加減汽桿、換向輪 */
  seg(k, -0.35, -1.95, 0.75, -2.2, 0.06);
  dot(k, 0.78, -2.2, 0.08, p.gilt, 0.02);
  seg(k, 0.15, 0, 0.15, -1.05, 0.05);
  dot(k, 0.15, -1.25, 0.24, null, 0.04);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.3;
    seg(k, 0.15, -1.25, 0.15 + Math.cos(a) * 0.24, -1.25 + Math.sin(a) * 0.24, 0.02);
  }
  /* 折疊的座椅、煤鏟 */
  box(k, 0.62, -1.05, 0.8, 0.14, p.timber, DL);
  seg(k, 1.42, -0.98, 1.42, -2.0, 0.05);
  seg(k, 0.7, -0.92, 1.4, -0.55, 0.03);
  seg(k, 1.45, 0, 1.05, -1.5, 0.04);
  poly(k, [1.33, -0.02, 1.62, -0.02, 1.58, -0.38, 1.38, -0.4], p.ironLit, DL);
};

const electricCab = (k: Kit) => {
  const { c, p } = k;
  /* 牆上：速度表、無線電話筒 */
  box(k, -1.3, -2.45, 0.5, 1.05, p.screen, DL, p.ink, 0.05);
  for (let y = -2.3; y < -1.5; y += 0.16) seg(k, -1.22, y, -1.08, y, 0.015, alpha(p.frost, 0.9));
  box(k, -1.22, -1.85, 0.34, 0.35, alpha(p.frost, 0.55), 0);
  box(k, -0.55, -2.75, 0.36, 0.5, p.iron, DL, p.ink, 0.05);
  shape(k, () => c.ellipse(-0.37, -2.85, 0.24, 0.08, 0, 0, Math.PI * 2), p.ink, 0);
  shape(
    k,
    () => {
      c.moveTo(-0.37, -2.25);
      for (let i = 1; i <= 6; i++) c.lineTo(-0.37 + (i % 2 ? 0.08 : -0.08), -2.25 + i * 0.1);
    },
    null,
    0.015,
  );
  /* 平的控制台 */
  box(k, -1.45, -1.25, 2.0, 0.12, p.fill, DL);
  box(k, -1.4, -1.13, 1.9, 1.13, p.tint, LW);
  const lamps = [p.signal, p.gilt, p.alarm, p.signal, p.frost, p.gilt];
  lamps.forEach((col, i) => {
    box(k, -1.28 + i * 0.27, -0.98, 0.18, 0.12, col, 0.012);
  });
  for (const y of [-0.65, -0.4]) seg(k, -1.3, y, 0.4, y, 0.018, alpha(p.ink, 0.5));
  seg(k, 0.25, -1.25, 0.32, -1.72, 0.05);
  dot(k, 0.33, -1.76, 0.09, p.ink, 0);
  /* 高背的駕駛座 */
  seg(k, 1.12, 0, 1.12, -0.82, 0.06);
  seg(k, 0.85, -0.03, 1.4, -0.03, 0.05);
  box(k, 0.76, -0.98, 0.74, 0.17, p.fabric, DL, p.ink, 0.05);
  box(k, 1.32, -2.05, 0.18, 1.1, p.fabric, DL, p.ink, 0.06);
  box(k, 1.26, -2.36, 0.3, 0.3, p.fabric, DL, p.ink, 0.08);
};

const cabdesk = (k: Kit, o: DrawOpts) => (o.variant === 'electric' ? electricCab(k) : steamCab(k));

/* ---------- 餐桌 ---------- */
function bentChair(k: Kit, x: number, dir: 1 | -1): void {
  const { c, p } = k;
  const back = x - dir * 0.25;
  shape(
    k,
    () => {
      c.moveTo(back, -0.72);
      c.quadraticCurveTo(back - dir * 0.12, -1.3, back + dir * 0.05, -1.78);
      c.quadraticCurveTo(back + dir * 0.28, -1.9, back + dir * 0.25, -1.55);
    },
    null,
    0.05,
    p.timber,
  );
  shape(k, () => c.ellipse(x + dir * 0.05, -0.74, 0.34, 0.07, 0, 0, Math.PI * 2), p.timberLit, DL);
  seg(k, x - 0.22, -0.72, x - 0.32, 0, 0.04, p.timber);
  seg(k, x + 0.28, -0.72, x + 0.36, 0, 0.04, p.timber);
  shape(
    k,
    () => c.ellipse(x + dir * 0.04, -0.3, 0.3, 0.05, 0, 0, Math.PI * 2),
    null,
    0.025,
    p.timber,
  );
}

const dining = (k: Kit) => {
  const { c, p } = k;
  bentChair(k, -1.4, 1);
  bentChair(k, 1.4, -1);
  box(k, -0.95, -1.08, 1.9, 0.1, p.timber, LW);
  for (const x of [-0.7, 0.7])
    poly(k, [x - 0.07, -0.98, x + 0.07, -0.98, x + 0.04, 0, x - 0.04, 0], p.timber, DL);
  for (const x of [-0.6, 0.62]) oval(k, x, -1.1, 0.22, 0.04, p.fill, 0.02);
  /* 兩支的燭台 */
  seg(k, -0.05, -1.08, -0.05, -1.2, 0.04, p.gilt);
  seg(k, -0.25, -1.2, 0.15, -1.2, 0.035, p.gilt);
  c.save();
  c.translate(0, -1.2);
  candle(k, -0.25, 0.22, 0.07);
  candle(k, 0.15, 0.22, 0.07);
  c.restore();
  /* 花瓶 */
  shape(
    k,
    () => {
      c.moveTo(0.36, -1.08);
      c.quadraticCurveTo(0.3, -1.3, 0.4, -1.42);
      c.lineTo(0.48, -1.42);
      c.quadraticCurveTo(0.58, -1.3, 0.52, -1.08);
      c.closePath();
    },
    alpha(p.pane, 0.8),
    0.02,
  );
  seg(k, 0.44, -1.42, 0.4, -1.75, 0.018);
  dot(k, 0.4, -1.8, 0.07, p.blood, 0.012);
  dot(k, 0.5, -1.68, 0.05, p.gilt, 0.012);
};

const coachSeats = (k: Kit) => {
  const { c, p } = k;
  for (const dir of [-1, 1] as const) {
    const out = dir * 1.75;
    const inn = dir * 0.85;
    box(k, Math.min(out, inn), -0.82, 0.9, 0.82, p.iron, DL, p.ink, 0.04);
    box(k, Math.min(out, inn), -1.0, 0.9, 0.22, p.fabric, DL, p.ink, 0.06);
    poly(
      k,
      [out, -0.82, out - dir * 0.28, -0.82, out - dir * 0.12, -2.05, out, -2.05],
      p.fabric,
      DL,
    );
    seg(k, out, -2.08, out - dir * 0.2, -2.08, 0.05, p.timber);
  }
  /* 靠牆的折疊小桌、報紙 */
  box(k, -0.45, -1.18, 0.9, 0.08, p.timberLit, DL);
  seg(k, -0.3, -1.1, 0, -0.75, 0.025);
  seg(k, 0.3, -1.1, 0, -0.75, 0.025);
  poly(k, [-0.3, -1.19, 0.2, -1.19, 0.28, -1.3, -0.22, -1.3], p.fill, 0.015);
  for (const x of [-0.12, 0.05]) seg(k, x, -1.21, x + 0.06, -1.28, 0.012, alpha(p.ink, 0.6));
  /* 閱讀燈、帽子 */
  seg(k, 0, -2.4, 0, -2.2, 0.03);
  shape(k, () => c.ellipse(0, -2.14, 0.2, 0.1, 0, Math.PI, 0), p.amber, 0.02);
  seg(k, -0.6, -2.5, -0.6, -2.3, 0.03);
  shape(k, () => c.ellipse(-0.6, -2.28, 0.26, 0.05, 0, 0, Math.PI * 2), p.shade, 0.02);
  shape(k, () => c.ellipse(-0.6, -2.3, 0.15, 0.14, 0, Math.PI, 0), p.shade, 0.02);
};

const diner = (k: Kit, o: DrawOpts) => (o.variant === 'coach' ? coachSeats(k) : dining(k));

/* ---------- 臥鋪 ---------- */
const bunk = (k: Kit) => {
  const { c, p } = k;
  /* 行李架 */
  box(k, -1.6, -4.12, 3.2, 0.1, p.timber, DL);
  for (const x of [-1.4, 1.4]) seg(k, x, -4.02, x + (x < 0 ? 0.25 : -0.25), -3.8, 0.025);
  box(k, -0.9, -4.5, 0.9, 0.38, p.timberLit, DL, p.ink, 0.05);
  /* 實木的床頭板 */
  for (const x of [-1.62, 1.46]) box(k, x, -3.65, 0.16, 3.65, p.timber, LW);
  for (const [y, h] of [
    [-0.95, 0.3],
    [-2.72, 0.3],
  ]) {
    box(k, -1.46, y + h, 2.92, 0.15, p.timber, DL);
    box(k, -1.46, y, 2.92, h, p.fill, DL, p.ink, 0.06);
    oval(k, 1.05, y - 0.02, 0.3, 0.12, p.tint, DL);
    shape(
      k,
      () => {
        c.moveTo(-1.46, y + 0.02);
        c.lineTo(0.62, y + 0.02);
        c.quadraticCurveTo(0.7, y + 0.2, 0.62, y + h + 0.1);
        c.lineTo(-1.46, y + h + 0.1);
        c.closePath();
      },
      alpha(p.fabric, 0.9),
      DL,
    );
  }
  /* 上層的布簾 */
  seg(k, -1.46, -3.48, 1.46, -3.48, 0.04, p.gilt);
  shape(
    k,
    () => {
      c.moveTo(0.3, -3.48);
      c.lineTo(1.44, -3.48);
      c.lineTo(1.44, -2.45);
      for (let x = 1.44; x > 0.3; x -= 0.19) c.quadraticCurveTo(x - 0.1, -2.38, x - 0.19, -2.45);
      c.closePath();
    },
    alpha(p.blood, 0.45),
    DL,
  );
  /* 掛在上層的短梯 */
  for (const x of [-1.05, -0.7]) seg(k, x, -2.42, x, -0.98, 0.035, p.gilt);
  for (let y = -2.15; y > -2.45 && y < -1.0; y += 0.32) seg(k, -1.05, y, -0.7, y, 0.03, p.gilt);
  /* 下層床頭的壁燈 */
  seg(k, 1.46, -1.3, 1.3, -1.3, 0.03);
  shape(k, () => c.ellipse(1.22, -1.22, 0.14, 0.12, 0, Math.PI, 0), p.amber, 0.02);
};

/* ---------- 沙發 ---------- */
const settee = (k: Kit) => {
  const { c, p } = k;
  /* 左邊的小圓桌、檯燈、茶杯 */
  seg(k, -1.38, -0.95, -1.38, -0.05, 0.05, p.timber);
  seg(k, -1.62, 0, -1.14, 0, 0.05, p.timber);
  oval(k, -1.38, -0.97, 0.36, 0.07, p.timberLit, DL);
  seg(k, -1.48, -1.0, -1.48, -1.55, 0.03, p.gilt);
  poly(k, [-1.72, -1.5, -1.24, -1.5, -1.36, -1.95, -1.6, -1.95], p.amber, DL);
  shape(k, () => c.ellipse(-1.48, -1.0, 0.12, 0.04, 0, 0, Math.PI * 2), p.gilt, 0.015);
  box(k, -1.22, -1.15, 0.16, 0.14, p.fill, 0.015, p.ink, 0.03);
  /* 一端高起的貴妃椅 */
  for (const x of [-0.78, 1.05]) seg(k, x, -0.32, x + (x < 0 ? -0.05 : 0.05), 0, 0.05, p.timber);
  box(k, -0.92, -0.62, 2.1, 0.32, p.fabric, LW, p.ink, 0.1);
  shape(
    k,
    () => {
      c.moveTo(-0.92, -0.6);
      c.lineTo(-0.92, -1.9);
      c.quadraticCurveTo(-0.85, -2.25, -0.5, -2.1);
      c.quadraticCurveTo(0.2, -1.7, 0.9, -1.1);
      c.quadraticCurveTo(1.1, -0.9, 1.18, -0.6);
      c.closePath();
    },
    p.fabric,
    LW,
  );
  for (const [x, y] of [
    [-0.65, -1.75],
    [-0.65, -1.2],
    [-0.15, -1.45],
    [-0.15, -0.95],
    [0.35, -1.1],
  ])
    dot(k, x, y, 0.035, p.gilt, 0.01);
  box(k, -0.86, -0.82, 0.75, 0.24, p.tint, DL, p.ink, 0.08);
  /* 右邊的盆栽椰子 */
  poly(k, [1.36, -0.45, 1.76, -0.45, 1.68, 0, 1.44, 0], p.timberLit, DL);
  seg(k, 1.56, -0.45, 1.52, -1.25, 0.03, p.signal);
  for (const [dx, dy] of [
    [-0.45, 0.35],
    [-0.2, 0.62],
    [0.25, 0.55],
    [0.35, 0.2],
  ])
    shape(
      k,
      () => {
        c.moveTo(1.52, -1.25);
        c.quadraticCurveTo(1.52 + dx * 0.4, -1.25 - dy - 0.2, 1.52 + dx, -1.25 - dy * 0.3);
      },
      null,
      0.05,
      p.signal,
    );
};

/* ---------- 行李 ---------- */
const luggage = (k: Kit) => {
  const { c, p } = k;
  for (const x of [-1.3, 0.9]) seg(k, x, 0, x, -2.2, 0.06, p.timber);
  for (const y of [-0.08, -0.95, -1.85]) box(k, -1.38, y, 2.36, 0.08, p.timberLit, DL);
  /* 下層：皮箱、提袋 */
  box(k, -1.2, -0.68, 1.35, 0.6, p.timber, LW, p.ink, 0.06);
  shape(k, () => c.arc(-0.52, -0.68, 0.14, Math.PI, 0), null, 0.035);
  for (const x of [-0.9, -0.15]) seg(k, x, -0.68, x, -0.08, 0.03, alpha(p.ink, 0.6));
  shape(k, () => c.roundRect(0.22, -0.55, 0.58, 0.47, 0.12), p.fabric, DL);
  /* 上層：小皮箱、帽盒 */
  box(k, -1.18, -1.42, 1.0, 0.47, p.fill, LW, p.ink, 0.05);
  seg(k, -0.68, -1.42, -0.68, -0.95, 0.025, alpha(p.ink, 0.6));
  box(k, 0.0, -1.62, 0.8, 0.67, p.tint, DL);
  oval(k, 0.4, -1.62, 0.4, 0.09, p.fill, DL);
  oval(k, 0.4, -0.95, 0.4, 0.09, null, DL);
  seg(k, 0.02, -1.3, 0.78, -1.3, 0.04, p.blood);
  /* 靠著的長傘 */
  seg(k, 1.3, -0.05, 1.08, -1.95, 0.03);
  shape(
    k,
    () => {
      c.moveTo(1.14, -1.5);
      c.lineTo(1.3, -0.35);
      c.lineTo(1.36, -0.38);
      c.lineTo(1.24, -1.52);
      c.closePath();
    },
    p.ink,
    0.015,
  );
  shape(k, () => c.arc(1.42, -0.05, 0.12, Math.PI, 0, true), null, 0.03);
};

/* ---------- 貨櫃 ---------- */
const freight = (k: Kit) => {
  const { c, p } = k;
  box(k, -1.35, -3.0, 2.7, 3.0, p.timberLit, LW);
  for (let y = -2.52; y < 0; y += 0.48) seg(k, -1.35, y, 1.35, y, 0.018, alpha(p.ink, 0.45));
  for (const [x, y, w, h] of [
    [-1.35, -3.0, 2.7, 0.18],
    [-1.35, -0.18, 2.7, 0.18],
    [-1.35, -3.0, 0.18, 3.0],
    [1.17, -3.0, 0.18, 3.0],
  ])
    box(k, x, y, w, h, p.timber, DL);
  seg(k, -1.17, -0.18, 1.17, -2.82, 0.12, p.timber);
  /* 往上的箭頭、易碎 */
  for (const x of [-0.85, -0.5]) {
    seg(k, x, -1.85, x, -2.5, 0.04, alpha(p.ink, 0.7));
    poly(k, [x - 0.12, -2.38, x, -2.6, x + 0.12, -2.38], alpha(p.ink, 0.7), 0);
  }
  drawText(c, S.fragileText, 0.55, -0.5, {
    size: 0.3,
    weight: 800,
    family: SANS,
    align: 'center',
    baseline: 'middle',
    color: alpha(p.blood, 0.85),
  });
  /* 交叉的鐵鍊與掛鎖 */
  for (const [x0, y0, x1, y1] of [
    [-1.3, -2.6, 1.3, -0.6],
    [1.3, -2.6, -1.3, -0.6],
  ]) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const a = Math.atan2(y1 - y0, x1 - x0);
      shape(
        k,
        () => c.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.13, 0.06, a, 0, Math.PI * 2),
        null,
        0.025,
        p.iron,
      );
    }
  }
  shape(k, () => c.arc(0, -1.72, 0.14, Math.PI, 0), null, 0.045);
  box(k, -0.2, -1.72, 0.4, 0.34, p.gilt, DL, p.ink, 0.04);
  /* 綁著的貨籤 */
  seg(k, 1.2, -2.2, 1.45, -1.85, 0.015);
  poly(k, [1.36, -1.86, 1.62, -1.86, 1.68, -1.5, 1.49, -1.38, 1.3, -1.5], p.fill, 0.02);
  dot(k, 1.49, -1.74, 0.03, null, 0.012);
};

export const TRAIN_DRAW: Record<string, (k: Kit, o: DrawOpts) => void> = {
  cabdesk,
  diner,
  bunk,
  settee,
  luggage,
  freight,
};
