/**
 * 狀態印章的圖示（規格 F14；本站自己畫的線條圖示，24 × 24、線寬 2、圓角端點）。
 * 每個圖示是幾段 SVG 路徑：'s' 描邊、'f' 填滿。
 */
import type { StampId } from '../model';
import type { Ctx } from './canvas';

interface Part {
  d: string;
  fill?: boolean;
}

const s = (d: string): Part => ({ d });
const f = (d: string): Part => ({ d, fill: true });
const dot = (cx: number, cy: number, r: number) =>
  `M${cx + r} ${cy}a${r} ${r} 0 1 1-${r * 2} 0a${r} ${r} 0 1 1 ${r * 2} 0z`;
const ring = 'M21.5 12a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0z';

export const STAMP_ICONS: Record<Exclude<StampId, 'none'>, readonly Part[]> = {
  important: [s(ring), s('M12 6.8v6.6'), f(dot(12, 16.9, 1.35))],
  locked: [
    s('M8 11V8.2a4 4 0 0 1 8 0V11'),
    s(
      'M6.8 11h10.4a1.8 1.8 0 0 1 1.8 1.8v6.4a1.8 1.8 0 0 1-1.8 1.8H6.8A1.8 1.8 0 0 1 5 19.2v-6.4A1.8 1.8 0 0 1 6.8 11z',
    ),
    f(dot(12, 15.2, 1.4)),
    s('M12 15.6v2.3'),
  ],
  investigating: [s('M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z'), s('M15.3 15.3l5.2 5.2')],
  danger: [
    s(
      'M12 3.4c-4.5 0-8 3.2-8 7.5 0 2.4 1.1 4.4 2.8 5.6v2.6a1.4 1.4 0 0 0 1.4 1.4h7.6a1.4 1.4 0 0 0 1.4-1.4v-2.6c1.7-1.2 2.8-3.2 2.8-5.6 0-4.3-3.5-7.5-8-7.5z',
    ),
    f(dot(9, 11.4, 1.9)),
    f(dot(15, 11.4, 1.9)),
    f('M12 13.9l-1.1 2h2.2z'),
    s('M10.2 18.2v2.2M13.8 18.2v2.2'),
  ],
  question: [
    s(ring),
    s('M9.3 9.4a2.8 2.8 0 0 1 5.5.8c0 1.9-2.8 2.4-2.8 4.2'),
    f(dot(12, 17.3, 1.35)),
  ],
  hidden: [
    s('M3 12s3.3-6 9-6c1.6 0 3 .4 4.2 1.1M21 12s-3.3 6-9 6c-1.6 0-3-.4-4.2-1.1'),
    s('M9.6 14.4a3.2 3.2 0 0 1 4.8-4.8'),
    s('M4 20 20 4'),
  ],
  done: [s(ring), s('M7.6 12.4l3 3 5.9-6.3')],
};

/** 在 (x, y) 畫一個 size × size 的印章圖示 */
export function drawStamp(
  ctx: Ctx,
  id: StampId,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha = 0.8,
): void {
  if (id === 'none') return;
  const parts = STAMP_ICONS[id];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of parts) {
    const path = new Path2D(p.d);
    if (p.fill) ctx.fill(path);
    else ctx.stroke(path);
  }
  ctx.restore();
}

/** 手機狀態列的小圖示（訊號、Wi-Fi、電池；簡訊主題用），以 14 px 為準 */
export function drawStatusIcons(ctx: Ctx, right: number, cy: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  /* 電池 */
  let x = right - 22;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, cy - 5.5, 19, 11, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x + 2.5, cy - 3.5, 15, 7, 1.5);
  ctx.fill();
  ctx.fillRect(x + 20.5, cy - 2, 1.5, 4);
  /* Wi-Fi：三段扇形 */
  x -= 20;
  const wx = x + 8;
  const wy = cy + 5;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (const r of [3.6, 7.2, 10.8]) {
    ctx.beginPath();
    ctx.arc(wx, wy, r, (-Math.PI * 3) / 4, -Math.PI / 4);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wx, wy, 1.2, 0, Math.PI * 2);
  ctx.fill();
  /* 訊號：四格 */
  x -= 22;
  for (let i = 0; i < 4; i++) {
    const hgt = 3.5 + i * 2.5;
    ctx.beginPath();
    ctx.roundRect(x + i * 4.5, cy + 5 - hgt, 3, hgt, 1);
    ctx.fill();
  }
  ctx.restore();
}
