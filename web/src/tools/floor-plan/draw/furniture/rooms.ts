/**
 * 家具畫法（2026-10 第三批）：臥室、辦公・商店、醫院・研究、學校・文化的新家具。全部是本站自己畫的。
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
  seeded,
  seg,
  TAU,
} from './kit';
import { bolts, hatchCols, hazard, inked, type Pt, ring, thin } from './parts';

/** 床墊＋枕頭＋棉被（背面在上） */
function mattress(
  c: Ctx,
  S: FurnStyle,
  x: number,
  y: number,
  w: number,
  h: number,
  quilt: string,
): void {
  block(c, S, x, y, w, h, 0.08, S.paper);
  block(c, S, x + w * 0.12, y + 0.12, w * 0.76, Math.min(0.55, h * 0.16), 0.1, S.tint);
  block(c, S, x, y + h * 0.3, w, h * 0.7, 0.08, quilt);
  thin(c, S, 0.5, () => seg(c, x, y + h * 0.38, x + w, y + h * 0.38));
}

/* ---------- 臥室 ---------- */

const bedCanopy: FurnDraw = (c, S, w, h) => {
  mattress(c, S, 0.25, 0.25, w - 0.5, h - 0.5, S.occultTint);
  /* 四根柱子、半透明的帷幔 */
  c.save();
  c.globalAlpha = 0.35;
  c.fillStyle = S.occultTint;
  c.fillRect(0.1, 0.1, w - 0.2, h - 0.2);
  c.restore();
  thin(c, S, 0.5, () => {
    c.setLineDash([S.lw * 2, S.lw * 2]);
    rrect(c, 0.1, 0.1, w - 0.2, h - 0.2);
    c.stroke();
    c.setLineDash([]);
    for (let x = 0.4; x < w - 0.3; x += 0.5) {
      seg(c, x, 0.1, x, 0.35);
      seg(c, x, h - 0.1, x, h - 0.35);
    }
  });
  for (const [x, y] of [
    [0.1, 0.1],
    [w - 0.1, 0.1],
    [0.1, h - 0.1],
    [w - 0.1, h - 0.1],
  ] as const)
    disc(c, S, x, y, 0.16, S.wood);
};

const bunkBed: FurnDraw = (c, S, w, h) => {
  /* 下鋪（虛線，被上鋪擋住）＋上鋪＋梯子 */
  thin(c, S, 0.5, () => {
    c.setLineDash([S.lw * 2, S.lw * 2]);
    rrect(c, 0.06, 0.06, w - 0.12, h - 0.12, 0.08);
    c.stroke();
  });
  mattress(c, S, 0.14, 0.14, w - 0.28, h - 0.28, S.water);
  thin(c, S, 1.6, () =>
    inked(c, S.wood, () => {
      rrect(c, 0.04, 0.04, w - 0.08, h - 0.08, 0.06);
      c.stroke();
    }),
  );
  block(c, S, w - 0.3, h * 0.55, 0.3, h * 0.42, 0.04, S.wood);
  thin(c, S, 0.6, () => hatchRows(c, w - 0.3, w, h * 0.55, h * 0.97, 0.22));
};

/* ---------- 辦公・商店 ---------- */

/** 架上的商品（色塊） */
function goods(
  c: Ctx,
  S: FurnStyle,
  x0: number,
  x1: number,
  y: number,
  hh: number,
  seed: number,
): void {
  const rnd = seeded(seed);
  const cols = [S.alert, S.gold, S.screen, S.leaf, S.paper, S.fire];
  c.save();
  for (let x = x0; x < x1 - 0.1; ) {
    const wd = 0.14 + rnd() * 0.16;
    c.fillStyle = cols[Math.floor(rnd() * cols.length)];
    c.fillRect(x, y, Math.min(wd, x1 - x), hh);
    c.strokeRect(x, y, Math.min(wd, x1 - x), hh);
    x += wd + 0.03;
  }
  c.restore();
}

const storeShelf: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.tint);
  thin(c, S, 1.2, () => seg(c, 0.05, h / 2, w - 0.05, h / 2));
  lw(c, S, 0.5);
  goods(c, S, 0.1, w - 0.1, 0.1, h * 0.32, 3);
  goods(c, S, 0.1, w - 0.1, h * 0.58, h * 0.32, 9);
  lw(c, S);
  block(c, S, -0.0, 0, 0.18, h, 0.02, S.shade);
  block(c, S, w - 0.18, 0, 0.18, h, 0.02, S.shade);
};

const register: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  block(c, S, w * 0.08, h * 0.12, w * 0.28, h * 0.55, 0.04, S.shade);
  block(c, S, w * 0.12, h * 0.18, w * 0.2, h * 0.2, 0.02, S.screen);
  thin(c, S, 0.4, () => {
    for (let y = h * 0.44; y < h * 0.64; y += h * 0.08)
      for (let x = w * 0.12; x < w * 0.32; x += w * 0.05) c.strokeRect(x, y, w * 0.035, h * 0.05);
  });
  /* 收銀台上的小東西（口香糖、袋子） */
  block(c, S, w * 0.5, h * 0.2, w * 0.18, h * 0.3, 0.03, S.paper);
  disc(c, S, w * 0.82, h * 0.4, h * 0.14, S.gold);
  thin(c, S, 0.5, () => seg(c, 0.05, h * 0.82, w - 0.05, h * 0.82));
};

const fridgeCase: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.shade);
  block(c, S, 0.08, 0.08, w - 0.16, h * 0.6, 0.02, S.tint);
  const rnd = seeded(37);
  const cols = [S.alert, S.leaf, S.screen, S.gold, S.paper];
  c.save();
  for (let x = 0.2; x < w - 0.12; x += 0.2) {
    c.fillStyle = cols[Math.floor(rnd() * cols.length)];
    c.beginPath();
    c.arc(x, h * 0.25, 0.07, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(x, h * 0.5, 0.07, 0, TAU);
    c.fill();
  }
  c.restore();
  /* 玻璃門 */
  c.save();
  c.globalAlpha = 0.45;
  c.fillStyle = S.water;
  c.fillRect(0.06, h * 0.7, w - 0.12, h * 0.26);
  c.restore();
  thin(c, S, 0.5, () => hatchCols(c, 0.06, w - 0.06, h * 0.7, h * 0.96, w / 4));
};

const atm: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.tint);
  block(c, S, w * 0.12, h * 0.35, w * 0.46, h * 0.36, 0.03, S.screen);
  thin(c, S, 0.4, () => {
    for (let y = h * 0.36; y < h * 0.7; y += h * 0.11)
      for (let x = w * 0.66; x < w * 0.9; x += w * 0.08) c.strokeRect(x, y, w * 0.06, h * 0.08);
  });
  thin(c, S, 1, () => inked(c, S.ink, () => seg(c, w * 0.2, h * 0.84, w * 0.5, h * 0.84)));
  block(c, S, 0, 0, w, h * 0.18, 0.04, S.screen);
};

const deskIsland: FurnDraw = (c, S, w, h) => {
  const d = 1.3;
  /* 四張桌子（中間兩兩相對）＋隔板＋椅子＋螢幕 */
  for (const [x, y] of [
    [w / 2 - 2.2, h / 2 - d],
    [w / 2, h / 2 - d],
    [w / 2 - 2.2, h / 2],
    [w / 2, h / 2],
  ] as const)
    block(c, S, x, y, 2.2, d, 0.04, S.wood);
  block(c, S, w / 2 - 2.2, h / 2 - 0.06, 4.4, 0.12, 0.02, S.cloth);
  for (const [x, y] of [
    [w / 2 - 1.4, h / 2 - d + 0.35],
    [w / 2 + 0.8, h / 2 - d + 0.35],
    [w / 2 - 1.4, h / 2 + 0.85],
    [w / 2 + 0.8, h / 2 + 0.85],
  ] as const)
    block(c, S, x, y - 0.25, 0.6, 0.12, 0.02, S.screen);
  for (const x of [w / 2 - 1.5, w / 2 + 0.7]) {
    c.save();
    c.translate(x + 0.4, 0.45);
    c.rotate(Math.PI);
    chairTop(c, S, -0.4, -0.45, 0.8, 0.9);
    c.restore();
    chairTop(c, S, x, h - 0.95, 0.8, 0.9);
  }
};

const partition: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.cloth);
  thin(c, S, 0.5, () => hatchCols(c, 0, w, 0, h, 1.2));
  for (const x of [0.25, w - 0.25]) block(c, S, x - 0.2, -0.1, 0.4, h + 0.2, 0.03, S.shade);
};

const monitorWall: FurnDraw = (c, S, w, h) => {
  const n = Math.max(2, Math.round(w / 1.4));
  const mw = w / n;
  for (let i = 0; i < n; i++) {
    block(c, S, mw * i + 0.03, 0, mw - 0.06, h * 0.8, 0.02, S.ink);
    block(c, S, mw * i + 0.1, h * 0.12, mw - 0.2, h * 0.56, 0, S.screen);
  }
  block(c, S, 0, h * 0.75, w, h * 0.25, 0.02, S.shade);
};

/* ---------- 醫院・研究 ---------- */

const fumeHood: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.tint);
  disc(c, S, w * 0.82, h * 0.25, h * 0.14, S.shade);
  block(c, S, 0.1, h * 0.42, w - 0.2, h * 0.5, 0.02, S.paper);
  c.save();
  c.globalAlpha = 0.5;
  c.fillStyle = S.water;
  c.fillRect(0.06, h * 0.82, w - 0.12, h * 0.16);
  c.restore();
  thin(c, S, 0.6, () => seg(c, 0.06, h * 0.82, w - 0.06, h * 0.82));
  for (const [x, col] of [
    [0.25, S.leaf],
    [0.4, S.water],
    [0.55, S.paper],
  ] as const)
    disc(c, S, w * x, h * 0.62, h * 0.09, col);
  poly(c, [
    [w * 0.12, h * 0.1],
    [w * 0.2, h * 0.3],
    [w * 0.04, h * 0.3],
  ]);
  paint(c, S.gold);
};

const microscope: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.12, h * 0.55, w * 0.76, h * 0.4, 0.06, S.tint);
  block(c, S, w * 0.4, h * 0.12, w * 0.2, h * 0.55, 0.05, S.shade);
  disc(c, S, w / 2, h * 0.42, Math.min(w, h) * 0.14, S.paper);
  disc(c, S, w / 2, h * 0.16, Math.min(w, h) * 0.1, S.ink);
  block(c, S, w * 0.3, h * 0.7, w * 0.4, h * 0.1, 0.02, S.water);
};

const freezer: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.06, S.paper);
  block(c, S, w * 0.1, h * 0.12, w * 0.36, h * 0.2, 0.02, S.screen);
  thin(c, S, 0.5, () =>
    inked(c, S.water, () => {
      for (let i = 0; i < 4; i++) {
        const x = w * (0.2 + i * 0.18);
        seg(c, x, h * 0.45, x + 0.12, h * 0.75);
        seg(c, x + 0.12, h * 0.45, x, h * 0.75);
      }
    }),
  );
  thin(c, S, 1.4, () => seg(c, w * 0.15, h * 0.9, w * 0.85, h * 0.9));
};

const deconShower: FurnDraw = (c, S, w, h) => {
  hazard(c, 0, 0, w, h, S.gold, S.ink, 0.2);
  block(c, S, 0.2, 0.2, w - 0.4, h - 0.4, 0.04, S.water);
  const pts: Pt[] = [];
  for (const y of [0.4, 0.6])
    for (const x of [0.4, 0.6]) {
      disc(c, S, w * x, h * y, 0.14, S.tint);
      pts.push([w * x, h * y]);
    }
  bolts(c, S, pts, 0.03);
  disc(c, S, w / 2, h / 2, 0.08, S.ink);
  rrect(c, 0, 0, w, h);
  c.stroke();
};

/* ---------- 學校・文化 ---------- */

const displayCase: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.04, S.wood);
  c.save();
  c.globalAlpha = 0.6;
  c.fillStyle = S.water;
  c.fillRect(0.12, 0.12, w - 0.24, h - 0.24);
  c.restore();
  rrect(c, 0.12, 0.12, w - 0.24, h - 0.24);
  c.stroke();
  oval(c, S, w * 0.32, h / 2, w * 0.12, h * 0.22, S.gold);
  disc(c, S, w * 0.68, h / 2, Math.min(w, h) * 0.2, S.paper);
  thin(c, S, 0.5, () => ring(c, w * 0.68, h / 2, Math.min(w, h) * 0.12));
  thin(c, S, 0.5, () => inked(c, S.paper, () => seg(c, 0.2, 0.3, w * 0.4, 0.2)));
};

const painting: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.gold);
  c.save();
  c.fillStyle = S.leaf;
  c.fillRect(0.12, h * 0.3, w * 0.45, h * 0.4);
  c.fillStyle = S.screen;
  c.fillRect(0.12 + w * 0.45, h * 0.3, w - 0.24 - w * 0.45, h * 0.4);
  c.restore();
};

const pedestal: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.tint);
  block(c, S, 0.15, 0.15, w - 0.3, h - 0.3, 0.02, S.paper);
  c.beginPath();
  c.moveTo(w * 0.35, h * 0.62);
  c.bezierCurveTo(w * 0.2, h * 0.3, w * 0.55, h * 0.18, w * 0.62, h * 0.38);
  c.bezierCurveTo(w * 0.72, h * 0.6, w * 0.58, h * 0.72, w * 0.35, h * 0.62);
  c.closePath();
  paint(c, S.shade);
  block(c, S, w * 0.35, h * 0.84, w * 0.3, 0.12, 0.02, S.gold);
};

const ropeBarrier: FurnDraw = (c, S, w, h) => {
  const posts = [0.25, w / 2, w - 0.25];
  c.save();
  c.strokeStyle = S.alert;
  lw(c, S, 2);
  for (let i = 0; i < posts.length - 1; i++) {
    c.beginPath();
    c.moveTo(posts[i], h / 2);
    c.quadraticCurveTo((posts[i] + posts[i + 1]) / 2, h * 0.95, posts[i + 1], h / 2);
    c.stroke();
  }
  c.restore();
  for (const x of posts) disc(c, S, x, h / 2, h * 0.45, S.gold);
};

const skeleton: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.1, S.tint);
  /* 背骨（左尾右頭）、肋骨、腳、頭骨 */
  const spine = (x: number) => h * 0.5 + Math.sin((x / w) * Math.PI * 1.2) * h * 0.08;
  thin(c, S, 1.4, () => {
    c.beginPath();
    for (let x = 0.5; x <= w * 0.82; x += 0.25) {
      if (x === 0.5) c.moveTo(x, spine(x));
      else c.lineTo(x, spine(x));
    }
    c.stroke();
  });
  const pts: Pt[] = [];
  for (let x = 0.7; x < w * 0.8; x += 0.5) pts.push([x, spine(x)]);
  bolts(c, S, pts, 0.07);
  thin(c, S, 0.9, () => {
    for (let x = w * 0.42; x < w * 0.68; x += 0.45) {
      c.beginPath();
      c.ellipse(x, spine(x), 0.25, h * 0.26, 0, -Math.PI * 0.45, Math.PI * 0.45);
      c.stroke();
      c.beginPath();
      c.ellipse(x, spine(x), 0.25, h * 0.26, 0, Math.PI * 0.55, Math.PI * 1.45);
      c.stroke();
    }
    for (const [x, dir] of [
      [0.38, -1],
      [0.38, 1],
      [0.66, -1],
      [0.66, 1],
    ] as const) {
      const y = spine(w * x);
      seg(c, w * x, y, w * x + 0.4, y + dir * h * 0.3);
      seg(c, w * x + 0.4, y + dir * h * 0.3, w * x + 0.2, y + dir * h * 0.42);
    }
  });
  c.beginPath();
  c.moveTo(w * 0.82, spine(w * 0.82) - h * 0.1);
  c.lineTo(w * 0.98, spine(w * 0.82) - h * 0.04);
  c.lineTo(w * 0.98, spine(w * 0.82) + h * 0.06);
  c.lineTo(w * 0.82, spine(w * 0.82) + h * 0.1);
  c.closePath();
  paint(c, S.paper);
  disc(c, S, w * 0.88, spine(w * 0.82) - h * 0.02, 0.12, S.ink);
};

const organ: FurnDraw = (c, S, w, h) => {
  /* 後面一排管子、前面的鍵盤與椅子 */
  const n = Math.max(5, Math.round(w / 0.32));
  for (let i = 0; i < n; i++) {
    const x = (w / n) * (i + 0.5);
    const r = 0.09 + 0.05 * Math.sin((i / (n - 1)) * Math.PI);
    disc(c, S, x, 0.3, r, S.gold);
  }
  block(c, S, 0, h * 0.35, w, h * 0.38, 0.04, S.wood);
  block(c, S, w * 0.2, h * 0.45, w * 0.6, h * 0.12, 0, S.paper);
  block(c, S, w * 0.2, h * 0.58, w * 0.6, h * 0.12, 0, S.paper);
  thin(c, S, 0.4, () => {
    hatchCols(c, w * 0.2, w * 0.8, h * 0.45, h * 0.57, 0.1);
    hatchCols(c, w * 0.2, w * 0.8, h * 0.58, h * 0.7, 0.1);
  });
  block(c, S, w * 0.3, h * 0.8, w * 0.4, h * 0.16, 0.04, S.wood);
};

const font: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  poly(
    c,
    Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * TAU + Math.PI / 8;
      return [w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R] as Pt;
    }),
  );
  paint(c, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.66, S.water);
  thin(c, S, 0.8, () =>
    inked(c, S.paper, () => {
      seg(c, w / 2, h / 2 - R * 0.36, w / 2, h / 2 + R * 0.36);
      seg(c, w / 2 - R * 0.22, h / 2 - R * 0.1, w / 2 + R * 0.22, h / 2 - R * 0.1);
    }),
  );
};

const confessional: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  const cw = w / 3;
  for (let i = 0; i < 3; i++) {
    block(c, S, cw * i + 0.1, 0.1, cw - 0.2, h - 0.35, 0.03, i === 1 ? S.shade : S.cloth);
    /* 門口的布簾 */
    c.save();
    c.fillStyle = i === 1 ? S.wood : S.alert;
    c.fillRect(cw * i + 0.1, h - 0.3, cw - 0.2, 0.2);
    c.restore();
  }
  thin(c, S, 0.5, () => {
    c.setLineDash([S.lw, S.lw * 1.4]);
    seg(c, cw, h * 0.25, cw, h * 0.6);
    seg(c, cw * 2, h * 0.25, cw * 2, h * 0.6);
  });
  disc(c, S, w / 2, h * 0.4, 0.22, S.tint);
};

export const ROOMS: Record<string, FurnDraw> = {
  bed_canopy: bedCanopy,
  bunk_bed: bunkBed,
  store_shelf: storeShelf,
  register,
  fridge_case: fridgeCase,
  atm,
  desk_island: deskIsland,
  partition,
  monitor_wall: monitorWall,
  fume_hood: fumeHood,
  microscope,
  freezer,
  decon_shower: deconShower,
  display_case: displayCase,
  painting,
  pedestal,
  rope_barrier: ropeBarrier,
  skeleton,
  organ,
  font,
  confessional,
};
