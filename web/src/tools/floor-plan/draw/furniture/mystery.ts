/**
 * 家具畫法（2026-10 第三批）：調查・證物、恐怖・神祕。全部是本站自己畫的。
 */
import {
  block,
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
import { bolts, inked, type Pt, ring, rubble, thin } from './parts';
import { blob } from './story';

/* ---------- 調查・證物 ---------- */

const flashlight: FurnDraw = (c, S, w, h) => {
  c.save();
  c.globalAlpha = 0.5;
  c.fillStyle = S.gold;
  poly(c, [
    [w * 0.36, h * 0.3],
    [0, 0],
    [0, h],
    [w * 0.36, h * 0.7],
  ]);
  c.fill();
  c.restore();
  block(c, S, w * 0.34, h * 0.18, w * 0.2, h * 0.64, 0.04, S.tint);
  block(c, S, w * 0.52, h * 0.3, w * 0.46, h * 0.4, h * 0.15, S.shade);
  disc(c, S, w * 0.75, h / 2, h * 0.08, S.alert);
};

const tools: FurnDraw = (c, S, w, h) => {
  /* 板手 */
  c.save();
  c.translate(w * 0.48, h / 2);
  c.rotate(-0.35);
  block(c, S, -w * 0.38, -0.05, w * 0.7, 0.1, 0.04, S.shade);
  disc(c, S, w * 0.34, 0, 0.13, S.shade);
  disc(c, S, w * 0.37, 0, 0.06, S.paper, false);
  c.restore();
  /* 螺絲起子 */
  c.save();
  c.translate(w * 0.52, h / 2);
  c.rotate(0.3);
  block(c, S, -w * 0.42, -0.06, w * 0.3, 0.12, 0.05, S.alert);
  thin(c, S, 1.2, () => seg(c, -w * 0.12, 0, w * 0.36, 0));
  c.restore();
};

const bag: FurnDraw = (c, S, w, h) => {
  thin(c, S, 1.6, () => {
    c.beginPath();
    c.ellipse(w / 2, h * 0.32, w * 0.24, h * 0.26, 0, Math.PI, TAU);
    c.stroke();
  });
  block(c, S, w * 0.06, h * 0.28, w * 0.88, h * 0.68, 0.12, S.wood);
  thin(c, S, 0.5, () => seg(c, w * 0.06, h * 0.5, w * 0.94, h * 0.5));
  block(c, S, w * 0.44, h * 0.44, w * 0.12, h * 0.14, 0.02, S.gold);
};

const wallet: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.3, 0, w * 0.4, h * 0.4, 0.02, S.screen);
  block(c, S, 0, h * 0.15, w, h * 0.85, 0.06, S.shade);
  thin(c, S, 0.4, () => {
    c.setLineDash([S.lw, S.lw]);
    rrect(c, 0.05, h * 0.15 + 0.05, w - 0.1, h * 0.85 - 0.1, 0.04);
    c.stroke();
  });
};

const papers: FurnDraw = (c, S, w, h) => {
  for (const [dx, dy, a] of [
    [0.04, 0.06, -0.12],
    [-0.02, 0, 0.08],
    [0, 0.02, -0.02],
  ] as const) {
    c.save();
    c.translate(w / 2 + dx, h / 2 + dy);
    c.rotate(a);
    block(c, S, -w * 0.36, -h * 0.4, w * 0.72, h * 0.8, 0, S.paper);
    c.restore();
  }
  thin(c, S, 0.4, () => hatchRows(c, w * 0.22, w * 0.78, h * 0.15, h * 0.85, h * 0.12));
  thin(c, S, 1.2, () => inked(c, S.shade, () => seg(c, w * 0.3, h * 0.08, w * 0.3, h * 0.24)));
};

const fileFolder: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.08, 0, w * 0.4, h * 0.12, 0.03, S.gold);
  block(c, S, w * 0.1, h * 0.04, w * 0.84, h * 0.88, 0, S.paper);
  block(c, S, 0, h * 0.08, w, h * 0.92, 0.03, S.gold);
  block(c, S, w * 0.22, h * 0.36, w * 0.56, h * 0.18, 0.02, S.paper);
};

const laptop: FurnDraw = (c, S, w, h) => {
  /* 上半：打開的螢幕；下半：鍵盤與觸控板 */
  block(c, S, w * 0.04, 0, w * 0.92, h * 0.42, 0.04, S.shade);
  block(c, S, w * 0.1, h * 0.06, w * 0.8, h * 0.3, 0.02, S.screen);
  block(c, S, 0, h * 0.42, w, h * 0.58, 0.05, S.tint);
  thin(c, S, 0.35, () => {
    for (let y = h * 0.48; y < h * 0.74; y += h * 0.08)
      for (let x = w * 0.08; x < w * 0.9; x += w * 0.08) {
        c.strokeRect(x, y, w * 0.06, h * 0.05);
      }
  });
  block(c, S, w * 0.38, h * 0.78, w * 0.24, h * 0.16, 0.02, S.paper);
};

const recorder: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.shade);
  thin(c, S, 0.4, () =>
    inked(c, S.paper, () => hatchRows(c, w * 0.08, w * 0.45, 0.04, h - 0.04, 0.07)),
  );
  disc(c, S, w * 0.72, h / 2, Math.min(w, h) * 0.18, S.alert);
};

const camera: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.15, w, h * 0.85, 0.06, S.ink);
  block(c, S, w * 0.08, 0, w * 0.22, h * 0.24, 0.02, S.ink);
  disc(c, S, w * 0.55, h * 0.58, Math.min(w, h) * 0.3, S.shade);
  disc(c, S, w * 0.55, h * 0.58, Math.min(w, h) * 0.17, S.screen);
  disc(c, S, w * 0.86, h * 0.3, h * 0.07, S.alert);
};

const casings: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 101 + h * 7));
  for (let i = 0; i < 7; i++) {
    c.save();
    c.translate(w * (0.15 + rnd() * 0.7), h * (0.15 + rnd() * 0.7));
    c.rotate(rnd() * TAU);
    block(c, S, -0.08, -0.03, 0.16, 0.06, 0.02, S.gold);
    c.restore();
  }
};

const burn: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 43 + h * 19));
  c.save();
  c.globalAlpha = 0.35;
  c.fillStyle = S.wood;
  blob(c, w / 2, h / 2, w * 0.48, h * 0.47, 13, 0.25, rnd);
  c.fill();
  c.globalAlpha = 0.6;
  c.fillStyle = S.shade;
  blob(c, w / 2, h / 2, w * 0.36, h * 0.34, 11, 0.3, rnd);
  c.fill();
  c.globalAlpha = 0.85;
  c.fillStyle = S.ink;
  blob(c, w * 0.48, h * 0.52, w * 0.22, h * 0.2, 9, 0.35, rnd);
  c.fill();
  c.restore();
  thin(c, S, 0.5, () => {
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU;
      c.moveTo(w / 2 + Math.cos(a) * w * 0.2, h / 2 + Math.sin(a) * h * 0.18);
      c.lineTo(w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * h * 0.42);
    }
    c.stroke();
  });
};

const dragMarks: FurnDraw = (c, S, w, h) => {
  c.save();
  c.fillStyle = S.blood;
  for (const [x, k] of [
    [0.32, 1],
    [0.68, 0.8],
  ] as const) {
    c.globalAlpha = 0.75;
    c.beginPath();
    c.moveTo(w * x - 0.16 * k, h * 0.04);
    c.bezierCurveTo(w * x - 0.24, h * 0.35, w * x + 0.1, h * 0.65, w * x - 0.02, h * 0.98);
    c.lineTo(w * x + 0.04, h * 0.98);
    c.bezierCurveTo(w * x + 0.16, h * 0.65, w * x - 0.1, h * 0.35, w * x + 0.16 * k, h * 0.04);
    c.closePath();
    c.fill();
  }
  c.restore();
};

const fingerprint: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.04, 0.04, w - 0.08, h - 0.08, 0.04, S.paper);
  thin(c, S, 0.5, () =>
    inked(c, S.screen, () => {
      for (let i = 1; i <= 4; i++) {
        c.beginPath();
        c.ellipse(w / 2, h * 0.52, w * 0.07 * i, h * 0.09 * i, 0, Math.PI * 1.05, Math.PI * 2.4);
        c.stroke();
      }
    }),
  );
  c.save();
  c.fillStyle = S.gold;
  c.fillRect(0.04, 0.04, w - 0.08, h * 0.14);
  c.restore();
};

const brokenFurniture: FurnDraw = (c, S, w, h) => {
  /* 斷掉的板子、椅腳、碎片 */
  for (const [x, y, a, len] of [
    [0.3, 0.35, 0.3, 0.55],
    [0.62, 0.5, -0.5, 0.5],
    [0.45, 0.72, 0.1, 0.42],
  ] as const) {
    c.save();
    c.translate(w * x, h * y);
    c.rotate(a);
    poly(c, [
      [-w * len * 0.5, -0.16],
      [w * len * 0.5, -0.16],
      [w * len * 0.42, 0],
      [w * len * 0.5, 0.16],
      [-w * len * 0.5, 0.16],
    ]);
    paint(c, S.wood);
    c.restore();
  }
  c.save();
  c.translate(w * 0.82, h * 0.25);
  c.rotate(1.1);
  block(c, S, -0.35, -0.07, 0.7, 0.14, 0.04, S.wood);
  c.restore();
  rubble(c, S, w / 2, h / 2, w * 0.45, h * 0.42, 8, 77, 0.07);
};

/* ---------- 恐怖・神祕 ---------- */

const pod: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  disc(c, S, w / 2, h / 2, R, S.shade);
  disc(c, S, w / 2, h / 2, R * 0.82, S.water);
  /* 裡面的人影 */
  c.save();
  c.globalAlpha = 0.75;
  c.fillStyle = S.faint;
  c.beginPath();
  c.ellipse(w / 2, h / 2 + R * 0.12, R * 0.42, R * 0.24, 0, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(w / 2, h / 2 - R * 0.1, R * 0.2, 0, TAU);
  c.fill();
  c.restore();
  c.save();
  c.fillStyle = S.paper;
  for (const [x, y, r] of [
    [0.32, 0.3, 0.05],
    [0.66, 0.36, 0.04],
    [0.6, 0.7, 0.05],
  ] as const) {
    c.beginPath();
    c.arc(w * x, h * y, r, 0, TAU);
    c.fill();
  }
  c.restore();
  const pts: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    pts.push([w / 2 + Math.cos(a) * R * 0.91, h / 2 + Math.sin(a) * R * 0.91]);
  }
  bolts(c, S, pts, R * 0.05);
};

const sarcophagus: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.12, S.tint);
  block(c, S, 0.18, 0.18, w - 0.36, h - 0.36, 0.08, S.paper);
  /* 蓋子上的人形浮雕 */
  thin(c, S, 0.6, () => {
    ring(c, w / 2, h * 0.18, w * 0.14);
    c.beginPath();
    c.moveTo(w * 0.32, h * 0.28);
    c.lineTo(w * 0.68, h * 0.28);
    c.lineTo(w * 0.6, h * 0.86);
    c.lineTo(w * 0.4, h * 0.86);
    c.closePath();
    c.stroke();
    seg(c, w * 0.36, h * 0.45, w * 0.64, h * 0.42);
  });
  disc(c, S, w / 2, h * 0.43, w * 0.06, S.gold);
};

const ritualTable: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.shade);
  block(c, S, w * 0.35, 0, w * 0.3, h, 0, S.occult);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.2, S.tint);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.13, S.blood, false);
  for (const [x, y] of [
    [0.12, 0.18],
    [0.88, 0.18],
    [0.12, 0.82],
    [0.88, 0.82],
  ] as const) {
    disc(c, S, w * x, h * y, 0.12, S.paper);
    disc(c, S, w * x, h * y, 0.05, S.fire, false);
  }
  c.save();
  c.translate(w * 0.75, h * 0.5);
  c.rotate(0.6);
  block(c, S, -0.3, -0.04, 0.4, 0.08, 0.02, S.tint);
  block(c, S, 0.1, -0.06, 0.18, 0.12, 0.03, S.ink);
  c.restore();
};

const chains: FurnDraw = (c, S, w, h) => {
  const link = 0.32;
  const n = Math.floor(w / link);
  const x0 = (w - n * link) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + link * (i + 0.5);
    if (i % 2) {
      thin(c, S, 1.6, () => seg(c, x - link * 0.35, h / 2, x + link * 0.35, h / 2));
    } else {
      c.save();
      c.lineWidth = S.lw * 1.3;
      c.beginPath();
      c.ellipse(x, h / 2, link * 0.62, h * 0.3, 0, 0, TAU);
      c.stroke();
      c.restore();
    }
  }
  disc(c, S, 0.12, h / 2, h * 0.2, S.shade);
};

const stele: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 13 + h * 47));
  const pts: Pt[] = [
    [0.05, 0.1],
    [w * 0.3, 0.02 + rnd() * 0.06],
    [w * 0.7, 0.02 + rnd() * 0.06],
    [w - 0.05, 0.12],
    [w - 0.08, h - 0.06],
    [w * 0.5, h - 0.02],
    [0.08, h - 0.08],
  ];
  poly(c, pts);
  paint(c, S.tint);
  thin(c, S, 0.8, () =>
    inked(c, S.occult, () => {
      for (let i = 0; i < 4; i++) {
        const x = w * (0.2 + i * 0.2);
        seg(c, x, h * 0.3, x + 0.08, h * 0.5);
        seg(c, x + 0.08, h * 0.5, x - 0.04, h * 0.7);
        ring(c, x + 0.02, h * 0.3, 0.05);
      }
    }),
  );
};

const totem: FurnDraw = (c, S, w, h) => {
  /* 張開的翅膀＋柱頂的臉 */
  poly(c, [
    [0.02, h * 0.35],
    [w * 0.3, h * 0.4],
    [w * 0.3, h * 0.6],
    [0.1, h * 0.62],
  ]);
  paint(c, S.alert);
  poly(c, [
    [w - 0.02, h * 0.35],
    [w * 0.7, h * 0.4],
    [w * 0.7, h * 0.6],
    [w - 0.1, h * 0.62],
  ]);
  paint(c, S.alert);
  const R = Math.min(w, h) * 0.3;
  disc(c, S, w / 2, h / 2, R, S.wood);
  thin(c, S, 0.6, () => ring(c, w / 2, h / 2, R * 0.65));
  disc(c, S, w / 2 - R * 0.35, h / 2 - R * 0.1, R * 0.14, S.ink);
  disc(c, S, w / 2 + R * 0.35, h / 2 - R * 0.1, R * 0.14, S.ink);
  poly(c, [
    [w / 2, h / 2 + R * 0.1],
    [w / 2 - R * 0.14, h / 2 + R * 0.5],
    [w / 2 + R * 0.14, h / 2 + R * 0.5],
  ]);
  paint(c, S.gold);
};

const offering: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  block(c, S, 0.08, 0.08, w - 0.16, h - 0.16, 0.03, S.paper);
  disc(c, S, w * 0.28, h * 0.4, Math.min(w, h) * 0.17, S.paper);
  disc(c, S, w * 0.28, h * 0.4, Math.min(w, h) * 0.1, S.cloth, false);
  for (const [x, y, col] of [
    [0.6, 0.35, S.alert],
    [0.74, 0.42, S.gold],
    [0.66, 0.6, S.leaf],
  ] as const)
    disc(c, S, w * x, h * y, Math.min(w, h) * 0.11, col);
  disc(c, S, w * 0.3, h * 0.78, 0.06, S.ink);
};

const cursedItem: FurnDraw = (c, S, w, h) => {
  const cx = w / 2;
  /* 稻草人偶 */
  thin(c, S, 1.6, () =>
    inked(c, S.wood, () => {
      seg(c, cx - w * 0.36, h * 0.42, cx + w * 0.36, h * 0.42);
      seg(c, cx, h * 0.3, cx - w * 0.2, h * 0.95);
      seg(c, cx, h * 0.3, cx + w * 0.2, h * 0.95);
    }),
  );
  oval(c, S, cx, h * 0.55, w * 0.18, h * 0.24, S.cloth);
  disc(c, S, cx, h * 0.2, Math.min(w, h) * 0.16, S.cloth);
  /* 符咒與釘子 */
  block(c, S, cx - w * 0.08, h * 0.45, w * 0.16, h * 0.26, 0, S.paper);
  thin(c, S, 0.6, () => inked(c, S.alert, () => seg(c, cx, h * 0.48, cx, h * 0.68)));
  disc(c, S, cx + w * 0.1, h * 0.36, 0.035, S.ink);
  disc(c, S, cx - w * 0.06, h * 0.6, 0.035, S.ink);
};

const flesh: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 89 + h * 3));
  for (const [x, y, rx, ry] of [
    [0.5, 0.55, 0.42, 0.38],
    [0.3, 0.35, 0.22, 0.2],
    [0.7, 0.32, 0.2, 0.18],
  ] as const) {
    blob(c, w * x, h * y, w * rx, h * ry, 9, 0.22, rnd);
    paint(c, S.blood);
  }
  thin(c, S, 0.6, () =>
    inked(c, S.occult, () => {
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(w / 2, h / 2);
        c.quadraticCurveTo(
          w * rnd(),
          h * rnd(),
          w * (0.15 + rnd() * 0.7),
          h * (0.15 + rnd() * 0.7),
        );
        c.stroke();
      }
    }),
  );
  for (const [x, y, r] of [
    [0.42, 0.5, 0.14],
    [0.66, 0.62, 0.1],
    [0.3, 0.32, 0.08],
  ] as const) {
    disc(c, S, w * x, h * y, r, S.paper);
    disc(c, S, w * x, h * y, r * 0.45, S.ink);
  }
};

const blackStain: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 61 + h * 29));
  c.save();
  c.fillStyle = S.ink;
  c.globalAlpha = 0.82;
  blob(c, w / 2, h / 2, w * 0.38, h * 0.36, 12, 0.35, rnd);
  c.fill();
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU;
    const d = 0.7 + rnd() * 0.3;
    c.beginPath();
    c.arc(
      w / 2 + Math.cos(a) * w * 0.46 * d,
      h / 2 + Math.sin(a) * h * 0.44 * d,
      0.04 + rnd() * 0.1,
      0,
      TAU,
    );
    c.fill();
  }
  c.restore();
};

const abyss: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 5 + h * 97));
  blob(c, w / 2, h / 2, w * 0.48, h * 0.48, 14, 0.15, rnd);
  paint(c, S.shade);
  c.save();
  c.fillStyle = S.occult;
  blob(c, w / 2, h / 2, w * 0.36, h * 0.36, 12, 0.15, rnd);
  c.fill();
  c.fillStyle = S.ink;
  c.beginPath();
  c.arc(w / 2, h / 2, Math.min(w, h) * 0.22, 0, TAU);
  c.fill();
  c.restore();
  thin(c, S, 0.6, () =>
    inked(c, S.occultTint, () => {
      c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.45;
        const r = 0.05 + i * 0.02;
        const x = w / 2 + Math.cos(a) * r;
        const y = h / 2 + Math.sin(a) * r;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }),
  );
};

const grave: FurnDraw = (c, S, w, h) => {
  /* 墓碑（靠牆的一邊）＋墓地 */
  block(c, S, w * 0.04, 0, w * 0.92, h * 0.24, 0.1, S.tint);
  word(c, S, '†', w / 2, h * 0.12, h * 0.16, S.shade);
  thin(c, S, 0.5, () => {
    rrect(c, w * 0.1, h * 0.3, w * 0.8, h * 0.66, 0.06);
    c.stroke();
  });
  block(c, S, w * 0.16, h * 0.34, w * 0.68, h * 0.58, 0.05, S.cloth);
  for (const [x, col] of [
    [0.36, S.alert],
    [0.5, S.gold],
    [0.64, S.paper],
  ] as const)
    disc(c, S, w * x, h * 0.4, 0.08, col);
  thin(c, S, 0.5, () => seg(c, w * 0.5, h * 0.44, w * 0.5, h * 0.56));
  lw(c, S);
};

export const MYSTERY: Record<string, FurnDraw> = {
  flashlight,
  tools,
  bag,
  wallet,
  papers,
  file_folder: fileFolder,
  laptop,
  recorder,
  camera,
  casings,
  burn,
  drag_marks: dragMarks,
  fingerprint,
  broken_furniture: brokenFurniture,
  pod,
  sarcophagus,
  ritual_table: ritualTable,
  chains,
  stele,
  totem,
  offering,
  cursed_item: cursedItem,
  flesh,
  black_stain: blackStain,
  abyss,
  grave,
};
