import { hslToRgb, rgbToCss } from '../color';
import type { Layer } from '../types';
import { bool, num, str, textRadius } from './util';

/**
 * 集中線。サンプルGIF相当・最優先のレイヤー。
 * 角度と長さは rng（フレーム間で不変）、明滅と伸縮のみ t の関数にする。
 */
export const radiateLayer: Layer = {
  type: 'radiate',
  draw(ctx, t, c) {
    const p = c.params;
    const count = Math.max(1, Math.round(num(p, 'count', 48)));
    const minLen = num(p, 'minLen', 0.1);
    const maxLen = num(p, 'maxLen', 0.3);
    const width = num(p, 'width', 0.012);
    const gap = num(p, 'gap', 0.02);
    const jitter = num(p, 'jitter', 0.3);
    const groups = Math.max(1, Math.round(num(p, 'groups', 2)));
    const pulse = bool(p, 'pulse', true);
    const colorMode = str(p, 'colorMode', 'rainbow');
    const solid = str(p, 'color', '#ffffff');

    const r0 = textRadius(c.textBox) * (1 + gap);
    const baseW = width * c.unit;

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (c.rng() - 0.5) * ((Math.PI * 2) / count) * jitter;
      const lenRatio = minLen + c.rng() * (maxLen - minLen);
      const g = i % groups;

      // groups>1 のときはグループごとに位相をずらして交互に明滅させる
      const phase = t - g / groups;
      const alpha = groups > 1 ? 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(2 * Math.PI * phase)) : 1;
      const stretch = pulse ? 1 + 0.25 * Math.sin(2 * Math.PI * phase) : 1;
      const len = lenRatio * c.unit * stretch;

      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const nx = -sin;
      const ny = cos;
      const x0 = c.center.x + cos * r0;
      const y0 = c.center.y + sin * r0;
      const x1 = c.center.x + cos * (r0 + len);
      const y1 = c.center.y + sin * (r0 + len);
      const w0 = baseW / 2;
      const w1 = (baseW * 0.15) / 2; // 先端を細く

      ctx.save();
      ctx.globalAlpha = alpha;
      if (colorMode === 'rainbow') {
        const hue = (a / (Math.PI * 2)) * 360 + t * 360;
        ctx.fillStyle = rgbToCss(hslToRgb(hue, 1, 0.55));
      } else {
        ctx.fillStyle = solid;
      }
      ctx.beginPath();
      ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
      ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
      ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
      ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  },
};
