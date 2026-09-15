import type { TextDecorator } from './types';

/** 文字の形で背後をくり抜く。帯型カットイン向け */
export const knockoutDecorator: TextDecorator<{ type: 'knockout' }> = {
  type: 'knockout',
  draw(ctx, glyphs) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    glyphs.fill(ctx, '#000000');
    ctx.restore();
  },
};
