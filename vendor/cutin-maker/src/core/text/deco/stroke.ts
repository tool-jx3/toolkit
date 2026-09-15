import { resolvePaint } from '../../color';
import type { TextDecorator } from './types';

/**
 * 縁取り。lineWidth は中心線基準なので見た目の縁取り幅の 2倍 を指定する。
 * 書体ごとの strokeScale を掛ける（明朝・ドットは字画が細く潰れやすい）。
 */
export const strokeDecorator: TextDecorator<{ type: 'stroke'; widthRatio: number; color: any }> = {
  type: 'stroke',
  draw(ctx, glyphs, spec, t, c) {
    const w = spec.widthRatio * c.fontSize * c.strokeScale * 2;
    glyphs.stroke(ctx, resolvePaint(spec.color, ctx, c.box, t), w);
  },
};
