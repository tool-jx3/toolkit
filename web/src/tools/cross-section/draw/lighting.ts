/**
 * 室內的光與水（只畫在區域與公開通道的內部，不蓋到天空與地層）：
 * - 淹水：從地下的最下面往上淹到水位（地下部分的百分比；沒有地下時是整棟），水面一條亮線、水中幾條虛線。
 * - 夜・雨：室內蓋一層靛紫的暗（42%），光源周圍挖開並加上暖色／冷色的光暈。
 * - 停電・緊急照明：更暗（78%），只有緊急出口與自己有電源的設備（培養槽、監控台、火花、火）還亮著，
 *   每間區域的天花板中間有一盞紅色的緊急燈。
 * - 事件後：偏褐的暗（48%），所有光源照常。
 * 祕密區域與一般區域分開算（光不會從祕密區域透到隔壁）。暗的比例參考原作，顏色是本站自己的。
 */

import type { LightColor } from '../model/catalog';
import type { Rect } from '../model/layout';
import type { EnvId } from '../model/types';
import type { Ctx, Kit } from './kit';
import { alpha, mix } from './palette';

export interface LightSpot {
  x: number;
  y: number;
  r: number;
  color: LightColor;
  keep: boolean;
}

const DIM: Record<Exclude<EnvId, 'day'>, { tint: string; a: number }> = {
  night: { tint: '#1e1a46', a: 0.42 },
  blackout: { tint: '#07001c', a: 0.78 },
  after: { tint: '#251e07', a: 0.48 },
};

/** 淹水的深處 */
const DEEP_WATER = '#082a4a';

const clipRects = (c: Ctx, rects: readonly Rect[]) => {
  c.beginPath();
  for (const r of rects) c.rect(r.x, r.y, r.w, r.h);
  c.clip();
};

/** 暗的那一層另外畫在一張同樣大小的畫布上（光源的地方挖開），再疊回來 */
let layer: HTMLCanvasElement | null = null;
function layerCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!layer) layer = document.createElement('canvas');
  if (layer.width !== w) layer.width = w;
  if (layer.height !== h) layer.height = h;
  return layer;
}

export function drawFlood(
  k: Kit,
  rects: readonly Rect[],
  top: number,
  bottom: number,
  level: number,
): void {
  if (!rects.length || level <= 0 || bottom <= top) return;
  const { c, p } = k;
  const y = bottom - Math.min(1, level / 100) * (bottom - top);
  const minX = Math.min(...rects.map((r) => r.x)) - 1;
  const maxX = Math.max(...rects.map((r) => r.x + r.w)) + 1;
  c.save();
  clipRects(c, rects);
  const surface = () => {
    c.moveTo(minX, y);
    for (let x = minX + 0.8; x <= maxX; x += 0.8) c.lineTo(x, y + Math.sin(x * 1.3) * 0.08);
  };
  c.beginPath();
  surface();
  c.lineTo(maxX, bottom + 1);
  c.lineTo(minX, bottom + 1);
  c.closePath();
  const g = c.createLinearGradient(0, y, 0, bottom);
  g.addColorStop(0, alpha(p.flood, 0.55));
  g.addColorStop(0.25, alpha(p.flood, 0.66));
  g.addColorStop(1, alpha(mix(p.flood, DEEP_WATER, 0.55), 0.8));
  c.fillStyle = g;
  c.fill();
  c.beginPath();
  surface();
  c.strokeStyle = alpha(p.frost, 0.88);
  c.lineWidth = 0.085;
  c.stroke();
  c.setLineDash([1.4, 1.8]);
  c.beginPath();
  for (let yy = y + 0.7; yy < bottom; yy += 1.1) {
    c.moveTo(minX, yy);
    c.lineTo(maxX, yy);
  }
  c.strokeStyle = alpha(p.frost, 0.22);
  c.lineWidth = 0.025;
  c.stroke();
  c.setLineDash([]);
  c.restore();
}

export function drawLighting(
  k: Kit,
  env: EnvId,
  rects: readonly Rect[],
  lights: readonly LightSpot[],
): void {
  if (env === 'day' || !rects.length) return;
  const { c, p } = k;
  const { tint, a } = DIM[env];
  const on = env === 'blackout' ? lights.filter((l) => l.keep) : lights;
  const T = c.getTransform();
  const L = layerCanvas(c.canvas.width, c.canvas.height);
  const lc = L?.getContext('2d') ?? null;
  if (L && lc) {
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, L.width, L.height);
    lc.setTransform(T);
    lc.globalAlpha = a;
    lc.fillStyle = tint;
    lc.beginPath();
    for (const r of rects) lc.rect(r.x, r.y, r.w, r.h);
    lc.fill();
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'destination-out';
    for (const l of on) {
      const rr = l.r * 1.15;
      const g = lc.createRadialGradient(l.x, l.y, 0, l.x, l.y, rr);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
      g.addColorStop(0.55, 'rgba(0, 0, 0, 0.45)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lc.fillStyle = g;
      lc.beginPath();
      lc.arc(l.x, l.y, rr, 0, Math.PI * 2);
      lc.fill();
    }
    lc.globalCompositeOperation = 'source-over';
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(L, 0, 0);
    c.restore();
  } else {
    c.save();
    clipRects(c, rects);
    c.globalAlpha = a;
    c.fillStyle = tint;
    for (const r of rects) c.fillRect(r.x, r.y, r.w, r.h);
    c.restore();
  }
  c.save();
  clipRects(c, rects);
  for (const l of on) {
    const col = p[l.color];
    const strong = l.color === 'alarm' ? 0.62 : l.color === 'frost' ? 0.46 : 0.52;
    const g = c.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    g.addColorStop(0, alpha(col, strong));
    g.addColorStop(0.55, alpha(col, strong * 0.34));
    g.addColorStop(1, alpha(col, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    c.fill();
  }
  if (env === 'blackout') {
    /* 每間區域天花板中間的紅色緊急燈 */
    for (const r of rects) {
      if (r.w < 2.2) continue;
      const ex = r.x + r.w / 2;
      const rad = Math.min(3.4, r.w * 0.55);
      const g = c.createRadialGradient(ex, r.y + 0.24, 0, ex, r.y + 0.24, rad);
      g.addColorStop(0, alpha(p.alarm, 0.36));
      g.addColorStop(0.5, alpha(p.alarm, 0.12));
      g.addColorStop(1, alpha(p.alarm, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(ex, r.y + 0.24, rad, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = p.alarm;
      c.beginPath();
      c.roundRect(ex - 0.3, r.y + 0.04, 0.6, 0.12, 0.03);
      c.fill();
    }
  }
  c.restore();
}
