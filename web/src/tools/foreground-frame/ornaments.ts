/**
 * 角飾（F23、F24、規格 3.6）：窗的矩形四個角各畫一個線稿圖案，各自旋轉讓兩條「臂」沿著窗的兩邊往鄰角延伸。
 * 局部座標：窗角是原點，窗在 +x／+y 方向；錨點是從窗角沿 45° 往框外移「距離」單位的點（負值往窗內）。
 */
import type { OrnamentType } from './model';
import type { G } from './render';
import { resolveColor } from './render';

const TAU = Math.PI * 2;

type Draw = (ctx: CanvasRenderingContext2D, s: number, gap: number) => void;

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function diamondPath(ctx: CanvasRenderingContext2D, c: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(c, c - h);
  ctx.lineTo(c + h, c);
  ctx.lineTo(c, c + h);
  ctx.lineTo(c - h, c);
  ctx.closePath();
}

const ORNAMENTS: Record<Exclude<OrnamentType, 'none'>, Draw> = {
  /** 折角線：兩條長 s 的線段（L 形） */
  bracket(ctx, s, gap) {
    const e = -gap;
    ctx.beginPath();
    ctx.moveTo(e, e + s);
    ctx.lineTo(e, e);
    ctx.lineTo(e + s, e);
    ctx.stroke();
  },
  /** 菱形：實心菱形（半對角線 s/2）外加一圈菱形框（約 0.85 s） */
  diamond(ctx, s, gap) {
    const c = -gap;
    const h = s / 2;
    diamondPath(ctx, c, h);
    ctx.fill();
    diamondPath(ctx, c, h * 1.7);
    ctx.stroke();
  },
  /** 星芒：錨點一顆半徑 s/2 的四芒星，沿兩邊約 0.55 s 處各一顆 0.16 s 的小星 */
  star(ctx, s, gap) {
    const c = -gap;
    sparkle(ctx, c, c, s / 2);
    sparkle(ctx, c + s * 0.55, c - s * 0.1, s * 0.16);
    sparkle(ctx, c - s * 0.1, c + s * 0.55, s * 0.16);
  },
  /** 圓點：錨點 0.14 s 的圓點，沿兩邊 0.5 s、0.9 s 處各一顆漸小的圓點 */
  dots(ctx, s, gap) {
    const c = -gap;
    const dot = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    dot(c, c, s * 0.14);
    dot(c + s * 0.5, c, s * 0.09);
    dot(c, c + s * 0.5, s * 0.09);
    dot(c + s * 0.9, c, s * 0.055);
    dot(c, c + s * 0.9, s * 0.055);
  },
  /** 唐草：錨點一個小菱形（0.12 s），沿兩邊各一條長約 0.9 s 的捲曲線，末端一顆小點 */
  flourish(ctx, s, gap) {
    const c = -gap;
    ctx.beginPath();
    for (const swap of [false, true]) {
      const P = (x: number, y: number): [number, number] =>
        swap ? [c + y, c + x] : [c + x, c + y];
      ctx.moveTo(...P(s * 0.12, 0));
      ctx.bezierCurveTo(
        ...P(s * 0.35, -s * 0.26),
        ...P(s * 0.6, s * 0.24),
        ...P(s * 0.92, -s * 0.02),
      );
      ctx.moveTo(...P(s * 0.45, -s * 0.02));
      ctx.bezierCurveTo(
        ...P(s * 0.52, -s * 0.16),
        ...P(s * 0.68, -s * 0.16),
        ...P(s * 0.7, -s * 0.06),
      );
    }
    ctx.stroke();
    diamondPath(ctx, c, s * 0.12);
    ctx.fill();
    for (const [x, y] of [
      [c + s * 0.92, c - s * 0.02],
      [c - s * 0.02, c + s * 0.92],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.045, 0, TAU);
      ctx.fill();
    }
  },
};

export function drawOrnaments(g: G): void {
  const { ctx, state, slot } = g;
  const o = state.frame.ornament;
  if (o.type === 'none' || o.size <= 0) return;
  const draw = ORNAMENTS[o.type];
  if (!draw) return;
  const r = g.rect;
  const points = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
  ctx.save();
  const color = resolveColor(o.color, slot);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = o.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  points.forEach(([px, py], i) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((i * Math.PI) / 2);
    draw(ctx, o.size, o.gap);
    ctx.restore();
  });
  ctx.restore();
}

/** 用到線條粗細的角飾（其他種類隱藏「線條粗細」） */
export const ORNAMENT_USES_WIDTH: readonly OrnamentType[] = ['bracket', 'diamond', 'flourish'];
