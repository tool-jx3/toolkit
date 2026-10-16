/**
 * 清單用的小圖：角色的小頭像、關係類型的線型樣本（和畫布同一份畫法，底色用畫布配色）。
 * 戴頭像框的角色（第三批）：框畫滿整格、頭像縮到 62.5%（範本裡頭像佔 320/512；原作的 miniFrameWrap），整體大小不變。
 */
import { useId } from 'react';
import {
  charBgPaint,
  charHasBorder,
  charIsSquare,
  charRingColor,
  esc,
  frameRefSource,
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
  const W = r * 2 + 8;
  const body = `${shape} fill="${charBgPaint(ctx, c)}" stroke="${bd ? ring : 'none'}" stroke-width="${bd ? 6 : 0}"/>${face.face}`;
  const fid = frameRefSource(ctx, c)?.id;
  const furl = fid ? href(fid) : null;
  const inner = furl
    ? `<g transform="translate(${W / 2} ${W / 2}) scale(0.625) translate(${-W / 2} ${-W / 2})">${body}</g><image href="${esc(furl)}" x="0" y="0" width="${W}" height="${W}"/>`
    : body;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${size}" height="${size}"><defs>${face.defs}</defs>${inner}</svg>`;
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
