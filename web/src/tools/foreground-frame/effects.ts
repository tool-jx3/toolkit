/**
 * 窗內效果（F63、規格 3.8）：只畫在窗裡、依窗的形狀裁切。匯出的 PNG 窗是透明的，所以效果就是疊在房間背景上的半透明圖樣。
 * 亂數由「效果＋差分 id」決定：同一個差分、同一種效果每次畫出相同的圖樣，不同差分的圖樣不同。
 * 圖樣與數值依原作（MIT）改寫。
 */
import { createRandom, seedOf } from '@/core/timeline';
import type { WindowRect } from './geometry';
import type { EffectId } from './model';
import type { G } from './render';

const TAU = Math.PI * 2;

type Rand = () => number;
type Ctx = CanvasRenderingContext2D;
type DrawFx = (c: Ctx, r: WindowRect, amt: number, rand: Rand, g: G) => void;

/** 粒子數：窗面積 ÷ per ×（0.25＋1.75 × 強度） */
export const particleCount = (r: { w: number; h: number }, per: number, amt: number): number =>
  Math.round(((r.w * r.h) / per) * (0.25 + amt * 1.75));

/** 效果的亂數種子 */
export const effectSeed = (effect: string, variantId: string): number =>
  seedOf(`${effect}:${variantId}`);

/** 窗的四周往中心漸淡（中心透明） */
function radialFade(c: Ctx, r: WindowRect, color: string, alpha: number, inner: number): void {
  const cx = r.x0 + r.w / 2;
  const cy = r.y0 + r.h / 2;
  const grad = c.createRadialGradient(
    cx,
    cy,
    Math.min(r.w, r.h) * inner,
    cx,
    cy,
    Math.hypot(r.w, r.h) * 0.55,
  );
  grad.addColorStop(0, `rgba(${color},0)`);
  grad.addColorStop(1, `rgba(${color},${alpha})`);
  c.fillStyle = grad;
  c.fillRect(r.x0, r.y0, r.w, r.h);
}

/** 星光要看起來像光：暗的強調色往白色提亮（亮度不足 0.8 的部分） */
export function lightTint(hex: string): string {
  const n = Number.parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0;
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const t = Math.max(0, 0.8 - (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255);
  return `rgb(${rgb.map((v) => Math.round(v + (255 - v) * t)).join(',')})`;
}

function sparkle(c: Ctx, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y);
  c.quadraticCurveTo(x, y, x, y + s);
  c.quadraticCurveTo(x, y, x - s, y);
  c.quadraticCurveTo(x, y, x, y - s);
  c.fill();
}

const rain: DrawFx = (c, r, amt, rand) => {
  c.lineCap = 'round';
  for (let i = 0, n = particleCount(r, 9000, amt); i < n; i++) {
    const x = r.x0 - 60 + rand() * (r.w + 120);
    const y = r.y0 - 40 + rand() * r.h;
    const len = 28 + rand() * 54;
    c.strokeStyle = `rgba(210,226,248,${0.15 + rand() * 0.35})`;
    c.lineWidth = 1 + rand() * 1.8;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - len * 0.22, y + len);
    c.stroke();
  }
};

const storm: DrawFx = (c, r, amt, rand, g) => {
  const top = c.createLinearGradient(0, r.y0, 0, r.y0 + r.h * 0.6);
  top.addColorStop(0, `rgba(10,14,24,${0.35 * amt})`);
  top.addColorStop(1, 'rgba(10,14,24,0)');
  c.fillStyle = top;
  c.fillRect(r.x0, r.y0, r.w, r.h);
  rain(c, r, Math.min(1, amt + 0.3), rand, g);
  let x = r.x0 + r.w * (0.55 + rand() * 0.3);
  let y = r.y0;
  const pts: [number, number][] = [[x, y]];
  while (y < r.y0 + r.h * 0.62) {
    x += (rand() - 0.5) * 100;
    y += 36 + rand() * 54;
    pts.push([x, y]);
  }
  const glow = c.createRadialGradient(pts[0][0], r.y0, 0, pts[0][0], r.y0, r.w * 0.6);
  glow.addColorStop(0, `rgba(215,228,255,${0.3 * amt})`);
  glow.addColorStop(1, 'rgba(215,228,255,0)');
  c.fillStyle = glow;
  c.fillRect(r.x0, r.y0, r.w, r.h);
  c.save();
  c.shadowColor = 'rgba(190,210,255,.95)';
  c.shadowBlur = 28 * g.k;
  c.strokeStyle = `rgba(248,250,255,${0.55 + amt * 0.45})`;
  c.lineWidth = 4;
  c.lineJoin = 'round';
  c.beginPath();
  pts.forEach(([px, py], i) => {
    if (i) c.lineTo(px, py);
    else c.moveTo(px, py);
  });
  c.stroke();
  c.restore();
};

const snow: DrawFx = (c, r, amt, rand, g) => {
  c.save();
  c.shadowColor = 'rgba(255,255,255,.8)';
  c.shadowBlur = 6 * g.k;
  for (let i = 0, n = particleCount(r, 11000, amt); i < n; i++) {
    c.fillStyle = `rgba(255,255,255,${0.45 + rand() * 0.5})`;
    c.beginPath();
    c.arc(r.x0 + rand() * r.w, r.y0 + rand() * r.h, 1.5 + rand() ** 3 * 8, 0, TAU);
    c.fill();
  }
  c.restore();
};

const fog: DrawFx = (c, r, amt, rand) => {
  for (let i = 0, n = 7 + Math.round(amt * 10); i < n; i++) {
    const cx = r.x0 + rand() * r.w;
    const cy = r.y0 + r.h * (0.35 + rand() * 0.65);
    const rad = r.w * (0.14 + rand() * 0.3);
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, `rgba(236,239,243,${0.06 + 0.24 * amt})`);
    grad.addColorStop(1, 'rgba(236,239,243,0)');
    c.fillStyle = grad;
    c.fillRect(r.x0, r.y0, r.w, r.h);
  }
  const low = c.createLinearGradient(0, r.y0 + r.h * 0.45, 0, r.y0 + r.h);
  low.addColorStop(0, 'rgba(236,239,243,0)');
  low.addColorStop(1, `rgba(236,239,243,${0.4 * amt})`);
  c.fillStyle = low;
  c.fillRect(r.x0, r.y0, r.w, r.h);
};

const petals: DrawFx = (c, r, amt, rand) => {
  for (let i = 0, n = particleCount(r, 32000, amt); i < n; i++) {
    const s = 0.7 + rand() * 0.9;
    c.save();
    c.translate(r.x0 + rand() * r.w, r.y0 + rand() * r.h);
    c.rotate(rand() * TAU);
    c.scale(s, s * (0.5 + rand() * 0.5));
    c.fillStyle = `rgba(${248 - rand() * 12},${190 + rand() * 25},${208 + rand() * 20},${0.75 + rand() * 0.25})`;
    c.beginPath();
    c.moveTo(-11, 0);
    c.quadraticCurveTo(-2, -8, 11, -3);
    c.lineTo(8, 0);
    c.lineTo(11, 3);
    c.quadraticCurveTo(-2, 8, -11, 0);
    c.fill();
    c.restore();
  }
};

const LEAF_COLORS = ['#d9822b', '#c4502a', '#e0b040', '#9b5a2a', '#b8742e'];

const leaves: DrawFx = (c, r, amt, rand) => {
  for (let i = 0, n = particleCount(r, 40000, amt); i < n; i++) {
    const s = 0.8 + rand() * 1.1;
    c.save();
    c.translate(r.x0 + rand() * r.w, r.y0 + rand() * r.h);
    c.rotate(rand() * TAU);
    c.scale(s, s);
    c.fillStyle = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)];
    c.globalAlpha = 0.8 + rand() * 0.2;
    c.beginPath();
    c.moveTo(-13, 0);
    c.quadraticCurveTo(0, -10, 13, 0);
    c.quadraticCurveTo(0, 10, -13, 0);
    c.fill();
    c.strokeStyle = 'rgba(80,40,10,.45)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-13, 0);
    c.lineTo(16, 0);
    c.stroke();
    c.restore();
  }
};

const sparkleFx: DrawFx = (c, r, amt, rand, g) => {
  c.save();
  const tint = lightTint(g.slot.accent);
  c.shadowColor = tint;
  c.shadowBlur = 10 * g.k;
  for (let i = 0, n = particleCount(r, 60000, amt); i < n; i++) {
    c.globalAlpha = 0.4 + rand() * 0.6;
    c.fillStyle = rand() < 0.5 ? '#ffffff' : tint;
    sparkle(c, r.x0 + rand() * r.w, r.y0 + rand() * r.h, 4 + rand() ** 2 * 14);
  }
  c.restore();
};

const dust: DrawFx = (c, r, amt, rand) => {
  for (let i = 0, n = particleCount(r, 14000, amt); i < n; i++) {
    c.fillStyle = `rgba(232,224,206,${0.12 + rand() * 0.4})`;
    c.beginPath();
    c.arc(r.x0 + rand() * r.w, r.y0 + rand() * r.h, 0.8 + rand() ** 2 * 3, 0, TAU);
    c.fill();
  }
};

const vignette: DrawFx = (c, r, amt) => radialFade(c, r, '0,0,0', 0.85 * amt, 0.3);

const scanlines: DrawFx = (c, r, amt) => {
  c.fillStyle = `rgba(0,0,0,${0.1 + 0.28 * amt})`;
  for (let y = r.y0; y < r.y0 + r.h; y += 6) c.fillRect(r.x0, y, r.w, 2);
};

const alert: DrawFx = (c, r, amt) => {
  radialFade(c, r, '190,16,16', 0.6 * amt, 0.28);
  c.strokeStyle = `rgba(230,40,40,${0.55 * amt})`;
  c.lineWidth = 6;
  c.strokeRect(r.x0 + 12, r.y0 + 12, r.w - 24, r.h - 24);
  c.fillStyle = `rgba(230,40,40,${0.08 * amt})`;
  for (let y = r.y0; y < r.y0 + r.h; y += 18) c.fillRect(r.x0, y, r.w, 8);
};

const GLITCH_TONES = ['255,0,90', '0,240,220', '255,255,255', '140,0,255'];

const glitch: DrawFx = (c, r, amt, rand, g) => {
  for (let i = 0, n = 6 + Math.round(amt * 22); i < n; i++) {
    c.fillStyle = `rgba(${GLITCH_TONES[Math.floor(rand() * GLITCH_TONES.length)]},${0.08 + rand() * 0.22})`;
    const h = 2 + rand() ** 2 * 34;
    const w = r.w * (0.2 + rand() * 0.8);
    c.fillRect(r.x0 + rand() * (r.w - w), r.y0 + rand() * r.h, w, h);
  }
  scanlines(c, r, amt * 0.6, rand, g);
  radialFade(c, r, '40,0,20', 0.5 * amt, 0.35);
};

const sepia: DrawFx = (c, r, amt) => {
  c.fillStyle = `rgba(118,82,40,${0.14 + 0.3 * amt})`;
  c.fillRect(r.x0, r.y0, r.w, r.h);
  radialFade(c, r, '54,32,12', 0.6 * amt, 0.32);
};

const EFFECTS: Record<Exclude<EffectId, 'none'>, DrawFx> = {
  rain,
  storm,
  snow,
  fog,
  petals,
  leaves,
  sparkle: sparkleFx,
  dust,
  vignette,
  alert,
  glitch,
  scanlines,
  sepia,
};

export function drawEffect(g: G): void {
  const s = g.slot;
  if (s.effect === 'none' || !(s.effectAmount > 0)) return;
  const fx = EFFECTS[s.effect];
  if (!fx) return;
  const c = g.ctx;
  c.save();
  c.beginPath();
  g.traceWindow(c);
  c.clip();
  fx(c, g.rect, Math.min(1, s.effectAmount), createRandom(effectSeed(s.effect, s.id)).next, g);
  c.restore();
}
