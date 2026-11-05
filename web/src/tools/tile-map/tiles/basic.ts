/**
 * 本站的簡易圖塊組：程式畫的地形（地板、牆、水、草…），沒有像素風、顏色和一般 VTT 地圖接近。
 * 開頁時畫成一張 64 px × 16 格的圖（同樣的程式每次畫出一樣的圖）。
 */
import type { TileDef } from '../model/types';

export const BASIC_SET = 'basic';
export const BASIC_SRC = 'builtin:basic';
const PX = 64;

type Painter = (ctx: CanvasRenderingContext2D, rnd: () => number) => void;

/** 固定種子的亂數（同一張圖塊每次畫出一樣的） */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fill = (ctx: CanvasRenderingContext2D, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, PX, PX);
};

/** 點點（地面的顆粒） */
function speckle(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  colors: string[],
  n: number,
  size = 2,
) {
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = colors[k % colors.length];
    ctx.fillRect(Math.floor(rnd() * PX), Math.floor(rnd() * PX), size, size);
  }
}

/** 磚（每列錯開半塊） */
function bricks(
  ctx: CanvasRenderingContext2D,
  rnd: () => number,
  base: string,
  tones: string[],
  mortar: string,
  bw: number,
  bh: number,
) {
  fill(ctx, mortar);
  for (let row = 0; row * bh < PX; row++) {
    const off = row % 2 ? -bw / 2 : 0;
    for (let x = off; x < PX; x += bw) {
      ctx.fillStyle = tones[Math.floor(rnd() * tones.length)] ?? base;
      ctx.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
    }
  }
}

function waves(ctx: CanvasRenderingContext2D, color: string, rows: number[]) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const y of rows) {
    ctx.beginPath();
    for (let x = -4; x <= PX + 4; x += 4) {
      const yy = y + Math.sin((x / PX) * Math.PI * 2) * 3;
      if (x === -4) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

const PAINTERS: readonly { key: string; cat: string; paint: Painter }[] = [
  {
    key: 'flagstone',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#6d6a66');
      const tones = ['#7b7873', '#75716c', '#827e78', '#6f6b66'];
      const half = PX / 2;
      for (const [x, y] of [
        [0, 0],
        [half, 0],
        [0, half],
        [half, half],
      ]) {
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.fillRect(x + 1, y + 1, half - 2, half - 2);
      }
      speckle(ctx, rnd, ['#5f5c58', '#8a867f'], 40);
    },
  },
  {
    key: 'cobble',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#55524e');
      for (let k = 0; k < 18; k++) {
        ctx.fillStyle = ['#7a766f', '#8a857d', '#6c6862'][k % 3];
        ctx.beginPath();
        ctx.ellipse(
          rnd() * PX,
          rnd() * PX,
          6 + rnd() * 5,
          5 + rnd() * 4,
          rnd() * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    },
  },
  {
    key: 'wood',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#5a3d24');
      const tones = ['#8a5f3a', '#7e5532', '#936842', '#845a36'];
      for (let row = 0; row < 4; row++) {
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.fillRect(0, row * 16 + 1, PX, 14);
        ctx.fillStyle = '#5a3d24';
        ctx.fillRect(Math.floor(rnd() * PX), row * 16, 2, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let k = 0; k < 3; k++)
          ctx.fillRect(Math.floor(rnd() * PX), row * 16 + 4 + k * 3, 14, 1);
      }
    },
  },
  {
    key: 'dirt',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#7a5a3c');
      speckle(ctx, rnd, ['#6a4c31', '#8c6a48', '#5e4329', '#977453'], 140, 2);
      speckle(ctx, rnd, ['#594029'], 6, 4);
    },
  },
  {
    key: 'grass',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#4f7a37');
      speckle(ctx, rnd, ['#5c8a40', '#44692f', '#67953f'], 120, 2);
      ctx.strokeStyle = '#6fa548';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 14; k++) {
        const x = rnd() * PX;
        const y = rnd() * PX;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y - 5);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2, y - 5);
        ctx.stroke();
      }
    },
  },
  {
    key: 'sand',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#d8bf86');
      speckle(ctx, rnd, ['#cbb077', '#e3cc97', '#c2a56b'], 120, 2);
    },
  },
  {
    key: 'water',
    cat: 'floor',
    paint: (ctx) => {
      fill(ctx, '#3f78a8');
      waves(ctx, '#5f97c4', [12, 34, 56]);
    },
  },
  {
    key: 'deep',
    cat: 'floor',
    paint: (ctx) => {
      fill(ctx, '#20456b');
      waves(ctx, '#2f5d88', [16, 44]);
    },
  },
  {
    key: 'lava',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#b33a12');
      for (let k = 0; k < 9; k++) {
        ctx.fillStyle = k % 2 ? '#f08a24' : '#e45a17';
        ctx.beginPath();
        ctx.ellipse(
          rnd() * PX,
          rnd() * PX,
          6 + rnd() * 8,
          3 + rnd() * 4,
          rnd() * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      speckle(ctx, rnd, ['#ffd257'], 14, 2);
    },
  },
  {
    key: 'ice',
    cat: 'floor',
    paint: (ctx, rnd) => {
      fill(ctx, '#bfe0ee');
      ctx.strokeStyle = '#e9f6fb';
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        const x = rnd() * PX;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 18, PX);
        ctx.stroke();
      }
    },
  },
  {
    key: 'stonewall',
    cat: 'wall',
    paint: (ctx, rnd) =>
      bricks(ctx, rnd, '#5b5b60', ['#5b5b60', '#66666b', '#525257', '#606065'], '#2e2e33', 32, 16),
  },
  {
    key: 'brick',
    cat: 'wall',
    paint: (ctx, rnd) =>
      bricks(ctx, rnd, '#8e3f2c', ['#8e3f2c', '#9c4a34', '#813826', '#a0513a'], '#4a2a20', 16, 8),
  },
  {
    key: 'woodwall',
    cat: 'wall',
    paint: (ctx, rnd) => {
      fill(ctx, '#3d2817');
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = ['#6b4527', '#5f3c22', '#74502e'][Math.floor(rnd() * 3)];
        ctx.fillRect(col * 16 + 1, 0, 14, PX);
      }
    },
  },
  {
    key: 'rock',
    cat: 'wall',
    paint: (ctx, rnd) => {
      fill(ctx, '#3f3a35');
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = ['#57504a', '#4b4540', '#625a52'][k % 3];
        ctx.beginPath();
        ctx.ellipse(
          rnd() * PX,
          rnd() * PX,
          10 + rnd() * 10,
          8 + rnd() * 8,
          rnd() * Math.PI,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    },
  },
  {
    key: 'void',
    cat: 'wall',
    paint: (ctx) => fill(ctx, '#141417'),
  },
  {
    key: 'pit',
    cat: 'prop',
    paint: (ctx) => {
      const g = ctx.createRadialGradient(PX / 2, PX / 2, 4, PX / 2, PX / 2, PX / 2);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.7, 'rgba(0,0,0,0.85)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, PX, PX);
    },
  },
];

/** 圖塊的定義（名稱由 strings 給） */
export function basicDefs(names: Record<string, string>): TileDef[] {
  return PAINTERS.map((p, i) => ({
    id: `kb:${p.key}`,
    name: names[p.key] ?? p.key,
    src: BASIC_SRC,
    rect: [i * PX, 0, PX, PX] as const,
    pixel: false,
    cat: p.cat,
    set: BASIC_SET,
  }));
}

export const BASIC_KEYS: readonly string[] = PAINTERS.map((p) => p.key);

/** 畫成一張圖（瀏覽器裡呼叫） */
export function paintBasicAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = PX * PAINTERS.length;
  c.height = PX;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  PAINTERS.forEach((p, i) => {
    ctx.save();
    ctx.translate(i * PX, 0);
    ctx.beginPath();
    ctx.rect(0, 0, PX, PX);
    ctx.clip();
    p.paint(ctx, seeded(1000 + i * 7919));
    ctx.restore();
  });
  return c;
}
