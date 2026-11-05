/**
 * 32 種配置素材的圖形（本站自己畫的）。原點在素材中央、約 72 × 72 的範圍（大小 48 時 1:1），
 * 底邊（接地的位置）約在 y＝20；呼叫端依大小縮放、旋轉、左右反轉。
 * 顏色跟著主題；GM 專用的線條改成紫色；雪原上屋頂與上緣積雪（入口、橋洞不蓋）。
 */
import type { Climate } from '../model/climate';
import type { Side } from '../model/ports';
import type { ThemeId } from '../model/types';
import { drawMountain, drawReeds, drawTree } from './marks';
import {
  type BuildColors,
  buildColors,
  mix,
  reliefColors,
  SNOW_SHADE,
  SNOW_WHITE,
} from './palette';

type Ctx = CanvasRenderingContext2D;
type P = readonly [number, number];

export interface AssetDrawOptions {
  theme: ThemeId;
  climate?: Climate;
  secret?: boolean;
  dock?: Side;
}

function snowColors(c: BuildColors, k: number): BuildColors {
  if (k <= 0.001) return c;
  return {
    ...c,
    stone: mix(c.stone, '#e6ebe3', k * 0.8),
    shade: mix(c.shade, '#a2b4ae', k * 0.65),
    roof: mix(c.roof, '#d6e1da', k * 0.8),
    roofDark: mix(c.roofDark, '#849d96', k * 0.6),
    wood: mix(c.wood, '#bdc8bd', k * 0.5),
    light: mix(c.light, '#eef3e9', k * 0.9),
  };
}

class Pen {
  constructor(
    readonly ctx: Ctx,
    readonly c: BuildColors,
    readonly snow: number,
  ) {}
  poly(pts: readonly P[], fill: string | null, stroke = true, close = true) {
    const { ctx } = this;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    if (close) ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) ctx.stroke();
  }
  rect(x: number, y: number, w: number, h: number, fill: string, stroke = true) {
    this.poly(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      fill,
      stroke,
    );
  }
  circle(x: number, y: number, r: number, fill: string | null, stroke = true) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) ctx.stroke();
  }
  line(pts: readonly P[], color: string, width: number) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }
  /** 屋頂或上緣的積雪：沿著上緣的一條白帶（下面一點點藍灰） */
  cap(pts: readonly P[], thick = 2.2) {
    if (this.snow <= 0.001) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= this.snow;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = SNOW_SHADE;
    ctx.lineWidth = thick * (0.8 + this.snow * 0.6);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y + 0.7);
      else ctx.moveTo(x, y + 0.7);
    });
    ctx.stroke();
    ctx.strokeStyle = SNOW_WHITE;
    ctx.lineWidth = thick * (0.6 + this.snow * 0.5);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }
}

/** 一棟房子：正面、側面、山形屋頂、門、窗；(x, y) 是正面的左下角 */
function house(p: Pen, x: number, y: number, w: number, h: number, roofH = w * 0.5) {
  const { c } = p;
  const side = w * 0.32;
  /* 側面 */
  p.poly(
    [
      [x + w, y],
      [x + w + side, y - side * 0.45],
      [x + w + side, y - h - side * 0.45],
      [x + w, y - h],
    ],
    c.shade,
  );
  /* 正面 */
  p.rect(x, y - h, w, h, c.stone);
  /* 屋頂：正面的山牆＋往右後方的斜面 */
  p.poly(
    [
      [x + w, y - h],
      [x + w / 2, y - h - roofH],
      [x + w / 2 + side, y - h - roofH - side * 0.45],
      [x + w + side, y - h - side * 0.45],
    ],
    c.roofDark,
  );
  p.poly(
    [
      [x - 1.5, y - h + 0.5],
      [x + w / 2, y - h - roofH],
      [x + w + 1.5, y - h + 0.5],
    ],
    c.roof,
  );
  p.cap(
    [
      [x - 1, y - h],
      [x + w / 2, y - h - roofH],
      [x + w / 2 + side, y - h - roofH - side * 0.45],
    ],
    2,
  );
  /* 門與窗 */
  const dw = Math.max(3, w * 0.26);
  p.rect(x + w * 0.18, y - h * 0.55, dw, h * 0.55, c.dark, false);
  p.rect(
    x + w * 0.6,
    y - h * 0.68,
    Math.max(2.5, w * 0.2),
    Math.max(2.5, h * 0.24),
    c.glass,
    false,
  );
}

/** 方塔：(x, y) 是底邊中央 */
function squareTower(p: Pen, x: number, y: number, w: number, h: number) {
  const { c } = p;
  const m = w / 5;
  p.rect(x - w / 2, y - h, w, h, c.stone);
  p.rect(x, y - h, w / 2, h, c.shade);
  for (let i = 0; i < 3; i++)
    p.rect(x - w / 2 + i * 2 * m, y - h - m * 1.4, m, m * 1.4, i === 2 ? c.shade : c.stone);
  p.rect(x - m * 0.6, y - h * 0.7, m * 1.2, h * 0.22, c.dark, false);
  p.cap(
    [
      [x - w / 2, y - h - m * 1.4],
      [x - w / 2 + m, y - h - m * 1.4],
    ],
    1.6,
  );
  p.cap(
    [
      [x - w / 2 + 2 * m, y - h - m * 1.4],
      [x - w / 2 + 3 * m, y - h - m * 1.4],
    ],
    1.6,
  );
  p.cap(
    [
      [x + w / 2 - m, y - h - m * 1.4],
      [x + w / 2, y - h - m * 1.4],
    ],
    1.6,
  );
}

/** 圓塔＋圓錐屋頂：(x, y) 是底邊中央 */
function roundTower(p: Pen, x: number, y: number, w: number, h: number, roofH = w * 1.1) {
  const { c, ctx } = p;
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x - r, y - h);
  ctx.lineTo(x - r, y);
  ctx.ellipse(x, y, r, r * 0.35, 0, Math.PI, 0, true);
  ctx.lineTo(x + r, y - h);
  ctx.closePath();
  ctx.fillStyle = c.stone;
  ctx.fill();
  ctx.stroke();
  p.poly(
    [
      [x + r * 0.15, y - h],
      [x + r, y - h],
      [x + r, y],
      [x + r * 0.15, y + r * 0.3],
    ],
    c.shade,
    false,
  );
  p.poly(
    [
      [x - r - 1.5, y - h],
      [x, y - h - roofH],
      [x + r + 1.5, y - h],
    ],
    c.roof,
  );
  p.poly(
    [
      [x, y - h - roofH],
      [x + r + 1.5, y - h],
      [x + r * 0.25, y - h],
    ],
    c.roofDark,
    false,
  );
  p.cap(
    [
      [x - r * 0.55, y - h - roofH * 0.45],
      [x, y - h - roofH],
      [x + r * 0.55, y - h - roofH * 0.45],
    ],
    2,
  );
  p.rect(x - r * 0.25, y - h * 0.62, r * 0.5, h * 0.2, c.glass, false);
}

function flagOn(p: Pen, x: number, y: number, h: number, color: string) {
  p.line(
    [
      [x, y],
      [x, y - h],
    ],
    p.c.ink,
    1.3,
  );
  p.poly(
    [
      [x, y - h],
      [x + 11, y - h + 3],
      [x, y - h + 6.5],
    ],
    color,
  );
}

function dockShape(p: Pen, side: Side) {
  const { ctx, c } = p;
  const angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[side];
  ctx.save();
  ctx.rotate(angle);
  p.rect(0, -4, 30, 8, c.wood);
  p.line(
    [
      [6, -4],
      [6, 4],
    ],
    c.ink,
    0.8,
  );
  p.line(
    [
      [13, -4],
      [13, 4],
    ],
    c.ink,
    0.8,
  );
  p.line(
    [
      [20, -4],
      [20, 4],
    ],
    c.ink,
    0.8,
  );
  for (const px of [2, 27]) {
    p.circle(px, -5.5, 1.8, c.dark);
    p.circle(px, 5.5, 1.8, c.dark);
  }
  /* 小船 */
  ctx.beginPath();
  ctx.moveTo(10, 11);
  ctx.quadraticCurveTo(18, 18, 27, 11);
  ctx.closePath();
  ctx.fillStyle = c.roofDark;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawAsset(ctx: Ctx, kind: string, o: AssetDrawOptions): void {
  const climate = o.climate ?? { snow: 0, desert: 0, wet: 0 };
  const snow = Math.max(0, Math.min(1, climate.snow));
  const relief = reliefColors(o.theme, climate);
  const c = snowColors(buildColors(o.theme, o.secret), snow);
  const p = new Pen(ctx, c, snow);
  ctx.save();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'capital': {
      squareTower(p, -19, 20, 10, 26);
      squareTower(p, 19, 20, 10, 26);
      p.rect(-15, 0, 30, 20, c.stone);
      p.rect(2, 0, 13, 20, c.shade);
      roundTower(p, 0, 2, 14, 18, 16);
      p.poly(
        [
          [-5, 20],
          [-5, 12],
          [0, 7],
          [5, 12],
          [5, 20],
        ],
        c.dark,
      );
      flagOn(p, 0, -30, 9, '#c9a54c');
      break;
    }
    case 'city':
      house(p, -24, 4, 16, 14);
      house(p, -4, -1, 15, 19);
      roundTower(p, 18, 2, 8, 20, 11);
      house(p, -18, 22, 18, 12);
      house(p, 4, 22, 16, 12);
      break;
    case 'town':
      house(p, -20, 14, 20, 17);
      house(p, 4, 20, 15, 13);
      break;
    case 'village':
      house(p, -16, 18, 20, 16);
      ctx.save();
      ctx.translate(15, 12);
      ctx.scale(0.62, 0.62);
      drawTree(ctx, relief, 0.4, snow);
      ctx.restore();
      break;
    case 'castle':
      p.rect(-20, 2, 40, 18, c.stone);
      p.rect(4, 2, 16, 18, c.shade);
      for (let i = 0; i < 5; i++) p.rect(-20 + i * 9, -1.5, 4, 3.5, c.stone);
      p.cap(
        [
          [-20, -1.5],
          [20, -1.5],
        ],
        1.4,
      );
      roundTower(p, -20, 21, 11, 30, 13);
      roundTower(p, 20, 21, 11, 30, 13);
      roundTower(p, 0, 3, 13, 20, 15);
      ctx.beginPath();
      ctx.moveTo(-5, 20);
      ctx.lineTo(-5, 13);
      ctx.quadraticCurveTo(0, 6, 5, 13);
      ctx.lineTo(5, 20);
      ctx.fillStyle = c.dark;
      ctx.fill();
      ctx.stroke();
      break;
    case 'fort': {
      const top = -10;
      p.poly(
        [
          [-24, 21],
          [-24, top],
          [24, top],
          [24, 21],
        ],
        c.stone,
      );
      p.rect(6, top, 18, 31, c.shade);
      for (let i = 0; i < 6; i++) p.rect(-24 + i * 9, top - 5, 5, 5, i >= 4 ? c.shade : c.stone);
      for (let i = 0; i < 6; i++)
        p.cap(
          [
            [-24 + i * 9, top - 5],
            [-19 + i * 9, top - 5],
          ],
          1.4,
        );
      ctx.beginPath();
      ctx.moveTo(-6, 21);
      ctx.lineTo(-6, 8);
      ctx.quadraticCurveTo(0, 0, 6, 8);
      ctx.lineTo(6, 21);
      ctx.fillStyle = c.dark;
      ctx.fill();
      ctx.stroke();
      p.line(
        [
          [-20, 2],
          [-10, 2],
        ],
        c.ink,
        0.6,
      );
      p.line(
        [
          [12, 10],
          [21, 10],
        ],
        c.ink,
        0.6,
      );
      break;
    }
    case 'port': {
      const side = o.dock ?? 'right';
      dockShape(p, side);
      const home: Record<Side, P> = { right: [-20, 2], left: [4, 2], up: [-8, 18], down: [-8, -4] };
      const [hx, hy] = home[side];
      house(p, hx, hy, 16, 13);
      break;
    }
    case 'tower':
      roundTower(p, 0, 22, 14, 36, 14);
      p.rect(-2.5, 4, 5, 8, c.dark, false);
      break;
    case 'inn':
      house(p, -18, 20, 24, 18);
      p.line(
        [
          [11, 20],
          [11, -4],
          [20, -4],
        ],
        c.wood,
        1.8,
      );
      p.rect(14, -2, 8, 7, c.light);
      p.circle(18, 1.5, 1.6, c.roof, false);
      break;
    case 'bridge': {
      /* 石橋：兩個橋洞是透明的 */
      ctx.beginPath();
      ctx.moveTo(-28, 6);
      ctx.quadraticCurveTo(0, -14, 28, 6);
      ctx.lineTo(28, 14);
      ctx.lineTo(19, 14);
      ctx.quadraticCurveTo(13, 2, 6, 14);
      ctx.lineTo(-6, 14);
      ctx.quadraticCurveTo(-13, 2, -19, 14);
      ctx.lineTo(-28, 14);
      ctx.closePath();
      ctx.fillStyle = c.stone;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-28, 6);
      ctx.quadraticCurveTo(0, -14, 28, 6);
      ctx.lineTo(28, 2);
      ctx.quadraticCurveTo(0, -18, -28, 2);
      ctx.closePath();
      ctx.fillStyle = c.shade;
      ctx.fill();
      ctx.stroke();
      p.cap(
        [
          [-27, 2],
          [-12, -6.2],
          [0, -8],
          [12, -6.2],
          [27, 2],
        ],
        1.8,
      );
      break;
    }
    case 'mountain':
      ctx.save();
      ctx.translate(0, 18);
      ctx.scale(0.72, 0.72);
      drawMountain(ctx, relief, 0.45, snow);
      ctx.restore();
      break;
    case 'range':
      ctx.save();
      ctx.translate(-13, 9);
      ctx.scale(0.48, 0.48);
      drawMountain(ctx, relief, 0.25, snow);
      ctx.restore();
      ctx.save();
      ctx.translate(14, 6);
      ctx.scale(0.42, 0.42);
      drawMountain(ctx, relief, 0.15, snow);
      ctx.restore();
      ctx.save();
      ctx.translate(2, 19);
      ctx.scale(0.66, 0.66);
      drawMountain(ctx, relief, 0.68, snow);
      ctx.restore();
      break;
    case 'forest':
      for (const [x, y, k, n] of [
        [-12, -4, 0.85, 0.3],
        [10, -6, 0.9, 0.7],
        [-1, 10, 1, 0.5],
      ] as const) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        drawTree(ctx, relief, n, snow);
        ctx.restore();
      }
      break;
    case 'pine': {
      const dark = mix(relief.treeDark, '#6f8c86', snow * 0.4);
      p.rect(-2, 15, 4, 9, c.wood);
      for (const [y, w, h] of [
        [16, 17, 15],
        [6, 13, 14],
        [-5, 9, 13],
      ] as const) {
        p.poly(
          [
            [-w, y],
            [0, y - h - 6],
            [w, y],
          ],
          relief.tree,
        );
        p.poly(
          [
            [0, y - h - 6],
            [w, y],
            [2, y],
          ],
          dark,
          false,
        );
        p.cap(
          [
            [-w * 0.45, y - h * 0.62],
            [0, y - h - 6],
            [w * 0.45, y - h * 0.62],
          ],
          2.2,
        );
      }
      break;
    }
    case 'hill': {
      const g = mix(relief.tree, relief.rock, 0.35);
      ctx.beginPath();
      ctx.moveTo(-26, 14);
      ctx.quadraticCurveTo(-14, -16, -1, 6);
      ctx.quadraticCurveTo(12, -12, 26, 14);
      ctx.closePath();
      ctx.fillStyle = mix(g, SNOW_WHITE, snow * 0.7);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1, 6);
      ctx.quadraticCurveTo(12, -12, 26, 14);
      ctx.lineTo(8, 14);
      ctx.closePath();
      ctx.fillStyle = mix(relief.treeDark, '#9fb3ad', snow * 0.6);
      ctx.globalAlpha *= 0.55;
      ctx.fill();
      ctx.globalAlpha /= 0.55;
      p.line(
        [
          [-18, 6],
          [-15, 3],
        ],
        relief.line,
        0.8,
      );
      p.line(
        [
          [-10, 9],
          [-7, 6],
        ],
        relief.line,
        0.8,
      );
      break;
    }
    case 'volcano':
      ctx.save();
      ctx.globalAlpha *= 0.6;
      p.circle(4, -24, 5, '#9d9a92', false);
      p.circle(10, -30, 4, '#b4b1aa', false);
      p.circle(15, -35, 3, '#c9c6bf', false);
      ctx.restore();
      p.poly(
        [
          [-27, 20],
          [-7, -16],
          [7, -16],
          [27, 20],
        ],
        mix(relief.rockDark, '#5e4a3c', 0.4),
      );
      p.poly(
        [
          [2, -16],
          [7, -16],
          [27, 20],
          [10, 20],
        ],
        mix(relief.rockDark, '#2f2723', 0.45),
        false,
      );
      p.poly(
        [
          [-7, -16],
          [-3, -12],
          [-6, 2],
          [-1, -6],
          [2, 8],
          [4, -11],
          [7, -16],
        ],
        '#e0683c',
      );
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, -16, 7, 2.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f3a74a';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    case 'cactus': {
      const g = mix('#6f9555', '#9cb39b', snow * 0.4);
      const body = (x: number, y0: number, y1: number, w: number) => {
        ctx.beginPath();
        ctx.moveTo(x - w, y0);
        ctx.lineTo(x - w, y1 + w);
        ctx.arc(x, y1 + w, w, Math.PI, 0);
        ctx.lineTo(x + w, y0);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.stroke();
      };
      body(0, 20, -20, 5);
      body(-12, 2, -10, 3.5);
      body(12, -2, -14, 3.5);
      p.rect(-12, -1, 8, 4, g, false);
      p.rect(4, -5, 8, 4, g, false);
      p.line(
        [
          [-1, 18],
          [-1, -15],
        ],
        mix(g, '#2f4a2c', 0.5),
        0.7,
      );
      p.cap(
        [
          [-3, -19],
          [0, -20.5],
          [3, -19],
        ],
        1.6,
      );
      ctx.save();
      ctx.globalAlpha *= 0.4;
      ctx.beginPath();
      ctx.ellipse(0, 21, 14, 2.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#b9965f';
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'marsh':
      drawReeds(ctx, c, mix(relief.tree, relief.line, 0.3), snow);
      break;
    case 'ruins': {
      const col = (x: number, y: number, h: number, broken: boolean) => {
        p.rect(x - 3.5, y - h, 7, h, c.stone);
        p.rect(x + 1, y - h, 2.5, h, c.shade, false);
        if (broken)
          p.poly(
            [
              [x - 4.5, y - h],
              [x - 2, y - h - 3],
              [x + 1, y - h - 1],
              [x + 4.5, y - h - 4],
              [x + 4.5, y - h],
            ],
            c.stone,
          );
        else p.rect(x - 5, y - h - 3, 10, 3, c.light);
        p.cap(
          [
            [x - 4, y - h - (broken ? 1.5 : 3)],
            [x + 4, y - h - (broken ? 2.5 : 3)],
          ],
          1.5,
        );
      };
      col(-17, 18, 24, false);
      col(-5, 16, 34, true);
      col(9, 18, 16, true);
      p.rect(-23, -9, 16, 3.5, c.light);
      p.poly(
        [
          [14, 20],
          [26, 20],
          [24, 15],
          [16, 14],
        ],
        c.shade,
      );
      p.poly(
        [
          [-2, 21],
          [6, 21],
          [5, 18],
          [0, 18],
        ],
        c.stone,
      );
      break;
    }
    case 'cave': {
      const rock = mix(relief.rock, relief.rockDark, 0.2);
      p.poly(
        [
          [-27, 20],
          [-20, -4],
          [-6, -18],
          [10, -16],
          [22, -2],
          [27, 20],
        ],
        rock,
      );
      p.poly(
        [
          [10, -16],
          [22, -2],
          [27, 20],
          [12, 20],
          [14, 2],
        ],
        relief.rockDark,
        false,
      );
      ctx.beginPath();
      ctx.moveTo(-11, 20);
      ctx.quadraticCurveTo(-10, -2, 1, -3);
      ctx.quadraticCurveTo(11, -2, 11, 20);
      ctx.closePath();
      ctx.fillStyle = c.dark;
      ctx.fill();
      ctx.stroke();
      p.cap(
        [
          [-20, -4],
          [-6, -18],
          [10, -16],
          [18, -6],
        ],
        2.2,
      );
      break;
    }
    case 'temple': {
      p.rect(-24, 16, 48, 5, c.stone);
      p.rect(-21, 12, 42, 4, c.light);
      for (let i = 0; i < 5; i++) {
        p.rect(-19 + i * 8.6, -4, 4.2, 16, i === 4 ? c.shade : c.stone);
      }
      p.rect(-23, -8, 46, 4, c.stone);
      p.poly(
        [
          [-25, -8],
          [0, -22],
          [25, -8],
        ],
        c.roof,
      );
      p.poly(
        [
          [-15, -10],
          [0, -18],
          [15, -10],
        ],
        c.light,
        false,
      );
      p.cap(
        [
          [-25, -8.5],
          [0, -22.5],
          [25, -8.5],
        ],
        2.2,
      );
      break;
    }
    case 'dungeon': {
      const rock = mix(relief.rockDark, '#4a4440', 0.35);
      ctx.beginPath();
      ctx.moveTo(-26, 20);
      ctx.quadraticCurveTo(-24, -14, 0, -18);
      ctx.quadraticCurveTo(24, -14, 26, 20);
      ctx.closePath();
      ctx.fillStyle = rock;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, 20);
      ctx.lineTo(-10, 0);
      ctx.quadraticCurveTo(0, -12, 10, 0);
      ctx.lineTo(10, 20);
      ctx.closePath();
      ctx.fillStyle = c.stone;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-7, 20);
      ctx.lineTo(-7, 1);
      ctx.quadraticCurveTo(0, -8, 7, 1);
      ctx.lineTo(7, 20);
      ctx.closePath();
      ctx.fillStyle = '#1f1a1a';
      ctx.fill();
      for (let i = 0; i < 3; i++)
        p.line(
          [
            [-6 + i, 12 + i * 3],
            [6 - i, 12 + i * 3],
          ],
          c.shade,
          1.2,
        );
      p.circle(-16, 2, 2.2, '#e9b54f', false);
      p.circle(16, 2, 2.2, '#e9b54f', false);
      p.cap(
        [
          [-22, -6],
          [0, -18],
          [22, -6],
        ],
        2.2,
      );
      break;
    }
    case 'camp':
      p.poly(
        [
          [-24, 18],
          [-6, -16],
          [12, 18],
        ],
        c.roof,
      );
      p.poly(
        [
          [-6, -16],
          [12, 18],
          [0, 18],
        ],
        c.roofDark,
        false,
      );
      p.poly(
        [
          [-10, 18],
          [-6, 4],
          [-2, 18],
        ],
        c.dark,
      );
      p.cap(
        [
          [-15, 0],
          [-6, -16],
          [2, -1],
        ],
        2,
      );
      p.line(
        [
          [12, 20],
          [24, 16],
        ],
        c.wood,
        2,
      );
      p.line(
        [
          [12, 16],
          [24, 20],
        ],
        c.wood,
        2,
      );
      p.poly(
        [
          [14, 16],
          [18, 4],
          [20, 10],
          [22, 6],
          [22, 16],
        ],
        '#ef8a3c',
        false,
      );
      p.poly(
        [
          [16, 16],
          [18.5, 9],
          [20.5, 16],
        ],
        '#f6cf63',
        false,
      );
      break;
    case 'grave': {
      const stone = (x: number, y: number, w: number, h: number) => {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x - w / 2, y - h + w / 2);
        ctx.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
        ctx.lineTo(x + w / 2, y);
        ctx.closePath();
        ctx.fillStyle = c.stone;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y - h + w / 2, w / 2, Math.PI * 1.15, Math.PI * 1.85);
        ctx.save();
        ctx.globalAlpha *= snow;
        ctx.strokeStyle = SNOW_WHITE;
        ctx.lineWidth = 2;
        if (snow > 0.001) ctx.stroke();
        ctx.restore();
      };
      stone(-14, 16, 11, 20);
      stone(12, 18, 10, 16);
      p.rect(-3, -16, 5, 34, c.stone);
      p.rect(-9, -8, 17, 5, c.stone);
      p.cap(
        [
          [-2.5, -16],
          [1.5, -16],
        ],
        1.6,
      );
      p.cap(
        [
          [-8.5, -8],
          [7.5, -8],
        ],
        1.6,
      );
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.beginPath();
      ctx.ellipse(0, 20, 26, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = mix(relief.earth, '#5d4a35', 0.3);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'mine': {
      const rock = mix(relief.rock, relief.earth, 0.3);
      p.poly(
        [
          [-27, 20],
          [-14, -10],
          [2, -20],
          [18, -8],
          [27, 20],
        ],
        rock,
      );
      p.poly(
        [
          [2, -20],
          [18, -8],
          [27, 20],
          [10, 20],
        ],
        relief.rockDark,
        false,
      );
      p.rect(-10, 2, 18, 18, c.dark);
      p.line(
        [
          [-11, 20],
          [-11, 0],
          [9, 0],
          [9, 20],
        ],
        c.wood,
        3,
      );
      p.cap(
        [
          [-14, -10],
          [2, -20],
          [14, -11],
        ],
        2.2,
      );
      /* 礦車 */
      p.poly(
        [
          [12, 12],
          [24, 12],
          [22, 19],
          [14, 19],
        ],
        c.shade,
      );
      p.circle(15.5, 20, 1.8, c.dark);
      p.circle(20.5, 20, 1.8, c.dark);
      break;
    }
    case 'beacon': {
      p.poly(
        [
          [-9, 22],
          [-6, -12],
          [6, -12],
          [9, 22],
        ],
        c.light,
      );
      for (const [y0, y1] of [
        [12, 2],
        [-4, -9],
      ] as const)
        p.poly(
          [
            [-8.3 + (22 - y0) * 0.09, y0],
            [-7.4 + (22 - y1) * 0.09 - 0.9, y1],
            [7.4 - (22 - y1) * 0.09 + 0.9, y1],
            [8.3 - (22 - y0) * 0.09, y0],
          ],
          c.roof,
          false,
        );
      p.rect(-7, -20, 14, 8, c.glass);
      p.poly(
        [
          [-9, -20],
          [0, -29],
          [9, -20],
        ],
        c.roofDark,
      );
      p.cap(
        [
          [-8, -20.5],
          [0, -29],
          [8, -20.5],
        ],
        1.8,
      );
      ctx.save();
      ctx.globalAlpha *= 0.35;
      p.poly(
        [
          [7, -18],
          [28, -26],
          [28, -10],
        ],
        '#f6df8e',
        false,
      );
      p.poly(
        [
          [-7, -18],
          [-28, -26],
          [-28, -10],
        ],
        '#f6df8e',
        false,
      );
      ctx.restore();
      break;
    }
    case 'dot':
      p.circle(0, 0, 11, '#c9a862');
      p.circle(0, 0, 4.5, c.dark, false);
      break;
    case 'square':
      ctx.beginPath();
      ctx.roundRect(-12, -12, 24, 24, 3);
      ctx.fillStyle = '#bfae80';
      ctx.fill();
      ctx.stroke();
      p.rect(-6, -6, 12, 12, c.light, false);
      break;
    case 'star': {
      const pts: P[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 9.5 : 23;
        pts.push([Math.cos(a) * r, Math.sin(a) * r + 2]);
      }
      p.poly(pts, '#c8a64f');
      p.poly([[0, 2], ...pts.slice(0, 3)], '#ead594', false);
      break;
    }
    case 'flag':
      p.line(
        [
          [-10, 24],
          [-10, -24],
        ],
        c.wood,
        2.4,
      );
      p.line(
        [
          [-17, 24],
          [-3, 24],
        ],
        c.wood,
        2.2,
      );
      ctx.beginPath();
      ctx.moveTo(-10, -22);
      ctx.quadraticCurveTo(2, -28, 12, -21);
      ctx.quadraticCurveTo(18, -16, 22, -19);
      ctx.lineTo(22, -2);
      ctx.quadraticCurveTo(16, 1, 10, -4);
      ctx.quadraticCurveTo(0, -10, -10, -4);
      ctx.closePath();
      ctx.fillStyle = c.roof;
      ctx.fill();
      ctx.stroke();
      p.line(
        [
          [-4, -17],
          [12, -15],
        ],
        c.light,
        1,
      );
      break;
    case 'pin':
      ctx.beginPath();
      ctx.moveTo(0, 25);
      ctx.bezierCurveTo(-8, 12, -16, 2, -16, -9);
      ctx.arc(0, -9, 16, Math.PI, 0);
      ctx.bezierCurveTo(16, 2, 8, 12, 0, 25);
      ctx.closePath();
      ctx.fillStyle = c.roof;
      ctx.fill();
      ctx.stroke();
      p.circle(0, -9, 6, c.light, false);
      break;
    case 'ship': {
      p.line(
        [
          [0, 10],
          [0, -30],
        ],
        c.wood,
        1.8,
      );
      ctx.beginPath();
      ctx.moveTo(-2, -28);
      ctx.quadraticCurveTo(-14, -12, -22, 4);
      ctx.lineTo(-2, 4);
      ctx.closePath();
      ctx.fillStyle = c.light;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, -24);
      ctx.quadraticCurveTo(15, -10, 21, 4);
      ctx.lineTo(3, 4);
      ctx.closePath();
      ctx.fillStyle = c.stone;
      ctx.fill();
      ctx.stroke();
      flagOn(p, 0, -30, 0, c.roof);
      p.poly(
        [
          [-26, 9],
          [26, 9],
          [17, 22],
          [-16, 22],
        ],
        c.wood,
      );
      p.poly(
        [
          [-22, 14],
          [22, 14],
          [17, 22],
          [-16, 22],
        ],
        c.roofDark,
        false,
      );
      p.cap(
        [
          [-25, 9],
          [25, 9],
        ],
        1.6,
      );
      break;
    }
    default:
      break;
  }
  ctx.restore();
}
