/**
 * 範例風景（F50）：只畫在預覽與差分縮圖後面，不會進匯出。依目前差分換成對應的時段或天氣
 * （晨、晝、昏、夜、陰天、雪景；沒開差分或對應不到時用白天）。
 */
import { createRandom } from '@/core/timeline';

const TAU = Math.PI * 2;

export type SceneryId = 'morning' | 'day' | 'evening' | 'night' | 'overcast' | 'snowy';

interface Look {
  sky: [string, number][];
  far: string;
  near: string;
  house: string;
  lit?: string;
  sun?: [string, number, number];
  moon?: boolean;
}

const LOOKS: Record<SceneryId, Look> = {
  morning: {
    sky: [
      ['#9fcbe8', 0],
      ['#f6d7b8', 0.6],
      ['#f4b98f', 1],
    ],
    far: '#9fb2c1',
    near: '#7f9a78',
    house: '#5b5048',
    sun: ['#fff1c9', 0.2, 0.42],
  },
  day: {
    sky: [
      ['#4ea4e0', 0],
      ['#a8d6f3', 0.6],
      ['#e3f3fb', 1],
    ],
    far: '#80a7c4',
    near: '#6d9a5e',
    house: '#4f4a45',
    sun: ['#fffbe8', 0.66, 0.24],
  },
  evening: {
    sky: [
      ['#3d3368', 0],
      ['#b75a6e', 0.5],
      ['#f39a55', 1],
    ],
    far: '#6a4a6e',
    near: '#3f3240',
    house: '#2a2229',
    lit: '#ffc86b',
    sun: ['#ffc07a', 0.8, 0.5],
  },
  night: {
    sky: [
      ['#05081a', 0],
      ['#15204a', 0.6],
      ['#2b3668', 1],
    ],
    far: '#1e2748',
    near: '#10162a',
    house: '#0b0f1d',
    lit: '#ffd27a',
    moon: true,
  },
  overcast: {
    sky: [
      ['#7f8a96', 0],
      ['#aab3bc', 0.6],
      ['#c4cad0', 1],
    ],
    far: '#6f7a84',
    near: '#5c6e57',
    house: '#403d3b',
    lit: '#f1d9a6',
  },
  snowy: {
    sky: [
      ['#aebfce', 0],
      ['#d7e0e8', 0.7],
      ['#e9eef2', 1],
    ],
    far: '#c3ced8',
    near: '#f2f5f8',
    house: '#56504c',
    lit: '#ffd9a0',
  },
};

/** 差分 id → 範例風景 */
const SCENE_OF: Record<string, SceneryId> = {
  morning: 'morning',
  day: 'day',
  evening: 'evening',
  night: 'night',
  sunny: 'day',
  cloudy: 'overcast',
  rain: 'overcast',
  fog: 'overcast',
  storm: 'overcast',
  snow: 'snowy',
  winter: 'snowy',
  autumn: 'evening',
  madness: 'night',
};

export function sceneryFor(variantsEnabled: boolean, id: string | null | undefined): SceneryId {
  return variantsEnabled && id ? (SCENE_OF[id] ?? 'day') : 'day';
}

export function drawScenery(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  key: SceneryId,
): void {
  const L = LOOKS[key] ?? LOOKS.day;
  const u = h / 900;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  const sky = c.createLinearGradient(0, 0, 0, h);
  for (const [color, stop] of L.sky) sky.addColorStop(stop, color);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  if (L.moon) {
    const rand = createRandom(7);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 140; i++) {
      c.globalAlpha = 0.25 + rand.next() * 0.75;
      c.beginPath();
      c.arc(rand.next() * w, rand.next() * h * 0.6, (0.5 + rand.next() * 1.5) * u, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    c.save();
    c.shadowColor = 'rgba(255,240,200,.8)';
    c.shadowBlur = 40 * u;
    c.fillStyle = '#fdf3d0';
    c.beginPath();
    c.arc(w * 0.74, h * 0.24, h * 0.055, 0, TAU);
    c.fill();
    c.restore();
  }
  if (L.sun) {
    const [color, sx, sy] = L.sun;
    c.save();
    c.shadowColor = color;
    c.shadowBlur = 70 * u;
    c.fillStyle = color;
    c.beginPath();
    c.arc(sx * w, sy * h, h * 0.065, 0, TAU);
    c.fill();
    c.restore();
  }
  /* 遠山 */
  c.fillStyle = L.far;
  c.beginPath();
  c.moveTo(0, h * 0.6);
  for (const [px, py] of [
    [0.12, 0.48],
    [0.25, 0.58],
    [0.4, 0.45],
    [0.55, 0.56],
    [0.7, 0.47],
    [0.85, 0.57],
    [1, 0.5],
  ]) {
    c.lineTo(px * w, py * h);
  }
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
  /* 近處的丘陵 */
  c.fillStyle = L.near;
  c.beginPath();
  c.moveTo(0, h * 0.76);
  c.bezierCurveTo(w * 0.3, h * 0.66, w * 0.6, h * 0.8, w, h * 0.7);
  c.lineTo(w, h);
  c.lineTo(0, h);
  c.fill();
  /* 小屋 */
  const hx = w * 0.26;
  const base = h * 0.75;
  const hw = w * 0.1;
  const hh = h * 0.11;
  c.fillStyle = L.house;
  c.fillRect(hx, base - hh, hw, hh + h * 0.04);
  c.beginPath();
  c.moveTo(hx - hw * 0.12, base - hh);
  c.lineTo(hx + hw / 2, base - hh - hh * 0.75);
  c.lineTo(hx + hw * 1.12, base - hh);
  c.closePath();
  c.fill();
  c.fillRect(hx + hw * 0.7, base - hh - hh * 0.75, hw * 0.12, hh * 0.5);
  if (L.lit) {
    c.save();
    c.fillStyle = L.lit;
    c.shadowColor = L.lit;
    c.shadowBlur = 18 * u;
    for (const [wx, wy] of [
      [0.16, 0.3],
      [0.62, 0.3],
      [0.16, 0.62],
      [0.62, 0.62],
    ]) {
      c.fillRect(hx + hw * wx, base - hh + hh * wy, hw * 0.2, hh * 0.2);
    }
    c.restore();
  }
  c.restore();
}
