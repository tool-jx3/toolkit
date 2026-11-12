/**
 * 家具畫法（2026-11-12 參考 KIIN「マップ制作スタジオ」v3.0 的和家具、日本庭園與「事件・痕跡」；規格 F334）：
 * 暖桌、圓矮桌、和式衣櫃、茶櫃、壁櫥、神棚、火盆、盛鹽、葫蘆池、屋敷稻荷、封鎖的木板、封印的符咒、拖行的血跡、
 * 散落的紙張、摔破的碗盤。全部是本站自己畫的線畫（顏色只用樣式的家具配色，七種樣式都畫得出來）。
 */
import {
  block,
  type Ctx,
  disc,
  type FurnDraw,
  type FurnStyle,
  lw,
  oval,
  paint,
  poly,
  rrect,
  seeded,
  seg,
  TAU,
} from './kit';
import { inked, type Pt, ring, thin } from './parts';
import { blob } from './story';

/* ---------- 和家具 ---------- */

/** 暖桌：外面一圈棉被（圓角、四邊微微下垂的波紋）、中間的方桌面、上面兩顆橘子 */
const kotatsu: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.04, 0.04, w - 0.08, h - 0.08, Math.min(w, h) * 0.12, S.cloth);
  thin(c, S, 0.45, () =>
    inked(c, S.faint, () => {
      c.beginPath();
      for (const k of [0.16, 0.84]) {
        c.moveTo(w * 0.12, h * k);
        c.quadraticCurveTo(w / 2, h * (k < 0.5 ? k + 0.06 : k - 0.06), w * 0.88, h * k);
        c.moveTo(w * k, h * 0.12);
        c.quadraticCurveTo(w * (k < 0.5 ? k + 0.06 : k - 0.06), h / 2, w * k, h * 0.88);
      }
      c.stroke();
    }),
  );
  block(c, S, w * 0.2, h * 0.2, w * 0.6, h * 0.6, 0.06, S.wood);
  thin(c, S, 0.4, () => {
    rrect(c, w * 0.25, h * 0.25, w * 0.5, h * 0.5, 0.04);
    c.stroke();
  });
  disc(c, S, w * 0.42, h * 0.45, Math.min(w, h) * 0.06, S.fire);
  disc(c, S, w * 0.55, h * 0.56, Math.min(w, h) * 0.055, S.fire);
};

/** 圓矮桌：圓形的木頭桌面、內側一圈、折疊腳的影子 */
const chabudai: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  thin(c, S, 0.4, () =>
    inked(c, S.faint, () => {
      seg(c, w / 2 - R * 0.6, h / 2 - R * 0.6, w / 2 + R * 0.6, h / 2 + R * 0.6);
      seg(c, w / 2 + R * 0.6, h / 2 - R * 0.6, w / 2 - R * 0.6, h / 2 + R * 0.6);
    }),
  );
  disc(c, S, w / 2, h / 2, R, S.wood);
  thin(c, S, 0.45, () => ring(c, w / 2, h / 2, R * 0.82));
  disc(c, S, w * 0.4, h * 0.42, R * 0.16, S.paper);
  disc(c, S, w * 0.6, h * 0.58, R * 0.13, S.paper);
};

/** 和式衣櫃：上下兩段、左右的抽屜、金屬的把手與四角的包角 */
const tansu: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.wood);
  thin(c, S, 0.5, () => {
    seg(c, w / 2, 0, w / 2, h);
    seg(c, 0, h * 0.5, w, h * 0.5);
  });
  c.save();
  c.fillStyle = S.gold;
  lw(c, S, 0.6);
  for (const x of [w * 0.25, w * 0.75])
    for (const y of [h * 0.26, h * 0.74]) {
      c.beginPath();
      c.ellipse(x, y, w * 0.06, h * 0.07, 0, 0, TAU);
      c.fill();
      c.stroke();
    }
  for (const [x, y] of [
    [0, 0],
    [w - 0.16, 0],
    [0, h - 0.16],
    [w - 0.16, h - 0.16],
  ] as const) {
    c.fillRect(x, y, 0.16, 0.16);
    c.strokeRect(x, y, 0.16, 0.16);
  }
  c.restore();
};

/** 茶櫃：上面是玻璃的拉門（淡色、兩片錯開）、下面兩個小抽屜 */
const chadansu: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.wood);
  block(c, S, w * 0.06, h * 0.12, w * 0.5, h * 0.42, 0.01, S.water);
  block(c, S, w * 0.44, h * 0.18, w * 0.5, h * 0.42, 0.01, S.water);
  thin(c, S, 0.5, () => seg(c, w * 0.04, h * 0.7, w * 0.96, h * 0.7));
  thin(c, S, 0.5, () => seg(c, w / 2, h * 0.7, w / 2, h * 0.96));
  disc(c, S, w * 0.27, h * 0.83, 0.05, S.gold);
  disc(c, S, w * 0.73, h * 0.83, 0.05, S.gold);
};

/** 壁櫥：兩片隔扇（錯開、圓的拉手），裡面的中層隔板（虛線）與疊著的棉被 */
const oshiire: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.02, S.shade);
  c.save();
  dashed(c, S);
  seg(c, 0.12, h * 0.45, w - 0.12, h * 0.45);
  c.restore();
  block(c, S, w * 0.1, h * 0.1, w * 0.36, h * 0.28, 0.06, S.cloth);
  block(c, S, w * 0.14, h * 0.16, w * 0.3, h * 0.2, 0.06, S.tint);
  /* 前面的隔扇 */
  const pw = w * 0.52;
  for (const [x, y] of [
    [0, h * 0.62],
    [w - pw, h * 0.74],
  ] as const) {
    block(c, S, x, y, pw, h * 0.22, 0.01, S.paper);
    disc(c, S, x + pw * (x ? 0.12 : 0.88), y + h * 0.11, h * 0.05, S.faint);
  }
};

function dashed(c: Ctx, S: FurnStyle): void {
  lw(c, S, 0.6);
  c.setLineDash([S.lw * 3, S.lw * 2]);
}

/** 神棚：架子、中間的小宮（屋頂的三角）、兩側的榊與正中的鏡 */
const kamidana: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.32, 0.02, S.wood);
  block(c, S, w * 0.3, h * 0.12, w * 0.4, h * 0.62, 0.02, S.paper);
  poly(c, [
    [w * 0.26, h * 0.16],
    [w * 0.5, h * 0.02],
    [w * 0.74, h * 0.16],
  ]);
  paint(c, S.wood);
  disc(c, S, w / 2, h * 0.46, Math.min(w, h) * 0.12, S.gold);
  for (const x of [w * 0.12, w * 0.88]) {
    oval(c, S, x, h * 0.55, w * 0.06, h * 0.22, S.leaf);
    disc(c, S, x, h * 0.82, h * 0.1, S.paper);
  }
};

/** 火盆：圓的陶盆、灰、炭火與一對火箸 */
const hibachi: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.04;
  disc(c, S, w / 2, h / 2, R, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.72, S.shade);
  for (const [x, y] of [
    [0.44, 0.46],
    [0.56, 0.52],
    [0.5, 0.6],
  ] as const)
    disc(c, S, w * x, h * y, R * 0.13, S.fire);
  thin(c, S, 0.9, () => {
    seg(c, w * 0.62, h * 0.3, w * 0.9, h * 0.12);
    seg(c, w * 0.66, h * 0.34, w * 0.94, h * 0.18);
  });
};

/** 盛鹽：小碟子上的一座鹽（俯視：白色的圓錐、頂點的線） */
const morishio: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2 - 0.02;
  disc(c, S, w / 2, h / 2, R, S.tint);
  disc(c, S, w / 2, h / 2, R * 0.62, S.chalk);
  thin(c, S, 0.4, () => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      seg(c, w / 2, h / 2, w / 2 + Math.cos(a) * R * 0.6, h / 2 + Math.sin(a) * R * 0.6);
    }
  });
};

/* ---------- 日本庭園 ---------- */

/** 葫蘆池：大小兩個圓連成的池、池邊的石頭、一座小石橋與兩條鯉魚 */
const gourdPond: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 29 + h * 53));
  const a = { x: w * 0.33, y: h * 0.52, rx: w * 0.31, ry: h * 0.46 };
  const b = { x: w * 0.74, y: h * 0.48, rx: w * 0.24, ry: h * 0.36 };
  c.save();
  c.beginPath();
  c.ellipse(a.x, a.y, a.rx, a.ry, 0, 0, TAU);
  c.moveTo(b.x + b.rx, b.y);
  c.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, TAU);
  c.fillStyle = S.water;
  c.fill('nonzero');
  c.restore();
  /* 外框：兩個橢圓的外側（中間的腰不描） */
  c.save();
  c.beginPath();
  c.ellipse(a.x, a.y, a.rx, a.ry, 0, 0.62, TAU - 0.62);
  c.stroke();
  c.beginPath();
  c.ellipse(b.x, b.y, b.rx, b.ry, 0, Math.PI + 0.78, Math.PI - 0.78 + TAU);
  c.stroke();
  c.restore();
  for (const e of [a, b])
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * TAU + rnd() * 0.3;
      const x = e.x + Math.cos(t) * e.rx * 0.98;
      const y = e.y + Math.sin(t) * e.ry * 0.98;
      if (Math.abs(x - w * 0.6) < w * 0.06) continue;
      oval(c, S, x, y, 0.24, 0.18, S.tint);
    }
  /* 腰的地方的石橋 */
  block(c, S, w * 0.56, h * 0.3, w * 0.08, h * 0.42, 0.04, S.tint);
  for (const [x, y, r] of [
    [w * 0.26, h * 0.44, 0.3],
    [w * 0.8, h * 0.56, -0.5],
  ] as const) {
    c.save();
    c.translate(x, y);
    c.rotate(r);
    oval(c, S, 0, 0, 0.32, 0.12, S.fire);
    poly(c, [
      [-0.32, 0],
      [-0.48, -0.1],
      [-0.48, 0.1],
    ]);
    paint(c, S.fire);
    c.restore();
  }
};

/** 屋敷稻荷：後面的小祠（屋頂）、前面的紅色鳥居、兩側的狐狸 */
const inari: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.25, h * 0.04, w * 0.5, h * 0.36, 0.03, S.wood);
  thin(c, S, 0.7, () => {
    seg(c, w * 0.25, h * 0.22, w * 0.75, h * 0.22);
    seg(c, w * 0.5, h * 0.04, w * 0.5, h * 0.4);
  });
  block(c, S, w * 0.42, h * 0.4, w * 0.16, h * 0.1, 0.02, S.tint);
  /* 鳥居：兩根柱子＋笠木 */
  c.save();
  c.fillStyle = S.alert;
  for (const x of [w * 0.32, w * 0.62]) {
    c.fillRect(x, h * 0.62, w * 0.06, w * 0.06);
    c.strokeRect(x, h * 0.62, w * 0.06, w * 0.06);
  }
  c.restore();
  block(c, S, w * 0.24, h * 0.58, w * 0.52, h * 0.05, 0.02, S.alert);
  block(c, S, w * 0.28, h * 0.66, w * 0.44, h * 0.03, 0, S.alert);
  /* 狐狸（白色的小身體、尖耳） */
  for (const x of [w * 0.12, w * 0.88]) {
    oval(c, S, x, h * 0.48, w * 0.07, h * 0.1, S.chalk);
    poly(c, [
      [x - w * 0.05, h * 0.4],
      [x - w * 0.02, h * 0.32],
      [x, h * 0.4],
      [x + w * 0.02, h * 0.32],
      [x + w * 0.05, h * 0.4],
    ]);
    paint(c, S.chalk);
  }
};

/* ---------- 事件・痕跡 ---------- */

/** 封鎖的木板（貼牆）：兩塊交叉釘上的木板、兩端的釘子；y＝h/2 是牆線 */
const boards: FurnDraw = (c, S, w, h) => {
  for (const [a, dy] of [
    [-0.12, -0.02],
    [0.1, 0.03],
  ] as const) {
    c.save();
    c.translate(w / 2, h / 2 + dy * h);
    c.rotate(a);
    block(c, S, -w * 0.5, -h * 0.17, w, h * 0.34, 0.02, S.wood);
    thin(c, S, 0.4, () =>
      inked(c, S.faint, () => seg(c, -w * 0.46, h * 0.02, w * 0.46, -h * 0.02)),
    );
    for (const x of [-w * 0.42, w * 0.42]) disc(c, S, x, 0, 0.045, S.shade);
    c.restore();
  }
};

/** 封印的符咒（貼牆）：三張直的紙條，上面的紅色符文 */
const ofuda: FurnDraw = (c, S, w, h) => {
  const slips: [number, number][] = [
    [0.22, -0.16],
    [0.5, 0.05],
    [0.78, 0.2],
  ];
  for (const [x, a] of slips) {
    c.save();
    c.translate(w * x, h / 2);
    c.rotate(a);
    const sw = Math.min(w * 0.18, 0.32);
    block(c, S, -sw / 2, -h * 0.46, sw, h * 0.92, 0.01, S.paper);
    inked(c, S.blood, () => {
      lw(c, S, 0.9);
      seg(c, 0, -h * 0.32, 0, h * 0.3);
      seg(c, -sw * 0.28, -h * 0.12, sw * 0.28, -h * 0.12);
      seg(c, -sw * 0.22, h * 0.08, sw * 0.22, h * 0.08);
    });
    c.restore();
  }
};

/** 拖行的血跡：一條從上到下變細的血痕、旁邊的手印與滴落 */
const bloodDrag: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 61 + h * 23) + 5);
  c.save();
  c.fillStyle = S.blood;
  blob(c, w * 0.5, h * 0.12, w * 0.38, h * 0.1, 10, 0.4, rnd);
  c.fill();
  c.beginPath();
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([w * (0.5 + Math.sin(t * 3.2) * 0.12), h * (0.12 + t * 0.82)]);
  }
  pts.forEach(([x, y], i) => {
    const k = (1 - i / 9) * w * 0.26 + w * 0.04;
    if (i) c.lineTo(x - k, y);
    else c.moveTo(x - k, y);
  });
  for (let i = pts.length - 1; i >= 0; i--) {
    const [x, y] = pts[i];
    c.lineTo(x + (1 - i / 9) * w * 0.22 + w * 0.03, y);
  }
  c.closePath();
  c.globalAlpha = 0.82;
  c.fill();
  c.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.arc(w * (0.15 + rnd() * 0.7), h * (0.2 + rnd() * 0.75), 0.03 + rnd() * 0.05, 0, TAU);
    c.fill();
  }
  c.restore();
};

/** 散落的紙張：幾張轉了角度的紙、上面的字行 */
const scatteredPapers: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 13 + h * 71) + 3);
  for (let i = 0; i < 6; i++) {
    const x = w * (0.18 + rnd() * 0.64);
    const y = h * (0.2 + rnd() * 0.6);
    const pw = Math.min(w, h) * 0.32;
    const ph = pw * 1.3;
    c.save();
    c.translate(x, y);
    c.rotate((rnd() - 0.5) * 1.6);
    block(c, S, -pw / 2, -ph / 2, pw, ph, 0, S.paper);
    thin(c, S, 0.35, () =>
      inked(c, S.faint, () => {
        c.beginPath();
        for (let k = 1; k < 5; k++) {
          c.moveTo(-pw * 0.36, -ph / 2 + (ph * k) / 5);
          c.lineTo(pw * (0.36 - (k === 4 ? 0.3 : 0)), -ph / 2 + (ph * k) / 5);
        }
        c.stroke();
      }),
    );
    c.restore();
  }
};

/** 摔破的碗盤：碎成幾片的盤子（白色的碎片、斷口）、翻倒的碗 */
const brokenDishes: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(Math.round(w * 37 + h * 11) + 9);
  const cx = w * 0.42;
  const cy = h * 0.5;
  const R = Math.min(w, h) * 0.32;
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * TAU;
    const a1 = ((i + 1) / 5) * TAU;
    const off = 0.06 + rnd() * 0.1;
    const am = (a0 + a1) / 2;
    const ox = Math.cos(am) * off;
    const oy = Math.sin(am) * off;
    c.beginPath();
    c.moveTo(cx + ox + Math.cos(am) * R * 0.15, cy + oy + Math.sin(am) * R * 0.15);
    c.arc(cx + ox, cy + oy, R, a0 + 0.05, a1 - 0.05);
    c.closePath();
    paint(c, S.paper);
  }
  oval(c, S, w * 0.82, h * 0.3, w * 0.11, h * 0.16, S.tint);
  thin(c, S, 0.4, () => ring(c, w * 0.82, h * 0.3, Math.min(w * 0.06, h * 0.09)));
};

export const RESIDENCE: Record<string, FurnDraw> = {
  kotatsu,
  chabudai,
  tansu,
  chadansu,
  oshiire,
  kamidana,
  hibachi,
  morishio,
  gourd_pond: gourdPond,
  inari,
  boards,
  ofuda,
  blood_drag: bloodDrag,
  scattered_papers: scatteredPapers,
  broken_dishes: brokenDishes,
};
