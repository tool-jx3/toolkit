/**
 * 家具畫法（2026-10 第三批）：和風・寺社、日式庭園。全部是本站自己畫的。
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
} from './kit';
import { bolts, hatchCols, inked, type Pt, ring, thin, tube } from './parts';
import { blob, scallop } from './story';

/* ---------- 和風・寺社 ---------- */

/** 拉門（兩片錯開）：紙或布的門板＋格子 */
function slidingPanels(
  c: Ctx,
  S: FurnStyle,
  w: number,
  h: number,
  fill: string,
  grid: boolean,
): void {
  const pw = w * 0.52;
  for (const [x, y] of [
    [0, 0],
    [w - pw, h * 0.45],
  ] as const) {
    block(c, S, x, y, pw, h * 0.55, 0.01, fill);
    if (grid) thin(c, S, 0.4, () => hatchCols(c, x, x + pw, y, y + h * 0.55, pw / 5));
  }
}

const shoji: FurnDraw = (c, S, w, h) => slidingPanels(c, S, w, h, S.paper, true);

const fusuma: FurnDraw = (c, S, w, h) => {
  slidingPanels(c, S, w, h, S.cloth, false);
  disc(c, S, w * 0.44, h * 0.28, h * 0.12, S.shade);
  disc(c, S, w * 0.56, h * 0.72, h * 0.12, S.shade);
};

const byobu: FurnDraw = (c, S, w, h) => {
  const n = 6;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push([(w * i) / n, i % 2 ? h * 0.85 : h * 0.15]);
  lw(c, S, 2.8);
  poly(c, pts, false);
  c.stroke();
  c.save();
  c.strokeStyle = S.gold;
  lw(c, S, 1.6);
  c.stroke();
  c.restore();
  lw(c, S);
};

const engawaDeck: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.wood);
  thin(c, S, 0.45, () => hatchRows(c, 0, w, 0, h, h / 6));
  /* 板的接縫（錯開） */
  thin(c, S, 0.45, () => {
    c.beginPath();
    for (let r = 0; r < 6; r++) {
      const y0 = (h / 6) * r;
      for (let x = (r % 2) * 0.9 + 0.9; x < w; x += 1.8) {
        c.moveTo(x, y0);
        c.lineTo(x, y0 + h / 6);
      }
    }
    c.stroke();
  });
  /* 脫鞋石（前） */
  oval(c, S, w / 2, h - 0.05, 0.7, 0.18, S.tint);
};

const tatami: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0, S.cloth);
  thin(c, S, 0.3, () => inked(c, S.faint, () => hatchRows(c, 0.1, w - 0.1, 0, h, 0.12)));
  c.save();
  c.fillStyle = S.leafInk;
  c.fillRect(0, 0, 0.12, h);
  c.fillRect(w - 0.12, 0, 0.12, h);
  c.restore();
  rrect(c, 0, 0, w, h);
  c.stroke();
};

const zataku: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.25, S.wood);
  thin(c, S, 0.5, () => {
    rrect(c, 0.18, 0.18, w - 0.36, h - 0.36, 0.15);
    c.stroke();
  });
  disc(c, S, w * 0.66, h * 0.4, 0.15, S.paper);
  disc(c, S, w * 0.34, h * 0.6, 0.12, S.paper);
};

const zabuton: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.04, 0.04, w - 0.08, h - 0.08, 0.22, S.occultTint);
  thin(c, S, 0.4, () => {
    rrect(c, 0.16, 0.16, w - 0.32, h - 0.32, 0.16);
    c.stroke();
  });
  disc(c, S, w / 2, h / 2, 0.06, S.occult);
  c.save();
  c.fillStyle = S.occult;
  for (const [x, y] of [
    [0.06, 0.06],
    [w - 0.06, 0.06],
    [0.06, h - 0.06],
    [w - 0.06, h - 0.06],
  ] as const) {
    c.beginPath();
    c.arc(x, y, 0.05, 0, TAU);
    c.fill();
  }
  c.restore();
};

const katanakake: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.35, w, h * 0.3, 0.06, S.wood);
  for (const [y, len] of [
    [h * 0.25, 0.92],
    [h * 0.72, 0.75],
  ] as const) {
    c.save();
    c.beginPath();
    c.moveTo(w * 0.04, y);
    c.quadraticCurveTo(w * 0.5, y - h * 0.16, w * len, y);
    lw(c, S, 2.2);
    c.strokeStyle = S.ink;
    c.stroke();
    c.restore();
    disc(c, S, w * 0.3, y - h * 0.08, h * 0.1, S.gold);
  }
};

const andon: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.04, 0.04, w - 0.08, h - 0.08, 0.02, S.paper);
  c.save();
  c.globalAlpha = 0.6;
  c.fillStyle = S.gold;
  c.beginPath();
  c.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, TAU);
  c.fill();
  c.restore();
  thin(c, S, 0.5, () => {
    seg(c, w / 2, 0.04, w / 2, h - 0.04);
    seg(c, 0.04, h / 2, w - 0.04, h / 2);
  });
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.08, S.fire);
};

const buddhaAltar: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.wood);
  block(c, S, w * 0.08, h * 0.08, w * 0.84, h * 0.84, 0.03, S.gold);
  /* 本尊：光背、蓮台 */
  const cx = w / 2;
  const cy = h * 0.42;
  disc(c, S, cx, cy - h * 0.06, h * 0.3, S.paper);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    oval(
      c,
      S,
      cx + Math.cos(a) * h * 0.18,
      cy + Math.sin(a) * h * 0.16,
      h * 0.08,
      h * 0.06,
      S.cloth,
    );
  }
  disc(c, S, cx, cy, h * 0.14, S.gold);
  disc(c, S, cx, cy - h * 0.05, h * 0.06, S.shade);
  /* 前面的燭台與香爐 */
  disc(c, S, w * 0.18, h * 0.78, 0.12, S.fire);
  disc(c, S, w * 0.82, h * 0.78, 0.12, S.fire);
  disc(c, S, cx, h * 0.8, 0.2, S.shade);
};

const bonsho: FurnDraw = (c, S, w, h) => {
  /* 鐘樓的四根柱子、橫樑；中間的鐘與撞木 */
  c.save();
  c.fillStyle = S.wood;
  for (const [x, y] of [
    [0.15, 0.15],
    [w - 0.55, 0.15],
    [0.15, h - 0.55],
    [w - 0.55, h - 0.55],
  ] as const) {
    c.fillRect(x, y, 0.4, 0.4);
    c.strokeRect(x, y, 0.4, 0.4);
  }
  c.restore();
  thin(c, S, 1.2, () => {
    seg(c, 0.35, h / 2, w - 0.35, h / 2);
  });
  const R = Math.min(w, h) * 0.26;
  disc(c, S, w / 2, h / 2, R, S.shade);
  thin(c, S, 0.5, () => {
    ring(c, w / 2, h / 2, R * 0.7);
    ring(c, w / 2, h / 2, R * 0.4);
  });
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    pts.push([w / 2 + Math.cos(a) * R * 0.85, h / 2 + Math.sin(a) * R * 0.85]);
  }
  bolts(c, S, pts, R * 0.06);
  tube(c, S, w * 0.08, h * 0.78, w * 0.6, 0.3, S.wood);
};

const jizo: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2;
  disc(c, S, w / 2, h / 2, R * 0.92, S.tint);
  c.beginPath();
  c.moveTo(w / 2 - R * 0.7, h / 2 + R * 0.05);
  c.quadraticCurveTo(w / 2, h / 2 + R * 1.1, w / 2 + R * 0.7, h / 2 + R * 0.05);
  c.closePath();
  paint(c, S.alert);
  disc(c, S, w / 2, h / 2 - R * 0.2, R * 0.42, S.tint);
};

/* ---------- 日式庭園 ---------- */

const pond: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 31 + h * 41));
  blob(c, w / 2, h / 2, w * 0.48, h * 0.47, 12, 0.22, rnd);
  paint(c, S.water);
  /* 池邊的石頭 */
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + rnd() * 0.2;
    const k = 0.92 - rnd() * 0.12;
    oval(
      c,
      S,
      w / 2 + Math.cos(a) * w * 0.46 * k,
      h / 2 + Math.sin(a) * h * 0.45 * k,
      0.32,
      0.24,
      S.tint,
    );
  }
  /* 睡蓮與錦鯉 */
  for (const [x, y] of [
    [0.32, 0.38],
    [0.38, 0.45],
  ] as const)
    disc(c, S, w * x, h * y, 0.3, S.leaf);
  for (const [x, y, a] of [
    [0.6, 0.55, 0.4],
    [0.66, 0.42, 2.2],
  ] as const) {
    c.save();
    c.translate(w * x, h * y);
    c.rotate(a);
    oval(c, S, 0, 0, 0.32, 0.12, S.fire);
    poly(c, [
      [0.3, 0],
      [0.48, -0.12],
      [0.48, 0.12],
    ]);
    paint(c, S.fire);
    c.restore();
  }
};

const stoneBridge: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.1, 0, w - 0.2, h, 0.05, S.tint);
  thin(c, S, 0.5, () => hatchRows(c, 0.1, w - 0.1, 0, h, h / 3));
  c.save();
  c.fillStyle = S.shade;
  c.fillRect(0, 0.2, 0.18, h - 0.4);
  c.fillRect(w - 0.18, 0.2, 0.18, h - 0.4);
  c.restore();
};

const woodBridge: FurnDraw = (c, S, w, h) => {
  c.beginPath();
  c.moveTo(0.2, 0);
  c.quadraticCurveTo(-0.05, h / 2, 0.2, h);
  c.lineTo(w - 0.2, h);
  c.quadraticCurveTo(w + 0.05, h / 2, w - 0.2, 0);
  c.closePath();
  paint(c, S.wood);
  thin(c, S, 0.45, () => hatchRows(c, 0.15, w - 0.15, 0, h, 0.3));
  /* 朱色的欄杆 */
  c.save();
  c.strokeStyle = S.alert;
  lw(c, S, 2);
  c.beginPath();
  c.moveTo(0.25, 0.1);
  c.quadraticCurveTo(0.02, h / 2, 0.25, h - 0.1);
  c.moveTo(w - 0.25, 0.1);
  c.quadraticCurveTo(w - 0.02, h / 2, w - 0.25, h - 0.1);
  c.stroke();
  c.restore();
  for (const y of [0.1, h / 2, h - 0.1]) {
    const dx = y === h / 2 ? 0.12 : 0.25;
    disc(c, S, dx, y, 0.1, S.alert);
    disc(c, S, w - dx, y, 0.1, S.alert);
  }
};

const stepping: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 3 + h * 59));
  const n = Math.max(3, Math.round(h / 1.1));
  for (let i = 0; i < n; i++) {
    const y = (h / n) * (i + 0.5);
    const x = w / 2 + (i % 2 ? 1 : -1) * w * 0.18;
    blob(c, x, y, w * 0.3, (h / n) * 0.36, 7, 0.25, rnd);
    paint(c, S.tint);
  }
};

const gardenRock: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 71 + h * 13));
  blob(c, w / 2, h / 2, w * 0.47, h * 0.45, 9, 0.25, rnd, false);
  paint(c, S.tint);
  c.save();
  c.globalAlpha = 0.8;
  blob(c, w * 0.62, h * 0.62, w * 0.2, h * 0.16, 7, 0.3, rnd);
  c.fillStyle = S.leaf;
  c.fill();
  c.restore();
  thin(c, S, 0.5, () => {
    seg(c, w * 0.3, h * 0.35, w * 0.48, h * 0.5);
  });
};

const bambooFence: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, h * 0.15, w, h * 0.7, h * 0.3, S.wood);
  thin(c, S, 0.5, () => hatchCols(c, 0, w, h * 0.15, h * 0.85, 0.4));
  thin(c, S, 1, () => inked(c, S.ink, () => seg(c, 0, h / 2, w, h / 2)));
  for (let x = 0.15; x < w; x += 1.5) disc(c, S, x, h / 2, h * 0.32, S.wood);
};

const pine: FurnDraw = (c, S, w, h) => {
  /* 一層一層的雲形樹冠 */
  c.save();
  c.strokeStyle = S.leafInk;
  for (const [x, y, r] of [
    [0.32, 0.36, 0.26],
    [0.66, 0.3, 0.22],
    [0.6, 0.68, 0.28],
    [0.3, 0.7, 0.2],
  ] as const) {
    scallop(c, w * x, h * y, Math.min(w, h) * r, 7);
    paint(c, S.leaf);
    thin(c, S, 0.4, () => {
      c.beginPath();
      c.ellipse(w * x, h * y, Math.min(w, h) * r * 0.5, Math.min(w, h) * r * 0.3, 0, 0, TAU);
      c.stroke();
    });
  }
  c.restore();
  thin(c, S, 1.6, () =>
    inked(c, S.wood, () => {
      c.beginPath();
      c.moveTo(w / 2, h / 2);
      c.quadraticCurveTo(w * 0.42, h * 0.45, w * 0.32, h * 0.36);
      c.moveTo(w / 2, h / 2);
      c.lineTo(w * 0.66, h * 0.3);
      c.moveTo(w / 2, h / 2);
      c.lineTo(w * 0.6, h * 0.68);
      c.stroke();
    }),
  );
  disc(c, S, w / 2, h / 2, Math.min(w, h) * 0.07, S.wood);
};

const bamboo: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 17 + h * 37));
  /* 葉子 */
  c.save();
  c.fillStyle = S.leaf;
  c.strokeStyle = S.leafInk;
  for (let i = 0; i < 22; i++) {
    const x = w * (0.1 + rnd() * 0.8);
    const y = h * (0.1 + rnd() * 0.8);
    c.save();
    c.translate(x, y);
    c.rotate(rnd() * TAU);
    c.beginPath();
    c.ellipse(0, 0, 0.32, 0.07, 0, 0, TAU);
    c.fill();
    lw(c, S, 0.4);
    c.stroke();
    c.restore();
  }
  c.restore();
  /* 竹竿（一節一節的圓） */
  for (let i = 0; i < 6; i++) {
    const x = w * (0.25 + rnd() * 0.5);
    const y = h * (0.25 + rnd() * 0.5);
    disc(c, S, x, y, 0.13, S.leafInk);
    thin(c, S, 0.4, () => inked(c, S.leaf, () => ring(c, x, y, 0.07)));
  }
};

const moss: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 23 + h * 7));
  blob(c, w / 2, h / 2, w * 0.48, h * 0.46, 11, 0.25, rnd);
  c.save();
  c.fillStyle = S.leaf;
  c.globalAlpha = 0.75;
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = S.leafInk;
  for (let i = 0; i < 40; i++) {
    const a = rnd() * TAU;
    const d = Math.sqrt(rnd()) * 0.85;
    c.beginPath();
    c.arc(w / 2 + Math.cos(a) * d * w * 0.45, h / 2 + Math.sin(a) * d * h * 0.42, 0.035, 0, TAU);
    c.fill();
  }
  c.restore();
};

const tsukubai: FurnDraw = (c, S, w, h) => {
  for (const [x, y, r] of [
    [0.18, 0.78, 0.2],
    [0.84, 0.72, 0.17],
    [0.5, 0.92, 0.14],
  ] as const)
    disc(c, S, w * x, h * y, Math.min(w, h) * r, S.tint);
  const R = Math.min(w, h) * 0.34;
  disc(c, S, w / 2, h * 0.42, R, S.tint);
  disc(c, S, w / 2, h * 0.42, R * 0.48, S.water);
  thin(c, S, 1, () => seg(c, w * 0.22, h * 0.25, w * 0.62, h * 0.48));
  oval(c, S, w * 0.66, h * 0.5, 0.1, 0.08, S.wood);
};

const shishiodoshi: FurnDraw = (c, S, w, h) => {
  disc(c, S, w * 0.82, h / 2, Math.min(w * 0.16, h * 0.42), S.tint);
  disc(c, S, w * 0.82, h / 2, Math.min(w * 0.08, h * 0.22), S.water);
  for (const y of [h * 0.18, h * 0.82]) block(c, S, w * 0.38, y - 0.1, 0.2, 0.2, 0.03, S.wood);
  c.save();
  c.translate(w * 0.45, h / 2);
  c.rotate(-0.08);
  block(c, S, -w * 0.4, -h * 0.13, w * 0.78, h * 0.26, h * 0.12, S.leaf);
  thin(c, S, 0.5, () => {
    seg(c, -w * 0.1, -h * 0.13, -w * 0.1, h * 0.13);
    seg(c, w * 0.2, -h * 0.13, w * 0.2, h * 0.13);
  });
  c.restore();
  thin(c, S, 0.8, () => seg(c, w * 0.48, h * 0.18, w * 0.48, h * 0.82));
};

const teaHouse: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.cloth);
  thin(c, S, 0.4, () => inked(c, S.faint, () => hatchCols(c, 0, w, 0.05, h - 0.05, 0.3)));
  /* 寄棟屋頂：屋脊＋往四個角的線 */
  thin(c, S, 1.2, () => {
    seg(c, w * 0.3, h / 2, w * 0.7, h / 2);
    seg(c, w * 0.3, h / 2, 0, 0);
    seg(c, w * 0.3, h / 2, 0, h);
    seg(c, w * 0.7, h / 2, w, 0);
    seg(c, w * 0.7, h / 2, w, h);
  });
  rrect(c, 0, 0, w, h, 0.05);
  c.stroke();
  /* 躙口（前，小小的入口） */
  block(c, S, w * 0.42, h - 0.18, w * 0.16, 0.18, 0.02, S.shade);
};

export const JAPANESE: Record<string, FurnDraw> = {
  shoji,
  fusuma,
  byobu,
  engawa_deck: engawaDeck,
  tatami,
  zataku,
  zabuton,
  katanakake,
  andon,
  buddha_altar: buddhaAltar,
  bonsho,
  jizo,
  pond,
  stone_bridge: stoneBridge,
  wood_bridge: woodBridge,
  stepping,
  garden_rock: gardenRock,
  bamboo_fence: bambooFence,
  pine,
  bamboo,
  moss,
  tsukubai,
  shishiodoshi,
  tea_house: teaHouse,
};
