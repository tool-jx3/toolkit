import type { Layer } from '../types';
import { num, str, textRadius } from './util';

/** 同心円が広がって消える */
export const ringLayer: Layer = {
  type: 'ring',
  draw(ctx, t, c) {
    const p = c.params;
    const count = Math.max(1, Math.round(num(p, 'count', 3)));
    const speed = Math.max(1, Math.round(num(p, 'speed', 1)));
    const width = num(p, 'width', 0.01);
    const color = str(p, 'color', '#ffffff');
    const r0 = textRadius(c.textBox) * 1.05;
    const rMax = Math.hypot(c.w, c.h) / 2;

    for (let i = 0; i < count; i++) {
      const k = ((t * speed + i / count) % 1 + 1) % 1;
      const r = r0 + k * (rMax - r0);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * c.unit;
      ctx.beginPath();
      ctx.arc(c.center.x, c.center.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },
};
