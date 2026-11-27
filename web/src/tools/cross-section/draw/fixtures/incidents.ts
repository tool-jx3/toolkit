/**
 * 事件・異變的 9 種（側面；本站自己設計的圖形）。
 */
import type { Kit } from '../kit';
import { box, dot, oval, poly, seg, shape } from '../kit';
import { alpha } from '../palette';
import { drawText } from '../text';
import { drop, flame, handprint, scrawl } from './bits';

const LW = 0.045;
const DL = 0.025;

/* ---------- 牆上的血跡：兩個手印與往下拖的痕跡、一行潦草的字 ---------- */
const bloodwall = (k: Kit) => {
  const { c, p } = k;
  const red = alpha(p.blood, 0.85);
  shape(
    k,
    () => {
      c.moveTo(-0.72, -1.62);
      c.lineTo(-0.38, -1.62);
      c.quadraticCurveTo(-0.4, -0.9, -0.5, -0.36);
      c.lineTo(-0.6, -0.36);
      c.quadraticCurveTo(-0.66, -1.0, -0.72, -1.62);
    },
    alpha(p.blood, 0.5),
    0,
  );
  for (const x of [-0.66, -0.56, -0.46])
    seg(k, x, -1.5, x + 0.02, -0.5, 0.012, alpha(p.blood, 0.7));
  handprint(k, -0.55, -1.72, 1, red);
  c.save();
  c.translate(0.5, -1.25);
  c.rotate(0.35);
  handprint(k, 0, 0, 0.9, red);
  c.restore();
  scrawl(k, -1.0, -2.18, 0.95, -2.02, 0.06, 4, 0.06, red);
  for (const x of [-0.4, 0.3]) seg(k, x, -2.08, x, -1.75 - (x > 0 ? 0.1 : 0), 0.025, red);
};

/* ---------- 地上的血跡：從左邊拖過來的痕跡、右邊一灘、旁邊掉著一把刀 ---------- */
const bloodpool = (k: Kit) => {
  const { c, p } = k;
  shape(
    k,
    () => {
      c.moveTo(-1.0, 0);
      c.bezierCurveTo(-0.6, -0.05, 0.2, -0.1, 0.55, -0.12);
      c.bezierCurveTo(1.05, -0.2, 1.5, -0.12, 1.45, 0);
      c.closePath();
    },
    alpha(p.blood, 0.85),
    0,
  );
  for (const y of [-0.03, -0.06]) seg(k, -0.9, y + 0.01, 0.3, y - 0.03, 0.012, alpha(p.fill, 0.35));
  for (const [x, r] of [
    [0.2, 0.03],
    [-0.35, 0.025],
    [1.2, 0.035],
  ])
    drop(k, x, -0.32, r, alpha(p.blood, 0.8));
  poly(k, [-1.48, -0.06, -1.1, -0.05, -1.04, -0.09, -1.48, -0.1], p.ironLit, 0.015);
  box(k, -1.04, -0.12, 0.3, 0.09, p.timber, 0.015);
};

/* ---------- 人形：虛線勾的蜷著的人形、號碼牌、掉在地上的手電筒 ---------- */
const chalk = (k: Kit) => {
  const { c, p } = k;
  const line = p.dark ? p.ink : p.fill;
  const body = () => {
    c.moveTo(-0.55, -0.15);
    c.bezierCurveTo(-0.5, -0.55, 0.15, -0.62, 0.4, -0.34);
    c.bezierCurveTo(0.7, -0.55, 0.95, -0.4, 0.78, -0.18);
    c.bezierCurveTo(0.6, -0.08, 0.5, -0.2, 0.36, -0.1);
    c.bezierCurveTo(0.0, -0.02, -0.4, -0.02, -0.55, -0.15);
    c.moveTo(-0.62, -0.22);
    c.arc(-0.82, -0.22, 0.2, 0, Math.PI * 2);
  };
  shape(k, body, null, 0.09, alpha(p.ink, 0.35));
  c.setLineDash([0.12, 0.07]);
  shape(k, body, null, 0.045, line);
  c.setLineDash([]);
  poly(k, [1.02, 0, 1.38, 0, 1.28, -0.38, 1.12, -0.38], p.fill, DL);
  drawText(c, '1', 1.2, -0.17, {
    size: 0.2,
    weight: 700,
    align: 'center',
    baseline: 'middle',
    color: p.ink,
  });
  c.save();
  c.translate(-1.25, -0.08);
  c.rotate(-0.12);
  box(k, -0.24, -0.06, 0.38, 0.12, p.iron, 0.015);
  box(k, 0.14, -0.09, 0.1, 0.18, p.ironLit, 0.015);
  c.restore();
  poly(k, [-1.0, -0.12, -0.55, -0.32, -0.55, 0], alpha(p.amber, 0.3), 0);
};

/* ---------- 翻倒的家具：腳朝上的小桌、摔破的盤子、倒下的杯子 ---------- */
const upset = (k: Kit) => {
  const { c, p } = k;
  c.save();
  c.translate(-0.5, -0.1);
  c.rotate(-0.06);
  box(k, -0.85, -0.08, 1.7, 0.14, p.timber, LW);
  poly(k, [-0.7, -0.08, -0.6, -0.08, -0.52, -1.3, -0.6, -1.3], p.timberLit, DL);
  poly(k, [0.55, -0.08, 0.65, -0.08, 0.68, -1.24, 0.6, -1.24], p.timberLit, DL);
  seg(k, -0.58, -0.7, 0.63, -0.7, 0.03);
  c.restore();
  for (const [x, a] of [
    [0.7, 0.3],
    [0.95, -0.4],
    [1.22, 0.1],
  ])
    poly(k, [x, 0, x + 0.16 * Math.cos(a), -0.05, x + 0.05, -0.08 + a * 0.02], p.fill, 0.015);
  /* 散亂的紙張 */
  for (const [x, a] of [
    [-1.2, 0.08],
    [0.4, -0.1],
  ])
    poly(k, [x, 0, x + 0.42, -a * 0.4, x + 0.44, -0.04 - a * 0.4, x + 0.02, -0.04], p.fill, 0.015);
  c.save();
  c.translate(1.08, -0.12);
  c.rotate(Math.PI / 2 - 0.2);
  box(k, -0.1, -0.12, 0.2, 0.24, p.fill, 0.02);
  shape(k, () => c.arc(0.1, 0, 0.07, -Math.PI / 2, Math.PI / 2), null, 0.02);
  c.restore();
};

/* ---------- 堵門：側倒的衣櫃、倒放的凳子、斜靠的床墊（沒有木板） ---------- */
const boards = (k: Kit) => {
  const { c, p } = k;
  shape(
    k,
    () => {
      c.moveTo(0.62, 0);
      c.lineTo(1.4, 0);
      c.quadraticCurveTo(1.2, -1.5, 0.96, -2.9);
      c.lineTo(0.58, -2.8);
      c.quadraticCurveTo(0.7, -1.4, 0.62, 0);
    },
    p.tint,
    LW,
  );
  for (const t of [0.25, 0.5, 0.75]) {
    const y = -2.85 * t;
    seg(k, 0.6 + 0.08 * (1 - t), y, 1.35 - 0.38 * t, y, 0.02, alpha(p.ink, 0.5));
  }
  box(k, -1.38, -0.95, 2.3, 0.95, p.timber, LW, p.ink, 0.04);
  seg(k, -1.38, -0.48, 0.92, -0.48, DL);
  for (const x of [-0.4, 0.1]) dot(k, x, -0.48, 0.04, p.gilt, 0.01);
  box(k, -1.1, -1.08, 0.78, 0.13, p.timberLit, DL);
  for (const x of [-1.02, -0.4]) seg(k, x, -1.08, x + (x < -0.5 ? -0.08 : 0.08), -1.92, 0.05);
  seg(k, -1.06, -1.5, -0.36, -1.5, 0.03);
};

/* ---------- 碎玻璃：倒在地上的相框（裂成星形）、散開的碎片、破瓶口 ---------- */
const glass = (k: Kit) => {
  const { c, p } = k;
  c.save();
  c.translate(-0.55, -0.02);
  c.rotate(-0.18);
  box(k, -0.55, -0.72, 1.1, 0.72, p.timber, LW);
  box(k, -0.43, -0.6, 0.86, 0.5, alpha(p.pane, 0.75), 0.015);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.3;
    seg(k, 0.1, -0.36, 0.1 + Math.cos(a) * 0.32, -0.36 + Math.sin(a) * 0.22, 0.015);
  }
  c.restore();
  for (const [x, w, h] of [
    [0.3, 0.16, 0.08],
    [0.55, 0.22, 0.1],
    [0.84, 0.12, 0.06],
    [1.0, 0.18, 0.09],
  ])
    poly(k, [x, 0, x + w, 0, x + w * 0.3, -h], alpha(p.pane, 0.9), 0.015);
  for (const [x, y] of [
    [0.62, -0.22],
    [0.95, -0.18],
  ]) {
    seg(k, x - 0.05, y, x + 0.05, y, 0.012, p.ink);
    seg(k, x, y - 0.05, x, y + 0.05, 0.012, p.ink);
  }
  c.save();
  c.translate(0.95, -0.08);
  c.rotate(-0.25);
  poly(
    k,
    [0.0, -0.06, 0.18, -0.04, 0.22, -0.12, 0.27, -0.02, 0.24, 0.08, 0.0, 0.06],
    alpha(p.signal, 0.6),
    0.015,
  );
  c.restore();
};

/* ---------- 火花：天花板的接線盒（蓋子掉下來吊著）、垂下的三條電線、四散的火花粒 ---------- */
const spark = (k: Kit) => {
  const { c, p } = k;
  box(k, -0.45, -1.8, 0.9, 0.42, p.ironLit, LW);
  poly(k, [-0.45, -1.38, -0.37, -1.38, -0.68, -0.58, -0.78, -0.62], p.ironLit, DL);
  const wires: [number, number, string][] = [
    [-0.18, -0.95, p.alarm],
    [0.02, -0.82, p.signal],
    [0.2, -1.0, p.gilt],
  ];
  for (const [x, end, col] of wires) {
    shape(
      k,
      () => {
        c.moveTo(x, -1.38);
        c.quadraticCurveTo(x + 0.15, -1.1, x * 0.5, end);
      },
      null,
      0.045,
      col,
    );
    seg(k, x * 0.5, end, x * 0.5 - 0.04, end + 0.08, 0.015);
    seg(k, x * 0.5, end, x * 0.5 + 0.04, end + 0.08, 0.015);
  }
  const cx = 0.01;
  const cy = -0.72;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const r0 = 0.1;
    const r1 = 0.18 + (i % 3) * 0.08;
    seg(
      k,
      cx + Math.cos(a) * r0,
      cy + Math.sin(a) * r0,
      cx + Math.cos(a) * r1,
      cy + Math.sin(a) * r1,
      0.03,
      p.arc,
    );
  }
  for (const [x, y, r] of [
    [-0.2, -0.4, 0.03],
    [0.15, -0.3, 0.025],
    [0.32, -0.12, 0.02],
    [-0.08, -0.08, 0.02],
  ])
    dot(k, x, y, r, p.arc, 0);
};

/* ---------- 封印的符：直接貼在牆上、角度不一的五張符（一張撕掉一半），沒有繩子 ---------- */
const talisman = (k: Kit) => {
  const { c, p } = k;
  const paper = alpha(p.gilt, 0.6);
  const ink = p.dark ? p.alarm : p.blood;
  const strip = (x: number, y: number, a: number, torn: boolean) => {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    shape(
      k,
      () => {
        c.moveTo(-0.17, -0.5);
        c.lineTo(0.17, -0.5);
        if (torn) {
          c.lineTo(0.17, -0.02);
          c.lineTo(0.08, 0.06);
          c.lineTo(0.02, -0.04);
          c.lineTo(-0.06, 0.08);
          c.lineTo(-0.17, -0.02);
        } else {
          c.lineTo(0.17, 0.5);
          c.lineTo(-0.17, 0.5);
        }
        c.closePath();
      },
      p.fill,
      0,
    );
    shape(
      k,
      () => {
        c.moveTo(-0.17, -0.5);
        c.lineTo(0.17, -0.5);
        c.lineTo(0.17, torn ? -0.02 : 0.5);
        c.lineTo(-0.17, torn ? -0.02 : 0.5);
        c.closePath();
      },
      paper,
      0.02,
    );
    scrawl(k, 0, -0.42, 0, torn ? -0.08 : 0.3, 0.06, 3, 0.025, ink);
    if (!torn) dot(k, 0, 0.38, 0.06, null, 0.02, ink);
    c.restore();
  };
  strip(-0.8, -1.25, -0.14, false);
  strip(-0.36, -1.45, 0.06, false);
  strip(0.08, -1.2, -0.04, false);
  strip(0.52, -1.42, 0.16, false);
  strip(0.86, -0.82, 0.3, true);
};

/* ---------- 火災的殘骸：斜斜塌下來的樑、帶鋼筋的混凝土塊、樑下的火與火星（沒有煙） ---------- */
const rubble = (k: Kit) => {
  const { c, p } = k;
  poly(k, [-1.5, -2.36, -1.28, -2.56, 1.3, 0, 0.9, 0], p.timber, LW);
  poly(k, [-1.5, -2.36, -1.46, -2.5, -1.36, -2.44, -1.28, -2.56], p.shade, 0.015);
  for (const [pts, fill] of [
    [[-1.55, 0, -1.0, 0, -1.08, -0.5, -1.4, -0.56], p.faint],
    [[-0.95, 0, -0.45, 0, -0.55, -0.34, -0.9, -0.3], p.tint],
    [[1.05, 0, 1.6, 0, 1.5, -0.46, 1.18, -0.4], p.faint],
  ] as const)
    poly(k, pts, fill, DL);
  for (const [x0, y0, x1, y1] of [
    [-1.2, -0.5, -1.0, -0.92],
    [-1.2, -0.52, -1.42, -0.86],
    [1.4, -0.44, 1.56, -0.8],
  ]) {
    shape(
      k,
      () => {
        c.moveTo(x0, y0);
        c.quadraticCurveTo((x0 + x1) / 2 + 0.08, (y0 + y1) / 2, x1, y1);
      },
      null,
      0.03,
      p.iron,
    );
  }
  flame(k, 0.35, 0, 0.32, 0.9);
  flame(k, 0.72, 0, 0.26, 0.7);
  flame(k, 0.02, 0, 0.2, 0.5);
  for (const [x, y] of [
    [0.2, -1.1],
    [0.55, -1.25],
    [0.86, -1.0],
    [0.4, -1.45],
  ])
    oval(k, x, y, 0.025, 0.025, p.amber, 0);
};

export const INCIDENT_DRAW: Record<string, (k: Kit) => void> = {
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
