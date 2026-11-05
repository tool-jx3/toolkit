/**
 * 城牆（本站自己的畫法）：從斜上方看的石牆——正面（依方向明暗）、牆頂的走道、垛口、一道石縫，
 * 轉角與每隔一段距離一座圓塔（垛口＋箭窗），依底邊由上往下排，前面的蓋住後面的。
 *
 * - 牆的高＝round(粗細 × 1.75＋3)，底邊在線的下方 0.32、頂在上方 0.68；牆頂的寬＝max(2.2, 粗細 × 0.52)。
 * - 長的牆切成至少 max(42, 全長 ÷ 900) px 一段；塔的間隔 max(76, 全長 ÷ 180) px，相距不到間隔 0.35 倍的塔只留一座
 *   （長城不會畫出幾千座塔）。
 * - 雪原上（積雪量見 model/climate.ts）石頭偏白、牆頂與塔頂積雪。
 */
import type { SnowAt } from '../model/climate';
import { clamp } from '../model/geometry';
import type { Pt, ThemeId } from '../model/types';
import { mix, SNOW_WHITE } from './palette';

type Ctx = CanvasRenderingContext2D;

interface Item {
  y: number;
  draw: () => void;
}

export function drawWall(
  ctx: Ctx,
  points: readonly Pt[],
  closed: boolean,
  width: number,
  theme: ThemeId,
  secret: boolean,
  snowAt: SnowAt | null,
): void {
  if (points.length < (closed ? 3 : 2)) return;
  const pts = closed ? [...points, points[0]] : points.slice();
  const night = theme === 'night';
  const ink = secret ? '#6f4a80' : night ? '#2a4240' : '#55452f';
  const baseStone = night ? '#b4c4b0' : '#d2bf93';
  const baseShade = night ? '#728f88' : '#a28c69';
  const baseTop = night ? '#dbe5dc' : '#efe0b6';
  const baseDark = night ? '#4a6c67' : '#7a6649';
  const slit = night ? '#33504c' : '#4f3b2c';
  const w = Math.max(3, width);
  const H = Math.round(w * 1.75 + 3);
  const top = H * 0.68;
  const bot = H * 0.32;
  const thick = Math.max(2.2, w * 0.52);
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const spacing = Math.max(76, total / 180);
  const items: Item[] = [];
  const towers: Pt[] = [];
  const addTower = (p: Pt) => {
    if (!towers.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < spacing * 0.35)) towers.push(p);
  };
  const colors = (snow: number) => ({
    stone: snow > 0.01 ? mix(baseStone, '#e3e9e1', snow * 0.75) : baseStone,
    shade: snow > 0.01 ? mix(baseShade, '#a1b3ad', snow * 0.6) : baseShade,
    topc: snow > 0.01 ? mix(baseTop, SNOW_WHITE, snow * 0.9) : baseTop,
    dark: snow > 0.01 ? mix(baseDark, '#839c95', snow * 0.55) : baseDark,
  });
  const piece = Math.max(42, total / 900);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const sub = Math.max(1, Math.ceil(len / piece));
    for (let s = 0; s < sub; s++) {
      const p0 = { x: a.x + (dx * s) / sub, y: a.y + (dy * s) / sub };
      const p1 = { x: a.x + (dx * (s + 1)) / sub, y: a.y + (dy * (s + 1)) / sub };
      const snow = snowAt ? snowAt((p0.x + p1.x) / 2, (p0.y + p1.y) / 2) : 0;
      const c = colors(snow);
      const segLen = len / sub;
      const nx = (-dy / len) * (thick / 2);
      const ny = (dx / len) * (thick / 2);
      const shadeK = clamp((Math.abs(dy) / len) * 0.55 + (dx < 0 ? 0.18 : 0), 0, 0.85);
      const face = mix(c.stone, c.shade, shadeK);
      items.push({
        y: Math.max(p0.y, p1.y),
        draw: () => {
          ctx.save();
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          /* 落在地上的影子 */
          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = ink;
          ctx.lineWidth = thick + 3;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y + bot + 1.8);
          ctx.lineTo(p1.x, p1.y + bot + 1.8);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = ink;
          /* 牆身（含厚度） */
          ctx.lineWidth = 1;
          ctx.fillStyle = c.dark;
          ctx.beginPath();
          ctx.moveTo(p0.x - nx, p0.y + bot - ny);
          ctx.lineTo(p1.x - nx, p1.y + bot - ny);
          ctx.lineTo(p1.x + nx, p1.y + bot + ny);
          ctx.lineTo(p1.x + nx, p1.y - top + ny);
          ctx.lineTo(p0.x + nx, p0.y - top + ny);
          ctx.lineTo(p0.x - nx, p0.y - top - ny);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          /* 正面 */
          ctx.fillStyle = face;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y + bot);
          ctx.lineTo(p1.x, p1.y + bot);
          ctx.lineTo(p1.x, p1.y - top);
          ctx.lineTo(p0.x, p0.y - top);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          /* 石縫 */
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y + bot - H * 0.38);
          ctx.lineTo(p1.x, p1.y + bot - H * 0.38);
          ctx.stroke();
          ctx.globalAlpha = 1;
          /* 牆頂的走道 */
          ctx.lineWidth = 0.85;
          ctx.fillStyle = c.topc;
          ctx.beginPath();
          ctx.moveTo(p0.x - nx, p0.y - top - ny);
          ctx.lineTo(p1.x - nx, p1.y - top - ny);
          ctx.lineTo(p1.x + nx, p1.y - top + ny);
          ctx.lineTo(p0.x + nx, p0.y - top + ny);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          /* 垛口：沿著牆頂前緣一個個小方塊 */
          const step = Math.max(6, w * 1.4, total / 5000);
          const count = Math.floor(segLen / step);
          const mh = Math.max(2.2, w * 0.45);
          ctx.fillStyle = snow > 0.25 ? c.topc : face;
          for (let m = 0; m < count; m++) {
            const t0 = (m + 0.25) / count;
            const t1 = Math.min(0.95, t0 + 0.5 / count);
            const x0 = p0.x + nx + (p1.x - p0.x) * t0;
            const y0 = p0.y - top + ny + (p1.y - p0.y) * t0;
            const x1 = p0.x + nx + (p1.x - p0.x) * t1;
            const y1 = p0.y - top + ny + (p1.y - p0.y) * t1;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1, y1 - mh);
            ctx.lineTo(x0, y0 - mh);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        },
      });
    }
    addTower(a);
    const n = Math.floor(len / spacing);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      addTower({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  if (!closed) addTower(pts[pts.length - 1]);
  const tw = Math.max(7, Math.round(w * 1.55 + 2.5));
  const th = Math.round(H * 1.32 + 3);
  const r = tw / 2;
  for (const p of towers) {
    const snow = snowAt ? snowAt(p.x, p.y) : 0;
    const c = colors(snow);
    items.push({
      y: p.y + 1.5,
      draw: () => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = ink;
        const yb = bot + 1.2;
        const yt = yb - th;
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(0, yb + 1, r * 1.25, r * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        /* 圓柱 */
        ctx.lineWidth = 1.05;
        ctx.fillStyle = c.stone;
        ctx.beginPath();
        ctx.moveTo(-r, yt);
        ctx.lineTo(-r, yb);
        ctx.ellipse(0, yb, r, r * 0.38, 0, Math.PI, 0, true);
        ctx.lineTo(r, yt);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = c.shade;
        ctx.beginPath();
        ctx.moveTo(r * 0.2, yt);
        ctx.lineTo(r, yt);
        ctx.lineTo(r, yb);
        ctx.ellipse(0, yb, r, r * 0.38, 0, 0, Math.PI * 0.42);
        ctx.closePath();
        ctx.fill();
        /* 塔頂：一圈平台＋三個垛 */
        ctx.fillStyle = c.topc;
        ctx.beginPath();
        ctx.ellipse(0, yt, r * 1.12, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const mw = r * 0.5;
        const mh = Math.max(2.4, r * 0.55);
        ctx.fillStyle = snow > 0.25 ? c.topc : c.stone;
        for (const mx of [-r * 0.95, -mw / 2, r * 0.95 - mw]) {
          ctx.beginPath();
          ctx.rect(mx, yt - mh + r * 0.18, mw, mh);
          ctx.fill();
          ctx.stroke();
        }
        if (snow > 0.05) {
          ctx.globalAlpha = snow;
          ctx.fillStyle = SNOW_WHITE;
          ctx.beginPath();
          ctx.ellipse(0, yt - mh + r * 0.18, r * 1.05, 1.2 + snow * 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        /* 箭窗 */
        ctx.fillStyle = slit;
        ctx.fillRect(-r * 0.16, yt + th * 0.3, r * 0.32, Math.max(3.5, th * 0.24));
        ctx.restore();
      },
    });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}
