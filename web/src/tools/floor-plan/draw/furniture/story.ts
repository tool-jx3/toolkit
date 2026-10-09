/**
 * 家具畫法：調查・恐怖、戶外、1920 年代・和風、科幻、自然・露營。
 */
import {
  block,
  type Ctx,
  chairTop,
  disc,
  type FurnDraw,
  hatchRows,
  lw,
  oval,
  paint,
  poly,
  rrect,
  seeded,
  seg,
  TAU,
  word,
} from './kit';

/** 不規則的圓形（岩石、樹冠、血跡）：n 個頂點、半徑在 r × (1 − jitter)～r 之間 */
function blob(
  c: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number,
  jitter: number,
  rnd: () => number,
  curved = true,
): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 - jitter * rnd();
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  c.beginPath();
  if (!curved) {
    pts.forEach(([x, y], i) => {
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    });
    c.closePath();
    return;
  }
  const mid = (i: number) => {
    const [ax, ay] = pts[i % n];
    const [bx, by] = pts[(i + 1) % n];
    return [(ax + bx) / 2, (ay + by) / 2] as const;
  };
  const [sx, sy] = mid(n - 1);
  c.moveTo(sx, sy);
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const [mx, my] = mid(i);
    c.quadraticCurveTo(px, py, mx, my);
  }
  c.closePath();
}

/** 樹冠一樣的波浪圓 */
function scallop(c: Ctx, cx: number, cy: number, r: number, n: number): void {
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU;
    const a1 = ((i + 1) / n) * TAU;
    const am = (a0 + a1) / 2;
    const x0 = cx + Math.cos(a0) * r * 0.86;
    const y0 = cy + Math.sin(a0) * r * 0.86;
    if (!i) c.moveTo(x0, y0);
    c.quadraticCurveTo(
      cx + Math.cos(am) * r * 1.12,
      cy + Math.sin(am) * r * 1.12,
      cx + Math.cos(a1) * r * 0.86,
      cy + Math.sin(a1) * r * 0.86,
    );
  }
  c.closePath();
}

/* ---------- 調查・恐怖 ---------- */

const evidence: FurnDraw = (c, S, w, h, item) => {
  poly(c, [
    [w * 0.12, h * 0.95],
    [w * 0.3, h * 0.08],
    [w * 0.7, h * 0.08],
    [w * 0.88, h * 0.95],
  ]);
  paint(c, S.gold);
  word(c, S, (item.label || '1').slice(0, 3), w / 2, h * 0.56, Math.min(w, h) * 0.46, '#1d1d1d');
};

const clueMark: FurnDraw = (c, S, w, h) => {
  disc(c, S, w / 2, h / 2, Math.min(w, h) / 2 - 0.04, S.screen);
  word(c, S, '？', w / 2, h / 2 + 0.02, Math.min(w, h) * 0.62, '#ffffff');
};

const memo: FurnDraw = (c, S, w, h) => {
  poly(c, [
    [0, 0],
    [w * 0.72, 0],
    [w, h * 0.3],
    [w, h],
    [0, h],
  ]);
  paint(c, S.paper);
  lw(c, S, 0.4);
  seg(c, w * 0.72, 0, w * 0.72, h * 0.3);
  seg(c, w * 0.72, h * 0.3, w, h * 0.3);
  hatchRows(c, w * 0.12, w * 0.85, h * 0.2, h * 0.95, h * 0.2);
  lw(c, S);
};

const diary: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.occultTint);
  c.save();
  c.fillStyle = S.shade;
  c.fillRect(0, 0, w * 0.16, h);
  c.restore();
  rrect(c, 0, 0, w, h, 0.05);
  c.stroke();
  c.save();
  c.fillStyle = S.alert;
  poly(c, [
    [w * 0.7, 0],
    [w * 0.8, 0],
    [w * 0.8, h * 0.5],
    [w * 0.75, h * 0.42],
    [w * 0.7, h * 0.5],
  ]);
  c.fill();
  c.restore();
};

const keyItem: FurnDraw = (c, S, w, h) => {
  disc(c, S, h / 2, h / 2, h * 0.42, S.gold);
  disc(c, S, h / 2, h / 2, h * 0.15, null);
  lw(c, S, 1.6);
  seg(c, h * 0.9, h / 2, w - 0.04, h / 2);
  seg(c, w * 0.78, h / 2, w * 0.78, h * 0.85);
  seg(c, w * 0.92, h / 2, w * 0.92, h * 0.78);
  lw(c, S);
};

const knife: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.25, w * 0.36, h * 0.5, h * 0.2, S.wood);
  poly(c, [
    [w * 0.36, h * 0.15],
    [w * 0.78, h * 0.15],
    [w, h * 0.5],
    [w * 0.36, h * 0.82],
  ]);
  paint(c, S.tint);
};

const photo: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.paper);
  block(c, S, w * 0.1, h * 0.1, w * 0.8, h * 0.62, 0, S.tint);
  c.save();
  c.fillStyle = S.shade;
  c.beginPath();
  c.arc(w * 0.5, h * 0.36, Math.min(w, h) * 0.1, 0, TAU);
  c.fill();
  c.fillRect(w * 0.38, h * 0.48, w * 0.24, h * 0.24);
  c.restore();
};

const phone: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, Math.min(w, h) * 0.18, S.ink);
  c.save();
  c.fillStyle = S.screen;
  rrect(c, w * 0.12, h * 0.1, w * 0.76, h * 0.74, 0.04);
  c.fill();
  c.restore();
};

const pills: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.18, h * 0.22, w * 0.64, h * 0.74, 0.08, S.wood);
  block(c, S, w * 0.24, 0, w * 0.52, h * 0.24, 0.04, S.paper);
  block(c, S, w * 0.18, h * 0.45, w * 0.64, h * 0.26, 0, S.paper);
};

const idol: FurnDraw = (c, S, w, h) => {
  poly(
    c,
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * TAU + Math.PI / 8;
      return [w / 2 + Math.cos(a) * w * 0.48, h / 2 + Math.sin(a) * h * 0.48] as [number, number];
    }),
  );
  paint(c, S.tint);
  c.save();
  c.strokeStyle = S.occult;
  lw(c, S, 1.1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.6;
    c.beginPath();
    c.moveTo(w / 2, h / 2);
    c.quadraticCurveTo(
      w / 2 + Math.cos(a + 0.6) * w * 0.3,
      h / 2 + Math.sin(a + 0.6) * h * 0.3,
      w / 2 + Math.cos(a) * w * 0.4,
      h / 2 + Math.sin(a) * h * 0.4,
    );
    c.stroke();
  }
  c.restore();
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.18, S.occultTint);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.06, S.occult, false);
};

const dangerMark: FurnDraw = (c, S, w, h) => {
  poly(c, [
    [w / 2, h * 0.06],
    [w * 0.96, h * 0.92],
    [w * 0.04, h * 0.92],
  ]);
  paint(c, S.gold);
  word(c, S, '！', w / 2, h * 0.62, Math.min(w, h) * 0.5, '#1d1d1d');
};

const blood: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 97 + h * 31) + 7);
  c.save();
  c.fillStyle = S.blood;
  blob(c, w * 0.48, h * 0.5, w * 0.36, h * 0.32, 11, 0.45, rnd);
  c.fill();
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU;
    const d = 0.45 + rnd() * 0.45;
    c.beginPath();
    c.arc(
      w / 2 + Math.cos(a) * w * d * 0.5,
      h / 2 + Math.sin(a) * h * d * 0.5,
      0.04 + rnd() * 0.08,
      0,
      TAU,
    );
    c.fill();
  }
  c.restore();
};

const bodyOutline: FurnDraw = (c, S, w, h) => {
  const u = (x: number, y: number): [number, number] => [x * w, y * h];
  c.save();
  c.strokeStyle = S.chalk;
  lw(c, S, 1.3);
  c.setLineDash([S.lw * 4, S.lw * 2]);
  c.beginPath();
  c.arc(w * 0.5, h * 0.1, Math.min(w * 0.17, h * 0.08), 0, TAU);
  c.stroke();
  poly(c, [
    u(0.42, 0.2),
    u(0.16, 0.3),
    u(0.04, 0.48),
    u(0.12, 0.5),
    u(0.24, 0.37),
    u(0.33, 0.36),
    u(0.31, 0.58),
    u(0.2, 0.96),
    u(0.32, 0.97),
    u(0.48, 0.64),
    u(0.6, 0.97),
    u(0.72, 0.95),
    u(0.66, 0.58),
    u(0.67, 0.36),
    u(0.82, 0.24),
    u(0.94, 0.12),
    u(0.86, 0.08),
    u(0.7, 0.2),
  ]);
  c.stroke();
  c.restore();
};

const footprints: FurnDraw = (c, S, w, h) => {
  const n = Math.max(2, Math.round(h / 0.75));
  c.save();
  c.fillStyle = S.shade;
  for (let i = 0; i < n; i++) {
    const x = i % 2 ? w * 0.68 : w * 0.32;
    const y = h - (h / n) * (i + 0.5);
    c.beginPath();
    c.ellipse(x, y + 0.08, w * 0.14, (h / n) * 0.28, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(x, y - (h / n) * 0.28, w * 0.11, (h / n) * 0.13, 0, 0, TAU);
    c.fill();
  }
  c.restore();
};

const debris: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 13 + h * 71) + 3);
  for (let i = 0; i < 9; i++) {
    const x = w * (0.15 + rnd() * 0.7);
    const y = h * (0.15 + rnd() * 0.7);
    const r = Math.min(w, h) * (0.1 + rnd() * 0.16);
    blob(c, x, y, r, r * (0.6 + rnd() * 0.4), 5 + Math.floor(rnd() * 2), 0.4, rnd, false);
    paint(c, i % 3 ? S.tint : S.shade);
  }
};

const brokenGlass: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 41 + h * 17) + 11);
  c.save();
  lw(c, S, 0.6);
  for (let i = 0; i < 10; i++) {
    const x = w * (0.1 + rnd() * 0.8);
    const y = h * (0.1 + rnd() * 0.8);
    const s = Math.min(w, h) * (0.06 + rnd() * 0.12);
    const a = rnd() * TAU;
    poly(c, [
      [x + Math.cos(a) * s, y + Math.sin(a) * s],
      [x + Math.cos(a + 2.3) * s * 0.7, y + Math.sin(a + 2.3) * s * 0.7],
      [x + Math.cos(a + 4.1) * s * 0.9, y + Math.sin(a + 4.1) * s * 0.9],
    ]);
    paint(c, S.water);
  }
  c.restore();
};

const magicCircle: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 0.08;
  c.save();
  c.strokeStyle = S.occult;
  lw(c, S, 1.3);
  disc(c, S, cx, cy, R, S.occultTint);
  disc(c, S, cx, cy, R * 0.86, null);
  const star = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * TAU) / 5;
    return [cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86] as [number, number];
  });
  poly(c, star);
  c.stroke();
  lw(c, S, 0.6);
  c.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    c.moveTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88);
    c.lineTo(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98);
  }
  c.stroke();
  disc(c, S, cx, cy, R * 0.28, null);
  c.restore();
};

const altar: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.tint);
  block(c, S, w * 0.4, 0, w * 0.2, h, 0, S.occult);
  disc(c, S, w * 0.15, h * 0.35, 0.12, S.fire);
  disc(c, S, w * 0.85, h * 0.35, 0.12, S.fire);
  disc(c, S, w / 2, h * 0.55, Math.min(0.25, h * 0.18), S.gold);
};

const candle: FurnDraw = (c, S, w, h) => {
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.42, S.gold);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.18, S.paper);
  c.save();
  c.fillStyle = S.fire;
  c.beginPath();
  c.ellipse(
    w / 2,
    h / 2 - Math.min(w, h) * 0.04,
    Math.min(w, h) * 0.07,
    Math.min(w, h) * 0.13,
    0,
    0,
    TAU,
  );
  c.fill();
  c.restore();
};

const cage: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, null);
  lw(c, S, 0.8);
  c.beginPath();
  for (let x = 0.3; x < w - 0.1; x += 0.3) {
    c.moveTo(x, 0);
    c.lineTo(x, h);
  }
  c.stroke();
  lw(c, S, 1.6);
  rrect(c, 0, 0, w, h, 0.03);
  c.stroke();
  lw(c, S);
};

const coffin: FurnDraw = (c, S, w, h) => {
  poly(c, [
    [w * 0.3, 0],
    [w * 0.7, 0],
    [w, h * 0.25],
    [w * 0.78, h],
    [w * 0.22, h],
    [0, h * 0.25],
  ]);
  paint(c, S.wood);
  lw(c, S, 0.8);
  seg(c, w / 2, h * 0.2, w / 2, h * 0.58);
  seg(c, w * 0.36, h * 0.32, w * 0.64, h * 0.32);
  lw(c, S);
};

const crate: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.wood);
  lw(c, S, 0.6);
  rrect(c, 0.14, 0.14, w - 0.28, h - 0.28);
  c.stroke();
  seg(c, 0.14, 0.14, w - 0.14, h - 0.14);
  lw(c, S);
};

const barrel: FurnDraw = (c, S, w, h) => {
  disc(c, S, w / 2, h / 2, Math.min(w, h) / 2 - 0.03, S.wood);
  lw(c, S, 0.6);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.36, null);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.08, S.ink, false);
  lw(c, S);
};

const safe: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.shade);
  block(c, S, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 0.04, S.tint);
  disc(c, S, w * 0.45, h * 0.5, Math.min(w, h) * 0.2, S.paper);
  lw(c, S, 1.2);
  seg(c, w * 0.72, h * 0.38, w * 0.72, h * 0.62);
  lw(c, S);
};

const tape: FurnDraw = (c, S, w, h) => {
  c.save();
  rrect(c, 0, 0, w, h);
  c.fillStyle = S.gold;
  c.fill();
  c.clip();
  c.fillStyle = '#1d1d1d';
  for (let x = -h; x < w; x += h * 1.6) {
    poly(c, [
      [x, h],
      [x + h * 0.6, h],
      [x + h * 1.4, 0],
      [x + h * 0.8, 0],
    ]);
    c.fill();
  }
  c.restore();
};

/* ---------- 戶外 ---------- */

const car: FurnDraw = (c, S, w, h) => {
  c.save();
  c.fillStyle = S.ink;
  for (const [x, y] of [
    [0.02, h * 0.18],
    [w - 0.32, h * 0.18],
    [0.02, h * 0.7],
    [w - 0.32, h * 0.7],
  ] as const) {
    rrect(c, x, y, 0.3, h * 0.13, 0.08);
    c.fill();
  }
  c.restore();
  block(c, S, 0.15, 0, w - 0.3, h, Math.min(w, h) * 0.22, S.tint);
  poly(c, [
    [w * 0.2, h * 0.3],
    [w * 0.8, h * 0.3],
    [w * 0.74, h * 0.4],
    [w * 0.26, h * 0.4],
  ]);
  paint(c, S.water);
  block(c, S, w * 0.26, h * 0.4, w * 0.48, h * 0.32, 0.1, S.paper);
  poly(c, [
    [w * 0.26, h * 0.72],
    [w * 0.74, h * 0.72],
    [w * 0.78, h * 0.8],
    [w * 0.22, h * 0.8],
  ]);
  paint(c, S.water);
  lw(c, S, 0.5);
  seg(c, w * 0.25, h * 0.06, w * 0.75, h * 0.06);
  lw(c, S);
};

const tree: FurnDraw = (c, S, w, h) => {
  c.save();
  c.strokeStyle = S.leafInk;
  scallop(c, w / 2, h / 2, Math.min(w, h) / 2 - 0.04, 9);
  paint(c, S.leaf);
  lw(c, S, 0.5);
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    c.moveTo(w / 2, h / 2);
    c.lineTo(
      w / 2 + Math.cos(a) * Math.min(w, h) * 0.3,
      h / 2 + Math.sin(a) * Math.min(w, h) * 0.3,
    );
  }
  c.stroke();
  c.restore();
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.08, S.wood);
};

const bush: FurnDraw = (c, S, w, h) => {
  c.save();
  c.strokeStyle = S.leafInk;
  scallop(c, w / 2, h / 2, Math.min(w, h) / 2 - 0.05, 7);
  paint(c, S.leaf);
  scallop(c, w / 2, h / 2, Math.min(w, h) * 0.24, 5);
  c.stroke();
  c.restore();
};

const gardenBench: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.25, 0.04, S.wood);
  block(c, S, 0.25, h * 0.3, w - 0.5, h * 0.66, 0.04, S.wood);
  lw(c, S, 0.4);
  hatchRows(c, 0.25, w - 0.25, h * 0.3, h * 0.96, (h * 0.66) / 3);
  lw(c, S, 1.4);
  seg(c, 0.12, h * 0.25, 0.12, h * 0.95);
  seg(c, w - 0.12, h * 0.25, w - 0.12, h * 0.95);
  lw(c, S);
};

/* ---------- 1920 年代・和風 ---------- */

const barberChair: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.3, 0, w * 0.4, h * 0.14, 0.06, S.tint);
  chairTop(c, S, 0.05, h * 0.12, w - 0.1, h * 0.62);
  block(c, S, w * 0.25, h * 0.78, w * 0.5, h * 0.2, 0.05, S.shade);
};

const gramophone: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.05, h * 0.35, w * 0.6, h * 0.6, 0.04, S.wood);
  disc(c, S, w * 0.35, h * 0.65, Math.min(w, h) * 0.22, S.ink);
  c.beginPath();
  c.moveTo(w * 0.42, h * 0.5);
  c.lineTo(w * 0.62, h * 0.32);
  c.stroke();
  oval(c, S, w * 0.72, h * 0.28, w * 0.26, h * 0.24, S.gold);
  disc(c, S, w * 0.72, h * 0.28, Math.min(w, h) * 0.07, S.ink, false);
};

const irori: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.wood);
  block(c, S, w * 0.16, h * 0.16, w * 0.68, h * 0.68, 0, S.tint);
  c.save();
  c.fillStyle = S.fire;
  for (const [dx, dy] of [
    [-0.12, 0.05],
    [0.1, -0.06],
    [0.02, 0.14],
  ] as const) {
    c.beginPath();
    c.arc(w / 2 + dx * w, h / 2 + dy * h, Math.min(w, h) * 0.06, 0, TAU);
    c.fill();
  }
  c.restore();
  disc(c, S, w / 2, h / 2 - h * 0.08, Math.min(w, h) * 0.13, S.shade);
};

const kamado: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.25, S.wood);
  for (const x of [w * 0.28, w * 0.72]) {
    disc(c, S, x, h * 0.45, Math.min(w * 0.18, h * 0.32), S.ink);
    disc(c, S, x, h * 0.45, Math.min(w * 0.13, h * 0.24), S.shade);
  }
  c.save();
  c.fillStyle = S.fire;
  c.fillRect(w * 0.18, h * 0.86, w * 0.2, h * 0.1);
  c.fillRect(w * 0.62, h * 0.86, w * 0.2, h * 0.1);
  c.restore();
};

const butsudan: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.12, 0, w * 0.76, h * 0.72, 0.03, S.shade);
  block(c, S, w * 0.25, h * 0.12, w * 0.5, h * 0.45, 0.02, S.gold);
  lw(c, S, 1.1);
  seg(c, w * 0.12, h * 0.72, 0, h * 0.98);
  seg(c, w * 0.88, h * 0.72, w, h * 0.98);
  lw(c, S);
};

const tokonoma: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.wood);
  block(c, S, w * 0.32, 0.04, w * 0.36, h * 0.18, 0, S.paper);
  disc(c, S, w * 0.78, h * 0.55, Math.min(w, h) * 0.16, S.tint);
  c.save();
  c.strokeStyle = S.leafInk;
  lw(c, S, 0.8);
  seg(c, w * 0.78, h * 0.55, w * 0.72, h * 0.3);
  seg(c, w * 0.78, h * 0.55, w * 0.86, h * 0.34);
  c.restore();
};

const well: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  disc(c, S, w / 2, h / 2, R, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.66, S.water);
  lw(c, S, 1.6);
  seg(c, w / 2 - R, h / 2, w / 2 + R, h / 2);
  lw(c, S);
  disc(c, S, w / 2, h / 2, R * 0.16, S.wood);
};

const torii: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.18, w, h * 0.34, h * 0.12, S.alert);
  block(c, S, w * 0.08, h * 0.6, w * 0.84, h * 0.16, 0, S.alert);
  for (const x of [w * 0.2, w * 0.8]) disc(c, S, x, h * 0.62, Math.min(h * 0.3, w * 0.06), S.alert);
};

const komainu: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.tint);
  c.save();
  scallop(c, w / 2, h * 0.42, Math.min(w, h) * 0.26, 8);
  paint(c, S.paper);
  c.restore();
  oval(c, S, w / 2, h * 0.7, w * 0.22, h * 0.16, S.paper);
  disc(c, S, w * 0.42, h * 0.4, 0.04, S.ink, false);
  disc(c, S, w * 0.58, h * 0.4, 0.04, S.ink, false);
};

const lantern: FurnDraw = (c, S, w, h) => {
  poly(c, [
    [w * 0.5, h * 0.02],
    [w * 0.98, h * 0.5],
    [w * 0.5, h * 0.98],
    [w * 0.02, h * 0.5],
  ]);
  paint(c, S.tint);
  block(c, S, w * 0.25, h * 0.25, w * 0.5, h * 0.5, 0, S.paper);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.12, S.gold);
};

const temizuya: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.wood);
  lw(c, S, 0.5);
  seg(c, 0, h / 2, w, h / 2);
  lw(c, S);
  block(c, S, w * 0.2, h * 0.3, w * 0.6, h * 0.4, 0.04, S.water);
  for (const x of [w * 0.35, w * 0.5, w * 0.65]) {
    disc(c, S, x, h * 0.4, 0.08, S.paper);
    seg(c, x, h * 0.4, x, h * 0.62);
  }
};

const hokora: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.wood);
  lw(c, S, 0.6);
  seg(c, w / 2, 0, w / 2, h * 0.7);
  seg(c, 0, 0, w / 2, h * 0.35);
  seg(c, w, 0, w / 2, h * 0.35);
  lw(c, S);
  block(c, S, w * 0.3, h * 0.72, w * 0.4, h * 0.22, 0.02, S.paper);
};

const saisen: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.wood);
  lw(c, S, 0.6);
  c.beginPath();
  for (let x = 0.2; x < w - 0.1; x += 0.25) {
    c.moveTo(x, 0.12);
    c.lineTo(x + 0.1, h - 0.12);
  }
  c.stroke();
  lw(c, S);
};

/* ---------- 科幻 ---------- */

const consoleDesk: FurnDraw = (c, S, w, h) => {
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(w, 0);
  c.lineTo(w, h * 0.55);
  c.quadraticCurveTo(w / 2, h * 1.1, 0, h * 0.55);
  c.closePath();
  paint(c, S.tint);
  c.save();
  c.fillStyle = S.screen;
  for (let i = 0; i < 3; i++) {
    rrect(c, w * (0.1 + i * 0.29), h * 0.1, w * 0.22, h * 0.24, 0.03);
    c.fill();
  }
  c.restore();
  for (let i = 0; i < 6; i++)
    disc(c, S, w * (0.2 + i * 0.12), h * 0.52, 0.06, i % 2 ? S.leaf : S.gold);
};

const pilotSeat: FurnDraw = (c, S, w, h) => {
  chairTop(c, S, w * 0.12, 0, w * 0.76, h * 0.85);
  block(c, S, 0, h * 0.35, w * 0.14, h * 0.45, 0.05, S.shade);
  block(c, S, w * 0.86, h * 0.35, w * 0.14, h * 0.45, 0.05, S.shade);
  disc(c, S, w * 0.07, h * 0.88, 0.08, S.ink, false);
  disc(c, S, w * 0.93, h * 0.88, 0.08, S.ink, false);
};

const cryopod: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, w / 2, S.tint);
  block(c, S, w * 0.15, h * 0.08, w * 0.7, h * 0.72, w * 0.35, S.water);
  c.save();
  c.strokeStyle = S.paper;
  lw(c, S, 0.6);
  for (let i = 0; i < 4; i++)
    seg(c, w * 0.3, h * (0.22 + i * 0.12), w * 0.52, h * (0.18 + i * 0.12));
  c.restore();
  block(c, S, w * 0.28, h * 0.84, w * 0.44, h * 0.1, 0.03, S.screen);
};

const reactor: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.05;
  disc(c, S, w / 2, h / 2, R, S.tint);
  lw(c, S, 0.6);
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    c.moveTo(w / 2 + Math.cos(a) * R * 0.45, h / 2 + Math.sin(a) * R * 0.45);
    c.lineTo(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R);
  }
  c.stroke();
  lw(c, S);
  disc(c, S, w / 2, h / 2, R * 0.72, null);
  disc(c, S, w / 2, h / 2, R * 0.42, S.gold);
  disc(c, S, w / 2, h / 2, R * 0.22, S.fire);
};

const holoTable: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.05;
  disc(c, S, w / 2, h / 2, R, S.tint);
  c.save();
  c.strokeStyle = S.screen;
  c.setLineDash([S.lw * 3, S.lw * 2]);
  lw(c, S, 1);
  disc(c, S, w / 2, h / 2, R * 0.7, null);
  disc(c, S, w / 2, h / 2, R * 0.45, null);
  c.restore();
  disc(c, S, w / 2, h / 2, R * 0.14, S.screen);
};

const hatch: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  disc(c, S, w / 2, h / 2, R, S.shade);
  disc(c, S, w / 2, h / 2, R * 0.8, S.tint);
  lw(c, S, 1.4);
  disc(c, S, w / 2, h / 2, R * 0.38, null);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    seg(c, w / 2, h / 2, w / 2 + Math.cos(a) * R * 0.38, h / 2 + Math.sin(a) * R * 0.38);
  }
  lw(c, S);
};

/* ---------- 自然・露營 ---------- */

const rock: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 53 + h * 19) + 5);
  blob(c, w / 2, h / 2, w * 0.47, h * 0.45, 8, 0.28, rnd, false);
  paint(c, S.tint);
  lw(c, S, 0.5);
  seg(c, w * 0.35, h * 0.3, w * 0.5, h * 0.55);
  seg(c, w * 0.5, h * 0.55, w * 0.68, h * 0.5);
  lw(c, S);
};

const tent: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.1, 0.1, w - 0.2, h - 0.2, 0.08, S.cloth);
  lw(c, S, 0.7);
  seg(c, w / 2, 0.1, w / 2, h - 0.1);
  seg(c, 0.1, 0.1, w / 2, h * 0.5);
  seg(c, w - 0.1, 0.1, w / 2, h * 0.5);
  lw(c, S);
  poly(c, [
    [w * 0.3, h - 0.1],
    [w / 2, h * 0.68],
    [w * 0.7, h - 0.1],
  ]);
  paint(c, S.tint);
};

const campfire: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.08;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    disc(c, S, w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R, 0.12, S.tint);
  }
  lw(c, S, 2);
  c.save();
  c.strokeStyle = S.wood;
  seg(c, w * 0.3, h * 0.3, w * 0.7, h * 0.7);
  seg(c, w * 0.7, h * 0.3, w * 0.3, h * 0.7);
  c.restore();
  lw(c, S);
  c.save();
  c.fillStyle = S.fire;
  c.beginPath();
  c.ellipse(w / 2, h / 2, R * 0.35, R * 0.45, 0, 0, TAU);
  c.fill();
  c.restore();
};

const picnicTable: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.2, 0.04, S.wood);
  block(c, S, 0, h * 0.8, w, h * 0.2, 0.04, S.wood);
  block(c, S, 0.1, h * 0.28, w - 0.2, h * 0.44, 0.04, S.wood);
  lw(c, S, 0.4);
  hatchRows(c, 0.1, w - 0.1, h * 0.28, h * 0.72, (h * 0.44) / 3);
  lw(c, S);
};

const logSeat: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, h / 2, S.wood);
  lw(c, S, 0.5);
  oval(c, S, h / 2, h / 2, h * 0.3, h * 0.36, null);
  seg(c, h, h * 0.35, w - h, h * 0.35);
  seg(c, h * 1.4, h * 0.65, w - h * 1.2, h * 0.65);
  lw(c, S);
};

const bones: FurnDraw = (c, S, w, h) => {
  const bone = (x1: number, y1: number, x2: number, y2: number) => {
    lw(c, S, 2.2);
    c.save();
    c.strokeStyle = S.ink;
    seg(c, x1, y1, x2, y2);
    c.strokeStyle = S.paper;
    lw(c, S, 1.2);
    seg(c, x1, y1, x2, y2);
    c.restore();
    lw(c, S);
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ] as const)
      disc(c, S, x, y, 0.08, S.paper);
  };
  bone(w * 0.15, h * 0.75, w * 0.85, h * 0.4);
  bone(w * 0.2, h * 0.35, w * 0.75, h * 0.85);
  oval(c, S, w * 0.5, h * 0.3, w * 0.18, h * 0.22, S.paper);
  disc(c, S, w * 0.45, h * 0.3, 0.05, S.ink, false);
  disc(c, S, w * 0.55, h * 0.3, 0.05, S.ink, false);
};

const pit: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 29 + h * 61) + 9);
  blob(c, w / 2, h / 2, w * 0.47, h * 0.47, 10, 0.18, rnd);
  paint(c, S.shade);
  blob(c, w / 2, h / 2, w * 0.3, h * 0.3, 8, 0.2, rnd);
  paint(c, S.ink, false);
};

const boat: FurnDraw = (c, S, w, h) => {
  c.beginPath();
  c.moveTo(w / 2, 0);
  c.quadraticCurveTo(w, h * 0.2, w * 0.92, h * 0.85);
  c.lineTo(w * 0.08, h * 0.85);
  c.quadraticCurveTo(0, h * 0.2, w / 2, 0);
  c.closePath();
  paint(c, S.wood);
  lw(c, S, 0.6);
  for (const y of [0.35, 0.6]) seg(c, w * 0.12, h * y, w * 0.88, h * y);
  lw(c, S, 1.2);
  seg(c, -0.05, h * 0.45, w * 0.25, h * 0.5);
  seg(c, w + 0.05, h * 0.45, w * 0.75, h * 0.5);
  lw(c, S);
};

export const STORY: Record<string, FurnDraw> = {
  evidence,
  clue: clueMark,
  memo,
  diary,
  key: keyItem,
  knife,
  photo,
  phone,
  pills,
  idol,
  danger: dangerMark,
  blood,
  body: bodyOutline,
  footprints,
  debris,
  glass: brokenGlass,
  magic_circle: magicCircle,
  altar,
  candle,
  cage,
  coffin,
  crate,
  barrel,
  safe,
  tape,
  car,
  tree,
  bush,
  garden_bench: gardenBench,
  barber_chair: barberChair,
  gramophone,
  irori,
  kamado,
  butsudan,
  tokonoma,
  well,
  torii,
  komainu,
  lantern,
  temizuya,
  hokora,
  saisen,
  console: consoleDesk,
  pilot_seat: pilotSeat,
  cryopod,
  reactor,
  holo_table: holoTable,
  hatch,
  rock,
  tent,
  campfire,
  picnic: picnicTable,
  log: logSeat,
  bones,
  pit,
  boat,
};

export { blob };
