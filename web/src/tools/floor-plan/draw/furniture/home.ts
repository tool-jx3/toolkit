/**
 * 家具畫法：樓梯・結構、客廳、臥室、廚房、衛浴。
 */
import {
  block,
  type Ctx,
  chairTop,
  disc,
  type FurnDraw,
  type FurnStyle,
  hatchRows,
  lw,
  oval,
  paint,
  poly,
  rrect,
  seg,
  sofaShape,
  TAU,
} from './kit';

/* ---------- 樓梯・結構 ---------- */

/** 上樓的箭頭：從 (x, y1) 往 (x, y2)，起點一個小橫槓 */
function upArrow(c: Ctx, S: FurnStyle, x: number, y1: number, y2: number): void {
  c.save();
  c.strokeStyle = S.chalk;
  c.fillStyle = S.chalk;
  lw(c, S, 1.1);
  seg(c, x, y1, x, y2 + 0.3);
  seg(c, x - 0.18, y1, x + 0.18, y1);
  poly(c, [
    [x, y2],
    [x - 0.22, y2 + 0.38],
    [x + 0.22, y2 + 0.38],
  ]);
  c.fill();
  c.restore();
}

const stairs: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h);
  lw(c, S, 0.6);
  const n = Math.max(2, Math.round(h / 0.55));
  hatchRows(c, 0, w, 0, h, h / n);
  lw(c, S);
  upArrow(c, S, w / 2, h - 0.35, 0.3);
};

const stairsU: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h);
  const landing = Math.min(h * 0.38, w * 0.5);
  lw(c, S, 0.6);
  seg(c, 0, landing, w, landing);
  seg(c, w / 2, landing, w / 2, h);
  const n = Math.max(2, Math.round((h - landing) / 0.55));
  hatchRows(c, 0, w, landing, h, (h - landing) / n);
  c.save();
  c.strokeStyle = S.chalk;
  c.fillStyle = S.chalk;
  lw(c, S, 1.1);
  const l = w / 4;
  const r = (w * 3) / 4;
  poly(
    c,
    [
      [l, h - 0.35],
      [l, landing / 2],
      [r, landing / 2],
      [r, h - 0.7],
    ],
    false,
  );
  c.stroke();
  poly(c, [
    [r, h - 0.35],
    [r - 0.22, h - 0.75],
    [r + 0.22, h - 0.75],
  ]);
  c.fill();
  c.restore();
};

const spiral: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 0.05;
  disc(c, S, cx, cy, R);
  lw(c, S, 0.55);
  c.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 12;
    c.moveTo(cx + Math.cos(a) * R * 0.18, cy + Math.sin(a) * R * 0.18);
    c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  c.stroke();
  lw(c, S);
  disc(c, S, cx, cy, R * 0.18, S.tint);
  c.save();
  c.strokeStyle = S.chalk;
  lw(c, S, 1.1);
  c.beginPath();
  c.arc(cx, cy, R * 0.62, Math.PI * 0.6, Math.PI * 2.1);
  c.stroke();
  const a = Math.PI * 2.1;
  const ex = cx + Math.cos(a) * R * 0.62;
  const ey = cy + Math.sin(a) * R * 0.62;
  c.fillStyle = S.chalk;
  poly(c, [
    [ex + 0.05, ey + 0.32],
    [ex - 0.25, ey - 0.05],
    [ex + 0.28, ey - 0.12],
  ]);
  c.fill();
  c.restore();
};

const elevator: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.tint);
  block(c, S, 0.3, 0.3, w - 0.6, h - 0.75);
  lw(c, S, 0.6);
  seg(c, 0.3, 0.3, w - 0.3, h - 0.45);
  seg(c, w - 0.3, 0.3, 0.3, h - 0.45);
  lw(c, S, 1.6);
  seg(c, w * 0.25, h - 0.18, w * 0.75, h - 0.18);
  lw(c, S);
};

const pillar: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.shade);
  c.save();
  rrect(c, 0, 0, w, h);
  c.clip();
  lw(c, S, 0.5);
  c.beginPath();
  for (let d = -h; d < w; d += 0.25) {
    c.moveTo(d, h);
    c.lineTo(d + h, 0);
  }
  c.stroke();
  c.restore();
};

const fireplace: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.55, 0, S.shade);
  block(c, S, w * 0.22, h * 0.18, w * 0.56, h * 0.5, 0.06, S.tint);
  c.save();
  c.fillStyle = S.fire;
  poly(c, [
    [w * 0.36, h * 0.6],
    [w * 0.44, h * 0.3],
    [w * 0.5, h * 0.46],
    [w * 0.56, h * 0.26],
    [w * 0.64, h * 0.6],
  ]);
  c.fill();
  c.restore();
  block(c, S, w * 0.08, h * 0.68, w * 0.84, h * 0.3, 0.05, S.tint);
};

/* ---------- 客廳 ---------- */

const sofa =
  (n: number): FurnDraw =>
  (c, S, w, h) =>
    sofaShape(c, S, w, h, n);

const sofaL: FurnDraw = (c, S, w, h) => {
  const d = Math.min(1.8, h * 0.45, w * 0.36);
  const back = d * 0.3;
  poly(c, [
    [0, 0],
    [w, 0],
    [w, d],
    [d, d],
    [d, h],
    [0, h],
  ]);
  paint(c, S.tint);
  lw(c, S, 0.7);
  const seatW = (w - d - 0.3) / 2;
  for (let i = 0; i < 2; i++)
    block(c, S, d + seatW * i + 0.03, back, seatW - 0.06, d - back - 0.06, 0.12);
  block(c, S, back, back, d - back - 0.03, d - back - 0.06, 0.12);
  block(c, S, back, d + 0.03, d - back - 0.06, h - d - 0.12, 0.12);
  lw(c, S);
};

const lowtable: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.18, S.wood);
  lw(c, S, 0.5);
  rrect(c, 0.16, 0.16, w - 0.32, h - 0.32, 0.1);
  c.stroke();
  lw(c, S);
};

/** 長桌＋上下兩排椅子（每排 n 張） */
const dining =
  (n: number): FurnDraw =>
  (c, S, w, h) => {
    const cd = Math.min(0.95, h * 0.28);
    const tableY = cd * 0.78;
    const tableH = h - tableY * 2;
    const cw = Math.min(0.95, (w - 0.4) / n - 0.1);
    for (let i = 0; i < n; i++) {
      const x = 0.2 + ((w - 0.4) / n) * (i + 0.5) - cw / 2;
      chairTop(c, S, x, 0, cw, cd);
      c.save();
      c.translate(x + cw / 2, h - cd / 2);
      c.rotate(Math.PI);
      chairTop(c, S, -cw / 2, -cd / 2, cw, cd);
      c.restore();
    }
    block(c, S, 0, tableY, w, tableH, 0.1, S.wood);
  };

const roundDining: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.3;
  const cs = Math.min(w, h) * 0.27;
  for (let i = 0; i < 4; i++) {
    c.save();
    c.translate(cx, cy);
    c.rotate((i * Math.PI) / 2);
    chairTop(c, S, -cs / 2, -Math.min(w, h) / 2, cs, cs);
    c.restore();
  }
  disc(c, S, cx, cy, R, S.wood);
};

const table: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.08, S.wood);
  lw(c, S, 0.5);
  seg(c, 0.2, 0.2, w - 0.2, 0.2);
  lw(c, S);
};

const tableRound: FurnDraw = (c, S, w, h) => {
  oval(c, S, w / 2, h / 2, w / 2 - 0.02, h / 2 - 0.02, S.wood);
  lw(c, S, 0.5);
  oval(c, S, w / 2, h / 2, w / 2 - 0.22, h / 2 - 0.22, null);
  lw(c, S);
};

const chair: FurnDraw = (c, S, w, h) => chairTop(c, S, 0, 0, w, h);

const tv: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.3, w, h * 0.7, 0.05, S.wood);
  c.save();
  c.fillStyle = S.ink;
  rrect(c, w * 0.12, h * 0.1, w * 0.76, h * 0.2, 0.04);
  c.fill();
  c.restore();
  lw(c, S, 0.5);
  seg(c, w / 2, h * 0.3, w / 2, h);
  lw(c, S);
};

const bookshelf: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.wood);
  const n = Math.max(3, Math.round(w / 0.24));
  c.save();
  lw(c, S, 0.45);
  for (let i = 0; i < n; i++) {
    const x = 0.12 + ((w - 0.24) / n) * i;
    const bw = ((w - 0.24) / n) * 0.82;
    const bh = h * (0.45 + ((i * 37) % 5) * 0.07);
    rrect(c, x, h - 0.08 - bh, bw, bh, 0.02);
    paint(c, i % 3 === 0 ? S.tint : S.paper);
  }
  c.restore();
};

const cabinet: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04);
  const doors = Math.max(1, Math.round(w / 1.1));
  lw(c, S, 0.6);
  for (let i = 1; i < doors; i++) seg(c, (w / doors) * i, 0.15, (w / doors) * i, h);
  lw(c, S);
  for (let i = 0; i < doors; i++) disc(c, S, (w / doors) * (i + 0.5), h - 0.18, 0.06, S.ink, false);
};

const cupboard: FurnDraw = (c, S, w, h) => {
  cabinet(c, S, w, h, {});
  lw(c, S, 0.4);
  const doors = Math.max(1, Math.round(w / 1.1));
  for (let i = 0; i < doors; i++) {
    const x = (w / doors) * i;
    seg(c, x + 0.15, h - 0.3, x + w / doors - 0.15, 0.15);
  }
  lw(c, S);
};

const rug: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.12, 0, w - 0.24, h, 0.1, S.cloth);
  c.save();
  c.setLineDash([S.lw * 2, S.lw * 2]);
  lw(c, S, 0.5);
  rrect(c, 0.35, 0.25, w - 0.7, h - 0.5, 0.08);
  c.stroke();
  c.restore();
  lw(c, S, 0.4);
  c.beginPath();
  for (let y = 0.15; y < h; y += 0.22) {
    c.moveTo(0, y);
    c.lineTo(0.12, y);
    c.moveTo(w - 0.12, y);
    c.lineTo(w, y);
  }
  c.stroke();
  lw(c, S);
};

const plant: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2;
  c.save();
  c.strokeStyle = S.leafInk;
  for (let i = 0; i < 7; i++) {
    const a = (i * TAU) / 7 + 0.3;
    c.save();
    c.translate(cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45);
    c.rotate(a);
    oval(c, S, 0, 0, R * 0.5, R * 0.22, S.leaf);
    c.restore();
  }
  c.restore();
  disc(c, S, cx, cy, R * 0.32, S.wood);
};

const lamp: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.03;
  disc(c, S, w / 2, h / 2, R, S.gold);
  disc(c, S, w / 2, h / 2, R * 0.35, S.paper);
  lw(c, S, 0.5);
  seg(c, w / 2 - R, h / 2, w / 2 + R, h / 2);
  seg(c, w / 2, h / 2 - R, w / 2, h / 2 + R);
  lw(c, S);
};

/** 鍵盤：x～x+w、y～y+h 的白鍵線＋黑鍵 */
function keys(c: Ctx, S: FurnStyle, x: number, y: number, w: number, h: number): void {
  block(c, S, x, y, w, h, 0, S.paper);
  const n = Math.max(7, Math.round(w / 0.13));
  lw(c, S, 0.35);
  c.beginPath();
  for (let i = 1; i < n; i++) {
    c.moveTo(x + (w / n) * i, y);
    c.lineTo(x + (w / n) * i, y + h);
  }
  c.stroke();
  c.save();
  c.fillStyle = S.ink;
  for (let i = 0; i < n - 1; i++) {
    if (i % 7 === 2 || i % 7 === 6) continue;
    c.fillRect(x + (w / n) * (i + 0.65), y, (w / n) * 0.7, h * 0.55);
  }
  c.restore();
  lw(c, S);
}

const pianoGrand: FurnDraw = (c, S, w, h) => {
  c.beginPath();
  c.moveTo(0, 0.7);
  c.lineTo(w, 0.7);
  c.lineTo(w, h * 0.55);
  c.bezierCurveTo(w, h * 0.95, w * 0.7, h, w * 0.55, h * 0.88);
  c.bezierCurveTo(w * 0.42, h * 0.78, w * 0.2, h * 0.72, w * 0.08, h * 0.5);
  c.lineTo(0, 0.7);
  c.closePath();
  paint(c, S.shade);
  lw(c, S, 0.5);
  c.beginPath();
  c.moveTo(w * 0.15, 0.95);
  c.lineTo(w * 0.85, h * 0.7);
  c.stroke();
  lw(c, S);
  keys(c, S, 0, 0.2, w, 0.5);
  block(c, S, w * 0.3, 0, w * 0.4, 0.2, 0.03, S.wood);
};

const pianoUpright: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.62, 0.04, S.shade);
  keys(c, S, w * 0.05, h * 0.62, w * 0.9, h * 0.3);
};

/* ---------- 臥室 ---------- */

const bed =
  (pillows: number): FurnDraw =>
  (c, S, w, h) => {
    block(c, S, 0, 0, w, h, 0.08);
    block(c, S, 0, 0, w, 0.32, 0.05, S.wood);
    const pw = (w - 0.3) / pillows;
    lw(c, S, 0.7);
    for (let i = 0; i < pillows; i++)
      block(c, S, 0.15 + pw * i + 0.05, 0.45, pw - 0.1, 0.62, 0.18, S.paper);
    lw(c, S);
    block(c, S, 0.06, h * 0.36, w - 0.12, h * 0.64 - 0.06, 0.08, S.tint);
    lw(c, S, 0.5);
    seg(c, 0.06, h * 0.44, w - 0.06, h * 0.44);
    seg(c, w * 0.62, h * 0.44, w - 0.06, h * 0.62);
    lw(c, S);
  };

const futon: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.05, 0.05, w - 0.1, h - 0.1, 0.2);
  block(c, S, w * 0.22, 0.25, w * 0.56, 0.5, 0.2, S.paper);
  block(c, S, 0.1, h * 0.3, w - 0.2, h * 0.7 - 0.15, 0.2, S.cloth);
  c.save();
  rrect(c, 0.1, h * 0.3, w - 0.2, h * 0.7 - 0.15, 0.2);
  c.clip();
  lw(c, S, 0.4);
  c.beginPath();
  for (let d = -w; d < h; d += 0.5) {
    c.moveTo(0, h * 0.3 + d);
    c.lineTo(w, h * 0.3 + d + w);
    c.moveTo(w, h * 0.3 + d);
    c.lineTo(0, h * 0.3 + d + w);
  }
  c.stroke();
  c.restore();
};

const wardrobe: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.wood);
  lw(c, S, 0.6);
  seg(c, w / 2, 0, w / 2, h);
  c.save();
  c.setLineDash([S.lw * 2, S.lw * 2]);
  seg(c, 0.15, h * 0.45, w - 0.15, h * 0.45);
  c.restore();
  lw(c, S);
  disc(c, S, w / 2 - 0.12, h - 0.15, 0.05, S.ink, false);
  disc(c, S, w / 2 + 0.12, h - 0.15, 0.05, S.ink, false);
};

const dresser: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.wood);
  const n = Math.max(2, Math.round(w / 0.7));
  lw(c, S, 0.5);
  for (let i = 1; i < n; i++) seg(c, (w / n) * i, 0.1, (w / n) * i, h);
  lw(c, S, 1.2);
  for (let i = 0; i < n; i++)
    seg(c, (w / n) * (i + 0.5) - 0.12, h - 0.15, (w / n) * (i + 0.5) + 0.12, h - 0.15);
  lw(c, S);
};

const nightstand: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.26, S.gold);
};

const desk: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  lw(c, S, 0.5);
  block(c, S, w * 0.3, h * 0.12, w * 0.4, h * 0.3, 0.03, S.tint);
  seg(c, w * 0.72, h * 0.6, w * 0.88, h * 0.6);
  lw(c, S);
};

const deskSet: FurnDraw = (c, S, w, h) => {
  desk(c, S, w, h * 0.5, {});
  chairTop(c, S, w * 0.32, h * 0.52, w * 0.36, h * 0.42);
};

/* ---------- 廚房 ---------- */

function basin(c: Ctx, S: FurnStyle, x: number, y: number, w: number, h: number): void {
  block(c, S, x, y, w, h, 0.12, S.water);
  disc(c, S, x + w / 2, y + h * 0.6, 0.06, S.ink, false);
  lw(c, S, 1.3);
  seg(c, x + w / 2, y - 0.08, x + w / 2, y + 0.12);
  lw(c, S);
}

function burners(c: Ctx, S: FurnStyle, x: number, y: number, w: number, h: number, n: 2 | 4): void {
  const cols = 2;
  const rows = n === 4 ? 2 : 1;
  const r = Math.min(w / cols, h / rows) * 0.3;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const cx = x + (w / cols) * (i + 0.5);
      const cy = y + (h / rows) * (j + 0.5);
      disc(c, S, cx, cy, r, S.tint);
      disc(c, S, cx, cy, r * 0.4, null);
    }
}

const kitchenCounter: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02);
  lw(c, S, 0.5);
  seg(c, 0, h - 0.12, w, h - 0.12);
  lw(c, S);
  basin(c, S, w * 0.12, h * 0.2, Math.min(1.4, w * 0.28), h * 0.55);
  burners(c, S, w * 0.62, h * 0.12, Math.min(1.6, w * 0.32), h * 0.7, 2);
};

const sinkItem: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02);
  basin(c, S, w * 0.18, h * 0.2, w * 0.64, h * 0.58);
};

const stove: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02);
  burners(c, S, 0.1, 0.1, w - 0.2, h - 0.25, 4);
};

const fridge: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.tint);
  lw(c, S, 0.6);
  seg(c, 0.05, h - 0.25, w - 0.05, h - 0.25);
  lw(c, S, 1.6);
  seg(c, w * 0.25, h - 0.1, w * 0.45, h - 0.1);
  lw(c, S);
};

const island: FurnDraw = (c, S, w, h) => {
  const top = h * 0.62;
  block(c, S, 0, 0, w, top, 0.06);
  basin(c, S, w * 0.38, top * 0.2, Math.min(1.2, w * 0.25), top * 0.55);
  const n = Math.max(2, Math.round(w / 1.2));
  for (let i = 0; i < n; i++)
    disc(c, S, (w / n) * (i + 0.5), top + (h - top) / 2 + 0.05, (h - top) * 0.36, S.tint);
};

const counterBar: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.8, 0.02);
  block(c, S, 0, h * 0.62, w, h * 0.38, 0.04, S.wood);
};

/* ---------- 衛浴 ---------- */

const toilet: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.08, 0, w * 0.84, h * 0.3, 0.06);
  oval(c, S, w / 2, h * 0.62, w * 0.4, h * 0.34);
  oval(c, S, w / 2, h * 0.64, w * 0.24, h * 0.22, S.water);
};

const washbasin: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05);
  oval(c, S, w / 2, h * 0.55, w * 0.32, h * 0.32, S.water);
  disc(c, S, w / 2, h * 0.16, 0.07, S.ink, false);
};

const bathtub: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.2);
  block(c, S, 0.14, 0.14, w - 0.28, h - 0.28, Math.min(w, h) * 0.3, S.water);
  disc(c, S, w / 2, 0.42, 0.07, S.ink, false);
};

const unitbath: FurnDraw = (c, S, w, h) => {
  const tub = h * 0.48;
  block(c, S, 0, 0, w, tub, 0.15);
  block(c, S, 0.12, 0.12, w - 0.24, tub - 0.24, 0.3, S.water);
  block(c, S, 0, tub, w, h - tub, 0.04, S.tint);
  disc(c, S, w / 2, tub + (h - tub) / 2, 0.08, S.ink, false);
  disc(c, S, w - 0.3, h - 0.3, 0.12, null);
};

const shower: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.tint);
  lw(c, S, 0.5);
  seg(c, 0, 0, w, h);
  seg(c, w, 0, 0, h);
  lw(c, S);
  disc(c, S, w / 2, h / 2, 0.08, S.ink, false);
  disc(c, S, w / 2, 0.22, 0.14, S.paper);
};

const washer: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06);
  lw(c, S, 0.5);
  seg(c, 0, h * 0.2, w, h * 0.2);
  lw(c, S);
  disc(c, S, w / 2, h * 0.58, Math.min(w, h) * 0.3, S.water);
  disc(c, S, w / 2, h * 0.58, Math.min(w, h) * 0.14, null);
};

export const HOME: Record<string, FurnDraw> = {
  stairs,
  stairs_u: stairsU,
  spiral,
  elevator,
  pillar,
  fireplace,
  sofa2: sofa(2),
  sofa3: sofa(3),
  sofaL,
  armchair: sofa(1),
  lowtable,
  dining2: dining(1),
  dining4: dining(2),
  dining6: dining(3),
  dining_round: roundDining,
  table,
  table_round: tableRound,
  chair,
  tv,
  bookshelf,
  cabinet,
  rug,
  plant,
  lamp,
  piano: pianoGrand,
  piano_up: pianoUpright,
  bed_single: bed(1),
  bed_double: bed(2),
  futon,
  wardrobe,
  dresser,
  nightstand,
  desk,
  desk_set: deskSet,
  kitchen: kitchenCounter,
  sink: sinkItem,
  stove,
  fridge,
  island,
  counter: counterBar,
  cupboard,
  toilet,
  washbasin,
  bathtub,
  unitbath,
  shower,
  washer,
};

export { basin, burners, cabinet, desk, keys, upArrow };
