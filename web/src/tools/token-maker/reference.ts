/**
 * 參考輪廓（eidolon-ui，MIT）：預覽上的對齊參考，不會匯出。
 * 剪影是 200 × 200 的 SVG 路徑（−100～100＝外框的外半徑），同一份資料畫選項的圖示與預覽上的參考（剪在開口裡）；
 * 另有自訂參考圖（整張蓋在棋子的範圍上，不剪；名單裡的棋子「當參考」時畫成參考圖），以及輔助線（中心十字、三分線）。
 */
import type { Ctx2D } from './frames';
import type { Geom } from './model';

const CIRCLE = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const ELLIPSE = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;

export type RefShape = 'bust' | 'head' | 'body' | 'profile';
export const REF_SHAPES: readonly RefShape[] = ['bust', 'head', 'body', 'profile'];
export type RefKind = 'off' | RefShape | 'custom';
export type Guides = 'off' | 'cross' | 'grid';

export const REF_PATHS: Record<RefShape, string> = {
  /* 頭肩 */
  bust: `${CIRCLE(0, -30, 32)} M -15 -2 L 15 -2 L 17 14 C 50 20 78 34 84 70 L 92 100 L -92 100 L -84 70 C -78 34 -50 20 -17 14 Z`,
  /* 近照 */
  head: `${ELLIPSE(0, -12, 50, 62)} M -24 40 L 24 40 L 28 66 C 58 74 80 88 86 100 L -86 100 C -80 88 -58 74 -28 66 Z`,
  /* 全身 */
  body:
    `${CIRCLE(0, -70, 14)} M -11 -54 L 11 -54 L 13 -48 L 31 -42 L 40 -2 L 31 1 L 24 -28 L 20 -26 L 21 10 L 17 92 L 4 92 L 0 24` +
    ' L -4 92 L -17 92 L -21 10 L -20 -26 L -24 -28 L -31 1 L -40 -2 L -31 -42 L -13 -48 Z',
  /* 側面（朝右） */
  profile:
    'M -40 -62 C -10 -88 42 -78 50 -36 L 54 -20 L 66 -6 L 55 0 L 57 10 L 50 14 L 52 25' +
    ' C 48 35 32 35 22 33 L 20 50 C 50 58 76 72 84 100 L -82 100 C -78 72 -62 58 -40 48 C -60 30 -66 -30 -40 -62 Z',
};

const cache = new Map<RefShape, Path2D>();
const pathOf = (k: RefShape) => {
  let p = cache.get(k);
  if (!p) {
    p = new Path2D(REF_PATHS[k]);
    cache.set(k, p);
  }
  return p;
};

/** 剪影（還沒剪成開口；呼叫端再剪） */
export function drawRefShape(ctx: Ctx2D, g: Geom, kind: RefShape, opacity: number): void {
  const k = g.R / 100;
  const u = g.N / 512;
  ctx.save();
  ctx.translate(g.c, g.c);
  ctx.scale(k, k);
  const p = pathOf(kind);
  ctx.fillStyle = `rgba(0,240,255,${opacity * 0.55})`;
  ctx.fill(p);
  ctx.lineWidth = (1.6 / k) * u;
  ctx.setLineDash([(6 / k) * u, (4 / k) * u]);
  ctx.strokeStyle = `rgba(232,232,238,${Math.min(1, opacity * 1.4)})`;
  ctx.stroke(p);
  ctx.restore();
}

/** 輔助線：中心十字（＋中心的小圓）或三分線，畫在外框的範圍 */
export function drawGuides(ctx: Ctx2D, g: Geom, opacity: number, mode: Guides): void {
  if (mode === 'off') return;
  const u = g.N / 512;
  const R = g.R;
  ctx.save();
  ctx.lineWidth = 1.4 * u;
  ctx.strokeStyle = `rgba(0,240,255,${Math.min(1, opacity * 1.6)})`;
  ctx.setLineDash([8 * u, 5 * u]);
  ctx.beginPath();
  const offs = mode === 'grid' ? [-R / 3, R / 3] : [0];
  for (const o of offs) {
    ctx.moveTo(g.c + o, g.c - R);
    ctx.lineTo(g.c + o, g.c + R);
    ctx.moveTo(g.c - R, g.c + o);
    ctx.lineTo(g.c + R, g.c + o);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  if (mode === 'cross') {
    ctx.beginPath();
    ctx.arc(g.c, g.c, 6 * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
