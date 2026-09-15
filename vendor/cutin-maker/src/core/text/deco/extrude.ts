import { resolvePaint } from '../../color';
import type { TextDecorator } from './types';

/** 3D押し出し。angle 方向に depth（fontSize比）ぶん複製を重ねる */
export const extrudeDecorator: TextDecorator<{ type: 'extrude'; depth: number; angle: number; color: any }> = {
  type: 'extrude',
  draw(ctx, glyphs, spec, t, c) {
    const dist = spec.depth * c.fontSize;
    const rad = (spec.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const steps = Math.max(1, Math.round(dist));
    const paint = resolvePaint(spec.color, ctx, c.box, t);
    for (let i = steps; i >= 1; i--) {
      ctx.save();
      ctx.translate((dx * dist * i) / steps, (dy * dist * i) / steps);
      glyphs.fill(ctx, paint);
      ctx.restore();
    }
  },
};
