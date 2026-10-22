/**
 * 家具畫法（2026-10 第三批）：倉儲・工地、街道・公園、自然（斷崖、坍方）。全部是本站自己畫的。
 */

import {
  block,
  type Ctx,
  disc,
  type FurnDraw,
  type FurnStyle,
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
import { bolts, hatchCols, hazard, inked, type Pt, ring, rubble, thin, tube, wheel } from './parts';
import { blob } from './story';

/* ---------- 倉儲・工地 ---------- */

/** 棧板：木板＋縫裡看得到的橫木 */
function palletShape(c: Ctx, S: FurnStyle, x: number, y: number, w: number, h: number): void {
  block(c, S, x, y, w, h, 0.02, S.shade);
  const n = 5;
  const pw = w / n;
  for (let i = 0; i < n; i++) block(c, S, x + pw * i + 0.04, y, pw - 0.08, h, 0.02, S.wood);
}

const pallet: FurnDraw = (c, S, w, h) => palletShape(c, S, 0, 0, w, h);

const palletStack: FurnDraw = (c, S, w, h) => {
  palletShape(c, S, 0.12, 0, w - 0.12, h - 0.12);
  palletShape(c, S, 0, 0.12, w - 0.12, h - 0.12);
  thin(c, S, 0.5, () => {
    seg(c, 0.02, 0.14, 0.14, 0.02);
    seg(c, w - 0.14, h - 0.02, w - 0.02, h - 0.14);
  });
};

const cardboard: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.cloth);
  thin(c, S, 0.5, () => {
    seg(c, 0, h / 2, w, h / 2);
    seg(c, w * 0.1, h * 0.12, w * 0.1, h * 0.88);
    seg(c, w * 0.9, h * 0.12, w * 0.9, h * 0.88);
  });
  c.save();
  c.fillStyle = S.wood;
  c.fillRect(w * 0.42, 0, w * 0.16, h);
  c.restore();
};

const bigCrate: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.wood);
  thin(c, S, 0.5, () => hatchCols(c, 0.2, w - 0.2, 0.2, h - 0.2, 0.45));
  thin(c, S, 1, () => {
    rrect(c, 0.2, 0.2, w - 0.4, h - 0.4);
    c.stroke();
    seg(c, 0.2, 0.2, w - 0.2, h - 0.2);
    seg(c, w - 0.2, 0.2, 0.2, h - 0.2);
  });
  block(c, S, w * 0.36, h * 0.38, w * 0.28, h * 0.24, 0.02, S.paper);
  word(c, S, '↑', w / 2, h / 2, h * 0.2);
};

const container: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.screen);
  thin(c, S, 0.5, () => inked(c, S.paper, () => hatchRows(c, 0.25, w - 0.25, 0.3, h - 0.3, 0.3)));
  c.save();
  c.fillStyle = S.ink;
  for (const [x, y] of [
    [0, 0],
    [w - 0.35, 0],
    [0, h - 0.35],
    [w - 0.35, h - 0.35],
  ] as const)
    c.fillRect(x, y, 0.35, 0.35);
  c.restore();
  /* 門那一頭（下）的鎖桿 */
  thin(c, S, 0.8, () => {
    for (const x of [0.3, 0.45, 0.55, 0.7]) seg(c, w * x, h - 0.35, w * x, h - 0.05);
  });
};

const drum: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.03;
  disc(c, S, w / 2, h / 2, R, S.screen);
  thin(c, S, 0.6, () => ring(c, w / 2, h / 2, R * 0.82));
  disc(c, S, w / 2 - R * 0.42, h / 2 - R * 0.3, R * 0.14, S.tint);
  disc(c, S, w / 2 + R * 0.42, h / 2 + R * 0.3, R * 0.1, S.tint);
};

const handCart: FurnDraw = (c, S, w, h) => {
  thin(c, S, 1.6, () => {
    poly(
      c,
      [
        [w * 0.12, h * 0.2],
        [w * 0.12, 0.05],
        [w * 0.88, 0.05],
        [w * 0.88, h * 0.2],
      ],
      false,
    );
    c.stroke();
  });
  for (const [x, y] of [
    [0.04, h * 0.2],
    [w - 0.28, h * 0.2],
    [0.04, h - 0.38],
    [w - 0.28, h - 0.38],
  ] as const)
    wheel(c, S, x, y, 0.24, 0.32);
  block(c, S, w * 0.08, h * 0.18, w * 0.84, h * 0.8, 0.06, S.tint);
  thin(c, S, 0.4, () => hatchRows(c, w * 0.08, w * 0.92, h * 0.18, h * 0.98, 0.2));
};

const toolShelf: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.tint);
  block(c, S, 0, 0, w, h * 0.22, 0, S.wood);
  /* 掛在牆上的工具（輪廓） */
  thin(c, S, 1, () => {
    const n = Math.max(3, Math.round(w / 0.6));
    for (let i = 0; i < n; i++) {
      const x = (w / n) * (i + 0.5);
      if (i % 3 === 0) {
        seg(c, x, h * 0.3, x, h * 0.85);
        block(c, S, x - 0.12, h * 0.26, 0.24, h * 0.14, 0.02, S.shade);
      } else if (i % 3 === 1) {
        seg(c, x, h * 0.35, x, h * 0.85);
        ring(c, x, h * 0.32, 0.08);
      } else {
        block(c, S, x - 0.13, h * 0.35, 0.26, h * 0.5, 0.05, S.alert);
      }
    }
  });
};

const machineTool: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.2, w, h * 0.6, 0.05, S.shade);
  block(c, S, 0.05, h * 0.1, w * 0.3, h * 0.8, 0.06, S.leaf);
  disc(c, S, w * 0.38, h / 2, h * 0.18, S.tint);
  thin(c, S, 0.6, () => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      seg(c, w * 0.38, h / 2, w * 0.38 + Math.cos(a) * h * 0.18, h / 2 + Math.sin(a) * h * 0.18);
    }
  });
  block(c, S, w * 0.52, h * 0.3, w * 0.18, h * 0.5, 0.03, S.tint);
  block(c, S, w * 0.8, h * 0.34, w * 0.16, h * 0.32, 0.04, S.leaf);
  thin(c, S, 1.2, () => seg(c, w * 0.42, h / 2, w * 0.8, h / 2));
};

const generator: FurnDraw = (c, S, w, h) => {
  thin(c, S, 1.4, () => {
    rrect(c, 0.06, 0.06, w - 0.12, h - 0.12, 0.12);
    c.stroke();
  });
  block(c, S, w * 0.14, h * 0.18, w * 0.72, h * 0.64, 0.08, S.gold);
  disc(c, S, w * 0.32, h * 0.4, h * 0.1, S.ink);
  thin(c, S, 0.5, () => hatchCols(c, w * 0.48, w * 0.82, h * 0.25, h * 0.75, 0.1));
};

const indTank: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.08;
  disc(c, S, w / 2, h / 2, R, S.tint);
  thin(c, S, 0.5, () => ring(c, w / 2, h / 2, R * 0.85));
  /* 危險物的菱形標示 */
  poly(c, [
    [w / 2, h / 2 - R * 0.42],
    [w / 2 + R * 0.42, h / 2],
    [w / 2, h / 2 + R * 0.42],
    [w / 2 - R * 0.42, h / 2],
  ]);
  paint(c, S.gold);
  word(c, S, '！', w / 2, h / 2 + 0.02, R * 0.4, S.ink);
  tube(c, S, w / 2 + R * 0.7, h / 2 - 0.12, w / 2 - R * 0.7, 0.24, S.shade);
};

const conveyor: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.shade);
  block(c, S, 0.15, h * 0.12, w - 0.3, h * 0.76, 0.02, S.tint);
  thin(c, S, 0.5, () => hatchCols(c, 0.15, w - 0.15, h * 0.12, h * 0.88, 0.4));
  for (const x of [w * 0.25, w * 0.6]) block(c, S, x, h * 0.22, 1.1, h * 0.56, 0.03, S.cloth);
  inked(c, S.chalk, () => {
    poly(c, [
      [w - 0.6, h / 2],
      [w - 0.9, h * 0.32],
      [w - 0.9, h * 0.68],
    ]);
    c.fill();
  });
};

const workbench: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.16, 0, S.shade);
  block(c, S, 0, h * 0.12, w, h * 0.88, 0.04, S.wood);
  /* 虎鉗 */
  block(c, S, w - 0.7, h * 0.55, 0.55, h * 0.4, 0.04, S.shade);
  thin(c, S, 1.2, () => seg(c, w - 0.42, h * 0.95, w - 0.42, h * 1.05));
  /* 鐵鎚與板子 */
  thin(c, S, 1.1, () => seg(c, w * 0.2, h * 0.7, w * 0.42, h * 0.45));
  block(c, S, w * 0.38, h * 0.36, 0.3, 0.16, 0.03, S.shade);
  block(c, S, w * 0.5, h * 0.55, w * 0.18, h * 0.28, 0.02, S.paper);
};

const materialPile: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(43);
  blob(c, w / 2, h / 2, w * 0.48, h * 0.46, 12, 0.18, rnd);
  paint(c, S.cloth);
  thin(c, S, 0.5, () => {
    for (const k of [0.66, 0.36]) {
      c.beginPath();
      c.ellipse(w / 2, h / 2, w * 0.48 * k, h * 0.46 * k, 0, 0, TAU);
      c.stroke();
    }
  });
  c.save();
  c.fillStyle = S.shade;
  for (let i = 0; i < 30; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * 0.9;
    c.beginPath();
    c.arc(w / 2 + Math.cos(a) * d * w * 0.44, h / 2 + Math.sin(a) * d * h * 0.42, 0.04, 0, TAU);
    c.fill();
  }
  c.restore();
};

const buildingMaterials: FurnDraw = (c, S, w, h) => {
  /* 左：一捆鋼筋；右：一疊木材 */
  block(c, S, 0, h * 0.1, w * 0.48, h * 0.8, 0.04, S.tint);
  thin(c, S, 0.8, () =>
    inked(c, S.shade, () => hatchRows(c, 0.1, w * 0.46, h * 0.1, h * 0.9, 0.12)),
  );
  for (const x of [0.15, 0.32]) {
    c.save();
    c.fillStyle = S.ink;
    c.fillRect(w * x, h * 0.05, 0.12, h * 0.9);
    c.restore();
  }
  for (let i = 0; i < 4; i++)
    block(c, S, w * 0.52, h * (0.05 + i * 0.225), w * 0.47, h * 0.2, 0.02, S.wood);
};

const palletRack: FurnDraw = (c, S, w, h) => {
  const bays = Math.max(2, Math.round(w / 2.7));
  const bw = w / bays;
  for (let i = 0; i < bays; i++) {
    const x = bw * i;
    palletShape(c, S, x + 0.15, 0.15, bw - 0.3, h - 0.3);
    block(c, S, x + 0.3, 0.3, bw * 0.45, h * 0.55, 0.02, S.cloth);
    block(c, S, x + bw * 0.5, 0.35, bw * 0.38, h * 0.45, 0.02, S.cloth);
  }
  c.save();
  c.fillStyle = S.alert;
  c.fillRect(0, 0, w, 0.12);
  c.fillRect(0, h - 0.12, w, 0.12);
  c.fillStyle = S.screen;
  for (let i = 0; i <= bays; i++) {
    const x = Math.min(w - 0.18, Math.max(0, bw * i - 0.09));
    c.fillRect(x, 0, 0.18, 0.18);
    c.fillRect(x, h - 0.18, 0.18, 0.18);
  }
  c.restore();
};

const supplyShelf: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.tint);
  const rnd = seeded(61);
  for (let x = 0.2; x < w - 0.15; x += 0.25) {
    const r = rnd();
    if (r < 0.45) disc(c, S, x, h * 0.35, 0.1, S.paper);
    else if (r < 0.75) block(c, S, x - 0.1, h * 0.2, 0.2, h * 0.3, 0.02, S.screen);
    else disc(c, S, x, h * 0.35, 0.08, S.leaf);
    disc(c, S, x, h * 0.72, 0.09, S.paper);
  }
};

const scaffold: FurnDraw = (c, S, w, h) => {
  /* 中間鋪的木板 */
  for (let y = h * 0.2; y < h * 0.8 - 0.1; y += 0.42)
    block(c, S, 0.1, y, w - 0.2, 0.36, 0.02, S.wood);
  /* 鋼管的框（每 1.8 m 一跨） */
  thin(c, S, 1.6, () => {
    seg(c, 0, 0.06, w, 0.06);
    seg(c, 0, h - 0.06, w, h - 0.06);
    for (let x = 0.06; x <= w; x += 3.6) seg(c, x, 0, x, h);
    seg(c, w - 0.06, 0, w - 0.06, h);
  });
  thin(c, S, 0.7, () => {
    for (let x = 0.06; x < w - 1; x += 3.6) seg(c, x, 0.06, Math.min(w - 0.06, x + 3.6), h - 0.06);
  });
};

const barricade: FurnDraw = (c, S, w, h) => {
  hazard(c, 0.15, h * 0.2, w - 0.3, h * 0.6, S.paper, S.alert, 0.25);
  rrect(c, 0.15, h * 0.2, w - 0.3, h * 0.6, 0.05);
  c.stroke();
  for (const x of [0, w - 0.3]) block(c, S, x, 0, 0.3, h, 0.05, S.shade);
};

const siteFence: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.tint);
  thin(c, S, 0.5, () => hatchCols(c, 0, w, 0, h, 0.5));
  c.save();
  c.fillStyle = S.screen;
  c.fillRect(0, h * 0.35, w, h * 0.3);
  c.restore();
  const pts: Pt[] = [];
  for (let x = 0.08; x < w; x += 1.8) pts.push([x, h / 2]);
  bolts(c, S, pts, 0.07);
};

/* ---------- 街道・公園 ---------- */

const road: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.tint);
  thin(c, S, 1.6, () =>
    inked(c, S.paper, () => {
      seg(c, 0.5, 0, 0.5, h);
      seg(c, w - 0.5, 0, w - 0.5, h);
    }),
  );
  /* 中線（虛線） */
  c.save();
  c.fillStyle = S.gold;
  for (let y = 0.4; y < h; y += 2.4) {
    c.fillRect(w / 2 - 0.08, y, 0.16, 1.2);
  }
  c.restore();
  thin(c, S, 0.4, () =>
    inked(c, S.faint, () => {
      seg(c, 0, 0, 0, h);
      seg(c, w, 0, w, h);
    }),
  );
};

const crosswalk: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.tint);
  c.save();
  c.fillStyle = S.paper;
  for (let x = 0.3; x < w - 0.3; x += 1.2) {
    c.fillRect(x, 0.3, 0.7, h - 0.6);
    c.strokeRect(x, 0.3, 0.7, h - 0.6);
  }
  c.restore();
};

const parkingStall: FurnDraw = (c, S, w, h) => {
  thin(c, S, 2, () =>
    inked(c, S.paper, () => {
      poly(
        c,
        [
          [0.1, h],
          [0.1, 0.1],
          [w - 0.1, 0.1],
          [w - 0.1, h],
        ],
        false,
      );
      c.stroke();
    }),
  );
  thin(c, S, 0.5, () => {
    poly(
      c,
      [
        [0, h],
        [0, 0],
        [w, 0],
        [w, h],
      ],
      false,
    );
    c.stroke();
  });
  block(c, S, w * 0.25, 0.7, w * 0.5, 0.35, 0.06, S.shade);
  word(c, S, 'P', w / 2, h * 0.6, Math.min(w * 0.4, 1.6), S.faint);
};

const roadArrow: FurnDraw = (c, S, w, h) => {
  poly(c, [
    [w / 2, 0.05],
    [w * 0.95, h * 0.4],
    [w * 0.65, h * 0.4],
    [w * 0.65, h - 0.05],
    [w * 0.35, h - 0.05],
    [w * 0.35, h * 0.4],
    [w * 0.05, h * 0.4],
  ]);
  thin(c, S, 0.5, () => paint(c, S.paper));
};

const roadSign: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  disc(c, S, w / 2, h / 2, R, S.alert);
  disc(c, S, w / 2, h / 2, R * 0.72, S.paper, false);
  c.save();
  c.fillStyle = S.alert;
  c.fillRect(w / 2 - R * 0.5, h / 2 - R * 0.14, R, R * 0.28);
  c.restore();
};

const trafficLight: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.1, w, h * 0.8, h * 0.3, S.ink);
  const r = Math.min(w * 0.13, h * 0.26);
  [S.leaf, S.gold, S.alert].forEach((col, i) => {
    disc(c, S, w * (0.22 + i * 0.28), h / 2, r, col);
  });
};

const cone: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.04, 0.04, w - 0.08, h - 0.08, 0.06, S.ink);
  const R = Math.min(w, h) * 0.38;
  disc(c, S, w / 2, h / 2, R, S.fire);
  disc(c, S, w / 2, h / 2, R * 0.62, S.paper);
  disc(c, S, w / 2, h / 2, R * 0.38, S.fire);
};

const bollardPost: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.03;
  disc(c, S, w / 2, h / 2, R, S.gold);
  thin(c, S, 0.6, () => ring(c, w / 2, h / 2, R * 0.6));
  disc(c, S, w / 2, h / 2, R * 0.3, S.ink);
};

const streetlight: FurnDraw = (c, S, w, h) => {
  c.save();
  c.globalAlpha = 0.45;
  c.fillStyle = S.gold;
  c.beginPath();
  c.arc(w * 0.62, h * 0.62, Math.min(w, h) * 0.36, 0, TAU);
  c.fill();
  c.restore();
  disc(c, S, w * 0.28, h * 0.28, Math.min(w, h) * 0.13, S.shade);
  thin(c, S, 1.4, () => seg(c, w * 0.28, h * 0.28, w * 0.58, h * 0.58));
  block(c, S, w * 0.5, h * 0.52, w * 0.24, h * 0.2, 0.05, S.paper);
};

const utilityPole: FurnDraw = (c, S, w, h) => {
  thin(c, S, 0.5, () => {
    for (const y of [h * 0.32, h * 0.5, h * 0.68]) seg(c, 0, y, w, y);
  });
  block(c, S, w * 0.08, h * 0.42, w * 0.84, h * 0.16, 0.03, S.wood);
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.18, S.shade);
  for (const x of [0.16, 0.84]) disc(c, S, w * x, h / 2, 0.06, S.paper);
};

const guardrail: FurnDraw = (c, S, w, h) => {
  const pts: Pt[] = [];
  for (let x = 0.3; x < w; x += 2) {
    block(c, S, x - 0.12, h * 0.4, 0.24, h * 0.56, 0.03, S.shade);
    pts.push([x, h * 0.32]);
  }
  block(c, S, 0, h * 0.1, w, h * 0.42, h * 0.2, S.tint);
  thin(c, S, 0.5, () => {
    seg(c, 0.1, h * 0.24, w - 0.1, h * 0.24);
    seg(c, 0.1, h * 0.38, w - 0.1, h * 0.38);
  });
  bolts(c, S, pts, 0.04);
};

const fenceItem: FurnDraw = (c, S, w, h) => {
  thin(c, S, 0.4, () => {
    c.beginPath();
    for (let x = -h; x < w; x += 0.2) {
      c.moveTo(Math.max(0, x), Math.max(0, -x) + h * 0.2);
      c.lineTo(Math.min(w, x + h), h * 0.8);
      c.moveTo(Math.max(0, x), h * 0.8);
      c.lineTo(Math.min(w, x + h), h * 0.2);
    }
    c.stroke();
  });
  thin(c, S, 1.1, () => {
    seg(c, 0, h * 0.2, w, h * 0.2);
    seg(c, 0, h * 0.8, w, h * 0.8);
  });
  for (let x = 0.1; x <= w; x += 1.3) disc(c, S, Math.min(x, w - 0.1), h / 2, h * 0.45, S.shade);
};

const hedge: FurnDraw = (c, S, w, h) => {
  c.save();
  c.strokeStyle = S.leafInk;
  c.beginPath();
  const n = Math.max(3, Math.round(w / 0.7));
  const bw = w / n;
  c.moveTo(0.1, h / 2);
  for (let i = 0; i < n; i++)
    c.quadraticCurveTo(bw * (i + 0.5), -h * 0.15, Math.min(w - 0.1, bw * (i + 1)), h * 0.2);
  for (let i = n - 1; i >= 0; i--)
    c.quadraticCurveTo(bw * (i + 0.5), h * 1.15, Math.max(0.1, bw * i), h * 0.8);
  c.closePath();
  paint(c, S.leaf);
  lw(c, S, 0.5);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    c.moveTo(bw * (i + 0.3), h * 0.5);
    c.lineTo(bw * (i + 0.7), h * 0.4);
  }
  c.stroke();
  c.restore();
};

const fountain: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.05;
  disc(c, S, w / 2, h / 2, R, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.86, S.water);
  thin(c, S, 0.4, () => {
    inked(c, S.paper, () => {
      ring(c, w / 2, h / 2, R * 0.6);
      ring(c, w / 2, h / 2, R * 0.72);
    });
  });
  disc(c, S, w / 2, h / 2, R * 0.38, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.24, S.water);
  disc(c, S, w / 2, h / 2, R * 0.1, S.tint);
  c.save();
  c.fillStyle = S.paper;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    c.beginPath();
    c.arc(w / 2 + Math.cos(a) * R * 0.5, h / 2 + Math.sin(a) * R * 0.5, 0.05, 0, TAU);
    c.fill();
  }
  c.restore();
};

const swing: FurnDraw = (c, S, w, h) => {
  thin(c, S, 1.3, () => {
    seg(c, 0.1, 0.1, 0.25, h / 2);
    seg(c, 0.1, h - 0.1, 0.25, h / 2);
    seg(c, w - 0.1, 0.1, w - 0.25, h / 2);
    seg(c, w - 0.1, h - 0.1, w - 0.25, h / 2);
  });
  block(c, S, 0.2, h / 2 - 0.08, w - 0.4, 0.16, 0.05, S.screen);
  for (const x of [w * 0.32, w * 0.68]) {
    thin(c, S, 0.6, () => seg(c, x, h / 2, x, h * 0.7));
    block(c, S, x - 0.3, h * 0.66, 0.6, 0.22, 0.05, S.wood);
  }
};

const slide: FurnDraw = (c, S, w, h) => {
  /* 上：梯子與平台；下：滑道 */
  thin(c, S, 1, () => {
    seg(c, w * 0.15, 0, w * 0.15, h * 0.3);
    seg(c, w * 0.85, 0, w * 0.85, h * 0.3);
    for (let y = 0.15; y < h * 0.3; y += 0.25) seg(c, w * 0.15, y, w * 0.85, y);
  });
  block(c, S, 0, h * 0.28, w, h * 0.14, 0.05, S.screen);
  poly(c, [
    [w * 0.12, h * 0.42],
    [w * 0.88, h * 0.42],
    [w * 0.95, h],
    [w * 0.05, h],
  ]);
  paint(c, S.gold);
  thin(c, S, 0.5, () => {
    seg(c, w * 0.22, h * 0.45, w * 0.18, h * 0.97);
    seg(c, w * 0.78, h * 0.45, w * 0.82, h * 0.97);
  });
};

const sandbox: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  block(c, S, 0.2, 0.2, w - 0.4, h - 0.4, 0.02, S.cloth);
  const rnd = seeded(91);
  c.save();
  c.fillStyle = S.wood;
  for (let i = 0; i < 18; i++) {
    c.beginPath();
    c.arc(0.3 + rnd() * (w - 0.6), 0.3 + rnd() * (h - 0.6), 0.03, 0, TAU);
    c.fill();
  }
  c.restore();
  disc(c, S, w * 0.66, h * 0.62, 0.24, S.alert);
  thin(c, S, 0.8, () => seg(c, w * 0.3, h * 0.35, w * 0.48, h * 0.55));
  oval(c, S, w * 0.28, h * 0.32, 0.14, 0.1, S.screen);
};

const gazebo: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.05;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * TAU + Math.PI / 6;
    return [w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R] as Pt;
  });
  poly(c, pts);
  paint(c, S.wood);
  thin(c, S, 0.6, () => {
    for (const [x, y] of pts) seg(c, w / 2, h / 2, x, y);
  });
  thin(c, S, 0.4, () => {
    poly(
      c,
      pts.map(([x, y]) => [w / 2 + (x - w / 2) * 0.6, h / 2 + (y - h / 2) * 0.6] as Pt),
    );
    c.stroke();
  });
  disc(c, S, w / 2, h / 2, R * 0.1, S.shade);
};

const shed: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.tint);
  thin(c, S, 0.5, () => hatchCols(c, 0, w, 0.05, h - 0.05, 0.25));
  thin(c, S, 1.2, () => seg(c, 0, h / 2, w, h / 2));
  block(c, S, w * 0.35, h - 0.12, w * 0.3, 0.14, 0.02, S.shade);
};

const puddle: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 19 + h * 23));
  blob(c, w / 2, h / 2, w * 0.47, h * 0.45, 9, 0.3, rnd);
  c.save();
  c.globalAlpha = 0.85;
  c.fillStyle = S.water;
  c.fill();
  c.restore();
  thin(c, S, 0.4, () => {
    inked(c, S.faint, () => c.stroke());
    inked(c, S.paper, () => {
      c.beginPath();
      c.ellipse(w * 0.4, h * 0.45, w * 0.12, h * 0.1, 0, 0, TAU);
      c.stroke();
      c.beginPath();
      c.ellipse(w * 0.62, h * 0.58, w * 0.07, h * 0.06, 0, 0, TAU);
      c.stroke();
    });
  });
};

/* ---------- 自然 ---------- */

const cliff: FurnDraw = (c, S, w, h) => {
  /* 上是台地、下是落差：崖緣的鋸齒＋往下的短線（地形圖的崖記號） */
  const rnd = seeded(Math.round(w * 7 + h * 5));
  const edge: Pt[] = [];
  const n = Math.max(6, Math.round(w / 0.5));
  for (let i = 0; i <= n; i++) edge.push([(w * i) / n, h * 0.42 + (rnd() - 0.5) * h * 0.14]);
  poly(c, [[0, 0], [w, 0], ...edge.slice().reverse()]);
  paint(c, S.tint, false);
  poly(c, [...edge, [w, h], [0, h]]);
  paint(c, S.shade, false);
  lw(c, S, 1.6);
  poly(c, edge, false);
  c.stroke();
  lw(c, S, 0.8);
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const [x0, y0] = edge[i];
    const [x1, y1] = edge[i + 1];
    for (let k = 0.25; k < 1; k += 0.5) {
      const x = x0 + (x1 - x0) * k;
      const y = y0 + (y1 - y0) * k;
      c.moveTo(x, y);
      c.lineTo(x + (rnd() - 0.5) * 0.1, y + h * (0.22 + rnd() * 0.2));
    }
  }
  c.stroke();
  lw(c, S);
  rubble(c, S, w / 2, h * 0.9, w * 0.45, h * 0.06, Math.round(w), 13, 0.1);
};

const landslide: FurnDraw = (c, S, w, h) => {
  c.beginPath();
  c.moveTo(w * 0.3, 0);
  c.lineTo(w * 0.7, 0);
  c.quadraticCurveTo(w * 1.02, h * 0.6, w * 0.92, h * 0.98);
  c.lineTo(w * 0.08, h * 0.98);
  c.quadraticCurveTo(-w * 0.02, h * 0.6, w * 0.3, 0);
  c.closePath();
  paint(c, S.cloth);
  thin(c, S, 0.5, () => {
    for (const k of [0.3, 0.5, 0.7]) {
      c.beginPath();
      c.moveTo(w * k, 0.1);
      c.quadraticCurveTo(w * (k + (k - 0.5) * 0.6), h * 0.5, w * (k + (k - 0.5) * 1.2), h * 0.95);
      c.stroke();
    }
  });
  rubble(c, S, w / 2, h * 0.7, w * 0.36, h * 0.24, 12, 57, 0.16);
};

export const OUTDOOR: Record<string, FurnDraw> = {
  pallet,
  pallet_stack: palletStack,
  cardboard,
  big_crate: bigCrate,
  container,
  drum,
  hand_cart: handCart,
  tool_shelf: toolShelf,
  machine_tool: machineTool,
  generator,
  ind_tank: indTank,
  conveyor,
  workbench,
  material_pile: materialPile,
  building_materials: buildingMaterials,
  pallet_rack: palletRack,
  supply_shelf: supplyShelf,
  scaffold,
  barricade,
  site_fence: siteFence,
  road,
  crosswalk,
  parking_stall: parkingStall,
  road_arrow: roadArrow,
  road_sign: roadSign,
  traffic_light: trafficLight,
  cone,
  bollard_post: bollardPost,
  streetlight,
  utility_pole: utilityPole,
  guardrail,
  fence_item: fenceItem,
  hedge,
  fountain,
  swing,
  slide,
  sandbox,
  gazebo,
  shed,
  puddle,
  cliff,
  landslide,
};
