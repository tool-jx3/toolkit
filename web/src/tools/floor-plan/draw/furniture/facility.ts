/**
 * 家具畫法：辦公・設施、醫院・研究、學校・圖書館、娛樂・運動。
 */
import { basin, cabinet, desk } from './home';
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
  rrect,
  seg,
  TAU,
} from './kit';

/** 一排 n 張椅子（椅背在上）放在 x～x+w、y～y+h */
function chairRow(
  c: Ctx,
  S: FurnStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  n: number,
  flip = false,
): void {
  const cw = Math.min(0.95, w / n - 0.08);
  for (let i = 0; i < n; i++) {
    const cx = x + (w / n) * (i + 0.5);
    c.save();
    c.translate(cx, y + h / 2);
    if (flip) c.rotate(Math.PI);
    chairTop(c, S, -cw / 2, -h / 2, cw, h);
    c.restore();
  }
}

/* ---------- 辦公・設施 ---------- */

const officeDesk: FurnDraw = (c, S, w, h) => {
  desk(c, S, w, h, {});
  c.save();
  c.fillStyle = S.ink;
  rrect(c, w * 0.32, h * 0.1, w * 0.36, 0.12, 0.03);
  c.fill();
  c.restore();
  lw(c, S, 0.5);
  block(c, S, w * 0.3, h * 0.5, w * 0.4, h * 0.2, 0.03, S.paper);
  lw(c, S);
};

const meeting =
  (n: number): FurnDraw =>
  (c, S, w, h) => {
    const cd = Math.min(0.95, h * 0.26);
    chairRow(c, S, 0.3, 0, w - 0.6, cd, n);
    chairRow(c, S, 0.3, h - cd, w - 0.6, cd, n, true);
    block(c, S, 0, cd * 0.8, w, h - cd * 1.6, (h - cd * 1.6) * 0.45, S.wood);
  };

const reception: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.7, 0.04);
  block(c, S, 0, h * 0.62, w, h * 0.38, 0.06, S.wood);
  c.save();
  c.fillStyle = S.ink;
  rrect(c, w * 0.2, h * 0.12, w * 0.18, 0.1, 0.02);
  c.fill();
  rrect(c, w * 0.62, h * 0.12, w * 0.18, 0.1, 0.02);
  c.fill();
  c.restore();
};

const locker: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.tint);
  const n = Math.max(2, Math.round(w / 0.55));
  lw(c, S, 0.55);
  for (let i = 1; i < n; i++) seg(c, (w / n) * i, 0, (w / n) * i, h);
  lw(c, S, 0.4);
  for (let i = 0; i < n; i++) {
    const x = (w / n) * i;
    for (let k = 0; k < 3; k++)
      seg(c, x + 0.12, h - 0.42 + k * 0.1, x + w / n - 0.12, h - 0.42 + k * 0.1);
  }
  lw(c, S);
};

const filing: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.tint);
  lw(c, S, 1.3);
  seg(c, w * 0.3, h - 0.15, w * 0.7, h - 0.15);
  lw(c, S, 0.5);
  seg(c, 0, h - 0.3, w, h - 0.3);
  lw(c, S);
};

const whiteboard: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.6, 0.02, S.paper);
  block(c, S, w * 0.05, h * 0.6, w * 0.9, h * 0.4, 0.02, S.tint);
};

const copier: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.tint);
  block(c, S, w * 0.12, h * 0.12, w * 0.76, h * 0.5, 0.03, S.water);
  block(c, S, w * 0.22, h * 0.68, w * 0.56, h * 0.24, 0.02, S.paper);
};

const bench: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.wood);
  lw(c, S, 0.45);
  hatchRows(c, 0.05, w - 0.05, 0, h, h / 4);
  lw(c, S);
};

const vending: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.tint);
  c.save();
  c.fillStyle = S.screen;
  rrect(c, w * 0.08, h - 0.32, w * 0.62, 0.2, 0.03);
  c.fill();
  c.restore();
  block(c, S, w * 0.76, h - 0.34, w * 0.16, 0.24, 0.02, S.paper);
};

/* ---------- 醫院・研究 ---------- */

const hospitalBed: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.12, 0, w - 0.24, h, 0.06);
  block(c, S, 0.12, 0, w - 0.24, 0.32, 0.04, S.tint);
  block(c, S, w * 0.25, 0.45, w * 0.5, 0.55, 0.16, S.paper);
  block(c, S, 0.2, h * 0.38, w - 0.4, h * 0.6 - 0.15, 0.06, S.water);
  c.save();
  c.setLineDash([S.lw * 2, S.lw * 1.6]);
  lw(c, S, 1.1);
  seg(c, 0.06, h * 0.3, 0.06, h * 0.75);
  seg(c, w - 0.06, h * 0.3, w - 0.06, h * 0.75);
  c.restore();
};

const examBed: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.12, S.tint);
  block(c, S, w * 0.12, 0.1, w * 0.76, h - 0.2, 0.1, S.paper);
  lw(c, S, 0.5);
  seg(c, 0, h * 0.28, w, h * 0.28);
  lw(c, S);
};

const opTable: FurnDraw = (c, S, w, h) => {
  c.save();
  c.setLineDash([S.lw * 3, S.lw * 2.5]);
  lw(c, S, 0.6);
  disc(c, S, w / 2, h * 0.42, Math.min(w, h) * 0.46, null);
  c.restore();
  block(c, S, w * 0.32, h * 0.12, w * 0.36, h * 0.76, 0.12, S.tint);
  disc(c, S, w / 2, h * 0.2, w * 0.12, S.paper);
  block(c, S, w * 0.78, h * 0.62, w * 0.2, h * 0.3, 0.04, S.paper);
};

/** 十字標誌 */
function cross(c: Ctx, color: string, x: number, y: number, s: number): void {
  c.save();
  c.fillStyle = color;
  c.fillRect(x - s / 2, y - s / 6, s, s / 3);
  c.fillRect(x - s / 6, y - s / 2, s / 3, s);
  c.restore();
}

const medCabinet: FurnDraw = (c, S, w, h) => {
  cabinet(c, S, w, h, {});
  cross(c, S.alert, w / 2, h * 0.42, Math.min(0.5, h * 0.55));
};

const wheelchair: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.2, h * 0.25, w * 0.6, h * 0.55, 0.08, S.tint);
  block(c, S, w * 0.2, h * 0.08, w * 0.6, h * 0.18, 0.04, S.paper);
  c.save();
  c.fillStyle = S.ink;
  rrect(c, 0, h * 0.15, w * 0.14, h * 0.6, 0.05);
  c.fill();
  rrect(c, w * 0.86, h * 0.15, w * 0.14, h * 0.6, 0.05);
  c.fill();
  c.restore();
  disc(c, S, w * 0.3, h * 0.9, 0.08, S.ink, false);
  disc(c, S, w * 0.7, h * 0.9, 0.08, S.ink, false);
};

const ivStand: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 0.02;
  lw(c, S, 0.8);
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5;
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  c.stroke();
  lw(c, S);
  block(c, S, cx - R * 0.35, cy - R * 0.55, R * 0.7, R * 0.6, 0.05, S.water);
};

const curtain: FurnDraw = (c, S, w, h) => {
  lw(c, S, 0.5);
  seg(c, 0, h * 0.2, w, h * 0.2);
  lw(c, S, 1.1);
  c.beginPath();
  const n = Math.max(2, Math.round(w / 0.35));
  c.moveTo(0, h * 0.55);
  for (let i = 0; i < n; i++) {
    const x0 = (w / n) * i;
    c.quadraticCurveTo(x0 + w / n / 2, i % 2 ? h * 0.95 : h * 0.2, x0 + w / n, h * 0.55);
  }
  c.stroke();
  lw(c, S);
};

const morgue: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.tint);
  const cols = Math.max(1, Math.round(w / 1.4));
  const rows = 2;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = (w / cols) * i + 0.1;
      const y = (h / rows) * j + 0.1;
      block(c, S, x, y, w / cols - 0.2, h / rows - 0.2, 0.03, S.paper);
      lw(c, S, 1.2);
      seg(
        c,
        x + (w / cols - 0.2) / 2 - 0.15,
        y + h / rows - 0.35,
        x + (w / cols - 0.2) / 2 + 0.15,
        y + h / rows - 0.35,
      );
      lw(c, S);
    }
};

const labBench: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.tint);
  basin(c, S, w * 0.08, h * 0.25, Math.min(1, w * 0.22), h * 0.5);
  oval(c, S, w * 0.55, h * 0.5, 0.18, 0.18, S.water);
  oval(c, S, w * 0.72, h * 0.45, 0.14, 0.14, S.leaf);
  oval(c, S, w * 0.86, h * 0.55, 0.12, 0.12, S.occultTint);
};

const tank: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  disc(c, S, w / 2, h / 2, R, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.78, S.leaf);
  for (const [dx, dy, r] of [
    [-0.25, -0.2, 0.09],
    [0.18, 0.05, 0.07],
    [-0.05, 0.3, 0.06],
    [0.3, -0.3, 0.05],
  ] as const)
    disc(c, S, w / 2 + dx * R, h / 2 + dy * R, r, S.paper);
};

const rack: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.shade);
  lw(c, S, 0.4);
  hatchRows(c, 0.1, w - 0.1, 0, h - 0.2, 0.22);
  lw(c, S);
  c.save();
  c.fillStyle = S.leaf;
  for (let y = 0.22; y < h - 0.3; y += 0.22) c.fillRect(w - 0.25, y - 0.06, 0.08, 0.05);
  c.restore();
};

/* ---------- 學校・圖書館 ---------- */

const schoolDesk: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.42, 0.04, S.wood);
  chairTop(c, S, w * 0.18, h * 0.5, w * 0.64, h * 0.46);
};

const lectern: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.wood);
  lw(c, S, 0.5);
  block(c, S, w * 0.15, h * 0.2, w * 0.7, h * 0.45, 0.03, S.paper);
  lw(c, S);
};

const lectureRow: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.38, 0.03, S.wood);
  chairRow(c, S, 0.1, h * 0.46, w - 0.2, h * 0.5, Math.max(2, Math.round(w / 1.2)));
};

const bookstack: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.wood);
  lw(c, S, 0.6);
  seg(c, 0, h / 2, w, h / 2);
  lw(c, S, 0.4);
  const n = Math.max(4, Math.round(w / 0.25));
  c.beginPath();
  for (let i = 1; i < n; i++) {
    const x = (w / n) * i;
    c.moveTo(x, 0.08);
    c.lineTo(x, h / 2 - 0.08);
    c.moveTo(x, h / 2 + 0.08);
    c.lineTo(x, h - 0.08);
  }
  c.stroke();
  lw(c, S);
};

/* ---------- 娛樂・運動 ---------- */

const stageFloor: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.wood);
  lw(c, S, 0.4);
  c.beginPath();
  for (let x = 1; x < w; x += 1) {
    c.moveTo(x, 0.5);
    c.lineTo(x, h);
  }
  c.stroke();
  lw(c, S, 1.2);
  c.beginPath();
  c.moveTo(0, 0.3);
  const n = Math.max(4, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    const x0 = (w / n) * i;
    c.quadraticCurveTo(x0 + w / n / 2, i % 2 ? 0.55 : 0.05, x0 + w / n, 0.3);
  }
  c.stroke();
  lw(c, S, 1.8);
  seg(c, 0, h - 0.04, w, h - 0.04);
  lw(c, S);
};

const seatRow: FurnDraw = (c, S, w, h) => {
  lw(c, S, 0.6);
  chairRow(c, S, 0, 0, w, h, Math.max(1, Math.round(w / 1)));
  lw(c, S);
};

const pew: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.3, 0.04, S.wood);
  block(c, S, 0.05, h * 0.3, w - 0.1, h * 0.62, 0.04, S.wood);
  lw(c, S, 0.4);
  seg(c, 0.1, h * 0.6, w - 0.1, h * 0.6);
  lw(c, S);
};

const speakerBox: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.shade);
  disc(c, S, w / 2, h * 0.55, Math.min(w, h) * 0.32, S.tint);
  disc(c, S, w / 2, h * 0.55, Math.min(w, h) * 0.12, S.ink, false);
};

const drumKit: FurnDraw = (c, S, w, h) => {
  const u = Math.min(w / 3.2, h / 2.8);
  oval(c, S, w * 0.5, h * 0.35, 0.65 * u, 0.4 * u, S.tint);
  disc(c, S, w * 0.32, h * 0.62, 0.36 * u, S.paper);
  disc(c, S, w * 0.65, h * 0.68, 0.42 * u, S.paper);
  disc(c, S, w * 0.4, h * 0.38 - 0.3 * u, 0.26 * u, S.paper);
  disc(c, S, w * 0.6, h * 0.38 - 0.3 * u, 0.26 * u, S.paper);
  for (const [x, y] of [
    [0.13, 0.25],
    [0.87, 0.22],
  ] as const) {
    disc(c, S, w * x, h * y, 0.45 * u, S.gold);
    lw(c, S, 0.4);
    seg(c, w * x - 0.3 * u, h * y, w * x + 0.3 * u, h * y);
    lw(c, S);
  }
  chairTop(c, S, w * 0.42, h * 0.8, w * 0.16, h * 0.18);
};

const mixerDesk: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.tint);
  const n = Math.max(4, Math.round(w / 0.25));
  lw(c, S, 0.4);
  for (let i = 0; i < n; i++) {
    const x = 0.15 + ((w - 0.3) / n) * (i + 0.5);
    seg(c, x, h * 0.25, x, h * 0.85);
    disc(c, S, x, h * 0.25 + ((i * 7) % 5) * 0.1, 0.05, S.ink, false);
  }
  lw(c, S);
};

const stool: FurnDraw = (c, S, w, h) => {
  disc(c, S, w / 2, h / 2, Math.min(w, h) / 2 - 0.04, S.tint);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.18, null);
};

const booth: FurnDraw = (c, S, w, h) => {
  const bd = Math.min(1.2, h * 0.3);
  block(c, S, 0, 0, w, bd, 0.1, S.tint);
  block(c, S, 0.12, bd * 0.35, w - 0.24, bd * 0.6, 0.08, S.paper);
  block(c, S, 0, h - bd, w, bd, 0.1, S.tint);
  block(c, S, 0.12, h - bd + 0.05, w - 0.24, bd * 0.6, 0.08, S.paper);
  block(c, S, 0.25, bd + 0.15, w - 0.5, h - bd * 2 - 0.3, 0.06, S.wood);
};

const billiards: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.12, S.wood);
  block(c, S, 0.25, 0.25, w - 0.5, h - 0.5, 0.04, S.leaf);
  for (const [x, y] of [
    [0.25, 0.25],
    [w / 2, 0.22],
    [w - 0.25, 0.25],
    [0.25, h - 0.25],
    [w / 2, h - 0.22],
    [w - 0.25, h - 0.25],
  ] as const)
    disc(c, S, x, y, 0.12, S.ink, false);
  disc(c, S, w * 0.7, h / 2, 0.08, S.paper);
};

const banquetRound: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const m = Math.min(w, h);
  const cs = m * 0.17;
  for (let i = 0; i < 8; i++) {
    c.save();
    c.translate(cx, cy);
    c.rotate((i * TAU) / 8);
    chairTop(c, S, -cs / 2, -m / 2, cs, cs);
    c.restore();
  }
  disc(c, S, cx, cy, m * 0.33, S.paper);
  lw(c, S, 0.5);
  disc(c, S, cx, cy, m * 0.12, null);
  lw(c, S);
};

const pool: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.1, S.tint);
  block(c, S, 0.4, 0.4, w - 0.8, h - 0.8, 0.05, S.water);
  const lanes = Math.max(2, Math.round((w - 0.8) / 2.5));
  c.save();
  c.setLineDash([S.lw * 4, S.lw * 3]);
  lw(c, S, 0.6);
  for (let i = 1; i < lanes; i++) {
    const x = 0.4 + ((w - 0.8) / lanes) * i;
    seg(c, x, 0.8, x, h - 0.8);
  }
  c.restore();
  lw(c, S, 0.6);
  for (const x of [0.8, w - 1.4]) {
    seg(c, x, 0.4, x, 1.1);
    seg(c, x + 0.6, 0.4, x + 0.6, 1.1);
    seg(c, x, 0.65, x + 0.6, 0.65);
  }
  lw(c, S);
};

const deckChair: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.15, S.paper);
  block(c, S, 0.08, 0.08, w - 0.16, h * 0.32, 0.12, S.cloth);
  lw(c, S, 0.4);
  hatchRows(c, 0.1, w - 0.1, h * 0.4, h - 0.05, 0.3);
  lw(c, S);
};

const treadmill: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.12, S.tint);
  block(c, S, w * 0.12, h * 0.22, w * 0.76, h * 0.74, 0.06, S.shade);
  block(c, S, w * 0.05, 0.05, w * 0.9, h * 0.14, 0.05, S.paper);
};

const exerciseBike: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.38, h * 0.15, w * 0.24, h * 0.75, 0.05, S.tint);
  oval(c, S, w / 2, h * 0.2, w * 0.18, h * 0.12, S.shade);
  lw(c, S, 1.4);
  seg(c, w * 0.08, h * 0.32, w * 0.92, h * 0.32);
  lw(c, S);
  block(c, S, w * 0.3, h * 0.66, w * 0.4, h * 0.22, 0.12, S.paper);
};

const weightBench: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.35, h * 0.15, w * 0.3, h * 0.82, 0.08, S.tint);
  lw(c, S, 1.6);
  seg(c, 0.1, h * 0.12, w - 0.1, h * 0.12);
  lw(c, S);
  for (const x of [0.25, w - 0.25]) block(c, S, x - 0.12, h * 0.12 - 0.4, 0.24, 0.8, 0.04, S.shade);
};

const dumbbellRack: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.tint);
  const n = Math.max(2, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    const cx = (w / n) * (i + 0.5);
    lw(c, S, 1.2);
    seg(c, cx - 0.2, h / 2, cx + 0.2, h / 2);
    lw(c, S);
    disc(c, S, cx - 0.2, h / 2, 0.11, S.shade);
    disc(c, S, cx + 0.2, h / 2, 0.11, S.shade);
  }
};

/* ---------- 健身房的器材（2026-10-29 跟進原作 v1.15，本站自己畫） ---------- */

/** 深蹲架：木質舉重台上四根立柱、兩側的橫桿，槓鈴橫放在架子上，兩端各套一組槓片 */
const squatRack: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.wood);
  const xs = [0.5, w - 0.5];
  const ys = [0.4, h * 0.64];
  lw(c, S, 1.5);
  for (const x of xs) seg(c, x, ys[0], x, ys[1]);
  seg(c, xs[0], ys[0], xs[1], ys[0]);
  lw(c, S);
  for (const x of xs) for (const y of ys) block(c, S, x - 0.15, y - 0.15, 0.3, 0.3, 0.03, S.shade);
  /* 槓鈴：桿子貼著前排立柱，兩端的槓片側面看是細長的方塊（大片在外、小片在內） */
  const by = h * 0.5;
  lw(c, S, 1.8);
  seg(c, 0.12, by, w - 0.12, by);
  lw(c, S);
  for (const x of [0.2, w - 0.2]) {
    block(c, S, x - 0.09, by - 0.46, 0.18, 0.92, 0.04, S.paper);
    const inner = x < w / 2 ? x + 0.2 : x - 0.2;
    block(c, S, inner - 0.06, by - 0.32, 0.12, 0.64, 0.03, S.tint);
  }
  /* 腳邊的深蹲踏板線 */
  lw(c, S, 0.5);
  seg(c, w * 0.3, h * 0.84, w * 0.7, h * 0.84);
  lw(c, S);
};

/** 滑輪訓練機（龍門架）：左右兩座配重塔、中間的橫樑，滑輪的鋼索垂到前面的握把 */
const cableMachine: FurnDraw = (c, S, w, h) => {
  const tw = Math.min(0.8, w * 0.26);
  const th = h * 0.42;
  for (const x of [0.1, w - 0.1 - tw]) {
    block(c, S, x, 0.1, tw, th, 0.04, S.shade);
    lw(c, S, 0.5);
    hatchRows(c, x, x + tw, 0.1, 0.1 + th, th / 5);
    lw(c, S);
  }
  block(c, S, 0.1 + tw, 0.1 + th * 0.3, w - 0.2 - tw * 2, th * 0.4, 0.03, S.tint);
  /* 鋼索：從橫樑兩端的滑輪拉到前面的握把 */
  const px = [0.1 + tw + 0.12, w - 0.1 - tw - 0.12];
  const py = 0.1 + th * 0.5;
  lw(c, S, 0.5);
  seg(c, px[0], py, w * 0.36, h * 0.8);
  seg(c, px[1], py, w * 0.64, h * 0.8);
  lw(c, S);
  for (const x of px) disc(c, S, x, py, 0.1, S.paper);
  for (const x of [w * 0.36, w * 0.64]) disc(c, S, x, h * 0.8, 0.1, null);
  /* 站的位置 */
  lw(c, S, 0.5);
  c.setLineDash([S.lw * 2.6, S.lw * 2.2]);
  c.strokeRect(w * 0.2, h * 0.56, w * 0.6, h * 0.4);
  c.setLineDash([]);
  lw(c, S);
};

/** 划船機：上面是飛輪（外罩＋風扇）和手把，中間的軌道上有座椅，兩側是踏板 */
const rowingMachine: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.4, h * 0.1, w * 0.2, h * 0.86, 0.04, S.tint);
  const r = Math.min(w * 0.44, 0.58);
  disc(c, S, w / 2, h * 0.07 + r, r, S.shade);
  disc(c, S, w / 2, h * 0.07 + r, r * 0.5, S.paper);
  lw(c, S, 0.6);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    seg(
      c,
      w / 2 + Math.cos(a) * r * 0.5,
      h * 0.07 + r + Math.sin(a) * r * 0.5,
      w / 2 + Math.cos(a) * r * 0.92,
      h * 0.07 + r + Math.sin(a) * r * 0.92,
    );
  }
  lw(c, S);
  /* 踏板（左右各一，往外開） */
  for (const x of [w * 0.1, w * 0.62]) block(c, S, x, h * 0.3, w * 0.28, h * 0.07, 0.03, S.paper);
  /* 手把與鍊條 */
  lw(c, S, 1.6);
  seg(c, w * 0.3, h * 0.47, w * 0.7, h * 0.47);
  lw(c, S, 0.5);
  seg(c, w / 2, h * 0.07 + r * 2, w / 2, h * 0.47);
  lw(c, S);
  block(c, S, w * 0.28, h * 0.62, w * 0.44, h * 0.1, 0.05, S.paper);
};

/** 瑜珈墊：鋪開的墊子，中間一條對位線，上端捲起來的一圈 */
const yogaMat: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.1, S.cloth);
  block(c, S, 0, 0, w, 0.3, 0.12, S.tint);
  lw(c, S, 0.5);
  c.setLineDash([S.lw * 2.6, S.lw * 2.2]);
  seg(c, w / 2, 0.45, w / 2, h - 0.2);
  c.setLineDash([]);
  oval(c, S, w / 2, h * 0.4, w * 0.2, 0.12, null);
  oval(c, S, w / 2, h * 0.72, w * 0.2, 0.12, null);
  lw(c, S);
};

export const FACILITY: Record<string, FurnDraw> = {
  office_desk: officeDesk,
  meeting6: meeting(3),
  reception,
  locker,
  filing,
  whiteboard,
  copier,
  bench,
  vending,
  hospital_bed: hospitalBed,
  exam_bed: examBed,
  op_table: opTable,
  med_cabinet: medCabinet,
  wheelchair,
  iv_stand: ivStand,
  curtain,
  morgue,
  lab_bench: labBench,
  tank,
  rack,
  school_desk: schoolDesk,
  lectern,
  lecture_row: lectureRow,
  bookstack,
  stage: stageFloor,
  seats: seatRow,
  pew,
  speaker: speakerBox,
  drums: drumKit,
  mixer: mixerDesk,
  stool,
  booth,
  billiards,
  banquet_round: banquetRound,
  pool,
  deck_chair: deckChair,
  treadmill,
  exercise_bike: exerciseBike,
  weight_bench: weightBench,
  dumbbell_rack: dumbbellRack,
  squat_rack: squatRack,
  cable_machine: cableMachine,
  rowing_machine: rowingMachine,
  yoga_mat: yogaMat,
};

export { chairRow, cross };
