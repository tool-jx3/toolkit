import type { TextDecorator } from './types';

/** 位置をずらした複製。blend='screen' でグリッチのRGBずれになる */
export const offsetCopyDecorator: TextDecorator<{ type: 'offsetCopy'; offset: any; color: string; blend: GlobalCompositeOperation; jitter: number }> = {
  type: 'offsetCopy',
  draw(ctx, glyphs, spec, _t, c) {
    // rng はフレーム先頭で reseed されるため、ジッタもフレーム間で決定論的
    const jx = (c.rng() - 0.5) * 2 * spec.jitter * c.fontSize;
    const jy = (c.rng() - 0.5) * 2 * spec.jitter * c.fontSize;
    ctx.save();
    ctx.globalCompositeOperation = spec.blend;
    ctx.translate(spec.offset.x * c.fontSize + jx, spec.offset.y * c.fontSize + jy);
    glyphs.fill(ctx, spec.color);
    ctx.restore();
  },
};
