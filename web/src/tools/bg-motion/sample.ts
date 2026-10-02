/**
 * 本站自己畫的圖：範例背景（2048 × 1536 的湖畔古堡夜景）與效果卡片示意用的小風景（白天、黃昏、夜晚三張）。
 * 全部用 canvas 現畫、固定種子的亂數，每次都一樣。
 */
import { createRandom } from '@/core/timeline';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const SAMPLE_SIZE = { width: 2048, height: 1536 };

/** 山稜線：從左到右的高低起伏（0～1 的比例） */
function ridge(
  ctx: Ctx,
  w: number,
  baseY: number,
  amp: number,
  seed: number,
  color: string,
  bottom: number,
) {
  const rnd = createRandom(seed);
  const k1 = 1.5 + rnd.next() * 1.5;
  const k2 = 4 + rnd.next() * 3;
  const p1 = rnd.next() * 6;
  const p2 = rnd.next() * 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = 0; x <= w; x += Math.max(2, w / 160)) {
    const u = x / w;
    const y =
      baseY -
      amp * (0.6 * Math.sin(u * Math.PI * k1 + p1) + 0.4 * Math.sin(u * Math.PI * k2 + p2)) -
      amp * 0.4;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, bottom);
  ctx.closePath();
  ctx.fill();
}

/** 圓錐尖頂的塔 */
function tower(ctx: Ctx, x: number, top: number, bottom: number, tw: number, roof: number) {
  ctx.fillRect(x - tw / 2, top, tw, bottom - top);
  ctx.beginPath();
  ctx.moveTo(x - tw * 0.62, top + 1);
  ctx.lineTo(x, top - roof);
  ctx.lineTo(x + tw * 0.62, top + 1);
  ctx.closePath();
  ctx.fill();
}

/** 範例背景：湖畔古堡的夜景（任意尺寸，座標都依比例） */
export function drawSampleScene(ctx: Ctx, w: number, h: number): void {
  const rnd = createRandom('bg-motion-sample');
  const horizon = h * 0.64;

  /* 夜空 */
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#070b1f');
  sky.addColorStop(0.45, '#17204d');
  sky.addColorStop(0.8, '#3a3570');
  sky.addColorStop(1, '#7a5a8c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  /* 銀河般的淡光帶 */
  ctx.save();
  ctx.translate(w * 0.5, h * 0.22);
  ctx.rotate(-0.35);
  const band = ctx.createLinearGradient(0, -h * 0.12, 0, h * 0.12);
  band.addColorStop(0, 'rgba(160, 170, 255, 0)');
  band.addColorStop(0.5, 'rgba(160, 170, 255, 0.16)');
  band.addColorStop(1, 'rgba(160, 170, 255, 0)');
  ctx.fillStyle = band;
  ctx.fillRect(-w, -h * 0.12, w * 2, h * 0.24);
  ctx.restore();

  /* 星星 */
  const stars = Math.round((w * h) / 9000);
  for (let i = 0; i < stars; i++) {
    const x = rnd.next() * w;
    const y = rnd.next() * horizon * 0.85;
    const r = (0.6 + rnd.next() * 1.8) * (w / 2048);
    ctx.globalAlpha = 0.3 + rnd.next() * 0.7;
    ctx.fillStyle = rnd.next() < 0.15 ? '#ffe6b0' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, r), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* 月亮（左上）與光暈 */
  const mx = w * 0.2;
  const my = h * 0.17;
  const mr = Math.min(w, h) * 0.07;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.9, mx, my, mr * 5);
  halo.addColorStop(0, 'rgba(255, 244, 214, 0.42)');
  halo.addColorStop(1, 'rgba(255, 244, 214, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
  ctx.fillStyle = '#fbf2d5';
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(200, 186, 150, 0.35)';
  for (const [ox, oy, rr] of [
    [-0.3, -0.2, 0.22],
    [0.25, 0.15, 0.16],
    [-0.05, 0.4, 0.12],
  ]) {
    ctx.beginPath();
    ctx.arc(mx + ox * mr, my + oy * mr, rr * mr, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 遠山兩層 */
  ridge(ctx, w, horizon - h * 0.05, h * 0.07, 11, '#2e2c5e', horizon + 2);
  ridge(ctx, w, horizon - h * 0.01, h * 0.045, 23, '#1f1f44', horizon + 2);

  /* 右側山丘上的古堡 */
  ctx.fillStyle = '#141432';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, horizon + 2);
  ctx.quadraticCurveTo(w * 0.72, horizon - h * 0.16, w * 0.98, horizon - h * 0.06);
  ctx.lineTo(w, horizon + 2);
  ctx.closePath();
  ctx.fill();
  const base = horizon - h * 0.12;
  ctx.fillRect(w * 0.64, base - h * 0.1, w * 0.18, h * 0.12);
  tower(ctx, w * 0.645, base - h * 0.19, base + h * 0.02, w * 0.035, h * 0.07);
  tower(ctx, w * 0.73, base - h * 0.27, base, w * 0.045, h * 0.1);
  tower(ctx, w * 0.815, base - h * 0.17, base + h * 0.02, w * 0.03, h * 0.06);
  /* 城牆的齒狀 */
  for (let x = w * 0.66; x < w * 0.8; x += w * 0.018) {
    ctx.fillRect(x, base - h * 0.115, w * 0.01, h * 0.02);
  }
  /* 亮著的窗 */
  ctx.fillStyle = '#ffd27a';
  const win = (x: number, y: number) => ctx.fillRect(x, y, w * 0.006, h * 0.016);
  win(w * 0.643, base - h * 0.15);
  win(w * 0.728, base - h * 0.23);
  win(w * 0.728, base - h * 0.18);
  win(w * 0.812, base - h * 0.13);
  for (let i = 0; i < 6; i++) {
    if (rnd.next() < 0.7) win(w * (0.67 + i * 0.022), base - h * 0.06);
  }

  /* 湖面：天空的倒影＋月光的光帶 */
  const lake = ctx.createLinearGradient(0, horizon, 0, h);
  lake.addColorStop(0, '#2b2a5a');
  lake.addColorStop(0.5, '#141838');
  lake.addColorStop(1, '#090b1c');
  ctx.fillStyle = lake;
  ctx.fillRect(0, horizon, w, h - horizon);
  for (let i = 0; i < 70; i++) {
    const y = horizon + (h - horizon) * (i / 70) ** 1.4;
    const spread = (w * 0.03 + (y - horizon) * 0.25) * (0.5 + rnd.next());
    ctx.globalAlpha = 0.5 * (1 - i / 70) + 0.08;
    ctx.fillStyle = '#f6e7bd';
    ctx.fillRect(
      mx - spread / 2 + (rnd.next() - 0.5) * w * 0.02,
      y,
      spread,
      Math.max(1, h * 0.003),
    );
  }
  /* 古堡窗光的倒影 */
  ctx.fillStyle = '#ffd27a';
  for (let i = 0; i < 18; i++) {
    ctx.globalAlpha = 0.25 * (1 - i / 18);
    ctx.fillRect(w * (0.64 + rnd.next() * 0.18), horizon + h * 0.01 + i * h * 0.008, w * 0.02, 2);
  }
  ctx.globalAlpha = 1;

  /* 近景：左右兩側的樹林剪影 */
  ctx.fillStyle = '#05060f';
  const tree = (x: number, bottom: number, th: number, tw: number) => {
    ctx.beginPath();
    ctx.moveTo(x, bottom - th);
    ctx.lineTo(x - tw / 2, bottom);
    ctx.lineTo(x + tw / 2, bottom);
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 14; i++) {
    const x = w * (i / 13) * 0.3 - w * 0.02;
    tree(x, h * 1.0, h * (0.28 + rnd.next() * 0.22), w * 0.07);
  }
  for (let i = 0; i < 6; i++) {
    const x = w * (0.9 + i * 0.025);
    tree(x, h * 1.0, h * (0.2 + rnd.next() * 0.15), w * 0.06);
  }
  ctx.fillRect(0, h * 0.95, w, h * 0.05);

  /* 螢火蟲：樹林前的小光點 */
  for (let i = 0; i < 26; i++) {
    const x = w * (0.04 + rnd.next() * 0.3);
    const y = h * (0.74 + rnd.next() * 0.18);
    const r = Math.min(w, h) * (0.0015 + rnd.next() * 0.0015);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, 'rgba(230, 255, 170, 0.95)');
    g.addColorStop(0.3, 'rgba(210, 255, 140, 0.45)');
    g.addColorStop(1, 'rgba(210, 255, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  }
}

/** 範例背景畫成 2048 × 1536 的畫布 */
export function createSampleCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SAMPLE_SIZE.width;
  c.height = SAMPLE_SIZE.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  drawSampleScene(ctx, c.width, c.height);
  return c;
}

/* ---------- 效果卡片用的小風景 ---------- */

export type MiniScene = 'day' | 'dusk' | 'night';

const MINI_COLORS: Record<
  MiniScene,
  { sky: [string, string]; sun: string; far: string; near: string; ground: string }
> = {
  day: {
    sky: ['#4fa3e8', '#bfe3ff'],
    sun: '#fff3b0',
    far: '#7fb07a',
    near: '#4f8f4a',
    ground: '#3c6e3a',
  },
  dusk: {
    sky: ['#6d3d8f', '#ffab6b'],
    sun: '#ffe08a',
    far: '#7a4a6a',
    near: '#4b2e4f',
    ground: '#2e1d33',
  },
  night: {
    sky: ['#0b1030', '#34407e'],
    sun: '#f4f1d8',
    far: '#262a58',
    near: '#171a3c',
    ground: '#0c0e24',
  },
};

/** 小風景（任意尺寸）：天空、太陽或月亮、兩層山丘、一棟小屋 */
export function drawMiniScene(ctx: Ctx, w: number, h: number, kind: MiniScene): void {
  const c = MINI_COLORS[kind];
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, c.sky[0]);
  sky.addColorStop(1, c.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c.sun;
  ctx.beginPath();
  ctx.arc(w * (kind === 'night' ? 0.25 : 0.72), h * 0.28, h * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ridge(ctx, w, h * 0.66, h * 0.08, kind === 'day' ? 3 : kind === 'dusk' ? 5 : 7, c.far, h);
  ridge(ctx, w, h * 0.8, h * 0.06, 13, c.near, h);
  ctx.fillStyle = c.ground;
  ctx.fillRect(0, h * 0.9, w, h * 0.1);
  /* 小屋：屋身、屋頂、窗 */
  const hx = w * 0.42;
  const hy = h * 0.66;
  ctx.fillStyle = kind === 'day' ? '#f2e6d0' : '#2a2238';
  ctx.fillRect(hx, hy, w * 0.12, h * 0.14);
  ctx.fillStyle = kind === 'day' ? '#c0503c' : '#1a1428';
  ctx.beginPath();
  ctx.moveTo(hx - w * 0.015, hy);
  ctx.lineTo(hx + w * 0.06, hy - h * 0.09);
  ctx.lineTo(hx + w * 0.135, hy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = kind === 'day' ? '#6b8fb5' : '#ffd27a';
  ctx.fillRect(hx + w * 0.045, hy + h * 0.04, w * 0.03, h * 0.05);
}

const miniCache = new Map<MiniScene, HTMLCanvasElement>();

/** 小風景畫布（320 × 180，第一次用到時才畫） */
export function miniScene(kind: MiniScene): HTMLCanvasElement {
  let c = miniCache.get(kind);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const ctx = c.getContext('2d');
    if (ctx) drawMiniScene(ctx, c.width, c.height, kind);
    miniCache.set(kind, c);
  }
  return c;
}
