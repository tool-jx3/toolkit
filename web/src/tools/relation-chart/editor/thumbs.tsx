/**
 * 清單用的小圖：角色的小頭像、關係類型的線型樣本（和畫布同一份畫法，底色用畫布配色）。
 */
import { useId } from 'react';
import {
  charBgPaint,
  charHasBorder,
  charIsSquare,
  charRingColor,
  NODE_R,
  PALETTES,
  type SheetCtx,
} from '../engine/geom';
import { typeSample } from '../engine/legend';
import { charFaceSvg, type ImageHref } from '../engine/nodes';
import type { Char, RelType } from '../model/types';

export function CharThumb({
  ctx,
  c,
  href,
  size = 28,
}: {
  ctx: SheetCtx;
  c: Char;
  href: ImageHref;
  size?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const r = NODE_R;
  const sq = charIsSquare(ctx, c);
  const bd = charHasBorder(ctx, c);
  const ring = charRingColor(ctx, c);
  const face = charFaceSvg(
    ctx,
    { ...c, noAvatar: false },
    r + 4,
    r + 4,
    r,
    `th${uid}${c.id}`,
    bd ? 3 : 0,
    href,
  );
  const shape = sq
    ? `<rect x="4" y="4" width="${r * 2}" height="${r * 2}"`
    : `<circle cx="${r + 4}" cy="${r + 4}" r="${r}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r * 2 + 8} ${r * 2 + 8}" width="${size}" height="${size}"><defs>${face.defs}</defs>${shape} fill="${charBgPaint(ctx, c)}" stroke="${bd ? ring : 'none'}" stroke-width="${bd ? 6 : 0}"/>${face.face}</svg>`;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-md leading-none"
      style={{ width: size, height: size, background: PALETTES[ctx.s.palette].bg }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 自己產生的 SVG（文字都經過跳脫）
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function TypeSample({
  ctx,
  t,
  width = 56,
  height = 20,
}: {
  ctx: SheetCtx;
  t: RelType;
  width?: number;
  height?: number;
}) {
  const W = 64;
  const H = 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${width}" height="${height}">${typeSample(ctx, t, 6, H / 2, 1, W - 12)}</svg>`;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-sm leading-none"
      style={{ width, height, background: PALETTES[ctx.s.palette].bg }}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 自己產生的 SVG
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
