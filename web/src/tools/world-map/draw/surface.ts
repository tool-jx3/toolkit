/**
 * 地表與海的花紋（本站自己的畫法，依地圖的種子排列）：一塊 384 × 384 px 的圖磚重複鋪滿。
 * - 平原：細小的土點、草叢、淡淡的斑塊。
 * - 沙漠：沙粒、新月形的沙丘（亮的稜線＋背光面）。
 * - 雪原：淡藍的點、被風吹成一道一道的雪堆。
 * - 濕地：小水窪（亮邊）、每三個一叢蘆葦。
 * - 海：成對的小波紋。
 * 圖磚依輸出的倍率另外畫（PNG 的花紋和畫面上一樣細）。
 */
import { hash3 } from '../model/relief';

export const TILE = 384;
const WAVE_W = 92;
const WAVE_H = 66;

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const rnd = (seed: number, i: number, salt: number) => hash3(i, salt, seed);

function dots(ctx: Ctx, seed: number, color: string, alpha: number) {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 200; i++) {
    const x = rnd(seed, i, 11) * TILE;
    const y = rnd(seed, i, 12) * TILE;
    const r = 0.3 + rnd(seed, i, 13) * 0.6;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 在圖磚四邊重複畫，接縫處不會切斷 */
function wrapped(draw: (dx: number, dy: number) => void) {
  for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) draw(dx, dy);
}

function plain(ctx: Ctx, seed: number) {
  dots(ctx, seed, '#6b5a37', 0.07);
  for (let i = 0; i < 14; i++) {
    const x = rnd(seed, i, 21) * TILE;
    const y = rnd(seed, i, 22) * TILE;
    wrapped((dx, dy) => {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = i % 2 ? '#7d8d55' : '#b5a46e';
      ctx.beginPath();
      ctx.ellipse(
        x + dx,
        y + dy,
        18 + rnd(seed, i, 23) * 14,
        9 + rnd(seed, i, 24) * 6,
        0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });
  }
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#6f7d48';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 34; i++) {
    const x = 12 + rnd(seed, i, 31) * (TILE - 24);
    const y = 12 + rnd(seed, i, 32) * (TILE - 24);
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2.5, y - 4);
    ctx.moveTo(x + 1, y);
    ctx.lineTo(x + 1, y - 5.5);
    ctx.moveTo(x + 2, y);
    ctx.lineTo(x + 4.5, y - 3.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function desert(ctx: Ctx, seed: number) {
  dots(ctx, seed, '#7d6436', 0.12);
  for (let i = 0; i < 16; i++) {
    const x = 20 + rnd(seed, i, 41) * (TILE - 80);
    const y = 20 + rnd(seed, i, 42) * (TILE - 40);
    const w = 40 + rnd(seed, i, 43) * 22;
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = '#ad8f5c';
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.quadraticCurveTo(x + w * 0.45, y - 16, x + w, y + 6);
    ctx.quadraticCurveTo(x + w * 0.5, y - 2, x, y + 8);
    ctx.fill();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#fff4d4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.quadraticCurveTo(x + w * 0.45, y - 16, x + w, y + 5);
    ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#9f8a5f';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + 15);
    ctx.quadraticCurveTo(x + w * 0.55, y + 5, x + w * 0.9, y + 13);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function snow(ctx: Ctx, seed: number) {
  dots(ctx, seed, '#768a8c', 0.07);
  for (let i = 0; i < 12; i++) {
    const x = 10 + rnd(seed, i, 51) * (TILE - 110);
    const y = 20 + rnd(seed, i, 52) * (TILE - 40);
    const w = 70 + rnd(seed, i, 53) * 30;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#7f9493';
    ctx.beginPath();
    ctx.moveTo(x, y + 12);
    ctx.quadraticCurveTo(x + w * 0.4, y - 12, x + w, y + 4);
    ctx.quadraticCurveTo(x + w * 0.45, y + 2, x, y + 12);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 10);
    ctx.quadraticCurveTo(x + w * 0.42, y - 10, x + w - 6, y + 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function marsh(ctx: Ctx, seed: number) {
  dots(ctx, seed, '#47402c', 0.08);
  for (let i = 0; i < 34; i++) {
    const x = 20 + rnd(seed, i, 61) * (TILE - 40);
    const y = 20 + rnd(seed, i, 62) * (TILE - 40);
    const w = 7 + rnd(seed, i, 63) * 7;
    ctx.globalAlpha = i % 3 ? 0.16 : 0.26;
    ctx.fillStyle = i % 3 ? '#43453a' : '#566d5c';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.45, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#d9cfa4';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(x - 1, y - 1, w * 0.8, w * 0.3, -0.15, Math.PI * 1.05, Math.PI * 1.85);
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#4b5a30';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x + w, y - 1);
      ctx.lineTo(x + w - 1.5, y - 10);
      ctx.moveTo(x + w + 2, y - 1);
      ctx.lineTo(x + w + 4, y - 11);
      ctx.moveTo(x + w + 4, y);
      ctx.lineTo(x + w + 8, y - 7);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

const PAINTERS = { 1: plain, 4: desert, 5: snow, 6: marsh } as const;

const tiles = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = tiles.get(key);
  if (!c) {
    if (tiles.size > 48) tiles.delete(tiles.keys().next().value!);
    c = make();
    tiles.set(key, c);
  }
  return c;
}

/** 地表的圖磚（scale：1 px 地圖＝幾 px 圖磚） */
export function surfaceTile(type: 1 | 4 | 5 | 6, seed: number, scale: number): HTMLCanvasElement {
  const s = Math.max(0.25, Math.min(4, scale));
  return cached(`s${type}:${seed}:${s}`, () => {
    const c = canvas(TILE * s, TILE * s);
    const ctx = c.getContext('2d')!;
    ctx.scale(c.width / TILE, c.height / TILE);
    PAINTERS[type](ctx, seed);
    return c;
  });
}

export function waveTile(
  color: string,
  scale: number,
): { tile: HTMLCanvasElement; w: number; h: number } {
  const s = Math.max(0.25, Math.min(4, scale));
  const tile = cached(`w${color}:${s}`, () => {
    const c = canvas(WAVE_W * s, WAVE_H * s);
    const ctx = c.getContext('2d')!;
    ctx.scale(c.width / WAVE_W, c.height / WAVE_H);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const wave = (x: number, y: number) => {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 5, y - 4, x + 10, y);
      ctx.quadraticCurveTo(x + 15, y - 4, x + 20, y);
    };
    wave(10, 20);
    wave(52, 50);
    ctx.stroke();
    return c;
  });
  return { tile, w: WAVE_W, h: WAVE_H };
}

/** 圖磚做成填色用的花紋（花紋的 1 格＝地圖的 1 px） */
export function tilePattern(
  ctx: Ctx,
  tile: HTMLCanvasElement,
  tileWidthInMap: number,
): CanvasPattern | null {
  const p = ctx.createPattern(tile, 'repeat');
  if (!p) return null;
  const k = tileWidthInMap / tile.width;
  p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  return p;
}
