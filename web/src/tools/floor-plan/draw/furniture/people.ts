/**
 * 家具畫法（2026-10 第三批）：人物・生物、奇幻・中世。全部是本站自己畫的。
 * 人物由上往下看：肩膀＋頭，臉朝下（0° 時「背面在上」）。
 */
import {
  block,
  type Ctx,
  disc,
  type FurnDraw,
  type FurnStyle,
  hatchRows,
  oval,
  paint,
  poly,
  rrect,
  seeded,
  seg,
  TAU,
} from './kit';
import {
  curve,
  hatchCols,
  inked,
  type PersonOpts,
  type Pt,
  person,
  ring,
  taper,
  thin,
} from './parts';
import { blob } from './story';

/* ---------- 人物 ---------- */

/** 一個站著的人：外框置中 */
const npc =
  (
    o: (S: FurnStyle) => PersonOpts,
    extra?: (c: Ctx, S: FurnStyle, w: number, h: number) => void,
  ): FurnDraw =>
  (c, S, w, h) => {
    const r = Math.min(w, h) * 0.42;
    person(c, S, w / 2, h / 2 + r * 0.05, r, o(S));
    extra?.(c, S, w, h);
  };

const npcMan = npc((S) => ({ body: S.screen, head: 'hair', hat: S.ink }));
const npcWoman = npc((S) => ({ body: S.alert, head: 'long', hat: S.wood }));
const npcChild = npc((S) => ({ body: S.gold, head: 'hair', hat: S.wood, scale: 0.86 }));
const npcElder = npc(
  (S) => ({ body: S.tint, head: 'gray' }),
  (c, S, w, h) => {
    thin(c, S, 1.4, () => inked(c, S.wood, () => seg(c, w * 0.86, h * 0.45, w * 0.92, h * 0.85)));
  },
);
const npcPolice = npc((S) => ({ body: S.screen, head: 'cap', hat: S.ink, badge: S.gold }));
const npcSoldier = npc(
  (S) => ({ body: S.leaf, head: 'helmet', hat: S.leafInk }),
  (c, S, w, h) => {
    thin(c, S, 1.6, () => seg(c, w * 0.12, h * 0.78, w * 0.72, h * 0.3));
  },
);
const npcDoctor = npc(
  (S) => ({ body: S.paper, head: 'hair', hat: S.ink }),
  (c, S, w, h) => {
    thin(c, S, 0.8, () =>
      inked(c, S.screen, () => {
        c.beginPath();
        c.arc(w / 2, h * 0.5, Math.min(w, h) * 0.26, Math.PI * 0.15, Math.PI * 0.85);
        c.stroke();
      }),
    );
  },
);
const npcNurse = npc((S) => ({ body: S.water, head: 'nurse' }));
const npcScientist = npc(
  (S) => ({ body: S.paper, head: 'hair', hat: S.shade }),
  (c, S, w, h) => {
    const r = Math.min(w, h) * 0.42;
    block(c, S, w / 2 - r * 0.42, h / 2 - r * 0.15, r * 0.84, r * 0.2, r * 0.08, S.screen);
  },
);
const npcWorker = npc((S) => ({ body: S.fire, head: 'hardhat', hat: S.gold }));
const npcStation = npc(
  (S) => ({ body: S.shade, head: 'cap', hat: S.screen, badge: S.paper }),
  (c, S, w, h) => {
    thin(c, S, 1, () => seg(c, w * 0.88, h * 0.62, w * 0.94, h * 0.3));
    c.save();
    c.fillStyle = S.alert;
    c.fillRect(w * 0.94, h * 0.3, w * 0.06, h * 0.12);
    c.restore();
  },
);
const npcSailor = npc((S) => ({ body: S.paper, head: 'beret', hat: S.paper, badge: S.screen }));
const npcGuard = npc((S) => ({ body: S.ink, head: 'cap', hat: S.ink, badge: S.leaf }));
const npcRobed = npc((S) => ({ body: S.occult, head: 'hood', hat: S.occult, arms: false }));
const npcStanding = npc((S) => ({ body: S.shade, head: 'hair', hat: S.shade }));

const npcSitting: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.1, 0, w * 0.8, h * 0.62, 0.1, S.tint);
  /* 腿往前（下） */
  for (const x of [0.36, 0.64])
    block(c, S, w * x - w * 0.1, h * 0.45, w * 0.2, h * 0.5, w * 0.08, S.shade);
  const r = Math.min(w, h * 0.75) * 0.42;
  person(c, S, w / 2, h * 0.36, r, { body: S.screen, head: 'hair', hat: S.ink });
};

const npcLying: FurnDraw = (c, S, w, h) => {
  /* 由上往下看的整個人：頭在上 */
  for (const x of [0.38, 0.62])
    block(c, S, w * x - w * 0.11, h * 0.55, w * 0.22, h * 0.43, w * 0.1, S.shade);
  for (const x of [0.12, 0.88])
    block(c, S, w * x - w * 0.08, h * 0.2, w * 0.16, h * 0.36, w * 0.07, S.screen);
  block(c, S, w * 0.2, h * 0.16, w * 0.6, h * 0.44, w * 0.2, S.screen);
  disc(c, S, w / 2, h * 0.09, w * 0.18, S.cloth);
  c.beginPath();
  c.arc(w / 2, h * 0.09, w * 0.18, Math.PI * 1.05, Math.PI * 1.95);
  paint(c, S.ink);
};

const npcBound: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.12, h * 0.05, w * 0.76, h * 0.8, 0.08, S.wood);
  const r = Math.min(w, h) * 0.36;
  person(c, S, w / 2, h * 0.45, r, { body: S.tint, head: 'hair', hat: S.ink, arms: false });
  thin(c, S, 1.4, () =>
    inked(c, S.wood, () => {
      seg(c, w * 0.1, h * 0.38, w * 0.9, h * 0.56);
      seg(c, w * 0.1, h * 0.56, w * 0.9, h * 0.38);
    }),
  );
};

const enemyHumanoid: FurnDraw = (c, S, w, h) => {
  const r = Math.min(w, h) * 0.42;
  person(c, S, w / 2, h / 2, r, { body: S.ink, head: 'none', hat: S.ink });
  disc(c, S, w / 2, h / 2 - r * 0.05, r * 0.46, S.ink);
  c.save();
  c.fillStyle = S.alert;
  for (const dx of [-0.16, 0.16]) {
    c.beginPath();
    c.arc(w / 2 + dx * r * 2, h / 2 + r * 0.18, r * 0.09, 0, TAU);
    c.fill();
  }
  c.restore();
};

/** 怪物的眼睛（白眼＋紅瞳） */
function eyes(c: Ctx, S: FurnStyle, pts: readonly Pt[], r: number): void {
  for (const [x, y] of pts) {
    disc(c, S, x, y, r, S.paper);
    disc(c, S, x, y + r * 0.2, r * 0.5, S.alert);
  }
}

const monsterSmall: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(5);
  blob(c, w / 2, h * 0.55, w * 0.44, h * 0.4, 9, 0.2, rnd);
  paint(c, S.leaf);
  eyes(
    c,
    S,
    [
      [w * 0.38, h * 0.6],
      [w * 0.62, h * 0.6],
    ],
    Math.min(w, h) * 0.1,
  );
  poly(c, [
    [w * 0.3, h * 0.18],
    [w * 0.38, h * 0.32],
    [w * 0.24, h * 0.3],
  ]);
  paint(c, S.leafInk);
};

/** 四隻腳的獸：身體、頭（下）、角、爪、尾巴（上） */
function beast(c: Ctx, S: FurnStyle, w: number, h: number, fill: string, spikes: boolean): void {
  /* 尾巴 */
  taper(
    c,
    curve([w / 2, h * 0.3], [w * 0.75, h * 0.1], [w * 0.6, 0.02], 10),
    Math.min(w, h) * 0.14,
    0.02,
  );
  paint(c, fill);
  /* 腳與爪 */
  for (const [x, y] of [
    [0.2, 0.3],
    [0.8, 0.3],
    [0.22, 0.68],
    [0.78, 0.68],
  ] as const) {
    oval(c, S, w * x, h * y, w * 0.1, h * 0.08, fill);
    thin(c, S, 0.6, () => {
      for (const dx of [-0.04, 0, 0.04])
        seg(c, w * (x + dx), h * (y + 0.06), w * (x + dx * 1.3), h * (y + 0.1));
    });
  }
  oval(c, S, w / 2, h * 0.48, w * 0.3, h * 0.28, fill);
  if (spikes) {
    for (let i = 0; i < 5; i++) {
      const y = h * (0.28 + i * 0.09);
      poly(c, [
        [w / 2 - w * 0.05, y],
        [w / 2, y - h * 0.07],
        [w / 2 + w * 0.05, y],
      ]);
      paint(c, S.ink);
    }
  }
  /* 頭與角 */
  disc(c, S, w / 2, h * 0.8, Math.min(w, h) * 0.17, fill);
  for (const dir of [-1, 1]) {
    poly(c, [
      [w / 2 + dir * w * 0.08, h * 0.72],
      [w / 2 + dir * w * 0.22, h * 0.62],
      [w / 2 + dir * w * 0.12, h * 0.76],
    ]);
    paint(c, S.paper);
  }
  eyes(
    c,
    S,
    [
      [w * 0.44, h * 0.82],
      [w * 0.56, h * 0.82],
    ],
    Math.min(w, h) * 0.04,
  );
}

const monster: FurnDraw = (c, S, w, h) => beast(c, S, w, h, S.shade, false);
const monsterLarge: FurnDraw = (c, S, w, h) => beast(c, S, w, h, S.occult, true);

const monsterBoss: FurnDraw = (c, S, w, h) => {
  /* 張開的翅膀 */
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.moveTo(w / 2 + dir * w * 0.12, h * 0.4);
    c.quadraticCurveTo(w / 2 + dir * w * 0.5, h * 0.05, w / 2 + dir * w * 0.49, h * 0.5);
    c.lineTo(w / 2 + dir * w * 0.36, h * 0.44);
    c.lineTo(w / 2 + dir * w * 0.3, h * 0.56);
    c.lineTo(w / 2 + dir * w * 0.18, h * 0.5);
    c.closePath();
    paint(c, S.alert);
    thin(c, S, 0.5, () => {
      seg(c, w / 2 + dir * w * 0.12, h * 0.4, w / 2 + dir * w * 0.36, h * 0.44);
      seg(c, w / 2 + dir * w * 0.12, h * 0.4, w / 2 + dir * w * 0.3, h * 0.56);
    });
  }
  beast(c, S, w, h, S.blood, true);
};

const monsterHuge: FurnDraw = (c, S, w, h) => {
  const rnd = seeded(13);
  const R = Math.min(w, h) / 2;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rnd() * 0.2;
    const b = a + (rnd() - 0.5) * 0.9;
    taper(
      c,
      curve(
        [w / 2 + Math.cos(a) * R * 0.3, h / 2 + Math.sin(a) * R * 0.3],
        [w / 2 + Math.cos(b) * R * 0.75, h / 2 + Math.sin(b) * R * 0.75],
        [w / 2 + Math.cos(a) * R * 0.97, h / 2 + Math.sin(a) * R * 0.97],
        12,
      ),
      R * 0.18,
      0.04,
    );
    paint(c, S.occult);
  }
  blob(c, w / 2, h / 2, R * 0.42, R * 0.4, 12, 0.12, rnd);
  paint(c, S.occult);
  eyes(
    c,
    S,
    [
      [w / 2 - R * 0.16, h / 2 + R * 0.05],
      [w / 2 + R * 0.16, h / 2 + R * 0.05],
      [w / 2, h / 2 - R * 0.14],
    ],
    R * 0.08,
  );
};

/** 狗（頭朝下） */
function dogShape(c: Ctx, S: FurnStyle, w: number, h: number, fill: string, collar: boolean): void {
  taper(c, curve([w / 2, h * 0.25], [w * 0.62, h * 0.12], [w * 0.55, 0.02], 8), w * 0.16, 0.03);
  paint(c, fill);
  for (const [x, y] of [
    [0.24, 0.32],
    [0.76, 0.32],
    [0.26, 0.68],
    [0.74, 0.68],
  ] as const)
    oval(c, S, w * x, h * y, w * 0.12, h * 0.06, fill);
  oval(c, S, w / 2, h * 0.5, w * 0.32, h * 0.3, fill);
  if (collar) {
    c.save();
    c.fillStyle = S.alert;
    c.fillRect(w * 0.3, h * 0.74, w * 0.4, h * 0.04);
    c.restore();
  }
  disc(c, S, w / 2, h * 0.82, w * 0.24, fill);
  for (const dir of [-1, 1])
    oval(c, S, w / 2 + dir * w * 0.24, h * 0.8, w * 0.08, h * 0.07, S.shade);
  oval(c, S, w / 2, h * 0.94, w * 0.1, h * 0.05, fill);
  disc(c, S, w / 2, h * 0.97, w * 0.05, S.ink);
}

const dog: FurnDraw = (c, S, w, h) => dogShape(c, S, w, h, S.wood, false);
const dogBig: FurnDraw = (c, S, w, h) => dogShape(c, S, w, h, S.shade, true);

const cat: FurnDraw = (c, S, w, h) => {
  thin(c, S, 2.2, () =>
    inked(c, S.gold, () => {
      c.beginPath();
      c.moveTo(w / 2, h * 0.3);
      c.quadraticCurveTo(w * 0.95, h * 0.2, w * 0.7, 0.04);
      c.stroke();
    }),
  );
  oval(c, S, w / 2, h * 0.5, w * 0.34, h * 0.28, S.gold);
  thin(c, S, 0.5, () => {
    for (const y of [0.42, 0.5, 0.58]) seg(c, w * 0.36, h * y, w * 0.64, h * y);
  });
  disc(c, S, w / 2, h * 0.8, w * 0.28, S.gold);
  for (const dir of [-1, 1]) {
    poly(c, [
      [w / 2 + dir * w * 0.08, h * 0.72],
      [w / 2 + dir * w * 0.3, h * 0.66],
      [w / 2 + dir * w * 0.26, h * 0.82],
    ]);
    paint(c, S.gold);
  }
};

const bird: FurnDraw = (c, S, w, h) => {
  for (const dir of [-1, 1]) {
    c.beginPath();
    c.moveTo(w / 2, h * 0.4);
    c.quadraticCurveTo(w / 2 + dir * w * 0.3, h * 0.15, w / 2 + dir * w * 0.48, h * 0.42);
    c.quadraticCurveTo(w / 2 + dir * w * 0.25, h * 0.5, w / 2, h * 0.6);
    c.closePath();
    paint(c, S.ink);
  }
  poly(c, [
    [w / 2, h * 0.5],
    [w * 0.38, h * 0.08],
    [w * 0.62, h * 0.08],
  ]);
  paint(c, S.ink);
  oval(c, S, w / 2, h * 0.55, w * 0.12, h * 0.2, S.ink);
  disc(c, S, w / 2, h * 0.76, w * 0.1, S.ink);
  poly(c, [
    [w * 0.46, h * 0.82],
    [w * 0.54, h * 0.82],
    [w / 2, h * 0.94],
  ]);
  paint(c, S.gold);
};

const wildAnimal: FurnDraw = (c, S, w, h) => {
  for (const [x, y] of [
    [0.16, 0.2],
    [0.84, 0.2],
    [0.18, 0.62],
    [0.82, 0.62],
  ] as const) {
    oval(c, S, w * x, h * y, w * 0.14, h * 0.08, S.shade);
    thin(c, S, 0.6, () => {
      for (const dx of [-0.05, 0, 0.05])
        seg(c, w * (x + dx), h * (y + 0.06), w * (x + dx), h * (y + 0.1));
    });
  }
  const rnd = seeded(3);
  /* 毛茸茸的大身體（肩膀隆起）＋圓耳朵的大頭（頭朝下） */
  blob(c, w / 2, h * 0.42, w * 0.47, h * 0.33, 26, 0.07, rnd, false);
  paint(c, S.shade);
  thin(c, S, 0.5, () => {
    c.beginPath();
    c.ellipse(w / 2, h * 0.56, w * 0.3, h * 0.08, 0, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
  });
  for (const dir of [-1, 1]) disc(c, S, w / 2 + dir * w * 0.22, h * 0.66, w * 0.1, S.shade);
  disc(c, S, w / 2, h * 0.78, w * 0.3, S.shade);
  oval(c, S, w / 2, h * 0.9, w * 0.14, h * 0.06, S.tint);
  disc(c, S, w / 2, h * 0.93, w * 0.05, S.ink);
  for (const dir of [-1, 1]) disc(c, S, w / 2 + dir * w * 0.1, h * 0.8, w * 0.03, S.ink);
};

/* ---------- 奇幻・中世 ---------- */

const throne: FurnDraw = (c, S, w, h) => {
  /* 高高的椅背（金）、扶手、紅色座墊 */
  poly(c, [
    [w * 0.08, h * 0.36],
    [w * 0.12, h * 0.08],
    [w * 0.3, h * 0.14],
    [w * 0.5, 0.02],
    [w * 0.7, h * 0.14],
    [w * 0.88, h * 0.08],
    [w * 0.92, h * 0.36],
  ]);
  paint(c, S.gold);
  block(c, S, 0, h * 0.3, w * 0.18, h * 0.66, 0.08, S.gold);
  block(c, S, w * 0.82, h * 0.3, w * 0.18, h * 0.66, 0.08, S.gold);
  block(c, S, w * 0.18, h * 0.32, w * 0.64, h * 0.6, 0.12, S.alert);
  thin(c, S, 0.5, () => {
    rrect(c, w * 0.26, h * 0.4, w * 0.48, h * 0.44, 0.08);
    c.stroke();
  });
  disc(c, S, w / 2, h * 0.17, h * 0.06, S.alert);
};

const weaponRack: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h * 0.28, 0.03, S.wood);
  const n = Math.max(3, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    const x = (w / n) * (i + 0.5);
    if (i % 3 === 0) {
      /* 劍 */
      thin(c, S, 1.6, () => seg(c, x, h * 0.1, x, h * 0.95));
      thin(c, S, 1.2, () => seg(c, x - 0.15, h * 0.32, x + 0.15, h * 0.32));
    } else if (i % 3 === 1) {
      /* 長槍 */
      thin(c, S, 1, () => inked(c, S.wood, () => seg(c, x, h * 0.05, x, h * 0.98)));
      poly(c, [
        [x, h * 0.98],
        [x - 0.08, h * 0.78],
        [x + 0.08, h * 0.78],
      ]);
      paint(c, S.tint);
    } else {
      /* 斧頭 */
      thin(c, S, 1, () => inked(c, S.wood, () => seg(c, x, h * 0.05, x, h * 0.95)));
      c.beginPath();
      c.moveTo(x, h * 0.62);
      c.quadraticCurveTo(x + 0.3, h * 0.6, x + 0.24, h * 0.92);
      c.lineTo(x, h * 0.86);
      c.closePath();
      paint(c, S.tint);
    }
  }
};

const armorStand: FurnDraw = (c, S, w, h) => {
  for (const dir of [-1, 1])
    oval(c, S, w / 2 + dir * w * 0.3, h * 0.48, w * 0.18, h * 0.26, S.tint);
  oval(c, S, w / 2, h * 0.52, w * 0.3, h * 0.32, S.tint);
  thin(c, S, 0.5, () => seg(c, w / 2, h * 0.24, w / 2, h * 0.82));
  disc(c, S, w / 2, h * 0.5, Math.min(w, h) * 0.22, S.shade);
  thin(c, S, 0.9, () =>
    inked(c, S.ink, () => seg(c, w / 2 - w * 0.12, h * 0.6, w / 2 + w * 0.12, h * 0.6)),
  );
  c.save();
  c.fillStyle = S.alert;
  c.beginPath();
  c.ellipse(w / 2, h * 0.36, w * 0.05, h * 0.14, 0, 0, TAU);
  c.fill();
  c.restore();
};

const chest: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.08, S.wood);
  c.save();
  c.fillStyle = S.gold;
  for (const x of [0.16, 0.84]) c.fillRect(w * x - 0.08, 0, 0.16, h);
  c.fillRect(0, h * 0.42, w, 0.12);
  c.restore();
  rrect(c, 0, 0, w, h, 0.08);
  c.stroke();
  block(c, S, w / 2 - 0.13, h * 0.62, 0.26, h * 0.3, 0.04, S.gold);
  disc(c, S, w / 2, h * 0.76, 0.04, S.ink);
};

const cauldron: FurnDraw = (c, S, w, h) => {
  c.save();
  c.fillStyle = S.fire;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    c.beginPath();
    c.arc(w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * h * 0.44, 0.08, 0, TAU);
    c.fill();
  }
  c.restore();
  const R = Math.min(w, h) * 0.4;
  disc(c, S, w / 2, h / 2, R, S.ink);
  disc(c, S, w / 2, h / 2, R * 0.78, S.leaf);
  c.save();
  c.fillStyle = S.paper;
  for (const [x, y, r] of [
    [0.42, 0.44, 0.08],
    [0.58, 0.55, 0.06],
    [0.5, 0.36, 0.05],
  ] as const) {
    c.beginPath();
    c.arc(w * x, h * y, r, 0, TAU);
    c.fill();
  }
  c.restore();
};

const crystalBall: FurnDraw = (c, S, w, h) => {
  const R = Math.min(w, h) / 2;
  disc(c, S, w / 2, h / 2, R * 0.92, S.gold);
  disc(c, S, w / 2, h / 2, R * 0.68, S.occultTint);
  c.save();
  c.fillStyle = S.paper;
  c.beginPath();
  c.ellipse(w / 2 - R * 0.22, h / 2 - R * 0.24, R * 0.16, R * 0.1, -0.6, 0, TAU);
  c.fill();
  c.restore();
  thin(c, S, 0.5, () => inked(c, S.occult, () => ring(c, w / 2, h / 2, R * 0.36)));
};

const banner: FurnDraw = (c, S, w, h) => {
  thin(c, S, 1.6, () => inked(c, S.wood, () => seg(c, 0.02, h * 0.2, w - 0.02, h * 0.2)));
  block(c, S, w * 0.1, h * 0.3, w * 0.8, h * 0.62, 0, S.alert);
  c.save();
  c.fillStyle = S.gold;
  c.fillRect(w * 0.1, h * 0.84, w * 0.8, h * 0.08);
  c.restore();
  disc(c, S, w / 2, h * 0.58, h * 0.16, S.gold);
};

const anvil: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.25, h * 0.05, w * 0.5, h * 0.9, 0.05, S.wood);
  c.beginPath();
  c.moveTo(0.02, h / 2);
  c.quadraticCurveTo(w * 0.2, h * 0.22, w * 0.35, h * 0.22);
  c.lineTo(w * 0.92, h * 0.22);
  c.lineTo(w * 0.92, h * 0.78);
  c.lineTo(w * 0.35, h * 0.78);
  c.quadraticCurveTo(w * 0.2, h * 0.78, 0.02, h / 2);
  c.closePath();
  paint(c, S.shade);
  thin(c, S, 0.5, () => seg(c, w * 0.4, h * 0.3, w * 0.86, h * 0.3));
  c.save();
  c.fillStyle = S.ink;
  c.fillRect(w * 0.76, h * 0.4, w * 0.08, h * 0.12);
  c.restore();
};

const forge: FurnDraw = (c, S, w, h) => {
  /* 磚造的爐、中間的炭火、旁邊的風箱 */
  block(c, S, 0, 0, w * 0.75, h, 0.05, S.wood);
  thin(c, S, 0.4, () => {
    hatchRows(c, 0, w * 0.75, 0, h, 0.3);
    c.beginPath();
    for (let r = 0; r * 0.3 < h; r++)
      for (let x = (r % 2) * 0.3 + 0.3; x < w * 0.75; x += 0.6) {
        c.moveTo(x, r * 0.3);
        c.lineTo(x, Math.min(h, r * 0.3 + 0.3));
      }
    c.stroke();
  });
  block(c, S, w * 0.12, h * 0.25, w * 0.5, h * 0.55, 0.08, S.ink);
  c.save();
  c.fillStyle = S.fire;
  const rnd = seeded(7);
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    c.arc(w * (0.18 + rnd() * 0.38), h * (0.32 + rnd() * 0.4), 0.08 + rnd() * 0.06, 0, TAU);
    c.fill();
  }
  c.restore();
  c.beginPath();
  c.moveTo(w * 0.78, h * 0.2);
  c.lineTo(w * 0.98, h * 0.35);
  c.lineTo(w * 0.98, h * 0.65);
  c.lineTo(w * 0.78, h * 0.8);
  c.closePath();
  paint(c, S.cloth);
  thin(c, S, 0.5, () => hatchCols(c, w * 0.8, w * 0.96, h * 0.3, h * 0.7, 0.08));
};

const questBoard: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.03, S.wood);
  const rnd = seeded(23);
  for (let x = 0.1; x < w - 0.3; x += 0.42) {
    c.save();
    c.translate(x + 0.17, h / 2);
    c.rotate((rnd() - 0.5) * 0.3);
    block(c, S, -0.15, -h * 0.36, 0.3, h * 0.72, 0, S.paper);
    c.restore();
    disc(c, S, x + 0.17, h * 0.22, 0.04, S.alert);
  }
};

const spikeTrap: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.shade);
  block(c, S, 0.12, 0.12, w - 0.24, h - 0.24, 0.02, S.ink);
  for (let y = 0.35; y < h - 0.2; y += 0.38)
    for (let x = 0.35; x < w - 0.2; x += 0.38) {
      poly(c, [
        [x, y - 0.13],
        [x + 0.11, y],
        [x, y + 0.13],
        [x - 0.11, y],
      ]);
      paint(c, S.tint);
      disc(c, S, x, y, 0.03, S.paper, false);
    }
};

const torch: FurnDraw = (c, S, w, h) => {
  block(c, S, w * 0.3, 0, w * 0.4, h * 0.22, 0.03, S.shade);
  thin(c, S, 1.6, () => inked(c, S.wood, () => seg(c, w / 2, h * 0.2, w / 2, h * 0.55)));
  c.save();
  c.globalAlpha = 0.5;
  c.fillStyle = S.gold;
  c.beginPath();
  c.arc(w / 2, h * 0.68, Math.min(w, h) * 0.32, 0, TAU);
  c.fill();
  c.restore();
  c.save();
  c.fillStyle = S.fire;
  c.beginPath();
  c.ellipse(w / 2, h * 0.66, w * 0.12, h * 0.16, 0, 0, TAU);
  c.fill();
  c.restore();
};

const hay: FurnDraw = (c, S, w, h) => {
  block(c, S, 0.04, 0.04, w - 0.08, h - 0.08, Math.min(w, h) * 0.3, S.gold);
  thin(c, S, 0.45, () => {
    const rnd = seeded(41);
    c.beginPath();
    for (let i = 0; i < 26; i++) {
      const x = w * (0.1 + rnd() * 0.8);
      const y = h * (0.15 + rnd() * 0.7);
      c.moveTo(x, y);
      c.lineTo(x + (rnd() - 0.5) * 0.4, y + (rnd() - 0.5) * 0.15);
    }
    c.stroke();
  });
  thin(c, S, 1, () =>
    inked(c, S.wood, () => {
      seg(c, w * 0.33, 0.06, w * 0.33, h - 0.06);
      seg(c, w * 0.67, 0.06, w * 0.67, h - 0.06);
    }),
  );
};

const statue: FurnDraw = (c, S, w, h) => {
  block(c, S, 0, 0, w, h, 0.05, S.tint);
  block(c, S, 0.14, 0.14, w - 0.28, h - 0.28, 0.03, S.paper);
  /* 人像：肩膀＋頭＋舉起的手 */
  oval(c, S, w / 2, h * 0.52, w * 0.3, h * 0.16, S.tint);
  thin(c, S, 2, () => inked(c, S.ink, () => seg(c, w * 0.74, h * 0.48, w * 0.86, h * 0.2)));
  thin(c, S, 1.2, () => inked(c, S.tint, () => seg(c, w * 0.74, h * 0.48, w * 0.86, h * 0.2)));
  disc(c, S, w / 2, h * 0.5, w * 0.14, S.tint);
};

export const PEOPLE: Record<string, FurnDraw> = {
  npc_man: npcMan,
  npc_woman: npcWoman,
  npc_child: npcChild,
  npc_elder: npcElder,
  npc_police: npcPolice,
  npc_soldier: npcSoldier,
  npc_doctor: npcDoctor,
  npc_nurse: npcNurse,
  npc_scientist: npcScientist,
  npc_worker: npcWorker,
  npc_station: npcStation,
  npc_sailor: npcSailor,
  npc_guard: npcGuard,
  npc_robed: npcRobed,
  npc_standing: npcStanding,
  npc_sitting: npcSitting,
  npc_lying: npcLying,
  npc_bound: npcBound,
  enemy_humanoid: enemyHumanoid,
  monster_small: monsterSmall,
  monster,
  monster_large: monsterLarge,
  monster_boss: monsterBoss,
  monster_huge: monsterHuge,
  dog,
  dog_big: dogBig,
  cat,
  bird,
  wild_animal: wildAnimal,
  throne,
  weapon_rack: weaponRack,
  armor_stand: armorStand,
  chest,
  cauldron,
  crystal_ball: crystalBall,
  banner,
  anvil,
  forge,
  quest_board: questBoard,
  spike_trap: spikeTrap,
  torch,
  hay,
  statue,
};
