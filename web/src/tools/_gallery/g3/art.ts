/**
 * 「立繪工作台」分頁的示範圖：全部在瀏覽器裡用 canvas 現畫（本專案自己畫的簡單造型，不是任何作品的素材）。
 * - makeFigure：透明背景的 Q 版站姿人形（上下左右留白，給去透明邊、裁切框、身高板）；
 * - makeFaceParts：與底圖同尺寸的臉部部件（底圖兩層、眼、嘴、裝飾），給 PartPicker／core/compose。
 */
import { makeCanvas } from '@/core/image';

type Ctx = CanvasRenderingContext2D;
export type Art = HTMLCanvasElement;

function canvas(w: number, h: number): { c: Art; ctx: Ctx } {
  const c = makeCanvas(w, h) as Art;
  const ctx = c.getContext('2d') as Ctx;
  return { c, ctx };
}

export interface FigureColors {
  hair: string;
  skin: string;
  cloth: string;
  accent: string;
}

/** 站姿人形：寬 w、高 h 的透明畫布，人形約占中間 70% 寬、上下各留白 */
export function makeFigure(w: number, h: number, col: FigureColors, { hat = false } = {}): Art {
  const { c, ctx } = canvas(w, h);
  const cx = w / 2;
  const top = h * 0.06;
  const bodyH = h * 0.88;
  const head = bodyH * 0.17;
  /* 腳 */
  ctx.fillStyle = '#3a3340';
  ctx.fillRect(cx - head * 0.55, top + bodyH * 0.8, head * 0.42, bodyH * 0.2);
  ctx.fillRect(cx + head * 0.13, top + bodyH * 0.8, head * 0.42, bodyH * 0.2);
  /* 身體（梯形裙襬） */
  ctx.fillStyle = col.cloth;
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.6, top + head * 1.9);
  ctx.lineTo(cx + head * 0.6, top + head * 1.9);
  ctx.lineTo(cx + head * 1.15, top + bodyH * 0.82);
  ctx.lineTo(cx - head * 1.15, top + bodyH * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col.accent;
  ctx.fillRect(cx - head * 0.9, top + bodyH * 0.55, head * 1.8, head * 0.18);
  /* 手臂 */
  ctx.strokeStyle = col.skin;
  ctx.lineCap = 'round';
  ctx.lineWidth = head * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx - head * 0.65, top + head * 2.1);
  ctx.lineTo(cx - head * 1.0, top + head * 3.6);
  ctx.moveTo(cx + head * 0.65, top + head * 2.1);
  ctx.lineTo(cx + head * 1.0, top + head * 3.6);
  ctx.stroke();
  /* 頭 */
  ctx.fillStyle = col.hair;
  ctx.beginPath();
  ctx.arc(cx, top + head * 0.95, head * 1.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col.skin;
  ctx.beginPath();
  ctx.arc(cx, top + head * 1.08, head * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col.hair;
  ctx.beginPath();
  ctx.ellipse(cx, top + head * 0.55, head * 0.95, head * 0.45, 0, Math.PI, 0);
  ctx.fill();
  if (hat) {
    ctx.fillStyle = col.accent;
    ctx.beginPath();
    ctx.moveTo(cx - head * 0.7, top + head * 0.25);
    ctx.lineTo(cx + head * 0.7, top + head * 0.25);
    ctx.lineTo(cx, top - head * 0.25);
    ctx.closePath();
    ctx.fill();
  }
  /* 眼睛 */
  ctx.fillStyle = '#2a2230';
  ctx.beginPath();
  ctx.arc(cx - head * 0.3, top + head * 1.15, head * 0.09, 0, Math.PI * 2);
  ctx.arc(cx + head * 0.3, top + head * 1.15, head * 0.09, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export const FIGURE_COLORS: FigureColors[] = [
  { hair: '#5b3a29', skin: '#f3d3b5', cloth: '#3f6fb5', accent: '#f0c419' },
  { hair: '#d9d2c5', skin: '#f6dcc4', cloth: '#9c3d54', accent: '#2f2f3a' },
  { hair: '#2b2b38', skin: '#e9c29f', cloth: '#3e8a5c', accent: '#e8604c' },
];

const SIZE = 256;

function part(draw: (ctx: Ctx, s: number) => void): Art {
  const { c, ctx } = canvas(SIZE, SIZE);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  draw(ctx, SIZE);
  return c;
}

export interface FacePart {
  id: string;
  name: string;
  layer: Art;
}

export interface FaceParts {
  base: Art[];
  eyes: FacePart[];
  mouths: FacePart[];
  decorations: FacePart[];
}

/** 臉部部件（256 × 256 透明圖層，對準同一張臉） */
export function makeFaceParts(): FaceParts {
  const fill = part((ctx, s) => {
    ctx.fillStyle = '#f6dcc4';
    ctx.beginPath();
    ctx.ellipse(s / 2, s * 0.54, s * 0.36, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const line = part((ctx, s) => {
    ctx.strokeStyle = '#4a3a3a';
    ctx.lineWidth = s * 0.018;
    ctx.beginPath();
    ctx.ellipse(s / 2, s * 0.54, s * 0.36, s * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  const ink = '#2a2230';
  const eye = (
    id: string,
    name: string,
    f: (ctx: Ctx, x: number, y: number, s: number) => void,
  ) => ({
    id,
    name,
    layer: part((ctx, s) => {
      ctx.fillStyle = ink;
      ctx.strokeStyle = ink;
      ctx.lineWidth = s * 0.02;
      f(ctx, s * 0.38, s * 0.52, s);
      f(ctx, s * 0.62, s * 0.52, s);
    }),
  });
  const eyes: FacePart[] = [
    eye('dot', '豆豆眼', (ctx, x, y, s) => {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }),
    eye('round', '圓眼', (ctx, x, y, s) => {
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.04, s * 0.055, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x + s * 0.012, y - s * 0.02, s * 0.012, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ink;
    }),
    eye('smile', '笑眼', (ctx, x, y, s) => {
      ctx.beginPath();
      ctx.arc(x, y + s * 0.02, s * 0.045, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }),
    eye('closed', '閉眼', (ctx, x, y, s) => {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.045, y);
      ctx.lineTo(x + s * 0.045, y);
      ctx.stroke();
    }),
  ];
  const mouth = (id: string, name: string, f: (ctx: Ctx, s: number) => void) => ({
    id,
    name,
    layer: part((ctx, s) => {
      ctx.fillStyle = '#b5484f';
      ctx.strokeStyle = '#4a2a2a';
      ctx.lineWidth = s * 0.016;
      f(ctx, s);
    }),
  });
  const mouths: FacePart[] = [
    mouth('smile', '微笑', (ctx, s) => {
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.64, s * 0.05, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }),
    mouth('open', '張口', (ctx, s) => {
      ctx.beginPath();
      ctx.ellipse(s / 2, s * 0.68, s * 0.04, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }),
    mouth('flat', '一字', (ctx, s) => {
      ctx.beginPath();
      ctx.moveTo(s * 0.46, s * 0.68);
      ctx.lineTo(s * 0.54, s * 0.68);
      ctx.stroke();
    }),
  ];
  const deco = (id: string, name: string, f: (ctx: Ctx, s: number) => void) => ({
    id,
    name,
    layer: part(f),
  });
  const decorations: FacePart[] = [
    deco('blush', '臉紅', (ctx, s) => {
      ctx.fillStyle = 'rgba(240, 110, 120, 0.45)';
      ctx.beginPath();
      ctx.ellipse(s * 0.3, s * 0.62, s * 0.05, s * 0.025, 0, 0, Math.PI * 2);
      ctx.ellipse(s * 0.7, s * 0.62, s * 0.05, s * 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }),
    deco('sweat', '汗滴', (ctx, s) => {
      ctx.fillStyle = '#7cc4f0';
      ctx.beginPath();
      ctx.moveTo(s * 0.8, s * 0.3);
      ctx.quadraticCurveTo(s * 0.86, s * 0.4, s * 0.8, s * 0.42);
      ctx.quadraticCurveTo(s * 0.74, s * 0.4, s * 0.8, s * 0.3);
      ctx.fill();
    }),
    deco('gloom', '陰沉', (ctx, s) => {
      ctx.fillStyle = 'rgba(60, 40, 90, 0.35)';
      ctx.beginPath();
      ctx.ellipse(s / 2, s * 0.54, s * 0.36, s * 0.34, 0, Math.PI, 0);
      ctx.fill();
    }),
    deco('anger', '怒筋', (ctx, s) => {
      ctx.strokeStyle = '#d23a3a';
      ctx.lineWidth = s * 0.02;
      const x = s * 0.72;
      const y = s * 0.3;
      const r = s * 0.035;
      ctx.beginPath();
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.moveTo(x + dx * r * 0.4, y + dy * r * 1.4);
        ctx.quadraticCurveTo(
          x + dx * r * 0.4,
          y + dy * r * 0.4,
          x + dx * r * 1.4,
          y + dy * r * 0.4,
        );
      }
      ctx.stroke();
    }),
  ];
  return { base: [fill, line], eyes, mouths, decorations };
}

/** 三色橫帶＋透明邊的取色示範圖（上紅、中綠、下藍） */
export function makeBands(): Art {
  const { c, ctx } = canvas(120, 300);
  ctx.fillStyle = '#e03030';
  ctx.fillRect(10, 0, 100, 100);
  ctx.fillStyle = '#30c030';
  ctx.fillRect(10, 100, 100, 100);
  ctx.fillStyle = '#3050e0';
  ctx.fillRect(10, 200, 100, 100);
  ctx.fillStyle = '#808080';
  ctx.fillRect(10, 140, 100, 8);
  return c;
}
