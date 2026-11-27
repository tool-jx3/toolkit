/**
 * 內牆的紋路（建築的區域與車廂裡的區域共用）。
 */
import type { Rect } from '../model/layout';
import type { WallTone } from '../model/types';
import type { Ctx } from './kit';

/** 內牆的紋路 */
export function wallGrain(c: Ctx, r: Rect, tone: WallTone, color: string): void {
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.beginPath();
  const rows = (dy: number, offset: number, dx: number) => {
    let row = 0;
    for (let y = r.y; y < r.y + r.h; y += dy, row++) {
      c.moveTo(r.x, y);
      c.lineTo(r.x + r.w, y);
      for (let x = r.x + (row % 2) * offset; x < r.x + r.w; x += dx) {
        c.moveTo(x, y);
        c.lineTo(x, y + dy);
      }
    }
  };
  if (tone === 'tile') rows(0.5, 0, 0.5);
  else if (tone === 'brick') rows(0.32, 0.4, 0.8);
  else if (tone === 'stone') rows(0.7, 0.75, 1.5);
  else if (tone === 'concrete') {
    for (let y = r.y + 1.2; y < r.y + r.h; y += 1.2) {
      c.moveTo(r.x, y);
      c.lineTo(r.x + r.w, y);
    }
    for (let x = r.x + 2; x < r.x + r.w; x += 2) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.h);
    }
  } else if (tone === 'wood')
    for (let x = r.x + 0.34; x < r.x + r.w; x += 0.34) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.h);
    }
  else if (tone === 'metal') {
    for (let x = r.x + 1.6; x < r.x + r.w; x += 1.6) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.h);
    }
  }
  c.strokeStyle = color;
  c.lineWidth = 0.02;
  c.stroke();
  if (tone === 'metal' || tone === 'concrete') {
    const step = tone === 'metal' ? 1.6 : 2;
    c.fillStyle = color;
    for (let x = r.x + step / 2; x < r.x + r.w; x += step)
      for (let y = r.y + 0.3; y < r.y + r.h; y += 1.2) {
        c.beginPath();
        c.arc(x, y, 0.035, 0, Math.PI * 2);
        c.fill();
      }
  }
  c.restore();
}
