/**
 * 外框（本站的設計）：雙線的邊框、左上的標題與副標、右上的方位（八方位的羅盤，N 在上）、右下的比例尺。
 * 比例尺的長度與旅程用同一個縮尺（model/scale.ts）。
 */
import { formatKm, niceScaleBar } from '../model/scale';
import { CELL, type WorldDoc } from '../model/types';
import { familyCss, nameStyle } from './labels';
import { THEMES } from './palette';

type Ctx = CanvasRenderingContext2D;

/** 外框的字與線的顏色（白地圖的海很淺，用墨色；夜航用淺色） */
export const frameColor = (doc: WorldDoc): string => THEMES[doc.theme].frame;

export function drawFrame(ctx: Ctx, doc: WorldDoc): void {
  const W = doc.cols * CELL;
  const H = doc.rows * CELL;
  const t = THEMES[doc.theme];
  const fc = frameColor(doc);
  ctx.save();
  /* 邊框 */
  ctx.strokeStyle = t.wave;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 0.7;
  ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.globalAlpha = 1;
  /* 標題 */
  const main = familyCss(doc.settings.font);
  const sub = familyCss(nameStyle(doc.settings.font));
  ctx.fillStyle = fc;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 30px ${main}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(doc.title, 44, 64);
  if (doc.settings.subtitle) {
    ctx.font = `500 10px ${sub}`;
    ctx.letterSpacing = '3px';
    ctx.globalAlpha = 0.72;
    ctx.fillText(doc.settings.subtitle, 46, 86);
    ctx.globalAlpha = 1;
  }
  ctx.letterSpacing = '0px';
  ctx.strokeStyle = fc;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(44, 73);
  ctx.lineTo(44 + Math.min(260, Math.max(90, ctx.measureText(doc.title).width + 40)), 73);
  ctx.stroke();
  ctx.globalAlpha = 1;
  /* 羅盤 */
  ctx.save();
  ctx.translate(W - 80, 92);
  ctx.strokeStyle = fc;
  ctx.fillStyle = fc;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const long = i % 2 === 0;
    const len = long ? 34 : 15;
    const wid = long ? 5 : 3.5;
    const tip = { x: Math.cos(a) * len, y: Math.sin(a) * len };
    const l = { x: Math.cos(a - Math.PI / 2) * wid, y: Math.sin(a - Math.PI / 2) * wid };
    const r = { x: Math.cos(a + Math.PI / 2) * wid, y: Math.sin(a + Math.PI / 2) * wid };
    /* 半邊實心、半邊空心 */
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(l.x, l.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r.x, r.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.font = `700 12px ${sub}`;
  ctx.textAlign = 'center';
  ctx.fillText('N', 0, -40);
  ctx.restore();
  /* 比例尺 */
  const bar = niceScaleBar(doc.settings.kmPer100);
  const x2 = W - 52;
  const x1 = x2 - bar.px;
  const y = H - 50;
  ctx.strokeStyle = fc;
  ctx.fillStyle = fc;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const xa = x1 + (bar.px * i) / 4;
    ctx.beginPath();
    ctx.rect(xa, y - 2, bar.px / 4, 4);
    if (i % 2 === 0) {
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
  }
  ctx.beginPath();
  for (const x of [x1, x1 + bar.px / 2, x2]) {
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + 2);
  }
  ctx.stroke();
  ctx.font = `500 10px ${sub}`;
  ctx.textAlign = 'center';
  ctx.fillText('0', x1, y - 9);
  ctx.fillText(formatKm(bar.km / 2), x1 + bar.px / 2, y - 9);
  ctx.textAlign = 'right';
  ctx.fillText(formatKm(bar.km), x2, y - 9);
  ctx.fillText('km', x2, y + 15);
  ctx.restore();
}
