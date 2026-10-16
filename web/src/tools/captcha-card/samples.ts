/**
 * 範例圖（本站自己用程式畫的示意圖，不是照片）：四種「探索者」（戴帽子、拿放大鏡、提燈、圍巾）與六種別的東西
 * （古書、眼睛、骰子、鑰匙、月亮、蠟燭）。每張是 400 × 400 的正方形，在 100 × 100 的座標裡畫；第一次用到時畫好快取。
 */
import { makeCanvas } from '@/core/image';
import { SAMPLE_SIZE, type SampleKey } from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Palette {
  /** 背景漸層：中央 → 四周 */
  bg: [string, string];
}

const BG: Record<SampleKey, Palette> = {
  'seeker-hat': { bg: ['#f8d48a', '#d98a35'] },
  'seeker-lens': { bg: ['#9fe0d6', '#3f9c95'] },
  'seeker-lamp': { bg: ['#8d8fe0', '#383b8f'] },
  'seeker-scarf': { bg: ['#f3b3c4', '#b85b78'] },
  book: { bg: ['#d8d2a4', '#8f8a52'] },
  eye: { bg: ['#c6a8ec', '#6c4aa6'] },
  die: { bg: ['#b9c6d6', '#5b6b80'] },
  key: { bg: ['#e8c9a2', '#9b6a3c'] },
  moon: { bg: ['#4a5d9c', '#161d3d'] },
  candle: { bg: ['#d9786a', '#6e2420'] },
};

function background(ctx: Ctx, [inner, outer]: [string, string]) {
  const g = ctx.createRadialGradient(50, 38, 6, 50, 50, 78);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 100, 100);
  /* 斜向的淡紋路 */
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  for (let i = -100; i < 100; i += 9) {
    ctx.beginPath();
    ctx.moveTo(i, 100);
    ctx.lineTo(i + 100, 0);
    ctx.stroke();
  }
  ctx.restore();
}

/** 探索者的剪影：大衣、頭、紳士帽（帽帶用強調色） */
function seeker(ctx: Ctx, { coat, band, skin }: { coat: string; band: string; skin: string }) {
  /* 地上的影子 */
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(50, 99, 34, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  /* 大衣 */
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(16, 100);
  ctx.bezierCurveTo(18, 84, 29, 75, 50, 73);
  ctx.bezierCurveTo(71, 75, 82, 84, 84, 100);
  ctx.closePath();
  ctx.fill();
  /* 領口 */
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(41, 75);
  ctx.lineTo(50, 92);
  ctx.lineTo(59, 75);
  ctx.stroke();
  /* 脖子與頭 */
  ctx.fillStyle = skin;
  ctx.fillRect(45, 62, 10, 12);
  ctx.beginPath();
  ctx.arc(50, 55, 11.5, 0, Math.PI * 2);
  ctx.fill();
  /* 帽簷 */
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(50, 45.5, 21, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  /* 帽冠 */
  ctx.beginPath();
  ctx.moveTo(37, 45);
  ctx.bezierCurveTo(36.5, 35, 38.5, 28.5, 43, 27.5);
  ctx.quadraticCurveTo(50, 30, 57, 27.5);
  ctx.bezierCurveTo(61.5, 28.5, 63.5, 35, 63, 45);
  ctx.closePath();
  ctx.fill();
  /* 帽帶 */
  ctx.fillStyle = band;
  ctx.fillRect(37.2, 39.5, 25.6, 4);
}

function magnifier(ctx: Ctx) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a2a1f';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(77, 74);
  ctx.lineTo(88, 87);
  ctx.stroke();
  ctx.fillStyle = 'rgba(235, 248, 255, 0.45)';
  ctx.beginPath();
  ctx.arc(70, 66, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f2e7c9';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(70, 66, 5.5, Math.PI * 1.1, Math.PI * 1.5);
  ctx.stroke();
}

function lantern(ctx: Ctx, x: number, y: number) {
  const glow = ctx.createRadialGradient(x, y + 9, 1, x, y + 9, 22);
  glow.addColorStop(0, 'rgba(255, 226, 140, 0.85)');
  glow.addColorStop(1, 'rgba(255, 226, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 24, y - 14, 48, 48);
  ctx.strokeStyle = '#2b2620';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, y - 1, 4.5, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#2b2620';
  ctx.fillRect(x - 6.5, y, 13, 3);
  ctx.fillRect(x - 6.5, y + 15, 13, 3);
  ctx.fillStyle = '#ffd56a';
  ctx.fillRect(x - 5, y + 3, 10, 12);
  ctx.fillStyle = '#fff4c8';
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 2, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function scarf(ctx: Ctx) {
  ctx.fillStyle = '#d23c4b';
  ctx.beginPath();
  ctx.moveTo(40, 69);
  ctx.quadraticCurveTo(50, 75, 60, 69);
  ctx.lineTo(61, 75);
  ctx.quadraticCurveTo(50, 81, 39, 75);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(55, 76);
  ctx.lineTo(62, 76);
  ctx.lineTo(60, 95);
  ctx.lineTo(53, 93);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1;
  for (const yy of [84, 88]) {
    ctx.beginPath();
    ctx.moveTo(54, yy);
    ctx.lineTo(61, yy + 0.6);
    ctx.stroke();
  }
}

function book(ctx: Ctx) {
  ctx.save();
  ctx.translate(50, 54);
  ctx.rotate(-0.12);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(-25, -29, 54, 64);
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(-23, -31, 50, 62);
  ctx.fillStyle = '#6d2e22';
  ctx.fillRect(-27, -33, 48, 64);
  ctx.fillStyle = '#4f1f17';
  ctx.fillRect(-27, -33, 7, 64);
  ctx.strokeStyle = '#d9b45a';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-16, -26, 32, 50);
  /* 封面的星形紋章 */
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.5 : 11;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = Math.cos(a) * r;
    const py = -2 + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function eye(ctx: Ctx) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(50 + Math.cos(a) * 30, 50 + Math.sin(a) * 30);
    ctx.lineTo(50 + Math.cos(a) * 40, 50 + Math.sin(a) * 40);
    ctx.stroke();
  }
  ctx.fillStyle = '#f7f1ff';
  ctx.beginPath();
  ctx.moveTo(22, 50);
  ctx.quadraticCurveTo(50, 22, 78, 50);
  ctx.quadraticCurveTo(50, 78, 22, 50);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2f8f6b';
  ctx.beginPath();
  ctx.arc(50, 50, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12141a';
  ctx.beginPath();
  ctx.ellipse(50, 50, 3.2, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(46, 46, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function die(ctx: Ctx) {
  ctx.save();
  ctx.translate(50, 52);
  ctx.rotate(0.2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.roundRect(-24, -20, 52, 52, 9);
  ctx.fill();
  ctx.fillStyle = '#fbfbf8';
  ctx.beginPath();
  ctx.roundRect(-26, -26, 52, 52, 9);
  ctx.fill();
  ctx.fillStyle = '#c63a3a';
  const pips: [number, number][] = [
    [-13, -13],
    [13, -13],
    [0, 0],
    [-13, 13],
    [13, 13],
  ];
  for (const [x, y] of pips) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function key(ctx: Ctx) {
  ctx.save();
  ctx.translate(50, 50);
  ctx.rotate(-0.7);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-14, 3);
  ctx.lineTo(32, 3);
  ctx.stroke();
  ctx.strokeStyle = '#f3d27a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(-24, 0, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(32, 0);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(22, 11);
  ctx.moveTo(30, 0);
  ctx.lineTo(30, 9);
  ctx.stroke();
  ctx.fillStyle = '#f3d27a';
  ctx.beginPath();
  ctx.arc(-24, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function moon(ctx: Ctx) {
  ctx.fillStyle = '#ffffff';
  for (const [x, y, r] of [
    [20, 22, 1.4],
    [78, 18, 1.1],
    [84, 62, 1.6],
    [26, 76, 1],
    [62, 86, 1.2],
    [14, 50, 0.9],
  ] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const glow = ctx.createRadialGradient(50, 50, 18, 50, 50, 40);
  glow.addColorStop(0, 'rgba(255, 241, 196, 0.35)');
  glow.addColorStop(1, 'rgba(255, 241, 196, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 100, 100);
  ctx.save();
  ctx.beginPath();
  ctx.arc(50, 50, 24, 0, Math.PI * 2);
  ctx.arc(62, 42, 21, 0, Math.PI * 2, true);
  ctx.fillStyle = '#fff1c4';
  ctx.fill('evenodd');
  ctx.restore();
}

function candle(ctx: Ctx) {
  const glow = ctx.createRadialGradient(50, 30, 2, 50, 30, 34);
  glow.addColorStop(0, 'rgba(255, 210, 120, 0.8)');
  glow.addColorStop(1, 'rgba(255, 210, 120, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = '#f4ead6';
  ctx.fillRect(41, 40, 18, 46);
  ctx.beginPath();
  ctx.ellipse(50, 40, 9, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fillRect(53, 40, 6, 46);
  ctx.fillStyle = '#3a2a22';
  ctx.fillRect(49.2, 33, 1.6, 6);
  ctx.fillStyle = '#ffcf5a';
  ctx.beginPath();
  ctx.moveTo(50, 17);
  ctx.quadraticCurveTo(57, 28, 50, 34);
  ctx.quadraticCurveTo(43, 28, 50, 17);
  ctx.fill();
  ctx.fillStyle = '#fff6d6';
  ctx.beginPath();
  ctx.ellipse(50, 29, 2, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a4033';
  ctx.beginPath();
  ctx.ellipse(50, 87, 20, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

const SEEKER_SKIN = '#f1d3b5';

/** 在 ctx 的 (0, 0)～(size, size) 畫一張範例圖 */
export function drawSample(ctx: Ctx, key_: SampleKey, size: number): void {
  ctx.save();
  ctx.scale(size / 100, size / 100);
  background(ctx, BG[key_].bg);
  switch (key_) {
    case 'seeker-hat':
      seeker(ctx, { coat: '#3b2f2a', band: '#b5452f', skin: SEEKER_SKIN });
      break;
    case 'seeker-lens':
      seeker(ctx, { coat: '#22343a', band: '#d9b45a', skin: SEEKER_SKIN });
      magnifier(ctx);
      break;
    case 'seeker-lamp':
      seeker(ctx, { coat: '#1f2140', band: '#7d8ae0', skin: SEEKER_SKIN });
      lantern(ctx, 24, 62);
      break;
    case 'seeker-scarf':
      seeker(ctx, { coat: '#3c2433', band: '#2e1a25', skin: SEEKER_SKIN });
      scarf(ctx);
      break;
    case 'book':
      book(ctx);
      break;
    case 'eye':
      eye(ctx);
      break;
    case 'die':
      die(ctx);
      break;
    case 'key':
      key(ctx);
      break;
    case 'moon':
      moon(ctx);
      break;
    case 'candle':
      candle(ctx);
      break;
  }
  ctx.restore();
}

const cache = new Map<SampleKey, HTMLCanvasElement | OffscreenCanvas>();

/** 範例圖（400 × 400 的畫布，畫好一次就留著） */
export function sampleCanvas(k: SampleKey): HTMLCanvasElement | OffscreenCanvas {
  let c = cache.get(k);
  if (!c) {
    c = makeCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const ctx = c.getContext('2d') as Ctx | null;
    if (ctx) drawSample(ctx, k, SAMPLE_SIZE);
    cache.set(k, c);
  }
  return c;
}
