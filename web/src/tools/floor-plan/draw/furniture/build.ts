/**
 * 家具畫法（2026-10 第三批）：樓梯・結構、貼牆素材、設備・管線、軍事・保全。全部是本站自己畫的。
 * 貼牆素材的 y＝h/2 是牆線（放的時候吸到牆線上），x 沿著牆。
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
import {
  bolts,
  crossHatch,
  curve,
  fan,
  grille,
  hatchCols,
  hazard,
  inked,
  type Pt,
  ring,
  rubble,
  taper,
  thin,
  tube,
} from './parts';

/* ---------- 樓梯・結構 ---------- */

/** 走向的箭頭（從 y1 走到 y2） */
function walkArrow(c: Ctx, S: FurnStyle, x: number, y1: number, y2: number): void {
  const dir = y2 < y1 ? -1 : 1;
  inked(c, S.chalk, () => {
    lw(c, S, 1.1);
    seg(c, x, y1, x, y2 - dir * 0.3);
    poly(c, [
      [x, y2],
      [x - 0.22, y2 - dir * 0.38],
      [x + 0.22, y2 - dir * 0.38],
    ]);
    c.fill();
  });
}

const stairsDown: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h);
  /* 往下走的那一頭越來越暗 */
  const n = Math.max(3, Math.round(h / 0.55));
  const step = h / n;
  c.save();
  c.fillStyle = S.shade;
  for (let i = 0; i < n; i++) {
    c.globalAlpha = (i / n) * 0.55;
    c.fillRect(0, h - step * (i + 1), w, step);
  }
  c.restore();
  thin(c, S, 0.6, () => hatchRows(c, 0, w, 0, h, step));
  rrect(c, 0, 0, w, h);
  c.stroke();
  walkArrow(c, S, w / 2, h - 0.35, 0.35);
  word(c, S, 'B', w * 0.8, h - 0.4, Math.min(0.42, w * 0.3), S.chalk);
};

const trapdoor: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.wood);
  thin(c, S, 0.5, () => hatchCols(c, 0, w, 0.06, h - 0.06, w / 4));
  /* 鉸鍊（靠牆的一邊）與拉環 */
  c.save();
  c.fillStyle = S.ink;
  c.fillRect(w * 0.18, 0.05, w * 0.16, h * 0.08);
  c.fillRect(w * 0.66, 0.05, w * 0.16, h * 0.08);
  c.restore();
  thin(c, S, 1.4, () => ring(c, w / 2, h * 0.8, Math.min(w, h) * 0.08));
  thin(c, S, 0.6, () => {
    c.setLineDash([S.lw * 2, S.lw * 1.6]);
    rrect(c, 0.12, 0.12, w - 0.24, h - 0.24);
    c.stroke();
  });
};

const ladder: FurnDraw = (c, S, w, h) => {
  lw(c, S, 1.6);
  seg(c, w * 0.18, 0, w * 0.18, h);
  seg(c, w * 0.82, 0, w * 0.82, h);
  lw(c, S, 1.1);
  for (let y = 0.25; y < h - 0.1; y += 0.3) seg(c, w * 0.18, y, w * 0.82, y);
  lw(c, S);
};

const fireEscape: FurnDraw = (c, S, w, h) => {
  const land = Math.min(1.6, h * 0.28);
  block(c, S, 0, 0, w, h, 0, S.tint);
  /* 上（建物側）與下的平台：格柵 */
  for (const [y0, y1] of [
    [0, land],
    [h - land * 0.9, h],
  ] as const) {
    block(c, S, 0, y0, w, y1 - y0, 0, S.paper);
    thin(c, S, 0.4, () => {
      hatchCols(c, 0, w, y0, y1, 0.22);
      hatchRows(c, 0, w, y0, y1, 0.22);
    });
  }
  /* 中間兩段樓梯（折返） */
  const y0 = land;
  const y1 = h - land * 0.9;
  for (const x of [0, w / 2]) {
    block(c, S, x + 0.1, y0, w / 2 - 0.2, y1 - y0, 0, S.paper);
    thin(c, S, 0.55, () => hatchRows(c, x + 0.1, x + w / 2 - 0.1, y0, y1, 0.4));
  }
  walkArrow(c, S, w * 0.25, y1 - 0.2, y0 + 0.2);
  walkArrow(c, S, w * 0.75, y0 + 0.2, y1 - 0.2);
  /* 外圍的扶手 */
  lw(c, S, 1.8);
  poly(
    c,
    [
      [0, 0],
      [0, h],
      [w, h],
      [w, 0],
    ],
    false,
  );
  c.stroke();
  lw(c, S);
};

const extStairs: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.paper);
  const side = Math.min(0.32, w * 0.14);
  block(c, S, 0, 0, side, h, 0, S.shade);
  block(c, S, w - side, 0, side, h, 0, S.shade);
  thin(c, S, 0.6, () => hatchRows(c, side, w - side, 0, h, h / Math.max(3, Math.round(h / 0.5))));
  walkArrow(c, S, w / 2, h - 0.35, 0.35);
};

const tempStairs: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.tint);
  thin(c, S, 0.5, () => {
    seg(c, 0.1, 0.1, w - 0.1, h - 0.1);
    seg(c, w - 0.1, 0.1, 0.1, h - 0.1);
  });
  const n = Math.max(3, Math.round(h / 0.5));
  for (let i = 0; i < n; i++) {
    const y = (h / n) * i + 0.08;
    block(c, S, 0.12, y, w - 0.24, h / n - 0.16, 0.02, S.paper);
  }
  hazard(c, 0, h - 0.26, w, 0.26, S.gold, S.ink, 0.16);
  lw(c, S, 1.6);
  seg(c, 0, 0, 0, h);
  seg(c, w, 0, w, h);
  lw(c, S);
  walkArrow(c, S, w / 2, h - 0.5, 0.4);
};

const handrail: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.2, w, h * 0.6, h * 0.3, S.wood);
  for (let x = 0.3; x < w; x += 1.2) disc(c, S, x, h / 2, h * 0.42, S.shade);
};

const vent: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.tint);
  block(c, S, w * 0.14, h * 0.14, w * 0.72, h * 0.72, 0.02, S.shade);
  thin(c, S, 0.7, () => {
    inked(c, S.paper, () => hatchRows(c, w * 0.18, w * 0.82, h * 0.14, h * 0.86, h * 0.12));
  });
  bolts(
    c,
    S,
    [
      [w * 0.07, h * 0.07],
      [w * 0.93, h * 0.07],
      [w * 0.07, h * 0.93],
      [w * 0.93, h * 0.93],
    ],
    Math.min(w, h) * 0.035,
  );
};

const duct: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.tint);
  thin(c, S, 0.6, () => {
    for (let x = 1.5; x < w - 0.2; x += 1.5) seg(c, x, 0, x, h);
  });
  thin(c, S, 0.4, () => {
    inked(c, S.faint, () => seg(c, 0.1, h / 2, w - 0.1, h / 2));
  });
  const pts: Pt[] = [];
  for (let x = 1.5; x < w - 0.2; x += 1.5) pts.push([x - 0.1, 0.15], [x - 0.1, h - 0.15]);
  bolts(c, S, pts, 0.035);
};

const manhole: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  disc(c, S, w / 2, h / 2, R, S.shade);
  disc(c, S, w / 2, h / 2, R * 0.86, S.tint);
  c.save();
  c.beginPath();
  c.arc(w / 2, h / 2, R * 0.8, 0, TAU);
  c.clip();
  thin(c, S, 0.45, () => crossHatch(c, w / 2 - R * 0.8, h / 2 - R * 0.8, R * 1.6, 0.16));
  c.restore();
  for (const dx of [-0.32, 0.32]) disc(c, S, w / 2 + dx * R, h / 2, R * 0.08, S.ink);
};

const gutter: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.tint);
  block(c, S, 0, h * 0.25, w, h * 0.5, 0, S.shade);
  thin(c, S, 0.5, () => {
    inked(c, S.water, () => seg(c, 0, h / 2, w, h / 2));
  });
};

const grating: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.shade);
  thin(c, S, 0.9, () => inked(c, S.paper, () => hatchCols(c, 0.08, w - 0.08, 0.1, h - 0.1, 0.18)));
  thin(c, S, 1.2, () => {
    rrect(c, 0, 0, w, h);
    c.stroke();
  });
};

/* ---------- 貼牆素材（牆線在 y＝h/2） ---------- */

/** 裂縫：外框用線色、中間用背景色（深色的牆上也看得到） */
function fissure(c: Ctx, S: FurnStyle, pts: readonly Pt[], k = 1): void {
  c.save();
  c.lineJoin = 'miter';
  poly(c, pts, false);
  lw(c, S, 2.4 * k);
  c.strokeStyle = S.ink;
  c.stroke();
  lw(c, S, 1.1 * k);
  c.strokeStyle = S.gap;
  c.stroke();
  c.restore();
}

const crackWall: FurnDraw = (c, S, w, h) => {
  const m = h / 2;
  const rnd = seeded(Math.round(w * 37 + h * 11));
  const main: Pt[] = [];
  const n = Math.max(6, Math.round(w / 0.3));
  for (let i = 0; i <= n; i++) main.push([w * (0.04 + (0.92 * i) / n), m + (rnd() - 0.5) * 0.14]);
  fissure(c, S, main);
  /* 往牆的兩側分岔 */
  for (const [f, dir] of [
    [0.28, -1],
    [0.5, 1],
    [0.72, -1],
    [0.84, 1],
  ] as const) {
    const [x0, y0] = main[Math.round(f * n)];
    fissure(
      c,
      S,
      [
        [x0, y0],
        [x0 + 0.08, y0 + dir * h * 0.18],
        [x0 - 0.04, y0 + dir * h * 0.3],
        [x0 + 0.06, y0 + dir * h * 0.42],
      ],
      0.7,
    );
  }
  rubble(c, S, w * 0.5, m + h * 0.36, w * 0.4, h * 0.06, 4, 7, 0.06);
};

const collapseWall: FurnDraw = (c, S, w, h) => {
  const m = h / 2;
  const rnd = seeded(Math.round(w * 61 + h * 7));
  const a = w * 0.14;
  const b = w * 0.86;
  const top: Pt[] = [];
  const bot: Pt[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const bulge = 0.24 + 0.08 * Math.sin((Math.PI * i) / n);
    top.push([x, m - bulge - rnd() * 0.05]);
    bot.push([x, m + bulge + rnd() * 0.05]);
  }
  /* 牆被打掉的地方：背景色，兩端參差 */
  poly(c, [
    ...top,
    [b + 0.12, m - 0.1],
    [b - 0.05, m],
    [b + 0.1, m + 0.12],
    ...bot.reverse(),
    [a - 0.1, m + 0.1],
    [a + 0.06, m],
    [a - 0.12, m - 0.12],
  ]);
  c.save();
  c.fillStyle = S.gap;
  c.fill();
  c.restore();
  thin(c, S, 0.6, () => c.stroke());
  /* 兩側崩落的瓦礫 */
  rubble(c, S, w / 2, m - h * 0.3, w * 0.38, h * 0.14, Math.round(w * 4), 19, 0.12);
  rubble(c, S, w / 2, m + h * 0.3, w * 0.4, h * 0.16, Math.round(w * 4), 23, 0.14);
};

const wallHole: FurnDraw = (c, S, w, h) => {
  const m = h / 2;
  const rnd = seeded(Math.round(w * 83 + h * 3));
  const pts: Pt[] = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 0.75 + rnd() * 0.3;
    pts.push([w / 2 + Math.cos(a) * w * 0.26 * k, m + Math.sin(a) * h * 0.3 * k]);
  }
  poly(c, pts);
  c.save();
  c.fillStyle = S.gap;
  c.fill();
  c.restore();
  thin(c, S, 0.7, () => c.stroke());
  fissure(
    c,
    S,
    [
      [w * 0.74, m - 0.02],
      [w * 0.84, m + 0.05],
      [w * 0.95, m - 0.03],
    ],
    0.7,
  );
  fissure(
    c,
    S,
    [
      [w * 0.25, m + 0.02],
      [w * 0.14, m - 0.04],
      [w * 0.05, m + 0.02],
    ],
    0.7,
  );
  rubble(c, S, w / 2, m + h * 0.36, w * 0.22, h * 0.08, 5, 31, 0.06);
  rubble(c, S, w / 2, m - h * 0.36, w * 0.2, h * 0.08, 4, 37, 0.06);
};

const bulletHoles: FurnDraw = (c, S, w, h) => {
  const m = h / 2;
  const rnd = seeded(Math.round(w * 13 + h * 29));
  for (let i = 0; i < 7; i++) {
    const x = w * (0.12 + rnd() * 0.76);
    const y = m + (rnd() - 0.5) * h * 0.5;
    const r = 0.04 + rnd() * 0.025;
    /* 放射狀的小裂痕＋洞 */
    thin(c, S, 0.5, () =>
      inked(c, S.gap, () => {
        c.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = rnd() * TAU;
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(a) * r * 2.6, y + Math.sin(a) * r * 2.6);
        }
        c.stroke();
      }),
    );
    disc(c, S, x, y, r, S.ink);
    thin(c, S, 0.5, () => inked(c, S.gap, () => ring(c, x, y, r * 1.5)));
  }
};

const tendrils: FurnDraw = (c, S, w, h) => {
  /* 從下面（牆的一側）長出來、越過牆往另一側伸的觸手 */
  const arms: { a: Pt; ctrl: Pt; b: Pt; w0: number }[] = [
    { a: [w * 0.18, h], ctrl: [w * 0.05, h * 0.45], b: [w * 0.22, h * 0.08], w0: 0.36 },
    { a: [w * 0.42, h], ctrl: [w * 0.55, h * 0.5], b: [w * 0.38, h * 0.12], w0: 0.44 },
    { a: [w * 0.62, h], ctrl: [w * 0.5, h * 0.62], b: [w * 0.72, h * 0.04], w0: 0.4 },
    { a: [w * 0.86, h], ctrl: [w * 0.98, h * 0.5], b: [w * 0.88, h * 0.22], w0: 0.3 },
  ];
  for (const t of arms) {
    const pts = curve(t.a, t.ctrl, t.b, 14);
    taper(c, pts, t.w0, 0.02);
    paint(c, S.occult);
    for (let i = 3; i < 12; i += 2) {
      const [x, y] = pts[i];
      disc(c, S, x, y, (t.w0 * (1 - i / 14)) / 4, S.occultTint);
    }
  }
  /* 根部 */
  oval(c, S, w / 2, h * 0.98, w * 0.42, h * 0.08, S.occult);
};

const wallGraffiti: FurnDraw = (c, S, w, h) => {
  const m = h / 2;
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  /* 噴漆：一個大圈、一條箭頭、一個叉 */
  lw(c, S, 2.6);
  c.strokeStyle = S.alert;
  c.beginPath();
  c.ellipse(w * 0.2, m, w * 0.12, h * 0.32, 0.2, 0, TAU);
  c.stroke();
  c.strokeStyle = S.screen;
  poly(
    c,
    [
      [w * 0.38, m + h * 0.2],
      [w * 0.5, m - h * 0.2],
      [w * 0.6, m + h * 0.15],
      [w * 0.72, m - h * 0.25],
    ],
    false,
  );
  c.stroke();
  poly(
    c,
    [
      [w * 0.66, m - h * 0.28],
      [w * 0.73, m - h * 0.26],
      [w * 0.73, m - h * 0.12],
    ],
    false,
  );
  c.stroke();
  c.strokeStyle = S.gold;
  seg(c, w * 0.8, m - h * 0.25, w * 0.93, m + h * 0.25);
  seg(c, w * 0.93, m - h * 0.25, w * 0.8, m + h * 0.25);
  c.restore();
  /* 往下流的漆 */
  inked(c, S.alert, () => {
    for (const x of [0.16, 0.27]) c.fillRect(w * x, m + h * 0.25, 0.05, h * 0.2);
  });
};

const wallClaws: FurnDraw = (c, S, w, h) => {
  for (let i = 0; i < 4; i++) {
    const x = w * (0.2 + i * 0.2);
    const pts: Pt[] = [
      [x - w * 0.08, h * 0.08],
      [x + 0.02, h * 0.5],
      [x + w * 0.06, h * 0.92],
      [x - 0.04, h * 0.5],
    ];
    poly(c, pts);
    c.save();
    c.fillStyle = S.gap;
    c.fill();
    c.restore();
    thin(c, S, 0.6, () => c.stroke());
  }
};

/** 手印：手掌＋五根手指（手指朝 -y） */
function handprint(c: Ctx, x: number, y: number, s: number, a: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.beginPath();
  c.ellipse(0, 0, s * 0.42, s * 0.5, 0, 0, TAU);
  c.fill();
  for (const [dx, len] of [
    [-0.3, 0.5],
    [-0.1, 0.62],
    [0.1, 0.6],
    [0.28, 0.48],
  ] as const) {
    c.beginPath();
    c.ellipse(dx * s, -s * (0.45 + len * 0.45), s * 0.09, s * len * 0.45, 0, 0, TAU);
    c.fill();
  }
  c.beginPath();
  c.ellipse(-s * 0.5, s * 0.02, s * 0.1, s * 0.28, -0.8, 0, TAU);
  c.fill();
  c.restore();
}

const wallBlood: FurnDraw = (c, S, w, h) => {
  c.save();
  c.fillStyle = S.blood;
  handprint(c, w * 0.3, h * 0.55, Math.min(h * 0.55, w * 0.3), -0.25);
  handprint(c, w * 0.68, h * 0.45, Math.min(h * 0.5, w * 0.28), 0.3);
  /* 拖過去的血 */
  c.globalAlpha = 0.7;
  c.beginPath();
  c.moveTo(w * 0.78, h * 0.6);
  c.quadraticCurveTo(w * 0.9, h * 0.75, w * 0.98, h * 0.7);
  c.lineTo(w * 0.97, h * 0.78);
  c.quadraticCurveTo(w * 0.86, h * 0.84, w * 0.76, h * 0.7);
  c.closePath();
  c.fill();
  c.restore();
};

const wallMold: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 47 + h * 17));
  /* 水漬的環（淡）＋霉斑（一點一點） */
  c.save();
  c.globalAlpha = 0.55;
  c.fillStyle = S.water;
  c.beginPath();
  c.ellipse(w * 0.55, h * 0.55, w * 0.4, h * 0.36, 0.1, 0, TAU);
  c.fill();
  c.globalAlpha = 1;
  thin(c, S, 0.5, () => {
    c.strokeStyle = S.faint;
    c.stroke();
  });
  c.fillStyle = S.leafInk;
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd());
    const x = w * 0.5 + Math.cos(a) * d * w * 0.4;
    const y = h * 0.5 + Math.sin(a) * d * h * 0.38;
    c.globalAlpha = 0.45 + rnd() * 0.4;
    c.beginPath();
    c.arc(x, y, 0.03 + rnd() * 0.06, 0, TAU);
    c.fill();
  }
  c.restore();
};

/* ---------- 設備・管線 ---------- */

const breaker: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.shade);
  block(c, S, w * 0.12, h * 0.2, w * 0.76, h * 0.6, 0.02, S.tint);
  lw(c, S, 1.4);
  seg(c, w * 0.3, h / 2, w * 0.7, h / 2);
  lw(c, S);
  disc(c, S, w * 0.7, h / 2, h * 0.12, S.alert);
};

const distBoard: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.tint);
  thin(c, S, 0.5, () => seg(c, w / 2, 0, w / 2, h));
  c.save();
  c.fillStyle = S.ink;
  for (let i = 0; i < 6; i++) {
    const x = w * (0.1 + (i % 3) * 0.12) + (i >= 3 ? w * 0.5 : 0);
    c.fillRect(x, h * 0.3, w * 0.07, h * 0.36);
  }
  c.restore();
  poly(c, [
    [w * 0.5, h * 0.82],
    [w * 0.44, h * 0.98],
    [w * 0.56, h * 0.98],
  ]);
  paint(c, S.gold);
};

const controlPanel: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.tint);
  block(c, S, w * 0.08, h * 0.15, w * 0.34, h * 0.55, 0.02, S.screen);
  disc(c, S, w * 0.6, h * 0.45, h * 0.24, S.paper);
  thin(c, S, 1.1, () => seg(c, w * 0.6, h * 0.45, w * 0.66, h * 0.3));
  for (const [x, col] of [
    [0.8, S.alert],
    [0.9, S.leaf],
  ] as const) {
    disc(c, S, w * x, h * 0.35, h * 0.1, col);
    disc(c, S, w * x, h * 0.68, h * 0.1, S.gold);
  }
};

const serviceEntrance: FurnDraw = (c, S, w, h) => {
  tube(c, S, w * 0.4, 0, w * 0.2, h * 0.4, S.shade);
  block(c, S, 0, h * 0.2, w, h * 0.8, 0.04, S.tint);
  disc(c, S, w / 2, h * 0.6, Math.min(w, h) * 0.26, S.paper);
  thin(c, S, 0.8, () => seg(c, w / 2, h * 0.6, w * 0.62, h * 0.5));
};

const cableRack: FurnDraw = (c, S, w, h) => {
  lw(c, S, 1.2);
  seg(c, 0, 0.04, w, 0.04);
  seg(c, 0, h - 0.04, w, h - 0.04);
  lw(c, S, 0.6);
  for (let x = 0.25; x < w; x += 0.5) seg(c, x, 0.04, x, h - 0.04);
  lw(c, S, 1.3);
  for (const [y, col] of [
    [0.3, S.ink],
    [0.5, S.alert],
    [0.7, S.shade],
  ] as const)
    inked(c, col, () => {
      c.beginPath();
      for (let x = 0; x <= w; x += 0.25) {
        const yy = h * y + Math.sin(x * 2.2 + y * 7) * h * 0.05;
        if (x === 0) c.moveTo(x, yy);
        else c.lineTo(x, yy);
      }
      c.stroke();
    });
  lw(c, S);
};

/** 管子＋每隔一段的接頭（法蘭） */
function pipeRun(c: Ctx, S: FurnStyle, w: number, h: number, fill: string, every: number): void {
  const d = h * 0.7;
  tube(c, S, 0, (h - d) / 2, w, d, fill);
  for (let x = every / 2; x < w; x += every) {
    block(c, S, x - h * 0.08, 0, h * 0.16, h, h * 0.04, S.shade);
  }
}

const pipe: FurnDraw = (c, S, w, h) => pipeRun(c, S, w, h, S.tint, 2);

const pipeBig: FurnDraw = (c, S, w, h) => {
  pipeRun(c, S, w, h, S.tint, 2.6);
  const pts: Pt[] = [];
  for (let x = 1.3; x < w; x += 2.6) pts.push([x, h * 0.12], [x, h * 0.88]);
  bolts(c, S, pts, 0.04);
};

const waterPipe: FurnDraw = (c, S, w, h) => {
  pipeRun(c, S, w, h, S.water, 3);
  disc(c, S, w / 2, h / 2, h * 0.7, null);
  thin(c, S, 0.6, () => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      seg(c, w / 2, h / 2, w / 2 + Math.cos(a) * h * 0.7, h / 2 + Math.sin(a) * h * 0.7);
    }
  });
};

const valve: FurnDraw = (c, S, w, h) => {
  tube(c, S, 0, h * 0.38, w, h * 0.24, S.tint);
  const R = Math.min(w, h) / 2 - 0.04;
  thin(c, S, 1.6, () => ring(c, w / 2, h / 2, R));
  thin(c, S, 0.9, () => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      seg(c, w / 2, h / 2, w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R);
    }
  });
  disc(c, S, w / 2, h / 2, R * 0.25, S.alert);
};

const pump: FurnDraw = (c, S, w, h) => {
  tube(c, S, 0, h * 0.4, w * 0.2, h * 0.2, S.tint);
  block(c, S, w * 0.12, h * 0.15, w * 0.46, h * 0.7, 0.08, S.tint);
  thin(c, S, 0.5, () => hatchCols(c, w * 0.12, w * 0.58, h * 0.2, h * 0.8, 0.14));
  disc(c, S, w * 0.72, h / 2, Math.min(w * 0.22, h * 0.42), S.shade);
  disc(c, S, w * 0.72, h / 2, Math.min(w * 0.08, h * 0.15), S.ink);
  tube(c, S, w * 0.66, 0, w * 0.12, h * 0.2, S.tint);
};

const boiler: FurnDraw = (c, S, w, h) => {
  disc(c, S, w * 0.82, h * 0.18, Math.min(w, h) * 0.12, S.shade);
  block(c, S, 0.05, h * 0.12, w - 0.1, h * 0.84, h * 0.4, S.tint);
  thin(c, S, 0.5, () => {
    for (const x of [0.3, 0.55, 0.8]) seg(c, w * x, h * 0.14, w * x, h * 0.94);
  });
  block(c, S, w * 0.32, h * 0.66, w * 0.36, h * 0.26, 0.05, S.shade);
  c.save();
  c.fillStyle = S.fire;
  rrect(c, w * 0.38, h * 0.72, w * 0.24, h * 0.12, 0.04);
  c.fill();
  c.restore();
  for (const x of [0.16, 0.84]) {
    disc(c, S, w * x, h * 0.6, h * 0.1, S.paper);
    thin(c, S, 0.6, () => seg(c, w * x, h * 0.6, w * x + h * 0.06, h * 0.55));
  }
};

const bigTank: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.05;
  disc(c, S, w / 2, h / 2, R, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.92, null);
  thin(c, S, 0.5, () => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      seg(
        c,
        w / 2 + Math.cos(a) * R * 0.2,
        h / 2 + Math.sin(a) * R * 0.2,
        w / 2 + Math.cos(a) * R * 0.92,
        h / 2 + Math.sin(a) * R * 0.92,
      );
    }
  });
  disc(c, S, w / 2, h / 2, R * 0.18, S.shade);
  /* 外側的梯子 */
  thin(c, S, 0.8, () => {
    const a = Math.PI * 0.25;
    const x = w / 2 + Math.cos(a) * R;
    const y = h / 2 + Math.sin(a) * R;
    seg(c, x - 0.2, y - 0.05, x + 0.15, y + 0.4);
    seg(c, x + 0.05, y - 0.25, x + 0.4, y + 0.2);
  });
};

const emGenerator: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.12, S.leaf);
  block(c, S, w * 0.06, h * 0.14, w * 0.5, h * 0.72, 0.04, S.tint);
  thin(c, S, 0.6, () => hatchCols(c, w * 0.06, w * 0.56, h * 0.18, h * 0.82, 0.2));
  block(c, S, w * 0.64, h * 0.2, w * 0.28, h * 0.4, 0.03, S.paper);
  disc(c, S, w * 0.72, h * 0.32, h * 0.06, S.alert);
  disc(c, S, w * 0.84, h * 0.32, h * 0.06, S.leaf);
  disc(c, S, w * 0.8, h * 0.78, h * 0.12, S.shade);
};

const acUnit: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.paper);
  thin(c, S, 0.5, () => hatchCols(c, 0.08, w * 0.45, 0.1, h - 0.1, 0.1));
  fan(c, S, w * 0.7, h / 2, Math.min(w * 0.24, h * 0.42), 3);
  grille(c, S, w * 0.7, h / 2, Math.min(w * 0.24, h * 0.42), 2);
};

const waterTower: FurnDraw = (c, S, w, h) => {
  c.save();
  c.fillStyle = S.ink;
  for (const [x, y] of [
    [0.1, 0.1],
    [w - 0.4, 0.1],
    [0.1, h - 0.4],
    [w - 0.4, h - 0.4],
  ] as const)
    c.fillRect(x, y, 0.3, 0.3);
  c.restore();
  thin(c, S, 0.6, () => {
    seg(c, 0.25, 0.25, w - 0.25, h - 0.25);
    seg(c, w - 0.25, 0.25, 0.25, h - 0.25);
  });
  const R = Math.min(w, h) * 0.38;
  disc(c, S, w / 2, h / 2, R, S.water);
  thin(c, S, 0.5, () => ring(c, w / 2, h / 2, R * 0.75));
  disc(c, S, w / 2, h / 2, R * 0.22, S.tint);
};

const ventUnit: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.tint);
  fan(c, S, w / 2, h / 2, Math.min(w, h) * 0.4, 4);
  bolts(
    c,
    S,
    [
      [0.15, 0.15],
      [w - 0.15, 0.15],
      [0.15, h - 0.15],
      [w - 0.15, h - 0.15],
    ],
    0.05,
  );
};

const antenna: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.35, h * 0.35, w * 0.3, h * 0.3, 0.03, S.shade);
  thin(c, S, 0.5, () => {
    c.setLineDash([S.lw * 2, S.lw * 2]);
    for (const [x, y] of [
      [0.05, 0.05],
      [w - 0.05, 0.05],
      [0.05, h - 0.05],
      [w - 0.05, h - 0.05],
    ] as const)
      seg(c, w / 2, h / 2, x, y);
  });
  /* 碟形天線 */
  oval(c, S, w * 0.5, h * 0.42, w * 0.32, h * 0.26, S.paper);
  thin(c, S, 0.5, () => {
    c.beginPath();
    c.ellipse(w * 0.5, h * 0.42, w * 0.18, h * 0.14, 0, 0, TAU);
    c.stroke();
  });
  thin(c, S, 1, () => seg(c, w * 0.5, h * 0.42, w * 0.5, h * 0.72));
  disc(c, S, w * 0.5, h * 0.74, 0.06, S.ink);
};

const extinguisher: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) * 0.36;
  disc(c, S, w / 2, h * 0.55, R, S.alert);
  block(c, S, w * 0.38, h * 0.1, w * 0.24, h * 0.22, 0.02, S.ink);
  thin(c, S, 1, () => {
    c.beginPath();
    c.moveTo(w * 0.62, h * 0.2);
    c.quadraticCurveTo(w * 0.95, h * 0.3, w * 0.86, h * 0.75);
    c.stroke();
  });
};

const hydrant: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.alert);
  block(c, S, w * 0.06, h * 0.18, w * 0.6, h * 0.66, 0.02, S.paper);
  thin(c, S, 0.7, () => {
    for (let i = 1; i <= 3; i++) ring(c, w * 0.36, h * 0.51, Math.min(w * 0.1, h * 0.3) * (i / 3));
  });
  disc(c, S, w * 0.82, h / 2, h * 0.2, S.gold);
};

const sluice: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.5, w, h * 0.5, 0, S.water);
  thin(c, S, 0.5, () =>
    inked(c, S.paper, () => {
      for (let x = 0.6; x < w - 1; x += 1.2) seg(c, x, h * 0.78, x + 0.5, h * 0.78);
    }),
  );
  block(c, S, 0, 0, 0.7, h, 0.02, S.shade);
  block(c, S, w - 0.7, 0, 0.7, h, 0.02, S.shade);
  block(c, S, 0.7, h * 0.32, w - 1.4, h * 0.22, 0, S.tint);
  thin(c, S, 0.5, () => hatchCols(c, 0.7, w - 0.7, h * 0.32, h * 0.54, 0.6));
  disc(c, S, 0.35, h * 0.35, 0.22, S.paper);
  thin(c, S, 0.6, () => {
    seg(c, 0.13, h * 0.35, 0.57, h * 0.35);
    seg(c, 0.35, h * 0.35 - 0.22, 0.35, h * 0.35 + 0.22);
  });
};

/* ---------- 軍事・保全 ---------- */

const opsTable: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.08, S.wood);
  block(c, S, 0.25, 0.25, w - 0.5, h - 0.5, 0.02, S.paper);
  const rnd = seeded(71);
  c.save();
  c.beginPath();
  c.rect(0.25, 0.25, w - 0.5, h - 0.5);
  c.clip();
  c.fillStyle = S.leaf;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.ellipse(
      0.6 + rnd() * (w - 1.2),
      0.6 + rnd() * (h - 1.2),
      0.5 + rnd() * 0.6,
      0.3 + rnd() * 0.4,
      rnd() * 3,
      0,
      TAU,
    );
    c.fill();
  }
  thin(c, S, 0.5, () =>
    inked(c, S.water, () => {
      c.beginPath();
      c.moveTo(0.25, h * 0.7);
      c.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.9, w - 0.25, h * 0.6);
      c.stroke();
    }),
  );
  c.restore();
  for (const [x, y, col] of [
    [0.3, 0.4, S.screen],
    [0.42, 0.55, S.screen],
    [0.7, 0.35, S.alert],
    [0.62, 0.62, S.alert],
  ] as const) {
    poly(c, [
      [w * x, h * y - 0.14],
      [w * x - 0.12, h * y + 0.1],
      [w * x + 0.12, h * y + 0.1],
    ]);
    paint(c, col);
  }
};

const radio: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.leaf);
  thin(c, S, 0.5, () => hatchCols(c, w * 0.05, w * 0.4, h * 0.2, h * 0.8, 0.1));
  for (const x of [0.52, 0.68]) disc(c, S, w * x, h * 0.45, h * 0.15, S.tint);
  block(c, S, w * 0.78, h * 0.25, w * 0.16, h * 0.5, 0.06, S.ink);
  thin(c, S, 1, () => seg(c, w * 0.08, h * 0.15, w * 0.02, -h * 0.1 + 0.1));
};

const gunRack: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.35, 0.02, S.wood);
  const n = Math.max(2, Math.round(w / 0.7));
  for (let i = 0; i < n; i++) {
    const x = (w / n) * (i + 0.5);
    /* 槍托在下、槍管往上 */
    block(c, S, x - 0.09, h * 0.55, 0.18, h * 0.4, 0.04, S.wood);
    lw(c, S, 1.4);
    seg(c, x, h * 0.05, x, h * 0.58);
    lw(c, S);
  }
};

const tankMil: FurnDraw = (c, S, w, h) => {
  const track = w * 0.2;
  for (const x of [0, w - track]) {
    block(c, S, x, 0, track, h, 0.15, S.ink);
    thin(c, S, 0.6, () =>
      inked(c, S.shade, () => hatchRows(c, x + 0.08, x + track - 0.08, 0, h, 0.35)),
    );
  }
  block(c, S, track - 0.1, h * 0.04, w - track * 2 + 0.2, h * 0.92, 0.2, S.leaf);
  thin(c, S, 0.5, () => {
    seg(c, track, h * 0.2, w - track, h * 0.2);
    seg(c, track, h * 0.86, w - track, h * 0.86);
  });
  /* 砲塔與砲管（車頭朝下） */
  block(c, S, w / 2 - 0.18, h * 0.5, 0.36, h * 0.52, 0.1, S.leafInk);
  disc(c, S, w / 2, h * 0.45, w * 0.28, S.leaf);
  disc(c, S, w / 2 - w * 0.1, h * 0.4, w * 0.07, S.tint);
};

const sandbags: FurnDraw = (c, S, w, h) => {
  const bw = 0.95;
  for (const [row, off] of [
    [0, 0],
    [1, bw / 2],
  ] as const) {
    const y = row * (h / 2);
    for (let x = -off; x < w - 0.05; x += bw) {
      const x0 = Math.max(0, x);
      const x1 = Math.min(w, x + bw);
      if (x1 - x0 < 0.2) continue;
      block(c, S, x0 + 0.02, y + 0.03, x1 - x0 - 0.04, h / 2 - 0.06, 0.2, S.cloth);
    }
  }
};

const cctv: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.3, 0, w * 0.4, h * 0.2, 0.02, S.shade);
  thin(c, S, 1.2, () => seg(c, w / 2, h * 0.2, w / 2, h * 0.35));
  block(c, S, w * 0.25, h * 0.3, w * 0.5, h * 0.62, 0.06, S.paper);
  disc(c, S, w / 2, h * 0.86, w * 0.16, S.screen);
};

const cardReader: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.shade);
  disc(c, S, w * 0.75, h * 0.5, Math.min(w, h) * 0.18, S.leaf);
  thin(c, S, 0.8, () => inked(c, S.paper, () => seg(c, w * 0.15, h * 0.5, w * 0.5, h * 0.5)));
};

const alarm: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.3, 0.02, S.shade);
  disc(c, S, w / 2, h * 0.55, Math.min(w * 0.42, h * 0.45), S.alert);
  thin(c, S, 0.5, () => ring(c, w / 2, h * 0.55, Math.min(w * 0.26, h * 0.28)));
  disc(c, S, w / 2, h * 0.55, Math.min(w, h) * 0.06, S.ink);
};

export const BUILD: Record<string, FurnDraw> = {
  stairs_down: stairsDown,
  trapdoor,
  ladder,
  fire_escape: fireEscape,
  ext_stairs: extStairs,
  temp_stairs: tempStairs,
  handrail,
  vent,
  duct,
  manhole,
  gutter,
  grating,
  crack_wall: crackWall,
  collapse_wall: collapseWall,
  wall_hole: wallHole,
  bullet_holes: bulletHoles,
  tendrils,
  wall_graffiti: wallGraffiti,
  wall_claws: wallClaws,
  wall_blood: wallBlood,
  wall_mold: wallMold,
  breaker,
  dist_board: distBoard,
  control_panel: controlPanel,
  service_entrance: serviceEntrance,
  cable_rack: cableRack,
  pipe,
  pipe_big: pipeBig,
  water_pipe: waterPipe,
  valve,
  pump,
  boiler,
  big_tank: bigTank,
  em_generator: emGenerator,
  ac_unit: acUnit,
  water_tower: waterTower,
  vent_unit: ventUnit,
  antenna,
  extinguisher,
  hydrant,
  sluice,
  ops_table: opsTable,
  radio,
  gun_rack: gunRack,
  tank_mil: tankMil,
  sandbags,
  cctv,
  card_reader: cardReader,
  alarm,
};
