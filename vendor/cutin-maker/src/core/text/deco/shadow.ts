import { scratch, scratchCtx } from '../../offscreen';
import { withIdentity } from '../draw';
import type { TextDecorator } from './types';

/**
 * ドロップシャドウ。ctx.shadowBlur ではなくマスクをぼかして合成する（制御しやすい）。
 * blur=0 でハードシャドウ。
 */
export const shadowDecorator: TextDecorator<{ type: 'shadow'; blur: number; offset: any; color: string; opacity: number }> = {
  type: 'shadow',
  draw(ctx, glyphs, spec, _t, c) {
    const mask = glyphs.mask();
    const b = scratchCtx(c.pool, 2, c.w, c.h);
    const blurPx = spec.blur * c.fontSize;
    if (blurPx > 0) b.filter = `blur(${blurPx.toFixed(2)}px)`;
    b.drawImage(mask, spec.offset.x * c.fontSize, spec.offset.y * c.fontSize);
    b.filter = 'none';
    b.globalCompositeOperation = 'source-in';
    b.fillStyle = spec.color;
    b.fillRect(0, 0, c.w, c.h);
    b.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = spec.opacity;
    withIdentity(ctx, () => ctx.drawImage(scratch(c.pool, 2, c.w, c.h), 0, 0));
    ctx.restore();
  },
};
