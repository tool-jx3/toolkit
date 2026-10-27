/**
 * 預覽用的背景與範例立繪（規格 F27～F30，本站自己用程式畫的；只供預覽，不會匯出）。
 * 以 1920 × 1080 的座標畫（呼叫端先縮放 context）。
 */
import { seeded } from './art';
import type { Scene } from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const W = 1920;
const H = 1080;

function vGrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function study(ctx: Ctx) {
  ctx.fillStyle = vGrad(ctx, 0, H, [
    [0, '#221815'],
    [1, '#3b2a21'],
  ]);
  ctx.fillRect(0, 0, W, H);
  /* 窗與月亮 */
  ctx.fillStyle = vGrad(ctx, 150, 590, [
    [0, '#0d1930'],
    [1, '#22385a'],
  ]);
  ctx.fillRect(1290, 150, 440, 440);
  ctx.fillStyle = 'rgba(241, 230, 196, 0.85)';
  ctx.beginPath();
  ctx.arc(1570, 290, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1210';
  ctx.fillRect(1500, 150, 16, 440);
  ctx.fillRect(1290, 360, 440, 16);
  ctx.lineWidth = 22;
  ctx.strokeStyle = '#1a1210';
  ctx.strokeRect(1290, 150, 440, 440);
  /* 書架 */
  ctx.fillStyle = '#1b120f';
  ctx.fillRect(110, 110, 640, 720);
  const rnd = seeded(41);
  const colors = ['#5b3a2e', '#3e4a3a', '#6b5a3a', '#2f3a4f', '#7a3b33', '#4a3a52'];
  for (let shelf = 0; shelf < 5; shelf++) {
    const base = 250 + shelf * 140;
    let x = 130;
    while (x < 720) {
      const bw = 16 + Math.floor(rnd() * 18);
      const bh = 86 + Math.floor(rnd() * 36);
      if (x + bw > 730) break;
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(x, base - bh, bw, bh);
      x += bw + 2 + Math.floor(rnd() * 4);
    }
    ctx.fillStyle = '#120c0a';
    ctx.fillRect(110, base, 640, 12);
  }
  /* 桌燈的光與桌面 */
  const glow = ctx.createRadialGradient(1060, 760, 10, 1060, 760, 460);
  glow.addColorStop(0, 'rgba(255, 204, 128, 0.32)');
  glow.addColorStop(1, 'rgba(255, 204, 128, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#281b15';
  ctx.fillRect(0, 830, W, 250);
  ctx.fillStyle = '#3a271c';
  ctx.fillRect(0, 830, W, 10);
}

function classroom(ctx: Ctx) {
  ctx.fillStyle = '#e6d6c3';
  ctx.fillRect(0, 0, W, H);
  /* 三扇窗外的黃昏 */
  for (let i = 0; i < 3; i++) {
    const x = 760 + i * 380;
    ctx.fillStyle = vGrad(ctx, 140, 640, [
      [0, '#6f5ba3'],
      [0.55, '#e48a8f'],
      [1, '#f8c27d'],
    ]);
    ctx.fillRect(x, 140, 330, 500);
    ctx.fillStyle = '#c4ad92';
    ctx.fillRect(x + 158, 140, 14, 500);
    ctx.fillRect(x, 380, 330, 12);
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#c4ad92';
    ctx.strokeRect(x, 140, 330, 500);
  }
  /* 黑板 */
  ctx.fillStyle = '#7d5f42';
  ctx.fillRect(80, 210, 590, 360);
  ctx.fillStyle = '#2e4a3b';
  ctx.fillRect(96, 226, 558, 328);
  ctx.strokeStyle = 'rgba(240, 240, 230, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(140, 300);
  ctx.lineTo(380, 300);
  ctx.moveTo(140, 360);
  ctx.lineTo(500, 360);
  ctx.moveTo(140, 420);
  ctx.lineTo(300, 420);
  ctx.stroke();
  /* 桌椅的剪影 */
  ctx.fillStyle = '#7a5a40';
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 320 + row * 120;
      const y = 760 + row * 150;
      ctx.fillRect(x, y, 230, 26);
      ctx.fillRect(x + 20, y + 26, 14, 120);
      ctx.fillRect(x + 196, y + 26, 14, 120);
    }
  ctx.fillStyle = 'rgba(255, 170, 110, 0.18)';
  ctx.fillRect(0, 0, W, H);
}

function neon(ctx: Ctx) {
  ctx.fillStyle = vGrad(ctx, 0, H, [
    [0, '#060a1d'],
    [0.7, '#1a1442'],
    [1, '#0a0d1c'],
  ]);
  ctx.fillRect(0, 0, W, H);
  const rnd = seeded(77);
  let x = -20;
  while (x < W) {
    const bw = 120 + Math.floor(rnd() * 140);
    const bh = 320 + Math.floor(rnd() * 460);
    const top = 860 - bh;
    ctx.fillStyle = rnd() < 0.5 ? '#0f1531' : '#161c3f';
    ctx.fillRect(x, top, bw, bh + 220);
    for (let wy = top + 24; wy < 840; wy += 34)
      for (let wx = x + 14; wx < x + bw - 18; wx += 26) {
        const v = rnd();
        if (v < 0.22) {
          ctx.fillStyle = v < 0.1 ? 'rgba(111, 240, 255, 0.5)' : 'rgba(255, 210, 122, 0.55)';
          ctx.fillRect(wx, wy, 12, 16);
        }
      }
    x += bw + 6;
  }
  /* 霓虹燈條 */
  ctx.save();
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const [c, x0, y0, x1, y1] of [
    ['#ff4fd8', 260, 420, 520, 420],
    ['#3ff2ff', 1380, 360, 1380, 560],
    ['#ffe46b', 980, 300, 1180, 300],
  ] as const) {
    ctx.shadowColor = c;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#090c1b';
  ctx.fillRect(0, 860, W, 220);
  ctx.fillStyle = 'rgba(63, 242, 255, 0.08)';
  for (let i = 0; i < 12; i++) ctx.fillRect(i * 170 + 40, 870, 60, 210);
}

function shrine(ctx: Ctx) {
  ctx.fillStyle = vGrad(ctx, 0, H, [
    [0, '#0b1b29'],
    [0.7, '#22404a'],
    [1, '#0d1a1b'],
  ]);
  ctx.fillRect(0, 0, W, H);
  const rnd = seeded(9);
  ctx.fillStyle = 'rgba(240, 236, 210, 0.7)';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * 460, rnd() < 0.3 ? 1.8 : 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(245, 236, 208, 0.9)';
  ctx.beginPath();
  ctx.arc(1460, 230, 80, 0, Math.PI * 2);
  ctx.fill();
  /* 遠山 */
  ctx.fillStyle = '#132a30';
  ctx.beginPath();
  ctx.moveTo(0, 700);
  for (let i = 0; i <= 8; i++) ctx.lineTo(i * 240, 560 + ((i * 97) % 130));
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  /* 鳥居 */
  ctx.fillStyle = '#7b2c26';
  ctx.fillRect(700, 330, 44, 580);
  ctx.fillRect(1176, 330, 44, 580);
  ctx.fillRect(640, 410, 640, 30);
  ctx.beginPath();
  ctx.moveTo(590, 280);
  ctx.quadraticCurveTo(960, 330, 1330, 280);
  ctx.lineTo(1310, 330);
  ctx.quadraticCurveTo(960, 370, 610, 330);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(700, 330, 14, 580);
  ctx.fillRect(1176, 330, 14, 580);
  /* 參道與燈籠 */
  ctx.fillStyle = '#0e1b1c';
  ctx.fillRect(0, 900, W, 180);
  ctx.fillStyle = '#2b3a36';
  ctx.beginPath();
  ctx.moveTo(860, 900);
  ctx.lineTo(1060, 900);
  ctx.lineTo(1260, H);
  ctx.lineTo(660, H);
  ctx.closePath();
  ctx.fill();
  for (const lx of [420, 1500]) {
    const g = ctx.createRadialGradient(lx, 760, 4, lx, 760, 150);
    g.addColorStop(0, 'rgba(255, 196, 120, 0.55)');
    g.addColorStop(1, 'rgba(255, 196, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 160, 600, 320, 320);
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(lx - 10, 790, 20, 120);
    ctx.fillStyle = '#e8b36a';
    ctx.fillRect(lx - 24, 730, 48, 60);
  }
}

function field(ctx: Ctx) {
  ctx.fillStyle = vGrad(ctx, 0, 700, [
    [0, '#5fa8f5'],
    [1, '#cfe9ff'],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  for (const [cx, cy, s] of [
    [330, 190, 1],
    [1180, 130, 1.3],
    [1650, 260, 0.9],
  ] as const)
    for (const [dx, dy, r] of [
      [0, 0, 60],
      [60, -20, 70],
      [130, 0, 55],
      [70, 25, 60],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.fillStyle = '#7fcf6c';
  ctx.beginPath();
  ctx.moveTo(0, 640);
  ctx.quadraticCurveTo(520, 520, 1060, 640);
  ctx.quadraticCurveTo(1500, 730, W, 600);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#58ad55';
  ctx.beginPath();
  ctx.moveTo(0, 820);
  ctx.quadraticCurveTo(700, 700, 1320, 820);
  ctx.quadraticCurveTo(1650, 880, W, 800);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#dcc68f';
  ctx.beginPath();
  ctx.moveTo(900, 700);
  ctx.quadraticCurveTo(760, 880, 980, H);
  ctx.lineTo(1180, H);
  ctx.quadraticCurveTo(940, 880, 960, 700);
  ctx.closePath();
  ctx.fill();
}

/** 畫預覽背景（「透明」不畫） */
export function drawScene(ctx: Ctx, scene: Scene): void {
  ctx.save();
  switch (scene) {
    case 'study':
      study(ctx);
      break;
    case 'classroom':
      classroom(ctx);
      break;
    case 'neon':
      neon(ctx);
      break;
    case 'shrine':
      shrine(ctx);
      break;
    case 'field':
      field(ctx);
      break;
    default:
      break;
  }
  ctx.restore();
}

/** 範例立繪：本站自己畫的半身剪影（畫面下方中央，高約 92%） */
export function drawSamplePortrait(ctx: Ctx): void {
  const cx = 960;
  ctx.save();
  const body = ctx.createLinearGradient(0, 300, 0, H);
  body.addColorStop(0, '#454b5e');
  body.addColorStop(1, '#22252f');
  ctx.fillStyle = body;
  /* 肩膀與上身 */
  ctx.beginPath();
  ctx.moveTo(cx - 330, H);
  ctx.bezierCurveTo(cx - 330, 700, cx - 250, 600, cx - 110, 585);
  ctx.lineTo(cx + 110, 585);
  ctx.bezierCurveTo(cx + 250, 600, cx + 330, 700, cx + 330, H);
  ctx.closePath();
  ctx.fill();
  /* 脖子 */
  ctx.fillRect(cx - 52, 470, 104, 140);
  /* 頭 */
  ctx.beginPath();
  ctx.ellipse(cx, 380, 128, 150, 0, 0, Math.PI * 2);
  ctx.fill();
  /* 頭髮 */
  ctx.fillStyle = '#2a2433';
  ctx.beginPath();
  ctx.moveTo(cx - 150, 430);
  ctx.bezierCurveTo(cx - 170, 220, cx - 60, 175, cx + 20, 182);
  ctx.bezierCurveTo(cx + 150, 190, cx + 175, 300, cx + 150, 470);
  ctx.bezierCurveTo(cx + 120, 360, cx + 60, 300, cx - 30, 290);
  ctx.bezierCurveTo(cx - 90, 330, cx - 120, 380, cx - 150, 430);
  ctx.closePath();
  ctx.fill();
  /* 輪廓光 */
  ctx.strokeStyle = 'rgba(220, 228, 255, 0.28)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, 380, 128, 150, 0, -Math.PI * 0.55, Math.PI * 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 120, 592);
  ctx.bezierCurveTo(cx + 250, 605, cx + 325, 700, cx + 328, 900);
  ctx.stroke();
  ctx.restore();
}
