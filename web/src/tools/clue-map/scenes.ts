/**
 * 內建場景（規格 3.6）：用 canvas 現畫的三張圖（書房、舊紙、調查板），不用任何外部圖片。
 * 用固定的偽亂數，同一個代號每次畫出一樣的圖。書房各物件的位置（STUDY）也給範例的熱點用（sample.ts），所以熱點一定對得上畫面。
 */

import { readAsDataUrl } from '@/core/files';
import { canvasToBlob, makeCanvas } from '@/core/image';
import { BUILTIN_SIZE, type BuiltinSceneId } from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Cv = HTMLCanvasElement | OffscreenCanvas;

interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 書房（1200 × 800）裡各物件的位置（px） */
export const STUDY = {
  /** 牆與地板的交界 */
  floorY: 560,
  window: { x: 90, y: 90, w: 240, h: 260 },
  painting: { x: 625, y: 120, w: 150, h: 180 },
  fireplace: { x: 580, y: 340, w: 240, h: 220 },
  mantle: { x: 560, y: 322, w: 280, h: 24 },
  shelf: { x: 900, y: 60, w: 240, h: 502 },
  desk: { x: 110, y: 500, w: 420, h: 240 },
  drawer: { x: 395, y: 560, w: 125, h: 90 },
  rug: { x: 470, y: 640, w: 500, h: 140 },
} as const;

/** 書房的熱點範圍（px；範例的熱點用） */
export const STUDY_SPOTS = {
  desk: { x: 100, y: 480, w: 440, h: 262 },
  shelf: { x: 900, y: 60, w: 240, h: 502 },
  fireplace: { x: 580, y: 322, w: 240, h: 250 },
  window: { x: 80, y: 80, w: 260, h: 290 },
  painting: { x: 617, y: 112, w: 166, h: 196 },
  drawer: { x: 395, y: 560, w: 125, h: 90 },
  safe: { x: 662, y: 195, w: 76, h: 70 },
  hatch: { x: 850, y: 707, w: 110, h: 70 },
} as const satisfies Record<string, R>;

/** 固定種子的偽亂數（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function linear(
  ctx: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string][],
) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function radial(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/* ---------- 書房 ---------- */

function drawStudy(ctx: Ctx, W: number, H: number): void {
  const rand = rng(20261023);
  const S = STUDY;
  /* 牆 */
  ctx.fillStyle = linear(ctx, 0, 0, 0, S.floorY, [
    [0, '#294a44'],
    [1, '#1c3531'],
  ]);
  ctx.fillRect(0, 0, W, S.floorY);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x < W; x += 48) ctx.fillRect(x, 0, 22, S.floorY);
  /* 護牆板 */
  ctx.fillStyle = '#3b2a1e';
  ctx.fillRect(0, 410, W, S.floorY - 410);
  ctx.fillStyle = '#5a4130';
  ctx.fillRect(0, 404, W, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  for (let x = 20; x < W; x += 150) {
    ctx.strokeRect(x, 430, 120, 100);
  }
  /* 地板 */
  ctx.fillStyle = linear(ctx, 0, S.floorY, 0, H, [
    [0, '#6a4528'],
    [1, '#3d2716'],
  ]);
  ctx.fillRect(0, S.floorY, W, H - S.floorY);
  for (let i = 0; i < 9; i++) {
    const y = S.floorY + 6 + i * i * 3.2 + i * 14;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y, W, 2);
    let x = rand() * 160;
    while (x < W) {
      ctx.fillRect(x, y, 2, 20 + i * 5);
      x += 160 + rand() * 180;
    }
  }
  ctx.fillStyle = '#25180e';
  ctx.fillRect(0, S.floorY - 14, W, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, S.floorY - 14, W, 2);

  /* 窗 */
  {
    const w = S.window;
    ctx.fillStyle = '#2b1d14';
    ctx.fillRect(w.x - 12, w.y - 12, w.w + 24, w.h + 24);
    ctx.fillStyle = linear(ctx, 0, w.y, 0, w.y + w.h, [
      [0, '#0b1426'],
      [1, '#27445f'],
    ]);
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = radial(ctx, w.x + 170, w.y + 62, 4, 60, [
      [0, 'rgba(255,248,214,0.95)'],
      [0.35, 'rgba(235,235,210,0.35)'],
      [1, 'rgba(235,235,210,0)'],
    ]);
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#f4efd2';
    ctx.beginPath();
    ctx.arc(w.x + 170, w.y + 62, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,220,255,0.28)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 64; i++) {
      const rx = w.x + rand() * w.w;
      const ry = w.y + rand() * w.h;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + 17);
      ctx.stroke();
    }
    ctx.fillStyle = '#2b1d14';
    ctx.fillRect(w.x + w.w / 2 - 4, w.y, 8, w.h);
    ctx.fillRect(w.x, w.y + w.h * 0.45 - 4, w.w, 8);
    ctx.fillStyle = '#463120';
    ctx.fillRect(w.x - 20, w.y + w.h + 12, w.w + 40, 14);
    /* 窗簾 */
    for (const side of [-1, 1]) {
      const cx = side < 0 ? w.x - 22 : w.x + w.w - 30;
      ctx.fillStyle = linear(ctx, cx, 0, cx + 52, 0, [
        [0, '#6a232b'],
        [0.5, '#4a151c'],
        [1, '#6a232b'],
      ]);
      ctx.fillRect(cx, w.y - 30, 52, w.h + 74);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + k * 13, w.y - 30);
        ctx.lineTo(cx + k * 13, w.y + w.h + 44);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#c2a14b';
    ctx.fillRect(w.x - 40, w.y - 40, w.w + 80, 8);
  }

  /* 書架 */
  {
    const s = S.shelf;
    ctx.fillStyle = '#3a2515';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = '#150d08';
    ctx.fillRect(s.x + 12, s.y + 12, s.w - 24, s.h - 24);
    const rows = 5;
    const rowH = (s.h - 24) / rows;
    const palette = [
      '#7a2a2a',
      '#2f5b6e',
      '#6b5a2a',
      '#3d3a63',
      '#2c5a3b',
      '#8a4a2a',
      '#5a2f4a',
      '#33383f',
    ];
    for (let r = 0; r < rows; r++) {
      const y0 = s.y + 12 + r * rowH;
      let x = s.x + 16;
      while (x < s.x + s.w - 34) {
        const bw = 13 + rand() * 14;
        const bh = rowH * (0.62 + rand() * 0.32);
        ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
        ctx.fillRect(x, y0 + rowH - 10 - bh, bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x + 2, y0 + rowH - 10 - bh + 8, bw - 4, 2);
        ctx.fillRect(x + 2, y0 + rowH - 10 - 12, bw - 4, 2);
        x += bw + 1.5;
      }
      ctx.fillStyle = '#4a3220';
      ctx.fillRect(s.x + 8, y0 + rowH - 10, s.w - 16, 10);
    }
    /* 倒著插回去的那一本（金色的書背） */
    const by = s.y + 12 + 2 * rowH;
    ctx.save();
    ctx.translate(s.x + 120, by + 14);
    ctx.fillStyle = '#b8902f';
    ctx.fillRect(0, 0, 18, rowH - 28);
    ctx.fillStyle = '#6a4f12';
    ctx.fillRect(3, 6, 12, 3);
    ctx.fillRect(3, rowH - 40, 12, 3);
    ctx.restore();
  }

  /* 壁爐 */
  {
    const f = S.fireplace;
    ctx.fillStyle = '#4b4139';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    for (let y = f.y + 18; y < f.y + f.h; y += 22) {
      ctx.beginPath();
      ctx.moveTo(f.x, y);
      ctx.lineTo(f.x + f.w, y);
      ctx.stroke();
      const off = ((y - f.y) / 22) % 2 === 0 ? 0 : 20;
      for (let x = f.x + off; x < f.x + f.w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 22);
        ctx.stroke();
      }
    }
    const ox = f.x + 45;
    const oy = f.y + 70;
    const ow = f.w - 90;
    const oh = f.h - 70;
    ctx.fillStyle = '#0b0807';
    roundRect(ctx, ox, oy, ow, oh, 6);
    ctx.fill();
    ctx.fillStyle = radial(ctx, ox + ow / 2, oy + oh - 10, 6, 100, [
      [0, 'rgba(255,190,80,0.95)'],
      [0.5, 'rgba(235,100,30,0.6)'],
      [1, 'rgba(120,30,10,0)'],
    ]);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(ox + 14, oy + oh - 22, ow - 28, 10);
    ctx.fillStyle = '#f2a33b';
    for (const [fx, fh] of [
      [-26, 36],
      [-6, 52],
      [16, 40],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(ox + ow / 2 + fx - 12, oy + oh - 22);
      ctx.quadraticCurveTo(
        ox + ow / 2 + fx,
        oy + oh - 22 - fh,
        ox + ow / 2 + fx + 12,
        oy + oh - 22,
      );
      ctx.fill();
    }
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.moveTo(ox + ow / 2 - 8, oy + oh - 22);
    ctx.quadraticCurveTo(ox + ow / 2, oy + oh - 58, ox + ow / 2 + 8, oy + oh - 22);
    ctx.fill();
    const m = S.mantle;
    ctx.fillStyle = '#5c4636';
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(m.x, m.y, m.w, 3);
    ctx.fillStyle = '#403326';
    ctx.fillRect(m.x - 8, f.y + f.h - 4, m.w + 16, 16);
    /* 壁爐架上的小東西 */
    ctx.fillStyle = '#b9b2a0';
    roundRect(ctx, m.x + 24, m.y - 34, 22, 34, 4);
    ctx.fill();
    ctx.fillStyle = '#7d3b2c';
    ctx.fillRect(m.x + m.w - 70, m.y - 22, 38, 22);
    ctx.fillRect(m.x + m.w - 66, m.y - 30, 30, 8);
  }

  /* 掛畫 */
  {
    const p = S.painting;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(-0.035);
    const hw = p.w / 2;
    const hh = p.h / 2;
    ctx.fillStyle = linear(ctx, -hw, -hh, hw, hh, [
      [0, '#d6b04f'],
      [0.5, '#8d6a22'],
      [1, '#c9a24a'],
    ]);
    ctx.fillRect(-hw, -hh, p.w, p.h);
    ctx.fillStyle = '#17252a';
    ctx.fillRect(-hw + 12, -hh + 12, p.w - 24, p.h - 24);
    ctx.fillStyle = '#2a2a24';
    ctx.beginPath();
    ctx.ellipse(0, hh - 12, 52, 38, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a98a';
    ctx.beginPath();
    ctx.ellipse(0, -8, 24, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2018';
    ctx.beginPath();
    ctx.ellipse(0, -26, 28, 20, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#17110c';
    for (const ex of [-9, 9]) {
      ctx.beginPath();
      ctx.ellipse(ex, -10, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    for (const ex of [-9, 9]) {
      ctx.beginPath();
      ctx.moveTo(ex - 6, -16);
      ctx.lineTo(ex + 6, -4);
      ctx.moveTo(ex + 6, -16);
      ctx.lineTo(ex - 6, -4);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(210,190,130,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x + 22, p.y + 4);
    ctx.lineTo(p.x + p.w / 2, p.y - 36);
    ctx.lineTo(p.x + p.w - 22, p.y + 4);
    ctx.stroke();
    ctx.fillStyle = '#c2a14b';
    ctx.beginPath();
    ctx.arc(p.x + p.w / 2, p.y - 36, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 地毯 */
  {
    const r = S.rug;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, r.x + 6, r.y + 8, r.w, r.h, 14);
    ctx.fill();
    ctx.fillStyle = '#6a1f23';
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 3;
    roundRect(ctx, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(201,162,74,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const cx = r.x + 70 + i * ((r.w - 140) / 5);
      ctx.beginPath();
      ctx.moveTo(cx, r.y + r.h / 2 - 28);
      ctx.lineTo(cx + 24, r.y + r.h / 2);
      ctx.lineTo(cx, r.y + r.h / 2 + 28);
      ctx.lineTo(cx - 24, r.y + r.h / 2);
      ctx.closePath();
      ctx.stroke();
    }
    /* 右下角被掀起一點 */
    ctx.fillStyle = '#8a2a30';
    ctx.beginPath();
    ctx.moveTo(r.x + r.w - 60, r.y + r.h);
    ctx.quadraticCurveTo(r.x + r.w - 20, r.y + r.h - 8, r.x + r.w - 4, r.y + r.h - 54);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(r.x + r.w - 54, r.y + r.h - 2);
    ctx.quadraticCurveTo(r.x + r.w - 24, r.y + r.h - 14, r.x + r.w - 10, r.y + r.h - 46);
    ctx.lineTo(r.x + r.w - 2, r.y + r.h - 2);
    ctx.closePath();
    ctx.fill();
  }

  /* 書桌 */
  {
    const d = S.desk;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(d.x + 6, d.y + d.h - 2, d.w, 14);
    ctx.fillStyle = '#4b3220';
    ctx.fillRect(d.x + 8, d.y + 24, d.w - 16, d.h - 24);
    ctx.fillStyle = '#2a1b10';
    ctx.fillRect(d.x + 28, d.y + 40, 230, d.h - 44);
    const dr = S.drawer;
    ctx.fillStyle = '#5c3e27';
    ctx.fillRect(dr.x, dr.y, dr.w, dr.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(dr.x + 6, dr.y + 6, dr.w - 12, dr.h - 12);
    ctx.fillStyle = '#c9a24a';
    ctx.beginPath();
    ctx.arc(dr.x + dr.w / 2, dr.y + dr.h / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b120a';
    ctx.fillRect(dr.x + dr.w / 2 - 2, dr.y + dr.h / 2 - 2, 4, 9);
    ctx.fillStyle = '#6e4d31';
    ctx.fillRect(d.x - 10, d.y, d.w + 20, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(d.x - 10, d.y, d.w + 20, 3);
    /* 檯燈 */
    ctx.fillStyle = '#2d2a26';
    ctx.fillRect(168, d.y - 10, 44, 10);
    ctx.fillRect(186, d.y - 80, 5, 72);
    ctx.fillStyle = '#e3b64e';
    ctx.beginPath();
    ctx.moveTo(150, d.y - 82);
    ctx.lineTo(228, d.y - 82);
    ctx.lineTo(210, d.y - 130);
    ctx.lineTo(168, d.y - 130);
    ctx.closePath();
    ctx.fill();
    /* 信件與日記 */
    ctx.save();
    ctx.translate(300, d.y - 4);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#e8e2d0';
    ctx.fillRect(-34, -8, 70, 8);
    ctx.fillStyle = '#d6cfb8';
    ctx.fillRect(-26, -15, 62, 8);
    ctx.restore();
    ctx.fillStyle = '#efe9d8';
    ctx.fillRect(388, d.y - 16, 44, 16);
    ctx.fillRect(434, d.y - 16, 44, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(432, d.y - 16, 3, 16);
    ctx.fillStyle = 'rgba(40,40,60,0.55)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(393, d.y - 12 + i * 4, 34, 1.5);
      ctx.fillRect(440, d.y - 12 + i * 4, 34, 1.5);
    }
    ctx.fillStyle = '#7a1f1f';
    ctx.fillRect(500, d.y - 6, 30, 6);
  }

  /* 光：檯燈、壁爐 */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, 190, 430, 10, 360, [
    [0, 'rgba(255,196,110,0.32)'],
    [1, 'rgba(255,196,110,0)'],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radial(ctx, 700, 520, 10, 300, [
    [0, 'rgba(255,140,60,0.22)'],
    [1, 'rgba(255,140,60,0)'],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  /* 暗角 */
  ctx.fillStyle = radial(ctx, W / 2, H / 2, H * 0.35, H * 0.95, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.6)'],
  ]);
  ctx.fillRect(0, 0, W, H);
}

/* ---------- 舊紙 ---------- */

function drawPaper(ctx: Ctx, W: number, H: number): void {
  const rand = rng(1071);
  ctx.fillStyle = '#e6d5ac';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radial(ctx, W / 2, H / 2, 40, H * 0.85, [
    [0, 'rgba(255,248,224,0.65)'],
    [1, 'rgba(255,248,224,0)'],
  ]);
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 60 + rand() * 160;
    ctx.fillStyle = radial(ctx, x, y, 0, r, [
      [0, `rgba(150,105,50,${0.1 + rand() * 0.1})`],
      [1, 'rgba(150,105,50,0)'],
    ]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(110,75,35,${0.03 + rand() * 0.07})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2.2, 1 + rand() * 2.2);
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 520; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const a = rand() * Math.PI * 2;
    const l = 6 + rand() * 18;
    ctx.strokeStyle = `rgba(120,85,45,${0.05 + rand() * 0.06})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  /* 摺痕 */
  ctx.fillStyle = 'rgba(80,50,20,0.1)';
  ctx.fillRect(W / 2 - 1, 0, 2, H);
  ctx.fillRect(0, H / 2 - 1, W, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(W / 2 + 1, 0, 2, H);
  ctx.fillRect(0, H / 2 + 1, W, 2);
  /* 邊緣燒痕 */
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 90, 0, 0, 0, 90, H],
    [W, 0, W - 90, 0, W - 90, 0, 90, H],
    [0, 0, 0, 90, 0, 0, W, 90],
    [0, H, 0, H - 90, 0, H - 90, W, 90],
  ] as const) {
    ctx.fillStyle = linear(ctx, x0, y0, x1, y1, [
      [0, 'rgba(90,55,20,0.5)'],
      [1, 'rgba(90,55,20,0)'],
    ]);
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.fillStyle = radial(ctx, W / 2, H / 2, H * 0.5, H * 0.95, [
    [0, 'rgba(60,35,10,0)'],
    [1, 'rgba(60,35,10,0.35)'],
  ]);
  ctx.fillRect(0, 0, W, H);
}

/* ---------- 調查板（軟木板） ---------- */

function drawBoard(ctx: Ctx, W: number, H: number): void {
  const rand = rng(4242);
  const F = 30;
  ctx.fillStyle = '#b88a56';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = 50 + rand() * 120;
    ctx.fillStyle = radial(ctx, x, y, 0, r, [
      [0, rand() > 0.5 ? 'rgba(210,165,110,0.28)' : 'rgba(120,80,40,0.22)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const light = rand() > 0.5;
    ctx.fillStyle = light
      ? `rgba(224,184,130,${0.3 + rand() * 0.4})`
      : `rgba(96,62,30,${0.25 + rand() * 0.4})`;
    const r = 0.8 + rand() * 2.6;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  /* 木框 */
  ctx.fillStyle = linear(ctx, 0, 0, W, H, [
    [0, '#7a4f2b'],
    [0.5, '#5f3b1e'],
    [1, '#7a4f2b'],
  ]);
  ctx.fillRect(0, 0, W, F);
  ctx.fillRect(0, H - F, W, F);
  ctx.fillRect(0, 0, F, H);
  ctx.fillRect(W - F, 0, F, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(F, F, W - 2 * F, H - 2 * F);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  /* 框內的陰影 */
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [F, F, F + 36, F, F, F, 36, H - 2 * F],
    [W - F, F, W - F - 36, F, W - F - 36, F, 36, H - 2 * F],
    [F, F, F, F + 36, F, F, W - 2 * F, 36],
    [F, H - F, F, H - F - 36, F, H - F - 36, W - 2 * F, 36],
  ] as const) {
    ctx.fillStyle = linear(ctx, x0, y0, x1, y1, [
      [0, 'rgba(0,0,0,0.38)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.fillStyle = radial(ctx, W / 2, H / 2, H * 0.4, H, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.3)'],
  ]);
  ctx.fillRect(0, 0, W, H);
}

/* ---------- 對外 ---------- */

const DRAWERS: Record<BuiltinSceneId, (ctx: Ctx, w: number, h: number) => void> = {
  study: drawStudy,
  paper: drawPaper,
  board: drawBoard,
};

/** 畫一張內建場景（新的畫布） */
export function renderBuiltinScene(id: BuiltinSceneId): Cv {
  const { width, height } = BUILTIN_SIZE[id];
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as Ctx;
  DRAWERS[id](ctx, width, height);
  return canvas;
}

const blobs = new Map<BuiltinSceneId, Promise<Blob>>();

/** 內建場景的 JPEG（品質 0.9；只畫一次） */
export function builtinSceneBlob(id: BuiltinSceneId): Promise<Blob> {
  let p = blobs.get(id);
  if (!p) {
    p = canvasToBlob(renderBuiltinScene(id), 'image/jpeg', 0.9);
    blobs.set(id, p);
  }
  return p;
}

/** 內建場景的 data URL（互動 HTML、分享連結的畫面用） */
export async function builtinSceneDataUrl(id: BuiltinSceneId): Promise<string> {
  return readAsDataUrl(await builtinSceneBlob(id));
}

const objectUrls = new Map<BuiltinSceneId, Promise<string>>();

/** 內建場景的物件網址（預覽用；整個頁面共用一份，不釋放） */
export function builtinSceneUrl(id: BuiltinSceneId): Promise<string> {
  let p = objectUrls.get(id);
  if (!p) {
    p = builtinSceneBlob(id).then((b) => URL.createObjectURL(b));
    objectUrls.set(id, p);
  }
  return p;
}
