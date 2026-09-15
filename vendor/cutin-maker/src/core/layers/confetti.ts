import { hslToRgb, rgbToCss } from '../color';
import type { Layer } from '../types';
import { num } from './util';

/** 紙吹雪。画面外→画面外で完全ループする */
export const confettiLayer: Layer = {
  type: 'confetti',
  draw(ctx, t, c) {
    const p = c.params;
    const count = Math.max(1, Math.round(num(p, 'count', 26)));
    const speed = Math.max(1, Math.round(num(p, 'speed', 1)));
    const size = num(p, 'size', 0.035);

    for (let i = 0; i < count; i++) {
      const x0 = c.rng();
      const y0 = c.rng();
      const hue = c.rng() * 360;
      const spin = Math.round(1 + c.rng() * 2);
      const sway = c.rng() * Math.PI * 2;
      const y = ((y0 + t * speed) % 1) * (c.h + 2 * size * c.unit) - size * c.unit;
      const x = x0 * c.w + Math.sin(2 * Math.PI * t * speed + sway) * 0.03 * c.unit;
      const s = size * c.unit;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(2 * Math.PI * t * spin + sway);
      ctx.fillStyle = rgbToCss(hslToRgb(hue, 0.8, 0.6));
      ctx.fillRect(-s / 2, -s / 4, s, s / 2);
      ctx.restore();
    }
  },
};
