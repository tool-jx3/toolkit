import { hslToRgb, rgbToCss } from '../color';
import type { Layer } from '../types';
import { num } from './util';

/** 背景色が虹で循環する。z='back' 前提 */
export const bgFlashLayer: Layer = {
  type: 'bgFlash',
  draw(ctx, t, c) {
    const p = c.params;
    const speed = Math.max(1, Math.round(num(p, 'speed', 1)));
    const saturation = num(p, 'saturation', 0.85);
    const lightness = num(p, 'lightness', 0.55);
    const alpha = num(p, 'alpha', 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgbToCss(hslToRgb(t * speed * 360, saturation, lightness));
    ctx.fillRect(0, 0, c.w, c.h);
    ctx.restore();
  },
};
