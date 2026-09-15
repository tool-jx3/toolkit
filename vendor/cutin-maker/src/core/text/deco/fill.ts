import { resolvePaint } from '../../color';
import type { TextDecorator } from './types';

export const fillDecorator: TextDecorator<{ type: 'fill'; color: any }> = {
  type: 'fill',
  draw(ctx, glyphs, spec, t, c) {
    glyphs.fill(ctx, resolvePaint(spec.color, ctx, c.box, t));
  },
};
