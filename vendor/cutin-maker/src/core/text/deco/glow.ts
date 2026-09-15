import { resolvePaint } from '../../color';
import { scratch, scratchCtx } from '../../offscreen';
import { withIdentity } from '../draw';
import type { TextDecorator } from './types';

/** ネオン発光。同じ形状を blur を変えて加算合成で重ねる */
export const glowDecorator: TextDecorator<{ type: 'glow'; color: any; radius: number; passes: number; intensity: number }> = {
  type: 'glow',
  draw(ctx, glyphs, spec, t, c) {
    const mask = glyphs.mask();
    const passes = Math.max(1, Math.round(spec.passes));
    for (let p = passes; p >= 1; p--) {
      const blurPx = (spec.radius * c.fontSize * p) / passes;
      const b = scratchCtx(c.pool, 2, c.w, c.h);
      if (blurPx > 0) b.filter = `blur(${blurPx.toFixed(2)}px)`;
      b.drawImage(mask, 0, 0);
      b.filter = 'none';
      b.globalCompositeOperation = 'source-in';
      b.fillStyle = resolvePaint(spec.color, b, c.box, t);
      b.fillRect(0, 0, c.w, c.h);
      b.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, spec.intensity / passes);
      withIdentity(ctx, () => ctx.drawImage(scratch(c.pool, 2, c.w, c.h), 0, 0));
      ctx.restore();
    }
  },
};
