/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見上一層的 UPSTREAM_LICENSE。
 *
 * 角色節點的 SVG（原作 render() 的節點迴圈、charFaceSvg、selfMiniAvatarSvg）。
 */
import type { Char } from '../model/types';
import {
  charBgPaint,
  charBorderW,
  charHasBorder,
  charIsSquare,
  charNameFillColor,
  charNameSize,
  charNameStrokeColor,
  charRadius,
  charRingColor,
  displayName,
  esc,
  firstChar,
  NODE_R,
  nameLines,
  type SheetCtx,
  textNodeSize,
} from './geom';
import { iconSvg } from './icons';
import { f1 } from './lines';

/** 圖片資產 id → 可以放進 SVG 的網址（編輯畫面：物件網址；匯出：data URI） */
export type ImageHref = (assetId: string) => string | null;

/** 編輯畫面才畫的標記（匯出時都不畫） */
export interface NodeUi {
  selected?: ReadonlySet<number>;
  /** 建立關係模式的起點 */
  linkFrom?: number | null;
  /** 這一輪連過的角色（右上小勾） */
  linkDone?: ReadonlySet<number>;
}

/** 頭像的「臉」：照片／圖示／首字（三選一） */
export function charFaceSvg(
  ctx: SheetCtx,
  c: Char,
  cx: number,
  cy: number,
  r: number,
  idKey: string,
  avIn: number,
  href: ImageHref,
): { face: string; defs: string } {
  if (c.noAvatar) return { face: '', defs: '' };
  const fk = r / NODE_R;
  const sq = charIsSquare(ctx, c);
  const col = charRingColor(ctx, c);
  const inn = avIn || 0;
  const url = c.avatar ? href(c.avatar.img) : null;
  if (url) {
    const id = `clip${idKey}`;
    const d = sq
      ? `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${f1(cx - r + inn)}" y="${f1(cy - r + inn)}" width="${f1((r - inn) * 2)}" height="${f1((r - inn) * 2)}"/></clipPath>`
      : `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r - inn)}"/></clipPath>`;
    return {
      defs: d,
      face: `<image class="av-img" href="${esc(url)}" x="${f1(cx - r + inn)}" y="${f1(cy - r + inn)}" width="${f1((r - inn) * 2)}" height="${f1((r - inn) * 2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`,
    };
  }
  const ic = iconSvg(c.icon);
  if (ic) {
    const isz = r * 1.12;
    return {
      defs: '',
      face: `<g class="av-icon" transform="translate(${f1(cx - isz / 2)},${f1(cy - isz / 2)}) scale(${(isz / 24).toFixed(4)})" fill="${col}">${ic}</g>`,
    };
  }
  return {
    defs: '',
    face: `<text x="${f1(cx)}" y="${f1(cy + Math.round(13 * fk))}" text-anchor="middle" font-size="${Math.round(38 * fk)}" fill="${col}" font-weight="700">${esc(firstChar(displayName(c)))}</text>`,
  };
}

/** 外圈（圓或方） */
const ringShape = (sq: boolean, x: number, y: number, r: number, attrs: string) =>
  sq
    ? `<rect x="${f1(x - r)}" y="${f1(y - r)}" width="${f1(r * 2)}" height="${f1(r * 2)}" ${attrs}/>`
    : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" ${attrs}/>`;

/** 圖釘標記（編輯畫面；本站自己畫的小圖釘） */
function pinBadge(x: number, y: number, s: number): string {
  const k = s / 20;
  return `<g class="pin-badge" transform="translate(${f1(x)},${f1(y)}) scale(${k.toFixed(3)})" pointer-events="none"><circle r="10" fill="#e5484d" stroke="#ffffff" stroke-width="2"/><path d="M-3.5 -4.5 h7 l-1.2 4 h-4.6 z M0 -0.5 v6" fill="#ffffff" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

export interface NodeOut {
  svg: string;
  defs: string;
  /** splitName 時：名字另外放（分層匯出的「名稱」層） */
  name: string;
}

/** 一個角色節點：外圈、臉、名字（`node-name` 群組，分層匯出抽成「名稱」層）、編輯用的標記 */
export function nodeSvg(
  ctx: SheetCtx,
  c: Char,
  idPrefix: string,
  href: ImageHref,
  ui: NodeUi | null,
  splitName = false,
): NodeOut {
  const curR = charRadius(ctx, c);
  const fk = curR / NODE_R;
  const lvStroke = charBorderW(ctx, c);
  const charColor = charRingColor(ctx, c);
  const sq = charIsSquare(ctx, c);
  const hasBd = charHasBorder(ctx, c);
  const avIn = hasBd ? 3 : 0;
  const nameFill = charNameFillColor(ctx, c);
  const nameStroke = charNameStrokeColor(ctx, c);
  const noAv = c.noAvatar;
  const fs = charFaceSvg(ctx, c, c.x, c.y, curR, `${idPrefix}${c.id}`, avIn, href);

  let nameTag = '';
  if (noAv || (c.name && ctx.s.showNames)) {
    const ns = charNameSize(ctx, c);
    const lh = ns * 1.25;
    const lines = nameLines(c);
    const strokeW = Math.min(lvStroke, Math.max(1, ns * 0.4));
    const startY = noAv
      ? c.y - ((lines.length - 1) * lh) / 2 + ns * 0.35
      : c.y + curR + 6 + ns * 0.9;
    nameTag = lines
      .map(
        (ln, i) =>
          `<text x="${f1(c.x)}" y="${f1(startY + i * lh)}" text-anchor="middle" font-size="${f1(ns)}" font-weight="700" fill="${nameFill}" stroke="${nameStroke}" stroke-width="${f1(strokeW)}" paint-order="stroke" stroke-linejoin="round">${esc(ln)}</text>`,
      )
      .join('');
  }

  let extra = '';
  if (ui) {
    const ink = ctx.pal.ink;
    if (ui.linkFrom === c.id)
      extra += ringShape(
        sq,
        c.x,
        c.y,
        curR + 8,
        `class="link-from" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="6 6"`,
      );
    if (ui.linkDone?.has(c.id) && ui.linkFrom !== c.id) {
      const k = Math.min(fk, 1.5);
      extra += `<g class="link-done-badge" pointer-events="none"><circle cx="${f1(c.x + curR * 0.74)}" cy="${f1(c.y - curR * 0.62)}" r="${Math.round(9 * k)}" fill="${ink}"/><text x="${f1(c.x + curR * 0.74)}" y="${f1(c.y - curR * 0.62 + 4 * k)}" text-anchor="middle" font-size="${Math.round(12 * k)}" font-weight="900" fill="${ctx.pal.bg}">✓</text></g>`;
    }
    if (ui.selected?.has(c.id))
      extra += `<g class="sel-ring" pointer-events="none">${ringShape(sq, c.x, c.y, curR + 8, 'fill="none" stroke="var(--rc-accent, #7c5cff)" stroke-width="2.5" stroke-dasharray="7 5"')}</g>`;
  }

  let body: string;
  let pin = '';
  if (noAv) {
    const tn = textNodeSize(ctx, c);
    body = `<rect x="${f1(c.x - tn.w / 2)}" y="${f1(c.y - tn.h / 2)}" width="${f1(tn.w)}" height="${f1(tn.h)}" fill="rgba(0,0,0,0)"/>`;
    if (ui && c.locked) pin = pinBadge(c.x + tn.w / 2, c.y - tn.h / 2, 18);
  } else {
    body = ringShape(
      sq,
      c.x,
      c.y,
      curR,
      `fill="${charBgPaint(ctx, c)}" stroke="${hasBd ? charColor : 'none'}" stroke-width="${hasBd ? f1(lvStroke) : 0}"`,
    );
    if (ui && c.locked)
      pin = pinBadge(c.x + curR * 0.74, c.y - curR * 0.62, Math.round(20 * Math.min(fk, 1.5)));
  }
  const nameG = `<g class="node-name">${nameTag}</g>`;
  const svg = `<g class="node" data-id="${c.id}">${extra}${body}<g class="node-face">${fs.face}</g>${splitName ? '' : nameG}${pin}</g>`;
  return { svg, defs: fs.defs, name: splitName && nameTag ? nameG : '' };
}

/** 自我關係的縮小頭貼（主頭像的等比縮小版；純文字角色顯示首字） */
export function miniAvatarSvg(
  ctx: SheetCtx,
  c: Char,
  cx: number,
  cy: number,
  rad: number,
  clipId: string,
  href: ImageHref,
): { svg: string; defs: string } {
  const sq = charIsSquare(ctx, c);
  const fk = rad / NODE_R;
  const charColor = charRingColor(ctx, c);
  const hasBd = charHasBorder(ctx, c);
  const avIn = hasBd ? 2 : 0;
  const bw = hasBd
    ? Math.max(1, charBorderW(ctx, c) * Math.min(1, rad / Math.max(1, charRadius(ctx, c))))
    : 0;
  const strokeAttr = hasBd
    ? `stroke="${charColor}" stroke-width="${f1(bw)}"`
    : 'stroke="none" stroke-width="0"';
  const ring = ringShape(sq, cx, cy, rad, `fill="${charBgPaint(ctx, c)}" ${strokeAttr}`);
  if (!c.noAvatar) {
    const fs = charFaceSvg(ctx, c, cx, cy, rad, clipId, avIn, href);
    return { svg: ring + fs.face, defs: fs.defs };
  }
  return {
    svg:
      ring +
      `<text x="${f1(cx)}" y="${f1(cy + Math.round(11 * fk))}" text-anchor="middle" font-size="${Math.round(30 * fk)}" fill="${charColor}" font-weight="700">${esc(firstChar(displayName(c)))}</text>`,
    defs: '',
  };
}
