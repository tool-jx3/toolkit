import type { Layer } from '../types';
import { num, str } from './util';

/** 四方向キラキラ星が明滅する */
export const sparkleLayer: Layer = {
  type: 'sparkle',
  draw(ctx, t, c) {
    const p = c.params;
    const count = Math.max(1, Math.round(num(p, 'count', 14)));
    const size = num(p, 'size', 0.06);
    const speed = Math.max(1, Math.round(num(p, 'twinkleSpeed', 2)));
    const color = str(p, 'color', '#ffffff');

    for (let i = 0; i < count; i++) {
      const x = c.rng() * c.w;
      const y = c.rng() * c.h;
      const phase = c.rng();
      const scaleBase = 0.5 + c.rng();
      const k = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t * speed + phase));
      const r = size * c.unit * scaleBase * k;
      if (r <= 0.5) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.25 + 0.75 * k;
      ctx.beginPath();
      // 四方向に伸びる星（くびれは r*0.14）
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.quadraticCurveTo(0, 0, 0, r);
      ctx.quadraticCurveTo(0, 0, -r, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r);
      ctx.fill();
      ctx.restore();
    }
  },
};
