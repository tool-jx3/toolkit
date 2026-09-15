import { paintThroughMask } from '../draw';
import type { TextDecorator } from './types';

const tiles = new Map<string, HTMLCanvasElement>();

function tile(kind: 'stripe' | 'check' | 'dots', colors: [string, string], px: number): HTMLCanvasElement {
  const size = Math.max(4, Math.round(px));
  const key = `${kind}:${colors[0]}:${colors[1]}:${size}`;
  const cached = tiles.get(key);
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = colors[0];
  g.fillRect(0, 0, size, size);
  g.fillStyle = colors[1];
  if (kind === 'stripe') {
    g.fillRect(0, 0, size / 2, size);
  } else if (kind === 'check') {
    g.fillRect(0, 0, size / 2, size / 2);
    g.fillRect(size / 2, size / 2, size / 2, size / 2);
  } else {
    g.beginPath();
    g.arc(size / 2, size / 2, size / 3.2, 0, Math.PI * 2);
    g.fill();
  }
  tiles.set(key, cv);
  return cv;
}

/** ストライプ・チェック・ドットのパターン塗り。マスク合成で文字型に切り抜く */
export const patternDecorator: TextDecorator<{ type: 'pattern'; kind: 'stripe' | 'check' | 'dots'; colors: [string, string]; scale: number; angle: number; scrollSpeed: number }> = {
  type: 'pattern',
  draw(ctx, glyphs, spec, t, c) {
    const px = spec.scale * c.fontSize;
    paintThroughMask(ctx, glyphs, c, (b) => {
      const pat = b.createPattern(tile(spec.kind, spec.colors, px), 'repeat')!;
      const size = Math.max(4, Math.round(px));
      // scrollSpeed は「1周で size*scrollSpeed 進む」= t=0 と t=1 で一致
      const shift = ((t * spec.scrollSpeed) % 1) * size;
      const mtx = new DOMMatrix().rotateSelf(spec.angle).translateSelf(shift, 0);
      pat.setTransform(mtx);
      b.fillStyle = pat;
      b.fillRect(0, 0, c.w, c.h);
    });
  },
};
