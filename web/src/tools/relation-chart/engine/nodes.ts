/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色節點的 SVG（原作 render() 的節點迴圈、charFaceSvg、selfMiniAvatarSvg）。
 */
import { ownColor } from '../model/normalize';
import type { Char } from '../model/types';
import {
  charBgPaint,
  charBorderW,
  charFontAttr,
  charHasBorder,
  charIsSquare,
  charLevel,
  charNameFillColor,
  charNameSize,
  charNameStrokeColor,
  charRadius,
  charRingColor,
  displayName,
  effectiveFrame,
  esc,
  FRAME_SCALE,
  firstChar,
  NODE_R,
  nameFrameDrop,
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
  /** 建立關係模式中（標籤網關著時臨時畫出可以點的標籤圓點） */
  linking?: boolean;
  /** 看法氣泡（點擊聚焦時：角色 id → 他說的話；第三批） */
  bubbles?: ReadonlyMap<number, string>;
  /** 正在就地編輯的便利貼（第四批） */
  noteEdit?: number | null;
}

/** 頭像框（疊在頭像上、名字下面；框布＝頭像直徑 × 1.6，中心＝頭像中心） */
export function frameSvg(
  frameId: string | null,
  cx: number,
  cy: number,
  r: number,
  href: ImageHref,
): string {
  const url = frameId ? href(frameId) : null;
  if (!url) return '';
  const w = r * 2 * FRAME_SCALE;
  return `<image class="av-frame" href="${esc(url)}" x="${(cx - w / 2).toFixed(1)}" y="${(cy - w / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${w.toFixed(1)}"/>`;
}

/** 看法氣泡（原作的 viewBubbleSvg：單行、過長截斷、說話者的角色字型；不擋滑鼠、不匯出） */
export function viewBubbleSvg(ctx: SheetCtx, c: Char, text: string, curR: number): string {
  const fs = Math.max(12, charNameSize(ctx, c) * 0.9);
  const MAXC = 26;
  const disp = text.length > MAXC ? `${text.slice(0, MAXC - 1)}…` : text;
  const w = disp.length * fs * 1.02 + fs * 1.8;
  const h = fs * 1.95;
  const bx = c.x - w / 2;
  const by = c.y - curR - h - fs * 0.9;
  const { panel, ink, line } = ctx.pal;
  const tail = `M ${(c.x - fs * 0.45).toFixed(1)} ${(by + h - 1).toFixed(1)} L ${c.x.toFixed(1)} ${(by + h + fs * 0.65).toFixed(1)} L ${(c.x + fs * 0.45).toFixed(1)} ${(by + h - 1).toFixed(1)} Z`;
  return `<g class="view-bubble" pointer-events="none"><path d="${tail}" fill="${panel}" stroke="${line}" stroke-width="1.4"/><rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${panel}" stroke="${line}" stroke-width="1.4"/><text${charFontAttr(ctx, c)} x="${c.x.toFixed(1)}" y="${(by + h / 2 + fs * 0.36).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" fill="${ink}" font-weight="600">${esc(disp)}</text></g>`;
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

/** 遠近簡化（第四批，F116）：60 位以上才標；farKeep＝留大名字的角色（候選超過 20 位時；null＝全留） */
export interface NodeLod {
  farKeep: ReadonlySet<number> | null;
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
  lod: NodeLod | null = null,
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
      : c.y + curR + nameFrameDrop(ctx, c, curR) + 6 + ns * 0.9;
    const fsty = charFontAttr(ctx, c);
    nameTag = lines
      .map(
        (ln, i) =>
          `<text${fsty} x="${f1(c.x)}" y="${f1(startY + i * lh)}" text-anchor="middle" font-size="${f1(ns)}" font-weight="700" fill="${nameFill}" stroke="${nameStroke}" stroke-width="${f1(strokeW)}" paint-order="stroke" stroke-linejoin="round">${esc(ln)}</text>`,
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
      extra += `<g class="sel-ring" pointer-events="none">${ringShape(sq, c.x, c.y, curR + 8, 'fill="none" stroke="#7c5cff" stroke-width="2.5" stroke-dasharray="7 5"')}</g>`;
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
  /* 遠近簡化：次要角色（重要度 ≤ 0、有頭像）的名字可以藏；拉遠時的圓點與重要角色的大名字（原作 render 的 lodDot、farName） */
  const minor = !!lod && charLevel(c) <= 0 && !noAv;
  const nameG = `<g class="node-name${minor ? ' lod-minorname' : ''}">${nameTag}</g>`;
  let lodDot = '';
  let farName = '';
  if (lod) {
    lodDot = `<g class="lod-dot">${ringShape(sq, c.x, c.y, curR * 0.55, `fill="${charColor}"`)}</g>`;
    const lv = charLevel(c);
    if (lv > 0 && c.name && ctx.s.showNames && (!lod.farKeep || lod.farKeep.has(c.id))) {
      const farFS = Math.round(64 * Math.max(1, fk * 0.8));
      const fill = ownColor(c.nameColor) ?? ownColor(ctx.s.colNameText) ?? charColor;
      farName = `<g class="lod-farname"><text${charFontAttr(ctx, c)} x="${f1(c.x)}" y="${f1(c.y + curR + nameFrameDrop(ctx, c, curR) + farFS * 0.95)}" text-anchor="middle" font-size="${farFS}" font-weight="900" fill="${fill}" paint-order="stroke" stroke="${ctx.pal.bg}" stroke-width="${Math.round(farFS * 0.18)}" stroke-linejoin="round">${esc(displayName(c))}</text></g>`;
    }
  }
  /* 頭像框：有框才出這一組（沒有框時和第一批的輸出相同） */
  const fr = noAv ? '' : frameSvg(effectiveFrame(ctx, c), c.x, c.y, curR, href);
  const frameG = fr ? `<g class="node-frame">${fr}</g>` : '';
  const said = ui?.bubbles?.get(c.id);
  const bubble = said ? viewBubbleSvg(ctx, c, said, curR) : '';
  const svg = `<g class="node" data-id="${c.id}">${extra}${body}${lodDot}<g class="node-face">${fs.face}</g>${frameG}${splitName ? '' : nameG}${pin}${farName}${bubble}</g>`;
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
