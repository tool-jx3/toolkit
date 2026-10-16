/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 圖例（關係總覽）、標籤圖例（標籤總覽）與名冊（角色總覽）：原作的 buildLegend、buildLabelLegend、buildCharLegend、
 * legendPlaceBox、legendFlow、legendOutPad。
 */
import type { Char, LegendPos, RelType } from '../model/types';
import {
  charBgPaint,
  charBorderW,
  charHasBorder,
  charIsSquare,
  charNameFillColor,
  charNameStrokeColor,
  charRingColor,
  displayName,
  esc,
  type SheetCtx,
  typeLineColor,
  typeOutlineColor,
  typeOutlineW,
  typeTextColor,
} from './geom';
import {
  aliveGrels,
  type LabelEntry,
  labelColor,
  labelInfo,
  visibleChars,
  zoneEdgeOf,
} from './labels';
import {
  capDecoSvg,
  FANCY_CAPS,
  FANCY_LINE_STYLES,
  f1,
  type Outline,
  styledLineMarkup,
} from './lines';
import { charFaceSvg, type ImageHref } from './nodes';

export interface LegendBox {
  x: number;
  y: number;
  w: number;
  h: number;
  pos: LegendPos;
}

const horizOf = (pos: LegendPos) =>
  pos === 'top' || pos === 'bottom' || pos === 'topOut' || pos === 'bottomOut';
export const isOutside = (pos: LegendPos): boolean => pos.endsWith('Out');

interface Kit {
  kk: number;
  PAD: number;
  ROW: number;
  GAP: number;
  FS: number;
}
const legendKit = (W: number, H: number): Kit => {
  const kk = Math.max(1, Math.min(W, H || W) / 1000);
  return { kk, PAD: 16 * kk, ROW: 32 * kk, GAP: 22 * kk, FS: 15 * kk };
};

/** 擺位：同一位置的前一個面板逐個讓開（界內往中央、界外往外） */
function placeBox(
  pos: LegendPos,
  boxW: number,
  boxH: number,
  W: number,
  H: number,
  kk: number,
  avoid: readonly (LegendBox | null)[],
): LegendBox {
  const g = 14 * kk;
  const horiz = horizOf(pos);
  const noteFS = Math.max(10, Math.round(Math.max(W, 300) * 0.012));
  let bx: number;
  let by: number;
  if (horiz) {
    bx = (W - boxW) / 2;
    by =
      pos === 'top'
        ? g
        : pos === 'bottom'
          ? H - g - boxH
          : pos === 'topOut'
            ? -g - boxH
            : H + noteFS * 4.2;
  } else {
    by = (H - boxH) / 2;
    bx =
      pos === 'left' ? g : pos === 'right' ? W - g - boxW : pos === 'leftOut' ? -g - boxW : W + g;
  }
  const s = 10 * kk;
  for (const a of avoid) {
    if (!a || a.pos !== pos) continue;
    if (horiz) by = pos === 'top' || pos === 'bottomOut' ? a.y + a.h + s : a.y - s - boxH;
    else bx = pos === 'left' || pos === 'rightOut' ? a.x + a.w + s : a.x - s - boxW;
  }
  return { x: bx, y: by, w: boxW, h: boxH, pos };
}

/** 項目外殼：命中框＋選中框（選中框預設 opacity 0，互動網頁與編輯畫面用 CSS 打開） */
function shell(
  kk: number,
  ROW: number,
  attr: string,
  id: number,
  tip: string,
  hw: number,
  x: number,
  y: number,
  body: string,
  extraCls = '',
): string {
  const hx = x - 5 * kk;
  const hh = ROW * 0.88;
  const hy = y - hh * 0.5;
  const box = (cls: string, extra: string) =>
    `<rect${cls ? ` class="${cls}"` : ''} x="${f1(hx)}" y="${f1(hy)}" width="${f1(hw)}" height="${f1(hh)}" ${extra}/>`;
  return `<g class="legend-item${extraCls ? ` ${extraCls}` : ''}" ${attr}="${id}" pointer-events="all"><title>${esc(tip)}</title>${box('', 'fill="rgba(0,0,0,0)"')}${box('legend-pill', `fill="#7c5cff" fill-opacity="0.17" stroke="#7c5cff" stroke-width="${f1(2.2 * kk)}" opacity="0"`)}${body}</g>`;
}

function pack<T>(items: T[], itemW: (it: T) => number, GAP: number, maxW: number): T[][] {
  const rs: T[][] = [[]];
  let w = 0;
  for (const it of items) {
    const iw = itemW(it) + GAP;
    if (w + iw > maxW && rs[rs.length - 1].length) {
      rs.push([]);
      w = 0;
    }
    rs[rs.length - 1].push(it);
    w += iw;
  }
  return rs;
}

function flow<T>(
  ctx: SheetCtx,
  rows: T[][],
  itemW: (it: T) => number,
  itemSvg: (it: T, x: number, y: number) => string,
  pos: LegendPos,
  K: Kit,
  avoid: readonly (LegendBox | null)[],
  left = false,
): { svg: string; box: LegendBox } {
  const { kk, PAD, ROW, GAP } = K;
  const horiz = horizOf(pos);
  const rowW = (row: T[]) => row.reduce((s, it) => s + itemW(it) + GAP, 0) - GAP;
  const widths = rows.map(rowW);
  const boxW = Math.max(...widths) + PAD * 2;
  const boxH = (rows.length - 1) * ROW + PAD * 2 + 6 * kk;
  const bb = placeBox(pos, boxW, boxH, ctx.W, ctx.H, kk, avoid);
  let out = `<rect x="${f1(bb.x)}" y="${f1(bb.y)}" width="${f1(boxW)}" height="${f1(boxH)}" rx="0" fill="${ctx.pal.bg}" opacity="0.85" stroke="${ctx.pal.line}" stroke-width="${f1(1.5 * kk)}"/>`;
  rows.forEach((row, ri) => {
    let x = horiz && !left ? bb.x + (boxW - widths[ri]) / 2 : bb.x + PAD;
    const y = bb.y + PAD + ri * ROW + 2 * kk;
    for (const it of row) {
      out += itemSvg(it, x, y);
      x += itemW(it) + GAP;
    }
  });
  return { svg: out, box: bb };
}

/** 圖例會列的關係類型（用到〔含只有群體關係在用的〕、沒隱藏、沒設隱藏於圖例；照清單順序） */
export function legendTypes(ctx: SheetCtx): RelType[] {
  const used = new Set(ctx.sheet.rels.map((r) => r.type));
  for (const g of aliveGrels(ctx)) used.add(g.type);
  return ctx.sheet.types.filter((t) => used.has(t.id) && !t.hidden && !t.hideInLegend);
}

/** 圖例裡的線型與端點樣本 */
export function typeSample(
  ctx: SheetCtx,
  t: RelType,
  x: number,
  y: number,
  kk: number,
  SW: number,
): string {
  const col = typeLineColor(ctx, t);
  const ls = t.lineStyle;
  const cs = t.capStyle;
  const olW = typeOutlineW(t);
  const oI: Outline | null =
    olW > 0 ? { col: typeOutlineColor(ctx, t), w: Math.min(olW, 3) * kk } : null;
  const capO = oI
    ? ` stroke="${oI.col}" stroke-width="${f1(oI.w * 2)}" paint-order="stroke" stroke-linejoin="round"`
    : '';
  const fCap = FANCY_CAPS.has(cs)
    ? capDecoSvg(cs, x + SW, y, 1, 0, 0, 1, 11 * kk, 4 * kk, 3.5 * kk, col, oI)
    : null;
  const lineEnd =
    cs === 'arrow'
      ? x + SW - 12 * kk
      : cs === 'dot'
        ? x + SW - 7 * kk
        : fCap
          ? Math.max(x + SW * 0.4, x + SW - fCap.ins - 1.5 * kk)
          : x + SW;
  let line: string;
  if (FANCY_LINE_STYLES.has(ls)) {
    line = styledLineMarkup(
      ls,
      (t2) => ({ x: x + (lineEnd - x) * t2, y }),
      col,
      3 * kk,
      8 * kk,
      oI,
    );
  } else if (ls === 'wavy') {
    let d = `M ${f1(x)} ${f1(y)}`;
    let cx2 = x;
    let sgn = 1;
    while (cx2 + 8 * kk <= lineEnd) {
      d += ` Q ${f1(cx2 + 4 * kk)} ${f1(y + sgn * 4 * kk)} ${f1(cx2 + 8 * kk)} ${f1(y)}`;
      cx2 += 8 * kk;
      sgn = -sgn;
    }
    line =
      (oI
        ? `<path d="${d}" fill="none" stroke="${oI.col}" stroke-width="${f1(3 * kk + oI.w * 2)}" stroke-linecap="round"/>`
        : '') +
      `<path d="${d}" fill="none" stroke="${col}" stroke-width="${f1(3 * kk)}" stroke-linecap="round"/>`;
  } else {
    const dash =
      ls === 'dashed'
        ? ` stroke-dasharray="${f1(9 * kk)} ${f1(7 * kk)}"`
        : ls === 'dotted'
          ? ` stroke-dasharray="0.1 ${f1(7 * kk)}"`
          : '';
    line =
      (oI
        ? `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(lineEnd)}" y2="${f1(y)}" stroke="${oI.col}" stroke-width="${f1(3.5 * kk + oI.w * 2)}" stroke-linecap="round"${dash}/>`
        : '') +
      `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(lineEnd)}" y2="${f1(y)}" stroke="${col}" stroke-width="${f1(3.5 * kk)}" stroke-linecap="round"${dash}/>`;
  }
  let cap = '';
  if (cs === 'arrow')
    cap = `<path d="M ${f1(x + SW)} ${f1(y)} L ${f1(x + SW - 11 * kk)} ${f1(y - 4.4 * kk)} L ${f1(x + SW - 11 * kk)} ${f1(y + 4.4 * kk)} Z" fill="${col}"${capO}/>`;
  else if (cs === 'dot')
    cap = `<circle cx="${f1(x + SW - 4 * kk)}" cy="${f1(y)}" r="${f1(4 * kk)}" fill="${col}"${capO}/>`;
  else if (fCap) cap = fCap.deco;
  return line + cap;
}

export interface LegendOut {
  svg: string;
  defs: string;
  rel: LegendBox | null;
  /** 標籤圖例 */
  lbl: LegendBox | null;
  chars: LegendBox | null;
  /** 名冊縮到難以閱讀（只在編輯畫面提醒） */
  cramped: boolean;
}

/** 圖例與名冊（avoid：先畫的方框） */
export function legendsSvg(
  ctx: SheetCtx,
  idPrefix: string,
  href: ImageHref,
  ui: boolean,
): LegendOut {
  const out: LegendOut = { svg: '', defs: '', rel: null, lbl: null, chars: null, cramped: false };
  const { W, H } = ctx;
  if (ctx.s.showLegend && (ctx.sheet.rels.length || ctx.sheet.grels.length)) {
    const items = legendTypes(ctx);
    if (items.length) {
      const pos = ctx.s.legendPos;
      const K = legendKit(W, H);
      const { kk, PAD, ROW, GAP, FS } = K;
      const SW = 34 * kk;
      const itemW = (t: RelType) => SW + 8 * kk + t.label.length * FS + 6 * kk;
      const itemSvg = (t: RelType, x: number, y: number) => {
        const col = typeLineColor(ctx, t);
        const olW = typeOutlineW(t);
        const oI = olW > 0 ? { col: typeOutlineColor(ctx, t), w: Math.min(olW, 3) * kk } : null;
        const body = `${typeSample(ctx, t, x, y, kk, SW)}<text x="${f1(x + SW + 8 * kk)}" y="${f1(y + 5 * kk)}" font-size="${f1(FS)}" fill="${typeTextColor(ctx, t, col)}" font-weight="700"${oI ? ` paint-order="stroke" stroke="${oI.col}" stroke-width="${f1(oI.w * 2)}" stroke-linejoin="round"` : ''}>${esc(t.label)}</text>`;
        return shell(
          kk,
          ROW,
          'data-legend-type',
          t.id,
          `只看「${t.label}」的關係（再點一次取消）`,
          itemW(t),
          x,
          y,
          body,
        );
      };
      const rows = horizOf(pos) ? pack(items, itemW, GAP, W - PAD * 4) : items.map((t) => [t]);
      const fl = flow(ctx, rows, itemW, itemSvg, pos, K, []);
      out.rel = fl.box;
      out.svg += `<g class="legend" pointer-events="none">${fl.svg}</g>`;
    }
  }
  if (ctx.s.showLblLegend) {
    const r = labelLegend(ctx, [out.rel]);
    if (r) {
      out.svg += r.svg;
      out.lbl = r.box;
    }
  }
  if (ctx.s.showCharLegend && visibleChars(ctx).length) {
    const r = charLegend(ctx, idPrefix, href, [out.rel, out.lbl], ui);
    out.svg += r.svg;
    out.defs += r.defs;
    out.chars = r.box;
    out.cramped = r.cramped;
  }
  return out;
}

/** 標籤圖例會列的標籤：畫在畫布上的（沒隱藏、這張分頁有成員；陣營框一定列，一般標籤只在標籤網開著時列） */
export function legendLabels(ctx: SheetCtx): LabelEntry[] {
  return labelInfo(ctx).entries.filter(
    (e) => !e.label.hidden && e.members.length && (e.label.zone || ctx.s.showLabelNodes),
  );
}

/** 標籤圖例（樣本：陣營框＝圓角色塊、一般標籤＝圓點；點一項＝聚焦這個標籤的成員） */
function labelLegend(
  ctx: SheetCtx,
  avoid: readonly (LegendBox | null)[],
): { svg: string; box: LegendBox } | null {
  const items = legendLabels(ctx);
  if (!items.length) return null;
  const { W, H } = ctx;
  const pos = ctx.s.lblLegendPos;
  const K = legendKit(W, H);
  const { kk, PAD, ROW, GAP, FS } = K;
  const SW = 22 * kk;
  const bg = ctx.pal.bg;
  const itemW = (e: LabelEntry) => SW + 8 * kk + e.label.text.length * FS + 6 * kk;
  const itemSvg = (e: LabelEntry, x: number, y: number) => {
    const col = labelColor(ctx, e.label);
    const sw = e.label.zone
      ? `<rect x="${f1(x)}" y="${f1(y - 7 * kk)}" width="${f1(SW)}" height="${f1(14 * kk)}" rx="${f1(5 * kk)}" fill="${col}" fill-opacity="0.3"${ctx.s.zoneOutline ? ` stroke="${col}" stroke-opacity="0.75" stroke-width="${f1(zoneEdgeOf(ctx) * kk)}"` : ''}/>`
      : `<circle cx="${f1(x + SW / 2)}" cy="${f1(y)}" r="${f1(6 * kk)}" fill="${col}" stroke="${bg}" stroke-width="${f1(1.6 * kk)}"/>`;
    const body = `${sw}<text x="${f1(x + SW + 8 * kk)}" y="${f1(y + 5 * kk)}" font-size="${f1(FS)}" fill="${col}" font-weight="700" paint-order="stroke" stroke="${bg}" stroke-width="${f1(FS * 0.18)}" stroke-linejoin="round">${esc(e.label.text)}</text>`;
    return shell(
      kk,
      ROW,
      'data-legend-lbl',
      e.id,
      `聚焦「${e.label.text}」的成員（再點一次取消）`,
      itemW(e),
      x,
      y,
      body,
      'lbl-legend-item',
    );
  };
  const rows = horizOf(pos) ? pack(items, itemW, GAP, W - PAD * 4) : items.map((e) => [e]);
  const fl = flow(ctx, rows, itemW, itemSvg, pos, K, avoid);
  return { svg: `<g class="lbl-legend" pointer-events="none">${fl.svg}</g>`, box: fl.box };
}

const CHAR_LEGEND_MAX = 0.4;

function charLegend(
  ctx: SheetCtx,
  idPrefix: string,
  href: ImageHref,
  avoid: readonly (LegendBox | null)[],
  ui: boolean,
): { svg: string; defs: string; box: LegendBox; cramped: boolean } {
  /* 收合中的成員畫布上看不到＝名冊也不列 */
  const all = visibleChars(ctx);
  const { W, H } = ctx;
  const pos = ctx.s.charLegendPos;
  const horiz = horizOf(pos);
  const outSide = isOutside(pos);
  const K0 = legendKit(W, H);
  const clampIn = Math.min(W, H || W) * CHAR_LEGEND_MAX;
  const room = horiz
    ? { w: W - K0.PAD * 4, h: outSide ? Number.POSITIVE_INFINITY : clampIn }
    : { w: outSide ? Number.POSITIVE_INFINITY : clampIn, h: outSide ? H || W : clampIn };
  const maxLen = Math.max(...all.map((c) => displayName(c).length));
  interface Geom extends Kit {
    SW: number;
    R: number;
    colW: number;
    nc: number;
    nr: number;
    boxW: number;
    boxH: number;
    cost?: number;
  }
  const geom = (s: number): Geom => {
    const kk = K0.kk * s;
    const PAD = K0.PAD * s;
    const ROW = K0.ROW * s;
    const GAP = K0.GAP * s;
    const FS = K0.FS * s;
    const SW = 22 * kk;
    const colW = SW + 8 * kk + maxLen * FS + 6 * kk + GAP;
    let nc: number;
    let nr: number;
    if (horiz) {
      nc = Math.min(all.length, Math.max(1, Math.floor((room.w - PAD * 2 + GAP) / colW)));
      nr = Math.ceil(all.length / nc);
    } else {
      nr = Math.max(1, Math.floor((room.h - PAD * 2 - 6 * kk) / ROW) + 1);
      nc = Math.max(1, Math.ceil(all.length / nr));
      nr = Math.ceil(all.length / nc);
    }
    return {
      kk,
      PAD,
      ROW,
      GAP,
      FS,
      SW,
      R: 11 * kk,
      colW,
      nc,
      nr,
      boxW: nc * colW - GAP + PAD * 2,
      boxH: (nr - 1) * ROW + PAD * 2 + 6 * kk,
    };
  };
  /* 界外直向：選外擴最小的欄數（允許比畫布高，置中＝高溢出兩邊均攤） */
  const geomOutMinPad = (): Geom => {
    const { kk, PAD, ROW, GAP, FS } = K0;
    const SW = 22 * kk;
    const colW = SW + 8 * kk + maxLen * FS + 6 * kk + GAP;
    let best: Geom | null = null;
    for (let nc = 1; nc <= all.length; nc++) {
      const nr = Math.ceil(all.length / nc);
      const bw = nc * colW - GAP + PAD * 2;
      const bh = (nr - 1) * ROW + PAD * 2 + 6 * kk;
      const cost = Math.max(bw, (bh - (H || W)) / 2);
      if (!best || cost < (best.cost ?? 0))
        best = { kk, PAD, ROW, GAP, FS, SW, R: 11 * kk, colW, nc, nr, boxW: bw, boxH: bh, cost };
    }
    return best as Geom;
  };
  let g = geom(1);
  let outTall = false;
  if (outSide && !horiz) {
    const alt = geomOutMinPad();
    if ((alt.cost ?? 0) < g.boxW) {
      g = alt;
      outTall = true;
    }
  }
  if (!outTall && (g.boxW > room.w || g.boxH > room.h)) {
    let lo = 0.05;
    let hi = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const t2 = geom(mid);
      if (t2.boxW <= room.w && t2.boxH <= room.h) lo = mid;
      else hi = mid;
    }
    g = geom(lo);
  }
  const { kk, ROW, FS, SW, R, colW, GAP } = g;
  const itemW = (c: Char) => SW + 8 * kk + displayName(c).length * FS + 6 * kk;
  const rows: Char[][] = [];
  if (horiz) for (let i = 0; i < all.length; i += g.nc) rows.push(all.slice(i, i + g.nc));
  else
    for (let r = 0; r < g.nr; r++) {
      const row: Char[] = [];
      for (let c2 = 0; c2 < g.nc; c2++) {
        const it = all[c2 * g.nr + r];
        if (it) row.push(it);
      }
      rows.push(row);
    }
  let defs = '';
  const itemSvg = (c: Char, x: number, y: number) => {
    const col = charRingColor(ctx, c);
    const sq = charIsSquare(ctx, c);
    const hasBd = charHasBorder(ctx, c);
    const sw = hasBd ? 1.6 * kk : 0;
    const cxx = x + SW / 2;
    const ring = sq
      ? `<rect x="${f1(cxx - R)}" y="${f1(y - R)}" width="${f1(R * 2)}" height="${f1(R * 2)}" fill="${charBgPaint(ctx, c)}"${hasBd ? ` stroke="${col}" stroke-width="${f1(sw)}"` : ''}/>`
      : `<circle cx="${f1(cxx)}" cy="${f1(y)}" r="${f1(R)}" fill="${charBgPaint(ctx, c)}"${hasBd ? ` stroke="${col}" stroke-width="${f1(sw)}"` : ''}/>`;
    const fs = charFaceSvg(ctx, c, cxx, y, R, `${idPrefix}lg${c.id}`, sw, href);
    defs += fs.defs;
    const nmW = Math.min(charBorderW(ctx, c), FS * 0.4);
    const body = `${ring}${fs.face}<text x="${f1(x + SW + 8 * kk)}" y="${f1(y + 5 * kk)}" font-size="${f1(FS)}" fill="${charNameFillColor(ctx, c)}" font-weight="700" paint-order="stroke" stroke="${charNameStrokeColor(ctx, c)}" stroke-width="${f1(nmW)}" stroke-linejoin="round">${esc(displayName(c))}</text>`;
    return shell(
      kk,
      ROW,
      'data-legend-char',
      c.id,
      `聚焦「${displayName(c)}」（再點一次取消）`,
      itemW(c),
      x,
      y,
      body,
    );
  };
  const fl = flow(ctx, rows, () => colW - GAP, itemSvg, pos, { ...g }, avoid, horiz);
  let hint = '';
  const cramped = !outSide && FS < 12;
  if (cramped && ui) {
    const hf = Math.max(13, Math.round(K0.FS * 0.6));
    const hb = fl.box;
    const hy = hb.y > hf * 1.6 ? hb.y - hf * 0.5 : hb.y + hb.h + hf * 1.2;
    hint = `<text class="char-legend-hint" x="${f1(hb.x + hb.w / 2)}" y="${f1(hy)}" text-anchor="middle" font-size="${hf}" font-weight="700" fill="${ctx.pal.line}" opacity="0.85">⚠ 角色太多，名冊已縮小到難以閱讀——建議把名冊移到界外，或開大畫布</text>`;
  }
  return {
    svg: `<g class="char-legend" pointer-events="none">${fl.svg}${hint}</g>`,
    defs,
    box: fl.box,
    cramped,
  };
}

/** 界外的圖例／名冊要把畫面撐開多少（四邊等量） */
export function legendOutPad(boxes: readonly (LegendBox | null)[], W: number, H: number): number {
  let pad = 0;
  for (const b of boxes) {
    if (!b || !isOutside(b.pos)) continue;
    pad = Math.max(pad, -b.x, -b.y, b.x + b.w - W, b.y + b.h - H);
  }
  return pad > 0 ? Math.ceil(pad + 24) : 0;
}
