/**
 * 紙張質感（規格 3.6，圖樣全部本站自己畫）：疊在背景色上面、背景圖與內容下面。
 * 線條與點用文字顏色的淡色（深色主題也看得到）；羊皮紙用暖褐色；雜訊用固定的亂數（每次一樣）。
 * 座標是畫面 px（呼叫端已經 scale）。
 */
import { createRandom } from '@/core/timeline';
import type { TextureId } from '../model';
import { type Ctx, rgba } from './canvas';

export function paintTexture(ctx: Ctx, id: TextureId, w: number, h: number, ink: string): void {
  if (id === 'none') return;
  ctx.save();
  switch (id) {
    case 'parchment':
      parchment(ctx, w, h);
      break;
    case 'grid':
      grid(ctx, w, h, ink);
      break;
    case 'ruled':
      ruled(ctx, w, h, ink);
      break;
    case 'checker':
      checker(ctx, w, h, ink);
      break;
    case 'dot':
      dots(ctx, w, h, ink);
      break;
    case 'noise':
      noise(ctx, w, h);
      break;
    case 'fine':
      fine(ctx, w, h, ink);
      break;
  }
  ctx.restore();
}

/** 羊皮紙：暖色的底、幾團淡淡的污漬、纖維、四周稍暗 */
function parchment(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = 'rgba(214, 186, 132, 0.16)';
  ctx.fillRect(0, 0, w, h);
  const rnd = createRandom('handout-parchment');
  const blots = Math.max(6, Math.round((w * h) / 26000));
  for (let i = 0; i < blots; i++) {
    const x = rnd.next() * w;
    const y = rnd.next() * h;
    const r = 30 + rnd.next() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(150, 110, 60, ${0.05 + rnd.next() * 0.05})`);
    g.addColorStop(1, 'rgba(150, 110, 60, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.strokeStyle = 'rgba(120, 90, 50, 0.08)';
  ctx.lineWidth = 0.6;
  const fibers = Math.round((w * h) / 2600);
  for (let i = 0; i < fibers; i++) {
    const x = rnd.next() * w;
    const y = rnd.next() * h;
    const a = rnd.next() * Math.PI;
    const l = 3 + rnd.next() * 9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const v = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.hypot(w, h) / 2,
  );
  v.addColorStop(0, 'rgba(120, 80, 30, 0)');
  v.addColorStop(1, 'rgba(120, 80, 30, 0.16)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** 方格紙：每 12 px 一條細線、每 5 格一條粗一點的線 */
function grid(ctx: Ctx, w: number, h: number, ink: string): void {
  const cell = 12;
  for (let i = 0, x = 0; x <= w; i++, x += cell) {
    ctx.fillStyle = rgba(ink, i % 5 === 0 ? 0.13 : 0.06);
    ctx.fillRect(x, 0, i % 5 === 0 ? 1 : 0.6, h);
  }
  for (let i = 0, y = 0; y <= h; i++, y += cell) {
    ctx.fillStyle = rgba(ink, i % 5 === 0 ? 0.13 : 0.06);
    ctx.fillRect(0, y, w, i % 5 === 0 ? 1 : 0.6);
  }
}

/** 橫線：每 32 px 一條（同原作「2em」的間距） */
function ruled(ctx: Ctx, w: number, h: number, ink: string): void {
  ctx.fillStyle = rgba(ink, 0.12);
  for (let y = 32; y < h; y += 32) ctx.fillRect(0, y - 1, w, 1);
}

/** 格紋：橫直交錯的淡色寬條（20 px 一格、條寬 10 px） */
function checker(ctx: Ctx, w: number, h: number, ink: string): void {
  ctx.fillStyle = rgba(ink, 0.035);
  for (let x = 0; x < w; x += 20) ctx.fillRect(x, 0, 10, h);
  for (let y = 0; y < h; y += 20) ctx.fillRect(0, y, w, 10);
}

/** 點點：每 20 px 一個半徑 1 px 的點 */
function dots(ctx: Ctx, w: number, h: number, ink: string): void {
  ctx.fillStyle = rgba(ink, 0.1);
  for (let y = 10; y < h; y += 20)
    for (let x = 10; x < w; x += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
}

/** 老舊雜訊：深淺的細點與幾道細刮痕 */
function noise(ctx: Ctx, w: number, h: number): void {
  const rnd = createRandom('handout-noise');
  const n = Math.round((w * h) / 45);
  for (let i = 0; i < n; i++) {
    const x = rnd.next() * w;
    const y = rnd.next() * h;
    const dark = rnd.next() < 0.6;
    const a = 0.04 + rnd.next() * 0.12;
    ctx.fillStyle = dark ? `rgba(40, 32, 24, ${a})` : `rgba(255, 255, 255, ${a * 1.4})`;
    const s = rnd.next() < 0.9 ? 1 : 1.6;
    ctx.fillRect(x, y, s, s);
  }
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.07)';
  ctx.lineWidth = 0.7;
  const scratches = Math.max(3, Math.round((w * h) / 40000));
  for (let i = 0; i < scratches; i++) {
    const x = rnd.next() * w;
    const y = rnd.next() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + 20 + rnd.next() * 40,
      y + rnd.next() * 30,
      x + 40 + rnd.next() * 80,
      y + rnd.next() * 50,
    );
    ctx.stroke();
  }
}

/** 高級紙：很淡的斜向菱格與細纖維 */
function fine(ctx: Ctx, w: number, h: number, ink: string): void {
  ctx.strokeStyle = rgba(ink, 0.035);
  ctx.lineWidth = 0.7;
  const step = 14;
  ctx.beginPath();
  for (let k = -h; k < w + h; k += step) {
    ctx.moveTo(k, 0);
    ctx.lineTo(k + h, h);
    ctx.moveTo(k, h);
    ctx.lineTo(k + h, 0);
  }
  ctx.stroke();
  const rnd = createRandom('handout-fine');
  ctx.strokeStyle = rgba(ink, 0.05);
  ctx.lineWidth = 0.5;
  const fibers = Math.round((w * h) / 3500);
  for (let i = 0; i < fibers; i++) {
    const x = rnd.next() * w;
    const y = rnd.next() * h;
    const a = rnd.next() * Math.PI;
    const l = 4 + rnd.next() * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.6) * l * 0.5,
      y + Math.sin(a + 0.6) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    ctx.stroke();
  }
}
