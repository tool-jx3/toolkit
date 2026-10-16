/**
 * 範例圖（D2）：全部由程式畫（霧港鎮的燈塔、舊地圖、舊照片、日記、夜晚的港口、月亮、蠟燭、雨夜的街道、三個大頭貼），
 * 沒有真實人物。第一次用到時畫一次、之後重用同一張 canvas。
 */
import { makeCanvas } from '@/core/image';
import { createRandom } from '@/core/timeline';
import { SAMPLE_SIZES, type SampleKey } from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const cache = new Map<SampleKey, AnyCanvas>();

function vgrad(ctx: Ctx, h: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function stars(ctx: Ctx, w: number, h: number, n: number, seed: string): void {
  const r = createRandom(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(255,255,255,${(0.3 + r.next() * 0.6).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(r.next() * w, r.next() * h, 1 + r.next() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function glow(
  ctx: Ctx,
  x: number,
  y: number,
  r0: number,
  r1: number,
  color: string,
  a: number,
): void {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  g.addColorStop(0, color.replace('A', String(a)));
  g.addColorStop(1, color.replace('A', '0'));
  ctx.fillStyle = g;
  ctx.fillRect(x - r1, y - r1, r1 * 2, r1 * 2);
}

function fog(ctx: Ctx, w: number, y: number, h: number, a: number, seed: string): void {
  const r = createRandom(seed);
  for (let i = 0; i < 9; i++) {
    const cx = r.next() * w;
    const cy = y + r.next() * h;
    const rx = 220 + r.next() * 320;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, `rgba(220,228,236,${a})`);
    g.addColorStop(1, 'rgba(220,228,236,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, rx * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

const DRAW: Record<SampleKey, (ctx: Ctx, w: number, h: number) => void> = {
  lighthouse(ctx, w, h) {
    ctx.fillStyle = vgrad(ctx, h, [
      [0, '#16222e'],
      [0.55, '#3c5161'],
      [1, '#1c2a33'],
    ]);
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h * 0.4, 50, 'lh-stars');
    /* 光束 */
    ctx.save();
    const g = ctx.createLinearGradient(640, 430, 0, 250);
    g.addColorStop(0, 'rgba(255,233,170,0.55)');
    g.addColorStop(1, 'rgba(255,233,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(660, 420);
    ctx.lineTo(0, 170);
    ctx.lineTo(0, 400);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    glow(ctx, 660, 425, 6, 160, 'rgba(255,236,180,A)', 0.8);
    /* 海 */
    ctx.fillStyle = vgrad(ctx, h, [
      [0, '#22323d'],
      [1, '#0d151b'],
    ]);
    ctx.fillRect(0, 980, w, h - 980);
    ctx.strokeStyle = 'rgba(190,210,220,0.18)';
    ctx.lineWidth = 3;
    const r = createRandom('lh-sea');
    for (let i = 0; i < 26; i++) {
      const y = 1000 + r.next() * 330;
      const x = r.next() * w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 60 + r.next() * 140, y);
      ctx.stroke();
    }
    /* 懸崖 */
    ctx.fillStyle = '#0f1a20';
    ctx.beginPath();
    ctx.moveTo(380, 1010);
    ctx.bezierCurveTo(470, 860, 560, 800, 680, 790);
    ctx.lineTo(1080, 770);
    ctx.lineTo(1080, 1350);
    ctx.lineTo(300, 1350);
    ctx.closePath();
    ctx.fill();
    /* 燈塔 */
    ctx.fillStyle = '#d9dcd6';
    ctx.beginPath();
    ctx.moveTo(612, 800);
    ctx.lineTo(708, 800);
    ctx.lineTo(690, 470);
    ctx.lineTo(630, 470);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9d3b38';
    for (const [y0, y1] of [
      [560, 610],
      [680, 730],
    ]) {
      const t0 = (y0 - 470) / 330;
      const t1 = (y1 - 470) / 330;
      ctx.beginPath();
      ctx.moveTo(630 - 18 * t0, y0);
      ctx.lineTo(690 + 18 * t0, y0);
      ctx.lineTo(690 + 18 * t1, y1);
      ctx.lineTo(630 - 18 * t1, y1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#2b3236';
    ctx.fillRect(618, 395, 84, 18);
    ctx.fillRect(625, 470, 70, 10);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(632, 413, 56, 57);
    ctx.fillStyle = '#2b3236';
    ctx.beginPath();
    ctx.moveTo(612, 398);
    ctx.lineTo(660, 350);
    ctx.lineTo(708, 398);
    ctx.closePath();
    ctx.fill();
    fog(ctx, w, 700, 500, 0.22, 'lh-fog');
  },
  map(ctx, w, h) {
    ctx.fillStyle = '#e6d6ad';
    ctx.fillRect(0, 0, w, h);
    const r = createRandom('map');
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(120,86,40,${(r.next() * 0.08).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(r.next() * w, r.next() * h, 10 + r.next() * 60, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(110,80,40,0.18)';
    ctx.lineWidth = 2;
    for (let x = 90; x < w; x += 150) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 90; y < h; y += 150) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    /* 海岸線 */
    ctx.fillStyle = 'rgba(98,140,150,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(520, 0);
    ctx.bezierCurveTo(470, 220, 610, 340, 520, 520);
    ctx.bezierCurveTo(430, 700, 600, 860, 470, 1040);
    ctx.bezierCurveTo(380, 1170, 420, 1260, 380, 1350);
    ctx.lineTo(0, 1350);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b4a24';
    ctx.lineWidth = 5;
    ctx.stroke();
    /* 路線與記號 */
    ctx.setLineDash([22, 16]);
    ctx.strokeStyle = '#8b2f2a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(920, 1180);
    ctx.bezierCurveTo(820, 980, 900, 800, 720, 700);
    ctx.bezierCurveTo(620, 640, 640, 520, 600, 430);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(560, 390);
    ctx.lineTo(640, 470);
    ctx.moveTo(640, 390);
    ctx.lineTo(560, 470);
    ctx.stroke();
    /* 羅盤 */
    ctx.save();
    ctx.translate(860, 260);
    ctx.strokeStyle = '#6b4a24';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#6b4a24';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -120);
      ctx.lineTo(18, 0);
      ctx.lineTo(-18, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
  oldphoto(ctx, w, h) {
    ctx.fillStyle = '#f2ead9';
    ctx.fillRect(0, 0, w, h);
    const m = 70;
    const ih = h - m * 2 - 120;
    ctx.fillStyle = vgrad(ctx, ih, [
      [0, '#cdb48c'],
      [1, '#7a6141'],
    ]);
    ctx.save();
    ctx.translate(m, m);
    ctx.fillRect(0, 0, w - m * 2, ih);
    /* 房子與樹的剪影 */
    ctx.fillStyle = 'rgba(52,38,24,0.85)';
    ctx.beginPath();
    ctx.moveTo(180, 820);
    ctx.lineTo(180, 560);
    ctx.lineTo(420, 400);
    ctx.lineTo(660, 560);
    ctx.lineTo(660, 820);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(560, 430, 50, 110);
    ctx.fillStyle = 'rgba(245,220,170,0.55)';
    ctx.fillRect(250, 620, 70, 90);
    ctx.fillRect(520, 620, 70, 90);
    ctx.fillStyle = 'rgba(52,38,24,0.85)';
    ctx.beginPath();
    ctx.arc(820, 520, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(805, 600, 30, 230);
    ctx.fillRect(0, 820, w - m * 2, ih - 820);
    /* 刮痕 */
    const r = createRandom('old');
    ctx.strokeStyle = 'rgba(255,248,230,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const x = r.next() * (w - m * 2);
      ctx.beginPath();
      ctx.moveTo(x, r.next() * ih);
      ctx.lineTo(x + (r.next() - 0.5) * 60, r.next() * ih);
      ctx.stroke();
    }
    ctx.restore();
    const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.85);
    v.addColorStop(0, 'rgba(60,40,20,0)');
    v.addColorStop(1, 'rgba(60,40,20,0.35)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },
  diary(ctx, w, h) {
    ctx.fillStyle = vgrad(ctx, h, [
      [0, '#3b2a20'],
      [1, '#22170f'],
    ]);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    for (let y = 40; y < h; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 20, w * 0.6, y - 20, w, y + 10);
      ctx.stroke();
    }
    glow(ctx, 860, 180, 10, 520, 'rgba(255,190,110,A)', 0.4);
    /* 日記 */
    ctx.save();
    ctx.translate(540, 600);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#ebe0c8';
    ctx.fillRect(-400, -300, 390, 560);
    ctx.fillStyle = '#e4d7bb';
    ctx.beginPath();
    ctx.moveTo(10, -300);
    ctx.lineTo(400, -300);
    ctx.lineTo(400, 260);
    for (let y = 260; y > -300; y -= 40) ctx.lineTo(10 + (y % 80 === 0 ? 14 : 0), y - 20);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,70,60,0.35)';
    ctx.lineWidth = 2;
    for (let y = -240; y < 240; y += 42) {
      ctx.beginPath();
      ctx.moveTo(-370, y);
      ctx.lineTo(-40, y);
      ctx.moveTo(40, y);
      ctx.lineTo(370, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40,36,60,0.75)';
    ctx.lineWidth = 3;
    const r = createRandom('diary');
    for (let row = 0; row < 9; row++) {
      const y = -250 + row * 42;
      let x = -360;
      while (x < -70) {
        const len = 30 + r.next() * 60;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < len; k += 8) ctx.lineTo(x + k, y - 6 - Math.sin(k * 0.6 + row) * 6);
        ctx.stroke();
        x += len + 14;
      }
    }
    ctx.restore();
    /* 杯子 */
    ctx.fillStyle = '#1a120c';
    ctx.beginPath();
    ctx.arc(900, 900, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a2c18';
    ctx.beginPath();
    ctx.arc(900, 900, 92, 0, Math.PI * 2);
    ctx.fill();
  },
  harbor(ctx, w, h) {
    ctx.fillStyle = vgrad(ctx, h, [
      [0, '#0c1428'],
      [0.6, '#24345a'],
      [1, '#0a0f1d'],
    ]);
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h * 0.5, 90, 'hb-stars');
    glow(ctx, 760, 300, 40, 240, 'rgba(240,232,200,A)', 0.35);
    ctx.fillStyle = '#efe6c8';
    ctx.beginPath();
    ctx.arc(760, 300, 70, 0, Math.PI * 2);
    ctx.fill();
    /* 水面的倒影 */
    ctx.fillStyle = '#0d1730';
    ctx.fillRect(0, 860, w, h - 860);
    ctx.fillStyle = 'rgba(240,232,200,0.35)';
    const r = createRandom('hb-water');
    for (let i = 0; i < 22; i++) {
      const y = 880 + i * 20;
      const ww = 30 + r.next() * 120;
      ctx.fillRect(760 - ww / 2 + (r.next() - 0.5) * 40, y, ww, 4);
    }
    /* 碼頭與船 */
    ctx.fillStyle = '#05080f';
    ctx.fillRect(0, 900, 520, 26);
    for (let x = 30; x < 520; x += 90) ctx.fillRect(x, 900, 14, 180);
    ctx.beginPath();
    ctx.moveTo(560, 860);
    ctx.lineTo(900, 860);
    ctx.lineTo(850, 930);
    ctx.lineTo(600, 930);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(690, 600, 8, 260);
    ctx.beginPath();
    ctx.moveTo(700, 610);
    ctx.lineTo(840, 840);
    ctx.lineTo(700, 840);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.arc(120, 880, 9, 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, 120, 880, 4, 90, 'rgba(255,210,122,A)', 0.5);
  },
  moon(ctx, w, h) {
    ctx.fillStyle = vgrad(ctx, h, [
      [0, '#070b1c'],
      [1, '#1e2a52'],
    ]);
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h, 120, 'moon-stars');
    glow(ctx, 540, 520, 200, 520, 'rgba(255,248,220,A)', 0.28);
    const g = ctx.createRadialGradient(480, 460, 40, 540, 520, 300);
    g.addColorStop(0, '#fffbe8');
    g.addColorStop(1, '#e3d7ae');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(540, 520, 280, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,145,100,0.28)';
    for (const [x, y, r] of [
      [450, 430, 60],
      [640, 560, 80],
      [520, 660, 40],
      [610, 400, 30],
      [420, 600, 34],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(30,40,70,0.55)';
    ctx.beginPath();
    ctx.ellipse(380, 780, 420, 70, -0.1, 0, Math.PI * 2);
    ctx.fill();
  },
  candle(ctx, w, h) {
    ctx.fillStyle = '#0b0807';
    ctx.fillRect(0, 0, w, h);
    glow(ctx, 540, 520, 10, 620, 'rgba(255,170,70,A)', 0.45);
    /* 蠟燭 */
    ctx.fillStyle = vgrad(ctx, h, [
      [0, '#f2e6cf'],
      [1, '#b9a581'],
    ]);
    ctx.fillRect(450, 620, 180, 560);
    ctx.fillStyle = '#f7eedb';
    ctx.beginPath();
    ctx.ellipse(540, 620, 90, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(470, 620);
    ctx.quadraticCurveTo(475, 760, 495, 760);
    ctx.quadraticCurveTo(510, 700, 520, 630);
    ctx.fill();
    ctx.fillStyle = '#2a1d14';
    ctx.fillRect(536, 560, 8, 62);
    const f = ctx.createRadialGradient(540, 520, 4, 540, 510, 70);
    f.addColorStop(0, '#fffbe6');
    f.addColorStop(0.5, '#ffd36b');
    f.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = f;
    ctx.beginPath();
    ctx.moveTo(540, 420);
    ctx.bezierCurveTo(600, 500, 580, 570, 540, 572);
    ctx.bezierCurveTo(500, 570, 480, 500, 540, 420);
    ctx.fill();
    ctx.fillStyle = '#1a120c';
    ctx.fillRect(300, 1180, 480, 40);
  },
  street(ctx, w, h) {
    ctx.fillStyle = vgrad(ctx, h, [
      [0, '#0d1220'],
      [0.6, '#1d2436'],
      [1, '#10141f'],
    ]);
    ctx.fillRect(0, 0, w, h);
    const r = createRandom('street');
    /* 房子 */
    const houses = [
      [0, 380, 260],
      [250, 300, 230],
      [470, 420, 200],
      [660, 260, 220],
      [870, 360, 210],
    ];
    for (const [x, top, ww] of houses) {
      ctx.fillStyle = '#080b14';
      ctx.fillRect(x, top, ww, 900 - top);
      for (let wy = top + 40; wy < 860; wy += 90)
        for (let wx = x + 30; wx < x + ww - 40; wx += 70) {
          if (r.next() < 0.45) continue;
          ctx.fillStyle = r.next() < 0.5 ? 'rgba(255,214,140,0.85)' : 'rgba(150,180,220,0.35)';
          ctx.fillRect(wx, wy, 34, 46);
        }
    }
    /* 路燈 */
    for (const x of [180, 820]) {
      ctx.fillStyle = '#05070c';
      ctx.fillRect(x - 6, 600, 12, 420);
      ctx.fillStyle = '#ffe2a0';
      ctx.beginPath();
      ctx.arc(x, 600, 16, 0, Math.PI * 2);
      ctx.fill();
      glow(ctx, x, 600, 10, 200, 'rgba(255,220,150,A)', 0.4);
    }
    /* 濕的地面與倒影 */
    ctx.fillStyle = '#111624';
    ctx.fillRect(0, 900, w, h - 900);
    for (const x of [180, 820]) {
      const g = ctx.createLinearGradient(0, 900, 0, 1350);
      g.addColorStop(0, 'rgba(255,220,150,0.35)');
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 40, 900, 80, 450);
    }
    /* 雨 */
    ctx.strokeStyle = 'rgba(190,205,230,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 160; i++) {
      const x = r.next() * w;
      const y = r.next() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 8, y + 34);
      ctx.stroke();
    }
  },
  'avatar-me'(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2d3a5e');
    g.addColorStop(1, '#6a4f8a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3e9d2';
    ctx.beginPath();
    ctx.roundRect(100, 140, 200, 140, 24);
    ctx.fill();
    ctx.fillRect(150, 118, 70, 30);
    ctx.fillStyle = '#2d3a5e';
    ctx.beginPath();
    ctx.arc(200, 210, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9fb4e8';
    ctx.beginPath();
    ctx.arc(200, 210, 30, 0, Math.PI * 2);
    ctx.fill();
  },
  'avatar-kai'(ctx, w, h) {
    ctx.fillStyle = '#2f5d4f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e9dcc0';
    ctx.beginPath();
    ctx.moveTo(90, 130);
    ctx.lineTo(195, 150);
    ctx.lineTo(195, 290);
    ctx.lineTo(90, 270);
    ctx.closePath();
    ctx.moveTo(310, 130);
    ctx.lineTo(205, 150);
    ctx.lineTo(205, 290);
    ctx.lineTo(310, 270);
    ctx.closePath();
    ctx.fill();
  },
  'avatar-info'(ctx, w, h) {
    ctx.fillStyle = '#8a3b3b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f5ead6';
    ctx.beginPath();
    ctx.moveTo(170, 320);
    ctx.lineTo(230, 320);
    ctx.lineTo(220, 140);
    ctx.lineTo(180, 140);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(160, 108, 80, 30);
    ctx.fillStyle = '#ffd66b';
    ctx.fillRect(176, 112, 48, 22);
    glow(ctx, 200, 120, 10, 160, 'rgba(255,214,107,A)', 0.5);
  },
};

/** 範例圖的 canvas（第一次用到時畫） */
export function sampleCanvas(key: SampleKey): AnyCanvas {
  let c = cache.get(key);
  if (!c) {
    const [w, h] = SAMPLE_SIZES[key];
    c = makeCanvas(w, h);
    const ctx = c.getContext('2d') as Ctx | null;
    if (ctx) DRAW[key](ctx, w, h);
    cache.set(key, c);
  }
  return c;
}
