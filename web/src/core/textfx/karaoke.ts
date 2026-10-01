/**
 * 卡拉 OK 變色：先畫「唱前」的整句，再疊上只露出交界之前的「唱後」文字（交界可以柔化），
 * 掃描中在交界加一條以加亮混色疊上的發光帶。
 *
 * 遮罩（不透明度＝留下的比例）：
 * - fillWipeMask：交界之前完全不透明，交界前 softness px 內線性變透明（由右往左掃時方向相反）；
 *   上下範圍 top～bottom（例如延伸到行與行的中線），左右多延伸 extend px，外框不會被切掉。
 * - fillBandMask：以交界為中心、寬 width 的帶子，中央最亮、往兩側線性變淡到 0。
 */
import { type Ctx2D, type LayerPool, maskedComposite, tintLayer } from './layers';

export interface WipeMaskOptions {
  /** 交界的 x */
  edge: number;
  /** 柔化寬度（px；0＝硬邊） */
  softness?: number;
  /** ltr：由左往右唱（交界左邊是唱過的）；rtl：由右往左 */
  direction?: 'ltr' | 'rtl';
  /** 遮罩的左右範圍（行的左右端再多延伸一點） */
  left: number;
  right: number;
  /** 遮罩的上下範圍 */
  top: number;
  bottom: number;
}

/** 唱過的部分的遮罩 */
export function fillWipeMask(ctx: Ctx2D, o: WipeMaskOptions): void {
  const soft = Math.max(0, o.softness ?? 0);
  const ltr = (o.direction ?? 'ltr') === 'ltr';
  const h = o.bottom - o.top;
  if (h <= 0) return;
  if (ltr) {
    const x1 = Math.min(o.edge, o.right);
    if (x1 <= o.left) return;
    if (soft <= 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(o.left, o.top, x1 - o.left, h);
      return;
    }
    const g = ctx.createLinearGradient(o.edge - soft, 0, o.edge, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(o.left, o.top, x1 - o.left, h);
  } else {
    const x0 = Math.max(o.edge, o.left);
    if (x0 >= o.right) return;
    if (soft <= 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x0, o.top, o.right - x0, h);
      return;
    }
    const g = ctx.createLinearGradient(o.edge + soft, 0, o.edge, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, o.top, o.right - x0, h);
  }
}

/** 發光帶的遮罩：中央（center）最亮，往兩側 width ÷ 2 線性變淡到 0 */
export function fillBandMask(
  ctx: Ctx2D,
  { center, width, top, bottom }: { center: number; width: number; top: number; bottom: number },
): void {
  if (width <= 0 || bottom <= top) return;
  const g = ctx.createLinearGradient(center - width / 2, 0, center + width / 2, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(center - width / 2, top, width, bottom - top);
}

/** 交界位置：行的左端＋進度 × 行寬（由右往左時從右端往左） */
export function wipeEdge(
  progress: number,
  lineLeft: number,
  lineRight: number,
  direction: 'ltr' | 'rtl' = 'ltr',
): number {
  const p = Math.min(1, Math.max(0, progress));
  return direction === 'ltr'
    ? lineLeft + p * (lineRight - lineLeft)
    : lineRight - p * (lineRight - lineLeft);
}

export interface KaraokeLineOptions {
  /** 畫唱前的整句（含陰影） */
  drawBefore: (ctx: Ctx2D) => void;
  /** 畫唱後的整句（無陰影） */
  drawAfter: (ctx: Ctx2D) => void;
  /** 發光用的剪影（字＋外框，任何顏色；會被染成發光色）。不給時用 drawAfter */
  drawSilhouette?: (ctx: Ctx2D) => void;
  /** 進度 0～1：0＝還沒唱、1＝整句唱完 */
  progress: number;
  /** 行的左右端（交界從這裡算） */
  lineLeft: number;
  lineRight: number;
  /** 遮罩的上下範圍 */
  top: number;
  bottom: number;
  /** 遮罩左右多延伸（外框＋陰影模糊＋一點，避免切到外框） */
  extend?: number;
  softness?: number;
  direction?: 'ltr' | 'rtl';
  /** 掃描發光（只在 0 < 進度 < 1 時出現） */
  glow?: { color: string; width: number } | null;
}

/** 畫一句卡拉 OK：唱前 → 遮罩後的唱後 → 發光帶 */
export function drawKaraokeLine(ctx: Ctx2D, pool: LayerPool, o: KaraokeLineOptions): void {
  const p = Math.min(1, Math.max(0, o.progress));
  o.drawBefore(ctx);
  if (p <= 0) return;
  if (p >= 1) {
    o.drawAfter(ctx);
    return;
  }
  const dir = o.direction ?? 'ltr';
  const edge = wipeEdge(p, o.lineLeft, o.lineRight, dir);
  const extend = o.extend ?? 0;
  const left = o.lineLeft - extend;
  const right = o.lineRight + extend;
  maskedComposite(ctx, pool, {
    draw: o.drawAfter,
    mask: (c) =>
      fillWipeMask(c, {
        edge,
        softness: o.softness,
        direction: dir,
        left,
        right,
        top: o.top,
        bottom: o.bottom,
      }),
  });
  if (o.glow && o.glow.width > 0) {
    const glow = o.glow;
    maskedComposite(ctx, pool, {
      draw: (c) => {
        (o.drawSilhouette ?? o.drawAfter)(c);
        tintLayer(c, glow.color);
      },
      mask: (c) =>
        fillBandMask(c, { center: edge, width: glow.width, top: o.top, bottom: o.bottom }),
      composite: 'lighter',
    });
  }
}
